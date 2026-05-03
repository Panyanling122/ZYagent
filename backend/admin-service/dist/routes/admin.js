"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminRouter = void 0;
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("../utils/db");
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const router = (0, express_1.Router)();
exports.adminRouter = router;
// POST /api/admin/login
router.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;
        const result = await db_1.db.query("SELECT id, password_hash FROM admins WHERE username = $1 AND is_active = true", [username]);
        if (result.rows.length === 0) {
            res.status(401).json({ success: false, error: "Invalid credentials" });
            return;
        }
        const valid = await bcryptjs_1.default.compare(password, result.rows[0].password_hash);
        if (!valid) {
            res.status(401).json({ success: false, error: "Invalid credentials" });
            return;
        }
        const token = jsonwebtoken_1.default.sign({ adminId: result.rows[0].id, username }, JWT_SECRET, { expiresIn: "7d" });
        res.json({ success: true, data: { token, username } });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// GET /api/admin/profile
router.get("/profile", async (req, res) => {
    try {
        const adminId = req.user?.adminId;
        if (!adminId) {
            res.status(401).json({ success: false, error: "Unauthorized" });
            return;
        }
        const result = await db_1.db.query("SELECT id, username, is_active, created_at FROM admins WHERE id = $1", [adminId]);
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// PUT /api/admin/password
router.put("/password", async (req, res) => {
    try {
        const adminId = req.user?.adminId;
        const { password } = req.body;
        if (!password || password.length < 6) {
            res.status(400).json({ success: false, error: "Password too short" });
            return;
        }
        const hash = await bcryptjs_1.default.hash(password, 10);
        await db_1.db.query("UPDATE admins SET password_hash = $1 WHERE id = $2", [hash, adminId]);
        res.json({ success: true, message: "Password updated" });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
