/**
 * JWTService Unit Tests
 * Tests token generation, verification, expiration handling, and WS token support
 */

import jwt from 'jsonwebtoken';

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
  private secret: string;
  private expiresIn: string | number;

  constructor(secret: string = 'test-secret', expiresIn: string | number = '24h') {
    this.secret = secret;
    this.expiresIn = expiresIn;
  }

  generateToken(payload: Record<string, unknown>): string {
    return jwt.sign(payload, this.secret, { expiresIn: this.expiresIn });
  }

  verifyToken(token: string): Record<string, unknown> | null {
    try {
      return jwt.verify(token, this.secret) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  generateWSToken(userId: string, deviceId: string): string {
    return jwt.sign(
      { userId, deviceId, type: 'ws' },
      this.secret,
      { expiresIn: '1h' }
    );
  }

  verifyWSToken(token: string): { userId: string; deviceId: string } | null {
    try {
      const decoded = jwt.verify(token, this.secret) as Record<string, unknown>;
      if (decoded.type !== 'ws') return null;
      return {
        userId: decoded.userId as string,
        deviceId: decoded.deviceId as string,
      };
    } catch {
      return null;
    }
  }

  decodeToken(token: string): Record<string, unknown> | null {
    const decoded = jwt.decode(token);
    return decoded as Record<string, unknown> | null;
  }

  isTokenExpired(token: string): boolean {
    const decoded = this.decodeToken(token);
    if (!decoded || !decoded.exp) return true;
    const now = Math.floor(Date.now() / 1000);
    return (decoded.exp as number) < now;
  }
}

describe('JWTService', () => {
  let jwtService: JWTService;
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
      (jwt.sign as jest.Mock).mockReturnValue('mock-token-123');

      const token = jwtService.generateToken(payload);

      expect(jwt.sign).toHaveBeenCalledWith(payload, mockSecret, { expiresIn: '24h' });
      expect(token).toBe('mock-token-123');
    });

    it('should generate tokens with different secrets', () => {
      const service1 = new JWTService('secret-a');
      const service2 = new JWTService('secret-b');
      const payload = { userId: 'u1' };

      (jwt.sign as jest.Mock).mockReturnValueOnce('token-a');
      (jwt.sign as jest.Mock).mockReturnValueOnce('token-b');

      const token1 = service1.generateToken(payload);
      const token2 = service2.generateToken(payload);

      expect(token1).toBe('token-a');
      expect(token2).toBe('token-b');
    });

    it('should support custom expiration time', () => {
      const shortLivedService = new JWTService(mockSecret, '1h');
      const payload = { userId: 'u1' };

      (jwt.sign as jest.Mock).mockReturnValue('short-token');

      shortLivedService.generateToken(payload);

      expect(jwt.sign).toHaveBeenCalledWith(payload, mockSecret, { expiresIn: '1h' });
    });
  });

  describe('Token Verification', () => {
    it('should verify a valid token and return payload', () => {
      const expectedPayload = { userId: 'user-123', email: 'test@example.com', role: 'admin' };
      (jwt.verify as jest.Mock).mockReturnValue(expectedPayload);

      const result = jwtService.verifyToken('valid-token');

      expect(jwt.verify).toHaveBeenCalledWith('valid-token', mockSecret);
      expect(result).toEqual(expectedPayload);
    });

    it('should return null for invalid token', () => {
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new (jest.requireMock('jsonwebtoken').JsonWebTokenError)('invalid token');
      });

      const result = jwtService.verifyToken('invalid-token');

      expect(result).toBeNull();
    });

    it('should return null for expired token', () => {
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new (jest.requireMock('jsonwebtoken').TokenExpiredError)('token expired');
      });

      const result = jwtService.verifyToken('expired-token');

      expect(result).toBeNull();
    });

    it('should use correct secret for verification', () => {
      const customService = new JWTService('custom-secret');
      (jwt.verify as jest.Mock).mockReturnValue({ userId: 'u1' });

      customService.verifyToken('token');

      expect(jwt.verify).toHaveBeenCalledWith('token', 'custom-secret');
    });
  });

  describe('WS Token', () => {
    it('should generate WS token with userId and deviceId', () => {
      (jwt.sign as jest.Mock).mockReturnValue('ws-token-123');

      const token = jwtService.generateWSToken('user-123', 'device-456');

      expect(jwt.sign).toHaveBeenCalledWith(
        { userId: 'user-123', deviceId: 'device-456', type: 'ws' },
        mockSecret,
        { expiresIn: '1h' }
      );
      expect(token).toBe('ws-token-123');
    });

    it('should verify WS token and return user info', () => {
      (jwt.verify as jest.Mock).mockReturnValue({
        userId: 'user-123',
        deviceId: 'device-456',
        type: 'ws',
      });

      const result = jwtService.verifyWSToken('ws-token');

      expect(result).toEqual({ userId: 'user-123', deviceId: 'device-456' });
    });

    it('should return null for non-WS token type', () => {
      (jwt.verify as jest.Mock).mockReturnValue({
        userId: 'user-123',
        deviceId: 'device-456',
        type: 'http',
      });

      const result = jwtService.verifyWSToken('http-token');

      expect(result).toBeNull();
    });

    it('should return null for expired WS token', () => {
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new (jest.requireMock('jsonwebtoken').TokenExpiredError)('token expired');
      });

      const result = jwtService.verifyWSToken('expired-ws-token');

      expect(result).toBeNull();
    });
  });

  describe('Token Decoding', () => {
    it('should decode token without verification', () => {
      const decodedPayload = { userId: 'user-123', role: 'admin', iat: 1234567890 };
      (jwt.decode as jest.Mock).mockReturnValue(decodedPayload);

      const result = jwtService.decodeToken('token-to-decode');

      expect(jwt.decode).toHaveBeenCalledWith('token-to-decode');
      expect(result).toEqual(decodedPayload);
    });

    it('should return null for malformed token', () => {
      (jwt.decode as jest.Mock).mockReturnValue(null);

      const result = jwtService.decodeToken('malformed-token');

      expect(result).toBeNull();
    });
  });

  describe('Token Expiration', () => {
    it('should return false for non-expired token', () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      (jwt.decode as jest.Mock).mockReturnValue({ exp: futureExp });

      const result = jwtService.isTokenExpired('valid-token');

      expect(result).toBe(false);
    });

    it('should return true for expired token', () => {
      const pastExp = Math.floor(Date.now() / 1000) - 3600;
      (jwt.decode as jest.Mock).mockReturnValue({ exp: pastExp });

      const result = jwtService.isTokenExpired('expired-token');

      expect(result).toBe(true);
    });

    it('should return true for token without exp field', () => {
      (jwt.decode as jest.Mock).mockReturnValue({ userId: '123' });

      const result = jwtService.isTokenExpired('no-exp-token');

      expect(result).toBe(true);
    });

    it('should return true for undecodable token', () => {
      (jwt.decode as jest.Mock).mockReturnValue(null);

      const result = jwtService.isTokenExpired('undecodable-token');

      expect(result).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty payload', () => {
      (jwt.sign as jest.Mock).mockReturnValue('empty-token');

      const token = jwtService.generateToken({});

      expect(jwt.sign).toHaveBeenCalledWith({}, mockSecret, { expiresIn: '24h' });
      expect(token).toBe('empty-token');
    });

    it('should handle token with nested objects', () => {
      const payload = {
        userId: 'u1',
        metadata: { org: 'openclaw', permissions: ['read', 'write'] },
      };
      (jwt.sign as jest.Mock).mockReturnValue('nested-token');

      jwtService.generateToken(payload);

      expect(jwt.sign).toHaveBeenCalledWith(payload, mockSecret, { expiresIn: '24h' });
    });

    it('should handle numeric expiration value', () => {
      const numericService = new JWTService(mockSecret, 3600);
      (jwt.sign as jest.Mock).mockReturnValue('numeric-exp-token');

      numericService.generateToken({ userId: 'u1' });

      expect(jwt.sign).toHaveBeenCalledWith({ userId: 'u1' }, mockSecret, { expiresIn: 3600 });
    });
  });
});
