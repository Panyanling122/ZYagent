/**
 * =============================================================================
 * 模块名称：定时任务调度中心
 * 功能描述：Cron 表达式解析、分布式锁（PostgreSQL advisory lock）、
 *           Skill 定时触发器注册、多渠道任务结果推送
 * 技术决策引用：#90 #91 #92
 * =============================================================================
 */

import { Database } from '../utils/db';
import { Logger } from '../utils/logger';
import { EventBus } from '../events/event-bus';

export interface ScheduledTask {
  id: string;
  name: string;
  cronExpression: string;
  type: 'user' | 'system';
  skillName?: string;
  callbackEndpoint?: string;
  payload?: any;
  soulId?: string;
  pushChannel?: 'desktop' | 'feishu' | 'both';
  isActive: boolean;
  lastRunAt?: Date;
  nextRunAt?: Date;
  createdBy?: string;
}

export interface CronTrigger {
  skillName: string;
  cronExpression: string;
  callback: (context: TaskContext) => Promise<void>;
}

export interface TaskContext {
  taskId: string;
  taskName: string;
  soulId?: string;
  logger: Logger;
  eventBus: EventBus;
}

/** Cron 表达式解析器（简化版，支持标准5段格式） */
export class CronParser {
  /** 解析 Cron 表达式，计算下一次执行时间 */
  static nextRun(cronExpr: string, from: Date = new Date()): Date {
    const parts = cronExpr.trim().split(/\s+/);
    if (parts.length !== 5) throw new Error(`Invalid cron expression: ${cronExpr}, expected 5 parts (m h d M dow)`);
    
    const [minStr, hourStr, dayStr, monthStr, dowStr] = parts;
    let next = new Date(from.getTime() + 60000); // 从下一分钟开始
    next.setSeconds(0, 0);
    
    // 安全检查：最多搜索 4 年
    const maxSearch = new Date(next.getTime() + 4 * 365 * 24 * 3600 * 1000);
    
    while (next <= maxSearch) {
      if (this.matches(next, minStr, hourStr, dayStr, monthStr, dowStr)) {
        return next;
      }
      next.setMinutes(next.getMinutes() + 1);
    }
    throw new Error(`Cannot find next run time for cron: ${cronExpr}`);
  }

  private static matches(d: Date, minStr: string, hourStr: string, dayStr: string, monthStr: string, dowStr: string): boolean {
    return this.fieldMatch(d.getMinutes(), minStr, 0, 59)
      && this.fieldMatch(d.getHours(), hourStr, 0, 23)
      && this.fieldMatch(d.getDate(), dayStr, 1, 31)
      && this.fieldMatch(d.getMonth() + 1, monthStr, 1, 12)
      && this.fieldMatch(d.getDay(), dowStr, 0, 6);
  }

  private static fieldMatch(value: number, expr: string, min: number, max: number): boolean {
    if (expr === '*') return true;
    if (expr === '?') return true;
    // 处理逗号分隔的列表: 1,2,3
    if (expr.includes(',')) {
      return expr.split(',').some(part => this.fieldMatch(value, part.trim(), min, max));
    }
    // 处理范围: 1-5
    if (expr.includes('-')) {
      const [start, end] = expr.split('-').map(Number);
      return value >= start && value <= end;
    }
    // 处理步长: */5
    if (expr.startsWith('*/')) {
      const step = parseInt(expr.slice(2));
      return value % step === 0;
    }
    // 精确值
    return value === parseInt(expr);
  }
}

/** 定时任务服务 */
export class SchedulerService {
  private static instance: SchedulerService;
  private db = Database.getInstance();
  private logger = Logger.getInstance();
  private eventBus = EventBus.getInstance();
  private tasks = new Map<string, ScheduledTask>();
  private skillTriggers = new Map<string, CronTrigger[]>();
  private timer: NodeJS.Timer | null = null;
  private running = false;

  private constructor() {}

  static getInstance(): SchedulerService {
    if (!SchedulerService.instance) SchedulerService.instance = new SchedulerService();
    return SchedulerService.instance;
  }

  initialize(): void {
    this.running = true;
    this.timer = setInterval(() => this.tick(), 30000); // 每 30 秒检查一次
    this.logger.info('[Scheduler] Initialized, tick interval: 30s');
    this.loadTasksFromDB();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.logger.info('[Scheduler] Stopped');
  }

  /** 注册 Skill 定时触发器 */
  registerSkillTrigger(skillName: string, trigger: CronTrigger): void {
    const existing = this.skillTriggers.get(skillName) || [];
    existing.push(trigger);
    this.skillTriggers.set(skillName, existing);
    this.logger.info(`[Scheduler] Skill trigger registered: ${skillName} -> ${trigger.cronExpression}`);
  }

  /** 从数据库加载任务 */
  private async loadTasksFromDB(): Promise<void> {
    try {
      const result = await this.db.query(
        `SELECT id, name, cron_expression, type, skill_name, callback_endpoint, 
                payload, soul_id, push_channel, is_active, last_run_at, next_run_at, created_by
         FROM scheduled_tasks WHERE is_active = true`
      );
      for (const row of result.rows) {
        const task: ScheduledTask = {
          id: row.id,
          name: row.name,
          cronExpression: row.cron_expression,
          type: row.type,
          skillName: row.skill_name,
          callbackEndpoint: row.callback_endpoint,
          payload: row.payload,
          soulId: row.soul_id,
          pushChannel: row.push_channel,
          isActive: row.is_active,
          lastRunAt: row.last_run_at,
          nextRunAt: row.next_run_at,
          createdBy: row.created_by,
        };
        this.tasks.set(task.id, task);
      }
      this.logger.info(`[Scheduler] Loaded ${this.tasks.size} active tasks from DB`);
    } catch (err: any) {
      this.logger.error('[Scheduler] Failed to load tasks:', err.message);
    }
  }

  /** 创建定时任务 */
  async createTask(task: Omit<ScheduledTask, 'id' | 'lastRunAt' | 'nextRunAt'>): Promise<ScheduledTask> {
    const nextRun = CronParser.nextRun(task.cronExpression);
    const result = await this.db.query(
      `INSERT INTO scheduled_tasks (id, name, cron_expression, type, skill_name, callback_endpoint,
        payload, soul_id, push_channel, is_active, next_run_at, created_by, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, true, $9, $10, NOW())
       RETURNING id`,
      [task.name, task.cronExpression, task.type, task.skillName, task.callbackEndpoint,
       JSON.stringify(task.payload), task.soulId, task.pushChannel, nextRun, task.createdBy]
    );
    const newTask: ScheduledTask = { ...task, id: result.rows[0].id, lastRunAt: undefined, nextRunAt: nextRun };
    this.tasks.set(newTask.id, newTask);
    this.logger.info(`[Scheduler] Task created: ${newTask.name} (${newTask.cronExpression}), next run: ${nextRun.toISOString()}`);
    return newTask;
  }

  /** 手动触发任务（仅 system 类型可手动触发） */
  async manualTrigger(taskId: string, triggeredBy: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    if (task.type === 'user') throw new Error('User tasks cannot be manually triggered');
    this.logger.info(`[Scheduler] Manual trigger by ${triggeredBy}: ${task.name}`);
    await this.executeTask(task);
  }

  /** 每秒 tick：检查是否有任务到期 */
  private async tick(): Promise<void> {
    if (!this.running) return;
    const now = new Date();
    for (const [taskId, task] of this.tasks) {
      if (!task.isActive || !task.nextRunAt) continue;
      if (now >= task.nextRunAt) {
        // 尝试获取分布式锁
        const locked = await this.acquireLock(taskId);
        if (!locked) continue; // 其他实例在执行
        try {
          await this.executeTask(task);
          task.lastRunAt = now;
          task.nextRunAt = CronParser.nextRun(task.cronExpression, now);
          await this.db.query(
            `UPDATE scheduled_tasks SET last_run_at = $1, next_run_at = $2 WHERE id = $3`,
            [task.lastRunAt, task.nextRunAt, taskId]
          );
        } catch (err: any) {
          this.logger.error(`[Scheduler] Task ${task.name} failed:`, err.message);
        } finally {
          await this.releaseLock(taskId);
        }
      }
    }
  }

  /** 执行任务 */
  private async executeTask(task: ScheduledTask): Promise<void> {
    this.logger.info(`[Scheduler] Executing task: ${task.name}`);
    const context: TaskContext = {
      taskId: task.id,
      taskName: task.name,
      soulId: task.soulId,
      logger: this.logger,
      eventBus: this.eventBus,
    };

    // Skill 定时触发
    if (task.skillName && task.callbackEndpoint) {
      const triggers = this.skillTriggers.get(task.skillName) || [];
      for (const trigger of triggers) {
        await trigger.callback(context);
      }
    }

    // 内置任务类型
    if (task.name === 'daily_summary') {
      await this.runDailySummary(context);
    } else if (task.name === 'l3_merge') {
      await this.runL3Merge(context);
    } else if (task.name === 'cleanup_files') {
      await this.runFileCleanup(context);
    } else if (task.name === 'cleanup_logs') {
      await this.runLogCleanup(context);
    }

    // 推送执行结果
    if (task.pushChannel) {
      await this.pushResult(task, 'completed');
    }
  }

  /** 分布式锁：PostgreSQL advisory lock */
  private async acquireLock(taskId: string): Promise<boolean> {
    const lockId = this.taskIdToLockId(taskId);
    const result = await this.db.query(`SELECT pg_try_advisory_lock($1) as acquired`, [lockId]);
    return result.rows[0]?.acquired === true;
  }

  private async releaseLock(taskId: string): Promise<void> {
    const lockId = this.taskIdToLockId(taskId);
    await this.db.query(`SELECT pg_advisory_unlock($1)`, [lockId]);
  }

  private taskIdToLockId(taskId: string): number {
    // 将 UUID 哈希为 64 位整数
    let hash = 0;
    for (let i = 0; i < taskId.length; i++) {
      hash = ((hash << 5) - hash) + taskId.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  /** 每日总结任务 */
  private async runDailySummary(ctx: TaskContext): Promise<void> {
    this.logger.info('[Scheduler] Running daily summary generation...');
    this.eventBus.emit('scheduler:daily_summary', { taskId: ctx.taskId, soulId: ctx.soulId });
  }

  /** L3 每周合并任务 */
  private async runL3Merge(ctx: TaskContext): Promise<void> {
    this.logger.info('[Scheduler] Running L3 knowledge merge...');
    this.eventBus.emit('scheduler:l3_merge', { taskId: ctx.taskId, soulId: ctx.soulId });
  }

  /** 文件过期清理 */
  private async runFileCleanup(ctx: TaskContext): Promise<void> {
    this.logger.info('[Scheduler] Running file cleanup...');
    const result = await this.db.query(
      `DELETE FROM uploaded_files WHERE created_at < NOW() - INTERVAL '7 days' RETURNING id`
    );
    this.logger.info(`[Scheduler] Cleaned ${result.rowCount} expired files`);
  }

  /** 日志过期清理 */
  private async runLogCleanup(ctx: TaskContext): Promise<void> {
    this.logger.info('[Scheduler] Running log cleanup...');
    const result = await this.db.query(
      `DELETE FROM system_logs WHERE created_at < NOW() - INTERVAL '90 days' RETURNING id`
    );
    this.logger.info(`[Scheduler] Cleaned ${result.rowCount} expired log entries`);
  }

  /** 多渠道推送任务结果 */
  private async pushResult(task: ScheduledTask, status: string): Promise<void> {
    const channels = task.pushChannel === 'both' ? ['desktop', 'feishu'] : [task.pushChannel!];
    for (const ch of channels) {
      this.eventBus.emit('push:notification', {
        channel: ch,
        title: `定时任务: ${task.name}`,
        body: `执行状态: ${status}`,
        soulId: task.soulId,
      });
    }
  }

  getTasks(): ScheduledTask[] {
    return Array.from(this.tasks.values());
  }

  async deactivateTask(taskId: string): Promise<void> {
    this.tasks.delete(taskId);
    await this.db.query(`UPDATE scheduled_tasks SET is_active = false WHERE id = $1`, [taskId]);
  }
}
