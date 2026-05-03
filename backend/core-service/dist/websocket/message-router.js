"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageRouter = void 0;
const jsonwebtoken_1 = require("jsonwebtoken");
const ws_1 = require("ws");
class MessageRouter {
    wss;
    clients;
    services;
    jwtSecret;
    constructor(wss, clients, services, jwtSecret) {
        this.wss = wss;
        this.clients = clients;
        this.services = services;
        this.jwtSecret = jwtSecret;
    }
    safeSend(socket, data) {
        if (socket.readyState === ws_1.WebSocket.OPEN) socket.send(JSON.stringify(data));
    }
    broadcast(type, payload) {
        const msg = JSON.stringify({ type, ...payload });
        for (const client of this.clients.values()) {
            if (client.socket.readyState === ws_1.WebSocket.OPEN) client.socket.send(msg);
        }
    }
    async handle(clientId, msg, client) {
        switch (msg.type) {
            case 'ping': this.safeSend(client.socket, { type: 'pong', ts: msg.ts }); break;
            case 'auth': await this.handleAuth(clientId, msg, client); break;
            case 'subscribe': await this.handleSubscribe(clientId, msg, client); break;
            case 'switch_workspace': await this.handleSwitchWorkspace(clientId, msg, client); break;
            case 'subscribe_group': await this.handleSubscribeGroup(clientId, msg, client); break;
            case 'message': await this.handleChat(clientId, msg, client); break;
            case 'group': await this.handleGroupChat(clientId, msg, client); break;
            case 'history': await this.handleHistory(clientId, msg, client); break;
            case 'topics': await this.handleTopics(clientId, msg, client); break;
            default: this.safeSend(client.socket, { type: 'error', error: `Unknown type: ${msg.type}` });
        }
    }
    async handleAuth(clientId, msg, client) {
        try {
            const decoded = jsonwebtoken_1.default.verify(msg.token, this.jwtSecret);
            client.userId = decoded.userId;
            client.userName = decoded.username || '用户';
            client.authenticated = true;
            const wsResult = await this.services.db.query(`SELECT id FROM workspaces WHERE owner_id = $1 AND is_default = true LIMIT 1`, [decoded.userId]);
            client.workspaceId = wsResult.rows[0]?.id || null;
            for (const [oldId, oldClient] of this.clients.entries()) {
                if (oldId !== clientId && oldClient.userId === decoded.userId && oldClient.socket.readyState === ws_1.WebSocket.OPEN) {
                    this.safeSend(oldClient.socket, { type: 'kickout', reason: '您的账号已在其他设备登录' });
                    setTimeout(() => oldClient.socket.close(), 500);
                }
            }
            this.safeSend(client.socket, { type: 'auth_success', userId: decoded.userId, workspaceId: client.workspaceId });
        } catch { this.safeSend(client.socket, { type: 'auth_failed' }); }
    }
    async handleSubscribe(clientId, msg, client) {
        if (!client.authenticated) return this.safeSend(client.socket, { type: 'error', error: 'Not authenticated' });
        client.soulId = msg.soulId;
        await this.services.soulManager.startSoul(msg.soulId);
        this.safeSend(client.socket, { type: 'subscribed', soulId: msg.soulId });
    }
    async handleSwitchWorkspace(clientId, msg, client) {
        if (!client.authenticated) return this.safeSend(client.socket, { type: 'error', error: 'Not authenticated' });
        try {
            const wsService = this.services.workspaceService;
            const ws = await wsService.getById(msg.workspaceId, client.userId);
            if (!ws) return this.safeSend(client.socket, { type: 'error', error: 'Workspace not found' });
            client.workspaceId = msg.workspaceId;
            const souls = await wsService.getSouls(msg.workspaceId);
            this.safeSend(client.socket, { type: 'workspace_switched', workspaceId: msg.workspaceId, souls });
        } catch (err) { this.safeSend(client.socket, { type: 'error', error: `Switch failed: ${err.message}` }); }
    }
    async handleSubscribeGroup(clientId, msg, client) {
        if (!client.authenticated) return this.safeSend(client.socket, { type: 'error', error: 'Not authenticated' });
        client.groupId = msg.groupId;
        this.safeSend(client.socket, { type: 'subscribed_group', groupId: msg.groupId });
    }
    async handleChat(clientId, msg, client) {
        if (!client.authenticated || !client.soulId) return this.safeSend(client.socket, { type: 'error', error: 'Not subscribed' });
        try {
            const userContentRaw = msg.content || '';
            const topicResult = await this.services.topicService.detectTopic(client.userId, client.soulId, userContentRaw);
            const currentTopic = topicResult.topic;
            const actualContent = topicResult.cleanContent || userContentRaw;
            if (topicResult.isSwitched) {
                this.safeSend(client.socket, { type: 'topic_changed', topic: currentTopic, reason: topicResult.reason });
            }
            const db = this.services.db;
            const soulResult = await db.query(
                'SELECT system_prompt, name FROM souls WHERE id = $1 AND (workspace_id = $2 OR workspace_id IS NULL)',
                [client.soulId, client.workspaceId]
            );
            const soulData = soulResult.rows[0];
            const basePrompt = soulData?.system_prompt || '你是一个 helpful AI assistant。';
            const { AwaitHumanParser } = require('../services/await-human-parser');
            const systemPrompt = AwaitHumanParser.getInstance().injectSystemPrompt(basePrompt);
            let modelMessages;
            try {
                modelMessages = await this.services.contextEngine.buildContext(client.userId, client.soulId, actualContent, systemPrompt);
            } catch (ctxErr) {
                const historyResult = await db.query(
                    `SELECT role, content FROM messages WHERE soul_id = $1 AND user_id = $2 AND (workspace_id = $3 OR workspace_id IS NULL) AND topic = $4 ORDER BY created_at DESC LIMIT 20`,
                    [client.soulId, client.userId, client.workspaceId, currentTopic]
                );
                const historyMessages = historyResult.rows.reverse().map(h => ({ role: h.role, content: h.content }));
                const wrapped = `[系统指令：${systemPrompt}]\n\n现在用户的问题是：${actualContent}`;
                modelMessages = [...historyMessages, { role: 'user', content: wrapped }];
            }
            const response = await this.services.soulManager.handleChat(client.soulId, { messages: modelMessages });
            // === await_human 检测 ===
            const { AwaitHumanParser } = require('../services/await-human-parser');
            const awaitParser = AwaitHumanParser.getInstance();
            const context = { messages: modelMessages, soulId: client.soulId, userId: client.userId, workspaceId: client.workspaceId, topic: currentTopic };
            const awaitResult = await awaitParser.process(client.soulId, client.userId, client.workspaceId, response, 'websocket', currentTopic, context);
            let finalResponse = response;
            if (awaitResult) {
                finalResponse = awaitResult.cleanResponse || response;
                this.safeSend(client.socket, { type: 'task_awaiting_human', taskId: awaitResult.taskId, question: awaitResult.question, options: awaitResult.options });
            }
            await db.query(
                `INSERT INTO messages (id, soul_id, user_id, role, content, session_id, topic, topic_changed, workspace_id, created_at) VALUES (gen_random_uuid(), $1, $2, 'user', $3, $4, $5, $6, $7, NOW())`,
                [client.soulId, client.userId, actualContent, msg.sessionId || null, currentTopic, topicResult.isSwitched, client.workspaceId]
            );
            await db.query(
                `INSERT INTO messages (id, soul_id, user_id, role, content, session_id, topic, workspace_id, created_at) VALUES (gen_random_uuid(), $1, $2, 'assistant', $3, $4, $5, $6, NOW())`,
                [client.soulId, client.userId, response, msg.sessionId || null, currentTopic, client.workspaceId]
            );
            this.safeSend(client.socket, { type: 'reply', soulId: client.soulId, content: response, topic: currentTopic });
        } catch (err) { this.safeSend(client.socket, { type: 'error', error: `Chat failed: ${err.message}` }); }
    }
    async handleGroupChat(clientId, msg, client) {
        if (!client.authenticated || !client.groupId) return this.safeSend(client.socket, { type: 'error', error: 'Not subscribed to group' });
        try {
            await this.services.groupService.handleChatMessage({
                type: 'group', groupId: client.groupId, soulId: client.soulId,
                userId: client.userId, userName: client.userName,
                message: msg.content || '', sessionId: msg.sessionId || null, fromUserName: client.userName || '用户',
            });
            this.safeSend(client.socket, { type: 'group_sent', groupId: client.groupId });
        } catch (err) { this.safeSend(client.socket, { type: 'error', error: `Group chat failed: ${err.message}` }); }
    }
    async handleHistory(clientId, msg, client) {
        if (!client.authenticated || !client.soulId) return this.safeSend(client.socket, { type: 'error', error: 'Not subscribed' });
        try {
            const db = this.services.db;
            const limit = Math.min(msg.limit || 50, 100);
            const offset = msg.offset || 0;
            const topicFilter = msg.topic;
            let sql = `SELECT id, role, content, topic, created_at FROM messages WHERE soul_id = $1 AND user_id = $2 AND (workspace_id = $3 OR workspace_id IS NULL)`;
            let params = [client.soulId, client.userId, client.workspaceId];
            let pIdx = 4;
            if (topicFilter) { sql += ` AND topic = $${pIdx++}`; params.push(topicFilter); }
            sql += ` ORDER BY created_at DESC LIMIT $${pIdx++} OFFSET $${pIdx++}`;
            params.push(limit, offset);
            const result = await db.query(sql, params);
            this.safeSend(client.socket, { type: 'history', messages: result.rows.reverse(), hasMore: result.rows.length === limit, topic: topicFilter || null });
        } catch (err) { this.safeSend(client.socket, { type: 'error', error: `History failed: ${err.message}` }); }
    }
    async handleTopics(clientId, msg, client) {
        if (!client.authenticated || !client.soulId) return this.safeSend(client.socket, { type: 'error', error: 'Not subscribed' });
        try {
            const topics = await this.services.topicService.getUserTopics(client.userId, client.soulId);
            this.safeSend(client.socket, { type: 'topics', topics });
        } catch (err) { this.safeSend(client.socket, { type: 'error', error: `Topics failed: ${err.message}` }); }
    }
}
exports.MessageRouter = MessageRouter;
