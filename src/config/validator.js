// External dependencies
const Joi = require('joi');

/**
 * Configuration Validator using Joi schemas
 *
 * Validates all application configuration including:
 * - Database connections
 * - Broker credentials
 * - API endpoints
 * - Environment variables
 * - AWS services configuration
 *
 * Provides fail-fast validation on application startup
 */

/**
 * Database Configuration Schema
 */
const databaseSchema = Joi.object({
  uri: Joi.string()
    .uri()
    .required()
    .description('MongoDB connection URI')
    .example('mongodb://localhost:27017/discord-trade-exec'),
  options: Joi.object({
    useNewUrlParser: Joi.boolean().default(true),
    useUnifiedTopology: Joi.boolean().default(true),
    maxPoolSize: Joi.number().integer().min(1).max(100).default(10),
    serverSelectionTimeoutMS: Joi.number().integer().min(1000).default(5000)
  }).optional()
});

/**
 * Broker Credentials Schema
 * NOTE: Brokers can be configured later via OAuth in the UI dashboard,
 * so we don't require at least one broker at startup
 */
const brokerCredentialsSchema = Joi.object({
  alpaca: Joi.object({
    apiKey: Joi.string().required().min(10),
    apiSecret: Joi.string().required().min(10),
    isTestnet: Joi.boolean().default(true)
  }).optional(),
  alpacaOAuth: Joi.object({
    accessToken: Joi.string().required().min(20)
  }).optional(),
  moomoo: Joi.object({
    host: Joi.string().hostname().default('127.0.0.1'),
    port: Joi.number().integer().min(1024).max(65535).default(11111),
    apiKey: Joi.string().optional(),
    apiSecret: Joi.string().optional()
  }).optional(),
  binance: Joi.object({
    apiKey: Joi.string().required().min(10),
    secret: Joi.string().required().min(10),
    sandbox: Joi.boolean().default(true)
  }).optional(),
  kraken: Joi.object({
    apiKey: Joi.string().required().min(10),
    privateKey: Joi.string().required().min(10),
    environment: Joi.string().valid('live', 'testnet').default('live')
  }).optional()
}).optional(); // Allow empty broker config - users configure via OAuth dashboard

/**
 * AWS Configuration Schema
 */
const awsConfigSchema = Joi.object({
  region: Joi.string()
    .required()
    .valid(
      'us-east-1',
      'us-east-2',
      'us-west-1',
      'us-west-2',
      'eu-west-1',
      'eu-central-1',
      'ap-southeast-1',
      'ap-northeast-1'
    )
    .description('AWS Region'),
  credentials: Joi.object({
    accessKeyId: Joi.string().required().min(16).max(128),
    secretAccessKey: Joi.string().required().min(16)
  }).required(),
  kms: Joi.object({
    cmkId: Joi.string()
      .required()
      .pattern(/^[a-f0-9-]{36}$/)
      .description('KMS Customer Master Key ID (UUID format)')
  }).required()
});

/**
 * API Configuration Schema
 */
const apiConfigSchema = Joi.object({
  port: Joi.number().integer().min(1024).max(65535).default(3000),
  host: Joi.string().hostname().default('localhost'),
  corsOrigins: Joi.array().items(Joi.string().uri()).min(1).required().description('Allowed CORS origins'),
  rateLimit: Joi.object({
    windowMs: Joi.number().integer().min(1000).default(900000),
    max: Joi.number().integer().min(1).default(100)
  }).optional(),
  session: Joi.object({
    secret: Joi.string().required().min(32),
    name: Joi.string().default('discord-trade-exec.sid'),
    resave: Joi.boolean().default(false),
    saveUninitialized: Joi.boolean().default(false),
    cookie: Joi.object({
      secure: Joi.boolean().default(false),
      httpOnly: Joi.boolean().default(true),
      maxAge: Joi.number().integer().min(1000).default(86400000)
    })
  }).required()
});

/**
 * Discord Bot Configuration Schema
 */
const discordConfigSchema = Joi.object({
  token: Joi.string().required().min(50).description('Discord bot token'),
  clientId: Joi.string()
    .required()
    .pattern(/^\d{17,19}$/)
    .description('Discord application client ID'),
  clientSecret: Joi.string().required().min(20).description('Discord OAuth2 client secret')
});

/**
 * Frontend/Dashboard URLs Schema
 */
const urlConfigSchema = Joi.object({
  dashboardUrl: Joi.string().uri().required().description('Dashboard URL'),
  frontendUrl: Joi.string().uri().required().description('Frontend URL')
});

/**
 * Complete Environment Configuration Schema
 */
const environmentSchema = Joi.object({
  nodeEnv: Joi.string().valid('development', 'staging', 'production').default('development'),
  demoMode: Joi.boolean().default(false),
  database: databaseSchema.required(),
  brokers: brokerCredentialsSchema.optional().default({}),
  aws: awsConfigSchema.optional(), // AWS KMS only needed when encrypting credentials
  api: apiConfigSchema.required(),
  discord: discordConfigSchema.required(),
  urls: urlConfigSchema.required()
});

/**
 * Validate configuration object against schema
 * @param {Object} config - Configuration object to validate
 * @param {Object} schema - Joi schema to validate against
 * @returns {Object} - { valid: boolean, config: Object, errors: Array }
 */
function validateConfig(config, schema) {
  const { error, value } = schema.validate(config, {
    abortEarly: false,
    allowUnknown: false,
    stripUnknown: true
  });

  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
      type: detail.type
    }));

    return {
      valid: false,
      config: null,
      errors
    };
  }

  return {
    valid: true,
    config: value,
    errors: []
  };
}

/**
 * Build configuration from environment variables
 * @returns {Object} Configuration object
 */
function buildConfigFromEnv() {
  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    demoMode: process.env.DEMO_MODE === 'true',
    database: {
      uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/discord-trade-exec',
      options: {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        maxPoolSize: parseInt(process.env.MONGODB_POOL_SIZE || '10', 10),
        serverSelectionTimeoutMS: parseInt(process.env.MONGODB_TIMEOUT || '5000', 10)
      }
    },
    brokers: {
      ...(process.env.ALPACA_API_KEY && {
        alpaca: {
          apiKey: process.env.ALPACA_API_KEY,
          apiSecret: process.env.ALPACA_API_SECRET || process.env.ALPACA_SECRET,
          isTestnet: process.env.NODE_ENV !== 'production'
        }
      }),
      ...(process.env.ALPACA_OAUTH_TOKEN && {
        alpacaOAuth: {
          accessToken: process.env.ALPACA_OAUTH_TOKEN
        }
      }),
      ...(process.env.MOOMOO_HOST && {
        moomoo: {
          host: process.env.MOOMOO_HOST,
          port: parseInt(process.env.MOOMOO_PORT || '11111', 10),
          apiKey: process.env.MOOMOO_API_KEY,
          apiSecret: process.env.MOOMOO_API_SECRET
        }
      }),
      ...(process.env.BINANCE_API_KEY && {
        binance: {
          apiKey: process.env.BINANCE_API_KEY,
          secret: process.env.BINANCE_SECRET,
          sandbox: process.env.NODE_ENV !== 'production'
        }
      }),
      ...(process.env.KRAKEN_API_KEY && {
        kraken: {
          apiKey: process.env.KRAKEN_API_KEY,
          privateKey: process.env.KRAKEN_PRIVATE_KEY,
          environment: process.env.KRAKEN_ENVIRONMENT || 'live'
        }
      })
    },
    ...(process.env.AWS_REGION && {
      aws: {
        region: process.env.AWS_REGION,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        },
        kms: {
          cmkId: process.env.AWS_KMS_CMK_ID
        }
      }
    }),
    api: {
      port: parseInt(process.env.PORT || '3000', 10),
      host: process.env.HOST || 'localhost',
      corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),
      rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
        max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10)
      },
      session: {
        secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
        name: process.env.SESSION_NAME || 'discord-trade-exec.sid',
        resave: false,
        saveUninitialized: false,
        cookie: {
          secure: process.env.NODE_ENV === 'production',
          httpOnly: true,
          maxAge: parseInt(process.env.SESSION_MAX_AGE || '86400000', 10)
        }
      }
    },
    discord: {
      token: process.env.DISCORD_BOT_TOKEN,
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET
    },
    urls: {
      dashboardUrl: process.env.DASHBOARD_URL || 'http://localhost:3000',
      frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000'
    }
  };
}

/**
 * Validate and load application configuration
 * @param {boolean} exitOnError - Exit process on validation error (default: true in production)
 * @returns {Object} Validated configuration object
 */
function loadAndValidateConfig(exitOnError = process.env.NODE_ENV === 'production') {
  const config = buildConfigFromEnv();
  const result = validateConfig(config, environmentSchema);

  if (!result.valid) {
    console.error('❌ Configuration Validation Failed:');
    console.error('');
    result.errors.forEach(error => {
      console.error(`  • ${error.field}: ${error.message}`);
    });
    console.error('');

    if (exitOnError) {
      console.error('💥 Cannot start application with invalid configuration');
      process.exit(1);
    } else {
      console.warn('⚠️  Continuing with invalid configuration (development mode)');
      return config;
    }
  }

  console.log('✅ Configuration validated successfully');

  // Warn if no brokers are configured
  const hasBrokers = config.brokers && Object.keys(config.brokers).length > 0;
  if (!hasBrokers) {
    console.warn('⚠️  No brokers configured via environment variables');
    console.warn('⚠️  Users will need to configure brokers via OAuth dashboard');
  }

  return result.config;
}

module.exports = {
  // Schemas
  databaseSchema,
  brokerCredentialsSchema,
  awsConfigSchema,
  apiConfigSchema,
  discordConfigSchema,
  urlConfigSchema,
  environmentSchema,

  // Validation functions
  validateConfig,
  buildConfigFromEnv,
  loadAndValidateConfig
};
