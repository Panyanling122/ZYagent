"use strict";
/**
 * =============================================================================
 * 模块名称：日志服务
 * 功能描述：JSON格式结构化日志，支持多级日志输出
 * 技术决策引用：#84
 * 创建日期：2026-04-30
 * 最后修改：2026-04-30
 * =============================================================================
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
const pino_1 = __importDefault(require("pino"));
const config_1 = require("./config");
const SENSITIVE_PATTERNS = [
    /sk-[a-zA-Z0-9]{48}/g,
    /[a-f0-9]{32}/gi,
    /\\b\\d{17}[\\dXx]\\b/g,
    /\\b1[3-9]\\d{9}\\b/g,
];
function sanitize(input) {
    let result = input;
    for (const pattern of SENSITIVE_PATTERNS) {
        result = result.replace(pattern, "***REDACTED***");
    }
    return result;
}
class Logger {
    static instance;
    logger;
    constructor() {
        const config = config_1.Config.getInstance();
        this.logger = (0, pino_1.default)({
            level: config.logLevel,
            base: { pid: process.pid, service: "core-service" },
            formatters: {
                level: (label) => ({ level: label.toUpperCase() }),
            },
            serializers: {
                err: pino_1.default.stdSerializers.err,
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
    static getInstance() {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }
    sanitizeArgs(args) {
        return args.map(a => typeof a === 'string' ? sanitize(a) : a);
    }
    debug(msg, ...args) { this.logger.debug(sanitize(msg), ...this.sanitizeArgs(args)); }
    info(msg, ...args) { this.logger.info(sanitize(msg), ...this.sanitizeArgs(args)); }
    warn(msg, ...args) { this.logger.warn(sanitize(msg), ...this.sanitizeArgs(args)); }
    error(msg, ...args) { this.logger.error(sanitize(msg), ...this.sanitizeArgs(args)); }
    child(bindings) {
        return this.logger.child(bindings);
    }
}
exports.Logger = Logger;
//# sourceMappingURL=logger.js.map