"use strict";
/**
 * =============================================================================
 * 模块名称：WebSocket 服务器
 * 功能描述：处理客户端连接，消息路由到 Soul 进程，支持单聊和群聊
 * =============================================================================
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WSServer = exports.WebSocketServer = void 0;
const ws_1 = require("ws");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const soul_process_1 = require("../soul/soul-process");
const group_service_1 = require("../soul/group-service");
const topic_service_1 = require("../soul/topic-service");
const context_engine_1 = require("../context/context-engine");
const http_1 = require("http");
class WSServer {
    wss;
    clients = new Map();
    soulManager;
    groupService;
    topicService;
    contextEngine;
    jwtSecret;
    server;
    port;
    constructor(serverOrPort, jwtSecret) {
        if (typeof serverOrPort === 'number') {
            this.port = serverOrPort;
            this.jwtSecret = jwtSecret || process.env.JWT_SECRET || 'default-jwt-secret';
        }
        else {
            this.server = serverOrPort;
            this.jwtSecret = jwtSecret || process.env.JWT_SECRET || 'default-jwt-secret';
            this.wss = new ws_1.WebSocketServer({ server: this.server, path: '/ws' });
            this.setupAfterWSS();
        }
    }
    setupAfterWSS() {
        this.soulManager = soul_process_1.SoulProcessManager.getInstance();
        this.groupService = group_service_1.GroupService.getInstance();
        this.topicService = topic_service_1.TopicService.getInstance();
        this.contextEngine = context_engine_1.ContextEngine.getInstance();
        // 监听 GroupService 广播事件，转发给所有订阅了该群组的客户端
        if (typeof this.groupService.on === 'function') this.groupService.on('group_broadcast', (payload) => {
            this.broadcastToGroup(payload.groupId, payload);
        });
        this.setupHandlers();
    }
    start() {
        if (this.wss) {
            return; // already started with server
        }
        this.server = (0, http_1.createServer)();
        this.wss = new ws_1.WebSocketServer({ server: this.server, path: '/ws' });
        this.setupAfterWSS();
        this.server.listen(this.port, () => {
            console.log(`[WS] WebSocket server listening on port ${this.port}`);
        });
    }
    stop() {
        this.wss?.close();
        this.server?.close();
    }
    setupHandlers() {
        this.wss.on('connection', (socket) => {
            const clientId = this.generateClientId();
            this.clients.set(clientId, { socket, authenticated: false });
            console.log(`[WS] Client ${clientId} connected`);
            socket.on('message', async (raw) => {
                try {
                    const msg = JSON.parse(raw.toString());
                    await this.handleMessage(clientId, msg);
                }
                catch (err) {
                    socket.send(JSON.stringify({ type: 'error', error: 'Invalid message format' }));
                }
            });
            socket.on('close', () => {
                this.clients.delete(clientId);
                console.log(`[WS] Client ${clientId} disconnected`);
            });
            socket.on('error', (err) => {
                console.error(`[WS] Client ${clientId} error:`, err);
            });
        });
    }
    generateClientId() {
        return `ws_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
    }
    /**
     * 消息路由
     */
    async handleMessage(clientId, msg) {
        const client = this.clients.get(clientId);
        if (!client)
            return;
        switch (msg.type) {
            case 'ping': {
                this.safeSend(client.socket, { type: 'pong', ts: msg.ts });
                break;
            }
            case 'auth': {
                try {
                    const decoded = jsonwebtoken_1.default.verify(msg.token, this.jwtSecret);
                    client.userId = decoded.userId;
                    client.userName = decoded.username || '用户';
                    client.authenticated = true;
                    // 单设备登录：踢掉该用户的旧连接
                    for (const [oldId, oldClient] of this.clients.entries()) {
                        if (oldId !== clientId && oldClient.userId === decoded.userId && oldClient.socket.readyState === ws_1.WebSocket.OPEN) {
                            console.log(`[WS] Kicking out old client ${oldId} for user ${decoded.userId}`);
                            oldClient.socket.send(JSON.stringify({ type: 'kickout', reason: '您的账号已在其他设备登录' }));
                            setTimeout(() => oldClient.socket.close(), 500);
                        }
                    }
                    this.safeSend(client.socket, { type: 'auth_success', userId: decoded.userId });
                }
                catch {
                    this.safeSend(client.socket, { type: 'auth_failed' });
                }
                break;
            }
            case 'subscribe': {
                if (!client.authenticated) {
                    this.safeSend(client.socket, { type: 'error', error: 'Not authenticated' });
                    return;
                }
                client.soulId = msg.soulId;
                await this.soulManager.startSoul(msg.soulId);
                this.safeSend(client.socket, { type: 'subscribed', soulId: msg.soulId });
                break;
            }
            case 'subscribe_group': {
                if (!client.authenticated) {
                    this.safeSend(client.socket, { type: 'error', error: 'Not authenticated' });
                    return;
                }
                client.groupId = msg.groupId;
                this.safeSend(client.socket, { type: 'subscribed_group', groupId: msg.groupId });
                console.log(`[WS] Client ${clientId} subscribed to group ${msg.groupId}`);
                break;
            }
            case 'message': {
                if (!client.authenticated || !client.soulId) {
                    this.safeSend(client.socket, { type: 'error', error: 'Not subscribed' });
                    return;
                }
                try {
                    const userContentRaw = msg.content || '';
                    // === 话题检测与隔离 ===
                    const topicResult = await this.topicService.detectTopic(client.userId, client.soulId, userContentRaw);
                    const currentTopic = topicResult.topic;
                    const actualContent = topicResult.cleanContent || userContentRaw;
                    if (topicResult.isSwitched) {
                        console.log(`[WS] Topic switched to "${currentTopic}" (reason: ${topicResult.reason})`);
                        this.safeSend(client.socket, {
                            type: 'topic_changed',
                            topic: currentTopic,
                            reason: topicResult.reason
                        });
                    }
                    const { pool } = await import('../utils/db');
                    const soulResult = await pool.query('SELECT system_prompt, name FROM souls WHERE id = $1', [client.soulId]);
                    const soulData = soulResult.rows[0];
                    const systemPrompt = soulData?.system_prompt || '你是一个 helpful AI assistant。';
                    console.log(`[WS] Soul ${client.soulId} systemPrompt loaded (${systemPrompt.length} chars):`, systemPrompt.substring(0, 60) + (systemPrompt.length > 60 ? '...' : ''));

                    // === 三级上下文堆叠 (L3知识 → L2摘要 → L1历史 → 当前问题) ===
                    let modelMessages;
                    try {
                        modelMessages = await this.contextEngine.buildContext(
                            client.userId, client.soulId, actualContent, systemPrompt
                        );
                        console.log(`[WS] ContextEngine built ${modelMessages.length} messages (L1+L2+L3 stacked)`);
                    } catch (ctxErr) {
                        console.warn(`[WS] ContextEngine failed (${ctxErr.message}), falling back to L1 only`);
                        // Fallback: 仅查询当前话题的最近历史
                        const historyResult = await pool.query(
                            `SELECT role, content FROM messages
                             WHERE soul_id = $1 AND user_id = $2 AND topic = $3
                             ORDER BY created_at DESC LIMIT 20`,
                            [client.soulId, client.userId, currentTopic]
                        );
                        const historyMessages = historyResult.rows.reverse().map(h => ({
                            role: h.role, content: h.content
                        }));
                        const wrappedContent = `[系统指令：${systemPrompt}]\n\n你必须严格遵循以上系统指令设定的人设和规则来回答。现在用户的问题是：${actualContent}`;
                        modelMessages = [...historyMessages, { role: 'user', content: wrappedContent }];
                    }

                    // 3. 调用 AI
                    const response = await this.soulManager.handleChat(client.soulId, {
                        messages: modelMessages,
                    });

                    // 4. 保存用户原始消息到数据库（带上话题）
                    await pool.query(
                        `INSERT INTO messages (id, soul_id, user_id, role, content, session_id, topic, topic_changed, created_at)
                         VALUES (gen_random_uuid(), $1, $2, 'user', $3, $4, $5, $6, NOW())`,
                        [client.soulId, client.userId, actualContent, msg.sessionId || null, currentTopic, topicResult.isSwitched]
                    );

                    // 5. 保存 AI 回复到数据库（带上话题）
                    await pool.query(
                        `INSERT INTO messages (id, soul_id, user_id, role, content, session_id, topic, created_at)
                         VALUES (gen_random_uuid(), $1, $2, 'assistant', $3, $4, $5, NOW())`,
                        [client.soulId, client.userId, response, msg.sessionId || null, currentTopic]
                    );

                    this.safeSend(client.socket, {
                        type: 'reply',
                        soulId: client.soulId,
                        content: response,
                        topic: currentTopic,
                    });
                }
                catch (err) {
                    this.safeSend(client.socket, {
                        type: 'error',
                        error: `Chat failed: ${err.message}`,
                    });
                }
                break;
            }
            case 'group': {
                if (!client.authenticated || !client.groupId) {
                    this.safeSend(client.socket, { type: 'error', error: 'Not subscribed to group' });
                    return;
                }
                try {
                    // 保存用户消息并触发群聊回复
                    await this.groupService.handleChatMessage({
                        type: 'group',
                        groupId: client.groupId,
                        soulId: client.soulId,
                        userId: client.userId,
                        userName: client.userName,
                        message: msg.content || '',
                        sessionId: msg.sessionId || null,
                        fromUserName: client.userName || '用户',
                    });
                    // 确认收到
                    this.safeSend(client.socket, {
                        type: 'group_sent',
                        groupId: client.groupId,
                    });
                }
                catch (err) {
                    this.safeSend(client.socket, {
                        type: 'error',
                        error: `Group chat failed: ${err.message}`,
                    });
                }
                break;
            }
            case 'history': {
                if (!client.authenticated || !client.soulId) {
                    this.safeSend(client.socket, { type: 'error', error: 'Not subscribed' });
                    return;
                }
                try {
                    const dbModule = await import('../utils/db');
                    const pool = dbModule.Database.getInstance().pool;
                    const limit = Math.min(msg.limit || 50, 100);
                    const offset = msg.offset || 0;
                    const topicFilter = msg.topic; // 可选：按话题过滤
                    let sql = `SELECT id, role, content, topic, created_at FROM messages
                         WHERE soul_id = $1 AND user_id = $2`;
                    let params = [client.soulId, client.userId];
                    if (topicFilter) {
                        sql += ` AND topic = $3`;
                        params.push(topicFilter);
                    }
                    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
                    params.push(limit, offset);
                    const result = await pool.query(sql, params);
                    this.safeSend(client.socket, {
                        type: 'history',
                        messages: result.rows.reverse(),
                        hasMore: result.rows.length === limit,
                        topic: topicFilter || null,
                    });
                } catch (err) {
                    this.safeSend(client.socket, { type: 'error', error: `History failed: ${err.message}` });
                }
                break;
            }
            case 'topics': {
                if (!client.authenticated || !client.soulId) {
                    this.safeSend(client.socket, { type: 'error', error: 'Not subscribed' });
                    return;
                }
                try {
                    const topics = await this.topicService.getUserTopics(client.userId, client.soulId);
                    this.safeSend(client.socket, {
                        type: 'topics',
                        topics,
                    });
                } catch (err) {
                    this.safeSend(client.socket, { type: 'error', error: `Topics failed: ${err.message}` });
                }
                break;
            }
            default: {
                this.safeSend(client.socket, { type: 'error', error: `Unknown type: ${msg.type}` });
            }
        }
    }
    /**
     * 广播给所有订阅了指定群组的客户端
     */
    broadcastToGroup(groupId, payload) {
        const msg = JSON.stringify(payload);
        for (const client of this.clients.values()) {
            if (client.groupId === groupId && client.socket.readyState === ws_1.WebSocket.OPEN) {
                client.socket.send(msg);
            }
        }
    }
    /**
     * 全局广播
     */
    broadcast(type, payload) {
        const msg = JSON.stringify({ type, ...payload });
        for (const client of this.clients.values()) {
            if (client.socket.readyState === ws_1.WebSocket.OPEN) {
                client.socket.send(msg);
            }
        }
    }
    /**
     * 按群组广播
     */
    broadcastToGroup(groupId, payload) {
        const msg = JSON.stringify({ type: 'group_broadcast', ...payload });
        for (const client of this.clients.values()) {
            if (client.groupId === groupId && client.socket.readyState === ws_1.WebSocket.OPEN) {
                this.safeSend(client.socket, { type: 'group_broadcast', ...payload });
            }
        }
    }
    /**
     * 心跳检测：移除超时不活跃的客户端（5分钟）
     */
    heartbeat() {
        const now = Date.now();
        for (const [clientId, client] of this.clients) {
            if (now - client.lastPing > 300000) { // 5分钟超时
                console.log(`[WSServer] Client ${clientId} heartbeat timeout, disconnecting`);
                client.socket.close();
                this.clients.delete(clientId);
            }
        }
    }
    /**
     * 生成唯一客户端ID
     */
    generateClientId() {
        return `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
}
exports.WebSocketServer = WSServer;
//# sourceMappingURL=ws-server.js.map