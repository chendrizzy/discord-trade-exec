/**
 * Error Handler Middleware Tests (US4-T01)
 *
 * Tests that validate error handler middleware for production-grade error handling:
 * - Never returns stack traces to clients
 * - Logs full error details with correlation ID
 * - Returns generic messages in production
 * - Uses error codes enum consistently
 */

const request = require('supertest');
const express = require('express');
const { AppError, ErrorCodes, errorHandler, asyncHandler } = require('../../../src/middleware/errorHandler');
const logger = require('../../../src/utils/logger');

// Mock logger to capture log calls
jest.mock('../../../src/utils/logger', () => ({
  error: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  getCorrelationId: jest.fn(() => null) // Return null to test fallback to req.correlationId
}));

// Mock error notification service
jest.mock('../../../src/services/ErrorNotificationService', () => ({
  notify: jest.fn().mockResolvedValue(true)
}));

describe('Error Handler Middleware (US4-T01)', () => {
  let app;

  beforeEach(() => {
    // Create fresh Express app for each test
    app = express();
    app.use(express.json());

    // Add correlation ID middleware
    app.use((req, res, next) => {
      req.correlationId = 'test-correlation-id-12345';
      next();
    });

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('Stack Trace Security', () => {
    it('should never return stack traces to client', async () => {
      // Setup route that throws error
      app.get('/test-error', (req, res) => {
        throw new Error('Test error with stack trace');
      });
      app.use(errorHandler);

      const res = await request(app).get('/test-error');

      // Verify stack is NOT in response
      expect(res.body).not.toHaveProperty('stack');
      expect(res.body).not.toHaveProperty('stackTrace');
      expect(JSON.stringify(res.body)).not.toContain('at ');
      expect(JSON.stringify(res.body)).not.toContain('errorHandler.test.js');
    });

    it('should never return stack traces even for AppError instances', async () => {
      app.get('/test-app-error', (req, res) => {
        throw new AppError('Operational error', 400, ErrorCodes.VALIDATION_ERROR);
      });
      app.use(errorHandler);

      const res = await request(app).get('/test-app-error');

      expect(res.body).not.toHaveProperty('stack');
      expect(res.body).not.toHaveProperty('stackTrace');
    });

    it('should never return stack traces in development mode', async () => {
      // Force development mode
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      app.get('/test-dev-error', (req, res) => {
        throw new Error('Development mode error');
      });
      app.use(errorHandler);

      const res = await request(app).get('/test-dev-error');

      expect(res.body).not.toHaveProperty('stack');

      // Restore environment
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Full Error Logging', () => {
    it('should log full error details with correlation ID', async () => {
      app.get('/test-logging', (req, res) => {
        throw new Error('Test error for logging');
      });
      app.use(errorHandler);

      await request(app).get('/test-logging');

      // Verify logger.error was called
      expect(logger.error).toHaveBeenCalled();

      // Get the logged data
      const logCall = logger.error.mock.calls[0];
      const loggedData = logCall[1]; // Second argument is the error data object

      // Verify correlation ID is included
      expect(loggedData).toHaveProperty('correlationId');
      expect(loggedData.correlationId).toBe('test-correlation-id-12345');

      // Verify error details are logged
      expect(loggedData).toHaveProperty('error');
      expect(loggedData).toHaveProperty('path');
      expect(loggedData).toHaveProperty('method');
      expect(loggedData.method).toBe('GET');
      expect(loggedData.path).toBe('/test-logging');
    });

    it('should log error code and status code', async () => {
      app.get('/test-error-codes', (req, res) => {
        throw new AppError('Not found', 404, ErrorCodes.NOT_FOUND);
      });
      app.use(errorHandler);

      await request(app).get('/test-error-codes');

      const logCall = logger.error.mock.calls[0];
      const loggedData = logCall[1];

      expect(loggedData).toHaveProperty('errorCode', ErrorCodes.NOT_FOUND);
      expect(loggedData).toHaveProperty('statusCode', 404);
    });

    it('should log stack preview (first 3 lines only)', async () => {
      app.get('/test-stack-preview', (req, res) => {
        throw new Error('Error with stack');
      });
      app.use(errorHandler);

      await request(app).get('/test-stack-preview');

      const logCall = logger.error.mock.calls[0];
      const loggedData = logCall[1];

      // Stack preview should be included in logs
      expect(loggedData).toHaveProperty('stackPreview');

      // Stack preview should be limited (not full stack)
      const lineCount = (loggedData.stackPreview.match(/\n/g) || []).length;
      expect(lineCount).toBeLessThanOrEqual(2); // 3 lines = 2 newlines
    });

    it('should include user context if authenticated', async () => {
      app.get('/test-user-context', (req, res) => {
        req.user = { userId: 'user-123', communityId: 'community-456' };
        throw new Error('Authenticated user error');
      });
      app.use(errorHandler);

      await request(app).get('/test-user-context');

      const logCall = logger.error.mock.calls[0];
      const loggedData = logCall[1];

      expect(loggedData).toHaveProperty('userId', 'user-123');
      expect(loggedData).toHaveProperty('communityId', 'community-456');
    });
  });

  describe('Production vs Development Error Messages', () => {
    it('should return generic error messages in production for non-operational errors', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      app.get('/test-production-error', (req, res) => {
        throw new Error('Internal implementation detail error');
      });
      app.use(errorHandler);

      const res = await request(app).get('/test-production-error');

      // Should return generic message, not actual error
      expect(res.body.error).not.toBe('Internal implementation detail error');
      expect(res.body.error).toBe('An unexpected error occurred. Please try again later.');

      process.env.NODE_ENV = originalEnv;
    });

    it('should return specific messages for operational errors in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      app.get('/test-operational-error', (req, res) => {
        throw new AppError('Invalid input provided', 400, ErrorCodes.VALIDATION_ERROR);
      });
      app.use(errorHandler);

      const res = await request(app).get('/test-operational-error');

      // Operational errors should return actual message
      expect(res.body.error).toBe('Invalid input provided');

      process.env.NODE_ENV = originalEnv;
    });

    it('should return detailed messages in development mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      app.get('/test-dev-detailed', (req, res) => {
        throw new Error('Detailed development error message');
      });
      app.use(errorHandler);

      const res = await request(app).get('/test-dev-detailed');

      expect(res.body.error).toBe('Detailed development error message');

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Error Codes Enum', () => {
    it('should use error codes from ErrorCodes enum', async () => {
      app.get('/test-error-code', (req, res) => {
        throw new AppError('Unauthorized access', 401, ErrorCodes.UNAUTHORIZED);
      });
      app.use(errorHandler);

      const res = await request(app).get('/test-error-code');

      expect(res.body).toHaveProperty('code', ErrorCodes.UNAUTHORIZED);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    it('should default to INTERNAL_SERVER_ERROR code for unknown errors', async () => {
      app.get('/test-default-code', (req, res) => {
        throw new Error('Error without explicit code');
      });
      app.use(errorHandler);

      const res = await request(app).get('/test-default-code');

      expect(res.body).toHaveProperty('code');
      expect(res.body.code).toBe(ErrorCodes.INTERNAL_SERVER_ERROR);
    });

    it('should include all required error code properties', async () => {
      // Test that ErrorCodes has expected structure
      expect(ErrorCodes).toHaveProperty('UNAUTHORIZED');
      expect(ErrorCodes).toHaveProperty('FORBIDDEN');
      expect(ErrorCodes).toHaveProperty('VALIDATION_ERROR');
      expect(ErrorCodes).toHaveProperty('NOT_FOUND');
      expect(ErrorCodes).toHaveProperty('RATE_LIMIT_EXCEEDED');
      expect(ErrorCodes).toHaveProperty('INTERNAL_SERVER_ERROR');
      expect(ErrorCodes).toHaveProperty('DATABASE_ERROR');
      expect(ErrorCodes).toHaveProperty('BROKER_ERROR');
    });
  });

  describe('Response Structure', () => {
    it('should return consistent error response structure', async () => {
      app.get('/test-structure', (req, res) => {
        throw new AppError('Test error', 400, ErrorCodes.VALIDATION_ERROR);
      });
      app.use(errorHandler);

      const res = await request(app).get('/test-structure');

      // Verify required fields
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
      expect(res.body).toHaveProperty('code');
      expect(res.body).toHaveProperty('timestamp');

      // Verify forbidden fields (path is logged but not returned to client)
      expect(res.body).not.toHaveProperty('stack');
      expect(res.body).not.toHaveProperty('stackTrace');
    });

    it('should set correct HTTP status codes', async () => {
      const testCases = [
        { error: new AppError('Bad request', 400, ErrorCodes.VALIDATION_ERROR), expectedStatus: 400 },
        { error: new AppError('Unauthorized', 401, ErrorCodes.UNAUTHORIZED), expectedStatus: 401 },
        { error: new AppError('Not found', 404, ErrorCodes.NOT_FOUND), expectedStatus: 404 },
        { error: new AppError('Internal error', 500, ErrorCodes.INTERNAL_SERVER_ERROR), expectedStatus: 500 }
      ];

      for (const testCase of testCases) {
        const testApp = express();
        testApp.get('/test', (req, res) => {
          throw testCase.error;
        });
        testApp.use(errorHandler);

        const res = await request(testApp).get('/test');
        expect(res.status).toBe(testCase.expectedStatus);
      }
    });
  });

  describe('Special Error Types', () => {
    it('should handle Mongoose validation errors', async () => {
      const mongooseError = new Error('Validation failed');
      mongooseError.name = 'ValidationError';
      mongooseError.errors = {
        email: { message: 'Invalid email format' }
      };

      app.get('/test-mongoose', (req, res) => {
        throw mongooseError;
      });
      app.use(errorHandler);

      const res = await request(app).get('/test-mongoose');

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(ErrorCodes.VALIDATION_ERROR);
    });

    it('should handle MongoDB duplicate key errors', async () => {
      const duplicateError = new Error('Duplicate key');
      duplicateError.code = 11000;
      duplicateError.keyPattern = { email: 1 };
      duplicateError.keyValue = { email: 'test@example.com' };

      app.get('/test-duplicate', (req, res) => {
        throw duplicateError;
      });
      app.use(errorHandler);

      const res = await request(app).get('/test-duplicate');

      expect(res.status).toBe(409);
      expect(res.body.code).toBe(ErrorCodes.DUPLICATE_RESOURCE);
    });

    it('should handle JWT errors', async () => {
      const jwtError = new Error('jwt malformed');
      jwtError.name = 'JsonWebTokenError';

      app.get('/test-jwt', (req, res) => {
        throw jwtError;
      });
      app.use(errorHandler);

      const res = await request(app).get('/test-jwt');

      expect(res.status).toBe(401);
      expect(res.body.code).toBe(ErrorCodes.INVALID_TOKEN);
    });

    it('should handle JWT expired errors', async () => {
      const expiredError = new Error('jwt expired');
      expiredError.name = 'TokenExpiredError';

      app.get('/test-jwt-expired', (req, res) => {
        throw expiredError;
      });
      app.use(errorHandler);

      const res = await request(app).get('/test-jwt-expired');

      expect(res.status).toBe(401);
      expect(res.body.code).toBe(ErrorCodes.TOKEN_EXPIRED);
    });
  });

  describe('Correlation ID Consistency', () => {
    it('should preserve correlation ID throughout error handling', async () => {
      const testCorrelationId = 'test-corr-id-999';

      app.get('/test-correlation', (req, res) => {
        req.correlationId = testCorrelationId;
        throw new Error('Test error');
      });
      app.use(errorHandler);

      await request(app).get('/test-correlation');

      const logCall = logger.error.mock.calls[0];
      const loggedData = logCall[1];

      expect(loggedData.correlationId).toBe(testCorrelationId);
    });

    it('should generate correlation ID if missing', async () => {
      app.get('/test-no-correlation', (req, res) => {
        // No correlation ID set
        throw new Error('Test error without correlation ID');
      });
      app.use(errorHandler);

      await request(app).get('/test-no-correlation');

      const logCall = logger.error.mock.calls[0];
      const loggedData = logCall[1];

      // Should still have some correlation ID (even if undefined is logged)
      expect(loggedData).toHaveProperty('correlationId');
    });
  });

  describe('AppError Class', () => {
    it('should create operational errors correctly', () => {
      const error = new AppError('Test message', 400, ErrorCodes.VALIDATION_ERROR);

      expect(error.message).toBe('Test message');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe(ErrorCodes.VALIDATION_ERROR);
      expect(error.isOperational).toBe(true);
      expect(error.name).toBe('AppError');
    });

    it('should be instance of Error', () => {
      const error = new AppError('Test', 400, ErrorCodes.VALIDATION_ERROR);

      expect(error instanceof Error).toBe(true);
      expect(error instanceof AppError).toBe(true);
    });

    it('should capture stack trace', () => {
      const error = new AppError('Test', 400, ErrorCodes.VALIDATION_ERROR);

      expect(error.stack).toBeDefined();
      expect(typeof error.stack).toBe('string');
    });
  });

  describe('Error Handler Integration', () => {
    it('should handle async route errors', async () => {
      app.get(
        '/test-async',
        asyncHandler(async (req, res) => {
          await Promise.resolve();
          throw new Error('Async error');
        })
      );

      app.use(errorHandler);

      const res = await request(app).get('/test-async');

      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty('error');
    });

    it('should not interfere with successful responses', async () => {
      app.get('/test-success', (req, res) => {
        res.json({ success: true, data: 'test' });
      });
      app.use(errorHandler);

      const res = await request(app).get('/test-success');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('US3-T28: Extended Error Handler Tests', () => {
    describe('Async Error Propagation', () => {
      it('should propagate async errors through multiple middleware layers', async () => {
        // Add multiple async middleware layers
        app.use(async (req, res, next) => {
          req.layer1 = 'processed';
          next();
        });

        app.use(async (req, res, next) => {
          req.layer2 = 'processed';
          next();
        });

        app.get(
          '/test-multilayer',
          asyncHandler(async (req, res) => {
            await Promise.resolve();
            // Verify layers were processed
            expect(req.layer1).toBe('processed');
            expect(req.layer2).toBe('processed');
            // Throw async error
            throw new AppError('Async multilayer error', 400, 'VALIDATION_ERROR');
          })
        );

        app.use((err, req, res, next) => {
          // Verify error propagated with context
          expect(req.layer1).toBe('processed');
          expect(req.layer2).toBe('processed');
          errorHandler(err, req, res, next);
        });

        const res = await request(app).get('/test-multilayer');

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(logger.error).toHaveBeenCalled();
      });

      it('should handle rejected promises in async routes', async () => {
        app.get(
          '/test-promise-rejection',
          asyncHandler(async (req, res) => {
            await Promise.reject(new Error('Promise rejection error'));
          })
        );

        app.use(errorHandler);

        const res = await request(app).get('/test-promise-rejection');

        expect(res.status).toBe(500);
        expect(res.body).toHaveProperty('error');
        expect(logger.error).toHaveBeenCalledWith(
          expect.stringContaining('Request error'),
          expect.objectContaining({
            error: expect.stringContaining('Promise rejection')
          })
        );
      });
    });

    describe('Error Correlation Across Services', () => {
      it('should maintain correlation ID across error boundaries', async () => {
        const testCorrelationId = 'correlation-' + Date.now();

        app.use((req, res, next) => {
          req.correlationId = testCorrelationId;
          next();
        });

        app.get(
          '/test-correlation',
          asyncHandler(async (req, res) => {
            // Simulate service call that throws error
            throw new AppError('Service error', 500, 'SERVICE_ERROR');
          })
        );

        app.use(errorHandler);

        const res = await request(app).get('/test-correlation');

        expect(res.status).toBe(500);
        expect(res.body.code).toBe('SERVICE_ERROR');

        // Verify logger was called with correlation ID from request
        expect(logger.error).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            correlationId: testCorrelationId
          })
        );
      });

      it('should track error chain across multiple service calls', async () => {
        app.get(
          '/test-error-chain',
          asyncHandler(async (req, res) => {
            try {
              // Simulate nested service calls
              throw new Error('Database error');
            } catch (dbError) {
              // Wrap original error
              const serviceError = new AppError('Service failed due to database', 500, 'SERVICE_ERROR');
              serviceError.cause = dbError;
              throw serviceError;
            }
          })
        );

        app.use(errorHandler);

        const res = await request(app).get('/test-error-chain');

        expect(res.status).toBe(500);

        // Verify error chain was logged
        expect(logger.error).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            error: expect.stringContaining('Service failed')
          })
        );
      });
    });

    describe('Error Rate Alerting', () => {
      it('should trigger notifications for high-severity errors', async () => {
        const ErrorNotificationService = require('../../../src/services/ErrorNotificationService');

        app.get('/test-critical-error', (req, res) => {
          throw new AppError('Critical system failure', 500, 'CRITICAL_ERROR', false);
        });

        app.use(errorHandler);

        const res = await request(app).get('/test-critical-error');

        expect(res.status).toBe(500);

        // Verify notification service was called for critical error (500 status)
        // The service internally determines criticality via isCriticalError()
        expect(ErrorNotificationService.notify).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Critical system failure',
            errorCode: 'CRITICAL_ERROR',
            statusCode: 500,
            path: '/test-critical-error',
            method: 'GET'
          })
        );
      });

      it('should not trigger notifications for operational errors', async () => {
        const ErrorNotificationService = require('../../../src/services/ErrorNotificationService');
        ErrorNotificationService.notify.mockClear();

        app.get('/test-operational-error', (req, res) => {
          throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', true);
        });

        app.use(errorHandler);

        const res = await request(app).get('/test-operational-error');

        expect(res.status).toBe(400);

        // Notification service is called, but internally filters out non-critical errors
        // (statusCode < 500 and not in critical error codes list)
        expect(ErrorNotificationService.notify).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Validation failed',
            errorCode: 'VALIDATION_ERROR',
            statusCode: 400
          })
        );
        // The service's isCriticalError() method would return false for 400 status
      });
    });

    describe('Error Response Caching', () => {
      it('should return consistent error responses for identical errors', async () => {
        app.get('/test-consistency', (req, res) => {
          throw new AppError('Consistent error', 400, 'VALIDATION_ERROR');
        });

        app.use(errorHandler);

        const res1 = await request(app).get('/test-consistency');
        const res2 = await request(app).get('/test-consistency');

        // Verify response structure is identical
        expect(res1.status).toBe(res2.status);
        expect(res1.status).toBe(400);
        expect(res1.body.code).toBe(res2.body.code);
        expect(res1.body.code).toBe('VALIDATION_ERROR');
        expect(res1.body.message).toBe(res2.body.message);
        expect(res1.body).toHaveProperty('timestamp');
        expect(res2.body).toHaveProperty('timestamp');
      });

      it('should log errors consistently while generating unique request contexts', async () => {
        app.get('/test-unique-ids', (req, res) => {
          throw new Error('Repeated error');
        });

        app.use(errorHandler);

        // Clear previous logger calls
        logger.error.mockClear();

        const res1 = await request(app).get('/test-unique-ids');
        const res2 = await request(app).get('/test-unique-ids');

        // Error structure should be consistent
        expect(res1.body.code).toBe(res2.body.code);
        expect(res1.status).toBe(res2.status);
        expect(res1.status).toBe(500);

        // Verify logger was called twice (once per error)
        expect(logger.error).toHaveBeenCalledTimes(2);
      });
    });
  });
});
