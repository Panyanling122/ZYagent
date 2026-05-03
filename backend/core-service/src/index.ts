/**
 * =============================================================================
 * 模块名称：核心服务主入口
 * 功能描述：Express HTTP服务 + WebSocket + 调度器 + Soul管理 + 渠道管理
 * 技术决策引用：#1 #21 #41
 * 创建日期：2026-04-30
 * 最后修改：2026-04-30
 * =============================================================================
 */

import express from "express";
import { Config } from "./utils/config";
import { Logger } from "./utils/logger";
import { Database } from "./utils/db";
import { EventBus } from "./events/event-bus";
import { SoulManager } from "./soul/soul-manager";
import { WebSocketServer } from "./websocket/ws-server";
import { HealthCheck } from "./utils/health-check";
import { GracefulShutdown } from "./utils/graceful-shutdown";
import { SchedulerService } from "./scheduler/scheduler-service";
import { MemoryService } from "./memory/memory-service";
import { GroupService } from "./soul/group-service";
import { FileService } from "./utils/file-service";
import { ChannelManager } from "./channels/channel-manager";

const logger = Logger.getInstance();

async function main() {
  logger.info("=== 中亿智能体集群 Core Service Starting ===");

  // Initialize database
  const db = Database.getInstance();
  logger.info("Database connected");

  // Initialize file service
  FileService.getInstance();
  logger.info("File service ready");

  // Initialize memory service
  const memory = MemoryService.getInstance();
  logger.info("Memory service ready");

  // Initialize group service
  GroupService.getInstance();
  logger.info("Group service ready");

  // Initialize event bus
  EventBus.getInstance();

  // Initialize soul manager
  const soulManager = SoulManager.getInstance();
  await soulManager.initialize();

  // Initialize scheduler
  const scheduler = SchedulerService.getInstance();
  scheduler.initialize();

  // Initialize channels
  const channelManager = ChannelManager.getInstance();
  await channelManager.loadFromDB();
  channelManager.onMessage((msg, channelType) => {
    logger.info(`[Channel] ${channelType} msg from ${msg.fromUserId}: ${msg.content.slice(0, 50)}`);
    // Route to default soul (first active) or broadcast
    const souls = soulManager.getActiveSouls();
    const targetSoul = souls.length > 0 ? souls[0] : null;
    if (targetSoul) {
      soulManager.sendMessage(targetSoul, { type: "chat", message: msg.content || "" });
    }
  });
  logger.info("Channel manager ready");

  // Start HTTP API server (includes webhook routes)
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // Webhook routes
  app.post("/webhook/wechat", async (req, res) => {
    try {
      const adapter = channelManager.getAdapter("wechat");
      if (!adapter) { res.status(503).send("not configured"); return; }
      const result = await (adapter as any).handleWebhook(req.body, req.query.signature as string, req.query.timestamp as string, req.query.nonce as string);
      res.send(result);
    } catch (err: any) {
      logger.error("[Webhook] WeChat error:", err.message);
      res.status(500).send("error");
    }
  });

  app.post("/webhook/feishu", async (req, res) => {
    try {
      const adapter = channelManager.getAdapter("feishu");
      if (!adapter) { res.status(503).send("not configured"); return; }
      const result = await (adapter as any).handleWebhook(req.body);
      res.status(200).json(result);
    } catch (err: any) {
      logger.error("[Webhook] Feishu error:", err.message);
      res.status(200).json({ code: 0 });
    }
  });

  // Channel status
  app.get("/channels", (_req, res) => {
    res.json({ channels: channelManager.getActiveChannels() });
  });

  app.listen(Config.getInstance().port, () => {
    logger.info(`HTTP API listening on port ${Config.getInstance().port}`);
  });

  // Start WebSocket server
  const wsServer = new WebSocketServer(Config.getInstance().wsPort);
  wsServer.start();

  // Start health check
  const healthCheck = new HealthCheck(Config.getInstance().healthPort);
  healthCheck.start();

  // Setup graceful shutdown
  const shutdown = GracefulShutdown.getInstance();
  shutdown.register("ws", async () => wsServer.stop());
  shutdown.register("scheduler", async () => scheduler.stop());
  shutdown.register("souls", async () => soulManager.shutdown());
  shutdown.register("db", async () => db.close());
  shutdown.listen();

  logger.info("=== 中亿智能体集群 Core Service Running ===");
  logger.info(`API Port: ${Config.getInstance().port}`);
  logger.info(`WebSocket Port: ${Config.getInstance().wsPort}`);
  logger.info(`Health Port: ${Config.getInstance().healthPort}`);
}

main().catch((err) => {
  logger.error("Fatal error:", err);
  process.exit(1);
});
