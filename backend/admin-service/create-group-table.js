const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://openclaw:openclaw_pass_2024@localhost:5432/openclaw' });

(async () => {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS group_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      group_id UUID,
      from_soul_id UUID,
      to_soul_id UUID,
      role VARCHAR(20),
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )`);
    console.log('group_messages table created');
  } catch(e) {
    console.error('Error:', e.message);
  } finally {
    await pool.end();
  }
})();
