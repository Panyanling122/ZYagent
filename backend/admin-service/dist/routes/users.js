"use strict";
/**
 * 用户管理路由 - 用户CRUD、角色分配、Soul绑定
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRouter = void 0;
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_1 = require("../utils/db");
const router = (0, express_1.Router)();
exports.userRouter = router;
// GET /api/users/me - 当前用户信息（必须放在 /:id 之前）
router.get("/me", async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ success: false, error: "未认证" });
            return;
        }
        const result = await db_1.db.query(`
      SELECT u.id, u.username, u.is_admin, u.is_active, u.permissions,
             u.bound_soul_id, s.name as bound_soul_name, s.status as soul_status, s.default_model
      FROM users u LEFT JOIN souls s ON u.bound_soul_id = s.id
      WHERE u.id = $1
    `, [userId]);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: "用户不存在" });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// GET /api/users - 用户列表
router.get("/", async (_req, res) => {
    try {
        const result = await db_1.db.query(`
      SELECT u.id, u.username, u.is_admin, u.is_active, u.created_at,
             u.bound_soul_id, s.name as bound_soul_name, u.permissions
      FROM users u LEFT JOIN souls s ON u.bound_soul_id = s.id
      ORDER BY u.created_at DESC
    `);
        res.json({ success: true, data: result.rows });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// POST /api/users - 创建用户
router.post("/", async (req, res) => {
    try {
        const { username, password, permissions, bound_soul_id } = req.body;
        const hash = await bcryptjs_1.default.hash(password, 10);
        const result = await db_1.db.query(`INSERT INTO users (username, password_hash, permissions, bound_soul_id, is_active, created_at, updated_at)
       VALUES ($1,$2,$3,$4,true,NOW(),NOW()) RETURNING id, username, is_admin, is_active, bound_soul_id, permissions, created_at`, [username, hash, JSON.stringify(permissions || []), bound_soul_id || null]);
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// PUT /api/users/:id/username - 修改用户名
router.put("/:id/username", async (req, res) => {
    try {
        const { username } = req.body;
        if (!username || username.length < 2) {
            res.status(400).json({ success: false, error: "用户名至少2位" });
            return;
        }
        const exists = await db_1.db.query("SELECT id FROM users WHERE username = $1 AND id != $2", [username, req.params.id]);
        if (exists.rows.length > 0) {
            res.status(400).json({ success: false, error: "用户名已存在" });
            return;
        }
        await db_1.db.query("UPDATE users SET username = $1, updated_at = NOW() WHERE id = $2", [username, req.params.id]);
        res.json({ success: true, message: "用户名修改成功" });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// PUT /api/users/:id/password - 修改密码
router.put("/:id/password", async (req, res) => {
    try {
        const { password } = req.body;
        if (!password || password.length < 6) {
            res.status(400).json({ success: false, error: "密码至少6位" });
            return;
        }
        const hash = await bcryptjs_1.default.hash(password, 10);
        await db_1.db.query("UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2", [hash, req.params.id]);
        res.json({ success: true, message: "密码修改成功" });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// PUT /api/users/:id/soul - 绑定Soul
router.put("/:id/soul", async (req, res) => {
    try {
        const { soulId } = req.body;
        await db_1.db.query("UPDATE users SET bound_soul_id = $1, updated_at = NOW() WHERE id = $2", [soulId || null, req.params.id]);
        res.json({ success: true, message: soulId ? "Soul绑定成功" : "Soul解绑成功" });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// PUT /api/users/:id/permissions - 更新权限
router.put("/:id/permissions", async (req, res) => {
    try {
        const { permissions } = req.body;
        await db_1.db.query("UPDATE users SET permissions = $1, updated_at = NOW() WHERE id = $2", [JSON.stringify(permissions), req.params.id]);
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// DELETE /api/users/:id - 删除用户
router.delete("/:id", async (req, res) => {
    try {
        await db_1.db.query("DELETE FROM users WHERE id = $1", [req.params.id]);
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
