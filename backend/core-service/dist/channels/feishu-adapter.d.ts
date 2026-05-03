/**
 * =============================================================================
 * 模块名称：飞书适配器
 * 功能描述：飞书Webhook事件接收，Challenge验证，消息转换
 * 技术决策引用：#31 #32 #35
 * 创建日期：2026-04-30
 * 最后修改：2026-04-30
 * =============================================================================
 */
import { BaseChannelAdapter, ChannelConfig } from "./base-adapter";
interface FeishuEvent {
    uuid?: string;
    event?: {
        message?: {
            message_id: string;
            chat_id: string;
            chat_type: string;
            sender?: {
                sender_id?: {
                    open_id: string;
                };
                tenant_key?: string;
            };
            content?: string;
            create_time?: string;
            msg_type?: string;
            mentions?: any[];
        };
        sender?: {
            sender_id?: {
                open_id: string;
            };
            tenant_key?: string;
        };
    };
    header?: {
        event_type?: string;
        token?: string;
        create_time?: string;
    };
    challenge?: string;
}
export declare class FeishuAdapter extends BaseChannelAdapter {
    constructor(config: ChannelConfig);
    start(): Promise<void>;
    stop(): Promise<void>;
    handleWebhook(body: FeishuEvent, signature?: string): Promise<any>;
    sendMessage(toUserId: string, content: string, extra?: any): Promise<boolean>;
    private convertMessage;
}
export {};
//# sourceMappingURL=feishu-adapter.d.ts.map