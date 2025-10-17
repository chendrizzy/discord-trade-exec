/**
 * Unit Tests for Broker API Endpoints
 * Tests Moomoo UI Support implementation (Task 3.1)
 */

const request = require('supertest');
const express = require('express');
const { BrokerFactory } = require('../../../brokers');
const User = require('../../../models/User');
const { getEncryptionService } = require('../../../services/encryption');

// Mock dependencies
jest.mock('../../../brokers');
jest.mock('../../../models/User');
jest.mock('../../../services/encryption');

// Import router after mocks
const brokersRouter = require('../brokers');

// Create test app
const app = express();
app.use(express.json());

// Mock authentication middleware
app.use((req, res, next) => {
  req.isAuthenticated = () => true;
  req.user = {
    id: 'test-user-id',
    _id: 'test-user-id' // Rate limiter uses _id
  };
  next();
});

app.use('/api/brokers', brokersRouter);

describe('Broker API Endpoints - Moomoo UI Support', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    // Clean up timers to prevent Jest open handles
    const { brokerCallTracker } = require('../../../middleware/rateLimiter');
    if (brokerCallTracker && brokerCallTracker.destroy) {
      brokerCallTracker.destroy();
    }
  });

  describe('GET /api/brokers', () => {
    test('should include credentialFields for Moomoo', async () => {
      // Mock BrokerFactory.getBrokers to return Moomoo with credentialFields
      BrokerFactory.getBrokers.mockReturnValue([
        {
          key: 'moomoo',
          name: 'Moomoo',
          type: 'stock',
          status: 'active',
          description: 'Modern mobile-first trading platform',
          features: ['stocks', 'options', 'paper-trading'],
          authMethods: ['api-key'],
          markets: ['US', 'HK'],
          accountTypes: ['individual', 'margin'],
          credentialFields: [
            {
              name: 'accountId',
              type: 'text',
              label: 'Account ID',
              placeholder: 'Your Moomoo account ID',
              required: true,
              helpText: 'The account identifier for your Moomoo trading account'
            },
            {
              name: 'password',
              type: 'password',
              label: 'Password',
              placeholder: 'Your Moomoo account password',
              required: true,
              helpText: 'Trading password for your Moomoo account'
            },
            {
              name: 'host',
              type: 'text',
              label: 'OpenD Gateway Host',
              placeholder: '127.0.0.1',
              defaultValue: '127.0.0.1',
              required: true,
              helpText: 'Local OpenD gateway host address (default: 127.0.0.1)'
            },
            {
              name: 'port',
              type: 'number',
              label: 'OpenD Gateway Port',
              placeholder: '11111',
              defaultValue: 11111,
              required: true,
              helpText: 'Local OpenD gateway port (default: 11111)'
            }
          ],
          prerequisites: {
            requiresOpenDRunning: true,
            setupGuideUrl: 'docs/MOOMOO_OPEND_TROUBLESHOOTING.md',
            warningMessage: 'Moomoo requires OpenD Gateway running locally'
          }
        },
        {
          key: 'alpaca',
          name: 'Alpaca',
          type: 'stock',
          status: 'active',
          features: ['stocks', 'etfs'],
          authMethods: ['api-key', 'oauth'],
          markets: ['US'],
          accountTypes: ['individual']
        }
      ]);

      BrokerFactory.getStats.mockReturnValue({
        total: 2,
        active: 2,
        stock: 2,
        crypto: 0
      });

      const response = await request(app).get('/api/brokers').expect(200);

      // Verify response structure
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('brokers');
      expect(response.body.brokers).toHaveLength(2);

      // Find Moomoo in response
      const moomooBroker = response.body.brokers.find(b => b.key === 'moomoo');
      expect(moomooBroker).toBeDefined();

      // Verify credentialFields are included
      expect(moomooBroker.credentialFields).toBeDefined();
      expect(moomooBroker.credentialFields).toHaveLength(4);
      expect(moomooBroker.credentialFields[0]).toMatchObject({
        name: 'accountId',
        type: 'text',
        required: true
      });

      // Verify prerequisites are included
      expect(moomooBroker.prerequisites).toBeDefined();
      expect(moomooBroker.prerequisites.requiresOpenDRunning).toBe(true);
    });

    test('should handle brokers without credentialFields (backward compatibility)', async () => {
      BrokerFactory.getBrokers.mockReturnValue([
        {
          key: 'alpaca',
          name: 'Alpaca',
          type: 'stock',
          status: 'active',
          features: ['stocks'],
          authMethods: ['api-key'],
          markets: ['US'],
          accountTypes: ['individual']
          // No credentialFields or prerequisites
        }
      ]);

      BrokerFactory.getStats.mockReturnValue({ total: 1, active: 1 });

      const response = await request(app).get('/api/brokers').expect(200);

      const alpacaBroker = response.body.brokers.find(b => b.key === 'alpaca');
      expect(alpacaBroker).toBeDefined();
      // Should be undefined, not cause errors
      expect(alpacaBroker.credentialFields).toBeUndefined();
      expect(alpacaBroker.prerequisites).toBeUndefined();
    });
  });

  describe('GET /api/brokers/:brokerKey', () => {
    test('should include prerequisites for Moomoo', async () => {
      BrokerFactory.getBrokerInfo.mockReturnValue({
        key: 'moomoo',
        name: 'Moomoo',
        type: 'stock',
        status: 'active',
        description: 'Modern mobile-first trading platform',
        features: ['stocks', 'options'],
        authMethods: ['api-key'],
        markets: ['US', 'HK'],
        accountTypes: ['individual', 'margin'],
        docs: { apiDocs: 'https://openapi.moomoo.com' },
        credentialFields: [
          { name: 'accountId', type: 'text', required: true },
          { name: 'password', type: 'password', required: true },
          { name: 'host', type: 'text', defaultValue: '127.0.0.1', required: true },
          { name: 'port', type: 'number', defaultValue: 11111, required: true }
        ],
        prerequisites: {
          requiresOpenDRunning: true,
          setupGuideUrl: 'docs/MOOMOO_OPEND_TROUBLESHOOTING.md',
          warningMessage: 'Moomoo requires OpenD Gateway running locally',
          installationSteps: [
            'Download OpenD Gateway from https://openapi.moomoo.com',
            'Install OpenD on your local computer',
            'Start OpenD Gateway service (default port: 11111)'
          ]
        }
      });

      const response = await request(app).get('/api/brokers/moomoo').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.broker).toBeDefined();
      expect(response.body.broker.key).toBe('moomoo');

      // Verify prerequisites included
      expect(response.body.broker.prerequisites).toBeDefined();
      expect(response.body.broker.prerequisites.requiresOpenDRunning).toBe(true);
      expect(response.body.broker.prerequisites.installationSteps).toHaveLength(3);

      // Verify credentialFields included
      expect(response.body.broker.credentialFields).toBeDefined();
      expect(response.body.broker.credentialFields).toHaveLength(4);
    });

    test('should return 404 for non-existent broker', async () => {
      BrokerFactory.getBrokerInfo.mockReturnValue(null);

      const response = await request(app).get('/api/brokers/nonexistent').expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/brokers/configure', () => {
    test('should apply Moomoo default values for host and port', async () => {
      const mockUser = {
        _id: 'user123',
        communityId: 'community123',
        brokerConfigs: {},
        save: jest.fn().mockResolvedValue(true)
      };

      User.findById.mockResolvedValue(mockUser);

      BrokerFactory.validateCredentials.mockReturnValue({
        valid: true,
        errors: []
      });

      const mockEncryptionService = {
        encryptCredential: jest.fn().mockResolvedValue('encrypted-credentials-string')
      };
      getEncryptionService.mockReturnValue(mockEncryptionService);

      // Send request WITHOUT host/port (should apply defaults)
      const response = await request(app)
        .post('/api/brokers/configure')
        .send({
          brokerKey: 'moomoo',
          brokerType: 'stock',
          authMethod: 'api-key',
          credentials: {
            accountId: '12345678',
            password: 'testPassword'
            // No host or port provided
          },
          environment: 'testnet'
        })
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify default values were applied before validation
      expect(BrokerFactory.validateCredentials).toHaveBeenCalledWith(
        'moomoo',
        expect.objectContaining({
          accountId: '12345678',
          password: 'testPassword',
          host: '127.0.0.1', // DEFAULT APPLIED
          port: 11111 // DEFAULT APPLIED
        })
      );

      // Verify encryption was called with defaults
      expect(mockEncryptionService.encryptCredential).toHaveBeenCalledWith(
        'community123',
        expect.objectContaining({
          host: '127.0.0.1',
          port: 11111
        })
      );
    });

    test('should preserve custom host/port values for Moomoo', async () => {
      const mockUser = {
        _id: 'user123',
        communityId: 'community123',
        brokerConfigs: {},
        save: jest.fn().mockResolvedValue(true)
      };

      User.findById.mockResolvedValue(mockUser);
      BrokerFactory.validateCredentials.mockReturnValue({ valid: true, errors: [] });

      const mockEncryptionService = {
        encryptCredential: jest.fn().mockResolvedValue('encrypted-credentials')
      };
      getEncryptionService.mockReturnValue(mockEncryptionService);

      // Send request WITH custom host/port
      await request(app)
        .post('/api/brokers/configure')
        .send({
          brokerKey: 'moomoo',
          brokerType: 'stock',
          authMethod: 'api-key',
          credentials: {
            accountId: '12345678',
            password: 'testPassword',
            host: '192.168.1.100', // Custom host
            port: 22222 // Custom port
          },
          environment: 'testnet'
        })
        .expect(200);

      // Verify custom values were preserved
      expect(mockEncryptionService.encryptCredential).toHaveBeenCalledWith(
        'community123',
        expect.objectContaining({
          host: '192.168.1.100',
          port: 22222
        })
      );
    });

    test('should NOT apply defaults for non-Moomoo brokers', async () => {
      const mockUser = {
        _id: 'user123',
        communityId: 'community123',
        brokerConfigs: {},
        save: jest.fn().mockResolvedValue(true)
      };

      User.findById.mockResolvedValue(mockUser);
      BrokerFactory.validateCredentials.mockReturnValue({ valid: true, errors: [] });

      const mockEncryptionService = {
        encryptCredential: jest.fn().mockResolvedValue('encrypted-credentials')
      };
      getEncryptionService.mockReturnValue(mockEncryptionService);

      await request(app)
        .post('/api/brokers/configure')
        .send({
          brokerKey: 'alpaca',
          brokerType: 'stock',
          authMethod: 'api-key',
          credentials: {
            apiKey: 'test-key',
            apiSecret: 'test-secret'
          },
          environment: 'testnet'
        })
        .expect(200);

      // Verify NO host/port added for Alpaca
      expect(mockEncryptionService.encryptCredential).toHaveBeenCalledWith(
        'community123',
        expect.objectContaining({
          apiKey: 'test-key',
          apiSecret: 'test-secret'
        })
      );

      expect(mockEncryptionService.encryptCredential).toHaveBeenCalledWith(
        'community123',
        expect.not.objectContaining({
          host: expect.anything(),
          port: expect.anything()
        })
      );
    });
  });

  describe('POST /api/brokers/test', () => {
    test('should apply Moomoo default values before testing connection', async () => {
      BrokerFactory.validateCredentials.mockReturnValue({
        valid: true,
        errors: []
      });

      BrokerFactory.testConnection.mockResolvedValue({
        success: true,
        message: 'Connection successful',
        broker: 'moomoo',
        balance: '$100,000.00'
      });

      const response = await request(app)
        .post('/api/brokers/test')
        .send({
          brokerKey: 'moomoo',
          credentials: {
            accountId: '12345678',
            password: 'testPassword'
            // No host or port
          },
          options: { isTestnet: true }
        })
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify defaults applied before validation
      expect(BrokerFactory.validateCredentials).toHaveBeenCalledWith(
        'moomoo',
        expect.objectContaining({
          host: '127.0.0.1',
          port: 11111
        })
      );

      // Verify defaults passed to testConnection
      expect(BrokerFactory.testConnection).toHaveBeenCalledWith(
        'moomoo',
        expect.objectContaining({
          host: '127.0.0.1',
          port: 11111
        }),
        { isTestnet: true }
      );
    });

    test('should handle connection test failure gracefully', async () => {
      BrokerFactory.validateCredentials.mockReturnValue({ valid: true, errors: [] });
      BrokerFactory.testConnection.mockRejectedValue(new Error('OpenD Gateway not running'));

      const response = await request(app)
        .post('/api/brokers/test')
        .send({
          brokerKey: 'moomoo',
          credentials: {
            accountId: '12345678',
            password: 'testPassword'
          }
        })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Connection test failed');
    });
  });

  describe('POST /api/brokers/test/:brokerKey', () => {
    test('should apply Moomoo defaults after credential decryption', async () => {
      const mockUser = {
        _id: 'user123',
        communityId: 'community123',
        brokerConfigs: {
          moomoo: {
            brokerKey: 'moomoo',
            brokerType: 'stock',
            authMethod: 'api-key',
            environment: 'testnet',
            credentials: 'encrypted-credentials-string',
            lastVerified: new Date()
          }
        },
        save: jest.fn().mockResolvedValue(true)
      };

      User.findById.mockResolvedValue(mockUser);

      const mockEncryptionService = {
        decryptCredential: jest.fn().mockResolvedValue({
          accountId: '12345678',
          password: 'testPassword'
          // Decrypted credentials missing host/port (old config)
        })
      };
      getEncryptionService.mockReturnValue(mockEncryptionService);

      BrokerFactory.testConnection.mockResolvedValue({
        success: true,
        message: 'Connection successful',
        broker: 'moomoo',
        balance: '$100,000.00'
      });

      const response = await request(app).post('/api/brokers/test/moomoo').expect(200);

      expect(response.body.success).toBe(true);

      // Verify defaults applied AFTER decryption
      expect(BrokerFactory.testConnection).toHaveBeenCalledWith(
        'moomoo',
        expect.objectContaining({
          accountId: '12345678',
          password: 'testPassword',
          host: '127.0.0.1', // DEFENSIVE DEFAULT APPLIED
          port: 11111 // DEFENSIVE DEFAULT APPLIED
        }),
        { isTestnet: true }
      );

      // Verify lastVerified updated on success
      expect(mockUser.save).toHaveBeenCalled();
      expect(mockUser.brokerConfigs.moomoo.lastVerified).toBeInstanceOf(Date);
    });

    test('should preserve existing host/port from decrypted credentials', async () => {
      const mockUser = {
        _id: 'user123',
        communityId: 'community123',
        brokerConfigs: {
          moomoo: {
            credentials: 'encrypted',
            environment: 'testnet'
          }
        },
        save: jest.fn().mockResolvedValue(true)
      };

      User.findById.mockResolvedValue(mockUser);

      const mockEncryptionService = {
        decryptCredential: jest.fn().mockResolvedValue({
          accountId: '12345678',
          password: 'testPassword',
          host: '192.168.1.100',
          port: 22222
        })
      };
      getEncryptionService.mockReturnValue(mockEncryptionService);

      BrokerFactory.testConnection.mockResolvedValue({
        success: true,
        message: 'Connected',
        broker: 'moomoo'
      });

      await request(app).post('/api/brokers/test/moomoo').expect(200);

      // Verify custom values preserved (NOT overwritten with defaults)
      expect(BrokerFactory.testConnection).toHaveBeenCalledWith(
        'moomoo',
        expect.objectContaining({
          host: '192.168.1.100',
          port: 22222
        }),
        expect.any(Object)
      );
    });

    test('should return 404 if broker config not found', async () => {
      const mockUser = {
        _id: 'user123',
        brokerConfigs: {} // No moomoo config
      };

      User.findById.mockResolvedValue(mockUser);

      const response = await request(app).post('/api/brokers/test/moomoo').expect(404);

      expect(response.body.success).toBe(false);
    });

    test('should handle decryption failure gracefully', async () => {
      const mockUser = {
        _id: 'user123',
        communityId: 'community123',
        brokerConfigs: {
          moomoo: { credentials: 'encrypted' }
        }
      };

      User.findById.mockResolvedValue(mockUser);

      const mockEncryptionService = {
        decryptCredential: jest.fn().mockRejectedValue(new Error('KMS decryption failed'))
      };
      getEncryptionService.mockReturnValue(mockEncryptionService);

      const response = await request(app).post('/api/brokers/test/moomoo').expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Failed to decrypt credentials');
    });
  });
});
