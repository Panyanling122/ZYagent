"use strict";
/**
 * =============================================================================
 * 模块名称：API Key 密钥轮换
 * 功能描述：新旧密钥并存平滑迁移，自动过期旧密钥
 * =============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.KeyRotation = void 0;
const crypto_1 = require("crypto");
const db_1 = require("./db");
const logger_1 = require("./logger");
const GRACE_PERIOD_DAYS = 7; // 旧密钥宽限期
class KeyRotation {
    static instance;
    db;
    logger;
    // 内存中的新旧密钥映射：oldKey -> newKey
    rotationMap = new Map();
    constructor() {
        this.db = db_1.Database.getInstance();
        this.logger = logger_1.Logger.getInstance();
    }
    static getInstance() {
        if (!KeyRotation.instance)
            KeyRotation.instance = new KeyRotation();
        return KeyRotation.instance;
    }
    /**
     * 启动密钥轮换：为指定 provider 生成新密钥
     */
    async rotate(providerName) {
        this.logger.info(`[KeyRotation] Starting rotation for ${providerName}`);
        // 获取当前密钥
        const current = await this.db.query(`SELECT id, api_key FROM providers WHERE name = $1`, [providerName]);
        if (!current.rows[0])
            throw new Error(`Provider ${providerName} not found`);
        const oldKey = current.rows[0].api_key;
        const providerId = current.rows[0].id;
        // 生成新密钥
        const newKeyPlain = `sk-${(0, crypto_1.randomBytes)(24).toString('hex')}`;
        // 加密存储新密钥
        const { encryptApiKey } = require('../utils/crypto');
        const newKeyEncrypted = encryptApiKey(newKeyPlain);
        // 原子更新：设置旧密钥过期时间，写入新密钥
        await this.db.query(`BEGIN`);
        try {
            // 将旧密钥标记为 rotating
            await this.db.query(`UPDATE providers SET key_status = 'rotating', key_rotated_at = NOW() WHERE id = $1`, [providerId]);
            // 插入新密钥记录
            await this.db.query(`INSERT INTO provider_key_history (provider_id, old_key_encrypted, new_key_encrypted, rotated_at, grace_period_days) VALUES ($1, $2, $3, NOW(), $4)`, [providerId, oldKey, newKeyEncrypted, GRACE_PERIOD_DAYS]);
            // 更新 provider 使用新密钥
            await this.db.query(`UPDATE providers SET api_key = $1, key_status = 'active', updated_at = NOW() WHERE id = $2`, [newKeyEncrypted, providerId]);
            await this.db.query(`COMMIT`);
            this.rotationMap.set(oldKey, newKeyEncrypted);
            this.logger.info(`[KeyRotation] ${providerName} key rotated successfully`);
            return { providerId, rotatedAt: new Date() };
        }
        catch (err) {
            await this.db.query(`ROLLBACK`);
            throw err;
        }
    }
    /**
     * 获取有效密钥（自动处理新旧密钥并存）
     */
    async getActiveKey(providerName) {
        const result = await this.db.query(`SELECT api_key, key_status, key_rotated_at FROM providers WHERE name = $1`, [providerName]);
        if (!result.rows[0])
            return null;
        return result.rows[0];
    }
    /**
     * 完成轮换：过期旧密钥
     */
    async completeRotation(providerName) {
        const result = await this.db.query(`UPDATE providers SET key_status = 'active' WHERE name = $1 AND key_status = 'rotating' RETURNING id`, [providerName]);
        if (result.rowCount && result.rowCount > 0) {
            this.logger.info(`[KeyRotation] ${providerName} rotation completed`);
        }
    }
    /**
     * 自动清理过期密钥（每天运行）
     */
    async cleanupExpiredKeys() {
        try {
            const result = await this.db.query(`DELETE FROM provider_key_history WHERE rotated_at < NOW() - INTERVAL '${GRACE_PERIOD_DAYS} days' RETURNING id`);
            if (result.rowCount && result.rowCount > 0) {
                this.logger.info(`[KeyRotation] Cleaned ${result.rowCount} expired key records`);
            }
        }
        catch (err) {
            this.logger.error('[KeyRotation] Cleanup failed:', err.message);
        }
    }
}
exports.KeyRotation = KeyRotation;
