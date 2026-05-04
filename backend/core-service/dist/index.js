"use strict";
/**
 * =============================================================================
 * 模块名称：核心服务主入口
 * 功能描述：Express HTTP服务 + WebSocket + 调度器 + Soul管理 + 渠道管理
 * =============================================================================
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const config_1 = require("./utils/config");
const logger_1 = require("./utils/logger");
const db_1 = require("./utils/db");
const event_bus_1 = require("./events/event-bus");
const soul_manager_1 = require("./soul/soul-manager");
const ws_server_1 = require("./websocket/ws-server");
const health_check_1 = require("./utils/health-check");
const graceful_shutdown_1 = require("./utils/graceful-shutdown");
const scheduler_service_1 = require("./scheduler/scheduler-service");
const memory_service_1 = require("./memory/memory-service");
const group_service_1 = require("./soul/group-service");
const file_service_1 = require("./utils/file-service");
const channel_manager_1 = require("./channels/channel-manager");
const context_engine_1 = require("./context/context-engine");
const workspace_service_1 = require("./services/workspace-service");
const task_service_1 = require("./services/task-service");
const logger = logger_1.Logger.getInstance();
async function main() {
    logger.info("=== 中亿智能体集群 Core Service Starting ===");
    // Initialize database
    const db = db_1.Database.getInstance();
    logger.info("Database connected");
    // Initialize file service
    file_service_1.FileService.getInstance();
    logger.info("File service ready");
    // Initialize memory service
    const memory = memory_service_1.MemoryService.getInstance();
    logger.info("Memory service ready");
    // Initialize group service
    group_service_1.GroupService.getInstance();
    logger.info("Group service ready");
    // Initialize event bus
    event_bus_1.EventBus.getInstance();
    // Initialize workspace service
    workspace_service_1.WorkspaceService.getInstance();
    logger.info("Workspace service ready");
    // Initialize task service
    task_service_1.TaskService.getInstance();
    logger.info("Task service ready");
    // Initialize soul manager
    const soulManager = soul_manager_1.SoulManager.getInstance();
    await soulManager.initialize();
    // Initialize scheduler
    const scheduler = scheduler_service_1.SchedulerService.getInstance();
    scheduler.initialize();
    // Initialize channels
    const channelManager = channel_manager_1.ChannelManager.getInstance();
    await channelManager.loadFromDB();
    channelManager.onMessage((msg, channelType) => {
        logger.info(`[Channel] ${channelType} msg from ${msg.fromUserId}: ${msg.content.slice(0, 50)}`);
        const souls = soulManager.getActiveSouls();
        const targetSoul = souls.length > 0 ? souls[0] : null;
        if (targetSoul) {
            soulManager.sendMessage(targetSoul, { type: "chat", message: msg.content || "" });
        }
    });
    logger.info("Channel manager ready");
    // Initialize iLink adapter (微信对接)
    const ilink_adapter_1 = require("./channels/ilink-adapter");
    const iLinkAdapter = ilink_adapter_1.iLinkAdapter.getInstance();
    await iLinkAdapter.initialize().catch(err => logger.warn("iLink init skipped:", err.message));
    logger.info("iLink adapter ready");
    // Initialize context engine (L1/L2/L3)
    context_engine_1.ContextEngine.getInstance();
    logger.info("Context engine ready");
    // Initialize Feishu adapter
    const feishu_adapter_1 = require("./feishu/feishu-adapter");
    const feishuAdapter = feishu_adapter_1.FeishuAdapter.getInstance();
    await feishuAdapter.initialize().catch(err => logger.warn("Feishu init skipped:", err.message));
    logger.info("Feishu adapter ready");
    // Initialize media service
    const media_service_1 = require("./media/media-service");
    const mediaService = media_service_1.MediaService.getInstance();
    mediaService.initialize();
    logger.info("Media service ready");
    // Initialize soul protocol (群协作)
    const soul_protocol_1 = require("./soul/soul-protocol");
    soul_protocol_1.SoulProtocol.getInstance();
    logger.info("Soul protocol ready");
    // Start HTTP API server (includes webhook routes)
    const app = (0, express_1.default)();
    app.use(express_1.default.json({ limit: "10mb" }));
    app.use(express_1.default.urlencoded({ extended: true, limit: "10mb" }));
    // 日志脱敏中间件
    const log_sanitizer_1 = require("./utils/log-sanitizer");
    app.use((req, _res, next) => {
        if (req.body && typeof req.body === 'object') {
            req.body = log_sanitizer_1.LogSanitizer.sanitizeObject(req.body);
        }
        if (req.query && typeof req.query === 'object') {
            req.query = log_sanitizer_1.LogSanitizer.sanitizeObject(req.query);
        }
        next();
    });
    logger.info("Log sanitizer middleware mounted");
    // Webhook routes
    app.post("/webhook/wechat", async (req, res) => {
        try {
            const adapter = channelManager.getAdapter("wechat");
            if (!adapter) {
                res.status(503).send("not configured");
                return;
            }
            const result = await adapter.handleWebhook(req.body, req.query.signature, req.query.timestamp, req.query.nonce);
            res.send(result);
        } catch (err) {
            logger.error("[Webhook] WeChat error:", err.message);
            res.status(500).send("error");
        }
    });
    // 飞书 Webhook v2
    app.post("/webhook/feishu/v2", async (req, res) => {
        try {
            const adapter = feishu_adapter_1.FeishuAdapter.getInstance();
            const result = await adapter.handleWebhook(req.body, req.headers);
            res.json(result);
        } catch (err) {
            logger.error("[Webhook] Feishu v2 error:", err.message);
            res.status(200).json({ code: 0 });
        }
    });
    // Channel status
    app.get("/channels", (_req, res) => {
        res.json({ channels: channelManager.getActiveChannels() });
    });
    // iLink 微信 ClawBot 路由
    const ilink_chat_api_1 = require("./routes/ilink-chat-api");
    app.use("/api/ilink", ilink_chat_api_1.default);
    // iLink 微信绑定路由
    const ilink_bind_routes_1 = require("./routes/ilink-bind-routes");
    app.use("/api/ilink", ilink_bind_routes_1.default);
    // 工作空间路由
    const workspace_routes_1 = __importDefault(require("./routes/workspace-routes"));
    app.use("/api/workspaces", workspace_routes_1.default);
    // 看板任务路由
    const task_routes_1 = __importDefault(require("./routes/task-routes"));
    app.use("/api/tasks", task_routes_1.default);
    // IP 白名单中间件（仅对 /api/admin 生效）
    const ADMIN_IP_WHITELIST = process.env.ADMIN_IP_WHITELIST || '';
    if (ADMIN_IP_WHITELIST) {
        app.use("/api/admin", (req, res, next) => {
            const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
            const allowed = ADMIN_IP_WHITELIST.split(',').some(c => clientIp.startsWith(c.trim()));
            if (!allowed) return res.status(403).json({ error: 'Admin access denied: IP not in whitelist' });
            next();
        });
        logger.info(`IP whitelist mounted for /api/admin: ${ADMIN_IP_WHITELIST}`);
    }
    // 管理后台增强路由
    const admin_enhanced_1 = require("./routes/admin-enhanced");
    app.use("/api/admin", admin_enhanced_1.default);
    const admin_dashboard_1 = require("./routes/admin-dashboard");
    app.use("/api/admin", admin_dashboard_1.default);
    // 文件上传路由
    const file_api_1 = require("./routes/file-api");
    app.use("/api/files", file_api_1.default);
    app.listen(config_1.Config.getInstance().port, () => {
        logger.info(`HTTP API listening on port ${config_1.Config.getInstance().port}`);
    });
    // Start WebSocket server
    const wsServer = new ws_server_1.WebSocketServer(config_1.Config.getInstance().wsPort);
    wsServer.start();
    // Start health check
    const healthCheck = new health_check_1.HealthCheck(config_1.Config.getInstance().healthPort);
    healthCheck.start();
    // Setup graceful shutdown
    const shutdown = graceful_shutdown_1.GracefulShutdown.getInstance();
    shutdown.register("ws", async () => wsServer.stop());
    shutdown.register("scheduler", async () => scheduler.stop());
    shutdown.register("souls", async () => soulManager.shutdown());
    shutdown.register("db", async () => db.close());
    shutdown.listen();
    logger.info("=== 中亿智能体集群 Core Service Running ===");
    logger.info(`API Port: ${config_1.Config.getInstance().port}`);
    logger.info(`WebSocket Port: ${config_1.Config.getInstance().wsPort}`);
    logger.info(`Health Port: ${config_1.Config.getInstance().healthPort}`);
}
main().catch((err) => {
    logger.error("Fatal error:", err);
    process.exit(1);
});
