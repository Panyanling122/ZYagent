-- =============================================================================
-- 迁移：iLink 微信对接基础表
-- 创建 ilink_contexts 和 ilink_user_mappings 表
-- =============================================================================

-- iLink 上下文连接表
CREATE TABLE IF NOT EXISTS ilink_contexts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    context_token VARCHAR(128) NOT NULL UNIQUE,
    soul_id UUID NOT NULL REFERENCES souls(id) ON DELETE CASCADE,
    bot_token VARCHAR(256) NOT NULL,
    status VARCHAR(32) DEFAULT 'active',          -- active | inactive | error
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ilink_contexts_soul ON ilink_contexts(soul_id);
CREATE INDEX IF NOT EXISTS idx_ilink_contexts_status ON ilink_contexts(status);

-- 微信用户映射表
CREATE TABLE IF NOT EXISTS ilink_user_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wx_user_id VARCHAR(64) NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    soul_id UUID NOT NULL REFERENCES souls(id) ON DELETE CASCADE,
    wx_name VARCHAR(128),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(wx_user_id, soul_id)
);

CREATE INDEX IF NOT EXISTS idx_ilink_mappings_user ON ilink_user_mappings(user_id);
CREATE INDEX IF NOT EXISTS idx_ilink_mappings_wx ON ilink_user_mappings(wx_user_id);

-- 触发器自动更新 updated_at
CREATE OR REPLACE FUNCTION update_ilink_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ilink_contexts_updated_at ON ilink_contexts;
CREATE TRIGGER ilink_contexts_updated_at
    BEFORE UPDATE ON ilink_contexts
    FOR EACH ROW EXECUTE FUNCTION update_ilink_updated_at();
