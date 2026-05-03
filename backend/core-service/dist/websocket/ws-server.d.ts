/**
 * =============================================================================
 * 模块名称：WebSocket 服务器
 * 功能描述：处理客户端连接，消息路由到 Soul 进程，支持单聊和群聊
 * =============================================================================
 */
import { Server as HTTPServer } from 'http';
import { WebSocket } from 'ws';
interface WSClient {
    socket: WebSocket;
    userId?: string;
    userName?: string;
    soulId?: string;
    groupId?: string;
    authenticated: boolean;
}
declare class WSServer {
    private wss;
    private clients;
    private soulManager;
    private groupService;
    private jwtSecret;
    constructor(server: HTTPServer, jwtSecret: string);
    private setupHandlers;
    private generateClientId;
    /**
     * 消息路由
     */
    private handleMessage;
    /**
     * 广播给所有订阅了指定群组的客户端
     */
    broadcastToGroup(groupId: string, payload: any): void;
    /**
     * 全局广播
     */
    broadcast(type: string, payload: any): void;
}
export { WSServer };
export type { WSClient };
//# sourceMappingURL=ws-server.d.ts.map