const fs = require('fs');
const file = '/opt/openclaw/core-service/dist/websocket/ws-server.js';
let c = fs.readFileSync(file, 'utf8');

// Add subscribe_group case
const oldSubscribe = "            case 'subscribe': {\n                if (!client.authenticated || !client.soulId) {\n                    client.socket.send(JSON.stringify({ type: 'error', error: 'Not authenticated' }));\n                    return;\n                }\n                client.socket.send(JSON.stringify({ type: 'subscribed', soulId: client.soulId }));\n                break;\n            }";

const newSubscribe = "            case 'subscribe': {\n                if (!client.authenticated || !client.soulId) {\n                    client.socket.send(JSON.stringify({ type: 'error', error: 'Not authenticated' }));\n                    return;\n                }\n                client.socket.send(JSON.stringify({ type: 'subscribed', soulId: client.soulId }));\n                break;\n            }\n            case 'subscribe_group': {\n                if (!client.authenticated) {\n                    client.socket.send(JSON.stringify({ type: 'error', error: 'Not authenticated' }));\n                    return;\n                }\n                client.groupId = msg.groupId;\n                this.subscribeGroupMessages(client.groupId);\n                client.socket.send(JSON.stringify({ type: 'group_subscribed', groupId: client.groupId }));\n                break;\n            }";

if (c.includes(oldSubscribe)) {
  c = c.replace(oldSubscribe, newSubscribe);
  console.log('subscribe_group added');
} else {
  console.log('subscribe block not found');
}

// Add group case
const oldPing = "            case 'ping': {\n                client.socket.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));\n                break;\n            }";

const newPing = "            case 'ping': {\n                client.socket.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));\n                break;\n            }\n            case 'group': {\n                if (!client.authenticated || !client.groupId) {\n                    client.socket.send(JSON.stringify({ type: 'error', error: 'Not subscribed to group' }));\n                    return;\n                }\n                try {\n                    const { pool } = await import('../db');\n                    await pool.query(\`INSERT INTO group_messages (id, group_id, from_soul_id, role, content, created_at) VALUES (gen_random_uuid(), \$1, \$2, 'user', \$3, NOW())\`, [client.groupId, client.soulId, msg.content]);\n                    this.emitter.emit(\`group:\${client.groupId}\`, { type: 'group_message', groupId: client.groupId, content: msg.content, senderSoulId: client.soulId, timestamp: new Date().toISOString() });\n                    client.socket.send(JSON.stringify({ type: 'group_sent', groupId: client.groupId }));\n                }\n                catch (err) {\n                    client.socket.send(JSON.stringify({ type: 'error', error: \`Group message failed: \${err.message}\` }));\n                }\n                break;\n            }";

if (c.includes(oldPing)) {
  c = c.replace(oldPing, newPing);
  console.log('group message added');
} else {
  console.log('ping block not found');
}

fs.writeFileSync(file, c);
console.log('Done');
