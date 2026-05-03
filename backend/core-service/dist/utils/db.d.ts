/**
 * =============================================================================
 * 模块名称：数据库连接池
 * 功能描述：PostgreSQL + pgvector 连接管理与查询封装
 * 技术决策引用：#85
 * 创建日期：2026-04-30
 * 最后修改：2026-04-30
 * =============================================================================
 */
import { PoolClient, QueryResult, QueryResultRow } from "pg";
export declare class Database {
    private static instance;
    private pool;
    private logger;
    private constructor();
    static getInstance(): Database;
    query<T extends QueryResultRow = any>(sql: string, params?: any[]): Promise<QueryResult<T>>;
    transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T>;
    close(): Promise<void>;
}
//# sourceMappingURL=db.d.ts.map