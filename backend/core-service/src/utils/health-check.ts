/**
 * =============================================================================
 * 模块名称：健康检查
 * 功能描述：HTTP健康探测端点，返回服务状态
 * 技术决策引用：#86
 * 创建日期：2026-04-30
 * 最后修改：2026-04-30
 * =============================================================================
 */

import express from "express";
import { Database } from "./db";
import { Logger } from "./logger";

export class HealthCheck {
  private app: express.Application;
  private logger = Logger.getInstance();

  constructor(private port: number) {
    this.app = express();
    this.setupRoutes();
  }

  private setupRoutes() {
    this.app.get("/health", async (req, res) => {
      try {
        const db = Database.getInstance();
        await db.query("SELECT 1");
        res.json({ status: "healthy", timestamp: new Date().toISOString() });
      } catch (err) {
        this.logger.error("Health check failed:", err);
        res.status(503).json({ status: "unhealthy", error: "Database connection failed" });
      }
    });
  }

  start() {
    this.app.listen(this.port, () => {
      this.logger.info(`Health check server on port ${this.port}`);
    });
  }
}
