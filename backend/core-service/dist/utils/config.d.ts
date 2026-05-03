/**
 * =============================================================================
 * 模块名称：配置中心
 * 功能描述：环境变量统一管理，Zod Schema校验
 * 技术决策引用：#81 #82 #83
 * 创建日期：2026-04-30
 * 最后修改：2026-04-30
 * =============================================================================
 */
export declare class Config {
    private static instance;
    private values;
    private constructor();
    static getInstance(): Config;
    get nodeEnv(): "development" | "production" | "test";
    get port(): number;
    get wsPort(): number;
    get healthPort(): number;
    get databaseUrl(): string;
    get milvusUrl(): string;
    get jwtSecret(): string;
    get wsTokenSecret(): string;
    get adminServiceUrl(): string;
    get logLevel(): "debug" | "info" | "warn" | "error";
    get maxL1InactiveMs(): number;
    get soulTimeoutMs(): number;
    get maxSpawnDepth(): number;
    get maxQueueDepth(): number;
    get dailySummaryTime(): string;
    get tokenDailyLimit(): number;
    get wsHeartbeatInterval(): number;
    get wsHeartbeatMaxFail(): number;
    get uploadDir(): string;
    get groupLogDir(): string;
}
//# sourceMappingURL=config.d.ts.map