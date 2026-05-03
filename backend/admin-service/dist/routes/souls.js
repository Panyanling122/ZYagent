"use strict";
/**
 * =============================================================================
 * 模块名称：Soul管理路由
 * 功能描述：Soul的CRUD、状态切换、模型绑定
 * 技术决策引用：#26 #27
 * 创建日期：2026-04-30
 * 最后修改：2026-04-30
 * =============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.soulRouter = void 0;
const express_1 = require("express");
const router = (0, express_1.Router)();
exports.soulRouter = router;
const db_1 = require("../utils/db");
// GET /api/souls - List all souls
// GET /api/souls - Soul列表
router.get("/", async (req, res) => {
    try {
        const result = await db_1.db.query(`
      SELECT s.*, u.username as bound_user_name 
      FROM souls s 
      LEFT JOIN users u ON s.bound_user_id = u.id 
      ORDER BY s.created_at
    `);
        res.json({ success: true, data: result.rows });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// GET /api/souls/:id
// GET /api/souls/:id - Soul详情
router.get("/:id", async (req, res) => {
    try {
        const result = await db_1.db.query("SELECT * FROM souls WHERE id = $1", [req.params.id]);
        if (result.rows.length === 0)
            return res.status(404).json({ success: false, error: "Soul not found" });
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// POST /api/souls - Create soul
// POST /api/souls - 创建Soul
router.post("/", async (req, res) => {
    try {
        const { name, default_model, system_prompt, daily_summary_time, bound_user_id } = req.body;
        const result = await db_1.db.query(`
      INSERT INTO souls (name, default_model, system_prompt, daily_summary_time, bound_user_id, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, 'offline', NOW(), NOW())
      RETURNING *
    `, [name, default_model || 'gpt-4o', system_prompt || '', daily_summary_time || '0 3 * * *', bound_user_id || null]);
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// PUT /api/souls/:id
// PUT /api/souls/:id - 更新Soul
router.put("/:id", async (req, res) => {
    try {
        const { name, default_model, system_prompt, daily_summary_time, status, max_tokens_per_day } = req.body;
        const result = await db_1.db.query(`
      UPDATE souls SET 
        name = COALESCE($1, name),
        default_model = COALESCE($2, default_model),
        system_prompt = COALESCE($3, system_prompt),
        daily_summary_time = COALESCE($4, daily_summary_time),
        status = COALESCE($5, status),
        max_tokens_per_day = COALESCE($6, max_tokens_per_day),
        updated_at = NOW()
      WHERE id = $7
      RETURNING *
    `, [name, default_model, system_prompt, daily_summary_time, status, max_tokens_per_day, req.params.id]);
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// DELETE /api/souls/:id
router.delete("/:id", async (req, res) => {
    try {
        await db_1.db.query("DELETE FROM souls WHERE id = $1", [req.params.id]);
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
