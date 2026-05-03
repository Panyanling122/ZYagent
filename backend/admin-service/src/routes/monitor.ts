/**
 * =============================================================================
 * 模块名称：监控告警服务
 * 功能描述：系统健康监控、Soul状态实时检查、API性能统计、告警触发
 * 技术决策引用：#86 #90 #93
 * 创建日期：2026-04-30
 * =============================================================================
 */

import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { db } from "../utils/db";

const router = Router();
router.use(authMiddleware);

// GET /api/monitor/overview - 系统概览仪表盘
router.get("/overview", async (_req, res) => {
  try {
    // Soul状态统计
    const souls = await db.query(`SELECT id, name, status, default_model FROM souls ORDER BY name`);

    // 今日消息统计
    const todayMessages = await db.query(
      `SELECT COUNT(*) as count FROM messages WHERE DATE(created_at) = CURRENT_DATE`
    );

    // 今日Token消耗
    const todayTokens = await db.query(
      `SELECT COALESCE(SUM(total_tokens), 0) as total FROM token_usage WHERE DATE(created_at) = CURRENT_DATE`
    );

    // 活跃用户
    const activeUsers = await db.query(
      `SELECT COUNT(DISTINCT user_id) as count FROM device_sessions WHERE last_active_at > NOW() - INTERVAL '24 hours' AND is_revoked = false`
    );

    // 数据库大小
    const dbSize = await db.query(
      `SELECT pg_size_pretty(pg_database_size('openclaw')) as size`
    );

    res.json({
      success: true,
      data: {
        souls: souls.rows,
        today_messages: parseInt(todayMessages.rows[0].count),
        today_tokens: parseInt(todayTokens.rows[0].total),
        active_users_24h: parseInt(activeUsers.rows[0].count),
        database_size: dbSize.rows[0].size,
        timestamp: new Date().toISOString(),
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/monitor/souls - Soul实时状态
// GET /api/monitor/souls - Soul状态监控
router.get("/souls", async (_req, res) => {
  try {
    const result = await db.query(`
      SELECT s.id, s.name, s.status, s.default_model,
             COUNT(m.id) as message_count,
             MAX(m.created_at) as last_message_at
      FROM souls s
      LEFT JOIN messages m ON m.soul_id = s.id AND DATE(m.created_at) = CURRENT_DATE
      GROUP BY s.id, s.name, s.status, s.default_model
      ORDER BY s.name
    `);
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/monitor/tokens - Token消耗趋势
// GET /api/tokens - Token监控
router.get("/tokens", async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const result = await db.query(
      `SELECT DATE(created_at) as date, SUM(total_tokens) as tokens, COUNT(*) as requests
       FROM token_usage
       WHERE created_at > CURRENT_DATE - INTERVAL '${days} days'
       GROUP BY DATE(created_at)
       ORDER BY date DESC
       LIMIT $1`,
      [days]
    );
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/monitor/alerts - 告警列表
router.get("/alerts", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const result = await db.query(
      `SELECT id, type, severity, message, created_at
       FROM alerts
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/monitor/alerts/:id/resolve - 解决告警
router.put("/alerts/:id/resolve", async (req, res) => {
  try {
    await db.query(`UPDATE alerts SET resolved_at = NOW() WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export { router as monitorRouter };
