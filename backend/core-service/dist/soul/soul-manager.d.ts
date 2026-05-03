/**
 * =============================================================================
 * 模块名称：Soul管理器
 * 功能描述：子进程隔离、自动重启、全局队列调度
 * 技术决策引用：#26 #27 #28 #29 #30
 * 创建日期：2026-04-30
 * 最后修改：2026-04-30
 * =============================================================================
 */
interface SoulData {
    id: string;
    name: string;
    status: string;
    bound_user_id: string | null;
    default_model: string;
    system_prompt: string;
    skills: string[];
    groups: string[];
}
export declare class SoulManager {
    private static instance;
    private souls;
    private db;
    private logger;
    private config;
    private eventBus;
    private soulProcessPath;
    private constructor();
    static getInstance(): SoulManager;
    initialize(): Promise<void>;
    registerSoul(soulData: SoulData): Promise<void>;
    startSoul(soulId: string): Promise<void>;
    stopSoul(soulId: string): Promise<void>;
    sendMessage(soulId: string, message: any): Promise<any>;
    private processQueues;
    private handleSoulMessage;
    getActiveSouls(): string[];
    shutdown(): Promise<void>;
}
export {};
//# sourceMappingURL=soul-manager.d.ts.map