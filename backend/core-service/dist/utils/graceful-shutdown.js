"use strict";
/**
 * =============================================================================
 * 模块名称：优雅关闭
 * 功能描述：SIGTERM/SIGINT信号处理，按序关闭HTTP服务、WebSocket、数据库连接。10秒强制退出兜底，防止进程挂起。
 * 技术决策引用：#85 #93
 * 创建日期：2026-04-30
 * =============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GracefulShutdown = void 0;
const logger_1 = require("./logger");
class GracefulShutdown {
    static instance;
    logger;
    handlers = [];
    constructor() {
        this.logger = logger_1.Logger.getInstance();
    }
    /** 获取单例实例 */
    static getInstance() {
        if (!GracefulShutdown.instance)
            GracefulShutdown.instance = new GracefulShutdown();
        return GracefulShutdown.instance;
    }
    /** 注册需要优雅关闭的服务 */
    register(name, handler) {
        this.handlers.push({ name, handler });
    }
    /** 执行优雅关闭：依次停止服务，10秒强制退出兜底 */
    async shutdown() {
        this.logger.info("Graceful shutdown initiated...");
        const forceExit = setTimeout(() => {
            this.logger.error("Forced exit after timeout");
            process.exit(1);
        }, 10000);
        try {
            for (const { name, handler } of this.handlers) {
                this.logger.info(`Shutting down ${name}...`);
                try {
                    await handler();
                }
                catch (err) {
                    this.logger.error(`Error shutting down ${name}:`, err);
                }
            }
            this.logger.info("Graceful shutdown completed");
            clearTimeout(forceExit);
            process.exit(0);
        }
        catch (err) {
            this.logger.error("Error during shutdown:", err);
            clearTimeout(forceExit);
            process.exit(1);
        }
    }
    /** 监听系统信号 */
    listen() {
        process.on("SIGTERM", () => this.shutdown());
        process.on("SIGINT", () => this.shutdown());
    }
}
exports.GracefulShutdown = GracefulShutdown;
//# sourceMappingURL=graceful-shutdown.js.map