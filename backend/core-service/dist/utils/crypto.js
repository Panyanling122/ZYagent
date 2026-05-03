"use strict";
/**
 * =============================================================================
 * 模块名称：加密工具
 * 功能描述：
 *   - API Key AES-256-GCM 加密存储
 *   - encryptApiKey：加密明文 API Key
 *   - decryptApiKey：解密为明文
 *   - 密钥派生：从 master key 生成加密密钥
 * 安全：MASTER_KEY 通过环境变量传入，不落盘
 * =============================================================================
 */

/**
 * AES-256-GCM 加密工具（core-service 版本）
 * 与 admin-service 共用相同密钥
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.decryptApiKey = decryptApiKey;
exports.isEncrypted = isEncrypted;
const crypto_1 = __importDefault(require("crypto"));
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
function getKey() {
    const envKey = process.env.API_KEY_ENCRYPTION_KEY;
    if (!envKey) {
        console.warn('[Crypto] API_KEY_ENCRYPTION_KEY not set, using derived key');
        return crypto_1.default.scryptSync('openclaw-default-key', 'salt', KEY_LENGTH);
    }
    if (envKey.length === 44 && Buffer.from(envKey, 'base64').length === KEY_LENGTH) {
        return Buffer.from(envKey, 'base64');
    }
    return crypto_1.default.scryptSync(envKey, 'salt', KEY_LENGTH);
}
function decryptApiKey(ciphertext) {
    try {
        const key = getKey();
        const data = Buffer.from(ciphertext, 'base64');
        const iv = data.subarray(0, IV_LENGTH);
        const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
        const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
        const decipher = crypto_1.default.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        return decrypted.toString('utf8');
    }
    catch (err) {
        console.error('[Crypto] Decrypt failed:', err);
        // 如果解密失败，可能已经是明文（迁移期兼容）
        return ciphertext;
    }
}
function isEncrypted(value) {
    if (!value || value.length < 50)
        return false;
    try {
        const buf = Buffer.from(value, 'base64');
        return buf.length >= IV_LENGTH + AUTH_TAG_LENGTH + 1;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=crypto.js.map