"use strict";
/**
 * =============================================================================
 * 模块名称：iLink 微信 ClawBot 客户端
 * 功能描述：基于 iLink Bot API 的微信对接方案
 *   - 扫码登录获取 bot_token
 *   - 长轮询(35s)接收消息 getupdates
 *   - context_token 关联用户与 Soul
 *   - 24小时续连机制
 * =============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.iLinkClient = exports.TYPING_INDICATOR = void 0;
const axios_1 = require("axios");
const db_1 = require("../utils/db");
const logger_1 = require("../utils/logger");
// 常量
exports.TYPING_INDICATOR = { action: 'typing' };
const ILINK_API_BASE = process.env.ILINK_API_BASE || 'https://api.ilinkbot.com/v1';
const POLL_TIMEOUT_MS = 35000; // iLink 要求 35s 长轮询
const RECONNECT_INTERVAL_MS = 5000;
const TOKEN_REFRESH_HOURS = 24;
class iLinkClient {
    botToken;
    contextToken;
    soulId;
    db;
    logger;
    eventHandlers = new Map();
    pollingActive = false;
    lastUpdateId = 0;
    reconnectTimer = null;
    tokenRefreshTimer = null;
    httpClient;
    constructor(botToken, contextToken, soulId) {
        this.botToken = botToken;
        this.contextToken = contextToken;
        this.soulId = soulId;
        this.db = db_1.Database.getInstance();
        this.logger = logger_1.Logger.getInstance();
        this.httpClient = axios_1.default.create({
            baseURL: ILINK_API_BASE,
            timeout: POLL_TIMEOUT_MS + 5000,
            headers: { 'Authorization': `Bearer ${botToken}`, 'Content-Type': 'application/json' }
        });
        this.startTokenRefresh();
    }
    /**
     * 注册事件处理器
     */
    on(event, handler) {
        this.eventHandlers.set(event, handler);
    }
    emit(event, data) {
        const handler = this.eventHandlers.get(event);
        if (handler)
            handler(data);
    }
    /**
     * 开始长轮询接收消息
     */
    async startPolling() {
        if (this.pollingActive)
            return;
        this.pollingActive = true;
        this.logger.info(`[iLink] Start polling for context ${this.contextToken}`);
        while (this.pollingActive) {
            try {
                const updates = await this.pollUpdates();
                for (const update of updates) {
                    this.lastUpdateId = Math.max(this.lastUpdateId, update.update_id);
                    await this.handleUpdate(update);
                }
            }
            catch (err) {
                this.logger.error('[iLink] Polling error:', err.message);
                await this.sleep(RECONNECT_INTERVAL_MS);
            }
        }
    }
    stopPolling() {
        this.pollingActive = false;
        if (this.reconnectTimer)
            clearTimeout(this.reconnectTimer);
        if (this.tokenRefreshTimer)
            clearInterval(this.tokenRefreshTimer);
        this.logger.info('[iLink] Polling stopped');
    }
    async pollUpdates() {
        const resp = await this.httpClient.get('/getupdates', {
            params: { offset: this.lastUpdateId + 1, limit: 100 },
            timeout: POLL_TIMEOUT_MS
        });
        return resp.data?.result || [];
    }
    async handleUpdate(update) {
        const msg = update.message;
        if (!msg)
            return;
        const wxUserId = msg.from?.id;
        const wxUserName = msg.from?.first_name || msg.from?.username || '微信用户';
        const text = msg.text || '';
        this.logger.info(`[iLink] Message from ${wxUserName}(${wxUserId}): ${text.substring(0, 50)}`);
        // 查找或创建用户映射
        const userMapping = await this.ensureUserMapping(wxUserId, wxUserName);
        // 话题检测
        const topicService = this.getTopicService();
        const topicResult = topicService ? await topicService.detectTopic(userMapping.user_id, this.soulId, text) : { topic: 'default', isSwitched: false, reason: 'fallback', confidence: 0.5 };
        const currentTopic = topicResult.topic;
        // 保存消息
        await this.db.query(
            `INSERT INTO messages (id, soul_id, user_id, role, content, topic, topic_changed, created_at)
             VALUES (gen_random_uuid(), $1, $2, 'user', $3, $4, $5, NOW())`,
            [this.soulId, userMapping.user_id, text, currentTopic, topicResult.isSwitched]
        );
        // 发送 typing 指示器
        await this.sendChatAction(wxUserId, exports.TYPING_INDICATOR.action);
        // 获取当前话题的历史消息作为上下文
        const historyRows = await this.getTopicService().getMessagesByTopic(userMapping.user_id, this.soulId, currentTopic, 20);
        const historyMessages = historyRows.map(h => ({ role: h.role, content: h.content }));
        // 查询 Soul 的 system_prompt
        const soulResult = await this.db.query('SELECT system_prompt FROM souls WHERE id = $1', [this.soulId]);
        const systemPrompt = soulResult.rows[0]?.system_prompt || '你是一个 helpful AI assistant。';
        const wrappedContent = `[系统指令：${systemPrompt}]\n\n${text}`;
        const modelMessages = [...historyMessages, { role: 'user', content: wrappedContent }];
        // 通过事件总线请求 Core Service 处理聊天
        this.emit('chat_request', {
            soulId: this.soulId,
            userId: userMapping.user_id,
            wxUserId,
            wxUserName,
            messages: modelMessages,
            topic: currentTopic,
            replyCallback: async (replyText) => {
                await this.sendTextMessage(wxUserId, replyText);
                // 保存 AI 回复
                await this.db.query(
                    `INSERT INTO messages (id, soul_id, user_id, role, content, topic, created_at)
                     VALUES (gen_random_uuid(), $1, $2, 'assistant', $3, $4, NOW())`,
                    [this.soulId, userMapping.user_id, replyText, currentTopic]
                );
            }
        });
    }
    /**
     * 发送文本消息到微信用户
     */
    async sendTextMessage(chatId, text) {
        try {
            await this.httpClient.post('/sendmessage', {
                chat_id: chatId,
                text: text.substring(0, 4000), // iLink 单条限制
                parse_mode: 'HTML'
            });
            this.logger.info(`[iLink] Sent message to ${chatId}`);
        }
        catch (err) {
            this.logger.error(`[iLink] Send failed:`, err.message);
            throw err;
        }
    }
    /**
     * 发送聊天状态（typing）
     */
    async sendChatAction(chatId, action) {
        try {
            await this.httpClient.post('/sendchataction', { chat_id: chatId, action });
        }
        catch (err) {
            // typing 失败不影响主流程
        }
    }
    /**
     * 确保微信用户映射到系统用户
     */
    async ensureUserMapping(wxUserId, wxUserName) {
        const existing = await this.db.query(
            `SELECT user_id FROM ilink_user_mappings WHERE wx_user_id = $1 AND soul_id = $2`,
            [String(wxUserId), this.soulId]
        );
        if (existing.rows.length > 0) {
            return { user_id: existing.rows[0].user_id };
        }
        // 创建新用户
        const newUser = await this.db.query(
            `INSERT INTO users (id, username, display_name, created_at)
             VALUES (gen_random_uuid(), $1, $2, NOW())
             ON CONFLICT (username) DO UPDATE SET display_name = $2
             RETURNING id`,
            [`wx_${wxUserId}`, wxUserName]
        );
        const userId = newUser.rows[0].id;
        // 建立映射
        await this.db.query(
            `INSERT INTO ilink_user_mappings (wx_user_id, user_id, soul_id, wx_name, created_at)
             VALUES ($1, $2, $3, $4, NOW())`,
            [String(wxUserId), userId, this.soulId, wxUserName]
        );
        return { user_id: userId };
    }
    /**
     * 24小时续连机制
     */
    startTokenRefresh() {
        this.tokenRefreshTimer = setInterval(async () => {
            try {
                this.logger.info('[iLink] Refreshing token...');
                // iLink 支持自动续连，此处可扩展调用 refresh API
                this.emit('token_refresh', { botToken: this.botToken, contextToken: this.contextToken });
            }
            catch (err) {
                this.logger.error('[iLink] Token refresh failed:', err.message);
            }
        }, TOKEN_REFRESH_HOURS * 3600 * 1000);
    }
    getTopicService() {
        try {
            const { TopicService } = require('../soul/topic-service');
            return TopicService.getInstance();
        } catch (err) {
            this.logger.error('[iLink] TopicService load failed:', err.message);
            return null;
        }
    }
    sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }
}
exports.iLinkClient = iLinkClient;
//# sourceMappingURL=ilink-client.js.map
