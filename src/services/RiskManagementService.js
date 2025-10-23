'use strict';

/**
 * @fileoverview Risk Management Service - Core financial risk validation system
 *
 * Implements position sizing, daily loss limits, circuit breakers, and risk scoring
 * per US-006 specification and Constitutional Principle I (Security-First).
 *
 * @module services/RiskManagementService
 * @requires models/Position
 * @requires models/Trade
 * @requires models/User
 * @requires services/AuditLogService
 * @requires config/env
 *
 * @constitutional-alignment
 * - Principle I: Security-First - Financial risk controls prevent catastrophic losses
 * - Principle II: Test-First - Requires >95% test coverage per FR-006
 * - Principle III: Performance - Risk checks complete <100ms per FR-002
 *
 * @compliance
 * - FinCEN: Risk management required for automated trading platforms
 * - SEC: Position limits and daily loss tracking
 * - SOC 2: Financial controls documentation
 */

const Position = require('../models/Position');
const Trade = require('../models/Trade');
const User = require('../models/User');
const AuditLogService = require('./AuditLogService');
const { logger } = require('../middleware/logger');

/**
 * Default risk configuration per FR-006 specification
 */
const DEFAULT_RISK_CONFIG = {
  maxPositionSizePercent: 10, // Max 10% of portfolio per position (FR-002)
  maxDailyLossPercent: 5, // Max -5% daily loss before trading pause (FR-006)
  circuitBreakerPercent: 8, // Emergency stop at -8% intraday loss
  riskPerTradePercent: 2, // Default 2% risk per trade for position sizing
  stopLossPercent: 2, // Default -2% stop loss
  maxPortfolioExposurePercent: 80, // Max 80% of portfolio exposed
  maxPositionsPerSymbol: 3, // Max 3 open positions per symbol
  minAccountBalance: 100 // Minimum $100 account balance
};

/**
 * Risk validation result structure
 * @typedef {Object} RiskValidationResult
 * @property {boolean} approved - Trade approved by risk checks
 * @property {number|null} adjustedQuantity - Quantity adjusted for risk limits (null if rejected)
 * @property {string} reason - Explanation if rejected or adjusted
 * @property {Object} riskScore - Risk assessment metrics
 * @property {string} action - Action taken: 'APPROVED', 'ADJUSTED', 'REJECTED', 'CIRCUIT_BREAKER'
 */

/**
 * Risk Management Service
 *
 * Core responsibilities:
 * 1. Position sizing - Calculate trade quantity based on account balance and risk tolerance
 * 2. Daily loss tracking - Monitor cumulative P&L and enforce daily limits
 * 3. Circuit breakers - Emergency stop on catastrophic losses
 * 4. Portfolio exposure - Enforce maximum portfolio utilization
 * 5. Risk scoring - Calculate risk metrics per trade
 *
 * @class RiskManagementService
 */
class RiskManagementService {
  constructor() {
    this.auditLog = new AuditLogService();
    this.circuitBreakerActive = new Map(); // userId -> timestamp
  }

  /**
   * Validate trade signal against all risk rules
   *
   * Execution flow:
   * 1. Check circuit breaker status
   * 2. Validate account balance
   * 3. Check daily loss limit
   * 4. Calculate and validate position size
   * 5. Check portfolio exposure
   * 6. Calculate risk score
   * 7. Audit decision
   *
   * @param {string} userId - User ID
   * @param {Object} signal - Trade signal object
   * @param {string} signal.symbol - Trading symbol (e.g., 'AAPL')
   * @param {string} signal.action - 'buy' or 'sell'
   * @param {number} signal.quantity - Requested quantity
   * @param {number} signal.price - Entry price
   * @param {number|null} signal.stopLoss - Optional stop loss price
   * @param {Object} accountInfo - Broker account information
   * @param {number} accountInfo.equity - Current account equity
   * @param {number} accountInfo.cashAvailable - Available cash
   * @param {number} accountInfo.buyingPower - Current buying power
   * @returns {Promise<RiskValidationResult>} Validation result
   *
   * @throws {Error} If user not found or database error
   *
   * @performance Target: <100ms per FR-002
   * @tested >95% coverage required per Principle II
   */
  async validateTrade(userId, signal, accountInfo) {
    const startTime = Date.now();

    try {
      // Fetch user risk configuration
      const user = await User.findById(userId);
      if (!user) {
        throw new Error(`User not found: ${userId}`);
      }

      const riskConfig = this._getUserRiskConfig(user);

      // 1. Check circuit breaker status
      if (this.circuitBreakerActive.has(userId)) {
        const activatedAt = this.circuitBreakerActive.get(userId);
        const result = {
          approved: false,
          adjustedQuantity: null,
          reason: `Circuit breaker active since ${activatedAt.toISOString()}. Trading disabled. Contact support.`,
          riskScore: { level: 'CRITICAL', score: 100 },
          action: 'CIRCUIT_BREAKER'
        };

        await this._auditDecision(userId, signal, result, 'CIRCUIT_BREAKER_BLOCK');
        return result;
      }

      // 2. Validate minimum account balance
      if (accountInfo.equity < riskConfig.minAccountBalance) {
        const result = {
          approved: false,
          adjustedQuantity: null,
          reason: `Insufficient account balance: $${accountInfo.equity.toFixed(2)} < $${riskConfig.minAccountBalance} minimum`,
          riskScore: { level: 'HIGH', score: 80 },
          action: 'REJECTED'
        };

        await this._auditDecision(userId, signal, result, 'INSUFFICIENT_BALANCE');
        return result;
      }

      // 3. Check daily loss limit
      const dailyPnL = await this._getDailyPnL(userId);
      const dailyLossLimit = accountInfo.equity * (riskConfig.maxDailyLossPercent / 100);

      if (dailyPnL < -dailyLossLimit) {
        const result = {
          approved: false,
          adjustedQuantity: null,
          reason: `Daily loss limit exceeded: -$${Math.abs(dailyPnL).toFixed(2)} of -$${dailyLossLimit.toFixed(2)} limit (-${riskConfig.maxDailyLossPercent}%). Trading paused until tomorrow 00:00 UTC.`,
          riskScore: { level: 'HIGH', score: 85, dailyPnL, limit: dailyLossLimit },
          action: 'REJECTED'
        };

        await this._auditDecision(userId, signal, result, 'DAILY_LOSS_LIMIT');
        await this._triggerPositionClosure(userId, 'DAILY_LOSS_LIMIT');
        return result;
      }

      // 4. Check circuit breaker threshold
      const intradayDrawdown = this._calculateIntradayDrawdown(dailyPnL, accountInfo.equity);
      if (intradayDrawdown >= riskConfig.circuitBreakerPercent) {
        await this._activateCircuitBreaker(userId, accountInfo.equity, dailyPnL);

        const result = {
          approved: false,
          adjustedQuantity: null,
          reason: `EMERGENCY: Circuit breaker triggered at -${intradayDrawdown.toFixed(2)}% intraday loss. Account locked. All positions will be closed. Contact support immediately.`,
          riskScore: { level: 'CRITICAL', score: 100, drawdown: intradayDrawdown },
          action: 'CIRCUIT_BREAKER'
        };

        await this._auditDecision(userId, signal, result, 'CIRCUIT_BREAKER_TRIGGERED');
        await this._triggerPositionClosure(userId, 'CIRCUIT_BREAKER');
        return result;
      }

      // 5. Calculate position size
      const positionSize = await this._calculatePositionSize(userId, signal, accountInfo.equity, riskConfig);

      if (positionSize.quantity === 0) {
        const result = {
          approved: false,
          adjustedQuantity: 0,
          reason: positionSize.reason,
          riskScore: { level: 'MEDIUM', score: 60 },
          action: 'REJECTED'
        };

        await this._auditDecision(userId, signal, result, 'POSITION_SIZE_ZERO');
        return result;
      }

      // 6. Check portfolio exposure
      const exposureCheck = await this._checkPortfolioExposure(
        userId,
        signal,
        positionSize.quantity,
        accountInfo.equity,
        riskConfig
      );

      if (!exposureCheck.approved) {
        const result = {
          approved: false,
          adjustedQuantity: null,
          reason: exposureCheck.reason,
          riskScore: { level: 'HIGH', score: 75, exposure: exposureCheck.exposure },
          action: 'REJECTED'
        };

        await this._auditDecision(userId, signal, result, 'PORTFOLIO_EXPOSURE');
        return result;
      }

      // 7. Calculate risk score
      const riskScore = this._calculateRiskScore(signal, positionSize, accountInfo.equity, riskConfig);

      // 8. Determine action and prepare result
      const wasAdjusted = positionSize.quantity !== signal.quantity;
      const result = {
        approved: true,
        adjustedQuantity: positionSize.quantity,
        reason: wasAdjusted
          ? `Position sized adjusted from ${signal.quantity} to ${positionSize.quantity} shares (${positionSize.reason})`
          : 'Trade approved within risk limits',
        riskScore,
        action: wasAdjusted ? 'ADJUSTED' : 'APPROVED',
        stopLossPrice: positionSize.stopLossPrice,
        notionalValue: positionSize.quantity * signal.price,
        portfolioPercent: (((positionSize.quantity * signal.price) / accountInfo.equity) * 100).toFixed(2)
      };

      await this._auditDecision(userId, signal, result, result.action);

      const elapsed = Date.now() - startTime;
      logger.info('Risk validation complete', {
        userId,
        symbol: signal.symbol,
        action: result.action,
        elapsed: `${elapsed}ms`
      });

      return result;
    } catch (error) {
      logger.error('Risk validation error', {
        userId,
        symbol: signal.symbol,
        error: error.message,
        stack: error.stack
      });

      throw error;
    }
  }

  /**
   * Calculate position size based on risk per trade and account equity
   *
   * Formula: Position Size = (Account Equity × Risk %) / Stop Loss Distance
   * Example: ($10,000 × 2%) / ($180 - $176) = $200 / $4 = 50 shares
   *
   * @param {string} userId - User ID
   * @param {Object} signal - Trade signal
   * @param {number} equity - Account equity
   * @param {Object} riskConfig - User risk configuration
   * @returns {Promise<Object>} { quantity, reason, stopLossPrice }
   * @private
   */
  async _calculatePositionSize(userId, signal, equity, riskConfig) {
    const maxPositionValue = equity * (riskConfig.maxPositionSizePercent / 100);
    const requestedNotional = signal.quantity * signal.price;

    // Check if requested size exceeds max position limit
    if (requestedNotional > maxPositionValue) {
      const adjustedQuantity = Math.floor(maxPositionValue / signal.price);
      return {
        quantity: adjustedQuantity,
        reason: `Max position size ${riskConfig.maxPositionSizePercent}% rule applied`,
        stopLossPrice: signal.stopLoss || signal.price * (1 - riskConfig.stopLossPercent / 100)
      };
    }

    // Check current positions for symbol
    const existingPosition = await Position.findOne({
      user: userId,
      symbol: signal.symbol,
      status: 'OPEN'
    });

    if (existingPosition) {
      const totalNotional = existingPosition.quantity * existingPosition.avgPrice + requestedNotional;
      if (totalNotional > maxPositionValue) {
        const availableSize = Math.floor(
          (maxPositionValue - existingPosition.quantity * existingPosition.avgPrice) / signal.price
        );
        return {
          quantity: Math.max(0, availableSize),
          reason: `Existing position ${existingPosition.quantity} shares @ $${existingPosition.avgPrice.toFixed(2)}. Max position size reached.`,
          stopLossPrice: signal.stopLoss || signal.price * (1 - riskConfig.stopLossPercent / 100)
        };
      }
    }

    // Position size approved as-is
    return {
      quantity: signal.quantity,
      reason: 'Within position size limits',
      stopLossPrice: signal.stopLoss || signal.price * (1 - riskConfig.stopLossPercent / 100)
    };
  }

  /**
   * Check total portfolio exposure doesn't exceed limits
   *
   * @param {string} userId - User ID
   * @param {Object} signal - Trade signal
   * @param {number} quantity - Trade quantity
   * @param {number} equity - Account equity
   * @param {Object} riskConfig - User risk configuration
   * @returns {Promise<Object>} { approved, reason, exposure }
   * @private
   */
  async _checkPortfolioExposure(userId, signal, quantity, equity, riskConfig) {
    const openPositions = await Position.find({
      user: userId,
      status: 'OPEN'
    });

    let totalExposure = 0;
    for (const position of openPositions) {
      totalExposure += position.quantity * position.avgPrice;
    }

    const newTradeValue = quantity * signal.price;
    const totalWithNew = totalExposure + newTradeValue;
    const exposurePercent = (totalWithNew / equity) * 100;

    if (exposurePercent > riskConfig.maxPortfolioExposurePercent) {
      return {
        approved: false,
        reason: `Portfolio exposure limit exceeded: ${exposurePercent.toFixed(2)}% > ${riskConfig.maxPortfolioExposurePercent}% max. Current exposure: $${totalExposure.toFixed(2)}, new trade: $${newTradeValue.toFixed(2)}, equity: $${equity.toFixed(2)}.`,
        exposure: exposurePercent
      };
    }

    return {
      approved: true,
      reason: `Portfolio exposure within limits: ${exposurePercent.toFixed(2)}%`,
      exposure: exposurePercent
    };
  }

  /**
   * Get cumulative P&L for current day (UTC)
   *
   * @param {string} userId - User ID
   * @returns {Promise<number>} Total P&L for today (negative if losses)
   * @private
   */
  async _getDailyPnL(userId) {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const trades = await Trade.find({
      user: userId,
      createdAt: { $gte: todayStart },
      status: { $in: ['FILLED', 'PARTIALLY_FILLED', 'CLOSED'] }
    });

    let totalPnL = 0;
    for (const trade of trades) {
      if (trade.realizedPnL) {
        totalPnL += trade.realizedPnL;
      }
    }

    return totalPnL;
  }

  /**
   * Calculate intraday drawdown percentage
   *
   * @param {number} dailyPnL - Current day P&L
   * @param {number} equity - Current account equity
   * @returns {number} Drawdown percentage (positive number)
   * @private
   */
  _calculateIntradayDrawdown(dailyPnL, equity) {
    if (dailyPnL >= 0) return 0;
    return Math.abs((dailyPnL / equity) * 100);
  }

  /**
   * Activate circuit breaker and lock account
   *
   * @param {string} userId - User ID
   * @param {number} equity - Current equity
   * @param {number} dailyPnL - Daily P&L
   * @returns {Promise<void>}
   * @private
   */
  async _activateCircuitBreaker(userId, equity, dailyPnL) {
    const timestamp = new Date();
    this.circuitBreakerActive.set(userId, timestamp);

    logger.error('CIRCUIT BREAKER ACTIVATED', {
      userId,
      equity: `$${equity.toFixed(2)}`,
      dailyPnL: `$${dailyPnL.toFixed(2)}`,
      drawdown: `${this._calculateIntradayDrawdown(dailyPnL, equity).toFixed(2)}%`,
      timestamp: timestamp.toISOString()
    });

    // Update user account status
    await User.findByIdAndUpdate(userId, {
      'accountStatus.trading': false,
      'accountStatus.circuitBreakerActive': true,
      'accountStatus.circuitBreakerActivatedAt': timestamp
    });

    // Audit circuit breaker activation
    await this.auditLog.log({
      userId,
      action: 'CIRCUIT_BREAKER_ACTIVATED',
      category: 'RISK_MANAGEMENT',
      severity: 'CRITICAL',
      metadata: {
        equity,
        dailyPnL,
        drawdownPercent: this._calculateIntradayDrawdown(dailyPnL, equity),
        timestamp
      },
      ipAddress: 'system'
    });

    // Send emergency notification to user + admin
    await this._sendEmergencyNotification(userId, equity, dailyPnL, 'CIRCUIT_BREAKER');

    // Close all open positions immediately
    await this._triggerPositionClosure(userId, 'CIRCUIT_BREAKER');
  }

  /**
   * Send emergency notification for critical risk events
   *
   * @param {string} userId - User ID
   * @param {number} equity - Current equity
   * @param {number} dailyPnL - Daily P&L
   * @param {string} reason - Trigger reason
   * @returns {Promise<void>}
   * @private
   */
  async _sendEmergencyNotification(userId, equity, dailyPnL, reason) {
    try {
      const User = require('../models/User');
      const discordService = require('./discord');

      const user = await User.findById(userId);
      if (!user) {
        logger.error('User not found for emergency notification', { userId });
        return;
      }

      const drawdownPercent = this._calculateIntradayDrawdown(dailyPnL, equity);

      const message =
        reason === 'CIRCUIT_BREAKER'
          ? `🚨 EMERGENCY: Circuit breaker triggered! Portfolio down ${drawdownPercent.toFixed(2)}% (${dailyPnL < 0 ? '-' : '+'}$${Math.abs(dailyPnL).toFixed(2)}). All positions are being closed.`
          : `⚠️ ALERT: Daily loss limit reached (${dailyPnL < 0 ? '-' : '+'}$${Math.abs(dailyPnL).toFixed(2)}). Trading paused until tomorrow.`;

      // Send Discord DM to user
      if (user.discordId) {
        await discordService.sendDirectMessage(user.discordId, message);
        logger.info('Emergency notification sent to user', { userId, discordId: user.discordId });
      }

      // Send notification to admin/support team
      if (process.env.ADMIN_DISCORD_CHANNEL) {
        await discordService.sendChannelMessage(
          process.env.ADMIN_DISCORD_CHANNEL,
          `🚨 CRITICAL RISK EVENT\nUser: ${user.username} (${userId})\n${message}\nEquity: $${equity.toFixed(2)}`
        );
      }

      logger.info('Emergency notification sent', { userId, reason, drawdownPercent });
    } catch (error) {
      logger.error('Failed to send emergency notification', { userId, reason, error: error.message });
      // Don't throw - notification failure shouldn't block risk management
    }
  }

  /**
   * Trigger automatic position closure (daily loss limit or circuit breaker)
   *
   * @param {string} userId - User ID
   * @param {string} reason - 'DAILY_LOSS_LIMIT' or 'CIRCUIT_BREAKER'
   * @returns {Promise<void>}
   * @private
   */
  async _triggerPositionClosure(userId, reason) {
    logger.warn('Triggering automatic position closure', { userId, reason });

    // Find all open positions
    const openPositions = await Position.find({
      user: userId,
      status: 'OPEN'
    });

    for (const position of openPositions) {
      // Mark position for closure
      position.status = 'PENDING_CLOSE';
      position.closeReason = reason;
      position.closeInitiatedAt = new Date();
      await position.save();

      logger.info('Position marked for automatic closure', {
        userId,
        symbol: position.symbol,
        quantity: position.quantity,
        reason
      });
    }

    // Audit position closure trigger
    await this.auditLog.log({
      userId,
      action: 'POSITION_CLOSURE_TRIGGERED',
      category: 'RISK_MANAGEMENT',
      severity: 'HIGH',
      metadata: {
        reason,
        positionCount: openPositions.length,
        symbols: openPositions.map(p => p.symbol)
      },
      ipAddress: 'system'
    });

    // Integrate with TradeExecutionService to submit close orders to brokers
    await this._submitCloseOrdersToBrokers(userId, openPositions, reason);
  }

  /**
   * Submit close orders to brokers for open positions
   *
   * @param {string} userId - User ID
   * @param {Array} positions - Open positions to close
   * @param {string} reason - Closure reason
   * @returns {Promise<void>}
   * @private
   */
  async _submitCloseOrdersToBrokers(userId, positions, reason) {
    try {
      const TradeExecutionService = require('./TradeExecutionService');
      const tradeExecutor = new TradeExecutionService();

      for (const position of positions) {
        try {
          // Create close order signal
          const closeSignal = {
            action: position.side === 'LONG' ? 'sell' : 'buy_to_cover',
            symbol: position.symbol,
            quantity: Math.abs(position.quantity),
            orderType: 'market', // Market order for immediate execution
            broker: position.broker,
            reason: `AUTO_CLOSE_${reason}`
          };

          // Submit close order via TradeExecutionService
          logger.info('Submitting auto-close order to broker', {
            userId,
            symbol: position.symbol,
            quantity: closeSignal.quantity,
            reason
          });

          await tradeExecutor.executeTrade(userId, closeSignal);

          logger.info('Auto-close order submitted successfully', {
            userId,
            symbol: position.symbol,
            reason
          });
        } catch (error) {
          logger.error('Failed to submit auto-close order', {
            userId,
            symbol: position.symbol,
            error: error.message,
            reason
          });
          // Continue closing other positions even if one fails
        }
      }

      logger.info('Auto-close orders submitted for all positions', {
        userId,
        positionCount: positions.length,
        reason
      });
    } catch (error) {
      logger.error('Failed to submit close orders to brokers', {
        userId,
        error: error.message,
        reason
      });
      throw error;
    }
  }

  /**
   * Calculate risk score for trade
   *
   * Factors:
   * - Position size relative to account
   * - Stop loss distance (wider = higher risk)
   * - Portfolio concentration
   * - Volatility (if available)
   *
   * @param {Object} signal - Trade signal
   * @param {Object} positionSize - Calculated position size
   * @param {number} equity - Account equity
   * @param {Object} riskConfig - Risk configuration
   * @returns {Object} Risk score metrics
   * @private
   */
  _calculateRiskScore(signal, positionSize, equity, riskConfig) {
    const notionalValue = positionSize.quantity * signal.price;
    const positionPercent = (notionalValue / equity) * 100;

    // Stop loss distance as percentage
    const stopLossDistance = (Math.abs(signal.price - positionSize.stopLossPrice) / signal.price) * 100;

    // Base score: 0-100 (0 = no risk, 100 = maximum risk)
    let score = 0;

    // Position size contribution (0-40 points)
    score += Math.min(40, (positionPercent / riskConfig.maxPositionSizePercent) * 40);

    // Stop loss distance contribution (0-30 points)
    // Wider stop loss = higher risk
    score += Math.min(30, (stopLossDistance / 10) * 30);

    // Leverage contribution (0-30 points)
    // Factor in margin/leverage when available
    const leverageMultiplier = signal.leverage || 1;
    const marginPercent = signal.marginUsed ? (signal.marginUsed / equity) * 100 : 0;
    const leverageScore =
      leverageMultiplier > 1
        ? Math.min(30, ((leverageMultiplier - 1) / 4) * 30) // Leverage 1-5x mapped to 0-30 points
        : Math.min(30, (marginPercent / 50) * 30); // Or use margin utilization if available
    score += leverageScore;

    // Determine risk level
    let level = 'LOW';
    if (score >= 70) level = 'HIGH';
    else if (score >= 40) level = 'MEDIUM';

    return {
      score: Math.round(score),
      level,
      positionPercent: positionPercent.toFixed(2),
      stopLossDistance: stopLossDistance.toFixed(2),
      notionalValue: notionalValue.toFixed(2)
    };
  }

  /**
   * Get user-specific risk configuration (or defaults)
   *
   * @param {Object} user - User model instance
   * @returns {Object} Risk configuration
   * @private
   */
  _getUserRiskConfig(user) {
    if (user.riskSettings && Object.keys(user.riskSettings).length > 0) {
      return { ...DEFAULT_RISK_CONFIG, ...user.riskSettings };
    }
    return DEFAULT_RISK_CONFIG;
  }

  /**
   * Audit risk decision to immutable log
   *
   * @param {string} userId - User ID
   * @param {Object} signal - Trade signal
   * @param {Object} result - Validation result
   * @param {string} decision - Decision code
   * @returns {Promise<void>}
   * @private
   */
  async _auditDecision(userId, signal, result, decision) {
    await this.auditLog.log({
      userId,
      action: 'RISK_VALIDATION',
      category: 'RISK_MANAGEMENT',
      severity: result.approved ? 'INFO' : 'WARNING',
      metadata: {
        decision,
        signal: {
          symbol: signal.symbol,
          action: signal.action,
          requestedQuantity: signal.quantity,
          price: signal.price
        },
        result: {
          approved: result.approved,
          adjustedQuantity: result.adjustedQuantity,
          reason: result.reason,
          riskScore: result.riskScore,
          action: result.action
        }
      },
      ipAddress: 'system'
    });
  }

  /**
   * Reset circuit breaker for user (admin function)
   *
   * @param {string} userId - User ID
   * @param {string} adminId - Admin user ID performing reset
   * @returns {Promise<void>}
   */
  async resetCircuitBreaker(userId, adminId) {
    if (!this.circuitBreakerActive.has(userId)) {
      throw new Error('Circuit breaker not active for user');
    }

    this.circuitBreakerActive.delete(userId);

    await User.findByIdAndUpdate(userId, {
      'accountStatus.trading': true,
      'accountStatus.circuitBreakerActive': false,
      'accountStatus.circuitBreakerResetAt': new Date(),
      'accountStatus.circuitBreakerResetBy': adminId
    });

    await this.auditLog.log({
      userId,
      action: 'CIRCUIT_BREAKER_RESET',
      category: 'RISK_MANAGEMENT',
      severity: 'HIGH',
      metadata: {
        adminId,
        timestamp: new Date()
      },
      ipAddress: 'admin'
    });

    logger.info('Circuit breaker reset', { userId, adminId });
  }

  /**
   * Get risk status for user (dashboard display)
   *
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Risk status summary
   */
  async getRiskStatus(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const riskConfig = this._getUserRiskConfig(user);
    const dailyPnL = await this._getDailyPnL(userId);

    // Support multiple accounts - use primary account or aggregate equity
    let accountInfo;
    if (user.brokerAccounts && user.brokerAccounts.length > 0) {
      const primaryAccount = user.brokerAccounts.find(acc => acc.isPrimary) || user.brokerAccounts[0];
      accountInfo = primaryAccount;

      // If user has multiple accounts, aggregate total equity
      if (user.brokerAccounts.length > 1) {
        const totalEquity = user.brokerAccounts.reduce((sum, acc) => sum + (acc.equity || 0), 0);
        accountInfo = { ...primaryAccount, equity: totalEquity, isAggregated: true };
      }
    }

    if (!accountInfo || !accountInfo.equity) {
      return {
        status: 'UNKNOWN',
        message: 'Account information unavailable'
      };
    }

    const dailyLossLimit = accountInfo.equity * (riskConfig.maxDailyLossPercent / 100);
    const intradayDrawdown = this._calculateIntradayDrawdown(dailyPnL, accountInfo.equity);
    const circuitBreakerActive = this.circuitBreakerActive.has(userId);

    return {
      status: circuitBreakerActive ? 'CIRCUIT_BREAKER' : dailyPnL < -dailyLossLimit ? 'DAILY_LIMIT_EXCEEDED' : 'ACTIVE',
      circuitBreakerActive,
      tradingEnabled: user.accountStatus?.trading !== false,
      dailyPnL: dailyPnL.toFixed(2),
      dailyLossLimit: dailyLossLimit.toFixed(2),
      dailyLossPercent: ((dailyPnL / accountInfo.equity) * 100).toFixed(2),
      intradayDrawdown: intradayDrawdown.toFixed(2),
      riskConfig,
      lastUpdated: new Date()
    };
  }
}

module.exports = new RiskManagementService();
module.exports.RiskManagementService = RiskManagementService; // For testing
module.exports.DEFAULT_RISK_CONFIG = DEFAULT_RISK_CONFIG;
