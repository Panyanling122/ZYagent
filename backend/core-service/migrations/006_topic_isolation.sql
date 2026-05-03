-- =============================================================================
-- 话题隔离系统数据库迁移
-- 解决多话题上下文污染问题
-- =============================================================================

-- 1. 给 messages 表添加 topic 字段（如果不存在）
DO $$ BEGIN
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS topic varchar(64) DEFAULT 'default';
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS session_id uuid;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS topic_changed boolean DEFAULT false;
EXCEPTION WHEN duplicate_column THEN
    NULL;
END $$;

-- 2. 创建话题索引
CREATE INDEX IF NOT EXISTS idx_messages_topic ON messages(soul_id, user_id, topic);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_topic_changed ON messages(soul_id, user_id, topic_changed) WHERE topic_changed = true;

-- 3. 创建话题会话表
CREATE TABLE IF NOT EXISTS conversation_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    soul_id UUID NOT NULL REFERENCES souls(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    topic varchar(64) NOT NULL DEFAULT 'default',
    topic_summary text,                          -- AI生成的话题摘要
    message_count int DEFAULT 0,
    total_tokens int DEFAULT 0,
    is_active boolean DEFAULT true,
    last_message_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    UNIQUE(soul_id, user_id, topic)
);

CREATE INDEX IF NOT EXISTS idx_sessions_active ON conversation_sessions(soul_id, user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_sessions_last ON conversation_sessions(last_message_at DESC);

-- 4. 创建话题切换检测日志表
CREATE TABLE IF NOT EXISTS topic_transitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    soul_id UUID NOT NULL,
    user_id UUID NOT NULL,
    previous_topic varchar(64),
    new_topic varchar(64),
    trigger_message text,                        -- 触发切换的消息
    detection_method varchar(32),                -- 'auto' | 'manual' | 'time_gap'
    confidence float,                              -- 话题切换置信度 (0-1)
    created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transitions_user ON topic_transitions(soul_id, user_id, created_at DESC);

-- 5. 创建会话激活状态维护触发器
CREATE OR REPLACE FUNCTION maintain_session_activity()
RETURNS TRIGGER AS $$
BEGIN
    -- 更新会话最后消息时间
    UPDATE conversation_sessions 
    SET last_message_at = NEW.created_at,
        message_count = message_count + 1
    WHERE soul_id = NEW.soul_id 
      AND user_id = NEW.user_id 
      AND topic = COALESCE(NEW.topic, 'default');
    
    -- 如果不存在则创建
    IF NOT FOUND THEN
        INSERT INTO conversation_sessions (soul_id, user_id, topic, message_count)
        VALUES (NEW.soul_id, NEW.user_id, COALESCE(NEW.topic, 'default'), 1)
        ON CONFLICT (soul_id, user_id, topic) DO NOTHING;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS maintain_session_activity_trigger ON messages;
CREATE TRIGGER maintain_session_activity_trigger
    AFTER INSERT ON messages
    FOR EACH ROW EXECUTE FUNCTION maintain_session_activity();

-- 6. 创建自动过期会话清理函数（30分钟无消息视为会话结束）
CREATE OR REPLACE FUNCTION deactivate_old_sessions()
RETURNS void AS $$
BEGIN
    UPDATE conversation_sessions 
    SET is_active = false
    WHERE is_active = true 
      AND last_message_at < NOW() - INTERVAL '30 minutes';
END;
$$ LANGUAGE plpgsql;

-- 7. 查看当前所有活跃会话
CREATE OR REPLACE VIEW active_sessions AS
SELECT 
    s.id,
    s.soul_id,
    s.user_id,
    s.topic,
    s.topic_summary,
    s.message_count,
    s.last_message_at,
    s.created_at,
    EXTRACT(EPOCH FROM (NOW() - s.last_message_at))::int as idle_seconds
FROM conversation_sessions s
WHERE s.is_active = true;
