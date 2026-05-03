"use strict";
/**
 * =============================================================================
 * 模块名称：消息撤回功能
 * 功能描述：消息状态标记 + 撤回广播 + 前端占位符
 * =============================================================================
 */
const express = require("express");
const db_1 = require("../utils/db");
const logger_1 = require("../utils/logger");
const event_bus_1 = require("../events/event-bus");
const router = express.Router();
const logger = logger_1.Logger.getInstance();
const eventBus = event_bus_1.EventBus.getInstance();
// 简单的认证中间件（如果 req.user 不存在，尝试从 header 解析）
function requireAuth(req, res, next) {
    if (req.user) return next();
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    // 简化的 JWT 验证
    const jwt = require("jsonwebtoken");
    const secret = process.env.JWT_SECRET || 'openclaw_jwt_secret_key_2024';
    try {
        const decoded = jwt.verify(token, secret);
        req.user = decoded;
        next();
    } catch {
        return res.status(401).json({ error: 'Invalid token' });
    }
}
router.use(requireAuth);
/**
 * 撤回消息
 * POST /api/messages/:messageId/retract
 */
router.post('/:messageId/retract', async (req, res) => {
    try {
        const { messageId } = req.params;
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const db = db_1.Database.getInstance();
        // 验证消息存在且属于当前用户
        const msgResult = await db.query(
            `SELECT id, user_id, soul_id, role, content, created_at FROM messages WHERE id = $1`,
            [messageId]
        );
        const message = msgResult.rows[0];
        if (!message) return res.status(404).json({ error: 'Message not found' });
        // 只能撤回2分钟内的消息
        const ageMs = Date.now() - new Date(message.created_at).getTime();
        if (ageMs > 120000) {
            return res.status(403).json({ error: 'Cannot retract message older than 2 minutes' });
        }
        // 只能撤回自己的消息
        if (message.user_id !== userId && message.role === 'user') {
            return res.status(403).json({ error: 'Can only retract your own messages' });
        }
        // 标记为已撤回
        await db.query(
            `UPDATE messages SET status = 'retracted', content = '[已撤回]', updated_at = NOW() WHERE id = $1`,
            [messageId]
        );
        // 广播撤回事件
        eventBus.emit('message:retracted', {
            messageId, soulId: message.soul_id, userId, role: message.role
        });
        logger.info(`[Retract] Message ${messageId} retracted by user ${userId}`);
        res.json({ success: true, messageId, status: 'retracted' });
    } catch (err) {
        logger.error('[Retract] Failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});
/**
 * 查询消息状态（含是否已撤回）
 * GET /api/messages/:messageId/status
 */
router.get('/:messageId/status', async (req, res) => {
    try {
        const { messageId } = req.params;
        const db = db_1.Database.getInstance();
        const result = await db.query(
            `SELECT id, status, content, created_at FROM messages WHERE id = $1`,
            [messageId]
        );
        if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.default = router;
