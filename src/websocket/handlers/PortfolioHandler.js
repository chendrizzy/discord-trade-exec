'use strict';

/**
 * WebSocket Portfolio Event Handler
 *
 * Emits real-time portfolio events to connected clients:
 * - portfolio.updated: Position changes (open/close)
 * - portfolio.balance: Account balance updates
 * - portfolio.pnl: P&L calculations and updates
 * - portfolio.margin: Margin level warnings
 * - portfolio.sync: Full portfolio state synchronization
 *
 * Constitutional Requirements:
 * - Principle IV: Real-Time Standards (1Hz update frequency for market data)
 * - Principle VI: Observability (portfolio state tracking)
 *
 * User Story: US-003 (Real-Time Dashboard Updates)
 */

const { emitToUser } = require('../socketServer');
const logger = require('../../middleware/logger');
const Position = require('../../models/Position');
const User = require('../../models/User');

class PortfolioHandler {
  /**
   * Initialize PortfolioHandler with Socket.IO server instance
   *
   * @param {Server} io - Socket.IO server instance
   */
  constructor(io) {
    this.io = io;
    this.eventTypes = {
      UPDATED: 'portfolio.updated',
      BALANCE: 'portfolio.balance',
      PNL: 'portfolio.pnl',
      MARGIN: 'portfolio.margin',
      SYNC: 'portfolio.sync',
      POSITION_OPENED: 'portfolio.position.opened',
      POSITION_CLOSED: 'portfolio.position.closed',
      POSITION_MODIFIED: 'portfolio.position.modified'
    };

    // Throttle settings for market data updates (Constitutional Principle IV: 1Hz)
    this.updateThrottleMs = 1000; // 1 second (1Hz)
    this.lastUpdateTimestamps = new Map(); // userId -> timestamp

    logger.info('PortfolioHandler initialized');
  }

  /**
   * Emit portfolio updated event (position change)
   *
   * @param {string} userId - User ID
   * @param {Object} portfolioData - Portfolio summary data
   */
  emitPortfolioUpdated(userId, portfolioData) {
    // Throttle updates to 1Hz per user (Constitutional Principle IV)
    if (!this._shouldEmitUpdate(userId)) {
      logger.debug('Portfolio update throttled', { userId });
      return;
    }

    const payload = {
      positions: portfolioData.positions || [],
      totalValue: portfolioData.totalValue || 0,
      cash: portfolioData.cash || 0,
      equity: portfolioData.equity || 0,
      buyingPower: portfolioData.buyingPower || 0,
      marginUsed: portfolioData.marginUsed || 0,
      totalPnL: portfolioData.totalPnL || 0,
      totalPnLPercent: portfolioData.totalPnLPercent || 0,
      dayPnL: portfolioData.dayPnL || 0,
      dayPnLPercent: portfolioData.dayPnLPercent || 0,
      positionCount: portfolioData.positions?.length || 0,
      updatedAt: new Date().toISOString()
    };

    emitToUser(this.io, userId, this.eventTypes.UPDATED, payload);

    this._markUpdateEmitted(userId);

    logger.info('Portfolio updated event emitted', {
      userId,
      positionCount: payload.positionCount,
      totalValue: payload.totalValue
    });
  }

  /**
   * Emit balance updated event (cash/equity change)
   *
   * @param {string} userId - User ID
   * @param {Object} balanceData - Balance details
   */
  emitBalanceUpdated(userId, balanceData) {
    const payload = {
      cash: balanceData.cash || 0,
      equity: balanceData.equity || 0,
      totalValue: balanceData.totalValue || balanceData.equity || 0,
      buyingPower: balanceData.buyingPower || 0,
      marginUsed: balanceData.marginUsed || 0,
      marginLevel: balanceData.marginLevel || 0,
      previousEquity: balanceData.previousEquity || 0,
      change: (balanceData.equity || 0) - (balanceData.previousEquity || 0),
      changePercent: this._calculatePercentChange(balanceData.previousEquity, balanceData.equity),
      currency: balanceData.currency || 'USD',
      broker: balanceData.broker,
      updatedAt: new Date().toISOString()
    };

    emitToUser(this.io, userId, this.eventTypes.BALANCE, payload);

    logger.info('Balance updated event emitted', {
      userId,
      equity: payload.equity,
      change: payload.change,
      broker: payload.broker
    });
  }

  /**
   * Emit P&L updated event (profit/loss calculation)
   *
   * @param {string} userId - User ID
   * @param {Object} pnlData - P&L details
   */
  emitPnLUpdated(userId, pnlData) {
    // Throttle P&L updates to 1Hz
    if (!this._shouldEmitUpdate(userId, 'pnl')) {
      return;
    }

    const payload = {
      totalPnL: pnlData.totalPnL || 0,
      totalPnLPercent: pnlData.totalPnLPercent || 0,
      realizedPnL: pnlData.realizedPnL || 0,
      unrealizedPnL: pnlData.unrealizedPnL || 0,
      dayPnL: pnlData.dayPnL || 0,
      dayPnLPercent: pnlData.dayPnLPercent || 0,
      weekPnL: pnlData.weekPnL || 0,
      monthPnL: pnlData.monthPnL || 0,
      yearPnL: pnlData.yearPnL || 0,
      bestPerformer: pnlData.bestPerformer,
      worstPerformer: pnlData.worstPerformer,
      currency: pnlData.currency || 'USD',
      updatedAt: new Date().toISOString()
    };

    emitToUser(this.io, userId, this.eventTypes.PNL, payload);

    this._markUpdateEmitted(userId, 'pnl');

    logger.info('P&L updated event emitted', {
      userId,
      totalPnL: payload.totalPnL,
      dayPnL: payload.dayPnL
    });
  }

  /**
   * Emit margin warning event (margin level critical)
   *
   * @param {string} userId - User ID
   * @param {Object} marginData - Margin details
   */
  emitMarginWarning(userId, marginData) {
    const marginLevel = marginData.marginLevel || 0;
    const severity = marginLevel < 25 ? 'CRITICAL' : marginLevel < 50 ? 'WARNING' : 'INFO';

    const payload = {
      marginLevel,
      marginUsed: marginData.marginUsed || 0,
      marginAvailable: marginData.marginAvailable || 0,
      equity: marginData.equity || 0,
      severity,
      message: this._getMarginMessage(marginLevel, severity),
      recommendedAction:
        severity === 'CRITICAL'
          ? 'Close positions or add funds immediately to avoid liquidation'
          : severity === 'WARNING'
            ? 'Consider reducing position sizes or adding funds'
            : 'Margin levels healthy',
      broker: marginData.broker,
      updatedAt: new Date().toISOString()
    };

    emitToUser(this.io, userId, this.eventTypes.MARGIN, payload);

    logger.warn('Margin warning emitted', {
      userId,
      marginLevel,
      severity,
      broker: marginData.broker
    });
  }

  /**
   * Emit position opened event
   *
   * @param {string} userId - User ID
   * @param {Object} position - Position details
   */
  emitPositionOpened(userId, position) {
    const payload = this._formatPositionPayload(position, {
      action: 'OPENED',
      message: `New ${position.side} position opened: ${position.symbol}`
    });

    emitToUser(this.io, userId, this.eventTypes.POSITION_OPENED, payload);

    logger.info('Position opened event emitted', {
      userId,
      positionId: position._id || position.id,
      symbol: position.symbol,
      side: position.side
    });
  }

  /**
   * Emit position closed event
   *
   * @param {string} userId - User ID
   * @param {Object} position - Position details
   */
  emitPositionClosed(userId, position) {
    const payload = this._formatPositionPayload(position, {
      action: 'CLOSED',
      message: `Position closed: ${position.symbol}`,
      realizedPnL: position.realizedPnL || 0,
      realizedPnLPercent: this._calculatePercentChange(position.costBasis, position.exitValue || position.marketValue)
    });

    emitToUser(this.io, userId, this.eventTypes.POSITION_CLOSED, payload);

    logger.info('Position closed event emitted', {
      userId,
      positionId: position._id || position.id,
      symbol: position.symbol,
      realizedPnL: position.realizedPnL
    });
  }

  /**
   * Emit position modified event (size change, stop-loss update, etc.)
   *
   * @param {string} userId - User ID
   * @param {Object} position - Updated position details
   * @param {Object} changes - What changed
   */
  emitPositionModified(userId, position, changes = {}) {
    const payload = this._formatPositionPayload(position, {
      action: 'MODIFIED',
      message: `Position modified: ${position.symbol}`,
      changes: {
        quantity: changes.quantity,
        stopLoss: changes.stopLoss,
        takeProfit: changes.takeProfit,
        updatedFields: Object.keys(changes)
      }
    });

    emitToUser(this.io, userId, this.eventTypes.POSITION_MODIFIED, payload);

    logger.info('Position modified event emitted', {
      userId,
      positionId: position._id || position.id,
      symbol: position.symbol,
      changes: Object.keys(changes)
    });
  }

  /**
   * Emit full portfolio synchronization (on reconnection or request)
   *
   * @param {string} userId - User ID
   */
  async emitPortfolioSync(userId) {
    try {
      // Fetch user's current positions
      const positions = await Position.find({
        userId,
        status: 'OPEN'
      })
        .sort({ openedAt: -1 })
        .lean();

      // Fetch user's account balance from broker connections
      const user = await User.findById(userId).lean();
      const brokerBalances = await this._fetchBrokerBalances(user);

      // Calculate portfolio summary
      const portfolioSummary = this._calculatePortfolioSummary(positions, brokerBalances);

      const payload = {
        positions: positions.map(pos => this._formatPositionPayload(pos)),
        balances: brokerBalances,
        summary: portfolioSummary,
        updatedAt: new Date().toISOString()
      };

      emitToUser(this.io, userId, this.eventTypes.SYNC, payload);

      logger.info('Portfolio sync event emitted', {
        userId,
        positionCount: positions.length,
        brokerCount: brokerBalances.length
      });
    } catch (error) {
      logger.error('Failed to emit portfolio sync', {
        userId,
        error: error.message
      });

      emitToUser(this.io, userId, 'portfolio.sync.error', {
        message: 'Failed to synchronize portfolio data',
        error: 'Please refresh the page or try again later'
      });
    }
  }

  /**
   * Start watching Position model for changes (MongoDB Change Streams)
   * Automatically emits events when positions change
   */
  startWatchingPositions() {
    if (!Position.watch) {
      logger.warn('MongoDB Change Streams not available. Real-time portfolio updates disabled.');
      return;
    }

    const changeStream = Position.watch([], {
      fullDocument: 'updateLookup'
    });

    changeStream.on('change', async change => {
      try {
        if (change.operationType === 'insert') {
          // New position opened
          const position = change.fullDocument;
          if (position && position.userId) {
            const userId = position.userId.toString();
            this.emitPositionOpened(userId, position);

            // Also emit portfolio updated
            await this._emitPortfolioUpdateForUser(userId);
          }
        } else if (change.operationType === 'update' || change.operationType === 'replace') {
          const position = change.fullDocument;

          if (!position || !position.userId) {
            return;
          }

          const userId = position.userId.toString();
          const updatedFields = change.updateDescription?.updatedFields || {};

          // Check if position was closed
          if (updatedFields.status === 'CLOSED') {
            this.emitPositionClosed(userId, position);
          } else if (Object.keys(updatedFields).length > 0) {
            this.emitPositionModified(userId, position, updatedFields);
          }

          // Emit portfolio updated
          await this._emitPortfolioUpdateForUser(userId);
        } else if (change.operationType === 'delete') {
          // Position deleted (closed)
          const userId = change.documentKey?._id
            ? (await Position.findById(change.documentKey._id).select('userId').lean())?.userId
            : null;

          if (userId) {
            await this._emitPortfolioUpdateForUser(userId.toString());
          }
        }
      } catch (error) {
        logger.error('Error processing position change stream event', {
          error: error.message,
          changeType: change.operationType
        });
      }
    });

    changeStream.on('error', error => {
      logger.error('Position change stream error', {
        error: error.message,
        stack: error.stack
      });

      // Attempt to restart change stream after 5 seconds
      setTimeout(() => {
        logger.info('Attempting to restart position change stream...');
        this.startWatchingPositions();
      }, 5000);
    });

    logger.info('Position change stream initialized - real-time portfolio updates enabled');

    return changeStream;
  }

  /**
   * Check if update should be emitted (throttling)
   *
   * @private
   * @param {string} userId - User ID
   * @param {string} type - Update type (default: 'portfolio')
   * @returns {boolean} True if update should be emitted
   */
  _shouldEmitUpdate(userId, type = 'portfolio') {
    const key = `${userId}:${type}`;
    const lastUpdate = this.lastUpdateTimestamps.get(key) || 0;
    const now = Date.now();

    return now - lastUpdate >= this.updateThrottleMs;
  }

  /**
   * Mark that an update was emitted
   *
   * @private
   * @param {string} userId - User ID
   * @param {string} type - Update type
   */
  _markUpdateEmitted(userId, type = 'portfolio') {
    const key = `${userId}:${type}`;
    this.lastUpdateTimestamps.set(key, Date.now());

    // Clean up old entries (older than 1 hour)
    if (this.lastUpdateTimestamps.size > 10000) {
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      for (const [k, timestamp] of this.lastUpdateTimestamps.entries()) {
        if (timestamp < oneHourAgo) {
          this.lastUpdateTimestamps.delete(k);
        }
      }
    }
  }

  /**
   * Format position payload for WebSocket emission
   *
   * @private
   * @param {Object} position - Position object
   * @param {Object} additionalData - Additional event-specific data
   * @returns {Object} Formatted payload
   */
  _formatPositionPayload(position, additionalData = {}) {
    return {
      positionId: position._id?.toString() || position.id,
      symbol: position.symbol,
      side: position.side,
      quantity: position.quantity,
      entryPrice: position.entryPrice || position.averageEntryPrice,
      currentPrice: position.currentPrice || position.lastPrice,
      marketValue: position.marketValue,
      costBasis: position.costBasis,
      unrealizedPnL: position.unrealizedPnL || 0,
      unrealizedPnLPercent: position.unrealizedPnLPercent || 0,
      dayPnL: position.dayPnL || 0,
      dayPnLPercent: position.dayPnLPercent || 0,
      broker: position.broker,
      status: position.status,
      openedAt: position.openedAt || position.createdAt,
      updatedAt: position.updatedAt || new Date(),
      ...additionalData
    };
  }

  /**
   * Calculate percentage change
   *
   * @private
   * @param {number} oldValue - Previous value
   * @param {number} newValue - Current value
   * @returns {number} Percentage change
   */
  _calculatePercentChange(oldValue, newValue) {
    if (!oldValue || oldValue === 0) {
      return 0;
    }

    return ((newValue - oldValue) / oldValue) * 100;
  }

  /**
   * Get margin level message
   *
   * @private
   * @param {number} marginLevel - Margin level percentage
   * @param {string} severity - Severity level
   * @returns {string} User-friendly message
   */
  _getMarginMessage(marginLevel, severity) {
    if (severity === 'CRITICAL') {
      return `CRITICAL: Margin level at ${marginLevel.toFixed(2)}%. Liquidation risk!`;
    } else if (severity === 'WARNING') {
      return `WARNING: Margin level at ${marginLevel.toFixed(2)}%. Monitor closely.`;
    } else {
      return `Margin level healthy at ${marginLevel.toFixed(2)}%`;
    }
  }

  /**
   * Fetch broker balances for all connected brokers
   *
   * @private
   * @param {Object} user - User document
   * @returns {Array} Array of broker balance objects
   */
  async _fetchBrokerBalances(user) {
    const balances = [];

    if (!user || !user.brokerConnections) {
      return balances;
    }

    // This would integrate with BrokerFactory to fetch real balances
    // For now, return placeholder data from user model
    for (const connection of user.brokerConnections) {
      if (connection.isActive) {
        balances.push({
          broker: connection.broker,
          cash: connection.balance?.cash || 0,
          equity: connection.balance?.equity || 0,
          buyingPower: connection.balance?.buyingPower || 0,
          currency: connection.balance?.currency || 'USD'
        });
      }
    }

    return balances;
  }

  /**
   * Calculate portfolio summary from positions and balances
   *
   * @private
   * @param {Array} positions - Array of position documents
   * @param {Array} brokerBalances - Array of broker balance objects
   * @returns {Object} Portfolio summary
   */
  _calculatePortfolioSummary(positions, brokerBalances) {
    const totalCash = brokerBalances.reduce((sum, b) => sum + (b.cash || 0), 0);
    const totalEquity = brokerBalances.reduce((sum, b) => sum + (b.equity || 0), 0);
    const totalBuyingPower = brokerBalances.reduce((sum, b) => sum + (b.buyingPower || 0), 0);

    const totalPositionValue = positions.reduce((sum, p) => sum + (p.marketValue || 0), 0);
    const totalUnrealizedPnL = positions.reduce((sum, p) => sum + (p.unrealizedPnL || 0), 0);
    const totalDayPnL = positions.reduce((sum, p) => sum + (p.dayPnL || 0), 0);

    const totalValue = totalEquity + totalPositionValue;

    return {
      totalValue,
      totalCash,
      totalEquity,
      totalBuyingPower,
      totalPositionValue,
      totalUnrealizedPnL,
      totalUnrealizedPnLPercent: this._calculatePercentChange(totalValue - totalUnrealizedPnL, totalValue),
      totalDayPnL,
      totalDayPnLPercent: this._calculatePercentChange(totalValue - totalDayPnL, totalValue),
      positionCount: positions.length,
      currency: 'USD'
    };
  }

  /**
   * Emit portfolio update for a specific user (helper method)
   *
   * @private
   * @param {string} userId - User ID
   */
  async _emitPortfolioUpdateForUser(userId) {
    try {
      const positions = await Position.find({ userId, status: 'OPEN' }).lean();
      const user = await User.findById(userId).lean();
      const brokerBalances = await this._fetchBrokerBalances(user);
      const portfolioSummary = this._calculatePortfolioSummary(positions, brokerBalances);

      this.emitPortfolioUpdated(userId, {
        positions,
        ...portfolioSummary
      });
    } catch (error) {
      logger.error('Failed to emit portfolio update', {
        userId,
        error: error.message
      });
    }
  }
}

module.exports = PortfolioHandler;
