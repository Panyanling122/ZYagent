/**
 * =============================================================================
 * 模块名称：JWT服务
 * 功能描述：Token签发与验证，支持单设备登录
 * 技术决策引用：#61 #62
 * 创建日期：2026-04-30
 * 最后修改：2026-04-30
 * =============================================================================
 */
export declare class JWTService {
    private static instance;
    private config;
    private constructor();
    static getInstance(): JWTService;
    generateToken(payload: any, expiresIn?: string): string;
    generateWSToken(userId: string, soulId: string): string;
    verifyToken(token: string): any;
    verifyWSToken(token: string): any;
    decode(token: string): any;
}
//# sourceMappingURL=jwt-service.d.ts.map