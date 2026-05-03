/**
 * BaseChannelAdapter Unit Tests
 * Tests the abstract base class for channel adapters (WeChat/Feishu/Discord/etc.)
 */
interface ChannelMessage {
    id: string;
    content: string;
    senderId: string;
    senderName: string;
    channelId: string;
    timestamp: number;
    messageType: 'text' | 'image' | 'file' | 'voice';
    attachments?: Array<{
        url: string;
        type: string;
        name: string;
    }>;
}
interface ChannelConfig {
    channelType: string;
    webhookUrl?: string;
    apiKey?: string;
    apiSecret?: string;
    enabled: boolean;
    options?: Record<string, unknown>;
}
interface SendOptions {
    replyToMessageId?: string;
    mentions?: string[];
    markdown?: boolean;
}
declare abstract class BaseChannelAdapter {
    protected config: ChannelConfig;
    protected connected: boolean;
    protected messageHandlers: Array<(msg: ChannelMessage) => void>;
    constructor(config: ChannelConfig);
    abstract connect(): Promise<void>;
    abstract disconnect(): Promise<void>;
    abstract sendMessage(channelId: string, content: string, options?: SendOptions): Promise<{
        messageId: string;
    }>;
    abstract parseIncomingWebhook(payload: Record<string, unknown>): ChannelMessage | null;
    getChannelType(): string;
    isEnabled(): boolean;
    isConnected(): boolean;
    getConfig(): ChannelConfig;
    onMessage(handler: (msg: ChannelMessage) => void): () => void;
    protected emitMessage(message: ChannelMessage): void;
    protected validateConfig(): boolean;
    protected generateMessageId(): string;
    protected sanitizeContent(content: string): string;
    formatMention(userId: string): string;
}
declare class WeChatAdapter extends BaseChannelAdapter {
    private accessToken;
    private tokenRefreshTimer;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    sendMessage(channelId: string, content: string, options?: SendOptions): Promise<{
        messageId: string;
    }>;
    parseIncomingWebhook(payload: Record<string, unknown>): ChannelMessage | null;
    getAccessToken(): string | null;
}
declare class FeishuAdapter extends BaseChannelAdapter {
    private tenantToken;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    sendMessage(channelId: string, content: string, options?: SendOptions): Promise<{
        messageId: string;
    }>;
    parseIncomingWebhook(payload: Record<string, unknown>): ChannelMessage | null;
    formatMention(userId: string): string;
    getTenantToken(): string | null;
}
//# sourceMappingURL=base-adapter.test.d.ts.map