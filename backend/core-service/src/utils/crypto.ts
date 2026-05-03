/**
 * AES-256-GCM 加密工具（core-service 版本）
 * 与 admin-service 共用相同密钥
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const envKey = process.env.API_KEY_ENCRYPTION_KEY;
  if (!envKey) {
    console.warn('[Crypto] API_KEY_ENCRYPTION_KEY not set, using derived key');
    return crypto.scryptSync('openclaw-default-key', 'salt', KEY_LENGTH);
  }
  if (envKey.length === 44 && Buffer.from(envKey, 'base64').length === KEY_LENGTH) {
    return Buffer.from(envKey, 'base64');
  }
  return crypto.scryptSync(envKey, 'salt', KEY_LENGTH);
}

export function decryptApiKey(ciphertext: string): string {
  try {
    const key = getKey();
    const data = Buffer.from(ciphertext, 'base64');
    const iv = data.subarray(0, IV_LENGTH);
    const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    console.error('[Crypto] Decrypt failed:', err);
    // 如果解密失败，可能已经是明文（迁移期兼容）
    return ciphertext;
  }
}

export function isEncrypted(value: string): boolean {
  if (!value || value.length < 50) return false;
  try {
    const buf = Buffer.from(value, 'base64');
    return buf.length >= IV_LENGTH + AUTH_TAG_LENGTH + 1;
  } catch {
    return false;
  }
}
