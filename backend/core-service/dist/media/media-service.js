"use strict";
/**
 * =============================================================================
 * 模块名称：多媒体与文件处理服务
 * 功能描述：AES-128解密、ASR语音转文字、文件过期自动清理、分层存储
 * =============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MediaService = void 0;
const crypto_1 = require("crypto");
const axios_1 = require("axios");
const fs = require("fs");
const path = require("path");
const db_1 = require("../utils/db");
const logger_1 = require("../utils/logger");
const event_bus_1 = require("../events/event-bus");
const FILE_EXPIRY_DAYS = 7;
const LOCAL_STORAGE_MAX_BYTES = 1024 * 1024;
const OSS_BUCKET_URL = process.env.OSS_BUCKET_URL || '';

class MediaService {
    static instance;
    db;
    logger;
    eventBus;
    constructor() {
        this.db = db_1.Database.getInstance();
        this.logger = logger_1.Logger.getInstance();
        this.eventBus = event_bus_1.EventBus.getInstance();
    }
    static getInstance() {
        if (!MediaService.instance) MediaService.instance = new MediaService();
        return MediaService.instance;
    }
    initialize() {
        setInterval(() => this.cleanupExpiredFiles(), 86400000);
        this.logger.info('[Media] Service initialized');
    }
    decryptWeChatFile(encryptedData, aesKey) {
        try {
            const key = Buffer.from(aesKey, 'base64');
            const iv = key.slice(0, 16);
            const decipher = (0, crypto_1.createDecipheriv)('aes-128-cbc', key, iv);
            let decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
            return decrypted;
        } catch (err) {
            this.logger.error('[Media] Decrypt failed:', err.message);
            throw new Error(`File decryption failed: ${err.message}`);
        }
    }
    async speechToText(audioBuffer, source = 'wechat') {
        this.logger.info(`[Media] ASR request: ${audioBuffer.length} bytes from ${source}`);
        try {
            const { AIGateway } = require('../gateway/ai-gateway');
            const gateway = AIGateway.getInstance();
            const { primary } = await gateway.loadProviders();
            if (!primary) throw new Error('No AI provider for ASR');
            const FormData = require('form-data');
            const formData = new FormData();
            formData.append('file', audioBuffer, { filename: 'audio.mp3', contentType: 'audio/mp3' });
            formData.append('model', 'whisper-1');
            formData.append('language', 'zh');
            const resp = await axios_1.default.post(`${primary.baseUrl}/audio/transcriptions`, formData, {
                headers: { ...formData.getHeaders(), Authorization: `Bearer ${primary.apiKey}` },
                timeout: 30000,
            });
            return resp.data?.text || '';
        } catch (err) {
            this.logger.error('[Media] ASR failed:', err.message);
            throw err;
        }
    }
    async storeFile(fileBuffer, originalName, mimeType, soulId, userId) {
        const fileSize = fileBuffer.length;
        const fileId = `file_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        let storageType, storagePath, url;
        if (fileSize <= LOCAL_STORAGE_MAX_BYTES) {
            storageType = 'local';
            const uploadDir = process.env.UPLOAD_DIR || './uploads';
            storagePath = path.join(uploadDir, `${fileId}_${originalName}`);
            if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
            fs.writeFileSync(storagePath, fileBuffer);
            url = `/uploads/${fileId}_${originalName}`;
        } else if (OSS_BUCKET_URL) {
            storageType = 'oss';
            const ossKey = `uploads/${soulId}/${fileId}_${originalName}`;
            storagePath = ossKey;
            url = `${OSS_BUCKET_URL}/${ossKey}`;
        } else {
            storageType = 'local';
            const uploadDir = process.env.UPLOAD_DIR || './uploads';
            storagePath = path.join(uploadDir, `${fileId}_${originalName}`);
            if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
            fs.writeFileSync(storagePath, fileBuffer);
            url = `/uploads/${fileId}_${originalName}`;
            this.logger.warn(`[Media] Large file stored locally (OSS not configured)`);
        }
        await this.db.query(
            `INSERT INTO uploaded_files (id, soul_id, user_id, original_name, mime_type, file_size,
                storage_type, storage_path, url, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
            [fileId, soulId, userId, originalName, mimeType, fileSize, storageType, storagePath, url]
        );
        return { fileId, url, storageType, size: fileSize };
    }
    async cleanupExpiredFiles() {
        this.logger.info('[Media] Running expired file cleanup...');
        try {
            const result = await this.db.query(
                `SELECT id, storage_type, storage_path FROM uploaded_files
                 WHERE created_at < NOW() - INTERVAL '7 days'`
            );
            let deleted = 0;
            for (const row of result.rows) {
                try {
                    if (row.storage_type === 'local') {
                        const fp = path.resolve(row.storage_path);
                        if (fs.existsSync(fp)) fs.unlinkSync(fp);
                    }
                    await this.db.query(`DELETE FROM uploaded_files WHERE id = $1`, [row.id]);
                    deleted++;
                } catch (err) {
                    this.logger.error(`[Media] Cleanup file ${row.id} failed:`, err.message);
                }
            }
            this.logger.info(`[Media] Cleaned ${deleted} expired files`);
        } catch (err) {
            this.logger.error('[Media] Cleanup failed:', err.message);
        }
    }
}
exports.MediaService = MediaService;
