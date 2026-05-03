const WebSocket = require('ws');
const API_BASE = 'http://127.0.0.1:3002/api';
const WS_BASE = 'ws://127.0.0.1:3003/ws';

const TEST_USER = '潘彦霖';
const TEST_PASS = 'Panyu980612';
const GROUP_ID = 'f4c274e1-317a-44a7-86de-9fc6798c966a';

async function testGroupChat() {
  console.log('=== 群聊调试测试 ===\n');

  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: TEST_USER, password: TEST_PASS })
  });
  const loginData = await loginRes.json();
  const token = loginData.data.token;
  console.log('✅ 登录成功');

  const meRes = await fetch(`${API_BASE}/users/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const meData = await meRes.json();
  const soulId = meData.data?.bound_soul_id;
  console.log(`✅ Soul: ${soulId}`);

  const ws = new WebSocket(WS_BASE);

  ws.on('open', () => {
    console.log('✅ WebSocket 连接成功');
    ws.send(JSON.stringify({ type: 'auth', token }));
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      console.log('📨 收到:', msg.type, JSON.stringify(msg).substring(0, 200));
      
      if (msg.type === 'auth_success') {
        ws.send(JSON.stringify({ type: 'subscribe', soulId }));
      }
      if (msg.type === 'subscribed') {
        ws.send(JSON.stringify({ type: 'subscribe_group', groupId: GROUP_ID }));
      }
      if (msg.type === 'group_subscribed') {
        console.log('✅ 群订阅成功，发送群消息...');
        ws.send(JSON.stringify({
          type: 'group',
          groupId: GROUP_ID,
          content: '群里有人吗？测试群聊！'
        }));
      }
    } catch (e) {
      console.log('原始数据:', data.toString().substring(0, 200));
    }
  });

  ws.on('error', (err) => {
    console.error('❌ WebSocket 错误:', err.message);
    console.error('错误详情:', err.stack || 'no stack');
  });

  ws.on('close', (code, reason) => {
    console.log(`🔒 连接关闭: ${code} ${reason}`);
  });

  setTimeout(() => {
    console.log('\n=== 60秒结束，关闭连接 ===');
    ws.close();
  }, 60000);
}

testGroupChat();
