"use strict";
/**
 * =============================================================================
 * 模块名称：渠道优先级路由
 * 功能描述：桌面端优先 > 微信 > 飞书，消息去重
 * =============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChannelRouter = void 0;
const logger_1 = require("./logger");
const event_bus_1 = require("../events/event-bus");
// 渠道优先级：数字越小优先级越高
const CHANNEL_PRIORITY = {
    desktop: 1,
    wechat: 2,
    feishu: 3,
};
// 消息去重窗口（毫秒）
const DEDUP_WINDOW_MS = 5000;
class ChannelRouter {
    static instance;
    logger;
    eventBus;
    // 最近已路由的消息指纹：Set<`${userId}:${contentHash}:${timestamp}`>
    recentMessages = new Set();
    constructor() {
        this.logger = logger_1.Logger.getInstance();
        this.eventBus = event_bus_1.EventBus.getInstance();
        // 每10秒清理过期指纹
        setInterval(() => this.recentMessages.clear(), DEDUP_WINDOW_MS * 2);
    }
    static getInstance() {
        if (!ChannelRouter.instance)
            ChannelRouter.instance = new ChannelRouter();
        return ChannelRouter.instance;
    }
    /**
     * 路由消息：选择最佳渠道
     */
    async route(userId, content, options = {}) {
        const channels = await this.getUserChannels(userId);
        if (channels.length === 0) {
            this.logger.warn(`[ChannelRouter] No channels for user ${userId}`);
            return null;
        }
        // 按优先级排序
        channels.sort((a, b) => (CHANNEL_PRIORITY[a] || 99) - (CHANNEL_PRIORITY[b] || 99));
        // 去重检查
        const fingerprint = `${userId}:${this.hashContent(content)}`;
        if (this.recentMessages.has(fingerprint)) {
            this.logger.info(`[ChannelRouter] Duplicate message dropped for ${userId}`);
            return null;
        }
        this.recentMessages.add(fingerprint);
        // 选择最高优先级渠道
        const selectedChannel = channels[0];
        this.logger.info(`[ChannelRouter] Routed to ${selectedChannel} (priority ${CHANNEL_PRIORITY[selectedChannel]}) for user ${userId}`);
        return selectedChannel;
    }
    /**
     * 获取用户活跃渠道
     */
    async getUserChannels(userId) {
        try {
            const db = await import('./db');
            const result = await db.Database.getInstance().query(`SELECT channel FROM user_channels WHERE user_id = $1 AND is_active = true`, [userId]);
            return result.rows.map(r => r.channel);
        }
        catch {
            return ['desktop']; // 默认桌面端
        }
    }
    hashContent(content) {
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            hash = ((hash << 5) - hash) + content.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash).toString(36);
    }
}
exports.ChannelRouter = ChannelRouter;
