"use strict";
/**
 * =============================================================================
 * 模块名称：健康检查
 * 功能描述：HTTP健康探测端点，返回服务状态
 * 技术决策引用：#86
 * 创建日期：2026-04-30
 * 最后修改：2026-04-30
 * =============================================================================
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthCheck = void 0;
const express_1 = __importDefault(require("express"));
const db_1 = require("./db");
const logger_1 = require("./logger");
class HealthCheck {
    port;
    app;
    logger = logger_1.Logger.getInstance();
    constructor(port) {
        this.port = port;
        this.app = (0, express_1.default)();
        this.setupRoutes();
    }
    setupRoutes() {
        this.app.get("/health", async (req, res) => {
            try {
                const db = db_1.Database.getInstance();
                await db.query("SELECT 1");
                res.json({ status: "healthy", timestamp: new Date().toISOString() });
            }
            catch (err) {
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
exports.HealthCheck = HealthCheck;
//# sourceMappingURL=health-check.js.map