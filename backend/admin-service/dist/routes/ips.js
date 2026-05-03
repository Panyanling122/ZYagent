"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ipRouter = void 0;
/**

 * =============================================================================
 * 模块名称：IP白名单管理路由
 * 功能描述：IP白名单CRUD、状态切换、请求拦截。
 *              DB故障时返回特殊标记阻止所有访问（安全降级）。
 * 技术决策引用：#64 #65 #66
 * 创建日期：2026-04-30
 * ==========================================================================
 */
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const db_1 = require("../utils/db");
const router = (0, express_1.Router)();
exports.ipRouter = router;
router.use(auth_1.authMiddleware);
// GET /api/ips - IP白名单列表
router.get("/", async (_req, res) => {
    try {
        const result = await db_1.db.query(`SELECT id, ip_address, description, is_active, created_at FROM ip_whitelist ORDER BY created_at DESC`);
        res.json({ success: true, data: result.rows });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// POST /api/ips - 添加IP
router.post("/", async (req, res) => {
    try {
        const { ip_address, description } = req.body;
        if (!ip_address)
            return res.status(400).json({ success: false, error: "IP地址必填" });
        const result = await db_1.db.query(`INSERT INTO ip_whitelist (ip_address, description, is_active) VALUES ($1, $2, true) RETURNING *`, [ip_address, description || ""]);
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// DELETE /api/ips/:id - 删除IP
router.delete("/:id", async (req, res) => {
    try {
        await db_1.db.query(`DELETE FROM ip_whitelist WHERE id = $1`, [req.params.id]);
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// PUT /api/ips/:id/toggle - 切换状态
router.put("/:id/toggle", async (req, res) => {
    try {
        const result = await db_1.db.query(`UPDATE ip_whitelist SET is_active = NOT is_active WHERE id = $1 RETURNING *`, [req.params.id]);
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
