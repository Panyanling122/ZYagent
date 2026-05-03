/**
 * =============================================================================
 * 模块名称：健康检查
 * 功能描述：HTTP健康探测端点，返回服务状态
 * 技术决策引用：#86
 * 创建日期：2026-04-30
 * 最后修改：2026-04-30
 * =============================================================================
 */
export declare class HealthCheck {
    private port;
    private app;
    private logger;
    constructor(port: number);
    private setupRoutes;
    start(): void;
}
//# sourceMappingURL=health-check.d.ts.map