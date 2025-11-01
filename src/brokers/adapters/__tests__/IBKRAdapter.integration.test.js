/**
 * Integration Tests for IBKRAdapter
 * Tests complete workflows and inter-component integration
 *
 * Note: These tests use mocked IB API for safety, but test integration patterns
 * For live testing with real TWS/IB Gateway, set IBKR_INTEGRATION_TEST=true
 */

const IBKRAdapter = require('../IBKRAdapter');
const User = require('../../../models/User');
const oauth2Service = require('../../../services/OAuth2Service');

// Mock dependencies for integration testing
jest.mock('@stoqey/ib', () => {
  const EventEmitter = require('events');

  class MockIBApi extends EventEmitter {
    constructor(config) {
      super();
      this.config = config;
      this.connected = false;
      this.orderBook = new Map();
      this.positions = [];
      this.accountValues = {
        TotalCashValue: 500000,
        NetLiquidation: 1000000,
        BuyingPower: 4000000,
        GrossPositionValue: 500000
      };
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

    placeOrder(orderId, contract, order) {
      const orderData = {
        id: orderId,
        contract,
        order,
        status: 'Submitted',
        filled: 0,
        remaining: order.totalQuantity,
        avgFillPrice: 0
      };
      this.orderBook.set(orderId, orderData);

      setTimeout(() => {
        // Simulate partial fill
        orderData.status = 'PartiallyFilled';
        orderData.filled = Math.floor(order.totalQuantity / 2);
        orderData.remaining = Math.ceil(order.totalQuantity / 2);
        orderData.avgFillPrice = 150.25;
        this.emit('orderStatus', orderId, 'PartiallyFilled', orderData.filled, orderData.remaining, 150.25);

        // Simulate complete fill
        setTimeout(() => {
          orderData.status = 'Filled';
          orderData.filled = order.totalQuantity;
          orderData.remaining = 0;
          orderData.avgFillPrice = 150.25;
          this.emit('orderStatus', orderId, 'Filled', order.totalQuantity, 0, 150.25);
        }, 50);
      }, 20);
    }

    cancelOrder(orderId) {
      if (this.orderBook.has(orderId)) {
        this.orderBook.get(orderId).status = 'Cancelled';
        setTimeout(() => {
          this.emit('orderStatus', orderId, 'Cancelled');
        }, 10);
      }
    }

    reqAccountSummary(reqId, group, tags) {
      setTimeout(() => {
        Object.entries(this.accountValues).forEach(([tag, value]) => {
          this.emit('accountSummary', reqId, 'All', tag, value.toString(), 'USD');
        });
        this.emit('accountSummaryEnd', reqId);
      }, 10);
    }

    cancelAccountSummary(reqId) {}

    reqPositions() {
      setTimeout(() => {
        this.positions.forEach(pos => {
          this.emit('position', 'U1234567', pos.contract, pos.quantity, pos.avgCost);
        });
        this.emit('positionEnd');
      }, 10);
    }

    cancelPositions() {}

    reqExecutions(reqId, filter) {
      setTimeout(() => {
        const executions = Array.from(this.orderBook.values())
          .filter(order => order.status === 'Filled' || order.status === 'PartiallyFilled')
          .map(order => ({
            reqId,
            contract: order.contract,
            execution: {
              orderId: order.id,
              side: order.order.action,
              shares: order.filled,
              price: order.avgFillPrice,
              time: new Date().toISOString()
            }
          }));

        executions.forEach(exec => {
          this.emit('execDetails', exec.reqId, exec.contract, exec.execution);
        });
        this.emit('execDetailsEnd', reqId);
      }, 10);
    }

    reqMktData(reqId, contract, genericTickList, snapshot, regulatorySnapshot) {
      setTimeout(() => {
        this.emit('tickPrice', reqId, 1, 149.5); // Bid
        this.emit('tickPrice', reqId, 2, 150.5); // Ask
        this.emit('tickPrice', reqId, 4, 150.0); // Last
      }, 10);
    }

    cancelMktData(reqId) {}

    reqContractDetails(reqId, contract) {
      setTimeout(() => {
        const validSymbols = ['AAPL', 'TSLA', 'MSFT', 'GOOGL'];
        if (validSymbols.includes(contract.symbol)) {
          this.emit('contractDetails', reqId, { contract, validExchanges: 'SMART' });
          this.emit('contractDetailsEnd', reqId);
        } else {
          this.emit('error', { message: 'Invalid symbol' }, { id: reqId });
        }
      }, 10);
    }

    // Helper method to simulate position
    addPosition(symbol, quantity, avgCost) {
      this.positions.push({
        contract: {
          symbol,
          secType: 'STK',
          exchange: 'SMART',
          currency: 'USD'
        },
        quantity,
        avgCost
      });
    }

    // Helper method to update account values (for testing balance changes)
    updateAccountValue(tag, value) {
      this.accountValues[tag] = value;
    }
  }

  return {
    IBApi: MockIBApi,
    Contract: class {
      constructor() {
        this.symbol = '';
        this.secType = '';
        this.exchange = '';
        this.currency = '';
      }
    },
    Order: class {
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
  };
});

describe('IBKRAdapter Integration Tests', () => {
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

  describe('Integration 1: Complete Order Lifecycle', () => {
    test('should handle complete order flow: create → monitor → fill → history', async () => {
      // Step 1: Authenticate
      await adapter.authenticate();
      expect(adapter.isAuthenticated).toBe(true);
      expect(adapter.isConnected()).toBe(true);

      // Step 2: Create market order
      const order = {
        symbol: 'AAPL',
        side: 'BUY',
        type: 'MARKET',
        quantity: 100,
        timeInForce: 'DAY'
      };

      const createdOrder = await adapter.createOrder(order);
      expect(createdOrder).toHaveProperty('orderId');
      expect(createdOrder.status).toBe('FILLED');
      expect(createdOrder.filledQuantity).toBe(100);
      expect(createdOrder.avgFillPrice).toBe(150.25);

      // Step 3: Wait briefly for execution to settle
      await new Promise(resolve => setTimeout(resolve, 100));

      // Step 4: Verify order appears in history
      const history = await adapter.getOrderHistory({ symbol: 'AAPL' });
      expect(history.length).toBeGreaterThan(0);
      const filledOrder = history.find(o => o.orderId === createdOrder.orderId);
      expect(filledOrder).toBeDefined();
      expect(filledOrder.status).toBe('FILLED');
    });

    test('should handle order cancellation workflow', async () => {
      await adapter.authenticate();

      // Create order
      const order = {
        symbol: 'TSLA',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 50,
        price: 200.0,
        timeInForce: 'GTC'
      };

      const createdOrder = await adapter.createOrder(order);
      expect(createdOrder.orderId).toBeDefined();

      // Cancel order (before it fills)
      const cancelled = await adapter.cancelOrder(createdOrder.orderId);
      expect(cancelled).toBe(true);
    });
  });

  describe('Integration 2: Position and Balance Management', () => {
    test('should reflect balance changes after order execution', async () => {
      await adapter.authenticate();

      // Get initial balance
      const initialBalance = await adapter.getBalance();
      expect(initialBalance.total).toBe(1000000);
      expect(initialBalance.available).toBe(4000000);

      // Simulate balance change after order
      const { IBApi } = require('@stoqey/ib');
      adapter.ib.updateAccountValue('NetLiquidation', 995000);
      adapter.ib.updateAccountValue('TotalCashValue', 495000);

      // Verify updated balance
      const updatedBalance = await adapter.getBalance();
      expect(updatedBalance.total).toBe(995000);
      expect(updatedBalance.cash).toBe(495000);
    });

    test('should track positions after order fills', async () => {
      await adapter.authenticate();

      // Add simulated position
      adapter.ib.addPosition('AAPL', 100, 145.5);
      adapter.ib.addPosition('TSLA', 50, 210.0);

      // Fetch positions
      const positions = await adapter.getPositions();
      expect(positions.length).toBe(2);

      const aaplPos = positions.find(p => p.symbol === 'AAPL');
      expect(aaplPos).toBeDefined();
      expect(aaplPos.quantity).toBe(100);
      expect(aaplPos.avgCost).toBe(145.5);

      const tslaPos = positions.find(p => p.symbol === 'TSLA');
      expect(tslaPos).toBeDefined();
      expect(tslaPos.quantity).toBe(50);
      expect(tslaPos.avgCost).toBe(210.0);
    });
  });

  describe('Integration 3: Market Data and Symbol Validation', () => {
    test('should validate symbol before placing order', async () => {
      await adapter.authenticate();

      // Valid symbol
      const aaplSupported = await adapter.isSymbolSupported('AAPL');
      expect(aaplSupported).toBe(true);

      // Invalid symbol
      const invalidSupported = await adapter.isSymbolSupported('INVALID123');
      expect(invalidSupported).toBe(false);
    });

    test('should fetch market price for valid symbols', async () => {
      await adapter.authenticate();

      const price = await adapter.getMarketPrice('AAPL');
      expect(price).toHaveProperty('bid', 149.5);
      expect(price).toHaveProperty('ask', 150.5);
      expect(price).toHaveProperty('last', 150.0);
    });
  });

  describe('Integration 4: Risk Management Workflow', () => {
    test('should create complete bracket order: entry + stop-loss + take-profit', async () => {
      await adapter.authenticate();

      // Entry order
      const entryOrder = await adapter.createOrder({
        symbol: 'AAPL',
        side: 'BUY',
        type: 'MARKET',
        quantity: 100,
        timeInForce: 'DAY'
      });
      expect(entryOrder.status).toBe('FILLED');
      expect(entryOrder.filledQuantity).toBe(100);

      // Add position for risk management
      adapter.ib.addPosition('AAPL', 100, 150.25);

      // Stop-loss order
      const stopLoss = await adapter.setStopLoss({
        symbol: 'AAPL',
        quantity: 100,
        stopPrice: 145.0,
        type: 'STOP'
      });
      expect(stopLoss).toHaveProperty('orderId');
      expect(stopLoss.symbol).toBe('AAPL');

      // Take-profit order
      const takeProfit = await adapter.setTakeProfit({
        symbol: 'AAPL',
        quantity: 100,
        limitPrice: 160.0
      });
      expect(takeProfit).toHaveProperty('orderId');
      expect(takeProfit.symbol).toBe('AAPL');
      expect(takeProfit.type).toBe('LIMIT');
    });

    test('should create trailing stop for dynamic risk management', async () => {
      await adapter.authenticate();

      const trailingStop = await adapter.setStopLoss({
        symbol: 'TSLA',
        quantity: 50,
        type: 'TRAILING_STOP',
        trailPercent: 5
      });

      expect(trailingStop).toHaveProperty('orderId');
      expect(trailingStop.type).toBe('TRAILING_STOP');
    });
  });

  describe('Integration 5: Order History and Execution Tracking', () => {
    test('should track multiple orders and filter by symbol', async () => {
      await adapter.authenticate();

      // Create multiple orders
      await adapter.createOrder({
        symbol: 'AAPL',
        side: 'BUY',
        type: 'MARKET',
        quantity: 100
      });

      await adapter.createOrder({
        symbol: 'TSLA',
        side: 'BUY',
        type: 'MARKET',
        quantity: 50
      });

      await adapter.createOrder({
        symbol: 'AAPL',
        side: 'SELL',
        type: 'LIMIT',
        quantity: 50,
        price: 155.0
      });

      // Wait for executions to settle
      await new Promise(resolve => setTimeout(resolve, 200));

      // Get all history
      const allHistory = await adapter.getOrderHistory();
      expect(allHistory.length).toBeGreaterThan(0);

      // Filter by AAPL
      const aaplHistory = await adapter.getOrderHistory({ symbol: 'AAPL' });
      expect(aaplHistory.length).toBeGreaterThan(0);
      aaplHistory.forEach(order => {
        expect(order.symbol).toBe('AAPL');
      });
    });
  });

  describe('Integration 6: Error Handling and Resilience', () => {
    test('should handle authentication failure gracefully', async () => {
      const { IBApi } = require('@stoqey/ib');
      const originalConnect = IBApi.prototype.connect;

      // Mock connection failure
      IBApi.prototype.connect = jest.fn(function () {
        setTimeout(() => {
          this.emit('error', { code: -1, message: 'Connection refused' }, {});
        }, 10);
      });

      const failAdapter = new IBKRAdapter(
        { clientId: 99, host: '127.0.0.1', port: 9999 },
        { isTestnet: true }
      );

      await expect(failAdapter.authenticate()).rejects.toThrow('Connection refused');

      // Restore
      IBApi.prototype.connect = originalConnect;
    });

    test('should auto-reconnect if connection lost during operation', async () => {
      await adapter.authenticate();
      expect(adapter.isConnected()).toBe(true);

      // Simulate disconnect
      adapter.isAuthenticated = false;
      adapter.connectionReady = false;
      expect(adapter.isConnected()).toBe(false);

      // Auto-reconnect on next operation
      const balance = await adapter.getBalance();
      expect(adapter.isConnected()).toBe(true);
      expect(balance).toBeDefined();
    });

    test('should handle invalid symbol in order creation', async () => {
      await adapter.authenticate();

      // Invalid symbol should fail validation first
      const isSupported = await adapter.isSymbolSupported('INVALID123');
      expect(isSupported).toBe(false);
    });
  });

  describe('Integration 7: Fee Calculation and Cost Analysis', () => {
    test('should provide accurate fee structure for trading decisions', async () => {
      const fees = await adapter.getFees('AAPL');

      expect(fees).toHaveProperty('maker', 0.0005);
      expect(fees).toHaveProperty('taker', 0.0005);
      expect(fees).toHaveProperty('commission', 0.0005);
      expect(fees).toHaveProperty('minimum', 1.0);
      expect(fees).toHaveProperty('maximum', 0.005);
      expect(fees).toHaveProperty('currency', 'USD');

      // Calculate expected commission for 100 shares
      const shares = 100;
      const perShareFee = fees.commission;
      const calculatedFee = Math.max(fees.minimum, shares * perShareFee);
      expect(calculatedFee).toBe(Math.max(1.0, 100 * 0.0005)); // $1 minimum
    });
  });
});
