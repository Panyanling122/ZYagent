/**
 * =============================================================================
 * 模块名称：WebSocket 服务器
 * 功能描述：处理客户端连接，消息路由到 Soul 进程，支持单聊和群聊
 * =============================================================================
 */

import { Server as HTTPServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { SoulProcessManager } from '../soul/soul-process';
import { GroupService } from '../soul/group-service';

interface WSClient {
  socket: WebSocket;
  userId?: string;
  userName?: string;
  soulId?: string;
  groupId?: string;
  authenticated: boolean;
}

class WSServer {
  private wss: WebSocketServer;
  private clients = new Map<string, WSClient>();
  private soulManager: SoulProcessManager;
  private groupService: GroupService;
  private jwtSecret: string;

  constructor(server: HTTPServer, jwtSecret: string) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.soulManager = SoulProcessManager.getInstance();
    this.groupService = GroupService.getInstance();
    this.jwtSecret = jwtSecret;

    // 监听 GroupService 广播事件，转发给所有订阅了该群组的客户端
    this.groupService.on('group_broadcast', (payload) => {
      this.broadcastToGroup(payload.groupId, payload);
    });

    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.wss.on('connection', (socket: WebSocket) => {
      const clientId = this.generateClientId();
      this.clients.set(clientId, { socket, authenticated: false });
      console.log(`[WS] Client ${clientId} connected`);

      socket.on('message', async (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString());
          await this.handleMessage(clientId, msg);
        } catch (err) {
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

  private generateClientId(): string {
    return `ws_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * 消息路由
   */
  private async handleMessage(clientId: string, msg: any): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (msg.type) {
      case 'ping': {
        client.socket.send(JSON.stringify({ type: 'pong', ts: msg.ts }));
        break;
      }

      case 'auth': {
        try {
          const decoded = jwt.verify(msg.token, this.jwtSecret) as any;
          client.userId = decoded.userId;
          client.userName = decoded.username || '用户';
          client.authenticated = true;
          // 单设备登录：踢掉该用户的旧连接
          for (const [oldId, oldClient] of this.clients.entries()) {
            if (oldId !== clientId && oldClient.userId === decoded.userId && oldClient.socket.readyState === WebSocket.OPEN) {
              console.log(`[WS] Kicking out old client ${oldId} for user ${decoded.userId}`);
              oldClient.socket.send(JSON.stringify({ type: 'kickout', reason: '您的账号已在其他设备登录' }));
              setTimeout(() => oldClient.socket.close(), 500);
            }
          }
          client.socket.send(JSON.stringify({ type: 'auth_success', userId: decoded.userId }));
        } catch {
          client.socket.send(JSON.stringify({ type: 'auth_failed' }));
        }
        break;
      }

      case 'subscribe': {
        if (!client.authenticated) {
          client.socket.send(JSON.stringify({ type: 'error', error: 'Not authenticated' }));
          return;
        }
        client.soulId = msg.soulId;
        await this.soulManager.startSoul(msg.soulId);
        client.socket.send(JSON.stringify({ type: 'subscribed', soulId: msg.soulId }));
        break;
      }

      case 'subscribe_group': {
        if (!client.authenticated) {
          client.socket.send(JSON.stringify({ type: 'error', error: 'Not authenticated' }));
          return;
        }
        client.groupId = msg.groupId;
        client.socket.send(JSON.stringify({ type: 'subscribed_group', groupId: msg.groupId }));
        console.log(`[WS] Client ${clientId} subscribed to group ${msg.groupId}`);
        break;
      }

      case 'message': {
        if (!client.authenticated || !client.soulId) {
          client.socket.send(JSON.stringify({ type: 'error', error: 'Not subscribed' }));
          return;
        }

        try {
          const { pool } = await import('../db');
          const soulResult = await pool.query(
            'SELECT system_prompt, name FROM souls WHERE id = $1',
            [client.soulId]
          );
          const soulData = soulResult.rows[0];
          const systemPrompt = soulData?.system_prompt || '你是一个 helpful AI assistant。';
          console.log(`[WS] Soul ${client.soulId} systemPrompt loaded (${systemPrompt.length} chars):`, systemPrompt.substring(0, 60) + (systemPrompt.length > 60 ? '...' : ''));

          const userContent = msg.content || '';
          const wrappedContent = `[系统指令：${systemPrompt}]\n\n你必须严格遵循以上系统指令设定的人设和规则来回答。现在用户的问题是：${userContent}`;

          // 1. 查询最近 20 轮历史消息作为上下文
          const historyResult = await pool.query(
            `SELECT role, content FROM messages
             WHERE soul_id = $1 AND user_id = $2
             ORDER BY created_at DESC LIMIT 20`,
            [client.soulId, client.userId]
          );
          const historyMessages = historyResult.rows.reverse().map(h => ({
            role: h.role as 'user' | 'assistant',
            content: h.content
          }));
          console.log(`[WS] Loaded ${historyMessages.length} history messages for context`);

          // 2. 构建传给模型的消息数组
          const modelMessages = [
            ...historyMessages,
            { role: 'user' as const, content: wrappedContent }
          ];

          // 3. 调用 AI
          const response = await this.soulManager.handleChat(client.soulId, {
            messages: modelMessages,
          });

          // 4. 保存用户原始消息到数据库
          await pool.query(
            `INSERT INTO messages (id, soul_id, user_id, role, content, session_id, created_at)
             VALUES (gen_random_uuid(), $1, $2, 'user', $3, $4, NOW())`,
            [client.soulId, client.userId, userContent, msg.sessionId || null]
          );

          // 5. 保存 AI 回复到数据库
          await pool.query(
            `INSERT INTO messages (id, soul_id, user_id, role, content, session_id, created_at)
             VALUES (gen_random_uuid(), $1, $2, 'assistant', $3, $4, NOW())`,
            [client.soulId, client.userId, response, msg.sessionId || null]
          );

          client.socket.send(JSON.stringify({
            type: 'reply',
            soulId: client.soulId,
            content: response,
          }));
        } catch (err: any) {
          client.socket.send(JSON.stringify({
            type: 'error',
            error: `Chat failed: ${err.message}`,
          }));
        }
        break;
      }

      case 'group': {
        if (!client.authenticated || !client.groupId) {
          client.socket.send(JSON.stringify({ type: 'error', error: 'Not subscribed to group' }));
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
          client.socket.send(JSON.stringify({
            type: 'group_sent',
            groupId: client.groupId,
          }));
        } catch (err: any) {
          client.socket.send(JSON.stringify({
            type: 'error',
            error: `Group chat failed: ${err.message}`,
          }));
        }
        break;
      }

      case 'history': {
        if (!client.authenticated || !client.soulId) {
          client.socket.send(JSON.stringify({ type: 'error', error: 'Not subscribed' }));
          return;
        }
        try {
          const { pool } = await import('../db');
          const limit = Math.min(msg.limit || 50, 100);
          const offset = msg.offset || 0;
          const result = await pool.query(
            `SELECT id, role, content, created_at FROM messages
             WHERE soul_id = $1 AND user_id = $2
             ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
            [client.soulId, client.userId, limit, offset]
          );
          client.socket.send(JSON.stringify({
            type: 'history',
            messages: result.rows.reverse(), // oldest first
            hasMore: result.rows.length === limit
          }));
        } catch (err: any) {
          client.socket.send(JSON.stringify({ type: 'error', error: `History failed: ${err.message}` }));
        }
        break;
      }

      default: {
        client.socket.send(JSON.stringify({ type: 'error', error: `Unknown type: ${msg.type}` }));
      }
    }
  }

  /**
   * 广播给所有订阅了指定群组的客户端
   */
  broadcastToGroup(groupId: string, payload: any): void {
    const msg = JSON.stringify(payload);
    for (const client of this.clients.values()) {
      if (client.groupId === groupId && client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(msg);
      }
    }
  }

  /**
   * 全局广播
   */
  broadcast(type: string, payload: any): void {
    const msg = JSON.stringify({ type, ...payload });
    for (const client of this.clients.values()) {
      if (client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(msg);
      }
    }
  }
}

export { WSServer };
export type { WSClient };
