const fs = require('fs');

const file = '/opt/openclaw/core-service/src/websocket/ws-server.ts';
let c = fs.readFileSync(file, 'utf8');

// Add groupId to Client interface
const oldClient = `interface Client {
  id: string;
  socket: WebSocket;
  authenticated: boolean;
  userId?: string;
  soulId?: string;
  groupId?: string;  // 新增：用户订阅的群ID
}`;

c = c.replace(
  `interface Client {\n  id: string;\n  socket: WebSocket;\n  authenticated: boolean;\n  userId?: string;\n  soulId?: string;\n}`,
  oldClient
);

// Add group case to handleMessage
const oldPing = `      case 'ping': {
        client.socket.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        break;
      }`;

const newPing = `      case 'ping': {
        client.socket.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        break;
      }

      case 'group': {
        if (!client.authenticated || !client.groupId) {
          client.socket.send(JSON.stringify({ type: 'error', error: 'Not subscribed to group' }));
          return;
        }
        try {
          // 保存群消息
          const { pool } = await import('../db');
          await pool.query(
            \`INSERT INTO group_messages (id, group_id, from_soul_id, role, content, created_at)\n             VALUES (gen_random_uuid(), $1, $2, 'user', $3, NOW())\`,
            [client.groupId, client.soulId, msg.content]
          );
          // 广播群消息给所有在线客户端
          this.emitter.emit(\`group:\${client.groupId}\`, {
            type: 'group_message',
            groupId: client.groupId,
            content: msg.content,
            senderSoulId: client.soulId,
            timestamp: new Date().toISOString(),
          });
          client.socket.send(JSON.stringify({ type: 'group_sent', groupId: client.groupId }));
        } catch (err: any) {
          client.socket.send(JSON.stringify({ type: 'error', error: \`Group message failed: \${err.message}\` }));
        }
        break;
      }`;

c = c.replace(oldPing, newPing);

// Add groupId handling in subscribe case
const oldSubscribe = `      case 'subscribe': {
        if (!client.authenticated || !client.soulId) {
          client.socket.send(JSON.stringify({ type: 'error', error: 'Not authenticated' }));
          return;
        }
        client.socket.send(JSON.stringify({ type: 'subscribed', soulId: client.soulId }));
        break;
      }`;

const newSubscribe = `      case 'subscribe': {
        if (!client.authenticated || !client.soulId) {
          client.socket.send(JSON.stringify({ type: 'error', error: 'Not authenticated' }));
          return;
        }
        client.socket.send(JSON.stringify({ type: 'subscribed', soulId: client.soulId }));
        break;
      }

      case 'subscribe_group': {
        if (!client.authenticated) {
          client.socket.send(JSON.stringify({ type: 'error', error: 'Not authenticated' }));
          return;
        }
        client.groupId = msg.groupId;
        this.subscribeGroupMessages(client.groupId);
        client.socket.send(JSON.stringify({ type: 'group_subscribed', groupId: client.groupId }));
        break;
      }`;

c = c.replace(oldSubscribe, newSubscribe);

fs.writeFileSync(file, c);
console.log('ws-server.ts group chat support added');
