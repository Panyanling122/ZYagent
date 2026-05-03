"use strict";
/**
 * =============================================================================
 * 模块名称：系统启动器
 * 功能描述：模块化初始化所有服务，解耦 index.js
 * =============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Bootstrap = void 0;
const config_1 = require("../utils/config");
const logger_1 = require("../utils/logger");
const db_1 = require("../utils/db");
const file_service_1 = require("../utils/file-service");
const event_bus_1 = require("../events/event-bus");
const soul_manager_1 = require("../soul/soul-manager");
const group_service_1 = require("../soul/group-service");
const scheduler_service_1 = require("../scheduler/scheduler-service");
const memory_service_1 = require("../memory/memory-service");
const channel_manager_1 = require("../channels/channel-manager");
const ws_server_1 = require("../websocket/ws-server");
const health_check_1 = require("../utils/health-check");
const graceful_shutdown_1 = require("../utils/graceful-shutdown");
const context_engine_1 = require("../context/context-engine");
const workspace_service_1 = require("./workspace-service");
const task_service_1 = require("./task-service");
class Bootstrap {
    logger;
    services = {};
    constructor() {
        this.logger = logger_1.Logger.getInstance();
    }
    async boot() {
        this.logger.info("=== 中亿智能体集群 v3.0 Boot ===");
        // 1. 基础设施
        this.services.db = db_1.Database.getInstance();
        this.services.config = config_1.Config.getInstance();
        this.services.fileService = file_service_1.FileService.getInstance();
        this.services.logger = this.logger;
        this.logger.info("[Boot] Database & FileService ready");
        // 2. 事件总线
        this.services.eventBus = event_bus_1.EventBus.getInstance();
        // 3. 记忆服务
        this.services.memory = memory_service_1.MemoryService.getInstance();
        this.logger.info("[Boot] MemoryService ready");
        // 4. 群组服务
        this.services.groupService = group_service_1.GroupService.getInstance();
        this.logger.info("[Boot] GroupService ready");
        // 5. Soul 管理器
        this.services.soulManager = soul_manager_1.SoulManager.getInstance();
        await this.services.soulManager.initialize();
        this.logger.info("[Boot] SoulManager ready");
        // 6. 调度器
        this.services.scheduler = scheduler_service_1.SchedulerService.getInstance();
        this.services.scheduler.initialize();
        this.logger.info("[Boot] Scheduler ready");
        // 7. 工作空间服务
        this.services.workspaceService = workspace_service_1.WorkspaceService.getInstance();
        this.logger.info("[Boot] WorkspaceService ready");
        // 7.5 任务服务
        this.services.taskService = task_service_1.TaskService.getInstance();
        this.logger.info("[Boot] TaskService ready");
        // 8. 渠道管理器
        this.services.channelManager = channel_manager_1.ChannelManager.getInstance();
        await this.services.channelManager.loadFromDB();
        this.services.channelManager.onMessage((msg, channelType) => {
            const souls = this.services.soulManager.getActiveSouls();
            const target = souls[0];
            if (target)
                this.services.soulManager.sendMessage(target, { type: "chat", message: msg.content || "" });
        });
        this.logger.info("[Boot] ChannelManager ready");
        // 9. iLink 适配器
        const ilink_adapter_1 = require("../channels/ilink-adapter");
        this.services.iLinkAdapter = ilink_adapter_1.iLinkAdapter.getInstance();
        await this.services.iLinkAdapter.initialize().catch(err => this.logger.warn("iLink init skipped:", err.message));
        this.logger.info("[Boot] iLinkAdapter ready");
        // 10. 上下文引擎
        this.services.contextEngine = context_engine_1.ContextEngine.getInstance();
        this.logger.info("[Boot] ContextEngine ready");
        // 11. 飞书适配器
        const feishu_adapter_1 = require("../feishu/feishu-adapter");
        this.services.feishuAdapter = feishu_adapter_1.FeishuAdapter.getInstance();
        await this.services.feishuAdapter.initialize().catch(err => this.logger.warn("Feishu init skipped:", err.message));
        this.logger.info("[Boot] FeishuAdapter ready");
        // 12. 媒体服务
        const media_service_1 = require("../media/media-service");
        this.services.mediaService = media_service_1.MediaService.getInstance();
        this.services.mediaService.initialize();
        this.logger.info("[Boot] MediaService ready");
        // 13. Soul 协议
        const soul_protocol_1 = require("../soul/soul-protocol");
        this.services.soulProtocol = soul_protocol_1.SoulProtocol.getInstance();
        this.logger.info("[Boot] SoulProtocol ready");
        // 14. WebSocket 服务器
        this.services.wsServer = new ws_server_1.WebSocketServer(config_1.Config.getInstance().wsPort);
        this.services.wsServer.start();
        this.logger.info("[Boot] WebSocket ready");
        // 15. 健康检查
        this.services.healthCheck = new health_check_1.HealthCheck(config_1.Config.getInstance().healthPort);
        this.services.healthCheck.start();
        this.logger.info("[Boot] HealthCheck ready");
        // 16. 优雅关闭
        const shutdown = graceful_shutdown_1.GracefulShutdown.getInstance();
        shutdown.register("ws", async () => this.services.wsServer.stop());
        shutdown.register("scheduler", async () => this.services.scheduler.stop());
        shutdown.register("souls", async () => this.services.soulManager.shutdown());
        shutdown.register("db", async () => this.services.db.close());
        shutdown.listen();
        this.logger.info("=== 中亿智能体集群 v3.0 Running ===");
        this.logger.info(`API Port: ${config_1.Config.getInstance().port}`);
        this.logger.info(`WebSocket Port: ${config_1.Config.getInstance().wsPort}`);
        this.logger.info(`Health Port: ${config_1.Config.getInstance().healthPort}`);
        return this.services;
    }
    getServices() {
        return this.services;
    }
}
exports.Bootstrap = Bootstrap;
