// External dependencies
const Joi = require('joi');

// Internal utilities and services
const {
  databaseSchema,
  brokerCredentialsSchema,
  awsConfigSchema,
  apiConfigSchema,
  discordConfigSchema,
  urlConfigSchema,
  environmentSchema,
  validateConfig,
  buildConfigFromEnv
} = require('../../src/config/validator');

describe('Configuration Validator', () => {
  describe('Database Schema Validation', () => {
    test('should validate valid database configuration', () => {
      const config = {
        uri: 'mongodb://localhost:27017/testdb',
        options: {
          useNewUrlParser: true,
          useUnifiedTopology: true,
          maxPoolSize: 10
        }
      };

      const result = validateConfig(config, databaseSchema);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject invalid database URI', () => {
      const config = {
        uri: 'not-a-valid-uri'
      };

      const result = validateConfig(config, databaseSchema);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should require database URI', () => {
      const config = {};

      const result = validateConfig(config, databaseSchema);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.field === 'uri')).toBe(true);
    });
  });

  describe('Broker Credentials Schema Validation', () => {
    test('should validate Alpaca credentials', () => {
      const config = {
        alpaca: {
          apiKey: 'PK1234567890',
          apiSecret: 'SK1234567890',
          isTestnet: true
        }
      };

      const result = validateConfig(config, brokerCredentialsSchema);
      expect(result.valid).toBe(true);
    });

    test('should validate multiple broker configurations', () => {
      const config = {
        alpaca: {
          apiKey: 'PK1234567890',
          apiSecret: 'SK1234567890',
          isTestnet: true
        },
        moomoo: {
          host: '127.0.0.1',
          port: 11111
        },
        binance: {
          apiKey: 'BINANCE123',
          secret: 'BINANCESECRET123',
          sandbox: true
        }
      };

      const result = validateConfig(config, brokerCredentialsSchema);
      expect(result.valid).toBe(true);
    });

    test('should require at least one broker configuration', () => {
      const config = {};

      const result = validateConfig(config, brokerCredentialsSchema);
      expect(result.valid).toBe(false);
    });

    test('should validate Moomoo default values', () => {
      const config = {
        moomoo: {}
      };

      const result = validateConfig(config, brokerCredentialsSchema);
      expect(result.valid).toBe(true);
      expect(result.config.moomoo.host).toBe('127.0.0.1');
      expect(result.config.moomoo.port).toBe(11111);
    });
  });

  describe('AWS Configuration Schema Validation', () => {
    test('should validate complete AWS configuration', () => {
      const config = {
        region: 'us-east-1',
        credentials: {
          accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
          secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
        },
        kms: {
          cmkId: '12345678-1234-1234-1234-123456789012'
        }
      };

      const result = validateConfig(config, awsConfigSchema);
      expect(result.valid).toBe(true);
    });

    test('should reject invalid AWS region', () => {
      const config = {
        region: 'invalid-region',
        credentials: {
          accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
          secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
        },
        kms: {
          cmkId: '12345678-1234-1234-1234-123456789012'
        }
      };

      const result = validateConfig(config, awsConfigSchema);
      expect(result.valid).toBe(false);
    });

    test('should validate KMS CMK ID format', () => {
      const config = {
        region: 'us-east-1',
        credentials: {
          accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
          secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
        },
        kms: {
          cmkId: 'not-a-valid-uuid'
        }
      };

      const result = validateConfig(config, awsConfigSchema);
      expect(result.valid).toBe(false);
    });
  });

  describe('API Configuration Schema Validation', () => {
    test('should validate complete API configuration', () => {
      const config = {
        port: 3000,
        host: 'localhost',
        corsOrigins: ['http://localhost:3000', 'http://localhost:5000'],
        session: {
          secret: 'a-very-long-secret-key-with-at-least-32-characters',
          cookie: {
            secure: true,
            httpOnly: true,
            maxAge: 86400000
          }
        }
      };

      const result = validateConfig(config, apiConfigSchema);
      expect(result.valid).toBe(true);
    });

    test('should reject session secret shorter than 32 characters', () => {
      const config = {
        port: 3000,
        host: 'localhost',
        corsOrigins: ['http://localhost:3000'],
        session: {
          secret: 'short-secret'
        }
      };

      const result = validateConfig(config, apiConfigSchema);
      expect(result.valid).toBe(false);
    });

    test('should require at least one CORS origin', () => {
      const config = {
        port: 3000,
        host: 'localhost',
        corsOrigins: [],
        session: {
          secret: 'a-very-long-secret-key-with-at-least-32-characters'
        }
      };

      const result = validateConfig(config, apiConfigSchema);
      expect(result.valid).toBe(false);
    });
  });

  describe('Discord Configuration Schema Validation', () => {
    test('should validate complete Discord configuration', () => {
      const config = {
        token: 'DISCORD_BOT_TOKEN_FOR_TESTING_ONLY_NOT_REAL',
        clientId: '123456789012345678',
        clientSecret: 'a1b2c3d4e5f6g7h8i9j0'
      };

      const result = validateConfig(config, discordConfigSchema);
      expect(result.valid).toBe(true);
    });

    test('should validate Discord client ID format', () => {
      const config = {
        token: 'DISCORD_BOT_TOKEN_FOR_TESTING_ONLY_NOT_REAL',
        clientId: 'invalid-id',
        clientSecret: 'a1b2c3d4e5f6g7h8i9j0'
      };

      const result = validateConfig(config, discordConfigSchema);
      expect(result.valid).toBe(false);
    });
  });

  describe('URL Configuration Schema Validation', () => {
    test('should validate URL configuration', () => {
      const config = {
        dashboardUrl: 'http://localhost:3000',
        frontendUrl: 'http://localhost:3000'
      };

      const result = validateConfig(config, urlConfigSchema);
      expect(result.valid).toBe(true);
    });

    test('should reject invalid URLs', () => {
      const config = {
        dashboardUrl: 'not-a-url',
        frontendUrl: 'also-not-a-url'
      };

      const result = validateConfig(config, urlConfigSchema);
      expect(result.valid).toBe(false);
    });
  });

  describe('Environment Schema Validation', () => {
    test('should validate complete production environment', () => {
      const config = {
        nodeEnv: 'production',
        demoMode: false,
        database: {
          uri: 'mongodb://localhost:27017/testdb'
        },
        brokers: {
          alpaca: {
            apiKey: 'PK1234567890',
            apiSecret: 'SK1234567890',
            isTestnet: false
          }
        },
        aws: {
          region: 'us-east-1',
          credentials: {
            accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
            secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
          },
          kms: {
            cmkId: '12345678-1234-1234-1234-123456789012'
          }
        },
        api: {
          port: 3000,
          host: 'localhost',
          corsOrigins: ['http://localhost:3000'],
          session: {
            secret: 'a-very-long-secret-key-with-at-least-32-characters'
          }
        },
        discord: {
          token: 'DISCORD_BOT_TOKEN_FOR_TESTING_ONLY_NOT_REAL',
          clientId: '123456789012345678',
          clientSecret: 'a1b2c3d4e5f6g7h8i9j0'
        },
        urls: {
          dashboardUrl: 'http://localhost:3000',
          frontendUrl: 'http://localhost:3000'
        }
      };

      const result = validateConfig(config, environmentSchema);
      expect(result.valid).toBe(true);
    });

    test('should require AWS configuration in production', () => {
      const config = {
        nodeEnv: 'production',
        database: {
          uri: 'mongodb://localhost:27017/testdb'
        },
        brokers: {
          alpaca: {
            apiKey: 'PK1234567890',
            apiSecret: 'SK1234567890'
          }
        },
        api: {
          port: 3000,
          host: 'localhost',
          corsOrigins: ['http://localhost:3000'],
          session: {
            secret: 'a-very-long-secret-key-with-at-least-32-characters'
          }
        },
        discord: {
          token: 'DISCORD_BOT_TOKEN_FOR_TESTING_ONLY_NOT_REAL',
          clientId: '123456789012345678',
          clientSecret: 'a1b2c3d4e5f6g7h8i9j0'
        },
        urls: {
          dashboardUrl: 'http://localhost:3000',
          frontendUrl: 'http://localhost:3000'
        }
      };

      const result = validateConfig(config, environmentSchema);
      expect(result.valid).toBe(false);
    });

    test('should allow missing AWS in development', () => {
      const config = {
        nodeEnv: 'development',
        database: {
          uri: 'mongodb://localhost:27017/testdb'
        },
        brokers: {
          alpaca: {
            apiKey: 'PK1234567890',
            apiSecret: 'SK1234567890'
          }
        },
        api: {
          port: 3000,
          host: 'localhost',
          corsOrigins: ['http://localhost:3000'],
          session: {
            secret: 'a-very-long-secret-key-with-at-least-32-characters'
          }
        },
        discord: {
          token: 'DISCORD_BOT_TOKEN_FOR_TESTING_ONLY_NOT_REAL',
          clientId: '123456789012345678',
          clientSecret: 'a1b2c3d4e5f6g7h8i9j0'
        },
        urls: {
          dashboardUrl: 'http://localhost:3000',
          frontendUrl: 'http://localhost:3000'
        }
      };

      const result = validateConfig(config, environmentSchema);
      expect(result.valid).toBe(true);
    });
  });

  describe('buildConfigFromEnv()', () => {
    let originalEnv;

    beforeEach(() => {
      // Save original env
      originalEnv = { ...process.env };
    });

    afterEach(() => {
      // Restore original env
      process.env = originalEnv;
    });

    test('should build configuration from environment variables', () => {
      process.env.NODE_ENV = 'production';
      process.env.MONGODB_URI = 'mongodb://localhost:27017/testdb';
      process.env.ALPACA_API_KEY = 'PK1234567890';
      process.env.ALPACA_SECRET = 'SK1234567890';
      process.env.PORT = '3000';
      process.env.CORS_ORIGINS = 'http://localhost:3000,http://localhost:5000';
      process.env.SESSION_SECRET = 'a-very-long-secret-key-with-at-least-32-characters';
      process.env.DISCORD_BOT_TOKEN = 'DISCORD_BOT_TOKEN_FOR_TESTING_ONLY_NOT_REAL';
      process.env.DISCORD_CLIENT_ID = '123456789012345678';
      process.env.DISCORD_CLIENT_SECRET = 'a1b2c3d4e5f6g7h8i9j0';
      process.env.DASHBOARD_URL = 'http://localhost:3000';
      process.env.FRONTEND_URL = 'http://localhost:3000';

      const config = buildConfigFromEnv();

      expect(config.nodeEnv).toBe('production');
      expect(config.database.uri).toBe('mongodb://localhost:27017/testdb');
      expect(config.brokers.alpaca).toBeDefined();
      expect(config.brokers.alpaca.apiKey).toBe('PK1234567890');
      expect(config.api.port).toBe(3000);
      expect(config.api.corsOrigins).toHaveLength(2);
      expect(config.discord.token).toBe('DISCORD_BOT_TOKEN_FOR_TESTING_ONLY_NOT_REAL');
    });

    test('should use default values when environment variables are missing', () => {
      // Clear all broker-related env vars
      delete process.env.ALPACA_API_KEY;
      delete process.env.BINANCE_API_KEY;
      delete process.env.MOOMOO_HOST;
      delete process.env.MONGODB_URI; // Also clear database URI to test defaults
      delete process.env.PORT;

      const config = buildConfigFromEnv();

      // NODE_ENV will be 'test' during Jest test runs, or 'development' if not set
      expect(['development', 'test']).toContain(config.nodeEnv);
      expect(config.database.uri).toBe('mongodb://localhost:27017/discord-trade-exec');
      expect(config.api.port).toBe(3000);
      expect(config.api.host).toBe('localhost');
    });

    test('should parse numeric environment variables correctly', () => {
      process.env.PORT = '5000';
      process.env.MONGODB_POOL_SIZE = '20';
      process.env.MOOMOO_PORT = '22222';

      const config = buildConfigFromEnv();

      expect(config.api.port).toBe(5000);
      expect(config.database.options.maxPoolSize).toBe(20);
      if (config.brokers.moomoo) {
        expect(config.brokers.moomoo.port).toBe(22222);
      }
    });
  });
});
