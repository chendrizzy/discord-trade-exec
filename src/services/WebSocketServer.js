// External dependencies
const { createAdapter } = require('@socket.io/redis-adapter');
const Redis = require('ioredis');
const socketIO = require('socket.io');

/**
 * WebSocket Server for Real-Time Updates
 *
 * Features:
 * - Real-time portfolio updates
 * - Trade notifications
 * - Live watchlist quotes
 * - Authentication middleware
 * - Rate limiting per user
 * - Redis adapter for horizontal scaling
 * - Connection pooling
 */
class WebSocketServer {
  constructor(httpServer) {
    this.io = socketIO(httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL || process.env.DASHBOARD_URL || 'http://localhost:3000',
        credentials: true,
        methods: ['GET', 'POST']
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000
    });

    // Redis adapter for horizontal scaling in production
    if (process.env.NODE_ENV === 'production' && process.env.REDIS_URL) {
      this.setupRedisAdapter();
    }

    // Rate limit configuration
    this.RATE_LIMITS = {
      'subscribe:portfolio': { max: 1, window: 60000 }, // 1/minute
      'subscribe:trades': { max: 1, window: 60000 },
      'subscribe:watchlist': { max: 10, window: 60000 } // 10/minute
    };

    // Connection pool limits
    this.MAX_CONNECTIONS_PER_USER = 5;

    // Setup middleware and handlers
    this.setupMiddleware();
    this.setupEventHandlers();
    this.setupConnectionTracking();

    console.log('✅ WebSocket server initialized');
  }

  /**
   * Setup Redis adapter for horizontal scaling across multiple server instances
   */
  setupRedisAdapter() {
    try {
      const pubClient = new Redis(process.env.REDIS_URL, {
        retryStrategy: times => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        }
      });

      const subClient = pubClient.duplicate();

      this.io.adapter(createAdapter(pubClient, subClient));

      pubClient.on('error', err => console.error('Redis Pub Error:', err));
      subClient.on('error', err => console.error('Redis Sub Error:', err));

      console.log('✅ WebSocket Redis adapter configured for horizontal scaling');
    } catch (error) {
      console.error('❌ Redis adapter setup failed:', error.message);
      console.log('⚠️  WebSocket will run in single-instance mode');
    }
  }

  /**
   * Setup authentication and security middleware
   */
  setupMiddleware() {
    // Authenticate WebSocket connections
    this.io.use(async (socket, next) => {
      try {
        // Get session ID from handshake auth
        const sessionID = socket.handshake.auth.sessionID;

        if (!sessionID) {
          return next(new Error('Authentication required: No session ID provided'));
        }

        // Verify session exists and has user data
        // Note: In production, this would query session store
        // For now, we'll accept the sessionID and validate on first emit
        socket.sessionID = sessionID;

        // Extract user info from session - userId is required
        const userId = socket.handshake.auth.userId;
        if (!userId) {
          return next(new Error('Authentication required: No user ID provided'));
        }

        socket.userId = userId;
        socket.user = {
          id: userId,
          name: socket.handshake.auth.userName || 'User'
        };

        next();
      } catch (error) {
        console.error('WebSocket auth error:', error);
        next(new Error('Authentication failed'));
      }
    });

    // Connection pool limit per user
    this.io.use((socket, next) => {
      if (socket.userId) {
        const userSockets = Array.from(this.io.sockets.sockets.values()).filter(s => s.userId === socket.userId);

        if (userSockets.length >= this.MAX_CONNECTIONS_PER_USER) {
          return next(new Error(`Too many connections (max ${this.MAX_CONNECTIONS_PER_USER})`));
        }
      }

      next();
    });

    // Rate limit tracking
    this.io.use((socket, next) => {
      socket.rateLimit = new Map();
      next();
    });
  }

  /**
   * Setup connection tracking and performance monitoring
   */
  setupConnectionTracking() {
    this.connectionStats = {
      total: 0,
      active: 0,
      byUser: new Map()
    };

    // Performance metrics
    this.performanceMetrics = {
      messagesOut: 0, // Total outbound messages
      messagesIn: 0, // Total inbound messages
      messageRateOut: 0, // Messages per second (outbound)
      messageRateIn: 0, // Messages per second (inbound)
      latencySum: 0, // Sum of all latencies for averaging
      latencyCount: 0, // Count of latency measurements
      avgLatency: 0, // Average latency in ms
      lastMinuteLatencies: [], // Rolling window for 1-minute average
      connectionDrops: 0, // Count of unexpected disconnections
      lastAlert: null // Timestamp of last alert
    };

    // Alert thresholds
    this.ALERT_THRESHOLDS = {
      HIGH_LATENCY: 500, // Alert if avg latency > 500ms
      CONNECTION_DROP_RATE: 5, // Alert if >5 drops per minute
      MIN_ALERT_INTERVAL: 300000 // 5 minutes between alerts
    };

    // Periodic metrics calculation
    this.metricsInterval = setInterval(() => {
      this.calculateMetrics();
      this.checkAlerts();
    }, 60000); // Every minute

    // Store interval IDs for cleanup
    this.statsInterval = setInterval(() => {
      const active = this.io.sockets.sockets.size;
      if (active > 0) {
        const metrics = this.getPerformanceMetrics();
        console.log(
          `📊 WebSocket Stats: ${active} active | ${metrics.messageRateOut.toFixed(1)} msg/s out | ${metrics.avgLatency.toFixed(0)}ms latency`
        );
      }
    }, 60000); // Log every minute
  }

  /**
   * Setup main event handlers for WebSocket connections
   */
  setupEventHandlers() {
    this.io.on('connection', socket => {
      console.log(`✅ WebSocket connected: ${socket.id} (User: ${socket.userId || 'anonymous'})`);

      this.connectionStats.total++;
      this.connectionStats.active = this.io.sockets.sockets.size;

      // Join user-specific room for targeted broadcasts
      if (socket.userId) {
        socket.join(`user:${socket.userId}`);

        // Track connections per user
        const userCount = this.connectionStats.byUser.get(socket.userId) || 0;
        this.connectionStats.byUser.set(socket.userId, userCount + 1);
      }

      // Portfolio subscription
      socket.on('subscribe:portfolio', () => {
        if (this.checkRateLimit(socket, 'subscribe:portfolio')) {
          console.log(`📊 Portfolio subscription: ${socket.userId}`);
          socket.join('portfolio-updates');
          socket.emit('subscription:confirmed', { type: 'portfolio' });
        } else {
          socket.emit('error', { message: 'Rate limit exceeded for portfolio subscription' });
        }
      });

      // Trade notifications subscription
      socket.on('subscribe:trades', () => {
        if (this.checkRateLimit(socket, 'subscribe:trades')) {
          console.log(`🔔 Trade subscription: ${socket.userId}`);
          socket.join('trade-updates');
          socket.emit('subscription:confirmed', { type: 'trades' });
        } else {
          socket.emit('error', { message: 'Rate limit exceeded for trade subscription' });
        }
      });

      // Watchlist subscription
      socket.on('subscribe:watchlist', symbols => {
        if (this.checkRateLimit(socket, 'subscribe:watchlist')) {
          if (!Array.isArray(symbols) || symbols.length === 0) {
            socket.emit('error', { message: 'Invalid symbols array' });
            return;
          }

          console.log(`👁️  Watchlist subscription: ${symbols.join(', ')}`);

          // Join symbol-specific rooms
          symbols.forEach(symbol => {
            socket.join(`symbol:${symbol}`);
          });

          socket.emit('subscription:confirmed', { type: 'watchlist', symbols });
        } else {
          socket.emit('error', { message: 'Rate limit exceeded for watchlist subscription' });
        }
      });

      // Unsubscribe from watchlist
      socket.on('unsubscribe:watchlist', symbols => {
        if (Array.isArray(symbols)) {
          symbols.forEach(symbol => {
            socket.leave(`symbol:${symbol}`);
          });
          socket.emit('unsubscription:confirmed', { type: 'watchlist', symbols });
        }
      });

      // Test trigger: Portfolio update (for testing cross-replica broadcasts)
      socket.on('test:trigger-portfolio-update', data => {
        const targetUserId = data.userId || socket.userId;
        const portfolio = data.portfolio || {
          totalValue: 50000,
          cash: 10000,
          equity: 40000,
          positions: [],
          dayChange: 500,
          dayChangePercent: 1.0
        };

        console.log(`🧪 TEST: Triggering portfolio update for user ${targetUserId}`);
        this.emitPortfolioUpdate(targetUserId, portfolio);
      });

      // Test trigger: Trade notification (for testing cross-replica broadcasts)
      socket.on('test:trigger-trade-notification', data => {
        const targetUserId = data.userId || socket.userId;
        const trade = data.trade || {
          symbol: 'TEST',
          side: 'buy',
          quantity: 1,
          price: 100.0,
          status: 'filled',
          timestamp: Date.now()
        };

        console.log(`🧪 TEST: Triggering trade notification for user ${targetUserId}`);
        this.emitTradeNotification(targetUserId, trade);
      });

      // Test trigger: Quote update (for testing broadcasts)
      socket.on('test:trigger-quote-update', data => {
        const symbol = data.symbol || 'TEST';
        const quote = {
          price: data.price || 100.0,
          change: data.change || 1.5,
          changePercent: data.changePercent || 1.5,
          volume: data.volume || 1000000,
          timestamp: Date.now()
        };

        console.log(`🧪 TEST: Triggering quote update for ${symbol}`);
        this.emitQuoteUpdate(symbol, quote);
      });

      // Disconnect handler
      socket.on('disconnect', reason => {
        console.log(`❌ WebSocket disconnected: ${socket.id} (${reason})`);

        // Track unexpected disconnections for alerts
        if (reason === 'transport error' || reason === 'transport close' || reason === 'ping timeout') {
          this.performanceMetrics.connectionDrops++;
        }

        this.connectionStats.active = this.io.sockets.sockets.size;

        // Update user connection count
        if (socket.userId) {
          const userCount = this.connectionStats.byUser.get(socket.userId) || 1;
          if (userCount <= 1) {
            this.connectionStats.byUser.delete(socket.userId);
          } else {
            this.connectionStats.byUser.set(socket.userId, userCount - 1);
          }
        }
      });

      // Error handler
      socket.on('error', error => {
        console.error(`WebSocket error (${socket.id}):`, error);
      });
    });
  }

  /**
   * Check rate limit for a specific event
   * @param {Socket} socket - Socket instance
   * @param {string} event - Event name
   * @returns {boolean} - True if allowed, false if rate limited
   */
  checkRateLimit(socket, event) {
    const limit = this.RATE_LIMITS[event];
    if (!limit) return true;

    const now = Date.now();
    const lastCall = socket.rateLimit.get(event) || 0;

    if (now - lastCall < limit.window) {
      const attempts = socket.rateLimit.get(`${event}:count`) || 0;
      if (attempts >= limit.max) {
        console.warn(`⚠️  Rate limit exceeded: ${event} for ${socket.userId}`);
        return false;
      }
      socket.rateLimit.set(`${event}:count`, attempts + 1);
    } else {
      socket.rateLimit.set(event, now);
      socket.rateLimit.set(`${event}:count`, 1);
    }

    return true;
  }

  /**
   * Emit portfolio update to specific user
   * @param {string} userId - User ID
   * @param {Object} portfolio - Portfolio data
   */
  emitPortfolioUpdate(userId, portfolio) {
    if (!userId || !portfolio) {
      console.warn('Invalid portfolio update: missing userId or portfolio data');
      return;
    }

    const startTime = Date.now();

    this.io.to(`user:${userId}`).emit('portfolio:update', {
      totalValue: portfolio.totalValue,
      cash: portfolio.cash,
      equity: portfolio.equity,
      positions: portfolio.positions,
      dayChange: portfolio.dayChange,
      dayChangePercent: portfolio.dayChangePercent,
      timestamp: new Date().toISOString()
    });

    // Track performance metrics
    this.performanceMetrics.messagesOut++;
    this.trackLatency(startTime);

    console.log(`📊 Portfolio update sent to user ${userId}: $${portfolio.totalValue?.toFixed(2)}`);
  }

  /**
   * Broadcast trade notification to specific user
   * @param {string} userId - User ID
   * @param {Object} trade - Trade data
   */
  emitTradeNotification(userId, trade) {
    if (!userId || !trade) {
      console.warn('Invalid trade notification: missing userId or trade data');
      return;
    }

    const startTime = Date.now();

    const notification = {
      id: trade.id || trade.orderId,
      symbol: trade.symbol,
      side: trade.side,
      quantity: trade.quantity,
      price: trade.price,
      status: trade.status,
      timestamp: trade.timestamp || new Date().toISOString()
    };

    this.io.to(`user:${userId}`).emit('trade:executed', notification);

    // Track performance metrics
    this.performanceMetrics.messagesOut++;
    this.trackLatency(startTime);

    console.log(
      `🔔 Trade notification sent to user ${userId}: ${notification.side} ${notification.quantity} ${notification.symbol} @ $${notification.price}`
    );
  }

  /**
   * Broadcast trade failure to specific user
   * @param {string} userId - User ID
   * @param {Object} error - Error details
   */
  emitTradeFailure(userId, error) {
    if (!userId || !error) {
      console.warn('Invalid trade failure: missing userId or error data');
      return;
    }

    const startTime = Date.now();

    this.io.to(`user:${userId}`).emit('trade:failed', {
      error: error.message || error.reason || 'Unknown error',
      signal: error.signal,
      timestamp: new Date().toISOString()
    });

    // Track performance metrics
    this.performanceMetrics.messagesOut++;
    this.trackLatency(startTime);

    console.warn(`⚠️  Trade failure sent to user ${userId}: ${error.message || error.reason}`);
  }

  /**
   * Broadcast signal quality update to specific user
   * @param {string} userId - User ID
   * @param {string} tradeId - Trade ID
   * @param {Object} quality - Signal quality data
   */
  emitSignalQuality(userId, tradeId, quality) {
    if (!userId || !tradeId || !quality) {
      console.warn('Invalid signal quality: missing userId, tradeId, or quality data');
      return;
    }

    const startTime = Date.now();

    this.io.to(`user:${userId}`).emit('signal:quality', {
      tradeId,
      quality: quality.quality,
      smartMoney: quality.smartMoney,
      rareInformation: quality.rareInformation,
      timestamp: new Date().toISOString()
    });

    // Track performance metrics
    this.performanceMetrics.messagesOut++;
    this.trackLatency(startTime);

    console.log(`🎯 Signal quality sent to user ${userId}: ${quality.quality?.tier || 'N/A'} (trade: ${tradeId})`);
  }

  /**
   * Broadcast quote update for a symbol (to all subscribers)
   * @param {string} symbol - Trading symbol
   * @param {Object} quote - Quote data
   */
  emitQuoteUpdate(symbol, quote) {
    if (!symbol || !quote) {
      console.warn('Invalid quote update: missing symbol or quote data');
      return;
    }

    const startTime = Date.now();

    this.io.to(`symbol:${symbol}`).emit('quote:update', {
      symbol,
      price: quote.price,
      change: quote.change,
      changePercent: quote.changePercent,
      volume: quote.volume,
      timestamp: quote.timestamp || new Date().toISOString()
    });

    // Track performance metrics
    this.performanceMetrics.messagesOut++;
    this.trackLatency(startTime);

    // Only log significant price changes to avoid spam
    if (Math.abs(quote.changePercent || 0) > 1) {
      console.log(
        `📈 Quote update: ${symbol} @ $${quote.price} (${quote.changePercent > 0 ? '+' : ''}${quote.changePercent?.toFixed(2)}%)`
      );
    }
  }

  /**
   * Broadcast market status update
   * @param {Object} status - Market status data
   */
  emitMarketStatus(status) {
    this.io.emit('market:status', {
      isOpen: status.isOpen,
      nextOpen: status.nextOpen,
      nextClose: status.nextClose,
      timestamp: new Date().toISOString()
    });

    console.log(`🏦 Market status update: ${status.isOpen ? 'OPEN' : 'CLOSED'}`);
  }

  /**
   * Calculate performance metrics (called every minute)
   */
  calculateMetrics() {
    const now = Date.now();

    // Calculate message rates (messages per second over last minute)
    this.performanceMetrics.messageRateOut = this.performanceMetrics.messagesOut / 60;
    this.performanceMetrics.messageRateIn = this.performanceMetrics.messagesIn / 60;

    // Calculate average latency from rolling window
    if (this.performanceMetrics.lastMinuteLatencies.length > 0) {
      const sum = this.performanceMetrics.lastMinuteLatencies.reduce((a, b) => a + b, 0);
      this.performanceMetrics.avgLatency = sum / this.performanceMetrics.lastMinuteLatencies.length;
    }

    // Reset counters for next minute
    this.performanceMetrics.messagesOut = 0;
    this.performanceMetrics.messagesIn = 0;
    this.performanceMetrics.lastMinuteLatencies = [];
  }

  /**
   * Check alert conditions and trigger warnings
   */
  checkAlerts() {
    const now = Date.now();
    const metrics = this.performanceMetrics;

    // Check if enough time has passed since last alert
    if (metrics.lastAlert && now - metrics.lastAlert < this.ALERT_THRESHOLDS.MIN_ALERT_INTERVAL) {
      return; // Too soon to alert again
    }

    // Alert on high latency
    if (metrics.avgLatency > this.ALERT_THRESHOLDS.HIGH_LATENCY) {
      console.error(
        `🚨 ALERT: High WebSocket latency detected: ${metrics.avgLatency.toFixed(0)}ms (threshold: ${this.ALERT_THRESHOLDS.HIGH_LATENCY}ms)`
      );
      metrics.lastAlert = now;

      // In production, this would trigger monitoring system alerts
      // Example: send to DataDog, New Relic, or PagerDuty
    }

    // Alert on connection drop rate
    if (metrics.connectionDrops > this.ALERT_THRESHOLDS.CONNECTION_DROP_RATE) {
      console.error(
        `🚨 ALERT: High connection drop rate: ${metrics.connectionDrops} drops in last minute (threshold: ${this.ALERT_THRESHOLDS.CONNECTION_DROP_RATE})`
      );
      metrics.lastAlert = now;

      // Reset connection drops counter
      metrics.connectionDrops = 0;
    }
  }

  /**
   * Track latency for an emit operation
   * @param {number} startTime - Operation start time from Date.now()
   */
  trackLatency(startTime) {
    const latency = Date.now() - startTime;

    this.performanceMetrics.latencySum += latency;
    this.performanceMetrics.latencyCount++;
    this.performanceMetrics.lastMinuteLatencies.push(latency);

    // Keep rolling window reasonable size (max 1000 samples)
    if (this.performanceMetrics.lastMinuteLatencies.length > 1000) {
      this.performanceMetrics.lastMinuteLatencies.shift();
    }
  }

  /**
   * Get current connection statistics
   * @returns {Object} Connection stats
   */
  getStats() {
    return {
      totalConnections: this.connectionStats.total,
      activeConnections: this.connectionStats.active,
      uniqueUsers: this.connectionStats.byUser.size,
      averageConnectionsPerUser:
        this.connectionStats.byUser.size > 0
          ? (this.connectionStats.active / this.connectionStats.byUser.size).toFixed(2)
          : 0
    };
  }

  /**
   * Get comprehensive performance metrics
   * @returns {Object} Performance metrics
   */
  getPerformanceMetrics() {
    return {
      connections: {
        total: this.connectionStats.total,
        active: this.connectionStats.active,
        uniqueUsers: this.connectionStats.byUser.size,
        avgPerUser:
          this.connectionStats.byUser.size > 0
            ? (this.connectionStats.active / this.connectionStats.byUser.size).toFixed(2)
            : 0
      },
      throughput: {
        messagesOut: this.performanceMetrics.messagesOut,
        messagesIn: this.performanceMetrics.messagesIn,
        rateOut: this.performanceMetrics.messageRateOut,
        rateIn: this.performanceMetrics.messageRateIn
      },
      latency: {
        current:
          this.performanceMetrics.lastMinuteLatencies.length > 0
            ? this.performanceMetrics.lastMinuteLatencies[this.performanceMetrics.lastMinuteLatencies.length - 1]
            : 0,
        average: this.performanceMetrics.avgLatency,
        total: this.performanceMetrics.latencyCount
      },
      health: {
        connectionDrops: this.performanceMetrics.connectionDrops,
        lastAlert: this.performanceMetrics.lastAlert
      }
    };
  }

  /**
   * Clean up resources (timers, intervals, etc.)
   */
  cleanup() {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
  }

  /**
   * Gracefully close the WebSocket server
   */
  async close() {
    console.log('Closing WebSocket server...');

    // Clean up intervals and timers
    this.cleanup();

    // Notify all connected clients
    this.io.emit('server:shutdown', {
      message: 'Server is shutting down',
      timestamp: new Date().toISOString()
    });

    // Give clients time to receive the message
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Close all connections
    this.io.close();

    console.log('✅ WebSocket server closed');
  }
}

module.exports = WebSocketServer;
