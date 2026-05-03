/**
 * =============================================================================
 * 模块名称：日志服务
 * 功能描述：JSON格式结构化日志，支持多级日志输出
 * 技术决策引用：#84
 * 创建日期：2026-04-30
 * 最后修改：2026-04-30
 * =============================================================================
 */

import pino from "pino";
import { Config } from "./config";

const SENSITIVE_PATTERNS = [
  /sk-[a-zA-Z0-9]{48}/g,
  /[a-f0-9]{32}/gi,
  /\\b\\d{17}[\\dXx]\\b/g,
  /\\b1[3-9]\\d{9}\\b/g,
];

function sanitize(input: string): string {
  let result = input;
  for (const pattern of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, "***REDACTED***");
  }
  return result;
}

export class Logger {
  private static instance: Logger;
  private logger: pino.Logger;

  private constructor() {
    const config = Config.getInstance();
    this.logger = pino({
      level: config.logLevel,
      base: { pid: process.pid, service: "core-service" },
      formatters: {
        level: (label) => ({ level: label.toUpperCase() }),
      },
      serializers: {
        err: pino.stdSerializers.err,
        req: (req) => ({
          method: req.method,
          url: sanitize(req.url || ""),
          remoteAddress: req.remoteAddress,
        }),
      },
      mixin() {
        return {
          timestamp: new Date().toISOString(),
        };
      },
    });
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private sanitizeArgs(args: any[]): any[] {
    return args.map(a => typeof a === 'string' ? sanitize(a) : a);
  }
  debug(msg: string, ...args: any[]) { this.logger.debug(sanitize(msg), ...this.sanitizeArgs(args)); }
  info(msg: string, ...args: any[]) { this.logger.info(sanitize(msg), ...this.sanitizeArgs(args)); }
  warn(msg: string, ...args: any[]) { this.logger.warn(sanitize(msg), ...this.sanitizeArgs(args)); }
  error(msg: string, ...args: any[]) { this.logger.error(sanitize(msg), ...this.sanitizeArgs(args)); }

  child(bindings: Record<string, string>) {
    return this.logger.child(bindings);
  }
}
