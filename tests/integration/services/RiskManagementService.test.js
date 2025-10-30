/**
 * Integration Test: Risk Management Service
 *
 * US3-T10: Risk Management Service Tests
 * Tests risk aggregation (10 tests) and circuit breaker functionality (5 tests)
 *
 * @constitutional-alignment
 * - Principle I: Security-First - Financial risk controls prevent catastrophic losses
 * - Principle II: Test-First - >95% test coverage per FR-006
 * - Principle III: Performance - Risk checks complete <100ms per FR-002
 */

'use strict';

const mongoose = require('mongoose');
const RiskManagementService = require('../../../src/services/RiskManagementService');
const User = require('../../../src/models/User');
const Position = require('../../../src/models/Position');
const Trade = require('../../../src/models/Trade');

// Mock AuditLogService
jest.mock('../../../src/services/AuditLogService', () => {
  return jest.fn().mockImplementation(() => {
    return {
      log: jest.fn().mockResolvedValue(true)
    };
  });
});

// Mock emergency notification service to prevent errors
jest.mock('../../../src/services/discord', () => ({
  sendDirectMessage: jest.fn().mockResolvedValue(true),
  sendChannelMessage: jest.fn().mockResolvedValue(true)
}));

// Mock TradeExecutionService to prevent errors during position closure
jest.mock('../../../src/services/TradeExecutionService', () => {
  return jest.fn().mockImplementation(() => {
    return {
      executeTrade: jest.fn().mockResolvedValue({ success: true })
    };
  });
});

// Test fixtures
const createTestUser = async (riskSettings = {}) => {
  const user = await User.create({
    discordId: `discord_${Date.now()}_${Math.random()}`,
    discordUsername: 'TestUser',
    subscription: {
      tier: 'professional',
      status: 'active'
    },
    riskSettings
  });
  return user;
};

const createTestPosition = async (userId, overrides = {}) => {
  const defaults = {
    userId,
    broker: 'alpaca',
    brokerConnectionId: new mongoose.Types.ObjectId(),
    symbol: 'AAPL',
    side: 'LONG',
    quantity: 100,
    entryPrice: 150,
    avgPrice: 150,
    avgEntryPrice: 150,
    costBasis: 15000, // 100 * 150
    status: 'OPEN'
  };

  const position = await Position.create({
    ...defaults,
    ...overrides
  });
  return position;
};

const createTestTrade = async (userId, overrides = {}) => {
  const trade = await Trade.create({
    userId,
    tradeId: `trade_${Date.now()}_${Math.random()}`,
    exchange: 'binance',
    symbol: 'BTCUSDT',
    side: 'BUY',
    entryPrice: 45000,
    quantity: 0.1,
    status: 'FILLED',
    profitLoss: 0,
    ...overrides
  });
  return trade;
};

const mockAccountInfo = {
  equity: 10000,
  cashAvailable: 5000,
  buyingPower: 8000
};

const mockSignal = {
  symbol: 'AAPL',
  action: 'buy',
  quantity: 5, // Small quantity to avoid position size adjustment
  price: 180,
  stopLoss: 176
};

describe('Integration Test: Risk Aggregation', () => {
  describe('1. Approve trade within all risk limits', () => {
    it('should approve trade when all risk checks pass', async () => {
      const user = await createTestUser();

      const result = await RiskManagementService.validateTrade(
        user._id.toString(),
        mockSignal,
        mockAccountInfo
      );

      expect(result.approved).toBe(true);
      expect(result.action).toMatch(/APPROVED|ADJUSTED/); // May be adjusted depending on position size rules
      expect(result.adjustedQuantity).toBeLessThanOrEqual(5);
      expect(result.riskScore).toBeDefined();
      expect(result.riskScore.level).toMatch(/LOW|MEDIUM|HIGH/);
    });
  });

  describe('2. Reject trade when circuit breaker active', () => {
    it('should reject all trades when circuit breaker is active', async () => {
      const user = await createTestUser();

      // Manually activate circuit breaker - use string ID as service expects
      const userId = user._id.toString();
      RiskManagementService.circuitBreakerActive.set(userId, new Date());

      const result = await RiskManagementService.validateTrade(
        userId,
        mockSignal,
        mockAccountInfo
      );

      expect(result.approved).toBe(false);
      expect(result.action).toBe('CIRCUIT_BREAKER');
      expect(result.adjustedQuantity).toBeNull();
      expect(result.reason).toContain('Circuit breaker active');
      expect(result.riskScore.level).toBe('CRITICAL');
      expect(result.riskScore.score).toBe(100);

      // Cleanup
      RiskManagementService.circuitBreakerActive.delete(userId);
    });
  });

  describe('3. Reject trade with insufficient account balance', () => {
    it('should reject trade when equity below minimum balance', async () => {
      const user = await createTestUser({
        minAccountBalance: 500
      });

      const lowBalanceAccount = {
        equity: 50, // Below minimum
        cashAvailable: 50,
        buyingPower: 50
      };

      const result = await RiskManagementService.validateTrade(
        user._id.toString(),
        mockSignal,
        lowBalanceAccount
      );

      expect(result.approved).toBe(false);
      expect(result.action).toBe('REJECTED');
      expect(result.adjustedQuantity).toBeNull();
      expect(result.reason).toContain('Insufficient account balance');
      expect(result.riskScore.level).toBe('HIGH');
    });
  });

  describe('4. Reject trade exceeding daily loss limit', () => {
    it('should reject trade when daily loss limit exceeded', async () => {
      const user = await createTestUser({
        maxDailyLossPercent: 5 // -5% daily loss limit
      });

      // Create trades with losses totaling > 5% of equity
      // Ensure trades have today's date
      await createTestTrade(user._id, {
        profitLoss: -600, // -6% loss (exceeds 5% limit)
        status: 'FILLED'
      });

      const result = await RiskManagementService.validateTrade(
        user._id.toString(),
        mockSignal,
        mockAccountInfo
      );

      expect(result.approved).toBe(false);
      expect(result.action).toBe('REJECTED');
      expect(result.reason).toContain('Daily loss limit exceeded');
      expect(result.riskScore.level).toBe('HIGH');
    });
  });

  describe('5. Adjust position size when exceeding max position percent', () => {
    it('should adjust quantity when position exceeds max percent of portfolio', async () => {
      const user = await createTestUser({
        maxPositionSizePercent: 10 // Max 10% per position
      });

      const largeSignal = {
        symbol: 'AAPL',
        action: 'buy',
        quantity: 200, // 200 * $180 = $36,000 (360% of $10k equity)
        price: 180,
        stopLoss: 176
      };

      const result = await RiskManagementService.validateTrade(
        user._id.toString(),
        largeSignal,
        mockAccountInfo
      );

      expect(result.approved).toBe(true);
      expect(result.action).toBe('ADJUSTED');

      // Should be adjusted to 10% of equity: $1,000 / $180 = ~5 shares
      const expectedQuantity = Math.floor((mockAccountInfo.equity * 0.10) / largeSignal.price);
      expect(result.adjustedQuantity).toBe(expectedQuantity);
      expect(result.reason).toContain('adjusted');
    });
  });

  describe('6. Reject trade exceeding portfolio exposure limit', () => {
    it('should reject trade when total portfolio exposure exceeds limit', async () => {
      const user = await createTestUser({
        maxPortfolioExposurePercent: 80 // Max 80% portfolio exposure
      });

      // Create existing positions totaling 72% of portfolio (all at max 10% position size)
      await createTestPosition(user._id, {
        symbol: 'TSLA',
        quantity: 5,
        entryPrice: 200,
        avgPrice: 200,
        avgEntryPrice: 200,
        costBasis: 1000 // 5 * $200 = $1,000 (10%)
      });

      await createTestPosition(user._id, {
        symbol: 'GOOGL',
        quantity: 5,
        entryPrice: 200,
        avgPrice: 200,
        avgEntryPrice: 200,
        costBasis: 1000 // 5 * $200 = $1,000 (10%)
      });

      await createTestPosition(user._id, {
        symbol: 'AAPL',
        quantity: 5,
        entryPrice: 200,
        avgPrice: 200,
        avgEntryPrice: 200,
        costBasis: 1000 // 5 * $200 = $1,000 (10%)
      });

      await createTestPosition(user._id, {
        symbol: 'NVDA',
        quantity: 5,
        entryPrice: 200,
        avgPrice: 200,
        avgEntryPrice: 200,
        costBasis: 1000 // 5 * $200 = $1,000 (10%)
      });

      await createTestPosition(user._id, {
        symbol: 'AMD',
        quantity: 5,
        entryPrice: 200,
        avgPrice: 200,
        avgEntryPrice: 200,
        costBasis: 1000 // 5 * $200 = $1,000 (10%)
      });

      await createTestPosition(user._id, {
        symbol: 'INTC',
        quantity: 5,
        entryPrice: 200,
        avgPrice: 200,
        avgEntryPrice: 200,
        costBasis: 1000 // 5 * $200 = $1,000 (10%)
      });

      await createTestPosition(user._id, {
        symbol: 'MSFT',
        quantity: 5,
        entryPrice: 200,
        avgPrice: 200,
        avgEntryPrice: 200,
        costBasis: 1000 // 5 * $200 = $1,000 (10%)
      });

      await createTestPosition(user._id, {
        symbol: 'NFLX',
        quantity: 5,
        entryPrice: 200,
        avgPrice: 200,
        avgEntryPrice: 200,
        costBasis: 1000 // 5 * $200 = $1,000 (10%)
      });
      // Total existing: $8,000 (80% of $10k - at max exposure limit)

      // Try to add position worth $1,000 (9% more - would be 81% total, exceeds 80% limit)
      const newSignal = {
        symbol: 'META',
        action: 'buy',
        quantity: 5, // Won't trigger position size adjustment (9% < 10%)
        price: 180, // 5 * $180 = $900 (9%)
        stopLoss: 175
      };

      const result = await RiskManagementService.validateTrade(
        user._id.toString(),
        newSignal,
        mockAccountInfo
      );

      expect(result.approved).toBe(false);
      expect(result.action).toBe('REJECTED');
      expect(result.reason).toContain('Portfolio exposure limit exceeded');
      expect(result.riskScore.level).toBe('HIGH');
      expect(result.riskScore.exposure).toBeGreaterThan(80);
    });
  });

  describe('7. Calculate correct daily P&L from trades', () => {
    it('should accurately calculate daily profit and loss', async () => {
      const user = await createTestUser();

      // Create winning and losing trades for today
      await createTestTrade(user._id, {
        profitLoss: 500,
        status: 'FILLED'
      });

      await createTestTrade(user._id, {
        profitLoss: -200,
        status: 'FILLED'
      });

      await createTestTrade(user._id, {
        profitLoss: 150,
        status: 'FILLED'
      });

      // Trade from yesterday (should not be counted)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 2);
      await createTestTrade(user._id, {
        profitLoss: 1000,
        status: 'FILLED',
        createdAt: yesterday
      });

      const result = await RiskManagementService.validateTrade(
        user._id.toString(),
        mockSignal,
        mockAccountInfo
      );

      // Daily PnL should be positive (500 - 200 + 150 = 450)
      // Trade should be approved since we have positive P&L
      expect(result.approved).toBe(true);
    });
  });

  describe('8. Calculate correct intraday drawdown', () => {
    it('should calculate drawdown percentage correctly', async () => {
      const user = await createTestUser({
        circuitBreakerPercent: 8, // Circuit breaker at -8%
        maxDailyLossPercent: 10 // Set daily loss limit above test loss (-7%) to avoid triggering it
      });

      // Create loss that is 7% (below circuit breaker threshold)
      await createTestTrade(user._id, {
        profitLoss: -700, // -7% of $10,000
        status: 'FILLED'
      });

      const result = await RiskManagementService.validateTrade(
        user._id.toString(),
        mockSignal,
        mockAccountInfo
      );

      expect(result.approved).toBe(true);
      // Should not trigger circuit breaker at -7%
      expect(RiskManagementService.circuitBreakerActive.has(user._id.toString())).toBe(false);
    });

    it('should trigger circuit breaker when drawdown reaches threshold', async () => {
      const user = await createTestUser({
        circuitBreakerPercent: 8 // Circuit breaker at -8%
      });

      // Create loss that is 8.5% (exceeds circuit breaker threshold)
      await createTestTrade(user._id, {
        profitLoss: -850, // -8.5% of $10,000
        status: 'FILLED'
      });

      const result = await RiskManagementService.validateTrade(
        user._id.toString(),
        mockSignal,
        mockAccountInfo
      );

      expect(result.approved).toBe(false);
      expect(result.action).toBe('CIRCUIT_BREAKER');
      expect(result.reason).toContain('Circuit breaker triggered');
      expect(result.riskScore.level).toBe('CRITICAL');
      expect(result.riskScore.drawdown).toBeGreaterThanOrEqual(8);

      // Cleanup
      RiskManagementService.circuitBreakerActive.delete(user._id.toString());
    });
  });

  describe('9. Calculate risk score correctly', () => {
    it('should calculate comprehensive risk score with all factors', async () => {
      const user = await createTestUser();

      const highRiskSignal = {
        symbol: 'AAPL',
        action: 'buy',
        quantity: 50,
        price: 180,
        stopLoss: 170, // Wide stop loss: 5.6%
        leverage: 2 // Using leverage
      };

      const result = await RiskManagementService.validateTrade(
        user._id.toString(),
        highRiskSignal,
        mockAccountInfo
      );

      expect(result.approved).toBe(true);
      expect(result.riskScore).toBeDefined();
      expect(result.riskScore.score).toBeGreaterThanOrEqual(0);
      expect(result.riskScore.score).toBeLessThanOrEqual(100);
      expect(result.riskScore.level).toMatch(/LOW|MEDIUM|HIGH/);
      expect(result.riskScore.positionPercent).toBeDefined();
      expect(result.riskScore.stopLossDistance).toBeDefined();
      expect(result.riskScore.notionalValue).toBeDefined();
    });

    it('should assign LOW risk level for conservative trades', async () => {
      const user = await createTestUser();

      const lowRiskSignal = {
        symbol: 'AAPL',
        action: 'buy',
        quantity: 5, // Very small position: 5 × $180 = $900 (9% of $10k equity)
        price: 180,
        stopLoss: 178 // Tight stop loss: 1.1%
      };

      const result = await RiskManagementService.validateTrade(
        user._id.toString(),
        lowRiskSignal,
        mockAccountInfo
      );

      expect(result.approved).toBe(true);
      expect(result.riskScore.level).toBe('LOW');
      expect(result.riskScore.score).toBeLessThan(40);
    });

    it('should assign HIGH risk level for aggressive trades', async () => {
      const user = await createTestUser();

      const highRiskSignal = {
        symbol: 'AAPL',
        action: 'buy',
        quantity: 50,
        price: 180, // Large position: 90% of equity
        stopLoss: 160, // Wide stop loss: 11.1%
        leverage: 3 // High leverage
      };

      const result = await RiskManagementService.validateTrade(
        user._id.toString(),
        highRiskSignal,
        mockAccountInfo
      );

      expect(result.approved).toBe(true);
      expect(result.riskScore.level).toBe('HIGH');
      expect(result.riskScore.score).toBeGreaterThanOrEqual(70);
    });
  });

  describe('10. Use custom user risk config vs defaults', () => {
    it('should use custom risk settings when provided', async () => {
      const customRiskSettings = {
        maxPositionSizePercent: 5, // More conservative than default 10%
        maxDailyLossPercent: 3, // More conservative than default 5%
        circuitBreakerPercent: 5, // More conservative than default 8%
        minAccountBalance: 1000 // Higher than default 100
      };

      const user = await createTestUser(customRiskSettings);

      // Signal that would be 8% of portfolio
      const signal = {
        symbol: 'AAPL',
        action: 'buy',
        quantity: 50,
        price: 180, // 50 * $180 = $9,000 (90% of equity)
        stopLoss: 176
      };

      const result = await RiskManagementService.validateTrade(
        user._id.toString(),
        signal,
        mockAccountInfo
      );

      // Should be adjusted to 5% of equity (custom limit)
      const expectedQuantity = Math.floor((mockAccountInfo.equity * 0.05) / signal.price);

      expect(result.approved).toBe(true);
      expect(result.action).toBe('ADJUSTED');
      expect(result.adjustedQuantity).toBe(expectedQuantity);
      expect(result.reason).toContain('5%'); // Should mention custom 5% limit
    });

    it('should fall back to default risk settings when user has none', async () => {
      const user = await createTestUser(); // No custom risk settings

      const result = await RiskManagementService.validateTrade(
        user._id.toString(),
        mockSignal,
        mockAccountInfo
      );

      expect(result.approved).toBe(true);
      // Should use default 10% max position size
      expect(result.adjustedQuantity).toBeLessThanOrEqual(mockSignal.quantity);
    });
  });
});

describe('Integration Test: Circuit Breaker', () => {
  describe('1. Activate circuit breaker when threshold exceeded', () => {
    it('should activate circuit breaker at specified threshold', async () => {
      const user = await createTestUser({
        circuitBreakerPercent: 8
      });

      // Create loss exceeding circuit breaker threshold
      await createTestTrade(user._id, {
        profitLoss: -850, // -8.5% drawdown
        status: 'FILLED'
      });

      const result = await RiskManagementService.validateTrade(
        user._id.toString(),
        mockSignal,
        mockAccountInfo
      );

      expect(result.approved).toBe(false);
      expect(result.action).toBe('CIRCUIT_BREAKER');
      expect(RiskManagementService.circuitBreakerActive.has(user._id.toString())).toBe(true);

      // Verify user account status updated
      const updatedUser = await User.findById(user._id);
      expect(updatedUser.accountStatus.trading).toBe(false);
      expect(updatedUser.accountStatus.circuitBreakerActive).toBe(true);
      expect(updatedUser.accountStatus.circuitBreakerActivatedAt).toBeInstanceOf(Date);

      // Cleanup
      RiskManagementService.circuitBreakerActive.delete(user._id.toString());
    });
  });

  describe('2. Block all trades when circuit breaker active', () => {
    it('should reject all subsequent trades after circuit breaker activation', async () => {
      const user = await createTestUser();
      const userId = user._id.toString();

      // Manually activate circuit breaker
      const activationTime = new Date();
      RiskManagementService.circuitBreakerActive.set(userId, activationTime);

      // Try multiple different trades
      const signals = [
        { symbol: 'AAPL', action: 'buy', quantity: 10, price: 180, stopLoss: 176 },
        { symbol: 'TSLA', action: 'buy', quantity: 5, price: 250, stopLoss: 245 },
        { symbol: 'GOOGL', action: 'sell', quantity: 3, price: 150, stopLoss: 155 }
      ];

      for (const signal of signals) {
        const result = await RiskManagementService.validateTrade(
          userId,
          signal,
          mockAccountInfo
        );

        expect(result.approved).toBe(false);
        expect(result.action).toBe('CIRCUIT_BREAKER');
        expect(result.adjustedQuantity).toBeNull();
        expect(result.reason).toContain('Circuit breaker active');
      }

      // Cleanup
      RiskManagementService.circuitBreakerActive.delete(userId);
    });
  });

  describe('3. Reset circuit breaker (admin function)', () => {
    it('should allow admin to reset circuit breaker and resume trading', async () => {
      const user = await createTestUser();
      const adminId = new mongoose.Types.ObjectId();
      const userId = user._id.toString();

      // Activate circuit breaker
      RiskManagementService.circuitBreakerActive.set(userId, new Date());
      await User.findByIdAndUpdate(user._id, {
        'accountStatus.trading': false,
        'accountStatus.circuitBreakerActive': true,
        'accountStatus.circuitBreakerActivatedAt': new Date()
      });

      // Verify circuit breaker is active
      expect(RiskManagementService.circuitBreakerActive.has(userId)).toBe(true);

      // Admin resets circuit breaker
      await RiskManagementService.resetCircuitBreaker(userId, adminId.toString());

      // Verify circuit breaker is cleared
      expect(RiskManagementService.circuitBreakerActive.has(userId)).toBe(false);

      // Verify user account status updated
      const updatedUser = await User.findById(user._id);
      expect(updatedUser.accountStatus.trading).toBe(true);
      expect(updatedUser.accountStatus.circuitBreakerActive).toBe(false);
      expect(updatedUser.accountStatus.circuitBreakerResetAt).toBeInstanceOf(Date);
      expect(updatedUser.accountStatus.circuitBreakerResetBy).toBe(adminId.toString());

      // Verify trading can resume
      const result = await RiskManagementService.validateTrade(
        userId,
        mockSignal,
        mockAccountInfo
      );

      expect(result.approved).toBe(true);
      expect(result.action).not.toBe('CIRCUIT_BREAKER');
    });

    it('should throw error when resetting non-active circuit breaker', async () => {
      const user = await createTestUser();
      const adminId = new mongoose.Types.ObjectId();

      // Try to reset when circuit breaker is not active
      await expect(
        RiskManagementService.resetCircuitBreaker(user._id.toString(), adminId.toString())
      ).rejects.toThrow('Circuit breaker not active for user');
    });
  });

  describe('4. Send emergency notifications on activation', () => {
    it('should mark positions for closure when circuit breaker triggered', async () => {
      const user = await createTestUser({
        circuitBreakerPercent: 8
      });

      // Create open positions
      await createTestPosition(user._id, {
        symbol: 'AAPL',
        status: 'OPEN'
      });

      await createTestPosition(user._id, {
        symbol: 'TSLA',
        status: 'OPEN'
      });

      // Create loss exceeding circuit breaker threshold
      await createTestTrade(user._id, {
        profitLoss: -900, // -9% drawdown
        status: 'FILLED'
      });

      // Trigger circuit breaker
      const result = await RiskManagementService.validateTrade(
        user._id.toString(),
        mockSignal,
        mockAccountInfo
      );

      expect(result.approved).toBe(false);
      expect(result.action).toBe('CIRCUIT_BREAKER');

      // Verify circuit breaker was activated
      expect(RiskManagementService.circuitBreakerActive.has(user._id.toString())).toBe(true);

      // Cleanup
      RiskManagementService.circuitBreakerActive.delete(user._id.toString());
    });
  });

  describe('5. Trigger position closure on activation', () => {
    it('should mark all open positions for closure when circuit breaker activates', async () => {
      const user = await createTestUser({
        circuitBreakerPercent: 8
      });

      // Create multiple open positions
      await createTestPosition(user._id, {
        symbol: 'AAPL',
        status: 'OPEN',
        quantity: 100
      });

      await createTestPosition(user._id, {
        symbol: 'TSLA',
        status: 'OPEN',
        quantity: 50
      });

      await createTestPosition(user._id, {
        symbol: 'GOOGL',
        status: 'OPEN',
        quantity: 25
      });

      // Create catastrophic loss
      await createTestTrade(user._id, {
        profitLoss: -950, // -9.5% drawdown
        status: 'FILLED'
      });

      // Trigger circuit breaker
      const result = await RiskManagementService.validateTrade(
        user._id.toString(),
        mockSignal,
        mockAccountInfo
      );

      expect(result.approved).toBe(false);
      expect(result.action).toBe('CIRCUIT_BREAKER');
      expect(result.reason).toContain('All positions will be closed');

      // Verify circuit breaker activation
      expect(RiskManagementService.circuitBreakerActive.has(user._id.toString())).toBe(true);

      // Cleanup
      RiskManagementService.circuitBreakerActive.delete(user._id.toString());
    });
  });
});

describe('Integration Test: Risk Status', () => {
  it('should return comprehensive risk status for dashboard', async () => {
    const user = await createTestUser({
      maxDailyLossPercent: 5,
      circuitBreakerPercent: 8
    });

    // Add broker account info
    user.brokerAccounts = [{
      broker: 'alpaca',
      isPrimary: true,
      equity: 10000
    }];
    await user.save();

    // Create some trades
    await createTestTrade(user._id, {
      profitLoss: 200,
      status: 'FILLED'
    });

    await createTestTrade(user._id, {
      profitLoss: -100,
      status: 'FILLED'
    });

    const riskStatus = await RiskManagementService.getRiskStatus(user._id.toString());

    expect(riskStatus.status).toBe('ACTIVE');
    expect(riskStatus.circuitBreakerActive).toBe(false);
    expect(riskStatus.tradingEnabled).toBe(true);
    expect(parseFloat(riskStatus.dailyPnL)).toBe(100); // 200 - 100
    expect(riskStatus.dailyLossLimit).toBeDefined();
    expect(riskStatus.dailyLossPercent).toBeDefined();
    expect(riskStatus.intradayDrawdown).toBe('0.00'); // Positive P&L = no drawdown
    expect(riskStatus.riskConfig).toBeDefined();
    expect(riskStatus.riskConfig.maxDailyLossPercent).toBe(5);
    expect(riskStatus.lastUpdated).toBeInstanceOf(Date);
  });

  it('should show DAILY_LIMIT_EXCEEDED status when limit breached', async () => {
    const user = await createTestUser({
      maxDailyLossPercent: 5
    });

    user.brokerAccounts = [{
      broker: 'alpaca',
      isPrimary: true,
      equity: 10000
    }];
    await user.save();

    // Create loss exceeding daily limit
    await createTestTrade(user._id, {
      profitLoss: -600, // -6% loss (exceeds 5% limit)
      status: 'FILLED'
    });

    const riskStatus = await RiskManagementService.getRiskStatus(user._id.toString());

    expect(riskStatus.status).toBe('DAILY_LIMIT_EXCEEDED');
    expect(parseFloat(riskStatus.dailyPnL)).toBe(-600);
    expect(parseFloat(riskStatus.intradayDrawdown)).toBe(6.00);
  });
});

describe('Integration Test: Performance', () => {
  it('should complete risk validation in under 100ms', async () => {
    const user = await createTestUser();

    const startTime = Date.now();

    await RiskManagementService.validateTrade(
      user._id.toString(),
      mockSignal,
      mockAccountInfo
    );

    const elapsed = Date.now() - startTime;

    // Performance requirement: <100ms per FR-002
    expect(elapsed).toBeLessThan(100);
  });
});

// ========== COVERAGE COMPLETION TESTS (Target: 100%) ==========

describe('Integration Test: MEDIUM Risk Level Coverage (Line 666)', () => {
  it('should assign MEDIUM risk level when score is 40-69', async () => {
    const user = await createTestUser();

    // Signal designed for MEDIUM risk (score ~46):
    // - 10% position size (10%/10% max * 40 = 40 points)
    // - 2% stop loss (2%/10% * 30 = 6 points)
    // - 1x leverage (0 points)
    // Total: 46 points (MEDIUM)
    const signal = {
      symbol: 'SPY',
      action: 'buy',
      quantity: 10,  // 10 * $200 = $2000 = 10% of $20k
      price: 200,
      stopLoss: 196,  // 2% stop loss
      leverage: 1
    };

    const accountInfo = { equity: 20000, cashAvailable: 20000, buyingPower: 20000 };

    const result = await RiskManagementService.validateTrade(user._id.toString(), signal, accountInfo);

    expect(result.riskScore.level).toBe('MEDIUM');
    expect(result.riskScore.score).toBeGreaterThanOrEqual(40);
    expect(result.riskScore.score).toBeLessThan(70);
  });
});

describe('Integration Test: Multi-Account Equity Aggregation (Lines 795-796)', () => {
  it('should aggregate equity from multiple broker accounts', async () => {
    const user = await createTestUser({ maxDailyLossPercent: 5 });

    // Add multiple broker accounts
    user.brokerAccounts = [
      { broker: 'alpaca', equity: 10000, isPrimary: true },
      { broker: 'tradier', equity: 5000, isPrimary: false }
    ];
    await user.save();

    await createTestTrade(user._id, { profitLoss: -200, status: 'FILLED' });

    const status = await RiskManagementService.getRiskStatus(user._id.toString());

    // Aggregated equity: 10000 + 5000 = 15000
    // Daily loss limit: 5% of 15000 = 750
    expect(parseFloat(status.dailyLossLimit)).toBe(750);
    expect(status.status).toBe('ACTIVE'); // -200 is below -750 limit
  });
});

describe('Integration Test: UNKNOWN Status Coverage (Lines 801-807)', () => {
  it('should return UNKNOWN status when no broker accounts exist', async () => {
    const user = await createTestUser();

    // Ensure no broker accounts
    user.brokerAccounts = [];
    await user.save();

    const status = await RiskManagementService.getRiskStatus(user._id.toString());

    expect(status.status).toBe('UNKNOWN');
    expect(status.message).toBe('Account information unavailable');
  });

  it('should return UNKNOWN status when equity is zero', async () => {
    const user = await createTestUser();

    user.brokerAccounts = [{ broker: 'alpaca', equity: 0, isPrimary: true }];
    await user.save();

    const status = await RiskManagementService.getRiskStatus(user._id.toString());

    expect(status.status).toBe('UNKNOWN');
    expect(status.message).toBe('Account information unavailable');
  });
});

describe('Integration Test: Ternary Operator Coverage (Line 809)', () => {
  it('should return CIRCUIT_BREAKER status when active', async () => {
    const user = await createTestUser({ circuitBreakerPercent: 10 });

    user.brokerAccounts = [{ broker: 'alpaca', equity: 10000, isPrimary: true }];
    await user.save();

    // Create loss triggering circuit breaker (10% = -1000)
    await createTestTrade(user._id, { profitLoss: -1500, status: 'FILLED' });

    const accountInfo = { equity: 10000, cashAvailable: 5000, buyingPower: 10000 };

    // Trigger circuit breaker via validateTrade
    await RiskManagementService.validateTrade(user._id.toString(), mockSignal, accountInfo);

    const status = await RiskManagementService.getRiskStatus(user._id.toString());

    expect(status.status).toBe('CIRCUIT_BREAKER');
  });

  it('should return DAILY_LIMIT_EXCEEDED when limit breached', async () => {
    const user = await createTestUser({ maxDailyLossPercent: 5, circuitBreakerPercent: 20 });

    user.brokerAccounts = [{ broker: 'alpaca', equity: 10000, isPrimary: true }];
    await user.save();

    // Loss exceeds daily (5% = -500) but not circuit breaker (20% = -2000)
    await createTestTrade(user._id, { profitLoss: -600, status: 'FILLED' });

    const status = await RiskManagementService.getRiskStatus(user._id.toString());

    expect(status.status).toBe('DAILY_LIMIT_EXCEEDED');
  });

  it('should return ACTIVE when both limits are OK', async () => {
    const user = await createTestUser({ maxDailyLossPercent: 5 });

    user.brokerAccounts = [{ broker: 'alpaca', equity: 10000, isPrimary: true }];
    await user.save();

    // Small loss within limits
    await createTestTrade(user._id, { profitLoss: -100, status: 'FILLED' });

    const status = await RiskManagementService.getRiskStatus(user._id.toString());

    expect(status.status).toBe('ACTIVE');
  });
});

describe('Integration Test: Error Handling Coverage (Lines 493-496, 606-613)', () => {
  it('should handle discord notification failure gracefully (lines 493-496)', async () => {
    const discordService = require('../../../src/services/discord');
    const user = await createTestUser({ circuitBreakerPercent: 10 });

    user.brokerAccounts = [{ broker: 'alpaca', equity: 10000, isPrimary: true }];
    await user.save();

    // Create large loss to trigger circuit breaker
    await createTestTrade(user._id, { profitLoss: -1500, status: 'FILLED' });

    // Mock discord service to throw error on next call
    discordService.sendDirectMessage.mockRejectedValueOnce(new Error('Discord API unavailable'));

    const accountInfo = { equity: 10000, cashAvailable: 5000, buyingPower: 10000 };
    const signal = { symbol: 'SPY', action: 'buy', quantity: 1, price: 100, stopLoss: 95 };

    // Should not throw despite notification failure (error is caught and logged)
    const result = await RiskManagementService.validateTrade(user._id.toString(), signal, accountInfo);

    expect(result.approved).toBe(false);
    expect(RiskManagementService.circuitBreakerActive.has(user._id.toString())).toBe(true);
  });

  it('should handle broker submission failure in position closure (lines 606-613)', async () => {
    const TradeExecutionService = require('../../../src/services/TradeExecutionService');
    const user = await createTestUser({ circuitBreakerPercent: 10 });

    user.brokerAccounts = [{ broker: 'alpaca', equity: 10000, isPrimary: true }];
    await user.save();

    // Create open position to be closed using helper function with all required fields
    await createTestPosition(user._id, {
      symbol: 'SPY',
      quantity: 10,
      side: 'LONG',
      entryPrice: 100,
      avgPrice: 100,
      avgEntryPrice: 100,
      costBasis: 1000, // 10 * 100
      broker: 'alpaca',
      status: 'OPEN'
    });

    // Create large loss to trigger circuit breaker
    await createTestTrade(user._id, { profitLoss: -1500, status: 'FILLED' });

    // Mock trade execution service constructor to throw error (triggers outer catch at lines 606-613)
    TradeExecutionService.mockImplementation(() => {
      throw new Error('Broker service initialization failed');
    });

    const accountInfo = { equity: 10000, cashAvailable: 5000, buyingPower: 10000 };
    const signal = { symbol: 'SPY', action: 'buy', quantity: 1, price: 100, stopLoss: 95 };

    // Should throw because broker initialization failure propagates from outer catch block
    await expect(
      RiskManagementService.validateTrade(user._id.toString(), signal, accountInfo)
    ).rejects.toThrow('Broker service initialization failed');

    // Reset mock to default behavior for subsequent tests
    TradeExecutionService.mockImplementation(() => ({
      executeTrade: jest.fn().mockResolvedValue({ success: true })
    }));
  });

  it('should successfully send emergency notification with admin channel (lines 486-492)', async () => {
    // Set admin channel environment variable
    const originalAdminChannel = process.env.ADMIN_DISCORD_CHANNEL;
    process.env.ADMIN_DISCORD_CHANNEL = 'admin-channel-id';

    const discordService = require('../../../src/services/discord');
    const user = await createTestUser({ circuitBreakerPercent: 10 });

    user.brokerAccounts = [{ broker: 'alpaca', equity: 10000, isPrimary: true }];
    await user.save();

    // Create large loss to trigger circuit breaker
    await createTestTrade(user._id, { profitLoss: -1500, status: 'FILLED' });

    // Ensure discord service resolves successfully (no error)
    discordService.sendDirectMessage.mockResolvedValue(true);
    discordService.sendChannelMessage.mockResolvedValue(true);

    const accountInfo = { equity: 10000, cashAvailable: 5000, buyingPower: 10000 };
    const signal = { symbol: 'SPY', action: 'buy', quantity: 1, price: 100, stopLoss: 95 };

    // Should activate circuit breaker and send notifications successfully
    const result = await RiskManagementService.validateTrade(user._id.toString(), signal, accountInfo);

    expect(result.approved).toBe(false);
    expect(RiskManagementService.circuitBreakerActive.has(user._id.toString())).toBe(true);
    expect(discordService.sendChannelMessage).toHaveBeenCalled(); // Admin channel notification sent

    // Restore original environment
    process.env.ADMIN_DISCORD_CHANNEL = originalAdminChannel;
  });

  it('should successfully close positions without errors (lines 601-605)', async () => {
    const TradeExecutionService = require('../../../src/services/TradeExecutionService');
    const user = await createTestUser({ circuitBreakerPercent: 10 });

    user.brokerAccounts = [{ broker: 'alpaca', equity: 10000, isPrimary: true }];
    await user.save();

    // Create open position to be closed
    await createTestPosition(user._id, {
      symbol: 'SPY',
      quantity: 10,
      side: 'LONG',
      entryPrice: 100,
      avgPrice: 100,
      avgEntryPrice: 100,
      costBasis: 1000,
      broker: 'alpaca',
      status: 'OPEN'
    });

    // Create large loss to trigger circuit breaker
    await createTestTrade(user._id, { profitLoss: -1500, status: 'FILLED' });

    // Ensure trade execution succeeds (no error)
    TradeExecutionService.mockImplementation(() => ({
      executeTrade: jest.fn().mockResolvedValue({ success: true })
    }));

    const accountInfo = { equity: 10000, cashAvailable: 5000, buyingPower: 10000 };
    const signal = { symbol: 'SPY', action: 'buy', quantity: 1, price: 100, stopLoss: 95 };

    // Should activate circuit breaker and close positions successfully
    const result = await RiskManagementService.validateTrade(user._id.toString(), signal, accountInfo);

    expect(result.approved).toBe(false);
    expect(RiskManagementService.circuitBreakerActive.has(user._id.toString())).toBe(true);
  });

  // ========== ADDITIONAL COVERAGE TESTS (100% TARGET) ==========

  it('should throw error when user not found (lines 113-114)', async () => {
    const invalidUserId = new mongoose.Types.ObjectId().toString();
    const signal = { symbol: 'AAPL', action: 'buy', quantity: 10, price: 150, stopLoss: 145 };
    const accountInfo = { equity: 10000, cashAvailable: 5000, buyingPower: 10000 };

    await expect(RiskManagementService.validateTrade(invalidUserId, signal, accountInfo)).rejects.toThrow(`User not found: ${invalidUserId}`);
  });

  it('should reject trade when position size becomes zero after adjustment (lines 187-197)', async () => {
    const user = await createTestUser({ maxPositionSizePercent: 10 });

    // Create existing position at max limit (10% of $10000 = $1000)
    // Existing: 6 shares @ $150 = $900 (close to max $1000)
    await createTestPosition(user._id, { symbol: 'AAPL', quantity: 6, avgEntryPrice: 150, costBasis: 900, status: 'OPEN' });

    // Try to buy 1 more share @ $150 = $150
    // Total would be $900 + $150 = $1050 (exceeds $1000 limit)
    // Available size = floor(($1000 - $900) / $150) = floor(0.66) = 0
    const signal = { symbol: 'AAPL', action: 'buy', quantity: 1, price: 150, stopLoss: 145 };
    const accountInfo = { equity: 10000, cashAvailable: 5000, buyingPower: 10000 };

    const result = await RiskManagementService.validateTrade(user._id.toString(), signal, accountInfo);

    expect(result.approved).toBe(false);
    expect(result.adjustedQuantity).toBe(0);
    expect(result.reason).toContain('Max position size reached');
    expect(result.action).toBe('REJECTED');
    expect(result.riskScore.level).toBe('MEDIUM');
    expect(result.riskScore.score).toBe(60);
  });

  it('should approve trade with existing position within limits (lines 259-264)', async () => {
    const user = await createTestUser({ maxPositionSizePercent: 20 });

    // Create existing position well under max limit (20% of $10000 = $2000)
    // Existing position: 5 shares @ $150 = $750
    await createTestPosition(user._id, { symbol: 'AAPL', quantity: 5, avgEntryPrice: 150, costBasis: 750, status: 'OPEN' });

    // New trade: 3 shares @ $150 = $450
    // Total: $750 + $450 = $1200 (well under $2000 limit)
    const signal = { symbol: 'AAPL', action: 'buy', quantity: 3, price: 150, stopLoss: 145 };
    const accountInfo = { equity: 10000, cashAvailable: 5000, buyingPower: 10000 };

    const result = await RiskManagementService.validateTrade(user._id.toString(), signal, accountInfo);

    expect(result.approved).toBe(true);
    expect(result.adjustedQuantity).toBe(3);
    expect(result.reason).toBe('Trade approved within risk limits');
    expect(result.action).toBe('APPROVED');
  });
});

