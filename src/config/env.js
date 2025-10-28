'use strict';

/**
 * Environment Configuration Validator
 *
 * Validates all required environment variables from .env.example
 * Fails fast on startup if critical variables are missing
 *
 * Constitutional Principle I: Security-First - Prevents insecure configuration
 */

const logger = require('../utils/logger');

const requiredEnvVars = {
  // Core Application
  NODE_ENV: { required: true, default: 'development', values: ['development', 'production', 'test', 'staging'] },
  PORT: { required: true, default: '3000', type: 'number' },

  // Database
  MONGODB_URI: { required: true, sensitive: true },
  REDIS_URL: { required: false, sensitive: true }, // Optional: falls back to in-memory for dev

  // Authentication
  SESSION_SECRET: { required: true, sensitive: true, minLength: 32 },
  JWT_SECRET: { required: true, sensitive: true, minLength: 32 },
  JWT_EXPIRES_IN: { required: true, default: '15m' },
  JWT_REFRESH_EXPIRES_IN: { required: true, default: '7d' },

  // Discord OAuth2
  DISCORD_CLIENT_ID: { required: true },
  DISCORD_CLIENT_SECRET: { required: true, sensitive: true },
  DISCORD_REDIRECT_URI: { required: true },
  DISCORD_BOT_TOKEN: { required: true, sensitive: true },
  DISCORD_GUILD_ID: { required: false }, // Optional: for guild-specific features
  DISCORD_ERROR_WEBHOOK_URL: { required: false, sensitive: true }, // Optional: for critical error notifications

  // Encryption
  ENCRYPTION_KEY: { required: true, sensitive: true, minLength: 64 }, // 32 bytes hex = 64 chars
  ENCRYPTION_ALGORITHM: { required: true, default: 'aes-256-gcm' },

  // Billing (Polar.sh)
  POLAR_API_KEY: { required: false, sensitive: true }, // Optional for dev
  POLAR_WEBHOOK_SECRET: { required: false, sensitive: true },

  // External Services
  SENTRY_DSN: { required: false, sensitive: true }, // Optional monitoring

  // Feature Flags
  ENABLE_WEBSOCKET: { required: true, default: 'true', type: 'boolean' },
  ENABLE_RATE_LIMITING: { required: true, default: 'true', type: 'boolean' },
  ENABLE_AUDIT_LOGGING: { required: true, default: 'true', type: 'boolean' },

  // Performance
  MAX_WEBSOCKET_CONNECTIONS: { required: true, default: '1000', type: 'number' },
  RATE_LIMIT_WINDOW_MS: { required: true, default: '900000', type: 'number' }, // 15 min
  RATE_LIMIT_MAX_REQUESTS: { required: true, default: '100', type: 'number' }
};

/**
 * Validates environment variables against required schema
 * @returns {Object} Validated environment configuration
 * @throws {Error} If required variables are missing or invalid
 */
function validateEnv() {
  const errors = [];
  const config = {};

  for (const [key, rules] of Object.entries(requiredEnvVars)) {
    const value = process.env[key];

    // Check if required variable exists
    if (rules.required && !value) {
      if (rules.default) {
        config[key] = rules.default;
        if (process.env.NODE_ENV !== 'test') {
          logger.warn('[Env] Using default value for environment variable', {
            key,
            value: rules.sensitive ? '[REDACTED]' : rules.default,
            sensitive: rules.sensitive
          });
        }
      } else {
        errors.push(`Missing required environment variable: ${key}`);
        continue;
      }
    } else if (!value && rules.default) {
      config[key] = rules.default;
    } else {
      config[key] = value || '';
    }

    // Validate enum values
    if (rules.values && !rules.values.includes(config[key])) {
      errors.push(`Invalid value for ${key}: must be one of [${rules.values.join(', ')}]`);
    }

    // Validate minimum length for sensitive keys
    if (rules.minLength && config[key].length < rules.minLength) {
      errors.push(`${key} must be at least ${rules.minLength} characters`);
    }

    // Type conversion
    if (rules.type === 'number') {
      const num = parseInt(config[key], 10);
      if (isNaN(num)) {
        errors.push(`${key} must be a valid number`);
      } else {
        config[key] = num;
      }
    } else if (rules.type === 'boolean') {
      config[key] = config[key] === 'true' || config[key] === '1';
    }
  }

  // Fail fast if errors exist
  if (errors.length > 0) {
    logger.error('[Env] Environment validation failed', {
      errors,
      errorCount: errors.length,
      environment: process.env.NODE_ENV
    });
    throw new Error(`Environment validation failed with ${errors.length} error(s)`);
  }

  // Log successful validation (hide sensitive values)
  if (process.env.NODE_ENV !== 'test') {
    logger.info('[Env] Environment validation passed', {
      environment: config.NODE_ENV,
      port: config.PORT,
      websocket: config.ENABLE_WEBSOCKET ? 'enabled' : 'disabled',
      rateLimiting: config.ENABLE_RATE_LIMITING ? 'enabled' : 'disabled',
      auditLogging: config.ENABLE_AUDIT_LOGGING ? 'enabled' : 'disabled'
    });
  }

  return config;
}

/**
 * Get validated environment configuration
 * Memoized to avoid re-validation on every import
 */
let cachedConfig = null;

function getConfig() {
  if (!cachedConfig) {
    cachedConfig = validateEnv();
  }
  return cachedConfig;
}

/**
 * Check if running in production environment
 */
function isProduction() {
  return process.env.NODE_ENV === 'production';
}

/**
 * Check if running in development environment
 */
function isDevelopment() {
  return process.env.NODE_ENV === 'development';
}

/**
 * Check if running in test environment
 */
function isTest() {
  return process.env.NODE_ENV === 'test';
}

module.exports = {
  validateEnv,
  getConfig,
  isProduction,
  isDevelopment,
  isTest
};
