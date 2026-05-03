/**
 * =============================================================================
 * 模块名称：渠道适配器基类
 * 功能描述：所有渠道适配器的抽象基类，定义统一接口
 * 技术决策引用：#31 #32
 * 创建日期：2026-04-30
 * 最后修改：2026-04-30
 * =============================================================================
 */
import { Logger } from "../utils/logger";
export interface ChannelMessage {
    id: string;
    fromUserId: string;
    fromUserName?: string;
    content: string;
    type: "text" | "image" | "voice" | "file" | "video";
    timestamp: Date;
    groupId?: string;
    groupName?: string;
    extra?: Record<string, any>;
}
export interface ChannelConfig {
    enabled: boolean;
    appId?: string;
    appSecret?: string;
    token?: string;
    encodingAESKey?: string;
    webhookUrl?: string;
    [key: string]: any;
}
export declare abstract class BaseChannelAdapter {
    protected logger: Logger;
    protected config: ChannelConfig;
    protected isRunning: boolean;
    protected messageHandler?: (msg: ChannelMessage) => void;
    constructor(config: ChannelConfig);
    abstract start(): Promise<void>;
    abstract stop(): Promise<void>;
    abstract sendMessage(toUserId: string, content: string, extra?: any): Promise<boolean>;
    onMessage(handler: (msg: ChannelMessage) => void): void;
    protected emitMessage(msg: ChannelMessage): void;
    get running(): boolean;
}
//# sourceMappingURL=base-adapter.d.ts.map