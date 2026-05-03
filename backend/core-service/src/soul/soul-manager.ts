/**
 * =============================================================================
 * 模块名称：Soul管理器
 * 功能描述：子进程隔离、自动重启、全局队列调度
 * 技术决策引用：#26 #27 #28 #29 #30
 * 创建日期：2026-04-30
 * 最后修改：2026-04-30
 * =============================================================================
 */

import { ChildProcess, fork } from "child_process";
import { Database } from "../utils/db";
import { Logger } from "../utils/logger";
import { Config } from "../utils/config";
import { EventBus } from "../events/event-bus";
import * as path from "path";

interface SoulData {
  id: string; name: string; status: string;
  bound_user_id: string | null; default_model: string;
  system_prompt: string; skills: string[]; groups: string[];
}

interface SoulProcess {
  soul: SoulData; process: ChildProcess | null;
  status: string; queue: Array<{ message: any; resolve: Function; reject: Function }>;
  isProcessing: boolean;
}

export class SoulManager {
  private static instance: SoulManager;
  private souls: Map<string, SoulProcess> = new Map();
  private db: Database; private logger: Logger;
  private config: Config; private eventBus: EventBus;
  private soulProcessPath: string;

  private constructor() {
    this.db = Database.getInstance();
    this.logger = Logger.getInstance();
    this.config = Config.getInstance();
    this.eventBus = EventBus.getInstance();
    // __dirname = dist/soul/, so go up one level then to soul-process.js
    this.soulProcessPath = path.resolve(__dirname, "./soul-process.js");
  }

  static getInstance(): SoulManager {
    if (!SoulManager.instance) { SoulManager.instance = new SoulManager(); }
    return SoulManager.instance;
  }

  async initialize(): Promise<void> {
    const result = await this.db.query<SoulData>(
      "SELECT * FROM souls WHERE status != 'paused' ORDER BY created_at"
    );
    for (const soul of result.rows) { await this.registerSoul(soul); }
    this.logger.info(`Initialized ${this.souls.size} souls`);
    setInterval(() => this.processQueues(), 100);
  }

  async registerSoul(soulData: SoulData): Promise<void> {
    this.souls.set(soulData.id, {
      soul: soulData, process: null, status: "offline",
      queue: [], isProcessing: false,
    });
    await this.startSoul(soulData.id);
  }

  async startSoul(soulId: string): Promise<void> {
    const sp = this.souls.get(soulId);
    if (!sp || sp.process) return;
    try {
      const child = fork(this.soulProcessPath, [soulId], {
        silent: true, env: { ...process.env, SOUL_ID: soulId },
      });
      child.stdout?.on("data", (d) => this.logger.info(`[${sp.soul.name}] ${d.toString().trim()}`));
      child.stderr?.on("data", (d) => this.logger.error(`[${sp.soul.name}] ${d.toString().trim()}`));
      child.on("message", (msg: any) => this.handleSoulMessage(soulId, msg));
      child.on("exit", (code) => {
        sp.process = null;
        sp.status = code === 0 ? "offline" : "error";
        setTimeout(() => this.startSoul(soulId), 5000);
      });
      sp.process = child; sp.status = "online";
      this.logger.info(`Soul ${sp.soul.name} started (PID: ${child.pid})`);
    } catch (err: any) {
      this.logger.error(`Failed to start soul ${sp.soul.name}:`, err.message);
      sp.status = "error";
    }
  }

  async stopSoul(soulId: string): Promise<void> {
    const sp = this.souls.get(soulId);
    if (!sp || !sp.process) return;
    try { sp.process.send({ type: "shutdown" }); } catch { /* 进程已断开 */ }
    sp.status = "offline";
    setTimeout(() => { if (sp.process && !sp.process.killed) sp.process.kill("SIGKILL"); }, 10000);
  }

  async sendMessage(soulId: string, message: any): Promise<any> {
    const sp = this.souls.get(soulId);
    if (!sp) throw new Error(`Soul ${soulId} not found`);
    if (sp.status === "error" || sp.status === "paused") throw new Error(`Soul ${sp.soul.name} is ${sp.status}`);
    return new Promise((resolve, reject) => {
      sp.queue.push({ message, resolve, reject });
      if (sp.queue.length > this.config.maxQueueDepth) { const d = sp.queue.shift(); this.logger.warn(`[Soul:${sp.soul.name}] Queue full (${this.config.maxQueueDepth}), dropping message`); d?.reject(new Error("Queue full")); }
    });
  }

  private async processQueues(): Promise<void> {
    for (const [soulId, sp] of this.souls) {
      if (sp.isProcessing || sp.queue.length === 0) continue;
      if (!sp.process || sp.status !== "online") continue;
      sp.isProcessing = true; const item = sp.queue.shift()!;
      try {
        sp.process.send({ type: "chat", message: (typeof item.message === "string" ? item.message : item.message.content || item.message.message || JSON.stringify(item.message)) });
        const to = setTimeout(() => { item.reject(new Error("Timeout")); sp.isProcessing = false; }, this.config.soulTimeoutMs);
        const messageHandler = (msg: any) => {
          if (msg.type === "stream_chunk") {
            this.eventBus.emit(`stream:${soulId}`, msg.data);
            return; // 继续等待response
          }
          if (msg.type === "response") {
            sp.process!.off("message", messageHandler);
            clearTimeout(to);
            item.resolve(msg.data || { content: "" });
            sp.isProcessing = false;
          } else if (msg.type === "error") {
            sp.process!.off("message", messageHandler);
            clearTimeout(to);
            item.reject(new Error(msg.error || "Soul处理错误"));
            sp.isProcessing = false;
          }
        };
        sp.process.on("message", messageHandler);
      } catch (err: any) { item.reject(err); sp.isProcessing = false; }
    }
  }

  private handleSoulMessage(soulId: string, msg: any): void {
    switch (msg.type) {
      case "ready": this.logger.info(`Soul ${soulId} ready`); break;
      case "progress": this.eventBus.emit(`progress:${soulId}`, msg.data); break;
      case "error": this.logger.error(`Soul ${soulId} error:`, msg.data); break;
    }
  }

  getActiveSouls(): string[] {
    return Array.from(this.souls.entries())
      .filter(([_, sp]) => sp.status === "online")
      .map(([id, _]) => id);
  }

  async shutdown(): Promise<void> {
    this.logger.info("Shutting down all souls...");
    await Promise.all(Array.from(this.souls.keys()).map((id) => this.stopSoul(id)));
    this.logger.info("All souls stopped");
  }
}

