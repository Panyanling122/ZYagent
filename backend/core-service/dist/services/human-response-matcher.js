"use strict";
/**
 * =============================================================================
 * 模块名称：人类回复匹配器
 * =============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HumanResponseMatcher = void 0;
const db_1 = require("../utils/db");
const logger_1 = require("../utils/logger");
class HumanResponseMatcher {
    static instance;
    db;
    logger;
    constructor() {
        this.db = db_1.Database.getInstance();
        this.logger = logger_1.Logger.getInstance();
    }
    static getInstance() {
        if (!HumanResponseMatcher.instance) HumanResponseMatcher.instance = new HumanResponseMatcher();
        return HumanResponseMatcher.instance;
    }
    async match(response, userId, workspaceId) {
        const idMatch = response.match(/#([a-f0-9-]{36})/i);
        if (idMatch) {
            const taskService = require('./task-service').TaskService.getInstance();
            const task = await taskService.getById(idMatch[1], workspaceId);
            if (task && task.status === 'awaiting_human') return { task, confidence: 1.0, method: 'exact_id' };
        }
        const candidates = await this.db.query(
            `SELECT * FROM tasks WHERE assigned_to = $1 AND workspace_id = $2 AND status = 'awaiting_human' ORDER BY created_at DESC LIMIT 5`,
            [userId, workspaceId]
        );
        if (candidates.rows.length === 0) return null;
        if (candidates.rows.length === 1) return { task: candidates.rows[0], confidence: 0.9, method: 'single_candidate' };
        let bestMatch = null;
        let bestScore = -1;
        for (const task of candidates.rows) {
            const score = this.textSimilarity(response, task.awaiting_response || '');
            if (score > bestScore) { bestScore = score; bestMatch = task; }
        }
        if (bestMatch && bestScore > 0.3) return { task: bestMatch, confidence: bestScore, method: 'keyword_similarity' };
        // 4. LLM 二次匹配（候选数>1 且关键词不够强时）
        if (candidates.rows.length > 1) {
            const llmMatch = await this.llmMatch(response, candidates.rows);
            if (llmMatch) return { task: llmMatch, confidence: 0.75, method: 'llm_match' };
        }
        return { task: candidates.rows[0], confidence: 0.5, method: 'fallback_recent' };
    }
    /** LLM 二次确认匹配 */
    async llmMatch(response, candidates) {
        try {
            const { AIGateway } = require('../gateway/ai-gateway');
            const gateway = new AIGateway();
            const context = candidates.map((t, i) => `任务${i + 1}(${t.id}): ${t.title}\n等待回复: ${t.awaiting_response || '无'}`).join('\n\n');
            const result = await gateway.chat({
                messages: [
                    { role: 'system', content: '你是一个任务匹配助手。根据用户回复判断是在回复哪个任务。只返回任务ID（UUID格式），不要解释。' },
                    { role: 'user', content: `用户回复: "${response}"\n\n候选任务:\n${context}\n\n请判断用户在回复哪个任务，只返回任务ID。` }
                ],
                max_tokens: 50,
                temperature: 0
            });
            const matchedId = result.content.trim().match(/[a-f0-9-]{36}/);
            if (!matchedId) return null;
            return candidates.find(t => t.id === matchedId[0]) || null;
        } catch {
            return null;
        }
    }
    parseIntent(response) {
        const text = response.toLowerCase();
        if (text.includes('同意') || text.includes('确认') || text.includes('好的') || text.includes('通过')) return 'approve';
        if (text.includes('拒绝') || text.includes('不要') || text.includes('取消') || text.includes('不行')) return 'reject';
        if (text.includes('修改') || text.includes('换成') || text.includes('改为')) return 'modify';
        if (text.includes('查看') || text.includes('详情') || text.includes('看看')) return 'view';
        return 'unknown';
    }
    textSimilarity(a, b) {
        const setA = new Set(a.split(/\s+/));
        const setB = new Set(b.split(/\s+/));
        const intersection = new Set([...setA].filter(x => setB.has(x)));
        const union = new Set([...setA, ...setB]);
        return union.size === 0 ? 0 : intersection.size / union.size;
    }
}
exports.HumanResponseMatcher = HumanResponseMatcher;
