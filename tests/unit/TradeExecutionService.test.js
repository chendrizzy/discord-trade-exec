/**
 * Unit Tests for TradeExecutionService
 * Tests trade execution, position management, and analytics integration
 */

const mongoose = require('mongoose');
const Trade = require('../../src/models/Trade');
const User = require('../../src/models/User');
const analyticsEventService = require('../../src/services/analytics/AnalyticsEventService');

// Mock dependencies
jest.mock('../../src/models/Trade');
jest.mock('../../src/models/User');
jest.mock('../../src/services/analytics/AnalyticsEventService');
jest.mock('../../src/brokers', () => ({
  BrokerFactory: {
    createBroker: jest.fn()
  }
}));

const tradeExecutionService = require('../../src/services/TradeExecutionService');

describe('TradeExecutionService', () => {
  let mockUserId;
  let mockUser;
  let mockTrade;
  let mockSignalData;
  let mockReq;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = new mongoose.Types.ObjectId();

    // Mock user object
    mockUser = {
      _id: mockUserId,
      discordUsername: 'trader#1234',
      communityId: 'community_123',
      subscription: {
        tier: 'pro',
        status: 'active'
      },
      tradingConfig: {
        brokerConfigs: new Map([
          [
            'alpaca',
            {
              isActive: true,
              apiKey: 'test_key',
              apiSecret: 'test_secret'
            }
          ]
        ]),
        riskManagement: {
          maxPositionSize: 0.1
        },
        circuitBreakerActive: false
      },
      canExecuteTrade: jest.fn().mockReturnValue({ allowed: true }),
      checkTradingHours: jest.fn().mockReturnValue({ allowed: true }),
      checkDailyLossLimit: jest.fn().mockReturnValue({ allowed: true }),
      incrementSignalUsage: jest.fn().mockResolvedValue(true),
      recordTrade: jest.fn().mockResolvedValue(true)
    };

    // Mock trade object
    mockTrade = {
      _id: new mongoose.Types.ObjectId(),
      userId: mockUserId,
      communityId: 'community_123',
      tradeId: 'alpaca_123456_abc',
      exchange: 'alpaca',
      symbol: 'AAPL',
      side: 'BUY',
      entryPrice: 150.0,
      exitPrice: null,
      quantity: 10,
      stopLoss: 145.0,
      takeProfit: 160.0,
      status: 'OPEN',
      entryTime: new Date(),
      exitTime: null,
      profitLoss: 0,
      profitLossPercentage: 0,
      signalSource: {
        providerId: 'provider_123',
        providerName: 'Test Provider',
        signalId: 'signal_456'
      },
      qualityTier: 'GOLD',
      confidenceScore: 0.85,
      smartMoneyScore: 0.75,
      rareInformationScore: 0.90,
      predictedDirection: 'UP',
      save: jest.fn().mockResolvedValue(true),
      calculatePnL: jest.fn().mockReturnValue({
        gross: 100,
        net: 95,
        percentage: 6.33,
        fees: 5
      })
    };

    // Mock signal data
    mockSignalData = {
      symbol: 'AAPL',
      side: 'BUY',
      entryPrice: 150.0,
      quantity: 10,
      stopLoss: 145.0,
      takeProfit: 160.0,
      providerId: 'provider_123',
      providerName: 'Test Provider',
      signalId: 'signal_456',
      qualityTier: 'GOLD',
      confidenceScore: 0.85,
      smartMoneyScore: 0.75,
      rareInformationScore: 0.90,
      predictedDirection: 'UP'
    };

    // Mock request object
    mockReq = {
      ip: '127.0.0.1',
      headers: {
        'user-agent': 'test-agent'
      }
    };

    // Clear active trades map
    tradeExecutionService.activeTrades.clear();
  });

  describe('executeTrade', () => {
    test('should execute trade successfully', async () => {
      User.findById = jest.fn().mockResolvedValue(mockUser);
      Trade.mockImplementation(() => mockTrade);

      const result = await tradeExecutionService.executeTrade(
        mockSignalData,
        mockUserId.toString(),
        'alpaca',
        mockReq
      );

      expect(result.success).toBe(true);
      expect(result.trade.symbol).toBe('AAPL');
      expect(result.trade.side).toBe('BUY');
      expect(result.trade.quantity).toBe(10);
      expect(result.trade.entryPrice).toBe(150.0);
      expect(result.trade.status).toBe('OPEN');
      expect(mockTrade.save).toHaveBeenCalled();
      expect(mockUser.incrementSignalUsage).toHaveBeenCalled();
    });

    test('should return error if user not found', async () => {
      User.findById = jest.fn().mockResolvedValue(null);

      const result = await tradeExecutionService.executeTrade(
        mockSignalData,
        mockUserId.toString(),
        'alpaca'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });

    test('should return error if user cannot execute trade', async () => {
      mockUser.canExecuteTrade = jest.fn().mockReturnValue({
        allowed: false,
        reason: 'Daily signal limit exceeded'
      });
      User.findById = jest.fn().mockResolvedValue(mockUser);

      const result = await tradeExecutionService.executeTrade(
        mockSignalData,
        mockUserId.toString(),
        'alpaca'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Daily signal limit exceeded');
    });

    test('should return error if outside trading hours', async () => {
      mockUser.checkTradingHours = jest.fn().mockReturnValue({
        allowed: false,
        reason: 'Outside trading hours'
      });
      User.findById = jest.fn().mockResolvedValue(mockUser);

      const result = await tradeExecutionService.executeTrade(
        mockSignalData,
        mockUserId.toString(),
        'alpaca'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Outside trading hours');
    });

    test('should return error if daily loss limit exceeded', async () => {
      mockUser.checkDailyLossLimit = jest.fn().mockReturnValue({
        allowed: false,
        reason: 'Daily loss limit exceeded'
      });
      User.findById = jest.fn().mockResolvedValue(mockUser);

      const result = await tradeExecutionService.executeTrade(
        mockSignalData,
        mockUserId.toString(),
        'alpaca'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Daily loss limit exceeded');
    });

    test('should return error if broker not configured', async () => {
      User.findById = jest.fn().mockResolvedValue(mockUser);

      const result = await tradeExecutionService.executeTrade(
        mockSignalData,
        mockUserId.toString(),
        'coinbase' // Different broker
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Broker 'coinbase' not configured or inactive");
    });

    test('should return error if broker is inactive', async () => {
      mockUser.tradingConfig.brokerConfigs.get('alpaca').isActive = false;
      User.findById = jest.fn().mockResolvedValue(mockUser);

      const result = await tradeExecutionService.executeTrade(
        mockSignalData,
        mockUserId.toString(),
        'alpaca'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Broker 'alpaca' not configured or inactive");
    });

    test('should track trade_executed analytics event', async () => {
      User.findById = jest.fn().mockResolvedValue(mockUser);
      Trade.mockImplementation(() => mockTrade);
      analyticsEventService.trackTradeExecuted.mockResolvedValue({ success: true });

      await tradeExecutionService.executeTrade(mockSignalData, mockUserId.toString(), 'alpaca', mockReq);

      expect(analyticsEventService.trackTradeExecuted).toHaveBeenCalledWith(
        mockUserId,
        {
          symbol: 'AAPL',
          side: 'BUY',
          quantity: 10,
          price: 150.0,
          broker: 'alpaca',
          profit: 0,
          signalId: 'signal_456'
        },
        mockReq
      );
    });

    test('should add trade to active trades map', async () => {
      User.findById = jest.fn().mockResolvedValue(mockUser);
      Trade.mockImplementation(() => mockTrade);

      await tradeExecutionService.executeTrade(mockSignalData, mockUserId.toString(), 'alpaca');

      const activeTrades = tradeExecutionService.activeTrades.get(mockUserId.toString());
      expect(activeTrades).toBeDefined();
      expect(activeTrades.length).toBe(1);
      expect(activeTrades[0]).toBe(mockTrade);
    });

    test('should handle errors gracefully', async () => {
      User.findById = jest.fn().mockRejectedValue(new Error('Database error'));

      const result = await tradeExecutionService.executeTrade(
        mockSignalData,
        mockUserId.toString(),
        'alpaca'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });
  });

  describe('closeTrade', () => {
    beforeEach(() => {
      // Add trade to active trades before closing
      tradeExecutionService.activeTrades.set(mockUserId.toString(), [mockTrade]);
    });

    test('should close trade successfully with profit', async () => {
      Trade.findOne = jest.fn().mockResolvedValue(mockTrade);
      User.findById = jest.fn().mockResolvedValue(mockUser);
      analyticsEventService.trackTradeExecuted.mockResolvedValue({ success: true });

      const result = await tradeExecutionService.closeTrade('alpaca_123456_abc', 155.0, mockReq);

      expect(result.success).toBe(true);
      expect(result.trade.exitPrice).toBe(155.0);
      expect(result.trade.profitLoss).toBe(95);
      expect(result.trade.profitLossPercentage).toBe(6.33);
      expect(result.trade.status).toBe('FILLED');
      expect(mockTrade.save).toHaveBeenCalled();
      expect(mockUser.recordTrade).toHaveBeenCalledWith(true, 95);
    });

    test('should close trade successfully with loss', async () => {
      mockTrade.calculatePnL.mockReturnValue({
        gross: -50,
        net: -55,
        percentage: -3.67,
        fees: 5
      });
      Trade.findOne = jest.fn().mockResolvedValue(mockTrade);
      User.findById = jest.fn().mockResolvedValue(mockUser);
      analyticsEventService.trackTradeExecuted.mockResolvedValue({ success: true });

      const result = await tradeExecutionService.closeTrade('alpaca_123456_abc', 145.0, mockReq);

      expect(result.success).toBe(true);
      expect(result.trade.profitLoss).toBe(-55);
      expect(mockUser.recordTrade).toHaveBeenCalledWith(false, -55);
    });

    test('should return error if trade not found', async () => {
      Trade.findOne = jest.fn().mockResolvedValue(null);

      const result = await tradeExecutionService.closeTrade('nonexistent_trade', 155.0);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Trade not found');
    });

    test('should return error if trade already closed', async () => {
      mockTrade.status = 'FILLED';
      Trade.findOne = jest.fn().mockResolvedValue(mockTrade);

      const result = await tradeExecutionService.closeTrade('alpaca_123456_abc', 155.0);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Trade already filled');
    });

    test('should remove trade from active trades map', async () => {
      Trade.findOne = jest.fn().mockResolvedValue(mockTrade);
      User.findById = jest.fn().mockResolvedValue(mockUser);

      await tradeExecutionService.closeTrade('alpaca_123456_abc', 155.0);

      const activeTrades = tradeExecutionService.activeTrades.get(mockUserId.toString());
      expect(activeTrades.length).toBe(0);
    });

    test('should track trade_executed analytics event with final P&L', async () => {
      Trade.findOne = jest.fn().mockResolvedValue(mockTrade);
      User.findById = jest.fn().mockResolvedValue(mockUser);
      analyticsEventService.trackTradeExecuted.mockResolvedValue({ success: true });

      await tradeExecutionService.closeTrade('alpaca_123456_abc', 155.0, mockReq);

      expect(analyticsEventService.trackTradeExecuted).toHaveBeenCalledWith(
        mockUserId,
        {
          symbol: 'AAPL',
          side: 'BUY',
          quantity: 10,
          price: 155.0,
          broker: 'alpaca',
          profit: 95,
          signalId: 'signal_456'
        },
        mockReq
      );
    });

    test('should handle errors gracefully', async () => {
      Trade.findOne = jest.fn().mockRejectedValue(new Error('Database error'));

      const result = await tradeExecutionService.closeTrade('alpaca_123456_abc', 155.0);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });
  });

  describe('getActiveTrades', () => {
    test('should return active trades for user', async () => {
      const mockTrades = [
        {
          _id: new mongoose.Types.ObjectId(),
          tradeId: 'trade_1',
          symbol: 'AAPL',
          side: 'BUY',
          quantity: 10,
          entryPrice: 150.0,
          stopLoss: 145.0,
          takeProfit: 160.0,
          entryTime: new Date('2024-01-01')
        },
        {
          _id: new mongoose.Types.ObjectId(),
          tradeId: 'trade_2',
          symbol: 'TSLA',
          side: 'SELL',
          quantity: 5,
          entryPrice: 200.0,
          stopLoss: 210.0,
          takeProfit: 180.0,
          entryTime: new Date('2024-01-02')
        }
      ];

      Trade.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockTrades)
      });

      const result = await tradeExecutionService.getActiveTrades(mockUserId.toString());

      expect(result.success).toBe(true);
      expect(result.trades.length).toBe(2);
      expect(result.trades[0].symbol).toBe('AAPL');
      expect(result.trades[1].symbol).toBe('TSLA');
      expect(Trade.find).toHaveBeenCalledWith({
        userId: mockUserId.toString(),
        status: 'OPEN'
      });
    });

    test('should return empty array if no active trades', async () => {
      Trade.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockResolvedValue([])
      });

      const result = await tradeExecutionService.getActiveTrades(mockUserId.toString());

      expect(result.success).toBe(true);
      expect(result.trades.length).toBe(0);
    });

    test('should handle errors gracefully', async () => {
      Trade.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockRejectedValue(new Error('Database error'))
      });

      const result = await tradeExecutionService.getActiveTrades(mockUserId.toString());

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });
  });

  describe('getTradeHistory', () => {
    const mockHistoryTrades = [
      {
        _id: new mongoose.Types.ObjectId(),
        tradeId: 'trade_1',
        symbol: 'AAPL',
        side: 'BUY',
        quantity: 10,
        entryPrice: 150.0,
        exitPrice: 155.0,
        profitLoss: 50,
        profitLossPercentage: 3.33,
        status: 'FILLED',
        entryTime: new Date('2024-01-01'),
        exitTime: new Date('2024-01-02')
      }
    ];

    const mockSummary = {
      totalTrades: 10,
      winningTrades: 6,
      losingTrades: 4,
      winRate: 60,
      totalProfitLoss: 500,
      avgProfitLoss: 50
    };

    test('should return trade history for 24h timeframe', async () => {
      Trade.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockHistoryTrades)
      });
      Trade.getUserSummary = jest.fn().mockResolvedValue(mockSummary);

      const result = await tradeExecutionService.getTradeHistory(mockUserId.toString(), '24h');

      expect(result.success).toBe(true);
      expect(result.trades.length).toBe(1);
      expect(result.summary).toEqual(mockSummary);
      expect(Trade.find).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserId.toString(),
          entryTime: expect.objectContaining({ $gte: expect.any(Date) })
        })
      );
    });

    test('should return trade history for 7d timeframe', async () => {
      Trade.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockHistoryTrades)
      });
      Trade.getUserSummary = jest.fn().mockResolvedValue(mockSummary);

      const result = await tradeExecutionService.getTradeHistory(mockUserId.toString(), '7d');

      expect(result.success).toBe(true);
      expect(Trade.find).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserId.toString(),
          entryTime: expect.objectContaining({ $gte: expect.any(Date) })
        })
      );
    });

    test('should return trade history for 30d timeframe', async () => {
      Trade.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockHistoryTrades)
      });
      Trade.getUserSummary = jest.fn().mockResolvedValue(mockSummary);

      const result = await tradeExecutionService.getTradeHistory(mockUserId.toString(), '30d');

      expect(result.success).toBe(true);
      expect(Trade.find).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserId.toString(),
          entryTime: expect.objectContaining({ $gte: expect.any(Date) })
        })
      );
    });

    test('should return trade history for all timeframe', async () => {
      Trade.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockResolvedValue(mockHistoryTrades)
      });
      Trade.getUserSummary = jest.fn().mockResolvedValue(mockSummary);

      const result = await tradeExecutionService.getTradeHistory(mockUserId.toString(), 'all');

      expect(result.success).toBe(true);
      expect(Trade.find).toHaveBeenCalledWith({
        userId: mockUserId.toString()
      });
    });

    test('should handle errors gracefully', async () => {
      Trade.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockRejectedValue(new Error('Database error'))
      });

      const result = await tradeExecutionService.getTradeHistory(mockUserId.toString(), '30d');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });
  });

  describe('cancelTrade', () => {
    beforeEach(() => {
      // Add trade to active trades before cancelling
      tradeExecutionService.activeTrades.set(mockUserId.toString(), [mockTrade]);
    });

    test('should cancel trade successfully', async () => {
      Trade.findOne = jest.fn().mockResolvedValue(mockTrade);

      const result = await tradeExecutionService.cancelTrade('alpaca_123456_abc');

      expect(result.success).toBe(true);
      expect(result.trade.status).toBe('CANCELLED');
      expect(mockTrade.status).toBe('CANCELLED');
      expect(mockTrade.exitTime).toBeDefined();
      expect(mockTrade.save).toHaveBeenCalled();
    });

    test('should return error if trade not found', async () => {
      Trade.findOne = jest.fn().mockResolvedValue(null);

      const result = await tradeExecutionService.cancelTrade('nonexistent_trade');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Trade not found');
    });

    test('should return error if trade is not open', async () => {
      mockTrade.status = 'FILLED';
      Trade.findOne = jest.fn().mockResolvedValue(mockTrade);

      const result = await tradeExecutionService.cancelTrade('alpaca_123456_abc');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot cancel trade with status: FILLED');
    });

    test('should remove trade from active trades map', async () => {
      Trade.findOne = jest.fn().mockResolvedValue(mockTrade);

      await tradeExecutionService.cancelTrade('alpaca_123456_abc');

      const activeTrades = tradeExecutionService.activeTrades.get(mockUserId.toString());
      expect(activeTrades.length).toBe(0);
    });

    test('should handle errors gracefully', async () => {
      Trade.findOne = jest.fn().mockRejectedValue(new Error('Database error'));

      const result = await tradeExecutionService.cancelTrade('alpaca_123456_abc');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });
  });
});
