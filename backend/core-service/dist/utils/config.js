"use strict";
/**
 * =============================================================================
 * 模块名称：配置中心
 * 功能描述：环境变量统一管理，Zod Schema校验
 * 技术决策引用：#81 #82 #83
 * 创建日期：2026-04-30
 * 最后修改：2026-04-30
 * =============================================================================
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const zod_1 = require("zod");
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, "../../../.env") });
const configSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(["development", "production", "test"]).default("development"),
    PORT: zod_1.z.string().default("3001"),
    WS_PORT: zod_1.z.string().default("3003"),
    HEALTH_PORT: zod_1.z.string().default("3004"),
    DATABASE_URL: zod_1.z.string().min(1),
    MILVUS_URL: zod_1.z.string().default("http://localhost:19530"),
    JWT_SECRET: zod_1.z.string().min(32),
    WS_TOKEN_SECRET: zod_1.z.string().min(32),
    ADMIN_SERVICE_URL: zod_1.z.string().default("http://localhost:3002"),
    LOG_LEVEL: zod_1.z.enum(["debug", "info", "warn", "error"]).default("info"),
    MAX_L1_INACTIVE_MS: zod_1.z.string().default("300000"),
    SOUL_TIMEOUT_MS: zod_1.z.string().default("60000"),
    MAX_SPAWN_DEPTH: zod_1.z.string().default("3"),
    MAX_QUEUE_DEPTH: zod_1.z.string().default("50"),
    DAILY_SUMMARY_TIME: zod_1.z.string().default("0 3 * * *"),
    TOKEN_DAILY_LIMIT: zod_1.z.string().default("100000"),
    WS_HEARTBEAT_INTERVAL: zod_1.z.string().default("30000"),
    WS_HEARTBEAT_MAX_FAIL: zod_1.z.string().default("5"),
    UPLOAD_DIR: zod_1.z.string().default("/app/uploads"),
    GROUP_LOG_DIR: zod_1.z.string().default("/app/group-logs"),
});
class Config {
    static instance;
    values;
    constructor() {
        this.values = configSchema.parse(process.env);
    }
    static getInstance() {
        if (!Config.instance) {
            Config.instance = new Config();
        }
        return Config.instance;
    }
    get nodeEnv() { return this.values.NODE_ENV; }
    get port() { return parseInt(this.values.PORT); }
    get wsPort() { return parseInt(this.values.WS_PORT); }
    get healthPort() { return parseInt(this.values.HEALTH_PORT); }
    get databaseUrl() { return this.values.DATABASE_URL; }
    get milvusUrl() { return this.values.MILVUS_URL; }
    get jwtSecret() { return this.values.JWT_SECRET; }
    get wsTokenSecret() { return this.values.WS_TOKEN_SECRET; }
    get adminServiceUrl() { return this.values.ADMIN_SERVICE_URL; }
    get logLevel() { return this.values.LOG_LEVEL; }
    get maxL1InactiveMs() { return parseInt(this.values.MAX_L1_INACTIVE_MS); }
    get soulTimeoutMs() { return parseInt(this.values.SOUL_TIMEOUT_MS); }
    get maxSpawnDepth() { return parseInt(this.values.MAX_SPAWN_DEPTH); }
    get maxQueueDepth() { return parseInt(this.values.MAX_QUEUE_DEPTH); }
    get dailySummaryTime() { return this.values.DAILY_SUMMARY_TIME; }
    get tokenDailyLimit() { return parseInt(this.values.TOKEN_DAILY_LIMIT); }
    get wsHeartbeatInterval() { return parseInt(this.values.WS_HEARTBEAT_INTERVAL); }
    get wsHeartbeatMaxFail() { return parseInt(this.values.WS_HEARTBEAT_MAX_FAIL); }
    get uploadDir() { return this.values.UPLOAD_DIR; }
    get groupLogDir() { return this.values.GROUP_LOG_DIR; }
}
exports.Config = Config;
//# sourceMappingURL=config.js.map