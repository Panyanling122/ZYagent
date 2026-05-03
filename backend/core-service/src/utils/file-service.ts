/**
 * =============================================================================
 * 模块名称：文件服务
 * 功能描述：文件上传、存储、路径管理、过期清理。使用path.basename过滤防止目录遍历攻击。
 * 技术决策引用：#23 #88
 * 创建日期：2026-04-30
 * =============================================================================
 */

import { Config } from "./config";
import { Logger } from "./logger";
import fs from "fs";
import path from "path";

export class FileService {
  private static instance: FileService;
  private config: Config;
  private logger: Logger;

  private constructor() {
    this.config = Config.getInstance();
    this.logger = Logger.getInstance();
    if (!fs.existsSync(this.config.uploadDir)) {
      fs.mkdirSync(this.config.uploadDir, { recursive: true });
    }
  }

  /** 获取单例实例 */
  static getInstance(): FileService {
    if (!FileService.instance) FileService.instance = new FileService();
    return FileService.instance;
  }

  /** 保存上传文件到磁盘，返回访问URL和文件大小 */
  async saveFile(fileName: string, data: Buffer): Promise<{ url: string; size: number }> {
    const safeName = path.basename(fileName).replace(/\.\./g, "");
    if (!safeName || safeName === "." || safeName === "..") {
      throw new Error("Invalid file name");
    }
    const filePath = path.join(this.config.uploadDir, safeName);
    await fs.promises.writeFile(filePath, data);
    const stats = await fs.promises.stat(filePath);
    return { url: `/uploads/${safeName}`, size: stats.size };
  }

  /** 获取文件绝对路径（过滤目录遍历字符） */
  getFilePath(fileName: string): string {
    const safeName = path.basename(fileName).replace(/\.\./g, "");
    if (!safeName || safeName === "." || safeName === "..") {
      throw new Error("Invalid file name");
    }
    return path.join(this.config.uploadDir, safeName);
  }

  /** 清理超过7天的过期文件 */
  async cleanupOldFiles(): Promise<number> {
    try {
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const files = fs.readdirSync(this.config.uploadDir);
      let deleted = 0;
      for (const file of files) {
        const filePath = path.join(this.config.uploadDir, file);
        try {
          const stat = fs.statSync(filePath);
          if (stat.mtimeMs < cutoff) {
            fs.unlinkSync(filePath);
            deleted++;
          }
        } catch (err) {
          this.logger.warn(`Failed to process file ${file}: ${(err as Error).message}`);
        }
      }
      this.logger.info(`Cleaned up ${deleted} old files`);
      return deleted;
    } catch (err) {
      this.logger.error(`Cleanup failed: ${(err as Error).message}`);
      return 0;
    }
  }
}
