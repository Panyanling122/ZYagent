"use strict";
/**
 * =============================================================================
 * 模块名称：Provider管理路由
 * 功能描述：AI Provider配置（OpenAI/Claude/Kimi）
 * 创建日期：2026-04-30
 * =============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.providerRouter = void 0;
const express_1 = require("express");
const db_1 = require("../utils/db");
const crypto_1 = require("../utils/crypto");
const router = (0, express_1.Router)();
exports.providerRouter = router;
/**
 * GET /api/providers
 * 查询所有AI Provider配置列表
 */
router.get('/', async (_req, res) => {
    try {
        const result = await db_1.db.query('SELECT id, name, base_url, model_map, is_active, created_at, updated_at FROM providers ORDER BY name');
        // 对API密钥进行脱敏处理
        const providers = result.rows.map((row) => ({
            ...row,
            api_key: undefined,
        }));
        res.json({ success: true, data: providers });
    }
    catch (err) {
        console.error('List providers error:', err);
        res.status(500).json({ success: false, error: 'Failed to list providers' });
    }
});
/**
 * GET /api/providers/:id
 * 获取单个Provider详情（含脱敏后的API密钥）
 * @param req.params.id - Provider唯一标识
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db_1.db.query('SELECT id, name, base_url, model_map, is_active, created_at, updated_at FROM providers WHERE id = $1 LIMIT 1', [id]);
        if (result.rowCount === 0) {
            res.status(404).json({ success: false, error: 'Provider not found' });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        console.error('Get provider error:', err);
        res.status(500).json({ success: false, error: 'Failed to get provider' });
    }
});
/**
 * POST /api/providers
 * 创建新Provider配置
 * @param req.body.name - Provider名称（唯一，如openai/claude/kimi）
 * @param req.body.base_url - API基础URL
 * @param req.body.api_key - API密钥
 * @param req.body.model_map - 模型映射（JSON，如{"gpt-4o": "gpt-4o"}）
 */
router.post('/', async (req, res) => {
    try {
        const { name, base_url, api_key, model_map } = req.body;
        if (!name || !base_url || !api_key) {
            res.status(400).json({ success: false, error: 'name, base_url, and api_key are required' });
            return;
        }
        // 加密 API Key
        const encryptedKey = (0, crypto_1.isEncrypted)(api_key) ? api_key : (0, crypto_1.encryptApiKey)(api_key);
        const result = await db_1.db.query(`INSERT INTO providers (name, base_url, api_key, model_map, is_active)
       VALUES ($1, $2, $3, $4, false)
       RETURNING id, name, base_url, model_map, is_active, created_at`, [name, base_url, encryptedKey, JSON.stringify(model_map || {})]);
        res.status(201).json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        if (err.code === '23505') {
            res.status(409).json({ success: false, error: 'Provider name already exists' });
            return;
        }
        console.error('Create provider error:', err);
        res.status(500).json({ success: false, error: 'Failed to create provider' });
    }
});
/**
 * PUT /api/providers/:id
 * 更新Provider配置
 * @param req.params.id - Provider唯一标识
 */
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, base_url, api_key, model_map } = req.body;
        let sql = `UPDATE providers SET updated_at = NOW()`;
        const params = [];
        let paramIdx = 1;
        if (name !== undefined) {
            sql += `, name = $${paramIdx++}`;
            params.push(name);
        }
        if (base_url !== undefined) {
            sql += `, base_url = $${paramIdx++}`;
            params.push(base_url);
        }
        if (api_key !== undefined) {
            const encryptedKey = (0, crypto_1.isEncrypted)(api_key) ? api_key : (0, crypto_1.encryptApiKey)(api_key);
            sql += `, api_key = $${paramIdx++}`;
            params.push(encryptedKey);
        }
        if (model_map !== undefined) {
            sql += `, model_map = $${paramIdx++}`;
            params.push(JSON.stringify(model_map));
        }
        sql += ` WHERE id = $${paramIdx++} RETURNING id, name, base_url, model_map, is_active, updated_at`;
        params.push(id);
        const result = await db_1.db.query(sql, params);
        if (result.rowCount === 0) {
            res.status(404).json({ success: false, error: 'Provider not found' });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        if (err.code === '23505') {
            res.status(409).json({ success: false, error: 'Provider name already exists' });
            return;
        }
        console.error('Update provider error:', err);
        res.status(500).json({ success: false, error: 'Failed to update provider' });
    }
});
/**
 * POST /api/providers/:id/activate
 * 激活Provider
 * @param req.params.id - Provider唯一标识
 */
router.post('/:id/activate', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db_1.db.query('UPDATE providers SET is_active = true, updated_at = NOW() WHERE id = $1 RETURNING id, name, is_active', [id]);
        if (result.rowCount === 0) {
            res.status(404).json({ success: false, error: 'Provider not found' });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        console.error('Activate provider error:', err);
        res.status(500).json({ success: false, error: 'Failed to activate provider' });
    }
});
/**
 * POST /api/providers/:id/deactivate
 * 停用Provider
 * @param req.params.id - Provider唯一标识
 */
router.post('/:id/deactivate', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db_1.db.query('UPDATE providers SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id, name, is_active', [id]);
        if (result.rowCount === 0) {
            res.status(404).json({ success: false, error: 'Provider not found' });
            return;
        }
        res.json({ success: true, data: result.rows[0] });
    }
    catch (err) {
        console.error('Deactivate provider error:', err);
        res.status(500).json({ success: false, error: 'Failed to deactivate provider' });
    }
});
/**
 * DELETE /api/providers/:id
 * 删除Provider配置
 * @param req.params.id - Provider唯一标识
 */
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db_1.db.query('DELETE FROM providers WHERE id = $1 RETURNING id', [id]);
        if (result.rowCount === 0) {
            res.status(404).json({ success: false, error: 'Provider not found' });
            return;
        }
        res.json({ success: true });
    }
    catch (err) {
        console.error('Delete provider error:', err);
        res.status(500).json({ success: false, error: 'Failed to delete provider' });
    }
});
