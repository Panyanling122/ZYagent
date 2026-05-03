/**
 * =============================================================================
 * 模块名称：JWT服务
 * 功能描述：Token签发与验证，支持单设备登录
 * 技术决策引用：#61 #62
 * 创建日期：2026-04-30
 * 最后修改：2026-04-30
 * =============================================================================
 */

import jwt from "jsonwebtoken";
import { Config } from "../utils/config";

export class JWTService {
  private static instance: JWTService;
  private config: Config;

  private constructor() {
    this.config = Config.getInstance();
  }

  static getInstance(): JWTService {
    if (!JWTService.instance) JWTService.instance = new JWTService();
    return JWTService.instance;
  }

  generateToken(payload: any, expiresIn: string = "24h"): string {
    return jwt.sign(payload, this.config.jwtSecret, { expiresIn: expiresIn as any });
  }

  generateWSToken(userId: string, soulId: string): string {
    return jwt.sign({ userId, soulId, type: "ws" }, this.config.wsTokenSecret, { expiresIn: "7d" as const });
  }

  verifyToken(token: string): any {
    return jwt.verify(token, this.config.jwtSecret);
  }

  verifyWSToken(token: string): any {
    return jwt.verify(token, this.config.wsTokenSecret);
  }

  decode(token: string): any {
    return jwt.decode(token);
  }
}

