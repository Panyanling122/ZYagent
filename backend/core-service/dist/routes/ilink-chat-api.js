"use strict";
/**
 * =============================================================================
 * 模块名称：iLink Chat HTTP API
 * 功能描述：iLink Bridge 调用的 HTTP API，限流保护，Token 统计
 *   - POST /api/ilink/chat    : 微信消息接入
 *   - POST /api/ilink/register: 注册新的 iLink 上下文
 *   - GET  /api/ilink/status  : 查询连接状态
 * =============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const ilink_bridge_1 = require("../ilink/ilink-bridge");
const db_1 = require("../utils/db");
const logger_1 = require("../utils/logger");
const router = express.Router();
const bridge = ilink_bridge_1.iLinkBridge.getInstance();
const logger = logger_1.Logger.getInstance();
// 简单内存限流器
const rateLimiter = new Map();
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX = 30;
function checkRateLimit(key) {
    const now = Date.now();
    const record = rateLimiter.get(key);
    if (!record || now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
        rateLimiter.set(key, { windowStart: now, count: 1 });
        return true;
    }
    if (record.count >= RATE_LIMIT_MAX) {
        return false;
    }
    record.count++;
    return true;
}
// 每10分钟清理过期限流记录
setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimiter.entries()) {
        if (now - record.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
            rateLimiter.delete(key);
        }
    }
}, 600000);
/**
 * 注册 iLink 上下文
 * POST /api/ilink/register
 */
router.post('/register', async (req, res) => {
    try {
        const { contextToken, soulId, botToken } = req.body;
        if (!contextToken || !soulId || !botToken) {
            return res.status(400).json({ error: 'Missing contextToken, soulId or botToken' });
        }
        const client = await bridge.registerContext(contextToken, soulId, botToken);
        res.json({ success: true, contextToken, soulId, status: client.pollingActive ? 'polling' : 'pending' });
    }
    catch (err) {
        logger.error('[iLinkAPI] Register failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});
/**
 * 微信消息接入（直接消息转发）
 * POST /api/ilink/chat
 */
router.post('/chat', async (req, res) => {
    try {
        const { contextToken, wxUserId, wxUserName, message, messageId } = req.body;
        if (!contextToken || !message) {
            return res.status(400).json({ error: 'Missing contextToken or message' });
        }
        const client = bridge.getActiveContexts().find(c => c.contextToken === contextToken);
        if (!client) {
            return res.status(404).json({ error: 'Context not found' });
        }
        // 限流检查
        const rateKey = `${contextToken}:${wxUserId || 'unknown'}`;
        if (!checkRateLimit(rateKey)) {
            return res.status(429).json({ error: 'Rate limit exceeded' });
        }
        const db = db_1.Database.getInstance();
        // 获取 soulId
        const ctxResult = await db.query(
            `SELECT soul_id FROM ilink_contexts WHERE context_token = $1`,
            [contextToken]
        );
        const soulId = ctxResult.rows[0]?.soul_id;
        if (!soulId) {
            return res.status(404).json({ error: 'Soul not found for context' });
        }
        // 查找用户映射
        const mappingResult = await db.query(
            `SELECT user_id FROM ilink_user_mappings WHERE wx_user_id = $1 AND soul_id = $2`,
            [String(wxUserId || 'anonymous'), soulId]
        );
        const userId = mappingResult.rows[0]?.user_id;
        if (!userId) {
            return res.status(404).json({ error: 'User mapping not found' });
        }
        // 话题检测
        const { TopicService } = require('../soul/topic-service');
        const topicService = TopicService.getInstance();
        const topicResult = await topicService.detectTopic(userId, soulId, message);
        const currentTopic = topicResult.topic;
        const actualContent = topicResult.cleanContent || message;
        // 保存用户消息
        await db.query(
            `INSERT INTO messages (id, soul_id, user_id, role, content, topic, topic_changed, created_at)
             VALUES (gen_random_uuid(), $1, $2, 'user', $3, $4, $5, NOW())`,
            [soulId, userId, actualContent, currentTopic, topicResult.isSwitched]
        );
        // 获取历史消息（按话题隔离）
        const historyRows = await topicService.getMessagesByTopic(userId, soulId, currentTopic, 20);
        const historyMessages = historyRows.map(h => ({ role: h.role, content: h.content }));
        // 查询 Soul system_prompt
        const soulResult = await db.query('SELECT system_prompt FROM souls WHERE id = $1', [soulId]);
        const systemPrompt = soulResult.rows[0]?.system_prompt || '你是一个 helpful AI assistant。';
        const wrappedContent = `[系统指令：${systemPrompt}]\n\n${actualContent}`;
        const modelMessages = [...historyMessages, { role: 'user', content: wrappedContent }];
        // 调用 AI
        const soulManager = require('../soul/soul-process').SoulProcessManager.getInstance();
        const response = await soulManager.handleChat(soulId, { messages: modelMessages });
        // 保存 AI 回复
        await db.query(
            `INSERT INTO messages (id, soul_id, user_id, role, content, topic, created_at)
             VALUES (gen_random_uuid(), $1, $2, 'assistant', $3, $4, NOW())`,
            [soulId, userId, response, currentTopic]
        );
        // Token 统计（简单估算）
        const inputTokens = estimateTokens(message);
        const outputTokens = estimateTokens(response);
        res.json({
            success: true,
            reply: response,
            topic: currentTopic,
            topicSwitched: topicResult.isSwitched,
            tokens: { input: inputTokens, output: outputTokens }
        });
    }
    catch (err) {
        logger.error('[iLinkAPI] Chat failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});
/**
 * 查询连接状态
 * GET /api/ilink/status
 */
router.get('/status', async (req, res) => {
    try {
        const contexts = bridge.getActiveContexts();
        res.json({
            activeContexts: contexts.length,
            contexts: contexts.map(c => ({
                contextToken: c.contextToken,
                soulId: c.soulId,
                pollingActive: c.pollingActive
            }))
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
function estimateTokens(text) {
    const chinese = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const other = text.length - chinese;
    return Math.ceil(chinese + other / 2.5);
}
exports.default = router;
//# sourceMappingURL=ilink-chat-api.js.map
