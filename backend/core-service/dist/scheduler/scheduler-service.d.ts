/**
 * =============================================================================
 * 模块名称：调度器服务
 * 功能描述：定时任务管理 - L2日总结、L3周合并、Token日统计
 * 技术决策引用：#41 #42 #43 #88 #89 #90
 * 创建日期：2026-04-30
 * =============================================================================
 */
export declare class SchedulerService {
    private static instance;
    private config;
    private logger;
    private db;
    private memory;
    private eventBus;
    private jobs;
    private isRunning;
    private constructor();
    static getInstance(): SchedulerService;
    /**
     * 初始化调度器 - 加载系统级定时任务
     * 1. L2每日总结（默认凌晨3点）
     * 2. L3每周合并（默认周日0点）
     * 3. Token日统计（每天0点）
     * 4. 数据库中用户自定义任务
     */
    initialize(): Promise<void>;
    /** 加载数据库中的用户自定义定时任务 */
    private loadUserTasks;
    /** 执行用户自定义任务 - 带分布式锁防止重复执行 */
    private executeUserTask;
    /** L2每日总结 - 决策#42：调用MemoryService的AI总结功能 */
    private runDailySummary;
    /** L3每周合并 - 决策#43：调用MemoryService的L2→L3合并 */
    private runWeeklyMerge;
    /** Token日统计 - 决策#90：统计昨日Token消耗 */
    private runTokenDailyStats;
    /** 手动触发任务（供API调用） */
    triggerTask(taskName: string): Promise<boolean>;
    /** 获取所有定时任务状态 */
    getTaskStatus(): Array<{
        name: string;
        nextRun: Date | null;
    }>;
    /** 停止所有定时任务 */
    stop(): void;
    /** 将cron表达式解析为node-schedule规则 */
    private parseCronToRule;
}
//# sourceMappingURL=scheduler-service.d.ts.map