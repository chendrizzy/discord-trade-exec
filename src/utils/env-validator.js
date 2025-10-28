/**
 * Environment Variable Validator
 *
 * Validates required environment variables and detects dangerous configurations
 * on application startup. Fails fast in production to prevent misconfiguration.
 *
 * Usage:
 *   const envValidator = require('./utils/env-validator');
 *   envValidator.validate(); // Call this at app startup
 */

const logger = require('./logger');

class EnvValidator {
  /**
   * Validate environment configuration on startup
   * @throws {Error} If production is misconfigured or dangerous settings detected
   */
  static validate() {
    const errors = [];
    const warnings = [];

    // 1. Validate NODE_ENV
    const nodeEnv = process.env.NODE_ENV;
    if (!nodeEnv) {
      errors.push('NODE_ENV is not set. Set to "development", "test", or "production"');
    } else if (!['development', 'test', 'production'].includes(nodeEnv)) {
      errors.push(`NODE_ENV has invalid value: "${nodeEnv}". Must be "development", "test", or "production"`);
    }

    // 2. Validate DATABASE_URL
    if (!process.env.DATABASE_URL) {
      if (nodeEnv === 'production') {
        errors.push('DATABASE_URL is required in production');
      } else {
        warnings.push('DATABASE_URL is not set. Database operations will fail.');
      }
    }

    // 3. Production-specific validations
    if (nodeEnv === 'production') {
      // Check for mock billing provider
      if (process.env.BILLING_PROVIDER === 'mock') {
        errors.push(
          'BILLING_PROVIDER=mock is not allowed in production. ' +
          'Configure POLAR_ACCESS_TOKEN or remove BILLING_PROVIDER.'
        );
      }

      // Check for missing critical credentials
      if (!process.env.POLAR_ACCESS_TOKEN && process.env.BILLING_PROVIDER !== 'mock') {
        warnings.push(
          'POLAR_ACCESS_TOKEN is not set in production. ' +
          'Billing operations will fail unless BILLING_PROVIDER=mock is explicitly allowed.'
        );
      }

      // Check for sandbox broker allowance
      if (process.env.BROKER_ALLOW_SANDBOX === 'true') {
        warnings.push(
          'BROKER_ALLOW_SANDBOX=true in production. ' +
          'This allows testnet/sandbox broker connections which should only be used for controlled testing.'
        );
      }

      // Check for missing JWT secret
      if (!process.env.JWT_SECRET) {
        errors.push('JWT_SECRET is required in production for secure authentication');
      }

      // Check for weak JWT secret
      if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
        warnings.push(
          `JWT_SECRET is only ${process.env.JWT_SECRET.length} characters. ` +
          'Recommend at least 32 characters for production security.'
        );
      }

      // Check for missing Discord webhook (if Discord integration enabled)
      if (process.env.DISCORD_ENABLED === 'true' && !process.env.DISCORD_WEBHOOK_URL) {
        warnings.push('DISCORD_ENABLED=true but DISCORD_WEBHOOK_URL is not set');
      }
    }

    // 4. Development-specific warnings
    if (nodeEnv === 'development') {
      if (!process.env.BILLING_PROVIDER) {
        warnings.push(
          'BILLING_PROVIDER not set. Defaulting to Polar.sh. ' +
          'Set BILLING_PROVIDER=mock for development without Polar credentials.'
        );
      }
    }

    // Log validation results
    if (warnings.length > 0) {
      logger.warn('[EnvValidator] Environment configuration warnings', {
        warnings,
        nodeEnv
      });
    }

    if (errors.length > 0) {
      logger.error('[EnvValidator] Environment validation failed', {
        errors,
        nodeEnv
      });

      // Throw error with all validation failures
      const errorMessage = [
        '❌ Environment Validation Failed:',
        '',
        ...errors.map(err => `  - ${err}`),
        '',
        'Fix these errors before starting the application.'
      ].join('\n');

      throw new Error(errorMessage);
    }

    if (warnings.length === 0 && errors.length === 0) {
      logger.info('[EnvValidator] Environment validation passed', { nodeEnv });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Check if mock/sandbox modes are currently active
   * Used for health checks and monitoring
   * @returns {Object} Mock detection status
   */
  static detectMocks() {
    const mocks = [];

    // Check billing mocks
    if (process.env.BILLING_PROVIDER === 'mock') {
      mocks.push({
        type: 'billing',
        provider: 'mock',
        reason: 'BILLING_PROVIDER=mock'
      });
    }

    if (!process.env.POLAR_ACCESS_TOKEN) {
      mocks.push({
        type: 'billing',
        provider: 'polar',
        reason: 'POLAR_ACCESS_TOKEN not configured (will use mock data)'
      });
    }

    // Check broker sandbox allowance
    if (process.env.BROKER_ALLOW_SANDBOX === 'true') {
      mocks.push({
        type: 'broker',
        provider: 'any',
        reason: 'BROKER_ALLOW_SANDBOX=true (sandbox brokers allowed)'
      });
    }

    const isProduction = process.env.NODE_ENV === 'production';
    const hasMocks = mocks.length > 0;
    const isDangerous = isProduction && hasMocks;

    return {
      hasMocks,
      isDangerous,
      mocks,
      environment: process.env.NODE_ENV
    };
  }

  /**
   * Get environment configuration summary for debugging
   * @returns {Object} Environment summary (safe for logging)
   */
  static getSummary() {
    return {
      nodeEnv: process.env.NODE_ENV,
      billingProvider: process.env.BILLING_PROVIDER || 'polar',
      hasPolarToken: !!process.env.POLAR_ACCESS_TOKEN,
      hasJwtSecret: !!process.env.JWT_SECRET,
      hasDatabase: !!process.env.DATABASE_URL,
      brokerAllowSandbox: process.env.BROKER_ALLOW_SANDBOX === 'true',
      discordEnabled: process.env.DISCORD_ENABLED === 'true',
      port: process.env.PORT || 3000
    };
  }
}

module.exports = EnvValidator;
