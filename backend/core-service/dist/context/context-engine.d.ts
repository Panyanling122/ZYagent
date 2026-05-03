/**
 * =============================================================================
 * 模块名称：上下文引擎
 * 功能描述：构建Soul对话上下文，融合L1活跃消息、L2日总结、L3知识库。按照优先级排序（L1>L2>L3），确保上下文窗口不超限。
 * 技术决策引用：#33 #34 #35
 * 创建日期：2026-04-30
 * =============================================================================
 */
interface ContextMessage {
    role: "user" | "assistant";
    content: string;
    type: string;
    timestamp: Date;
}
export declare class ContextEngine {
    private static instance;
    private config;
    private logger;
    private db;
    private gateway;
    private constructor();
    static getInstance(): ContextEngine;
    addMessage(soulId: string, message: ContextMessage): Promise<void>;
    getContext(soulId: string, maxTokens?: number): Promise<ContextMessage[]>;
    buildPrompt(soulId: string, systemPrompt: string, userMessage: string, memories: string[]): Promise<Array<{
        role: string;
        content: string;
    }>>;
}
export {};
//# sourceMappingURL=context-engine.d.ts.map