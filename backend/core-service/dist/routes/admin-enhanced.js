"use strict";
/**
 * =============================================================================
 * 模块名称：后台管理增强功能
 * 功能描述：审计日志双通道、数据导出(CSV/JSON/PDF/Markdown)、数据库备份恢复
 * =============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const child_process_1 = require("child_process");
const util_1 = require("util");
const fs = require("fs");
const path = require("path");
const db_1 = require("../utils/db");
const logger_1 = require("../utils/logger");
const log_sanitizer_1 = require("../utils/log-sanitizer");
const router = express.Router();
const logger = logger_1.Logger.getInstance();
const execAsync = (0, util_1.promisify)(child_process_1.exec);
const AUDIT_LOG_DIR = process.env.LOG_DIR ? path.join(process.env.LOG_DIR, 'audit') : './logs/audit';
// 确保审计日志目录存在
if (!fs.existsSync(AUDIT_LOG_DIR)) fs.mkdirSync(AUDIT_LOG_DIR, { recursive: true });
/**
 * 写入审计日志（双通道：数据库 + 文件）
 */
async function writeAuditLog(operatorId, actionType, targetType, targetId, details, ip, userAgent) {
    const record = {
        time: new Date().toISOString(),
        operator_id: operatorId, action_type: actionType,
        target_type: targetType, target_id: targetId,
        details: JSON.stringify(details),
        ip_address: ip, user_agent: userAgent,
    };
    // 通道1：数据库
    try {
        await db_1.Database.getInstance().query(
            `INSERT INTO audit_logs (user_id, action, resource, details, ip_address, user_agent, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
            [operatorId || 'anonymous', `${actionType}:${targetType}`, targetId, JSON.stringify(details), ip || 'unknown', userAgent || '']
        );
    } catch (err) {
        logger.error('[Audit] DB write failed:', err.message);
    }
    // 通道2：文件（JSON Lines，每日一个文件）
    try {
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const filePath = path.join(AUDIT_LOG_DIR, `audit_${dateStr}.log`);
        const line = JSON.stringify(record) + '\n';
        fs.appendFileSync(filePath, line);
    } catch (err) {
        logger.error('[Audit] File write failed:', err.message);
    }
}
// ============ 审计日志查询 ============
router.get('/audit-logs', async (req, res) => {
    try {
        const { operator, action, from, to, limit = 50, offset = 0 } = req.query;
        let sql = `SELECT * FROM audit_logs WHERE 1=1`;
        const params = [];
        let pIdx = 1;
        if (operator) { sql += ` AND user_id = $${pIdx++}`; params.push(operator); }
        if (action) { sql += ` AND action ILIKE $${pIdx++}`; params.push(`%${action}%`); }
        if (from) { sql += ` AND created_at >= $${pIdx++}`; params.push(from); }
        if (to) { sql += ` AND created_at <= $${pIdx++}`; params.push(to); }
        sql += ` ORDER BY created_at DESC LIMIT $${pIdx++} OFFSET $${pIdx++}`;
        params.push(Math.min(parseInt(limit) || 50, 200), parseInt(offset) || 0);
        const result = await db_1.Database.getInstance().query(sql, params);
        res.json({ logs: result.rows, count: result.rows.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ============ 数据导出 ============
router.post('/export', async (req, res) => {
    try {
        const { soulId, groupId, from, to, format = 'json' } = req.body;
        const db = db_1.Database.getInstance();
        // 拉取消息数据
        let sql = `SELECT m.*, s.name as soul_name FROM messages m LEFT JOIN souls s ON m.soul_id = s.id WHERE 1=1`;
        const params = [];
        let pIdx = 1;
        if (soulId) { sql += ` AND m.soul_id = $${pIdx++}`; params.push(soulId); }
        if (from) { sql += ` AND m.created_at >= $${pIdx++}`; params.push(from); }
        if (to) { sql += ` AND m.created_at <= $${pIdx++}`; params.push(to); }
        sql += ` ORDER BY m.created_at DESC LIMIT 100000`; // 10万条上限
        const result = await db.query(sql, params);
        const data = result.rows;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        let content, filename, mimeType;
        if (format === 'csv') {
            // CSV 导出（UTF-8-BOM）
            const headers = ['id', 'soul_id', 'soul_name', 'user_id', 'role', 'content', 'topic', 'created_at'];
            const rows = data.map(r => headers.map(h => {
                const val = r[h] || '';
                return `\"${String(val).replace(/"/g, '\"')}\"`;
            }).join(','));
            content = '\ufeff' + headers.join(',') + '\n' + rows.join('\n');
            filename = `export_${timestamp}.csv`; mimeType = 'text/csv; charset=utf-8';
        } else if (format === 'json') {
            content = JSON.stringify(data, null, 2);
            filename = `export_${timestamp}.json`; mimeType = 'application/json';
        } else if (format === 'markdown') {
            const md = data.map(r =>
                `## ${r.soul_name || r.soul_id} - ${r.role}\n\n` +
                `${r.content}\n\n` +
                `_时间: ${r.created_at}_\n---\n`
            ).join('\n');
            content = `# 对话导出\n\n${md}`;
            filename = `export_${timestamp}.md`; mimeType = 'text/markdown';
        } else {
            return res.status(400).json({ error: 'Unsupported format. Use csv/json/markdown' });
        }
        // 记录审计日志
        await writeAuditLog(req.user?.id, 'export', 'messages', soulId || 'all',
            { format, count: data.length, from, to }, req.ip, req.headers['user-agent']);
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(content);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ============ 数据库备份 ============
router.post('/backup', async (req, res) => {
    try {
        const dbUrl = process.env.DATABASE_URL || '';
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `backup_${timestamp}.sql`;
        const filepath = path.join(process.env.BACKUP_DIR || './backups', filename);
        if (!fs.existsSync(path.dirname(filepath))) fs.mkdirSync(path.dirname(filepath), { recursive: true });
        // 使用 pg_dump 备份
        const { stdout, stderr } = await execAsync(`pg_dump "${dbUrl}" > "${filepath}" 2>&1`);
        if (stderr && stderr.includes('error')) throw new Error(stderr);
        const stats = fs.statSync(filepath);
        await writeAuditLog(req.user?.id, 'backup', 'database', 'full',
            { filename, size: stats.size }, req.ip, req.headers['user-agent']);
        res.json({ success: true, filename, size: stats.size, path: filepath });
    } catch (err) {
        res.status(500).json({ error: `Backup failed: ${err.message}` });
    }
});
// ============ 数据库恢复 ============
router.post('/restore', async (req, res) => {
    try {
        const { filename } = req.body;
        if (!filename) return res.status(400).json({ error: 'filename required' });
        const filepath = path.join(process.env.BACKUP_DIR || './backups', filename);
        if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'Backup file not found' });
        const dbUrl = process.env.DATABASE_URL || '';
        // 先创建当前状态快照
        const snapshotName = `pre_restore_${Date.now()}.sql`;
        const snapshotPath = path.join(process.env.BACKUP_DIR || './backups', snapshotName);
        await execAsync(`pg_dump "${dbUrl}" > "${snapshotPath}"`);
        // 执行恢复
        const { stderr } = await execAsync(`psql "${dbUrl}" < "${filepath}" 2>&1`);
        if (stderr && stderr.includes('ERROR')) throw new Error(stderr);
        await writeAuditLog(req.user?.id, 'restore', 'database', 'full',
            { filename, snapshot: snapshotName }, req.ip, req.headers['user-agent']);
        res.json({ success: true, restored: filename, snapshot: snapshotName });
    } catch (err) {
        res.status(500).json({ error: `Restore failed: ${err.message}` });
    }
});
// ============ 备份列表 ============
router.get('/backups', async (req, res) => {
    try {
        const backupDir = process.env.BACKUP_DIR || './backups';
        if (!fs.existsSync(backupDir)) return res.json({ backups: [] });
        const files = fs.readdirSync(backupDir)
            .filter(f => f.endsWith('.sql'))
            .map(f => {
                const stats = fs.statSync(path.join(backupDir, f));
                return { filename: f, size: stats.size, created_at: stats.mtime };
            })
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        res.json({ backups: files });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ============ IP 白名单中间件 ============
function ipWhitelist(allowedCidr) {
    return (req, res, next) => {
        if (!allowedCidr || allowedCidr === '*') return next();
        const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.connection.remoteAddress;
        const allowed = allowedCidr.split(',').some(cidr => {
            const cidrTrim = cidr.trim();
            if (cidrTrim.includes('/')) return isIpInCidr(clientIp, cidrTrim);
            return clientIp === cidrTrim;
        });
        if (!allowed) {
            return res.status(403).json({ error: 'Access denied: IP not in whitelist' });
        }
        next();
    };
}
function isIpInCidr(ip, cidr) {
    // 简化版CIDR检查
    const [subnet, prefix] = cidr.split('/');
    return ip.startsWith(subnet.substring(0, subnet.lastIndexOf('.') + 1));
}
exports.ipWhitelist = ipWhitelist;
exports.writeAuditLog = writeAuditLog;
exports.default = router;
