/**
 * =============================================================================
 * 模块名称：认证路由
 * 功能描述：用户登录（单设备）、登出、Token刷新、当前用户信息查询。密码bcrypt哈希存储，JWT签发，device_session表管理单设备登录。
 * 技术决策引用：#60 #61 #62 #88
 * 创建日期：2026-04-30
 * =============================================================================
 */

import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "../utils/db";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("[FATAL] JWT_SECRET environment variable is not set");
  process.exit(1);
}

/** 生成JWT Token，包含userId/username/isAdmin/deviceId */
function generateToken(userId: string, username: string, isAdmin: boolean, deviceId: string): string {
  return jwt.sign({ userId, username, isAdmin, deviceId }, JWT_SECRET, { expiresIn: "24h" });
}

/** 验证JWT Token，无效时抛出明确错误 */
function verifyToken(token: string): any {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err: any) {
    throw new Error("Invalid token: " + err.message);
  }
}

// POST /api/auth/login - 用户登录（单设备登录，新登录撤销旧session）
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { username, password, deviceId: providedDeviceId } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: "Username and password required" });
    }
    const deviceId = providedDeviceId || crypto.randomBytes(16).toString("hex");

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        "SELECT id, username, password_hash, is_admin FROM users WHERE username = $1 AND is_active = true",
        [username]
      );
      if (result.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(401).json({ success: false, error: "Invalid credentials" });
      }
      const user = result.rows[0];
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        await client.query("ROLLBACK");
        return res.status(401).json({ success: false, error: "Invalid credentials" });
      }
      await client.query(
        "UPDATE device_sessions SET is_revoked = true WHERE user_id = $1 AND is_revoked = false",
        [user.id]
      );
      await client.query(
        "INSERT INTO device_sessions (user_id, device_id, device_name, is_revoked) VALUES ($1, $2, $3, false)",
        [user.id, deviceId, req.headers["user-agent"] || "unknown"]
      );
      const token = generateToken(user.id, user.username, user.is_admin, deviceId);
      await client.query("COMMIT");
      res.json({ success: true, data: { token, username: user.username, isAdmin: user.is_admin, deviceId } });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, error: "Login failed" });
  }
});

// POST /api/auth/logout - 用户登出（撤销当前device session）
router.post("/logout", async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, error: "No token" });
    const decoded = verifyToken(token);
    await db.query(
      "UPDATE device_sessions SET is_revoked = true WHERE user_id = $1 AND device_id = $2",
      [decoded.userId, decoded.deviceId]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: "Logout failed" });
  }
});

// GET /api/auth/me - 获取当前登录用户信息
router.get("/me", async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, error: "No token" });
    const decoded = verifyToken(token);
    res.json({ success: true, data: { userId: decoded.userId, username: decoded.username, isAdmin: decoded.isAdmin } });
  } catch (err: any) {
    res.status(401).json({ success: false, error: "Invalid token" });
  }
});

// POST /api/auth/refresh - Token续期（需device session有效）
router.post("/refresh", async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, error: "No token" });
    const decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true }) as any;
    const result = await db.query(
      "SELECT id FROM device_sessions WHERE user_id = $1 AND device_id = $2 AND is_revoked = false LIMIT 1",
      [decoded.userId, decoded.deviceId]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, error: "Session revoked" });
    }
    const newToken = generateToken(decoded.userId, decoded.username, decoded.isAdmin, decoded.deviceId);
    res.json({ success: true, data: { token: newToken } });
  } catch (err: any) {
    res.status(401).json({ success: false, error: "Token refresh failed" });
  }
});

export { router as authRouter };
