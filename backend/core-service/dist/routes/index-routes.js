/**
 * =============================================================================
 * 模块名称：路由集中注册（辅助文件）
 * 功能描述：所有 HTTP 路由的集中注册点
 *   - /api/ilink: iLink 微信对接
 *   - /api/admin: 后台管理（enhanced + dashboard）
 *   - /api/files: 文件上传与处理
 *   - /webhook/feishu/v2: 飞书 Webhook
 * =============================================================================
 */

// 注册所有路由
const ilink_chat_api_1 = require("./routes/ilink-chat-api");
app.use("/api/ilink", ilink_chat_api_1.default);
const admin_enhanced_1 = require("./routes/admin-enhanced");
app.use("/api/admin", admin_enhanced_1.default);
const admin_dashboard_1 = require("./routes/admin-dashboard");
app.use("/api/admin", admin_dashboard_1.default);
const file_api_1 = require("./routes/file-api");
app.use("/api/files", file_api_1.default);
const feishu_adapter_1 = require("./feishu/feishu-adapter");
// 飞书 Webhook
app.post("/webhook/feishu", async (req, res) => {
    const adapter = feishu_adapter_1.FeishuAdapter.getInstance();
    const result = await adapter.handleWebhook(req.body, req.headers);
    res.json(result);
});
