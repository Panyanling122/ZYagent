import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../utils/db";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const router = Router();

// POST /api/admin/login
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await db.query("SELECT id, password_hash FROM admins WHERE username = $1 AND is_active = true", [username]);
    if (result.rows.length === 0) {
      res.status(401).json({ success: false, error: "Invalid credentials" });
      return;
    }
    const valid = await bcrypt.compare(password, result.rows[0].password_hash);
    if (!valid) { res.status(401).json({ success: false, error: "Invalid credentials" }); return; }
    const token = jwt.sign({ adminId: result.rows[0].id, username }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ success: true, data: { token, username } });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/admin/profile
router.get("/profile", async (req: any, res) => {
  try {
    const adminId = req.user?.adminId;
    if (!adminId) { res.status(401).json({ success: false, error: "Unauthorized" }); return; }
    const result = await db.query("SELECT id, username, is_active, created_at FROM admins WHERE id = $1", [adminId]);
    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// PUT /api/admin/password
router.put("/password", async (req: any, res) => {
  try {
    const adminId = req.user?.adminId;
    const { password } = req.body;
    if (!password || password.length < 6) { res.status(400).json({ success: false, error: "Password too short" }); return; }
    const hash = await bcrypt.hash(password, 10);
    await db.query("UPDATE admins SET password_hash = $1 WHERE id = $2", [hash, adminId]);
    res.json({ success: true, message: "Password updated" });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

export { router as adminRouter };
