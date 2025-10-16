/**
 * Unit Tests for MoomooAdapter
 * Tests all 16 BrokerAdapter interface methods with mocked Moomoo API
 */

// Internal utilities and services
const MoomooAdapter = require('../MoomooAdapter');

// Mock the moomoo-api module
jest.mock('moomoo-api', () => {
  class MockMoomooAPI {
    constructor() {
      this.onlogin = null;
      this.onPush = null;
      this.connID = 12345;
    }

    start(host, port, ssl, password) {
      setTimeout(() => {
        if (this.onlogin) {
          this.onlogin(0, 'Connected');
        }
      }, 10);
    }

    getConnID() {
      return this.connID;
    }

    UnlockTrade(req) {
      return Promise.resolve({
        retType: 0,
        s2c: { unlocked: true }
      });
    }

    GetAccList(req) {
      return Promise.resolve({
        retType: 0,
        s2c: {
          accList: [
            {
              accID: 72635647,
              trdEnv: 1,
              trdMarket: 1,
              accType: 1
            }
          ]
        }
      });
    }

    GetFunds(req) {
      return Promise.resolve({
        retType: 0,
        s2c: {
          funds: {
            totalAssets: 1000000,
            avlWithdrawalCash: 500000,
            netAssets: 1000000,
            cash: 500000,
            marketVal: 500000,
            unrealizedPL: 50000
          }
        }
      });
    }

    PlaceOrder(req) {
      return Promise.resolve({
        retType: 0,
        s2c: {
          orderID: 12345
        }
      });
    }

    ModifyOrder(req) {
      return Promise.resolve({
        retType: 0,
        s2c: {
          orderID: req.c2s.orderID
        }
      });
    }

    GetPositionList(req) {
      return Promise.resolve({
        retType: 0,
        s2c: {
          positionList: [
            {
              code: 'AAPL',
              qty: 100,
              costPrice: 145.5,
              marketVal: 15000,
              pl: 450,
              plRatio: 3.09
            }
          ]
        }
      });
    }

    GetHistoryOrderFillList(req) {
      return Promise.resolve({
        retType: 0,
        s2c: {
          orderFillList: [
            {
              orderID: 12345,
              code: 'AAPL',
              trdSide: 1,
              qty: 100,
              price: 150.25,
              createTime: new Date().toISOString()
            }
          ]
        }
      });
    }

    GetBasicQot(req) {
      return Promise.resolve({
        retType: 0,
        s2c: {
          basicQotList: [
            {
              bidPrice: 149.5,
              askPrice: 150.5,
              curPrice: 150.0
            }
          ]
        }
      });
    }

    GetStaticInfo(req) {
      return Promise.resolve({
        retType: 0,
        s2c: {
          staticInfoList: [
            {
              code: req.c2s.securityList[0].code,
              name: 'Apple Inc.',
              market: 1
            }
          ]
        }
      });
    }

    stop() {
      // Mock stop
    }
  }

  return {
    __esModule: true,
    default: MockMoomooAPI
  };
});

describe('MoomooAdapter', () => {
  let adapter;

  beforeEach(() => {
    adapter = new MoomooAdapter(
      {
        accountId: '72635647',
        password: 'test_password',
        host: '127.0.0.1',
        port: 11111
      },
      { isTestnet: true }
    );
  });

  afterEach(async () => {
    if (adapter.isConnected()) {
      await adapter.disconnect();
    }
  });

  describe('Constructor', () => {
    test('should initialize with default configuration', () => {
      expect(adapter.brokerName).toBe('moomoo');
      expect(adapter.brokerType).toBe('stock');
      expect(adapter.accountId).toBe('72635647');
      expect(adapter.host).toBe('127.0.0.1');
      expect(adapter.port).toBe(11111);
      expect(adapter.isTestnet).toBe(true);
      expect(adapter.tradeEnv).toBe(1); // 1 = paper trading
    });

    test('should accept custom credentials', () => {
      const customAdapter = new MoomooAdapter(
        {
          accountId: '99999999',
          password: 'custom_pass',
          host: '192.168.1.100',
          port: 22222
        },
        { isTestnet: false }
      );
      expect(customAdapter.accountId).toBe('99999999');
      expect(customAdapter.host).toBe('192.168.1.100');
      expect(customAdapter.port).toBe(22222);
      expect(customAdapter.tradeEnv).toBe(0); // 0 = real trading
    });
  });

  describe('authenticate()', () => {
    test('should connect to OpenD Gateway and authenticate successfully', async () => {
      const result = await adapter.authenticate();
      expect(result).toBe(true);
      expect(adapter.isAuthenticated).toBe(true);
      expect(adapter.connectionReady).toBe(true);
      expect(adapter.accountInfo).toBeDefined();
      expect(adapter.accountInfo.accID).toBe(72635647);
    });

    test('should return true if already authenticated', async () => {
      await adapter.authenticate();
      const result = await adapter.authenticate();
      expect(result).toBe(true);
    });

    test('should handle connection errors', async () => {
      const failAdapter = new MoomooAdapter();
      failAdapter.moomoo = {
        start: jest.fn(),
        onlogin: null
      };

      // Mock connection failure
      const mockStart = failAdapter.moomoo.start;
      mockStart.mockImplementation((host, port, ssl, password) => {
        setTimeout(() => {
          if (failAdapter.moomoo.onlogin) {
            failAdapter.moomoo.onlogin(-1, 'Connection failed');
          }
        }, 10);
      });

      await expect(failAdapter.authenticate()).rejects.toThrow();
    });
  });

  describe('isConnected()', () => {
    test('should return false when not connected', () => {
      expect(adapter.isConnected()).toBe(false);
    });

    test('should return true when connected', async () => {
      await adapter.authenticate();
      expect(adapter.isConnected()).toBe(true);
    });
  });

  describe('getBalance()', () => {
    test('should retrieve account balance successfully', async () => {
      await adapter.authenticate();
      const balance = await adapter.getBalance('USD');

      expect(balance).toHaveProperty('total');
      expect(balance).toHaveProperty('available');
      expect(balance).toHaveProperty('equity');
      expect(balance).toHaveProperty('currency');
      expect(balance.total).toBe(1000000);
      expect(balance.available).toBe(500000);
      expect(balance.currency).toBe('USD');
    });

    test('should auto-connect if not connected', async () => {
      const balance = await adapter.getBalance();
      expect(adapter.isConnected()).toBe(true);
      expect(balance.total).toBeGreaterThan(0);
    });
  });

  describe('createOrder()', () => {
    test('should create a market order successfully', async () => {
      await adapter.authenticate();

      const order = {
        symbol: 'AAPL',
        side: 'BUY',
        type: 'MARKET',
        quantity: 100,
        timeInForce: 'DAY'
      };

      const result = await adapter.createOrder(order);

      expect(result).toHaveProperty('orderId');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('symbol', 'AAPL');
      expect(result).toHaveProperty('side', 'BUY');
      expect(result.status).toBe('PENDING');
    });

    test('should create a limit order successfully', async () => {
      await adapter.authenticate();

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
    });

    test('should create a stop order successfully', async () => {
      await adapter.authenticate();

      const order = {
        symbol: 'MSFT',
        side: 'SELL',
        type: 'STOP',
        quantity: 25,
        stopPrice: 290.0,
        timeInForce: 'DAY'
      };

      const result = await adapter.createOrder(order);
      expect(result.symbol).toBe('MSFT');
      expect(result.type).toBe('STOP');
    });
  });

  describe('cancelOrder()', () => {
    test('should cancel an order successfully', async () => {
      await adapter.authenticate();

      const result = await adapter.cancelOrder('12345');
      expect(result).toBe(true);
    });
  });

  describe('getPositions()', () => {
    test('should retrieve open positions successfully', async () => {
      await adapter.authenticate();

      const positions = await adapter.getPositions();
      expect(Array.isArray(positions)).toBe(true);
      expect(positions.length).toBeGreaterThan(0);
      expect(positions[0]).toHaveProperty('symbol');
      expect(positions[0]).toHaveProperty('quantity');
      expect(positions[0]).toHaveProperty('avgCost');
      expect(positions[0].symbol).toBe('AAPL');
      expect(positions[0].quantity).toBe(100);
    });

    test('should return empty array when no positions', async () => {
      await adapter.authenticate();

      // Mock empty positions
      adapter.moomoo.GetPositionList = jest.fn().mockResolvedValue({
        retType: 0,
        s2c: { positionList: [] }
      });

      const positions = await adapter.getPositions();
      expect(Array.isArray(positions)).toBe(true);
      expect(positions.length).toBe(0);
    });
  });

  describe('setStopLoss()', () => {
    test('should create a stop-loss order', async () => {
      await adapter.authenticate();

      const result = await adapter.setStopLoss({
        symbol: 'AAPL',
        quantity: 100,
        stopPrice: 140.0,
        type: 'STOP'
      });

      expect(result).toHaveProperty('orderId');
      expect(result.symbol).toBe('AAPL');
    });

    test('should create a trailing stop order', async () => {
      await adapter.authenticate();

      const result = await adapter.setStopLoss({
        symbol: 'TSLA',
        quantity: 50,
        type: 'TRAILING_STOP',
        stopPrice: 195.0,
        trailPercent: 5
      });

      expect(result).toHaveProperty('orderId');
      expect(result.type).toBe('TRAILING_STOP');
    });
  });

  describe('setTakeProfit()', () => {
    test('should create a take-profit order', async () => {
      await adapter.authenticate();

      const result = await adapter.setTakeProfit({
        symbol: 'AAPL',
        quantity: 100,
        limitPrice: 160.0
      });

      expect(result).toHaveProperty('orderId');
      expect(result.symbol).toBe('AAPL');
      expect(result.type).toBe('LIMIT');
    });
  });

  describe('getOrderHistory()', () => {
    test('should retrieve order history', async () => {
      await adapter.authenticate();

      const history = await adapter.getOrderHistory();
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThan(0);
      expect(history[0]).toHaveProperty('orderId');
      expect(history[0]).toHaveProperty('symbol');
      expect(history[0]).toHaveProperty('side');
      expect(history[0]).toHaveProperty('quantity');
      expect(history[0]).toHaveProperty('price');
      expect(history[0]).toHaveProperty('status', 'FILLED');
    });

    test('should filter order history by symbol', async () => {
      await adapter.authenticate();

      const history = await adapter.getOrderHistory({ symbol: 'AAPL' });
      expect(Array.isArray(history)).toBe(true);
      history.forEach(order => {
        expect(order.symbol).toBe('AAPL');
      });
    });
  });

  describe('getMarketPrice()', () => {
    test('should retrieve current market price', async () => {
      await adapter.authenticate();

      const price = await adapter.getMarketPrice('AAPL');
      expect(price).toHaveProperty('bid');
      expect(price).toHaveProperty('ask');
      expect(price).toHaveProperty('last');
      expect(price.bid).toBe(149.5);
      expect(price.ask).toBe(150.5);
      expect(price.last).toBe(150.0);
    });
  });

  describe('isSymbolSupported()', () => {
    test('should return true for valid symbols', async () => {
      await adapter.authenticate();

      const isSupported = await adapter.isSymbolSupported('AAPL');
      expect(isSupported).toBe(true);
    });

    test('should return false for invalid symbols', async () => {
      await adapter.authenticate();

      // Mock error response
      adapter.moomoo.GetStaticInfo = jest.fn().mockResolvedValue({
        retType: -1,
        s2c: { staticInfoList: [] }
      });

      const isSupported = await adapter.isSymbolSupported('INVALID123');
      expect(isSupported).toBe(false);
    });
  });

  describe('getFees()', () => {
    test('should return fee structure', async () => {
      const fees = await adapter.getFees('AAPL');

      expect(fees).toHaveProperty('maker');
      expect(fees).toHaveProperty('taker');
      expect(fees).toHaveProperty('commission');
      expect(fees).toHaveProperty('minimum');
      expect(fees).toHaveProperty('maximum');
      expect(fees).toHaveProperty('currency', 'USD');
      expect(fees.commission).toBe(0.0); // Moomoo is commission-free
    });
  });

  describe('disconnect()', () => {
    test('should disconnect successfully', async () => {
      await adapter.authenticate();
      expect(adapter.isConnected()).toBe(true);

      await adapter.disconnect();
      expect(adapter.isConnected()).toBe(false);
      expect(adapter.moomoo).toBeNull();
    });

    test('should handle disconnect when not connected', async () => {
      await expect(adapter.disconnect()).resolves.not.toThrow();
    });
  });

  describe('getBrokerInfo()', () => {
    test('should return broker metadata', () => {
      const info = adapter.getBrokerInfo();

      expect(info).toHaveProperty('name', 'Moomoo');
      expect(info).toHaveProperty('type', 'stock');
      expect(info).toHaveProperty('features');
      expect(info).toHaveProperty('requiresOpenDRunning', true);
      expect(info).toHaveProperty('rateLimit');
      expect(info.features).toContain('stocks');
      expect(info.features).toContain('options');
    });
  });

  describe('Helper Methods', () => {
    test('mapOrderType() should convert order types correctly', () => {
      expect(adapter.mapOrderType('MARKET')).toBe(1);
      expect(adapter.mapOrderType('LIMIT')).toBe(2);
      expect(adapter.mapOrderType('STOP')).toBe(3);
      expect(adapter.mapOrderType('STOP_LIMIT')).toBe(4);
      expect(adapter.mapOrderType('TRAILING_STOP')).toBe(7);
    });

    test('mapTimeInForce() should convert TIF correctly', () => {
      expect(adapter.mapTimeInForce('DAY')).toBe(0);
      expect(adapter.mapTimeInForce('GTC')).toBe(1);
      expect(adapter.mapTimeInForce('GTD')).toBe(2);
    });

    test('getMarketCode() should return correct market code', () => {
      expect(adapter.getMarketCode('AAPL')).toBe(1); // US market
    });
  });
});
