"use strict";
/**
 * AES-256-GCM 加密工具
 * API Key 在落盘前加密，读取时解密
 * 密钥来源：环境变量 API_KEY_ENCRYPTION_KEY（32字节 base64）
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptApiKey = encryptApiKey;
exports.encrypt = encryptApiKey;
exports.decryptApiKey = decryptApiKey;
exports.decrypt = decryptApiKey;
exports.isEncrypted = isEncrypted;
const crypto_1 = __importDefault(require("crypto"));
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
function getKey() {
    const envKey = process.env.API_KEY_ENCRYPTION_KEY;
    if (!envKey) {
        // 无环境变量时使用派生密钥（仅用于开发，生产必须设置）
        console.warn('[Crypto] API_KEY_ENCRYPTION_KEY not set, using derived key');
        return crypto_1.default.scryptSync('openclaw-default-key', 'salt', KEY_LENGTH);
    }
    // 支持 base64 或纯文本
    if (envKey.length === 44 && Buffer.from(envKey, 'base64').length === KEY_LENGTH) {
        return Buffer.from(envKey, 'base64');
    }
    return crypto_1.default.scryptSync(envKey, 'salt', KEY_LENGTH);
}
/**
 * 加密明文
 * @param plaintext 明文 API Key
 * @returns base64(IV + authTag + ciphertext)
 */
function encryptApiKey(plaintext) {
    const key = getKey();
    const iv = crypto_1.default.randomBytes(IV_LENGTH);
    const cipher = crypto_1.default.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // 格式: IV(16) + authTag(16) + ciphertext
    const result = Buffer.concat([iv, authTag, encrypted]);
    return result.toString('base64');
}
/**
 * 解密密文
 * @param ciphertext base64(IV + authTag + ciphertext)
 * @returns 明文 API Key
 */
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
        throw new Error('Failed to decrypt API key');
    }
}
/**
 * 判断字符串是否已经是加密格式（简单启发式）
 */
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
