
const bcrypt = require("bcryptjs");
const db = require("./dist/utils/db").db;
(async () => {
  const hash = await bcrypt.hash("123456", 10);

  // Delete test user if exists
  await db.query("DELETE FROM users WHERE username = 'test'");

  // Insert test user
  await db.query(
    "INSERT INTO users (id, username, password_hash, is_active) VALUES (gen_random_uuid(), 'test', $1, true)",
    [hash]
  );

  console.log("Test user created: username=test, password=123456");

  // Verify
  const result = await db.query("SELECT username, password_hash FROM users WHERE username = 'test'");
  console.log("Test user hash length:", result.rows[0].password_hash.length);

  process.exit(0);
})();
