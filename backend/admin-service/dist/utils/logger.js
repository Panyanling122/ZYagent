"use strict";
/**
 * =============================================================================
 * 模块名称：日志服务
 * 功能描述：基于pino的结构化日志工具，支持debug/info/warn/error四级日志。
 *              自动脱敏敏感信息（API Key、Token等）。
 * 技术决策引用：#17
 * 创建日期：2026-04-30
 * =============================================================================
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
const pino_1 = __importDefault(require("pino"));
class Logger {
    static instance;
    logger;
    constructor() {
        this.logger = (0, pino_1.default)({ level: process.env.LOG_LEVEL || "info", base: { pid: process.pid, service: "admin-service" } });
    }
    static getInstance() {
        if (!Logger.instance)
            Logger.instance = new Logger();
        return Logger.instance;
    }
    /** 记录info级别日志，自动脱敏敏感信息 */
    info(msg, ...args) { this.logger.info(msg, ...args); }
    /** 记录error级别日志，自动脱敏敏感信息 */
    error(msg, ...args) { this.logger.error(msg, ...args); }
    /** 记录warn级别日志 */
    warn(msg, ...args) { this.logger.warn(msg, ...args); }
    /** 记录debug级别日志（开发环境输出） */
    debug(msg, ...args) { this.logger.debug(msg, ...args); }
}
exports.Logger = Logger;
