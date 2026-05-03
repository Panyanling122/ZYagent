"use strict";
/**
 * =============================================================================
 * 模块名称：话题检测与隔离服务（增强版）
 * 功能描述：解决多话题上下文污染问题，支持同一领域内的多项目隔离
 *   - 显式话题切换指令检测
 *   - 时间间隔自动分话题 (10分钟)
 *   - 关键词匹配（粗粒度领域提示）
 *   - Embedding 语义聚类（细粒度子话题隔离）
 *   - LLM 自动子话题命名
 * 技术决策引用：话题隔离 #120
 * 创建日期：2026-05-03
 * =============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TopicService = void 0;
const db_1 = require("../utils/db");
const logger_1 = require("../utils/logger");
// 预设话题关键词库（粗粒度领域，仅作辅助参考）
const TOPIC_KEYWORDS = {
    'work': ['工作', '项目', '任务', '需求', 'bug', '代码', '会议', '周报', '排期', '上线'],
    'personal': ['生活', '家庭', '孩子', '父母', '房子', '车', '旅行', '健康', '感情'],
    'tech': ['技术', 'AI', '模型', '算法', '架构', '数据库', '前端', '后端', '部署', '优化'],
    'finance': ['股票', '基金', '投资', '理财', '赚钱', '房价', '经济', '市场', '汇率'],
    'learning': ['学习', '课程', '考试', '证书', '读书', '论文', '研究', '知识点'],
    'entertainment': ['电影', '音乐', '游戏', '综艺', '明星', '八卦', '追剧', '小说'],
    'shopping': ['买', '购物', '订单', '快递', '退货', '优惠券', '拼多多', '淘宝', '京东'],
    'food': ['吃', '饭', '餐厅', '外卖', '菜谱', '火锅', '烧烤', '奶茶', '零食'],
};
const TOPIC_SWITCH_COMMANDS = ['/topic', '/切换话题', '/新话题', '/switch'];
const SESSION_GAP_MINUTES = 10;
// 语义聚类阈值
const SIMILARITY_KEEP_THRESHOLD = 0.78;     // ≥ 此值：保持当前子话题
const SIMILARITY_SWITCH_THRESHOLD = 0.55;     // < 此值：创建新子话题或切换历史话题
const EMBEDDING_CACHE_MAX_SIZE = 30;         // 每个用户-Soul 组合最多缓存 30 条消息
const LLM_NAMING_COOLDOWN_MS = 300000;       // 5分钟内同一用户最多触发1次LLM命名
const LLM_NAMING_MAX_TOKENS = 30;
class TopicService {
    static instance;
    db;
    logger;
    // 内存缓存当前活跃话题
    activeTopicCache = new Map(); // key: `${userId}:${soulId}`
    cacheExpiryMs = 60000;
    cacheTimestamps = new Map();
    // Embedding 语义缓存：key = `${userId}:${soulId}`, value = Array<{topic, content, embedding, time}>
    embeddingCache = new Map();
    // LLM 命名冷却记录：key = `${userId}:${soulId}`
    llmNamingCooldown = new Map();
    constructor() {
        this.db = db_1.Database.getInstance();
        this.logger = logger_1.Logger.getInstance();
        // 每5分钟清理过期缓存
        setInterval(() => this.cleanExpiredCache(), 300000);
    }
    static getInstance() {
        if (!TopicService.instance) {
            TopicService.instance = new TopicService();
        }
        return TopicService.instance;
    }
    /**
     * 检测当前消息所属子话题（增强版）
     * 返回: { topic, isSwitched, reason, confidence, cleanContent }
     */
    async detectTopic(userId, soulId, content, options = {}) {
        const cacheKey = `${userId}:${soulId}`;
        const now = new Date();
        // 1. 显式话题切换指令检测（最高优先级）
        const explicitResult = this.detectExplicitCommand(content);
        if (explicitResult) {
            const { newTopic, cleanContent } = explicitResult;
            await this.switchTopic(userId, soulId, newTopic, content, 'manual');
            this.updateCache(cacheKey, newTopic);
            // 将显式指令创建的话题加入 embedding 缓存
            this.addToEmbeddingCache(userId, soulId, newTopic, cleanContent, null);
            return { topic: newTopic, isSwitched: true, reason: 'explicit_command', confidence: 1.0, cleanContent };
        }
        // 获取上次消息时间和当前子话题
        const lastMsgResult = await this.db.query(
            `SELECT created_at, topic, content FROM messages 
             WHERE soul_id = $1 AND user_id = $2 
             ORDER BY created_at DESC LIMIT 1`,
            [soulId, userId]
        );
        const lastMsg = lastMsgResult.rows[0];
        const lastTopic = lastMsg?.topic || 'default';
        // 2. 时间间隔检测：超过10分钟无消息，清空 embedding 缓存，保持原 topic 但标记边界
        if (lastMsg?.created_at) {
            const lastTime = new Date(lastMsg.created_at);
            const gapMinutes = (now.getTime() - lastTime.getTime()) / 60000;
            if (gapMinutes > SESSION_GAP_MINUTES) {
                this.logger.info(`[Topic] Time gap detected for ${cacheKey}, gap=${gapMinutes.toFixed(1)}min`);
                // 时间间隔大时清空语义缓存，避免旧语义污染新项目
                this.embeddingCache.delete(cacheKey);
                return { topic: lastTopic, isSwitched: false, reason: 'time_gap_boundary', confidence: 0.3, gapMinutes };
            }
        }
        // 3. 粗粒度关键词匹配（辅助参考，用于无历史时的初始分类）
        const keywordCategory = this.detectByKeywords(content);
        // 4. 语义聚类检测（核心逻辑）
        const semanticResult = await this.detectBySemanticClustering(userId, soulId, content, lastTopic, keywordCategory);
        const finalTopic = semanticResult.topic;
        const isSwitched = semanticResult.isSwitched;
        // 更新缓存
        this.updateCache(cacheKey, finalTopic);
        if (isSwitched) {
            await this.switchTopic(userId, soulId, finalTopic, content, semanticResult.reason, semanticResult.confidence);
        }
        return {
            topic: finalTopic,
            isSwitched,
            reason: semanticResult.reason,
            confidence: semanticResult.confidence,
            cleanContent: content,
            keywordCategory: keywordCategory || null,
        };
    }
    /**
     * 语义聚类检测：通过 Embedding 相似度区分同一领域内的不同子话题/项目
     */
    async detectBySemanticClustering(userId, soulId, content, lastTopic, keywordCategory) {
        const cacheKey = `${userId}:${soulId}`;
        const cache = this.embeddingCache.get(cacheKey) || [];
        // 获取当前消息的 embedding
        let currentEmbedding;
        try {
            const { AIGateway } = require('../gateway/ai-gateway');
            const gateway = AIGateway.getInstance();
            currentEmbedding = await gateway.embedding(content);
        }
        catch (err) {
            this.logger.warn(`[Topic] Embedding failed, fallback to keyword: ${err.message}`);
            // Embedding 失败，退回到关键词检测（只能区分粗粒度领域）
            if (keywordCategory && keywordCategory !== lastTopic) {
                return { topic: keywordCategory, isSwitched: true, reason: 'keyword_fallback', confidence: 0.5 };
            }
            return { topic: lastTopic, isSwitched: false, reason: 'continue', confidence: 0.4 };
        }
        // 将当前消息加入缓存（后续查询时缓存中已有此条）
        this.addToEmbeddingCache(userId, soulId, lastTopic, content, currentEmbedding);
        // 获取当前子话题的历史 embedding（缓存中属于 lastTopic 的最近 5 条）
        const currentTopicEmbeddings = cache
            .filter(c => c.topic === lastTopic)
            .slice(-5)
            .map(c => c.embedding)
            .filter(Boolean);
        // 新用户/无缓存 → 关键词分类作为初始 topic
        if (currentTopicEmbeddings.length === 0) {
            if (keywordCategory && keywordCategory !== lastTopic && lastTopic === 'default') {
                return { topic: keywordCategory, isSwitched: true, reason: 'keyword_initial', confidence: 0.6 };
            }
            return { topic: lastTopic, isSwitched: false, reason: 'continue', confidence: 0.4 };
        }
        // 计算与当前子话题的平均余弦相似度
        const avgSimilarity = this.calculateAverageSimilarity(currentEmbedding, currentTopicEmbeddings);
        this.logger.info(`[Topic] Semantic similarity to "${lastTopic}": ${avgSimilarity.toFixed(3)} (${cacheKey})`);
        // A. 相似度足够高 → 保持当前子话题（同一项目继续聊）
        if (avgSimilarity >= SIMILARITY_KEEP_THRESHOLD) {
            return { topic: lastTopic, isSwitched: false, reason: 'semantic_continue', confidence: avgSimilarity };
        }
        // B. 相似度中等 → 在历史子话题中找最佳匹配（可能切回之前聊过的项目）
        if (avgSimilarity >= SIMILARITY_SWITCH_THRESHOLD) {
            const allTopicEmbeddings = this.groupEmbeddingsByTopic(cache);
            let bestTopic = null;
            let bestSim = -1;
            for (const [topicName, embeddings] of Object.entries(allTopicEmbeddings)) {
                if (topicName === lastTopic)
                    continue;
                const sim = this.calculateAverageSimilarity(currentEmbedding, embeddings.slice(-5));
                if (sim > bestSim) {
                    bestSim = sim;
                    bestTopic = topicName;
                }
            }
            // 找到更匹配的历史子话题且相似度足够高
            if (bestTopic && bestSim >= SIMILARITY_KEEP_THRESHOLD) {
                this.logger.info(`[Topic] Switch back to historical topic "${bestTopic}" (sim=${bestSim.toFixed(3)})`);
                return { topic: bestTopic, isSwitched: true, reason: 'semantic_revisit', confidence: bestSim };
            }
        }
        // C. 相似度低 → 可能是全新子话题/新项目
        // 先检查关键词是否有明显领域变化
        if (keywordCategory && !this.isSameDomain(keywordCategory, lastTopic) && keywordCategory !== lastTopic) {
            return { topic: keywordCategory, isSwitched: true, reason: 'domain_change', confidence: 0.7 };
        }
        // 同一领域内的新项目 → 触发 LLM 自动命名
        this.logger.info(`[Topic] New sub-topic detected (sim=${avgSimilarity.toFixed(3)}), triggering LLM naming...`);
        const newTopicName = await this.autoNameTopic(userId, soulId, content, cache, lastTopic);
        return { topic: newTopicName, isSwitched: true, reason: 'semantic_new_topic', confidence: 1 - avgSimilarity };
    }
    /**
     * LLM 自动子话题命名
     * 根据最近几轮对话内容生成 4-6 字中文标签
     */
    async autoNameTopic(userId, soulId, content, cache, lastTopic) {
        const cooldownKey = `${userId}:${soulId}`;
        const lastNamed = this.llmNamingCooldown.get(cooldownKey);
        if (lastNamed && (Date.now() - lastNamed) < LLM_NAMING_COOLDOWN_MS) {
            // 冷却期内，使用 fallback 命名
            return this.fallbackTopicName(content, lastTopic);
        }
        try {
            // 构造上下文：当前消息 + 缓存中最近 3 条消息
            const recentMessages = cache.slice(-3).map(c => c.content);
            const contextForLLM = [...recentMessages, content].join('\n');
            const { AIGateway } = require('../gateway/ai-gateway');
            const gateway = AIGateway.getInstance();
            const result = await gateway.chat({
                messages: [
                    {
                        role: 'system',
                        content: '你是一个对话主题命名助手。根据用户对话内容，生成一个4-6字的中文话题标签（如"电商重构"、"数据中台"、"小程序迁移"）。只返回标签本身，不要解释、不要标点、不要编号。',
                    },
                    {
                        role: 'user',
                        content: `请为以下对话生成简短话题标签：\n${contextForLLM.substring(0, 500)}`,
                    }
                ],
                max_tokens: LLM_NAMING_MAX_TOKENS,
                temperature: 0.3,
            });
            let name = result.content.trim()
                .replace(/[，。！？\.\,\!\?\:\;\-\#\*]/g, '')
                .replace(/^(话题|标签|主题)[\s:]*/i, '')
                .substring(0, 32);
            // 清理后若为空，fallback
            if (!name || name.length < 2) {
                name = this.fallbackTopicName(content, lastTopic);
            }
            this.llmNamingCooldown.set(cooldownKey, Date.now());
            this.logger.info(`[Topic] LLM named new sub-topic: "${name}" for ${cooldownKey}`);
            return name;
        }
        catch (err) {
            this.logger.warn(`[Topic] LLM naming failed: ${err.message}, using fallback`);
            return this.fallbackTopicName(content, lastTopic);
        }
    }
    /**
     * Fallback 命名：基于关键词 + 时间戳
     */
    fallbackTopicName(content, lastTopic) {
        // 尝试提取消息中的核心实体（产品名、模块名等）
        const entityPatterns = [
            /["'"']([^"'"']{2,10})["'"']/g,           // 引号包裹的词
            /([A-Z][a-zA-Z0-9]{1,8})/g,                // 英文大写开头的词
            /([\u4e00-\u9fa5]{2,6}(?:平台|系统|项目|模块|小程序|APP|后台|中台))/g, // 中文业务实体
        ];
        const entities = [];
        for (const pattern of entityPatterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                entities.push(match[1]);
            }
        }
        if (entities.length > 0) {
            return entities.slice(0, 2).join('_').substring(0, 32);
        }
        // 退化方案：时间戳 + 领域提示
        const timeLabel = new Date().toISOString().slice(11, 16).replace(':', '');
        return `${lastTopic !== 'default' ? lastTopic + '_' : ''}${timeLabel}`;
    }
    /**
     * 显式指令检测
     */
    detectExplicitCommand(content) {
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
    /**
     * 粗粒度关键词领域检测（仅作辅助）
     */
    detectByKeywords(content) {
        const scores = {};
        for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
            let score = 0;
            for (const kw of keywords) {
                const matches = content.match(new RegExp(kw, 'gi'));
                if (matches)
                    score += matches.length;
            }
            if (score > 0)
                scores[topic] = score;
        }
        let bestTopic = null;
        let bestScore = 0;
        for (const [topic, score] of Object.entries(scores)) {
            if (score > bestScore && score >= 2) {
                bestScore = score;
                bestTopic = topic;
            }
        }
        return bestTopic;
    }
    /**
     * 计算两个向量的余弦相似度
     */
    cosineSimilarity(a, b) {
        let dot = 0, normA = 0, normB = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        if (normA === 0 || normB === 0)
            return 0;
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }
    /**
     * 计算当前向量与一组向量的平均相似度
     */
    calculateAverageSimilarity(embedding, historyEmbeddings) {
        if (!historyEmbeddings || historyEmbeddings.length === 0)
            return 0;
        let total = 0;
        for (const hist of historyEmbeddings) {
            total += this.cosineSimilarity(embedding, hist);
        }
        return total / historyEmbeddings.length;
    }
    /**
     * 将缓存中的 embedding 按 topic 分组
     */
    groupEmbeddingsByTopic(cache) {
        const groups = {};
        for (const item of cache) {
            if (!item.embedding)
                continue;
            if (!groups[item.topic])
                groups[item.topic] = [];
            groups[item.topic].push(item.embedding);
        }
        return groups;
    }
    /**
     * 判断两个话题是否属于同一粗粒度领域
     */
    isSameDomain(a, b) {
        // 简单规则：如果两个都是工作类关键词话题，认为是同一领域
        const workTopics = Object.keys(TOPIC_KEYWORDS);
        const aIsWork = workTopics.includes(a);
        const bIsWork = workTopics.includes(b);
        return (aIsWork && bIsWork) || a === b;
    }
    /**
     * 添加消息到 embedding 缓存
     */
    addToEmbeddingCache(userId, soulId, topic, content, embedding) {
        const cacheKey = `${userId}:${soulId}`;
        let cache = this.embeddingCache.get(cacheKey);
        if (!cache) {
            cache = [];
            this.embeddingCache.set(cacheKey, cache);
        }
        cache.push({ topic, content, embedding, time: Date.now() });
        // LRU: 保留最近使用的，移除最旧的（shift 是正确的，数组头是最旧的）
        if (cache.length > EMBEDDING_CACHE_MAX_SIZE) {
            cache.shift();
        }
    }
    /**
     * 切换话题记录日志
     */
    async switchTopic(userId, soulId, newTopic, triggerMessage, method, confidence = 0.8) {
        const lastMsgResult = await this.db.query(
            `SELECT topic FROM messages WHERE soul_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1`,
            [soulId, userId]
        );
        const previousTopic = lastMsgResult.rows[0]?.topic || 'default';
        if (previousTopic === newTopic) {
            return;
        }
        await this.db.query(
            `INSERT INTO topic_transitions (soul_id, user_id, previous_topic, new_topic, trigger_message, detection_method, confidence)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [soulId, userId, previousTopic, newTopic, triggerMessage, method, confidence]
        );
        this.logger.info(`[Topic] Switched: ${previousTopic} -> ${newTopic} (method=${method}, conf=${confidence.toFixed(2)}) user=${userId}`);
    }
    /**
     * 获取当前活跃子话题
     */
    async getCurrentTopic(userId, soulId) {
        const cacheKey = `${userId}:${soulId}`;
        const cached = this.getCachedTopic(cacheKey);
        if (cached)
            return cached;
        const result = await this.db.query(
            `SELECT topic FROM messages WHERE soul_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1`,
            [soulId, userId]
        );
        const topic = result.rows[0]?.topic || 'default';
        this.updateCache(cacheKey, topic);
        return topic;
    }
    /**
     * 按子话题查询历史消息
     */
    async getMessagesByTopic(userId, soulId, topic, limit = 20) {
        const result = await this.db.query(
            `SELECT role, content, created_at FROM messages
             WHERE soul_id = $1 AND user_id = $2 AND topic = $3
             ORDER BY created_at DESC LIMIT $4`,
            [soulId, userId, topic || 'default', limit]
        );
        return result.rows.reverse();
    }
    async getUserTopics(userId, soulId) {
        const result = await this.db.query(
            `SELECT topic, COUNT(*) as message_count, MAX(created_at) as last_active
             FROM messages WHERE soul_id = $1 AND user_id = $2 GROUP BY topic ORDER BY last_active DESC`,
            [soulId, userId]
        );
        return result.rows;
    }
    async getActiveSessions(userId, soulId) {
        const result = await this.db.query(
            `SELECT * FROM active_sessions WHERE soul_id = $1 AND user_id = $2`,
            [soulId, userId]
        );
        return result.rows;
    }
    cleanExpiredCache() {
        const now = Date.now();
        for (const [key, ts] of this.cacheTimestamps.entries()) {
            if (now - ts > this.cacheExpiryMs * 5) {
                this.activeTopicCache.delete(key);
                this.cacheTimestamps.delete(key);
            }
        }
        // 清理超过2小时未更新的 embedding 缓存
        for (const [key, cache] of this.embeddingCache.entries()) {
            const lastItem = cache[cache.length - 1];
            if (lastItem && (now - lastItem.time > 7200000)) {
                this.embeddingCache.delete(key);
            }
        }
    }
    getCachedTopic(key) {
        const ts = this.cacheTimestamps.get(key);
        if (!ts || Date.now() - ts > this.cacheExpiryMs) {
            this.activeTopicCache.delete(key);
            this.cacheTimestamps.delete(key);
            return null;
        }
        return this.activeTopicCache.get(key);
    }
    updateCache(key, topic) {
        this.activeTopicCache.set(key, topic);
        this.cacheTimestamps.set(key, Date.now());
    }
}
exports.TopicService = TopicService;
//# sourceMappingURL=topic-service.js.map
