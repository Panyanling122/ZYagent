"use strict";
/**
 * =============================================================================
 * 模块名称：iLink 微信绑定路由
 * 功能描述：二维码生成 + 绑定状态轮询 + 绑定消息处理
 * =============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const crypto = require("crypto");
const db_1 = require("../utils/db");
const logger_1 = require("../utils/logger");
const router = express.Router();
const logger = logger_1.Logger.getInstance();

// 生成绑定二维码
router.post("/bind/wechat", async (req, res) => {
    try {
        const userId = req.user?.id || req.headers["x-user-id"];
        if (!userId) return res.status(401).json({ error: "Unauthorized" });
        const token = crypto.randomBytes(16).toString("hex");
        await db_1.Database.getInstance().query(
            `INSERT INTO ilink_bind_tokens (token, user_id, status, expires_at) VALUES ($1, $2, 'pending', NOW() + INTERVAL '10 minutes')`,
            [token, userId]
        );
        const qrContent = `绑定OpenClaw:${token}`;
        res.json({
            token,
            qrContent,
            expiresIn: 600,
        });
    } catch (err) {
        logger.error("[Bind] create token failed:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// 查询绑定状态
router.get("/bind/status", async (req, res) => {
    try {
        const { token } = req.query;
        if (!token) return res.status(400).json({ error: "token required" });
        const result = await db_1.Database.getInstance().query(
            `SELECT status, expires_at FROM ilink_bind_tokens WHERE token = $1`,
            [token]
        );
        if (!result.rows[0]) return res.json({ status: "not_found" });
        const row = result.rows[0];
        if (row.status === "pending" && new Date(row.expires_at) < new Date()) {
            await db_1.Database.getInstance().query(
                `UPDATE ilink_bind_tokens SET status = 'expired' WHERE token = $1`,
                [token]
            );
            return res.json({ status: "expired" });
        }
        res.json({ status: row.status });
    } catch (err) {
        logger.error("[Bind] check status failed:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// 手动确认绑定（桌面端调用）
router.post("/bind/confirm", async (req, res) => {
    try {
        const { token, wxUserId, soulId } = req.body;
        const userId = req.user?.id || req.headers["x-user-id"];
        if (!token || !wxUserId) return res.status(400).json({ error: "token and wxUserId required" });
        const result = await db_1.Database.getInstance().query(
            `UPDATE ilink_bind_tokens SET status = 'bound' WHERE token = $1 AND status = 'pending' AND expires_at > NOW() RETURNING user_id`,
            [token]
        );
        if (!result.rows[0]) return res.status(400).json({ error: "Token invalid or expired" });
        await db_1.Database.getInstance().query(
            `INSERT INTO ilink_user_mappings (wx_user_id, user_id, soul_id, created_at) VALUES ($1, $2, $3, NOW())
             ON CONFLICT (wx_user_id, soul_id) DO UPDATE SET user_id = $2`,
            [String(wxUserId), result.rows[0].user_id, soulId || null]
        );
        res.json({ success: true, status: "bound" });
    } catch (err) {
        logger.error("[Bind] confirm failed:", err.message);
        res.status(500).json({ error: err.message });
    }
});

exports.default = router;
