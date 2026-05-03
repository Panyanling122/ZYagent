/**
 * =============================================================================
 * 模块名称：事件总线
 * 功能描述：内存事件发布订阅，Soul间通信
 * 技术决策引用：#87
 * 创建日期：2026-04-30
 * 最后修改：2026-04-30
 * =============================================================================
 */
export declare class EventBus {
    private static instance;
    private emitter;
    private logger;
    private config;
    private constructor();
    static getInstance(): EventBus;
    on(event: string, listener: (data: any) => void): void;
    off(event: string, listener: (data: any) => void): void;
    emit(event: string, data: any): boolean;
    once(event: string, listener: (data: any) => void): void;
}
//# sourceMappingURL=event-bus.d.ts.map