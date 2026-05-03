/**
 * =============================================================================
 * 模块名称：Soul 进程管理
 * 功能描述：每个 Soul 独立子进程，支持单聊和群聊消息队列
 * =============================================================================
 */
import { EventEmitter } from 'events';
interface SoulConfig {
    id: string;
    name: string;
    systemPrompt: string;
    defaultModel: string;
}
declare class SoulProcessManager extends EventEmitter {
    private static instance;
    private souls;
    private gateway;
    private busy;
    private queues;
    private pendingResponses;
    private constructor();
    static getInstance(): SoulProcessManager;
    /**
     * 启动 Soul 子进程
     */
    startSoul(soulId: string): Promise<void>;
    /**
     * 停止 Soul 子进程
     */
    stopSoul(soulId: string): Promise<void>;
    /**
     * 发送消息到指定 Soul（支持队列）
     * @returns AI 回复内容
     */
    sendMessage(soulId: string, type: 'chat' | 'group', payload: any): Promise<string>;
    private dispatch;
    private processNext;
    /**
     * 处理单聊请求（兼容旧接口）
     */
    handleChat(soulId: string, payload: {
        messages: any[];
    }): Promise<string>;
    /**
     * 获取活跃的 Soul 数量
     */
    getActiveCount(): number;
    /**
     * 判断 Soul 是否忙碌
     */
    isBusy(soulId: string): boolean;
}
export { SoulProcessManager };
export type { SoulConfig };
//# sourceMappingURL=soul-process.d.ts.map