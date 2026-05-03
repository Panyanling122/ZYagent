"use strict";
/**
 * =============================================================================
 * 模块名称：Soul管理器
 * 功能描述：子进程隔离、自动重启、全局队列调度
 * 技术决策引用：#26 #27 #28 #29 #30
 * 创建日期：2026-04-30
 * 最后修改：2026-04-30
 * =============================================================================
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SoulManager = void 0;
const child_process_1 = require("child_process");
const db_1 = require("../utils/db");
const logger_1 = require("../utils/logger");
const config_1 = require("../utils/config");
const event_bus_1 = require("../events/event-bus");
const path = __importStar(require("path"));
class SoulManager {
    static instance;
    souls = new Map();
    db;
    logger;
    config;
    eventBus;
    soulProcessPath;
    constructor() {
        this.db = db_1.Database.getInstance();
        this.logger = logger_1.Logger.getInstance();
        this.config = config_1.Config.getInstance();
        this.eventBus = event_bus_1.EventBus.getInstance();
        // __dirname = dist/soul/, so go up one level then to soul-process.js
        this.soulProcessPath = path.resolve(__dirname, "./soul-process.js");
    }
    static getInstance() {
        if (!SoulManager.instance) {
            SoulManager.instance = new SoulManager();
        }
        return SoulManager.instance;
    }
    async initialize() {
        const result = await this.db.query("SELECT * FROM souls WHERE status != 'paused' ORDER BY created_at");
        for (const soul of result.rows) {
            await this.registerSoul(soul);
        }
        this.logger.info(`Initialized ${this.souls.size} souls`);
        setInterval(() => this.processQueues(), 100);
    }
    async registerSoul(soulData) {
        this.souls.set(soulData.id, {
            soul: soulData, process: null, status: "offline",
            queue: [], isProcessing: false,
        });
        await this.startSoul(soulData.id);
    }
    async startSoul(soulId) {
        const sp = this.souls.get(soulId);
        if (!sp || sp.process)
            return;
        try {
            const child = (0, child_process_1.fork)(this.soulProcessPath, [soulId], {
                silent: true, env: { ...process.env, SOUL_ID: soulId },
            });
            child.stdout?.on("data", (d) => this.logger.info(`[${sp.soul.name}] ${d.toString().trim()}`));
            child.stderr?.on("data", (d) => this.logger.error(`[${sp.soul.name}] ${d.toString().trim()}`));
            child.on("message", (msg) => this.handleSoulMessage(soulId, msg));
            child.on("exit", (code) => {
                sp.process = null;
                sp.status = code === 0 ? "offline" : "error";
                setTimeout(() => this.startSoul(soulId), 5000);
            });
            sp.process = child;
            sp.status = "online";
            this.logger.info(`Soul ${sp.soul.name} started (PID: ${child.pid})`);
        }
        catch (err) {
            this.logger.error(`Failed to start soul ${sp.soul.name}:`, err.message);
            sp.status = "error";
        }
    }
    async stopSoul(soulId) {
        const sp = this.souls.get(soulId);
        if (!sp || !sp.process)
            return;
        try {
            sp.process.send({ type: "shutdown" });
        }
        catch { /* 进程已断开 */ }
        sp.status = "offline";
        setTimeout(() => { if (sp.process && !sp.process.killed)
            sp.process.kill("SIGKILL"); }, 10000);
    }
    async sendMessage(soulId, message) {
        const sp = this.souls.get(soulId);
        if (!sp)
            throw new Error(`Soul ${soulId} not found`);
        if (sp.status === "error" || sp.status === "paused")
            throw new Error(`Soul ${sp.soul.name} is ${sp.status}`);
        return new Promise((resolve, reject) => {
            sp.queue.push({ message, resolve, reject });
            if (sp.queue.length > this.config.maxQueueDepth) {
                const d = sp.queue.shift();
                this.logger.warn(`[Soul:${sp.soul.name}] Queue full (${this.config.maxQueueDepth}), dropping message`);
                d?.reject(new Error("Queue full"));
            }
        });
    }
    async processQueues() {
        for (const [soulId, sp] of this.souls) {
            if (sp.isProcessing || sp.queue.length === 0)
                continue;
            if (!sp.process || sp.status !== "online")
                continue;
            sp.isProcessing = true;
            const item = sp.queue.shift();
            try {
                sp.process.send({ type: "chat", message: (typeof item.message === "string" ? item.message : item.message.content || item.message.message || JSON.stringify(item.message)) });
                const to = setTimeout(() => { item.reject(new Error("Timeout")); sp.isProcessing = false; }, this.config.soulTimeoutMs);
                const messageHandler = (msg) => {
                    if (msg.type === "stream_chunk") {
                        this.eventBus.emit(`stream:${soulId}`, msg.data);
                        return; // 继续等待response
                    }
                    if (msg.type === "response") {
                        sp.process.off("message", messageHandler);
                        clearTimeout(to);
                        item.resolve(msg.data || { content: "" });
                        sp.isProcessing = false;
                    }
                    else if (msg.type === "error") {
                        sp.process.off("message", messageHandler);
                        clearTimeout(to);
                        item.reject(new Error(msg.error || "Soul处理错误"));
                        sp.isProcessing = false;
                    }
                };
                sp.process.on("message", messageHandler);
            }
            catch (err) {
                item.reject(err);
                sp.isProcessing = false;
            }
        }
    }
    handleSoulMessage(soulId, msg) {
        switch (msg.type) {
            case "ready":
                this.logger.info(`Soul ${soulId} ready`);
                break;
            case "progress":
                this.eventBus.emit(`progress:${soulId}`, msg.data);
                break;
            case "error":
                this.logger.error(`Soul ${soulId} error:`, msg.data);
                break;
        }
    }
    getActiveSouls() {
        return Array.from(this.souls.entries())
            .filter(([_, sp]) => sp.status === "online")
            .map(([id, _]) => id);
    }
    async shutdown() {
        this.logger.info("Shutting down all souls...");
        await Promise.all(Array.from(this.souls.keys()).map((id) => this.stopSoul(id)));
        this.logger.info("All souls stopped");
    }
}
exports.SoulManager = SoulManager;
//# sourceMappingURL=soul-manager.js.map