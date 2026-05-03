-- =============================================================================
-- 迁移：初始数据库 Schema
-- 功能：创建核心表结构
--   - souls: Soul 配置表（system_prompt、状态、Token 限额）
--   - users: 用户表
--   - messages: 消息记录表
--   - providers: AI Provider 配置表（加密存储 API Key）
--   - groups: 群组表
--   - group_members: 群成员关系表
--   - audit_logs: 审计日志表
-- =============================================================================

CREATE TABLE IF NOT EXISTS souls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'busy', 'error', 'paused')),
    bound_user_id UUID,
    default_model VARCHAR(100) NOT NULL DEFAULT 'gpt-4o',
    system_prompt TEXT NOT NULL DEFAULT '',
    daily_summary_time VARCHAR(50) NOT NULL DEFAULT '0 3 * * *',
    max_tokens_per_day INTEGER NOT NULL DEFAULT 100000,
    used_tokens_today INTEGER NOT NULL DEFAULT 0,
    skills JSONB NOT NULL DEFAULT '[]',
    groups JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    bound_soul_id UUID REFERENCES souls(id),
    permissions JSONB NOT NULL DEFAULT '[]',
    is_admin BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    soul_id UUID NOT NULL REFERENCES souls(id),
    channel VARCHAR(20) NOT NULL,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    thinking_content TEXT,
    type VARCHAR(20) NOT NULL DEFAULT 'text',
    status VARCHAR(20) NOT NULL DEFAULT 'sent',
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS l1_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    soul_id UUID NOT NULL,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'text',
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_l1_soul_active ON l1_messages(soul_id, is_active);

CREATE TABLE IF NOT EXISTS l2_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    soul_id UUID NOT NULL REFERENCES souls(id),
    topic VARCHAR(255) NOT NULL,
    summary TEXT NOT NULL,
    date DATE NOT NULL,
    message_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_l2_soul_date ON l2_summaries(soul_id, date);

CREATE TABLE IF NOT EXISTS l3_knowledge (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    soul_id UUID NOT NULL REFERENCES souls(id),
    topic VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    last_merged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(soul_id, topic)
);

CREATE TABLE IF NOT EXISTS skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    version VARCHAR(50) NOT NULL DEFAULT '1.0.0',
    description TEXT NOT NULL DEFAULT '',
    code TEXT NOT NULL DEFAULT '',
    skill_md TEXT NOT NULL DEFAULT '',
    depends_on JSONB NOT NULL DEFAULT '[]',
    bound_souls JSONB NOT NULL DEFAULT '[]',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS groups_table (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    member_soul_ids JSONB NOT NULL DEFAULT '[]',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    soul_id UUID NOT NULL REFERENCES souls(id),
    type VARCHAR(20) NOT NULL,
    cron VARCHAR(100) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    skill_id UUID REFERENCES skills(id),
    channel VARCHAR(20) NOT NULL DEFAULT 'websocket',
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS token_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    soul_id UUID NOT NULL REFERENCES souls(id),
    model VARCHAR(100) NOT NULL,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    date DATE NOT NULL,
    hour INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_token_soul_date ON token_usage(soul_id, date);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(100) NOT NULL,
    resource_id VARCHAR(100),
    details JSONB NOT NULL DEFAULT '{}',
    ip INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL,
    soul_id UUID REFERENCES souls(id),
    severity VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    is_resolved BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- Insert 4 default souls
INSERT INTO souls (id, name, status, default_model, system_prompt, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Soul-Alpha', 'offline', 'gpt-4o', 'You are Soul-Alpha, a helpful AI assistant.', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000000002', 'Soul-Beta',  'offline', 'gpt-4o', 'You are Soul-Beta,  a helpful AI assistant.', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000000003', 'Soul-Gamma', 'offline', 'gpt-4o', 'You are Soul-Gamma, a helpful AI assistant.', NOW(), NOW()),
    ('00000000-0000-0000-0000-000000000004', 'Soul-Delta', 'offline', 'gpt-4o', 'You are Soul-Delta, a helpful AI assistant.', NOW(), NOW())
ON CONFLICT DO NOTHING;

