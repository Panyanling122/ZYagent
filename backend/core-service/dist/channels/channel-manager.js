"use strict";
/**
 * =============================================================================
 * 模块名称：渠道管理器
 * 功能描述：渠道注册、消息路由、多渠道广播
 * 技术决策引用：#31 #32 #33
 * 创建日期：2026-04-30
 * 最后修改：2026-04-30
 * =============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChannelManager = void 0;
const wechat_adapter_1 = require("./wechat-adapter");
const feishu_adapter_1 = require("./feishu-adapter");
const logger_1 = require("../utils/logger");
const db_1 = require("../utils/db");
class ChannelManager {
    static instance;
    logger;
    db;
    adapters = new Map();
    messageHandler;
    constructor() {
        this.logger = logger_1.Logger.getInstance();
        this.db = db_1.Database.getInstance();
    }
    static getInstance() {
        if (!ChannelManager.instance)
            ChannelManager.instance = new ChannelManager();
        return ChannelManager.instance;
    }
    async loadFromDB() {
        try {
            const result = await this.db.query("SELECT * FROM channel_configs WHERE is_active = true");
            for (const row of result.rows) {
                const config = {
                    enabled: true,
                    appId: row.app_id,
                    appSecret: row.app_secret,
                    token: row.token,
                    encodingAESKey: row.encoding_aes_key,
                    webhookUrl: row.webhook_url,
                };
                await this.register(row.channel_type, config);
            }
        }
        catch (err) {
            this.logger.warn("[ChannelManager] No channel_configs table or empty:", err.message);
        }
    }
    async register(type, config) {
        let adapter;
        switch (type) {
            case "wechat":
                adapter = new wechat_adapter_1.WechatAdapter(config);
                break;
            case "feishu":
                adapter = new feishu_adapter_1.FeishuAdapter(config);
                break;
            default:
                this.logger.warn(`[ChannelManager] Unknown channel type: ${type}`);
                return;
        }
        adapter.onMessage((msg) => {
            if (this.messageHandler)
                this.messageHandler(msg, type);
        });
        await adapter.start();
        this.adapters.set(type, adapter);
        this.logger.info(`[ChannelManager] Registered channel: ${type}`);
    }
    onMessage(handler) {
        this.messageHandler = handler;
    }
    getAdapter(type) {
        return this.adapters.get(type);
    }
    getActiveChannels() {
        return Array.from(this.adapters.entries())
            .filter(([_, a]) => a.running)
            .map(([type, _]) => type);
    }
    async broadcast(toUserId, content) {
        for (const [type, adapter] of this.adapters) {
            if (adapter.running) {
                await adapter.sendMessage(toUserId, content);
            }
        }
    }
}
exports.ChannelManager = ChannelManager;
//# sourceMappingURL=channel-manager.js.map