/**
 * =============================================================================
 * 模块名称：事件总线
 * 功能描述：内存事件发布订阅，Soul间通信
 * 技术决策引用：#87
 * 创建日期：2026-04-30
 * 最后修改：2026-04-30
 * =============================================================================
 */

import { EventEmitter } from "events";
import { Config } from "../utils/config";
import { Logger } from "../utils/logger";

export class EventBus {
  private static instance: EventBus;
  private emitter: EventEmitter;
  private logger: Logger;
  private config: Config;

  private constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(100);
    this.logger = Logger.getInstance();
    this.config = Config.getInstance();
  }

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  on(event: string, listener: (data: any) => void): void {
    this.emitter.on(event, listener);
  }

  off(event: string, listener: (data: any) => void): void {
    this.emitter.off(event, listener);
  }

  emit(event: string, data: any): boolean {
    this.logger.debug(`Event: ${event}`);
    return this.emitter.emit(event, data);
  }

  once(event: string, listener: (data: any) => void): void {
    this.emitter.once(event, listener);
  }
}

