'use strict';

/**
 * Socket.IO Server with JWT Authentication & Redis Adapter
 *
 * Constitutional Requirements:
 * - Principle I: Security-First (JWT authentication for WebSocket connections)
 * - Principle IV: Real-Time Standards (Socket.IO with horizontal scaling)
 *
 * Features:
 * - JWT token validation on connection upgrade
 * - Redis adapter for multi-instance scaling (1000+ connections)
 * - Auto-reconnection support with exponential backoff
 * - Room-based isolation (user-specific rooms)
 * - Token expiry warnings (5 minutes before expiry)
 * - Connection lifecycle events
 */

const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');
const JWTAuthMiddleware = require('./middleware/JWTAuthMiddleware');
const logger = require('../middleware/logger');

/**
 * Initialize Socket.IO server with Redis adapter and JWT authentication
 *
 * @param {http.Server} httpServer - Express HTTP server instance
 * @param {Object} options - Configuration options
 * @param {string} options.redisUrl - Redis connection URL
 * @param {string} options.corsOrigin - CORS origin for WebSocket connections
 * @returns {Server} - Socket.IO server instance
 */
async function initializeSocketServer(httpServer, options = {}) {
  const {
    redisUrl = process.env.REDIS_URL || 'redis://localhost:6379',
    corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173'
  } = options;

  // Create Socket.IO server with configuration
  const io = new Server(httpServer, {
    cors: {
      origin: corsOrigin,
      methods: ['GET', 'POST'],
      credentials: true
    },
    // Connection limits per instance (Constitutional Principle IV: 1000+ connections)
    maxHttpBufferSize: 1e6, // 1MB max message size
    pingTimeout: 60000, // 60 seconds
    pingInterval: 25000, // 25 seconds (heartbeat)
    upgradeTimeout: 10000, // 10 seconds for connection upgrade
    // Transport configuration
    transports: ['websocket', 'polling'], // WebSocket preferred, polling fallback
    allowUpgrades: true
  });

  // Configure Redis adapter for horizontal scaling
  try {
    const pubClient = createClient({ url: redisUrl });
    const subClient = pubClient.duplicate();

    await pubClient.connect();
    await subClient.connect();

    io.adapter(createAdapter(pubClient, subClient));

    logger.info('Socket.IO Redis adapter initialized', {
      redisUrl: redisUrl.replace(/:[^:]*@/, ':***@') // Mask password in logs
    });

    // Handle Redis adapter errors
    pubClient.on('error', err => {
      logger.error('Socket.IO Redis pub client error', { error: err.message });
    });

    subClient.on('error', err => {
      logger.error('Socket.IO Redis sub client error', { error: err.message });
    });
  } catch (error) {
    logger.warn('Failed to initialize Redis adapter, running in single-instance mode', {
      error: error.message
    });
    // Continue without Redis adapter (single instance mode, no horizontal scaling)
  }

  // Apply JWT authentication middleware (validates token on connection upgrade)
  io.use(JWTAuthMiddleware);

  // Connection event handler
  io.on('connection', socket => {
    const userId = socket.data.userId; // Set by JWTAuthMiddleware
    const sessionId = socket.id;

    logger.info('WebSocket connection established', {
      userId,
      sessionId,
      transport: socket.conn.transport.name
    });

    // Join user-specific room for targeted message delivery
    socket.join(`user:${userId}`);

    // Emit connection authorization success event
    socket.emit('connection.authorized', {
      userId,
      sessionId,
      timestamp: new Date().toISOString(),
      message: 'WebSocket connection authenticated successfully'
    });

    // Set up token expiry warning (5 minutes before expiry)
    const tokenExpiresAt = socket.data.tokenExpiresAt; // Set by JWTAuthMiddleware
    const timeUntilExpiry = tokenExpiresAt - Date.now();
    const warningTime = timeUntilExpiry - 5 * 60 * 1000; // 5 minutes before expiry

    if (warningTime > 0) {
      setTimeout(() => {
        socket.emit('token.expiring', {
          expiresAt: new Date(tokenExpiresAt).toISOString(),
          timeRemaining: 5 * 60, // 5 minutes in seconds
          message: 'JWT token expiring soon. Please refresh your session.'
        });

        logger.info('Token expiry warning sent', { userId, sessionId });
      }, warningTime);
    }

    // Handle token refresh during active session
    socket.on('connection.reauth', async data => {
      try {
        const { token } = data;

        // Validate new token using middleware logic
        const decoded = await JWTAuthMiddleware.validateToken(token);

        if (decoded.userId !== userId) {
          throw new Error('Token user ID mismatch');
        }

        // Update socket data with new token expiry
        socket.data.tokenExpiresAt = decoded.exp * 1000;

        socket.emit('connection.reauth.success', {
          message: 'Token refreshed successfully',
          expiresAt: new Date(decoded.exp * 1000).toISOString()
        });

        logger.info('Token refreshed during active WebSocket session', {
          userId,
          sessionId
        });
      } catch (error) {
        socket.emit('connection.reauth.failure', {
          message: 'Token refresh failed. Please reconnect.'
        });

        logger.warn('Token refresh failed during active session', {
          userId,
          sessionId,
          error: error.message
        });

        // Force disconnect after failed refresh
        socket.disconnect(true);
      }
    });

    // Handle state sync requests (for reconnection recovery)
    socket.on('state.requestSync', () => {
      // Emit state.sync event (handlers in separate files will populate data)
      socket.emit('state.sync', {
        message: 'State sync initiated. Portfolio and trade data will be sent.',
        timestamp: new Date().toISOString()
      });

      logger.debug('State sync requested', { userId, sessionId });
    });

    // Handle disconnection
    socket.on('disconnect', reason => {
      logger.info('WebSocket connection closed', {
        userId,
        sessionId,
        reason,
        transport: socket.conn.transport.name
      });

      // Leave user room
      socket.leave(`user:${userId}`);

      // Emit disconnection event to other services (if needed)
      socket.broadcast.to(`admin:monitoring`).emit('user.disconnected', {
        userId,
        reason,
        timestamp: new Date().toISOString()
      });
    });

    // Handle errors
    socket.on('error', error => {
      logger.error('WebSocket error', {
        userId,
        sessionId,
        error: error.message,
        stack: error.stack
      });

      socket.emit('connection.error', {
        message: 'An error occurred. Please reconnect.',
        timestamp: new Date().toISOString()
      });
    });

    // Rate limiting: Track message count per user (10 messages/second max)
    const messageCounters = new Map();
    const RATE_LIMIT = 10; // messages per second
    const RATE_WINDOW = 1000; // 1 second

    socket.use((packet, next) => {
      const now = Date.now();
      const counter = messageCounters.get(userId) || { count: 0, resetAt: now + RATE_WINDOW };

      if (now > counter.resetAt) {
        // Reset counter after window expires
        counter.count = 0;
        counter.resetAt = now + RATE_WINDOW;
      }

      counter.count++;
      messageCounters.set(userId, counter);

      if (counter.count > RATE_LIMIT) {
        logger.warn('WebSocket rate limit exceeded', {
          userId,
          sessionId,
          count: counter.count
        });

        socket.emit('error.rateLimitWarning', {
          message: `Rate limit exceeded: ${RATE_LIMIT} messages per second maximum`,
          currentCount: counter.count
        });

        // Don't disconnect, just warn (graceful degradation)
        // In production, consider temporarily blocking the user
      }

      next();
    });
  });

  // Admin monitoring room (for system events)
  io.of('/').adapter.on('create-room', room => {
    logger.debug('Socket.IO room created', { room });
  });

  io.of('/').adapter.on('delete-room', room => {
    logger.debug('Socket.IO room deleted', { room });
  });

  // Server-level error handling
  io.engine.on('connection_error', err => {
    logger.error('Socket.IO connection error', {
      code: err.code,
      message: err.message,
      context: err.context
    });
  });

  logger.info('Socket.IO server initialized successfully', {
    corsOrigin,
    maxConnections: '1000+ per instance (horizontally scalable)'
  });

  return io;
}

/**
 * Emit event to specific user's WebSocket connections
 *
 * @param {Server} io - Socket.IO server instance
 * @param {string} userId - User ID to send event to
 * @param {string} event - Event name
 * @param {Object} data - Event payload
 */
function emitToUser(io, userId, event, data) {
  io.to(`user:${userId}`).emit(event, {
    ...data,
    timestamp: new Date().toISOString()
  });

  logger.debug('Event emitted to user', {
    userId,
    event,
    roomSize: io.sockets.adapter.rooms.get(`user:${userId}`)?.size || 0
  });
}

/**
 * Emit event to all connected clients (broadcast)
 *
 * @param {Server} io - Socket.IO server instance
 * @param {string} event - Event name
 * @param {Object} data - Event payload
 */
function emitToAll(io, event, data) {
  io.emit(event, {
    ...data,
    timestamp: new Date().toISOString()
  });

  logger.debug('Event broadcast to all connections', {
    event,
    connectionCount: io.sockets.sockets.size
  });
}

/**
 * Get connection statistics (monitoring/debugging)
 *
 * @param {Server} io - Socket.IO server instance
 * @returns {Object} - Connection statistics
 */
function getConnectionStats(io) {
  const rooms = io.sockets.adapter.rooms;
  const userRooms = Array.from(rooms.keys()).filter(room => room.startsWith('user:'));

  return {
    totalConnections: io.sockets.sockets.size,
    uniqueUsers: userRooms.length,
    totalRooms: rooms.size,
    adapter: io.sockets.adapter.constructor.name
  };
}

module.exports = {
  initializeSocketServer,
  emitToUser,
  emitToAll,
  getConnectionStats
};
