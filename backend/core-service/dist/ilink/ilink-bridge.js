"use strict";
/**
 * =============================================================================
 * 模块名称：iLink ↔ Core-Service 桥接服务
 * 功能描述：微信消息桥接，用户-Soul映射管理，消息转发
 * =============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.iLinkBridge = void 0;
const ilink_client_1 = require("./ilink-client");
const db_1 = require("../utils/db");
const logger_1 = require("../utils/logger");
const soul_process_1 = require("../soul/soul-process");
class iLinkBridge {
    static instance;
    clients = new Map(); // context_token -> iLinkClient
    db;
    logger;
    soulManager;
    constructor() {
        this.db = db_1.Database.getInstance();
        this.logger = logger_1.Logger.getInstance();
        this.soulManager = soul_process_1.SoulProcessManager.getInstance();
    }
    static getInstance() {
        if (!iLinkBridge.instance) {
            iLinkBridge.instance = new iLinkBridge();
        }
        return iLinkBridge.instance;
    }
    /**
     * 注册新的 iLink 连接
     */
    async registerContext(contextToken, soulId, botToken) {
        if (this.clients.has(contextToken)) {
            this.logger.warn(`[iLinkBridge] Context ${contextToken} already exists`);
            return this.clients.get(contextToken);
        }
        const client = new ilink_client_1.iLinkClient(botToken, contextToken, soulId);
        // 监听聊天请求，转发到 SoulManager
        client.on('chat_request', async (payload) => {
            try {
                const response = await this.soulManager.handleChat(soulId, {
                    messages: payload.messages,
                });
                await payload.replyCallback(response);
            }
            catch (err) {
                this.logger.error(`[iLinkBridge] Chat forwarding failed:`, err.message);
                await payload.replyCallback('抱歉，服务暂时不可用，请稍后再试。');
            }
        });
        // 监听 token 刷新
        client.on('token_refresh', async (payload) => {
            this.logger.info(`[iLinkBridge] Token refresh for context ${contextToken}`);
        });
        this.clients.set(contextToken, client);
        // 启动长轮询
        client.startPolling().catch(err => {
            this.logger.error(`[iLinkBridge] Polling failed for ${contextToken}:`, err.message);
        });
        // 保存到数据库
        await this.db.query(
            `INSERT INTO ilink_contexts (context_token, soul_id, bot_token, status, created_at)
             VALUES ($1, $2, $3, 'active', NOW())
             ON CONFLICT (context_token) DO UPDATE SET soul_id = $2, bot_token = $3, status = 'active', updated_at = NOW()`,
            [contextToken, soulId, botToken]
        );
        this.logger.info(`[iLinkBridge] Registered context ${contextToken} for soul ${soulId}`);
        return client;
    }
    /**
     * 注销 iLink 连接
     */
    async unregisterContext(contextToken) {
        const client = this.clients.get(contextToken);
        if (client) {
            client.stopPolling();
            this.clients.delete(contextToken);
            this.logger.info(`[iLinkBridge] Context ${contextToken} unregistered, remaining: ${this.clients.size}`);
        }
        await this.db.query(
            `UPDATE ilink_contexts SET status = 'inactive', updated_at = NOW() WHERE context_token = $1`,
            [contextToken]
        );
        this.logger.info(`[iLinkBridge] Unregistered context ${contextToken}`);
    }
    /**
     * 获取所有活跃连接
     */
    getActiveContexts() {
        return Array.from(this.clients.entries()).map(([token, client]) => ({
            contextToken: token,
            soulId: client.soulId,
            botToken: client.botToken,
            pollingActive: client.pollingActive,
        }));
    }
    /**
     * 重启所有连接（服务重启时调用）
     */
    async restartAll() {
        const result = await this.db.query(
            `SELECT context_token, soul_id, bot_token FROM ilink_contexts WHERE status = 'active'`
        );
        for (const row of result.rows) {
            try {
                await this.registerContext(row.context_token, row.soul_id, row.bot_token);
            }
            catch (err) {
                this.logger.error(`[iLinkBridge] Failed to restart context ${row.context_token}:`, err.message);
            }
        }
    }
}
exports.iLinkBridge = iLinkBridge;
//# sourceMappingURL=ilink-bridge.js.map
