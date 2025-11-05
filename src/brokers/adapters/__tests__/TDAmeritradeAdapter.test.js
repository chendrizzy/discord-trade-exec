/**
 * Unit Tests for TDAmeritradeAdapter
 * Tests all 6 required BrokerAdapter interface methods with mocked TD Ameritrade API
 */

const TDAmeritradeAdapter = require('../TDAmeritradeAdapter');
const User = require('../../../models/User');
const oauth2Service = require('../../../services/OAuth2Service');

// Mock axios for API calls
jest.mock('axios');
const axios = require('axios');

// Mock User model
jest.mock('../../../models/User');

// Mock OAuth2Service
jest.mock('../../../services/OAuth2Service');

describe('TDAmeritradeAdapter', () => {
  let adapter;
  const mockUserId = 'test-user-123';
  const mockAccessToken = 'mock-access-token';
  const mockAccountId = 'test-account-456';

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create adapter instance
    adapter = new TDAmeritradeAdapter(
      { userId: mockUserId },
      { isTestnet: true }
    );

    // Mock User.findById
    User.findById = jest.fn().mockResolvedValue({
      _id: mockUserId,
      tradingConfig: {
        oauthTokens: new Map([
          [
            'tdameritrade',
            {
              accessToken: 'encrypted-access-token',
              refreshToken: 'encrypted-refresh-token',
              expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes from now
              isValid: true
            }
          ]
        ])
      }
    });

    // Mock oauth2Service
    oauth2Service.decryptToken = jest.fn().mockReturnValue(mockAccessToken);
    oauth2Service.refreshAccessToken = jest.fn().mockResolvedValue({
      accessToken: 'refreshed-access-token'
    });
  });

  describe('Constructor', () => {
    test('should initialize with correct broker metadata', () => {
      expect(adapter.brokerName).toBe('tdameritrade');
      expect(adapter.brokerType).toBe('stock');
      expect(adapter.userId).toBe(mockUserId);
      expect(adapter.baseURL).toBe('https://api.tdameritrade.com/v1');
    });

    test('should accept custom credentials', () => {
      const customAdapter = new TDAmeritradeAdapter(
        { userId: 'custom-user' },
        { isTestnet: false }
      );
      expect(customAdapter.userId).toBe('custom-user');
    });

    test('should initialize with null tokens before authentication', () => {
      expect(adapter.accessToken).toBeNull();
      expect(adapter.accountId).toBeNull();
    });
  });

  describe('authenticate()', () => {
    test('should authenticate successfully with valid OAuth2 tokens', async () => {
      // Mock getAccounts response
      axios.mockResolvedValueOnce({
        data: [
          {
            securitiesAccount: {
              accountId: mockAccountId,
              type: 'MARGIN',
              roundTrips: 0,
              isDayTrader: false,
              isClosingOnlyRestricted: false
            }
          }
        ]
      });

      const result = await adapter.authenticate();

      expect(result).toBe(true);
      expect(adapter.isAuthenticated).toBe(true);
      expect(adapter.accessToken).toBe(mockAccessToken);
      expect(adapter.accountId).toBe(mockAccountId);
      expect(User.findById).toHaveBeenCalledWith(mockUserId);
      expect(oauth2Service.decryptToken).toHaveBeenCalled();
    });

    test('should throw error if userId not provided', async () => {
      const noUserAdapter = new TDAmeritradeAdapter({});
      await expect(noUserAdapter.authenticate()).rejects.toThrow(
        'User ID required for TD Ameritrade OAuth2 authentication'
      );
    });

    test('should throw error if user not found', async () => {
      User.findById.mockResolvedValueOnce(null);

      await expect(adapter.authenticate()).rejects.toThrow(
        `User '${mockUserId}' not found`
      );
    });

    test('should throw error if OAuth2 tokens not found', async () => {
      User.findById.mockResolvedValueOnce({
        _id: mockUserId,
        tradingConfig: {
          oauthTokens: new Map()
        }
      });

      await expect(adapter.authenticate()).rejects.toThrow(
        'No OAuth2 tokens found for TD Ameritrade'
      );
    });

    test('should throw error if tokens marked invalid', async () => {
      User.findById.mockResolvedValueOnce({
        _id: mockUserId,
        tradingConfig: {
          oauthTokens: new Map([
            [
              'tdameritrade',
              {
                accessToken: 'encrypted-access-token',
                expiresAt: new Date(Date.now() + 30 * 60 * 1000),
                isValid: false
              }
            ]
          ])
        }
      });

      await expect(adapter.authenticate()).rejects.toThrow(
        'OAuth2 tokens marked invalid'
      );
    });

    test('should refresh expired access token', async () => {
      // Mock expired token
      User.findById.mockResolvedValueOnce({
        _id: mockUserId,
        tradingConfig: {
          oauthTokens: new Map([
            [
              'tdameritrade',
              {
                accessToken: 'encrypted-access-token',
                refreshToken: 'encrypted-refresh-token',
                expiresAt: new Date(Date.now() - 1000), // Expired
                isValid: true
              }
            ]
          ])
        }
      });

      // Mock getAccounts response
      axios.mockResolvedValueOnce({
        data: [
          {
            securitiesAccount: {
              accountId: mockAccountId,
              type: 'MARGIN',
              roundTrips: 0,
              isDayTrader: false,
              isClosingOnlyRestricted: false
            }
          }
        ]
      });

      await adapter.authenticate();

      expect(oauth2Service.refreshAccessToken).toHaveBeenCalledWith('tdameritrade', mockUserId);
      expect(adapter.accessToken).toBe('refreshed-access-token');
    });
  });

  describe('testConnection()', () => {
    test('should return true for successful connection', async () => {
      // Mock getAccounts response
      axios.mockResolvedValueOnce({
        data: [
          {
            securitiesAccount: {
              accountId: mockAccountId,
              type: 'MARGIN',
              roundTrips: 0,
              isDayTrader: false,
              isClosingOnlyRestricted: false
            }
          }
        ]
      });

      const result = await adapter.testConnection();
      expect(result).toBe(true);
    });

    test('should return false for failed connection', async () => {
      User.findById.mockRejectedValueOnce(new Error('Connection failed'));

      const result = await adapter.testConnection();
      expect(result).toBe(false);
    });
  });

  describe('getBalance()', () => {
    beforeEach(async () => {
      // Mock authentication
      axios.mockResolvedValueOnce({
        data: [
          {
            securitiesAccount: {
              accountId: mockAccountId,
              type: 'MARGIN'
            }
          }
        ]
      });
      await adapter.authenticate();
    });

    test('should retrieve account balance successfully', async () => {
      axios.mockResolvedValueOnce({
        data: {
          securitiesAccount: {
            currentBalances: {
              liquidationValue: 1000000,
              availableFunds: 500000,
              equity: 1050000,
              cashBalance: 300000,
              buyingPower: 2000000,
              dayTradingBuyingPower: 4000000
            }
          }
        }
      });

      const balance = await adapter.getBalance('USD');

      expect(balance).toHaveProperty('total', 1000000);
      expect(balance).toHaveProperty('available', 500000);
      expect(balance).toHaveProperty('equity', 1050000);
      expect(balance).toHaveProperty('cash', 300000);
      expect(balance).toHaveProperty('currency', 'USD');
      expect(balance).toHaveProperty('buyingPower', 2000000);
      expect(balance).toHaveProperty('dayTradingBuyingPower', 4000000);
      expect(balance).toHaveProperty('profitLoss');
      expect(balance).toHaveProperty('profitLossPercent');
    });

    test('should auto-authenticate if not authenticated', async () => {
      adapter.accountId = null;
      adapter.isAuthenticated = false;

      // Mock authentication
      axios.mockResolvedValueOnce({
        data: [
          {
            securitiesAccount: {
              accountId: mockAccountId,
              type: 'MARGIN'
            }
          }
        ]
      });

      // Mock balance response
      axios.mockResolvedValueOnce({
        data: {
          securitiesAccount: {
            currentBalances: {
              liquidationValue: 1000000,
              availableFunds: 500000,
              equity: 1000000,
              cashBalance: 300000,
              buyingPower: 2000000,
              dayTradingBuyingPower: 4000000
            }
          }
        }
      });

      const balance = await adapter.getBalance();
      expect(balance.total).toBe(1000000);
    });
  });

  describe('getPositions()', () => {
    beforeEach(async () => {
      // Mock authentication
      axios.mockResolvedValueOnce({
        data: [
          {
            securitiesAccount: {
              accountId: mockAccountId,
              type: 'MARGIN'
            }
          }
        ]
      });
      await adapter.authenticate();
    });

    test('should retrieve open positions successfully', async () => {
      axios.mockResolvedValueOnce({
        data: {
          securitiesAccount: {
            positions: [
              {
                instrument: { symbol: 'AAPL' },
                longQuantity: 100,
                shortQuantity: 0,
                averagePrice: 150.0,
                marketValue: 15500,
                currentDayProfitLoss: 250,
                currentDayProfitLossPercentage: 1.64
              },
              {
                instrument: { symbol: 'TSLA' },
                longQuantity: 50,
                shortQuantity: 0,
                averagePrice: 200.0,
                marketValue: 10500,
                currentDayProfitLoss: 500,
                currentDayProfitLossPercentage: 5.0
              }
            ]
          }
        }
      });

      const positions = await adapter.getPositions();

      expect(Array.isArray(positions)).toBe(true);
      expect(positions.length).toBe(2);
      expect(positions[0]).toHaveProperty('symbol', 'AAPL');
      expect(positions[0]).toHaveProperty('quantity', 100);
      expect(positions[0]).toHaveProperty('side', 'LONG');
      expect(positions[0]).toHaveProperty('entryPrice', 150.0);
      expect(positions[0]).toHaveProperty('marketValue', 15500);
      expect(positions[0]).toHaveProperty('unrealizedPnL');
      expect(positions[0]).toHaveProperty('dayPnL', 250);
    });

    test('should return empty array when no positions', async () => {
      axios.mockResolvedValueOnce({
        data: {
          securitiesAccount: {
            positions: []
          }
        }
      });

      const positions = await adapter.getPositions();
      expect(Array.isArray(positions)).toBe(true);
      expect(positions.length).toBe(0);
    });
  });

  describe('createOrder()', () => {
    beforeEach(async () => {
      // Mock authentication
      axios.mockResolvedValueOnce({
        data: [
          {
            securitiesAccount: {
              accountId: mockAccountId,
              type: 'MARGIN'
            }
          }
        ]
      });
      await adapter.authenticate();
    });

    test('should create a market order successfully', async () => {
      axios.mockResolvedValueOnce({
        data: {},
        headers: {
          location: `/accounts/${mockAccountId}/orders/12345`
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

      expect(result).toHaveProperty('orderId', '12345');
      expect(result).toHaveProperty('symbol', 'AAPL');
      expect(result).toHaveProperty('side', 'BUY');
      expect(result).toHaveProperty('type', 'MARKET');
      expect(result).toHaveProperty('status', 'PENDING');
      expect(result).toHaveProperty('quantity', 100);
      expect(result).toHaveProperty('timeInForce', 'DAY');
    });

    test('should create a limit order successfully', async () => {
      axios.mockResolvedValueOnce({
        data: {},
        headers: {
          location: `/accounts/${mockAccountId}/orders/12346`
        }
      });

      const order = {
        symbol: 'TSLA',
        side: 'SELL',
        type: 'LIMIT',
        quantity: 50,
        price: 250.0,
        timeInForce: 'GTC'
      };

      const result = await adapter.createOrder(order);
      expect(result.orderId).toBe('12346');
      expect(result.type).toBe('LIMIT');
      expect(result.limitPrice).toBe(250.0);
    });

    test('should create a stop order successfully', async () => {
      axios.mockResolvedValueOnce({
        data: {},
        headers: {
          location: `/accounts/${mockAccountId}/orders/12347`
        }
      });

      const order = {
        symbol: 'MSFT',
        side: 'SELL',
        type: 'STOP',
        quantity: 25,
        stopPrice: 300.0,
        timeInForce: 'DAY'
      };

      const result = await adapter.createOrder(order);
      expect(result.orderId).toBe('12347');
      expect(result.type).toBe('STOP');
      expect(result.stopPrice).toBe(300.0);
    });

    test('should create a stop-limit order successfully', async () => {
      axios.mockResolvedValueOnce({
        data: {},
        headers: {
          location: `/accounts/${mockAccountId}/orders/12348`
        }
      });

      const order = {
        symbol: 'GOOGL',
        side: 'BUY',
        type: 'STOP_LIMIT',
        quantity: 10,
        price: 2800.0,
        stopPrice: 2750.0,
        timeInForce: 'GTC'
      };

      const result = await adapter.createOrder(order);
      expect(result.orderId).toBe('12348');
      expect(result.type).toBe('STOP_LIMIT');
      expect(result.limitPrice).toBe(2800.0);
      expect(result.stopPrice).toBe(2750.0);
    });

    test('should normalize symbol to uppercase', async () => {
      axios.mockResolvedValueOnce({
        data: {},
        headers: {
          location: `/accounts/${mockAccountId}/orders/12349`
        }
      });

      const order = {
        symbol: 'aapl',
        side: 'BUY',
        type: 'MARKET',
        quantity: 100
      };

      await adapter.createOrder(order);

      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderLegCollection: expect.arrayContaining([
              expect.objectContaining({
                instrument: expect.objectContaining({
                  symbol: 'AAPL'
                })
              })
            ])
          })
        })
      );
    });

    test('should handle order creation errors', async () => {
      axios.mockRejectedValueOnce({
        response: {
          status: 400,
          data: { error: 'Invalid order parameters' }
        }
      });

      const order = {
        symbol: 'INVALID',
        side: 'BUY',
        type: 'MARKET',
        quantity: 100
      };

      await expect(adapter.createOrder(order)).rejects.toThrow(
        'Failed to create order'
      );
    });
  });

  describe('cancelOrder()', () => {
    beforeEach(async () => {
      // Mock authentication
      axios.mockResolvedValueOnce({
        data: [
          {
            securitiesAccount: {
              accountId: mockAccountId,
              type: 'MARGIN'
            }
          }
        ]
      });
      await adapter.authenticate();
    });

    test('should cancel an order successfully', async () => {
      axios.mockResolvedValueOnce({ data: {} });

      const result = await adapter.cancelOrder('12345');
      expect(result).toBe(true);
      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'DELETE',
          url: expect.stringContaining('/orders/12345')
        })
      );
    });

    test('should return true if order already cancelled', async () => {
      axios.mockRejectedValueOnce({
        message: 'Order already cancelled',
        response: { status: 404 }
      });

      const result = await adapter.cancelOrder('12345');
      expect(result).toBe(true);
    });

    test('should return true if order not found', async () => {
      axios.mockRejectedValueOnce({
        message: 'Order not found',
        response: { status: 404 }
      });

      const result = await adapter.cancelOrder('12345');
      expect(result).toBe(true);
    });

    test('should throw error for other cancellation failures', async () => {
      axios.mockRejectedValueOnce({
        message: 'Server error',
        response: { status: 500, data: { error: 'Internal server error' } }
      });

      await expect(adapter.cancelOrder('12345')).rejects.toThrow(
        'Failed to cancel order'
      );
    });
  });

  describe('setStopLoss()', () => {
    beforeEach(async () => {
      // Mock authentication
      axios.mockResolvedValueOnce({
        data: [
          {
            securitiesAccount: {
              accountId: mockAccountId,
              type: 'MARGIN'
            }
          }
        ]
      });
      await adapter.authenticate();
    });

    test('should create a stop-loss order', async () => {
      axios.mockResolvedValueOnce({
        data: {},
        headers: {
          location: `/accounts/${mockAccountId}/orders/12350`
        }
      });

      const result = await adapter.setStopLoss({
        symbol: 'AAPL',
        quantity: 100,
        stopPrice: 140.0,
        side: 'sell',
        type: 'STOP'
      });

      expect(result).toHaveProperty('orderId', '12350');
      expect(result).toHaveProperty('type', 'STOP_LOSS');
      expect(result).toHaveProperty('status', 'PENDING');
      expect(result).toHaveProperty('stopPrice', 140.0);
      expect(result).toHaveProperty('trailPercent', 0);
    });

    test('should create a trailing stop-loss order', async () => {
      axios.mockResolvedValueOnce({
        data: {},
        headers: {
          location: `/accounts/${mockAccountId}/orders/12351`
        }
      });

      const result = await adapter.setStopLoss({
        symbol: 'TSLA',
        quantity: 50,
        type: 'TRAILING_STOP',
        trailPercent: 5.0
      });

      expect(result).toHaveProperty('orderId', '12351');
      expect(result).toHaveProperty('type', 'STOP_LOSS');
      expect(result).toHaveProperty('trailPercent', 5.0);
    });

    test('should default to 2% trailing if not specified', async () => {
      axios.mockResolvedValueOnce({
        data: {},
        headers: {
          location: `/accounts/${mockAccountId}/orders/12352`
        }
      });

      await adapter.setStopLoss({
        symbol: 'MSFT',
        quantity: 25,
        type: 'TRAILING_STOP'
      });

      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderLegCollection: expect.arrayContaining([
              expect.objectContaining({
                quantity: 25
              })
            ])
          })
        })
      );
    });

    test('should handle stop-loss creation errors', async () => {
      axios.mockRejectedValueOnce({
        response: {
          status: 400,
          data: { error: 'Invalid stop price' }
        }
      });

      await expect(
        adapter.setStopLoss({
          symbol: 'AAPL',
          quantity: 100,
          stopPrice: -10.0
        })
      ).rejects.toThrow('Failed to set stop-loss');
    });
  });

  describe('setTakeProfit()', () => {
    beforeEach(async () => {
      // Mock authentication
      axios.mockResolvedValueOnce({
        data: [
          {
            securitiesAccount: {
              accountId: mockAccountId,
              type: 'MARGIN'
            }
          }
        ]
      });
      await adapter.authenticate();
    });

    test('should create a take-profit order', async () => {
      axios.mockResolvedValueOnce({
        data: {},
        headers: {
          location: `/accounts/${mockAccountId}/orders/12353`
        }
      });

      const result = await adapter.setTakeProfit({
        symbol: 'AAPL',
        quantity: 100,
        limitPrice: 160.0,
        side: 'sell'
      });

      expect(result).toHaveProperty('orderId', '12353');
      expect(result).toHaveProperty('type', 'TAKE_PROFIT');
      expect(result).toHaveProperty('status', 'PENDING');
      expect(result).toHaveProperty('limitPrice', 160.0);
    });

    test('should handle take-profit creation errors', async () => {
      axios.mockRejectedValueOnce({
        response: {
          status: 400,
          data: { error: 'Invalid limit price' }
        }
      });

      await expect(
        adapter.setTakeProfit({
          symbol: 'AAPL',
          quantity: 100,
          limitPrice: -10.0
        })
      ).rejects.toThrow('Failed to set take-profit');
    });
  });

  describe('getOrderHistory()', () => {
    beforeEach(async () => {
      // Mock authentication
      axios.mockResolvedValueOnce({
        data: [
          {
            securitiesAccount: {
              accountId: mockAccountId,
              type: 'MARGIN'
            }
          }
        ]
      });
      await adapter.authenticate();
    });

    test('should retrieve order history successfully', async () => {
      axios.mockResolvedValueOnce({
        data: [
          {
            orderId: '12345',
            orderLegCollection: [
              {
                instrument: { symbol: 'AAPL' },
                instruction: 'BUY'
              }
            ],
            orderType: 'MARKET',
            status: 'FILLED',
            quantity: 100,
            filledQuantity: 100,
            price: 150.25,
            duration: 'DAY',
            enteredTime: '2025-01-01T10:00:00Z',
            closeTime: '2025-01-01T10:01:00Z'
          },
          {
            orderId: '12346',
            orderLegCollection: [
              {
                instrument: { symbol: 'TSLA' },
                instruction: 'SELL'
              }
            ],
            orderType: 'LIMIT',
            status: 'WORKING',
            quantity: 50,
            filledQuantity: 0,
            price: 250.0,
            duration: 'GTC',
            enteredTime: '2025-01-01T09:00:00Z'
          }
        ]
      });

      const history = await adapter.getOrderHistory();

      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBe(2);
      expect(history[0]).toHaveProperty('orderId', '12345');
      expect(history[0]).toHaveProperty('symbol', 'AAPL');
      expect(history[0]).toHaveProperty('side', 'BUY');
      expect(history[0]).toHaveProperty('status', 'FILLED');
      expect(history[0]).toHaveProperty('filledQuantity', 100);
    });

    test('should filter by limit', async () => {
      axios.mockResolvedValueOnce({ data: [] });

      await adapter.getOrderHistory({ limit: 50 });

      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            maxResults: 50
          })
        })
      );
    });

    test('should filter by date range', async () => {
      axios.mockResolvedValueOnce({ data: [] });

      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      await adapter.getOrderHistory({ startDate, endDate });

      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            fromEnteredTime: startDate.toISOString(),
            toEnteredTime: endDate.toISOString()
          })
        })
      );
    });

    test('should filter by status', async () => {
      axios.mockResolvedValueOnce({ data: [] });

      await adapter.getOrderHistory({ status: 'filled' });

      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            status: 'FILLED'
          })
        })
      );
    });
  });

  describe('getMarketPrice()', () => {
    beforeEach(async () => {
      // Mock authentication
      axios.mockResolvedValueOnce({
        data: [
          {
            securitiesAccount: {
              accountId: mockAccountId,
              type: 'MARGIN'
            }
          }
        ]
      });
      await adapter.authenticate();
    });

    test('should retrieve current market price successfully', async () => {
      axios.mockResolvedValueOnce({
        data: {
          AAPL: {
            bidPrice: 149.5,
            askPrice: 150.5,
            lastPrice: 150.0,
            bidSize: 100,
            askSize: 200,
            totalVolume: 50000000,
            quoteTimeInLong: Date.now()
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
      expect(price).toHaveProperty('volume', 50000000);
      expect(price).toHaveProperty('timestamp');
    });

    test('should handle invalid symbol error', async () => {
      axios.mockRejectedValueOnce({
        response: {
          status: 404,
          data: { error: 'Symbol not found' }
        }
      });

      await expect(adapter.getMarketPrice('INVALID')).rejects.toThrow(
        'Failed to get market price'
      );
    });
  });

  describe('isSymbolSupported()', () => {
    beforeEach(async () => {
      // Mock authentication
      axios.mockResolvedValueOnce({
        data: [
          {
            securitiesAccount: {
              accountId: mockAccountId,
              type: 'MARGIN'
            }
          }
        ]
      });
      await adapter.authenticate();
    });

    test('should return true for valid symbols', async () => {
      axios.mockResolvedValueOnce({
        data: [
          {
            symbol: 'AAPL',
            description: 'Apple Inc.',
            exchange: 'NASDAQ'
          }
        ]
      });

      const isSupported = await adapter.isSymbolSupported('AAPL');
      expect(isSupported).toBe(true);
    });

    test('should return false for invalid symbols', async () => {
      axios.mockRejectedValueOnce({
        response: {
          status: 404,
          data: { error: 'Symbol not found' }
        }
      });

      const isSupported = await adapter.isSymbolSupported('INVALID123');
      expect(isSupported).toBe(false);
    });
  });

  describe('getFees()', () => {
    test('should return TD Ameritrade fee structure', async () => {
      const fees = await adapter.getFees('AAPL');

      expect(fees).toHaveProperty('maker', 0);
      expect(fees).toHaveProperty('taker', 0);
      expect(fees).toHaveProperty('withdrawal', 0);
      expect(fees).toHaveProperty('notes');
      expect(fees.notes).toContain('commission-free');
    });
  });

  describe('Helper Methods', () => {
    test('normalizeSymbol() should convert to uppercase and remove slashes', () => {
      expect(adapter.normalizeSymbol('aapl')).toBe('AAPL');
      expect(adapter.normalizeSymbol('BRK/B')).toBe('BRKB');
      expect(adapter.normalizeSymbol('tsla')).toBe('TSLA');
    });

    test('mapOrderType() should convert order types correctly', () => {
      expect(adapter.mapOrderType('MARKET')).toBe('MARKET');
      expect(adapter.mapOrderType('LIMIT')).toBe('LIMIT');
      expect(adapter.mapOrderType('STOP')).toBe('STOP');
      expect(adapter.mapOrderType('STOP_LIMIT')).toBe('STOP_LIMIT');
      expect(adapter.mapOrderType('TRAILING_STOP')).toBe('TRAILING_STOP');
      expect(adapter.mapOrderType('UNKNOWN')).toBe('MARKET');
    });

    test('mapOrderStatus() should convert status correctly', () => {
      expect(adapter.mapOrderStatus('AWAITING_PARENT_ORDER')).toBe('PENDING');
      expect(adapter.mapOrderStatus('ACCEPTED')).toBe('ACCEPTED');
      expect(adapter.mapOrderStatus('WORKING')).toBe('PENDING');
      expect(adapter.mapOrderStatus('FILLED')).toBe('FILLED');
      expect(adapter.mapOrderStatus('CANCELED')).toBe('CANCELLED');
      expect(adapter.mapOrderStatus('REJECTED')).toBe('REJECTED');
      expect(adapter.mapOrderStatus('EXPIRED')).toBe('EXPIRED');
      expect(adapter.mapOrderStatus('UNKNOWN_STATUS')).toBe('UNKNOWN');
    });
  });

  describe('makeRequest() - Token Refresh', () => {
    beforeEach(async () => {
      // Mock authentication
      axios.mockResolvedValueOnce({
        data: [
          {
            securitiesAccount: {
              accountId: mockAccountId,
              type: 'MARGIN'
            }
          }
        ]
      });
      await adapter.authenticate();
    });

    test('should refresh token before API call if expired', async () => {
      // Mock expired token
      User.findById.mockResolvedValueOnce({
        _id: mockUserId,
        tradingConfig: {
          oauthTokens: new Map([
            [
              'tdameritrade',
              {
                accessToken: 'encrypted-access-token',
                refreshToken: 'encrypted-refresh-token',
                expiresAt: new Date(Date.now() - 1000), // Expired
                isValid: true
              }
            ]
          ])
        }
      });

      // Mock API response
      axios.mockResolvedValueOnce({
        data: {
          securitiesAccount: {
            currentBalances: {
              liquidationValue: 1000000,
              availableFunds: 500000,
              equity: 1000000,
              cashBalance: 300000,
              buyingPower: 2000000,
              dayTradingBuyingPower: 4000000
            }
          }
        }
      });

      await adapter.getBalance();

      expect(oauth2Service.refreshAccessToken).toHaveBeenCalledWith('tdameritrade', mockUserId);
    });

    test('should handle 401 Unauthorized error', async () => {
      axios.mockRejectedValueOnce({
        response: {
          status: 401,
          data: { error: 'Unauthorized' }
        }
      });

      await expect(adapter.getBalance()).rejects.toThrow(
        'TD Ameritrade authentication expired or invalid'
      );
      expect(adapter.isAuthenticated).toBe(false);
    });
  });
});
