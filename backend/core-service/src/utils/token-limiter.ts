/**
 * =============================================================================
 * 模块名称：Token限额器
 * 功能描述：大模型Token日消耗限额检查（默认100000），超额自动熔断。精确午夜重置，定期清理过期缓存。
 * 技术决策引用：#91 #90
 * 创建日期：2026-04-30
 * =============================================================================
 */

import { Config } from "./config";
import { Logger } from "./logger";
import { Database } from "./db";

export class TokenRateLimiter {
  private static instance: TokenRateLimiter;
  private config: Config;
  private logger: Logger;
  private db: Database;
  private cache: Map<string, number> = new Map();

  private constructor() {
    this.config = Config.getInstance();
    this.logger = Logger.getInstance();
    this.db = Database.getInstance();
  }

  /** 获取单例实例 */
  static getInstance(): TokenRateLimiter {
    if (!TokenRateLimiter.instance) TokenRateLimiter.instance = new TokenRateLimiter();
    return TokenRateLimiter.instance;
  }

  /** 检查Token消耗是否超过日限额，超额返回false */
  async checkLimit(soulId: string, requestedTokens: number): Promise<boolean> {
    const today = new Date().toISOString().split("T")[0];
    const key = `${soulId}:${today}`;

    let used = this.cache.get(key);
    if (used === undefined) {
      const result = await this.db.query(
        `SELECT COALESCE(SUM(total_tokens), 0) as total FROM token_usage WHERE soul_id = $1 AND date = $2`,
        [soulId, today]
      );
      used = parseInt(result.rows[0].total);
      this.cache.set(key, used);
    }

    const soulResult = await this.db.query(
      `SELECT max_tokens_per_day FROM souls WHERE id = $1`, [soulId]
    );
    const limit = soulResult.rows[0]?.max_tokens_per_day || this.config.tokenDailyLimit;

    if (used + requestedTokens > limit) {
      this.logger.warn(`Soul ${soulId} token limit exceeded: ${used}/${limit}`);
      return false;
    }
    return true;
  }

  /** 记录本次Token消耗到缓存和数据库 */
  async recordUsage(soulId: string, model: string, promptTokens: number, completionTokens: number): Promise<void> {
    const today = new Date().toISOString().split("T")[0];
    const hour = new Date().getHours();
    const total = promptTokens + completionTokens;

    await this.db.query(
      `INSERT INTO token_usage (soul_id, model, prompt_tokens, completion_tokens, total_tokens, date, hour, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [soulId, model, promptTokens, completionTokens, total, today, hour]
    );

    const key = `${soulId}:${today}`;
    const current = this.cache.get(key) || 0;
    this.cache.set(key, current + total);
  }

  /** 启动午夜定时重置，首次精确到下一个午夜 */
  startDailyReset(): void {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
    const msUntilMidnight = midnight.getTime() - now.getTime();

    setTimeout(() => {
      this.cache.clear();
      this.logger.info("Token rate limiter cache cleared at midnight");
      setInterval(() => {
        this.cache.clear();
        this.logger.info("Token rate limiter cache cleared");
      }, 24 * 60 * 60 * 1000);
    }, msUntilMidnight);
  }
}
