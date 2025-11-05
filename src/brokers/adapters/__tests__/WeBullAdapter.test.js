/**
 * Unit Tests for WeBullAdapter
 * Tests all BrokerAdapter interface methods with mocked WeBull API
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

describe('WeBullAdapter', () => {
  let adapter;
  let mockHttpClient;

  beforeEach(() => {
    // Create mock HTTP client
    mockHttpClient = {
      get: jest.fn(),
      post: jest.fn(),
      delete: jest.fn(),
      defaults: {
        headers: {
          common: {}
        }
      }
    };

    // Mock axios.create to return our mock client
    axios.create = jest.fn().mockReturnValue(mockHttpClient);

    adapter = new WeBullAdapter({
      apiKey: 'test-api-key',
      apiSecret: 'test-api-secret',
      refreshToken: 'test-refresh-token'
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with proper defaults', () => {
      expect(adapter.brokerName).toBe('webull');
      expect(adapter.brokerType).toBe('stock');
      expect(adapter.baseURL).toBe('https://api.webull.com/api');
      expect(adapter.isAuthenticated).toBe(false);
    });

    it('should accept custom options', () => {
      const customAdapter = new WeBullAdapter(
        { apiKey: 'key' },
        { baseURL: 'https://custom.api.com' }
      );
      expect(customAdapter.baseURL).toBe('https://custom.api.com');
    });

    it('should store credentials properly', () => {
      expect(adapter.apiKey).toBe('test-api-key');
      expect(adapter.apiSecret).toBe('test-api-secret');
      expect(adapter.refreshToken).toBe('test-refresh-token');
    });
  });

  describe('getOAuthURL', () => {
    it('should generate correct OAuth URL', () => {
      const url = WeBullAdapter.getOAuthURL(
        'client-id',
        'http://redirect.uri',
        'state123',
        'trade read'
      );

      expect(url).toContain('https://app.webull.com/oauth/authorize');
      expect(url).toContain('client_id=client-id');
      expect(url).toContain('redirect_uri=http%3A%2F%2Fredirect.uri');
      expect(url).toContain('state=state123');
      expect(url).toContain('scope=trade+read');
    });
  });

  describe('authenticate', () => {
    it('should authenticate with API key', async () => {
      mockHttpClient.post.mockResolvedValueOnce({
        data: { access_token: 'test-access-token' }
      });

      mockHttpClient.get.mockResolvedValueOnce({
        data: {
          accounts: [{ accountId: 'ACC123' }]
        }
      });

      const result = await adapter.authenticate();

      expect(result).toBe(true);
      expect(adapter.isAuthenticated).toBe(true);
      expect(adapter.accessToken).toBe('test-access-token');
      expect(adapter.accountId).toBe('ACC123');
      expect(mockHttpClient.defaults.headers.common['Authorization']).toBe('Bearer test-access-token');
    });

    it('should authenticate with OAuth tokens from user', async () => {
      adapter.userId = 'user123';

      const mockUser = {
        tradingConfig: {
          oauthTokens: new Map([
            ['webull', {
              isValid: true,
              accessToken: 'encrypted-token',
              expiresAt: new Date(Date.now() + 3600000) // 1 hour from now
            }]
          ])
        }
      };

      User.findById.mockResolvedValue(mockUser);
      oauth2Service.decryptToken.mockReturnValue('decrypted-access-token');

      mockHttpClient.get.mockResolvedValueOnce({
        data: {
          accounts: [{ accountId: 'ACC456' }]
        }
      });

      const result = await adapter.authenticate();

      expect(result).toBe(true);
      expect(adapter.isAuthenticated).toBe(true);
      expect(adapter.accessToken).toBe('decrypted-access-token');
      expect(adapter.accountId).toBe('ACC456');
    });

    it('should refresh expired OAuth token', async () => {
      adapter.userId = 'user123';

      const mockUser = {
        tradingConfig: {
          oauthTokens: new Map([
            ['webull', {
              isValid: true,
              accessToken: 'encrypted-token',
              refreshToken: 'encrypted-refresh',
              expiresAt: new Date(Date.now() - 3600000) // Expired 1 hour ago
            }]
          ])
        }
      };

      User.findById.mockResolvedValue(mockUser);
      oauth2Service.decryptToken.mockReturnValue('decrypted-refresh-token');

      mockHttpClient.post.mockResolvedValueOnce({
        data: { access_token: 'new-access-token' }
      });

      mockHttpClient.get.mockResolvedValueOnce({
        data: {
          accounts: [{ accountId: 'ACC789' }]
        }
      });

      const result = await adapter.authenticate();

      expect(result).toBe(true);
      expect(adapter.accessToken).toBe('new-access-token');
      expect(mockHttpClient.post).toHaveBeenCalledWith('/oauth/refresh', expect.any(Object));
    });

    it('should throw error if authentication fails', async () => {
      mockHttpClient.post.mockRejectedValue(new Error('Auth failed'));

      await expect(adapter.authenticate()).rejects.toThrow('WeBull authentication failed');
      expect(adapter.isAuthenticated).toBe(false);
    });
  });

  describe('getBalance', () => {
    beforeEach(async () => {
      // Setup authenticated state
      mockHttpClient.post.mockResolvedValueOnce({
        data: { access_token: 'test-token' }
      });
      mockHttpClient.get.mockResolvedValueOnce({
        data: { accounts: [{ accountId: 'ACC123' }] }
      });
      await adapter.authenticate();
      jest.clearAllMocks();
    });

    it('should fetch account balance', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        data: {
          totalValue: '100000.00',
          cashBalance: '25000.00',
          netLiquidation: '100000.00',
          unrealizedPnL: '5000.00',
          unrealizedPnLPercent: '5.26',
          dayTradesRemaining: 3,
          marginBalance: '50000.00',
          buyingPower: '50000.00'
        }
      });

      const balance = await adapter.getBalance();

      expect(balance).toEqual({
        total: 100000,
        available: 25000,
        equity: 100000,
        cash: 25000,
        currency: 'USD',
        portfolioValue: 100000,
        profitLoss: 5000,
        profitLossPercent: 5.26,
        dayTradesRemaining: 3,
        marginBalance: 50000,
        buyingPower: 50000
      });

      expect(mockHttpClient.get).toHaveBeenCalledWith('/accounts/ACC123/balance');
    });

    it('should handle missing balance fields', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        data: {
          cashBalance: '10000.00'
        }
      });

      const balance = await adapter.getBalance();

      expect(balance.cash).toBe(10000);
      expect(balance.total).toBe(0);
      expect(balance.buyingPower).toBe(10000);
    });

    it('should throw error on balance fetch failure', async () => {
      mockHttpClient.get.mockRejectedValue(new Error('Network error'));

      await expect(adapter.getBalance()).rejects.toThrow('Failed to get balance');
    });
  });

  describe('getPositions', () => {
    beforeEach(async () => {
      // Setup authenticated state
      mockHttpClient.post.mockResolvedValueOnce({
        data: { access_token: 'test-token' }
      });
      mockHttpClient.get.mockResolvedValueOnce({
        data: { accounts: [{ accountId: 'ACC123' }] }
      });
      await adapter.authenticate();
      jest.clearAllMocks();
    });

    it('should fetch open positions', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        data: {
          positions: [
            {
              symbol: 'AAPL',
              quantity: '100',
              avgPrice: '150.00',
              marketPrice: '155.00',
              marketValue: '15500.00',
              costBasis: '15000.00',
              unrealizedPnL: '500.00',
              unrealizedPnLPercent: '3.33',
              intradayPnL: '50.00',
              changeToday: '0.32'
            },
            {
              symbol: 'TSLA',
              quantity: '50',
              avgPrice: '250.00',
              marketPrice: '240.00',
              marketValue: '12000.00',
              costBasis: '12500.00',
              unrealizedPnL: '-500.00',
              unrealizedPnLPercent: '-4.00'
            }
          ]
        }
      });

      const positions = await adapter.getPositions();

      expect(positions).toHaveLength(2);
      expect(positions[0]).toEqual({
        symbol: 'AAPL',
        quantity: 100,
        side: 'LONG',
        entryPrice: 150,
        currentPrice: 155,
        marketValue: 15500,
        costBasis: 15000,
        unrealizedPnL: 500,
        unrealizedPnLPercent: 3.33,
        unrealizedIntraday: 50,
        changeToday: 0.32,
        positionType: 'STOCK'
      });

      expect(mockHttpClient.get).toHaveBeenCalledWith('/accounts/ACC123/positions');
    });

    it('should handle empty positions', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        data: { positions: [] }
      });

      const positions = await adapter.getPositions();

      expect(positions).toEqual([]);
    });

    it('should calculate entry price from cost basis if avgPrice missing', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        data: {
          positions: [{
            symbol: 'AAPL',
            quantity: '100',
            costBasis: '15000.00',
            marketPrice: '155.00',
            marketValue: '15500.00'
          }]
        }
      });

      const positions = await adapter.getPositions();

      expect(positions[0].entryPrice).toBe(150); // 15000 / 100
    });
  });

  describe('createOrder', () => {
    beforeEach(async () => {
      // Setup authenticated state
      mockHttpClient.post.mockResolvedValueOnce({
        data: { access_token: 'test-token' }
      });
      mockHttpClient.get.mockResolvedValueOnce({
        data: { accounts: [{ accountId: 'ACC123' }] }
      });
      await adapter.authenticate();
      jest.clearAllMocks();
    });

    it('should create market order', async () => {
      mockHttpClient.post.mockResolvedValueOnce({
        data: {
          orderId: 'ORD123',
          symbol: 'AAPL',
          side: 'BUY',
          orderType: 'MARKET',
          status: 'filled',
          quantity: '100',
          filledQuantity: '100',
          avgFillPrice: '150.25',
          timeInForce: 'DAY',
          createdTime: '2024-01-01T10:00:00Z',
          updatedTime: '2024-01-01T10:00:01Z'
        }
      });

      const order = await adapter.createOrder({
        symbol: 'AAPL',
        side: 'BUY',
        type: 'MARKET',
        quantity: 100
      });

      expect(order).toMatchObject({
        orderId: 'ORD123',
        symbol: 'AAPL',
        side: 'BUY',
        type: 'MARKET',
        status: 'FILLED',
        quantity: 100,
        filledQuantity: 100,
        executedPrice: 150.25,
        commission: 0
      });

      expect(mockHttpClient.post).toHaveBeenCalledWith('/orders', {
        accountId: 'ACC123',
        symbol: 'AAPL',
        quantity: 100,
        side: 'BUY',
        orderType: 'MARKET',
        timeInForce: 'DAY',
        extendedHours: false
      });
    });

    it('should create limit order', async () => {
      mockHttpClient.post.mockResolvedValueOnce({
        data: {
          orderId: 'ORD124',
          symbol: 'TSLA',
          side: 'SELL',
          orderType: 'LIMIT',
          status: 'working',
          quantity: '50',
          limitPrice: '250.00',
          timeInForce: 'GTC'
        }
      });

      const order = await adapter.createOrder({
        symbol: 'TSLA',
        side: 'SELL',
        type: 'LIMIT',
        quantity: 50,
        price: 250,
        timeInForce: 'GTC'
      });

      expect(order.type).toBe('LIMIT');
      expect(order.limitPrice).toBe(250);
      expect(order.status).toBe('PENDING');

      expect(mockHttpClient.post).toHaveBeenCalledWith('/orders', expect.objectContaining({
        limitPrice: 250
      }));
    });

    it('should create stop order', async () => {
      mockHttpClient.post.mockResolvedValueOnce({
        data: {
          orderId: 'ORD125',
          symbol: 'AAPL',
          side: 'SELL',
          orderType: 'STOP',
          status: 'pending',
          quantity: '100',
          stopPrice: '145.00'
        }
      });

      const order = await adapter.createOrder({
        symbol: 'AAPL',
        side: 'SELL',
        type: 'STOP',
        quantity: 100,
        stopPrice: 145
      });

      expect(order.type).toBe('STOP');
      expect(order.stopPrice).toBe(145);

      expect(mockHttpClient.post).toHaveBeenCalledWith('/orders', expect.objectContaining({
        stopPrice: 145
      }));
    });

    it('should handle order creation error', async () => {
      mockHttpClient.post.mockRejectedValue(new Error('Insufficient funds'));

      await expect(adapter.createOrder({
        symbol: 'AAPL',
        side: 'BUY',
        type: 'MARKET',
        quantity: 1000
      })).rejects.toThrow('Failed to create order');
    });
  });

  describe('cancelOrder', () => {
    beforeEach(async () => {
      // Setup authenticated state
      mockHttpClient.post.mockResolvedValueOnce({
        data: { access_token: 'test-token' }
      });
      mockHttpClient.get.mockResolvedValueOnce({
        data: { accounts: [{ accountId: 'ACC123' }] }
      });
      await adapter.authenticate();
      jest.clearAllMocks();
    });

    it('should cancel order successfully', async () => {
      mockHttpClient.delete.mockResolvedValueOnce({
        data: { success: true },
        status: 200
      });

      const result = await adapter.cancelOrder('ORD123');

      expect(result).toBe(true);
      expect(mockHttpClient.delete).toHaveBeenCalledWith('/orders/ORD123');
    });

    it('should return true for already cancelled order', async () => {
      mockHttpClient.delete.mockResolvedValueOnce({
        data: { error: 'Order already cancelled' },
        status: 200
      });

      const result = await adapter.cancelOrder('ORD123');

      expect(result).toBe(true);
    });

    it('should return true for filled order', async () => {
      mockHttpClient.delete.mockRejectedValue(new Error('Order already filled'));

      const result = await adapter.cancelOrder('ORD123');

      expect(result).toBe(true);
    });

    it('should throw error for other cancellation failures', async () => {
      mockHttpClient.delete.mockRejectedValue(new Error('Network error'));

      await expect(adapter.cancelOrder('ORD123')).rejects.toThrow('Failed to cancel order');
    });
  });

  describe('getOrderStatus', () => {
    beforeEach(async () => {
      // Setup authenticated state
      mockHttpClient.post.mockResolvedValueOnce({
        data: { access_token: 'test-token' }
      });
      mockHttpClient.get.mockResolvedValueOnce({
        data: { accounts: [{ accountId: 'ACC123' }] }
      });
      await adapter.authenticate();
      jest.clearAllMocks();
    });

    it('should fetch order status', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        data: {
          orderId: 'ORD123',
          status: 'partially_filled',
          quantity: '100',
          filledQuantity: '50',
          remainingQuantity: '50',
          avgFillPrice: '150.00',
          updatedTime: '2024-01-01T10:00:00Z'
        }
      });

      const status = await adapter.getOrderStatus('ORD123');

      expect(status).toEqual({
        orderId: 'ORD123',
        status: 'PARTIAL',
        filledQuantity: 50,
        remainingQuantity: 50,
        executedPrice: 150,
        updatedAt: '2024-01-01T10:00:00Z'
      });

      expect(mockHttpClient.get).toHaveBeenCalledWith('/orders/ORD123');
    });

    it('should calculate remaining quantity if not provided', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        data: {
          orderId: 'ORD123',
          status: 'working',
          quantity: '100',
          filledQuantity: '30'
        }
      });

      const status = await adapter.getOrderStatus('ORD123');

      expect(status.remainingQuantity).toBe(70);
    });
  });

  describe('setStopLoss', () => {
    beforeEach(async () => {
      // Setup authenticated state
      mockHttpClient.post.mockResolvedValueOnce({
        data: { access_token: 'test-token' }
      });
      mockHttpClient.get.mockResolvedValueOnce({
        data: { accounts: [{ accountId: 'ACC123' }] }
      });
      await adapter.authenticate();
      jest.clearAllMocks();
    });

    it('should create stop-loss order', async () => {
      mockHttpClient.post.mockResolvedValueOnce({
        data: {
          orderId: 'SL123',
          symbol: 'AAPL',
          orderType: 'STOP',
          status: 'working',
          stopPrice: '145.00',
          quantity: '100'
        }
      });

      const stopLoss = await adapter.setStopLoss({
        symbol: 'AAPL',
        quantity: 100,
        stopPrice: 145,
        side: 'SELL'
      });

      expect(stopLoss).toEqual({
        orderId: 'SL123',
        type: 'STOP_LOSS',
        status: 'PENDING',
        stopPrice: 145,
        trailPercent: 0,
        symbol: 'AAPL',
        quantity: 100
      });

      expect(mockHttpClient.post).toHaveBeenCalledWith('/orders', {
        accountId: 'ACC123',
        symbol: 'AAPL',
        quantity: 100,
        side: 'SELL',
        orderType: 'STOP',
        stopPrice: 145,
        timeInForce: 'GTC'
      });
    });

    it('should simulate trailing stop with regular stop', async () => {
      // Mock market price call
      mockHttpClient.get.mockResolvedValueOnce({
        data: {
          lastPrice: '150.00'
        }
      });

      mockHttpClient.post.mockResolvedValueOnce({
        data: {
          orderId: 'TS123',
          symbol: 'AAPL',
          orderType: 'STOP',
          status: 'working',
          stopPrice: '147.00'
        }
      });

      const stopLoss = await adapter.setStopLoss({
        symbol: 'AAPL',
        quantity: 100,
        type: 'TRAILING_STOP',
        trailPercent: 2,
        side: 'SELL'
      });

      expect(stopLoss.trailPercent).toBe(2);
      expect(mockHttpClient.post).toHaveBeenCalledWith('/orders', expect.objectContaining({
        stopPrice: 147 // 150 - (150 * 0.02)
      }));
    });
  });

  describe('setTakeProfit', () => {
    beforeEach(async () => {
      // Setup authenticated state
      mockHttpClient.post.mockResolvedValueOnce({
        data: { access_token: 'test-token' }
      });
      mockHttpClient.get.mockResolvedValueOnce({
        data: { accounts: [{ accountId: 'ACC123' }] }
      });
      await adapter.authenticate();
      jest.clearAllMocks();
    });

    it('should create take-profit order', async () => {
      mockHttpClient.post.mockResolvedValueOnce({
        data: {
          orderId: 'TP123',
          symbol: 'AAPL',
          orderType: 'LIMIT',
          status: 'working',
          limitPrice: '160.00',
          quantity: '100'
        }
      });

      const takeProfit = await adapter.setTakeProfit({
        symbol: 'AAPL',
        quantity: 100,
        limitPrice: 160,
        side: 'SELL'
      });

      expect(takeProfit).toEqual({
        orderId: 'TP123',
        type: 'TAKE_PROFIT',
        status: 'PENDING',
        limitPrice: 160,
        symbol: 'AAPL',
        quantity: 100
      });

      expect(mockHttpClient.post).toHaveBeenCalledWith('/orders', {
        accountId: 'ACC123',
        symbol: 'AAPL',
        quantity: 100,
        side: 'SELL',
        orderType: 'LIMIT',
        limitPrice: 160,
        timeInForce: 'GTC'
      });
    });
  });

  describe('getOrderHistory', () => {
    beforeEach(async () => {
      // Setup authenticated state
      mockHttpClient.post.mockResolvedValueOnce({
        data: { access_token: 'test-token' }
      });
      mockHttpClient.get.mockResolvedValueOnce({
        data: { accounts: [{ accountId: 'ACC123' }] }
      });
      await adapter.authenticate();
      jest.clearAllMocks();
    });

    it('should fetch order history', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        data: {
          orders: [
            {
              orderId: 'ORD1',
              symbol: 'AAPL',
              side: 'BUY',
              orderType: 'MARKET',
              status: 'filled',
              quantity: '100',
              filledQuantity: '100',
              avgFillPrice: '150.00',
              createdTime: '2024-01-01T09:00:00Z',
              filledTime: '2024-01-01T09:00:01Z'
            },
            {
              orderId: 'ORD2',
              symbol: 'TSLA',
              side: 'SELL',
              orderType: 'LIMIT',
              status: 'cancelled',
              quantity: '50',
              limitPrice: '250.00',
              createdTime: '2024-01-01T10:00:00Z'
            }
          ]
        }
      });

      const history = await adapter.getOrderHistory();

      expect(history).toHaveLength(2);
      expect(history[0]).toMatchObject({
        orderId: 'ORD1',
        symbol: 'AAPL',
        status: 'FILLED',
        commission: 0
      });

      expect(mockHttpClient.get).toHaveBeenCalledWith('/orders/history', {
        params: {
          accountId: 'ACC123',
          status: 'all',
          limit: 100,
          startDate: undefined,
          endDate: undefined
        }
      });
    });

    it('should filter by symbol', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        data: {
          orders: [
            { orderId: 'ORD1', symbol: 'AAPL', status: 'filled' },
            { orderId: 'ORD2', symbol: 'TSLA', status: 'filled' },
            { orderId: 'ORD3', symbol: 'AAPL', status: 'cancelled' }
          ]
        }
      });

      const history = await adapter.getOrderHistory({ symbol: 'AAPL' });

      expect(history).toHaveLength(2);
      expect(history.every(o => o.symbol === 'AAPL')).toBe(true);
    });

    it('should handle date filters', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      mockHttpClient.get.mockResolvedValueOnce({
        data: { orders: [] }
      });

      await adapter.getOrderHistory({ startDate, endDate });

      expect(mockHttpClient.get).toHaveBeenCalledWith('/orders/history', {
        params: expect.objectContaining({
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString()
        })
      });
    });
  });

  describe('getMarketPrice', () => {
    beforeEach(async () => {
      // Setup authenticated state
      mockHttpClient.post.mockResolvedValueOnce({
        data: { access_token: 'test-token' }
      });
      mockHttpClient.get.mockResolvedValueOnce({
        data: { accounts: [{ accountId: 'ACC123' }] }
      });
      await adapter.authenticate();
      jest.clearAllMocks();
    });

    it('should fetch market price', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        data: {
          symbol: 'AAPL',
          bidPrice: '149.95',
          askPrice: '150.05',
          lastPrice: '150.00',
          bidSize: '100',
          askSize: '150',
          volume: '50000000',
          high: '151.00',
          low: '149.00',
          open: '149.50',
          previousClose: '149.25',
          change: '0.75',
          changePercent: '0.50',
          timestamp: '2024-01-01T15:30:00Z'
        }
      });

      const price = await adapter.getMarketPrice('AAPL');

      expect(price).toEqual({
        symbol: 'AAPL',
        bid: 149.95,
        ask: 150.05,
        last: 150,
        bidSize: 100,
        askSize: 150,
        volume: 50000000,
        high: 151,
        low: 149,
        open: 149.5,
        close: 149.25,
        change: 0.75,
        changePercent: 0.5,
        timestamp: '2024-01-01T15:30:00Z'
      });

      expect(mockHttpClient.get).toHaveBeenCalledWith('/quotes/AAPL');
    });

    it('should handle alternative field names', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        data: {
          bid: '149.95',
          ask: '150.05',
          last: '150.00'
        }
      });

      const price = await adapter.getMarketPrice('AAPL');

      expect(price.bid).toBe(149.95);
      expect(price.ask).toBe(150.05);
      expect(price.last).toBe(150);
    });
  });

  describe('isSymbolSupported', () => {
    beforeEach(async () => {
      // Setup authenticated state
      mockHttpClient.post.mockResolvedValueOnce({
        data: { access_token: 'test-token' }
      });
      mockHttpClient.get.mockResolvedValueOnce({
        data: { accounts: [{ accountId: 'ACC123' }] }
      });
      await adapter.authenticate();
      jest.clearAllMocks();
    });

    it('should return true for supported stock', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        data: {
          symbol: 'AAPL',
          tradable: true,
          status: 'ACTIVE',
          type: 'STOCK'
        }
      });

      const supported = await adapter.isSymbolSupported('AAPL');

      expect(supported).toBe(true);
      expect(mockHttpClient.get).toHaveBeenCalledWith('/instruments/AAPL');
    });

    it('should return true for supported ETF', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        data: {
          symbol: 'SPY',
          tradable: true,
          status: 'ACTIVE',
          type: 'ETF'
        }
      });

      const supported = await adapter.isSymbolSupported('SPY');

      expect(supported).toBe(true);
    });

    it('should return false for non-tradable symbol', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        data: {
          symbol: 'XXX',
          tradable: false,
          status: 'ACTIVE',
          type: 'STOCK'
        }
      });

      const supported = await adapter.isSymbolSupported('XXX');

      expect(supported).toBe(false);
    });

    it('should return false for 404 response', async () => {
      mockHttpClient.get.mockRejectedValue({
        response: { status: 404 }
      });

      const supported = await adapter.isSymbolSupported('INVALID');

      expect(supported).toBe(false);
    });

    it('should return false for other errors', async () => {
      mockHttpClient.get.mockRejectedValue(new Error('Network error'));

      const supported = await adapter.isSymbolSupported('AAPL');

      expect(supported).toBe(false);
    });
  });

  describe('getFees', () => {
    it('should return commission-free fee structure', async () => {
      const fees = await adapter.getFees('AAPL');

      expect(fees).toEqual({
        maker: 0,
        taker: 0,
        commission: 0,
        minimumCommission: 0,
        maximumCommission: 0,
        regulatoryFees: 0.00221,
        withdrawal: 0,
        deposit: 0,
        notes: 'WeBull offers commission-free trading for stocks and ETFs. Small regulatory fees may apply.',
        currency: 'USD'
      });
    });
  });

  describe('normalizeSymbol', () => {
    it('should normalize symbols correctly', () => {
      expect(adapter.normalizeSymbol('AAPL')).toBe('AAPL');
      expect(adapter.normalizeSymbol('aapl')).toBe('AAPL');
      expect(adapter.normalizeSymbol('BTC/USD')).toBe('BTCUSD');
      expect(adapter.normalizeSymbol('tsla-b')).toBe('TSLAB');
    });
  });

  describe('mapOrderType', () => {
    it('should map order types correctly', () => {
      expect(adapter.mapOrderType('MARKET')).toBe('MARKET');
      expect(adapter.mapOrderType('LIMIT')).toBe('LIMIT');
      expect(adapter.mapOrderType('STOP')).toBe('STOP');
      expect(adapter.mapOrderType('STOP_LIMIT')).toBe('STOP_LIMIT');
      expect(adapter.mapOrderType('TRAILING_STOP')).toBe('STOP');
      expect(adapter.mapOrderType('UNKNOWN')).toBe('MARKET');
    });
  });

  describe('mapOrderStatus', () => {
    it('should map order statuses correctly', () => {
      expect(adapter.mapOrderStatus('working')).toBe('PENDING');
      expect(adapter.mapOrderStatus('pending')).toBe('PENDING');
      expect(adapter.mapOrderStatus('partially_filled')).toBe('PARTIAL');
      expect(adapter.mapOrderStatus('filled')).toBe('FILLED');
      expect(adapter.mapOrderStatus('cancelled')).toBe('CANCELLED');
      expect(adapter.mapOrderStatus('rejected')).toBe('REJECTED');
      expect(adapter.mapOrderStatus('unknown')).toBe('UNKNOWN');
    });
  });
});