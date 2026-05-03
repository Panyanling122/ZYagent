"use strict";
/**
 * =============================================================================
 * 模块名称：群通信服务
 * 功能描述：中亿智能体集群群虚拟通信、@触发协作、全局排队60秒超时
 * 技术决策引用：#51 #52 #53 #54 #55
 * 创建日期：2026-04-30
 * 最后修改：2026-04-30
 * =============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroupService = void 0;
const db_1 = require("../utils/db");
const logger_1 = require("../utils/logger");
const config_1 = require("../utils/config");
const soul_manager_1 = require("./soul-manager");
const event_bus_1 = require("../events/event-bus");
class GroupService {
    static instance;
    db;
    logger;
    config;
    eventBus;
    queues = new Map();
    processing = new Set();
    constructor() {
        this.db = db_1.Database.getInstance();
        this.logger = logger_1.Logger.getInstance();
        this.config = config_1.Config.getInstance();
        this.eventBus = event_bus_1.EventBus.getInstance();
    }
    static getInstance() {
        if (!GroupService.instance)
            GroupService.instance = new GroupService();
        return GroupService.instance;
    }
    async getGroups() {
        const result = await this.db.query(`SELECT * FROM groups_table WHERE status = 'active' ORDER BY created_at DESC`);
        return result.rows;
    }
    async getGroupMessages(groupId, limit = 100) {
        const result = await this.db.query(`SELECT * FROM group_messages WHERE group_id = $1 ORDER BY created_at DESC LIMIT $2`, [groupId, limit]);
        return result.rows;
    }
    // @触发协作
    async requestCollaboration(fromSoulId, toSoulId, groupId, content, skillName) {
        // Check if toSoulId is already processing
        if (this.processing.has(toSoulId)) {
            // Add to queue
            if (!this.queues.has(toSoulId))
                this.queues.set(toSoulId, []);
            const queue = this.queues.get(toSoulId);
            if (queue.length >= 50)
                throw new Error("Queue full for soul " + toSoulId);
            return new Promise((resolve) => {
                queue.push({ content: { fromSoulId, content, skillName }, resolve });
            });
        }
        // Direct execution
        return this.executeCollaboration(fromSoulId, toSoulId, groupId, content, skillName);
    }
    async executeCollaboration(fromSoulId, toSoulId, groupId, content, skillName) {
        this.processing.add(toSoulId);
        // Emit progress
        this.eventBus.emit(`progress:${fromSoulId}`, {
            soulId: toSoulId,
            soulName: skillName,
            status: "processing",
        });
        try {
            // Create group message record
            await this.db.query(`INSERT INTO group_messages (group_id, from_soul_id, to_soul_id, content, type, status, created_at)
         VALUES ($1, $2, $3, $4, 'request', 'completed', NOW())`, [groupId, fromSoulId, toSoulId, content]);
            // 调用目标Soul进行协作处理
            // 发送群协作消息给目标Soul
            const response = await soul_process_1.SoulProcessManager.getInstance().sendMessage(toSoulId, { type: "group", message: content, fromSoulId, groupId });
            // Emit completion
            this.eventBus.emit(`progress:${fromSoulId}`, {
                soulId: toSoulId,
                soulName: skillName,
                status: "completed",
            });
            return response;
        }
        finally {
            this.processing.delete(toSoulId);
            // Process next in queue if any
            this.processQueue(toSoulId, groupId);
        }
    }
    async processQueue(soulId, groupId) {
        const queue = this.queues.get(soulId);
        if (!queue || queue.length === 0)
            return;
        const item = queue.shift();
        try {
            const result = await this.executeCollaboration(item.content.fromSoulId, soulId, groupId, item.content.content, item.content.skillName);
            item.resolve(result);
        }
        catch (err) {
            item.resolve({ error: err.message });
        }
    }
    isBusy(soulId) {
        return this.processing.has(soulId);
    }
    getQueueDepth(soulId) {
        return this.queues.get(soulId)?.length || 0;
    }
}
exports.GroupService = GroupService;
//# sourceMappingURL=group-service.js.map