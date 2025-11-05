/**
 * Integration Tests for EtradeAdapter
 * Tests complete workflows and inter-component integration
 *
 * Note: These tests use mocked Etrade API for safety
 * For live testing with real Etrade API, set ETRADE_INTEGRATION_TEST=true
 */

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

describe('EtradeAdapter Integration Tests', () => {
  let adapter;
  let mockUser;
  let orderCounter = 1;

  beforeEach(() => {
    jest.clearAllMocks();
    orderCounter = 1;

    // Mock user with valid Etrade OAuth tokens
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

  describe('Integration 1: Complete Order Lifecycle', () => {
    test('should handle complete order flow: create → monitor → fill → history', async () => {
      // Step 1: Authenticate
      axios.mockResolvedValueOnce({
        data: {
          AccountListResponse: {
            Accounts: {
              Account: [{ accountIdKey: 'abc123key', accountId: '12345678' }]
            }
          }
        }
      });

      await adapter.authenticate();
      expect(adapter.isAuthenticated).toBe(true);
      expect(adapter.accountIdKey).toBe('abc123key');

      // Step 2: Create market order - preview
      axios.mockResolvedValueOnce({
        data: {
          PreviewOrderResponse: {
            PreviewIds: [{ previewId: 'preview-order1' }]
          }
        }
      });

      // Step 2: Create market order - place
      axios.mockResolvedValueOnce({
        data: {
          PlaceOrderResponse: {
            Order: [
              {
                orderId: 'order-aapl-001',
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

      const createdOrder = await adapter.createOrder(order);
      expect(createdOrder).toHaveProperty('orderId', 'order-aapl-001');
      expect(createdOrder.status).toBe('FILLED');
      expect(createdOrder.filledQuantity).toBe(100);
      expect(createdOrder.executedPrice).toBe(150.25);

      // Step 3: Verify order appears in history
      axios.mockResolvedValueOnce({
        data: {
          OrdersResponse: {
            Order: [
              {
                orderId: 'order-aapl-001',
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
                orderTerm: 'GOOD_FOR_DAY',
                orderPlacedTime: new Date().toISOString()
              }
            ]
          }
        }
      });

      const history = await adapter.getOrderHistory({ symbol: 'AAPL' });
      expect(history.length).toBeGreaterThan(0);

      const filledOrder = history.find(o => o.orderId === 'order-aapl-001');
      expect(filledOrder).toBeDefined();
      expect(filledOrder.status).toBe('FILLED');
      expect(filledOrder.symbol).toBe('AAPL');
    });

    test('should handle order cancellation workflow', async () => {
      // Authenticate
      axios.mockResolvedValueOnce({
        data: {
          AccountListResponse: {
            Accounts: { Account: [{ accountIdKey: 'abc123key', accountId: '12345678' }] }
          }
        }
      });
      await adapter.authenticate();

      // Create limit order - preview
      axios.mockResolvedValueOnce({
        data: {
          PreviewOrderResponse: {
            PreviewIds: [{ previewId: 'preview-order2' }]
          }
        }
      });

      // Create limit order - place
      axios.mockResolvedValueOnce({
        data: {
          PlaceOrderResponse: {
            Order: [
              {
                orderId: 'order-tsla-001',
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
        side: 'BUY',
        type: 'LIMIT',
        quantity: 50,
        price: 200.0,
        timeInForce: 'GTC'
      };

      const createdOrder = await adapter.createOrder(order);
      expect(createdOrder.orderId).toBe('order-tsla-001');

      // Cancel order
      axios.mockResolvedValueOnce({
        data: {
          CancelOrderResponse: {
            resultMessage: 'SUCCESS'
          }
        }
      });

      const cancelled = await adapter.cancelOrder('order-tsla-001');
      expect(cancelled).toBe(true);
    });
  });

  describe('Integration 2: Position and Balance Management', () => {
    test('should reflect balance and positions after order execution', async () => {
      // Authenticate
      axios.mockResolvedValueOnce({
        data: {
          AccountListResponse: {
            Accounts: { Account: [{ accountIdKey: 'abc123key', accountId: '12345678' }] }
          }
        }
      });
      await adapter.authenticate();

      // Get initial balance
      axios.mockResolvedValueOnce({
        data: {
          BalanceResponse: {
            Computed: {
              RealTimeValues: { totalAccountValue: 1000000 },
              cashAvailableForWithdrawal: 500000,
              cashBalance: 500000,
              buyingPower: { stock: 2000000, margin: 4000000 },
              unrealizedGain: 0
            }
          }
        }
      });

      const initialBalance = await adapter.getBalance();
      expect(initialBalance.total).toBe(1000000);
      expect(initialBalance.available).toBe(500000);

      // Simulate balance change after order execution
      axios.mockResolvedValueOnce({
        data: {
          BalanceResponse: {
            Computed: {
              RealTimeValues: { totalAccountValue: 1005000 },
              cashAvailableForWithdrawal: 490000,
              cashBalance: 485000,
              buyingPower: { stock: 1980000, margin: 3960000 },
              unrealizedGain: 500
            }
          }
        }
      });

      const updatedBalance = await adapter.getBalance();
      expect(updatedBalance.total).toBe(1005000);
      expect(updatedBalance.cash).toBe(485000);
      expect(updatedBalance.profitLoss).toBe(500);
    });

    test('should track positions after order fills', async () => {
      // Authenticate
      axios.mockResolvedValueOnce({
        data: {
          AccountListResponse: {
            Accounts: { Account: [{ accountIdKey: 'abc123key', accountId: '12345678' }] }
          }
        }
      });
      await adapter.authenticate();

      // Get positions
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
      expect(positions.length).toBe(2);

      const aaplPos = positions.find(p => p.symbol === 'AAPL');
      expect(aaplPos).toBeDefined();
      expect(aaplPos.quantity).toBe(100);
      expect(aaplPos.side).toBe('LONG');
      expect(aaplPos.entryPrice).toBe(145.5);
      expect(aaplPos.unrealizedPnL).toBe(450);

      const tslaPos = positions.find(p => p.symbol === 'TSLA');
      expect(tslaPos).toBeDefined();
      expect(tslaPos.quantity).toBe(50);
      expect(tslaPos.unrealizedPnL).toBe(250);
    });
  });

  describe('Integration 3: Market Data and Symbol Validation', () => {
    test('should validate symbol before placing order', async () => {
      // Authenticate
      axios.mockResolvedValueOnce({
        data: {
          AccountListResponse: {
            Accounts: { Account: [{ accountIdKey: 'abc123key', accountId: '12345678' }] }
          }
        }
      });
      await adapter.authenticate();

      // Valid symbol
      axios.mockResolvedValueOnce({
        data: {
          LookupResponse: {
            Data: [{ symbol: 'AAPL', description: 'Apple Inc.' }]
          }
        }
      });

      const aaplSupported = await adapter.isSymbolSupported('AAPL');
      expect(aaplSupported).toBe(true);

      // Invalid symbol
      axios.mockRejectedValueOnce(new Error('Symbol not found'));

      const invalidSupported = await adapter.isSymbolSupported('INVALID123');
      expect(invalidSupported).toBe(false);
    });

    test('should fetch market price for valid symbols', async () => {
      // Authenticate
      axios.mockResolvedValueOnce({
        data: {
          AccountListResponse: {
            Accounts: { Account: [{ accountIdKey: 'abc123key', accountId: '12345678' }] }
          }
        }
      });
      await adapter.authenticate();

      // Get market price
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
      expect(price).toHaveProperty('bid', 149.5);
      expect(price).toHaveProperty('ask', 150.5);
      expect(price).toHaveProperty('last', 150.0);
    });
  });

  describe('Integration 4: Risk Management Workflow', () => {
    test('should create complete bracket order: entry + stop-loss + take-profit', async () => {
      // Authenticate
      axios.mockResolvedValueOnce({
        data: {
          AccountListResponse: {
            Accounts: { Account: [{ accountIdKey: 'abc123key', accountId: '12345678' }] }
          }
        }
      });
      await adapter.authenticate();

      // Entry order - preview
      axios.mockResolvedValueOnce({
        data: {
          PreviewOrderResponse: {
            PreviewIds: [{ previewId: 'preview-entry' }]
          }
        }
      });

      // Entry order - place
      axios.mockResolvedValueOnce({
        data: {
          PlaceOrderResponse: {
            Order: [
              {
                orderId: 'entry-order-001',
                orderStatus: 'EXECUTED',
                filledQuantity: 100,
                averageExecutionPrice: 150.25,
                orderPlacedTime: new Date().toISOString()
              }
            ]
          }
        }
      });

      const entryOrder = await adapter.createOrder({
        symbol: 'AAPL',
        side: 'BUY',
        type: 'MARKET',
        quantity: 100,
        timeInForce: 'DAY'
      });

      expect(entryOrder.status).toBe('FILLED');
      expect(entryOrder.filledQuantity).toBe(100);

      // Stop-loss order - preview
      axios.mockResolvedValueOnce({
        data: {
          PreviewOrderResponse: {
            PreviewIds: [{ previewId: 'preview-stoploss' }]
          }
        }
      });

      // Stop-loss order - place
      axios.mockResolvedValueOnce({
        data: {
          PlaceOrderResponse: {
            Order: [
              {
                orderId: 'stoploss-order-001',
                orderStatus: 'OPEN',
                orderPlacedTime: new Date().toISOString()
              }
            ]
          }
        }
      });

      const stopLoss = await adapter.setStopLoss({
        symbol: 'AAPL',
        quantity: 100,
        stopPrice: 145.0,
        type: 'STOP'
      });

      expect(stopLoss).toHaveProperty('orderId', 'stoploss-order-001');
      expect(stopLoss).toHaveProperty('type', 'STOP_LOSS');
      expect(stopLoss).toHaveProperty('stopPrice', 145.0);

      // Take-profit order - preview
      axios.mockResolvedValueOnce({
        data: {
          PreviewOrderResponse: {
            PreviewIds: [{ previewId: 'preview-takeprofit' }]
          }
        }
      });

      // Take-profit order - place
      axios.mockResolvedValueOnce({
        data: {
          PlaceOrderResponse: {
            Order: [
              {
                orderId: 'takeprofit-order-001',
                orderStatus: 'OPEN',
                orderPlacedTime: new Date().toISOString()
              }
            ]
          }
        }
      });

      const takeProfit = await adapter.setTakeProfit({
        symbol: 'AAPL',
        quantity: 100,
        limitPrice: 160.0
      });

      expect(takeProfit).toHaveProperty('orderId', 'takeprofit-order-001');
      expect(takeProfit).toHaveProperty('type', 'TAKE_PROFIT');
      expect(takeProfit).toHaveProperty('limitPrice', 160.0);
    });

    test('should create trailing stop for dynamic risk management', async () => {
      // Authenticate
      axios.mockResolvedValueOnce({
        data: {
          AccountListResponse: {
            Accounts: { Account: [{ accountIdKey: 'abc123key', accountId: '12345678' }] }
          }
        }
      });
      await adapter.authenticate();

      // Trailing stop - preview
      axios.mockResolvedValueOnce({
        data: {
          PreviewOrderResponse: {
            PreviewIds: [{ previewId: 'preview-trailing' }]
          }
        }
      });

      // Trailing stop - place
      axios.mockResolvedValueOnce({
        data: {
          PlaceOrderResponse: {
            Order: [
              {
                orderId: 'trailing-stop-001',
                orderStatus: 'OPEN',
                orderPlacedTime: new Date().toISOString()
              }
            ]
          }
        }
      });

      const trailingStop = await adapter.setStopLoss({
        symbol: 'TSLA',
        quantity: 50,
        type: 'TRAILING_STOP',
        trailPercent: 5
      });

      expect(trailingStop).toHaveProperty('orderId', 'trailing-stop-001');
      expect(trailingStop).toHaveProperty('type', 'STOP_LOSS');
      expect(trailingStop).toHaveProperty('trailPercent', 5);
    });
  });

  describe('Integration 5: Order History and Execution Tracking', () => {
    test('should track multiple orders and filter by symbol', async () => {
      // Authenticate
      axios.mockResolvedValueOnce({
        data: {
          AccountListResponse: {
            Accounts: { Account: [{ accountIdKey: 'abc123key', accountId: '12345678' }] }
          }
        }
      });
      await adapter.authenticate();

      // Create AAPL order 1 - preview & place
      axios.mockResolvedValueOnce({
        data: { PreviewOrderResponse: { PreviewIds: [{ previewId: 'p1' }] } }
      });
      axios.mockResolvedValueOnce({
        data: {
          PlaceOrderResponse: {
            Order: [
              {
                orderId: 'order-aapl-100',
                orderStatus: 'EXECUTED',
                orderPlacedTime: new Date().toISOString()
              }
            ]
          }
        }
      });
      await adapter.createOrder({
        symbol: 'AAPL',
        side: 'BUY',
        type: 'MARKET',
        quantity: 100
      });

      // Create TSLA order - preview & place
      axios.mockResolvedValueOnce({
        data: { PreviewOrderResponse: { PreviewIds: [{ previewId: 'p2' }] } }
      });
      axios.mockResolvedValueOnce({
        data: {
          PlaceOrderResponse: {
            Order: [
              {
                orderId: 'order-tsla-50',
                orderStatus: 'EXECUTED',
                orderPlacedTime: new Date().toISOString()
              }
            ]
          }
        }
      });
      await adapter.createOrder({
        symbol: 'TSLA',
        side: 'BUY',
        type: 'MARKET',
        quantity: 50
      });

      // Create AAPL order 2 - preview & place
      axios.mockResolvedValueOnce({
        data: { PreviewOrderResponse: { PreviewIds: [{ previewId: 'p3' }] } }
      });
      axios.mockResolvedValueOnce({
        data: {
          PlaceOrderResponse: {
            Order: [
              {
                orderId: 'order-aapl-50',
                orderStatus: 'OPEN',
                orderPlacedTime: new Date().toISOString()
              }
            ]
          }
        }
      });
      await adapter.createOrder({
        symbol: 'AAPL',
        side: 'SELL',
        type: 'LIMIT',
        quantity: 50,
        price: 155.0
      });

      // Get all order history
      axios.mockResolvedValueOnce({
        data: {
          OrdersResponse: {
            Order: [
              {
                orderId: 'order-aapl-100',
                Instrument: [
                  {
                    Product: { symbol: 'AAPL' },
                    orderAction: 'BUY',
                    orderedQuantity: 100,
                    filledQuantity: 100
                  }
                ],
                orderStatus: 'EXECUTED',
                orderPlacedTime: new Date().toISOString()
              },
              {
                orderId: 'order-tsla-50',
                Instrument: [
                  {
                    Product: { symbol: 'TSLA' },
                    orderAction: 'BUY',
                    orderedQuantity: 50,
                    filledQuantity: 50
                  }
                ],
                orderStatus: 'EXECUTED',
                orderPlacedTime: new Date().toISOString()
              },
              {
                orderId: 'order-aapl-50',
                Instrument: [
                  {
                    Product: { symbol: 'AAPL' },
                    orderAction: 'SELL',
                    orderedQuantity: 50,
                    filledQuantity: 0
                  }
                ],
                orderStatus: 'OPEN',
                orderPlacedTime: new Date().toISOString()
              }
            ]
          }
        }
      });

      const allHistory = await adapter.getOrderHistory();
      expect(allHistory.length).toBe(3);

      // Filter by AAPL
      axios.mockResolvedValueOnce({
        data: {
          OrdersResponse: {
            Order: [
              {
                orderId: 'order-aapl-100',
                Instrument: [
                  {
                    Product: { symbol: 'AAPL' },
                    orderAction: 'BUY'
                  }
                ],
                orderStatus: 'EXECUTED',
                orderPlacedTime: new Date().toISOString()
              },
              {
                orderId: 'order-aapl-50',
                Instrument: [
                  {
                    Product: { symbol: 'AAPL' },
                    orderAction: 'SELL'
                  }
                ],
                orderStatus: 'OPEN',
                orderPlacedTime: new Date().toISOString()
              }
            ]
          }
        }
      });

      const aaplHistory = await adapter.getOrderHistory({ symbol: 'AAPL' });
      expect(aaplHistory.length).toBe(2);
      aaplHistory.forEach(order => {
        expect(order.symbol).toBe('AAPL');
      });
    });
  });

  describe('Integration 6: Error Handling and Resilience', () => {
    test('should handle authentication failure gracefully', async () => {
      User.findById.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(adapter.authenticate()).rejects.toThrow(
        'E*TRADE authentication failed'
      );
    });

    test('should detect and report expired tokens', async () => {
      // Update mock user to have expired token
      mockUser.tradingConfig.oauthTokens.get('etrade').expiresAt = new Date(
        Date.now() - 1000
      );
      User.findById.mockResolvedValue(mockUser);

      await expect(adapter.authenticate()).rejects.toThrow('E*TRADE token expired');
    });

    test('should handle invalid symbol in order creation', async () => {
      // Authenticate
      axios.mockResolvedValueOnce({
        data: {
          AccountListResponse: {
            Accounts: { Account: [{ accountIdKey: 'abc123key', accountId: '12345678' }] }
          }
        }
      });
      await adapter.authenticate();

      // Check symbol validation
      axios.mockRejectedValueOnce(new Error('Symbol not found'));
      const isSupported = await adapter.isSymbolSupported('INVALID123');
      expect(isSupported).toBe(false);
    });

    test('should handle API errors during order creation', async () => {
      // Authenticate
      axios.mockResolvedValueOnce({
        data: {
          AccountListResponse: {
            Accounts: { Account: [{ accountIdKey: 'abc123key', accountId: '12345678' }] }
          }
        }
      });
      await adapter.authenticate();

      // Simulate API error
      axios.mockRejectedValueOnce({
        response: {
          status: 400,
          data: { error: 'Insufficient buying power' }
        }
      });

      await expect(
        adapter.createOrder({
          symbol: 'AAPL',
          side: 'BUY',
          type: 'MARKET',
          quantity: 1000000
        })
      ).rejects.toThrow('Failed to create order');
    });

    test('should handle 401 unauthorized and reset authentication', async () => {
      // Authenticate
      axios.mockResolvedValueOnce({
        data: {
          AccountListResponse: {
            Accounts: { Account: [{ accountIdKey: 'abc123key', accountId: '12345678' }] }
          }
        }
      });
      await adapter.authenticate();
      expect(adapter.isAuthenticated).toBe(true);

      // Simulate 401 unauthorized
      axios.mockRejectedValueOnce({
        response: {
          status: 401,
          data: { error: 'Unauthorized' }
        }
      });

      await expect(adapter.getBalance()).rejects.toThrow(
        'authentication expired or invalid'
      );
      expect(adapter.isAuthenticated).toBe(false);
    });
  });

  describe('Integration 7: Fee Calculation and Cost Analysis', () => {
    test('should provide accurate fee structure for trading decisions', async () => {
      const fees = await adapter.getFees('AAPL');

      expect(fees).toHaveProperty('maker', 0);
      expect(fees).toHaveProperty('taker', 0);
      expect(fees).toHaveProperty('withdrawal', 0);
      expect(fees).toHaveProperty('notes');
      expect(fees.notes).toContain('commission-free trading');

      // Verify zero commission for stock trades
      expect(fees.maker).toBe(0);
      expect(fees.taker).toBe(0);
    });
  });
});
