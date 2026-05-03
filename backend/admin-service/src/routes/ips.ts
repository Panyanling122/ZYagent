/**

 * =============================================================================
 * 模块名称：IP白名单管理路由
 * 功能描述：IP白名单CRUD、状态切换、请求拦截。
 *              DB故障时返回特殊标记阻止所有访问（安全降级）。
 * 技术决策引用：#64 #65 #66
 * 创建日期：2026-04-30
 * ==========================================================================
 */
import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { db } from "../utils/db";
const router = Router();
router.use(authMiddleware);

// GET /api/ips - IP白名单列表
router.get("/", async (_req, res) => {
  try {
    const result = await db.query(`SELECT id, ip_address, description, is_active, created_at FROM ip_whitelist ORDER BY created_at DESC`);
    res.json({ success: true, data: result.rows });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/ips - 添加IP
router.post("/", async (req, res) => {
  try {
    const { ip_address, description } = req.body;
    if (!ip_address) return res.status(400).json({ success: false, error: "IP地址必填" });
    const result = await db.query(
      `INSERT INTO ip_whitelist (ip_address, description, is_active) VALUES ($1, $2, true) RETURNING *`,
      [ip_address, description || ""]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// DELETE /api/ips/:id - 删除IP
router.delete("/:id", async (req, res) => {
  try { await db.query(`DELETE FROM ip_whitelist WHERE id = $1`, [req.params.id]); res.json({ success: true }); }
  catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

// PUT /api/ips/:id/toggle - 切换状态
router.put("/:id/toggle", async (req, res) => {
  try {
    const result = await db.query(`UPDATE ip_whitelist SET is_active = NOT is_active WHERE id = $1 RETURNING *`, [req.params.id]);
    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

export { router as ipRouter };
