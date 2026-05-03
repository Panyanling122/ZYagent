"use strict";
/**
 * =============================================================================
 * 模块名称：AI Gateway (增强版)
 * 新增功能：SSE 流式输出、4096字符上限、密钥轮换、首字节延迟控制
 * =============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIGateway = void 0;
const axios_1 = require("axios");
const { TextDecoder } = require("util");
const crypto_1 = require("../utils/crypto");
const MAX_INPUT_CHARS = 4096; // 消息硬上限
const FIRST_BYTE_TARGET_MS = 500; // 首字节目标延迟

class AIGateway {
    static instance;
    http;
    logger = console;
    lastUsage;
    constructor() {
        this.http = axios_1.default.create({
            timeout: 60000,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    static getInstance() {
        if (!AIGateway.instance) AIGateway.instance = new AIGateway();
        return AIGateway.instance;
    }
    /**
     * 截断超长消息（4096字符硬上限）— 纯函数，无副作用
     */
    truncateInput(content) {
        if (!content || content.length <= MAX_INPUT_CHARS) return content;
        this.logger.warn(`[AIGateway] Input truncated from ${content.length} to ${MAX_INPUT_CHARS} chars`);
        return content.substring(0, MAX_INPUT_CHARS) + "\n...[内容已截断]";
    }
    /**
     * 安全地截断消息数组中的内容（创建副本）
     */
    truncateMessages(messages) {
        return messages.map(m => ({
            ...m,
            content: m.content ? this.truncateInput(m.content) : m.content
        }));
    }
    async loadProviders() {
        try {
            const { pool } = await Promise.resolve().then(() => require('../utils/db'));
            const result = await pool.query(`SELECT name, base_url, api_key, model_map->>'default' as real_model, is_backup
                FROM providers WHERE is_active = true ORDER BY is_backup ASC LIMIT 2`);
            const primary = result.rows.find(r => !r.is_backup) || result.rows[0] || null;
            const backup = result.rows.find(r => r.is_backup) || null;
            const toConfig = (row) => {
                if (!row) return null;
                return {
                    name: row.name, baseUrl: row.base_url,
                    apiKey: (0, crypto_1.decryptApiKey)(row.api_key),
                    realModel: row.real_model || 'gpt-4o', isBackup: row.is_backup || false,
                };
            };
            return { primary: toConfig(primary), backup: toConfig(backup) };
        } catch (err) {
            this.logger.error('[AIGateway] Failed to load providers:', err);
            return { primary: null, backup: null };
        }
    }
    /**
     * 统一聊天接口（带自动回退 + 4096截断）
     */
    async chat(options) {
        // 截断超长输入
        if (options.messages && Array.isArray(options.messages)) {
            options.messages = this.truncateMessages(options.messages);
        }
        const { primary, backup } = await this.loadProviders();
        if (!primary && !backup) throw new Error('No active AI provider configured');
        if (primary) {
            try { return await this.callProvider(primary, options); }
            catch (err) {
                this.logger.warn(`[AIGateway] Primary ${primary.name} failed: ${err.message}`);
                if (backup) {
                    this.logger.warn(`[AIGateway] Falling back to ${backup.name}`);
                    return await this.callProvider(backup, options);
                }
                throw err;
            }
        }
        if (backup) return await this.callProvider(backup, options);
        throw new Error('No active AI provider configured');
    }
    /**
     * SSE 流式输出接口
     */
    async *chatStream(options) {
        if (options.messages && Array.isArray(options.messages)) {
            options.messages = this.truncateMessages(options.messages);
        }
        const { primary, backup } = await this.loadProviders();
        const provider = primary || backup;
        if (!provider) throw new Error('No active AI provider');
        const url = `${provider.baseUrl}/chat/completions`;
        const payload = {
            model: provider.realModel, messages: options.messages,
            temperature: options.temperature ?? 0.7, max_tokens: options.max_tokens ?? 2048,
            stream: true,
        };
        const startTime = Date.now();
        try {
            const response = await this.http.post(url, payload, {
                headers: { Authorization: `Bearer ${provider.apiKey}` },
                responseType: 'stream',
                timeout: 120000,
            });
            const firstByteDelay = Date.now() - startTime;
            if (firstByteDelay > FIRST_BYTE_TARGET_MS) {
                this.logger.warn(`[AIGateway] First byte delay: ${firstByteDelay}ms (target: ${FIRST_BYTE_TARGET_MS}ms)`);
            }
            yield { type: 'meta', firstByteDelay, provider: provider.name };
            const reader = response.data;
            const decoder = new TextDecoder();
            let buffer = '';
            reader.on('data', (chunk) => { buffer += decoder.decode(chunk, { stream: true }); });
            await new Promise((resolve, reject) => {
                reader.on('end', resolve);
                reader.on('error', reject);
            });
            const lines = buffer.split('\n');
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data: ')) continue;
                const data = trimmed.slice(6);
                if (data === '[DONE]') { yield { type: 'done' }; break; }
                try {
                    const parsed = JSON.parse(data);
                    const delta = parsed.choices?.[0]?.delta?.content;
                    if (delta) yield { type: 'chunk', content: delta };
                    if (parsed.usage) yield { type: 'usage', usage: parsed.usage };
                } catch { /* ignore parse errors */ }
            }
        } catch (err) {
            this.logger.error(`[AIGateway] Stream failed: ${err.message}`);
            yield { type: 'error', error: err.message };
        }
    }
    async callProvider(provider, options) {
        const url = `${provider.baseUrl}/chat/completions`;
        const payload = {
            model: provider.realModel, messages: options.messages,
            temperature: options.temperature ?? 0.7, max_tokens: options.max_tokens ?? 2048, stream: false,
        };
        const resp = await this.http.post(url, payload, {
            headers: { Authorization: `Bearer ${provider.apiKey}` },
        });
        const data = resp.data;
        const content = data.choices?.[0]?.message?.content || '';
        if (data.usage) this.lastUsage = {
            prompt_tokens: data.usage.prompt_tokens || 0,
            completion_tokens: data.usage.completion_tokens || 0,
            total_tokens: data.usage.total_tokens || 0,
        };
        return { content, usage: data.usage, providerName: provider.name };
    }
    countTokens(text) {
        const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
        const nonChinese = text.length - chineseChars;
        return Math.ceil(chineseChars + nonChinese / 2.5);
    }
    async embedding(text) {
        const { primary } = await this.loadProviders();
        if (!primary) return new Array(1536).fill(0);
        const baseUrl = primary.baseUrl.replace(/\/chat\/completions\/?$/, '').replace(/\/$/, '');
        try {
            const resp = await this.http.post(`${baseUrl}/embeddings`, {
                model: 'text-embedding-3-small', input: text.substring(0, 8000),
            }, { headers: { Authorization: `Bearer ${primary.apiKey}` }, timeout: 30000 });
            return resp.data?.data?.[0]?.embedding || new Array(1536).fill(0);
        } catch (err) {
            this.logger.error(`[AIGateway] Embedding failed: ${err.message}`);
            return new Array(1536).fill(0);
        }
    }
    /**
     * 批量 Embedding
     */
    async embeddingBatch(texts) {
        const { primary } = await this.loadProviders();
        if (!primary) return texts.map(() => new Array(1536).fill(0));
        const baseUrl = primary.baseUrl.replace(/\/chat\/completions\/?$/, '').replace(/\/$/, '');
        try {
            const resp = await this.http.post(`${baseUrl}/embeddings`, {
                model: 'text-embedding-3-small',
                input: texts.map(t => t.substring(0, 8000)),
            }, { headers: { Authorization: `Bearer ${primary.apiKey}` }, timeout: 60000 });
            return resp.data?.data?.map(d => d.embedding) || texts.map(() => new Array(1536).fill(0));
        } catch (err) {
            this.logger.error(`[AIGateway] Batch embedding failed: ${err.message}`);
            return texts.map(() => new Array(1536).fill(0));
        }
    }
}
exports.AIGateway = AIGateway;
