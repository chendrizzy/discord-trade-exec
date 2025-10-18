const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const Redis = require('ioredis');
const logger = require('../../utils/logger');

/**
 * WebSocket Server for Real-Time Updates
 *
 * Features:
 * - Socket.io server with Redis adapter for horizontal scaling
 * - User-based and room-based event broadcasting
 * - Connection lifecycle management
 * - Graceful shutdown handling
 * - Integration with Trade Executor for live trade notifications
 *
 * Events Emitted (Server -> Client):
 * - portfolio:updated - Real-time portfolio value changes
 * - trade:executed - Trade execution notifications
 * - trade:failed - Trade failure alerts
 * - watchlist:quote - Live watchlist quote updates
 * - position:closed - Position closure notifications
 *
 * Events Received (Client -> Server):
 * - subscribe:portfolio - Subscribe to portfolio updates
 * - subscribe:trades - Subscribe to trade notifications
 * - subscribe:watchlist - Subscribe to watchlist quotes
 * - unsubscribe:watchlist - Unsubscribe from watchlist
 */
class WebSocketServer {
  constructor(httpServer, options = {}) {
    this.httpServer = httpServer;
    this.options = {
      cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST'],
        credentials: true
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
      ...options
    };

    this.io = null;
    this.redisClient = null;
    this.redisPubClient = null;
    this.redisSubClient = null;
    this.initialized = false;
    this.activeConnections = new Map(); // userId -> Set of socket IDs

    // Middleware functions (to be set externally)
    this.authMiddleware = null;
    this.rateLimitMiddleware = null;

    // Event handlers (to be set externally)
    this.eventHandlers = new Map();
  }

  /**
   * Initialize WebSocket server with Redis adapter
   */
  async initialize() {
    if (this.initialized) {
      logger.warn('WebSocket server already initialized');
      return;
    }

    try {
      // Create Socket.io server
      this.io = new Server(this.httpServer, this.options);

      // Initialize Redis clients for adapter (if Redis URL provided)
      if (process.env.REDIS_URL) {
        await this.initializeRedisAdapter();
      } else {
        logger.warn('No REDIS_URL provided - running in single-server mode (not recommended for production)');
      }

      // Setup connection handler
      this.io.on('connection', socket => this.handleConnection(socket));

      this.initialized = true;
      logger.info('✅ WebSocket server initialized successfully');
      logger.info(`   Transport modes: ${this.options.transports.join(', ')}`);
      logger.info(`   Redis adapter: ${process.env.REDIS_URL ? 'enabled' : 'disabled'}`);
    } catch (error) {
      logger.error('Failed to initialize WebSocket server:', error);
      throw error;
    }
  }

  /**
   * Initialize Redis adapter for horizontal scaling
   */
  async initializeRedisAdapter() {
    try {
      // Create separate Redis clients for pub/sub
      this.redisPubClient = new Redis(process.env.REDIS_URL, {
        retryStrategy: times => Math.min(times * 50, 2000),
        maxRetriesPerRequest: 3
      });

      this.redisSubClient = new Redis(process.env.REDIS_URL, {
        retryStrategy: times => Math.min(times * 50, 2000),
        maxRetriesPerRequest: 3
      });

      // Create and attach adapter
      this.io.adapter(createAdapter(this.redisPubClient, this.redisSubClient));

      logger.info('✅ Redis adapter initialized for WebSocket server');
    } catch (error) {
      logger.error('Failed to initialize Redis adapter:', error);
      throw error;
    }
  }

  /**
   * Set authentication middleware
   * @param {Function} middleware - Middleware function(socket, next)
   */
  setAuthMiddleware(middleware) {
    if (this.io) {
      this.io.use(middleware);
    }
    this.authMiddleware = middleware;
  }

  /**
   * Set rate limit middleware
   * @param {Function} middleware - Middleware function(socket, next)
   */
  setRateLimitMiddleware(middleware) {
    if (this.io) {
      this.io.use(middleware);
    }
    this.rateLimitMiddleware = middleware;
  }

  /**
   * Register an event handler
   * @param {string} event - Event name
   * @param {Function} handler - Handler function(socket, data)
   */
  registerEventHandler(event, handler) {
    this.eventHandlers.set(event, handler);
  }

  /**
   * Handle new WebSocket connection
   * @param {Socket} socket - Socket.io socket instance
   */
  handleConnection(socket) {
    const { userId, userName } = socket.handshake.auth || {};

    logger.info(`🔌 WebSocket connected: ${socket.id} (User: ${userName || userId || 'unknown'})`);

    // Track active connection
    if (userId) {
      if (!this.activeConnections.has(userId)) {
        this.activeConnections.set(userId, new Set());
      }
      this.activeConnections.get(userId).add(socket.id);

      // Join user-specific room for targeted broadcasts
      socket.join(`user:${userId}`);
    }

    // Attach registered event handlers
    this.eventHandlers.forEach((handler, event) => {
      socket.on(event, data => {
        try {
          handler(socket, data);
        } catch (error) {
          logger.error(`Error handling ${event}:`, error);
          socket.emit('error', {
            event,
            message: 'Internal server error processing request'
          });
        }
      });
    });

    // Handle disconnection
    socket.on('disconnect', reason => {
      logger.info(`🔌 WebSocket disconnected: ${socket.id} (Reason: ${reason})`);

      // Remove from active connections
      if (userId) {
        const connections = this.activeConnections.get(userId);
        if (connections) {
          connections.delete(socket.id);
          if (connections.size === 0) {
            this.activeConnections.delete(userId);
          }
        }
      }
    });

    // Handle errors
    socket.on('error', error => {
      logger.error(`WebSocket error on ${socket.id}:`, error);
    });

    // Send welcome message
    socket.emit('connected', {
      socketId: socket.id,
      userId,
      timestamp: new Date().toISOString(),
      message: 'WebSocket connection established'
    });
  }

  /**
   * Broadcast event to specific user (all their connections)
   * @param {string} userId - User ID
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  emitToUser(userId, event, data) {
    if (!this.io) {
      logger.warn('Cannot emit: WebSocket server not initialized');
      return;
    }

    const room = `user:${userId}`;
    this.io.to(room).emit(event, data);

    logger.debug(`📤 Emitted ${event} to user ${userId}`, {
      event,
      userId,
      connectionCount: this.activeConnections.get(userId)?.size || 0
    });
  }

  /**
   * Broadcast event to specific room
   * @param {string} room - Room name
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  emitToRoom(room, event, data) {
    if (!this.io) {
      logger.warn('Cannot emit: WebSocket server not initialized');
      return;
    }

    this.io.to(room).emit(event, data);

    logger.debug(`📤 Emitted ${event} to room ${room}`, { event, room });
  }

  /**
   * Broadcast event to all connected clients
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  emitToAll(event, data) {
    if (!this.io) {
      logger.warn('Cannot emit: WebSocket server not initialized');
      return;
    }

    this.io.emit(event, data);

    logger.debug(`📤 Emitted ${event} to all clients`, { event });
  }

  /**
   * Get connection count for a user
   * @param {string} userId - User ID
   * @returns {number} Number of active connections
   */
  getUserConnectionCount(userId) {
    return this.activeConnections.get(userId)?.size || 0;
  }

  /**
   * Get total connection count
   * @returns {number} Total number of active connections
   */
  getTotalConnectionCount() {
    if (!this.io) return 0;
    return this.io.sockets.sockets.size;
  }

  /**
   * Get server statistics
   * @returns {Object} Server statistics
   */
  getStats() {
    return {
      initialized: this.initialized,
      totalConnections: this.getTotalConnectionCount(),
      uniqueUsers: this.activeConnections.size,
      redisAdapter: !!this.redisPubClient,
      uptime: process.uptime()
    };
  }

  /**
   * Gracefully shutdown WebSocket server
   */
  async shutdown() {
    logger.info('Shutting down WebSocket server...');

    try {
      // Notify all clients of shutdown
      if (this.io) {
        this.io.emit('server:shutdown', {
          message: 'Server is shutting down for maintenance',
          timestamp: new Date().toISOString()
        });

        // Give clients time to receive shutdown message
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Disconnect all sockets
        this.io.disconnectSockets(true);

        // Close Socket.io server
        this.io.close();
        this.io = null;
      }

      // Close Redis clients
      if (this.redisPubClient) {
        await this.redisPubClient.quit();
        this.redisPubClient = null;
      }

      if (this.redisSubClient) {
        await this.redisSubClient.quit();
        this.redisSubClient = null;
      }

      this.initialized = false;
      this.activeConnections.clear();

      logger.info('✅ WebSocket server shut down successfully');
    } catch (error) {
      logger.error('Error during WebSocket server shutdown:', error);
      throw error;
    }
  }
}

module.exports = WebSocketServer;
