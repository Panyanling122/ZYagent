"use strict";
/**
 * =============================================================================
 * 模块名称：记忆管理路由
 * 功能描述：L1/L2/L3记忆查询、搜索、管理
 * 技术决策引用：#41 #42 #43
 * 创建日期：2026-04-30
 * 最后修改：2026-04-30
 * =============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.memoryRouter = void 0;
const express_1 = require("express");
const router = (0, express_1.Router)();
exports.memoryRouter = router;
const db_1 = require("../utils/db");
// GET /api/memory - 概览
// GET /api/memory - 记忆概览统计
router.get("/", async (_req, res) => {
    try {
        const l1 = await db_1.db.query("SELECT COUNT(*) as count FROM l1_messages WHERE is_active = true");
        const l2 = await db_1.db.query("SELECT COUNT(*) as count FROM l2_summaries");
        const l3 = await db_1.db.query("SELECT COUNT(*) as count FROM l3_knowledge");
        res.json({ success: true, data: { l1_active: parseInt(l1.rows[0].count), l2_summaries: parseInt(l2.rows[0].count), l3_knowledge: parseInt(l3.rows[0].count) } });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// GET /api/memory/l2 - Daily summaries
// GET /api/memory/l2 - L2日总结列表
router.get("/l2", async (req, res) => {
    try {
        const { soul_id, date } = req.query;
        let sql = "SELECT * FROM l2_summaries WHERE 1=1";
        const params = [];
        if (soul_id) {
            params.push(soul_id);
            sql += ` AND soul_id = $${params.length}`;
        }
        if (date) {
            params.push(date);
            sql += ` AND date = $${params.length}`;
        }
        sql += " ORDER BY date DESC";
        const result = await db_1.db.query(sql, params);
        res.json({ success: true, data: result.rows });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// GET /api/memory/l3 - Topic knowledge
// GET /api/memory/l3 - L3知识库列表
router.get("/l3", async (req, res) => {
    try {
        const { soul_id, topic } = req.query;
        let sql = "SELECT * FROM l3_knowledge WHERE 1=1";
        const params = [];
        if (soul_id) {
            params.push(soul_id);
            sql += ` AND soul_id = $${params.length}`;
        }
        if (topic) {
            params.push(`%${topic}%`);
            sql += ` AND topic ILIKE $${params.length}`;
        }
        sql += " ORDER BY updated_at DESC";
        const result = await db_1.db.query(sql, params);
        res.json({ success: true, data: result.rows });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// PUT /api/memory/l3/:id - Edit knowledge
// PUT /api/memory/l3/:id - 编辑L3知识
router.put("/l3/:id", async (req, res) => {
    try {
        const { content } = req.body;
        const result = await db_1.db.query("UPDATE l3_knowledge SET content=$1, updated_at=NOW() WHERE id=$2 RETURNING *", [content, req.params.id]);
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
