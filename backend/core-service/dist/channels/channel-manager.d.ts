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
export declare class ChannelManager {
    private static instance;
    private logger;
    private db;
    private adapters;
    private messageHandler?;
    private constructor();
    static getInstance(): ChannelManager;
    loadFromDB(): Promise<void>;
    register(type: string, config: ChannelConfig): Promise<void>;
    onMessage(handler: (msg: ChannelMessage, channel: string) => void): void;
    getAdapter(type: string): BaseChannelAdapter | undefined;
    getActiveChannels(): string[];
    broadcast(toUserId: string, content: string): Promise<void>;
}
//# sourceMappingURL=channel-manager.d.ts.map