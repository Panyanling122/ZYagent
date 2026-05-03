const WebSocket = require('ws');
const API_BASE = 'http://127.0.0.1:3002/api';
const WS_BASE = 'ws://127.0.0.1:3003/ws';

// 测试账号
const TEST_USER = '潘彦霖';
const TEST_PASS = 'Panyu980612';
const GROUP_ID = 'f4c274e1-317a-44a7-86de-9fc6798c966a';

async function testGroupChat() {
  console.log('=== 中亿智能体集群 - 群聊测试 ===\n');

  // 1. 登录获取 token
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: TEST_USER, password: TEST_PASS })
  });
  const loginData = await loginRes.json();
  if (!loginData.success) {
    console.error('登录失败:', loginData.error);
    return;
  }
  const token = loginData.data.token;
  console.log('✅ 登录成功，获取 token');

  // 2. 获取用户信息（绑定 Soul）
  const meRes = await fetch(`${API_BASE}/users/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const meData = await meRes.json();
  const soulId = meData.data?.bound_soul_id;
  console.log(`✅ 用户绑定 Soul: ${soulId || '无'}`);

  // 3. 连接 WebSocket
  const ws = new WebSocket(WS_BASE);

  ws.on('open', () => {
    console.log('✅ WebSocket 连接成功');
    ws.send(JSON.stringify({ type: 'auth', token }));
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      console.log('📨 收到消息:', msg.type, JSON.stringify(msg).substring(0, 200));

      if (msg.type === 'auth_success') {
        console.log('✅ WebSocket 认证成功');
        ws.send(JSON.stringify({ type: 'subscribe', soulId }));
      }

      if (msg.type === 'subscribed') {
        console.log(`✅ 订阅 Soul ${msg.soulId} 成功`);
        ws.send(JSON.stringify({ type: 'subscribe_group', groupId: GROUP_ID }));
      }

      if (msg.type === 'group_subscribed') {
        console.log(`✅ 订阅群 ${msg.groupId} 成功`);
        ws.send(JSON.stringify({
          type: 'group',
          groupId: GROUP_ID,
          content: '大家好，测试一下群聊功能！'
        }));
        console.log('📤 发送群消息: 大家好，测试一下群聊功能！');
      }

      if (msg.type === 'group_message') {
        console.log('✅ 收到群广播消息:', msg.content);
      }

      if (msg.type === 'group_sent') {
        console.log('✅ 群消息发送成功确认');
      }

      if (msg.type === 'reply') {
        console.log('🤖 收到 AI 回复:', msg.content?.substring(0, 100));
      }
    } catch (e) {
      console.log('原始消息:', data.toString().substring(0, 100));
    }
  });

  ws.on('error', (err) => console.error('❌ WebSocket 错误:', err.message));

  setTimeout(() => {
    console.log('\n=== 测试结束，关闭连接 ===');
    ws.close();
  }, 15000);
}

testGroupChat();
