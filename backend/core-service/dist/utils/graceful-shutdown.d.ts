/**
 * =============================================================================
 * 模块名称：优雅关闭
 * 功能描述：SIGTERM/SIGINT信号处理，按序关闭HTTP服务、WebSocket、数据库连接。10秒强制退出兜底，防止进程挂起。
 * 技术决策引用：#85 #93
 * 创建日期：2026-04-30
 * =============================================================================
 */
export declare class GracefulShutdown {
    private static instance;
    private logger;
    private handlers;
    private constructor();
    /** 获取单例实例 */
    static getInstance(): GracefulShutdown;
    /** 注册需要优雅关闭的服务 */
    register(name: string, handler: () => Promise<void>): void;
    /** 执行优雅关闭：依次停止服务，10秒强制退出兜底 */
    shutdown(): Promise<void>;
    /** 监听系统信号 */
    listen(): void;
}
//# sourceMappingURL=graceful-shutdown.d.ts.map