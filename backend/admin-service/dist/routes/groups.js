"use strict";
/**
 * 群组管理路由 - 中亿智能体集群群配置、成员管理
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.groupRouter = void 0;
const express_1 = require("express");
const db_1 = require("../utils/db");
const router = (0, express_1.Router)();
exports.groupRouter = router;
// GET /api/groups - 列表
// GET /api/groups - 中亿智能体集群群列表
router.get("/", async (_req, res) => {
    try {
        const result = await db_1.db.query("SELECT * FROM groups_table ORDER BY created_at DESC");
        res.json({ success: true, data: result.rows });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// POST /api/groups - 创建
// POST /api/groups - 创建群
router.post("/", async (req, res) => {
    try {
        const { name, description, member_soul_ids } = req.body;
        const result = await db_1.db.query(`INSERT INTO groups_table (name, description, member_soul_ids, status, created_at, updated_at)
       VALUES (\$1,\$2,\$3,active,NOW(),NOW()) RETURNING *`, [name, description || "", JSON.stringify(member_soul_ids || [])]);
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// PUT /api/groups/:id - 更新
// PUT /api/groups/:id - 更新群
router.put("/:id", async (req, res) => {
    try {
        const { name, description, member_soul_ids, status } = req.body;
        const result = await db_1.db.query(`UPDATE groups_table SET name=\$1, description=\$2, member_soul_ids=\$3, status=\$4, updated_at=NOW() WHERE id=\$5 RETURNING *`, [name, description, JSON.stringify(member_soul_ids || []), status, req.params.id]);
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// DELETE /api/groups/:id - 删除
// DELETE /api/groups/:id - 删除群
router.delete("/:id", async (req, res) => {
    try {
        await db_1.db.query("DELETE FROM groups_table WHERE id = \$1", [req.params.id]);
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
