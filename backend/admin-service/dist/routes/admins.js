"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminRouter = void 0;
const express_1 = require("express");
const bcryptjs_1 = require("bcryptjs");
const db_1 = require("../utils/db");
const router = (0, express_1.Router)();

// GET /api/admins - 管理员列表
router.get("/", async (_req, res) => {
  try {
    const result = await db_1.db.query("SELECT id, username, is_active, created_at FROM admins ORDER BY created_at DESC");
    res.json({ success: true, data: result.rows });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/admins - 创建管理员
router.post("/", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password || password.length < 6) {
      res.status(400).json({ success: false, error: "用户名和密码必填，密码至少6位" });
      return;
    }
    const hash = await (0, bcryptjs_1.hash)(password, 10);
    const result = await db_1.db.query(
      "INSERT INTO admins (username, password_hash, is_active, created_at, updated_at) VALUES ($1, $2, true, NOW(), NOW()) RETURNING id, username, is_active, created_at",
      [username, hash]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.message?.includes("unique")) { res.status(400).json({ success: false, error: "用户名已存在" }); return; }
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/admins/:id/password - 修改密码
router.put("/:id/password", async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) { res.status(400).json({ success: false, error: "密码至少6位" }); return; }
    const hash = await (0, bcryptjs_1.hash)(password, 10);
    await db_1.db.query("UPDATE admins SET password_hash = $1, updated_at = NOW() WHERE id = $2", [hash, req.params.id]);
    res.json({ success: true, message: "密码修改成功" });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// DELETE /api/admins/:id - 删除管理员
router.delete("/:id", async (req, res) => {
  try {
    // 禁止删除最后一个管理员
    const count = await db_1.db.query("SELECT COUNT(*) as cnt FROM admins WHERE is_active = true");
    if (parseInt(count.rows[0].cnt) <= 1) { res.status(400).json({ success: false, error: "至少保留一个活跃管理员" }); return; }
    await db_1.db.query("DELETE FROM admins WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

exports.adminRouter = router;
