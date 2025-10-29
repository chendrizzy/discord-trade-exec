/**
 * US3-T23: Broker Adapter Base Tests
 * Integration tests for BrokerAdapter base class
 *
 * Acceptance Criteria:
 * - Test broker connection lifecycle
 * - Test trade execution flow
 * - Test position management
 * - Test order validation
 * - 6 new tests, all passing
 */

const BrokerAdapter = require('../../../src/brokers/BrokerAdapter');

// Mock logger to avoid noise in tests
jest.mock('../../../src/utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
}));

describe('US3-T23: Broker Adapter Base Tests', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe('Broker Connection Lifecycle', () => {
    it('should properly instantiate broker adapter with credentials and options', () => {
      const credentials = {
        apiKey: 'test_key_123',
        apiSecret: 'test_secret_456'
      };

      const options = {
        isTestnet: true,
        timeout: 5000
      };

      const adapter = new BrokerAdapter(credentials, options);

      expect(adapter.credentials).toEqual(credentials);
      expect(adapter.options).toEqual(options);
      expect(adapter.isAuthenticated).toBe(false);
      expect(adapter.brokerName).toBe('base');
      expect(adapter.brokerType).toBe('unknown');
      expect(adapter.isTestnet).toBe(true);
    });

    it('should prevent sandbox mode in production environment without explicit override', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.BROKER_ALLOW_SANDBOX;

      const credentials = { apiKey: 'test' };
      const options = { isTestnet: true };

      expect(() => {
        new BrokerAdapter(credentials, options);
      }).toThrow(/Sandbox\/testnet mode is not allowed in production/);
    });

    it('should allow sandbox mode in production with explicit override', () => {
      process.env.NODE_ENV = 'production';
      process.env.BROKER_ALLOW_SANDBOX = 'true';

      const credentials = { apiKey: 'test' };
      const options = { isTestnet: true };

      const adapter = new BrokerAdapter(credentials, options);

      expect(adapter.isTestnet).toBe(true);
      expect(adapter.brokerName).toBe('base');
    });
  });

  describe('Trade Execution Flow', () => {
    it('should enforce implementation of createOrder method in derived classes', async () => {
      const adapter = new BrokerAdapter({ apiKey: 'test' });

      const order = {
        symbol: 'AAPL',
        side: 'BUY',
        type: 'MARKET',
        quantity: 100
      };

      await expect(adapter.createOrder(order)).rejects.toThrow(
        'createOrder() must be implemented by broker adapter'
      );
    });

    it('should provide closePosition helper that uses underlying order creation', async () => {
      // Create a mock adapter that implements required methods
      class MockAdapter extends BrokerAdapter {
        async authenticate() {
          this.isAuthenticated = true;
          return true;
        }

        async getPositions() {
          return [
            {
              symbol: 'BTCUSD',
              quantity: 0.5,
              entryPrice: 50000,
              currentPrice: 51000,
              unrealizedPnL: 500,
              unrealizedPnLPercent: 2.0
            }
          ];
        }

        async createOrder(order) {
          return {
            orderId: 'order_123',
            status: 'FILLED',
            executedQty: order.quantity,
            executedPrice: 51000
          };
        }
      }

      const adapter = new MockAdapter({ apiKey: 'test' });

      const result = await adapter.closePosition('BTCUSD');

      expect(result.orderId).toBe('order_123');
      expect(result.status).toBe('FILLED');
      expect(result.executedQty).toBe(0.5);
    });

    it('should throw error when closing non-existent position', async () => {
      class MockAdapter extends BrokerAdapter {
        async getPositions() {
          return [];
        }
      }

      const adapter = new MockAdapter({ apiKey: 'test' });

      await expect(adapter.closePosition('NONEXISTENT')).rejects.toThrow(
        'No open position found for NONEXISTENT'
      );
    });
  });

  describe('Position Management', () => {
    it('should enforce implementation of getPositions method', async () => {
      const adapter = new BrokerAdapter({ apiKey: 'test' });

      await expect(adapter.getPositions()).rejects.toThrow(
        'getPositions() must be implemented by broker adapter'
      );
    });

    it('should enforce implementation of setStopLoss method', async () => {
      const adapter = new BrokerAdapter({ apiKey: 'test' });

      const stopLossParams = {
        symbol: 'AAPL',
        quantity: 100,
        stopPrice: 145.0,
        type: 'STOP'
      };

      await expect(adapter.setStopLoss(stopLossParams)).rejects.toThrow(
        'setStopLoss() must be implemented by broker adapter'
      );
    });

    it('should enforce implementation of setTakeProfit method', async () => {
      const adapter = new BrokerAdapter({ apiKey: 'test' });

      const takeProfitParams = {
        symbol: 'AAPL',
        quantity: 100,
        limitPrice: 155.0
      };

      await expect(adapter.setTakeProfit(takeProfitParams)).rejects.toThrow(
        'setTakeProfit() must be implemented by broker adapter'
      );
    });
  });

  describe('Order Validation', () => {
    it('should enforce implementation of cancelOrder method', async () => {
      const adapter = new BrokerAdapter({ apiKey: 'test' });

      await expect(adapter.cancelOrder('order_123')).rejects.toThrow(
        'cancelOrder() must be implemented by broker adapter'
      );
    });

    it('should enforce implementation of getOrderHistory method', async () => {
      const adapter = new BrokerAdapter({ apiKey: 'test' });

      const filters = {
        symbol: 'AAPL',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31')
      };

      await expect(adapter.getOrderHistory(filters)).rejects.toThrow(
        'getOrderHistory() must be implemented by broker adapter'
      );
    });

    it('should enforce implementation of isSymbolSupported method', async () => {
      const adapter = new BrokerAdapter({ apiKey: 'test' });

      await expect(adapter.isSymbolSupported('AAPL')).rejects.toThrow(
        'isSymbolSupported() must be implemented by broker adapter'
      );
    });
  });

  describe('Broker Information and Utilities', () => {
    it('should provide broker information via getBrokerInfo method', () => {
      const adapter = new BrokerAdapter({ apiKey: 'test' }, { isTestnet: true });
      adapter.brokerName = 'TestBroker';
      adapter.brokerType = 'stock';
      adapter.isAuthenticated = true;

      const info = adapter.getBrokerInfo();

      expect(info.name).toBe('TestBroker');
      expect(info.type).toBe('stock');
      expect(info.isTestnet).toBe(true);
      expect(info.isAuthenticated).toBe(true);
      expect(info.supportsStocks).toBe(true);
      expect(info.supportsCrypto).toBe(false);
      expect(info.supportsOptions).toBe(false);
      expect(info.supportsFutures).toBe(false);
    });

    it('should provide symbol normalization with default passthrough behavior', () => {
      const adapter = new BrokerAdapter({ apiKey: 'test' });

      // Default behavior returns symbol as-is
      expect(adapter.normalizeSymbol('BTC/USDT')).toBe('BTC/USDT');
      expect(adapter.normalizeSymbol('AAPL')).toBe('AAPL');
      expect(adapter.denormalizeSymbol('BTCUSDT')).toBe('BTCUSDT');
    });

    it('should enforce implementation of authenticate method', async () => {
      const adapter = new BrokerAdapter({ apiKey: 'test' });

      await expect(adapter.authenticate()).rejects.toThrow(
        'authenticate() must be implemented by broker adapter'
      );
    });

    it('should enforce implementation of getBalance method', async () => {
      const adapter = new BrokerAdapter({ apiKey: 'test' });

      await expect(adapter.getBalance('USD')).rejects.toThrow(
        'getBalance() must be implemented by broker adapter'
      );
    });

    it('should enforce implementation of getMarketPrice method', async () => {
      const adapter = new BrokerAdapter({ apiKey: 'test' });

      await expect(adapter.getMarketPrice('AAPL')).rejects.toThrow(
        'getMarketPrice() must be implemented by broker adapter'
      );
    });

    it('should enforce implementation of getFees method', async () => {
      const adapter = new BrokerAdapter({ apiKey: 'test' });

      await expect(adapter.getFees('AAPL')).rejects.toThrow(
        'getFees() must be implemented by broker adapter'
      );
    });
  });
});
