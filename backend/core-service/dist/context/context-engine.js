"use strict";
/**
 * =============================================================================
 * 模块名称：上下文引擎（三级记忆堆叠）
 * 功能描述：L1对话上下文 → L2每日总结 → L3话题知识库 三级堆叠
 *   - L1: 5分钟无消息标记失效
 *   - L2: 每日凌晨3点定时生成AI摘要
 *   - L3: 每周日凌晨4点合并重写精炼知识
 * =============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextEngine = void 0;
const db_1 = require("../utils/db");
const logger_1 = require("../utils/logger");
const event_bus_1 = require("../events/event-bus");
const L1_EXPIRY_MINUTES = 5; // L1 5分钟无消息标记失效
const CONTEXT_WINDOW_PERCENT = 0.80; // Token 超过80%时裁剪
const MAX_CONTEXT_TOKENS = 4000;

class ContextEngine {
    static instance;
    db;
    logger;
    eventBus;
    // L1 活跃会话缓存: key = `${userId}:${soulId}`
    l1ActiveSessions = new Map();
    constructor() {
        this.db = db_1.Database.getInstance();
        this.logger = logger_1.Logger.getInstance();
        this.eventBus = event_bus_1.EventBus.getInstance();
        // 每分钟清理过期L1会话
        setInterval(() => this.cleanupExpiredL1(), 60000);
        // 监听定时任务事件
        this.eventBus.on('scheduler:daily_summary', (payload) => this.generateDailySummary(payload));
        this.eventBus.on('scheduler:l3_merge', (payload) => this.mergeL3Knowledge(payload));
    }
    static getInstance() {
        if (!ContextEngine.instance) ContextEngine.instance = new ContextEngine();
        return ContextEngine.instance;
    }
    /**
     * 构建三级堆叠上下文: 系统提示 → L3知识 → L2摘要 → L1历史 → 当前问题
     */
    async buildContext(userId, soulId, currentContent, systemPrompt) {
        const cacheKey = `${userId}:${soulId}`;
        const messages = [];
        // 1. 系统提示（永远保留）
        const wrappedSystem = `[系统指令：${systemPrompt}]\n\n你必须严格遵循以上系统指令设定的人设和规则来回答。`;
        messages.push({ role: 'user', content: wrappedSystem });
        const systemTokens = this.countTokens(wrappedSystem);
        let usedTokens = systemTokens;
        // 2. L3 话题知识库（长期记忆，优先级最高）
        const l3Knowledge = await this.retrieveL3Knowledge(soulId, currentContent);
        if (l3Knowledge && l3Knowledge.length > 0) {
            const l3Text = "【长期知识】\n" + l3Knowledge.map(k => k.content_md).join("\n---\n");
            const l3Tokens = this.countTokens(l3Text);
            if (usedTokens + l3Tokens < MAX_CONTEXT_TOKENS * CONTEXT_WINDOW_PERCENT) {
                messages.push({ role: 'user', content: l3Text });
                usedTokens += l3Tokens;
            }
        }
        // 3. L2 每日总结（短期记忆）
        const l2Summaries = await this.retrieveL2Summaries(soulId, currentContent);
        if (l2Summaries && l2Summaries.length > 0) {
            const l2Text = "【近期摘要】\n" + l2Summaries.map(s => `${s.topic_name}: ${s.summary_text}`).join("\n");
            const l2Tokens = this.countTokens(l2Text);
            if (usedTokens + l2Tokens < MAX_CONTEXT_TOKENS * CONTEXT_WINDOW_PERCENT) {
                messages.push({ role: 'user', content: l2Text });
                usedTokens += l2Tokens;
            }
        }
        // 4. L1 活跃对话上下文（仅活跃会话）
        const isL1Active = this.isL1Active(cacheKey);
        if (isL1Active) {
            const l1History = await this.getL1History(userId, soulId);
            // 从后往前加，直到达到Token上限
            const l1Messages = [];
            for (let i = l1History.length - 1; i >= 0; i--) {
                const h = l1History[i];
                const tk = this.countTokens(h.content);
                if (usedTokens + tk > MAX_CONTEXT_TOKENS * CONTEXT_WINDOW_PERCENT) break;
                usedTokens += tk;
                l1Messages.unshift({ role: h.role, content: h.content });
            }
            messages.push(...l1Messages);
        } else {
            this.logger.info(`[Context] L1 expired for ${cacheKey}, skipping live context`);
        }
        // 5. 当前问题
        messages.push({ role: 'user', content: `现在用户的问题是：${currentContent}` });
        // 更新L1活跃时间
        this.l1ActiveSessions.set(cacheKey, Date.now());
        return messages;
    }
    /** L1 是否活跃（5分钟内有过消息） */
    isL1Active(cacheKey) {
        const lastActive = this.l1ActiveSessions.get(cacheKey);
        if (!lastActive) return true; // 新会话默认活跃
        return (Date.now() - lastActive) < L1_EXPIRY_MINUTES * 60000;
    }
    /** 标记 L1 活跃 */
    touchL1(userId, soulId) {
        this.l1ActiveSessions.set(`${userId}:${soulId}`, Date.now());
    }
    /** 获取 L1 历史消息 */
    async getL1History(userId, soulId, limit = 20) {
        const result = await this.db.query(
            `SELECT role, content, topic FROM messages
             WHERE soul_id = $1 AND user_id = $2
             ORDER BY created_at DESC LIMIT $3`,
            [soulId, userId, limit]
        );
        return result.rows.reverse();
    }
    /** 清理过期L1会话 */
    cleanupExpiredL1() {
        const now = Date.now();
        for (const [key, lastActive] of this.l1ActiveSessions) {
            if (now - lastActive > L1_EXPIRY_MINUTES * 60000 * 2) {
                this.l1ActiveSessions.delete(key);
            }
        }
    }
    /** 检索 L3 话题知识库 */
    async retrieveL3Knowledge(soulId, queryContent) {
        try {
            // 先用简单关键词匹配，如pgvector可用则做语义检索
            const result = await this.db.query(
                `SELECT topic, topic_name, content_md, version
                 FROM topic_knowledge
                 WHERE soul_id = $1
                 ORDER BY updated_at DESC LIMIT 3`,
                [soulId]
            );
            return result.rows;
        } catch (err) {
            this.logger.warn('[Context] L3 retrieval failed:', err.message);
            return [];
        }
    }
    /** 检索 L2 每日总结 */
    async retrieveL2Summaries(soulId, queryContent) {
        try {
            const result = await this.db.query(
                `SELECT topic, topic_name, summary_text, summary_date
                 FROM daily_summaries
                 WHERE soul_id = $1 AND summary_date >= CURRENT_DATE - INTERVAL '7 days'
                 ORDER BY summary_date DESC LIMIT 5`,
                [soulId]
            );
            return result.rows;
        } catch (err) {
            this.logger.warn('[Context] L2 retrieval failed:', err.message);
            return [];
        }
    }
    /** L2 每日总结生成（由定时任务调用） */
    async generateDailySummary(payload) {
        const { soulId } = payload;
        this.logger.info(`[Context] Generating daily summary for soul ${soulId}`);
        try {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const dateStr = yesterday.toISOString().split('T')[0];
            // 获取昨天所有消息
            const messagesResult = await this.db.query(
                `SELECT topic, role, content FROM messages
                 WHERE soul_id = $1 AND created_at >= $2::date AND created_at < ($2::date + INTERVAL '1 day')
                 ORDER BY created_at`,
                [soulId, dateStr]
            );
            if (messagesResult.rows.length === 0) {
                this.logger.info(`[Context] No messages for ${dateStr}, skip summary`);
                return;
            }
            // 按 topic 分组
            const byTopic = {};
            for (const row of messagesResult.rows) {
                if (!byTopic[row.topic || 'default']) byTopic[row.topic || 'default'] = [];
                byTopic[row.topic || 'default'].push(row);
            }
            // 为每个 topic 生成摘要（使用 LLM 生成）
            const { AIGateway } = require('../gateway/ai-gateway');
            const gateway = AIGateway.getInstance();
            for (const [topic, msgs] of Object.entries(byTopic)) {
                let summaryText = '';
                try {
                    const chatResult = await gateway.chat({
                        messages: [
                            { role: 'system', content: '你是一个对话摘要助手。请将以下对话浓缩为3-5句话的摘要，保留关键决策和行动项。' },
                            { role: 'user', content: msgs.slice(0, 10).map(m => `${m.role}: ${m.content}`).join('\n').substring(0, 3000) }
                        ],
                        max_tokens: 200,
                        temperature: 0.3,
                    });
                    summaryText = chatResult.content || `昨日共 ${msgs.length} 条消息`;
                } catch {
                    summaryText = `昨日共 ${msgs.length} 条消息，涉及 ${[...new Set(msgs.map(m => m.role))].join('、')}。`;
                }
                await this.db.query(
                    `INSERT INTO daily_summaries (soul_id, summary_date, topic, topic_name, summary_text, message_count)
                     VALUES ($1, $2, $3, $4, $5, $6)
                     ON CONFLICT (soul_id, summary_date, topic) DO UPDATE SET
                        topic_name = EXCLUDED.topic_name, summary_text = EXCLUDED.summary_text,
                        message_count = EXCLUDED.message_count`,
                    [soulId, dateStr, topic, topic, summaryText, msgs.length]
                );
            }
            this.logger.info(`[Context] Daily summary generated for ${dateStr}: ${Object.keys(byTopic).length} topics`);
        } catch (err) {
            this.logger.error('[Context] Daily summary failed:', err.message);
        }
    }
    /** L3 每周合并（由定时任务调用） */
    async mergeL3Knowledge(payload) {
        const { soulId } = payload;
        this.logger.info(`[Context] Merging L3 knowledge for soul ${soulId}`);
        try {
            // 获取最近7天的L2摘要
            const summaries = await this.db.query(
                `SELECT topic, topic_name, summary_text FROM daily_summaries
                 WHERE soul_id = $1 AND summary_date >= CURRENT_DATE - INTERVAL '7 days'`,
                [soulId]
            );
            const byTopic = {};
            for (const row of summaries.rows) {
                if (!byTopic[row.topic]) byTopic[row.topic] = [];
                byTopic[row.topic].push(row);
            }
            for (const [topic, rows] of Object.entries(byTopic)) {
                const mergedContent = rows.map(r => r.summary_text).join("\n\n");
                await this.db.query(
                    `INSERT INTO topic_knowledge (soul_id, topic, topic_name, content_md, version, last_merged_at)
                     VALUES ($1, $2, $3, $4, 1, NOW())
                     ON CONFLICT (soul_id, topic) DO UPDATE SET
                        content_md = EXCLUDED.content_md, version = topic_knowledge.version + 1,
                        last_merged_at = NOW()`,
                    [soulId, topic, topic, mergedContent]
                );
            }
            this.logger.info(`[Context] L3 merge completed: ${Object.keys(byTopic).length} topics`);
        } catch (err) {
            this.logger.error('[Context] L3 merge failed:', err.message);
        }
    }
    countTokens(text) {
        const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
        const nonChinese = text.length - chineseChars;
        return Math.ceil(chineseChars + nonChinese / 2.5);
    }
}
exports.ContextEngine = ContextEngine;
