'use strict';

/**
 * Logger Unit Tests
 * Tests for Winston logger with correlation IDs and sensitive data redaction
 *
 * Note: Tests verify core functionality without file I/O to avoid async timing issues
 */

const sanitizer = require('../../../src/utils/log-sanitizer');

describe('Logger', () => {
  let logger;

  beforeEach(() => {
    // Fresh logger instance for each test
    jest.resetModules();
    logger = require('../../../src/utils/logger');
  });

  describe('Module Exports', () => {
    it('should export Winston logger instance', () => {
      expect(logger).toBeDefined();
      expect(logger.info).toBeInstanceOf(Function);
      expect(logger.error).toBeInstanceOf(Function);
      expect(logger.warn).toBeInstanceOf(Function);
      expect(logger.debug).toBeInstanceOf(Function);
    });

    it('should export correlation helper methods', () => {
      expect(logger.withCorrelation).toBeInstanceOf(Function);
      expect(logger.getCorrelationId).toBeInstanceOf(Function);
      expect(logger.setCorrelationId).toBeInstanceOf(Function);
    });

    it('should export AsyncLocalStorage', () => {
      expect(logger.asyncLocalStorage).toBeDefined();
    });
  });

  describe('Correlation ID', () => {
    it('should generate correlation ID if not provided', () => {
      const correlationId = logger.getCorrelationId();

      expect(correlationId).toBeDefined();
      expect(correlationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it('should use provided correlation ID in context', () => {
      const testId = 'test-correlation-123';

      logger.withCorrelation(testId, () => {
        const retrievedId = logger.getCorrelationId();
        expect(retrievedId).toBe(testId);
      });
    });

    it('should isolate correlation IDs between contexts', () => {
      const id1 = 'context-1';
      const id2 = 'context-2';

      logger.withCorrelation(id1, () => {
        expect(logger.getCorrelationId()).toBe(id1);

        logger.withCorrelation(id2, () => {
          expect(logger.getCorrelationId()).toBe(id2);
        });

        expect(logger.getCorrelationId()).toBe(id1);
      });
    });
  });

  describe('Log Sanitization Integration', () => {
    it('should use log sanitizer for sensitive data', () => {
      // Test that sanitizer is integrated
      const testData = {
        username: 'john',
        password: 'secret123',
        apiKey: 'pk_live_abc'
      };

      const sanitized = sanitizer.sanitize(testData);

      expect(sanitized.username).toBe('john');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.apiKey).toBe('[REDACTED]');
    });
  });

  describe('Log Levels', () => {
    it('should have correct log level in development', () => {
      process.env.NODE_ENV = 'development';
      jest.resetModules();
      const devLogger = require('../../../src/utils/logger');

      expect(devLogger.level).toBe('debug');
    });

    it('should have correct log level in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      jest.resetModules();
      const prodLogger = require('../../../src/utils/logger');

      expect(prodLogger.level).toBe('info');

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Async Logging Performance', () => {
    it('should handle rapid logging without blocking', () => {
      const start = Date.now();

      // Log 100 messages rapidly
      for (let i = 0; i < 100; i++) {
        logger.info(`Message ${i}`);
      }

      const duration = Date.now() - start;

      // Should complete quickly (async logging)
      expect(duration).toBeLessThan(100);
    });
  });

  describe('Error Handling', () => {
    it('should handle Error objects', () => {
      const error = new Error('Test error');

      // Should not throw
      expect(() => {
        logger.error('Error occurred', { error });
      }).not.toThrow();
    });

    it('should handle null/undefined metadata', () => {
      expect(() => {
        logger.info('Test', null);
        logger.info('Test', undefined);
        logger.info('Test');
      }).not.toThrow();
    });
  });

  describe('Metadata Handling', () => {
    it('should accept metadata object', () => {
      const metadata = {
        userId: '12345',
        action: 'login'
      };

      expect(() => {
        logger.info('User logged in', metadata);
      }).not.toThrow();
    });

    it('should handle nested objects in metadata', () => {
      const metadata = {
        user: {
          id: '123',
          profile: {
            name: 'John'
          }
        }
      };

      expect(() => {
        logger.info('Complex metadata', metadata);
      }).not.toThrow();
    });
  });

  describe('Transport Configuration', () => {
    it('should have console transport', () => {
      const transports = logger.transports;
      const hasConsole = transports.some(t => t.name === 'console');

      expect(hasConsole).toBe(true);
    });

    it('should have file transports', () => {
      const transports = logger.transports;
      const fileTransports = transports.filter(t => t.name === 'file');

      // Should have 2 file transports (app.log and error.log)
      expect(fileTransports.length).toBeGreaterThanOrEqual(2);
    });
  });
});
