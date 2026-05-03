/**
 * =============================================================================
 * 模块名称：AI Gateway
 * 功能描述：统一大模型调用接口，支持 OpenAI 兼容格式
 * =============================================================================
 */
interface ProviderConfig {
    name: string;
    baseUrl: string;
    apiKey: string;
    realModel: string;
    isBackup: boolean;
}
interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}
interface ChatOptions {
    messages: ChatMessage[];
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
}
interface ChatResponse {
    content: string;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    providerName?: string;
}
declare class AIGateway {
    private http;
    private logger;
    lastUsage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    constructor();
    /**
     * 从数据库加载主 Provider + 备用 Provider
     */
    loadProviders(): Promise<{
        primary: ProviderConfig | null;
        backup: ProviderConfig | null;
    }>;
    /**
     * 统一聊天接口（带自动回退）
     */
    chat(options: ChatOptions): Promise<ChatResponse>;
    private callProvider;
}
export { AIGateway };
export type { ChatOptions, ChatResponse, ChatMessage, ProviderConfig };
//# sourceMappingURL=ai-gateway.d.ts.map