/**
 * 系统维护路由 - 健康检查、统计、备份
 */

import { Router } from "express";
import { db } from "../utils/db";

const router = Router();

// GET /api/system/health
// GET /api/system/health - 健康检查
router.get("/health", async (_req, res) => {
  try {
    const result = await db.query("SELECT 1");
    res.json({ success: true, status: "healthy", database: "connected", timestamp: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ success: true, status: "healthy", database: "disconnected", timestamp: new Date().toISOString() });
  }
});

// GET /api/system/stats
// GET /api/system/stats - 系统统计
router.get("/stats", async (_req, res) => {
  try {
    const souls = await db.query("SELECT status, COUNT(*) FROM souls GROUP BY status");
    const messages = await db.query("SELECT COUNT(*) FROM messages WHERE DATE(created_at) = CURRENT_DATE");
    const tokens = await db.query("SELECT COALESCE(SUM(total_tokens), 0) as total FROM token_usage WHERE DATE(created_at) = CURRENT_DATE");
    const soulList = await db.query("SELECT id, name, status FROM souls ORDER BY id");
    res.json({
      success: true,
      data: {
        souls: souls.rows,
        todayMessages: parseInt(messages.rows[0]?.count || 0),
        todayTokens: parseInt(tokens.rows[0]?.total || 0),
        soulList: soulList.rows,
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/system/backup
// POST /api/system/backup - 触发备份
router.post("/backup", async (_req, res) => {
  try {
    res.json({ success: true, message: "Backup triggered - implement pg_dump call" });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export { router as systemRouter };
