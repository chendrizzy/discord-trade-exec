const logger = require('../../../utils/logger');

/**
 * WebSocket Emitter Functions
 *
 * Convenience methods for emitting real-time updates to clients
 * Wraps WebSocketServer.emitToUser() with domain-specific APIs
 *
 * Emitted Events (Server -> Client):
 * - portfolio:updated - Portfolio value and positions changed
 * - trade:executed - Trade successfully executed
 * - trade:failed - Trade execution failed
 * - watchlist:quote - Live quote update for watchlist symbol
 * - position:closed - Position closed notification
 *
 * Usage:
 *   const emitters = createEmitters(webSocketServer);
 *   emitters.emitPortfolioUpdate(userId, portfolioData);
 *   emitters.emitTradeExecuted(userId, tradeData);
 */

/**
 * Create WebSocket emitter functions
 * @param {WebSocketServer} webSocketServer - WebSocket server instance
 * @returns {Object} Emitter functions
 */
function createEmitters(webSocketServer) {
  /**
   * Emit portfolio update to user
   * Sends real-time portfolio value and position changes
   *
   * @param {string} userId - User ID
   * @param {Object} portfolioData - Portfolio data
   * @param {number} portfolioData.totalValue - Total portfolio value
   * @param {number} portfolioData.cash - Available cash balance
   * @param {number} portfolioData.equity - Total equity value
   * @param {Array} portfolioData.positions - Open positions
   * @param {number} portfolioData.dayChange - Day change in dollars
   * @param {number} portfolioData.dayChangePercent - Day change percentage
   */
  function emitPortfolioUpdate(userId, portfolioData) {
    try {
      if (!webSocketServer) {
        logger.warn('Cannot emit portfolio update: WebSocket server not initialized');
        return;
      }

      const room = `portfolio:${userId}`;
      webSocketServer.emitToRoom(room, 'portfolio:updated', {
        userId,
        portfolio: portfolioData,
        timestamp: new Date().toISOString()
      });

      logger.debug(`Emitted portfolio update to user ${userId}`, {
        totalValue: portfolioData.totalValue,
        positionCount: portfolioData.positions?.length || 0
      });
    } catch (error) {
      logger.error('Error emitting portfolio update:', error);
    }
  }

  /**
   * Emit trade executed notification
   * Sends real-time trade execution success notification
   *
   * @param {string} userId - User ID
   * @param {Object} tradeData - Trade execution data
   * @param {string} tradeData.id - Trade ID
   * @param {string} tradeData.symbol - Trading symbol
   * @param {string} tradeData.side - buy/sell
   * @param {number} tradeData.quantity - Number of shares/contracts
   * @param {number} tradeData.price - Execution price
   * @param {string} tradeData.broker - Broker used
   * @param {string} tradeData.orderId - Broker order ID
   */
  function emitTradeExecuted(userId, tradeData) {
    try {
      if (!webSocketServer) {
        logger.warn('Cannot emit trade executed: WebSocket server not initialized');
        return;
      }

      const room = `trades:${userId}`;
      webSocketServer.emitToRoom(room, 'trade:executed', {
        userId,
        trade: tradeData,
        timestamp: new Date().toISOString(),
        notification: {
          title: `Trade Executed: ${tradeData.symbol}`,
          message: `${tradeData.side.toUpperCase()} ${tradeData.quantity} ${tradeData.symbol} @ $${tradeData.price}`,
          type: 'success'
        }
      });

      logger.info(`Emitted trade executed notification to user ${userId}`, {
        symbol: tradeData.symbol,
        side: tradeData.side,
        quantity: tradeData.quantity,
        price: tradeData.price
      });
    } catch (error) {
      logger.error('Error emitting trade executed:', error);
    }
  }

  /**
   * Emit trade failed notification
   * Sends real-time trade execution failure notification
   *
   * @param {string} userId - User ID
   * @param {Object} errorData - Trade failure data
   * @param {string} errorData.symbol - Trading symbol
   * @param {string} errorData.side - buy/sell
   * @param {number} errorData.quantity - Attempted quantity
   * @param {string} errorData.reason - Failure reason
   * @param {string} errorData.broker - Broker attempted
   */
  function emitTradeFailed(userId, errorData) {
    try {
      if (!webSocketServer) {
        logger.warn('Cannot emit trade failed: WebSocket server not initialized');
        return;
      }

      const room = `trades:${userId}`;
      webSocketServer.emitToRoom(room, 'trade:failed', {
        userId,
        error: errorData,
        timestamp: new Date().toISOString(),
        notification: {
          title: `Trade Failed: ${errorData.symbol}`,
          message: `${errorData.side.toUpperCase()} ${errorData.quantity} ${errorData.symbol} - ${errorData.reason}`,
          type: 'error'
        }
      });

      logger.warn(`Emitted trade failed notification to user ${userId}`, {
        symbol: errorData.symbol,
        reason: errorData.reason
      });
    } catch (error) {
      logger.error('Error emitting trade failed:', error);
    }
  }

  /**
   * Emit watchlist quote update
   * Sends real-time quote update for a watchlist symbol
   *
   * @param {string} symbol - Trading symbol
   * @param {Object} quoteData - Quote data
   * @param {number} quoteData.price - Current price
   * @param {number} quoteData.change - Price change
   * @param {number} quoteData.changePercent - Price change percentage
   * @param {number} quoteData.volume - Trading volume
   * @param {number} quoteData.high - Day high
   * @param {number} quoteData.low - Day low
   * @param {number} quoteData.open - Opening price
   */
  function emitWatchlistQuote(symbol, quoteData) {
    try {
      if (!webSocketServer) {
        logger.warn('Cannot emit watchlist quote: WebSocket server not initialized');
        return;
      }

      const room = `watchlist:${symbol.toUpperCase()}`;
      webSocketServer.emitToRoom(room, 'watchlist:quote', {
        symbol: symbol.toUpperCase(),
        quote: quoteData,
        timestamp: new Date().toISOString()
      });

      logger.debug(`Emitted watchlist quote for ${symbol}`, {
        price: quoteData.price,
        change: quoteData.change
      });
    } catch (error) {
      logger.error('Error emitting watchlist quote:', error);
    }
  }

  /**
   * Emit position closed notification
   * Sends notification when a position is closed
   *
   * @param {string} userId - User ID
   * @param {Object} positionData - Position data
   * @param {string} positionData.symbol - Trading symbol
   * @param {number} positionData.quantity - Position quantity
   * @param {number} positionData.entryPrice - Entry price
   * @param {number} positionData.exitPrice - Exit price
   * @param {number} positionData.pnl - Profit/loss
   * @param {number} positionData.pnlPercent - P&L percentage
   */
  function emitPositionClosed(userId, positionData) {
    try {
      if (!webSocketServer) {
        logger.warn('Cannot emit position closed: WebSocket server not initialized');
        return;
      }

      const room = `trades:${userId}`;
      webSocketServer.emitToRoom(room, 'position:closed', {
        userId,
        position: positionData,
        timestamp: new Date().toISOString(),
        notification: {
          title: `Position Closed: ${positionData.symbol}`,
          message: `P&L: ${positionData.pnl >= 0 ? '+' : ''}$${positionData.pnl.toFixed(2)} (${positionData.pnlPercent.toFixed(2)}%)`,
          type: positionData.pnl >= 0 ? 'success' : 'warning'
        }
      });

      logger.info(`Emitted position closed notification to user ${userId}`, {
        symbol: positionData.symbol,
        pnl: positionData.pnl
      });
    } catch (error) {
      logger.error('Error emitting position closed:', error);
    }
  }

  /**
   * Emit system notification
   * Sends general system notification to user
   *
   * @param {string} userId - User ID
   * @param {Object} notification - Notification data
   * @param {string} notification.title - Notification title
   * @param {string} notification.message - Notification message
   * @param {string} notification.type - Notification type (info/success/warning/error)
   * @param {Object} notification.data - Additional data
   */
  function emitNotification(userId, notification) {
    try {
      if (!webSocketServer) {
        logger.warn('Cannot emit notification: WebSocket server not initialized');
        return;
      }

      webSocketServer.emitToUser(userId, 'notification', {
        userId,
        notification,
        timestamp: new Date().toISOString()
      });

      logger.debug(`Emitted notification to user ${userId}`, {
        title: notification.title,
        type: notification.type
      });
    } catch (error) {
      logger.error('Error emitting notification:', error);
    }
  }

  /**
   * Emit market status update
   * Sends market open/close status to all connected clients
   *
   * @param {Object} marketData - Market status data
   * @param {boolean} marketData.isOpen - Is market currently open
   * @param {string} marketData.market - Market name (e.g., 'NYSE', 'NASDAQ')
   * @param {string} marketData.nextOpen - Next market open time
   * @param {string} marketData.nextClose - Next market close time
   */
  function emitMarketStatus(marketData) {
    try {
      if (!webSocketServer) {
        logger.warn('Cannot emit market status: WebSocket server not initialized');
        return;
      }

      webSocketServer.emitToAll('market:status', {
        market: marketData,
        timestamp: new Date().toISOString()
      });

      logger.info(`Emitted market status update`, {
        market: marketData.market,
        isOpen: marketData.isOpen
      });
    } catch (error) {
      logger.error('Error emitting market status:', error);
    }
  }

  // Return all emitter functions
  return {
    emitPortfolioUpdate,
    emitTradeExecuted,
    emitTradeFailed,
    emitWatchlistQuote,
    emitPositionClosed,
    emitNotification,
    emitMarketStatus
  };
}

module.exports = {
  createEmitters
};
