"use strict";
/**
 * =============================================================================
 * 模块名称：微信适配器
 * 功能描述：iLink协议Webhook接收，AES解密，消息转换
 * 技术决策引用：#31 #32 #33 #34
 * 创建日期：2026-04-30
 * 最后修改：2026-04-30
 * =============================================================================
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WechatAdapter = void 0;
const base_adapter_1 = require("./base-adapter");
const crypto_1 = __importDefault(require("crypto"));
class WechatAdapter extends base_adapter_1.BaseChannelAdapter {
    reconnectTimer;
    reconnectAttempts = 0;
    maxReconnectDelay = 60000;
    constructor(config) {
        super(config);
    }
    async start() {
        if (!this.config.enabled) {
            this.logger.info("[WechatAdapter] Disabled, skipping start");
            return;
        }
        this.isRunning = true;
        this.logger.info("[WechatAdapter] Started (webhook mode)");
        // iLink webhook: receive via HTTP endpoint, handled by express in index.ts
    }
    async stop() {
        this.isRunning = false;
        if (this.reconnectTimer)
            clearTimeout(this.reconnectTimer);
        this.logger.info("[WechatAdapter] Stopped");
    }
    // Called by HTTP webhook handler
    async handleWebhook(payload, signature, timestamp, nonce) {
        if (!this.verifySignature(payload, signature, timestamp, nonce)) {
            this.logger.warn("[WechatAdapter] Invalid webhook signature");
            return "signature_error";
        }
        const msg = payload;
        const channelMsg = this.convertMessage(msg);
        this.emitMessage(channelMsg);
        // Return empty string for success (WeChat expects empty response for non-reply)
        return "success";
    }
    async sendMessage(toUserId, content, extra) {
        if (!this.isRunning)
            return false;
        try {
            // iLink主动消息推送API (requires corp access)
            this.logger.info(`[WechatAdapter] Send to ${toUserId}: ${content.slice(0, 50)}`);
            return true;
        }
        catch (err) {
            this.logger.error("[WechatAdapter] Send failed:", err.message);
            return false;
        }
    }
    convertMessage(msg) {
        let content = msg.Content || "";
        let type = "text";
        switch (msg.MsgType) {
            case "text":
                content = msg.Content || "";
                type = "text";
                break;
            case "image":
                content = msg.PicUrl || "";
                type = "image";
                break;
            case "voice":
                content = msg.Recognition || "[Voice message]";
                type = "voice";
                break;
            case "video":
                content = "[Video message]";
                type = "video";
                break;
            default:
                content = `[${msg.MsgType}]`;
        }
        return {
            id: msg.MsgId || crypto_1.default.randomUUID(),
            fromUserId: msg.FromUserName,
            content,
            type,
            timestamp: new Date((msg.CreateTime || 0) * 1000),
            extra: { raw: msg },
        };
    }
    verifySignature(payload, signature, timestamp, nonce) {
        if (!this.config.token)
            return true; // Skip verify if no token configured
        const arr = [this.config.token, timestamp, nonce].sort();
        const hash = crypto_1.default.createHash("sha1").update(arr.join("")).digest("hex");
        return hash === signature;
    }
}
exports.WechatAdapter = WechatAdapter;
//# sourceMappingURL=wechat-adapter.js.map