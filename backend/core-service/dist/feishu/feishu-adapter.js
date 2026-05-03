"use strict";
/**
 * =============================================================================
 * 模块名称：飞书渠道适配器 (完整版)
 * 功能描述：Event Subscription Webhook 接收、签名验证、消息收发、错误重试
 * =============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeishuAdapter = void 0;
const crypto_1 = require("crypto");
const axios_1 = require("axios");
const db_1 = require("../utils/db");
const logger_1 = require("../utils/logger");
const event_bus_1 = require("../events/event-bus");
const FEISHU_API_BASE = 'https://open.feishu.cn/open-apis';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

class FeishuAdapter {
    static instance;
    db;
    logger;
    eventBus;
    appId;
    appSecret;
    encryptKey;
    tenantAccessToken;
    tokenExpiry = 0;
    httpClient;
    constructor() {
        this.db = db_1.Database.getInstance();
        this.logger = logger_1.Logger.getInstance();
        this.eventBus = event_bus_1.EventBus.getInstance();
        this.appId = process.env.FEISHU_APP_ID || '';
        this.appSecret = process.env.FEISHU_APP_SECRET || '';
        this.encryptKey = process.env.FEISHU_ENCRYPT_KEY || '';
        this.httpClient = axios_1.default.create({ baseURL: FEISHU_API_BASE, timeout: 30000 });
    }
    static getInstance() {
        if (!FeishuAdapter.instance) FeishuAdapter.instance = new FeishuAdapter();
        return FeishuAdapter.instance;
    }
    async initialize() {
        if (!this.appId || !this.appSecret) {
            this.logger.warn('[Feishu] Missing FEISHU_APP_ID or FEISHU_APP_SECRET');
            return;
        }
        await this.refreshTenantToken();
        this.logger.info('[Feishu] Adapter initialized');
    }
    /**
     * Webhook 入口：验证签名 + 解析消息
     */
    async handleWebhook(body, headers) {
        try {
            // 1. 签名验证
            const signature = headers['x-lark-signature'] || '';
            const timestamp = headers['x-lark-request-timestamp'] || '';
            const nonce = headers['x-lark-nonce'] || '';
            if (!this.verifySignature(signature, timestamp, nonce, JSON.stringify(body))) {
                this.logger.warn('[Feishu] Signature verification failed');
                return { challenge: body.challenge }; // 返回challenge用于首次配置
            }
            // 2. URL 验证（首次配置事件订阅）
            if (body.type === 'url_verification') {
                return { challenge: body.challenge };
            }
            // 3. 解密（如果配置了encrypt_key）
            let eventData = body;
            if (this.encryptKey && body.encrypt) {
                eventData = this.decryptEvent(body.encrypt);
            }
            // 4. 处理消息事件
            const event = eventData.event;
            if (!event) return {};
            const message = event.message;
            const sender = event.sender;
            if (message && message.chat_type === 'p2p') {
                await this.handleP2PMessage(message, sender);
            } else if (message && message.chat_type === 'group') {
                await this.handleGroupMessage(message, sender, event.message.chat_id);
            }
            return {};
        } catch (err) {
            this.logger.error('[Feishu] Webhook error:', err.message);
            return { code: 0 }; // 飞书要求始终返回200
        }
    }
    /**
     * 处理私聊消息
     */
    async handleP2PMessage(message, sender) {
        const content = this.parseMessageContent(message);
        const userId = sender.sender_id?.user_id || sender.sender_id?.union_id || 'unknown';
        const userName = sender.sender_id?.user_id || '飞书用户';
        this.logger.info(`[Feishu] P2P from ${userName}(${userId}): ${content.substring(0, 50)}`);
        // 转换标准事件并提交到总线
        this.eventBus.emit('channel:message', {
            channel: 'feishu', userId, userName, content,
            messageType: message.msg_type, rawMessage: message,
        });
    }
    /**
     * 处理群消息
     */
    async handleGroupMessage(message, sender, chatId) {
        const content = this.parseMessageContent(message);
        const userId = sender.sender_id?.user_id || 'unknown';
        // 检查是否有 @bot 的 mention
        const mentions = message.mentions || [];
        const isAtBot = mentions.some(m => m.key === this.appId);
        this.eventBus.emit('channel:message', {
            channel: 'feishu', userId, content, chatId, isAtBot,
            messageType: message.msg_type, rawMessage: message,
        });
    }
    /**
     * 发送消息到飞书
     */
    async sendMessage(chatId, content, msgType = 'text') {
        await this.ensureToken();
        let body;
        if (msgType === 'text') {
            body = { receive_id: chatId, msg_type: 'text', content: JSON.stringify({ text: content }) };
        } else if (msgType === 'markdown') {
            body = { receive_id: chatId, msg_type: 'interactive', content: JSON.stringify({ config: { wide_screen_mode: true }, elements: [{ tag: 'div', text: { tag: 'lark_md', content } }] }) };
        } else {
            body = { receive_id: chatId, msg_type: msgType, content };
        }
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                const resp = await this.httpClient.post('/im/v1/messages', body, {
                    headers: { Authorization: `Bearer ${this.tenantAccessToken}` },
                    params: { receive_id_type: 'chat_id' },
                });
                this.logger.info(`[Feishu] Sent message to ${chatId}`);
                return resp.data;
            } catch (err) {
                this.logger.error(`[Feishu] Send attempt ${attempt + 1} failed:`, err.message);
                if (attempt < MAX_RETRIES - 1) {
                    await this.sleep(RETRY_DELAY_MS * (attempt + 1));
                    if (err.response?.status === 401) await this.refreshTenantToken();
                } else {
                    // 根据错误码处理
                    const code = err.response?.data?.code;
                    if (code === 230002) throw new Error('User not in group');
                    if (code === 11232) throw new Error('Content blocked');
                    if (code === 99991400) throw new Error('Rate limited');
                    throw err;
                }
            }
        }
    }
    /**
     * 签名验证
     */
    verifySignature(signature, timestamp, nonce, body) {
        if (!this.encryptKey) return true; // 未配置encrypt_key时不验证
        const basestring = `${timestamp}_${nonce}_${body}`;
        const hash = (0, crypto_1.createHmac)('sha256', this.encryptKey).update(basestring).digest('base64');
        return hash === signature;
    }
    /**
     * 解密事件（如有加密）
     * TODO: 实际生产环境需用 AES-256-CBC 解密
     * 参考: https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/event-format
     */
    decryptEvent(encrypt) {
        this.logger.info('[Feishu] Decrypt event (placeholder, AES decryption not implemented)');
        // 当前仅做 base64 解码，生产环境需实现 AES-256-CBC 解密
        try {
            return JSON.parse(Buffer.from(encrypt, 'base64').toString('utf8'));
        } catch (err) {
            this.logger.error('[Feishu] Decrypt failed:', err.message);
            return {};
        }
    }
    /**
     * 解析消息内容
     */
    parseMessageContent(message) {
        if (message.msg_type === 'text') {
            const content = JSON.parse(message.content || '{}');
            return content.text || '';
        }
        return '[非文本消息]';
    }
    /**
     * 获取 Tenant Access Token
     */
    async refreshTenantToken() {
        try {
            const resp = await this.httpClient.post('/auth/v3/tenant_access_token/internal', {
                app_id: this.appId, app_secret: this.appSecret,
            });
            this.tenantAccessToken = resp.data.tenant_access_token;
            this.tokenExpiry = Date.now() + (resp.data.expire || 7200) * 1000 - 300000; // 提前5分钟刷新
        } catch (err) {
            this.logger.error('[Feishu] Token refresh failed:', err.message);
        }
    }
    async ensureToken() {
        if (Date.now() > this.tokenExpiry) await this.refreshTenantToken();
    }
    sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}
exports.FeishuAdapter = FeishuAdapter;
