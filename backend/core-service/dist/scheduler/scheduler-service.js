"use strict";
/**
 * =============================================================================
 * 模块名称：调度器服务
 * 功能描述：定时任务管理 - L2日总结、L3周合并、Token日统计
 * 技术决策引用：#41 #42 #43 #88 #89 #90
 * 创建日期：2026-04-30
 * =============================================================================
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchedulerService = void 0;
const node_schedule_1 = __importDefault(require("node-schedule"));
const config_1 = require("../utils/config");
const logger_1 = require("../utils/logger");
const db_1 = require("../utils/db");
const memory_service_1 = require("../memory/memory-service");
const event_bus_1 = require("../events/event-bus");
class SchedulerService {
    static instance;
    config;
    logger;
    db;
    memory;
    eventBus;
    jobs = new Map();
    isRunning = false;
    constructor() {
        this.config = config_1.Config.getInstance();
        this.logger = logger_1.Logger.getInstance();
        this.db = db_1.Database.getInstance();
        this.memory = memory_service_1.MemoryService.getInstance();
        this.eventBus = event_bus_1.EventBus.getInstance();
    }
    static getInstance() {
        if (!SchedulerService.instance)
            SchedulerService.instance = new SchedulerService();
        return SchedulerService.instance;
    }
    /**
     * 初始化调度器 - 加载系统级定时任务
     * 1. L2每日总结（默认凌晨3点）
     * 2. L3每周合并（默认周日0点）
     * 3. Token日统计（每天0点）
     * 4. 数据库中用户自定义任务
     */
    async initialize() {
        if (this.isRunning)
            return;
        this.isRunning = true;
        // 1. L2每日总结 - 决策#42
        const summaryRule = this.parseCronToRule(this.config.dailySummaryTime);
        if (summaryRule) {
            const job = node_schedule_1.default.scheduleJob("daily-summary", summaryRule, () => this.runDailySummary());
            this.jobs.set("daily-summary", job);
            this.logger.info(`定时任务已注册: 每日L2总结 (${this.config.dailySummaryTime})`);
        }
        // 2. L3每周合并 - 决策#43
        const weeklyJob = node_schedule_1.default.scheduleJob("weekly-merge", { hour: 0, minute: 0, dayOfWeek: 0 }, () => this.runWeeklyMerge());
        this.jobs.set("weekly-merge", weeklyJob);
        this.logger.info("定时任务已注册: 每周L3合并 (周日00:00)");
        // 3. Token日统计 - 决策#90
        const tokenJob = node_schedule_1.default.scheduleJob("token-daily", { hour: 0, minute: 5 }, () => this.runTokenDailyStats());
        this.jobs.set("token-daily", tokenJob);
        this.logger.info("定时任务已注册: Token日统计 (00:05)");
        // 4. 数据库中的用户自定义任务
        await this.loadUserTasks();
        this.logger.info(`调度器初始化完成，共 ${this.jobs.size} 个定时任务`);
    }
    /** 加载数据库中的用户自定义定时任务 */
    async loadUserTasks() {
        try {
            const result = await this.db.query(`SELECT * FROM scheduled_tasks WHERE is_active = true`);
            for (const task of result.rows) {
                const rule = this.parseCronToRule(task.cron);
                if (!rule) {
                    this.logger.warn(`无效cron表达式: ${task.cron} (任务ID: ${task.id})`);
                    continue;
                }
                const job = node_schedule_1.default.scheduleJob(`user-${task.id}`, rule, () => this.executeUserTask(task));
                this.jobs.set(`user-${task.id}`, job);
                this.logger.info(`用户任务已加载: ${task.description} (${task.cron})`);
            }
        }
        catch (err) {
            this.logger.error("加载用户任务失败:", err.message);
        }
    }
    /** 执行用户自定义任务 - 带分布式锁防止重复执行 */
    async executeUserTask(task) {
        const lockKey = `task_${task.id}`;
        try {
            // 获取分布式锁（PostgreSQL advisory lock）
            const lockResult = await this.db.query(`SELECT pg_try_advisory_lock(hashtext($1)) as acquired`, [lockKey]);
            if (!lockResult.rows[0].acquired) {
                this.logger.warn(`任务已在其他实例执行: ${task.description}`);
                return;
            }
            this.logger.info(`执行任务: ${task.description}`);
            await this.db.query(`UPDATE scheduled_tasks SET last_run_at = NOW() WHERE id = $1`, [task.id]);
            // 如果关联了Skill，通过事件总线触发
            if (task.skillId) {
                // 通过事件总线触发Skill执行
                this.eventBus.emit(`skill:${task.soulId}`, {
                    type: "skill", skillName: task.skillId, soulId: task.soulId, message: task.description,
                });
                this.logger.info(`已触发Skill: skill:${task.soulId} -> ${task.skillId}`);
            }
            this.logger.info(`任务完成: ${task.description}`);
        }
        catch (err) {
            this.logger.error(`任务失败: ${task.description}:`, err.message);
        }
        finally {
            await this.db.query(`SELECT pg_advisory_unlock(hashtext($1))`, [lockKey]).catch(() => { });
        }
    }
    /** L2每日总结 - 决策#42：调用MemoryService的AI总结功能 */
    async runDailySummary() {
        this.logger.info("========== 开始每日L2总结 ==========");
        try {
            await this.memory.runDailySummary();
            this.logger.info("每日L2总结完成");
        }
        catch (err) {
            this.logger.error("每日L2总结失败:", err.message);
        }
    }
    /** L3每周合并 - 决策#43：调用MemoryService的L2→L3合并 */
    async runWeeklyMerge() {
        this.logger.info("========== 开始每周L3合并 ==========");
        try {
            await this.memory.runWeeklyMerge();
            this.logger.info("每周L3合并完成");
        }
        catch (err) {
            this.logger.error("每周L3合并失败:", err.message);
        }
    }
    /** Token日统计 - 决策#90：统计昨日Token消耗 */
    async runTokenDailyStats() {
        this.logger.info("========== 开始Token日统计 ==========");
        try {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const dateStr = yesterday.toISOString().split("T")[0];
            const stats = await this.db.query(`SELECT soul_id, model, SUM(prompt_tokens) as total_in, SUM(completion_tokens) as total_out, COUNT(*) as request_count
         FROM token_usage WHERE DATE(created_at) = $1
         GROUP BY soul_id, model`, [dateStr]);
            if (stats.rows.length === 0) {
                this.logger.info(`昨日(${dateStr})无Token使用记录`);
                return;
            }
            let totalTokens = 0;
            for (const row of stats.rows) {
                const dayTotal = parseInt(row.total_in || 0) + parseInt(row.total_out || 0);
                totalTokens += dayTotal;
                this.logger.info(`  Soul ${row.soul_id} | Model ${row.model} | In:${row.total_in} Out:${row.total_out} | ${dayTotal} tokens`);
            }
            // 写入日统计表
            await this.db.query(`INSERT INTO token_daily_stats (date, total_tokens, total_requests, created_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (date) DO UPDATE SET total_tokens = EXCLUDED.total_tokens, total_requests = EXCLUDED.total_requests`, [dateStr, totalTokens, stats.rows.reduce((sum, r) => sum + parseInt(r.request_count), 0)]);
            // 检查是否超过日限额
            if (totalTokens > this.config.tokenDailyLimit) {
                this.logger.warn(`⚠️ 昨日Token消耗(${totalTokens})超过日限额(${this.config.tokenDailyLimit})!`);
                await this.db.query(`INSERT INTO alerts (type, severity, message, created_at)
           VALUES ('token_limit', 'warning', $1, NOW())`, [`昨日Token消耗${totalTokens}，超过限额${this.config.tokenDailyLimit}`]);
            }
            else {
                this.logger.info(`昨日Token消耗: ${totalTokens} / ${this.config.tokenDailyLimit}`);
            }
        }
        catch (err) {
            this.logger.error("Token日统计失败:", err.message);
        }
    }
    /** 手动触发任务（供API调用） */
    async triggerTask(taskName) {
        switch (taskName) {
            case "daily-summary":
                await this.runDailySummary();
                return true;
            case "weekly-merge":
                await this.runWeeklyMerge();
                return true;
            case "token-daily":
                await this.runTokenDailyStats();
                return true;
            default:
                this.logger.warn(`未知任务: ${taskName}`);
                return false;
        }
    }
    /** 获取所有定时任务状态 */
    getTaskStatus() {
        const status = [];
        for (const [name, job] of this.jobs) {
            status.push({ name, nextRun: job.nextInvocation() });
        }
        return status;
    }
    /** 停止所有定时任务 */
    stop() {
        for (const [name, job] of this.jobs) {
            job.cancel();
            this.logger.info(`定时任务已取消: ${name}`);
        }
        this.jobs.clear();
        this.isRunning = false;
        this.logger.info("调度器已停止");
    }
    /** 将cron表达式解析为node-schedule规则 */
    parseCronToRule(cronExpr) {
        // 简单cron解析: "分 时 * * *" 格式
        const parts = cronExpr.split(" ");
        if (parts.length < 2)
            return null;
        const minute = parseInt(parts[0]) || 0;
        const hour = parseInt(parts[1]) || 0;
        const rule = new node_schedule_1.default.RecurrenceRule();
        rule.hour = hour;
        rule.minute = minute;
        return rule;
    }
}
exports.SchedulerService = SchedulerService;
//# sourceMappingURL=scheduler-service.js.map