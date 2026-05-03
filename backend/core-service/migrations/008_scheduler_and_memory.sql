
-- =============================================================================
-- 迁移：定时任务系统表
-- =============================================================================

CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(128) NOT NULL,
    cron_expression VARCHAR(64) NOT NULL,
    type VARCHAR(16) NOT NULL CHECK (type IN ('user', 'system')), -- user=仅Cron, system=可手动
    skill_name VARCHAR(64),
    callback_endpoint VARCHAR(256),
    payload JSONB,
    soul_id UUID REFERENCES souls(id) ON DELETE SET NULL,
    push_channel VARCHAR(16) CHECK (push_channel IN ('desktop', 'feishu', 'both')),
    is_active BOOLEAN DEFAULT true,
    last_run_at TIMESTAMP WITH TIME ZONE,
    next_run_at TIMESTAMP WITH TIME ZONE,
    created_by VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_active ON scheduled_tasks(is_active, next_run_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_soul ON scheduled_tasks(soul_id);

-- 定时任务执行日志
CREATE TABLE IF NOT EXISTS task_execution_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES scheduled_tasks(id) ON DELETE CASCADE,
    status VARCHAR(16) NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
    output TEXT,
    error_message TEXT,
    duration_ms INT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_logs_task ON task_execution_logs(task_id, created_at DESC);

-- L2 每日总结表
CREATE TABLE IF NOT EXISTS daily_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    soul_id UUID NOT NULL REFERENCES souls(id) ON DELETE CASCADE,
    summary_date DATE NOT NULL,
    topic VARCHAR(128) NOT NULL,
    topic_name VARCHAR(256),
    summary_text TEXT NOT NULL,
    message_count INT DEFAULT 0,
    embedding vector(1536),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(soul_id, summary_date, topic)
);

CREATE INDEX IF NOT EXISTS idx_daily_summaries_soul ON daily_summaries(soul_id, summary_date DESC);

-- L3 话题知识库表
CREATE TABLE IF NOT EXISTS topic_knowledge (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    soul_id UUID NOT NULL REFERENCES souls(id) ON DELETE CASCADE,
    topic VARCHAR(128) NOT NULL,
    topic_name VARCHAR(256),
    content_md TEXT NOT NULL,
    content_json JSONB,
    embedding vector(1536),
    version INT DEFAULT 1,
    last_merged_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(soul_id, topic)
);

CREATE INDEX IF NOT EXISTS idx_topic_knowledge_soul ON topic_knowledge(soul_id, topic);

-- 系统日志表（用于清理策略）
CREATE TABLE IF NOT EXISTS system_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    level VARCHAR(16) NOT NULL,
    msg TEXT NOT NULL,
    user_id VARCHAR(64),
    session_id VARCHAR(64),
    channel VARCHAR(16),
    skill_name VARCHAR(64),
    meta JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_logs_created ON system_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level, created_at);
