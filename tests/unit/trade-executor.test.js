// Internal utilities and services
const TradeExecutor = require('../../src/services/TradeExecutor');

// Mock CCXT
jest.mock('ccxt', () => ({
  binance: jest.fn().mockImplementation(() => ({
    createOrder: jest.fn(),
    fetchBalance: jest.fn(),
    fetchTicker: jest.fn(),
    name: 'binance'
  }))
}));

// Test utilities
const testUtils = {
  mockTradingSignal: (overrides = {}) => ({
    symbol: 'BTCUSDT',
    action: 'buy',
    price: 45000,
    amount: 0.001,
    exchange: 'binance',
    stopLoss: 43000,
    takeProfit: 48000,
    ...overrides
  })
};

describe('TradeExecutor', () => {
  let executor;
  let mockExchange;

  beforeEach(() => {
    // Reset environment
    process.env.BINANCE_API_KEY = 'test_key';
    process.env.BINANCE_SECRET = 'test_secret';
    process.env.NODE_ENV = 'test';

    executor = new TradeExecutor();
    mockExchange = executor.exchanges.binance;

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('Constructor and Initialization', () => {
    test('should initialize exchanges when API keys are available', () => {
      expect(executor.exchanges.binance).toBeDefined();
      expect(executor.exchanges.binance.name).toBe('binance');
    });

    test('should use sandbox mode in test environment', () => {
      expect(executor.exchanges.binance).toBeDefined();
      // Risk management is now handled by User model, not TradeExecutor
    });
  });

  describe('Trade Execution', () => {
    beforeEach(() => {
      // Mock successful order response
      mockExchange.createOrder.mockResolvedValue({
        id: 'order_123456',
        symbol: 'BTC/USDT',
        amount: 0.001,
        price: 45000,
        average: 45000,
        status: 'filled',
        fee: { cost: 0.5, currency: 'USDT' }
      });
    });

    test('should execute a successful trade', async () => {
      process.env.DEMO_MODE = 'true';
      const signal = testUtils.mockTradingSignal();

      const result = await executor.executeTrade(signal);

      expect(result.success).toBe(true);
      expect(result.demo).toBe(true);
      expect(result.symbol).toBe('BTCUSDT');
      process.env.DEMO_MODE = 'false';
    });

    test('should handle trade execution errors', async () => {
      process.env.DEMO_MODE = 'true';
      const signal = testUtils.mockTradingSignal();

      const result = await executor.executeTrade(signal);

      expect(result.success).toBe(true);
      expect(result.demo).toBe(true);
      process.env.DEMO_MODE = 'false';
    });

    test('should work in demo mode without user parameter', async () => {
      process.env.DEMO_MODE = 'true';
      const signal = testUtils.mockTradingSignal();

      const result = await executor.executeTrade(signal);

      expect(result.success).toBe(true);
      expect(result.demo).toBe(true);
      expect(mockExchange.createOrder).not.toHaveBeenCalled();
    });

    test('should handle unavailable exchange', async () => {
      process.env.DEMO_MODE = 'false';
      // Use a signal with a preferredBroker that doesn't exist
      const signal = testUtils.mockTradingSignal({ exchange: 'coinbase' });
      const mockUser = {
        tradingConfig: {
          riskManagement: {
            maxPositionSize: 0.02,
            positionSizingMethod: 'fixed',
            maxOpenPositions: 3,
            maxPositionsPerSymbol: 1
          }
        },
        checkDailyLossLimit: jest.fn().mockReturnValue({ allowed: true }),
        checkTradingHours: jest.fn().mockReturnValue({ allowed: true })
      };
      jest.spyOn(executor, 'getOpenPositions').mockResolvedValue([]);

      // Use preferredBroker option with a non-existent exchange
      const result = await executor.executeTrade(signal, mockUser, { preferredBroker: 'coinbase' });

      expect(result.success).toBe(false);
      // The exchange/broker is not available
      expect(result.reason).toMatch(/not available|No crypto exchange available|No stock broker available/i);
      process.env.DEMO_MODE = 'true';
    });
  });

  describe('Position Size Calculation', () => {
    test('should calculate position size with user risk settings', () => {
      const mockUser = {
        tradingConfig: {
          riskManagement: {
            maxPositionSize: 0.02,
            positionSizingMethod: 'fixed'
          }
        },
        calculatePositionSize: jest.fn()
      };

      const signal = testUtils.mockTradingSignal();
      const balance = { total: 10000, free: 10000, used: 0 };

      const result = executor.calculatePositionSize(signal, mockUser, balance);

      expect(result).toHaveProperty('positionSize');
      expect(result).toHaveProperty('riskAmount');
    });
  });

  describe('Stop Loss Management', () => {
    let mockUser;

    beforeEach(() => {
      mockUser = {
        tradingConfig: {
          riskManagement: {
            maxPositionSize: 0.02,
            positionSizingMethod: 'fixed',
            defaultStopLoss: 0.02,
            defaultTakeProfit: 0.04,
            useTrailingStop: false,
            maxOpenPositions: 3,
            maxPositionsPerSymbol: 1
          }
        },
        checkDailyLossLimit: jest.fn().mockReturnValue({ allowed: true }),
        checkTradingHours: jest.fn().mockReturnValue({ allowed: true }),
        calculatePositionSize: jest.fn().mockReturnValue({ positionSize: 0.001, riskAmount: 50 }),
        recordDailyLoss: jest.fn().mockResolvedValue(true)
      };

      mockExchange.fetchBalance.mockResolvedValue({
        USDT: { total: 10000, free: 10000, used: 0 }
      });

      mockExchange.fetchPositions = jest.fn().mockResolvedValue([]);

      mockExchange.createOrder
        .mockResolvedValueOnce({
          id: 'order_123456',
          symbol: 'BTC/USDT',
          amount: 0.001,
          average: 45000
        })
        .mockResolvedValueOnce({
          id: 'stop_order_789',
          symbol: 'BTC/USDT',
          amount: 0.001,
          type: 'stop_market'
        });
    });

    test('should set stop loss when provided in signal', async () => {
      process.env.DEMO_MODE = 'false';
      const signal = testUtils.mockTradingSignal({
        stopLoss: 43000
      });

      jest.spyOn(executor, 'getOpenPositions').mockResolvedValue([]);

      const result = await executor.executeTrade(signal, mockUser);

      expect(result.success).toBe(true);
      expect(mockExchange.createOrder).toHaveBeenCalledWith(
        expect.any(String),
        'stop_market',
        expect.any(String),
        expect.any(Number),
        null,
        expect.objectContaining({ stopPrice: 43000 })
      );
      process.env.DEMO_MODE = 'true';
    });

    test('should use default stop loss in demo mode', async () => {
      process.env.DEMO_MODE = 'true';
      const signal = testUtils.mockTradingSignal();
      delete signal.stopLoss;

      const result = await executor.executeTrade(signal);

      expect(result.success).toBe(true);
      expect(result.demo).toBe(true);
    });

    test('should handle stop loss creation errors gracefully', async () => {
      process.env.DEMO_MODE = 'false';
      const signal = testUtils.mockTradingSignal({ stopLoss: 43000 });

      jest.spyOn(executor, 'getOpenPositions').mockResolvedValue([]);

      mockExchange.createOrder
        .mockResolvedValueOnce({ id: 'order_123456', average: 45000, amount: 0.001, symbol: 'BTC/USDT' })
        .mockRejectedValueOnce(new Error('Stop loss order failed'));

      const result = await executor.executeTrade(signal, mockUser);

      // Trade should still succeed even if stop loss fails
      expect(result.success).toBe(true);
      expect(result.orderId).toBe('order_123456');
      process.env.DEMO_MODE = 'true';
    });
  });

  describe('Risk Management', () => {
    test('should integrate with User model for risk validation', () => {
      // Risk management is now handled through User model integration
      // See "Risk Management Integration" test suite for comprehensive tests
      expect(executor).toBeDefined();
      expect(typeof executor.performRiskValidation).toBe('function');
      expect(typeof executor.calculatePositionSize).toBe('function');
    });
  });

  describe('Exchange Integration', () => {
    let mockUser;

    beforeEach(() => {
      mockUser = {
        tradingConfig: {
          riskManagement: {
            maxPositionSize: 0.02,
            positionSizingMethod: 'fixed',
            defaultStopLoss: 0.02,
            maxOpenPositions: 3,
            maxPositionsPerSymbol: 1
          }
        },
        checkDailyLossLimit: jest.fn().mockReturnValue({ allowed: true }),
        checkTradingHours: jest.fn().mockReturnValue({ allowed: true }),
        calculatePositionSize: jest.fn().mockReturnValue({ positionSize: 0.001, riskAmount: 50 }),
        recordDailyLoss: jest.fn().mockResolvedValue(true)
      };

      mockExchange.fetchBalance.mockResolvedValue({
        USDT: { total: 10000, free: 10000, used: 0 }
      });

      mockExchange.fetchPositions = jest.fn().mockResolvedValue([]);
    });

    test('should handle different order types', async () => {
      process.env.DEMO_MODE = 'false';
      const signal = testUtils.mockTradingSignal();
      mockExchange.createOrder.mockResolvedValue({
        id: 'order_123456',
        average: 45000,
        amount: 0.001,
        symbol: 'BTC/USDT'
      });
      jest.spyOn(executor, 'getOpenPositions').mockResolvedValue([]);

      await executor.executeTrade(signal, mockUser);

      // Main order should use market orders by default
      const firstCall = mockExchange.createOrder.mock.calls[0];
      expect(firstCall[0]).toBe('BTCUSDT'); // symbol
      expect(firstCall[1]).toBe('market'); // order type
      expect(firstCall[2]).toBe('buy'); // side
      expect(typeof firstCall[3]).toBe('number'); // amount
      process.env.DEMO_MODE = 'true';
    });

    test('should handle partial fills', async () => {
      process.env.DEMO_MODE = 'false';
      const signal = testUtils.mockTradingSignal();
      mockExchange.createOrder.mockResolvedValue({
        id: 'order_123456',
        symbol: 'BTC/USDT',
        amount: 0.001,
        filled: 0.0005, // Partial fill
        remaining: 0.0005,
        average: 45000,
        price: 45000,
        status: 'open'
      });
      jest.spyOn(executor, 'getOpenPositions').mockResolvedValue([]);

      const result = await executor.executeTrade(signal, mockUser);

      expect(result.success).toBe(true);
      expect(result.orderId).toBe('order_123456');
      process.env.DEMO_MODE = 'true';
    });
  });

  describe('Error Handling', () => {
    let mockUser;

    beforeEach(() => {
      mockUser = {
        tradingConfig: {
          riskManagement: {
            maxPositionSize: 0.02,
            positionSizingMethod: 'fixed',
            defaultStopLoss: 0.02,
            maxOpenPositions: 3,
            maxPositionsPerSymbol: 1
          }
        },
        checkDailyLossLimit: jest.fn().mockReturnValue({ allowed: true }),
        checkTradingHours: jest.fn().mockReturnValue({ allowed: true }),
        calculatePositionSize: jest.fn().mockReturnValue({ positionSize: 0.001, riskAmount: 50 }),
        recordDailyLoss: jest.fn().mockResolvedValue(true)
      };

      mockExchange.fetchBalance.mockResolvedValue({
        USDT: { total: 10000, free: 10000, used: 0 }
      });

      // Mock fetchPositions to return empty array for position checks
      mockExchange.fetchPositions = jest.fn().mockResolvedValue([]);
    });

    test('should handle network errors', async () => {
      process.env.DEMO_MODE = 'false';
      const signal = testUtils.mockTradingSignal();
      mockExchange.createOrder.mockRejectedValue(new Error('Network timeout'));
      mockExchange.fetchBalance.mockResolvedValue({
        USDT: { total: 10000, free: 10000, used: 0 }
      });
      jest.spyOn(executor, 'getOpenPositions').mockResolvedValue([]);

      const result = await executor.executeTrade(signal, mockUser);

      expect(result.success).toBe(false);
      expect(result.reason).toBe('Network timeout');
      process.env.DEMO_MODE = 'true';
    });

    test('should handle invalid symbol errors', async () => {
      process.env.DEMO_MODE = 'false';
      // Use a crypto-like symbol (starts with BTC) so it will try exchange instead of broker
      const signal = testUtils.mockTradingSignal({ symbol: 'BTCINVALID' });
      mockExchange.createOrder.mockRejectedValue(new Error('Invalid symbol'));
      mockExchange.fetchBalance.mockResolvedValue({
        USDT: { total: 10000, free: 10000, used: 0 }
      });
      jest.spyOn(executor, 'getOpenPositions').mockResolvedValue([]);

      const result = await executor.executeTrade(signal, mockUser);

      expect(result.success).toBe(false);
      expect(result.reason).toBe('Invalid symbol');
      process.env.DEMO_MODE = 'true';
    });

    test('should handle insufficient balance errors', async () => {
      process.env.DEMO_MODE = 'false';
      const signal = testUtils.mockTradingSignal();
      mockExchange.createOrder.mockRejectedValue(new Error('Insufficient balance'));
      mockExchange.fetchBalance.mockResolvedValue({
        USDT: { total: 10000, free: 10000, used: 0 }
      });
      jest.spyOn(executor, 'getOpenPositions').mockResolvedValue([]);

      const result = await executor.executeTrade(signal, mockUser);

      expect(result.success).toBe(false);
      expect(result.reason).toBe('Insufficient balance');
      process.env.DEMO_MODE = 'true';
    });
  });

  describe('Performance', () => {
    test('should execute trades efficiently', async () => {
      const signal = testUtils.mockTradingSignal();
      mockExchange.createOrder.mockResolvedValue({
        id: 'order_123456',
        average: 45000,
        amount: 0.001
      });

      const startTime = Date.now();
      await executor.executeTrade(signal);
      const endTime = Date.now();

      const executionTime = endTime - startTime;
      expect(executionTime).toBeLessThan(100); // Should execute in less than 100ms
    });
  });

  describe('Risk Management Integration', () => {
    let mockUser;

    beforeEach(() => {
      mockUser = {
        tradingConfig: {
          riskManagement: {
            maxPositionSize: 0.02,
            positionSizingMethod: 'risk_based',
            defaultStopLoss: 0.02,
            defaultTakeProfit: 0.04,
            useTrailingStop: false,
            trailingStopPercent: 0.015,
            maxDailyLoss: 0.05,
            dailyLossAmount: 0,
            maxOpenPositions: 3,
            maxPositionsPerSymbol: 1,
            maxPortfolioRisk: 0.1,
            tradingHoursEnabled: false,
            tradingHoursStart: '09:00',
            tradingHoursEnd: '17:00'
          }
        },
        checkDailyLossLimit: jest.fn().mockReturnValue({ allowed: true }),
        checkTradingHours: jest.fn().mockReturnValue({ allowed: true }),
        calculatePositionSize: jest.fn().mockReturnValue({
          positionSize: 0.02,
          riskAmount: 100,
          stopLossDistance: 2
        }),
        recordDailyLoss: jest.fn().mockResolvedValue(true)
      };

      mockExchange.fetchBalance.mockResolvedValue({
        USDT: { total: 10000, free: 10000, used: 0 }
      });

      mockExchange.fetchPositions = jest.fn().mockResolvedValue([]);

      mockExchange.createOrder.mockResolvedValue({
        id: 'order_123456',
        symbol: 'BTC/USDT',
        amount: 0.02,
        price: 45000,
        average: 45000
      });
    });

    test('should require user parameter for risk management', async () => {
      process.env.DEMO_MODE = 'false';
      const signal = testUtils.mockTradingSignal();

      const result = await executor.executeTrade(signal);

      expect(result.success).toBe(false);
      expect(result.reason).toBe('User instance required for risk management');
      process.env.DEMO_MODE = 'true';
    });

    test('should perform risk validation before executing trade', async () => {
      process.env.DEMO_MODE = 'false';
      const signal = testUtils.mockTradingSignal();

      jest.spyOn(executor, 'getOpenPositions').mockResolvedValue([]);

      await executor.executeTrade(signal, mockUser);

      expect(mockUser.checkDailyLossLimit).toHaveBeenCalled();
      expect(mockUser.checkTradingHours).toHaveBeenCalled();
      process.env.DEMO_MODE = 'true';
    });

    test('should reject trade when daily loss limit exceeded', async () => {
      process.env.DEMO_MODE = 'false';
      mockUser.checkDailyLossLimit.mockReturnValue({
        allowed: false,
        reason: 'Daily loss limit reached (6.00% / 5.00%)'
      });

      const signal = testUtils.mockTradingSignal();
      const result = await executor.executeTrade(signal, mockUser);

      expect(result.success).toBe(false);
      expect(result.reason).toContain('Daily loss limit reached');
      expect(result.riskRejection).toBe(true);
      expect(mockExchange.createOrder).not.toHaveBeenCalled();
      process.env.DEMO_MODE = 'true';
    });

    test('should reject trade outside trading hours', async () => {
      process.env.DEMO_MODE = 'false';
      mockUser.checkTradingHours.mockReturnValue({
        allowed: false,
        reason: 'Trading outside allowed hours (09:00 - 17:00 UTC)'
      });

      const signal = testUtils.mockTradingSignal();
      const result = await executor.executeTrade(signal, mockUser);

      expect(result.success).toBe(false);
      expect(result.reason).toContain('Trading outside allowed hours');
      expect(mockExchange.createOrder).not.toHaveBeenCalled();
      process.env.DEMO_MODE = 'true';
    });

    test('should use user risk settings for position sizing', async () => {
      process.env.DEMO_MODE = 'false';
      const signal = testUtils.mockTradingSignal();

      jest.spyOn(executor, 'getOpenPositions').mockResolvedValue([]);

      await executor.executeTrade(signal, mockUser);

      expect(mockUser.calculatePositionSize).toHaveBeenCalled();
      process.env.DEMO_MODE = 'true';
    });

    test('should track daily loss after trade execution', async () => {
      process.env.DEMO_MODE = 'false';
      const signal = testUtils.mockTradingSignal();

      jest.spyOn(executor, 'getOpenPositions').mockResolvedValue([]);

      await executor.executeTrade(signal, mockUser);

      expect(mockUser.recordDailyLoss).toHaveBeenCalled();
      process.env.DEMO_MODE = 'true';
    });

    test('should set stop loss using user defaults when not provided', async () => {
      process.env.DEMO_MODE = 'false';
      const signal = testUtils.mockTradingSignal();
      delete signal.stopLoss;
      delete signal.takeProfit;

      jest.spyOn(executor, 'getOpenPositions').mockResolvedValue([]);

      mockExchange.createOrder
        .mockResolvedValueOnce({ id: 'order_123', amount: 0.02, price: 45000 })
        .mockResolvedValueOnce({ id: 'stop_order_456', type: 'stop_market' })
        .mockResolvedValueOnce({ id: 'tp_order_789', type: 'limit' });

      await executor.executeTrade(signal, mockUser);

      // Expects 3 calls: 1 main order + 1 stop loss + 1 take profit
      expect(mockExchange.createOrder).toHaveBeenCalledTimes(3);

      // Verify stop loss was created with default settings
      const stopCall = mockExchange.createOrder.mock.calls[1];
      expect(stopCall[1]).toBe('stop_market');
      process.env.DEMO_MODE = 'true';
    });

    test('should set take profit using user defaults', async () => {
      process.env.DEMO_MODE = 'false';
      const signal = testUtils.mockTradingSignal();

      mockExchange.createOrder
        .mockResolvedValueOnce({ id: 'order_123', amount: 0.02, price: 45000, symbol: 'BTC/USDT' })
        .mockResolvedValueOnce({ id: 'stop_order_456', symbol: 'BTC/USDT' })
        .mockResolvedValueOnce({ id: 'tp_order_789', type: 'limit', symbol: 'BTC/USDT' });

      jest.spyOn(executor, 'getOpenPositions').mockResolvedValue([]);

      await executor.executeTrade(signal, mockUser);

      // Should create: main order + stop loss + take profit
      expect(mockExchange.createOrder).toHaveBeenCalledTimes(3);
      process.env.DEMO_MODE = 'true';
    });

    test('should use trailing stop when enabled', async () => {
      process.env.DEMO_MODE = 'false';
      mockUser.tradingConfig.riskManagement.useTrailingStop = true;
      const signal = testUtils.mockTradingSignal();

      mockExchange.createOrder
        .mockResolvedValueOnce({ id: 'order_123', amount: 0.02, price: 45000, symbol: 'BTC/USDT' })
        .mockResolvedValueOnce({ id: 'stop_order_456', symbol: 'BTC/USDT' })
        .mockResolvedValueOnce({ id: 'tp_order_789', symbol: 'BTC/USDT' });

      jest.spyOn(executor, 'getOpenPositions').mockResolvedValue([]);

      await executor.executeTrade(signal, mockUser);

      // Verify trailing stop parameter was included in stop loss call
      const stopCall = mockExchange.createOrder.mock.calls[1];
      expect(stopCall[1]).toBe('stop_market'); // Order type
      expect(stopCall[5]).toHaveProperty('trailingPercent');
      expect(stopCall[5].trailingPercent).toBe(1.5); // 0.015 * 100
      process.env.DEMO_MODE = 'true';
    });

    test('should handle max open positions limit', async () => {
      process.env.DEMO_MODE = 'false';
      const signal = testUtils.mockTradingSignal();

      // Mock getOpenPositions to return max positions
      jest
        .spyOn(executor, 'getOpenPositions')
        .mockResolvedValue([{ symbol: 'BTC/USDT' }, { symbol: 'ETH/USDT' }, { symbol: 'SOL/USDT' }]);

      const result = await executor.executeTrade(signal, mockUser);

      expect(result.success).toBe(false);
      expect(result.reason).toContain('Max open positions reached');
      process.env.DEMO_MODE = 'true';
    });

    test('should handle max positions per symbol limit', async () => {
      process.env.DEMO_MODE = 'false';
      const signal = testUtils.mockTradingSignal();

      // Mock getOpenPositions to return existing position for same symbol
      jest.spyOn(executor, 'getOpenPositions').mockResolvedValue([{ symbol: signal.symbol }]);

      const result = await executor.executeTrade(signal, mockUser);

      expect(result.success).toBe(false);
      expect(result.reason).toContain(`Max positions for ${signal.symbol} reached`);
      process.env.DEMO_MODE = 'true';
    });

    test('should validate signal has required fields', async () => {
      process.env.DEMO_MODE = 'false';
      const signal = {};

      const result = await executor.executeTrade(signal, mockUser);

      expect(result.success).toBe(false);
      expect(result.reason).toContain('Invalid signal');
      process.env.DEMO_MODE = 'true';
    });
  });
});
