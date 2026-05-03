/**
 * =============================================================================
 * 模块名称：群通信服务
 * 功能描述：中亿智能体集群群虚拟通信、@触发协作、全局排队60秒超时
 * 技术决策引用：#51 #52 #53 #54 #55
 * 创建日期：2026-04-30
 * 最后修改：2026-04-30
 * =============================================================================
 */
interface GroupData {
    id: string;
    name: string;
    description: string;
    member_soul_ids: string[];
    status: string;
}
interface GroupMessage {
    id: string;
    group_id: string;
    from_soul_id: string;
    to_soul_id: string;
    content: string;
    type: string;
    status: string;
    created_at: Date;
}
export declare class GroupService {
    private static instance;
    private db;
    private logger;
    private config;
    private eventBus;
    private queues;
    private processing;
    private constructor();
    static getInstance(): GroupService;
    getGroups(): Promise<GroupData[]>;
    getGroupMessages(groupId: string, limit?: number): Promise<GroupMessage[]>;
    requestCollaboration(fromSoulId: string, toSoulId: string, groupId: string, content: string, skillName: string): Promise<any>;
    private executeCollaboration;
    private processQueue;
    isBusy(soulId: string): boolean;
    getQueueDepth(soulId: string): number;
}
export {};
//# sourceMappingURL=group-service.d.ts.map