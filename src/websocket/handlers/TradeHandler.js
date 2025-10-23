'use strict';

/**
 * WebSocket Trade Event Handler
 *
 * Emits real-time trade events to connected clients:
 * - trade.created: New trade initiated
 * - trade.submitted: Order submitted to broker
 * - trade.filled: Order completely filled
 * - trade.partial: Partial fill occurred
 * - trade.cancelled: Order cancelled
 * - trade.failed: Execution failure
 * - trade.rejected: Risk management rejected trade
 *
 * Constitutional Requirements:
 * - Principle IV: Real-Time Standards (latency <100ms for trade events)
 * - Principle VI: Observability (structured event logging)
 *
 * User Story: US-003 (Real-Time Dashboard Updates)
 */

const { emitToUser } = require('../socketServer');
const logger = require('../../middleware/logger');
const Trade = require('../../models/Trade');

class TradeHandler {
  /**
   * Initialize TradeHandler with Socket.IO server instance
   *
   * @param {Server} io - Socket.IO server instance
   */
  constructor(io) {
    this.io = io;
    this.eventTypes = {
      CREATED: 'trade.created',
      SUBMITTED: 'trade.submitted',
      FILLED: 'trade.filled',
      PARTIAL: 'trade.partial',
      CANCELLED: 'trade.cancelled',
      FAILED: 'trade.failed',
      REJECTED: 'trade.rejected',
      UPDATED: 'trade.updated'
    };

    logger.info('TradeHandler initialized');
  }

  /**
   * Emit trade created event (trade initiated from Discord signal)
   *
   * @param {string} userId - User ID who owns the trade
   * @param {Object} trade - Trade object or Trade document
   */
  emitTradeCreated(userId, trade) {
    const payload = this._formatTradePayload(trade, {
      status: 'CREATED',
      message: 'Trade initiated successfully'
    });

    emitToUser(this.io, userId, this.eventTypes.CREATED, payload);

    logger.info('Trade created event emitted', {
      userId,
      tradeId: trade._id || trade.id,
      symbol: trade.symbol
    });
  }

  /**
   * Emit trade submitted event (order sent to broker)
   *
   * @param {string} userId - User ID who owns the trade
   * @param {Object} trade - Trade object with broker order ID
   */
  emitTradeSubmitted(userId, trade) {
    const payload = this._formatTradePayload(trade, {
      status: 'SUBMITTED',
      message: 'Order submitted to broker successfully',
      brokerOrderId: trade.brokerOrderId
    });

    emitToUser(this.io, userId, this.eventTypes.SUBMITTED, payload);

    logger.info('Trade submitted event emitted', {
      userId,
      tradeId: trade._id || trade.id,
      brokerOrderId: trade.brokerOrderId,
      broker: trade.broker
    });
  }

  /**
   * Emit trade filled event (order completely filled)
   *
   * @param {string} userId - User ID who owns the trade
   * @param {Object} trade - Trade object with fill details
   */
  emitTradeFilled(userId, trade) {
    const payload = this._formatTradePayload(trade, {
      status: 'FILLED',
      message: 'Order filled successfully',
      filledQuantity: trade.filledQuantity || trade.quantity,
      filledPrice: trade.executedPrice || trade.averagePrice,
      totalCost: this._calculateTotalCost(trade),
      pnl: trade.pnl || 0
    });

    emitToUser(this.io, userId, this.eventTypes.FILLED, payload);

    logger.info('Trade filled event emitted', {
      userId,
      tradeId: trade._id || trade.id,
      symbol: trade.symbol,
      filledQuantity: trade.filledQuantity || trade.quantity,
      executedPrice: trade.executedPrice || trade.averagePrice
    });
  }

  /**
   * Emit trade partial fill event (order partially filled)
   *
   * @param {string} userId - User ID who owns the trade
   * @param {Object} trade - Trade object with partial fill details
   */
  emitTradePartial(userId, trade) {
    const remainingQuantity = (trade.quantity || 0) - (trade.filledQuantity || 0);
    const fillPercentage = ((trade.filledQuantity || 0) / (trade.quantity || 1)) * 100;

    const payload = this._formatTradePayload(trade, {
      status: 'PARTIAL',
      message: `Order partially filled: ${fillPercentage.toFixed(2)}% complete`,
      filledQuantity: trade.filledQuantity || 0,
      remainingQuantity,
      fillPercentage: parseFloat(fillPercentage.toFixed(2)),
      averagePrice: trade.executedPrice || trade.averagePrice
    });

    emitToUser(this.io, userId, this.eventTypes.PARTIAL, payload);

    logger.info('Trade partial fill event emitted', {
      userId,
      tradeId: trade._id || trade.id,
      symbol: trade.symbol,
      filledQuantity: trade.filledQuantity,
      totalQuantity: trade.quantity,
      fillPercentage
    });
  }

  /**
   * Emit trade cancelled event (order cancelled by user or system)
   *
   * @param {string} userId - User ID who owns the trade
   * @param {Object} trade - Trade object
   * @param {string} reason - Cancellation reason
   */
  emitTradeCancelled(userId, trade, reason = 'User requested cancellation') {
    const payload = this._formatTradePayload(trade, {
      status: 'CANCELLED',
      message: 'Order cancelled',
      reason,
      filledQuantity: trade.filledQuantity || 0,
      cancelledQuantity: (trade.quantity || 0) - (trade.filledQuantity || 0)
    });

    emitToUser(this.io, userId, this.eventTypes.CANCELLED, payload);

    logger.info('Trade cancelled event emitted', {
      userId,
      tradeId: trade._id || trade.id,
      symbol: trade.symbol,
      reason
    });
  }

  /**
   * Emit trade failed event (execution failure at broker)
   *
   * @param {string} userId - User ID who owns the trade
   * @param {Object} trade - Trade object
   * @param {string} errorMessage - Failure reason
   */
  emitTradeFailed(userId, trade, errorMessage = 'Unknown error') {
    const payload = this._formatTradePayload(trade, {
      status: 'FAILED',
      message: 'Trade execution failed',
      error: this._sanitizeErrorMessage(errorMessage),
      canRetry: this._canRetryTrade(errorMessage)
    });

    emitToUser(this.io, userId, this.eventTypes.FAILED, payload);

    logger.warn('Trade failed event emitted', {
      userId,
      tradeId: trade._id || trade.id,
      symbol: trade.symbol,
      error: errorMessage
    });
  }

  /**
   * Emit trade rejected event (risk management rejection)
   *
   * @param {string} userId - User ID who owns the trade
   * @param {Object} trade - Trade object (may be incomplete)
   * @param {string} rejectionReason - Why trade was rejected
   * @param {Object} riskDetails - Risk management details
   */
  emitTradeRejected(userId, trade, rejectionReason, riskDetails = {}) {
    const payload = this._formatTradePayload(trade, {
      status: 'REJECTED',
      message: 'Trade rejected by risk management',
      reason: rejectionReason,
      riskDetails: {
        maxPositionSize: riskDetails.maxPositionSize,
        currentExposure: riskDetails.currentExposure,
        dailyLossLimit: riskDetails.dailyLossLimit,
        currentDailyLoss: riskDetails.currentDailyLoss,
        accountBalance: riskDetails.accountBalance
      }
    });

    emitToUser(this.io, userId, this.eventTypes.REJECTED, payload);

    logger.warn('Trade rejected event emitted', {
      userId,
      symbol: trade.symbol,
      reason: rejectionReason,
      riskDetails
    });
  }

  /**
   * Emit trade updated event (status change or modification)
   *
   * @param {string} userId - User ID who owns the trade
   * @param {Object} trade - Updated trade object
   * @param {Object} changes - What changed
   */
  emitTradeUpdated(userId, trade, changes = {}) {
    const payload = this._formatTradePayload(trade, {
      status: 'UPDATED',
      message: 'Trade updated',
      changes: {
        status: changes.status,
        filledQuantity: changes.filledQuantity,
        executedPrice: changes.executedPrice,
        updatedFields: Object.keys(changes)
      }
    });

    emitToUser(this.io, userId, this.eventTypes.UPDATED, payload);

    logger.debug('Trade updated event emitted', {
      userId,
      tradeId: trade._id || trade.id,
      changes: Object.keys(changes)
    });
  }

  /**
   * Start watching Trade model for changes (MongoDB Change Streams)
   * Automatically emits events when trade status changes
   */
  startWatchingTrades() {
    if (!Trade.watch) {
      logger.warn('MongoDB Change Streams not available. Real-time trade updates disabled.');
      return;
    }

    const changeStream = Trade.watch([], {
      fullDocument: 'updateLookup'
    });

    changeStream.on('change', async change => {
      try {
        if (change.operationType === 'update' || change.operationType === 'replace') {
          const trade = change.fullDocument;

          if (!trade || !trade.userId) {
            return;
          }

          const userId = trade.userId.toString();
          const updatedFields = change.updateDescription?.updatedFields || {};

          // Detect status changes and emit appropriate events
          if (updatedFields.status) {
            const status = updatedFields.status;

            switch (status) {
              case 'FILLED':
                this.emitTradeFilled(userId, trade);
                break;
              case 'PARTIAL':
                this.emitTradePartial(userId, trade);
                break;
              case 'CANCELLED':
                this.emitTradeCancelled(userId, trade, trade.cancellationReason);
                break;
              case 'FAILED':
                this.emitTradeFailed(userId, trade, trade.errorMessage);
                break;
              case 'REJECTED':
                this.emitTradeRejected(userId, trade, trade.rejectionReason);
                break;
              default:
                this.emitTradeUpdated(userId, trade, updatedFields);
            }
          } else if (Object.keys(updatedFields).length > 0) {
            // Other field updates (price, quantity, etc.)
            this.emitTradeUpdated(userId, trade, updatedFields);
          }
        } else if (change.operationType === 'insert') {
          const trade = change.fullDocument;

          if (trade && trade.userId) {
            const userId = trade.userId.toString();
            this.emitTradeCreated(userId, trade);
          }
        }
      } catch (error) {
        logger.error('Error processing trade change stream event', {
          error: error.message,
          changeType: change.operationType
        });
      }
    });

    changeStream.on('error', error => {
      logger.error('Trade change stream error', {
        error: error.message,
        stack: error.stack
      });

      // Attempt to restart change stream after 5 seconds
      setTimeout(() => {
        logger.info('Attempting to restart trade change stream...');
        this.startWatchingTrades();
      }, 5000);
    });

    logger.info('Trade change stream initialized - real-time updates enabled');

    return changeStream;
  }

  /**
   * Format trade payload for WebSocket emission
   *
   * @private
   * @param {Object} trade - Trade object
   * @param {Object} additionalData - Additional event-specific data
   * @returns {Object} Formatted payload
   */
  _formatTradePayload(trade, additionalData = {}) {
    return {
      tradeId: trade._id?.toString() || trade.id,
      symbol: trade.symbol,
      side: trade.side,
      quantity: trade.quantity,
      orderType: trade.orderType || trade.type,
      broker: trade.broker,
      status: trade.status,
      entryPrice: trade.entryPrice || trade.price,
      executedPrice: trade.executedPrice || trade.averagePrice,
      filledQuantity: trade.filledQuantity || 0,
      brokerOrderId: trade.brokerOrderId,
      signalSource: trade.signalSource,
      createdAt: trade.createdAt,
      updatedAt: trade.updatedAt || new Date(),
      ...additionalData
    };
  }

  /**
   * Calculate total cost of trade (quantity * price + fees)
   *
   * @private
   * @param {Object} trade - Trade object
   * @returns {number} Total cost
   */
  _calculateTotalCost(trade) {
    const price = trade.executedPrice || trade.averagePrice || trade.entryPrice || 0;
    const quantity = trade.filledQuantity || trade.quantity || 0;
    const fees = trade.fees || 0;

    return price * quantity + fees;
  }

  /**
   * Sanitize error messages for client consumption
   *
   * @private
   * @param {string} errorMessage - Raw error message
   * @returns {string} Sanitized error message
   */
  _sanitizeErrorMessage(errorMessage) {
    // Remove sensitive information (API keys, internal paths, etc.)
    const sanitized = errorMessage
      .replace(/[A-Za-z0-9]{20,}/g, '[REDACTED]') // API keys
      .replace(/\/[\w\/]+\.js/g, '[PATH]') // File paths
      .replace(/localhost:\d+/g, '[HOST]') // Internal hosts
      .replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, '[IP]'); // IP addresses

    // Map common error messages to user-friendly versions
    const errorMap = {
      'insufficient buying power': 'Insufficient funds in broker account',
      'rate limit exceeded': 'Broker API rate limit reached. Please try again in a moment.',
      'invalid symbol': 'Trading symbol not supported by broker',
      'market closed': 'Market is currently closed. Try again during trading hours.',
      'connection timeout': 'Broker connection timeout. Please try again.',
      'unauthorized': 'Broker authentication failed. Please reconnect your account.'
    };

    for (const [key, value] of Object.entries(errorMap)) {
      if (sanitized.toLowerCase().includes(key)) {
        return value;
      }
    }

    return sanitized.substring(0, 200); // Limit error message length
  }

  /**
   * Determine if a failed trade can be retried
   *
   * @private
   * @param {string} errorMessage - Error message
   * @returns {boolean} True if trade can be retried
   */
  _canRetryTrade(errorMessage) {
    const retryableErrors = [
      'rate limit exceeded',
      'connection timeout',
      'network error',
      'service unavailable',
      'temporary failure',
      'timeout'
    ];

    const errorLower = errorMessage.toLowerCase();
    return retryableErrors.some(err => errorLower.includes(err));
  }
}

module.exports = TradeHandler;
