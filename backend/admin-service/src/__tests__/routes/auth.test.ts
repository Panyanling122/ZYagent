/**
 * Auth Routes Unit Tests
 * Tests login, logout, me, and refresh endpoints with database mocking
 */

import { Router } from 'express';

// Mock bcryptjs
jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

// Mock jsonwebtoken
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('mock-jwt-token'),
  verify: jest.fn(),
  TokenExpiredError: class TokenExpiredError extends Error {
    name = 'TokenExpiredError';
  },
  JsonWebTokenError: class JsonWebTokenError extends Error {
    name = 'JsonWebTokenError';
  },
}));

// Mock crypto
jest.mock('crypto', () => ({
  randomUUID: jest.fn().mockReturnValue('mock-device-id-12345'),
}));

// Mock pg Pool
const mockPoolQuery = jest.fn();
const mockClientQuery = jest.fn();
const mockClientRelease = jest.fn();
const mockConnect = jest.fn().mockResolvedValue({
  query: mockClientQuery,
  release: mockClientRelease,
});

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    query: mockPoolQuery,
    connect: mockConnect,
  })),
}));

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import authRouter from '../routes/auth';

describe('Auth Routes', () => {
  let router: Router;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.DATABASE_URL = 'postgresql://test@localhost/test';
    router = authRouter;
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
    delete process.env.DATABASE_URL;
  });

  describe('Router structure', () => {
    it('should export a Router instance', () => {
      expect(router).toBeDefined();
      expect(router).toBeInstanceOf(Function); // Express Router is a function
    });
  });

  describe('POST /login', () => {
    it('should return 400 when username is missing', async () => {
      const handler = getRouteHandler(router, 'post', '/login');
      const req = mockRequest({ password: 'password123' });
      const res = mockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Username and password are required',
      });
    });

    it('should return 400 when password is missing', async () => {
      const handler = getRouteHandler(router, 'post', '/login');
      const req = mockRequest({ username: 'admin' });
      const res = mockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Username and password are required',
      });
    });

    it('should return 401 when user not found', async () => {
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rowCount: 0 }) // SELECT user
        .mockResolvedValueOnce({}); // ROLLBACK

      const handler = getRouteHandler(router, 'post', '/login');
      const req = mockRequest({ username: 'nonexistent', password: 'password' });
      const res = mockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid username or password',
      });
    });

    it('should return 401 when password does not match', async () => {
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{
            id: 'user-123',
            username: 'admin',
            password_hash: 'hashed_password',
            is_admin: true,
          }],
        }) // SELECT user
        .mockResolvedValueOnce({}); // ROLLBACK

      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const handler = getRouteHandler(router, 'post', '/login');
      const req = mockRequest({ username: 'admin', password: 'wrongpassword' });
      const res = mockResponse();

      await handler(req, res);

      expect(bcrypt.compare).toHaveBeenCalledWith('wrongpassword', 'hashed_password');
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should login successfully with valid credentials', async () => {
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{
            id: 'user-123',
            username: 'admin',
            password_hash: 'hashed_password',
            is_admin: true,
          }],
        }) // SELECT user
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE revoke sessions
        .mockResolvedValueOnce({ rowCount: 1 }) // INSERT device session
        .mockResolvedValueOnce({}); // COMMIT

      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (jwt.sign as jest.Mock).mockReturnValue('jwt-token-abc123');

      const handler = getRouteHandler(router, 'post', '/login');
      const req = mockRequest({ username: 'admin', password: 'correctpassword' });
      const res = mockResponse();

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          token: 'jwt-token-abc123',
          username: 'admin',
          isAdmin: true,
          deviceId: 'mock-device-id-12345',
        },
      });
    });

    it('should kick previous sessions on login', async () => {
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{
            id: 'user-123',
            username: 'admin',
            password_hash: 'hashed_password',
            is_admin: false,
          }],
        })
        .mockResolvedValueOnce({ rowCount: 2 }) // 2 sessions revoked
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({});

      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const handler = getRouteHandler(router, 'post', '/login');
      const req = mockRequest({ username: 'admin', password: 'password' });
      const res = mockResponse();

      await handler(req, res);

      // Verify revoke was called
      const revokeCall = mockClientQuery.mock.calls.find(
        call => call[0].includes('UPDATE device_sessions SET is_revoked = true')
      );
      expect(revokeCall).toBeDefined();
    });

    it('should use provided deviceId', async () => {
      mockClientQuery
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{
            id: 'user-123',
            username: 'admin',
            password_hash: 'hashed_password',
            is_admin: true,
          }],
        })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({});

      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const handler = getRouteHandler(router, 'post', '/login');
      const req = mockRequest({
        username: 'admin',
        password: 'password',
        deviceId: 'my-custom-device',
      });
      const res = mockResponse();

      await handler(req, res);

      // Check device session insert uses provided deviceId
      const insertCall = mockClientQuery.mock.calls.find(
        call => call[0].includes('INSERT INTO device_sessions')
      );
      expect(insertCall[1]).toContain('my-custom-device');
    });

    it('should handle database error during login', async () => {
      mockConnect.mockRejectedValueOnce(new Error('Connection refused'));

      const handler = getRouteHandler(router, 'post', '/login');
      const req = mockRequest({ username: 'admin', password: 'password' });
      const res = mockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Login failed',
      });
    });

    it('should rollback on error', async () => {
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{
            id: 'user-123',
            username: 'admin',
            password_hash: 'hashed_password',
            is_admin: true,
          }],
        })
        .mockRejectedValueOnce(new Error('Update failed')) // Error during revoke
        .mockResolvedValueOnce({}); // ROLLBACK

      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const handler = getRouteHandler(router, 'post', '/login');
      const req = mockRequest({ username: 'admin', password: 'password' });
      const res = mockResponse();

      await handler(req, res);

      const rollbackCall = mockClientQuery.mock.calls.find(
        call => call[0] === 'ROLLBACK'
      );
      expect(rollbackCall).toBeDefined();
      expect(mockClientRelease).toHaveBeenCalled();
    });
  });

  describe('POST /logout', () => {
    it('should return 401 when no authorization header', async () => {
      const handler = getRouteHandler(router, 'post', '/logout');
      const req = mockRequest({}, {});
      const res = mockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should logout successfully', async () => {
      (jwt.verify as jest.Mock).mockReturnValue({
        userId: 'user-123',
        deviceId: 'device-456',
      });
      mockPoolQuery.mockResolvedValue({ rowCount: 1 });

      const handler = getRouteHandler(router, 'post', '/logout');
      const req = mockRequest({}, { authorization: 'Bearer valid-token' });
      const res = mockResponse();

      await handler(req, res);

      expect(mockPoolQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE device_sessions SET is_revoked = true'),
        ['user-123', 'device-456']
      );
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('should return 401 for invalid token', async () => {
      const JsonWebTokenError = (jwt as any).JsonWebTokenError;
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new JsonWebTokenError('invalid');
      });

      const handler = getRouteHandler(router, 'post', '/logout');
      const req = mockRequest({}, { authorization: 'Bearer invalid' });
      const res = mockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return 401 for expired token', async () => {
      const TokenExpiredError = (jwt as any).TokenExpiredError;
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new TokenExpiredError('expired');
      });

      const handler = getRouteHandler(router, 'post', '/logout');
      const req = mockRequest({}, { authorization: 'Bearer expired' });
      const res = mockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should handle database error during logout', async () => {
      (jwt.verify as jest.Mock).mockReturnValue({
        userId: 'user-123',
        deviceId: 'device-456',
      });
      mockPoolQuery.mockRejectedValue(new Error('DB error'));

      const handler = getRouteHandler(router, 'post', '/logout');
      const req = mockRequest({}, { authorization: 'Bearer token' });
      const res = mockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('GET /me', () => {
    it('should return 401 when no authorization header', async () => {
      const handler = getRouteHandler(router, 'get', '/me');
      const req = mockRequest({}, {});
      const res = mockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should return user info', async () => {
      (jwt.verify as jest.Mock).mockReturnValue({
        userId: 'user-123',
        username: 'admin',
        isAdmin: true,
      });

      const handler = getRouteHandler(router, 'get', '/me');
      const req = mockRequest({}, { authorization: 'Bearer valid-token' });
      const res = mockResponse();

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          userId: 'user-123',
          username: 'admin',
          isAdmin: true,
        },
      });
    });

    it('should return 401 for invalid token', async () => {
      const JsonWebTokenError = (jwt as any).JsonWebTokenError;
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new JsonWebTokenError('invalid');
      });

      const handler = getRouteHandler(router, 'get', '/me');
      const req = mockRequest({}, { authorization: 'Bearer bad' });
      const res = mockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('POST /refresh', () => {
    it('should return 401 when no authorization header', async () => {
      const handler = getRouteHandler(router, 'post', '/refresh');
      const req = mockRequest({}, {});
      const res = mockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should refresh token when session is valid', async () => {
      (jwt.verify as jest.Mock).mockReturnValue({
        userId: 'user-123',
        username: 'admin',
        isAdmin: true,
        deviceId: 'device-456',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      (jwt.sign as jest.Mock).mockReturnValue('new-refreshed-token');
      mockPoolQuery.mockResolvedValue({ rowCount: 1 });

      const handler = getRouteHandler(router, 'post', '/refresh');
      const req = mockRequest({}, { authorization: 'Bearer old-token' });
      const res = mockResponse();

      await handler(req, res);

      expect(jwt.verify).toHaveBeenCalledWith('old-token', 'test-jwt-secret', { ignoreExpiration: true });
      expect(jwt.sign).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { token: 'new-refreshed-token' },
      });
    });

    it('should return 401 when session is revoked', async () => {
      (jwt.verify as jest.Mock).mockReturnValue({
        userId: 'user-123',
        username: 'admin',
        isAdmin: true,
        deviceId: 'device-456',
      });
      mockPoolQuery.mockResolvedValue({ rowCount: 0 }); // Revoked

      const handler = getRouteHandler(router, 'post', '/refresh');
      const req = mockRequest({}, { authorization: 'Bearer token' });
      const res = mockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Session revoked or expired',
      });
    });

    it('should return 401 for invalid token', async () => {
      const JsonWebTokenError = (jwt as any).JsonWebTokenError;
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new JsonWebTokenError('invalid');
      });

      const handler = getRouteHandler(router, 'post', '/refresh');
      const req = mockRequest({}, { authorization: 'Bearer bad' });
      const res = mockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should handle database error during refresh', async () => {
      (jwt.verify as jest.Mock).mockReturnValue({
        userId: 'user-123',
        username: 'admin',
        isAdmin: true,
        deviceId: 'device-456',
      });
      mockPoolQuery.mockRejectedValue(new Error('DB down'));

      const handler = getRouteHandler(router, 'post', '/refresh');
      const req = mockRequest({}, { authorization: 'Bearer token' });
      const res = mockResponse();

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});

// ---- Test Helpers ----

function mockRequest(body: Record<string, unknown> = {}, headers: Record<string, string> = {}): any {
  return {
    body,
    headers,
    ip: '127.0.0.1',
  };
}

function mockResponse(): any {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  };
}

function getRouteHandler(router: Router, method: string, path: string): (...args: any[]) => Promise<void> {
  // Access the router's internal stack to find the route handler
  const stack = (router as any).stack;
  for (const layer of stack) {
    if (layer.route) {
      const route = layer.route;
      if (route.path === path && route.methods[method]) {
        // Return the last handler (main handler, after any middleware)
        const handlers = route.stack;
        return handlers[handlers.length - 1].handle.bind({});
      }
    }
  }
  // Fallback: return a no-op if route not found
  return async () => { throw new Error(`Route ${method.toUpperCase()} ${path} not found`); };
}
