const logger = require('../../../utils/logger');

/**
 * WebSocket Event Handlers
 *
 * Handles all client-to-server WebSocket events:
 * - subscribe:portfolio - Subscribe to real-time portfolio updates
 * - subscribe:trades - Subscribe to trade execution notifications
 * - subscribe:watchlist - Subscribe to live quote updates for symbols
 * - unsubscribe:watchlist - Unsubscribe from watchlist symbols
 *
 * All handlers:
 * - Validate authentication
 * - Check rate limits
 * - Join/leave appropriate Socket.io rooms
 * - Track subscriptions
 * - Emit confirmation to client
 */

/**
 * Create WebSocket event handlers
 * @param {RateLimiter} rateLimiter - Rate limiter instance
 * @returns {Object} Event handler functions
 */
function createEventHandlers(rateLimiter) {
  /**
   * Handle portfolio subscription
   * Subscribes user to real-time portfolio value updates
   */
  const handlePortfolioSubscribe = async (socket, data) => {
    try {
      // Validate authentication
      if (!socket.handshake.auth?.authenticated) {
        socket.emit('error', {
          event: 'subscribe:portfolio',
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        });
        return;
      }

      // Check rate limit
      if (!(await rateLimiter.checkEventLimit(socket, 'subscribe:portfolio'))) {
        socket.emit('error', {
          event: 'subscribe:portfolio',
          code: 'RATE_LIMIT',
          message: 'Too many subscription requests'
        });
        return;
      }

      // Check subscription limit
      if (!(await rateLimiter.checkSubscriptionLimit(socket))) {
        socket.emit('error', {
          event: 'subscribe:portfolio',
          code: 'SUBSCRIPTION_LIMIT',
          message: 'Maximum subscriptions reached'
        });
        return;
      }

      const userId = socket.handshake.auth.userId;

      // Join portfolio room for this user
      const room = `portfolio:${userId}`;
      socket.join(room);

      // Track subscription
      await rateLimiter.incrementSubscription(socket);

      logger.info(`User ${userId} subscribed to portfolio updates`);

      // Confirm subscription
      socket.emit('subscribed:portfolio', {
        success: true,
        userId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error handling portfolio subscription:', error);
      socket.emit('error', {
        event: 'subscribe:portfolio',
        code: 'SERVER_ERROR',
        message: 'Failed to subscribe to portfolio updates'
      });
    }
  };

  /**
   * Handle trade notifications subscription
   * Subscribes user to real-time trade execution and failure notifications
   */
  const handleTradesSubscribe = async (socket, data) => {
    try {
      // Validate authentication
      if (!socket.handshake.auth?.authenticated) {
        socket.emit('error', {
          event: 'subscribe:trades',
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        });
        return;
      }

      // Check rate limit
      if (!(await rateLimiter.checkEventLimit(socket, 'subscribe:trades'))) {
        socket.emit('error', {
          event: 'subscribe:trades',
          code: 'RATE_LIMIT',
          message: 'Too many subscription requests'
        });
        return;
      }

      // Check subscription limit
      if (!(await rateLimiter.checkSubscriptionLimit(socket))) {
        socket.emit('error', {
          event: 'subscribe:trades',
          code: 'SUBSCRIPTION_LIMIT',
          message: 'Maximum subscriptions reached'
        });
        return;
      }

      const userId = socket.handshake.auth.userId;

      // Join trades room for this user
      const room = `trades:${userId}`;
      socket.join(room);

      // Track subscription
      await rateLimiter.incrementSubscription(socket);

      logger.info(`User ${userId} subscribed to trade notifications`);

      // Confirm subscription
      socket.emit('subscribed:trades', {
        success: true,
        userId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error handling trades subscription:', error);
      socket.emit('error', {
        event: 'subscribe:trades',
        code: 'SERVER_ERROR',
        message: 'Failed to subscribe to trade notifications'
      });
    }
  };

  /**
   * Handle watchlist subscription
   * Subscribes user to live quote updates for specified symbols
   * @param {Socket} socket - Socket.io socket
   * @param {Object} data - { symbols: string[] }
   */
  const handleWatchlistSubscribe = async (socket, data) => {
    try {
      // Validate authentication
      if (!socket.handshake.auth?.authenticated) {
        socket.emit('error', {
          event: 'subscribe:watchlist',
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        });
        return;
      }

      // Check rate limit
      if (!(await rateLimiter.checkEventLimit(socket, 'subscribe:watchlist'))) {
        socket.emit('error', {
          event: 'subscribe:watchlist',
          code: 'RATE_LIMIT',
          message: 'Too many subscription requests'
        });
        return;
      }

      // Validate symbols parameter
      if (!data || !Array.isArray(data.symbols) || data.symbols.length === 0) {
        socket.emit('error', {
          event: 'subscribe:watchlist',
          code: 'INVALID_PARAMS',
          message: 'Invalid symbols array'
        });
        return;
      }

      // Limit number of symbols (max 50 per subscription)
      const symbols = data.symbols.slice(0, 50);

      // Check subscription limit for each symbol
      for (const symbol of symbols) {
        if (!(await rateLimiter.checkSubscriptionLimit(socket))) {
          socket.emit('error', {
            event: 'subscribe:watchlist',
            code: 'SUBSCRIPTION_LIMIT',
            message: 'Maximum subscriptions reached'
          });
          return;
        }
      }

      const userId = socket.handshake.auth.userId;

      // Join watchlist rooms for each symbol
      const rooms = symbols.map(symbol => `watchlist:${symbol.toUpperCase()}`);
      rooms.forEach(room => socket.join(room));

      // Track subscriptions
      for (const symbol of symbols) {
        await rateLimiter.incrementSubscription(socket);
      }

      logger.info(`User ${userId} subscribed to watchlist: ${symbols.join(', ')}`);

      // Confirm subscription
      socket.emit('subscribed:watchlist', {
        success: true,
        symbols,
        userId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error handling watchlist subscription:', error);
      socket.emit('error', {
        event: 'subscribe:watchlist',
        code: 'SERVER_ERROR',
        message: 'Failed to subscribe to watchlist'
      });
    }
  };

  /**
   * Handle watchlist unsubscribe
   * Unsubscribes user from live quote updates for specified symbols
   * @param {Socket} socket - Socket.io socket
   * @param {Object} data - { symbols: string[] }
   */
  const handleWatchlistUnsubscribe = async (socket, data) => {
    try {
      // Validate authentication
      if (!socket.handshake.auth?.authenticated) {
        socket.emit('error', {
          event: 'unsubscribe:watchlist',
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        });
        return;
      }

      // Check rate limit
      if (!(await rateLimiter.checkEventLimit(socket, 'unsubscribe:watchlist'))) {
        socket.emit('error', {
          event: 'unsubscribe:watchlist',
          code: 'RATE_LIMIT',
          message: 'Too many requests'
        });
        return;
      }

      // Validate symbols parameter
      if (!data || !Array.isArray(data.symbols) || data.symbols.length === 0) {
        socket.emit('error', {
          event: 'unsubscribe:watchlist',
          code: 'INVALID_PARAMS',
          message: 'Invalid symbols array'
        });
        return;
      }

      const symbols = data.symbols.slice(0, 50);
      const userId = socket.handshake.auth.userId;

      // Leave watchlist rooms for each symbol
      const rooms = symbols.map(symbol => `watchlist:${symbol.toUpperCase()}`);
      rooms.forEach(room => socket.leave(room));

      // Decrement subscription count
      for (const symbol of symbols) {
        await rateLimiter.decrementSubscription(socket);
      }

      logger.info(`User ${userId} unsubscribed from watchlist: ${symbols.join(', ')}`);

      // Confirm unsubscription
      socket.emit('unsubscribed:watchlist', {
        success: true,
        symbols,
        userId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error handling watchlist unsubscription:', error);
      socket.emit('error', {
        event: 'unsubscribe:watchlist',
        code: 'SERVER_ERROR',
        message: 'Failed to unsubscribe from watchlist'
      });
    }
  };

  /**
   * Handle ping/pong for connection health check
   * Responds to client ping with pong
   */
  const handlePing = (socket, data) => {
    socket.emit('pong', {
      clientTimestamp: data?.timestamp,
      serverTimestamp: new Date().toISOString()
    });
  };

  // Return all handlers
  return {
    'subscribe:portfolio': handlePortfolioSubscribe,
    'subscribe:trades': handleTradesSubscribe,
    'subscribe:watchlist': handleWatchlistSubscribe,
    'unsubscribe:watchlist': handleWatchlistUnsubscribe,
    ping: handlePing
  };
}

module.exports = {
  createEventHandlers
};
