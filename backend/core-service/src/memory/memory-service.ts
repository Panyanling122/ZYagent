/**
 * =============================================================================
 * 模块名称：记忆系统
 * 功能描述：L1临时窗口/L2日总结/L3知识库，AI驱动聚类
 * 技术决策引用：#41 #42 #43 #44 #45 #46
 * 创建日期：2026-04-30
 * 最后修改：2026-04-30
 * =============================================================================
 */

import { Database } from "../utils/db";
import { Logger } from "../utils/logger";
import { AIGateway } from "../gateway/ai-gateway";

interface L1Message {
  id: string; soul_id: string; role: string; content: string;
  type: string; is_active: boolean; last_active_at: Date; created_at: Date;
}

interface L2Summary {
  id: string; soul_id: string; topic: string; summary: string;
  date: string; message_count: number; created_at: Date;
}

interface L3Knowledge {
  id: string; soul_id: string; topic: string; content: string;
  metadata: any; last_merged_at: Date; created_at: Date; updated_at: Date;
}

export class MemoryService {
  private static instance: MemoryService;
  private db: Database;
  private logger: Logger;
  private gateway: AIGateway;

  private constructor() {
    this.db = Database.getInstance();
    this.logger = Logger.getInstance();
    this.gateway = AIGateway.getInstance();
  }

  static getInstance(): MemoryService {
    if (!MemoryService.instance) MemoryService.instance = new MemoryService();
    return MemoryService.instance;
  }

  // ========== L1: Conversation Context ==========
  async addL1(soulId: string, role: string, content: string, type: string = "text"): Promise<void> {
    await this.db.query(
      `INSERT INTO l1_messages (soul_id, role, content, type, is_active, last_active_at, created_at)
       VALUES ($1, $2, $3, $4, true, NOW(), NOW())`,
      [soulId, role, content, type]
    );
  }

  async getL1Context(soulId: string): Promise<L1Message[]> {
    await this.db.query(
      `UPDATE l1_messages SET is_active = false
       WHERE soul_id = $1 AND is_active = true
       AND last_active_at < NOW() - INTERVAL '5 minutes'`,
      [soulId]
    );
    const result = await this.db.query<L1Message>(
      `SELECT * FROM l1_messages WHERE soul_id = $1 AND is_active = true
       ORDER BY created_at ASC`,
      [soulId]
    );
    return result.rows;
  }

  async refreshL1Activity(soulId: string): Promise<void> {
    await this.db.query(
      `UPDATE l1_messages SET last_active_at = NOW()
       WHERE soul_id = $1 AND is_active = true`,
      [soulId]
    );
  }

  // ========== L2: AI Daily Summary ==========
  async createL2(soulId: string, topic: string, summary: string, date: string, messageCount: number): Promise<void> {
    await this.db.query(
      `INSERT INTO l2_summaries (soul_id, topic, summary, date, message_count, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (soul_id, topic, date) DO UPDATE
       SET summary = EXCLUDED.summary, message_count = EXCLUDED.message_count`,
      [soulId, topic, summary, date, messageCount]
    );
  }

  async getL2BySoul(soulId: string, limit: number = 30): Promise<L2Summary[]> {
    const result = await this.db.query<L2Summary>(
      `SELECT * FROM l2_summaries WHERE soul_id = $1 ORDER BY date DESC LIMIT $2`,
      [soulId, limit]
    );
    return result.rows;
  }

  async getL2ByTopic(soulId: string, topicQuery: string): Promise<L2Summary[]> {
    const result = await this.db.query<L2Summary>(
      `SELECT * FROM l2_summaries WHERE soul_id = $1 AND topic ILIKE $2 ORDER BY date DESC`,
      [soulId, `%${topicQuery}%`]
    );
    return result.rows;
  }

  // ========== L3: Topic Knowledge Base ==========
  async getL3(soulId: string, topic?: string): Promise<L3Knowledge[]> {
    let sql = `SELECT * FROM l3_knowledge WHERE soul_id = $1`;
    const params: any[] = [soulId];
    if (topic) { params.push(`%${topic}%`); sql += ` AND topic ILIKE $${params.length}`; }
    sql += ` ORDER BY updated_at DESC`;
    const result = await this.db.query<L3Knowledge>(sql, params);
    return result.rows;
  }

  async updateL3(soulId: string, topic: string, content: string): Promise<void> {
    await this.db.query(
      `INSERT INTO l3_knowledge (soul_id, topic, content, metadata, last_merged_at, created_at, updated_at)
       VALUES ($1, $2, $3, '{}', NOW(), NOW(), NOW())
       ON CONFLICT (soul_id, topic) DO UPDATE
       SET content = EXCLUDED.content, updated_at = NOW(), last_merged_at = NOW()`,
      [soulId, topic, content]
    );
  }

  async mergeL3(soulId: string, topic: string, newContent: string): Promise<void> {
    const existing = await this.db.query(
      `SELECT content FROM l3_knowledge WHERE soul_id = $1 AND topic = $2`,
      [soulId, topic]
    );
    let merged = newContent;
    if (existing.rows.length > 0) {
      merged = `## Previous Knowledge\n\n${existing.rows[0].content}\n\n---\n\n## New Knowledge\n\n${newContent}`;
    }
    await this.updateL3(soulId, topic, merged);
    this.logger.info(`L3 merged for soul ${soulId}, topic: ${topic}`);
  }

  // ========== AI-Powered Daily Summary ==========
  async runDailySummary(): Promise<void> {
    this.logger.info("Running AI daily summary job...");
    const souls = await this.db.query(`SELECT id FROM souls WHERE status != 'paused'`);
    for (const soul of souls.rows) {
      try {
        await this.summarizeSoulDayAI(soul.id);
      } catch (err: any) {
        this.logger.error(`Daily summary failed for soul ${soul.id}:`, err.message);
      }
    }
  }

  private async summarizeSoulDayAI(soulId: string): Promise<void> {
    const messages = await this.db.query(
      `SELECT role, content FROM messages
       WHERE soul_id = $1 AND created_at > CURRENT_DATE - INTERVAL '1 day'
       ORDER BY created_at LIMIT 500`,
      [soulId]
    );
    if (messages.rows.length === 0) return;

    // Use AI to cluster and summarize
    const conversation = messages.rows.map((m: any, i: number) =>
      `${i + 1}. [${m.role}] ${m.content.substring(0, 200)}`
    ).join("\n");

    const prompt = `Analyze the following conversation and provide:
1. Main topics discussed (2-5 topics)
2. A brief summary for each topic (2-3 sentences)
3. Any action items or decisions made

Format your response as JSON:
{"topics": [{"topic": "Topic Name", "summary": "Brief summary", "messageCount": N}]}

Conversation:
${conversation.substring(0, 4000)}`;

    try {
      const aiResponse = await this.gateway.chat("gpt-4o-mini", [
        { role: "system", content: "You are a conversation analyst. Respond only with valid JSON." },
        { role: "user", content: prompt }
      ]);

      const parsed = JSON.parse(aiResponse.replace(/```json/g, "").replace(/```/g, "").trim());
      if (parsed.topics && Array.isArray(parsed.topics)) {
        for (const t of parsed.topics) {
          await this.createL2(
            soulId,
            t.topic,
            t.summary,
            new Date().toISOString().split("T")[0],
            t.messageCount || 0
          );
        }
        this.logger.info(`AI summarized ${messages.rows.length} messages into ${parsed.topics.length} topics for soul ${soulId}`);
      }
    } catch (err: any) {
      this.logger.warn(`AI summary failed for soul ${soulId}, falling back to keyword: ${err.message}`);
      await this.fallbackSummarize(soulId, messages.rows);
    }
  }

  private async fallbackSummarize(soulId: string, messages: any[]): Promise<void> {
    const topics = this.extractTopics(messages);
    for (const topic of topics) {
      const topicMessages = messages.filter((m: any) =>
        m.content.toLowerCase().includes(topic.toLowerCase())
      );
      const summary = topicMessages.map((m: any) => m.content).join("\n").substring(0, 2000);
      await this.createL2(soulId, topic, summary, new Date().toISOString().split("T")[0], topicMessages.length);
    }
  }

  private extractTopics(messages: any[]): string[] {
    const allText = messages.map((m) => m.content).join(" ");
    const keywords = ["product", "pricing", "technical", "meeting", "question", "help", "bug", "feature"];
    return keywords.filter((kw) => allText.toLowerCase().includes(kw));
  }

  // ========== Weekly L3 Merge ==========
  async runWeeklyMerge(): Promise<void> {
    this.logger.info("Running weekly L3 merge...");
    const souls = await this.db.query(`SELECT id FROM souls WHERE status != 'paused'`);
    for (const soul of souls.rows) {
      try {
        await this.mergeWeeklyToL3(soul.id);
      } catch (err: any) {
        this.logger.error(`Weekly merge failed for soul ${soul.id}:`, err.message);
      }
    }
  }

  private async mergeWeeklyToL3(soulId: string): Promise<void> {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const summaries = await this.db.query(
      `SELECT topic, summary, date FROM l2_summaries
       WHERE soul_id = $1 AND date >= $2
       ORDER BY topic, date DESC`,
      [soulId, weekAgo.toISOString().split("T")[0]]
    );
    if (summaries.rows.length === 0) return;

    // Group by topic
    const topicGroups: Record<string, any[]> = {};
    for (const s of summaries.rows) {
      if (!topicGroups[s.topic]) topicGroups[s.topic] = [];
      topicGroups[s.topic].push(s);
    }

    for (const [topic, items] of Object.entries(topicGroups)) {
      const merged = items.map((i: any) => `### ${i.date}\n${i.summary}`).join("\n\n");
      await this.mergeL3(soulId, topic, merged);
    }
    this.logger.info(`Weekly merge: ${summaries.rows.length} L2 summaries merged into ${Object.keys(topicGroups).length} L3 topics for soul ${soulId}`);
  }
}
