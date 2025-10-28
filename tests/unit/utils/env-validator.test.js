/**
 * Environment Validator Tests
 * US5-T05: Test Mock Guards
 *
 * Verifies:
 * - Production fails with BILLING_PROVIDER=mock
 * - Development allows mocks
 * - Mock detection works correctly
 * - Environment summary includes key flags
 */

// Mock logger before requiring env-validator
jest.mock('../../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const EnvValidator = require('../../../src/utils/env-validator');
const logger = require('../../../src/utils/logger');

describe('EnvValidator', () => {
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Clear mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('validate()', () => {
    describe('Production Environment', () => {
      beforeEach(() => {
        process.env.NODE_ENV = 'production';
        process.env.DATABASE_URL = 'mongodb://localhost:27017/test';
        process.env.JWT_SECRET = 'test-secret-key-that-is-at-least-32-characters-long';
      });

      it('should fail when BILLING_PROVIDER=mock in production', () => {
        process.env.BILLING_PROVIDER = 'mock';

        expect(() => {
          EnvValidator.validate();
        }).toThrow(/BILLING_PROVIDER=mock is not allowed in production/);

        expect(logger.error).toHaveBeenCalledWith(
          '[EnvValidator] Environment validation failed',
          expect.objectContaining({
            errors: expect.arrayContaining([
              expect.stringContaining('BILLING_PROVIDER=mock is not allowed in production')
            ])
          })
        );
      });

      it('should pass when BILLING_PROVIDER is not mock in production', () => {
        process.env.BILLING_PROVIDER = 'polar';
        process.env.POLAR_ACCESS_TOKEN = 'polar_at_test_token';

        const result = EnvValidator.validate();

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(logger.info).toHaveBeenCalledWith(
          '[EnvValidator] Environment validation passed',
          { nodeEnv: 'production' }
        );
      });

      it('should fail when DATABASE_URL missing in production', () => {
        delete process.env.DATABASE_URL;
        process.env.POLAR_ACCESS_TOKEN = 'polar_at_test_token';

        expect(() => {
          EnvValidator.validate();
        }).toThrow(/DATABASE_URL is required in production/);
      });

      it('should fail when JWT_SECRET missing in production', () => {
        delete process.env.JWT_SECRET;
        process.env.POLAR_ACCESS_TOKEN = 'polar_at_test_token';

        expect(() => {
          EnvValidator.validate();
        }).toThrow(/JWT_SECRET is required in production/);
      });

      it('should warn when JWT_SECRET is too short in production', () => {
        process.env.JWT_SECRET = 'short';
        process.env.POLAR_ACCESS_TOKEN = 'polar_at_test_token';

        EnvValidator.validate();

        expect(logger.warn).toHaveBeenCalledWith(
          '[EnvValidator] Environment configuration warnings',
          expect.objectContaining({
            warnings: expect.arrayContaining([
              expect.stringContaining('JWT_SECRET is only 5 characters')
            ])
          })
        );
      });

      it('should warn when POLAR_ACCESS_TOKEN missing in production', () => {
        delete process.env.POLAR_ACCESS_TOKEN;
        process.env.BILLING_PROVIDER = 'polar'; // Explicitly not mock

        EnvValidator.validate();

        expect(logger.warn).toHaveBeenCalledWith(
          '[EnvValidator] Environment configuration warnings',
          expect.objectContaining({
            warnings: expect.arrayContaining([
              expect.stringContaining('POLAR_ACCESS_TOKEN is not set in production')
            ])
          })
        );
      });

      it('should warn when BROKER_ALLOW_SANDBOX=true in production', () => {
        process.env.BROKER_ALLOW_SANDBOX = 'true';
        process.env.POLAR_ACCESS_TOKEN = 'polar_at_test_token';

        EnvValidator.validate();

        expect(logger.warn).toHaveBeenCalledWith(
          '[EnvValidator] Environment configuration warnings',
          expect.objectContaining({
            warnings: expect.arrayContaining([
              expect.stringContaining('BROKER_ALLOW_SANDBOX=true in production')
            ])
          })
        );
      });

      it('should warn when Discord webhook missing but Discord enabled', () => {
        process.env.DISCORD_ENABLED = 'true';
        delete process.env.DISCORD_WEBHOOK_URL;
        process.env.POLAR_ACCESS_TOKEN = 'polar_at_test_token';

        EnvValidator.validate();

        expect(logger.warn).toHaveBeenCalledWith(
          '[EnvValidator] Environment configuration warnings',
          expect.objectContaining({
            warnings: expect.arrayContaining([
              expect.stringContaining('DISCORD_ENABLED=true but DISCORD_WEBHOOK_URL is not set')
            ])
          })
        );
      });
    });

    describe('Development Environment', () => {
      beforeEach(() => {
        process.env.NODE_ENV = 'development';
      });

      it('should allow BILLING_PROVIDER=mock in development', () => {
        process.env.BILLING_PROVIDER = 'mock';
        process.env.DATABASE_URL = 'mongodb://localhost:27017/test';

        const result = EnvValidator.validate();

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(logger.info).toHaveBeenCalledWith(
          '[EnvValidator] Environment validation passed',
          { nodeEnv: 'development' }
        );
      });

      it('should allow missing POLAR_ACCESS_TOKEN in development', () => {
        delete process.env.POLAR_ACCESS_TOKEN;
        process.env.DATABASE_URL = 'mongodb://localhost:27017/test';

        const result = EnvValidator.validate();

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('should warn when DATABASE_URL missing in development', () => {
        delete process.env.DATABASE_URL;

        EnvValidator.validate();

        expect(logger.warn).toHaveBeenCalledWith(
          '[EnvValidator] Environment configuration warnings',
          expect.objectContaining({
            warnings: expect.arrayContaining([
              expect.stringContaining('DATABASE_URL is not set')
            ])
          })
        );
      });

      it('should warn when BILLING_PROVIDER not set in development', () => {
        delete process.env.BILLING_PROVIDER;
        process.env.DATABASE_URL = 'mongodb://localhost:27017/test';

        EnvValidator.validate();

        expect(logger.warn).toHaveBeenCalledWith(
          '[EnvValidator] Environment configuration warnings',
          expect.objectContaining({
            warnings: expect.arrayContaining([
              expect.stringContaining('BILLING_PROVIDER not set')
            ])
          })
        );
      });
    });

    describe('Invalid NODE_ENV', () => {
      it('should fail when NODE_ENV is not set', () => {
        delete process.env.NODE_ENV;

        expect(() => {
          EnvValidator.validate();
        }).toThrow(/NODE_ENV is not set/);
      });

      it('should fail when NODE_ENV has invalid value', () => {
        process.env.NODE_ENV = 'staging';

        expect(() => {
          EnvValidator.validate();
        }).toThrow(/NODE_ENV has invalid value/);
      });
    });
  });

  describe('detectMocks()', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('should detect BILLING_PROVIDER=mock', () => {
      process.env.BILLING_PROVIDER = 'mock';

      const result = EnvValidator.detectMocks();

      expect(result.hasMocks).toBe(true);
      expect(result.mocks).toContainEqual({
        type: 'billing',
        provider: 'mock',
        reason: 'BILLING_PROVIDER=mock'
      });
    });

    it('should detect missing POLAR_ACCESS_TOKEN', () => {
      delete process.env.POLAR_ACCESS_TOKEN;
      delete process.env.BILLING_PROVIDER;

      const result = EnvValidator.detectMocks();

      expect(result.hasMocks).toBe(true);
      expect(result.mocks).toContainEqual({
        type: 'billing',
        provider: 'polar',
        reason: 'POLAR_ACCESS_TOKEN not configured (will use mock data)'
      });
    });

    it('should detect BROKER_ALLOW_SANDBOX=true', () => {
      process.env.BROKER_ALLOW_SANDBOX = 'true';
      process.env.POLAR_ACCESS_TOKEN = 'polar_at_test_token';

      const result = EnvValidator.detectMocks();

      expect(result.hasMocks).toBe(true);
      expect(result.mocks).toContainEqual({
        type: 'broker',
        provider: 'any',
        reason: 'BROKER_ALLOW_SANDBOX=true (sandbox brokers allowed)'
      });
    });

    it('should detect multiple mocks at once', () => {
      process.env.BILLING_PROVIDER = 'mock';
      process.env.BROKER_ALLOW_SANDBOX = 'true';

      const result = EnvValidator.detectMocks();

      expect(result.hasMocks).toBe(true);
      expect(result.mocks).toHaveLength(2);
      expect(result.mocks.map(m => m.type)).toEqual(
        expect.arrayContaining(['billing', 'broker'])
      );
    });

    it('should mark as dangerous when mocks detected in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.BILLING_PROVIDER = 'mock';

      const result = EnvValidator.detectMocks();

      expect(result.hasMocks).toBe(true);
      expect(result.isDangerous).toBe(true);
      expect(result.environment).toBe('production');
    });

    it('should not mark as dangerous when mocks detected in development', () => {
      process.env.NODE_ENV = 'development';
      process.env.BILLING_PROVIDER = 'mock';

      const result = EnvValidator.detectMocks();

      expect(result.hasMocks).toBe(true);
      expect(result.isDangerous).toBe(false);
      expect(result.environment).toBe('development');
    });

    it('should return no mocks when properly configured', () => {
      process.env.NODE_ENV = 'production';
      process.env.POLAR_ACCESS_TOKEN = 'polar_at_test_token';
      delete process.env.BILLING_PROVIDER; // Will default to polar
      delete process.env.BROKER_ALLOW_SANDBOX;

      const result = EnvValidator.detectMocks();

      expect(result.hasMocks).toBe(false);
      expect(result.isDangerous).toBe(false);
      expect(result.mocks).toHaveLength(0);
    });
  });

  describe('getSummary()', () => {
    it('should return environment configuration summary', () => {
      process.env.NODE_ENV = 'production';
      process.env.BILLING_PROVIDER = 'polar';
      process.env.POLAR_ACCESS_TOKEN = 'polar_at_test_token';
      process.env.JWT_SECRET = 'test-secret-key-that-is-at-least-32-characters-long';
      process.env.DATABASE_URL = 'mongodb://localhost:27017/test';
      process.env.BROKER_ALLOW_SANDBOX = 'false';
      process.env.DISCORD_ENABLED = 'true';
      process.env.PORT = '5000';

      const summary = EnvValidator.getSummary();

      expect(summary).toEqual({
        nodeEnv: 'production',
        billingProvider: 'polar',
        hasPolarToken: true,
        hasJwtSecret: true,
        hasDatabase: true,
        brokerAllowSandbox: false,
        discordEnabled: true,
        port: '5000'
      });
    });

    it('should handle missing optional configurations', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.BILLING_PROVIDER;
      delete process.env.POLAR_ACCESS_TOKEN;
      delete process.env.JWT_SECRET;
      delete process.env.DATABASE_URL;
      delete process.env.BROKER_ALLOW_SANDBOX;
      delete process.env.DISCORD_ENABLED;
      delete process.env.PORT;

      const summary = EnvValidator.getSummary();

      expect(summary).toEqual({
        nodeEnv: 'development',
        billingProvider: 'polar', // Default
        hasPolarToken: false,
        hasJwtSecret: false,
        hasDatabase: false,
        brokerAllowSandbox: false,
        discordEnabled: false,
        port: 3000 // Default
      });
    });

    it('should not expose sensitive values', () => {
      process.env.POLAR_ACCESS_TOKEN = 'polar_at_secret_token';
      process.env.JWT_SECRET = 'super-secret-jwt-key';

      const summary = EnvValidator.getSummary();

      // Summary should only show boolean flags, not actual secrets
      expect(summary.hasPolarToken).toBe(true);
      expect(summary.hasJwtSecret).toBe(true);
      expect(summary).not.toHaveProperty('POLAR_ACCESS_TOKEN');
      expect(summary).not.toHaveProperty('JWT_SECRET');
    });
  });

  describe('Integration: Health Check Scenario', () => {
    it('should support health check workflow for production readiness', () => {
      process.env.NODE_ENV = 'production';
      process.env.DATABASE_URL = 'mongodb://localhost:27017/test';
      process.env.JWT_SECRET = 'test-secret-key-that-is-at-least-32-characters-long';
      process.env.POLAR_ACCESS_TOKEN = 'polar_at_test_token';
      delete process.env.BILLING_PROVIDER; // Will default to polar
      delete process.env.BROKER_ALLOW_SANDBOX;

      // Health check would do:
      // 1. Validate environment
      const validation = EnvValidator.validate();
      expect(validation.valid).toBe(true);

      // 2. Detect mocks
      const mockDetection = EnvValidator.detectMocks();
      expect(mockDetection.hasMocks).toBe(false);
      expect(mockDetection.isDangerous).toBe(false);

      // 3. Get summary for reporting
      const summary = EnvValidator.getSummary();
      expect(summary.nodeEnv).toBe('production');
      expect(summary.hasPolarToken).toBe(true);
    });

    it('should fail health check when production has mocks', () => {
      process.env.NODE_ENV = 'production';
      process.env.DATABASE_URL = 'mongodb://localhost:27017/test';
      process.env.JWT_SECRET = 'test-secret-key-that-is-at-least-32-characters-long';
      process.env.BILLING_PROVIDER = 'mock'; // DANGEROUS

      // Health check would do:
      // 1. Try to validate (should throw)
      expect(() => {
        EnvValidator.validate();
      }).toThrow(/BILLING_PROVIDER=mock is not allowed in production/);

      // 2. Even if validation was bypassed, mock detection would catch it
      const mockDetection = EnvValidator.detectMocks();
      expect(mockDetection.isDangerous).toBe(true);
      expect(mockDetection.hasMocks).toBe(true);
    });
  });
});
