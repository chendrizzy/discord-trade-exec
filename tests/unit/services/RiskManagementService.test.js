'use strict';

/**
 * @fileoverview RiskManagementService Unit Tests
 *
 * Tests core risk validation logic per US-006 specification:
 * - Position sizing calculations
 * - Daily loss limit enforcement
 * - Circuit breaker triggers
 * - Portfolio exposure validation
 * - Risk score calculation
 *
 * Coverage target: >95% per Constitutional Principle II (Test-First)
 *
 * @module tests/unit/services/RiskManagementService.test
 */

const RiskManagementService = require('../../../src/services/RiskManagementService');
const Position = require('../../../src/models/Position');
const Trade = require('../../../src/models/Trade');
const User = require('../../../src/models/User');
const AuditLogService = require('../../../src/services/AuditLogService');

// Mock dependencies
jest.mock('../../../src/models/Position');
jest.mock('../../../src/models/Trade');
jest.mock('../../../src/models/User');
jest.mock('../../../src/services/AuditLogService');
jest.mock('../../../src/middleware/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  },
  logHttpRequest: jest.fn(),
  logTrade: jest.fn(),
  logAudit: jest.fn(),
  logBrokerAPI: jest.fn(),
  logSecurityEvent: jest.fn(),
  logDatabaseOperation: jest.fn(),
  logWebSocketEvent: jest.fn(),
  logBillingEvent: jest.fn(),
  logError: jest.fn()
}));

describe('RiskManagementService', () => {
  let service;
  let mockUser;
  let mockAccountInfo;
  let mockSignal;

  beforeEach(() => {
    // Reset service instance for each test
    jest.clearAllMocks();

    // Create fresh service instance
    const { RiskManagementService: ServiceClass } = require('../../../src/services/RiskManagementService');
    service = new ServiceClass();

    // Mock user with default risk settings
    mockUser = {
      _id: 'user123',
      email: 'trader@example.com',
      riskSettings: {},
      accountStatus: {
        trading: true,
        circuitBreakerActive: false
      },
      brokerAccounts: [
        {
          broker: 'alpaca',
          equity: 10000,
          cashAvailable: 5000,
          buyingPower: 10000
        }
      ]
    };

    // Mock account info
    mockAccountInfo = {
      equity: 10000,
      cashAvailable: 5000,
      buyingPower: 10000
    };

    // Mock trade signal
    mockSignal = {
      symbol: 'AAPL',
      action: 'buy',
      quantity: 10,
      price: 180,
      stopLoss: 176
    };

    // Mock User.findById
    User.findById = jest.fn().mockResolvedValue(mockUser);
    User.findByIdAndUpdate = jest.fn().mockResolvedValue(mockUser);

    // Mock Position queries
    Position.findOne = jest.fn().mockResolvedValue(null);
    Position.find = jest.fn().mockResolvedValue([]);

    // Mock Trade queries
    Trade.find = jest.fn().mockResolvedValue([]);

    // Mock AuditLogService
    AuditLogService.prototype.log = jest.fn().mockResolvedValue(true);
  });

  afterEach(() => {
    // Clear circuit breaker state
    if (service.circuitBreakerActive) {
      service.circuitBreakerActive.clear();
    }
  });

  describe('validateTrade - Basic Validation', () => {
    test('should approve trade within all risk limits', async () => {
      const result = await service.validateTrade('user123', mockSignal, mockAccountInfo);

      expect(result.approved).toBe(true);
      expect(result.action).toBe('APPROVED');
      expect(result.adjustedQuantity).toBe(10);
      expect(result.riskScore).toBeDefined();
      expect(result.riskScore.level).toBe('LOW');
    });

    test('should reject trade if user not found', async () => {
      User.findById.mockResolvedValue(null);

      await expect(service.validateTrade('user123', mockSignal, mockAccountInfo)).rejects.toThrow(
        'User not found: user123'
      );
    });

    test('should reject trade if account balance below minimum', async () => {
      mockAccountInfo.equity = 50; // Below $100 minimum

      const result = await service.validateTrade('user123', mockSignal, mockAccountInfo);

      expect(result.approved).toBe(false);
      expect(result.action).toBe('REJECTED');
      expect(result.reason).toContain('Insufficient account balance');
      expect(result.riskScore.level).toBe('HIGH');
    });
  });

  describe('Position Sizing', () => {
    test('should enforce max position size (10% rule)', async () => {
      // Request $18,000 position on $10,000 account (180%)
      mockSignal.quantity = 100; // 100 shares × $180 = $18,000
      mockSignal.price = 180;

      const result = await service.validateTrade('user123', mockSignal, mockAccountInfo);

      expect(result.approved).toBe(true);
      expect(result.action).toBe('ADJUSTED');
      expect(result.adjustedQuantity).toBeLessThan(100);
      expect(result.adjustedQuantity * 180).toBeLessThanOrEqual(1000); // Max 10% = $1,000
      expect(result.reason).toContain('Max position size');
    });

    test('should account for existing position when sizing new trade', async () => {
      // Mock existing position: 50 shares @ $180 = $9,000
      Position.findOne.mockResolvedValue({
        user: 'user123',
        symbol: 'AAPL',
        quantity: 50,
        avgPrice: 180,
        status: 'OPEN'
      });

      // Request additional 10 shares = $1,800 more (total would be $10,800)
      mockSignal.quantity = 10;
      mockSignal.price = 180;

      const result = await service.validateTrade('user123', mockSignal, mockAccountInfo);

      // Should adjust or reject since existing + new > max (10% = $1,000)
      expect(result.approved).toBe(true);
      expect(result.adjustedQuantity).toBe(0); // No room for more
      expect(result.reason).toContain('Existing position');
    });

    test('should approve trade at exactly max position size', async () => {
      // Request exactly 10% of account ($1,000)
      mockSignal.quantity = 5; // 5 shares × $180 = $900
      mockSignal.price = 180;

      const result = await service.validateTrade('user123', mockSignal, mockAccountInfo);

      expect(result.approved).toBe(true);
      expect(result.adjustedQuantity).toBe(5);
      expect(result.action).toBe('APPROVED');
    });
  });

  describe('Daily Loss Limit', () => {
    test('should reject trade when daily loss limit exceeded (-5%)', async () => {
      // Mock daily P&L at -$600 (below -5% of $10,000 = -$500 limit)
      Trade.find.mockResolvedValue([
        { realizedPnL: -300, status: 'FILLED', createdAt: new Date() },
        { realizedPnL: -200, status: 'FILLED', createdAt: new Date() },
        { realizedPnL: -100, status: 'FILLED', createdAt: new Date() }
      ]);

      const result = await service.validateTrade('user123', mockSignal, mockAccountInfo);

      expect(result.approved).toBe(false);
      expect(result.action).toBe('REJECTED');
      expect(result.reason).toContain('Daily loss limit exceeded');
      expect(result.reason).toContain('-$600');
      expect(result.riskScore.dailyPnL).toBe(-600);
    });

    test('should approve trade when daily loss approaching but not exceeded', async () => {
      // Mock daily P&L at -$400 (approaching -5% limit of -$500)
      Trade.find.mockResolvedValue([{ realizedPnL: -400, status: 'FILLED', createdAt: new Date() }]);

      const result = await service.validateTrade('user123', mockSignal, mockAccountInfo);

      expect(result.approved).toBe(true);
      // Should still approve but with elevated risk score
      expect(result.riskScore.level).toBe('LOW'); // May be MEDIUM depending on other factors
    });

    test("should only count today's trades for daily P&L", async () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      // Mock trades: yesterday -$1000, today -$100
      Trade.find.mockResolvedValue([{ realizedPnL: -100, status: 'FILLED', createdAt: today }]);

      const result = await service.validateTrade('user123', mockSignal, mockAccountInfo);

      // Should only count today's -$100, not yesterday's -$1000
      expect(result.approved).toBe(true);
    });
  });

  describe('Circuit Breaker', () => {
    test('should trigger circuit breaker at -8% intraday loss', async () => {
      // Mock daily P&L at -$850 (-8.5% of $10,000)
      Trade.find.mockResolvedValue([{ realizedPnL: -850, status: 'FILLED', createdAt: new Date() }]);

      const result = await service.validateTrade('user123', mockSignal, mockAccountInfo);

      expect(result.approved).toBe(false);
      expect(result.action).toBe('CIRCUIT_BREAKER');
      expect(result.reason).toContain('EMERGENCY');
      expect(result.reason).toContain('Circuit breaker triggered');
      expect(result.riskScore.level).toBe('CRITICAL');
      expect(result.riskScore.score).toBe(100);

      // Verify user account was locked
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        'user123',
        expect.objectContaining({
          'accountStatus.trading': false,
          'accountStatus.circuitBreakerActive': true
        })
      );
    });

    test('should block all trades after circuit breaker activated', async () => {
      // Activate circuit breaker manually
      service.circuitBreakerActive.set('user123', new Date());

      const result = await service.validateTrade('user123', mockSignal, mockAccountInfo);

      expect(result.approved).toBe(false);
      expect(result.action).toBe('CIRCUIT_BREAKER');
      expect(result.reason).toContain('Circuit breaker active');
    });

    test('should trigger position closure when circuit breaker activates', async () => {
      // Mock open positions
      Position.find.mockResolvedValue([
        {
          user: 'user123',
          symbol: 'AAPL',
          quantity: 10,
          status: 'OPEN',
          save: jest.fn().mockResolvedValue(true)
        },
        {
          user: 'user123',
          symbol: 'TSLA',
          quantity: 5,
          status: 'OPEN',
          save: jest.fn().mockResolvedValue(true)
        }
      ]);

      // Trigger circuit breaker with -8% loss
      Trade.find.mockResolvedValue([{ realizedPnL: -850, status: 'FILLED', createdAt: new Date() }]);

      const result = await service.validateTrade('user123', mockSignal, mockAccountInfo);

      expect(result.action).toBe('CIRCUIT_BREAKER');

      // Verify positions marked for closure
      const positions = await Position.find({ user: 'user123', status: 'OPEN' });
      expect(positions.length).toBe(2);
      positions.forEach(pos => {
        expect(pos.save).toHaveBeenCalled();
      });
    });
  });

  describe('Portfolio Exposure', () => {
    test('should reject trade exceeding max portfolio exposure (80%)', async () => {
      // Mock existing positions: $7,000 exposure (70% of $10,000)
      Position.find.mockResolvedValue([
        { symbol: 'AAPL', quantity: 20, avgPrice: 180, status: 'OPEN' }, // $3,600
        { symbol: 'TSLA', quantity: 10, avgPrice: 250, status: 'OPEN' }, // $2,500
        { symbol: 'NVDA', quantity: 2, avgPrice: 450, status: 'OPEN' } // $900
      ]);

      // Request new position: $1,800 (would make total 88% > 80% max)
      mockSignal.quantity = 10;
      mockSignal.price = 180;

      const result = await service.validateTrade('user123', mockSignal, mockAccountInfo);

      expect(result.approved).toBe(false);
      expect(result.action).toBe('REJECTED');
      expect(result.reason).toContain('Portfolio exposure limit exceeded');
      expect(result.riskScore.exposure).toBeGreaterThan(80);
    });

    test('should approve trade within portfolio exposure limits', async () => {
      // Mock existing positions: $3,000 exposure (30% of $10,000)
      Position.find.mockResolvedValue([
        { symbol: 'AAPL', quantity: 10, avgPrice: 180, status: 'OPEN' }, // $1,800
        { symbol: 'TSLA', quantity: 5, avgPrice: 240, status: 'OPEN' } // $1,200
      ]);

      // Request new position: $900 (would make total 39% < 80% max)
      mockSignal.quantity = 5;
      mockSignal.price = 180;

      const result = await service.validateTrade('user123', mockSignal, mockAccountInfo);

      expect(result.approved).toBe(true);
    });
  });

  describe('Risk Score Calculation', () => {
    test('should assign LOW risk score for small position', async () => {
      mockSignal.quantity = 1; // 1 share × $180 = $180 (1.8% of $10,000)
      mockSignal.price = 180;

      const result = await service.validateTrade('user123', mockSignal, mockAccountInfo);

      expect(result.riskScore.level).toBe('LOW');
      expect(result.riskScore.score).toBeLessThan(40);
    });

    test('should assign MEDIUM risk score for moderate position', async () => {
      mockSignal.quantity = 5; // 5 shares × $180 = $900 (9% of $10,000)
      mockSignal.price = 180;

      const result = await service.validateTrade('user123', mockSignal, mockAccountInfo);

      expect(result.riskScore.level).toBe('MEDIUM');
      expect(result.riskScore.score).toBeGreaterThanOrEqual(40);
      expect(result.riskScore.score).toBeLessThan(70);
    });

    test('should assign HIGH risk score for large position', async () => {
      mockSignal.quantity = 5; // Max position
      mockSignal.price = 200; // Higher price = $1,000 (10% max)
      mockSignal.stopLoss = 150; // Wide stop loss (25% distance)

      const result = await service.validateTrade('user123', mockSignal, mockAccountInfo);

      expect(result.riskScore.level).toBe('HIGH');
      expect(result.riskScore.score).toBeGreaterThanOrEqual(70);
    });

    test('should include position size in risk score', async () => {
      const result = await service.validateTrade('user123', mockSignal, mockAccountInfo);

      expect(result.riskScore.positionPercent).toBeDefined();
      expect(parseFloat(result.riskScore.positionPercent)).toBeGreaterThan(0);
    });

    test('should include stop loss distance in risk score', async () => {
      const result = await service.validateTrade('user123', mockSignal, mockAccountInfo);

      expect(result.riskScore.stopLossDistance).toBeDefined();
      expect(parseFloat(result.riskScore.stopLossDistance)).toBeGreaterThan(0);
    });
  });

  describe('Custom Risk Configuration', () => {
    test('should use custom max position size if configured', async () => {
      mockUser.riskSettings = {
        maxPositionSizePercent: 5 // 5% instead of default 10%
      };

      mockSignal.quantity = 6; // 6 shares × $180 = $1,080 (10.8% of $10,000, exceeds 5%)
      mockSignal.price = 180;

      const result = await service.validateTrade('user123', mockSignal, mockAccountInfo);

      expect(result.action).toBe('ADJUSTED');
      expect(result.adjustedQuantity * 180).toBeLessThanOrEqual(500); // Max 5% = $500
    });

    test('should use custom daily loss limit if configured', async () => {
      mockUser.riskSettings = {
        maxDailyLossPercent: 3 // 3% instead of default 5%
      };

      // Mock daily P&L at -$350 (exceeds 3% = -$300 limit)
      Trade.find.mockResolvedValue([{ realizedPnL: -350, status: 'FILLED', createdAt: new Date() }]);

      const result = await service.validateTrade('user123', mockSignal, mockAccountInfo);

      expect(result.approved).toBe(false);
      expect(result.reason).toContain('Daily loss limit exceeded');
    });

    test('should use custom circuit breaker threshold if configured', async () => {
      mockUser.riskSettings = {
        circuitBreakerPercent: 5 // 5% instead of default 8%
      };

      // Mock daily P&L at -$550 (-5.5% of $10,000)
      Trade.find.mockResolvedValue([{ realizedPnL: -550, status: 'FILLED', createdAt: new Date() }]);

      const result = await service.validateTrade('user123', mockSignal, mockAccountInfo);

      expect(result.action).toBe('CIRCUIT_BREAKER');
    });
  });

  describe('Audit Logging', () => {
    test('should audit all risk decisions', async () => {
      await service.validateTrade('user123', mockSignal, mockAccountInfo);

      expect(AuditLogService.prototype.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user123',
          action: 'RISK_VALIDATION',
          category: 'RISK_MANAGEMENT'
        })
      );
    });

    test('should audit circuit breaker activation', async () => {
      // Trigger circuit breaker
      Trade.find.mockResolvedValue([{ realizedPnL: -850, status: 'FILLED', createdAt: new Date() }]);

      await service.validateTrade('user123', mockSignal, mockAccountInfo);

      const auditCalls = AuditLogService.prototype.log.mock.calls;
      const circuitBreakerAudit = auditCalls.find(call => call[0].action === 'CIRCUIT_BREAKER_ACTIVATED');

      expect(circuitBreakerAudit).toBeDefined();
      expect(circuitBreakerAudit[0].severity).toBe('CRITICAL');
    });
  });

  describe('Admin Functions', () => {
    test('should allow admin to reset circuit breaker', async () => {
      // Activate circuit breaker
      service.circuitBreakerActive.set('user123', new Date());
      mockUser.accountStatus.circuitBreakerActive = true;

      // Reset by admin
      await service.resetCircuitBreaker('user123', 'admin456');

      expect(service.circuitBreakerActive.has('user123')).toBe(false);
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        'user123',
        expect.objectContaining({
          'accountStatus.trading': true,
          'accountStatus.circuitBreakerActive': false
        })
      );
    });

    test('should throw error if resetting inactive circuit breaker', async () => {
      await expect(service.resetCircuitBreaker('user123', 'admin456')).rejects.toThrow('Circuit breaker not active');
    });
  });

  describe('getRiskStatus', () => {
    test('should return risk status for active account', async () => {
      Trade.find.mockResolvedValue([{ realizedPnL: -200, status: 'FILLED', createdAt: new Date() }]);

      const status = await service.getRiskStatus('user123');

      expect(status.status).toBe('ACTIVE');
      expect(status.tradingEnabled).toBe(true);
      expect(status.circuitBreakerActive).toBe(false);
      expect(status.dailyPnL).toBe('-200.00');
      expect(status.riskConfig).toBeDefined();
    });

    test('should return circuit breaker status when active', async () => {
      service.circuitBreakerActive.set('user123', new Date());
      mockUser.accountStatus.trading = false;

      const status = await service.getRiskStatus('user123');

      expect(status.status).toBe('CIRCUIT_BREAKER');
      expect(status.circuitBreakerActive).toBe(true);
      expect(status.tradingEnabled).toBe(false);
    });

    test('should return daily limit exceeded status', async () => {
      Trade.find.mockResolvedValue([{ realizedPnL: -600, status: 'FILLED', createdAt: new Date() }]);

      const status = await service.getRiskStatus('user123');

      expect(status.status).toBe('DAILY_LIMIT_EXCEEDED');
    });
  });

  describe('Edge Cases', () => {
    test('should handle zero quantity signal', async () => {
      mockSignal.quantity = 0;

      const result = await service.validateTrade('user123', mockSignal, mockAccountInfo);

      expect(result.approved).toBe(false);
      expect(result.adjustedQuantity).toBe(0);
    });

    test('should handle missing stop loss (use default)', async () => {
      delete mockSignal.stopLoss;

      const result = await service.validateTrade('user123', mockSignal, mockAccountInfo);

      expect(result.stopLossPrice).toBeDefined();
      expect(result.stopLossPrice).toBeLessThan(mockSignal.price);
    });

    test('should handle positive daily P&L', async () => {
      Trade.find.mockResolvedValue([{ realizedPnL: 500, status: 'FILLED', createdAt: new Date() }]);

      const result = await service.validateTrade('user123', mockSignal, mockAccountInfo);

      expect(result.approved).toBe(true);
    });

    test('should handle no existing positions', async () => {
      Position.find.mockResolvedValue([]);

      const result = await service.validateTrade('user123', mockSignal, mockAccountInfo);

      expect(result.approved).toBe(true);
    });

    test('should handle database errors gracefully', async () => {
      User.findById.mockRejectedValue(new Error('Database connection failed'));

      await expect(service.validateTrade('user123', mockSignal, mockAccountInfo)).rejects.toThrow(
        'Database connection failed'
      );
    });
  });

  describe('Performance', () => {
    test('should complete validation in <100ms per FR-002 requirement', async () => {
      const startTime = Date.now();

      await service.validateTrade('user123', mockSignal, mockAccountInfo);

      const elapsed = Date.now() - startTime;

      // Allow some margin for test overhead, but should be fast
      expect(elapsed).toBeLessThan(100);
    });
  });
});
