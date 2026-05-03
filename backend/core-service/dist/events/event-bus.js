"use strict";
/**
 * =============================================================================
 * 模块名称：事件总线
 * 功能描述：内存事件发布订阅，Soul间通信
 * 技术决策引用：#87
 * 创建日期：2026-04-30
 * 最后修改：2026-04-30
 * =============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventBus = void 0;
const events_1 = require("events");
const config_1 = require("../utils/config");
const logger_1 = require("../utils/logger");
class EventBus {
    static instance;
    emitter;
    logger;
    config;
    constructor() {
        this.emitter = new events_1.EventEmitter();
        this.emitter.setMaxListeners(100);
        this.logger = logger_1.Logger.getInstance();
        this.config = config_1.Config.getInstance();
    }
    static getInstance() {
        if (!EventBus.instance) {
            EventBus.instance = new EventBus();
        }
        return EventBus.instance;
    }
    on(event, listener) {
        this.emitter.on(event, listener);
    }
    off(event, listener) {
        this.emitter.off(event, listener);
    }
    emit(event, data) {
        this.logger.debug(`Event: ${event}`);
        return this.emitter.emit(event, data);
    }
    once(event, listener) {
        this.emitter.once(event, listener);
    }
}
exports.EventBus = EventBus;
//# sourceMappingURL=event-bus.js.map