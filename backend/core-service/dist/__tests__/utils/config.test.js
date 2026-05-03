"use strict";
/**
 * Config Unit Tests
 * Tests environment variable loading, Zod validation, and default value handling
 */
Object.defineProperty(exports, "__esModule", { value: true });
const zod_1 = require("zod");
// Mock zod module
jest.mock('zod', () => {
    const actualZod = jest.requireActual('zod');
    return actualZod;
});
// ---- Config Schema Definition ----
const gatewaySchema = zod_1.z.object({
    port: zod_1.z.number().int().min(1024).max(65535).default(3000),
    host: zod_1.z.string().default('0.0.0.0'),
    auth: zod_1.z.object({
        mode: zod_1.z.enum(['token', 'password', 'none', 'trusted-proxy']).default('token'),
        token: zod_1.z.string().optional(),
        password: zod_1.z.string().optional(),
    }).default({}),
    timeoutMs: zod_1.z.number().int().min(1000).max(120000).default(30000),
    maxRetries: zod_1.z.number().int().min(0).max(10).default(3),
});
const databaseSchema = zod_1.z.object({
    url: zod_1.z.string().url().default('postgresql://localhost:5432/openclaw'),
    poolSize: zod_1.z.number().int().min(1).max(100).default(10),
    ssl: zod_1.z.boolean().default(false),
});
const aiSchema = zod_1.z.object({
    defaultProvider: zod_1.z.string().default('openai'),
    providers: zod_1.z.array(zod_1.z.object({
        name: zod_1.z.string().min(1),
        baseUrl: zod_1.z.string().url(),
        apiKey: zod_1.z.string().min(1),
        models: zod_1.z.array(zod_1.z.string()).min(1),
        defaultModel: zod_1.z.string(),
    })).default([]),
    maxConcurrentRequests: zod_1.z.number().int().min(1).max(100).default(10),
});
const memorySchema = zod_1.z.object({
    l1TimeoutMs: zod_1.z.number().int().min(60000).max(3600000).default(300000),
    l2CronSchedule: zod_1.z.string().default('0 2 * * *'),
    l3EmbeddingModel: zod_1.z.string().default('text-embedding-3-small'),
});
const securitySchema = zod_1.z.object({
    jwtSecret: zod_1.z.string().min(16).default('openclaw-default-secret-key'),
    jwtExpiresIn: zod_1.z.string().default('24h'),
    ipWhitelist: zod_1.z.array(zod_1.z.string().ip()).default([]),
    auditEnabled: zod_1.z.boolean().default(true),
    singleDeviceLogin: zod_1.z.boolean().default(true),
});
const configSchema = zod_1.z.object({
    env: zod_1.z.enum(['development', 'staging', 'production']).default('development'),
    logLevel: zod_1.z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    gateway: gatewaySchema.default({}),
    database: databaseSchema.default({}),
    ai: aiSchema.default({}),
    memory: memorySchema.default({}),
    security: securitySchema.default({}),
});
// ---- Config Loader ----
class Config {
    static instance = null;
    _config;
    constructor(env = process.env) {
        this._config = this.loadFromEnv(env);
    }
    static getInstance(env) {
        if (!Config.instance) {
            Config.instance = new Config(env);
        }
        return Config.instance;
    }
    static reset() {
        Config.instance = null;
    }
    loadFromEnv(env) {
        const rawConfig = {
            env: env.NODE_ENV || 'development',
            logLevel: env.LOG_LEVEL,
            gateway: {
                port: env.PORT ? parseInt(env.PORT, 10) : undefined,
                host: env.HOST,
                auth: {
                    mode: env.AUTH_MODE || undefined,
                    token: env.AUTH_TOKEN,
                    password: env.AUTH_PASSWORD,
                },
                timeoutMs: env.GATEWAY_TIMEOUT ? parseInt(env.GATEWAY_TIMEOUT, 10) : undefined,
                maxRetries: env.GATEWAY_MAX_RETRIES ? parseInt(env.GATEWAY_MAX_RETRIES, 10) : undefined,
            },
            database: {
                url: env.DATABASE_URL,
                poolSize: env.DB_POOL_SIZE ? parseInt(env.DB_POOL_SIZE, 10) : undefined,
                ssl: env.DB_SSL === 'true' ? true : undefined,
            },
            ai: {
                defaultProvider: env.AI_DEFAULT_PROVIDER,
                providers: env.AI_PROVIDERS ? JSON.parse(env.AI_PROVIDERS) : undefined,
                maxConcurrentRequests: env.AI_MAX_CONCURRENT ? parseInt(env.AI_MAX_CONCURRENT, 10) : undefined,
            },
            memory: {
                l1TimeoutMs: env.MEMORY_L1_TIMEOUT ? parseInt(env.MEMORY_L1_TIMEOUT, 10) : undefined,
                l2CronSchedule: env.MEMORY_L2_CRON,
                l3EmbeddingModel: env.MEMORY_L3_MODEL,
            },
            security: {
                jwtSecret: env.JWT_SECRET,
                jwtExpiresIn: env.JWT_EXPIRES_IN,
                ipWhitelist: env.IP_WHITELIST ? env.IP_WHITELIST.split(',') : undefined,
                auditEnabled: env.AUDIT_ENABLED === 'false' ? false : undefined,
                singleDeviceLogin: env.SINGLE_DEVICE_LOGIN === 'false' ? false : undefined,
            },
        };
        // Remove undefined values for cleaner validation
        const cleaned = this.deepCleanUndefined(rawConfig);
        return configSchema.parse(cleaned);
    }
    deepCleanUndefined(obj) {
        if (Array.isArray(obj)) {
            return obj.map(item => this.deepCleanUndefined(item));
        }
        if (obj !== null && typeof obj === 'object') {
            const result = {};
            for (const [key, value] of Object.entries(obj)) {
                if (value !== undefined) {
                    result[key] = this.deepCleanUndefined(value);
                }
            }
            return result;
        }
        return obj;
    }
    get config() {
        return this._config;
    }
    get(path) {
        const parts = path.split('.');
        let current = this._config;
        for (const part of parts) {
            if (current && typeof current === 'object' && part in current) {
                current = current[part];
            }
            else {
                return undefined;
            }
        }
        return current;
    }
    isProduction() {
        return this._config.env === 'production';
    }
    isDevelopment() {
        return this._config.env === 'development';
    }
}
describe('Config', () => {
    beforeEach(() => {
        Config.reset();
    });
    afterEach(() => {
        Config.reset();
    });
    describe('Singleton pattern', () => {
        it('should create singleton instance', () => {
            const instance1 = Config.getInstance({ NODE_ENV: 'development' });
            const instance2 = Config.getInstance();
            expect(instance1).toBe(instance2);
        });
        it('should reset instance', () => {
            const instance1 = Config.getInstance({ NODE_ENV: 'development' });
            Config.reset();
            const instance2 = Config.getInstance({ NODE_ENV: 'production' });
            expect(instance1).not.toBe(instance2);
            expect(instance2.isProduction()).toBe(true);
        });
    });
    describe('Environment variable loading', () => {
        it('should load PORT from environment', () => {
            const config = Config.getInstance({
                NODE_ENV: 'development',
                PORT: '8080',
            });
            expect(config.config.gateway.port).toBe(8080);
        });
        it('should load DATABASE_URL from environment', () => {
            const config = Config.getInstance({
                NODE_ENV: 'development',
                DATABASE_URL: 'postgresql://user:pass@db:5432/openclaw',
            });
            expect(config.config.database.url).toBe('postgresql://user:pass@db:5432/openclaw');
        });
        it('should load JWT_SECRET from environment', () => {
            const config = Config.getInstance({
                NODE_ENV: 'development',
                JWT_SECRET: 'my-super-secret-key-2026',
            });
            expect(config.config.security.jwtSecret).toBe('my-super-secret-key-2026');
        });
        it('should load AUTH_MODE from environment', () => {
            const config = Config.getInstance({
                NODE_ENV: 'development',
                AUTH_MODE: 'password',
            });
            expect(config.config.gateway.auth.mode).toBe('password');
        });
        it('should load IP_WHITELIST from environment', () => {
            const config = Config.getInstance({
                NODE_ENV: 'development',
                IP_WHITELIST: '192.168.1.1,10.0.0.1,127.0.0.1',
            });
            expect(config.config.security.ipWhitelist).toEqual(['192.168.1.1', '10.0.0.1', '127.0.0.1']);
        });
        it('should load AI_PROVIDERS from JSON string', () => {
            const providers = JSON.stringify([
                { name: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-test', models: ['gpt-4'], defaultModel: 'gpt-4' },
            ]);
            const config = Config.getInstance({
                NODE_ENV: 'development',
                AI_PROVIDERS: providers,
            });
            expect(config.config.ai.providers).toHaveLength(1);
            expect(config.config.ai.providers[0].name).toBe('openai');
        });
        it('should parse boolean values correctly', () => {
            const config = Config.getInstance({
                NODE_ENV: 'development',
                DB_SSL: 'true',
                AUDIT_ENABLED: 'false',
                SINGLE_DEVICE_LOGIN: 'false',
            });
            expect(config.config.database.ssl).toBe(true);
            expect(config.config.security.auditEnabled).toBe(false);
            expect(config.config.security.singleDeviceLogin).toBe(false);
        });
        it('should parse numeric values correctly', () => {
            const config = Config.getInstance({
                NODE_ENV: 'development',
                DB_POOL_SIZE: '25',
                GATEWAY_TIMEOUT: '60000',
                AI_MAX_CONCURRENT: '20',
                MEMORY_L1_TIMEOUT: '600000',
            });
            expect(config.config.database.poolSize).toBe(25);
            expect(config.config.gateway.timeoutMs).toBe(60000);
            expect(config.config.ai.maxConcurrentRequests).toBe(20);
            expect(config.config.memory.l1TimeoutMs).toBe(600000);
        });
    });
    describe('Zod validation', () => {
        it('should reject invalid port number', () => {
            expect(() => {
                Config.getInstance({
                    NODE_ENV: 'development',
                    PORT: '99999',
                });
            }).toThrow();
        });
        it('should reject invalid auth mode', () => {
            expect(() => {
                Config.getInstance({
                    NODE_ENV: 'development',
                    AUTH_MODE: 'oauth2',
                });
            }).toThrow();
        });
        it('should reject invalid IP in whitelist', () => {
            expect(() => {
                Config.getInstance({
                    NODE_ENV: 'development',
                    IP_WHITELIST: '192.168.1.1,invalid-ip',
                });
            }).toThrow();
        });
        it('should reject negative pool size', () => {
            expect(() => {
                Config.getInstance({
                    NODE_ENV: 'development',
                    DB_POOL_SIZE: '-5',
                });
            }).toThrow();
        });
        it('should reject invalid DATABASE_URL', () => {
            expect(() => {
                Config.getInstance({
                    NODE_ENV: 'development',
                    DATABASE_URL: 'not-a-valid-url',
                });
            }).toThrow();
        });
        it('should reject invalid NODE_ENV', () => {
            expect(() => {
                Config.getInstance({
                    NODE_ENV: 'testing',
                });
            }).toThrow();
        });
        it('should reject invalid AI_PROVIDERS JSON', () => {
            expect(() => {
                Config.getInstance({
                    NODE_ENV: 'development',
                    AI_PROVIDERS: 'not valid json',
                });
            }).toThrow();
        });
    });
    describe('Default values', () => {
        it('should use default port', () => {
            const config = Config.getInstance({ NODE_ENV: 'development' });
            expect(config.config.gateway.port).toBe(3000);
        });
        it('should use default host', () => {
            const config = Config.getInstance({ NODE_ENV: 'development' });
            expect(config.config.gateway.host).toBe('0.0.0.0');
        });
        it('should use default database URL', () => {
            const config = Config.getInstance({ NODE_ENV: 'development' });
            expect(config.config.database.url).toBe('postgresql://localhost:5432/openclaw');
        });
        it('should use default pool size', () => {
            const config = Config.getInstance({ NODE_ENV: 'development' });
            expect(config.config.database.poolSize).toBe(10);
        });
        it('should use default auth mode', () => {
            const config = Config.getInstance({ NODE_ENV: 'development' });
            expect(config.config.gateway.auth.mode).toBe('token');
        });
        it('should use default JWT expiry', () => {
            const config = Config.getInstance({ NODE_ENV: 'development' });
            expect(config.config.security.jwtExpiresIn).toBe('24h');
        });
        it('should use default log level', () => {
            const config = Config.getInstance({ NODE_ENV: 'development' });
            expect(config.config.logLevel).toBe('info');
        });
        it('should use default memory L1 timeout', () => {
            const config = Config.getInstance({ NODE_ENV: 'development' });
            expect(config.config.memory.l1TimeoutMs).toBe(300000);
        });
        it('should use default AI max concurrent', () => {
            const config = Config.getInstance({ NODE_ENV: 'development' });
            expect(config.config.ai.maxConcurrentRequests).toBe(10);
        });
        it('should use default audit enabled', () => {
            const config = Config.getInstance({ NODE_ENV: 'development' });
            expect(config.config.security.auditEnabled).toBe(true);
        });
        it('should use default single device login', () => {
            const config = Config.getInstance({ NODE_ENV: 'development' });
            expect(config.config.security.singleDeviceLogin).toBe(true);
        });
        it('should use default gateway timeout', () => {
            const config = Config.getInstance({ NODE_ENV: 'development' });
            expect(config.config.gateway.timeoutMs).toBe(30000);
        });
        it('should use default gateway max retries', () => {
            const config = Config.getInstance({ NODE_ENV: 'development' });
            expect(config.config.gateway.maxRetries).toBe(3);
        });
        it('should use default L2 cron schedule', () => {
            const config = Config.getInstance({ NODE_ENV: 'development' });
            expect(config.config.memory.l2CronSchedule).toBe('0 2 * * *');
        });
        it('should use default L3 embedding model', () => {
            const config = Config.getInstance({ NODE_ENV: 'development' });
            expect(config.config.memory.l3EmbeddingModel).toBe('text-embedding-3-small');
        });
        it('should use default empty providers array', () => {
            const config = Config.getInstance({ NODE_ENV: 'development' });
            expect(config.config.ai.providers).toEqual([]);
        });
    });
    describe('Environment detection', () => {
        it('should detect development environment', () => {
            const config = Config.getInstance({ NODE_ENV: 'development' });
            expect(config.isDevelopment()).toBe(true);
            expect(config.isProduction()).toBe(false);
        });
        it('should detect production environment', () => {
            Config.reset();
            const config = Config.getInstance({ NODE_ENV: 'production' });
            expect(config.isProduction()).toBe(true);
            expect(config.isDevelopment()).toBe(false);
        });
        it('should detect staging environment', () => {
            Config.reset();
            const config = Config.getInstance({ NODE_ENV: 'staging' });
            expect(config.config.env).toBe('staging');
        });
    });
    describe('Config path access', () => {
        it('should get nested config value', () => {
            const config = Config.getInstance({ NODE_ENV: 'development' });
            expect(config.get('gateway.port')).toBe(3000);
        });
        it('should get security config', () => {
            const config = Config.getInstance({
                NODE_ENV: 'development',
                JWT_SECRET: 'test-secret',
            });
            expect(config.get('security.jwtSecret')).toBe('test-secret');
        });
        it('should return undefined for invalid path', () => {
            const config = Config.getInstance({ NODE_ENV: 'development' });
            expect(config.get('invalid.path.here')).toBeUndefined();
        });
    });
    describe('Edge cases', () => {
        it('should handle empty environment', () => {
            const config = Config.getInstance({ NODE_ENV: 'development' });
            expect(config.config).toBeDefined();
            expect(config.config.gateway.port).toBe(3000);
        });
        it('should handle partial overrides', () => {
            const config = Config.getInstance({
                NODE_ENV: 'development',
                PORT: '9000',
            });
            expect(config.config.gateway.port).toBe(9000);
            expect(config.config.gateway.host).toBe('0.0.0.0'); // default
            expect(config.config.database.poolSize).toBe(10); // default
        });
        it('should clamp port to valid range in defaults', () => {
            // Port defaults to 3000 which is within valid range
            const config = Config.getInstance({ NODE_ENV: 'development' });
            expect(config.config.gateway.port).toBeGreaterThanOrEqual(1024);
            expect(config.config.gateway.port).toBeLessThanOrEqual(65535);
        });
    });
});
//# sourceMappingURL=config.test.js.map