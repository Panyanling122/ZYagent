/**
 * =============================================================================
 * 模块名称：AI Gateway
 * 功能描述：统一大模型调用接口，支持 OpenAI 兼容格式
 * =============================================================================
 */

import axios, { AxiosInstance } from 'axios';
import { decryptApiKey } from '../utils/crypto';

interface ProviderConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  realModel: string;
  isBackup: boolean;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatOptions {
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

interface ChatResponse {
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  providerName?: string;
}

class AIGateway {
  private http: AxiosInstance;
  private logger = console;
  public lastUsage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };

  constructor() {
    this.http = axios.create({
      timeout: 60000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * 从数据库加载主 Provider + 备用 Provider
   */
  async loadProviders(): Promise<{ primary: ProviderConfig | null; backup: ProviderConfig | null }> {
    try {
      const { pool } = await import('../db');
      const result = await pool.query(
        `SELECT name, base_url, api_key, model_map->>'default' as real_model, is_backup
         FROM providers WHERE is_active = true ORDER BY is_backup ASC LIMIT 2`
      );
      const primary = result.rows.find(r => !r.is_backup) || result.rows[0] || null;
      const backup = result.rows.find(r => r.is_backup) || null;

      const toConfig = (row: any): ProviderConfig | null => {
        if (!row) return null;
        return {
          name: row.name,
          baseUrl: row.base_url,
          apiKey: decryptApiKey(row.api_key),
          realModel: row.real_model || 'gpt-4o',
          isBackup: row.is_backup || false,
        };
      };

      return { primary: toConfig(primary), backup: toConfig(backup) };
    } catch (err) {
      this.logger.error('[AIGateway] Failed to load providers:', err);
      return { primary: null, backup: null };
    }
  }

  /**
   * 统一聊天接口（带自动回退）
   */
  async chat(options: ChatOptions): Promise<ChatResponse> {
    const { primary, backup } = await this.loadProviders();
    if (!primary && !backup) {
      throw new Error('No active AI provider configured');
    }

    // 先尝试主模型
    if (primary) {
      try {
        return await this.callProvider(primary, options);
      } catch (err: any) {
        this.logger.warn(`[AIGateway] Primary provider ${primary.name} failed: ${err.message}`);
        // 主模型失败，尝试备用
        if (backup) {
          this.logger.warn(`[AIGateway] Falling back to backup provider ${backup.name}`);
          return await this.callProvider(backup, options);
        }
        throw err;
      }
    }

    // 无主模型，直接用备用
    if (backup) {
      return await this.callProvider(backup, options);
    }

    throw new Error('No active AI provider configured');
  }

  private async callProvider(provider: ProviderConfig, options: ChatOptions): Promise<ChatResponse> {
    const url = `${provider.baseUrl}/chat/completions`;
    const payload = {
      model: provider.realModel,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 2048,
      stream: false,
    };

    try {
      const response = await this.http.post(url, payload, {
        headers: { Authorization: `Bearer ${provider.apiKey}` },
      });

      const data = response.data;
      const content = data.choices?.[0]?.message?.content || '';

      if (data.usage) {
        this.lastUsage = {
          prompt_tokens: data.usage.prompt_tokens || 0,
          completion_tokens: data.usage.completion_tokens || 0,
          total_tokens: data.usage.total_tokens || 0,
        };
      }

      return {
        content,
        usage: data.usage,
        providerName: provider.name,
      };
    } catch (err: any) {
      const errorDetail = {
        provider: provider.name,
        model: provider.realModel,
        message: err.message,
        code: err.code || null,
        status: err.response?.status || null,
        responseData: err.response?.data || null,
        requestUrl: err.config?.url || null,
      };
      this.logger.error(`[AIGateway] ${provider.name} error: ${JSON.stringify(errorDetail)}`);
      throw new Error(`AI request failed: ${err.message}`);
    }
  }
}

export { AIGateway };
export type { ChatOptions, ChatResponse, ChatMessage, ProviderConfig };
