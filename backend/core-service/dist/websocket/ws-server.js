"use strict";
/**
 * =============================================================================
 * 模块名称：WebSocket 服务器
 * 功能描述：连接管理 + 消息路由，处理逻辑移交 MessageRouter
 * =============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketServer = void 0;
const ws_1 = require("ws");
const http_1 = require("http");
const message_router_1 = require("./message-router");
class WSServer {
    wss;
    clients = new Map();
    router;
    server;
    port;
    constructor(serverOrPort) {
        if (typeof serverOrPort === 'number') {
            this.port = serverOrPort;
            this.server = (0, http_1.createServer)();
            this.wss = new ws_1.WebSocketServer({ server: this.server, path: '/ws' });
        } else {
            this.server = serverOrPort;
            this.wss = new ws_1.WebSocketServer({ server: this.server, path: '/ws' });
        }
        this.router = new message_router_1.MessageRouter(this.wss, this.clients);
        this.setupHandlers();
    }
    start() {
        if (this.port) {
            this.server.listen(this.port, () => {
                console.log(`[WS] WebSocket server listening on port ${this.port}`);
            });
        }
    }
    stop() {
        this.wss?.close();
        this.server?.close();
    }
    setupHandlers() {
        this.wss.on('connection', (socket) => {
            const clientId = this.generateClientId();
            this.clients.set(clientId, { socket, authenticated: false, lastPing: Date.now() });
            socket.on('message', async (raw) => {
                try {
                    const msg = JSON.parse(raw.toString());
                    const client = this.clients.get(clientId);
                    if (!client)
                        return;
                    await this.router.handle(clientId, msg, client);
                }
                catch (err) {
                    socket.send(JSON.stringify({ type: 'error', error: 'Invalid message format' }));
                }
            });
            socket.on('close', () => this.clients.delete(clientId));
            socket.on('error', (err) => console.error(`[WS] Client ${clientId} error:`, err));
            socket.on('pong', () => {
                const client = this.clients.get(clientId);
                if (client)
                    client.lastPing = Date.now();
            });
        });
        // 心跳检测
        setInterval(() => this.heartbeat(), 30000);
    }
    heartbeat() {
        const now = Date.now();
        for (const [clientId, client] of this.clients) {
            if (now - (client.lastPing || 0) > 300000) {
                client.socket.close();
                this.clients.delete(clientId);
            }
            else {
                try {
                    client.socket.ping();
                }
                catch {
                    client.socket.close();
                    this.clients.delete(clientId);
                }
            }
        }
    }
    broadcast(type, payload) {
        const msg = JSON.stringify({ type, ...payload });
        for (const client of this.clients.values()) {
            if (client.socket.readyState === ws_1.WebSocket.OPEN)
                client.socket.send(msg);
        }
    }
    broadcastToGroup(groupId, payload) {
        for (const client of this.clients.values()) {
            if (client.groupId === groupId && client.socket.readyState === ws_1.WebSocket.OPEN) {
                this.router.safeSend(client.socket, { type: 'group_broadcast', ...payload });
            }
        }
    }
    generateClientId() {
        return `ws_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
    }
}
exports.WebSocketServer = WSServer;
