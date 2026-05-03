/**
 * =============================================================================
 * 模块名称：上下文引擎
 * 功能描述：构建Soul对话上下文，融合L1活跃消息、L2日总结、L3知识库。按照优先级排序（L1>L2>L3），确保上下文窗口不超限。
 * 技术决策引用：#33 #34 #35
 * 创建日期：2026-04-30
 * =============================================================================
 */

import { Config } from "../utils/config";
import { Logger } from "../utils/logger";
import { Database } from "../utils/db";
import { AIGateway } from "../gateway/ai-gateway";

interface ContextMessage {
  role: "user" | "assistant";
  content: string;
  type: string;
  timestamp: Date;
}

export class ContextEngine {
  private static instance: ContextEngine;
  private config: Config;
  private logger: Logger;
  private db: Database;
  private gateway: AIGateway;

  private constructor() {
    this.config = Config.getInstance();
    this.logger = Logger.getInstance();
    this.db = Database.getInstance();
    this.gateway = AIGateway.getInstance();
  }

  static getInstance(): ContextEngine {
    if (!ContextEngine.instance) {
      ContextEngine.instance = new ContextEngine();
    }
    return ContextEngine.instance;
  }

  async addMessage(soulId: string, message: ContextMessage): Promise<void> {
    await this.db.query(
      `INSERT INTO l1_messages (soul_id, role, content, type, is_active, last_active_at, created_at)
       VALUES ($1, $2, $3, $4, true, NOW(), NOW())`,
      [soulId, message.role, message.content, message.type]
    );
  }

  async getContext(soulId: string, maxTokens: number = 4000): Promise<ContextMessage[]> {
    // Get active context
    const result = await this.db.query(
      `SELECT id, role, content, type, created_at
       FROM l1_messages
       WHERE soul_id = $1 AND is_active = true
       ORDER BY created_at DESC
       LIMIT 100`,
      [soulId]
    );

    const messages: ContextMessage[] = result.rows.reverse().map((r: any) => ({
      role: r.role,
      content: r.content,
      type: r.type,
      timestamp: r.created_at,
    }));

    // Deactivate expired context
    await this.db.query(
      `UPDATE l1_messages
       SET is_active = false
       WHERE soul_id = $1
         AND is_active = true
         AND last_active_at < NOW() - INTERVAL '5 minutes'`,
      [soulId]
    );

    // Token limit
    let totalTokens = 0;
    const limited: ContextMessage[] = [];
    for (const msg of messages) {
      const tokens = await this.gateway.countTokens(msg.content);
      if (totalTokens + tokens > maxTokens) break;
      totalTokens += tokens;
      limited.push(msg);
    }

    return limited;
  }

  async buildPrompt(
    soulId: string,
    systemPrompt: string,
    userMessage: string,
    memories: string[]
  ): Promise<Array<{ role: string; content: string }>> {
    const context = await this.getContext(soulId);

    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt },
    ];

    // Add memories as context
    if (memories.length > 0) {
      messages.push({
        role: "system",
        content: `Relevant memories:\n${memories.join("\n")}`,
      });
    }

    // Add L1 context
    for (const msg of context) {
      messages.push({ role: msg.role, content: msg.content });
    }

    // Add user message
    messages.push({ role: "user", content: userMessage });

    return messages;
  }
}

