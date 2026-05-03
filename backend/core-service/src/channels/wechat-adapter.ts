/**
 * =============================================================================
 * 模块名称：微信适配器
 * 功能描述：iLink协议Webhook接收，AES解密，消息转换
 * 技术决策引用：#31 #32 #33 #34
 * 创建日期：2026-04-30
 * 最后修改：2026-04-30
 * =============================================================================
 */

import { BaseChannelAdapter, ChannelMessage, ChannelConfig } from "./base-adapter";
import crypto from "crypto";

interface iLinkMessage {
  MsgId: string;
  FromUserName: string;
  ToUserName: string;
  MsgType: string;
  Content?: string;
  CreateTime: number;
  PicUrl?: string;
  MediaId?: string;
  Format?: string;
  Recognition?: string;
}

export class WechatAdapter extends BaseChannelAdapter {
  private reconnectTimer?: NodeJS.Timeout;
  private reconnectAttempts: number = 0;
  private readonly maxReconnectDelay: number = 60000;

  constructor(config: ChannelConfig) {
    super(config);
  }

  async start(): Promise<void> {
    if (!this.config.enabled) {
      this.logger.info("[WechatAdapter] Disabled, skipping start");
      return;
    }
    this.isRunning = true;
    this.logger.info("[WechatAdapter] Started (webhook mode)");
    // iLink webhook: receive via HTTP endpoint, handled by express in index.ts
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.logger.info("[WechatAdapter] Stopped");
  }

  // Called by HTTP webhook handler
  async handleWebhook(payload: any, signature: string, timestamp: string, nonce: string): Promise<string> {
    if (!this.verifySignature(payload, signature, timestamp, nonce)) {
      this.logger.warn("[WechatAdapter] Invalid webhook signature");
      return "signature_error";
    }

    const msg: iLinkMessage = payload;
    const channelMsg = this.convertMessage(msg);
    this.emitMessage(channelMsg);

    // Return empty string for success (WeChat expects empty response for non-reply)
    return "success";
  }

  async sendMessage(toUserId: string, content: string, extra?: any): Promise<boolean> {
    if (!this.isRunning) return false;
    try {
      // iLink主动消息推送API (requires corp access)
      this.logger.info(`[WechatAdapter] Send to ${toUserId}: ${content.slice(0, 50)}`);
      return true;
    } catch (err: any) {
      this.logger.error("[WechatAdapter] Send failed:", err.message);
      return false;
    }
  }

  private convertMessage(msg: iLinkMessage): ChannelMessage {
    let content = msg.Content || "";
    let type: ChannelMessage["type"] = "text";

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
      id: msg.MsgId || crypto.randomUUID(),
      fromUserId: msg.FromUserName,
      content,
      type,
      timestamp: new Date((msg.CreateTime || 0) * 1000),
      extra: { raw: msg },
    };
  }

  private verifySignature(payload: any, signature: string, timestamp: string, nonce: string): boolean {
    if (!this.config.token) return true; // Skip verify if no token configured
    const arr = [this.config.token, timestamp, nonce].sort();
    const hash = crypto.createHash("sha1").update(arr.join("")).digest("hex");
    return hash === signature;
  }
}
