"use strict";
/**
 * =============================================================================
 * 模块名称：后台管理入口
 * 功能描述：Express RESTful API服务，14个路由模块，中间件链
 * 技术决策引用：#1 #11 #12
 * 创建日期：2026-04-30
 * 最后修改：2026-04-30
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, "../../.env") });
const logger_1 = require("./utils/logger");
const auth_1 = require("./routes/auth");
const souls_1 = require("./routes/souls");
const skills_1 = require("./routes/skills");
const memory_1 = require("./routes/memory");
const logs_1 = require("./routes/logs");
const tokens_1 = require("./routes/tokens");
const users_1 = require("./routes/users");
const admin_1 = require("./routes/admin");
const groups_1 = require("./routes/groups");
const system_1 = require("./routes/system");
const providers_1 = require("./routes/providers");
const inventory_1 = require("./routes/inventory");
const channels_1 = require("./routes/channels");
const ips_1 = require("./routes/ips");
const monitor_1 = require("./routes/monitor");
const auth_2 = require("./middleware/auth");
const ip_whitelist_1 = require("./middleware/ip-whitelist");
const audit_1 = require("./middleware/audit");
const app = (0, express_1.default)();
const logger = logger_1.Logger.getInstance();
const PORT = process.env.PORT || 3002;
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({ origin: [process.env.ADMIN_WEB_URL || "http://localhost", "http://39.107.241.63", "http://39.107.241.63:5173"], credentials: true }));
app.use(express_1.default.json({ limit: "50mb" }));
app.use(audit_1.auditMiddleware);
app.use("/api/auth", auth_1.authRouter);
app.use("/api/souls", auth_2.authMiddleware, ip_whitelist_1.ipWhitelistMiddleware, souls_1.soulRouter);
app.use("/api/skills", auth_2.authMiddleware, ip_whitelist_1.ipWhitelistMiddleware, skills_1.skillRouter);
app.use("/api/memory", auth_2.authMiddleware, ip_whitelist_1.ipWhitelistMiddleware, memory_1.memoryRouter);
app.use("/api/logs", auth_2.authMiddleware, ip_whitelist_1.ipWhitelistMiddleware, logs_1.logRouter);
app.use("/api/tokens", auth_2.authMiddleware, ip_whitelist_1.ipWhitelistMiddleware, tokens_1.tokenRouter);
app.use("/api/users", auth_2.authMiddleware, ip_whitelist_1.ipWhitelistMiddleware, users_1.userRouter);
app.use("/api/admin", admin_1.adminRouter);
app.use("/api/groups", auth_2.authMiddleware, ip_whitelist_1.ipWhitelistMiddleware, groups_1.groupRouter);
app.use("/api/inventory", auth_2.authMiddleware, ip_whitelist_1.ipWhitelistMiddleware, inventory_1.inventoryRouter);
app.use("/api/providers", auth_2.authMiddleware, ip_whitelist_1.ipWhitelistMiddleware, providers_1.providerRouter);
app.use("/api/channels", auth_2.authMiddleware, ip_whitelist_1.ipWhitelistMiddleware, channels_1.channelsRouter);
app.use("/api/ips", auth_2.authMiddleware, ips_1.ipRouter);
app.use("/api/monitor", auth_2.authMiddleware, monitor_1.monitorRouter);
app.use("/api/system", auth_2.authMiddleware, ip_whitelist_1.ipWhitelistMiddleware, system_1.systemRouter);
app.use((err, req, res, next) => {
    logger.error("API Error:", err);
    res.status(500).json({ success: false, error: "Internal server error", code: "INTERNAL_ERROR" });
});
app.listen(PORT, () => {
    logger.info(`Admin service running on port ${PORT}`);
});
