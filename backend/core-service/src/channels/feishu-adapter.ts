/**
 * =============================================================================
 * 模块名称：飞书适配器
 * 功能描述：飞书Webhook事件接收，Challenge验证，消息转换
 * 技术决策引用：#31 #32 #35
 * 创建日期：2026-04-30
 * 最后修改：2026-04-30
 * =============================================================================
 */

import { BaseChannelAdapter, ChannelMessage, ChannelConfig } from "./base-adapter";
import crypto from "crypto";

interface FeishuEvent {
  uuid?: string;
  event?: {
    message?: {
      message_id: string;
      chat_id: string;
      chat_type: string;
      sender?: { sender_id?: { open_id: string }; tenant_key?: string };
      content?: string;
      create_time?: string;
      msg_type?: string;
      mentions?: any[];
    };
    sender?: { sender_id?: { open_id: string }; tenant_key?: string };
  };
  header?: { event_type?: string; token?: string; create_time?: string };
  challenge?: string;
}

export class FeishuAdapter extends BaseChannelAdapter {
  constructor(config: ChannelConfig) {
    super(config);
  }

  async start(): Promise<void> {
    if (!this.config.enabled) {
      this.logger.info("[FeishuAdapter] Disabled, skipping start");
      return;
    }
    this.isRunning = true;
    this.logger.info("[FeishuAdapter] Started (webhook mode)");
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.logger.info("[FeishuAdapter] Stopped");
  }

  // Handle Feishu challenge verification and events
  async handleWebhook(body: FeishuEvent, signature?: string): Promise<any> {
    // Challenge verification for URL config
    if (body.challenge) {
      return { challenge: body.challenge };
    }

    const event = body.event;
    if (!event?.message) return { code: 0 };

    const msg = event.message;
    const channelMsg = this.convertMessage(msg);
    this.emitMessage(channelMsg);

    return { code: 0 };
  }

  async sendMessage(toUserId: string, content: string, extra?: any): Promise<boolean> {
    if (!this.isRunning) return false;
    try {
      this.logger.info(`[FeishuAdapter] Send to ${toUserId}: ${content.slice(0, 50)}`);
      return true;
    } catch (err: any) {
      this.logger.error("[FeishuAdapter] Send failed:", err.message);
      return false;
    }
  }

  private convertMessage(msg: any): ChannelMessage {
    let content = "";
    let type: ChannelMessage["type"] = "text";

    try {
      const parsed = JSON.parse(msg.content || "{}");
      content = parsed.text || JSON.stringify(parsed);
    } catch {
      content = msg.content || "";
    }

    switch (msg.msg_type) {
      case "image": type = "image"; content = "[Image]"; break;
      case "audio": type = "voice"; content = "[Voice]"; break;
      case "file": type = "file"; content = "[File]"; break;
      case "video": type = "video"; content = "[Video]"; break;
      default: type = "text";
    }

    const senderId = msg.sender?.sender_id?.open_id || "unknown";

    return {
      id: msg.message_id || crypto.randomUUID(),
      fromUserId: senderId,
      content,
      type,
      timestamp: new Date(parseInt(msg.create_time || "0")),
      groupId: msg.chat_id,
      extra: { raw: msg },
    };
  }
}
