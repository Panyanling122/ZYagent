"use strict";
/**
 * =============================================================================
 * 模块名称：后台管理 Dashboard API
 * 功能描述：
 *   - GET /dashboard：系统概览数据（用户/Soul/消息/Token/延迟）
 *   - GET /token-stats：Token 用量统计（按天/按 Soul）
 *   - GET /memories/:soulId：记忆管理（L1/L2/L3 查询编辑）
 *   - GET/POST/PUT /groups：群管理 CRUD
 * 技术决策：#43 后台管理
 * =============================================================================
 */

const express = require("express");
const db_1 = require("../utils/db");
const logger_1 = require("../utils/logger");
const router = express.Router();

/**
 * Dashboard 概览数据
 * GET /api/admin/dashboard
 */
router.get('/dashboard', async (req, res) => {
    try {
        const db = db_1.Database.getInstance();
        const today = new Date().toISOString().slice(0, 10);
        const [
            totalUsers, totalSouls, totalMessages, todayMessages,
            totalTokens, avgLatency, activeGroups, systemHealth
        ] = await Promise.all([
            db.query(`SELECT COUNT(*) as count FROM users`),
            db.query(`SELECT COUNT(*) as count FROM souls WHERE deleted_at IS NULL`),
            db.query(`SELECT COUNT(*) as count FROM messages`),
            db.query(`SELECT COUNT(*) as count FROM messages WHERE created_at >= $1::date`, [today]),
            db.query(`SELECT COALESCE(SUM(tokens_total), 0) as total FROM message_tokens`),
            /* request_logs 表不存在，暂时返回0 */
            db.query(`SELECT 0 as avg`),
            db.query(`SELECT COUNT(*) as count FROM soul_groups WHERE status = 'active'`),
            db.query(`SELECT table_name, pg_size_pretty(pg_total_relation_size(table_name::regclass)) as size
                      FROM information_schema.tables WHERE table_schema = 'public' LIMIT 10`),
        ]);
        res.json({
            overview: {
                totalUsers: parseInt(totalUsers.rows[0].count),
                totalSouls: parseInt(totalSouls.rows[0].count),
                totalMessages: parseInt(totalMessages.rows[0].count),
                todayMessages: parseInt(todayMessages.rows[0].count),
                totalTokens: parseInt(totalTokens.rows[0].total),
                avgLatencyMs: Math.round(parseFloat(avgLatency.rows[0].avg)),
                activeGroups: parseInt(activeGroups.rows[0].count),
            },
            systemHealth: systemHealth.rows,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * Token 用量统计（按天/按Soul）
 * GET /api/admin/token-stats
 */
router.get('/token-stats', async (req, res) => {
    try {
        const { soulId, groupBy = 'day', days = 30 } = req.query;
        const db = db_1.Database.getInstance();
        let sql;
        if (groupBy === 'soul') {
            sql = `SELECT s.name, mt.soul_id,
                          SUM(mt.tokens_prompt) as prompt_tokens,
                          SUM(mt.tokens_completion) as completion_tokens,
                          SUM(mt.tokens_total) as total_tokens,
                          COUNT(*) as request_count
                   FROM message_tokens mt
                   JOIN souls s ON mt.soul_id = s.id
                   WHERE mt.created_at >= NOW() - INTERVAL '${days} days'
                   ${soulId ? `AND mt.soul_id = '${soulId}'` : ''}
                   GROUP BY mt.soul_id, s.name
                   ORDER BY total_tokens DESC LIMIT 100`;
        } else {
            sql = `SELECT DATE(created_at) as date,
                          SUM(tokens_prompt) as prompt_tokens,
                          SUM(tokens_completion) as completion_tokens,
                          SUM(tokens_total) as total_tokens,
                          COUNT(*) as request_count
                   FROM message_tokens
                   WHERE created_at >= NOW() - INTERVAL '${days} days'
                   ${soulId ? `AND soul_id = '${soulId}'` : ''}
                   GROUP BY DATE(created_at)
                   ORDER BY date DESC`;
        }
        const result = await db.query(sql);
        res.json({ stats: result.rows, groupBy, days: parseInt(days) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * 记忆管理 - 查询和编辑
 * GET/PUT /api/admin/memories/:soulId
 */
router.get('/memories/:soulId', async (req, res) => {
    try {
        const { soulId } = req.params;
        const { type = 'all' } = req.query;
        const db = db_1.Database.getInstance();
        const memories = { l1: [], l2: [], l3: [] };
        if (type === 'all' || type === 'l1') {
            const r = await db.query(
                `SELECT id, topic, content, created_at FROM messages WHERE soul_id = $1 ORDER BY created_at DESC LIMIT 50`, [soulId]);
            memories.l1 = r.rows;
        }
        if (type === 'all' || type === 'l2') {
            const r = await db.query(
                `SELECT id, topic, topic_name, summary_text, summary_date FROM daily_summaries WHERE soul_id = $1 ORDER BY summary_date DESC`, [soulId]);
            memories.l2 = r.rows;
        }
        if (type === 'all' || type === 'l3') {
            const r = await db.query(
                `SELECT id, topic, topic_name, content_md, version, updated_at FROM topic_knowledge WHERE soul_id = $1`, [soulId]);
            memories.l3 = r.rows;
        }
        res.json(memories);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/memories/:soulId/:memoryId', async (req, res) => {
    try {
        const { soulId, memoryId } = req.params;
        const { type, content, summary } = req.body;
        const db = db_1.Database.getInstance();
        if (type === 'l2') {
            await db.query(`UPDATE daily_summaries SET summary_text = $1 WHERE id = $2 AND soul_id = $3`, [summary, memoryId, soulId]);
        } else if (type === 'l3') {
            await db.query(`UPDATE topic_knowledge SET content_md = $1 WHERE id = $2 AND soul_id = $3`, [content, memoryId, soulId]);
        } else {
            return res.status(400).json({ error: 'Invalid memory type' });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * 群管理 CRUD
 * GET/POST/PUT /api/admin/groups
 */
router.get('/groups', async (req, res) => {
    try {
        const db = db_1.Database.getInstance();
        const result = await db.query(`SELECT * FROM soul_groups ORDER BY updated_at DESC`);
        res.json({ groups: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/groups', async (req, res) => {
    try {
        const { name, description, mode = 'collaborative' } = req.body;
        const db = db_1.Database.getInstance();
        const result = await db.query(
            `INSERT INTO soul_groups (name, description, mode, status, created_at, updated_at)
             VALUES ($1, $2, $3, 'active', NOW(), NOW()) RETURNING id`,
            [name, description, mode]
        );
        res.json({ success: true, groupId: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/groups/:groupId', async (req, res) => {
    try {
        const { groupId } = req.params;
        const { name, description, mode, status } = req.body;
        const db = db_1.Database.getInstance();
        await db.query(
            `UPDATE soul_groups SET name = COALESCE($1, name), description = COALESCE($2, description),
                mode = COALESCE($3, mode), status = COALESCE($4, status), updated_at = NOW() WHERE id = $5`,
            [name, description, mode, status, groupId]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

exports.default = router;
