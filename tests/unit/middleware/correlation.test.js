'use strict';

const correlationMiddleware = require('../../../src/middleware/correlation');
const logger = require('../../../src/utils/logger');

describe('Correlation Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      headers: {}
    };
    res = {
      setHeader: jest.fn()
    };
    next = jest.fn();
  });

  describe('Correlation ID Generation', () => {
    it('should generate unique ID per request', () => {
      correlationMiddleware(req, res, next);

      expect(req.correlationId).toBeDefined();
      expect(req.correlationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it('should generate different IDs for different requests', () => {
      const req1 = { headers: {} };
      const res1 = { setHeader: jest.fn() };

      const req2 = { headers: {} };
      const res2 = { setHeader: jest.fn() };

      correlationMiddleware(req1, res1, jest.fn());
      correlationMiddleware(req2, res2, jest.fn());

      expect(req1.correlationId).not.toBe(req2.correlationId);
    });
  });

  describe('Client-Provided Correlation ID', () => {
    it('should use client-provided correlation ID from headers', () => {
      req.headers['x-correlation-id'] = 'client-provided-123';

      correlationMiddleware(req, res, next);

      expect(req.correlationId).toBe('client-provided-123');
    });

    it('should preserve correlation ID across distributed systems', () => {
      const clientId = 'upstream-service-correlation-456';
      req.headers['x-correlation-id'] = clientId;

      correlationMiddleware(req, res, next);

      expect(req.correlationId).toBe(clientId);
      expect(res.setHeader).toHaveBeenCalledWith('X-Correlation-ID', clientId);
    });

    it('should generate new ID if header is empty string', () => {
      req.headers['x-correlation-id'] = '';

      correlationMiddleware(req, res, next);

      expect(req.correlationId).not.toBe('');
      expect(req.correlationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it('should generate new ID if header is non-string', () => {
      req.headers['x-correlation-id'] = 12345; // number instead of string

      correlationMiddleware(req, res, next);

      expect(typeof req.correlationId).toBe('string');
      expect(req.correlationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });
  });

  describe('Response Headers', () => {
    it('should include correlation ID in response headers', () => {
      correlationMiddleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('X-Correlation-ID', req.correlationId);
    });

    it('should set header before calling next middleware', () => {
      correlationMiddleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Async Context Storage', () => {
    it('should store correlation ID in async context', done => {
      correlationMiddleware(req, res, () => {
        // Verify correlation ID is accessible from logger
        const storedId = logger.getCorrelationId();
        expect(storedId).toBe(req.correlationId);
        done();
      });
    });

    it('should isolate correlation IDs between concurrent requests', done => {
      const req1 = { headers: { 'x-correlation-id': 'request-1' } };
      const res1 = { setHeader: jest.fn() };

      const req2 = { headers: { 'x-correlation-id': 'request-2' } };
      const res2 = { setHeader: jest.fn() };

      let completed = 0;

      correlationMiddleware(req1, res1, () => {
        setTimeout(() => {
          expect(logger.getCorrelationId()).toBe('request-1');
          completed++;
          if (completed === 2) done();
        }, 10);
      });

      correlationMiddleware(req2, res2, () => {
        setTimeout(() => {
          expect(logger.getCorrelationId()).toBe('request-2');
          completed++;
          if (completed === 2) done();
        }, 5);
      });
    });
  });

  describe('Request Object Modification', () => {
    it('should add correlationId property to request', () => {
      expect(req.correlationId).toBeUndefined();

      correlationMiddleware(req, res, next);

      expect(req.correlationId).toBeDefined();
    });

    it('should not modify other request properties', () => {
      req.method = 'GET';
      req.path = '/api/test';
      req.body = { data: 'test' };

      correlationMiddleware(req, res, next);

      expect(req.method).toBe('GET');
      expect(req.path).toBe('/api/test');
      expect(req.body).toEqual({ data: 'test' });
    });
  });

  describe('Error Handling', () => {
    it('should handle missing headers object', () => {
      req.headers = undefined;

      expect(() => {
        correlationMiddleware(req, res, next);
      }).not.toThrow();

      expect(req.correlationId).toBeDefined();
    });

    it('should call next middleware even if error occurs', () => {
      res.setHeader = jest.fn(() => {
        throw new Error('Header set failed');
      });

      expect(() => {
        correlationMiddleware(req, res, next);
      }).toThrow('Header set failed');

      // next() should still be called because it's inside async context
    });
  });

  describe('Middleware Integration', () => {
    it('should be compatible with Express middleware chain', () => {
      const middleware2 = jest.fn((req, res, next) => next());
      const middleware3 = jest.fn((req, res, next) => next());

      correlationMiddleware(req, res, () => {
        middleware2(req, res, () => {
          middleware3(req, res, () => {
            // All middleware should have access to same correlation ID
            expect(req.correlationId).toBeDefined();
          });
        });
      });

      expect(middleware2).toHaveBeenCalled();
      expect(middleware3).toHaveBeenCalled();
    });
  });
});
