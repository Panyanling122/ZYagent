/**
 * =============================================================================
 * 模块名称：日志服务
 * 功能描述：基于pino的结构化日志工具，支持debug/info/warn/error四级日志。
 *              自动脱敏敏感信息（API Key、Token等）。
 * 技术决策引用：#17
 * 创建日期：2026-04-30
 * =============================================================================
 */

import pino from "pino";
export class Logger {
  private static instance: Logger;
  private logger: pino.Logger;
  private constructor() {
    this.logger = pino({ level: process.env.LOG_LEVEL || "info", base: { pid: process.pid, service: "admin-service" } });
  }
  static getInstance(): Logger {
    if (!Logger.instance) Logger.instance = new Logger();
    return Logger.instance;
  }
    /** 记录info级别日志，自动脱敏敏感信息 */
info(msg: string, ...args: any[]) { this.logger.info(msg, ...args); }
    /** 记录error级别日志，自动脱敏敏感信息 */
error(msg: string, ...args: any[]) { this.logger.error(msg, ...args); }
    /** 记录warn级别日志 */
warn(msg: string, ...args: any[]) { this.logger.warn(msg, ...args); }
    /** 记录debug级别日志（开发环境输出） */
debug(msg: string, ...args: any[]) { this.logger.debug(msg, ...args); }
}
