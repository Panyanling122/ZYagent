/**
 * =============================================================================
 * 模块名称：数据库连接池
 * 功能描述：PostgreSQL + pgvector 连接管理与查询封装
 * 技术决策引用：#85
 * 创建日期：2026-04-30
 * 最后修改：2026-04-30
 * =============================================================================
 */

import { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";
import { Config } from "./config";
import { Logger } from "./logger";

export class Database {
  private static instance: Database;
  private pool: Pool;
  private logger: Logger;

  private constructor() {
    const config = Config.getInstance();
    this.logger = Logger.getInstance();
    this.pool = new Pool({
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

  static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  async query<T extends QueryResultRow = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    return this.pool.query<T>(sql, params);
  }

  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

