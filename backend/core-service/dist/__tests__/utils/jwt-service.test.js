"use strict";
/**
 * JWTService Unit Tests
 * Tests token generation, verification, expiration handling, and WS token support
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
// Mock jsonwebtoken module
jest.mock('jsonwebtoken', () => ({
    sign: jest.fn(),
    verify: jest.fn(),
    decode: jest.fn(),
    TokenExpiredError: class TokenExpiredError extends Error {
        name = 'TokenExpiredError';
    },
    JsonWebTokenError: class JsonWebTokenError extends Error {
        name = 'JsonWebTokenError';
    },
}));
// JWTService implementation for testing
class JWTService {
    secret;
    expiresIn;
    constructor(secret = 'test-secret', expiresIn = '24h') {
        this.secret = secret;
        this.expiresIn = expiresIn;
    }
    generateToken(payload) {
        return jsonwebtoken_1.default.sign(payload, this.secret, { expiresIn: this.expiresIn });
    }
    verifyToken(token) {
        try {
            return jsonwebtoken_1.default.verify(token, this.secret);
        }
        catch {
            return null;
        }
    }
    generateWSToken(userId, deviceId) {
        return jsonwebtoken_1.default.sign({ userId, deviceId, type: 'ws' }, this.secret, { expiresIn: '1h' });
    }
    verifyWSToken(token) {
        try {
            const decoded = jsonwebtoken_1.default.verify(token, this.secret);
            if (decoded.type !== 'ws')
                return null;
            return {
                userId: decoded.userId,
                deviceId: decoded.deviceId,
            };
        }
        catch {
            return null;
        }
    }
    decodeToken(token) {
        const decoded = jsonwebtoken_1.default.decode(token);
        return decoded;
    }
    isTokenExpired(token) {
        const decoded = this.decodeToken(token);
        if (!decoded || !decoded.exp)
            return true;
        const now = Math.floor(Date.now() / 1000);
        return decoded.exp < now;
    }
}
describe('JWTService', () => {
    let jwtService;
    const mockSecret = 'openclaw-test-secret-key';
    beforeEach(() => {
        jest.clearAllMocks();
        jwtService = new JWTService(mockSecret, '24h');
    });
    afterEach(() => {
        jest.restoreAllMocks();
    });
    describe('Token Generation', () => {
        it('should generate a token with correct payload', () => {
            const payload = { userId: 'user-123', email: 'test@example.com', role: 'admin' };
            jsonwebtoken_1.default.sign.mockReturnValue('mock-token-123');
            const token = jwtService.generateToken(payload);
            expect(jsonwebtoken_1.default.sign).toHaveBeenCalledWith(payload, mockSecret, { expiresIn: '24h' });
            expect(token).toBe('mock-token-123');
        });
        it('should generate tokens with different secrets', () => {
            const service1 = new JWTService('secret-a');
            const service2 = new JWTService('secret-b');
            const payload = { userId: 'u1' };
            jsonwebtoken_1.default.sign.mockReturnValueOnce('token-a');
            jsonwebtoken_1.default.sign.mockReturnValueOnce('token-b');
            const token1 = service1.generateToken(payload);
            const token2 = service2.generateToken(payload);
            expect(token1).toBe('token-a');
            expect(token2).toBe('token-b');
        });
        it('should support custom expiration time', () => {
            const shortLivedService = new JWTService(mockSecret, '1h');
            const payload = { userId: 'u1' };
            jsonwebtoken_1.default.sign.mockReturnValue('short-token');
            shortLivedService.generateToken(payload);
            expect(jsonwebtoken_1.default.sign).toHaveBeenCalledWith(payload, mockSecret, { expiresIn: '1h' });
        });
    });
    describe('Token Verification', () => {
        it('should verify a valid token and return payload', () => {
            const expectedPayload = { userId: 'user-123', email: 'test@example.com', role: 'admin' };
            jsonwebtoken_1.default.verify.mockReturnValue(expectedPayload);
            const result = jwtService.verifyToken('valid-token');
            expect(jsonwebtoken_1.default.verify).toHaveBeenCalledWith('valid-token', mockSecret);
            expect(result).toEqual(expectedPayload);
        });
        it('should return null for invalid token', () => {
            jsonwebtoken_1.default.verify.mockImplementation(() => {
                throw new (jest.requireMock('jsonwebtoken').JsonWebTokenError)('invalid token');
            });
            const result = jwtService.verifyToken('invalid-token');
            expect(result).toBeNull();
        });
        it('should return null for expired token', () => {
            jsonwebtoken_1.default.verify.mockImplementation(() => {
                throw new (jest.requireMock('jsonwebtoken').TokenExpiredError)('token expired');
            });
            const result = jwtService.verifyToken('expired-token');
            expect(result).toBeNull();
        });
        it('should use correct secret for verification', () => {
            const customService = new JWTService('custom-secret');
            jsonwebtoken_1.default.verify.mockReturnValue({ userId: 'u1' });
            customService.verifyToken('token');
            expect(jsonwebtoken_1.default.verify).toHaveBeenCalledWith('token', 'custom-secret');
        });
    });
    describe('WS Token', () => {
        it('should generate WS token with userId and deviceId', () => {
            jsonwebtoken_1.default.sign.mockReturnValue('ws-token-123');
            const token = jwtService.generateWSToken('user-123', 'device-456');
            expect(jsonwebtoken_1.default.sign).toHaveBeenCalledWith({ userId: 'user-123', deviceId: 'device-456', type: 'ws' }, mockSecret, { expiresIn: '1h' });
            expect(token).toBe('ws-token-123');
        });
        it('should verify WS token and return user info', () => {
            jsonwebtoken_1.default.verify.mockReturnValue({
                userId: 'user-123',
                deviceId: 'device-456',
                type: 'ws',
            });
            const result = jwtService.verifyWSToken('ws-token');
            expect(result).toEqual({ userId: 'user-123', deviceId: 'device-456' });
        });
        it('should return null for non-WS token type', () => {
            jsonwebtoken_1.default.verify.mockReturnValue({
                userId: 'user-123',
                deviceId: 'device-456',
                type: 'http',
            });
            const result = jwtService.verifyWSToken('http-token');
            expect(result).toBeNull();
        });
        it('should return null for expired WS token', () => {
            jsonwebtoken_1.default.verify.mockImplementation(() => {
                throw new (jest.requireMock('jsonwebtoken').TokenExpiredError)('token expired');
            });
            const result = jwtService.verifyWSToken('expired-ws-token');
            expect(result).toBeNull();
        });
    });
    describe('Token Decoding', () => {
        it('should decode token without verification', () => {
            const decodedPayload = { userId: 'user-123', role: 'admin', iat: 1234567890 };
            jsonwebtoken_1.default.decode.mockReturnValue(decodedPayload);
            const result = jwtService.decodeToken('token-to-decode');
            expect(jsonwebtoken_1.default.decode).toHaveBeenCalledWith('token-to-decode');
            expect(result).toEqual(decodedPayload);
        });
        it('should return null for malformed token', () => {
            jsonwebtoken_1.default.decode.mockReturnValue(null);
            const result = jwtService.decodeToken('malformed-token');
            expect(result).toBeNull();
        });
    });
    describe('Token Expiration', () => {
        it('should return false for non-expired token', () => {
            const futureExp = Math.floor(Date.now() / 1000) + 3600;
            jsonwebtoken_1.default.decode.mockReturnValue({ exp: futureExp });
            const result = jwtService.isTokenExpired('valid-token');
            expect(result).toBe(false);
        });
        it('should return true for expired token', () => {
            const pastExp = Math.floor(Date.now() / 1000) - 3600;
            jsonwebtoken_1.default.decode.mockReturnValue({ exp: pastExp });
            const result = jwtService.isTokenExpired('expired-token');
            expect(result).toBe(true);
        });
        it('should return true for token without exp field', () => {
            jsonwebtoken_1.default.decode.mockReturnValue({ userId: '123' });
            const result = jwtService.isTokenExpired('no-exp-token');
            expect(result).toBe(true);
        });
        it('should return true for undecodable token', () => {
            jsonwebtoken_1.default.decode.mockReturnValue(null);
            const result = jwtService.isTokenExpired('undecodable-token');
            expect(result).toBe(true);
        });
    });
    describe('Edge Cases', () => {
        it('should handle empty payload', () => {
            jsonwebtoken_1.default.sign.mockReturnValue('empty-token');
            const token = jwtService.generateToken({});
            expect(jsonwebtoken_1.default.sign).toHaveBeenCalledWith({}, mockSecret, { expiresIn: '24h' });
            expect(token).toBe('empty-token');
        });
        it('should handle token with nested objects', () => {
            const payload = {
                userId: 'u1',
                metadata: { org: 'openclaw', permissions: ['read', 'write'] },
            };
            jsonwebtoken_1.default.sign.mockReturnValue('nested-token');
            jwtService.generateToken(payload);
            expect(jsonwebtoken_1.default.sign).toHaveBeenCalledWith(payload, mockSecret, { expiresIn: '24h' });
        });
        it('should handle numeric expiration value', () => {
            const numericService = new JWTService(mockSecret, 3600);
            jsonwebtoken_1.default.sign.mockReturnValue('numeric-exp-token');
            numericService.generateToken({ userId: 'u1' });
            expect(jsonwebtoken_1.default.sign).toHaveBeenCalledWith({ userId: 'u1' }, mockSecret, { expiresIn: 3600 });
        });
    });
});
//# sourceMappingURL=jwt-service.test.js.map