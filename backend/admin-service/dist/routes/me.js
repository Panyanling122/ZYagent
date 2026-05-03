"use strict";
/**
 * 获取当前登录用户信息
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.meRouter = void 0;
const express_1 = require("express");
const db_1 = require("../utils/db");
const router = (0, express_1.Router)();
exports.meRouter = router;
// GET /api/users/me - 获取当前用户信息（含绑定的Soul）
router.get("/me", async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ success: false, error: "未认证" });
            return;
        }
        const result = await db_1.db.query(`
      SELECT u.id, u.username, u.is_admin, u.is_active, u.permissions,
             u.bound_soul_id, s.name as bound_soul_name, s.status as soul_status, s.default_model
      FROM users u LEFT JOIN souls s ON u.bound_soul_id = s.id
      WHERE u.id = $1
    `, [userId]);
        if (result.rows.length === 0) {
            res.status(404).json({ success: false, error: "用户不存在" });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
