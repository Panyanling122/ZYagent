"use strict";
/**
 * 技能库路由 - Skill注册、启用、禁用
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.skillRouter = void 0;
const express_1 = require("express");
const db_1 = require("../utils/db");
const router = (0, express_1.Router)();
exports.skillRouter = router;
// GET /api/skills - Skill列表
router.get("/", async (_req, res) => {
    try {
        const result = await db_1.db.query("SELECT * FROM skills ORDER BY created_at DESC");
        res.json({ success: true, data: result.rows });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// POST /api/skills - 注册Skill
router.post("/", async (req, res) => {
    try {
        const { name, version, description, code, skill_md, depends_on, bound_souls } = req.body;
        const result = await db_1.db.query(`INSERT INTO skills (name, version, description, code, skill_md, depends_on, bound_souls, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW()) RETURNING *`, [name, version || "1.0.0", description || "", code || "", skill_md || "", JSON.stringify(depends_on || []), JSON.stringify(bound_souls || [])]);
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// PUT /api/skills/:id - 更新Skill
router.put("/:id", async (req, res) => {
    try {
        const { name, version, description, code, skill_md, is_active } = req.body;
        const result = await db_1.db.query(`UPDATE skills SET name=$1, version=$2, description=$3, code=$4, skill_md=$5, is_active=$6, updated_at=NOW() WHERE id=$7 RETURNING *`, [name, version, description, code, skill_md, is_active, req.params.id]);
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// DELETE /api/skills/:id - 删除Skill
router.delete("/:id", async (req, res) => {
    try {
        await db_1.db.query("DELETE FROM skills WHERE id = $1", [req.params.id]);
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
