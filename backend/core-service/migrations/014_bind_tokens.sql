-- =============================================================================
-- 迁移 014：微信绑定令牌表（WeChat Bind Tokens）
-- =============================================================================

CREATE TABLE IF NOT EXISTS ilink_bind_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token VARCHAR(32) NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES users(id),
    soul_id UUID REFERENCES souls(id),
    status VARCHAR(16) DEFAULT 'pending' CHECK (status IN ('pending', 'bound', 'expired')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '10 minutes'
);

CREATE INDEX IF NOT EXISTS idx_bind_tokens_user ON ilink_bind_tokens(user_id, status);
CREATE INDEX IF NOT EXISTS idx_bind_tokens_token ON ilink_bind_tokens(token);
