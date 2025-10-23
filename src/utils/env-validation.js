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
  console.log(`🔍 Validating environment variables for: ${env}`);

  // Get required variables for this environment
  const required = REQUIRED_ENV_VARS[env] || REQUIRED_ENV_VARS.development;

  // Check for missing variables
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    logger.error('❌ ENVIRONMENT VALIDATION FAILED');
    logger.error('❌ Missing required environment variables:');
    missing.forEach(key => console.error(`   - ${key}`));
    console.error('');
    logger.error('💡 Please check your .env file and ensure all required variables are set.');
    logger.error('💡 Refer to .env.example for the complete list of required variables.');
    console.error('');

    // In production, exit immediately
    if (env === 'production') {
      logger.error('🚨 Cannot start application in production without required environment variables');
      process.exit(1);
    }

    // In development, warn but allow continuation
    logger.warn('⚠️ Application may not function correctly without these variables');
    logger.warn('⚠️ Proceeding in development mode...');
    console.warn('');
  } else {
    logger.info('✅ All required environment variables are present');
  }

  // Check for optional variables and log warnings if missing
  const missingOptional = OPTIONAL_ENV_VARS.filter(key => !process.env[key]);

  if (missingOptional.length > 0 && env !== 'test') {
    console.log('');
    logger.info('ℹ️ Optional environment variables not set:');
    missingOptional.forEach(key => console.log(`   - ${key}`));
    logger.info('ℹ️ Some features may not be available without these variables');
    console.log('');
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
