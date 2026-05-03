
const bcrypt = require("bcryptjs");
const db = require("./dist/utils/db").db;
(async () => {
  const hash = await bcrypt.hash("Panyu980612", 10);
  await db.query("UPDATE users SET password_hash = $1 WHERE username = '潘彦霖'", [hash]);
  console.log("Password reset for 潘彦霖");
  const result = await db.query("SELECT id, username FROM users WHERE username = '潘彦霖'");
  console.log("User:", result.rows[0].username, "ID:", result.rows[0].id);
  process.exit(0);
})();
