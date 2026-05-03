/**
 * =============================================================================
 * 模块名称：IP白名单中间件
 * 功能描述：基于数据库的动态IP白名单，60秒缓存机制
 * 技术决策引用：#64 #65
 * 创建日期：2026-04-30
 * 最后修改：2026-04-30
 * =============================================================================
 */

import { Request, Response, NextFunction } from "express";
import { db } from "../utils/db";

let cachedWhitelist: string[] | null = null;
let cacheTime: number = 0;

async function getWhitelist(): Promise<string[]> {
  if (cachedWhitelist && Date.now() - cacheTime < 60000) return cachedWhitelist;
  try {
    const result = await db.query("SELECT ip_address FROM ip_whitelist WHERE is_active = true");
    cachedWhitelist = result.rows.map((r: any) => r.ip_address);
    cacheTime = Date.now();
    return cachedWhitelist;
  } catch (err) {
    console.error("[IPWhitelist] DB query failed:", err); return ["__DB_ERROR_BLOCK_ALL__"];
  }
}

export async function ipWhitelistMiddleware(req: Request, res: Response, next: NextFunction) {
  const whitelist = await getWhitelist();
  if (whitelist.length === 0) return next();
  if (whitelist.includes("__DB_ERROR_BLOCK_ALL__")) {
    return res.status(503).json({ success: false, error: "IP whitelist check unavailable", code: "IP_CHECK_ERROR" });
  }

  const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
    || req.socket.remoteAddress || "";

  if (!whitelist.includes(clientIp)) {
    return res.status(403).json({ success: false, error: "IP not whitelisted", code: "IP_BLOCKED" });
  }
  next();
}
