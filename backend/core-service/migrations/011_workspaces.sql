-- =============================================================================
-- 迁移 011：工作空间隔离
-- =============================================================================

CREATE TABLE IF NOT EXISTS workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(64) NOT NULL,
    description TEXT,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    icon VARCHAR(32) DEFAULT '📁',
    is_default BOOLEAN DEFAULT false,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(16) DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(workspace_id, user_id)
);

ALTER TABLE souls ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_souls_workspace ON souls(workspace_id);

ALTER TABLE messages ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_messages_workspace ON messages(workspace_id);

ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON scheduled_tasks(workspace_id);

INSERT INTO workspaces (name, description, owner_id, is_default, icon)
SELECT username || '的默认空间', '自动创建的默认工作空间', id, true, '🏠'
FROM users
WHERE NOT EXISTS (SELECT 1 FROM workspaces WHERE owner_id = users.id AND is_default = true);

UPDATE souls SET workspace_id = (
    SELECT w.id FROM workspaces w WHERE w.owner_id = souls.bound_user_id AND w.is_default = true LIMIT 1
) WHERE workspace_id IS NULL;

UPDATE messages SET workspace_id = (
    SELECT s.workspace_id FROM souls s WHERE s.id = messages.soul_id
) WHERE workspace_id IS NULL;

UPDATE scheduled_tasks SET workspace_id = (
    SELECT s.workspace_id FROM souls s WHERE s.id = scheduled_tasks.soul_id
) WHERE workspace_id IS NULL;
