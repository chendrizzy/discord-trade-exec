// External dependencies
const axios = require('axios');

// Internal utilities and services
const SchwabAdapter = require('../SchwabAdapter');

// Mock axios
jest.mock('axios');

/**
 * SchwabAdapter Unit Tests
 *
 * Tests all 16 required methods using mocked API responses
 * Follows Schwab Trader API specification
 *
 * SETUP FOR LIVE TESTING:
 * 1. Register at https://developer.schwab.com/
 * 2. Create application and get App Key + App Secret
 * 3. Complete OAuth flow to get refresh token
 * 4. Add to .env:
 *    SCHWAB_APP_KEY=your_app_key
 *    SCHWAB_APP_SECRET=your_app_secret
 *    SCHWAB_REFRESH_TOKEN=your_refresh_token
 */

describe('SchwabAdapter', () => {
  let adapter;
  const testSymbol = 'AAPL';

  beforeEach(() => {
    jest.clearAllMocks();

    // Initialize adapter with mock credentials
    adapter = new SchwabAdapter(
      {
        appKey: 'test_app_key',
        appSecret: 'test_app_secret',
        refreshToken: 'test_refresh_token',
        accessToken: 'test_access_token'
      },
      {
        isTestnet: true
      }
    );

    // Set token expiry far in future for tests
    adapter.tokenExpiresAt = Date.now() + 3600000; // 1 hour
    adapter.refreshTokenExpiresAt = Date.now() + 604800000; // 7 days
  });

  describe('Initialization', () => {
    it('should create adapter with correct broker info', () => {
      expect(adapter.brokerName).toBe('schwab');
      expect(adapter.brokerType).toBe('stock');
      expect(adapter.isTestnet).toBe(true);
      expect(adapter.isAuthenticated).toBe(false);
    });

    it('should have correct base URLs', () => {
      expect(adapter.baseURL).toBe('https://api.schwabapi.com/trader/v1');
      expect(adapter.marketDataURL).toBe('https://api.schwabapi.com/marketdata/v1');
    });

    it('should return comprehensive broker info', () => {
      const info = adapter.getBrokerInfo();
      expect(info).toEqual({
        name: 'schwab',
        displayName: 'Charles Schwab',
        type: 'stock',
        isTestnet: true,
        isAuthenticated: false,
        supportsStocks: true,
        supportsCrypto: false,
        supportsOptions: true,
        supportsFutures: true,
        commissionFree: true,
        requiresOAuth: true,
        refreshTokenExpiry: '7 days',
        accessTokenExpiry: '30 minutes'
      });
    });

    it('should store OAuth credentials correctly', () => {
      expect(adapter.clientId).toBe('test_app_key');
      expect(adapter.clientSecret).toBe('test_app_secret');
      expect(adapter.refreshToken).toBe('test_refresh_token');
      expect(adapter.accessToken).toBe('test_access_token');
    });
  });

  describe('Authentication', () => {
    it('should authenticate with valid access token', async () => {
      const result = await adapter.authenticate();
      expect(result).toBe(true);
      expect(adapter.isAuthenticated).toBe(true);
    });

    it('should refresh expired access token', async () => {
      adapter.accessToken = null;
      adapter.tokenExpiresAt = Date.now() - 1000; // Expired

      axios.post.mockResolvedValue({
        data: {
          access_token: 'new_access_token',
          refresh_token: 'new_refresh_token',
          expires_in: 1800,
          refresh_token_expires_in: 604800
        }
      });

      const result = await adapter.authenticate();
      expect(result).toBe(true);
      expect(adapter.accessToken).toBe('new_access_token');
      expect(axios.post).toHaveBeenCalledWith(
        'https://api.schwabapi.com/v1/oauth/token',
        expect.any(URLSearchParams),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringContaining('Basic')
          })
        })
      );
    });

    it('should throw error when no valid tokens available', async () => {
      adapter.accessToken = null;
      adapter.refreshToken = null;
      adapter.tokenExpiresAt = null;

      await expect(adapter.authenticate()).rejects.toThrow('No valid tokens available');
    });

    it('should handle token refresh failure', async () => {
      adapter.accessToken = null;
      axios.post.mockRejectedValue(new Error('Invalid refresh token'));

      await expect(adapter.authenticate()).rejects.toThrow('Schwab authentication failed');
    });
  });

  describe('getBalance', () => {
    it('should retrieve account balance', async () => {
      adapter.isAuthenticated = true;
      adapter.accountId = '123456789';

      axios.mockResolvedValue({
        data: {
          securitiesAccount: {
            accountId: '123456789',
            currentBalances: {
              liquidationValue: 100000,
              availableFunds: 50000,
              equity: 80000,
              cashBalance: 20000,
              accountValue: 100000,
              buyingPower: 50000,
              longMarketValue: 60000
            }
          }
        }
      });

      const balance = await adapter.getBalance();

      expect(balance).toEqual({
        total: 100000,
        available: 50000,
        equity: 80000,
        cash: 20000,
        currency: 'USD',
        portfolioValue: 100000,
        buyingPower: 50000,
        profitLoss: 0,
        profitLossPercent: 0
      });
    });

    it('should authenticate before getting balance if not authenticated', async () => {
      adapter.isAuthenticated = false;
      adapter.accountId = '123456789';

      axios.mockResolvedValue({
        data: {
          securitiesAccount: {
            accountId: '123456789',
            currentBalances: {
              liquidationValue: 100000,
              availableFunds: 50000,
              equity: 80000,
              cashBalance: 20000,
              accountValue: 100000,
              buyingPower: 50000,
              longMarketValue: 60000
            }
          }
        }
      });

      const balance = await adapter.getBalance();
      expect(adapter.isAuthenticated).toBe(true);
      expect(balance.total).toBe(100000);
    });

    it('should handle API errors gracefully', async () => {
      adapter.isAuthenticated = true;
      adapter.accountId = '123456789';

      axios.mockRejectedValue(new Error('API unavailable'));

      await expect(adapter.getBalance()).rejects.toThrow('Failed to get balance');
    });
  });

  describe('createOrder', () => {
    it('should create market buy order', async () => {
      adapter.isAuthenticated = true;
      adapter.accountId = '123456789';

      axios.mockResolvedValueOnce({
        headers: {
          location: 'https://api.schwabapi.com/trader/v1/accounts/123456789/orders/987654321'
        }
      });

      axios.mockResolvedValueOnce({
        data: {
          orderId: '987654321',
          status: 'WORKING',
          enteredTime: '2025-10-15T10:00:00Z',
          filledQuantity: 0
        }
      });

      const order = await adapter.createOrder({
        symbol: testSymbol,
        side: 'BUY',
        type: 'MARKET',
        quantity: 10,
        timeInForce: 'DAY'
      });

      expect(order.orderId).toBe('987654321');
      expect(order.symbol).toBe(testSymbol);
      expect(order.side).toBe('BUY');
      expect(order.type).toBe('MARKET');
      expect(order.quantity).toBe(10);
      expect(order.status).toBe('WORKING');
    });

    it('should create limit sell order', async () => {
      adapter.isAuthenticated = true;
      adapter.accountId = '123456789';

      axios.mockResolvedValueOnce({
        headers: {
          location: 'https://api.schwabapi.com/trader/v1/accounts/123456789/orders/987654322'
        }
      });

      axios.mockResolvedValueOnce({
        data: {
          orderId: '987654322',
          status: 'WORKING',
          enteredTime: '2025-10-15T10:00:00Z',
          price: 150.5
        }
      });

      const order = await adapter.createOrder({
        symbol: testSymbol,
        side: 'SELL',
        type: 'LIMIT',
        quantity: 5,
        price: 150.5,
        timeInForce: 'GTC'
      });

      expect(order.side).toBe('SELL');
      expect(order.type).toBe('LIMIT');
      expect(order.limitPrice).toBe(150.5);
    });

    it('should create stop order', async () => {
      adapter.isAuthenticated = true;
      adapter.accountId = '123456789';

      axios.mockResolvedValueOnce({
        headers: {
          location: 'https://api.schwabapi.com/trader/v1/accounts/123456789/orders/987654323'
        }
      });

      axios.mockResolvedValueOnce({
        data: {
          orderId: '987654323',
          status: 'WORKING',
          enteredTime: '2025-10-15T10:00:00Z',
          stopPrice: 140.0
        }
      });

      const order = await adapter.createOrder({
        symbol: testSymbol,
        side: 'SELL',
        type: 'STOP',
        quantity: 10,
        stopPrice: 140.0,
        timeInForce: 'GTC'
      });

      expect(order.type).toBe('STOP');
      expect(order.stopPrice).toBe(140.0);
    });

    it('should create stop-limit order', async () => {
      adapter.isAuthenticated = true;
      adapter.accountId = '123456789';

      axios.mockResolvedValueOnce({
        headers: {
          location: 'https://api.schwabapi.com/trader/v1/accounts/123456789/orders/987654324'
        }
      });

      axios.mockResolvedValueOnce({
        data: {
          orderId: '987654324',
          status: 'WORKING',
          enteredTime: '2025-10-15T10:00:00Z',
          stopPrice: 140.0,
          price: 139.5
        }
      });

      const order = await adapter.createOrder({
        symbol: testSymbol,
        side: 'SELL',
        type: 'STOP_LIMIT',
        quantity: 10,
        stopPrice: 140.0,
        price: 139.5,
        timeInForce: 'GTC'
      });

      expect(order.type).toBe('STOP_LIMIT');
      expect(order.stopPrice).toBe(140.0);
      expect(order.limitPrice).toBe(139.5);
    });

    it('should handle order creation errors', async () => {
      adapter.isAuthenticated = true;
      adapter.accountId = '123456789';

      axios.mockRejectedValue(new Error('Insufficient funds'));

      await expect(
        adapter.createOrder({
          symbol: testSymbol,
          side: 'BUY',
          type: 'MARKET',
          quantity: 1000000
        })
      ).rejects.toThrow('Failed to create order');
    });
  });

  describe('cancelOrder', () => {
    it('should cancel an order', async () => {
      adapter.isAuthenticated = true;
      adapter.accountId = '123456789';

      axios.mockResolvedValue({ data: {} });

      const result = await adapter.cancelOrder('987654321');
      expect(result).toBe(true);
      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'DELETE',
          url: 'https://api.schwabapi.com/trader/v1/accounts/123456789/orders/987654321'
        })
      );
    });

    it('should return true for already cancelled orders', async () => {
      adapter.isAuthenticated = true;
      adapter.accountId = '123456789';

      axios.mockRejectedValue(new Error('Order cannot be canceled'));

      const result = await adapter.cancelOrder('987654321');
      expect(result).toBe(true);
    });

    it('should throw error for other cancellation failures', async () => {
      adapter.isAuthenticated = true;
      adapter.accountId = '123456789';

      axios.mockRejectedValue(new Error('Network timeout'));

      await expect(adapter.cancelOrder('987654321')).rejects.toThrow('Failed to cancel order');
    });
  });

  describe('getPositions', () => {
    it('should retrieve open positions', async () => {
      adapter.isAuthenticated = true;
      adapter.accountId = '123456789';

      axios.mockResolvedValue({
        data: {
          securitiesAccount: {
            positions: [
              {
                instrument: {
                  symbol: 'AAPL',
                  assetType: 'EQUITY'
                },
                longQuantity: 100,
                shortQuantity: 0,
                averagePrice: 145.5,
                marketValue: 15000,
                currentDayProfitLoss: 500,
                currentDayProfitLossPercentage: 3.45
              },
              {
                instrument: {
                  symbol: 'TSLA',
                  assetType: 'EQUITY'
                },
                longQuantity: 50,
                shortQuantity: 0,
                averagePrice: 200.0,
                marketValue: 10500,
                currentDayProfitLoss: -250,
                currentDayProfitLossPercentage: -2.38
              }
            ]
          }
        }
      });

      const positions = await adapter.getPositions();

      expect(positions).toHaveLength(2);
      expect(positions[0]).toEqual({
        symbol: 'AAPL',
        quantity: 100,
        side: 'LONG',
        entryPrice: 145.5,
        currentPrice: 150,
        marketValue: 15000,
        costBasis: 14550,
        unrealizedPnL: 500,
        unrealizedPnLPercent: 3.45,
        unrealizedIntraday: 500,
        changeToday: 3.45
      });
    });

    it('should filter out non-equity positions', async () => {
      adapter.isAuthenticated = true;
      adapter.accountId = '123456789';

      axios.mockResolvedValue({
        data: {
          securitiesAccount: {
            positions: [
              {
                instrument: {
                  symbol: 'AAPL',
                  assetType: 'EQUITY'
                },
                longQuantity: 100,
                shortQuantity: 0,
                averagePrice: 145.5,
                marketValue: 15000
              },
              {
                instrument: {
                  symbol: 'SPY_121525C450',
                  assetType: 'OPTION'
                },
                longQuantity: 1,
                shortQuantity: 0,
                averagePrice: 5.0,
                marketValue: 500
              }
            ]
          }
        }
      });

      const positions = await adapter.getPositions();
      expect(positions).toHaveLength(1);
      expect(positions[0].symbol).toBe('AAPL');
    });

    it('should return empty array when no positions', async () => {
      adapter.isAuthenticated = true;
      adapter.accountId = '123456789';

      axios.mockResolvedValue({
        data: {
          securitiesAccount: {
            positions: []
          }
        }
      });

      const positions = await adapter.getPositions();
      expect(positions).toEqual([]);
    });
  });

  describe('setStopLoss', () => {
    it('should create stop-loss order', async () => {
      adapter.isAuthenticated = true;
      adapter.accountId = '123456789';

      axios.mockResolvedValueOnce({
        headers: {
          location: 'https://api.schwabapi.com/trader/v1/accounts/123456789/orders/987654325'
        }
      });

      axios.mockResolvedValueOnce({
        data: {
          orderId: '987654325',
          status: 'WORKING',
          enteredTime: '2025-10-15T10:00:00Z',
          stopPrice: 140.0
        }
      });

      const result = await adapter.setStopLoss({
        symbol: testSymbol,
        quantity: 10,
        stopPrice: 140.0,
        side: 'SELL'
      });

      expect(result.orderId).toBe('987654325');
      expect(result.type).toBe('STOP_LOSS');
      expect(result.stopPrice).toBe(140.0);
    });

    it('should create trailing stop-loss order', async () => {
      adapter.isAuthenticated = true;
      adapter.accountId = '123456789';

      axios.mockResolvedValueOnce({
        headers: {
          location: 'https://api.schwabapi.com/trader/v1/accounts/123456789/orders/987654326'
        }
      });

      axios.mockResolvedValueOnce({
        data: {
          orderId: '987654326',
          status: 'WORKING',
          enteredTime: '2025-10-15T10:00:00Z'
        }
      });

      const result = await adapter.setStopLoss({
        symbol: testSymbol,
        quantity: 10,
        type: 'TRAILING_STOP',
        trailPercent: 5.0,
        side: 'SELL'
      });

      expect(result.type).toBe('STOP_LOSS');
      expect(result.trailPercent).toBe(5.0);
    });
  });

  describe('setTakeProfit', () => {
    it('should create take-profit order', async () => {
      adapter.isAuthenticated = true;
      adapter.accountId = '123456789';

      axios.mockResolvedValueOnce({
        headers: {
          location: 'https://api.schwabapi.com/trader/v1/accounts/123456789/orders/987654327'
        }
      });

      axios.mockResolvedValueOnce({
        data: {
          orderId: '987654327',
          status: 'WORKING',
          enteredTime: '2025-10-15T10:00:00Z',
          price: 160.0
        }
      });

      const result = await adapter.setTakeProfit({
        symbol: testSymbol,
        quantity: 10,
        limitPrice: 160.0,
        side: 'SELL'
      });

      expect(result.orderId).toBe('987654327');
      expect(result.type).toBe('TAKE_PROFIT');
      expect(result.limitPrice).toBe(160.0);
    });
  });

  describe('getOrderHistory', () => {
    it('should retrieve order history', async () => {
      adapter.isAuthenticated = true;
      adapter.accountId = '123456789';

      axios.mockResolvedValue({
        data: [
          {
            orderId: '111',
            status: 'FILLED',
            orderType: 'MARKET',
            duration: 'DAY',
            enteredTime: '2025-10-15T09:00:00Z',
            closeTime: '2025-10-15T09:01:00Z',
            filledQuantity: 10,
            price: 150.0,
            orderLegCollection: [
              {
                instruction: 'BUY',
                quantity: 10,
                instrument: {
                  symbol: 'AAPL'
                }
              }
            ]
          },
          {
            orderId: '222',
            status: 'CANCELED',
            orderType: 'LIMIT',
            duration: 'GTC',
            enteredTime: '2025-10-15T08:00:00Z',
            price: 145.0,
            orderLegCollection: [
              {
                instruction: 'BUY',
                quantity: 5,
                instrument: {
                  symbol: 'AAPL'
                }
              }
            ]
          }
        ]
      });

      const orders = await adapter.getOrderHistory({ limit: 10 });

      expect(orders).toHaveLength(2);
      expect(orders[0].orderId).toBe('111');
      expect(orders[0].status).toBe('FILLED');
      expect(orders[0].symbol).toBe('AAPL');
      expect(orders[1].status).toBe('CANCELLED');
    });

    it('should filter orders by symbol', async () => {
      adapter.isAuthenticated = true;
      adapter.accountId = '123456789';

      axios.mockResolvedValue({
        data: [
          {
            orderId: '111',
            status: 'FILLED',
            orderType: 'MARKET',
            duration: 'DAY',
            enteredTime: '2025-10-15T09:00:00Z',
            orderLegCollection: [
              {
                instruction: 'BUY',
                quantity: 10,
                instrument: {
                  symbol: 'AAPL'
                }
              }
            ]
          },
          {
            orderId: '222',
            status: 'FILLED',
            orderType: 'MARKET',
            duration: 'DAY',
            enteredTime: '2025-10-15T08:00:00Z',
            orderLegCollection: [
              {
                instruction: 'BUY',
                quantity: 5,
                instrument: {
                  symbol: 'TSLA'
                }
              }
            ]
          }
        ]
      });

      const orders = await adapter.getOrderHistory({ symbol: 'AAPL' });
      expect(orders).toHaveLength(1);
      expect(orders[0].symbol).toBe('AAPL');
    });

    it('should handle date filters', async () => {
      adapter.isAuthenticated = true;
      adapter.accountId = '123456789';

      axios.mockResolvedValue({ data: [] });

      const startDate = new Date('2025-10-01');
      const endDate = new Date('2025-10-15');

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
  });

  describe('getMarketPrice', () => {
    it('should retrieve current market price', async () => {
      adapter.isAuthenticated = true;

      axios.mockResolvedValue({
        data: {
          AAPL: {
            bidPrice: 149.5,
            askPrice: 150.0,
            lastPrice: 149.75,
            bidSize: 100,
            askSize: 200,
            mark: 149.75,
            quoteTimeInLong: 1697385600000
          }
        }
      });

      const quote = await adapter.getMarketPrice(testSymbol);

      expect(quote).toEqual({
        symbol: testSymbol,
        bid: 149.5,
        ask: 150.0,
        last: 149.75,
        bidSize: 100,
        askSize: 200,
        timestamp: expect.any(String)
      });
    });

    it('should handle quote errors gracefully', async () => {
      adapter.isAuthenticated = true;

      axios.mockRejectedValue(new Error('Symbol not found'));

      await expect(adapter.getMarketPrice('INVALID')).rejects.toThrow('Failed to get market price');
    });
  });

  describe('isSymbolSupported', () => {
    it('should return true for valid symbols', async () => {
      adapter.isAuthenticated = true;

      axios.mockResolvedValue({
        data: {
          instruments: [
            {
              symbol: 'AAPL',
              description: 'Apple Inc',
              exchange: 'NASDAQ'
            }
          ]
        }
      });

      const result = await adapter.isSymbolSupported(testSymbol);
      expect(result).toBe(true);
    });

    it('should return false for invalid symbols', async () => {
      adapter.isAuthenticated = true;

      axios.mockResolvedValue({
        data: {
          instruments: []
        }
      });

      const result = await adapter.isSymbolSupported('INVALID_SYMBOL');
      expect(result).toBe(false);
    });

    it('should return false on API errors', async () => {
      adapter.isAuthenticated = true;

      axios.mockRejectedValue(new Error('API error'));

      const result = await adapter.isSymbolSupported(testSymbol);
      expect(result).toBe(false);
    });
  });

  describe('getFees', () => {
    it('should return Schwab fee structure', async () => {
      const fees = await adapter.getFees(testSymbol);

      expect(fees).toEqual({
        maker: 0,
        taker: 0,
        withdrawal: 0,
        notes: 'Schwab offers $0 commission for online equity trades. Options: $0.65 per contract.'
      });
    });
  });

  describe('disconnect', () => {
    it('should disconnect and clear credentials', async () => {
      adapter.isAuthenticated = true;
      adapter.accessToken = 'test_token';
      adapter.accountId = '123456789';

      const result = await adapter.disconnect();

      expect(result).toBe(true);
      expect(adapter.isAuthenticated).toBe(false);
      expect(adapter.accessToken).toBeNull();
      expect(adapter.accountId).toBeNull();
    });
  });

  describe('Helper Methods', () => {
    it('should normalize symbols correctly', () => {
      expect(adapter.normalizeSymbol('AAPL')).toBe('AAPL');
      expect(adapter.normalizeSymbol('aapl')).toBe('AAPL');
      expect(adapter.normalizeSymbol('BTC/USD')).toBe('BTCUSD');
    });

    it('should map order types correctly', () => {
      expect(adapter.mapOrderType('MARKET')).toBe('MARKET');
      expect(adapter.mapOrderType('LIMIT')).toBe('LIMIT');
      expect(adapter.mapOrderType('STOP')).toBe('STOP');
      expect(adapter.mapOrderType('STOP_LIMIT')).toBe('STOP_LIMIT');
      expect(adapter.mapOrderType('TRAILING_STOP')).toBe('TRAILING_STOP');
    });

    it('should map time in force correctly', () => {
      expect(adapter.mapTimeInForce('GTC')).toBe('GOOD_TILL_CANCEL');
      expect(adapter.mapTimeInForce('DAY')).toBe('DAY');
      expect(adapter.mapTimeInForce('IOC')).toBe('IMMEDIATE_OR_CANCEL');
      expect(adapter.mapTimeInForce('FOK')).toBe('FILL_OR_KILL');
    });

    it('should map order status correctly', () => {
      expect(adapter.mapOrderStatus('WORKING')).toBe('WORKING');
      expect(adapter.mapOrderStatus('FILLED')).toBe('FILLED');
      expect(adapter.mapOrderStatus('CANCELED')).toBe('CANCELLED');
      expect(adapter.mapOrderStatus('REJECTED')).toBe('REJECTED');
      expect(adapter.mapOrderStatus('EXPIRED')).toBe('EXPIRED');
    });
  });

  describe('OAuth Static Methods', () => {
    it('should generate OAuth authorization URL', () => {
      const url = SchwabAdapter.getOAuthURL('test_client_id', 'https://localhost:3000/callback', 'random_state');

      expect(url).toContain('https://api.schwabapi.com/v1/oauth/authorize');
      expect(url).toContain('response_type=code');
      expect(url).toContain('client_id=test_client_id');
      expect(url).toContain('redirect_uri=https');
      expect(url).toContain('state=random_state');
    });

    it('should exchange authorization code for tokens', async () => {
      axios.post.mockResolvedValue({
        data: {
          access_token: 'new_access_token',
          refresh_token: 'new_refresh_token',
          token_type: 'Bearer',
          expires_in: 1800,
          scope: 'api'
        }
      });

      const tokens = await SchwabAdapter.exchangeCodeForToken(
        'auth_code',
        'test_client_id',
        'test_client_secret',
        'https://localhost:3000/callback'
      );

      expect(tokens).toEqual({
        accessToken: 'new_access_token',
        refreshToken: 'new_refresh_token',
        tokenType: 'Bearer',
        expiresIn: 1800,
        scope: 'api'
      });
    });

    it('should handle token exchange errors', async () => {
      axios.post.mockRejectedValue(new Error('Invalid authorization code'));

      await expect(
        SchwabAdapter.exchangeCodeForToken(
          'invalid_code',
          'test_client_id',
          'test_client_secret',
          'https://localhost:3000/callback'
        )
      ).rejects.toThrow('Failed to exchange code for token');
    });
  });
});
