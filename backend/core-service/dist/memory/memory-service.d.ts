/**
 * =============================================================================
 * 模块名称：记忆系统
 * 功能描述：L1临时窗口/L2日总结/L3知识库，AI驱动聚类
 * 技术决策引用：#41 #42 #43 #44 #45 #46
 * 创建日期：2026-04-30
 * 最后修改：2026-04-30
 * =============================================================================
 */
interface L1Message {
    id: string;
    soul_id: string;
    role: string;
    content: string;
    type: string;
    is_active: boolean;
    last_active_at: Date;
    created_at: Date;
}
interface L2Summary {
    id: string;
    soul_id: string;
    topic: string;
    summary: string;
    date: string;
    message_count: number;
    created_at: Date;
}
interface L3Knowledge {
    id: string;
    soul_id: string;
    topic: string;
    content: string;
    metadata: any;
    last_merged_at: Date;
    created_at: Date;
    updated_at: Date;
}
export declare class MemoryService {
    private static instance;
    private db;
    private logger;
    private gateway;
    private constructor();
    static getInstance(): MemoryService;
    addL1(soulId: string, role: string, content: string, type?: string): Promise<void>;
    getL1Context(soulId: string): Promise<L1Message[]>;
    refreshL1Activity(soulId: string): Promise<void>;
    createL2(soulId: string, topic: string, summary: string, date: string, messageCount: number): Promise<void>;
    getL2BySoul(soulId: string, limit?: number): Promise<L2Summary[]>;
    getL2ByTopic(soulId: string, topicQuery: string): Promise<L2Summary[]>;
    getL3(soulId: string, topic?: string): Promise<L3Knowledge[]>;
    updateL3(soulId: string, topic: string, content: string): Promise<void>;
    mergeL3(soulId: string, topic: string, newContent: string): Promise<void>;
    runDailySummary(): Promise<void>;
    private summarizeSoulDayAI;
    private fallbackSummarize;
    private extractTopics;
    runWeeklyMerge(): Promise<void>;
    private mergeWeeklyToL3;
}
export {};
//# sourceMappingURL=memory-service.d.ts.map