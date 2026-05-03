"use strict";
/**
 * =============================================================================
 * 模块名称：Skill沙箱执行引擎
 * 功能描述：安全隔离的JavaScript代码执行环境，限制执行时间和资源
 * 技术决策引用：#47 #48 #49 #50
 * 创建日期：2026-04-30
 * =============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkillSandbox = void 0;
const vm_1 = require("vm");
const logger_1 = require("./logger");
/** 安全的沙箱执行环境 */
class SkillSandbox {
    logger;
    /** 沙箱配置常量 */
    static CONFIG = {
        /** 最大执行时间(毫秒) - 决策#49 */
        TIMEOUT_MS: 5000,
        /** 最大输出长度 */
        MAX_OUTPUT_LENGTH: 10000,
        /** 最大日志条数 */
        MAX_LOGS: 100,
    };
    constructor() {
        this.logger = logger_1.Logger.getInstance();
    }
    /**
     * 在沙箱中执行Skill代码
     * @param code - Skill JavaScript代码
     * @param ctx - 执行上下文（消息/参数/对话历史等）
     * @returns 执行结果
     */
    execute(code, ctx) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const logs = [];
            // 创建安全的日志收集器
            const safeConsole = {
                log: (...args) => {
                    const line = args.map((a) => String(a)).join(" ");
                    if (logs.length < SkillSandbox.CONFIG.MAX_LOGS) {
                        logs.push(`[LOG] ${line}`);
                    }
                },
                error: (...args) => {
                    const line = args.map((a) => String(a)).join(" ");
                    if (logs.length < SkillSandbox.CONFIG.MAX_LOGS) {
                        logs.push(`[ERR] ${line}`);
                    }
                },
                warn: (...args) => {
                    const line = args.map((a) => String(a)).join(" ");
                    if (logs.length < SkillSandbox.CONFIG.MAX_LOGS) {
                        logs.push(`[WARN] ${line}`);
                    }
                },
            };
            // 创建安全的数学工具
            const safeMath = Object.create(Math);
            // 创建沙箱上下文 - 仅暴露安全的全局对象
            const sandboxContext = (0, vm_1.createContext)({
                // 日志输出
                console: safeConsole,
                // 数学计算
                Math: safeMath,
                // 基础工具
                JSON: JSON,
                Date: Date,
                String: String,
                Number: Number,
                Boolean: Boolean,
                Array: Array,
                Object: Object,
                RegExp: RegExp,
                Error: Error,
                TypeError: TypeError,
                RangeError: RangeError,
                SyntaxError: SyntaxError,
                ReferenceError: ReferenceError,
                Promise: Promise,
                Set: Set,
                Map: Map,
                // 工具函数
                parseInt: parseInt,
                parseFloat: parseFloat,
                isNaN: isNaN,
                isFinite: isFinite,
                encodeURI: encodeURI,
                decodeURI: decodeURI,
                encodeURIComponent: encodeURIComponent,
                decodeURIComponent: decodeURIComponent,
                escape: (str) => str.replace(/[^A-Za-z0-9@*_+\-./]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`),
                unescape: (str) => str.replace(/%([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))),
                // Skill输入参数
                message: ctx.message,
                args: ctx.args,
                soulName: ctx.soulName,
                conversation: ctx.conversation,
                knowledge: ctx.knowledge || "",
                // 输出函数
                output: "",
                setOutput: function (v) { sandboxContext.output = v; },
                // 时间限制检查
                __startTime: startTime,
                __timeout: SkillSandbox.CONFIG.TIMEOUT_MS,
                // 安全标记
                __isSandbox: true,
            });
            // 包装用户代码：添加超时检查和输出捕获
            const wrappedCode = `
        (async function() {
          "use strict";
          // 超时检查函数
          function checkTimeout() {
            if (Date.now() - __startTime > __timeout) {
              throw new Error("Skill执行超时(" + __timeout + "ms)");
            }
          }
          // 定期插入超时检查
          var __originalSetInterval = null;
          checkTimeout();

          try {
            ${code}
            // 如果代码没有调用setOutput，尝试使用最后一条表达式结果
            if (output === "" && typeof result !== "undefined") {
              output = String(result);
            }
          } catch (e) {
            console.error("Skill执行错误: " + e.message);
            throw e;
          }
          checkTimeout();
        })()
      `;
            // 设置硬超时 - 决策#49
            const timeoutHandle = setTimeout(() => {
                resolve({
                    success: false,
                    output: "",
                    duration: Date.now() - startTime,
                    error: `Skill执行超时(${SkillSandbox.CONFIG.TIMEOUT_MS}ms)`,
                    logs,
                });
            }, SkillSandbox.CONFIG.TIMEOUT_MS + 100); // +100ms缓冲
            try {
                // 编译脚本（提前编译可发现语法错误）
                // 编译脚本（提前编译可发现语法错误）
                const script = new vm_1.Script(wrappedCode);
                // 在沙箱上下文中执行（带超时保护）
                script.runInContext(sandboxContext, {
                    timeout: SkillSandbox.CONFIG.TIMEOUT_MS,
                    displayErrors: true,
                });
                // 获取异步结果（Promise）
                const asyncResult = sandboxContext.output;
                // 清理超时定时器
                clearTimeout(timeoutHandle);
                const duration = Date.now() - startTime;
                let output = asyncResult || "";
                // 截断过长的输出
                if (output.length > SkillSandbox.CONFIG.MAX_OUTPUT_LENGTH) {
                    output = output.substring(0, SkillSandbox.CONFIG.MAX_OUTPUT_LENGTH) + "\n...[输出已截断]";
                }
                resolve({
                    success: true,
                    output,
                    duration,
                    logs,
                });
            }
            catch (err) {
                clearTimeout(timeoutHandle);
                const duration = Date.now() - startTime;
                // 分类错误类型
                let errorMsg = err.message || String(err);
                if (errorMsg.includes("timeout")) {
                    errorMsg = `执行超时(${SkillSandbox.CONFIG.TIMEOUT_MS}ms)`;
                }
                else if (errorMsg.includes("is not defined")) {
                    errorMsg = `变量未定义: ${errorMsg}`;
                }
                resolve({
                    success: false,
                    output: "",
                    duration,
                    error: errorMsg,
                    logs,
                });
            }
        });
    }
}
exports.SkillSandbox = SkillSandbox;
//# sourceMappingURL=skill-sandbox.js.map