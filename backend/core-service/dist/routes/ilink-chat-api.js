"use strict";
/**
 * =============================================================================
 * 模块名称：iLink 消息路由
 * 功能描述：微信消息接入 + 人机协作恢复 + await_human 检测
 * =============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const db_1 = require("../utils/db");
const logger_1 = require("../utils/logger");
const ilink_adapter_1 = require("../channels/ilink-adapter");
const router = express.Router();
const bridge = ilink_adapter_1.iLinkAdapter.getInstance();
const logger = logger_1.Logger.getInstance();

// 简单限流：每个用户每分钟最多 10 条
const rateLimitMap = new Map();
function checkRateLimit(key) {
    const now = Date.now();
    const windowStart = now - 60000;
    const entries = rateLimitMap.get(key) || [];
    const valid = entries.filter(t => t > windowStart);
    if (valid.length >= 10) return false;
    valid.push(now);
    rateLimitMap.set(key, valid);
    return true;
}

/**
 * 注册 iLink 连接
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
    } catch (err) {
        logger.error('[iLinkAPI] Register failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * 微信消息接入
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
        // 限流
        const rateKey = `${contextToken}:${wxUserId || 'unknown'}`;
        if (!checkRateLimit(rateKey)) {
            return res.status(429).json({ error: 'Rate limit exceeded' });
        }
        const db = db_1.Database.getInstance();
        // 获取 soulId
        const ctxResult = await db.query(`SELECT soul_id FROM ilink_contexts WHERE context_token = $1`, [contextToken]);
        const soulId = ctxResult.rows[0]?.soul_id;
        if (!soulId) {
            return res.status(404).json({ error: 'Soul not found for context' });
        }
        // 获取 workspace_id
        const soulWsResult = await db.query('SELECT workspace_id FROM souls WHERE id = $1', [soulId]);
        const workspaceId = soulWsResult.rows[0]?.workspace_id;
        // 查找用户映射
        const mappingResult = await db.query(
            `SELECT user_id FROM ilink_user_mappings WHERE wx_user_id = $1 AND soul_id = $2`,
            [String(wxUserId || 'anonymous'), soulId]
        );
        const userId = mappingResult.rows[0]?.user_id;
        if (!userId) {
            return res.status(404).json({ error: 'User mapping not found' });
        }
        // === 人机协作中断恢复 ===
        const { HumanResponseMatcher } = require('../services/human-response-matcher');
        const matcher = HumanResponseMatcher.getInstance();
        const matchedTask = workspaceId ? await matcher.match(message, userId, workspaceId) : null;
        if (matchedTask && matchedTask.confidence > 0.5) {
            const task = matchedTask.task;
            const intent = matcher.parseIntent(message);
            const { TaskService } = require('../services/task-service');
            const taskService = TaskService.getInstance();
            await taskService.addComment(task.id, workspaceId, 'human', userId, message);
            const eventBus = require('../events/event-bus').EventBus.getInstance();
            if (intent === 'approve') {
                await taskService.updateStatus(task.id, workspaceId, 'in_progress', userId, 'Human approved');
                eventBus.emit('task:human_responded', { taskId: task.id, response: message, intent: 'approve', matchedConfidence: matchedTask.confidence });
                res.json({ success: true, type: 'task_resumed', taskId: task.id, intent: 'approve' });
                return;
            } else if (intent === 'reject') {
                await taskService.updateStatus(task.id, workspaceId, 'cancelled', userId, 'Human rejected');
                eventBus.emit('task:human_responded', { taskId: task.id, response: message, intent: 'reject', matchedConfidence: matchedTask.confidence });
                res.json({ success: true, type: 'task_cancelled', taskId: task.id, intent: 'reject' });
                return;
            } else if (intent === 'modify') {
                await taskService.updateStatus(task.id, workspaceId, 'in_progress', userId, 'Human requested modification');
                eventBus.emit('task:human_responded', { taskId: task.id, response: message, intent: 'modify', matchedConfidence: matchedTask.confidence });
                res.json({ success: true, type: 'task_modified', taskId: task.id, intent: 'modify' });
                return;
            } else {
                res.json({ success: true, type: 'needs_clarification', taskId: task.id, message: '请明确您的意图：同意、拒绝或修改？' });
                return;
            }
        }
        // 话题检测
        const { TopicService } = require('../soul/topic-service');
        const topicService = TopicService.getInstance();
        const topicResult = await topicService.detectTopic(userId, soulId, message);
        const currentTopic = topicResult.topic;
        const actualContent = topicResult.cleanContent || message;
        // 保存用户消息
        await db.query(
            `INSERT INTO messages (id, soul_id, user_id, role, content, topic, topic_changed, workspace_id, created_at)
             VALUES (gen_random_uuid(), $1, $2, 'user', $3, $4, $5, $6, NOW())`,
            [soulId, userId, actualContent, currentTopic, topicResult.isSwitched, workspaceId]
        );
        // 获取历史
        const historyRows = await topicService.getMessagesByTopic(userId, soulId, currentTopic, 20);
        const historyMessages = historyRows.map(h => ({ role: h.role, content: h.content }));
        // 查询 Soul system_prompt 并注入 await_human 工具说明
        const soulResult = await db.query('SELECT system_prompt FROM souls WHERE id = $1', [soulId]);
        const basePrompt = soulResult.rows[0]?.system_prompt || '你是一个 helpful AI assistant。';
        const { AwaitHumanParser } = require('../services/await-human-parser');
        const systemPrompt = AwaitHumanParser.getInstance().injectSystemPrompt(basePrompt);
        const wrappedContent = `${systemPrompt}\n\n现在用户的问题是：${actualContent}`;
        const modelMessages = [...historyMessages, { role: 'user', content: wrappedContent }];
        // 调用 AI
        const soulManager = require('../soul/soul-process').SoulProcessManager.getInstance();
        const response = await soulManager.handleChat(soulId, { messages: modelMessages });
        // === await_human 检测 ===
        const awaitParser = AwaitHumanParser.getInstance();
        const ctx = { messages: modelMessages, soulId, userId, workspaceId, topic: currentTopic };
        const awaitResult = workspaceId ? await awaitParser.process(soulId, userId, workspaceId, response, 'wechat', currentTopic, ctx) : null;
        let finalResponse = response;
        if (awaitResult) {
            finalResponse = awaitResult.formattedMessage || awaitResult.cleanResponse || response;
        }
        // 保存 AI 回复
        await db.query(
            `INSERT INTO messages (id, soul_id, user_id, role, content, topic, workspace_id, created_at)
             VALUES (gen_random_uuid(), $1, $2, 'assistant', $3, $4, $5, NOW())`,
            [soulId, userId, awaitResult ? awaitResult.cleanResponse || response : response, currentTopic, workspaceId]
        );
        res.json({
            success: true,
            response: finalResponse,
            topic: currentTopic,
            messageId,
            awaitedHuman: awaitResult ? { taskId: awaitResult.taskId, question: awaitResult.question } : null
        });
    } catch (err) {
        logger.error('[iLinkAPI] Chat failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * 获取活跃上下文列表
 * GET /api/ilink/contexts
 */
router.get('/contexts', (_req, res) => {
    try {
        const contexts = bridge.getActiveContexts();
        res.json({ success: true, contexts });
    } catch (err) {
        logger.error('[iLinkAPI] Get contexts failed:', err.message);
        res.status(500).json({ error: err.message });
    }
});

exports.default = router;
