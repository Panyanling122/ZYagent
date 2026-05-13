# OpenClaw 后端服务部署操作指南

## 一、环境要求

| 组件 | 版本 | 用途 |
|------|------|------|
| Ubuntu | 22.04 LTS (推荐) | 操作系统 |
| Node.js | 20.x | 后端运行时 |
| PostgreSQL | 14+ | 主数据库 |
| Redis | 6+ | 缓存、会话 |

最低配置：2核4G内存，20G磁盘
推荐配置：4核8G内存，SSD磁盘

---

## 二、系统环境准备

### 2.1 更新系统并安装依赖

```bash
# 更新系统包
sudo apt update && sudo apt upgrade -y

# 安装基础工具
sudo apt install -y curl wget git vim build-essential
```

### 2.2 安装 Node.js 20

```bash
# 使用 NodeSource 官方源
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs

# 验证
node -v  # 应显示 v20.x.x
npm -v   # 应显示 10.x.x
```

### 2.3 安装 PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib

# 启动并设置开机自启
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### 2.4 安装 Redis

```bash
sudo apt install -y redis-server

# 启动并设置开机自启
sudo systemctl start redis-server
sudo systemctl enable redis-server

# 验证
redis-cli ping  # 应返回 PONG
```

### 2.5 开放防火墙端口（如启用 UFW）

```bash
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 80/tcp      # HTTP（如需要前端Web）
sudo ufw allow 3001/tcp    # 后端API
sudo ufw allow 3003/tcp    # WebSocket
sudo ufw allow 3004/tcp    # Health Check
sudo ufw enable
```

---

## 三、拉取代码

### 3.1 从阿里云 Codeup 克隆

```bash
cd /opt
git clone https://codeup.aliyun.com/69f617c6ad0a337b92d9c44a/ZYagent.git

# 或带 Token
git clone https://用户名:Token@codeup.aliyun.com/69f617c6ad0a337b92d9c44a/ZYagent.git
```

### 3.2 进入后端目录

```bash
cd ZYagent/backend/core-service
```

---

## 四、数据库初始化

### 4.1 创建数据库用户和数据库

```bash
# 切换到 postgres 用户执行
sudo -u postgres psql << 'SQL'
-- 创建用户（修改密码为你自己的）
CREATE USER openclaw WITH PASSWORD '你的安全密码';

-- 创建数据库
CREATE DATABASE openclaw OWNER openclaw;

-- 授予权限
ALTER USER openclaw WITH SUPERUSER;
GRANT ALL PRIVILEGES ON DATABASE openclaw TO openclaw;

-- 安装 uuid 扩展
\c openclaw
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 退出
\q
SQL
```

### 4.2 执行数据库迁移

```bash
cd /opt/ZYagent/backend/core-service

# 按顺序执行所有迁移文件
for f in migrations/*.sql; do
    echo "Applying: $f"
    sudo -u postgres psql -d openclaw -f "$f"
done

# 验证表是否创建成功
echo "=== 数据库表列表 ==="
sudo -u postgres psql -d openclaw -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;"
```

**预期输出**：28 张表（包括 tasks、workspaces、souls、ilink_bind_tokens 等）

---

## 五、环境变量配置

### 5.1 创建 .env 文件

```bash
cd /opt/ZYagent/backend/core-service
cat > .env << 'EOF'
# === 数据库 ===
DATABASE_URL=postgresql://openclaw:你的安全密码@localhost:5432/openclaw

# === JWT密钥（至少32字符）===
JWT_SECRET=openclaw-jwt-secret-key-2026-must-be-32-chars
WS_TOKEN_SECRET=openclaw-ws-token-secret-key-2026-must-be

# === 服务端口 ===
PORT=3001
WS_PORT=3003
HEALTH_PORT=3004

# === 日志 ===
LOG_LEVEL=info

# === 管理服务（可选）===
ADMIN_SERVICE_URL=http://localhost:3002

# === 向量数据库（可选）===
MILVUS_URL=http://localhost:19530

# === 文件存储 ===
UPLOAD_DIR=/opt/ZYagent/uploads
GROUP_LOG_DIR=/opt/ZYagent/group-logs
EOF
```

> ⚠️ **安全提示**：JWT_SECRET 和 WS_TOKEN_SECRET 必须替换为随机生成的长字符串，至少 32 字符。

### 5.2 创建上传目录

```bash
mkdir -p /opt/ZYagent/uploads /opt/ZYagent/group-logs
```

---

## 六、安装后端依赖

```bash
cd /opt/ZYagent/backend/core-service

# 安装生产依赖
npm install --production
```

---

## 七、启动服务

### 7.1 方式一：直接启动（测试/开发）

```bash
cd /opt/ZYagent/backend/core-service
export $(cat .env | xargs)
node dist/index.js
```

**预期输出**：
```
Database connected
4 Souls started
Scheduler: 4定时任务已注册
WebSocket server listening on port 3003
HTTP API listening on port 3001
```

### 7.2 方式二：后台启动（生产环境）

```bash
cd /opt/ZYagent/backend/core-service
export $(cat .env | xargs)
nohup node dist/index.js > /var/log/openclaw.log 2>&1 &
echo $! > /var/run/openclaw.pid

echo "服务已启动，PID: $(cat /var/run/openclaw.pid)"
```

### 7.3 方式三：使用 PM2 管理（推荐生产）

```bash
# 安装 PM2
sudo npm install -g pm2

# 启动
cd /opt/ZYagent/backend/core-service
export $(cat .env | xargs)
pm2 start dist/index.js --name openclaw-core

# 设置开机自启
pm2 startup
pm2 save

# 常用命令
pm2 status          # 查看状态
pm2 logs openclaw-core    # 查看日志
pm2 restart openclaw-core # 重启
pm2 stop openclaw-core    # 停止
```

### 7.4 方式四：Docker 启动

```bash
cd /opt/ZYagent/backend/core-service

# 构建镜像
docker build -t openclaw-core .

# 运行容器
docker run -d \
  --name openclaw-core \
  --env-file .env \
  -p 3001:3001 \
  -p 3003:3003 \
  -p 3004:3004 \
  -v /opt/ZYagent/uploads:/app/uploads \
  openclaw-core
```

---

## 八、验证部署

### 8.1 检查进程

```bash
curl http://localhost:3004/health
curl http://localhost:3001/api/workspaces/workspaces \
  -H "x-user-id: 00000000-0000-0000-0000-000000000001"
```

### 8.2 检查端口监听

```bash
ss -tlnp | grep -E "3001|3003|3004"
```

### 8.3 检查日志

```bash
# 直接启动的日志
tail -f /var/log/openclaw.log

# PM2 日志
pm2 logs openclaw-core
```

---

## 九、已知问题与修复（重要！）

### 9.1 dist 编译产物问题

当前 `dist/` 目录中的编译产物存在几个已知问题，**首次部署必须修复**：

#### 问题 1：ws-server.js 导出名称错误

```bash
# 修复前
grep "exports.WebSocketServer" dist/websocket/ws-server.js
# 输出：exports.WebSocketServer = WSServer;  <- 错误

# 修复
sed -i 's/exports.WebSocketServer = WSServer;/exports.WebSocketServer = WebSocketServer;/' dist/websocket/ws-server.js
```

#### 问题 2：message-router.js 重复 require

```bash
# 检查
grep -n "AwaitHumanParser" dist/websocket/message-router.js
# 如果第 112 行有重复的 require，删除
sed -i '112d' dist/websocket/message-router.js
```

#### 问题 3：feishu-adapter.js 缺失

```bash
# 检查
ls dist/channels/feishu-adapter.js

# 如不存在，创建 stub
cat > dist/channels/feishu-adapter.js << 'EOF'
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeishuAdapter = void 0;
class FeishuAdapter {
    constructor(logger) { this.logger = logger; }
    async sendMessage(userId, content, options) {
        return { success: true, messageId: `feishu-${Date.now()}` };
    }
    async handleWebhook(payload) {
        return { handled: true };
    }
}
exports.FeishuAdapter = FeishuAdapter;
EOF
```

#### 问题 4：await-human-parser.js 结构损坏（如存在）

如果启动时报错 `await-human-parser.js:55` 附近的语法错误，需要替换整个文件。请联系开发团队获取修复版本。

### 9.2 一键修复脚本

创建 `fix-dist.sh`：

```bash
cat > /opt/ZYagent/backend/core-service/fix-dist.sh << 'SCRIPT'
#!/bin/bash
cd "$(dirname "$0")"

echo "=== 修复 dist 编译产物 ==="

# Fix 1: ws-server export
echo "[1/3] 修复 ws-server.js 导出..."
sed -i 's/exports.WebSocketServer = WSServer;/exports.WebSocketServer = WebSocketServer;/' dist/websocket/ws-server.js

# Fix 2: dedup message-router require
echo "[2/3] 修复 message-router.js 重复导入..."
LINE=$(grep -n "require.*await-human-parser" dist/websocket/message-router.js | tail -1 | cut -d: -f1)
if [ -n "$LINE" ] && [ "$LINE" != "96" ]; then
    sed -i "${LINE}d" dist/websocket/message-router.js
fi

# Fix 3: feishu-adapter stub
echo "[3/3] 创建 feishu-adapter.js stub..."
cat > dist/channels/feishu-adapter.js << 'EOF'
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeishuAdapter = void 0;
class FeishuAdapter {
    constructor(logger) { this.logger = logger; }
    async sendMessage(userId, content, options) {
        return { success: true, messageId: `feishu-${Date.now()}` };
    }
    async handleWebhook(payload) {
        return { handled: true };
    }
}
exports.FeishuAdapter = FeishuAdapter;
EOF

echo "=== 修复完成 ==="
SCRIPT
chmod +x /opt/ZYagent/backend/core-service/fix-dist.sh

# 执行修复
/opt/ZYagent/backend/core-service/fix-dist.sh
```

---

## 十、前端配置（指向后端）

如果使用桌面端或 Web 前端，修改 API 地址指向你的后端服务器：

编辑 `desktop/src/api/client.ts`：
```typescript
const API_BASE = import.meta.env.VITE_API_BASE || "http://你的服务器IP:3001";
```

编辑 `desktop/src/hooks/useWebSocket.ts`：
```typescript
const WS_URL = import.meta.env.VITE_WS_URL || "ws://你的服务器IP:3003/ws";
```

---

## 十一、常用操作

### 重启服务

```bash
# PM2
pm2 restart openclaw-core

# 直接启动
kill $(cat /var/run/openclaw.pid)
cd /opt/ZYagent/backend/core-service && export $(cat .env | xargs) && nohup node dist/index.js > /var/log/openclaw.log 2>&1 &
```

### 查看日志

```bash
tail -f /var/log/openclaw.log
grep "ERROR" /var/log/openclaw.log
```

### 更新代码

```bash
cd /opt/ZYagent
git pull origin main
cd backend/core-service
npm install --production
# 如有新迁移文件，执行
# for f in migrations/*.sql; do sudo -u postgres psql -d openclaw -f "$f"; done
pm2 restart openclaw-core
```

---

## 十二、故障排查

| 现象 | 原因 | 解决 |
|------|------|------|
| `Error: connect ECONNREFUSED 127.0.0.1:5432` | PostgreSQL 未启动 | `sudo systemctl start postgresql` |
| `Error: listen EADDRINUSE :::3001` | 端口被占用 | `lsof -i :3001` 找到进程并 kill |
| `MODULE_NOT_FOUND` | 依赖未安装 | `npm install --production` |
| `FeishuAdapter is not a constructor` | feishu-adapter.js 缺失 | 运行 fix-dist.sh |
| `WebSocketServer is not a constructor` | ws-server.js 导出错误 | 运行 fix-dist.sh |
| JWT_SECRET too short | 密钥长度不足 | 确保 >= 32 字符 |

---

## 附录：API 端点速查

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查（端口 3004） |
| GET | `/api/workspaces/workspaces` | 工作空间列表 |
| POST | `/api/workspaces` | 创建工作空间 |
| GET | `/api/tasks` | 任务列表 |
| POST | `/api/tasks` | 创建任务 |
| POST | `/api/ilink/bind/wechat` | 生成微信绑定令牌 |
| GET | `/api/ilink/bind/status?token=xxx` | 查询绑定状态 |
| WS | `/ws` | WebSocket 连接（端口 3003） |
