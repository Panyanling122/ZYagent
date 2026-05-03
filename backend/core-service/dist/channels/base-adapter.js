"use strict";
/**
 * =============================================================================
 * 模块名称：渠道适配器基类
 * 功能描述：所有渠道适配器的抽象基类，定义统一接口
 * 技术决策引用：#31 #32
 * 创建日期：2026-04-30
 * 最后修改：2026-04-30
 * =============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseChannelAdapter = void 0;
const logger_1 = require("../utils/logger");
class BaseChannelAdapter {
    logger;
    config;
    isRunning = false;
    messageHandler;
    constructor(config) {
        this.logger = logger_1.Logger.getInstance();
        this.config = config;
    }
    onMessage(handler) {
        this.messageHandler = handler;
    }
    emitMessage(msg) {
        if (this.messageHandler)
            this.messageHandler(msg);
    }
    get running() {
        return this.isRunning;
    }
}
exports.BaseChannelAdapter = BaseChannelAdapter;
//# sourceMappingURL=base-adapter.js.map