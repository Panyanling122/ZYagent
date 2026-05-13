"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeishuAdapter = void 0;
class FeishuAdapter {
    constructor(logger) { this.logger = logger; }
    async sendMessage(userId, content, options) {
        return { success: true, messageId: `feishu-${Date.now()}` };
    }
    async handleWebhook(payload) {
        return { handled: true };
    }
}
exports.FeishuAdapter = FeishuAdapter;
