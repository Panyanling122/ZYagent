"use strict";
/**
 * =============================================================================
 * 模块名称：文件上传与处理 API
 * 功能描述：
 *   - POST /upload：文件上传（multer，100MB 上限）
 *   - POST /asr：语音转文字（Whisper API）
 *   - 分层存储：<1MB 本地，>1MB OSS
 * 技术决策：#28 文件处理
 * =============================================================================
 */

const express = require("express");
const multer = require("multer");
const media_service_1 = require("../media/media-service");
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const { soulId, userId } = req.body;
        if (!soulId) return res.status(400).json({ error: 'soulId required' });
        const mediaService = media_service_1.MediaService.getInstance();
        const result = await mediaService.storeFile(req.file.buffer, req.file.originalname, req.file.mimetype, soulId, userId);
        res.json({ success: true, fileId: result.fileId, url: result.url, size: result.size, storageType: result.storageType });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/asr', upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No audio file' });
        const { source = 'wechat' } = req.body;
        const mediaService = media_service_1.MediaService.getInstance();
        const text = await mediaService.speechToText(req.file.buffer, source);
        res.json({ success: true, text });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

exports.default = router;
