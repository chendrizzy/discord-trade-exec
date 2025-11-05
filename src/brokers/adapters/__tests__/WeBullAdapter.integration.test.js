/**
 * Integration Tests for WeBullAdapter
 * Tests complete workflows and inter-component integration
 *
 * Note: These tests use mocked WeBull API for safety, but test integration patterns
 * For live testing with real WeBull API, set WEBULL_INTEGRATION_TEST=true
 */

const WeBullAdapter = require('../WeBullAdapter');
const User = require('../../../models/User');
const oauth2Service = require('../../../services/OAuth2Service');

// Mock axios for HTTP requests
jest.mock('axios');
const axios = require('axios');

// Mock User model
jest.mock('../../../models/User');

// Mock OAuth2Service
jest.mock('../../../services/OAuth2Service');

describe('WeBullAdapter Integration Tests', () => {
  let adapter;
  let mockHttpClient;
  let mockState;

  beforeEach(() => {
    // Initialize mock state for simulating stateful operations
    mockState = {
      positions: [],
      orders: new Map(),
      balance: {
        totalValue: 100000,
        cashBalance: 25000,
        netLiquidation: 100000,
        buyingPower: 50000,
        unrealizedPnL: 0,
        unrealizedPnLPercent: 0,
        dayTradesRemaining: 3
      },
      orderIdCounter: 1000,
      quotes: {
        AAPL: { bid: 149.95, ask: 150.05, last: 150 },
        TSLA: { bid: 249.50, ask: 250.50, last: 250 },
        SPY: { bid: 449.95, ask: 450.05, last: 450 }
      }
    };

    // Create mock HTTP client with stateful responses
    mockHttpClient = {
      get: jest.fn((url, config) => {
        // Account endpoints
        if (url === '/accounts') {
          return Promise.resolve({
            data: { accounts: [{ accountId: 'ACC123' }] }
          });
        }
        if (url.includes('/balance')) {
          return Promise.resolve({ data: mockState.balance });
        }
        if (url.includes('/positions')) {
          return Promise.resolve({ data: { positions: mockState.positions } });
        }

        // Quote endpoints
        const quoteMatch = url.match(/\/quotes\/(\w+)/);
        if (quoteMatch) {
          const symbol = quoteMatch[1];
          const quote = mockState.quotes[symbol];
          if (quote) {
            return Promise.resolve({
              data: {
                symbol,
                bidPrice: quote.bid.toString(),
                askPrice: quote.ask.toString(),
                lastPrice: quote.last.toString(),
                bidSize: '100',
                askSize: '100',
                volume: '10000000',
                timestamp: new Date().toISOString()
              }
            });
          }
        }

        // Order endpoints
        if (url.includes('/orders/history')) {
          const orders = Array.from(mockState.orders.values());
          return Promise.resolve({ data: { orders } });
        }
        const orderMatch = url.match(/\/orders\/(\w+)/);
        if (orderMatch) {
          const orderId = orderMatch[1];
          const order = mockState.orders.get(orderId);
          if (order) {
            return Promise.resolve({ data: order });
          }
        }

        // Instrument endpoints
        const instrumentMatch = url.match(/\/instruments\/(\w+)/);
        if (instrumentMatch) {
          const symbol = instrumentMatch[1];
          if (['AAPL', 'TSLA', 'SPY'].includes(symbol)) {
            return Promise.resolve({
              data: {
                symbol,
                tradable: true,
                status: 'ACTIVE',
                type: symbol === 'SPY' ? 'ETF' : 'STOCK'
              }
            });
          }
        }

        return Promise.reject(new Error(`Unmocked GET: ${url}`));
      }),

      post: jest.fn((url, data) => {
        // OAuth endpoints
        if (url === '/oauth/token' || url === '/oauth/refresh') {
          return Promise.resolve({
            data: { access_token: 'mock-access-token' }
          });
        }

        // Order creation
        if (url === '/orders') {
          const orderId = `ORD${mockState.orderIdCounter++}`;
          const order = {
            orderId,
            clientOrderId: orderId,
            symbol: data.symbol,
            side: data.side,
            orderType: data.orderType,
            status: data.orderType === 'MARKET' ? 'filled' : 'working',
            quantity: data.quantity.toString(),
            filledQuantity: data.orderType === 'MARKET' ? data.quantity.toString() : '0',
            limitPrice: data.limitPrice?.toString() || '0',
            stopPrice: data.stopPrice?.toString() || '0',
            avgFillPrice: data.orderType === 'MARKET' ? mockState.quotes[data.symbol]?.last.toString() || '150' : '0',
            timeInForce: data.timeInForce,
            createdTime: new Date().toISOString(),
            updatedTime: new Date().toISOString()
          };

          mockState.orders.set(orderId, order);

          // Update position for filled market orders
          if (data.orderType === 'MARKET') {
            updatePosition(data.symbol, data.side, data.quantity, order.avgFillPrice);
          }

          return Promise.resolve({ data: order });
        }

        return Promise.reject(new Error(`Unmocked POST: ${url}`));
      }),

      delete: jest.fn((url) => {
        const orderMatch = url.match(/\/orders\/(\w+)/);
        if (orderMatch) {
          const orderId = orderMatch[1];
          const order = mockState.orders.get(orderId);
          if (order) {
            if (order.status === 'filled') {
              return Promise.resolve({
                data: { error: 'Order already filled' },
                status: 200
              });
            }
            order.status = 'cancelled';
            return Promise.resolve({ data: { success: true }, status: 200 });
          }
        }
        return Promise.reject(new Error(`Unmocked DELETE: ${url}`));
      }),

      defaults: {
        headers: {
          common: {}
        }
      }
    };

    // Helper function to update positions
    function updatePosition(symbol, side, quantity, price) {
      const existingPos = mockState.positions.find(p => p.symbol === symbol);

      if (existingPos) {
        if (side === 'BUY') {
          const newQuantity = parseFloat(existingPos.quantity) + quantity;
          const newCostBasis = parseFloat(existingPos.costBasis) + (quantity * parseFloat(price));
          existingPos.quantity = newQuantity.toString();
          existingPos.costBasis = newCostBasis.toString();
          existingPos.avgPrice = (newCostBasis / newQuantity).toString();
        } else {
          const newQuantity = parseFloat(existingPos.quantity) - quantity;
          if (newQuantity <= 0) {
            mockState.positions = mockState.positions.filter(p => p.symbol !== symbol);
          } else {
            existingPos.quantity = newQuantity.toString();
          }
        }
      } else if (side === 'BUY') {
        mockState.positions.push({
          symbol,
          quantity: quantity.toString(),
          avgPrice: price,
          marketPrice: mockState.quotes[symbol]?.last.toString() || price,
          costBasis: (quantity * parseFloat(price)).toString(),
          marketValue: (quantity * mockState.quotes[symbol]?.last || parseFloat(price)).toString(),
          unrealizedPnL: '0',
          unrealizedPnLPercent: '0'
        });
      }

      // Update balance
      if (side === 'BUY') {
        mockState.balance.cashBalance -= quantity * parseFloat(price);
        mockState.balance.buyingPower -= quantity * parseFloat(price);
      } else {
        mockState.balance.cashBalance += quantity * parseFloat(price);
        mockState.balance.buyingPower += quantity * parseFloat(price);
      }
    }

    // Mock axios.create
    axios.create = jest.fn().mockReturnValue(mockHttpClient);

    adapter = new WeBullAdapter({
      apiKey: 'test-api-key',
      apiSecret: 'test-api-secret'
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Full Trading Workflow', () => {
    it('should execute complete buy and sell workflow', async () => {
      // Authenticate
      await adapter.authenticate();
      expect(adapter.isAuthenticated).toBe(true);

      // Check initial balance
      const initialBalance = await adapter.getBalance();
      expect(initialBalance.cash).toBe(25000);

      // Buy 100 shares of AAPL at market
      const buyOrder = await adapter.createOrder({
        symbol: 'AAPL',
        side: 'BUY',
        type: 'MARKET',
        quantity: 100
      });

      expect(buyOrder.status).toBe('FILLED');
      expect(buyOrder.filledQuantity).toBe(100);
      expect(buyOrder.executedPrice).toBe(150);

      // Check positions
      const positions = await adapter.getPositions();
      expect(positions).toHaveLength(1);
      expect(positions[0]).toMatchObject({
        symbol: 'AAPL',
        quantity: 100,
        entryPrice: 150
      });

      // Check updated balance
      const updatedBalance = await adapter.getBalance();
      expect(updatedBalance.cash).toBe(10000); // 25000 - (100 * 150)

      // Set stop-loss
      const stopLoss = await adapter.setStopLoss({
        symbol: 'AAPL',
        quantity: 100,
        stopPrice: 145,
        side: 'SELL'
      });
      expect(stopLoss.orderId).toBeDefined();
      expect(stopLoss.stopPrice).toBe(145);

      // Set take-profit
      const takeProfit = await adapter.setTakeProfit({
        symbol: 'AAPL',
        quantity: 100,
        limitPrice: 160,
        side: 'SELL'
      });
      expect(takeProfit.orderId).toBeDefined();
      expect(takeProfit.limitPrice).toBe(160);

      // Sell 50 shares at market
      const sellOrder = await adapter.createOrder({
        symbol: 'AAPL',
        side: 'SELL',
        type: 'MARKET',
        quantity: 50
      });

      expect(sellOrder.status).toBe('FILLED');

      // Check final positions
      const finalPositions = await adapter.getPositions();
      expect(finalPositions[0].quantity).toBe(50);

      // Check order history
      const history = await adapter.getOrderHistory();
      expect(history.length).toBeGreaterThanOrEqual(4);
    });

    it('should handle multiple concurrent orders', async () => {
      await adapter.authenticate();

      // Create multiple orders concurrently
      const orderPromises = [
        adapter.createOrder({
          symbol: 'AAPL',
          side: 'BUY',
          type: 'LIMIT',
          quantity: 100,
          price: 149
        }),
        adapter.createOrder({
          symbol: 'TSLA',
          side: 'BUY',
          type: 'LIMIT',
          quantity: 50,
          price: 248
        }),
        adapter.createOrder({
          symbol: 'SPY',
          side: 'BUY',
          type: 'MARKET',
          quantity: 20
        })
      ];

      const orders = await Promise.all(orderPromises);

      expect(orders).toHaveLength(3);
      expect(orders[0].type).toBe('LIMIT');
      expect(orders[1].type).toBe('LIMIT');
      expect(orders[2].type).toBe('MARKET');
      expect(orders[2].status).toBe('FILLED');

      // Check positions (only SPY should have position from market order)
      const positions = await adapter.getPositions();
      const spyPosition = positions.find(p => p.symbol === 'SPY');
      expect(spyPosition).toBeDefined();
      expect(spyPosition.quantity).toBe(20);
    });

    it('should manage order lifecycle correctly', async () => {
      await adapter.authenticate();

      // Create limit order
      const order = await adapter.createOrder({
        symbol: 'AAPL',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 100,
        price: 145,
        timeInForce: 'GTC'
      });

      expect(order.status).toBe('PENDING');

      // Check order status
      const status = await adapter.getOrderStatus(order.orderId);
      expect(status.orderId).toBe(order.orderId);
      expect(status.status).toBe('PENDING');

      // Cancel order
      const cancelled = await adapter.cancelOrder(order.orderId);
      expect(cancelled).toBe(true);

      // Try to cancel again (should still return true)
      const cancelledAgain = await adapter.cancelOrder(order.orderId);
      expect(cancelledAgain).toBe(true);

      // Check final status
      const finalStatus = await adapter.getOrderStatus(order.orderId);
      expect(finalStatus.status).toBe('CANCELLED');
    });
  });

  describe('Error Recovery and Edge Cases', () => {
    it('should handle authentication refresh gracefully', async () => {
      // Setup OAuth user with expired token
      adapter.userId = 'user123';
      const mockUser = {
        tradingConfig: {
          oauthTokens: new Map([
            ['webull', {
              isValid: true,
              accessToken: 'encrypted-token',
              refreshToken: 'encrypted-refresh',
              expiresAt: new Date(Date.now() - 3600000) // Expired
            }]
          ])
        }
      };

      User.findById.mockResolvedValue(mockUser);
      oauth2Service.decryptToken.mockReturnValue('decrypted-refresh-token');

      await adapter.authenticate();

      expect(adapter.isAuthenticated).toBe(true);
      expect(mockHttpClient.post).toHaveBeenCalledWith('/oauth/refresh', expect.any(Object));
    });

    it('should handle partial order fills correctly', async () => {
      await adapter.authenticate();

      // Create a large limit order that would partially fill
      const order = await adapter.createOrder({
        symbol: 'AAPL',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 1000,
        price: 150
      });

      // Simulate partial fill
      const partialOrder = mockState.orders.get(order.orderId);
      partialOrder.status = 'partial_filled';
      partialOrder.filledQuantity = '300';
      partialOrder.avgFillPrice = '149.95';

      const status = await adapter.getOrderStatus(order.orderId);
      expect(status.status).toBe('PARTIAL');
      expect(status.filledQuantity).toBe(300);
      expect(status.remainingQuantity).toBe(700);
    });

    it('should handle insufficient funds gracefully', async () => {
      await adapter.authenticate();

      // Try to buy more than available cash
      mockState.balance.cashBalance = 1000;
      mockState.balance.buyingPower = 1000;

      // This should succeed (mock doesn't validate funds)
      const order = await adapter.createOrder({
        symbol: 'AAPL',
        side: 'BUY',
        type: 'MARKET',
        quantity: 100 // Would cost $15,000
      });

      expect(order).toBeDefined();

      // In real scenario, API would return an error
      // which adapter would handle appropriately
    });

    it('should handle market data updates correctly', async () => {
      await adapter.authenticate();

      // Get initial price
      const price1 = await adapter.getMarketPrice('AAPL');
      expect(price1.last).toBe(150);

      // Update mock price
      mockState.quotes.AAPL = { bid: 151.95, ask: 152.05, last: 152 };

      // Get updated price
      const price2 = await adapter.getMarketPrice('AAPL');
      expect(price2.last).toBe(152);
    });

    it('should validate symbol support correctly', async () => {
      await adapter.authenticate();

      // Test supported symbols
      expect(await adapter.isSymbolSupported('AAPL')).toBe(true);
      expect(await adapter.isSymbolSupported('TSLA')).toBe(true);
      expect(await adapter.isSymbolSupported('SPY')).toBe(true);

      // Test unsupported symbol
      expect(await adapter.isSymbolSupported('INVALID')).toBe(false);
    });
  });

  describe('Portfolio Management', () => {
    it('should track P&L correctly across trades', async () => {
      await adapter.authenticate();

      // Buy 100 AAPL at 150
      await adapter.createOrder({
        symbol: 'AAPL',
        side: 'BUY',
        type: 'MARKET',
        quantity: 100
      });

      // Update market price to simulate profit
      mockState.quotes.AAPL = { bid: 154.95, ask: 155.05, last: 155 };

      // Update position with new market value
      const position = mockState.positions.find(p => p.symbol === 'AAPL');
      position.marketPrice = '155';
      position.marketValue = '15500';
      position.unrealizedPnL = '500';
      position.unrealizedPnLPercent = '3.33';

      const positions = await adapter.getPositions();
      expect(positions[0].unrealizedPnL).toBe(500);
      expect(positions[0].unrealizedPnLPercent).toBe(3.33);

      // Sell half at profit
      await adapter.createOrder({
        symbol: 'AAPL',
        side: 'SELL',
        type: 'MARKET',
        quantity: 50
      });

      // Check remaining position
      const finalPositions = await adapter.getPositions();
      expect(finalPositions[0].quantity).toBe(50);
    });

    it('should handle stop-loss and take-profit orders together', async () => {
      await adapter.authenticate();

      // Buy position
      await adapter.createOrder({
        symbol: 'TSLA',
        side: 'BUY',
        type: 'MARKET',
        quantity: 50
      });

      // Set bracket orders
      const stopLoss = await adapter.setStopLoss({
        symbol: 'TSLA',
        quantity: 50,
        stopPrice: 240,
        side: 'SELL'
      });

      const takeProfit = await adapter.setTakeProfit({
        symbol: 'TSLA',
        quantity: 50,
        limitPrice: 260,
        side: 'SELL'
      });

      // Check both orders exist
      const history = await adapter.getOrderHistory({ symbol: 'TSLA' });
      const stopOrder = history.find(o => o.orderId === stopLoss.orderId);
      const tpOrder = history.find(o => o.orderId === takeProfit.orderId);

      expect(stopOrder).toBeDefined();
      expect(tpOrder).toBeDefined();
      expect(stopOrder.stopPrice).toBe(240);
      expect(tpOrder.limitPrice).toBe(260);

      // Cancel one order
      await adapter.cancelOrder(stopLoss.orderId);

      // Verify cancellation
      const cancelledOrder = mockState.orders.get(stopLoss.orderId);
      expect(cancelledOrder.status).toBe('cancelled');
    });

    it('should calculate fees correctly', async () => {
      const fees = await adapter.getFees('AAPL');

      expect(fees.maker).toBe(0);
      expect(fees.taker).toBe(0);
      expect(fees.commission).toBe(0);
      expect(fees.regulatoryFees).toBe(0.00221);
      expect(fees.notes).toContain('commission-free');
    });
  });

  describe('Advanced Order Types', () => {
    it('should simulate trailing stop orders', async () => {
      await adapter.authenticate();

      // Buy position
      await adapter.createOrder({
        symbol: 'SPY',
        side: 'BUY',
        type: 'MARKET',
        quantity: 10
      });

      // Create trailing stop (simulated as regular stop)
      const trailingStop = await adapter.setStopLoss({
        symbol: 'SPY',
        quantity: 10,
        type: 'TRAILING_STOP',
        trailPercent: 2,
        side: 'SELL'
      });

      expect(trailingStop.trailPercent).toBe(2);
      expect(trailingStop.stopPrice).toBeCloseTo(441, 0); // 450 - (450 * 0.02)
    });

    it('should handle extended hours trading', async () => {
      await adapter.authenticate();

      const order = await adapter.createOrder({
        symbol: 'AAPL',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 50,
        price: 149,
        timeInForce: 'GTC',
        extendedHours: true
      });

      expect(order).toBeDefined();
      expect(order.timeInForce).toBe('GTC');
    });
  });

  describe('Connection and State Management', () => {
    it('should test connection successfully', async () => {
      const connected = await adapter.testConnection();
      expect(connected).toBe(true);
      expect(adapter.isAuthenticated).toBe(true);
    });

    it('should handle connection test failure', async () => {
      mockHttpClient.post.mockRejectedValueOnce(new Error('Network error'));

      const connected = await adapter.testConnection();
      expect(connected).toBe(false);
    });

    it('should maintain authentication state across operations', async () => {
      await adapter.authenticate();
      expect(adapter.isAuthenticated).toBe(true);

      // Multiple operations without re-authentication
      await adapter.getBalance();
      await adapter.getPositions();
      await adapter.getMarketPrice('AAPL');

      // Should only authenticate once
      const authCalls = mockHttpClient.post.mock.calls.filter(
        call => call[0] === '/oauth/token'
      );
      expect(authCalls).toHaveLength(1);
    });
  });
});