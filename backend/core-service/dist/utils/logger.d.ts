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
export declare class Logger {
    private static instance;
    private logger;
    private constructor();
    static getInstance(): Logger;
    private sanitizeArgs;
    debug(msg: string, ...args: any[]): void;
    info(msg: string, ...args: any[]): void;
    warn(msg: string, ...args: any[]): void;
    error(msg: string, ...args: any[]): void;
    child(bindings: Record<string, string>): pino.Logger<never>;
}
//# sourceMappingURL=logger.d.ts.map