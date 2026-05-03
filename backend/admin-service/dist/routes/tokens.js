"use strict";
/**
 * =============================================================================
 * 模块名称：Token统计路由
 * 功能描述：大模型Token使用量统计、限额管理
 * 技术决策引用：#90 #91
 * 创建日期：2026-04-30
 * 最后修改：2026-04-30
 * =============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.tokenRouter = void 0;
const express_1 = require("express");
const router = (0, express_1.Router)();
exports.tokenRouter = router;
const db_1 = require("../utils/db");
// GET /api/tokens - 今日Token用量
router.get("/", async (_req, res) => {
    try {
        const today = await db_1.db.query("SELECT COALESCE(SUM(total_tokens), 0) as total FROM token_usage WHERE DATE(created_at) = CURRENT_DATE");
        const yesterday = await db_1.db.query("SELECT COALESCE(SUM(total_tokens), 0) as total FROM token_usage WHERE DATE(created_at) = CURRENT_DATE - 1");
        res.json({ success: true, data: { today: parseInt(today.rows[0].total), yesterday: parseInt(yesterday.rows[0].total) } });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// GET /api/tokens/usage - Token用量明细
router.get("/usage", async (req, res) => {
    try {
        const { soul_id, start_date, end_date } = req.query;
        let sql = `SELECT date, SUM(total_tokens) as total, SUM(prompt_tokens) as prompt, SUM(completion_tokens) as completion 
             FROM token_usage WHERE 1=1`;
        const params = [];
        if (soul_id) {
            params.push(soul_id);
            sql += ` AND soul_id = $${params.length}`;
        }
        if (start_date) {
            params.push(start_date);
            sql += ` AND date >= $${params.length}`;
        }
        if (end_date) {
            params.push(end_date);
            sql += ` AND date <= $${params.length}`;
        }
        sql += " GROUP BY date ORDER BY date DESC LIMIT 90";
        const result = await db_1.db.query(sql, params);
        res.json({ success: true, data: result.rows });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
