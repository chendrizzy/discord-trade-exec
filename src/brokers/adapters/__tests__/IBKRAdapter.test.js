/**
 * Unit Tests for IBKRAdapter
 * Tests all 16 BrokerAdapter interface methods with mocked IB API
 */

const IBKRAdapter = require('../IBKRAdapter');

// Mock the @stoqey/ib module
jest.mock('@stoqey/ib', () => {
  const EventEmitter = require('events');

  class MockIBApi extends EventEmitter {
    constructor(config) {
      super();
      this.config = config;
      this.connected = false;
    }

    connect() {
      this.connected = true;
      setTimeout(() => {
        this.emit('connected');
        this.emit('nextValidId', 1);
      }, 10);
    }

    disconnect() {
      this.connected = false;
      this.emit('disconnected');
    }

    reqAccountSummary(reqId, group, tags) {
      setTimeout(() => {
        this.emit('accountSummary', reqId, 'All', 'TotalCashValue', '500000', 'USD');
        this.emit('accountSummary', reqId, 'All', 'NetLiquidation', '1000000', 'USD');
        this.emit('accountSummary', reqId, 'All', 'BuyingPower', '4000000', 'USD');
        this.emit('accountSummary', reqId, 'All', 'GrossPositionValue', '500000', 'USD');
        this.emit('accountSummaryEnd', reqId);
      }, 10);
    }

    cancelAccountSummary(reqId) {}

    placeOrder(orderId, contract, order) {
      setTimeout(() => {
        this.emit('orderStatus', orderId, 'Filled', order.totalQuantity, 0, 150.25);
      }, 10);
    }

    cancelOrder(orderId) {
      setTimeout(() => {
        this.emit('orderStatus', orderId, 'Cancelled');
      }, 10);
    }

    reqPositions() {
      setTimeout(() => {
        const mockContract = {
          symbol: 'AAPL',
          secType: 'STK',
          exchange: 'SMART',
          currency: 'USD'
        };
        this.emit('position', 'U1234567', mockContract, 100, 145.50);
        this.emit('positionEnd');
      }, 10);
    }

    cancelPositions() {}

    reqExecutions(reqId, filter) {
      setTimeout(() => {
        const mockContract = {
          symbol: 'AAPL',
          secType: 'STK'
        };
        const mockExecution = {
          orderId: 1,
          side: 'BUY',
          shares: 100,
          price: 150.25,
          time: new Date().toISOString()
        };
        this.emit('execDetails', reqId, mockContract, mockExecution);
        this.emit('execDetailsEnd', reqId);
      }, 10);
    }

    reqMktData(reqId, contract, genericTickList, snapshot, regulatorySnapshot) {
      setTimeout(() => {
        this.emit('tickPrice', reqId, 1, 149.50); // Bid
        this.emit('tickPrice', reqId, 2, 150.50); // Ask
        this.emit('tickPrice', reqId, 4, 150.00); // Last
      }, 10);
    }

    cancelMktData(reqId) {}

    reqContractDetails(reqId, contract) {
      setTimeout(() => {
        const mockDetails = {
          contract: contract,
          validExchanges: 'SMART'
        };
        this.emit('contractDetails', reqId, mockDetails);
        this.emit('contractDetailsEnd', reqId);
      }, 10);
    }
  }

  class MockContract {
    constructor() {
      this.symbol = '';
      this.secType = '';
      this.exchange = '';
      this.currency = '';
    }
  }

  class MockOrder {
    constructor() {
      this.orderId = 0;
      this.action = '';
      this.totalQuantity = 0;
      this.orderType = '';
      this.tif = '';
      this.lmtPrice = 0;
      this.auxPrice = 0;
    }
  }

  return {
    IBApi: MockIBApi,
    Contract: MockContract,
    Order: MockOrder
  };
});

describe('IBKRAdapter', () => {
  let adapter;

  beforeEach(() => {
    adapter = new IBKRAdapter(
      { clientId: 1, host: '127.0.0.1', port: 4001 },
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
      expect(adapter.brokerName).toBe('ibkr');
      expect(adapter.brokerType).toBe('stock');
      expect(adapter.clientId).toBe(1);
      expect(adapter.host).toBe('127.0.0.1');
      expect(adapter.port).toBe(4001);
      expect(adapter.isTestnet).toBe(true);
    });

    test('should accept custom credentials', () => {
      const customAdapter = new IBKRAdapter(
        { clientId: 5, host: '192.168.1.100', port: 7496 },
        { isTestnet: false }
      );
      expect(customAdapter.clientId).toBe(5);
      expect(customAdapter.host).toBe('192.168.1.100');
      expect(customAdapter.port).toBe(7496);
    });
  });

  describe('authenticate()', () => {
    test('should connect to TWS and authenticate successfully', async () => {
      const result = await adapter.authenticate();
      expect(result).toBe(true);
      expect(adapter.isAuthenticated).toBe(true);
      expect(adapter.connectionReady).toBe(true);
      expect(adapter.nextValidOrderId).toBe(1);
    });

    test('should return true if already authenticated', async () => {
      await adapter.authenticate();
      const result = await adapter.authenticate();
      expect(result).toBe(true);
    });

    test('should handle connection errors', async () => {
      // Create a new adapter and immediately attempt to connect
      // when TWS is not running (will timeout and fail)
      const { IBApi } = require('@stoqey/ib');
      const originalConnect = IBApi.prototype.connect;

      // Mock connect to emit error
      IBApi.prototype.connect = jest.fn(function() {
        setTimeout(() => {
          this.emit('error', { code: -1, message: 'Connection refused' }, {});
        }, 10);
      });

      const failAdapter = new IBKRAdapter(
        { clientId: 99, host: '127.0.0.1', port: 9999 },
        { isTestnet: true }
      );

      await expect(failAdapter.authenticate()).rejects.toThrow('Connection refused');

      // Restore original
      IBApi.prototype.connect = originalConnect;
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
      expect(balance.available).toBe(4000000);
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
      expect(result.status).toBe('FILLED');
      expect(result.filledQuantity).toBe(100);
    });

    test('should create a limit order successfully', async () => {
      await adapter.authenticate();

      const order = {
        symbol: 'TSLA',
        side: 'SELL',
        type: 'LIMIT',
        quantity: 50,
        price: 200.00,
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
        stopPrice: 290.00,
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

      const result = await adapter.cancelOrder('1');
      expect(result).toBe(true);
    });

    test('should handle invalid order ID', async () => {
      await adapter.authenticate();
      await expect(adapter.cancelOrder('invalid')).rejects.toThrow();
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
      adapter.ib.reqPositions = jest.fn(function() {
        setTimeout(() => this.emit('positionEnd'), 10);
      }.bind(adapter.ib));

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
        stopPrice: 140.00,
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
        limitPrice: 160.00
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
      expect(price.bid).toBe(149.50);
      expect(price.ask).toBe(150.50);
      expect(price.last).toBe(150.00);
    });

    test('should handle invalid symbol', async () => {
      await adapter.authenticate();

      // Mock timeout
      adapter.ib.reqMktData = jest.fn();
      await expect(adapter.getMarketPrice('INVALID')).rejects.toThrow('timeout');
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
      adapter.ib.reqContractDetails = jest.fn(function(reqId) {
        setTimeout(() => this.emit('error', { message: 'Invalid symbol' }, { id: reqId }), 10);
      }.bind(adapter.ib));

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
      expect(fees.maker).toBe(0.0005);
      expect(fees.minimum).toBe(1.00);
    });
  });

  describe('disconnect()', () => {
    test('should disconnect successfully', async () => {
      await adapter.authenticate();
      expect(adapter.isConnected()).toBe(true);

      await adapter.disconnect();
      expect(adapter.isConnected()).toBe(false);
      expect(adapter.ib).toBeNull();
    });

    test('should handle disconnect when not connected', async () => {
      await expect(adapter.disconnect()).resolves.not.toThrow();
    });
  });

  describe('getBrokerInfo()', () => {
    test('should return broker metadata', () => {
      const info = adapter.getBrokerInfo();

      expect(info).toHaveProperty('name', 'Interactive Brokers');
      expect(info).toHaveProperty('type', 'stock');
      expect(info).toHaveProperty('features');
      expect(info).toHaveProperty('requiresTWSRunning', true);
      expect(info).toHaveProperty('rateLimit');
      expect(info.features).toContain('stocks');
      expect(info.features).toContain('options');
    });
  });

  describe('Helper Methods', () => {
    test('mapOrderType() should convert order types correctly', () => {
      expect(adapter.mapOrderType('MARKET')).toBe('MKT');
      expect(adapter.mapOrderType('LIMIT')).toBe('LMT');
      expect(adapter.mapOrderType('STOP')).toBe('STP');
      expect(adapter.mapOrderType('STOP_LIMIT')).toBe('STP LMT');
      expect(adapter.mapOrderType('TRAILING_STOP')).toBe('TRAIL');
    });

    test('mapTimeInForce() should convert TIF correctly', () => {
      expect(adapter.mapTimeInForce('DAY')).toBe('DAY');
      expect(adapter.mapTimeInForce('GTC')).toBe('GTC');
      expect(adapter.mapTimeInForce('IOC')).toBe('IOC');
      expect(adapter.mapTimeInForce('FOK')).toBe('FOK');
    });

    test('mapOrderStatus() should convert status correctly', () => {
      expect(adapter.mapOrderStatus('PendingSubmit')).toBe('PENDING');
      expect(adapter.mapOrderStatus('Submitted')).toBe('PENDING');
      expect(adapter.mapOrderStatus('Filled')).toBe('FILLED');
      expect(adapter.mapOrderStatus('Cancelled')).toBe('CANCELLED');
      expect(adapter.mapOrderStatus('Inactive')).toBe('CANCELLED');
    });
  });
});
