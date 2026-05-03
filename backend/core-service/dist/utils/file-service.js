"use strict";
/**
 * =============================================================================
 * 模块名称：文件服务
 * 功能描述：文件上传、存储、路径管理、过期清理。使用path.basename过滤防止目录遍历攻击。
 * 技术决策引用：#23 #88
 * 创建日期：2026-04-30
 * =============================================================================
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileService = void 0;
const config_1 = require("./config");
const logger_1 = require("./logger");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class FileService {
    static instance;
    config;
    logger;
    constructor() {
        this.config = config_1.Config.getInstance();
        this.logger = logger_1.Logger.getInstance();
        if (!fs_1.default.existsSync(this.config.uploadDir)) {
            fs_1.default.mkdirSync(this.config.uploadDir, { recursive: true });
        }
    }
    /** 获取单例实例 */
    static getInstance() {
        if (!FileService.instance)
            FileService.instance = new FileService();
        return FileService.instance;
    }
    /** 保存上传文件到磁盘，返回访问URL和文件大小 */
    async saveFile(fileName, data) {
        const safeName = path_1.default.basename(fileName).replace(/\.\./g, "");
        if (!safeName || safeName === "." || safeName === "..") {
            throw new Error("Invalid file name");
        }
        const filePath = path_1.default.join(this.config.uploadDir, safeName);
        await fs_1.default.promises.writeFile(filePath, data);
        const stats = await fs_1.default.promises.stat(filePath);
        return { url: `/uploads/${safeName}`, size: stats.size };
    }
    /** 获取文件绝对路径（过滤目录遍历字符） */
    getFilePath(fileName) {
        const safeName = path_1.default.basename(fileName).replace(/\.\./g, "");
        if (!safeName || safeName === "." || safeName === "..") {
            throw new Error("Invalid file name");
        }
        return path_1.default.join(this.config.uploadDir, safeName);
    }
    /** 清理超过7天的过期文件 */
    async cleanupOldFiles() {
        try {
            const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
            const files = fs_1.default.readdirSync(this.config.uploadDir);
            let deleted = 0;
            for (const file of files) {
                const filePath = path_1.default.join(this.config.uploadDir, file);
                try {
                    const stat = fs_1.default.statSync(filePath);
                    if (stat.mtimeMs < cutoff) {
                        fs_1.default.unlinkSync(filePath);
                        deleted++;
                    }
                }
                catch (err) {
                    this.logger.warn(`Failed to process file ${file}: ${err.message}`);
                }
            }
            this.logger.info(`Cleaned up ${deleted} old files`);
            return deleted;
        }
        catch (err) {
            this.logger.error(`Cleanup failed: ${err.message}`);
            return 0;
        }
    }
}
exports.FileService = FileService;
//# sourceMappingURL=file-service.js.map