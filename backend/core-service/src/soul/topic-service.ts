/**
 * =============================================================================
 * 模块名称：话题检测与隔离服务（增强版 - TypeScript 源码）
 * 功能描述：Embedding 语义聚类 + LLM 自动子话题命名
 * =============================================================================
 */

import { Database } from '../utils/db';
import { Logger } from '../utils/logger';

export interface TopicDetectResult {
  topic: string;
  isSwitched: boolean;
  reason: string;
  confidence: number;
  cleanContent?: string;
  gapMinutes?: number;
  keywordCategory?: string | null;
}

interface EmbeddingCacheItem {
  topic: string;
  content: string;
  embedding: number[] | null;
  time: number;
}

const TOPIC_KEYWORDS: Record<string, string[]> = {
  work: ['工作', '项目', '任务', '需求', 'bug', '代码', '会议', '周报', '排期', '上线'],
  personal: ['生活', '家庭', '孩子', '父母', '房子', '车', '旅行', '健康', '感情'],
  tech: ['技术', 'AI', '模型', '算法', '架构', '数据库', '前端', '后端', '部署', '优化'],
  finance: ['股票', '基金', '投资', '理财', '赚钱', '房价', '经济', '市场', '汇率'],
  learning: ['学习', '课程', '考试', '证书', '读书', '论文', '研究', '知识点'],
  entertainment: ['电影', '音乐', '游戏', '综艺', '明星', '八卦', '追剧', '小说'],
  shopping: ['买', '购物', '订单', '快递', '退货', '优惠券', '拼多多', '淘宝', '京东'],
  food: ['吃', '饭', '餐厅', '外卖', '菜谱', '火锅', '烧烤', '奶茶', '零食'],
};

const TOPIC_SWITCH_COMMANDS = ['/topic', '/切换话题', '/新话题', '/switch'];
const SESSION_GAP_MINUTES = 10;
const SIMILARITY_KEEP_THRESHOLD = 0.78;
const SIMILARITY_SWITCH_THRESHOLD = 0.55;
const EMBEDDING_CACHE_MAX_SIZE = 30;
const LLM_NAMING_COOLDOWN_MS = 300000;
const LLM_NAMING_MAX_TOKENS = 30;

export class TopicService {
  private static instance: TopicService;
  private db = Database.getInstance();
  private logger = Logger.getInstance();
  private activeTopicCache = new Map<string, string>();
  private cacheTimestamps = new Map<string, number>();
  private cacheExpiryMs = 60000;
  private embeddingCache = new Map<string, EmbeddingCacheItem[]>();
  private llmNamingCooldown = new Map<string, number>();

  private constructor() {
    setInterval(() => this.cleanExpiredCache(), 300000);
  }

  static getInstance(): TopicService {
    if (!TopicService.instance) TopicService.instance = new TopicService();
    return TopicService.instance;
  }

  async detectTopic(userId: string, soulId: string, content: string): Promise<TopicDetectResult> {
    const cacheKey = `${userId}:${soulId}`;
    const now = new Date();

    // 1. 显式指令
    const explicit = this.detectExplicitCommand(content);
    if (explicit) {
      const { newTopic, cleanContent } = explicit;
      await this.switchTopic(userId, soulId, newTopic, content, 'manual');
      this.updateCache(cacheKey, newTopic);
      this.addToEmbeddingCache(userId, soulId, newTopic, cleanContent, null);
      return { topic: newTopic, isSwitched: true, reason: 'explicit_command', confidence: 1.0, cleanContent };
    }

    // 获取上次消息
    const lastMsgResult = await this.db.query(
      `SELECT created_at, topic, content FROM messages WHERE soul_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [soulId, userId]
    );
    const lastMsg = lastMsgResult.rows[0];
    const lastTopic = lastMsg?.topic || 'default';

    // 2. 时间间隔
    if (lastMsg?.created_at) {
      const gapMin = (now.getTime() - new Date(lastMsg.created_at).getTime()) / 60000;
      if (gapMin > SESSION_GAP_MINUTES) {
        this.logger.info(`[Topic] Time gap ${gapMin.toFixed(1)}min for ${cacheKey}`);
        this.embeddingCache.delete(cacheKey);
        return { topic: lastTopic, isSwitched: false, reason: 'time_gap_boundary', confidence: 0.3, gapMinutes: gapMin };
      }
    }

    // 3. 粗粒度关键词
    const keywordCategory = this.detectByKeywords(content);

    // 4. 语义聚类（核心）
    const semantic = await this.detectBySemanticClustering(userId, soulId, content, lastTopic, keywordCategory);
    this.updateCache(cacheKey, semantic.topic);
    if (semantic.isSwitched) {
      await this.switchTopic(userId, soulId, semantic.topic, content, semantic.reason, semantic.confidence);
    }
    return { ...semantic, cleanContent: content, keywordCategory: keywordCategory || null };
  }

  private async detectBySemanticClustering(
    userId: string, soulId: string, content: string, lastTopic: string, keywordCategory: string | null
  ): Promise<{ topic: string; isSwitched: boolean; reason: string; confidence: number }> {
    const cacheKey = `${userId}:${soulId}`;
    const cache = this.embeddingCache.get(cacheKey) || [];

    let currentEmbedding: number[];
    try {
      const { AIGateway } = require('../gateway/ai-gateway');
      const gateway = AIGateway.getInstance();
      currentEmbedding = await gateway.embedding(content);
    } catch (err: any) {
      this.logger.warn(`[Topic] Embedding failed: ${err.message}`);
      if (keywordCategory && keywordCategory !== lastTopic) {
        return { topic: keywordCategory, isSwitched: true, reason: 'keyword_fallback', confidence: 0.5 };
      }
      return { topic: lastTopic, isSwitched: false, reason: 'continue', confidence: 0.4 };
    }

    this.addToEmbeddingCache(userId, soulId, lastTopic, content, currentEmbedding);

    const currentTopicEmbeddings = cache.filter(c => c.topic === lastTopic).slice(-5).map(c => c.embedding).filter(Boolean) as number[][];

    if (currentTopicEmbeddings.length === 0) {
      if (keywordCategory && keywordCategory !== lastTopic && lastTopic === 'default') {
        return { topic: keywordCategory, isSwitched: true, reason: 'keyword_initial', confidence: 0.6 };
      }
      return { topic: lastTopic, isSwitched: false, reason: 'continue', confidence: 0.4 };
    }

    const avgSim = this.calculateAverageSimilarity(currentEmbedding, currentTopicEmbeddings);
    this.logger.info(`[Topic] Semantic sim to "${lastTopic}": ${avgSim.toFixed(3)} (${cacheKey})`);

    if (avgSim >= SIMILARITY_KEEP_THRESHOLD) {
      return { topic: lastTopic, isSwitched: false, reason: 'semantic_continue', confidence: avgSim };
    }

    if (avgSim >= SIMILARITY_SWITCH_THRESHOLD) {
      const allGroups = this.groupEmbeddingsByTopic(cache);
      let bestTopic: string | null = null;
      let bestSim = -1;
      for (const [t, embeddings] of Object.entries(allGroups)) {
        if (t === lastTopic) continue;
        const sim = this.calculateAverageSimilarity(currentEmbedding, embeddings.slice(-5));
        if (sim > bestSim) { bestSim = sim; bestTopic = t; }
      }
      if (bestTopic && bestSim >= SIMILARITY_KEEP_THRESHOLD) {
        this.logger.info(`[Topic] Switch back to "${bestTopic}" (sim=${bestSim.toFixed(3)})`);
        return { topic: bestTopic, isSwitched: true, reason: 'semantic_revisit', confidence: bestSim };
      }
    }

    if (keywordCategory && !this.isSameDomain(keywordCategory, lastTopic) && keywordCategory !== lastTopic) {
      return { topic: keywordCategory, isSwitched: true, reason: 'domain_change', confidence: 0.7 };
    }

    this.logger.info(`[Topic] New sub-topic (sim=${avgSim.toFixed(3)}), LLM naming...`);
    const newName = await this.autoNameTopic(userId, soulId, content, cache, lastTopic);
    return { topic: newName, isSwitched: true, reason: 'semantic_new_topic', confidence: 1 - avgSim };
  }

  private async autoNameTopic(userId: string, soulId: string, content: string, cache: EmbeddingCacheItem[], lastTopic: string): Promise<string> {
    const key = `${userId}:${soulId}`;
    const last = this.llmNamingCooldown.get(key);
    if (last && (Date.now() - last) < LLM_NAMING_COOLDOWN_MS) {
      return this.fallbackTopicName(content, lastTopic);
    }
    try {
      const recent = cache.slice(-3).map(c => c.content);
      const ctx = [...recent, content].join('\n').substring(0, 500);
      const { AIGateway } = require('../gateway/ai-gateway');
      const gateway = AIGateway.getInstance();
      const result = await gateway.chat({
        messages: [
          { role: 'system', content: '你是一个对话主题命名助手。根据用户对话内容，生成一个4-6字的中文话题标签（如"电商重构"、"数据中台"、"小程序迁移"）。只返回标签本身，不要解释、不要标点、不要编号。' },
          { role: 'user', content: `请为以下对话生成简短话题标签：\n${ctx}` }
        ],
        max_tokens: LLM_NAMING_MAX_TOKENS,
        temperature: 0.3,
      });
      let name = result.content.trim().replace(/[，。！？\.\,\!\?\:\;\-\#\*]/g, '').replace(/^(话题|标签|主题)[\s:]*/i, '').substring(0, 32);
      if (!name || name.length < 2) name = this.fallbackTopicName(content, lastTopic);
      this.llmNamingCooldown.set(key, Date.now());
      this.logger.info(`[Topic] LLM named: "${name}" for ${key}`);
      return name;
    } catch (err: any) {
      this.logger.warn(`[Topic] LLM naming failed: ${err.message}`);
      return this.fallbackTopicName(content, lastTopic);
    }
  }

  private fallbackTopicName(content: string, lastTopic: string): string {
    const patterns = [
      /["'"']([^"'"']{2,10})["'"']/g,
      /([A-Z][a-zA-Z0-9]{1,8})/g,
      /([\u4e00-\u9fa5]{2,6}(?:平台|系统|项目|模块|小程序|APP|后台|中台))/g,
    ];
    const entities: string[] = [];
    for (const p of patterns) {
      let m; while ((m = p.exec(content)) !== null) entities.push(m[1]);
    }
    if (entities.length > 0) return entities.slice(0, 2).join('_').substring(0, 32);
    const timeLabel = new Date().toISOString().slice(11, 16).replace(':', '');
    return `${lastTopic !== 'default' ? lastTopic + '_' : ''}${timeLabel}`;
  }

  private detectExplicitCommand(content: string): { newTopic: string; cleanContent: string } | null {
    const trimmed = content.trim();
    for (const cmd of TOPIC_SWITCH_COMMANDS) {
      if (trimmed.toLowerCase().startsWith(cmd.toLowerCase())) {
        const rest = trimmed.substring(cmd.length).trim();
        const newTopic = rest.replace(/[^\w\u4e00-\u9fa5_-]/g, '').substring(0, 32) || 'default';
        const cleanContent = rest.replace(newTopic, '').trim() || rest;
        return { newTopic, cleanContent };
      }
    }
    return null;
  }

  private detectByKeywords(content: string): string | null {
    const scores: Record<string, number> = {};
    for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
      let score = 0;
      for (const kw of keywords) {
        const matches = content.match(new RegExp(kw, 'gi'));
        if (matches) score += matches.length;
      }
      if (score > 0) scores[topic] = score;
    }
    let best: string | null = null, bestScore = 0;
    for (const [t, s] of Object.entries(scores)) {
      if (s > bestScore && s >= 2) { bestScore = s; best = t; }
    }
    return best;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private calculateAverageSimilarity(embedding: number[], history: number[][]): number {
    if (!history || history.length === 0) return 0;
    let total = 0;
    for (const h of history) total += this.cosineSimilarity(embedding, h);
    return total / history.length;
  }

  private groupEmbeddingsByTopic(cache: EmbeddingCacheItem[]): Record<string, number[][]> {
    const groups: Record<string, number[][]> = {};
    for (const item of cache) {
      if (!item.embedding) continue;
      if (!groups[item.topic]) groups[item.topic] = [];
      groups[item.topic].push(item.embedding);
    }
    return groups;
  }

  private isSameDomain(a: string, b: string): boolean {
    const workTopics = Object.keys(TOPIC_KEYWORDS);
    return (workTopics.includes(a) && workTopics.includes(b)) || a === b;
  }

  private addToEmbeddingCache(userId: string, soulId: string, topic: string, content: string, embedding: number[] | null): void {
    const key = `${userId}:${soulId}`;
    let cache = this.embeddingCache.get(key);
    if (!cache) { cache = []; this.embeddingCache.set(key, cache); }
    cache.push({ topic, content, embedding, time: Date.now() });
    if (cache.length > EMBEDDING_CACHE_MAX_SIZE) cache.shift();
  }

  async switchTopic(userId: string, soulId: string, newTopic: string, trigger: string, method: string, confidence = 0.8): Promise<void> {
    const prev = await this.db.query(`SELECT topic FROM messages WHERE soul_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1`, [soulId, userId]);
    const previousTopic = prev.rows[0]?.topic || 'default';
    if (previousTopic === newTopic) return;
    await this.db.query(
      `INSERT INTO topic_transitions (soul_id, user_id, previous_topic, new_topic, trigger_message, detection_method, confidence) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [soulId, userId, previousTopic, newTopic, trigger, method, confidence]
    );
    this.logger.info(`[Topic] ${previousTopic} -> ${newTopic} (${method}, ${confidence.toFixed(2)}) user=${userId}`);
  }

  async getCurrentTopic(userId: string, soulId: string): Promise<string> {
    const key = `${userId}:${soulId}`;
    const cached = this.getCachedTopic(key);
    if (cached) return cached;
    const r = await this.db.query(`SELECT topic FROM messages WHERE soul_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1`, [soulId, userId]);
    const topic = r.rows[0]?.topic || 'default';
    this.updateCache(key, topic);
    return topic;
  }

  async getMessagesByTopic(userId: string, soulId: string, topic: string, limit = 20) {
    const r = await this.db.query(
      `SELECT role, content, created_at FROM messages WHERE soul_id = $1 AND user_id = $2 AND topic = $3 ORDER BY created_at DESC LIMIT $4`,
      [soulId, userId, topic || 'default', limit]
    );
    return r.rows.reverse();
  }

  async getUserTopics(userId: string, soulId: string) {
    const r = await this.db.query(
      `SELECT topic, COUNT(*) as message_count, MAX(created_at) as last_active FROM messages WHERE soul_id = $1 AND user_id = $2 GROUP BY topic ORDER BY last_active DESC`,
      [soulId, userId]
    );
    return r.rows;
  }

  private cleanExpiredCache(): void {
    const now = Date.now();
    for (const [key, ts] of this.cacheTimestamps.entries()) {
      if (now - ts > this.cacheExpiryMs * 5) {
        this.activeTopicCache.delete(key);
        this.cacheTimestamps.delete(key);
      }
    }
    for (const [key, cache] of this.embeddingCache.entries()) {
      const last = cache[cache.length - 1];
      if (last && (now - last.time > 7200000)) this.embeddingCache.delete(key);
    }
  }

  private getCachedTopic(key: string): string | null {
    const ts = this.cacheTimestamps.get(key);
    if (!ts || Date.now() - ts > this.cacheExpiryMs) {
      this.activeTopicCache.delete(key);
      this.cacheTimestamps.delete(key);
      return null;
    }
    return this.activeTopicCache.get(key) || null;
  }

  private updateCache(key: string, topic: string): void {
    this.activeTopicCache.set(key, topic);
    this.cacheTimestamps.set(key, Date.now());
  }
}
