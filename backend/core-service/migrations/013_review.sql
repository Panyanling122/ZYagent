-- =============================================================================
-- 迁移 013：后台经验提炼日志
-- =============================================================================

CREATE TABLE IF NOT EXISTS review_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    soul_id UUID REFERENCES souls(id),
    workspace_id UUID REFERENCES workspaces(id),
    trigger_reason VARCHAR(32) NOT NULL CHECK (trigger_reason IN ('message_count', 'task_done', 'manual')),
    review_output TEXT,
    memory_changes JSONB,
    skill_changes JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_logs_soul ON review_logs(soul_id, created_at DESC);
