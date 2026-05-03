"use strict";
/**
 * =============================================================================
 * 模块名称：数据库连接池
 * 功能描述：PostgreSQL连接池单例，提供查询接口和连接管理。
 *              使用node-postgres的Pool实现连接复用。
 * 技术决策引用：#15 #16
 * 创建日期：2026-04-30
 * =============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
const pg_1 = require("pg");
exports.db = new pg_1.Pool({ connectionString: process.env.DATABASE_URL });
