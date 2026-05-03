/**
 * Auth Middleware Unit Tests
 * Tests JWT verification, single-device login enforcement, session refresh, and optional auth
 */

import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

// Mock jsonwebtoken
jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(),
  TokenExpiredError: class TokenExpiredError extends Error {
    name = 'TokenExpiredError';
  },
  JsonWebTokenError: class JsonWebTokenError extends Error {
    name = 'JsonWebTokenError';
  },
}));

// Mock db pool
const mockQuery = jest.fn();
jest.mock('../db', () => ({
  pool: {
    query: mockQuery,
  },
}));

// Import after mocks are set up
import { authenticateToken, optionalAuth, refreshDeviceActivity } from '../middleware/auth';
import { pool } from '../db';

describe('Auth Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  const JWT_SECRET = 'test-jwt-secret-key-2026';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = JWT_SECRET;

    mockReq = {
      headers: {},
      ip: '192.168.1.100',
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  describe('refreshDeviceActivity', () => {
    it('should update device session last_active_at', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await refreshDeviceActivity('user-123', 'device-456', '192.168.1.100');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE device_sessions'),
        ['user-123', 'device-456', '192.168.1.100']
      );
    });

    it('should handle null ipAddress', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await refreshDeviceActivity('user-123', 'device-456');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        ['user-123', 'device-456', null]
      );
    });

    it('should not throw on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB connection lost'));

      await expect(refreshDeviceActivity('user-123', 'device-456'))
        .resolves.not.toThrow();
    });

    it('should call query with correct SQL pattern', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await refreshDeviceActivity('user-123', 'device-456', '10.0.0.1');

      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('UPDATE device_sessions');
      expect(sql).toContain('SET last_active_at = NOW()');
      expect(params[0]).toBe('user-123');
      expect(params[1]).toBe('device-456');
      expect(params[2]).toBe('10.0.0.1');
    });
  });

  describe('authenticateToken', () => {
    it('should return 401 when no authorization header', async () => {
      mockReq.headers = {};

      await authenticateToken(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Access token required' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when token format is invalid', async () => {
      mockReq.headers = { authorization: 'invalid-format' };

      await authenticateToken(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Access token required' });
    });

    it('should return 500 when JWT_SECRET is not configured', async () => {
      delete process.env.JWT_SECRET;
      mockReq.headers = { authorization: 'Bearer valid-token' };
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('JWT_SECRET not configured');
      });

      await authenticateToken(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authentication check failed' });
    });

    it('should return 401 when token is expired', async () => {
      mockReq.headers = { authorization: 'Bearer expired-token' };
      const TokenExpiredError = (jwt as any).TokenExpiredError;
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new TokenExpiredError('token expired');
      });

      await authenticateToken(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Token expired' });
    });

    it('should return 401 when token is invalid', async () => {
      mockReq.headers = { authorization: 'Bearer invalid-token' };
      const JsonWebTokenError = (jwt as any).JsonWebTokenError;
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new JsonWebTokenError('invalid signature');
      });

      await authenticateToken(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid token' });
    });

    it('should return 401 when deviceId is missing in token', async () => {
      mockReq.headers = { authorization: 'Bearer no-device-token' };
      (jwt.verify as jest.Mock).mockReturnValue({
        userId: 'user-123',
        email: 'test@example.com',
        role: 'admin',
        // deviceId missing
      });

      await authenticateToken(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid token: deviceId missing' });
    });

    it('should return 401 when session is revoked', async () => {
      mockReq.headers = { authorization: 'Bearer valid-token' };
      (jwt.verify as jest.Mock).mockReturnValue({
        userId: 'user-123',
        email: 'test@example.com',
        role: 'admin',
        deviceId: 'device-456',
      });
      mockQuery.mockResolvedValueOnce({ rowCount: 0 }); // Session revoked

      await authenticateToken(mockReq as Request, mockRes as Response, mockNext);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, is_revoked'),
        ['user-123', 'device-456']
      );
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Session revoked or expired. Please log in again.',
      });
    });

    it('should call next() when token and session are valid', async () => {
      mockReq.headers = { authorization: 'Bearer valid-token' };
      (jwt.verify as jest.Mock).mockReturnValue({
        userId: 'user-123',
        email: 'test@example.com',
        role: 'admin',
        deviceId: 'device-456',
      });
      mockQuery
        .mockResolvedValueOnce({ rowCount: 1 }) // Session valid
        .mockResolvedValueOnce({ rowCount: 1 }); // Activity refresh

      await authenticateToken(mockReq as Request, mockRes as Response, mockNext);

      expect(jwt.verify).toHaveBeenCalledWith('valid-token', JWT_SECRET);
      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        role: 'admin',
        deviceId: 'device-456',
      });
    });

    it('should refresh device activity on valid auth', async () => {
      mockReq.headers = { authorization: 'Bearer valid-token' };
      (jwt.verify as jest.Mock).mockReturnValue({
        userId: 'user-123',
        email: 'test@example.com',
        role: 'user',
        deviceId: 'device-789',
      });
      mockQuery
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 });

      await authenticateToken(mockReq as Request, mockRes as Response, mockNext);

      // Second query should be the activity refresh
      const secondCall = mockQuery.mock.calls[1];
      expect(secondCall[0]).toContain('UPDATE device_sessions');
      expect(secondCall[1]).toEqual(['user-123', 'device-789', '192.168.1.100']);
    });

    it('should handle database error gracefully', async () => {
      mockReq.headers = { authorization: 'Bearer valid-token' };
      (jwt.verify as jest.Mock).mockReturnValue({
        userId: 'user-123',
        email: 'test@example.com',
        role: 'admin',
        deviceId: 'device-456',
      });
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      await authenticateToken(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authentication check failed' });
    });
  });

  describe('optionalAuth', () => {
    it('should call next() when no authorization header', async () => {
      mockReq.headers = {};

      await optionalAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).user).toBeUndefined();
    });

    it('should set user when valid token provided', async () => {
      mockReq.headers = { authorization: 'Bearer valid-token' };
      (jwt.verify as jest.Mock).mockReturnValue({
        userId: 'user-123',
        email: 'test@example.com',
        role: 'user',
        deviceId: 'device-456',
      });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await optionalAuth(mockReq as Request, mockRes as Response, mockNext);

      expect((mockReq as any).user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        role: 'user',
        deviceId: 'device-456',
      });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should call next() without user when token is expired', async () => {
      mockReq.headers = { authorization: 'Bearer expired-token' };
      const TokenExpiredError = (jwt as any).TokenExpiredError;
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new TokenExpiredError('token expired');
      });

      await optionalAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).user).toBeUndefined();
    });

    it('should call next() without user when JWT_SECRET not set', async () => {
      delete process.env.JWT_SECRET;
      mockReq.headers = { authorization: 'Bearer some-token' };

      await optionalAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should not set user when session is revoked', async () => {
      mockReq.headers = { authorization: 'Bearer valid-token' };
      (jwt.verify as jest.Mock).mockReturnValue({
        userId: 'user-123',
        email: 'test@example.com',
        role: 'user',
        deviceId: 'device-456',
      });
      mockQuery.mockResolvedValueOnce({ rowCount: 0 }); // Revoked session

      await optionalAuth(mockReq as Request, mockRes as Response, mockNext);

      expect((mockReq as any).user).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should refresh activity asynchronously when user found', async () => {
      mockReq.headers = { authorization: 'Bearer valid-token' };
      (jwt.verify as jest.Mock).mockReturnValue({
        userId: 'user-123',
        email: 'test@example.com',
        role: 'user',
        deviceId: 'device-456',
      });
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await optionalAuth(mockReq as Request, mockRes as Response, mockNext);

      // Should have called session check
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should handle missing deviceId gracefully', async () => {
      mockReq.headers = { authorization: 'Bearer valid-token' };
      (jwt.verify as jest.Mock).mockReturnValue({
        userId: 'user-123',
        email: 'test@example.com',
        role: 'user',
        // no deviceId
      });

      await optionalAuth(mockReq as Request, mockRes as Response, mockNext);

      expect((mockReq as any).user).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Edge cases', () => {
    it('should handle malformed authorization header', async () => {
      mockReq.headers = { authorization: 'Bearer' }; // No token after Bearer

      await authenticateToken(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    it('should handle authorization with extra spaces', async () => {
      mockReq.headers = { authorization: 'Bearer  valid-token-with-spaces' };
      (jwt.verify as jest.Mock).mockReturnValue({
        userId: 'user-123',
        email: 'test@example.com',
        role: 'admin',
        deviceId: 'device-456',
      });
      mockQuery
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 });

      await authenticateToken(mockReq as Request, mockRes as Response, mockNext);

      // Should use the part after "Bearer " (including the extra space, split handles it)
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle different user roles', async () => {
      const roles = ['admin', 'user', 'moderator', 'viewer'];

      for (const role of roles) {
        jest.clearAllMocks();
        mockReq.headers = { authorization: 'Bearer valid-token' };
        (jwt.verify as jest.Mock).mockReturnValue({
          userId: 'user-123',
          email: 'test@example.com',
          role,
          deviceId: 'device-456',
        });
        mockQuery
          .mockResolvedValueOnce({ rowCount: 1 })
          .mockResolvedValueOnce({ rowCount: 1 });

        await authenticateToken(mockReq as Request, mockRes as Response, mockNext);

        expect((mockReq as any).user.role).toBe(role);
        expect(mockNext).toHaveBeenCalled();
      }
    });

    it('should use request ip when available', async () => {
      mockReq.ip = '10.0.0.50';
      mockReq.headers = { authorization: 'Bearer valid-token' };
      (jwt.verify as jest.Mock).mockReturnValue({
        userId: 'user-123',
        email: 'test@example.com',
        role: 'admin',
        deviceId: 'device-456',
      });
      mockQuery
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 });

      await authenticateToken(mockReq as Request, mockRes as Response, mockNext);

      const refreshCall = mockQuery.mock.calls[1];
      expect(refreshCall[1][2]).toBe('10.0.0.50');
    });
  });
});
