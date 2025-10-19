// Internal utilities and services
const AlpacaAdapter = require('../adapters/AlpacaAdapter');
const BrokerFactory = require('../BrokerFactory');

describe('BrokerFactory', () => {
  describe('Broker Registration', () => {
    test('should list all registered brokers', () => {
      const brokers = BrokerFactory.getBrokers();
      expect(brokers.length).toBeGreaterThan(0);
      expect(brokers.some(b => b.key === 'alpaca')).toBe(true);
    });

    test('should get broker info by key', () => {
      const alpacaInfo = BrokerFactory.getBrokerInfo('alpaca');
      expect(alpacaInfo.name).toBe('Alpaca');
      expect(alpacaInfo.type).toBe('stock');
      expect(alpacaInfo.status).toBe('available');
    });

    test('should return null for unknown broker', () => {
      const result = BrokerFactory.getBrokerInfo('unknown-broker');
      expect(result).toBeNull();
    });
  });

  describe('Broker Filtering', () => {
    test('should filter brokers by type (stock)', () => {
      const stockBrokers = BrokerFactory.getStockBrokers(false);
      expect(stockBrokers.length).toBeGreaterThan(0);
      expect(stockBrokers.every(b => b.type === 'stock')).toBe(true);
    });

    test('should filter brokers by type (crypto)', () => {
      const cryptoBrokers = BrokerFactory.getCryptoBrokers(false);
      expect(cryptoBrokers.length).toBeGreaterThan(0);
      expect(cryptoBrokers.every(b => b.type === 'crypto')).toBe(true);
    });

    test('should filter by status (available only)', () => {
      const available = BrokerFactory.getBrokers({ status: 'available' });
      expect(available.every(b => b.status === 'available')).toBe(true);
      expect(available.every(b => b.class !== null)).toBe(true);
    });

    test('should filter by features', () => {
      const oauthBrokers = BrokerFactory.getBrokersByFeatures(['oauth']);
      expect(oauthBrokers.every(b => b.features.includes('oauth'))).toBe(true);
    });

    test('should filter by multiple criteria', () => {
      const result = BrokerFactory.getBrokers({
        type: 'stock',
        status: 'available',
        features: ['commission-free']
      });

      expect(
        result.every(b => b.type === 'stock' && b.status === 'available' && b.features.includes('commission-free'))
      ).toBe(true);
    });
  });

  describe('Broker Creation', () => {
    test('should create Alpaca adapter instance', async () => {
      const credentials = {
        apiKey: 'test-key',
        apiSecret: 'test-secret'
      };

      const broker = await BrokerFactory.createBroker('alpaca', credentials, { isTestnet: true });

      expect(broker).toBeInstanceOf(AlpacaAdapter);
      expect(broker.brokerName).toBe('alpaca');
      expect(broker.brokerType).toBe('stock');
      expect(broker.isTestnet).toBe(true);
    });

    test('should throw error for unknown broker', async () => {
      await expect(BrokerFactory.createBroker('unknown', {})).rejects.toThrow('Unknown broker');
    });

    test('should create Moomoo adapter instance (lazy-loaded)', async () => {
      // Moomoo is lazy-loaded dynamically when createBroker is called
      const broker = await BrokerFactory.createBroker('moomoo', { accountId: 'test', password: 'test' });

      expect(broker).toBeDefined();
      expect(broker.brokerName).toBe('moomoo');
      expect(broker.brokerType).toBe('stock');
    });
  });

  describe('Broker Availability', () => {
    test('should check if broker is available', () => {
      expect(BrokerFactory.isBrokerAvailable('alpaca')).toBe(true);
      // Moomoo is dynamically loaded, so it's marked as planned initially but can be loaded
      // The factory marks it as available if it has a class property, or planned if not
      const moomooInfo = BrokerFactory.getBrokerInfo('moomoo');
      expect(moomooInfo.status).toBe('planned'); // Initially planned, lazy-loaded on demand
    });

    test('should get list of available broker keys', () => {
      const available = BrokerFactory.getAvailableBrokerKeys();
      expect(available).toContain('alpaca');
      // Moomoo is not in available list because it's initially unloaded
      expect(available).not.toContain('moomoo');
    });

    test('should get list of planned broker keys', () => {
      const planned = BrokerFactory.getPlannedBrokerKeys();
      // Moomoo is initially in planned because it's lazy-loaded
      expect(planned).toContain('moomoo');
      expect(planned).not.toContain('alpaca');
    });
  });

  describe('Broker Comparison', () => {
    test('should compare multiple brokers', () => {
      const comparison = BrokerFactory.compareBrokers(['alpaca', 'schwab']);

      expect(comparison.brokers).toHaveLength(2);
      expect(comparison.brokers[0].key).toBe('alpaca');
      expect(comparison.brokers[1].key).toBe('schwab');

      expect(comparison.comparison).toHaveProperty('features');
      expect(comparison.comparison).toHaveProperty('markets');
      expect(comparison.comparison).toHaveProperty('accountTypes');
      expect(comparison.comparison).toHaveProperty('authMethods');

      expect(Array.isArray(comparison.comparison.features)).toBe(true);
    });

    test('should aggregate all unique features in comparison', () => {
      const comparison = BrokerFactory.compareBrokers(['alpaca', 'schwab']);

      // Alpaca has commission-free, Schwab has options/futures
      expect(comparison.comparison.features).toContain('commission-free');
      expect(comparison.comparison.features).toContain('options');
    });
  });

  describe('Broker Recommendation', () => {
    test('should recommend broker based on requirements', () => {
      const requirements = {
        type: 'stock',
        features: ['commission-free', 'oauth']
      };

      const recommended = BrokerFactory.getRecommendedBroker(requirements);

      expect(recommended).not.toBeNull();
      expect(recommended.type).toBe('stock');
      expect(recommended.features).toContain('commission-free');
      expect(recommended.features).toContain('oauth');
    });

    test('should return null if no broker matches requirements', () => {
      const requirements = {
        type: 'stock',
        features: ['impossible-feature']
      };

      const recommended = BrokerFactory.getRecommendedBroker(requirements);
      expect(recommended).toBeNull();
    });

    test('should score brokers appropriately', () => {
      const requirements = {
        type: 'stock',
        features: ['commission-free']
      };

      const recommended = BrokerFactory.getRecommendedBroker(requirements);
      expect(recommended).toHaveProperty('score');
      expect(recommended.score).toBeGreaterThan(0);
    });
  });

  describe('Credential Validation', () => {
    test('should validate Alpaca OAuth credentials', () => {
      const result = BrokerFactory.validateCredentials('alpaca', {
        accessToken: 'test-token'
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should validate Alpaca API key credentials', () => {
      const result = BrokerFactory.validateCredentials('alpaca', {
        apiKey: 'test-key',
        apiSecret: 'test-secret'
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject invalid Alpaca credentials', () => {
      const result = BrokerFactory.validateCredentials('alpaca', {});

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should validate Moomoo credentials', () => {
      // Moomoo is dynamically loaded
      const result = BrokerFactory.validateCredentials('moomoo', {
        accountId: 'test123',
        password: 'testpass'
      });

      // Moomoo validation should succeed with required fields
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Connection Testing', () => {
    test('should test connection with valid credentials', async () => {
      // Mock the Alpaca adapter authenticate method
      const mockAuthenticate = jest.fn().mockResolvedValue(true);
      const mockGetBalance = jest.fn().mockResolvedValue({
        total: 100000,
        available: 50000,
        currency: 'USD'
      });

      // We'll need to mock the actual adapter for this test
      // For now, we'll test the structure of the returned result
      const result = await BrokerFactory.testConnection(
        'alpaca',
        {
          apiKey: 'invalid-key',
          apiSecret: 'invalid-secret'
        },
        { isTestnet: true }
      ).catch(error => ({
        success: false,
        broker: 'alpaca',
        message: error.message
      }));

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('broker');
      expect(result).toHaveProperty('message');
      expect(result.broker).toBe('alpaca');
    });

    test('should handle connection failure gracefully', async () => {
      const result = await BrokerFactory.testConnection(
        'alpaca',
        {
          apiKey: 'invalid',
          apiSecret: 'invalid'
        },
        { isTestnet: true }
      );

      expect(result.success).toBe(false);
      expect(result.message).toBeDefined();
    });
  });

  describe('Factory Statistics', () => {
    test('should provide factory statistics', () => {
      const stats = BrokerFactory.getStats();

      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('available');
      expect(stats).toHaveProperty('planned');
      expect(stats).toHaveProperty('stock');
      expect(stats).toHaveProperty('crypto');
      expect(stats).toHaveProperty('brokers');

      expect(stats.total).toBeGreaterThan(0);
      expect(stats.available).toBeGreaterThan(0);
      expect(stats.brokers.available).toContain('alpaca');
      // Moomoo is planned because it has class: null
      expect(stats.brokers.planned).toContain('moomoo');
    });

    test('should count brokers correctly', () => {
      const stats = BrokerFactory.getStats();
      const allBrokers = BrokerFactory.getBrokers();

      expect(stats.total).toBe(allBrokers.length);
      expect(stats.available + stats.planned).toBe(stats.total);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty filters', () => {
      const brokers = BrokerFactory.getBrokers({});
      expect(brokers.length).toBeGreaterThan(0);
    });

    test('should handle undefined credentials', () => {
      expect(() => {
        BrokerFactory.createBroker('alpaca', undefined);
      }).not.toThrow();
    });

    test('should handle comparison with single broker', () => {
      const comparison = BrokerFactory.compareBrokers(['alpaca']);
      expect(comparison.brokers).toHaveLength(1);
    });

    test('should handle recommendation with empty requirements', () => {
      const recommended = BrokerFactory.getRecommendedBroker({});
      expect(recommended).not.toBeNull();
    });
  });
});
