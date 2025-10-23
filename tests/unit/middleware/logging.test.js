'use strict';

const requestLoggingMiddleware = require('../../../src/middleware/logging');
const { sanitizeHeaders, isSensitiveHeader } = requestLoggingMiddleware;
const logger = require('../../../src/utils/logger');

jest.mock('../../../src/utils/logger');

describe('Request Logging Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      method: 'GET',
      path: '/api/test',
      query: { param: 'value' },
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer token123',
        'user-agent': 'Jest Test'
      },
      ip: '127.0.0.1',
      get: jest.fn(header => req.headers[header.toLowerCase()])
    };

    res = {
      statusCode: 200,
      json: jest.fn(function (body) {
        return this;
      }),
      send: jest.fn(function (body) {
        return this;
      }),
      on: jest.fn()
    };

    next = jest.fn();

    logger.info = jest.fn();
  });

  describe('Sensitive Header Detection', () => {
    it('should identify authorization header as sensitive', () => {
      expect(isSensitiveHeader('authorization')).toBe(true);
      expect(isSensitiveHeader('Authorization')).toBe(true);
      expect(isSensitiveHeader('AUTHORIZATION')).toBe(true);
    });

    it('should identify cookie header as sensitive', () => {
      expect(isSensitiveHeader('cookie')).toBe(true);
      expect(isSensitiveHeader('Cookie')).toBe(true);
      expect(isSensitiveHeader('set-cookie')).toBe(true);
    });

    it('should not identify safe headers as sensitive', () => {
      expect(isSensitiveHeader('content-type')).toBe(false);
      expect(isSensitiveHeader('user-agent')).toBe(false);
      expect(isSensitiveHeader('accept')).toBe(false);
    });
  });

  describe('Header Sanitization', () => {
    it('should redact authorization header', () => {
      const headers = {
        'content-type': 'application/json',
        authorization: 'Bearer secret-token'
      };

      const sanitized = sanitizeHeaders(headers);

      expect(sanitized['content-type']).toBe('application/json');
      expect(sanitized.authorization).toBe('[REDACTED]');
    });

    it('should redact multiple sensitive headers', () => {
      const headers = {
        authorization: 'Bearer token',
        cookie: 'session=abc123',
        'x-api-key': 'key123',
        'content-type': 'application/json'
      };

      const sanitized = sanitizeHeaders(headers);

      expect(sanitized.authorization).toBe('[REDACTED]');
      expect(sanitized.cookie).toBe('[REDACTED]');
      expect(sanitized['x-api-key']).toBe('[REDACTED]');
      expect(sanitized['content-type']).toBe('application/json');
    });
  });

  describe('Request Logging', () => {
    it('should log incoming request details', () => {
      requestLoggingMiddleware(req, res, next);

      expect(logger.info).toHaveBeenCalledWith(
        'HTTP Request',
        expect.objectContaining({
          method: 'GET',
          path: '/api/test',
          query: { param: 'value' },
          ip: '127.0.0.1'
        })
      );
    });

    it('should include sanitized headers in request log', () => {
      requestLoggingMiddleware(req, res, next);

      const logCall = logger.info.mock.calls.find(call => call[0] === 'HTTP Request');
      expect(logCall[1].headers.authorization).toBe('[REDACTED]');
      expect(logCall[1].headers['content-type']).toBe('application/json');
    });

    it('should call next middleware', () => {
      requestLoggingMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('Response Logging', () => {
    it('should log response when res.json is called', () => {
      requestLoggingMiddleware(req, res, next);

      res.json({ success: true });

      const responseLogs = logger.info.mock.calls.filter(call => call[0] === 'HTTP Response');
      expect(responseLogs.length).toBeGreaterThan(0);
      expect(responseLogs[0][1]).toMatchObject({
        method: 'GET',
        path: '/api/test',
        statusCode: 200
      });
    });

    it('should include response duration', () => {
      requestLoggingMiddleware(req, res, next);

      res.json({ data: 'test' });

      const responseLog = logger.info.mock.calls.find(call => call[0] === 'HTTP Response');
      expect(responseLog[1].duration).toBeGreaterThanOrEqual(0);
    });

    it('should include content length', () => {
      requestLoggingMiddleware(req, res, next);

      res.json({ data: 'test' });

      const responseLog = logger.info.mock.calls.find(call => call[0] === 'HTTP Response');
      expect(responseLog[1].contentLength).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing headers gracefully', () => {
      req.headers = undefined;
      req.get = jest.fn(() => undefined); // Update mock to handle undefined headers

      expect(() => {
        requestLoggingMiddleware(req, res, next);
      }).not.toThrow();
    });
    it('should handle missing query gracefully', () => {
      req.query = undefined;

      expect(() => {
        requestLoggingMiddleware(req, res, next);
      }).not.toThrow();
    });
  });
});
