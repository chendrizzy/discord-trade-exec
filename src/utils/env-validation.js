/**
 * Environment Variable Validation Utility
 * Ensures all required environment variables are present before application starts
 * Implements fail-fast pattern to catch configuration issues early
 */

const logger = require('./logger');

/**
 * Required environment variables by environment
 */
const REQUIRED_ENV_VARS = {
  production: [
    // Core application
    'NODE_ENV',
    'PORT',

    // Database
    'MONGODB_URI',

    // Session & Authentication
    'SESSION_SECRET',
    'JWT_SECRET',

    // Discord OAuth
    'DISCORD_CLIENT_ID',
    'DISCORD_CLIENT_SECRET',
    'DISCORD_CALLBACK_URL',

    // Discord Bot
    'DISCORD_BOT_TOKEN',

    // Encryption & Security
    'ENCRYPTION_KEY',

    // AWS KMS (for credential encryption)
    'AWS_REGION',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_KMS_CMK_ID',

    // URLs
    'DASHBOARD_URL',
    'FRONTEND_URL'
  ],

  development: [
    // Minimal requirements for development
    'MONGODB_URI',
    'DISCORD_BOT_TOKEN',
    'DISCORD_CLIENT_ID',
    'DISCORD_CLIENT_SECRET',
    'DISCORD_CALLBACK_URL'
  ],

  test: [
    // Minimal requirements for testing
    'MONGODB_URI'
  ]
};

/**
 * Optional environment variables (documented for reference)
 * These are not required but may be needed for specific features
 */
const OPTIONAL_ENV_VARS = [
  // Broker Credentials
  'ALPACA_API_KEY',
  'ALPACA_SECRET',
  'ALPACA_PAPER_KEY',
  'ALPACA_PAPER_SECRET',
  'IBKR_HOST',
  'IBKR_PORT',
  'IBKR_CLIENT_ID',
  'MOOMOO_HOST',
  'MOOMOO_PORT',
  'MOOMOO_ID',
  'MOOMOO_PASSWORD',

  // Exchange API Keys
  'BINANCE_API_KEY',
  'BINANCE_SECRET',
  'COINBASE_API_KEY',
  'COINBASE_SECRET',
  'KRAKEN_API_KEY',
  'KRAKEN_SECRET',

  // TradingView
  'TRADINGVIEW_WEBHOOK_SECRET',

  // Redis (for WebSocket scaling)
  'REDIS_URL',

  // Additional URLs
  'LANDING_PAGE_URL',
  'DISCORD_INVITE_URL',

  // Feature Flags
  'DEMO_MODE'
];

/**
 * Validates environment variables and fails fast if required ones are missing
 * @param {string} env - Environment name (production, development, test)
 * @throws {Error} If required environment variables are missing
 */
function validateEnvironment(env = process.env.NODE_ENV || 'development') {
  logger.info('[EnvValidation] Validating environment variables', { environment: env });

  // Get required variables for this environment
  const required = REQUIRED_ENV_VARS[env] || REQUIRED_ENV_VARS.development;

  // Check for missing variables
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    logger.error('[EnvValidation] Missing required environment variables', {
      environment: env,
      missingVariables: missing,
      totalRequired: required.length,
      totalMissing: missing.length,
      isProduction: env === 'production'
    });

    // In production, exit immediately
    if (env === 'production') {
      logger.error('[EnvValidation] Cannot start in production without required variables');
      process.exit(1);
    }

    // In development, warn but allow continuation
    logger.warn('[EnvValidation] Proceeding in development mode with missing variables', {
      environment: env,
      missingCount: missing.length
    });
  } else {
    logger.info('[EnvValidation] All required variables present', {
      environment: env,
      totalRequired: required.length
    });
  }

  // Check for optional variables and log warnings if missing
  const missingOptional = OPTIONAL_ENV_VARS.filter(key => !process.env[key]);

  if (missingOptional.length > 0 && env !== 'test') {
    logger.info('[EnvValidation] Optional variables not set', {
      environment: env,
      missingOptional: missingOptional,
      totalOptional: OPTIONAL_ENV_VARS.length,
      missingCount: missingOptional.length
    });
  }
}

/**
 * Get a required environment variable or throw error
 * @param {string} key - Environment variable name
 * @param {string} defaultValue - Optional default value
 * @returns {string} Environment variable value
 * @throws {Error} If variable is not set and no default provided
 */
function getRequiredEnv(key, defaultValue = null) {
  const value = process.env[key] || defaultValue;

  if (!value) {
    throw new Error(`Required environment variable ${key} is not set`);
  }

  return value;
}

/**
 * Get an optional environment variable with default
 * @param {string} key - Environment variable name
 * @param {string} defaultValue - Default value if not set
 * @returns {string} Environment variable value or default
 */
function getOptionalEnv(key, defaultValue = '') {
  return process.env[key] || defaultValue;
}

module.exports = {
  validateEnvironment,
  getRequiredEnv,
  getOptionalEnv,
  REQUIRED_ENV_VARS,
  OPTIONAL_ENV_VARS
};
