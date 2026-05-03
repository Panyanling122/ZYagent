/**
 * Config Unit Tests
 * Tests environment variable loading, Zod validation, and default value handling
 */
import { z } from 'zod';
declare const configSchema: z.ZodObject<{
    env: z.ZodDefault<z.ZodEnum<["development", "staging", "production"]>>;
    logLevel: z.ZodDefault<z.ZodEnum<["debug", "info", "warn", "error"]>>;
    gateway: z.ZodDefault<z.ZodObject<{
        port: z.ZodDefault<z.ZodNumber>;
        host: z.ZodDefault<z.ZodString>;
        auth: z.ZodDefault<z.ZodObject<{
            mode: z.ZodDefault<z.ZodEnum<["token", "password", "none", "trusted-proxy"]>>;
            token: z.ZodOptional<z.ZodString>;
            password: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            mode: "token" | "password" | "none" | "trusted-proxy";
            token?: string | undefined;
            password?: string | undefined;
        }, {
            token?: string | undefined;
            mode?: "token" | "password" | "none" | "trusted-proxy" | undefined;
            password?: string | undefined;
        }>>;
        timeoutMs: z.ZodDefault<z.ZodNumber>;
        maxRetries: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        auth: {
            mode: "token" | "password" | "none" | "trusted-proxy";
            token?: string | undefined;
            password?: string | undefined;
        };
        port: number;
        host: string;
        timeoutMs: number;
        maxRetries: number;
    }, {
        auth?: {
            token?: string | undefined;
            mode?: "token" | "password" | "none" | "trusted-proxy" | undefined;
            password?: string | undefined;
        } | undefined;
        port?: number | undefined;
        host?: string | undefined;
        timeoutMs?: number | undefined;
        maxRetries?: number | undefined;
    }>>;
    database: z.ZodDefault<z.ZodObject<{
        url: z.ZodDefault<z.ZodString>;
        poolSize: z.ZodDefault<z.ZodNumber>;
        ssl: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        url: string;
        poolSize: number;
        ssl: boolean;
    }, {
        url?: string | undefined;
        poolSize?: number | undefined;
        ssl?: boolean | undefined;
    }>>;
    ai: z.ZodDefault<z.ZodObject<{
        defaultProvider: z.ZodDefault<z.ZodString>;
        providers: z.ZodDefault<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            baseUrl: z.ZodString;
            apiKey: z.ZodString;
            models: z.ZodArray<z.ZodString, "many">;
            defaultModel: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            name: string;
            baseUrl: string;
            apiKey: string;
            models: string[];
            defaultModel: string;
        }, {
            name: string;
            baseUrl: string;
            apiKey: string;
            models: string[];
            defaultModel: string;
        }>, "many">>;
        maxConcurrentRequests: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        defaultProvider: string;
        providers: {
            name: string;
            baseUrl: string;
            apiKey: string;
            models: string[];
            defaultModel: string;
        }[];
        maxConcurrentRequests: number;
    }, {
        defaultProvider?: string | undefined;
        providers?: {
            name: string;
            baseUrl: string;
            apiKey: string;
            models: string[];
            defaultModel: string;
        }[] | undefined;
        maxConcurrentRequests?: number | undefined;
    }>>;
    memory: z.ZodDefault<z.ZodObject<{
        l1TimeoutMs: z.ZodDefault<z.ZodNumber>;
        l2CronSchedule: z.ZodDefault<z.ZodString>;
        l3EmbeddingModel: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        l1TimeoutMs: number;
        l2CronSchedule: string;
        l3EmbeddingModel: string;
    }, {
        l1TimeoutMs?: number | undefined;
        l2CronSchedule?: string | undefined;
        l3EmbeddingModel?: string | undefined;
    }>>;
    security: z.ZodDefault<z.ZodObject<{
        jwtSecret: z.ZodDefault<z.ZodString>;
        jwtExpiresIn: z.ZodDefault<z.ZodString>;
        ipWhitelist: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        auditEnabled: z.ZodDefault<z.ZodBoolean>;
        singleDeviceLogin: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        jwtSecret: string;
        jwtExpiresIn: string;
        ipWhitelist: string[];
        auditEnabled: boolean;
        singleDeviceLogin: boolean;
    }, {
        jwtSecret?: string | undefined;
        jwtExpiresIn?: string | undefined;
        ipWhitelist?: string[] | undefined;
        auditEnabled?: boolean | undefined;
        singleDeviceLogin?: boolean | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    env: "development" | "production" | "staging";
    database: {
        url: string;
        poolSize: number;
        ssl: boolean;
    };
    logLevel: "debug" | "info" | "warn" | "error";
    gateway: {
        auth: {
            mode: "token" | "password" | "none" | "trusted-proxy";
            token?: string | undefined;
            password?: string | undefined;
        };
        port: number;
        host: string;
        timeoutMs: number;
        maxRetries: number;
    };
    ai: {
        defaultProvider: string;
        providers: {
            name: string;
            baseUrl: string;
            apiKey: string;
            models: string[];
            defaultModel: string;
        }[];
        maxConcurrentRequests: number;
    };
    memory: {
        l1TimeoutMs: number;
        l2CronSchedule: string;
        l3EmbeddingModel: string;
    };
    security: {
        jwtSecret: string;
        jwtExpiresIn: string;
        ipWhitelist: string[];
        auditEnabled: boolean;
        singleDeviceLogin: boolean;
    };
}, {
    env?: "development" | "production" | "staging" | undefined;
    database?: {
        url?: string | undefined;
        poolSize?: number | undefined;
        ssl?: boolean | undefined;
    } | undefined;
    logLevel?: "debug" | "info" | "warn" | "error" | undefined;
    gateway?: {
        auth?: {
            token?: string | undefined;
            mode?: "token" | "password" | "none" | "trusted-proxy" | undefined;
            password?: string | undefined;
        } | undefined;
        port?: number | undefined;
        host?: string | undefined;
        timeoutMs?: number | undefined;
        maxRetries?: number | undefined;
    } | undefined;
    ai?: {
        defaultProvider?: string | undefined;
        providers?: {
            name: string;
            baseUrl: string;
            apiKey: string;
            models: string[];
            defaultModel: string;
        }[] | undefined;
        maxConcurrentRequests?: number | undefined;
    } | undefined;
    memory?: {
        l1TimeoutMs?: number | undefined;
        l2CronSchedule?: string | undefined;
        l3EmbeddingModel?: string | undefined;
    } | undefined;
    security?: {
        jwtSecret?: string | undefined;
        jwtExpiresIn?: string | undefined;
        ipWhitelist?: string[] | undefined;
        auditEnabled?: boolean | undefined;
        singleDeviceLogin?: boolean | undefined;
    } | undefined;
}>;
export type OpenClawConfig = z.infer<typeof configSchema>;
export {};
//# sourceMappingURL=config.test.d.ts.map