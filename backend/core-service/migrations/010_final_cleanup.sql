-- =============================================================================
-- 迁移：收尾功能 - 消息撤回 + 密钥轮换 + 用户渠道 + 群日志
-- =============================================================================

-- 消息状态字段（用于撤回）
ALTER TABLE messages ADD COLUMN IF NOT EXISTS status VARCHAR(16) DEFAULT 'active' CHECK (status IN ('active', 'retracted'));
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);

-- 用户渠道偏好表
CREATE TABLE IF NOT EXISTS user_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel VARCHAR(32) NOT NULL CHECK (channel IN ('desktop', 'wechat', 'feishu')),
    is_active BOOLEAN DEFAULT true,
    priority INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, channel)
);
CREATE INDEX IF NOT EXISTS idx_user_channels_user ON user_channels(user_id);

-- Provider 密钥轮换历史
CREATE TABLE IF NOT EXISTS provider_key_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    old_key_encrypted TEXT NOT NULL,
    new_key_encrypted TEXT NOT NULL,
    rotated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    grace_period_days INT DEFAULT 7,
    completed_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_provider_key_history ON provider_key_history(provider_id, rotated_at DESC);

-- Provider 密钥状态
ALTER TABLE providers ADD COLUMN IF NOT EXISTS key_status VARCHAR(16) DEFAULT 'active' CHECK (key_status IN ('active', 'rotating'));
ALTER TABLE providers ADD COLUMN IF NOT EXISTS key_rotated_at TIMESTAMP WITH TIME ZONE;

-- 消息撤回日志
CREATE TABLE IF NOT EXISTS message_retract_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    retracted_by VARCHAR(64) NOT NULL,
    original_content TEXT,
    retracted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 定时任务内置预设
INSERT INTO scheduled_tasks (id, name, cron_expression, type, is_active, next_run_at, created_at)
VALUES 
    (gen_random_uuid(), 'daily_summary', '0 3 * * *', 'system', true, NOW() + INTERVAL '1 day', NOW()),
    (gen_random_uuid(), 'l3_merge', '0 4 * * 0', 'system', true, NOW() + INTERVAL '7 days', NOW()),
    (gen_random_uuid(), 'cleanup_files', '0 2 * * *', 'system', true, NOW() + INTERVAL '1 day', NOW()),
    (gen_random_uuid(), 'cleanup_logs', '0 1 * * *', 'system', true, NOW() + INTERVAL '1 day', NOW())
ON CONFLICT DO NOTHING;
