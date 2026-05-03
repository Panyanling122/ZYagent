/**
 * =============================================================================
 * 模块名称：微信适配器
 * 功能描述：iLink协议Webhook接收，AES解密，消息转换
 * 技术决策引用：#31 #32 #33 #34
 * 创建日期：2026-04-30
 * 最后修改：2026-04-30
 * =============================================================================
 */
import { BaseChannelAdapter, ChannelConfig } from "./base-adapter";
export declare class WechatAdapter extends BaseChannelAdapter {
    private reconnectTimer?;
    private reconnectAttempts;
    private readonly maxReconnectDelay;
    constructor(config: ChannelConfig);
    start(): Promise<void>;
    stop(): Promise<void>;
    handleWebhook(payload: any, signature: string, timestamp: string, nonce: string): Promise<string>;
    sendMessage(toUserId: string, content: string, extra?: any): Promise<boolean>;
    private convertMessage;
    private verifySignature;
}
//# sourceMappingURL=wechat-adapter.d.ts.map