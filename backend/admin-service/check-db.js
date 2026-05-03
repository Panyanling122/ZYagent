const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://openclaw:openclaw_pass_2024@localhost:5432/openclaw' });

(async () => {
  try {
    const res = await pool.query('SELECT id, name, member_soul_ids, status FROM groups_table');
    console.log('=== 群列表 ===');
    res.rows.forEach(r => console.log(JSON.stringify(r)));

    const res2 = await pool.query('SELECT id, name, system_prompt FROM souls LIMIT 10');
    console.log('\n=== Soul 列表 ===');
    res2.rows.forEach(r => console.log(JSON.stringify(r)));

    const res3 = await pool.query('SELECT COUNT(*) FROM group_messages');
    console.log('\n群消息数:', res3.rows[0].count);

    const res4 = await pool.query('SELECT id, from_soul_id, to_soul_id, content, created_at FROM group_messages ORDER BY created_at DESC LIMIT 5');
    console.log('\n最近5条群消息:');
    res4.rows.forEach(r => console.log(JSON.stringify(r)));
  } catch(e) {
    console.error('Error:', e.message);
  } finally {
    await pool.end();
  }
})();
