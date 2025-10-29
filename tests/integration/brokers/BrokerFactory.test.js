/**
 * US3-T24: Broker Factory & Registration
 * Integration tests for BrokerFactory singleton
 *
 * Acceptance Criteria:
 * - Test dynamic broker registration
 * - Test broker capability detection
 * - Test broker failover
 * - Test broker health checks
 * - 4 new tests, all passing
 */

const BrokerFactory = require('../../../src/brokers/BrokerFactory');
const BrokerAdapter = require('../../../src/brokers/BrokerAdapter');

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
}));

describe('US3-T24: Broker Factory & Registration', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe('Dynamic Broker Registration', () => {
    it('should allow dynamic registration of new broker adapters', () => {
      const initialBrokerCount = BrokerFactory.brokers.size;

      // Register a test broker
      BrokerFactory.registerBroker('test-broker-dynamic', {
        name: 'Test Dynamic Broker',
        type: 'stock',
        class: BrokerAdapter,
        features: ['testing', 'dynamic-registration'],
        description: 'Dynamically registered test broker',
        authMethods: ['api-key'],
        minDeposit: 0,
        accountTypes: ['individual'],
        markets: ['US']
      });

      const newBrokerCount = BrokerFactory.brokers.size;
      expect(newBrokerCount).toBe(initialBrokerCount + 1);

      // Verify broker was registered correctly
      const brokerInfo = BrokerFactory.getBrokerInfo('test-broker-dynamic');
      expect(brokerInfo).not.toBeNull();
      expect(brokerInfo.name).toBe('Test Dynamic Broker');
      expect(brokerInfo.type).toBe('stock');
      expect(brokerInfo.status).toBe('available');
      expect(brokerInfo.features).toContain('dynamic-registration');

      // Clean up
      BrokerFactory.brokers.delete('test-broker-dynamic');
    });

    it('should properly set broker status based on class availability', () => {
      // Register broker without class (planned broker)
      BrokerFactory.registerBroker('test-planned-broker', {
        name: 'Planned Broker',
        type: 'stock',
        class: null,
        features: ['planned'],
        description: 'Future broker integration'
      });

      const plannedInfo = BrokerFactory.getBrokerInfo('test-planned-broker');
      expect(plannedInfo.status).toBe('planned');

      // Register broker with class (available broker)
      BrokerFactory.registerBroker('test-available-broker', {
        name: 'Available Broker',
        type: 'crypto',
        class: BrokerAdapter,
        features: ['available'],
        description: 'Ready to use broker'
      });

      const availableInfo = BrokerFactory.getBrokerInfo('test-available-broker');
      expect(availableInfo.status).toBe('available');

      // Clean up
      BrokerFactory.brokers.delete('test-planned-broker');
      BrokerFactory.brokers.delete('test-available-broker');
    });

    it('should support filtering brokers by type, status, and features', () => {
      // Test filtering by type
      const stockBrokers = BrokerFactory.getBrokers({ type: 'stock' });
      const cryptoBrokers = BrokerFactory.getBrokers({ type: 'crypto' });

      expect(stockBrokers.length).toBeGreaterThan(0);
      expect(cryptoBrokers.length).toBeGreaterThan(0);
      expect(stockBrokers.every(b => b.type === 'stock')).toBe(true);
      expect(cryptoBrokers.every(b => b.type === 'crypto')).toBe(true);

      // Test filtering by status
      const availableBrokers = BrokerFactory.getBrokers({ status: 'available' });
      expect(availableBrokers.every(b => b.status === 'available')).toBe(true);

      // Test filtering by features
      const oauthBrokers = BrokerFactory.getBrokers({ features: ['oauth'] });
      expect(oauthBrokers.every(b => b.features.includes('oauth'))).toBe(true);

      // Test combined filters
      const stockOAuthBrokers = BrokerFactory.getBrokers({
        type: 'stock',
        status: 'available',
        features: ['oauth']
      });
      expect(stockOAuthBrokers.length).toBeGreaterThan(0);
      expect(stockOAuthBrokers.every(b => b.type === 'stock' && b.features.includes('oauth'))).toBe(true);
    });
  });

  describe('Broker Capability Detection', () => {
    it('should detect and report broker capabilities through getBrokersByFeatures', () => {
      // Test OAuth capability detection
      const oauthBrokers = BrokerFactory.getBrokersByFeatures(['oauth']);
      expect(oauthBrokers.length).toBeGreaterThan(0);
      expect(oauthBrokers.every(b => b.features.includes('oauth'))).toBe(true);

      // Test commission-free capability
      const commissionFreeBrokers = BrokerFactory.getBrokersByFeatures(['commission-free']);
      expect(commissionFreeBrokers.length).toBeGreaterThan(0);
      expect(commissionFreeBrokers.every(b => b.features.includes('commission-free'))).toBe(true);

      // Test paper-trading capability
      const paperTradingBrokers = BrokerFactory.getBrokersByFeatures(['paper-trading']);
      expect(paperTradingBrokers.length).toBeGreaterThan(0);
      expect(paperTradingBrokers.every(b => b.features.includes('paper-trading'))).toBe(true);

      // Test multiple features (AND logic)
      const oauthAndPaperBrokers = BrokerFactory.getBrokersByFeatures(['oauth', 'paper-trading']);
      expect(oauthAndPaperBrokers.every(b => b.features.includes('oauth') && b.features.includes('paper-trading'))).toBe(
        true
      );
    });

    it('should provide broker recommendation based on requirements', () => {
      // Test stock broker recommendation with OAuth
      const stockRecommendation = BrokerFactory.getRecommendedBroker({
        type: 'stock',
        features: ['oauth', 'commission-free'],
        markets: ['US']
      });

      expect(stockRecommendation).not.toBeNull();
      expect(stockRecommendation.type).toBe('stock');
      expect(stockRecommendation.features).toContain('oauth');
      expect(stockRecommendation.features).toContain('commission-free');
      expect(stockRecommendation.markets).toContain('US');

      // Verify scoring system prefers commission-free + oauth
      expect(stockRecommendation.score).toBeGreaterThan(0);

      // Test crypto broker recommendation
      const cryptoRecommendation = BrokerFactory.getRecommendedBroker({
        type: 'crypto',
        features: ['api-trading'],
        markets: ['Global']
      });

      expect(cryptoRecommendation).not.toBeNull();
      expect(cryptoRecommendation.type).toBe('crypto');
    });

    it('should provide broker comparison functionality', () => {
      const comparison = BrokerFactory.compareBrokers(['alpaca', 'schwab', 'coinbasepro']);

      expect(comparison.brokers).toHaveLength(3);
      expect(comparison.comparison).toHaveProperty('features');
      expect(comparison.comparison).toHaveProperty('markets');
      expect(comparison.comparison).toHaveProperty('accountTypes');
      expect(comparison.comparison).toHaveProperty('authMethods');

      // Verify all features are aggregated
      expect(Array.isArray(comparison.comparison.features)).toBe(true);
      expect(comparison.comparison.features.length).toBeGreaterThan(0);

      // Verify stock and crypto brokers are correctly compared
      const alpaca = comparison.brokers.find(b => b.key === 'alpaca');
      const coinbase = comparison.brokers.find(b => b.key === 'coinbasepro');

      expect(alpaca.type).toBe('stock');
      expect(coinbase.type).toBe('crypto');
    });
  });

  describe('Broker Failover', () => {
    it('should handle broker creation failures gracefully', async () => {
      // Test unknown broker
      await expect(BrokerFactory.createBroker('unknown-broker', {})).rejects.toThrow(/Unknown broker: unknown-broker/);

      // Verify error message includes available brokers
      try {
        await BrokerFactory.createBroker('unknown-broker', {});
      } catch (error) {
        expect(error.message).toContain('Available brokers:');
        expect(error.message).toContain('alpaca');
      }
    });

    it('should handle planned broker instantiation attempts', async () => {
      // Register a planned broker (no class implementation)
      BrokerFactory.registerBroker('test-planned-failover', {
        name: 'Planned Failover Test',
        type: 'stock',
        class: null,
        features: ['planned']
      });

      await expect(BrokerFactory.createBroker('test-planned-failover', {})).rejects.toThrow(
        /is not yet implemented. Status: planned/
      );

      // Clean up
      BrokerFactory.brokers.delete('test-planned-failover');
    });

    it('should provide fallback broker recommendations when primary unavailable', () => {
      // Request broker with impossible feature combination
      const recommendation = BrokerFactory.getRecommendedBroker({
        type: 'stock',
        features: ['impossible-feature-xyz'],
        markets: ['Mars'] // Non-existent market
      });

      // Should return null when no broker matches
      expect(recommendation).toBeNull();

      // Test with realistic but specific requirements
      const realisticRecommendation = BrokerFactory.getRecommendedBroker({
        type: 'stock',
        features: ['oauth'],
        markets: ['US']
      });

      expect(realisticRecommendation).not.toBeNull();
      expect(realisticRecommendation.status).toBe('available');
    });
  });

  describe('Broker Health Checks', () => {
    it('should provide factory statistics including broker availability', () => {
      const stats = BrokerFactory.getStats();

      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('available');
      expect(stats).toHaveProperty('planned');
      expect(stats).toHaveProperty('stock');
      expect(stats).toHaveProperty('crypto');
      expect(stats).toHaveProperty('brokers');

      expect(stats.total).toBeGreaterThan(0);
      expect(stats.available).toBeGreaterThan(0);
      expect(stats.stock).toBeGreaterThan(0);
      expect(stats.crypto).toBeGreaterThan(0);

      expect(Array.isArray(stats.brokers.available)).toBe(true);
      expect(Array.isArray(stats.brokers.planned)).toBe(true);
      expect(stats.brokers.available).toContain('alpaca');
    });

    it('should validate broker credentials before connection attempts', () => {
      // Test Alpaca credential validation (OAuth or API key required)
      const alpacaValidOAuth = BrokerFactory.validateCredentials('alpaca', {
        accessToken: 'oauth_token_123'
      });
      expect(alpacaValidOAuth.valid).toBe(true);

      const alpacaValidApiKey = BrokerFactory.validateCredentials('alpaca', {
        apiKey: 'key_123',
        apiSecret: 'secret_456'
      });
      expect(alpacaValidApiKey.valid).toBe(true);

      const alpacaInvalid = BrokerFactory.validateCredentials('alpaca', {});
      expect(alpacaInvalid.valid).toBe(false);
      expect(alpacaInvalid.errors.length).toBeGreaterThan(0);

      // Test Coinbase Pro validation (requires all three fields)
      const coinbaseValid = BrokerFactory.validateCredentials('coinbasepro', {
        apiKey: 'key',
        apiSecret: 'secret',
        password: 'passphrase'
      });
      expect(coinbaseValid.valid).toBe(true);

      const coinbaseInvalid = BrokerFactory.validateCredentials('coinbasepro', {
        apiKey: 'key'
        // Missing apiSecret and password
      });
      expect(coinbaseInvalid.valid).toBe(false);
      expect(coinbaseInvalid.errors).toContain('apiSecret required for Coinbase Pro');
      expect(coinbaseInvalid.errors).toContain('password (API passphrase) required for Coinbase Pro');
    });

    it('should check broker availability status before operations', () => {
      // Test available broker
      expect(BrokerFactory.isBrokerAvailable('alpaca')).toBe(true);
      expect(BrokerFactory.isBrokerAvailable('schwab')).toBe(true);
      expect(BrokerFactory.isBrokerAvailable('coinbasepro')).toBe(true);

      // Test non-existent broker (returns falsy - undefined)
      expect(BrokerFactory.isBrokerAvailable('non-existent-broker')).toBeFalsy();

      // Register and test planned broker
      BrokerFactory.registerBroker('test-planned-health', {
        name: 'Planned Health Check',
        type: 'stock',
        class: null,
        features: []
      });

      expect(BrokerFactory.isBrokerAvailable('test-planned-health')).toBe(false);

      // Clean up
      BrokerFactory.brokers.delete('test-planned-health');
    });

    it('should provide separate lists for stock and crypto brokers', () => {
      const stockBrokers = BrokerFactory.getStockBrokers(true);
      const cryptoBrokers = BrokerFactory.getCryptoBrokers(true);

      expect(stockBrokers.length).toBeGreaterThan(0);
      expect(cryptoBrokers.length).toBeGreaterThan(0);

      expect(stockBrokers.every(b => b.type === 'stock' && b.status === 'available')).toBe(true);
      expect(cryptoBrokers.every(b => b.type === 'crypto' && b.status === 'available')).toBe(true);

      // Test including planned brokers
      const allStockBrokers = BrokerFactory.getStockBrokers(false);
      expect(allStockBrokers.length).toBeGreaterThanOrEqual(stockBrokers.length);
    });
  });

  describe('Broker Integration Readiness', () => {
    it('should detect and list all registered stock brokers', () => {
      const availableKeys = BrokerFactory.getAvailableBrokerKeys();
      const plannedKeys = BrokerFactory.getPlannedBrokerKeys();

      expect(Array.isArray(availableKeys)).toBe(true);
      expect(Array.isArray(plannedKeys)).toBe(true);

      // Verify well-known brokers are registered
      expect(availableKeys).toContain('alpaca');
      expect(availableKeys).toContain('ibkr');
      expect(availableKeys).toContain('schwab');
      expect(availableKeys).toContain('coinbasepro');
      expect(availableKeys).toContain('kraken');
    });

    it('should provide detailed broker information for integration planning', () => {
      const alpacaInfo = BrokerFactory.getBrokerInfo('alpaca');

      expect(alpacaInfo).not.toBeNull();
      expect(alpacaInfo.name).toBe('Alpaca');
      expect(alpacaInfo.type).toBe('stock');
      expect(alpacaInfo.status).toBe('available');
      expect(alpacaInfo.features).toContain('oauth');
      expect(alpacaInfo.features).toContain('commission-free');
      expect(alpacaInfo.features).toContain('paper-trading');
      expect(alpacaInfo.authMethods).toContain('oauth');
      expect(alpacaInfo.authMethods).toContain('api-key');
      expect(alpacaInfo.markets).toContain('US');
      expect(alpacaInfo.minDeposit).toBe(0);
    });
  });
});
