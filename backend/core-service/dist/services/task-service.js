"use strict";
/**
 * =============================================================================
 * 模块名称：看板任务服务
 * =============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskService = void 0;
const db_1 = require("../utils/db");
const logger_1 = require("../utils/logger");
const event_bus_1 = require("../events/event-bus");

const VALID_TRANSITIONS = {
    backlog: ['todo', 'cancelled'],
    todo: ['in_progress', 'cancelled', 'backlog'],
    in_progress: ['review', 'awaiting_human', 'done', 'cancelled'],
    review: ['done', 'in_progress', 'cancelled'],
    awaiting_human: ['in_progress', 'done', 'cancelled'],
    done: ['in_progress'],
    cancelled: ['backlog'],
};

const ALLOWED_COLUMNS = ['status', 'updated_at', 'started_at', 'completed_at'];

class TaskService {
    static instance;
    db;
    logger;
    eventBus;
    constructor() {
        this.db = db_1.Database.getInstance();
        this.logger = logger_1.Logger.getInstance();
        this.eventBus = event_bus_1.EventBus.getInstance();
    }
    static getInstance() {
        if (!TaskService.instance) TaskService.instance = new TaskService();
        return TaskService.instance;
    }
    async create(task) {
        try {
            const result = await this.db.query(
                `INSERT INTO tasks (workspace_id, title, description, status, priority, type, soul_id, topic, channel, execution_context, created_by, assigned_to, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW()) RETURNING *`,
                [task.workspace_id, task.title, task.description || '', task.status || 'backlog', task.priority || 'p2',
                 task.type || 'ai_task', task.soul_id || null, task.topic || null, task.channel || null,
                 task.execution_context || null, task.created_by, task.assigned_to || task.created_by]
            );
            const t = result.rows[0];
            this.logger.info(`[Task] Created #${t.id}: ${t.title}`);
            this.eventBus.emit('task:created', t);
            return t;
        } catch (err) {
            this.logger.error(`[Task] create failed:`, err.message);
            throw err;
        }
    }
    async list(workspaceId, filters = {}) {
        try {
            let sql = `SELECT * FROM tasks WHERE workspace_id = $1`;
            const params = [workspaceId];
            let pIdx = 2;
            if (filters.status) { sql += ` AND status = $${pIdx++}`; params.push(filters.status); }
            if (filters.priority) { sql += ` AND priority = $${pIdx++}`; params.push(filters.priority); }
            if (filters.type) { sql += ` AND type = $${pIdx++}`; params.push(filters.type); }
            if (filters.assigned_to) { sql += ` AND assigned_to = $${pIdx++}`; params.push(filters.assigned_to); }
            if (filters.soul_id) { sql += ` AND soul_id = $${pIdx++}`; params.push(filters.soul_id); }
            sql += ` ORDER BY CASE priority WHEN 'p0' THEN 0 WHEN 'p1' THEN 1 WHEN 'p2' THEN 2 ELSE 3 END, created_at DESC`;
            const limit = Math.min(filters.limit || 50, 100);
            const offset = filters.offset || 0;
            sql += ` LIMIT $${pIdx++} OFFSET $${pIdx++}`;
            params.push(limit, offset);
            const result = await this.db.query(sql, params);
            return result.rows;
        } catch (err) {
            this.logger.error(`[Task] list failed:`, err.message);
            throw err;
        }
    }
    async getById(taskId, workspaceId) {
        try {
            const result = await this.db.query(`SELECT * FROM tasks WHERE id = $1 AND workspace_id = $2`, [taskId, workspaceId]);
            return result.rows[0] || null;
        } catch (err) {
            this.logger.error(`[Task] getById failed:`, err.message);
            throw err;
        }
    }
    async updateStatus(taskId, workspaceId, newStatus, changedBy, reason) {
        try {
            const task = await this.getById(taskId, workspaceId);
            if (!task) throw new Error('Task not found');
            const oldStatus = task.status;
            if (oldStatus === newStatus) return task;
            const valid = VALID_TRANSITIONS[oldStatus] || [];
            if (!valid.includes(newStatus)) throw new Error(`Invalid transition: ${oldStatus} -> ${newStatus}`);
            const updates = { status: newStatus, updated_at: new Date().toISOString() };
            if (newStatus === 'in_progress' && !task.started_at) updates.started_at = new Date().toISOString();
            if (newStatus === 'done') {
                updates.completed_at = new Date().toISOString();
                this.eventBus.emit('task:completed', { taskId, result: 'Task completed' });
            }
            if (newStatus === 'in_progress' && oldStatus === 'awaiting_human') {
                this.eventBus.emit('task:resumed', { taskId, executionContext: task.execution_context, changedBy });
            }
            // Whitelist columns for SQL safety
            const safeUpdates = {};
            for (const k of Object.keys(updates)) {
                if (ALLOWED_COLUMNS.includes(k)) safeUpdates[k] = updates[k];
            }
            const setClause = Object.keys(safeUpdates).map((k, i) => `${k} = $${i + 4}`).join(', ');
            const values = [taskId, workspaceId, newStatus, ...Object.values(safeUpdates)];
            await this.db.query(`UPDATE tasks SET ${setClause} WHERE id = $1 AND workspace_id = $2`, values);
            await this.db.query(
                `INSERT INTO task_history (task_id, from_status, to_status, changed_by, reason, created_at) VALUES ($1, $2, $3, $4, $5, NOW())`,
                [taskId, oldStatus, newStatus, changedBy, reason || '']
            );
            this.logger.info(`[Task] #${taskId} ${oldStatus} -> ${newStatus} by ${changedBy}`);
            this.eventBus.emit('task:status_changed', { taskId, from: oldStatus, to: newStatus, changedBy });
            return { ...task, ...updates };
        } catch (err) {
            this.logger.error(`[Task] updateStatus failed:`, err.message);
            throw err;
        }
    }
    async suspendForHuman(taskId, workspaceId, question, deadlineHours = 24) {
        try {
            const deadline = new Date();
            deadline.setHours(deadline.getHours() + deadlineHours);
            await this.db.query(
                `UPDATE tasks SET status = 'awaiting_human', awaiting_response = $3, response_deadline = $4, updated_at = NOW() WHERE id = $1 AND workspace_id = $2`,
                [taskId, workspaceId, question, deadline]
            );
            await this.db.query(
                `INSERT INTO task_history (task_id, from_status, to_status, changed_by, reason, created_at) VALUES ($1, $2, $3, $4, $5, NOW())`,
                [taskId, 'in_progress', 'awaiting_human', 'system', `Awaiting human: ${question}`]
            );
            this.eventBus.emit('task:awaiting_human', { taskId, message: question, deadline });
            this.logger.info(`[Task] #${taskId} suspended awaiting human response`);
        } catch (err) {
            this.logger.error(`[Task] suspendForHuman failed:`, err.message);
            throw err;
        }
    }
    async addComment(taskId, workspaceId, authorType, authorId, content) {
        try {
            await this.db.query(
                `INSERT INTO task_comments (task_id, author_type, author_id, content, created_at) VALUES ($1, $2, $3, $4, NOW())`,
                [taskId, authorType, authorId, content]
            );
        } catch (err) {
            this.logger.error(`[Task] addComment failed:`, err.message);
            throw err;
        }
    }
    async getComments(taskId) {
        try {
            const result = await this.db.query(`SELECT * FROM task_comments WHERE task_id = $1 ORDER BY created_at ASC`, [taskId]);
            return result.rows;
        } catch (err) {
            this.logger.error(`[Task] getComments failed:`, err.message);
            throw err;
        }
    }
    async getHistory(taskId) {
        try {
            const result = await this.db.query(`SELECT * FROM task_history WHERE task_id = $1 ORDER BY created_at ASC`, [taskId]);
            return result.rows;
        } catch (err) {
            this.logger.error(`[Task] getHistory failed:`, err.message);
            throw err;
        }
    }
    async findOverdueAwaiting() {
        try {
            const result = await this.db.query(
                `SELECT * FROM tasks WHERE status = 'awaiting_human'
                 AND response_deadline < NOW()
                 AND (last_reminded_at IS NULL OR last_reminded_at < NOW() - INTERVAL '24 hours')
                 ORDER BY response_deadline ASC`
            );
            return result.rows;
        } catch (err) {
            this.logger.error(`[Task] findOverdueAwaiting failed:`, err.message);
            throw err;
        }
    }
    async markReminded(taskId) {
        try {
            await this.db.query(`UPDATE tasks SET last_reminded_at = NOW() WHERE id = $1`, [taskId]);
        } catch (err) {
            this.logger.error(`[Task] markReminded failed:`, err.message);
            throw err;
        }
    }
    async delete(taskId, workspaceId) {
        try {
            await this.db.query(`DELETE FROM tasks WHERE id = $1 AND workspace_id = $2`, [taskId, workspaceId]);
        } catch (err) {
            this.logger.error(`[Task] delete failed:`, err.message);
            throw err;
        }
    }
}
exports.TaskService = TaskService;
