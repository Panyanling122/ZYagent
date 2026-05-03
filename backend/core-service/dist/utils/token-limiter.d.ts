/**
 * =============================================================================
 * 模块名称：Token限额器
 * 功能描述：大模型Token日消耗限额检查（默认100000），超额自动熔断。精确午夜重置，定期清理过期缓存。
 * 技术决策引用：#91 #90
 * 创建日期：2026-04-30
 * =============================================================================
 */
export declare class TokenRateLimiter {
    private static instance;
    private config;
    private logger;
    private db;
    private cache;
    private constructor();
    /** 获取单例实例 */
    static getInstance(): TokenRateLimiter;
    /** 检查Token消耗是否超过日限额，超额返回false */
    checkLimit(soulId: string, requestedTokens: number): Promise<boolean>;
    /** 记录本次Token消耗到缓存和数据库 */
    recordUsage(soulId: string, model: string, promptTokens: number, completionTokens: number): Promise<void>;
    /** 启动午夜定时重置，首次精确到下一个午夜 */
    startDailyReset(): void;
}
//# sourceMappingURL=token-limiter.d.ts.map