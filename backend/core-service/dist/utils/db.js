"use strict";
/**
 * =============================================================================
 * 模块名称：数据库连接池
 * 功能描述：PostgreSQL + pgvector 连接管理与查询封装
 * 技术决策引用：#85
 * 创建日期：2026-04-30
 * 最后修改：2026-04-30
 * =============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Database = void 0;
const pg_1 = require("pg");
const config_1 = require("./config");
const logger_1 = require("./logger");
class Database {
    static instance;
    pool;
    logger;
    constructor() {
        const config = config_1.Config.getInstance();
        this.logger = logger_1.Logger.getInstance();
        this.pool = new pg_1.Pool({
            connectionString: config.databaseUrl,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
        });
        this.pool.on("error", (err) => {
            this.logger.error("Unexpected DB pool error:", err);
            // pool auto-recovers
        });
    }
    static getInstance() {
        if (!Database.instance) {
            Database.instance = new Database();
        }
        return Database.instance;
    }
    async query(sql, params) {
        return this.pool.query(sql, params);
    }
    async transaction(fn) {
        const client = await this.pool.connect();
        try {
            await client.query("BEGIN");
            const result = await fn(client);
            await client.query("COMMIT");
            return result;
        }
        catch (err) {
            await client.query("ROLLBACK");
            throw err;
        }
        finally {
            client.release();
        }
    }
    async close() {
        await this.pool.end();
    }
}
exports.Database = Database;
//# sourceMappingURL=db.js.map