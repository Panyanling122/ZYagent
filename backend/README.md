# 中亿智能体 - 后端开发文档

## 项目概述

后端采用双进程架构：
- **core-service**: WebSocket 服务 + AI 网关 + 群聊引擎
- **admin-service**: HTTP API + 用户管理 + Soul 管理 + Provider 配置

## 架构图

```
┌─────────────────┐      ┌─────────────────┐
│   core-service  │      │  admin-service  │
│   Port: 3001    │      │   Port: 3002    │
│   WS: 3003      │      │                 │
│   Health: 3004  │      │                 │
└────────┬────────┘      └────────┬────────┘
         │                        │
         └──────────┬─────────────┘
                    │
         ┌──────────▼──────────┐
         │  PostgreSQL :5432    │
         │  DB: openclaw        │
         └─────────────────────┘
```

## 目录结构

```
backend/
├── core-service/          # 核心服务
│   ├── dist/              # 编译产物（Node.js 直接运行）
│   │   ├── index.js       # 入口
│   │   ├── websocket/
│   │   │   └── ws-server.js    # WebSocket 服务器
│   │   ├── soul/
│   │   │   ├── soul-process.js  # Soul 处理引擎
│   │   │   ├── soul-manager.js  # Soul 管理器
│   │   │   └── group-service.js # 群聊服务
│   │   ├── gateway/
│   │   │   └── ai-gateway.js    # AI 网关（加密+回退）
│   │   ├── utils/
│   │   │   ├── crypto.js        # AES 加密工具
│   │   │   ├── db.js            # 数据库连接
│   │   │   └── config.js        # 配置管理
│   │   └── ...
│   └── src/               # TypeScript 源码
│
└── admin-service/         # 管理服务
    ├── dist/              # 编译产物
    │   ├── index.js       # 入口
    │   ├── routes/
    │   │   ├── auth.js         # 认证路由
    │   │   ├── users.js        # 用户管理
    │   │   ├── souls.js        # Soul 管理
    │   │   ├── providers.js    # Provider 配置
    │   │   └── channels.js     # 渠道管理
    │   └── utils/
    │       ├── crypto.js       # AES 加密工具
    │       └── db.js           # 数据库连接
    └── src/               # TypeScript 源码
```

## 数据库表结构

### 用户表 (users)
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  bound_soul_id UUID REFERENCES souls(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 管理员表 (admins)
```sql
CREATE TABLE admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(50) DEFAULT 'admin',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Soul 表 (souls)
```sql
CREATE TABLE souls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  system_prompt TEXT,
  avatar_url TEXT,
  status VARCHAR(20) DEFAULT 'offline',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Provider 配置表 (providers)
```sql
CREATE TABLE providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) UNIQUE NOT NULL,
  base_url TEXT NOT NULL,
  api_key TEXT NOT NULL,          -- AES 加密存储
  model_map JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT false,
  is_backup BOOLEAN DEFAULT false, -- 备用模型标记
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 消息表 (messages)
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  soul_id UUID REFERENCES souls(id),
  user_id UUID REFERENCES users(id),
  role VARCHAR(20) NOT NULL,      -- 'user' | 'assistant'
  content TEXT NOT NULL,
  session_id UUID,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## API 接口清单

### 认证 (auth)
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 桌面端用户登录 |
| POST | `/api/admin/login` | 管理员登录 |

### 用户管理 (users)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/users` | 用户列表 |
| POST | `/api/users` | 创建用户 |
| PUT | `/api/users/:id` | 更新用户 |
| PUT | `/api/users/:id/password` | 修改密码 |
| PUT | `/api/users/:id/username` | 修改用户名 |
| PUT | `/api/users/:id/soul` | 绑定/解绑 Soul |
| GET | `/api/users/me` | 当前用户信息 |

### Soul 管理 (souls)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/souls` | Soul 列表 |
| POST | `/api/souls` | 创建 Soul |
| PUT | `/api/souls/:id` | 更新 Soul |
| DELETE | `/api/souls/:id` | 删除 Soul |

### Provider 配置 (providers)
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/providers` | Provider 列表 |
| POST | `/api/providers` | 创建 Provider（自动加密 api_key）|
| PUT | `/api/providers/:id` | 更新 Provider（自动加密 api_key）|
| PUT | `/api/providers/:id/activate` | 激活/切换 Provider |

## 核心功能

### 1. API Key 加密存储
- AES-256-GCM 加密
- 写入时自动加密，读取时自动解密
- 环境变量 `API_KEY_ENCRYPTION_KEY` 控制密钥

**文件**: `core-service/dist/utils/crypto.js` + `admin-service/dist/utils/crypto.js`

### 2. 模型自动回退
- 主 Provider 失败时自动切换到备用 Provider
- 备用 Provider 通过 `is_backup=true` 标记

**文件**: `core-service/dist/gateway/ai-gateway.js`

### 3. 单设备登录
- 新设备登录踢掉旧设备的 WebSocket 连接
- 旧设备收到 `kickout` 消息自动退出

**文件**: `core-service/dist/websocket/ws-server.js`

### 4. WebSocket 心跳
- 支持 `ping`/`pong` 消息类型
- 连续 5 次未响应判定断线

**文件**: `core-service/dist/websocket/ws-server.js`

### 5. L1 对话上下文
- 每次请求查询最近 20 轮历史消息
- 组装 `[历史..., 当前消息]` 传给模型

**文件**: `core-service/dist/websocket/ws-server.js` (message 处理)

## 环境变量

```env
# 数据库
DATABASE_URL=postgresql://openclaw:openclaw_pass_2024@localhost:5432/openclaw

# JWT 密钥
JWT_SECRET=your-jwt-secret-here

# API Key 加密密钥（生产环境必须设置）
API_KEY_ENCRYPTION_KEY=your-32-byte-base64-key

# core-service 端口
PORT=3001          # HTTP API
WS_PORT=3003       # WebSocket
HEALTH_PORT=3004   # 健康检查

# admin-service 端口
PORT=3002
ADMIN_WEB_URL=http://39.107.241.63
```

## 启动方式

### core-service
```bash
cd core-service
export PORT=3001
export WS_PORT=3003
export HEALTH_PORT=3004
export DATABASE_URL="postgresql://openclaw:openclaw_pass_2024@localhost:5432/openclaw"
export JWT_SECRET="your-jwt-secret"
node dist/index.js
```

### admin-service
```bash
cd admin-service
export PORT=3002
export ADMIN_WEB_URL="http://39.107.241.63"
export DATABASE_URL="postgresql://openclaw:openclaw_pass_2024@localhost:5432/openclaw"
export JWT_SECRET="your-jwt-secret"
node dist/index.js
```

## 编译方式

```bash
# core-service
cd core-service
npm run build

# admin-service
cd admin-service
npm run build
```

## nginx 配置参考

```nginx
server {
    listen 80;

    # 桌面端
    location / {
        root /opt/openclaw/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # 后台管理
    location /admin/ {
        alias /opt/openclaw/dist/admin/;
        index index.html;
        try_files $uri $uri/ /admin/index.html;
    }

    # API 代理
    location /api/ {
        proxy_pass http://127.0.0.1:3002/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket 代理
    location /ws {
        proxy_pass http://127.0.0.1:3003/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## 测试账号

| 系统 | 用户名 | 密码 |
|------|--------|------|
| 桌面端 | test | 123456 |
| 桌面端 | 潘彦霖 | Panyu980612 |

## 待开发功能

- [ ] 飞书 Webhook 适配器
- [ ] 微信 iLink 适配器
- [ ] 统一消息总线
- [ ] Milvus 向量库
- [ ] L2 每日总结（定时任务）
- [ ] L3 话题知识库
- [ ] Token 统计图表
- [ ] Dashboard 告警系统
- [ ] Soul 完整状态机
- [ ] 群聊进度面板
- [ ] Docker 化部署
