const WebSocket = require('ws');
const API_BASE = 'http://127.0.0.1:3002/api';
const WS_BASE = 'ws://127.0.0.1:3003/ws';

const TEST_USER = '潘彦霖';
const TEST_PASS = 'Panyu980612';
const GROUP_ID = 'f4c274e1-317a-44a7-86de-9fc6798c966a';

async function testGroupChat() {
  console.log('=== 中亿智能体集群 - 群聊测试（60秒等待） ===\n');

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
  console.log('✅ 登录成功');

  const meRes = await fetch(`${API_BASE}/users/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const meData = await meRes.json();
  const soulId = meData.data?.bound_soul_id;
  console.log(`✅ 绑定 Soul: ${soulId || '无'}`);

  const ws = new WebSocket(WS_BASE);
  let gotReply = false;

  ws.on('open', () => {
    console.log('✅ WebSocket 连接成功');
    ws.send(JSON.stringify({ type: 'auth', token }));
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      console.log('📨', msg.type, JSON.stringify(msg).substring(0, 150));

      if (msg.type === 'auth_success') {
        ws.send(JSON.stringify({ type: 'subscribe', soulId }));
      }
      if (msg.type === 'subscribed') {
        ws.send(JSON.stringify({ type: 'subscribe_group', groupId: GROUP_ID }));
      }
      if (msg.type === 'group_subscribed') {
        ws.send(JSON.stringify({
          type: 'group',
          groupId: GROUP_ID,
          content: '群里有人吗？测试一下群聊回复！'
        }));
        console.log('📤 发送群消息');
      }
      if (msg.type === 'group_message' && msg.data?.isAI) {
        gotReply = true;
        console.log('🤖 收到 Soul 自动回复:', msg.data.content?.substring(0, 100));
      }
    } catch (e) {}
  });

  ws.on('error', (err) => console.error('❌', err.message));

  setTimeout(() => {
    console.log(gotReply ? '\n✅ 测试成功：收到 Soul 群聊回复' : '\n⚠️ 测试完成：未收到 Soul 回复（可能超时或配置问题）');
    ws.close();
    process.exit(0);
  }, 60000);
}

testGroupChat();
