"use strict";
/**
 * =============================================================================
 * 模块名称：日志脱敏器
 * 功能描述：API Key / 手机号 / 身份证号 自动脱敏
 *   - 32-128位十六进制字符串 → API Key 格式
 *   - 11位1开头 → 手机号
 *   - 18位(末位可为X) → 身份证号
 *   - 保留前3后3，中间替换为 ***
 * =============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogSanitizer = void 0;
// 脱敏规则
const SENSITIVE_PATTERNS = [
    { name: 'api_key',    regex: /\b[0-9a-fA-F]{32,128}\b/g },
    { name: 'phone',      regex: /\b1[3-9]\d{9}\b/g },
    { name: 'id_card',    regex: /\b\d{17}[\dXx]|\d{15}\b/g },
    { name: 'password',   regex: /"password"\s*[:=]\s*"([^"]{4,})"/gi },
];
const MASK = '***';
const KEEP_PREFIX = 3;
const KEEP_SUFFIX = 3;

class LogSanitizer {
    /**
     * 对单个字符串进行脱敏
     */
    static sanitize(text) {
        if (!text || typeof text !== 'string') return text;
        let result = text;
        for (const rule of SENSITIVE_PATTERNS) {
            result = result.replace(rule.regex, (match) => {
                if (match.length <= KEEP_PREFIX + KEEP_SUFFIX) return match;
                return match.substring(0, KEEP_PREFIX) + MASK + match.substring(match.length - KEEP_SUFFIX);
            });
        }
        return result;
    }
    /**
     * 对日志对象的所有字符串字段递归脱敏
     */
    static sanitizeObject(obj) {
        if (!obj || typeof obj !== 'object') return this.sanitize(String(obj));
        if (Array.isArray(obj)) return obj.map(item => this.sanitizeObject(item));
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string') {
                result[key] = this.sanitize(value);
            } else if (typeof value === 'object' && value !== null) {
                result[key] = this.sanitizeObject(value);
            } else {
                result[key] = value;
            }
        }
        return result;
    }
    /**
     * 序列化日志对象为JSON（自动脱敏）
     */
    static stringify(logObj) {
        const sanitized = this.sanitizeObject(logObj);
        return JSON.stringify(sanitized);
    }
}
exports.LogSanitizer = LogSanitizer;
