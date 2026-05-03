"use strict";
/**
 * =============================================================================
 * 模块名称：JWT服务
 * 功能描述：Token签发与验证，支持单设备登录
 * 技术决策引用：#61 #62
 * 创建日期：2026-04-30
 * 最后修改：2026-04-30
 * =============================================================================
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JWTService = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("../utils/config");
class JWTService {
    static instance;
    config;
    constructor() {
        this.config = config_1.Config.getInstance();
    }
    static getInstance() {
        if (!JWTService.instance)
            JWTService.instance = new JWTService();
        return JWTService.instance;
    }
    generateToken(payload, expiresIn = "24h") {
        return jsonwebtoken_1.default.sign(payload, this.config.jwtSecret, { expiresIn: expiresIn });
    }
    generateWSToken(userId, soulId) {
        return jsonwebtoken_1.default.sign({ userId, soulId, type: "ws" }, this.config.wsTokenSecret, { expiresIn: "7d" });
    }
    verifyToken(token) {
        return jsonwebtoken_1.default.verify(token, this.config.jwtSecret);
    }
    verifyWSToken(token) {
        return jsonwebtoken_1.default.verify(token, this.config.wsTokenSecret);
    }
    decode(token) {
        return jsonwebtoken_1.default.decode(token);
    }
}
exports.JWTService = JWTService;
//# sourceMappingURL=jwt-service.js.map