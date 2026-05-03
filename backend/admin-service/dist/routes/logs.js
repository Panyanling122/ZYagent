"use strict";
/**
 * 日志查看路由 - 结构化日志查询、筛选、导出
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logRouter = void 0;
const express_1 = require("express");
const db_1 = require("../utils/db");
const router = (0, express_1.Router)();
exports.logRouter = router;
// GET /api/logs - 消息日志列表（支持soul_id筛选）
router.get("/", async (req, res) => {
    try {
        const { soul_id, limit = 100, offset = 0 } = req.query;
        let sql = `SELECT m.*, s.name as soul_name FROM messages m JOIN souls s ON m.soul_id = s.id WHERE 1=1`;
        const params = [];
        if (soul_id) {
            params.push(soul_id);
            sql += ` AND m.soul_id = $${params.length}`;
        }
        params.push(limit, offset);
        sql += ` ORDER BY m.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
        const result = await db_1.db.query(sql, params);
        res.json({ success: true, data: result.rows });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
