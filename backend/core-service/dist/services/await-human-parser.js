"use strict";
/**
 * =============================================================================
 * 模块名称：Await Human 解析器
 * 功能描述：解析 Soul 响应中的 [AWAIT_HUMAN] 标记，自动创建挂起任务
 * =============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AwaitHumanParser = void 0;
const task_service_1 = require("./task-service");
const logger_1 = require("../utils/logger");
class AwaitHumanParser {
    static instance;
    logger;
    constructor() {
        this.logger = logger_1.Logger.getInstance();
    }
    static getInstance() {
        if (!AwaitHumanParser.instance) AwaitHumanParser.instance = new AwaitHumanParser();
        return AwaitHumanParser.instance;
    }

    /**
     * 解析响应中的 [AWAIT_HUMAN] 标记
     * 格式: [AWAIT_HUMAN:question="...",options="同意|拒绝|修改",timeout=24,urgency=normal]
     * 返回解析结果，如果没有标记返回 null
     */
    parse(response) {
        const marker = response.match(/\[AWAIT_HUMAN:([^\]]+)\]/);
        if (!marker) return null;
        const params = marker[1];
        const question = this.extractParam(params, 'question');
        if (!question) return null;
        const optionsStr = this.extractParam(params, 'options');
        const options = optionsStr ? optionsStr.split(/[|,]/).map(o => o.trim()) : ['同意', '拒绝'];
        const timeout = parseInt(this.extractParam(params, 'timeout') || '24', 10);
        const urgency = this.extractParam(params, 'urgency') || 'normal';
        return {
            question,
            options,
            timeout,
            urgency,
            rawMarker: marker[0],
        };
    }

    extractParam(params, key) {
        const regex = new RegExp(`${key}=["']([^"']+)["']`);
        const match = params.match(regex);
        if (match) return match[1];
        // 尝试无引号数字
        const numMatch = params.match(new RegExp(`${key}=(\\d+)`));
        return numMatch ? numMatch[1] : null;
    }

    /**
     * 处理 await_human 标记：创建任务、挂起、发送格式化消息
     */
    async process(soulId, userId, workspaceId, response, channel, topic, context) {
        try {
            const parsed = this.parse(response);
            if (!parsed) return null;
            const taskService = task_service_1.TaskService.getInstance();
            const db = require("../utils/db").Database.getInstance();
            // ... rest of existing code ...
            return {
                taskId: task.id,
                formattedMessage: formatted,
                cleanResponse: response.replace(parsed.rawMarker, '').trim(),
                question: parsed.question,
                options: parsed.options,
            };
        } catch (err) {
            this.logger.error(`[AwaitHuman] process failed:`, err.message);
            throw err;
        }
    }
        // 检查是否有同一 soul 的 in_progress 任务可复用（多轮确认）
        const existing = await db.query(
            `SELECT id FROM tasks WHERE soul_id = $1 AND workspace_id = $2 AND status = 'in_progress' ORDER BY updated_at DESC LIMIT 1`,
            [soulId, workspaceId]
        );
        let task;
        if (existing.rows[0]) {
            // 复用现有任务，再次挂起
            task = { id: existing.rows[0].id };
            await db.query(
                `UPDATE tasks SET status = 'awaiting_human', awaiting_response = $1, response_deadline = $2, updated_at = NOW() WHERE id = $3`,
                [parsed.question, new Date(Date.now() + parsed.timeout * 3600000), task.id]
            );
            await db.query(
                `INSERT INTO task_history (task_id, from_status, to_status, changed_by, reason, created_at) VALUES ($1, $2, $3, $4, $5, NOW())`,
                [task.id, 'in_progress', 'awaiting_human', 'system', `Round 2+: ${parsed.question}`]
            );
            this.logger.info(`[AwaitHuman] Task #${task.id} re-suspended (multi-round): ${parsed.question}`);
        } else {
            // 创建新任务
            task = await taskService.create({
                workspace_id: workspaceId,
                title: parsed.question.substring(0, 50),
                description: parsed.question,
                type: 'mixed',
                status: 'in_progress',
                priority: parsed.urgency === 'urgent' ? 'p0' : parsed.urgency === 'high' ? 'p1' : 'p2',
                soul_id: soulId,
                topic: topic || null,
                channel: channel || 'wechat',
                created_by: userId,
                assigned_to: userId,
                execution_context: context || null,
            });
            await taskService.suspendForHuman(task.id, workspaceId, parsed.question, parsed.timeout);
            this.logger.info(`[AwaitHuman] Task #${task.id} suspended: ${parsed.question}`);
        }
        // 返回格式化消息给微信用户
        const formatted = this.formatWechatMessage(task.id, parsed.question, parsed.options, parsed.urgency);
        return {
            taskId: task.id,
            formattedMessage: formatted,
            cleanResponse: response.replace(parsed.rawMarker, '').trim(),
            question: parsed.question,
            options: parsed.options,
        };
    }

    /**
     * 格式化微信消息（纯文本，含 #ID 和选项）
     */
    formatWechatMessage(taskId, question, options, urgency) {
        const icon = urgency === 'urgent' ? '🚨' : urgency === 'high' ? '⚠️' : '📋';
        let msg = `${icon} 待办任务 #${taskId}\n━━━━━━━━━━━━━━━━━━\n${question}\n\n请回复：\n`;
        options.forEach((opt, i) => {
            msg += `${i + 1}. 【${opt}】\n`;
        });
        msg += `━━━━━━━━━━━━━━━━━━\n回复时包含 #${taskId} 可快速匹配`;
        return msg;
    }

    /**
     * 在系统提示中注入 await_human 工具说明
     */
    injectSystemPrompt(originalPrompt) {
        const toolDesc = `
【await_human 工具】
当你需要人类做决策、确认、提供信息时，在响应末尾添加标记：
[AWAIT_HUMAN:question="你的问题",options="选项1|选项2|选项3",timeout=24,urgency=normal]
参数说明：
- question: 询问内容（必填）
- options: 可选回复，用 | 分隔（默认：同意|拒绝）
- timeout: 超时时间小时数（默认24）
- urgency: 紧急程度 low/normal/high/urgent（默认normal）
调用时机：涉及金额审批、方案确认、信息不足、多选项选择。
`;
        return originalPrompt + '\n' + toolDesc;
    }
}
exports.AwaitHumanParser = AwaitHumanParser;
