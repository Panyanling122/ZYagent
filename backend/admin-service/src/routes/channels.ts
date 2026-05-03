/**
 * =============================================================================
 * 模块名称：渠道管理路由
 * 功能描述：微信/飞书渠道配置的CRUD API
 * 技术决策引用：#31 #32 #33
 * 创建日期：2026-04-30
 * =============================================================================
 */

import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { encrypt, decrypt } from "../utils/crypto";
import { db } from "../utils/db";

const router = Router();

// 所有渠道路由需要认证
router.use(authMiddleware);

// GET /api/channels - 获取渠道列表
// GET /api/channels - 渠道配置列表
router.get("/", async (_req, res) => {
  try {
    const result = await db.query(
      `SELECT id, channel_type, name, app_id, app_secret, webhook_url, is_active, created_at
       FROM channel_configs ORDER BY created_at DESC`
    );
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    console.error("[Channels] 查询失败:", err.message);
    res.status(500).json({ success: false, error: "查询失败" });
  }
});

// POST /api/channels - 创建渠道配置
router.post("/", async (req, res) => {
  try {
    const { channel_type, name, app_id, app_secret, token, webhook_url } = req.body;
    if (!channel_type || !name) {
      return res.status(400).json({ success: false, error: "渠道类型和名称必填" });
    }
    const result = await db.query(
      `INSERT INTO channel_configs (channel_type, name, app_id, app_secret, token, webhook_url, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING *`,
      [channel_type, name, app_id || null, (app_secret ? encrypt(app_secret) : null), token || null, webhook_url || null]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    console.error("[Channels] 创建失败:", err.message);
    res.status(500).json({ success: false, error: "创建失败" });
  }
});

// DELETE /api/channels/:id - 删除渠道配置
router.delete("/:id", async (req, res) => {
  try {
    await db.query(`DELETE FROM channel_configs WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err: any) {
    console.error("[Channels] 删除失败:", err.message);
    res.status(500).json({ success: false, error: "删除失败" });
  }
});

// PUT /api/channels/:id/toggle - 启用/禁用渠道
router.put("/:id/toggle", async (req, res) => {
  try {
    const result = await db.query(
      `UPDATE channel_configs SET is_active = NOT is_active WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    console.error("[Channels] 切换状态失败:", err.message);
    res.status(500).json({ success: false, error: "切换状态失败" });
  }
});

export { router as channelsRouter };
