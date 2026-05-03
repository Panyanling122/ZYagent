"use strict";
/**
 * =============================================================================
 * 模块名称：工作空间服务
 * 功能描述：工作空间CRUD + 切换 + 成员管理
 * =============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkspaceService = void 0;
const db_1 = require("../utils/db");
const logger_1 = require("../utils/logger");
class WorkspaceService {
    static instance;
    db;
    logger;
    constructor() {
        this.db = db_1.Database.getInstance();
        this.logger = logger_1.Logger.getInstance();
    }
    static getInstance() {
        if (!WorkspaceService.instance) WorkspaceService.instance = new WorkspaceService();
        return WorkspaceService.instance;
    }
    async listForUser(userId) {
        const result = await this.db.query(
            `SELECT w.*, wm.role FROM workspaces w
             JOIN workspace_members wm ON w.id = wm.workspace_id
             WHERE wm.user_id = $1 ORDER BY w.is_default DESC, w.created_at DESC`,
            [userId]
        );
        return result.rows;
    }
    async create(ownerId, name, description, icon) {
        const result = await this.db.query(
            `INSERT INTO workspaces (name, description, owner_id, icon)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [name, description || '', ownerId, icon || '📁']
        );
        const ws = result.rows[0];
        await this.db.query(
            `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`,
            [ws.id, ownerId]
        );
        this.logger.info(`Workspace created: ${ws.name} (${ws.id}) by user ${ownerId}`);
        return ws;
    }
    async getById(workspaceId, userId) {
        const result = await this.db.query(
            `SELECT w.*, wm.role FROM workspaces w
             JOIN workspace_members wm ON w.id = wm.workspace_id
             WHERE w.id = $1 AND wm.user_id = $2`,
            [workspaceId, userId]
        );
        return result.rows[0] || null;
    }
    async delete(workspaceId, userId) {
        const member = await this.db.query(
            `SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
            [workspaceId, userId]
        );
        if (!member.rows[0] || member.rows[0].role !== 'owner') {
            throw new Error('Only owner can delete workspace');
        }
        await this.db.query(`DELETE FROM workspaces WHERE id = $1`, [workspaceId]);
        this.logger.info(`Workspace deleted: ${workspaceId}`);
        return true;
    }
    async getSouls(workspaceId) {
        const result = await this.db.query(
            `SELECT id, name, status FROM souls WHERE workspace_id = $1 ORDER BY created_at`,
            [workspaceId]
        );
        return result.rows;
    }
}
exports.WorkspaceService = WorkspaceService;
