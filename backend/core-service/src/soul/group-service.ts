/**
 * =============================================================================
 * 模块名称：群通信服务
 * 功能描述：中亿智能体集群群虚拟通信、@触发协作、全局排队60秒超时
 * 技术决策引用：#51 #52 #53 #54 #55
 * 创建日期：2026-04-30
 * 最后修改：2026-04-30
 * =============================================================================
 */

import { Database } from "../utils/db";
import { Logger } from "../utils/logger";
import { Config } from "../utils/config";
import { SoulManager } from "./soul-manager";
import { EventBus } from "../events/event-bus";

interface GroupData {
  id: string; name: string; description: string;
  member_soul_ids: string[]; status: string;
}

interface GroupMessage {
  id: string; group_id: string; from_soul_id: string;
  to_soul_id: string; content: string;
  type: string; status: string; created_at: Date;
}

export class GroupService {
  private static instance: GroupService;
  private db: Database;
  private logger: Logger;
  private config: Config;
  private eventBus: EventBus;
  private queues: Map<string, Array<{ content: any; resolve: Function }>> = new Map();
  private processing: Set<string> = new Set();

  private constructor() {
    this.db = Database.getInstance();
    this.logger = Logger.getInstance();
    this.config = Config.getInstance();
    this.eventBus = EventBus.getInstance();
  }

  static getInstance(): GroupService {
    if (!GroupService.instance) GroupService.instance = new GroupService();
    return GroupService.instance;
  }

  async getGroups(): Promise<GroupData[]> {
    const result = await this.db.query<GroupData>(
      `SELECT * FROM groups_table WHERE status = 'active' ORDER BY created_at DESC`
    );
    return result.rows;
  }

  async getGroupMessages(groupId: string, limit: number = 100): Promise<GroupMessage[]> {
    const result = await this.db.query<GroupMessage>(
      `SELECT * FROM group_messages WHERE group_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [groupId, limit]
    );
    return result.rows;
  }

  // @触发协作
  async requestCollaboration(
    fromSoulId: string,
    toSoulId: string,
    groupId: string,
    content: string,
    skillName: string
  ): Promise<any> {
    // Check if toSoulId is already processing
    if (this.processing.has(toSoulId)) {
      // Add to queue
      if (!this.queues.has(toSoulId)) this.queues.set(toSoulId, []);
      const queue = this.queues.get(toSoulId)!;
      if (queue.length >= 50) throw new Error("Queue full for soul " + toSoulId);
      return new Promise((resolve) => {
        queue.push({ content: { fromSoulId, content, skillName }, resolve });
      });
    }

    // Direct execution
    return this.executeCollaboration(fromSoulId, toSoulId, groupId, content, skillName);
  }

  private async executeCollaboration(
    fromSoulId: string,
    toSoulId: string,
    groupId: string,
    content: string,
    skillName: string
  ): Promise<any> {
    this.processing.add(toSoulId);

    // Emit progress
    this.eventBus.emit(`progress:${fromSoulId}`, {
      soulId: toSoulId,
      soulName: skillName,
      status: "processing",
    });

    try {
      // Create group message record
      await this.db.query(
        `INSERT INTO group_messages (group_id, from_soul_id, to_soul_id, content, type, status, created_at)
         VALUES ($1, $2, $3, $4, 'request', 'completed', NOW())`,
        [groupId, fromSoulId, toSoulId, content]
      );

      // 调用目标Soul进行协作处理
      // 发送群协作消息给目标Soul
      const response = await SoulManager.getInstance().sendMessage(toSoulId, { type: "group", message: content, fromSoulId, groupId });

      // Emit completion
      this.eventBus.emit(`progress:${fromSoulId}`, {
        soulId: toSoulId,
        soulName: skillName,
        status: "completed",
      });

      return response;
    } finally {
      this.processing.delete(toSoulId);
      // Process next in queue if any
      this.processQueue(toSoulId, groupId);
    }
  }

  private async processQueue(soulId: string, groupId: string): Promise<void> {
    const queue = this.queues.get(soulId);
    if (!queue || queue.length === 0) return;
    const item = queue.shift()!;
    try {
      const result = await this.executeCollaboration(
        item.content.fromSoulId, soulId, groupId, item.content.content, item.content.skillName
      );
      item.resolve(result);
    } catch (err: any) {
      item.resolve({ error: err.message });
    }
  }

  isBusy(soulId: string): boolean {
    return this.processing.has(soulId);
  }

  getQueueDepth(soulId: string): number {
    return this.queues.get(soulId)?.length || 0;
  }
}

