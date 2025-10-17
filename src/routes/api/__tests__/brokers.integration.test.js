/**
 * Integration Tests for Broker API Endpoints
 * Tests multi-broker support with rate limiting and premium tier gating
 */

const request = require('supertest');
const express = require('express');
const { BrokerFactory } = require('../../../brokers');
const User = require('../../../models/User');
const { getEncryptionService } = require('../../../services/encryption');
const analyticsEventService = require('../../../services/analytics/AnalyticsEventService');
const { checkBrokerRateLimit, brokerCallTracker } = require('../../../middleware/rateLimiter');
const { checkBrokerAccess, requirePremiumBroker } = require('../../../middleware/premiumGating');

// Mock dependencies
jest.mock('../../../brokers');
jest.mock('../../../models/User');
jest.mock('../../../services/encryption');
jest.mock('../../../services/analytics/AnalyticsEventService');

// Import router after mocks
const brokersRouter = require('../brokers');

describe('Broker API Integration Tests', () => {
  let app;
  let mockUser;

  beforeEach(() => {
    // Create fresh Express app for each test
    app = express();
    app.use(express.json());

    // Default mock user (free tier)
    mockUser = {
      _id: 'user123',
      communityId: 'community123',
      discordUsername: 'testuser',
      subscription: {
        tier: 'free',
        status: 'active',
        stripeCustomerId: 'cus_test',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      },
      brokerConfigs: new Map(),
      limits: {
        signalsPerDay: 10,
        signalsUsedToday: 0,
        maxBrokers: 1,
        lastReset: new Date()
      },
      save: jest.fn().mockResolvedValue(true)
    };

    // Mock authentication middleware
    app.use((req, res, next) => {
      req.isAuthenticated = () => true;
      req.user = mockUser;
      next();
    });

    app.use('/api/brokers', brokersRouter);

    // Clear mocks
    jest.clearAllMocks();

    // Mock BrokerFactory.getBrokerInfo to return broker display names
    BrokerFactory.getBrokerInfo = jest.fn().mockImplementation((brokerKey) => {
      const brokerNames = {
        alpaca: { name: 'Alpaca', key: 'alpaca' },
        ibkr: { name: 'Interactive Brokers', key: 'ibkr' },
        schwab: { name: 'Charles Schwab', key: 'schwab' },
        moomoo: { name: 'Moomoo', key: 'moomoo' },
        binance: { name: 'Binance', key: 'binance' },
        kraken: { name: 'Kraken', key: 'kraken' },
        okx: { name: 'OKX', key: 'okx' }
      };
      return brokerNames[brokerKey] || null;
    });

    // Mock BrokerFactory.compareFeesForSymbol
    BrokerFactory.compareFeesForSymbol = jest.fn();

    // Clear rate limiter state
    if (brokerCallTracker && brokerCallTracker.tracker) {
      brokerCallTracker.tracker.clear();
    }
  });

  describe('Premium Broker Access Control', () => {
    test('should allow free tier users to configure Alpaca', async () => {
      BrokerFactory.validateCredentials.mockReturnValue({ valid: true, errors: [] });

      const mockEncryptionService = {
        encryptCredential: jest.fn().mockResolvedValue('encrypted-credentials')
      };
      getEncryptionService.mockReturnValue(mockEncryptionService);

      User.findById.mockResolvedValue(mockUser);

      const response = await request(app)
        .post('/api/brokers/configure')
        .send({
          brokerKey: 'alpaca',
          brokerType: 'stock',
          authMethod: 'api-key',
          credentials: {
            apiKey: 'test-key',
            apiSecret: 'test-secret'
          },
          environment: 'paper'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Alpaca');
    });

    test('should block free tier users from configuring IBKR', async () => {
      BrokerFactory.validateCredentials.mockReturnValue({ valid: true, errors: [] });

      const response = await request(app)
        .post('/api/brokers/configure')
        .send({
          brokerKey: 'ibkr',
          brokerType: 'stock',
          authMethod: 'tws',
          credentials: {
            host: '127.0.0.1',
            port: 7497,
            clientId: 1
          },
          environment: 'paper'
        })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('BROKER_ACCESS_DENIED');
      expect(response.body.message).toContain('Premium');
      expect(response.body.upgradeRequired).toBe('premium');
    });

    test('should block free tier users from configuring Schwab', async () => {
      const response = await request(app)
        .post('/api/brokers/configure')
        .send({
          brokerKey: 'schwab',
          brokerType: 'stock',
          authMethod: 'oauth',
          credentials: {
            appKey: 'test-key',
            appSecret: 'test-secret'
          },
          environment: 'live'
        })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Premium');
      expect(response.body.upgradeCTA).toContain('Upgrade to Premium');
    });

    test('should allow premium tier users to configure IBKR', async () => {
      // Upgrade user to premium
      mockUser.subscription.tier = 'premium';
      mockUser.limits.maxBrokers = 10;

      BrokerFactory.validateCredentials.mockReturnValue({ valid: true, errors: [] });

      const mockEncryptionService = {
        encryptCredential: jest.fn().mockResolvedValue('encrypted-ibkr-credentials')
      };
      getEncryptionService.mockReturnValue(mockEncryptionService);

      User.findById.mockResolvedValue(mockUser);

      analyticsEventService.trackBrokerConnected = jest.fn().mockResolvedValue({ success: true });

      const response = await request(app)
        .post('/api/brokers/configure')
        .send({
          brokerKey: 'ibkr',
          brokerType: 'stock',
          authMethod: 'tws',
          credentials: {
            host: '127.0.0.1',
            port: 7497,
            clientId: 1
          },
          environment: 'paper'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockEncryptionService.encryptCredential).toHaveBeenCalled();
      expect(analyticsEventService.trackBrokerConnected).toHaveBeenCalledWith(
        mockUser._id,
        expect.objectContaining({
          broker: 'ibkr',
          accountType: 'stock'
        }),
        expect.anything()
      );
    });

    test('should allow premium tier users to configure Schwab', async () => {
      mockUser.subscription.tier = 'premium';
      mockUser.limits.maxBrokers = 10;

      BrokerFactory.validateCredentials.mockReturnValue({ valid: true, errors: [] });

      const mockEncryptionService = {
        encryptCredential: jest.fn().mockResolvedValue('encrypted-schwab-credentials')
      };
      getEncryptionService.mockReturnValue(mockEncryptionService);

      User.findById.mockResolvedValue(mockUser);

      const response = await request(app)
        .post('/api/brokers/configure')
        .send({
          brokerKey: 'schwab',
          brokerType: 'stock',
          authMethod: 'oauth',
          credentials: {
            appKey: 'test-key',
            appSecret: 'test-secret',
            redirectUri: 'https://127.0.0.1:8443/callback'
          },
          environment: 'live'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockEncryptionService.encryptCredential).toHaveBeenCalled();
    });
  });

  describe('Broker Limit Enforcement', () => {
    test('should block free tier users from adding second broker', async () => {
      // User already has 1 broker configured
      mockUser.brokerConfigs.set('alpaca', {
        brokerKey: 'alpaca',
        brokerType: 'stock',
        authMethod: 'api-key',
        environment: 'paper'
      });

      BrokerFactory.validateCredentials.mockReturnValue({ valid: true, errors: [] });

      const response = await request(app)
        .post('/api/brokers/configure')
        .send({
          brokerKey: 'binance',
          brokerType: 'crypto',
          authMethod: 'api-key',
          credentials: {
            apiKey: 'test-key',
            apiSecret: 'test-secret'
          },
          environment: 'testnet'
        })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('BROKER_ACCESS_DENIED');
      expect(response.body.message).toContain('Broker limit reached');
      expect(response.body.maxBrokers).toBe(1);
      expect(response.body.currentBrokerCount).toBe(1);
    });

    test('should allow pro tier users to configure up to 5 brokers', async () => {
      mockUser.subscription.tier = 'pro';
      mockUser.limits.maxBrokers = 5;

      // User has 4 brokers already
      for (let i = 1; i <= 4; i++) {
        mockUser.brokerConfigs.set(`broker${i}`, {
          brokerKey: `broker${i}`,
          brokerType: 'crypto'
        });
      }

      BrokerFactory.validateCredentials.mockReturnValue({ valid: true, errors: [] });

      const mockEncryptionService = {
        encryptCredential: jest.fn().mockResolvedValue('encrypted')
      };
      getEncryptionService.mockReturnValue(mockEncryptionService);

      User.findById.mockResolvedValue(mockUser);

      const response = await request(app)
        .post('/api/brokers/configure')
        .send({
          brokerKey: 'kraken',
          brokerType: 'crypto',
          authMethod: 'api-key',
          credentials: {
            apiKey: 'test-key',
            privateKey: 'test-private'
          },
          environment: 'live'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should block pro tier users from exceeding 5 broker limit', async () => {
      mockUser.subscription.tier = 'pro';
      mockUser.limits.maxBrokers = 5;

      // User already has 5 brokers
      for (let i = 1; i <= 5; i++) {
        mockUser.brokerConfigs.set(`broker${i}`, {
          brokerKey: `broker${i}`,
          brokerType: 'crypto'
        });
      }

      const response = await request(app)
        .post('/api/brokers/configure')
        .send({
          brokerKey: 'okx',
          brokerType: 'crypto',
          authMethod: 'api-key',
          credentials: {
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            passphrase: 'test-pass'
          },
          environment: 'live'
        })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Broker limit reached');
      expect(response.body.upgradeRequired).toBe('premium');
    });
  });

  describe('Rate Limiting', () => {
    test('should enforce IBKR rate limit (50 requests/second)', async () => {
      mockUser.subscription.tier = 'premium';
      mockUser.limits.maxBrokers = 10;

      mockUser.brokerConfigs.set('ibkr', {
        brokerKey: 'ibkr',
        credentials: 'encrypted',
        environment: 'paper'
      });

      User.findById.mockResolvedValue(mockUser);

      const mockEncryptionService = {
        decryptCredential: jest.fn().mockResolvedValue({
          host: '127.0.0.1',
          port: 7497,
          clientId: 1
        })
      };
      getEncryptionService.mockReturnValue(mockEncryptionService);

      BrokerFactory.testConnection.mockResolvedValue({
        success: true,
        message: 'Connected',
        broker: 'ibkr',
        balance: '$100,000'
      });

      // Make 50 rapid requests (at the limit)
      const requests = [];
      for (let i = 0; i < 50; i++) {
        requests.push(
          request(app)
            .post('/api/brokers/test/ibkr')
            .expect(200)
        );
      }

      await Promise.all(requests);

      // 51st request should be rate limited
      const response = await request(app)
        .post('/api/brokers/test/ibkr')
        .expect(429);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('RATE_LIMIT_EXCEEDED');
      expect(response.body.message).toContain('IBKR');
      expect(response.body.retryAfter).toBeGreaterThan(0);
      expect(response.headers['retry-after']).toBeDefined();
    });

    test('should enforce Schwab rate limit (120 requests/minute)', async () => {
      mockUser.subscription.tier = 'premium';
      mockUser.limits.maxBrokers = 10;

      mockUser.brokerConfigs.set('schwab', {
        brokerKey: 'schwab',
        credentials: 'encrypted',
        environment: 'live'
      });

      User.findById.mockResolvedValue(mockUser);

      const mockEncryptionService = {
        decryptCredential: jest.fn().mockResolvedValue({
          appKey: 'test-key',
          appSecret: 'test-secret',
          accessToken: 'token',
          refreshToken: 'refresh'
        })
      };
      getEncryptionService.mockReturnValue(mockEncryptionService);

      BrokerFactory.testConnection.mockResolvedValue({
        success: true,
        message: 'Connected',
        broker: 'schwab'
      });

      // Make 120 requests (at the limit)
      const requests = [];
      for (let i = 0; i < 120; i++) {
        requests.push(
          request(app)
            .post('/api/brokers/test/schwab')
            .expect(200)
        );
      }

      await Promise.all(requests);

      // 121st request should be rate limited
      const response = await request(app)
        .post('/api/brokers/test/schwab')
        .expect(429);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Schwab');
      expect(response.body.window).toBe('60s');
    });

    test('should enforce Alpaca rate limit (200 requests/minute)', async () => {
      mockUser.brokerConfigs.set('alpaca', {
        brokerKey: 'alpaca',
        credentials: 'encrypted',
        environment: 'paper'
      });

      User.findById.mockResolvedValue(mockUser);

      const mockEncryptionService = {
        decryptCredential: jest.fn().mockResolvedValue({
          apiKey: 'test-key',
          apiSecret: 'test-secret'
        })
      };
      getEncryptionService.mockReturnValue(mockEncryptionService);

      BrokerFactory.testConnection.mockResolvedValue({
        success: true,
        message: 'Connected',
        broker: 'alpaca'
      });

      // Make 200 requests (at the limit)
      const requests = [];
      for (let i = 0; i < 200; i++) {
        requests.push(
          request(app)
            .post('/api/brokers/test/alpaca')
            .expect(200)
        );
      }

      await Promise.all(requests);

      // 201st request should be rate limited
      const response = await request(app)
        .post('/api/brokers/test/alpaca')
        .expect(429);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Alpaca');
    });

    test('should include rate limit headers in responses', async () => {
      mockUser.brokerConfigs.set('alpaca', {
        brokerKey: 'alpaca',
        credentials: 'encrypted',
        environment: 'paper'
      });

      User.findById.mockResolvedValue(mockUser);

      const mockEncryptionService = {
        decryptCredential: jest.fn().mockResolvedValue({
          apiKey: 'test-key',
          apiSecret: 'test-secret'
        })
      };
      getEncryptionService.mockReturnValue(mockEncryptionService);

      BrokerFactory.testConnection.mockResolvedValue({
        success: true,
        broker: 'alpaca'
      });

      const response = await request(app)
        .post('/api/brokers/test/alpaca')
        .expect(200);

      // Verify rate limit headers
      expect(response.headers['x-ratelimit-limit']).toBe('200');
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
      expect(parseInt(response.headers['x-ratelimit-remaining'])).toBeLessThanOrEqual(200);
      expect(response.headers['x-ratelimit-reset']).toBeDefined();
    });
  });

  describe('Broker Disconnection', () => {
    test('should allow users to disconnect any configured broker', async () => {
      mockUser.brokerConfigs.set('alpaca', {
        brokerKey: 'alpaca',
        brokerType: 'stock',
        authMethod: 'api-key',
        environment: 'paper',
        credentials: 'encrypted'
      });

      User.findById.mockResolvedValue(mockUser);

      const response = await request(app)
        .delete('/api/brokers/user/alpaca')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Alpaca');
      expect(mockUser.save).toHaveBeenCalled();
      expect(mockUser.brokerConfigs.has('alpaca')).toBe(false);
    });

    test('should return 404 when disconnecting non-existent broker', async () => {
      User.findById.mockResolvedValue(mockUser);

      const response = await request(app)
        .delete('/api/brokers/user/nonexistent')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('BROKER_NOT_CONFIGURED');
    });

    test('should allow reconnecting after disconnection', async () => {
      // Disconnect
      mockUser.brokerConfigs.set('alpaca', {
        brokerKey: 'alpaca',
        credentials: 'encrypted'
      });

      User.findById.mockResolvedValue(mockUser);

      await request(app)
        .delete('/api/brokers/user/alpaca')
        .expect(200);

      expect(mockUser.brokerConfigs.has('alpaca')).toBe(false);

      // Reconnect
      BrokerFactory.validateCredentials.mockReturnValue({ valid: true, errors: [] });

      const mockEncryptionService = {
        encryptCredential: jest.fn().mockResolvedValue('new-encrypted-credentials')
      };
      getEncryptionService.mockReturnValue(mockEncryptionService);

      const response = await request(app)
        .post('/api/brokers/configure')
        .send({
          brokerKey: 'alpaca',
          brokerType: 'stock',
          authMethod: 'api-key',
          credentials: {
            apiKey: 'new-key',
            apiSecret: 'new-secret'
          },
          environment: 'paper'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Broker Comparison', () => {
    test('should compare fees across configured brokers', async () => {
      mockUser.subscription.tier = 'premium';
      mockUser.brokerConfigs.set('alpaca', { brokerKey: 'alpaca' });
      mockUser.brokerConfigs.set('ibkr', { brokerKey: 'ibkr' });
      mockUser.brokerConfigs.set('schwab', { brokerKey: 'schwab' });

      User.findById.mockResolvedValue(mockUser);

      BrokerFactory.compareFeesForSymbol.mockResolvedValue({
        symbol: 'AAPL',
        quantity: 100,
        brokers: [
          {
            broker: 'schwab',
            totalFee: 0,
            breakdown: { commission: 0, regulatory: 0 },
            executionPrice: 150.0,
            totalCost: 15000.0
          },
          {
            broker: 'alpaca',
            totalFee: 0,
            breakdown: { commission: 0, regulatory: 0 },
            executionPrice: 150.0,
            totalCost: 15000.0
          },
          {
            broker: 'ibkr',
            totalFee: 0.35,
            breakdown: { commission: 0.35, regulatory: 0 },
            executionPrice: 150.0,
            totalCost: 15000.35
          }
        ],
        recommended: 'schwab',
        savings: 0.35
      });

      const response = await request(app)
        .post('/api/brokers/compare')
        .send({
          symbol: 'AAPL',
          quantity: 100,
          side: 'buy'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.comparison).toBeDefined();
      expect(response.body.comparison.recommended).toBe('schwab');
      expect(response.body.comparison.brokers).toHaveLength(3);
    });

    test('should only compare user\'s configured brokers', async () => {
      mockUser.brokerConfigs.set('alpaca', { brokerKey: 'alpaca' });
      // User only has Alpaca configured

      User.findById.mockResolvedValue(mockUser);

      BrokerFactory.compareFeesForSymbol.mockResolvedValue({
        symbol: 'AAPL',
        quantity: 100,
        brokers: [
          {
            broker: 'alpaca',
            totalFee: 0,
            totalCost: 15000.0
          }
        ]
      });

      const response = await request(app)
        .post('/api/brokers/compare')
        .send({
          symbol: 'AAPL',
          quantity: 100,
          side: 'buy'
        })
        .expect(200);

      expect(response.body.comparison.brokers).toHaveLength(1);
      expect(response.body.comparison.brokers[0].broker).toBe('alpaca');
    });
  });

  describe('Analytics Integration', () => {
    test('should track broker_connected event on successful configuration', async () => {
      BrokerFactory.validateCredentials.mockReturnValue({ valid: true, errors: [] });

      const mockEncryptionService = {
        encryptCredential: jest.fn().mockResolvedValue('encrypted')
      };
      getEncryptionService.mockReturnValue(mockEncryptionService);

      User.findById.mockResolvedValue(mockUser);

      analyticsEventService.trackBrokerConnected = jest.fn().mockResolvedValue({ success: true });

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
          environment: 'paper'
        })
        .expect(200);

      expect(analyticsEventService.trackBrokerConnected).toHaveBeenCalledWith(
        mockUser._id,
        expect.objectContaining({
          broker: 'alpaca',
          accountType: 'stock',
          isReconnection: false
        }),
        expect.anything()
      );
    });

    test('should mark reconnection in analytics event', async () => {
      // User already has alpaca configured
      mockUser.brokerConfigs.set('alpaca', {
        brokerKey: 'alpaca',
        credentials: 'old-encrypted'
      });

      BrokerFactory.validateCredentials.mockReturnValue({ valid: true, errors: [] });

      const mockEncryptionService = {
        encryptCredential: jest.fn().mockResolvedValue('new-encrypted')
      };
      getEncryptionService.mockReturnValue(mockEncryptionService);

      User.findById.mockResolvedValue(mockUser);

      analyticsEventService.trackBrokerConnected = jest.fn().mockResolvedValue({ success: true });

      await request(app)
        .post('/api/brokers/configure')
        .send({
          brokerKey: 'alpaca',
          brokerType: 'stock',
          authMethod: 'api-key',
          credentials: {
            apiKey: 'new-key',
            apiSecret: 'new-secret'
          },
          environment: 'paper'
        })
        .expect(200);

      expect(analyticsEventService.trackBrokerConnected).toHaveBeenCalledWith(
        mockUser._id,
        expect.objectContaining({
          broker: 'alpaca',
          isReconnection: true
        }),
        expect.anything()
      );
    });
  });
});
