/**
 * =============================================================================
 * 模块名称：后台管理入口
 * 功能描述：Express RESTful API服务，14个路由模块，中间件链
 * 技术决策引用：#1 #11 #12
 * 创建日期：2026-04-30
 * 最后修改：2026-04-30
 */

import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { Logger } from "./utils/logger";
import { authRouter } from "./routes/auth";
import { soulRouter } from "./routes/souls";
import { skillRouter } from "./routes/skills";
import { memoryRouter } from "./routes/memory";
import { logRouter } from "./routes/logs";
import { tokenRouter } from "./routes/tokens";
import { userRouter } from "./routes/users";
import { adminRouter } from './routes/admin';
import { groupRouter } from "./routes/groups";
import { systemRouter } from "./routes/system";
import { providerRouter } from "./routes/providers";
import { inventoryRouter } from "./routes/inventory";
import { channelsRouter } from "./routes/channels";
import { ipRouter } from "./routes/ips";
import { monitorRouter } from "./routes/monitor";
import { authMiddleware } from "./middleware/auth";
import { ipWhitelistMiddleware } from "./middleware/ip-whitelist";
import { auditMiddleware } from "./middleware/audit";

const app = express();
const logger = Logger.getInstance();
const PORT = process.env.PORT || 3002;

app.use(helmet());

app.use(cors({ origin: process.env.ADMIN_WEB_URL || "http://localhost", credentials: true }));
app.use(express.json({ limit: "50mb" }));
app.use(auditMiddleware);

app.use("/api/auth", authRouter);
app.use("/api/souls", authMiddleware, ipWhitelistMiddleware, soulRouter);
app.use("/api/skills", authMiddleware, ipWhitelistMiddleware, skillRouter);
app.use("/api/memory", authMiddleware, ipWhitelistMiddleware, memoryRouter);
app.use("/api/logs", authMiddleware, ipWhitelistMiddleware, logRouter);
app.use("/api/tokens", authMiddleware, ipWhitelistMiddleware, tokenRouter);
app.use("/api/users", authMiddleware, ipWhitelistMiddleware, userRouter);
  app.use("/api/admin", adminRouter);
app.use("/api/groups", authMiddleware, ipWhitelistMiddleware, groupRouter);
app.use("/api/inventory", authMiddleware, ipWhitelistMiddleware, inventoryRouter);
app.use("/api/providers", authMiddleware, ipWhitelistMiddleware, providerRouter);
app.use("/api/channels", authMiddleware, ipWhitelistMiddleware, channelsRouter);
app.use("/api/ips", authMiddleware, ipRouter);
app.use("/api/monitor", authMiddleware, monitorRouter);
app.use("/api/system", authMiddleware, ipWhitelistMiddleware, systemRouter);

app.use((err: any, req: any, res: any, next: any) => {
  logger.error("API Error:", err);
  res.status(500).json({ success: false, error: "Internal server error", code: "INTERNAL_ERROR" });
});



app.listen(PORT, () => {
  logger.info(`Admin service running on port ${PORT}`);
});
