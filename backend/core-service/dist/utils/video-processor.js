"use strict";
/**
 * =============================================================================
 * 模块名称：视频帧提取
 * 功能描述：使用 ffmpeg 提取关键帧，用于AI分析
 * =============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VideoProcessor = void 0;
const child_process_1 = require("child_process");
const util_1 = require("util");
const fs = require("fs");
const fsp = require("fs").promises;
const path = require("path");
const os_1 = require("os");
const logger_1 = require("./logger");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
const MAX_FRAMES = 5;
const FRAME_WIDTH = 512;
class VideoProcessor {
    static instance;
    logger;
    tempDir;
    constructor() {
        this.logger = logger_1.Logger.getInstance();
        this.tempDir = path.join((0, os_1.tmpdir)(), 'openclaw-frames');
        if (!fs.existsSync(this.tempDir))
            fs.mkdirSync(this.tempDir, { recursive: true });
        this.ffmpegAvailable = null; // 懒加载检查
    }
    async checkFfmpeg() {
        if (this.ffmpegAvailable !== null) return this.ffmpegAvailable;
        try {
            await execAsync('ffmpeg -version', { timeout: 5000 });
            this.ffmpegAvailable = true;
        } catch {
            this.ffmpegAvailable = false;
            this.logger.warn('[Video] ffmpeg not installed, using fallback');
        }
        return this.ffmpegAvailable;
    }
    static getInstance() {
        if (!VideoProcessor.instance)
            VideoProcessor.instance = new VideoProcessor();
        return VideoProcessor.instance;
    }
    /**
     * 从视频Buffer提取关键帧
     */
    async extractFrames(videoBuffer, maxFrames = MAX_FRAMES) {
        const available = await this.checkFfmpeg();
        if (!available) {
            return this.fallbackExtract(videoBuffer, maxFrames);
        }
        const sessionId = `vid_${Date.now()}`;
        const inputPath = path.join(this.tempDir, `${sessionId}_input.mp4`);
        const outputPattern = path.join(this.tempDir, `${sessionId}_frame_%03d.jpg`);
        try {
            // 写入临时文件
            await fsp.writeFile(inputPath, videoBuffer);
            // 获取视频时长
            const { stdout: durationStr } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputPath}"`, { timeout: 10000 });
            const duration = parseFloat(durationStr);
            // 均匀采样时间点
            const timestamps = [];
            for (let i = 1; i <= maxFrames; i++) {
                timestamps.push((duration * i) / (maxFrames + 1));
            }
            // 提取帧
            const frames = [];
            for (let i = 0; i < timestamps.length; i++) {
                const ts = timestamps[i];
                const framePath = path.join(this.tempDir, `${sessionId}_frame_${String(i + 1).padStart(3, '0')}.jpg`);
                await execAsync(`ffmpeg -ss ${ts} -i "${inputPath}" -vframes 1 -s ${FRAME_WIDTH}x${FRAME_WIDTH} -y "${framePath}"`, { timeout: 15000 });
                if (fs.existsSync(framePath)) {
                    frames.push({
                        timestamp: ts,
                        index: i + 1,
                        buffer: fs.readFileSync(framePath),
                    });
                    fs.unlinkSync(framePath);
                }
            }
            this.logger.info(`[Video] Extracted ${frames.length} frames from ${(videoBuffer.length / 1024 / 1024).toFixed(2)}MB video`);
            return frames;
        }
        catch (err) {
            this.logger.error('[Video] Frame extraction failed:', err.message);
            // ffmpeg 不可用时降级
            return this.fallbackExtract(videoBuffer, maxFrames);
        }
        finally {
            if (fs.existsSync(inputPath))
                fs.unlinkSync(inputPath);
        }
    }
    /**
     * 降级方案：简单分块
     */
    fallbackExtract(videoBuffer, maxFrames) {
        const chunkSize = Math.floor(videoBuffer.length / maxFrames);
        return Array.from({ length: maxFrames }, (_, i) => ({
            timestamp: i,
            index: i + 1,
            buffer: videoBuffer.subarray(i * chunkSize, (i + 1) * chunkSize),
        }));
    }
}
exports.VideoProcessor = VideoProcessor;
