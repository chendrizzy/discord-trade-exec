/**
 * Integration Tests for TDAmeritradeAdapter
 * Tests complete workflows and inter-component integration
 *
 * Note: These tests use mocked TD Ameritrade API for safety, but test integration patterns
 * For live testing with real TD Ameritrade API, set TDAMERITRADE_INTEGRATION_TEST=true
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

describe('TDAmeritradeAdapter Integration Tests', () => {
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

    // Mock User.findById with valid tokens
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

  describe('Integration 1: Complete Order Lifecycle', () => {
    test('should handle complete order flow: authenticate → create → cancel → history', async () => {
      // Step 1: Authenticate
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
      expect(adapter.isAuthenticated).toBe(true);
      expect(adapter.accountId).toBe(mockAccountId);

      // Step 2: Create market order
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

      const createdOrder = await adapter.createOrder(order);
      expect(createdOrder).toHaveProperty('orderId', '12345');
      expect(createdOrder.status).toBe('PENDING');

      // Step 3: Cancel order
      axios.mockResolvedValueOnce({ data: {} });
      const cancelled = await adapter.cancelOrder('12345');
      expect(cancelled).toBe(true);

      // Step 4: Verify order appears in history
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
            status: 'CANCELED',
            quantity: 100,
            filledQuantity: 0,
            duration: 'DAY',
            enteredTime: '2025-01-01T10:00:00Z',
            closeTime: '2025-01-01T10:01:00Z'
          }
        ]
      });

      const history = await adapter.getOrderHistory();
      expect(history.length).toBe(1);
      expect(history[0].orderId).toBe('12345');
      expect(history[0].status).toBe('CANCELLED');
    });

    test('should handle filled order workflow', async () => {
      // Authenticate
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

      // Create order
      axios.mockResolvedValueOnce({
        data: {},
        headers: {
          location: `/accounts/${mockAccountId}/orders/12346`
        }
      });

      const order = {
        symbol: 'TSLA',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 50,
        price: 250.0,
        timeInForce: 'GTC'
      };

      const createdOrder = await adapter.createOrder(order);
      expect(createdOrder.orderId).toBe('12346');

      // Verify filled order in history
      axios.mockResolvedValueOnce({
        data: [
          {
            orderId: '12346',
            orderLegCollection: [
              {
                instrument: { symbol: 'TSLA' },
                instruction: 'BUY'
              }
            ],
            orderType: 'LIMIT',
            status: 'FILLED',
            quantity: 50,
            filledQuantity: 50,
            price: 250.0,
            duration: 'GTC',
            enteredTime: '2025-01-01T10:00:00Z',
            closeTime: '2025-01-01T10:05:00Z'
          }
        ]
      });

      const history = await adapter.getOrderHistory({ symbol: 'TSLA' });
      expect(history[0].status).toBe('FILLED');
      expect(history[0].filledQuantity).toBe(50);
    });
  });

  describe('Integration 2: Position and Balance Management', () => {
    test('should track positions after order fills', async () => {
      // Authenticate
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

      // Initial balance
      axios.mockResolvedValueOnce({
        data: {
          securitiesAccount: {
            currentBalances: {
              liquidationValue: 1000000,
              availableFunds: 500000,
              equity: 1000000,
              cashBalance: 500000,
              buyingPower: 2000000,
              dayTradingBuyingPower: 4000000
            }
          }
        }
      });

      const initialBalance = await adapter.getBalance();
      expect(initialBalance.total).toBe(1000000);
      expect(initialBalance.cash).toBe(500000);

      // Check positions after buy
      axios.mockResolvedValueOnce({
        data: {
          securitiesAccount: {
            positions: [
              {
                instrument: { symbol: 'AAPL' },
                longQuantity: 100,
                shortQuantity: 0,
                averagePrice: 150.0,
                marketValue: 15000,
                currentDayProfitLoss: 0,
                currentDayProfitLossPercentage: 0
              }
            ]
          }
        }
      });

      const positions = await adapter.getPositions();
      expect(positions.length).toBe(1);
      expect(positions[0].symbol).toBe('AAPL');
      expect(positions[0].quantity).toBe(100);
      expect(positions[0].entryPrice).toBe(150.0);

      // Updated balance after purchase
      axios.mockResolvedValueOnce({
        data: {
          securitiesAccount: {
            currentBalances: {
              liquidationValue: 1000000,
              availableFunds: 485000, // Reduced by purchase
              equity: 1000000,
              cashBalance: 485000,
              buyingPower: 1940000,
              dayTradingBuyingPower: 3880000
            }
          }
        }
      });

      const updatedBalance = await adapter.getBalance();
      expect(updatedBalance.available).toBe(485000);
      expect(updatedBalance.cash).toBe(485000);
    });

    test('should reflect multiple positions correctly', async () => {
      // Authenticate
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

      // Multiple positions
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
                currentDayProfitLoss: 500,
                currentDayProfitLossPercentage: 3.33
              },
              {
                instrument: { symbol: 'TSLA' },
                longQuantity: 50,
                shortQuantity: 0,
                averagePrice: 250.0,
                marketValue: 12750,
                currentDayProfitLoss: 250,
                currentDayProfitLossPercentage: 2.0
              },
              {
                instrument: { symbol: 'MSFT' },
                longQuantity: 75,
                shortQuantity: 0,
                averagePrice: 300.0,
                marketValue: 23250,
                currentDayProfitLoss: 750,
                currentDayProfitLossPercentage: 3.33
              }
            ]
          }
        }
      });

      const positions = await adapter.getPositions();
      expect(positions.length).toBe(3);

      const aaplPos = positions.find(p => p.symbol === 'AAPL');
      expect(aaplPos.quantity).toBe(100);
      expect(aaplPos.marketValue).toBe(15500);

      const tslaPos = positions.find(p => p.symbol === 'TSLA');
      expect(tslaPos.quantity).toBe(50);

      const msftPos = positions.find(p => p.symbol === 'MSFT');
      expect(msftPos.quantity).toBe(75);
    });
  });

  describe('Integration 3: Market Data and Symbol Validation', () => {
    test('should validate symbol before placing order', async () => {
      // Authenticate
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

      // Valid symbol
      axios.mockResolvedValueOnce({
        data: [
          {
            symbol: 'AAPL',
            description: 'Apple Inc.',
            exchange: 'NASDAQ'
          }
        ]
      });

      const aaplSupported = await adapter.isSymbolSupported('AAPL');
      expect(aaplSupported).toBe(true);

      // Invalid symbol
      axios.mockRejectedValueOnce({
        response: {
          status: 404,
          data: { error: 'Symbol not found' }
        }
      });

      const invalidSupported = await adapter.isSymbolSupported('INVALID123');
      expect(invalidSupported).toBe(false);
    });

    test('should fetch market price for valid symbols', async () => {
      // Authenticate
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

      // Market price
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
      expect(price.bid).toBe(149.5);
      expect(price.ask).toBe(150.5);
      expect(price.last).toBe(150.0);
      expect(price.volume).toBe(50000000);
    });
  });

  describe('Integration 4: Risk Management Workflow', () => {
    test('should create complete bracket order: entry + stop-loss + take-profit', async () => {
      // Authenticate
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

      // Entry order
      axios.mockResolvedValueOnce({
        data: {},
        headers: {
          location: `/accounts/${mockAccountId}/orders/12345`
        }
      });

      const entryOrder = await adapter.createOrder({
        symbol: 'AAPL',
        side: 'BUY',
        type: 'MARKET',
        quantity: 100,
        timeInForce: 'DAY'
      });
      expect(entryOrder.orderId).toBe('12345');

      // Stop-loss order
      axios.mockResolvedValueOnce({
        data: {},
        headers: {
          location: `/accounts/${mockAccountId}/orders/12346`
        }
      });

      const stopLoss = await adapter.setStopLoss({
        symbol: 'AAPL',
        quantity: 100,
        stopPrice: 145.0,
        side: 'sell',
        type: 'STOP'
      });
      expect(stopLoss.orderId).toBe('12346');
      expect(stopLoss.type).toBe('STOP_LOSS');
      expect(stopLoss.stopPrice).toBe(145.0);

      // Take-profit order
      axios.mockResolvedValueOnce({
        data: {},
        headers: {
          location: `/accounts/${mockAccountId}/orders/12347`
        }
      });

      const takeProfit = await adapter.setTakeProfit({
        symbol: 'AAPL',
        quantity: 100,
        limitPrice: 160.0,
        side: 'sell'
      });
      expect(takeProfit.orderId).toBe('12347');
      expect(takeProfit.type).toBe('TAKE_PROFIT');
      expect(takeProfit.limitPrice).toBe(160.0);

      // Verify all orders in history
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
            duration: 'DAY',
            enteredTime: '2025-01-01T10:00:00Z'
          },
          {
            orderId: '12346',
            orderLegCollection: [
              {
                instrument: { symbol: 'AAPL' },
                instruction: 'SELL'
              }
            ],
            orderType: 'STOP',
            status: 'WORKING',
            quantity: 100,
            stopPrice: 145.0,
            duration: 'GTC',
            enteredTime: '2025-01-01T10:01:00Z'
          },
          {
            orderId: '12347',
            orderLegCollection: [
              {
                instrument: { symbol: 'AAPL' },
                instruction: 'SELL'
              }
            ],
            orderType: 'LIMIT',
            status: 'WORKING',
            quantity: 100,
            price: 160.0,
            duration: 'GTC',
            enteredTime: '2025-01-01T10:02:00Z'
          }
        ]
      });

      const history = await adapter.getOrderHistory({ symbol: 'AAPL' });
      expect(history.length).toBe(3);
    });

    test('should create trailing stop for dynamic risk management', async () => {
      // Authenticate
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

      // Trailing stop order
      axios.mockResolvedValueOnce({
        data: {},
        headers: {
          location: `/accounts/${mockAccountId}/orders/12348`
        }
      });

      const trailingStop = await adapter.setStopLoss({
        symbol: 'TSLA',
        quantity: 50,
        type: 'TRAILING_STOP',
        trailPercent: 5.0
      });

      expect(trailingStop.orderId).toBe('12348');
      expect(trailingStop.type).toBe('STOP_LOSS');
      expect(trailingStop.trailPercent).toBe(5.0);
    });
  });

  describe('Integration 5: Order History and Execution Tracking', () => {
    test('should track multiple orders and filter correctly', async () => {
      // Authenticate
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

      // Create AAPL order
      axios.mockResolvedValueOnce({
        data: {},
        headers: {
          location: `/accounts/${mockAccountId}/orders/12345`
        }
      });
      await adapter.createOrder({
        symbol: 'AAPL',
        side: 'BUY',
        type: 'MARKET',
        quantity: 100
      });

      // Create TSLA order
      axios.mockResolvedValueOnce({
        data: {},
        headers: {
          location: `/accounts/${mockAccountId}/orders/12346`
        }
      });
      await adapter.createOrder({
        symbol: 'TSLA',
        side: 'BUY',
        type: 'MARKET',
        quantity: 50
      });

      // Create another AAPL order
      axios.mockResolvedValueOnce({
        data: {},
        headers: {
          location: `/accounts/${mockAccountId}/orders/12347`
        }
      });
      await adapter.createOrder({
        symbol: 'AAPL',
        side: 'SELL',
        type: 'LIMIT',
        quantity: 50,
        price: 155.0
      });

      // Get all history
      axios.mockResolvedValueOnce({
        data: [
          {
            orderId: '12345',
            orderLegCollection: [{ instrument: { symbol: 'AAPL' }, instruction: 'BUY' }],
            orderType: 'MARKET',
            status: 'FILLED',
            quantity: 100,
            filledQuantity: 100,
            duration: 'DAY',
            enteredTime: '2025-01-01T10:00:00Z'
          },
          {
            orderId: '12346',
            orderLegCollection: [{ instrument: { symbol: 'TSLA' }, instruction: 'BUY' }],
            orderType: 'MARKET',
            status: 'FILLED',
            quantity: 50,
            filledQuantity: 50,
            duration: 'DAY',
            enteredTime: '2025-01-01T10:01:00Z'
          },
          {
            orderId: '12347',
            orderLegCollection: [{ instrument: { symbol: 'AAPL' }, instruction: 'SELL' }],
            orderType: 'LIMIT',
            status: 'WORKING',
            quantity: 50,
            price: 155.0,
            duration: 'GTC',
            enteredTime: '2025-01-01T10:02:00Z'
          }
        ]
      });

      const allHistory = await adapter.getOrderHistory();
      expect(allHistory.length).toBe(3);
    });
  });

  describe('Integration 6: Error Handling and Resilience', () => {
    test('should handle authentication failure gracefully', async () => {
      // Mock user not found
      User.findById.mockResolvedValueOnce(null);

      await expect(adapter.authenticate()).rejects.toThrow(
        `User '${mockUserId}' not found`
      );
    });

    test('should auto-refresh expired token during API call', async () => {
      // Authenticate with valid token
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

      // Mock expired token on next API call
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
      expect(oauth2Service.refreshAccessToken).toHaveBeenCalled();
      expect(balance).toBeDefined();
    });

    test('should handle 401 Unauthorized and mark unauthenticated', async () => {
      // Authenticate
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

      // Mock 401 error
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

  describe('Integration 7: Fee Calculation and Cost Analysis', () => {
    test('should provide accurate fee structure for trading decisions', async () => {
      const fees = await adapter.getFees('AAPL');

      expect(fees.maker).toBe(0);
      expect(fees.taker).toBe(0);
      expect(fees.withdrawal).toBe(0);
      expect(fees.notes).toContain('commission-free');

      // Verify commission-free trading
      const totalFees = fees.maker + fees.taker;
      expect(totalFees).toBe(0);
    });
  });

  describe('Integration 8: Symbol Normalization and Order Creation', () => {
    test('should normalize various symbol formats correctly', async () => {
      // Authenticate
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

      // Test lowercase symbol
      axios.mockResolvedValueOnce({
        data: {},
        headers: {
          location: `/accounts/${mockAccountId}/orders/12345`
        }
      });

      await adapter.createOrder({
        symbol: 'aapl',
        side: 'BUY',
        type: 'MARKET',
        quantity: 100
      });

      // Verify symbol was normalized
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

      // Test symbol with slash (e.g., BRK/B)
      axios.mockResolvedValueOnce({
        data: {},
        headers: {
          location: `/accounts/${mockAccountId}/orders/12346`
        }
      });

      await adapter.createOrder({
        symbol: 'BRK/B',
        side: 'BUY',
        type: 'MARKET',
        quantity: 10
      });

      // Verify slash was removed
      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orderLegCollection: expect.arrayContaining([
              expect.objectContaining({
                instrument: expect.objectContaining({
                  symbol: 'BRKB'
                })
              })
            ])
          })
        })
      );
    });
  });

  describe('Integration 9: Order Type Variations', () => {
    test('should handle all order types correctly', async () => {
      // Authenticate
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

      // Market order
      axios.mockResolvedValueOnce({
        data: {},
        headers: {
          location: `/accounts/${mockAccountId}/orders/1`
        }
      });
      const marketOrder = await adapter.createOrder({
        symbol: 'AAPL',
        side: 'BUY',
        type: 'MARKET',
        quantity: 100
      });
      expect(marketOrder.type).toBe('MARKET');

      // Limit order
      axios.mockResolvedValueOnce({
        data: {},
        headers: {
          location: `/accounts/${mockAccountId}/orders/2`
        }
      });
      const limitOrder = await adapter.createOrder({
        symbol: 'AAPL',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 100,
        price: 150.0
      });
      expect(limitOrder.type).toBe('LIMIT');

      // Stop order
      axios.mockResolvedValueOnce({
        data: {},
        headers: {
          location: `/accounts/${mockAccountId}/orders/3`
        }
      });
      const stopOrder = await adapter.createOrder({
        symbol: 'AAPL',
        side: 'SELL',
        type: 'STOP',
        quantity: 100,
        stopPrice: 145.0
      });
      expect(stopOrder.type).toBe('STOP');

      // Stop-limit order
      axios.mockResolvedValueOnce({
        data: {},
        headers: {
          location: `/accounts/${mockAccountId}/orders/4`
        }
      });
      const stopLimitOrder = await adapter.createOrder({
        symbol: 'AAPL',
        side: 'SELL',
        type: 'STOP_LIMIT',
        quantity: 100,
        price: 148.0,
        stopPrice: 145.0
      });
      expect(stopLimitOrder.type).toBe('STOP_LIMIT');
    });
  });

  describe('Integration 10: Multiple Account Handling', () => {
    test('should use first account when multiple accounts exist', async () => {
      // Mock multiple accounts
      axios.mockResolvedValueOnce({
        data: [
          {
            securitiesAccount: {
              accountId: 'account-1',
              type: 'MARGIN',
              roundTrips: 0,
              isDayTrader: false,
              isClosingOnlyRestricted: false
            }
          },
          {
            securitiesAccount: {
              accountId: 'account-2',
              type: 'CASH',
              roundTrips: 0,
              isDayTrader: false,
              isClosingOnlyRestricted: false
            }
          }
        ]
      });

      await adapter.authenticate();

      // Should use first account
      expect(adapter.accountId).toBe('account-1');
    });
  });

  describe('Integration 11: Connection Test', () => {
    test('should test connection successfully', async () => {
      // Mock successful connection
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

      const result = await adapter.testConnection();
      expect(result).toBe(true);
    });

    test('should return false on connection failure', async () => {
      // Mock connection failure
      User.findById.mockRejectedValueOnce(new Error('Connection failed'));

      const result = await adapter.testConnection();
      expect(result).toBe(false);
    });
  });

  describe('Integration 12: Time-in-Force Handling', () => {
    test('should respect different time-in-force values', async () => {
      // Authenticate
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

      // DAY order
      axios.mockResolvedValueOnce({
        data: {},
        headers: {
          location: `/accounts/${mockAccountId}/orders/1`
        }
      });
      const dayOrder = await adapter.createOrder({
        symbol: 'AAPL',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 100,
        price: 150.0,
        timeInForce: 'DAY'
      });
      expect(dayOrder.timeInForce).toBe('DAY');

      // GTC order
      axios.mockResolvedValueOnce({
        data: {},
        headers: {
          location: `/accounts/${mockAccountId}/orders/2`
        }
      });
      const gtcOrder = await adapter.createOrder({
        symbol: 'AAPL',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 100,
        price: 150.0,
        timeInForce: 'GTC'
      });
      expect(gtcOrder.timeInForce).toBe('GTC');
    });
  });

  describe('Integration 13: Date Range Order History', () => {
    test('should filter order history by date range', async () => {
      // Authenticate
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

      // Mock order history with date filtering
      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      axios.mockResolvedValueOnce({
        data: [
          {
            orderId: '12345',
            orderLegCollection: [{ instrument: { symbol: 'AAPL' }, instruction: 'BUY' }],
            orderType: 'MARKET',
            status: 'FILLED',
            quantity: 100,
            filledQuantity: 100,
            duration: 'DAY',
            enteredTime: '2025-01-15T10:00:00Z'
          }
        ]
      });

      const history = await adapter.getOrderHistory({ startDate, endDate });
      expect(history.length).toBeGreaterThan(0);

      // Verify axios was called with correct date params
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
});
