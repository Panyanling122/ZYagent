/**
 * =============================================================================
 * 模块名称：渠道管理器
 * 功能描述：渠道注册、消息路由、多渠道广播
 * 技术决策引用：#31 #32 #33
 * 创建日期：2026-04-30
 * 最后修改：2026-04-30
 * =============================================================================
 */

import { BaseChannelAdapter, ChannelMessage, ChannelConfig } from "./base-adapter";
import { WechatAdapter } from "./wechat-adapter";
import { FeishuAdapter } from "./feishu-adapter";
import { Logger } from "../utils/logger";
import { Database } from "../utils/db";

export class ChannelManager {
  private static instance: ChannelManager;
  private logger: Logger;
  private db: Database;
  private adapters: Map<string, BaseChannelAdapter> = new Map();
  private messageHandler?: (msg: ChannelMessage, channel: string) => void;

  private constructor() {
    this.logger = Logger.getInstance();
    this.db = Database.getInstance();
  }

  static getInstance(): ChannelManager {
    if (!ChannelManager.instance) ChannelManager.instance = new ChannelManager();
    return ChannelManager.instance;
  }

  async loadFromDB(): Promise<void> {
    try {
      const result = await this.db.query("SELECT * FROM channel_configs WHERE is_active = true");
      for (const row of result.rows) {
        const config: ChannelConfig = {
          enabled: true,
          appId: row.app_id,
          appSecret: row.app_secret,
          token: row.token,
          encodingAESKey: row.encoding_aes_key,
          webhookUrl: row.webhook_url,
        };
        await this.register(row.channel_type, config);
      }
    } catch (err: any) {
      this.logger.warn("[ChannelManager] No channel_configs table or empty:", err.message);
    }
  }

  async register(type: string, config: ChannelConfig): Promise<void> {
    let adapter: BaseChannelAdapter;
    switch (type) {
      case "wechat":
        adapter = new WechatAdapter(config);
        break;
      case "feishu":
        adapter = new FeishuAdapter(config);
        break;
      default:
        this.logger.warn(`[ChannelManager] Unknown channel type: ${type}`);
        return;
    }

    adapter.onMessage((msg) => {
      if (this.messageHandler) this.messageHandler(msg, type);
    });

    await adapter.start();
    this.adapters.set(type, adapter);
    this.logger.info(`[ChannelManager] Registered channel: ${type}`);
  }

  onMessage(handler: (msg: ChannelMessage, channel: string) => void): void {
    this.messageHandler = handler;
  }

  getAdapter(type: string): BaseChannelAdapter | undefined {
    return this.adapters.get(type);
  }

  getActiveChannels(): string[] {
    return Array.from(this.adapters.entries())
      .filter(([_, a]) => a.running)
      .map(([type, _]) => type);
  }

  async broadcast(toUserId: string, content: string): Promise<void> {
    for (const [type, adapter] of this.adapters) {
      if (adapter.running) {
        await adapter.sendMessage(toUserId, content);
      }
    }
  }
}
