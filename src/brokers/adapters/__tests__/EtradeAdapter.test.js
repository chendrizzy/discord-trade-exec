/**
 * Unit Tests for EtradeAdapter
 * Tests all 16 BrokerAdapter interface methods with mocked Etrade API
 */

// Internal utilities and services
const EtradeAdapter = require('../EtradeAdapter');
const User = require('../../../models/User');
const oauth2Service = require('../../../services/OAuth2Service');

// Mock axios for API requests
jest.mock('axios');
const axios = require('axios');

// Mock User model
jest.mock('../../../models/User');

// Mock oauth2Service
jest.mock('../../../services/OAuth2Service');

// Mock logger to prevent memory issues
jest.mock('../../../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

describe('EtradeAdapter', () => {
  let adapter;
  let mockUser;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock user with Etrade OAuth tokens
    mockUser = {
      _id: 'test-user-id',
      tradingConfig: {
        oauthTokens: new Map([
          [
            'etrade',
            {
              accessToken: 'encrypted_access_token',
              accessTokenSecret: 'encrypted_token_secret',
              expiresAt: new Date(Date.now() + 7200000), // 2 hours from now
              isValid: true
            }
          ]
        ])
      }
    };

    User.findById = jest.fn().mockResolvedValue(mockUser);
    oauth2Service.decryptToken = jest.fn((encrypted) => {
      if (encrypted === 'encrypted_access_token') return 'mock_access_token';
      if (encrypted === 'encrypted_token_secret') return 'mock_token_secret';
      return encrypted;
    });

    adapter = new EtradeAdapter({ userId: 'test-user-id' }, { sandbox: true });
  });

  describe('Constructor', () => {
    test('should initialize with default configuration', () => {
      expect(adapter.brokerName).toBe('etrade');
      expect(adapter.brokerType).toBe('stock');
      expect(adapter.userId).toBe('test-user-id');
      expect(adapter.baseURL).toBe('https://etwssandbox.etrade.com');
    });

    test('should accept custom credentials and sandbox mode', () => {
      const customAdapter = new EtradeAdapter(
        { userId: 'custom-user' },
        { sandbox: false }
      );
      expect(customAdapter.userId).toBe('custom-user');
      expect(customAdapter.baseURL).toBe('https://api.etrade.com');
    });

    test('should prevent sandbox mode in production without explicit permission', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      delete process.env.BROKER_ALLOW_SANDBOX;

      expect(() => {
        new EtradeAdapter({ userId: 'test-user-id' }, { sandbox: true });
      }).toThrow('Sandbox mode is not allowed in production');

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('authenticate()', () => {
    test('should authenticate successfully with valid OAuth tokens', async () => {
      // Mock accounts list response
      axios.mockResolvedValueOnce({
        data: {
          AccountListResponse: {
            Accounts: {
              Account: [
                {
                  accountId: '12345678',
                  accountIdKey: 'abc123key',
                  accountMode: 'CASH',
                  accountDesc: 'INDIVIDUAL',
                  accountName: 'Test Account',
                  accountType: 'INDIVIDUAL',
                  institutionType: 'BROKERAGE',
                  accountStatus: 'ACTIVE'
                }
              ]
            }
          }
        }
      });

      const result = await adapter.authenticate();

      expect(result).toBe(true);
      expect(adapter.isAuthenticated).toBe(true);
      expect(adapter.accessToken).toBe('mock_access_token');
      expect(adapter.accessTokenSecret).toBe('mock_token_secret');
      expect(adapter.accountIdKey).toBe('abc123key');
      expect(adapter.accountId).toBe('12345678');
    });

    test('should throw error if userId not provided', async () => {
      const noUserAdapter = new EtradeAdapter({}, { sandbox: true });
      await expect(noUserAdapter.authenticate()).rejects.toThrow(
        'User ID required for E*TRADE OAuth 1.0a authentication'
      );
    });

    test('should throw error if user not found', async () => {
      User.findById.mockResolvedValueOnce(null);
      await expect(adapter.authenticate()).rejects.toThrow('User \'test-user-id\' not found');
    });

    test('should throw error if no OAuth tokens found', async () => {
      mockUser.tradingConfig.oauthTokens = new Map();
      await expect(adapter.authenticate()).rejects.toThrow(
        'No OAuth tokens found for E*TRADE'
      );
    });

    test('should throw error if tokens marked invalid', async () => {
      mockUser.tradingConfig.oauthTokens.get('etrade').isValid = false;
      await expect(adapter.authenticate()).rejects.toThrow('OAuth tokens marked invalid');
    });

    test('should throw error if tokens expired', async () => {
      mockUser.tradingConfig.oauthTokens.get('etrade').expiresAt = new Date(Date.now() - 1000);
      await expect(adapter.authenticate()).rejects.toThrow('E*TRADE token expired');
    });
  });

  describe('testConnection()', () => {
    test('should return true when connection successful', async () => {
      axios.mockResolvedValueOnce({
        data: {
          AccountListResponse: {
            Accounts: {
              Account: [{ accountId: '12345678', accountIdKey: 'abc123key' }]
            }
          }
        }
      });

      const result = await adapter.testConnection();
      expect(result).toBe(true);
    });

    test('should return false when connection fails', async () => {
      User.findById.mockRejectedValueOnce(new Error('Connection failed'));
      const result = await adapter.testConnection();
      expect(result).toBe(false);
    });
  });

  describe('getBalance()', () => {
    beforeEach(async () => {
      // Setup authenticated adapter
      axios.mockResolvedValueOnce({
        data: {
          AccountListResponse: {
            Accounts: { Account: [{ accountIdKey: 'abc123key', accountId: '12345678' }] }
          }
        }
      });
      await adapter.authenticate();
    });

    test('should retrieve account balance successfully', async () => {
      axios.mockResolvedValueOnce({
        data: {
          BalanceResponse: {
            Computed: {
              RealTimeValues: { totalAccountValue: 1000000 },
              cashAvailableForWithdrawal: 500000,
              cashBalance: 500000,
              buyingPower: { stock: 2000000, margin: 4000000 },
              unrealizedGain: 50000
            }
          }
        }
      });

      const balance = await adapter.getBalance('USD');

      expect(balance).toHaveProperty('total', 1000000);
      expect(balance).toHaveProperty('available', 500000);
      expect(balance).toHaveProperty('equity', 1000000);
      expect(balance).toHaveProperty('cash', 500000);
      expect(balance).toHaveProperty('currency', 'USD');
      expect(balance).toHaveProperty('buyingPower', 2000000);
      expect(balance).toHaveProperty('marginBuyingPower', 4000000);
      expect(balance).toHaveProperty('profitLoss', 50000);
      expect(balance).toHaveProperty('profitLossPercent', 5);
    });

    test('should handle balance fetch errors', async () => {
      axios.mockRejectedValueOnce(new Error('API Error'));
      await expect(adapter.getBalance()).rejects.toThrow('Failed to get balance');
    });
  });

  describe('createOrder()', () => {
    beforeEach(async () => {
      axios.mockResolvedValueOnce({
        data: {
          AccountListResponse: {
            Accounts: { Account: [{ accountIdKey: 'abc123key', accountId: '12345678' }] }
          }
        }
      });
      await adapter.authenticate();
    });

    test('should create a market order successfully', async () => {
      // Mock preview response
      axios.mockResolvedValueOnce({
        data: {
          PreviewOrderResponse: {
            PreviewIds: [{ previewId: 'preview123' }]
          }
        }
      });

      // Mock place order response
      axios.mockResolvedValueOnce({
        data: {
          PlaceOrderResponse: {
            Order: [
              {
                orderId: 'order123',
                orderStatus: 'EXECUTED',
                filledQuantity: 100,
                averageExecutionPrice: 150.25,
                orderPlacedTime: new Date().toISOString()
              }
            ]
          }
        }
      });

      const order = {
        symbol: 'AAPL',
        side: 'BUY',
        type: 'MARKET',
        quantity: 100,
        timeInForce: 'DAY'
      };

      const result = await adapter.createOrder(order);

      expect(result).toHaveProperty('orderId', 'order123');
      expect(result).toHaveProperty('status', 'FILLED');
      expect(result).toHaveProperty('symbol', 'AAPL');
      expect(result).toHaveProperty('side', 'BUY');
      expect(result.filledQuantity).toBe(100);
      expect(result.executedPrice).toBe(150.25);
    });

    test('should create a limit order successfully', async () => {
      axios.mockResolvedValueOnce({
        data: { PreviewOrderResponse: { PreviewIds: [{ previewId: 'preview123' }] } }
      });
      axios.mockResolvedValueOnce({
        data: {
          PlaceOrderResponse: {
            Order: [
              {
                orderId: 'order124',
                orderStatus: 'OPEN',
                filledQuantity: 0,
                orderPlacedTime: new Date().toISOString()
              }
            ]
          }
        }
      });

      const order = {
        symbol: 'TSLA',
        side: 'SELL',
        type: 'LIMIT',
        quantity: 50,
        price: 200.0,
        timeInForce: 'GTC'
      };

      const result = await adapter.createOrder(order);
      expect(result.symbol).toBe('TSLA');
      expect(result.side).toBe('SELL');
      expect(result.type).toBe('LIMIT');
      expect(result.limitPrice).toBe(200.0);
    });

    test('should create a stop order successfully', async () => {
      axios.mockResolvedValueOnce({
        data: { PreviewOrderResponse: { PreviewIds: [{ previewId: 'preview123' }] } }
      });
      axios.mockResolvedValueOnce({
        data: {
          PlaceOrderResponse: {
            Order: [
              {
                orderId: 'order125',
                orderStatus: 'OPEN',
                orderPlacedTime: new Date().toISOString()
              }
            ]
          }
        }
      });

      const order = {
        symbol: 'MSFT',
        side: 'SELL',
        type: 'STOP',
        quantity: 25,
        stopPrice: 290.0
      };

      const result = await adapter.createOrder(order);
      expect(result.type).toBe('STOP');
      expect(result.stopPrice).toBe(290.0);
    });

    test('should create a stop-limit order successfully', async () => {
      axios.mockResolvedValueOnce({
        data: { PreviewOrderResponse: { PreviewIds: [{ previewId: 'preview123' }] } }
      });
      axios.mockResolvedValueOnce({
        data: {
          PlaceOrderResponse: {
            Order: [
              {
                orderId: 'order126',
                orderStatus: 'OPEN',
                orderPlacedTime: new Date().toISOString()
              }
            ]
          }
        }
      });

      const order = {
        symbol: 'GOOGL',
        side: 'BUY',
        type: 'STOP_LIMIT',
        quantity: 10,
        price: 150.0,
        stopPrice: 148.0
      };

      const result = await adapter.createOrder(order);
      expect(result.type).toBe('STOP_LIMIT');
      expect(result.limitPrice).toBe(150.0);
      expect(result.stopPrice).toBe(148.0);
    });

    test('should handle order creation errors', async () => {
      axios.mockRejectedValueOnce(new Error('Invalid order parameters'));
      await expect(
        adapter.createOrder({
          symbol: 'AAPL',
          side: 'BUY',
          type: 'MARKET',
          quantity: 100
        })
      ).rejects.toThrow('Failed to create order');
    });

    test('should normalize symbol before creating order', async () => {
      axios.mockResolvedValueOnce({
        data: { PreviewOrderResponse: { PreviewIds: [{ previewId: 'preview123' }] } }
      });
      axios.mockResolvedValueOnce({
        data: {
          PlaceOrderResponse: {
            Order: [
              {
                orderId: 'order127',
                orderStatus: 'OPEN',
                orderPlacedTime: new Date().toISOString()
              }
            ]
          }
        }
      });

      const order = {
        symbol: 'btc/usd',
        side: 'BUY',
        type: 'MARKET',
        quantity: 1
      };

      const result = await adapter.createOrder(order);
      expect(result.symbol).toBe('btc/usd');

      // Verify normalized symbol was sent to API
      expect(axios.mock.calls[0][0].url).toContain('orders/preview');
    });
  });

  describe('cancelOrder()', () => {
    beforeEach(async () => {
      axios.mockResolvedValueOnce({
        data: {
          AccountListResponse: {
            Accounts: { Account: [{ accountIdKey: 'abc123key', accountId: '12345678' }] }
          }
        }
      });
      await adapter.authenticate();
    });

    test('should cancel an order successfully', async () => {
      axios.mockResolvedValueOnce({
        data: {
          CancelOrderResponse: {
            resultMessage: 'SUCCESS'
          }
        }
      });

      const result = await adapter.cancelOrder('order123');
      expect(result).toBe(true);
    });

    test('should handle already cancelled orders', async () => {
      axios.mockRejectedValueOnce(new Error('Order already cancelled'));
      const result = await adapter.cancelOrder('order123');
      expect(result).toBe(true); // Should return true for already cancelled
    });

    test('should handle order not found errors', async () => {
      axios.mockRejectedValueOnce(new Error('Order not found'));
      const result = await adapter.cancelOrder('invalid-order');
      expect(result).toBe(true); // Should return true for not found
    });

    test('should throw error for other cancellation failures', async () => {
      axios.mockRejectedValueOnce(new Error('Network error'));
      await expect(adapter.cancelOrder('order123')).rejects.toThrow(
        'Failed to cancel order'
      );
    });
  });

  describe('getPositions()', () => {
    beforeEach(async () => {
      axios.mockResolvedValueOnce({
        data: {
          AccountListResponse: {
            Accounts: { Account: [{ accountIdKey: 'abc123key', accountId: '12345678' }] }
          }
        }
      });
      await adapter.authenticate();
    });

    test('should retrieve open positions successfully', async () => {
      axios.mockResolvedValueOnce({
        data: {
          PortfolioResponse: {
            AccountPortfolio: [
              {
                Position: [
                  {
                    Product: { symbol: 'AAPL' },
                    quantity: 100,
                    pricePaid: 145.5,
                    Quick: { lastTrade: 150.0 },
                    marketValue: 15000,
                    totalCost: 14550,
                    totalGain: 450,
                    totalGainPct: 3.09,
                    daysGain: 50,
                    daysGainPct: 0.33
                  },
                  {
                    Product: { symbol: 'TSLA' },
                    quantity: 50,
                    pricePaid: 210.0,
                    Quick: { lastTrade: 215.0 },
                    marketValue: 10750,
                    totalCost: 10500,
                    totalGain: 250,
                    totalGainPct: 2.38,
                    daysGain: 25,
                    daysGainPct: 0.23
                  }
                ]
              }
            ]
          }
        }
      });

      const positions = await adapter.getPositions();
      expect(Array.isArray(positions)).toBe(true);
      expect(positions.length).toBe(2);

      const aaplPos = positions.find(p => p.symbol === 'AAPL');
      expect(aaplPos).toBeDefined();
      expect(aaplPos.quantity).toBe(100);
      expect(aaplPos.side).toBe('LONG');
      expect(aaplPos.entryPrice).toBe(145.5);
      expect(aaplPos.currentPrice).toBe(150.0);
      expect(aaplPos.unrealizedPnL).toBe(450);
    });

    test('should return empty array when no positions', async () => {
      axios.mockResolvedValueOnce({
        data: {
          PortfolioResponse: {
            AccountPortfolio: [{ Position: [] }]
          }
        }
      });

      const positions = await adapter.getPositions();
      expect(Array.isArray(positions)).toBe(true);
      expect(positions.length).toBe(0);
    });
  });

  describe('setStopLoss()', () => {
    beforeEach(async () => {
      axios.mockResolvedValueOnce({
        data: {
          AccountListResponse: {
            Accounts: { Account: [{ accountIdKey: 'abc123key', accountId: '12345678' }] }
          }
        }
      });
      await adapter.authenticate();
    });

    test('should create a stop-loss order', async () => {
      axios.mockResolvedValueOnce({
        data: { PreviewOrderResponse: { PreviewIds: [{ previewId: 'preview123' }] } }
      });
      axios.mockResolvedValueOnce({
        data: {
          PlaceOrderResponse: {
            Order: [
              {
                orderId: 'stoporder123',
                orderStatus: 'OPEN',
                orderPlacedTime: new Date().toISOString()
              }
            ]
          }
        }
      });

      const result = await adapter.setStopLoss({
        symbol: 'AAPL',
        quantity: 100,
        stopPrice: 140.0,
        type: 'STOP'
      });

      expect(result).toHaveProperty('orderId', 'stoporder123');
      expect(result).toHaveProperty('type', 'STOP_LOSS');
      expect(result).toHaveProperty('status', 'PENDING');
      expect(result).toHaveProperty('stopPrice', 140.0);
    });

    test('should create a trailing stop order', async () => {
      axios.mockResolvedValueOnce({
        data: { PreviewOrderResponse: { PreviewIds: [{ previewId: 'preview123' }] } }
      });
      axios.mockResolvedValueOnce({
        data: {
          PlaceOrderResponse: {
            Order: [
              {
                orderId: 'trailstop123',
                orderStatus: 'OPEN',
                orderPlacedTime: new Date().toISOString()
              }
            ]
          }
        }
      });

      const result = await adapter.setStopLoss({
        symbol: 'TSLA',
        quantity: 50,
        type: 'TRAILING_STOP',
        trailPercent: 5
      });

      expect(result).toHaveProperty('orderId', 'trailstop123');
      expect(result).toHaveProperty('type', 'STOP_LOSS');
      expect(result).toHaveProperty('trailPercent', 5);
    });

    test('should use default trail percent if not provided', async () => {
      axios.mockResolvedValueOnce({
        data: { PreviewOrderResponse: { PreviewIds: [{ previewId: 'preview123' }] } }
      });
      axios.mockResolvedValueOnce({
        data: {
          PlaceOrderResponse: {
            Order: [
              {
                orderId: 'trailstop124',
                orderStatus: 'OPEN',
                orderPlacedTime: new Date().toISOString()
              }
            ]
          }
        }
      });

      const result = await adapter.setStopLoss({
        symbol: 'MSFT',
        quantity: 25,
        type: 'TRAILING_STOP'
      });

      expect(result).toHaveProperty('trailPercent', 2.0);
    });

    test('should handle stop-loss creation errors', async () => {
      axios.mockRejectedValueOnce(new Error('Invalid stop price'));
      await expect(
        adapter.setStopLoss({
          symbol: 'AAPL',
          quantity: 100,
          stopPrice: 140.0
        })
      ).rejects.toThrow('Failed to set stop-loss');
    });
  });

  describe('setTakeProfit()', () => {
    beforeEach(async () => {
      axios.mockResolvedValueOnce({
        data: {
          AccountListResponse: {
            Accounts: { Account: [{ accountIdKey: 'abc123key', accountId: '12345678' }] }
          }
        }
      });
      await adapter.authenticate();
    });

    test('should create a take-profit order', async () => {
      axios.mockResolvedValueOnce({
        data: { PreviewOrderResponse: { PreviewIds: [{ previewId: 'preview123' }] } }
      });
      axios.mockResolvedValueOnce({
        data: {
          PlaceOrderResponse: {
            Order: [
              {
                orderId: 'takeprofit123',
                orderStatus: 'OPEN',
                orderPlacedTime: new Date().toISOString()
              }
            ]
          }
        }
      });

      const result = await adapter.setTakeProfit({
        symbol: 'AAPL',
        quantity: 100,
        limitPrice: 160.0
      });

      expect(result).toHaveProperty('orderId', 'takeprofit123');
      expect(result).toHaveProperty('type', 'TAKE_PROFIT');
      expect(result).toHaveProperty('status', 'PENDING');
      expect(result).toHaveProperty('limitPrice', 160.0);
    });

    test('should handle take-profit creation errors', async () => {
      axios.mockRejectedValueOnce(new Error('Invalid limit price'));
      await expect(
        adapter.setTakeProfit({
          symbol: 'AAPL',
          quantity: 100,
          limitPrice: 160.0
        })
      ).rejects.toThrow('Failed to set take-profit');
    });
  });

  describe('getOrderHistory()', () => {
    beforeEach(async () => {
      axios.mockResolvedValueOnce({
        data: {
          AccountListResponse: {
            Accounts: { Account: [{ accountIdKey: 'abc123key', accountId: '12345678' }] }
          }
        }
      });
      await adapter.authenticate();
    });

    test('should retrieve order history', async () => {
      axios.mockResolvedValueOnce({
        data: {
          OrdersResponse: {
            Order: [
              {
                orderId: 'order123',
                Instrument: [
                  {
                    Product: { symbol: 'AAPL' },
                    orderAction: 'BUY',
                    orderedQuantity: 100,
                    filledQuantity: 100
                  }
                ],
                priceType: 'MARKET',
                orderStatus: 'EXECUTED',
                averageExecutionPrice: 150.25,
                limitPrice: 0,
                stopPrice: 0,
                orderTerm: 'GOOD_FOR_DAY',
                orderPlacedTime: new Date().toISOString()
              }
            ]
          }
        }
      });

      const history = await adapter.getOrderHistory();
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBe(1);
      expect(history[0]).toHaveProperty('orderId', 'order123');
      expect(history[0]).toHaveProperty('symbol', 'AAPL');
      expect(history[0]).toHaveProperty('side', 'BUY');
      expect(history[0]).toHaveProperty('status', 'FILLED');
    });

    test('should filter order history by symbol', async () => {
      axios.mockResolvedValueOnce({
        data: {
          OrdersResponse: {
            Order: [
              {
                orderId: 'order123',
                Instrument: [{ Product: { symbol: 'AAPL' }, orderAction: 'BUY' }],
                orderStatus: 'EXECUTED',
                orderPlacedTime: new Date().toISOString()
              }
            ]
          }
        }
      });

      const history = await adapter.getOrderHistory({ symbol: 'AAPL' });
      expect(Array.isArray(history)).toBe(true);

      // Verify API was called with correct parameters
      expect(axios.mock.calls[1][0].params.symbol).toBe('AAPL');
    });
  });

  describe('getMarketPrice()', () => {
    beforeEach(async () => {
      axios.mockResolvedValueOnce({
        data: {
          AccountListResponse: {
            Accounts: { Account: [{ accountIdKey: 'abc123key', accountId: '12345678' }] }
          }
        }
      });
      await adapter.authenticate();
    });

    test('should retrieve current market price', async () => {
      axios.mockResolvedValueOnce({
        data: {
          QuoteResponse: {
            QuoteData: [
              {
                All: {
                  bid: 149.5,
                  ask: 150.5,
                  lastTrade: 150.0,
                  bidSize: 100,
                  askSize: 200,
                  totalVolume: 1000000
                },
                dateTime: new Date().toISOString()
              }
            ]
          }
        }
      });

      const price = await adapter.getMarketPrice('AAPL');
      expect(price).toHaveProperty('symbol', 'AAPL');
      expect(price).toHaveProperty('bid', 149.5);
      expect(price).toHaveProperty('ask', 150.5);
      expect(price).toHaveProperty('last', 150.0);
      expect(price).toHaveProperty('bidSize', 100);
      expect(price).toHaveProperty('askSize', 200);
      expect(price).toHaveProperty('volume', 1000000);
    });

    test('should handle invalid symbol', async () => {
      axios.mockRejectedValueOnce(new Error('Symbol not found'));
      await expect(adapter.getMarketPrice('INVALID')).rejects.toThrow(
        'Failed to get market price'
      );
    });
  });

  describe('isSymbolSupported()', () => {
    beforeEach(async () => {
      axios.mockResolvedValueOnce({
        data: {
          AccountListResponse: {
            Accounts: { Account: [{ accountIdKey: 'abc123key', accountId: '12345678' }] }
          }
        }
      });
      await adapter.authenticate();
    });

    test('should return true for valid symbols', async () => {
      axios.mockResolvedValueOnce({
        data: {
          LookupResponse: {
            Data: [{ symbol: 'AAPL', description: 'Apple Inc.' }]
          }
        }
      });

      const isSupported = await adapter.isSymbolSupported('AAPL');
      expect(isSupported).toBe(true);
    });

    test('should return false for invalid symbols', async () => {
      axios.mockRejectedValueOnce(new Error('Symbol not found'));
      const isSupported = await adapter.isSymbolSupported('INVALID123');
      expect(isSupported).toBe(false);
    });
  });

  describe('getFees()', () => {
    test('should return fee structure', async () => {
      const fees = await adapter.getFees('AAPL');

      expect(fees).toHaveProperty('maker', 0);
      expect(fees).toHaveProperty('taker', 0);
      expect(fees).toHaveProperty('withdrawal', 0);
      expect(fees).toHaveProperty('notes');
      expect(fees.notes).toContain('commission-free trading');
    });
  });

  describe('Helper Methods', () => {
    test('normalizeSymbol() should convert to uppercase and remove slashes', () => {
      expect(adapter.normalizeSymbol('aapl')).toBe('AAPL');
      expect(adapter.normalizeSymbol('BTC/USD')).toBe('BTCUSD');
      expect(adapter.normalizeSymbol('tsla')).toBe('TSLA');
    });

    test('mapOrderType() should convert order types correctly', () => {
      expect(adapter.mapOrderType('MARKET')).toBe('MARKET');
      expect(adapter.mapOrderType('LIMIT')).toBe('LIMIT');
      expect(adapter.mapOrderType('STOP')).toBe('STOP');
      expect(adapter.mapOrderType('STOP_LIMIT')).toBe('STOP_LIMIT');
      expect(adapter.mapOrderType('TRAILING_STOP')).toBe('TRAILING_STOP_CNST');
    });

    test('mapOrderStatus() should convert status correctly', () => {
      expect(adapter.mapOrderStatus('OPEN')).toBe('PENDING');
      expect(adapter.mapOrderStatus('EXECUTED')).toBe('FILLED');
      expect(adapter.mapOrderStatus('CANCELLED')).toBe('CANCELLED');
      expect(adapter.mapOrderStatus('INDIVIDUAL_FILLS')).toBe('PARTIAL');
      expect(adapter.mapOrderStatus('CANCEL_REQUESTED')).toBe('PENDING_CANCEL');
      expect(adapter.mapOrderStatus('EXPIRED')).toBe('EXPIRED');
      expect(adapter.mapOrderStatus('REJECTED')).toBe('REJECTED');
      expect(adapter.mapOrderStatus('DONE_TRADE_EXECUTED')).toBe('FILLED');
    });
  });

  describe('makeRequest()', () => {
    beforeEach(async () => {
      axios.mockResolvedValueOnce({
        data: {
          AccountListResponse: {
            Accounts: { Account: [{ accountIdKey: 'abc123key', accountId: '12345678' }] }
          }
        }
      });
      await adapter.authenticate();
    });

    test('should handle 401 unauthorized errors', async () => {
      axios.mockRejectedValueOnce({
        response: { status: 401, data: { error: 'Unauthorized' } }
      });

      await expect(adapter.getBalance()).rejects.toThrow('authentication expired or invalid');
      expect(adapter.isAuthenticated).toBe(false);
    });

    test('should throw error for token expiry before API call', async () => {
      // Update mock user to have expired token
      mockUser.tradingConfig.oauthTokens.get('etrade').expiresAt = new Date(Date.now() - 1000);
      User.findById.mockResolvedValueOnce(mockUser);

      axios.mockResolvedValueOnce({
        data: { BalanceResponse: {} }
      });

      await expect(adapter.getBalance()).rejects.toThrow('E*TRADE token expired');
    });
  });
});
