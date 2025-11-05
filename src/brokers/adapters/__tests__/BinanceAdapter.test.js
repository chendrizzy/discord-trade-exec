/**
 * Unit Tests for BinanceAdapter
 * Tests all methods with comprehensive coverage
 */

const BinanceAdapter = require('../BinanceAdapter');
const logger = require('../../../utils/logger');

// Module-level variable for controlling fetchBalance behavior in tests
let mockFetchBalanceImpl = null;

// Mock the ccxt library
jest.mock('ccxt', () => {
  return {
    binance: class MockBinanceExchange {
      constructor(config) {
        this.config = config;
        this.apiKey = config.apiKey;
        this.secret = config.secret;
        this.enableRateLimit = config.enableRateLimit;
        this.options = config.options;
        this.markets = {};

        // Use custom implementation if set, otherwise use default
        if (mockFetchBalanceImpl) {
          this.fetchBalance = jest.fn(mockFetchBalanceImpl);
        } else {
          this.fetchBalance = jest.fn().mockResolvedValue({
            USDT: { total: 50000, free: 40000, used: 10000 },
            BTC: { total: 1.5, free: 1.2, used: 0.3 },
            ETH: { total: 10.0, free: 8.5, used: 1.5 },
            info: { uid: 'binance-user-123' }
          });
        }
      }

      setSandboxMode(enabled) {
        this.sandboxMode = enabled;
      }

      async createOrder(symbol, type, side, amount, price, params = {}) {
        const orderId = `binance-order-${Date.now()}`;

        // Handle different order types
        if (type === 'TRAILING_STOP_MARKET') {
          return {
            id: orderId,
            symbol: symbol,
            type: type,
            side: side,
            amount: amount,
            filled: 0,
            remaining: amount,
            status: 'open',
            timestamp: Date.now(),
            info: { callbackRate: params.callbackRate }
          };
        }

        if (type === 'STOP_LOSS_LIMIT') {
          return {
            id: orderId,
            symbol: symbol,
            type: type,
            side: side,
            amount: amount,
            price: price,
            filled: 0,
            remaining: amount,
            status: 'open',
            timestamp: Date.now(),
            stopPrice: params.stopPrice,
            info: {}
          };
        }

        // Regular market/limit orders
        return {
          id: orderId,
          symbol: symbol,
          type: type,
          side: side,
          amount: amount,
          price: price,
          filled: type === 'market' ? amount : 0,
          remaining: type === 'market' ? 0 : amount,
          average: type === 'market' ? (price || 45000) : null,
          status: type === 'market' ? 'closed' : 'open',
          timestamp: Date.now(),
          info: {}
        };
      }

      async cancelOrder(orderId, symbol) {
        return {
          id: orderId,
          status: 'canceled',
          symbol: symbol
        };
      }

      async fetchOrder(orderId, symbol) {
        return {
          id: orderId,
          symbol: symbol,
          status: 'closed',
          filled: 1.0,
          remaining: 0,
          average: 45000,
          timestamp: Date.now(),
          lastTradeTimestamp: Date.now()
        };
      }

      async fetchClosedOrders(symbol, since, limit, params = {}) {
        const baseOrders = [
          {
            id: 'binance-order-1',
            clientOrderId: 'client-123',
            symbol: 'BTC/USDT',
            type: 'limit',
            side: 'buy',
            amount: 0.5,
            filled: 0.5,
            remaining: 0,
            price: 44000,
            average: 44000,
            status: 'closed',
            timestamp: Date.now() - 3600000,
            lastTradeTimestamp: Date.now() - 3600000,
            fee: { cost: 22, currency: 'USDT' }
          },
          {
            id: 'binance-order-2',
            clientOrderId: 'client-124',
            symbol: 'ETH/USDT',
            type: 'market',
            side: 'sell',
            amount: 2.0,
            filled: 2.0,
            remaining: 0,
            price: null,
            average: 3000,
            status: 'closed',
            timestamp: Date.now() - 7200000,
            lastTradeTimestamp: Date.now() - 7200000,
            fee: { cost: 6, currency: 'USDT' }
          },
          {
            id: 'binance-order-3',
            clientOrderId: 'client-125',
            symbol: 'BTC/USDT',
            type: 'limit',
            side: 'sell',
            amount: 0.3,
            filled: 0.3,
            remaining: 0,
            price: 46000,
            average: 46000,
            stopPrice: 45500,
            status: 'closed',
            timestamp: Date.now() - 1800000,
            lastTradeTimestamp: Date.now() - 1800000
          }
        ];

        let filteredOrders = baseOrders;

        if (symbol) {
          filteredOrders = filteredOrders.filter(o => o.symbol === symbol);
        }

        if (since) {
          filteredOrders = filteredOrders.filter(o => o.timestamp >= since);
        }

        return filteredOrders.slice(0, limit || 100);
      }

      async fetchTicker(symbol) {
        const prices = {
          'BTC/USDT': {
            bid: 44900,
            ask: 45100,
            last: 45000,
            bidVolume: 5.2,
            askVolume: 3.8,
            timestamp: Date.now(),
            datetime: new Date().toISOString()
          },
          'ETH/USDT': {
            bid: 2990,
            ask: 3010,
            last: 3000,
            bidVolume: 100.5,
            askVolume: 85.3,
            timestamp: Date.now(),
            datetime: new Date().toISOString()
          }
        };

        if (prices[symbol]) {
          return prices[symbol];
        }

        throw new Error('Symbol not found');
      }

      async loadMarkets() {
        this.markets = {
          'BTC/USDT': {
            active: true,
            spot: true,
            maker: 0.001,
            taker: 0.001,
            id: 'BTCUSDT',
            symbol: 'BTC/USDT'
          },
          'ETH/USDT': {
            active: true,
            spot: true,
            maker: 0.001,
            taker: 0.001,
            id: 'ETHUSDT',
            symbol: 'ETH/USDT'
          },
          'DOGE/USDT': {
            active: false,
            spot: true,
            maker: 0.001,
            taker: 0.001,
            id: 'DOGEUSDT',
            symbol: 'DOGE/USDT'
          }
        };
        return this.markets;
      }

      async fetchMarkets() {
        // Return array of markets for base class isSymbolSupported()
        if (!this.markets || Object.keys(this.markets).length === 0) {
          await this.loadMarkets();
        }
        return Object.values(this.markets);
      }

      market(symbol) {
        if (!this.markets[symbol]) {
          throw new Error(`Market ${symbol} not found`);
        }
        return this.markets[symbol];
      }
    }
  };
});

// Mock logger
jest.mock('../../../middleware/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

// Mock encryption utility
jest.mock('../../../utils/encryption', () => ({
  decrypt: jest.fn((encryptedValue) => encryptedValue.replace('encrypted_', ''))
}));

// Mock promise-timeout utility to avoid timeout issues in tests
jest.mock('../../../utils/promise-timeout', () => ({
  withTimeout: jest.fn((promise) => promise), // Just return the promise without timeout wrapper
  withTimeoutAndFallback: jest.fn((promise) => promise)
}));

describe('BinanceAdapter', () => {
  let adapter;

  beforeEach(() => {
    adapter = new BinanceAdapter(
      {
        apiKey: 'test-binance-key',
        apiSecret: 'test-binance-secret'
      },
      {
        isTestnet: false,
        timeout: 30000
      }
    );
  });

  afterEach(() => {
    // Reset module-level mock variable to prevent test contamination
    mockFetchBalanceImpl = null;
  });

  describe('Constructor', () => {
    test('should initialize with correct broker name and exchange', () => {
      expect(adapter.brokerName).toBe('binance');
      expect(adapter.exchange).toBeDefined();
      expect(adapter.exchange.apiKey).toBe('test-binance-key');
    });
  });

  describe('connect()', () => {
    test('should connect successfully with valid credentials', async () => {
      const credentials = {
        apiKey: 'encrypted_test-api-key',
        apiSecret: 'encrypted_test-api-secret',
        testnet: false
      };

      const result = await adapter.connect(credentials);

      expect(result.success).toBe(true);
      expect(result.broker).toBe('binance');
      expect(result.accountId).toBe('binance-user-123');
      expect(result.testnet).toBe(false);
      expect(adapter.exchange).toBeDefined();
    });

    test('should connect successfully in testnet mode', async () => {
      const credentials = {
        apiKey: 'encrypted_test-api-key',
        apiSecret: 'encrypted_test-api-secret',
        testnet: true
      };

      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const result = await adapter.connect(credentials);

      expect(result.success).toBe(true);
      expect(result.testnet).toBe(true);
      expect(adapter.exchange.sandboxMode).toBe(true);

      process.env.NODE_ENV = originalEnv;
    });

    test('should prevent testnet usage in production without explicit permission', async () => {
      const credentials = {
        apiKey: 'encrypted_test-api-key',
        apiSecret: 'encrypted_test-api-secret',
        testnet: true
      };

      const originalEnv = process.env.NODE_ENV;
      const originalSandbox = process.env.BROKER_ALLOW_SANDBOX;
      process.env.NODE_ENV = 'production';
      process.env.BROKER_ALLOW_SANDBOX = undefined;

      await expect(adapter.connect(credentials)).rejects.toThrow(
        'Sandbox/testnet mode is not allowed in production'
      );

      process.env.NODE_ENV = originalEnv;
      process.env.BROKER_ALLOW_SANDBOX = originalSandbox;
    });

    test('should handle connection errors gracefully', async () => {
      // Set module-level variable to make fetchBalance reject
      mockFetchBalanceImpl = () => Promise.reject(new Error('API key invalid'));

      const testAdapter = new BinanceAdapter();
      const credentials = {
        apiKey: 'encrypted_invalid-key',
        apiSecret: 'encrypted_invalid-secret'
      };

      await expect(testAdapter.connect(credentials)).rejects.toThrow('API key invalid');

      // Reset module-level variable
      mockFetchBalanceImpl = null;
    });
  });

  describe('disconnect()', () => {
    test('should disconnect and cleanup resources', async () => {
      await adapter.connect({
        apiKey: 'encrypted_test-key',
        apiSecret: 'encrypted_test-secret'
      });

      expect(adapter.exchange).toBeDefined();

      await adapter.disconnect();

      expect(adapter.exchange).toBeNull();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('[BinanceAdapter] Disconnected')
      );
    });

    test('should handle disconnect when not connected', async () => {
      await adapter.disconnect();
      expect(adapter.exchange).toBeNull();
    });
  });

  describe('placeOrder()', () => {
    beforeEach(async () => {
      await adapter.connect({
        apiKey: 'encrypted_test-key',
        apiSecret: 'encrypted_test-secret'
      });
    });

    test('should place market order successfully', async () => {
      const order = {
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'market',
        quantity: 0.1
      };

      const result = await adapter.placeOrder(order);

      expect(result).toHaveProperty('orderId');
      expect(result.symbol).toBe('BTC/USDT');
      expect(result.side).toBe('buy');
      expect(result.type).toBe('market');
      expect(result.quantity).toBe(0.1);
      expect(result.status).toBe('closed');
      expect(result.filled).toBe(0.1);
    });

    test('should place limit order successfully', async () => {
      const order = {
        symbol: 'ETH/USDT',
        side: 'sell',
        type: 'limit',
        quantity: 2.0,
        price: 3100
      };

      const result = await adapter.placeOrder(order);

      expect(result).toHaveProperty('orderId');
      expect(result.symbol).toBe('ETH/USDT');
      expect(result.type).toBe('limit');
      expect(result.price).toBe(3100);
      expect(result.status).toBe('open');
    });

    test('should throw error if not connected', async () => {
      await adapter.disconnect();

      const order = {
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'market',
        quantity: 0.1
      };

      await expect(adapter.placeOrder(order)).rejects.toThrow(
        'Not connected to Binance'
      );
    });
  });

  describe('cancelOrder()', () => {
    beforeEach(async () => {
      await adapter.connect({
        apiKey: 'encrypted_test-key',
        apiSecret: 'encrypted_test-secret'
      });
    });

    test('should cancel order successfully', async () => {
      const result = await adapter.cancelOrder('binance-order-123', 'BTC/USDT');

      expect(result.orderId).toBe('binance-order-123');
      expect(result.status).toBe('canceled');
      expect(result.symbol).toBe('BTC/USDT');
    });
  });

  describe('getPositions()', () => {
    beforeEach(async () => {
      await adapter.connect({
        apiKey: 'encrypted_test-key',
        apiSecret: 'encrypted_test-secret'
      });
    });

    test('should fetch positions successfully', async () => {
      const positions = await adapter.getPositions();

      expect(Array.isArray(positions)).toBe(true);
      expect(positions.length).toBeGreaterThan(0);

      const btcPosition = positions.find(p => p.symbol === 'BTC');
      expect(btcPosition).toBeDefined();
      expect(btcPosition.quantity).toBe(1.5);
      expect(btcPosition.available).toBe(1.2);
      expect(btcPosition.locked).toBe(0.3);
    });
  });

  describe('getBalance()', () => {
    beforeEach(async () => {
      await adapter.connect({
        apiKey: 'encrypted_test-key',
        apiSecret: 'encrypted_test-secret'
      });
    });

    test('should fetch balance successfully', async () => {
      const balance = await adapter.getBalance();

      expect(balance.cash).toBe(40000);
      expect(balance.equity).toBe(50000);
      expect(balance.buyingPower).toBe(40000);
      expect(balance.marginUsed).toBe(10000);
      expect(balance.currency).toBe('USDT');
    });
  });

  describe('getOrderStatus()', () => {
    beforeEach(async () => {
      await adapter.connect({
        apiKey: 'encrypted_test-key',
        apiSecret: 'encrypted_test-secret'
      });
    });

    test('should fetch order status successfully', async () => {
      const status = await adapter.getOrderStatus('binance-order-123', 'BTC/USDT');

      expect(status.orderId).toBe('binance-order-123');
      expect(status.status).toBe('closed');
      expect(status.filled).toBe(1.0);
      expect(status.remaining).toBe(0);
      expect(status.averagePrice).toBe(45000);
    });
  });

  describe('setStopLoss()', () => {
    beforeEach(async () => {
      await adapter.connect({
        apiKey: 'encrypted_test-key',
        apiSecret: 'encrypted_test-secret'
      });
    });

    test('should create regular stop-loss order', async () => {
      const result = await adapter.setStopLoss({
        symbol: 'BTC/USDT',
        quantity: 0.5,
        stopPrice: 44000,
        type: 'STOP'
      });

      expect(result).toHaveProperty('orderId');
      expect(result.type).toBe('STOP_LOSS');
      expect(result.subType).toBe('STOP');
      expect(result.stopPrice).toBe(44000);
      expect(result.status).toBe('open');
    });

    test('should create trailing stop-loss order', async () => {
      const result = await adapter.setStopLoss({
        symbol: 'ETH/USDT',
        quantity: 2.0,
        type: 'TRAILING_STOP',
        trailPercent: 5
      });

      expect(result).toHaveProperty('orderId');
      expect(result.type).toBe('STOP_LOSS');
      expect(result.subType).toBe('TRAILING_STOP');
      expect(result.trailPercent).toBe(5);
    });

    test('should use default trail percent of 5% if not specified', async () => {
      const result = await adapter.setStopLoss({
        symbol: 'BTC/USDT',
        quantity: 0.5,
        type: 'TRAILING_STOP'
      });

      expect(result.trailPercent).toBe(5);
    });

    test('should throw error if stopPrice missing for regular stop', async () => {
      await expect(
        adapter.setStopLoss({
          symbol: 'BTC/USDT',
          quantity: 0.5,
          type: 'STOP'
        })
      ).rejects.toThrow('stopPrice is required');
    });

    test('should determine side based on quantity sign', async () => {
      // Positive quantity = SELL side
      const sellResult = await adapter.setStopLoss({
        symbol: 'BTC/USDT',
        quantity: 0.5,
        stopPrice: 44000
      });
      expect(sellResult.side).toBe('sell');

      // Negative quantity = BUY side
      const buyResult = await adapter.setStopLoss({
        symbol: 'BTC/USDT',
        quantity: -0.5,
        stopPrice: 46000
      });
      expect(buyResult.side).toBe('buy');
    });
  });

  describe('setTakeProfit()', () => {
    beforeEach(async () => {
      await adapter.connect({
        apiKey: 'encrypted_test-key',
        apiSecret: 'encrypted_test-secret'
      });
    });

    test('should create take-profit order', async () => {
      const result = await adapter.setTakeProfit({
        symbol: 'BTC/USDT',
        quantity: 0.5,
        limitPrice: 50000
      });

      expect(result).toHaveProperty('orderId');
      expect(result.type).toBe('TAKE_PROFIT');
      expect(result.limitPrice).toBe(50000);
      expect(result.status).toBe('open');
    });

    test('should throw error if limitPrice is missing', async () => {
      await expect(
        adapter.setTakeProfit({
          symbol: 'BTC/USDT',
          quantity: 0.5
        })
      ).rejects.toThrow('limitPrice is required');
    });

    test('should determine side based on quantity sign', async () => {
      // Positive quantity = SELL
      const sellResult = await adapter.setTakeProfit({
        symbol: 'BTC/USDT',
        quantity: 0.5,
        limitPrice: 50000
      });
      expect(sellResult.side).toBe('sell');

      // Negative quantity = BUY
      const buyResult = await adapter.setTakeProfit({
        symbol: 'BTC/USDT',
        quantity: -0.5,
        limitPrice: 44000
      });
      expect(buyResult.side).toBe('buy');
    });
  });

  describe('getOrderHistory()', () => {
    beforeEach(async () => {
      await adapter.connect({
        apiKey: 'encrypted_test-key',
        apiSecret: 'encrypted_test-secret'
      });
    });

    test('should fetch all order history', async () => {
      const history = await adapter.getOrderHistory();

      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBe(3);
      expect(history[0]).toHaveProperty('orderId');
      expect(history[0]).toHaveProperty('symbol');
      expect(history[0]).toHaveProperty('status');
    });

    test('should filter order history by symbol', async () => {
      const history = await adapter.getOrderHistory({ symbol: 'BTC/USDT' });

      expect(history.length).toBe(2);
      history.forEach(order => {
        expect(order.symbol).toBe('BTC/USDT');
      });
    });

    test('should filter order history by date range', async () => {
      const startDate = new Date(Date.now() - 5000000);
      const endDate = new Date(Date.now() - 2000000);

      const history = await adapter.getOrderHistory({
        startDate,
        endDate
      });

      expect(history.length).toBeGreaterThan(0);
      history.forEach(order => {
        const orderTime = new Date(order.createdAt).getTime();
        expect(orderTime).toBeGreaterThanOrEqual(startDate.getTime());
        expect(orderTime).toBeLessThanOrEqual(endDate.getTime());
      });
    });

    test('should apply limit to results', async () => {
      const history = await adapter.getOrderHistory({ limit: 2 });

      expect(history.length).toBeLessThanOrEqual(2);
    });

    test('should include fee information when available', async () => {
      const history = await adapter.getOrderHistory({ symbol: 'BTC/USDT' });

      const orderWithFee = history.find(o => o.fee);
      expect(orderWithFee).toBeDefined();
      expect(orderWithFee.fee).toHaveProperty('cost');
      expect(orderWithFee.fee).toHaveProperty('currency');
    });

    test('should transform orders to standardized format', async () => {
      const history = await adapter.getOrderHistory();

      const order = history[0];
      expect(order).toHaveProperty('orderId');
      expect(order).toHaveProperty('clientOrderId');
      expect(order).toHaveProperty('symbol');
      expect(order).toHaveProperty('side');
      expect(order).toHaveProperty('type');
      expect(order).toHaveProperty('status');
      expect(order).toHaveProperty('quantity');
      expect(order).toHaveProperty('filledQuantity');
      expect(order).toHaveProperty('remainingQuantity');
      expect(order).toHaveProperty('executedPrice');
      expect(order).toHaveProperty('createdAt');
    });
  });

  describe('getMarketPrice()', () => {
    beforeEach(async () => {
      await adapter.connect({
        apiKey: 'encrypted_test-key',
        apiSecret: 'encrypted_test-secret'
      });
    });

    test('should fetch market price for valid symbol', async () => {
      const price = await adapter.getMarketPrice('BTC/USDT');

      expect(price.symbol).toBe('BTC/USDT');
      expect(price.bid).toBe(44900);
      expect(price.ask).toBe(45100);
      expect(price.last).toBe(45000);
      expect(price.bidSize).toBe(5.2);
      expect(price.askSize).toBe(3.8);
      expect(price).toHaveProperty('timestamp');
      expect(price).toHaveProperty('datetime');
    });

    test('should throw error for invalid symbol', async () => {
      await expect(adapter.getMarketPrice('INVALID/USDT')).rejects.toThrow();
    });
  });

  describe('isSymbolSupported()', () => {
    beforeEach(async () => {
      await adapter.connect({
        apiKey: 'encrypted_test-key',
        apiSecret: 'encrypted_test-secret'
      });
    });

    test('should return true for supported and active symbol', async () => {
      const isSupported = await adapter.isSymbolSupported('BTC/USDT');
      expect(isSupported).toBe(true);
    });

    test('should return false for inactive symbol', async () => {
      const isSupported = await adapter.isSymbolSupported('DOGE/USDT');
      expect(isSupported).toBe(false);
    });

    test('should return false for non-existent symbol', async () => {
      const isSupported = await adapter.isSymbolSupported('INVALID/USDT');
      expect(isSupported).toBe(false);
    });

    test('should load markets if not already loaded', async () => {
      // Create new adapter without markets loaded
      const newAdapter = new BinanceAdapter();
      await newAdapter.connect({
        apiKey: 'encrypted_test-key',
        apiSecret: 'encrypted_test-secret'
      });

      const isSupported = await newAdapter.isSymbolSupported('ETH/USDT');
      expect(isSupported).toBe(true);
      expect(Object.keys(newAdapter.exchange.markets).length).toBeGreaterThan(0);
    });
  });

  describe('getFees()', () => {
    beforeEach(async () => {
      await adapter.connect({
        apiKey: 'encrypted_test-key',
        apiSecret: 'encrypted_test-secret'
      });
    });

    test('should fetch fee structure for valid symbol', async () => {
      const fees = await adapter.getFees('BTC/USDT');

      expect(fees.maker).toBe(0.001);
      expect(fees.taker).toBe(0.001);
      expect(fees.commission).toBe(0.001);
      expect(fees.currency).toBe('USDT');
      expect(fees).toHaveProperty('notes');
      expect(fees.notes).toContain('Binance');
    });

    test('should return default fees if market data unavailable', async () => {
      // Mock exchange.market to throw error
      adapter.exchange.market = jest.fn(() => {
        throw new Error('Market not found');
      });

      const fees = await adapter.getFees('INVALID/USDT');

      expect(fees.maker).toBe(0.001);
      expect(fees.taker).toBe(0.001);
      expect(fees.notes).toContain('Default Binance fees');
    });

    test('should load markets if not already loaded', async () => {
      const newAdapter = new BinanceAdapter();
      await newAdapter.connect({
        apiKey: 'encrypted_test-key',
        apiSecret: 'encrypted_test-secret'
      });

      const fees = await newAdapter.getFees('ETH/USDT');
      expect(fees).toBeDefined();
      expect(Object.keys(newAdapter.exchange.markets).length).toBeGreaterThan(0);
    });
  });

  describe('_ensureConnected()', () => {
    test('should throw error if exchange is null', () => {
      const emptyAdapter = new BinanceAdapter();
      expect(() => emptyAdapter._ensureConnected()).toThrow(
        'Not connected to Binance. Call connect() first.'
      );
    });

    test('should not throw if exchange is initialized', () => {
      // Adapter is initialized with credentials in beforeEach
      expect(() => adapter._ensureConnected()).not.toThrow();
    });
  });
});
