/**
 * Error Sanitization Tests (US4-T10)
 *
 * Tests that validate error responses are properly sanitized:
 * - 500 errors never expose stack traces
 * - 400 errors include validation details
 * - Correlation IDs are logged for all errors
 */

const request = require('supertest');
const express = require('express');
const { AppError, ErrorCodes, errorHandler } = require('../../../src/middleware/errorHandler');
const logger = require('../../../src/utils/logger');

// Mock logger to capture log calls
jest.mock('../../../src/utils/logger', () => ({
  error: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  getCorrelationId: jest.fn()
}));

// Mock error notification service
jest.mock('../../../src/services/ErrorNotificationService', () => ({
  notify: jest.fn().mockResolvedValue(true)
}));

describe('Error Sanitization (US4-T10)', () => {
  let app;

  beforeEach(() => {
    // Create fresh Express app for each test
    app = express();
    app.use(express.json());

    // Add correlation ID middleware
    app.use((req, res, next) => {
      req.correlationId = 'test-correlation-id-sanitization';
      next();
    });

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('500 Error Response Sanitization', () => {
    it('should return 500 error without stack trace', async () => {
      // Setup route that throws internal server error
      app.get('/test-500-error', (req, res) => {
        throw new AppError(
          'Internal server error occurred',
          500,
          ErrorCodes.INTERNAL_SERVER_ERROR
        );
      });
      app.use(errorHandler);

      const res = await request(app).get('/test-500-error');

      // Verify response status
      expect(res.status).toBe(500);

      // Verify error structure
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toHaveProperty('message');
      expect(res.body.error).toHaveProperty('code');
      expect(res.body.error).toHaveProperty('timestamp');

      // Critical: Verify NO stack trace in response
      expect(res.body).not.toHaveProperty('stack');
      expect(res.body).not.toHaveProperty('stackTrace');
      expect(res.body.error).not.toHaveProperty('stack');
      expect(res.body.error).not.toHaveProperty('stackTrace');

      // Verify response doesn't contain stack trace patterns
      const responseStr = JSON.stringify(res.body);
      expect(responseStr).not.toContain('at ');
      expect(responseStr).not.toContain('.test.js');
      expect(responseStr).not.toContain('Error: ');
    });

    it('should sanitize database error messages', async () => {
      app.get('/test-database-error', (req, res) => {
        throw new AppError(
          'Database connection failed',
          500,
          ErrorCodes.DATABASE_ERROR
        );
      });
      app.use(errorHandler);

      const res = await request(app).get('/test-database-error');

      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe(ErrorCodes.DATABASE_ERROR);

      // Stack trace should not be exposed (check for actual stack trace patterns)
      expect(res.body).not.toHaveProperty('stack');
      expect(res.body.error).not.toHaveProperty('stack');
      // Check for stack trace patterns like "at filename.js:123"
      expect(JSON.stringify(res.body)).not.toMatch(/at\s+\w+\s*\([^)]*:\d+:\d+\)/);
      expect(JSON.stringify(res.body)).not.toContain('.test.js');
    });

    it('should sanitize broker connection errors', async () => {
      app.get('/test-broker-error', (req, res) => {
        throw new AppError(
          'Broker API key invalid: sk_live_abc123xyz',
          500,
          ErrorCodes.BROKER_ERROR
        );
      });
      app.use(errorHandler);

      const res = await request(app).get('/test-broker-error');

      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe(ErrorCodes.BROKER_ERROR);

      // Sensitive info should not be in stack trace (no stack should be returned)
      expect(res.body).not.toHaveProperty('stack');
    });
  });

  describe('400 Error Response with Validation Details', () => {
    it('should return 400 error with validation details', async () => {
      app.post('/test-validation-error', (req, res) => {
        throw new AppError(
          'Validation failed',
          400,
          ErrorCodes.VALIDATION_ERROR,
          {
            fields: {
              email: 'Invalid email format',
              password: 'Password must be at least 8 characters'
            }
          }
        );
      });
      app.use(errorHandler);

      const res = await request(app).post('/test-validation-error').send({
        email: 'invalid',
        password: 'short'
      });

      // Verify response status
      expect(res.status).toBe(400);

      // Verify error structure
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toHaveProperty('message');
      expect(res.body.error).toHaveProperty('code', ErrorCodes.VALIDATION_ERROR);

      // Verify validation details are included
      expect(res.body.error).toHaveProperty('details');
      expect(res.body.error.details).toHaveProperty('fields');
      expect(res.body.error.details.fields).toHaveProperty('email');
      expect(res.body.error.details.fields).toHaveProperty('password');

      // Still verify no stack trace
      expect(res.body).not.toHaveProperty('stack');
      expect(res.body.error).not.toHaveProperty('stack');
    });

    it('should include invalid input details for validation errors', async () => {
      app.post('/test-invalid-input', (req, res) => {
        throw new AppError(
          'Invalid input provided',
          400,
          ErrorCodes.INVALID_INPUT,
          {
            invalidFields: ['symbol', 'quantity'],
            reason: 'Symbol must be uppercase and quantity must be positive'
          }
        );
      });
      app.use(errorHandler);

      const res = await request(app).post('/test-invalid-input').send({
        symbol: 'aapl',
        quantity: -10
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ErrorCodes.INVALID_INPUT);
      expect(res.body.error.details).toHaveProperty('invalidFields');
      expect(res.body.error.details).toHaveProperty('reason');

      // No stack trace
      expect(res.body).not.toHaveProperty('stack');
    });

    it('should handle missing required field errors', async () => {
      app.post('/test-missing-field', (req, res) => {
        throw new AppError(
          'Missing required field',
          400,
          ErrorCodes.MISSING_REQUIRED_FIELD,
          {
            field: 'broker',
            message: 'Broker is required for trade execution'
          }
        );
      });
      app.use(errorHandler);

      const res = await request(app).post('/test-missing-field').send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ErrorCodes.MISSING_REQUIRED_FIELD);
      expect(res.body.error.details).toHaveProperty('field', 'broker');

      // No stack trace
      expect(res.body).not.toHaveProperty('stack');
    });
  });

  describe('Correlation ID Logging', () => {
    it('should log correlation ID with 500 errors', async () => {
      app.get('/test-500-logging', (req, res) => {
        throw new AppError(
          'Internal error for logging test',
          500,
          ErrorCodes.INTERNAL_SERVER_ERROR
        );
      });
      app.use(errorHandler);

      await request(app).get('/test-500-logging');

      // Verify logger.error was called
      expect(logger.error).toHaveBeenCalled();

      // Get the log call arguments
      const logCall = logger.error.mock.calls[0];
      const logData = logCall[1];

      // Verify correlation ID is in log data
      expect(logData).toHaveProperty('correlationId', 'test-correlation-id-sanitization');
      expect(logData).toHaveProperty('error');
      expect(logData).toHaveProperty('errorCode', ErrorCodes.INTERNAL_SERVER_ERROR);
      expect(logData).toHaveProperty('statusCode', 500);
    });

    it('should log correlation ID with 400 errors', async () => {
      app.post('/test-400-logging', (req, res) => {
        throw new AppError(
          'Validation error for logging test',
          400,
          ErrorCodes.VALIDATION_ERROR
        );
      });
      app.use(errorHandler);

      await request(app).post('/test-400-logging').send({});

      // Verify logger.error was called
      expect(logger.error).toHaveBeenCalled();

      // Get the log call arguments
      const logCall = logger.error.mock.calls[0];
      const logData = logCall[1];

      // Verify correlation ID is in log data
      expect(logData).toHaveProperty('correlationId', 'test-correlation-id-sanitization');
      expect(logData).toHaveProperty('errorCode', ErrorCodes.VALIDATION_ERROR);
      expect(logData).toHaveProperty('statusCode', 400);
    });

    it('should log request path and method with correlation ID', async () => {
      app.put('/api/test-path', (req, res) => {
        throw new AppError(
          'Test error',
          500,
          ErrorCodes.INTERNAL_SERVER_ERROR
        );
      });
      app.use(errorHandler);

      await request(app).put('/api/test-path');

      // Verify logger.error was called
      expect(logger.error).toHaveBeenCalled();

      const logCall = logger.error.mock.calls[0];
      const logData = logCall[1];

      // Verify request context is logged
      expect(logData).toHaveProperty('correlationId');
      expect(logData).toHaveProperty('path', '/api/test-path');
      expect(logData).toHaveProperty('method', 'PUT');
    });

    it('should log user context when available', async () => {
      app.get('/test-user-context', (req, res) => {
        // Simulate authenticated request
        req.user = {
          userId: 'test-user-123',
          communityId: 'test-community-456'
        };
        throw new AppError('Test error', 500, ErrorCodes.INTERNAL_SERVER_ERROR);
      });
      app.use(errorHandler);

      await request(app).get('/test-user-context');

      expect(logger.error).toHaveBeenCalled();

      const logCall = logger.error.mock.calls[0];
      const logData = logCall[1];

      // Verify user context is logged
      expect(logData).toHaveProperty('userId', 'test-user-123');
      expect(logData).toHaveProperty('communityId', 'test-community-456');
      expect(logData).toHaveProperty('correlationId');
    });
  });

  describe('Stack Trace Logging (Internal Only)', () => {
    it('should log stack trace internally but never return it', async () => {
      app.get('/test-stack-logging', (req, res) => {
        const error = new Error('Test error with stack');
        error.code = ErrorCodes.INTERNAL_SERVER_ERROR;
        throw error;
      });
      app.use(errorHandler);

      const res = await request(app).get('/test-stack-logging');

      // Verify stack trace is NOT in response
      expect(res.body).not.toHaveProperty('stack');
      expect(JSON.stringify(res.body)).not.toContain('at ');

      // Verify logger was called (stack captured internally)
      expect(logger.error).toHaveBeenCalled();

      const logCall = logger.error.mock.calls[0];
      const logData = logCall[1];

      // Stack preview should be in logs (internal only)
      expect(logData).toHaveProperty('stackPreview');
    });
  });
});
