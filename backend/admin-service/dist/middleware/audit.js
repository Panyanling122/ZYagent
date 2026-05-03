"use strict";
/**
 * =============================================================================
 * 模块名称：审计日志中间件
 * 功能描述：请求自动记录到audit_logs表，异步写入不影响响应
 * 技术决策引用：#66 #67
 * 创建日期：2026-04-30
 * 最后修改：2026-04-30
 * =============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditMiddleware = auditMiddleware;
const db_1 = require("../utils/db");
function auditMiddleware(req, res, next) {
    const start = Date.now();
    const originalSend = res.send.bind(res);
    res.send = function (body) {
        const duration = Date.now() - start;
        res.send = originalSend;
        // Skip static assets and health checks
        if (req.path.startsWith("/assets/") || req.path === "/health")
            return res.send(body);
        const userId = req.user?.userId || null;
        const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim()
            || req.socket.remoteAddress || "";
        try {
            db_1.db.query(`INSERT INTO audit_logs (user_id, action, resource, details, ip_address, status_code, duration_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
                userId, req.method, req.path,
                JSON.stringify({ query: req.query }),
                clientIp, res.statusCode, duration,
            ]).catch(() => { });
        }
        catch { /* silently fail audit */ }
        return res.send(body);
    };
    next();
}
