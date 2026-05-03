/**
 * =============================================================================
 * 模块名称：共享类型定义
 * 功能描述：Soul消息、渠道消息、内存项等核心数据结构类型定义。被soul-process、channel-manager、memory-service共享引用。
 * 技术决策引用：#10
 * 创建日期：2026-04-30
 * =============================================================================
 */
export interface Soul {
    id: string;
    name: string;
    status: SoulStatus;
    boundUserId: string | null;
    defaultModel: string;
    systemPrompt: string;
    dailySummaryTime: string;
    maxTokensPerDay: number;
    usedTokensToday: number;
    skills: string[];
    groups: string[];
    createdAt: Date;
    updatedAt: Date;
}
export type SoulStatus = "online" | "offline" | "busy" | "error" | "paused";
export interface User {
    id: string;
    username: string;
    passwordHash: string;
    boundSoulId: string | null;
    permissions: Permission[];
    isAdmin: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export type Permission = "soul:manage" | "skill:manage" | "memory:manage" | "log:view" | "token:view" | "group:manage" | "user:manage";
export interface Message {
    id: string;
    soulId: string;
    channel: ChannelType;
    role: "user" | "assistant" | "system";
    content: string;
    thinkingContent?: string;
    type: MessageType;
    status: MessageStatus;
    metadata: MessageMetadata;
    createdAt: Date;
}
export type ChannelType = "websocket" | "wechat" | "feishu";
export type MessageType = "text" | "image" | "file" | "video" | "voice";
export type MessageStatus = "pending" | "sent" | "delivered" | "read" | "failed";
export interface MessageMetadata {
    fileUrl?: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    quotedMessageId?: string;
    retryCount?: number;
}
export interface L1Context {
    id: string;
    soulId: string;
    messages: ContextMessage[];
    isActive: boolean;
    lastActiveAt: Date;
    createdAt: Date;
}
export interface ContextMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    type: MessageType;
    timestamp: Date;
}
export interface L2Summary {
    id: string;
    soulId: string;
    topic: string;
    summary: string;
    date: string;
    messageCount: number;
    embedding: number[] | null;
    createdAt: Date;
}
export interface L3Knowledge {
    id: string;
    soulId: string;
    topic: string;
    content: string;
    metadata: L3Metadata;
    embedding: number[] | null;
    lastMergedAt: Date;
    createdAt: Date;
    updatedAt: Date;
}
export interface L3Metadata {
    sourceL2Ids: string[];
    mergeCount: number;
    isEdited: boolean;
}
export interface Skill {
    id: string;
    name: string;
    version: string;
    description: string;
    code: string;
    skillMd: string;
    dependsOn: string[];
    boundSouls: string[];
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export interface Group {
    id: string;
    name: string;
    description: string;
    memberSoulIds: string[];
    status: "active" | "archived";
    createdAt: Date;
    updatedAt: Date;
}
export interface GroupMessage {
    id: string;
    groupId: string;
    fromSoulId: string;
    toSoulId: string;
    content: string;
    type: "request" | "response" | "progress";
    status: "pending" | "processing" | "completed" | "failed";
    createdAt: Date;
}
export interface ScheduledTask {
    id: string;
    soulId: string;
    type: "user" | "system";
    cron: string;
    description: string;
    skillId: string | null;
    channel: ChannelType;
    isActive: boolean;
    lastRunAt: Date | null;
    nextRunAt: Date | null;
    createdAt: Date;
}
export interface TokenUsage {
    id: string;
    soulId: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    date: string;
    hour: number;
    createdAt: Date;
}
export interface AuditLog {
    id: string;
    userId: string;
    action: string;
    resource: string;
    resourceId: string;
    details: Record<string, any>;
    ip: string;
    createdAt: Date;
}
export interface Alert {
    id: string;
    type: AlertType;
    soulId: string | null;
    severity: "info" | "warning" | "critical";
    message: string;
    isResolved: boolean;
    createdAt: Date;
    resolvedAt: Date | null;
}
export type AlertType = "soul_offline" | "token_exceeded" | "api_key_invalid" | "group_collaboration_failed" | "scheduled_task_failed";
export interface WSEvent {
    type: WSEventType;
    payload: any;
    timestamp: number;
}
export type WSEventType = "auth" | "auth_success" | "auth_error" | "message" | "message_chunk" | "thinking" | "progress" | "progress_complete" | "read_receipt" | "error" | "ping" | "pong";
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    code: string;
}
export interface PaginatedResult<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}
//# sourceMappingURL=index.d.ts.map