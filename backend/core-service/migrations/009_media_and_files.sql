
-- 迁移：文件上传与存储
CREATE TABLE IF NOT EXISTS uploaded_files (
    id VARCHAR(64) PRIMARY KEY,
    soul_id UUID REFERENCES souls(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    original_name VARCHAR(256) NOT NULL,
    mime_type VARCHAR(128),
    file_size BIGINT NOT NULL,
    storage_type VARCHAR(16) NOT NULL CHECK (storage_type IN ('local', 'oss')),
    storage_path TEXT NOT NULL,
    url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_uploaded_files_soul ON uploaded_files(soul_id);
CREATE INDEX IF NOT EXISTS idx_uploaded_files_created ON uploaded_files(created_at);
