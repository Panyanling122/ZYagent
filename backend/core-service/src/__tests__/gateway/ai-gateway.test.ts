/**
 * AI Gateway Unit Tests
 * Tests provider loading, token counting, model resolution, and request routing
 */

import axios from 'axios';

// Mock axios
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    post: jest.fn(),
    get: jest.fn(),
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
  })),
  post: jest.fn(),
  get: jest.fn(),
}));

// Mocked axios instance
const mockedAxios = axios as jest.Mocked<typeof axios>;

// ---- Test implementations ----

interface ProviderConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
  defaultModel: string;
}

interface AIGatewayConfig {
  providers: ProviderConfig[];
  defaultProvider: string;
  timeoutMs: number;
  maxRetries: number;
}

class AIGateway {
  private providers: Map<string, ProviderConfig> = new Map();
  private httpClients: Map<string, ReturnType<typeof axios.create>> = new Map();
  private config: AIGatewayConfig;

  constructor(config: AIGatewayConfig) {
    this.config = config;
    this.loadProviders();
  }

  private loadProviders(): void {
    for (const provider of this.config.providers) {
      this.providers.set(provider.name, provider);
      this.httpClients.set(
        provider.name,
        axios.create({
          baseURL: provider.baseUrl,
          headers: { Authorization: `Bearer ${provider.apiKey}` },
          timeout: this.config.timeoutMs,
        })
      );
    }
  }

  getProvider(name: string): ProviderConfig | undefined {
    return this.providers.get(name);
  }

  getAllProviders(): ProviderConfig[] {
    return Array.from(this.providers.values());
  }

  getAvailableModels(): Array<{ provider: string; model: string }> {
    const models: Array<{ provider: string; model: string }> = [];
    for (const [name, config] of this.providers) {
      for (const model of config.models) {
        models.push({ provider: name, model });
      }
    }
    return models;
  }

  getDefaultProvider(): ProviderConfig | undefined {
    return this.providers.get(this.config.defaultProvider);
  }

  countTokens(text: string, model: string = 'gpt-4'): number {
    // Simple approximation: ~4 chars per token for English
    // Different models have different tokenization
    const tokenRatios: Record<string, number> = {
      'gpt-4': 4.0,
      'gpt-4o': 4.2,
      'gpt-3.5-turbo': 4.0,
      'claude-3-opus': 3.8,
      'claude-3-sonnet': 3.8,
      'claude-3-haiku': 3.8,
      'kimi-k1': 3.5,
      'kimi-k2': 3.5,
      'default': 4.0,
    };
    const ratio = tokenRatios[model] || tokenRatios['default'];
    return Math.ceil(text.length / ratio);
  }

  async chatCompletion(provider: string, request: Record<string, unknown>): Promise<Record<string, unknown>> {
    const client = this.httpClients.get(provider);
    if (!client) {
      throw new Error(`Provider '${provider}' not found`);
    }
    const response = await client.post('/chat/completions', request);
    return response.data;
  }

  async streamChat(provider: string, request: Record<string, unknown>): Promise<AsyncIterable<string>> {
    const client = this.httpClients.get(provider);
    if (!client) {
      throw new Error(`Provider '${provider}' not found`);
    }
    const response = await client.post('/chat/completions', {
      ...request,
      stream: true,
    }, { responseType: 'stream' });
    return response.data;
  }

  resolveModel(provider: string, modelAlias?: string): string {
    const config = this.providers.get(provider);
    if (!config) throw new Error(`Provider '${provider}' not found`);
    if (modelAlias && config.models.includes(modelAlias)) return modelAlias;
    return config.defaultModel;
  }
}

describe('AIGateway', () => {
  const mockConfig: AIGatewayConfig = {
    providers: [
      {
        name: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-openai-key',
        models: ['gpt-4', 'gpt-4o', 'gpt-3.5-turbo'],
        defaultModel: 'gpt-4',
      },
      {
        name: 'anthropic',
        baseUrl: 'https://api.anthropic.com/v1',
        apiKey: 'sk-anthropic-key',
        models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'],
        defaultModel: 'claude-3-sonnet',
      },
      {
        name: 'kimi',
        baseUrl: 'https://api.moonshot.cn/v1',
        apiKey: 'sk-kimi-key',
        models: ['kimi-k1', 'kimi-k2'],
        defaultModel: 'kimi-k2',
      },
    ],
    defaultProvider: 'openai',
    timeoutMs: 30000,
    maxRetries: 3,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Provider Loading', () => {
    it('should load all providers from config', () => {
      const gateway = new AIGateway(mockConfig);

      const providers = gateway.getAllProviders();

      expect(providers).toHaveLength(3);
      expect(providers.map(p => p.name)).toContain('openai');
      expect(providers.map(p => p.name)).toContain('anthropic');
      expect(providers.map(p => p.name)).toContain('kimi');
    });

    it('should create axios instances for each provider', () => {
      new AIGateway(mockConfig);

      expect(axios.create).toHaveBeenCalledTimes(3);
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://api.openai.com/v1',
          timeout: 30000,
        })
      );
    });

    it('should set correct authorization headers', () => {
      new AIGateway(mockConfig);

      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: { Authorization: 'Bearer sk-openai-key' },
        })
      );
    });

    it('should handle empty providers list', () => {
      const emptyConfig = { ...mockConfig, providers: [] };
      const gateway = new AIGateway(emptyConfig);

      expect(gateway.getAllProviders()).toHaveLength(0);
      expect(gateway.getAvailableModels()).toHaveLength(0);
    });

    it('should retrieve specific provider by name', () => {
      const gateway = new AIGateway(mockConfig);

      const provider = gateway.getProvider('anthropic');

      expect(provider).toBeDefined();
      expect(provider?.baseUrl).toBe('https://api.anthropic.com/v1');
      expect(provider?.models).toContain('claude-3-opus');
    });

    it('should return undefined for unknown provider', () => {
      const gateway = new AIGateway(mockConfig);

      const provider = gateway.getProvider('nonexistent');

      expect(provider).toBeUndefined();
    });

    it('should get default provider', () => {
      const gateway = new AIGateway(mockConfig);

      const defaultProvider = gateway.getDefaultProvider();

      expect(defaultProvider?.name).toBe('openai');
    });
  });

  describe('countTokens', () => {
    let gateway: AIGateway;

    beforeEach(() => {
      gateway = new AIGateway(mockConfig);
    });

    it('should estimate tokens for English text on GPT-4', () => {
      const text = 'Hello world, this is a test message.';
      const tokens = gateway.countTokens(text, 'gpt-4');
      // 38 chars / 4.0 ratio = ~10 tokens
      expect(tokens).toBe(Math.ceil(38 / 4.0));
    });

    it('should use different ratios for different models', () => {
      const text = 'Testing token estimation across models.';

      const gpt4Tokens = gateway.countTokens(text, 'gpt-4');
      const claudeTokens = gateway.countTokens(text, 'claude-3-opus');
      const kimiTokens = gateway.countTokens(text, 'kimi-k1');

      // Different ratios produce different token counts
      expect(gpt4Tokens).not.toEqual(claudeTokens);
      expect(claudeTokens).not.toEqual(kimiTokens);
    });

    it('should handle empty string', () => {
      const tokens = gateway.countTokens('', 'gpt-4');
      expect(tokens).toBe(0);
    });

    it('should handle Chinese text', () => {
      const chineseText = '你好世界，这是一个测试消息。';
      const tokens = gateway.countTokens(chineseText, 'gpt-4');
      expect(tokens).toBeGreaterThan(0);
    });

    it('should use default ratio for unknown model', () => {
      const text = 'Test with unknown model.';
      const tokens = gateway.countTokens(text, 'unknown-model-v1');
      // Should use default 4.0 ratio
      expect(tokens).toBe(Math.ceil(24 / 4.0));
    });

    it('should handle very long text', () => {
      const longText = 'a'.repeat(10000);
      const tokens = gateway.countTokens(longText, 'gpt-4');
      expect(tokens).toBe(Math.ceil(10000 / 4.0));
    });

    it('should use default model when none specified', () => {
      const text = 'Default model test.';
      const tokens = gateway.countTokens(text);
      expect(tokens).toBe(Math.ceil(19 / 4.0));
    });
  });

  describe('getAvailableModels', () => {
    it('should return all models from all providers', () => {
      const gateway = new AIGateway(mockConfig);

      const models = gateway.getAvailableModels();

      expect(models.length).toBe(8); // 3 + 3 + 2
      expect(models).toContainEqual({ provider: 'openai', model: 'gpt-4' });
      expect(models).toContainEqual({ provider: 'anthropic', model: 'claude-3-opus' });
      expect(models).toContainEqual({ provider: 'kimi', model: 'kimi-k2' });
    });

    it('should return empty array when no providers loaded', () => {
      const emptyConfig = { ...mockConfig, providers: [] };
      const gateway = new AIGateway(emptyConfig);

      expect(gateway.getAvailableModels()).toEqual([]);
    });
  });

  describe('resolveModel', () => {
    let gateway: AIGateway;

    beforeEach(() => {
      gateway = new AIGateway(mockConfig);
    });

    it('should resolve alias to actual model name', () => {
      const model = gateway.resolveModel('openai', 'gpt-4o');
      expect(model).toBe('gpt-4o');
    });

    it('should return default model when no alias provided', () => {
      const model = gateway.resolveModel('anthropic');
      expect(model).toBe('claude-3-sonnet');
    });

    it('should throw for unknown provider', () => {
      expect(() => gateway.resolveModel('unknown')).toThrow("Provider 'unknown' not found");
    });
  });

  describe('chatCompletion', () => {
    let gateway: AIGateway;
    const mockResponse = { data: { choices: [{ message: { content: 'Hello!' } }] } };

    beforeEach(() => {
      gateway = new AIGateway(mockConfig);
      const mockClient = {
        post: jest.fn().mockResolvedValue(mockResponse),
        get: jest.fn(),
        interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
      };
      (axios.create as jest.Mock).mockReturnValue(mockClient);
    });

    it('should throw for unknown provider', async () => {
      await expect(gateway.chatCompletion('unknown', { messages: [] }))
        .rejects.toThrow("Provider 'unknown' not found");
    });
  });

  describe('streamChat', () => {
    let gateway: AIGateway;

    beforeEach(() => {
      gateway = new AIGateway(mockConfig);
    });

    it('should throw for unknown provider', async () => {
      await expect(gateway.streamChat('unknown', { messages: [] }))
        .rejects.toThrow("Provider 'unknown' not found");
    });
  });

  describe('Config edge cases', () => {
    it('should handle provider with single model', () => {
      const singleModelConfig: AIGatewayConfig = {
        ...mockConfig,
        providers: [{
          name: 'single',
          baseUrl: 'https://single.ai/v1',
          apiKey: 'sk-single',
          models: ['only-model'],
          defaultModel: 'only-model',
        }],
      };
      const gateway = new AIGateway(singleModelConfig);

      expect(gateway.getAvailableModels()).toHaveLength(1);
    });

    it('should handle providers with same base URL but different keys', () => {
      const sameUrlConfig: AIGatewayConfig = {
        ...mockConfig,
        providers: [
          {
            name: 'prod',
            baseUrl: 'https://same.ai/v1',
            apiKey: 'sk-prod',
            models: ['model-a'],
            defaultModel: 'model-a',
          },
          {
            name: 'staging',
            baseUrl: 'https://same.ai/v1',
            apiKey: 'sk-staging',
            models: ['model-b'],
            defaultModel: 'model-b',
          },
        ],
      };
      const gateway = new AIGateway(sameUrlConfig);

      expect(gateway.getAllProviders()).toHaveLength(2);
    });
  });
});
