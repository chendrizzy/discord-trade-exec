/**
 * Integration Tests for BinanceAdapter
 * Tests complete workflows and inter-component integration
 *
 * Note: These tests use mocked CCXT API for safety
 * For live testing with real Binance API, set BINANCE_INTEGRATION_TEST=true
 */

const BinanceAdapter = require('../BinanceAdapter');
const logger = require('../../../middleware/logger');

// Mock ccxt with enhanced integration patterns
jest.mock('ccxt', () => {
  return {
    binance: class MockBinanceExchange {
      constructor(config) {
        this.config = config;
        this.orderBook = new Map();
        this.positions = new Map();
        this.accountBalance = {
          USDT: { total: 50000, free: 40000, used: 10000 },
          BTC: { total: 1.5, free: 1.2, used: 0.3 },
          ETH: { total: 10.0, free: 8.5, used: 1.5 }
        };
        this.markets = {};
        this.orderIdCounter = 1;
      }

      async fetchBalance() {
        return {
          ...this.accountBalance,
          info: { uid: 'binance-user-integration' }
        };
      }

      async createOrder(symbol, type, side, amount, price, params = {}) {
        const orderId = `binance-order-${this.orderIdCounter++}`;

        const orderData = {
          id: orderId,
          symbol,
          type,
          side,
          amount,
          price,
          filled: 0,
          remaining: amount,
          average: null,
          status: 'open',
          timestamp: Date.now(),
          lastTradeTimestamp: null,
          info: params
        };

        this.orderBook.set(orderId, orderData);

        // Simulate partial fill after delay
        setTimeout(() => {
          if (type === 'market' || type.includes('MARKET')) {
            orderData.filled = amount;
            orderData.remaining = 0;
            orderData.average = price || 45000;
            orderData.status = 'closed';
            orderData.lastTradeTimestamp = Date.now();
          }
        }, 50);

        return orderData;
      }

      async fetchOrder(orderId, symbol) {
        const order = this.orderBook.get(orderId);
        if (!order) {
          throw new Error('Order not found');
        }
        return order;
      }

      async cancelOrder(orderId, symbol) {
        const order = this.orderBook.get(orderId);
        if (!order) {
          throw new Error('Order not found');
        }
        order.status = 'canceled';
        return order;
      }

      async fetchClosedOrders(symbol, since, limit, params = {}) {
        const closedOrders = Array.from(this.orderBook.values())
          .filter(order => order.status === 'closed')
          .filter(order => !symbol || order.symbol === symbol)
          .slice(0, limit || 100);

        return closedOrders.map(order => ({
          ...order,
          clientOrderId: `client-${order.id}`,
          fee: { cost: order.amount * 0.001, currency: 'USDT' }
        }));
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

        if (!prices[symbol]) {
          throw new Error('Symbol not found');
        }

        return prices[symbol];
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
          }
        };
        return this.markets;
      }

      market(symbol) {
        if (!this.markets[symbol]) {
          throw new Error(`Market ${symbol} not found`);
        }
        return this.markets[symbol];
      }

      setSandboxMode(enabled) {
        this.sandboxMode = enabled;
      }

      // Helper to simulate balance changes
      updateBalance(currency, total, free, used) {
        this.accountBalance[currency] = { total, free, used };
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

// Mock encryption
jest.mock('../../../utils/encryption', () => ({
  decrypt: jest.fn((value) => value.replace('encrypted_', ''))
}));

describe('BinanceAdapter Integration Tests', () => {
  let adapter;

  beforeEach(() => {
    adapter = new BinanceAdapter();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    if (adapter.exchange) {
      await adapter.disconnect();
    }
  });

  describe('Integration 1: Complete Order Lifecycle', () => {
    test('should handle complete order flow: create → monitor → fill → history', async () => {
      // Step 1: Connect
      await adapter.connect({
        apiKey: 'encrypted_test-key',
        apiSecret: 'encrypted_test-secret'
      });
      expect(adapter.exchange).toBeDefined();

      // Step 2: Create market order
      const order = {
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'market',
        quantity: 0.1
      };

      const createdOrder = await adapter.placeOrder(order);
      expect(createdOrder).toHaveProperty('orderId');
      expect(createdOrder.symbol).toBe('BTC/USDT');

      // Step 3: Wait for fill
      await new Promise(resolve => setTimeout(resolve, 100));

      // Step 4: Check order status
      const status = await adapter.getOrderStatus(createdOrder.orderId, 'BTC/USDT');
      expect(status.status).toBe('closed');
      expect(status.filled).toBe(0.1);

      // Step 5: Verify in history
      const history = await adapter.getOrderHistory({ symbol: 'BTC/USDT' });
      expect(history.length).toBeGreaterThan(0);
      const filledOrder = history.find(o => o.orderId === createdOrder.orderId);
      expect(filledOrder).toBeDefined();
      expect(filledOrder.status).toBe('CLOSED');
    });

    test('should handle order cancellation workflow', async () => {
      await adapter.connect({
        apiKey: 'encrypted_test-key',
        apiSecret: 'encrypted_test-secret'
      });

      // Create limit order
      const order = {
        symbol: 'ETH/USDT',
        side: 'buy',
        type: 'limit',
        quantity: 2.0,
        price: 2900
      };

      const createdOrder = await adapter.placeOrder(order);
      expect(createdOrder.orderId).toBeDefined();

      // Cancel order before fill
      const cancelled = await adapter.cancelOrder(createdOrder.orderId, 'ETH/USDT');
      expect(cancelled.status).toBe('canceled');

      // Verify status updated
      const status = await adapter.getOrderStatus(createdOrder.orderId, 'ETH/USDT');
      expect(status.status).toBe('canceled');
    });
  });

  describe('Integration 2: Position and Balance Management', () => {
    test('should reflect balance changes after order execution', async () => {
      await adapter.connect({
        apiKey: 'encrypted_test-key',
        apiSecret: 'encrypted_test-secret'
      });

      // Get initial balance
      const initialBalance = await adapter.getBalance();
      expect(initialBalance.equity).toBe(50000);
      expect(initialBalance.cash).toBe(40000);

      // Simulate balance change after trade
      adapter.exchange.updateBalance('USDT', 48000, 38000, 10000);

      // Verify updated balance
      const updatedBalance = await adapter.getBalance();
      expect(updatedBalance.equity).toBe(48000);
      expect(updatedBalance.cash).toBe(38000);
    });

    test('should track positions after order fills', async () => {
      await adapter.connect({
        apiKey: 'encrypted_test-key',
        apiSecret: 'encrypted_test-secret'
      });

      // Fetch positions
      const positions = await adapter.getPositions();
      expect(positions.length).toBeGreaterThan(0);

      const btcPosition = positions.find(p => p.symbol === 'BTC');
      expect(btcPosition).toBeDefined();
      expect(btcPosition.quantity).toBe(1.5);
      expect(btcPosition.available).toBe(1.2);
      expect(btcPosition.locked).toBe(0.3);

      const ethPosition = positions.find(p => p.symbol === 'ETH');
      expect(ethPosition).toBeDefined();
      expect(ethPosition.quantity).toBe(10.0);
    });
  });

  describe('Integration 3: Market Data and Symbol Validation', () => {
    test('should validate symbol before placing order', async () => {
      await adapter.connect({
        apiKey: 'encrypted_test-key',
        apiSecret: 'encrypted_test-secret'
      });

      // Valid symbol
      const btcSupported = await adapter.isSymbolSupported('BTC/USDT');
      expect(btcSupported).toBe(true);

      // Invalid symbol
      const invalidSupported = await adapter.isSymbolSupported('INVALID/USDT');
      expect(invalidSupported).toBe(false);
    });

    test('should fetch market price for valid symbols', async () => {
      await adapter.connect({
        apiKey: 'encrypted_test-key',
        apiSecret: 'encrypted_test-secret'
      });

      const price = await adapter.getMarketPrice('BTC/USDT');
      expect(price.bid).toBe(44900);
      expect(price.ask).toBe(45100);
      expect(price.last).toBe(45000);
      expect(price.bidSize).toBe(5.2);
      expect(price.askSize).toBe(3.8);
    });
  });

  describe('Integration 4: Risk Management Workflow', () => {
    test('should create complete bracket order: entry + stop-loss + take-profit', async () => {
      await adapter.connect({
        apiKey: 'encrypted_test-key',
        apiSecret: 'encrypted_test-secret'
      });

      // Entry order
      const entryOrder = await adapter.placeOrder({
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'market',
        quantity: 0.5
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(entryOrder).toHaveProperty('orderId');

      // Stop-loss order
      const stopLoss = await adapter.setStopLoss({
        symbol: 'BTC/USDT',
        quantity: 0.5,
        stopPrice: 44000,
        type: 'STOP'
      });

      expect(stopLoss).toHaveProperty('orderId');
      expect(stopLoss.type).toBe('STOP_LOSS');
      expect(stopLoss.stopPrice).toBe(44000);

      // Take-profit order
      const takeProfit = await adapter.setTakeProfit({
        symbol: 'BTC/USDT',
        quantity: 0.5,
        limitPrice: 50000
      });

      expect(takeProfit).toHaveProperty('orderId');
      expect(takeProfit.type).toBe('TAKE_PROFIT');
      expect(takeProfit.limitPrice).toBe(50000);
    });

    test('should create trailing stop for dynamic risk management', async () => {
      await adapter.connect({
        apiKey: 'encrypted_test-key',
        apiSecret: 'encrypted_test-secret'
      });

      const trailingStop = await adapter.setStopLoss({
        symbol: 'ETH/USDT',
        quantity: 2.0,
        type: 'TRAILING_STOP',
        trailPercent: 5
      });

      expect(trailingStop).toHaveProperty('orderId');
      expect(trailingStop.type).toBe('STOP_LOSS');
      expect(trailingStop.subType).toBe('TRAILING_STOP');
      expect(trailingStop.trailPercent).toBe(5);
    });
  });

  describe('Integration 5: Order History and Execution Tracking', () => {
    test('should track multiple orders and filter by symbol', async () => {
      await adapter.connect({
        apiKey: 'encrypted_test-key',
        apiSecret: 'encrypted_test-secret'
      });

      // Create multiple orders
      await adapter.placeOrder({
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'market',
        quantity: 0.1
      });

      await adapter.placeOrder({
        symbol: 'ETH/USDT',
        side: 'buy',
        type: 'market',
        quantity: 1.0
      });

      await adapter.placeOrder({
        symbol: 'BTC/USDT',
        side: 'sell',
        type: 'limit',
        quantity: 0.05,
        price: 46000
      });

      // Wait for executions
      await new Promise(resolve => setTimeout(resolve, 150));

      // Get all history
      const allHistory = await adapter.getOrderHistory();
      expect(allHistory.length).toBeGreaterThan(0);

      // Filter by BTC
      const btcHistory = await adapter.getOrderHistory({ symbol: 'BTC/USDT' });
      btcHistory.forEach(order => {
        expect(order.symbol).toBe('BTC/USDT');
      });
    });
  });

  describe('Integration 6: Error Handling and Resilience', () => {
    test('should handle connection failure gracefully', async () => {
      // Mock exchange with failing fetchBalance
      const ccxt = require('ccxt');
      const originalBinance = ccxt.binance;

      ccxt.binance = class extends originalBinance {
        async fetchBalance() {
          throw new Error('API key invalid');
        }
      };

      await expect(
        adapter.connect({
          apiKey: 'encrypted_invalid-key',
          apiSecret: 'encrypted_invalid-secret'
        })
      ).rejects.toThrow('Failed to connect to Binance');

      ccxt.binance = originalBinance;
    });

    test('should handle invalid symbol in order creation', async () => {
      await adapter.connect({
        apiKey: 'encrypted_test-key',
        apiSecret: 'encrypted_test-secret'
      });

      const isSupported = await adapter.isSymbolSupported('INVALID/USDT');
      expect(isSupported).toBe(false);
    });

    test('should handle market price fetch failure for invalid symbol', async () => {
      await adapter.connect({
        apiKey: 'encrypted_test-key',
        apiSecret: 'encrypted_test-secret'
      });

      await expect(
        adapter.getMarketPrice('NONEXISTENT/USDT')
      ).rejects.toThrow();
    });
  });

  describe('Integration 7: Fee Calculation and Cost Analysis', () => {
    test('should provide accurate fee structure for trading decisions', async () => {
      await adapter.connect({
        apiKey: 'encrypted_test-key',
        apiSecret: 'encrypted_test-secret'
      });

      const fees = await adapter.getFees('BTC/USDT');

      expect(fees.maker).toBe(0.001);
      expect(fees.taker).toBe(0.001);
      expect(fees.commission).toBe(0.001);
      expect(fees.currency).toBe('USDT');
      expect(fees).toHaveProperty('notes');

      // Calculate expected fee for 0.5 BTC @ $45,000
      const tradeValue = 0.5 * 45000; // $22,500
      const expectedFee = tradeValue * fees.taker; // $22.50
      expect(expectedFee).toBe(22.5);
    });

    test('should include fee information in order history', async () => {
      await adapter.connect({
        apiKey: 'encrypted_test-key',
        apiSecret: 'encrypted_test-secret'
      });

      // Create and execute order
      await adapter.placeOrder({
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'market',
        quantity: 0.1
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Check history for fee
      const history = await adapter.getOrderHistory({ symbol: 'BTC/USDT' });
      const orderWithFee = history.find(o => o.fee);

      expect(orderWithFee).toBeDefined();
      expect(orderWithFee.fee).toHaveProperty('cost');
      expect(orderWithFee.fee).toHaveProperty('currency', 'USDT');
    });
  });

  describe('Integration 8: Multi-Order Risk Management', () => {
    test('should manage multiple positions with coordinated risk orders', async () => {
      await adapter.connect({
        apiKey: 'encrypted_test-key',
        apiSecret: 'encrypted_test-secret'
      });

      // Position 1: BTC long
      const btcEntry = await adapter.placeOrder({
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'market',
        quantity: 0.5
      });

      const btcStopLoss = await adapter.setStopLoss({
        symbol: 'BTC/USDT',
        quantity: 0.5,
        stopPrice: 44000
      });

      const btcTakeProfit = await adapter.setTakeProfit({
        symbol: 'BTC/USDT',
        quantity: 0.5,
        limitPrice: 50000
      });

      // Position 2: ETH long
      const ethEntry = await adapter.placeOrder({
        symbol: 'ETH/USDT',
        side: 'buy',
        type: 'market',
        quantity: 2.0
      });

      const ethStopLoss = await adapter.setStopLoss({
        symbol: 'ETH/USDT',
        quantity: 2.0,
        type: 'TRAILING_STOP',
        trailPercent: 5
      });

      // Verify all orders created
      expect(btcEntry.orderId).toBeDefined();
      expect(btcStopLoss.orderId).toBeDefined();
      expect(btcTakeProfit.orderId).toBeDefined();
      expect(ethEntry.orderId).toBeDefined();
      expect(ethStopLoss.orderId).toBeDefined();

      // Verify risk orders configured correctly
      expect(btcStopLoss.stopPrice).toBe(44000);
      expect(btcTakeProfit.limitPrice).toBe(50000);
      expect(ethStopLoss.trailPercent).toBe(5);
    });
  });
});
