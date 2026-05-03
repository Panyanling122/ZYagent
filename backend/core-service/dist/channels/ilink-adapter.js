"use strict";
/**
 * =============================================================================
 * 模块名称：iLink 微信适配器
 * =============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.iLinkAdapter = void 0;
const ilink_client_1 = require("../ilink/ilink-client");
const db_1 = require("../utils/db");
const logger_1 = require("../utils/logger");
const soul_process_1 = require("../soul/soul-process");
class iLinkAdapter {
    static instance;
    clients = new Map();
    db;
    logger;
    soulManager;
    constructor() {
        this.db = db_1.Database.getInstance();
        this.logger = logger_1.Logger.getInstance();
        this.soulManager = soul_process_1.SoulProcessManager.getInstance();
    }
    static getInstance() {
        if (!iLinkAdapter.instance) iLinkAdapter.instance = new iLinkAdapter();
        return iLinkAdapter.instance;
    }
    async initialize() {
        await this.restartAll();
    }
    async sendMessage(to, content) {
        for (const [token, client] of this.clients) {
            if (client.soulId === to.soulId) {
                await client.sendTextMessage(to.chatId, content);
                return;
            }
        }
        throw new Error('No active iLink client for soul ' + to.soulId);
    }
    async handleWebhook(body, headers) {
        return { code: 0 };
    }
    formatMessageForPlatform(content) {
        return content.substring(0, 4000);
    }
    async registerContext(contextToken, soulId, botToken) {
        if (this.clients.has(contextToken)) {
            this.logger.warn(`[iLink] Context ${contextToken} already exists`);
            return this.clients.get(contextToken);
        }
        const client = new ilink_client_1.iLinkClient(botToken, contextToken, soulId);
        client.on('chat_request', async (payload) => {
            try {
                const response = await this.soulManager.handleChat(soulId, { messages: payload.messages });
                await payload.replyCallback(response);
            } catch (err) {
                this.logger.error(`[iLink] Chat failed:`, err.message);
                await payload.replyCallback('抱歉，服务暂时不可用。');
            }
        });
        this.clients.set(contextToken, client);
        client.startPolling().catch(err => {
            this.logger.error(`[iLink] Polling failed:`, err.message);
        });
        await this.db.query(
            `INSERT INTO ilink_contexts (context_token, soul_id, bot_token, status, created_at) VALUES ($1, $2, $3, 'active', NOW())
             ON CONFLICT (context_token) DO UPDATE SET soul_id = $2, bot_token = $3, status = 'active'`,
            [contextToken, soulId, botToken]
        );
        this.logger.info(`[iLink] Registered context ${contextToken} for soul ${soulId}`);
        return client;
    }
    async unregisterContext(contextToken) {
        const client = this.clients.get(contextToken);
        if (client) {
            client.stopPolling();
            this.clients.delete(contextToken);
        }
        await this.db.query(`UPDATE ilink_contexts SET status = 'inactive' WHERE context_token = $1`, [contextToken]);
    }
    getActiveContexts() {
        return Array.from(this.clients.entries()).map(([token, client]) => ({
            contextToken: token, soulId: client.soulId, botToken: client.botToken, pollingActive: client.pollingActive,
        }));
    }
    async restartAll() {
        const result = await this.db.query(`SELECT context_token, soul_id, bot_token FROM ilink_contexts WHERE status = 'active'`);
        for (const row of result.rows) {
            try {
                await this.registerContext(row.context_token, row.soul_id, row.bot_token);
            } catch (err) {
                this.logger.error(`[iLink] Restart failed for ${row.context_token}:`, err.message);
            }
        }
    }
}
exports.iLinkAdapter = iLinkAdapter;
