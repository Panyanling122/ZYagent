"use strict";
/**
 * =============================================================================
 * 模块名称：Soul 进程管理
 * 功能描述：每个 Soul 独立子进程，支持单聊和群聊消息队列
 * =============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SoulProcessManager = void 0;
const child_process_1 = require("child_process");
const events_1 = require("events");
const ai_gateway_1 = require("../gateway/ai-gateway");
const db_1 = require("../utils/db");
class SoulProcessManager extends events_1.EventEmitter {
    static instance;
    souls = new Map();
    gateway = new ai_gateway_1.AIGateway();
    busy = new Set();
    queues = new Map();
    pendingResponses = new Map();
    constructor() {
        super();
    }
    static getInstance() {
        if (!SoulProcessManager.instance) {
            SoulProcessManager.instance = new SoulProcessManager();
        }
        return SoulProcessManager.instance;
    }
    /**
     * 启动 Soul 子进程
     */
    async startSoul(soulId) {
        if (this.souls.has(soulId)) {
            console.log(`[SoulProcess] Soul ${soulId} already running`);
            return;
        }
        // 更新状态为 online
        await db_1.Database.getInstance().query("UPDATE souls SET status = 'online', updated_at = NOW() WHERE id = $1", [soulId]);
        // 创建子进程（fork 自身，进入 --soul 分支）
        const proc = (0, child_process_1.fork)(__filename, ['--soul', soulId], {
            env: { ...process.env, SOUL_ID: soulId },
        });
        // 统一消息处理器
        proc.on('message', (msg) => {
            if (msg.type === 'response' || msg.type === 'error') {
                const pending = this.pendingResponses.get(msg.requestId);
                if (pending) {
                    clearTimeout(pending.timeout);
                    this.pendingResponses.delete(msg.requestId);
                    if (msg.type === 'response') {
                        pending.resolve(msg.content);
                    }
                    else {
                        pending.reject(new Error(msg.error));
                    }
                }
            }
            else if (msg.type === 'pong') {
                console.log(`[SoulProcess] Soul ${msg.soulId} pong`);
            }
        });
        proc.on('exit', (code) => {
            console.log(`[SoulProcess] Soul ${soulId} exited with code ${code}`);
            this.souls.delete(soulId);
            this.busy.delete(soulId);
            this.queues.delete(soulId);
            db_1.Database.getInstance().query("UPDATE souls SET status = 'offline', updated_at = NOW() WHERE id = $1", [soulId]).catch(() => { });
        });
        this.souls.set(soulId, proc);
        console.log(`[SoulProcess] Soul ${soulId} started`);
    }
    /**
     * 停止 Soul 子进程
     */
    async stopSoul(soulId) {
        const proc = this.souls.get(soulId);
        if (proc) {
            proc.kill('SIGTERM');
            this.souls.delete(soulId);
            this.busy.delete(soulId);
            this.queues.delete(soulId);
            await db_1.Database.getInstance().query("UPDATE souls SET status = 'offline', updated_at = NOW() WHERE id = $1", [soulId]);
        }
    }
    /**
     * 发送消息到指定 Soul（支持队列）
     * @returns AI 回复内容
     */
    async sendMessage(soulId, type, payload) {
        if (!this.souls.has(soulId)) {
            await this.startSoul(soulId);
        }
        return new Promise((resolve, reject) => {
            const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
            const timeout = setTimeout(() => {
                const p = this.pendingResponses.get(requestId);
                if (p) {
                    this.pendingResponses.delete(requestId);
                    p.reject(new Error('Soul response timeout'));
                }
                this.busy.delete(soulId);
                this.processNext(soulId);
            }, 60000);
            this.pendingResponses.set(requestId, { resolve, reject, timeout });
            const queued = { type, payload, requestId };
            if (this.busy.has(soulId)) {
                // 加入队列
                if (!this.queues.has(soulId)) {
                    this.queues.set(soulId, []);
                }
                this.queues.get(soulId).push(queued);
            }
            else {
                this.busy.add(soulId);
                this.dispatch(soulId, queued);
            }
        });
    }
    dispatch(soulId, queued) {
        const proc = this.souls.get(soulId);
        if (!proc) {
            const pending = this.pendingResponses.get(queued.requestId);
            if (pending) {
                clearTimeout(pending.timeout);
                this.pendingResponses.delete(queued.requestId);
                pending.reject(new Error(`Soul ${soulId} not running`));
            }
            this.busy.delete(soulId);
            this.processNext(soulId);
            return;
        }
        proc.send({ type: queued.type, payload: queued.payload, requestId: queued.requestId });
    }
    processNext(soulId) {
        const queue = this.queues.get(soulId);
        if (queue && queue.length > 0) {
            const next = queue.shift();
            this.busy.add(soulId);
            this.dispatch(soulId, next);
        }
    }
    /**
     * 处理单聊请求（兼容旧接口）
     */
    async handleChat(soulId, payload) {
        return this.sendMessage(soulId, 'chat', payload);
    }
    /**
     * 获取活跃的 Soul 数量
     */
    getActiveCount() {
        return this.souls.size;
    }
    /**
     * 判断 Soul 是否忙碌
     */
    isBusy(soulId) {
        return this.busy.has(soulId);
    }
}
exports.SoulProcessManager = SoulProcessManager;
// 子进程入口
if (process.argv.includes('--soul')) {
    const soulId = process.env.SOUL_ID;
    if (soulId) {
        const gateway = new ai_gateway_1.AIGateway();
        process.on('message', async (msg) => {
            if (msg.type === 'ping') {
                if (process.connected) process.send({ type: 'pong', soulId });
                return;
            }
            if (msg.type === 'chat') {
                try {
                    const result = await gateway.chat({
                        messages: msg.payload.messages,
                        temperature: 0.7,
                        max_tokens: 2048,
                    });
                    if (process.connected) process.send({
                        type: 'response',
                        requestId: msg.requestId,
                        content: result.content,
                        usage: result.usage,
                    });
                }
                catch (err) {
                    if (process.connected) process.send({
                        type: 'error',
                        requestId: msg.requestId,
                        error: err.message,
                    });
                }
                return;
            }
            if (msg.type === 'group') {
                try {
                    const { message, senderName, groupName, systemPrompt } = msg.payload;
                    // 群聊上下文构建
                    const groupContext = `你在群聊"${groupName || '群聊'}"中。${senderName || '群友'}说：${message}`;
                    const messages = [
                        { role: 'user', content: groupContext },
                    ];
                    // 如果有 system_prompt，注入到 user message 中
                    if (systemPrompt) {
                        messages[0].content = `[系统指令：${systemPrompt}]\n\n你必须严格遵循以上系统指令设定的人设和规则来回答。${messages[0].content}`;
                    }
                    const result = await gateway.chat({
                        messages,
                        temperature: 0.8,
                        max_tokens: 2048,
                    });
                    if (process.connected) process.send({
                        type: 'response',
                        requestId: msg.requestId,
                        content: result.content,
                        usage: result.usage,
                    });
                }
                catch (err) {
                    if (process.connected) process.send({
                        type: 'error',
                        requestId: msg.requestId,
                        error: err.message,
                    });
                }
                return;
            }
        });
        console.log(`[SoulWorker] Soul ${soulId} worker ready`);

    }
}
