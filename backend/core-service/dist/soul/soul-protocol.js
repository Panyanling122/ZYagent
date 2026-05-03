"use strict";
/**
 * =============================================================================
 * 模块名称：Soul 协作协议 (OpenClaw群通信)
 * 功能描述：context.at() 跨Soul通信、心跳监控、全局FIFO队列背压、60秒超时
 * =============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SoulProtocol = void 0;
const event_bus_1 = require("../events/event-bus");
const logger_1 = require("../utils/logger");
const db_1 = require("../utils/db");
const SOUL_AT_TIMEOUT_MS = parseInt(process.env.SOUL_AT_TIMEOUT_MS || '60000');
const HEARTBEAT_INTERVAL_MS = 10000; // 10秒
const HEARTBEAT_TIMEOUT_MS = 3000;   // 3秒
const MAX_HEARTBEAT_MISSES = 3;
const MAX_QUEUE_DEPTH = 50;

class SoulProtocol {
    static instance;
    eventBus;
    logger;
    db;
    // Soul 队列: soulId -> Array<QueuedTask>
    queues = new Map();
    // Soul 状态: soulId -> SoulState
    soulStates = new Map();
    // 心跳记录: soulId -> { lastPong: number, consecutiveMisses: number }
    heartbeats = new Map();
    // 正在执行的会话: soulId -> sessionId
    activeSessions = new Map();
    constructor() {
        this.eventBus = event_bus_1.EventBus.getInstance();
        this.logger = logger_1.Logger.getInstance();
        this.db = db_1.Database.getInstance();
        // 启动心跳检查
        setInterval(() => this.checkHeartbeats(), HEARTBEAT_INTERVAL_MS);
        // 监听总线消息
        this.eventBus.on('soul:message', (payload) => this.routeMessage(payload));
    }
    static getInstance() {
        if (!SoulProtocol.instance) SoulProtocol.instance = new SoulProtocol();
        return SoulProtocol.instance;
    }
    /**
     * Skill 调用: context.at(targetSoulId, messageContent)
     * 跨Soul通信，带60秒超时
     */
    async at(callerSoulId, targetSoulId, messageContent, sessionId) {
        this.logger.info(`[SoulProtocol] ${callerSoulId} -> @${targetSoulId}: ${messageContent.substring(0, 50)}`);
        // 检查目标Soul是否存在且健康
        const hb = this.heartbeats.get(targetSoulId);
        if (hb && hb.consecutiveMisses >= MAX_HEARTBEAT_MISSES) {
            throw new SoulTimeoutError(callerSoulId, targetSoulId, 0, sessionId, 'Target soul heartbeat timeout');
        }
        // 检查队列背压
        const queue = this.queues.get(targetSoulId) || [];
        if (queue.length >= MAX_QUEUE_DEPTH) {
            throw new QueueFullError(targetSoulId);
        }
        // 发送PING心跳
        this.eventBus.emit(`soul:ping:${targetSoulId}`, { from: callerSoulId, timestamp: Date.now() });
        // 构建事件对象
        const event = {
            from_soul: callerSoulId, to_soul: targetSoulId,
            message: messageContent, timestamp: Date.now(),
            group_id: '', session_id: sessionId,
            msg_id: `msg_${this.generateId()}`,
        };
        // 投递到目标Soul队列
        let targetQueue = this.queues.get(targetSoulId);
        if (!targetQueue) {
            targetQueue = [];
            this.queues.set(targetSoulId, targetQueue);
        }
        targetQueue.push({ type: 'at_request', event, status: 'pending' });
        // 等待响应（60秒超时）
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new SoulTimeoutError(callerSoulId, targetSoulId, SOUL_AT_TIMEOUT_MS, sessionId));
            }, SOUL_AT_TIMEOUT_MS);
            const responseHandler = (response) => {
                if (response.msg_id === event.msg_id) {
                    clearTimeout(timeout);
                    this.eventBus.off(`soul:response:${callerSoulId}`, responseHandler);
                    if (response.success) {
                        resolve(response.data);
                    } else {
                        reject(new SoulExecutionError(targetSoulId, response.error_msg, response.error_type));
                    }
                }
            };
            this.eventBus.on(`soul:response:${callerSoulId}`, responseHandler);
            // 立即派发
            this.eventBus.emit(`soul:deliver:${targetSoulId}`, event);
        });
    }
    /**
     * 注册 Soul 到协议层
     */
    registerSoul(soulId, handler) {
        this.queues.set(soulId, []);
        this.heartbeats.set(soulId, { lastPong: Date.now(), consecutiveMisses: 0 });
        this.soulStates.set(soulId, 'idle');
        // 订阅 Soul 的消息通道
        this.eventBus.on(`soul:deliver:${soulId}`, (event) => {
            this.processSoulMessage(soulId, event, handler);
        });
        // 订阅 Soul 的心跳响应
        this.eventBus.on(`soul:pong:${soulId}`, () => {
            this.heartbeats.set(soulId, { lastPong: Date.now(), consecutiveMisses: 0 });
        });
        this.logger.info(`[SoulProtocol] Soul registered: ${soulId}`);
    }
    /**
     * Soul 回复响应
     */
    respond(msgId, fromSoulId, toSoulId, data, success = true, error = null) {
        this.eventBus.emit(`soul:response:${toSoulId}`, {
            msg_id: msgId, from_soul: fromSoulId, success,
            data, error_msg: error?.message, error_type: error?.name,
        });
    }
    /**
     * 心跳检查
     */
    checkHeartbeats() {
        const now = Date.now();
        for (const [soulId, hb] of this.heartbeats) {
            if (now - hb.lastPong > HEARTBEAT_TIMEOUT_MS) {
                hb.consecutiveMisses++;
                if (hb.consecutiveMisses >= MAX_HEARTBEAT_MISSES) {
                    this.logger.warn(`[SoulProtocol] Soul ${soulId} heartbeat failed ${MAX_HEARTBEAT_MISSES} times, marking degraded`);
                    this.soulStates.set(soulId, 'degraded');
                }
            }
            // 发送PING
            this.eventBus.emit(`soul:ping:${soulId}`, { timestamp: now });
        }
    }
    /** 处理 Soul 收到的消息 */
    async processSoulMessage(soulId, event, handler) {
        const state = this.soulStates.get(soulId);
        if (state === 'paused') return;
        this.soulStates.set(soulId, 'processing');
        this.activeSessions.set(soulId, event.session_id);
        try {
            const result = await handler(event);
            this.respond(event.msg_id, soulId, event.from_soul, result);
        } catch (err) {
            this.logger.error(`[SoulProtocol] Soul ${soulId} execution error:`, err.message);
            this.respond(event.msg_id, soulId, event.from_soul, null, false, err);
            this.soulStates.set(soulId, 'error');
            return;
        } finally {
            this.activeSessions.delete(soulId);
        }
        // 处理队列中的下一个任务
        const queue = this.queues.get(soulId);
        if (queue && queue.length > 0) {
            const next = queue.shift();
            if (next) this.processSoulMessage(soulId, next.event, handler);
        } else {
            this.soulStates.set(soulId, 'idle');
        }
    }
    /** 路由消息 */
    routeMessage(payload) {
        const { targetSoulId, event } = payload;
        const queue = this.queues.get(targetSoulId);
        if (!queue) {
            this.logger.error(`[SoulProtocol] Route failed: Soul ${targetSoulId} not found`);
            this.eventBus.emit(`soul:error:${event.from_soul}`, { error: 'SOUL_NOT_FOUND', target: targetSoulId });
            return;
        }
        if (queue.length >= MAX_QUEUE_DEPTH) {
            this.logger.warn(`[SoulProtocol] Queue full for ${targetSoulId}`);
            this.eventBus.emit(`soul:error:${event.from_soul}`, { error: 'QUEUE_FULL', target: targetSoulId });
            return;
        }
        queue.push({ type: 'message', event, status: 'pending' });
    }
    getSoulState(soulId) { return this.soulStates.get(soulId) || 'offline'; }
    getQueueDepth(soulId) { return this.queues.get(soulId)?.length || 0; }
    generateId() { return `${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`; }
}
exports.SoulProtocol = SoulProtocol;

// 自定义错误类
class SoulTimeoutError extends Error {
    constructor(caller, callee, elapsedMs, sessionId, message) {
        super(message || `Soul @ call timed out after ${elapsedMs}ms`);
        this.name = 'SoulTimeoutError';
        this.caller = caller; this.callee = callee;
        this.elapsedMs = elapsedMs; this.sessionId = sessionId;
    }
}
class QueueFullError extends Error {
    constructor(soulId) {
        super(`Soul ${soulId} queue is full (max ${MAX_QUEUE_DEPTH})`);
        this.name = 'QueueFullError'; this.soulId = soulId;
    }
}
class SoulNotFoundError extends Error {
    constructor(soulId) {
        super(`Soul ${soulId} not found`);
        this.name = 'SoulNotFoundError'; this.soulId = soulId;
    }
}
class SoulExecutionError extends Error {
    constructor(soulId, errorMsg, errorType) {
        super(`Soul ${soulId} execution failed: ${errorMsg}`);
        this.name = 'SoulExecutionError';
        this.soulId = soulId; this.errorType = errorType;
    }
}
