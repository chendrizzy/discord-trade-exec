/**
 * Unit Tests: AlpacaAdapter
 *
 * Tests the Alpaca broker adapter with comprehensive network mocking:
 * - Order submission (market, limit, stop-loss)
 * - Order status queries
 * - Position queries
 * - Balance retrieval
 * - Error mapping
 * - Rate limiting
 * - OAuth2 authentication
 *
 * Test Strategy:
 * - Mock @alpacahq/alpaca-trade-api module
 * - Mock User model for OAuth2 token retrieval
 * - Mock OAuth2Service for token decryption
 * - Test error scenarios and edge cases
 *
 * Coverage Target: >95% for AlpacaAdapter.js
 */

'use strict';

const AlpacaAdapter = require('../../../src/brokers/adapters/AlpacaAdapter');
const User = require('../../../src/models/User');
const oauth2Service = require('../../../src/services/OAuth2Service');

// Mock Alpaca SDK
jest.mock('@alpacahq/alpaca-trade-api');
const Alpaca = require('@alpacahq/alpaca-trade-api');

// Mock User model
jest.mock('../../../src/models/User');

// Mock OAuth2Service
jest.mock('../../../src/services/OAuth2Service', () => ({
  decryptToken: jest.fn(encryptedToken => 'decrypted_' + encryptedToken),
  encryptToken: jest.fn(token => 'encrypted_' + token)
}));

describe('AlpacaAdapter', () => {
  let adapter;
  let mockAlpacaInstance;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create mock Alpaca instance
    mockAlpacaInstance = {
      getAccount: jest.fn(),
      getPosition: jest.fn(),
      getPositions: jest.fn(),
      createOrder: jest.fn(),
      getOrder: jest.fn(),
      getOrders: jest.fn(),
      cancelOrder: jest.fn(),
      closeAllPositions: jest.fn(),
      closePosition: jest.fn()
    };

    // Mock Alpaca constructor
    Alpaca.mockImplementation(() => mockAlpacaInstance);
  });

  describe('Constructor', () => {
    it('should initialize with API key credentials', () => {
      adapter = new AlpacaAdapter({
        apiKey: 'test_api_key',
        apiSecret: 'test_api_secret'
      });

      expect(adapter.brokerName).toBe('alpaca');
      expect(adapter.brokerType).toBe('stock');
      expect(adapter.apiKey).toBe('test_api_key');
      expect(adapter.apiSecret).toBe('test_api_secret');
    });

    it('should initialize with userId for OAuth2 authentication', () => {
      adapter = new AlpacaAdapter({
        userId: 'user123'
      });

      expect(adapter.userId).toBe('user123');
      expect(adapter.brokerName).toBe('alpaca');
    });

    it('should use paper trading URL for testnet', () => {
      adapter = new AlpacaAdapter({
        apiKey: 'test_key',
        apiSecret: 'test_secret',
        testnet: true
      });

      expect(adapter.isTestnet).toBe(true);
      expect(adapter.baseURL).toBe('https://paper-api.alpaca.markets');
    });

    it('should use production URL for live trading', () => {
      adapter = new AlpacaAdapter(
        {
          apiKey: 'test_key',
          apiSecret: 'test_secret'
        },
        { testnet: false }
      );

      expect(adapter.isTestnet).toBe(false);
      expect(adapter.baseURL).toBe('https://api.alpaca.markets');
    });
  });

  describe('OAuth2 Authentication', () => {
    it('should generate OAuth authorization URL', () => {
      const clientId = 'test_client_id';
      const redirectUri = 'http://localhost:3000/auth/alpaca/callback';
      const state = 'random_state_123';

      const authUrl = AlpacaAdapter.getOAuthURL(clientId, redirectUri, state);

      expect(authUrl).toContain('https://app.alpaca.markets/oauth/authorize');
      expect(authUrl).toContain('client_id=test_client_id');
      expect(authUrl).toContain('redirect_uri=http');
      expect(authUrl).toContain('state=random_state_123');
      expect(authUrl).toContain('response_type=code');
    });

    it('should authenticate with OAuth2 tokens from user profile', async () => {
      const mockUser = {
        _id: 'user123',
        tradingConfig: {
          oauthTokens: new Map([
            [
              'alpaca',
              {
                accessToken: 'encrypted_access_token',
                isValid: true
              }
            ]
          ])
        }
      };

      User.findById.mockResolvedValue(mockUser);

      adapter = new AlpacaAdapter({ userId: 'user123' });
      await adapter.authenticate();

      expect(User.findById).toHaveBeenCalledWith('user123');
      expect(oauth2Service.decryptToken).toHaveBeenCalledWith('encrypted_access_token');
      expect(Alpaca).toHaveBeenCalledWith(
        expect.objectContaining({
          keyId: 'oauth',
          oauth: 'decrypted_encrypted_access_token',
          secretKey: 'decrypted_encrypted_access_token',
          paper: false // Default from BrokerAdapter base class
        })
      );
    });

    it('should fall back to API key if OAuth tokens invalid', async () => {
      const mockUser = {
        _id: 'user123',
        tradingConfig: {
          oauthTokens: new Map([
            [
              'alpaca',
              {
                accessToken: 'encrypted_access_token',
                isValid: false // Invalid tokens
              }
            ]
          ])
        }
      };

      User.findById.mockResolvedValue(mockUser);

      adapter = new AlpacaAdapter({
        userId: 'user123',
        apiKey: 'fallback_key',
        apiSecret: 'fallback_secret'
      });
      await adapter.authenticate();

      expect(Alpaca).toHaveBeenCalledWith(
        expect.objectContaining({
          keyId: 'fallback_key',
          secretKey: 'fallback_secret'
        })
      );
    });

    it('should handle user not found gracefully', async () => {
      User.findById.mockResolvedValue(null);

      adapter = new AlpacaAdapter({
        userId: 'nonexistent_user',
        apiKey: 'fallback_key',
        apiSecret: 'fallback_secret'
      });

      await adapter.authenticate();

      expect(Alpaca).toHaveBeenCalledWith(
        expect.objectContaining({
          keyId: 'fallback_key',
          secretKey: 'fallback_secret'
        })
      );
    });
  });

  describe('testConnection', () => {
    it('should return true for successful connection', async () => {
      mockAlpacaInstance.getAccount.mockResolvedValue({
        cash: 100000,
        equity: 100000
      });

      adapter = new AlpacaAdapter({
        apiKey: 'test_key',
        apiSecret: 'test_secret'
      });

      const result = await adapter.testConnection();

      expect(result).toBe(true);
      expect(mockAlpacaInstance.getAccount).toHaveBeenCalled();
    });

    it('should return false for failed connection', async () => {
      mockAlpacaInstance.getAccount.mockRejectedValue(new Error('Connection failed'));

      adapter = new AlpacaAdapter({
        apiKey: 'invalid_key',
        apiSecret: 'invalid_secret'
      });

      const result = await adapter.testConnection();

      expect(result).toBe(false);
    });
  });

  describe('getBalance', () => {
    it('should retrieve account balance successfully', async () => {
      mockAlpacaInstance.getAccount.mockResolvedValue({
        cash: '50000.00',
        equity: '75000.00',
        buying_power: '100000.00',
        portfolio_value: '75000.00',
        last_equity: '70000.00'
      });

      adapter = new AlpacaAdapter({
        apiKey: 'test_key',
        apiSecret: 'test_secret'
      });

      const balance = await adapter.getBalance();

      expect(balance).toEqual({
        total: 75000,
        available: 100000,
        equity: 75000,
        cash: 50000,
        currency: 'USD',
        portfolioValue: 75000,
        profitLoss: 5000,
        profitLossPercent: expect.any(Number)
      });
    });

    it('should handle API errors gracefully', async () => {
      mockAlpacaInstance.getAccount.mockRejectedValue(new Error('API rate limit exceeded'));

      adapter = new AlpacaAdapter({
        apiKey: 'test_key',
        apiSecret: 'test_secret'
      });

      await expect(adapter.getBalance()).rejects.toThrow(/API rate limit exceeded/i);
    });
  });

  describe('createOrder', () => {
    beforeEach(async () => {
      adapter = new AlpacaAdapter({
        apiKey: 'test_key',
        apiSecret: 'test_secret'
      });
      mockAlpacaInstance.getAccount.mockResolvedValue({ equity: '100000' });
      await adapter.authenticate();
    });

    it('should place market buy order successfully', async () => {
      mockAlpacaInstance.createOrder.mockResolvedValue({
        id: 'order_123',
        client_order_id: 'client_order_123',
        symbol: 'AAPL',
        qty: '10',
        side: 'buy',
        type: 'market',
        status: 'accepted',
        filled_qty: '0',
        filled_avg_price: '0',
        limit_price: '0',
        stop_price: '0',
        time_in_force: 'gtc',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      const order = await adapter.createOrder({
        symbol: 'AAPL',
        quantity: 10,
        side: 'BUY',
        type: 'MARKET'
      });

      expect(order).toEqual({
        orderId: 'order_123',
        clientOrderId: 'client_order_123',
        symbol: 'AAPL',
        quantity: 10,
        side: 'BUY',
        type: 'MARKET',
        status: 'ACCEPTED',
        filledQuantity: 0,
        executedPrice: 0,
        limitPrice: 0,
        stopPrice: 0,
        timeInForce: 'GTC',
        createdAt: expect.any(String),
        updatedAt: expect.any(String)
      });

      expect(mockAlpacaInstance.createOrder).toHaveBeenCalledWith({
        symbol: 'AAPL',
        qty: 10,
        side: 'buy',
        type: 'market',
        time_in_force: 'gtc'
      });
    });

    it('should place limit order with price', async () => {
      mockAlpacaInstance.createOrder.mockResolvedValue({
        id: 'order_456',
        client_order_id: 'client_order_456',
        symbol: 'TSLA',
        qty: '5',
        side: 'sell',
        type: 'limit',
        limit_price: '250.00',
        status: 'accepted',
        filled_qty: '0',
        filled_avg_price: '0',
        stop_price: '0',
        time_in_force: 'gtc',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      const order = await adapter.createOrder({
        symbol: 'TSLA',
        quantity: 5,
        side: 'SELL',
        type: 'LIMIT',
        price: 250.0
      });

      expect(order.type).toBe('LIMIT');
      expect(mockAlpacaInstance.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'TSLA',
          qty: 5,
          side: 'sell',
          type: 'limit',
          limit_price: 250.0
        })
      );
    });

    it('should place stop-loss order', async () => {
      mockAlpacaInstance.createOrder.mockResolvedValue({
        id: 'order_789',
        client_order_id: 'client_order_789',
        symbol: 'NVDA',
        qty: '20',
        side: 'sell',
        type: 'stop',
        stop_price: '450.00',
        limit_price: '0',
        status: 'accepted',
        filled_qty: '0',
        filled_avg_price: '0',
        time_in_force: 'gtc',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      const order = await adapter.createOrder({
        symbol: 'NVDA',
        quantity: 20,
        side: 'SELL',
        type: 'STOP',
        stopPrice: 450.0
      });

      expect(mockAlpacaInstance.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'NVDA',
          type: 'stop',
          stop_price: 450.0
        })
      );
    });

    it('should handle order rejection', async () => {
      mockAlpacaInstance.createOrder.mockRejectedValue(new Error('Insufficient buying power'));

      await expect(
        adapter.createOrder({
          symbol: 'AAPL',
          quantity: 1000,
          side: 'BUY',
          type: 'MARKET'
        })
      ).rejects.toThrow('Insufficient buying power');
    });
  });

  describe('getOrderHistory', () => {
    beforeEach(async () => {
      adapter = new AlpacaAdapter({
        apiKey: 'test_key',
        apiSecret: 'test_secret'
      });
      mockAlpacaInstance.getAccount.mockResolvedValue({ equity: '100000' });
      await adapter.authenticate();
    });

    it('should retrieve order history successfully', async () => {
      mockAlpacaInstance.getOrders.mockResolvedValue([
        {
          id: 'order_123',
          client_order_id: 'client_123',
          symbol: 'AAPL',
          qty: '10',
          filled_qty: '10',
          filled_avg_price: '150.25',
          status: 'filled',
          side: 'buy',
          type: 'market',
          limit_price: '0',
          stop_price: '0',
          time_in_force: 'gtc',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          filled_at: new Date().toISOString()
        }
      ]);

      const history = await adapter.getOrderHistory();

      expect(history).toHaveLength(1);
      expect(history[0]).toEqual({
        orderId: 'order_123',
        clientOrderId: 'client_123',
        symbol: 'AAPL',
        quantity: 10,
        filledQuantity: 10,
        executedPrice: 150.25,
        status: 'FILLED',
        side: 'BUY',
        type: 'MARKET',
        limitPrice: 0,
        stopPrice: 0,
        timeInForce: 'GTC',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        filledAt: expect.any(String)
      });
    });

    it('should handle partially filled orders', async () => {
      mockAlpacaInstance.getOrders.mockResolvedValue([
        {
          id: 'order_456',
          client_order_id: 'client_456',
          symbol: 'TSLA',
          qty: '100',
          filled_qty: '50',
          filled_avg_price: '245.00',
          status: 'partially_filled',
          side: 'sell',
          type: 'limit',
          limit_price: '250.00',
          stop_price: '0',
          time_in_force: 'gtc',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ]);

      const history = await adapter.getOrderHistory();

      expect(history[0].status).toBe('PARTIAL');
      expect(history[0].filledQuantity).toBe(50);
    });

    it('should filter by symbol', async () => {
      mockAlpacaInstance.getOrders.mockResolvedValue([
        {
          id: 'order_789',
          client_order_id: 'client_789',
          symbol: 'AAPL',
          qty: '10',
          filled_qty: '10',
          status: 'filled',
          side: 'buy',
          type: 'market',
          limit_price: '0',
          stop_price: '0',
          time_in_force: 'gtc',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          id: 'order_790',
          client_order_id: 'client_790',
          symbol: 'TSLA',
          qty: '5',
          filled_qty: '5',
          status: 'filled',
          side: 'sell',
          type: 'market',
          limit_price: '0',
          stop_price: '0',
          time_in_force: 'gtc',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ]);

      const history = await adapter.getOrderHistory({ symbol: 'AAPL' });

      expect(history).toHaveLength(1);
      expect(history[0].symbol).toBe('AAPL');
    });
  });

  describe('getPositions', () => {
    beforeEach(async () => {
      adapter = new AlpacaAdapter({
        apiKey: 'test_key',
        apiSecret: 'test_secret'
      });
      mockAlpacaInstance.getAccount.mockResolvedValue({ equity: '100000' });
      await adapter.authenticate();
    });

    it('should retrieve all positions successfully', async () => {
      mockAlpacaInstance.getPositions.mockResolvedValue([
        {
          symbol: 'AAPL',
          qty: '100',
          avg_entry_price: '150.00',
          current_price: '155.00',
          market_value: '15500.00',
          cost_basis: '15000.00',
          unrealized_pl: '500.00',
          unrealized_plpc: '0.0333',
          unrealized_intraday_pl: '100.00',
          change_today: '0.0065',
          side: 'long'
        },
        {
          symbol: 'TSLA',
          qty: '50',
          avg_entry_price: '250.00',
          current_price: '245.00',
          market_value: '12250.00',
          cost_basis: '12500.00',
          unrealized_pl: '-250.00',
          unrealized_plpc: '-0.02',
          unrealized_intraday_pl: '-50.00',
          change_today: '-0.01',
          side: 'long'
        }
      ]);

      const positions = await adapter.getPositions();

      expect(positions).toHaveLength(2);
      expect(positions[0]).toEqual({
        symbol: 'AAPL',
        quantity: 100,
        side: 'LONG',
        entryPrice: 150.0,
        currentPrice: 155.0,
        marketValue: 15500.0,
        costBasis: 15000.0,
        unrealizedPnL: 500.0,
        unrealizedPnLPercent: expect.closeTo(3.33, 2), // Allow floating point variance
        unrealizedIntraday: 100.0,
        changeToday: 0.65
      });
    });

    it('should return empty array when no positions', async () => {
      mockAlpacaInstance.getPositions.mockResolvedValue([]);

      const positions = await adapter.getPositions();

      expect(positions).toEqual([]);
    });
  });

  describe('cancelOrder', () => {
    beforeEach(async () => {
      adapter = new AlpacaAdapter({
        apiKey: 'test_key',
        apiSecret: 'test_secret'
      });
      mockAlpacaInstance.getAccount.mockResolvedValue({ equity: '100000' });
      await adapter.authenticate();
    });

    it('should cancel order successfully', async () => {
      mockAlpacaInstance.cancelOrder.mockResolvedValue(true);

      const result = await adapter.cancelOrder('order_123');

      expect(result).toBe(true);
      expect(mockAlpacaInstance.cancelOrder).toHaveBeenCalledWith('order_123');
    });

    it('should handle order already filled gracefully', async () => {
      mockAlpacaInstance.cancelOrder.mockRejectedValue(new Error('Order already filled'));

      const result = await adapter.cancelOrder('order_filled');

      expect(result).toBe(true); // Still returns true for idempotency
    });
  });

  describe('Additional Methods', () => {
    beforeEach(async () => {
      adapter = new AlpacaAdapter({
        apiKey: 'test_key',
        apiSecret: 'test_secret'
      });
      mockAlpacaInstance.getAccount.mockResolvedValue({ equity: '100000' });
      await adapter.authenticate();
    });

    it('should retrieve market price for symbol', async () => {
      mockAlpacaInstance.getLatestQuote = jest.fn().mockResolvedValue({
        Symbol: 'AAPL',
        BidPrice: 149.95,
        AskPrice: 150.05,
        BidSize: 100,
        AskSize: 200,
        Timestamp: new Date().toISOString()
      });

      const quote = await adapter.getMarketPrice('AAPL');

      expect(quote).toEqual({
        symbol: 'AAPL',
        bid: 149.95,
        ask: 150.05,
        last: 150.05,
        bidSize: 100,
        askSize: 200,
        timestamp: expect.any(String)
      });
    });

    it('should check if symbol is supported', async () => {
      mockAlpacaInstance.getAsset = jest.fn().mockResolvedValue({
        symbol: 'AAPL',
        tradable: true,
        status: 'active'
      });

      const isSupported = await adapter.isSymbolSupported('AAPL');

      expect(isSupported).toBe(true);
      expect(mockAlpacaInstance.getAsset).toHaveBeenCalledWith('AAPL');
    });

    it('should return false for unsupported symbol', async () => {
      mockAlpacaInstance.getAsset = jest.fn().mockRejectedValue(new Error('Asset not found'));

      const isSupported = await adapter.isSymbolSupported('INVALID');

      expect(isSupported).toBe(false);
    });

    it('should return zero fees for Alpaca', async () => {
      const fees = await adapter.getFees('AAPL');

      expect(fees).toEqual({
        maker: 0,
        taker: 0,
        withdrawal: 0,
        notes: 'Alpaca offers commission-free trading for stocks and ETFs'
      });
    });

    it('should set stop-loss order', async () => {
      mockAlpacaInstance.createOrder.mockResolvedValue({
        id: 'stop_loss_123',
        symbol: 'AAPL',
        qty: '10',
        side: 'sell',
        type: 'stop',
        stop_price: '140.00',
        status: 'accepted',
        filled_qty: '0',
        filled_avg_price: '0',
        limit_price: '0',
        time_in_force: 'gtc',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      const stopLoss = await adapter.setStopLoss({
        symbol: 'AAPL',
        quantity: 10,
        stopPrice: 140.0
      });

      expect(stopLoss).toEqual({
        orderId: 'stop_loss_123',
        type: 'STOP_LOSS',
        status: 'ACCEPTED',
        stopPrice: 140.0,
        trailPercent: 0
      });
    });

    it('should set take-profit order', async () => {
      mockAlpacaInstance.createOrder.mockResolvedValue({
        id: 'take_profit_123',
        symbol: 'AAPL',
        qty: '10',
        side: 'sell',
        type: 'limit',
        limit_price: '160.00',
        status: 'accepted',
        filled_qty: '0',
        filled_avg_price: '0',
        stop_price: '0',
        time_in_force: 'gtc',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      const takeProfit = await adapter.setTakeProfit({
        symbol: 'AAPL',
        quantity: 10,
        limitPrice: 160.0
      });

      expect(takeProfit).toEqual({
        orderId: 'take_profit_123',
        type: 'TAKE_PROFIT',
        status: 'ACCEPTED',
        limitPrice: 160.0
      });
    });
  });

  describe('Helper Methods', () => {
    it('should normalize symbols correctly', () => {
      adapter = new AlpacaAdapter({
        apiKey: 'test_key',
        apiSecret: 'test_secret'
      });

      expect(adapter.normalizeSymbol('btc/usd')).toBe('BTCUSD');
      expect(adapter.normalizeSymbol('aapl')).toBe('AAPL');
      expect(adapter.normalizeSymbol('TSLA')).toBe('TSLA');
    });

    it('should map order types correctly', () => {
      adapter = new AlpacaAdapter({
        apiKey: 'test_key',
        apiSecret: 'test_secret'
      });

      expect(adapter.mapOrderType('MARKET')).toBe('market');
      expect(adapter.mapOrderType('LIMIT')).toBe('limit');
      expect(adapter.mapOrderType('STOP')).toBe('stop');
      expect(adapter.mapOrderType('STOP_LIMIT')).toBe('stop_limit');
      expect(adapter.mapOrderType('TRAILING_STOP')).toBe('trailing_stop');
      expect(adapter.mapOrderType('UNKNOWN')).toBe('market'); // Default
    });

    it('should map order statuses correctly', () => {
      adapter = new AlpacaAdapter({
        apiKey: 'test_key',
        apiSecret: 'test_secret'
      });

      expect(adapter.mapOrderStatus('new')).toBe('PENDING');
      expect(adapter.mapOrderStatus('partially_filled')).toBe('PARTIAL');
      expect(adapter.mapOrderStatus('filled')).toBe('FILLED');
      expect(adapter.mapOrderStatus('canceled')).toBe('CANCELLED');
      expect(adapter.mapOrderStatus('rejected')).toBe('REJECTED');
      expect(adapter.mapOrderStatus('unknown_status')).toBe('UNKNOWN');
    });
  });
});
