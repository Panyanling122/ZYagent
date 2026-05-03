/**
 * =============================================================================
 * 模块名称：Skill沙箱执行引擎
 * 功能描述：安全隔离的JavaScript代码执行环境，限制执行时间和资源
 * 技术决策引用：#47 #48 #49 #50
 * 创建日期：2026-04-30
 * =============================================================================
 */
/** Skill执行上下文参数 */
interface SkillContext {
    /** 用户原始消息 */
    message: string;
    /** Skill参数 */
    args: string;
    /** Soul名称 */
    soulName: string;
    /** 当前对话上下文 */
    conversation: Array<{
        role: string;
        content: string;
    }>;
    /** 知识库数据 */
    knowledge?: string;
}
/** Skill执行结果 */
interface SkillResult {
    /** 是否成功 */
    success: boolean;
    /** 执行输出 */
    output: string;
    /** 执行耗时(ms) */
    duration: number;
    /** 错误信息(如有) */
    error?: string;
    /** 日志输出 */
    logs: string[];
}
/** 安全的沙箱执行环境 */
export declare class SkillSandbox {
    private logger;
    /** 沙箱配置常量 */
    private static readonly CONFIG;
    constructor();
    /**
     * 在沙箱中执行Skill代码
     * @param code - Skill JavaScript代码
     * @param ctx - 执行上下文（消息/参数/对话历史等）
     * @returns 执行结果
     */
    execute(code: string, ctx: SkillContext): Promise<SkillResult>;
}
export {};
//# sourceMappingURL=skill-sandbox.d.ts.map