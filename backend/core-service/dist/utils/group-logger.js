"use strict";
/**
 * =============================================================================
 * 模块名称：群日志 JSON Lines 写入器
 * 功能描述：按群按天写入日志文件，90天自动清理
 * =============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroupLogger = void 0;
const fs = require("fs");
const path = require("path");
const logger_1 = require("./logger");
const LOG_RETENTION_DAYS = 90;
const LOG_DIR = process.env.GROUP_LOG_DIR || './logs/groups';
class GroupLogger {
    static instance;
    logger;
    constructor() {
        this.logger = logger_1.Logger.getInstance();
        if (!fs.existsSync(LOG_DIR))
            fs.mkdirSync(LOG_DIR, { recursive: true });
        // 每天清理过期日志
        setInterval(() => this.cleanupOldLogs(), 86400000);
    }
    static getInstance() {
        if (!GroupLogger.instance)
            GroupLogger.instance = new GroupLogger();
        return GroupLogger.instance;
    }
    /**
     * 写入群消息日志
     */
    logMessage(groupId, event) {
        try {
            const dateStr = new Date().toISOString().slice(0, 10);
            const fileName = `group_${groupId}_${dateStr}.log`;
            const filePath = path.join(LOG_DIR, fileName);
            const line = JSON.stringify({
                ts: new Date().toISOString(),
                msg_id: event.msg_id,
                from_soul: event.from_soul,
                to_soul: event.to_soul,
                message: event.message?.substring(0, 2000),
                session_id: event.session_id,
            }) + '\n';
            fs.appendFileSync(filePath, line);
        }
        catch (err) {
            this.logger.error('[GroupLogger] Write failed:', err.message);
        }
    }
    /**
     * 读取群日志
     */
    readLogs(groupId, date) {
        const filePath = path.join(LOG_DIR, `group_${groupId}_${date}.log`);
        if (!fs.existsSync(filePath))
            return [];
        return fs.readFileSync(filePath, 'utf8')
            .split('\n')
            .filter(Boolean)
            .map(line => {
                try { return JSON.parse(line); }
                catch { return { _corrupted: true, raw: line.substring(0, 200) }; }
            });
    }
    /**
     * 清理90天前的日志
     */
    cleanupOldLogs() {
        try {
            const now = Date.now();
            let deleted = 0;
            for (const file of fs.readdirSync(LOG_DIR)) {
                const filePath = path.join(LOG_DIR, file);
                const stats = fs.statSync(filePath);
                const ageDays = (now - stats.mtime.getTime()) / 86400000;
                if (ageDays > LOG_RETENTION_DAYS) {
                    fs.unlinkSync(filePath);
                    deleted++;
                }
            }
            if (deleted > 0)
                this.logger.info(`[GroupLogger] Cleaned ${deleted} old log files`);
        }
        catch (err) {
            this.logger.error('[GroupLogger] Cleanup failed:', err.message);
        }
    }
}
exports.GroupLogger = GroupLogger;
