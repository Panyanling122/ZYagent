"use strict";
/**
 * =============================================================================
 * 模块名称：后台经验提炼服务
 * =============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReviewService = void 0;
const fs = require("fs");
const path = require("path");
const db_1 = require("../utils/db");
const logger_1 = require("../utils/logger");
const ai_gateway_1 = require("../gateway/ai-gateway");
class ReviewService {
    static instance;
    db;
    logger;
    gateway;
    constructor() {
        this.db = db_1.Database.getInstance();
        this.logger = logger_1.Logger.getInstance();
        this.gateway = new ai_gateway_1.AIGateway();
    }
    static getInstance() {
        if (!ReviewService.instance) ReviewService.instance = new ReviewService();
        return ReviewService.instance;
    }
    async review(soulId, workspaceId, messages) {
        const prompt = `分析以下对话历史：
${messages.map(m => `${m.role}: ${m.content.substring(0, 200)}`).join('\n')}

提取事实和Skill，输出JSON: {"facts":[{"type":"preference|project|decision|other","content":"","importance":1-5}],"skills":[{"name":"","trigger":"","steps":[""]}]}`;
        try {
            const result = await this.gateway.chat({ messages: [{ role: 'user', content: prompt }], temperature: 0.3, max_tokens: 2048 });
            let parsed;
            try { const m = result.content.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : { facts: [], skills: [] }; }
            catch { parsed = { facts: [], skills: [] }; }
            const facts = parsed.facts || [];
            const skills = parsed.skills || [];
            const memoryPath = this.getMemoryPath(soulId, workspaceId);
            const memoryContent = facts.map(f => `- [${f.type}] ${f.content} (importance: ${f.importance})`).join('\n');
            if (memoryContent) await this.appendMemory(memoryPath, memoryContent);
            for (const skill of skills) await this.saveSkill(soulId, workspaceId, skill);
            await this.logReview(soulId, workspaceId, 'message_count', result.content, facts, skills);
            this.logger.info(`[Review] Soul ${soulId}: ${facts.length} facts, ${skills.length} skills`);
            return { facts, skills };
        } catch (err) {
            this.logger.error(`[Review] Failed for soul ${soulId}:`, err.message);
            return { facts: [], skills: [] };
        }
    }
    getMemoryPath(soulId, workspaceId) {
        const basePath = process.env.DATA_PATH || '/data';
        const dir = path.join(basePath, 'workspaces', workspaceId || 'default', 'memories', soulId);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        return path.join(dir, 'MEMORY.md');
    }
    async appendMemory(filePath, content) {
        const entry = `\n## ${new Date().toISOString()}\n${content}\n`;
        fs.appendFileSync(filePath, entry, 'utf8');
    }
    async saveSkill(soulId, workspaceId, skill) {
        if (!skill.name || !skill.steps || skill.steps.length === 0) return;
        const basePath = process.env.DATA_PATH || '/data';
        const dir = path.join(basePath, 'workspaces', workspaceId || 'default', 'skills');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const yaml = `name: ${skill.name}\ntrigger: ${skill.trigger || 'manual'}\nsteps:\n${skill.steps.map(s => `  - ${s}`).join('\n')}`;
        fs.writeFileSync(path.join(dir, `auto-${skill.name}-${Date.now()}.yml`), yaml, 'utf8');
    }
    async logReview(soulId, workspaceId, triggerReason, output, facts, skills) {
        await this.db.query(
            `INSERT INTO review_logs (soul_id, workspace_id, trigger_reason, review_output, memory_changes, skill_changes, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
            [soulId, workspaceId, triggerReason, output, JSON.stringify(facts), JSON.stringify(skills)]
        );
    }
}
exports.ReviewService = ReviewService;
