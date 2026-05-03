-- =============================================================================
-- 迁移 012：看板任务队列
-- =============================================================================

CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title VARCHAR(256) NOT NULL,
    description TEXT,
    status VARCHAR(32) DEFAULT 'backlog'
        CHECK (status IN ('backlog', 'todo', 'in_progress', 'review', 'done', 'cancelled', 'awaiting_human')),
    priority VARCHAR(8) DEFAULT 'p2' CHECK (priority IN ('p0', 'p1', 'p2', 'p3')),
    type VARCHAR(16) DEFAULT 'ai_task' CHECK (type IN ('human_task', 'ai_task', 'mixed')),
    soul_id UUID REFERENCES souls(id) ON DELETE SET NULL,
    topic VARCHAR(64),
    channel VARCHAR(16),
    execution_context JSONB,
    awaiting_response TEXT,
    response_deadline TIMESTAMP WITH TIME ZONE,
    last_reminded_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES users(id),
    assigned_to UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to, status);

CREATE TABLE IF NOT EXISTS task_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    from_status VARCHAR(32),
    to_status VARCHAR(32),
    changed_by VARCHAR(64),
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_history_task ON task_history(task_id);

CREATE TABLE IF NOT EXISTS task_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author_type VARCHAR(16) CHECK (author_type IN ('human', 'soul', 'system')),
    author_id VARCHAR(64),
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);
