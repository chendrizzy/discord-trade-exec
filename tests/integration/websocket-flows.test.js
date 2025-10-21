/**
 * Integration Tests for WebSocket Flows
 * Tests complete end-to-end WebSocket workflows with real components
 *
 * Note: These are simplified integration tests focusing on:
 * - Server initialization with middleware
 * - Event handler registration
 * - Emitter functionality
 * - Graceful shutdown
 */

const http = require('http');
const mongoose = require('mongoose');
const User = require('../../src/models/User');
const WebSocketServer = require('../../src/services/websocket/WebSocketServer');
const { createEventHandlers } = require('../../src/services/websocket/handlers');
const { createEmitters } = require('../../src/services/websocket/emitters');
const { createAuthMiddleware } = require('../../src/services/websocket/middleware/auth');
const { RateLimiter } = require('../../src/services/websocket/middleware/rateLimiter');

describe('WebSocket Integration', () => {
  let httpServer;
  let wsServer;
  let serverPort;
  let testUser;
  let testSession;

  beforeAll(async () => {
    // Create HTTP server
    httpServer = http.createServer();

    // Find available port
    await new Promise((resolve) => {
      httpServer.listen(0, () => {
        serverPort = httpServer.address().port;
        resolve();
      });
    });

    // Create test user in database
    testUser = await User.create({
      discordId: 'test-discord-' + Date.now(),
      discordUsername: 'integrationtester',
      isAdmin: false,
      subscription: {
        tier: 'enterprise',
        status: 'active'
      }
    });

    // Create test session in MongoDB
    const sessionsCollection = mongoose.connection.db.collection('sessions');
    const sessionId = 'test-session-' + Date.now();
    await sessionsCollection.insertOne({
      _id: sessionId,
      expires: new Date(Date.now() + 3600000), // 1 hour from now
      session: JSON.stringify({
        passport: {
          user: {
            _id: testUser._id.toString(),
            username: testUser.discordUsername,
            email: 'test@example.com',
            isAdmin: testUser.isAdmin
          }
        }
      })
    });
    testSession = sessionId;
  });

  afterAll(async () => {
    // Cleanup test user
    if (testUser) {
      await User.deleteOne({ _id: testUser._id });
    }

    // Cleanup test sessions
    const sessionsCollection = mongoose.connection.db.collection('sessions');
    await sessionsCollection.deleteMany({});

    // Close HTTP server
    if (httpServer) {
      await new Promise((resolve) => {
        httpServer.close(() => resolve());
      });
    }
  });

  describe('Server Initialization', () => {
    beforeEach(async () => {
      wsServer = new WebSocketServer(httpServer);
    });

    afterEach(async () => {
      if (wsServer && wsServer.initialized) {
        await wsServer.shutdown();
      }
    });

    test('should initialize WebSocket server successfully', async () => {
      await wsServer.initialize();

      expect(wsServer.initialized).toBe(true);
      expect(wsServer.io).toBeDefined();
      expect(wsServer.io).not.toBeNull();
    });

    test('should not re-initialize if already initialized', async () => {
      await wsServer.initialize();
      const firstIo = wsServer.io;

      await wsServer.initialize(); // Second call should be ignored

      expect(wsServer.io).toBe(firstIo); // Same instance
      expect(wsServer.initialized).toBe(true);
    });

    test('should initialize without Redis adapter when REDIS_URL not set', async () => {
      const originalRedisUrl = process.env.REDIS_URL;
      delete process.env.REDIS_URL;

      await wsServer.initialize();

      expect(wsServer.initialized).toBe(true);
      expect(wsServer.redisPubClient).toBeNull();
      expect(wsServer.redisSubClient).toBeNull();

      // Restore env var
      if (originalRedisUrl) {
        process.env.REDIS_URL = originalRedisUrl;
      }
    });
  });

  describe('Middleware Integration', () => {
    beforeEach(async () => {
      wsServer = new WebSocketServer(httpServer);
      await wsServer.initialize();
    });

    afterEach(async () => {
      if (wsServer && wsServer.initialized) {
        await wsServer.shutdown();
      }
    });

    test('should set authentication middleware', () => {
      const authMiddleware = createAuthMiddleware();
      wsServer.setAuthMiddleware(authMiddleware);

      expect(wsServer.authMiddleware).toBe(authMiddleware);
    });

    test('should set rate limit middleware', () => {
      const rateLimiter = new RateLimiter(null);
      const rateLimitMiddleware = (socket, next) => next();

      wsServer.setRateLimitMiddleware(rateLimitMiddleware);

      expect(wsServer.rateLimitMiddleware).toBe(rateLimitMiddleware);
    });
  });

  describe('Event Handler Registration', () => {
    beforeEach(async () => {
      wsServer = new WebSocketServer(httpServer);
      await wsServer.initialize();
    });

    afterEach(async () => {
      if (wsServer && wsServer.initialized) {
        await wsServer.shutdown();
      }
    });

    test('should register event handlers', () => {
      const rateLimiter = new RateLimiter(null);
      const handlers = createEventHandlers(rateLimiter);

      Object.entries(handlers).forEach(([event, handler]) => {
        wsServer.registerEventHandler(event, handler);
      });

      expect(wsServer.eventHandlers.size).toBeGreaterThan(0);
      expect(wsServer.eventHandlers.has('subscribe:portfolio')).toBe(true);
      expect(wsServer.eventHandlers.has('subscribe:trades')).toBe(true);
      expect(wsServer.eventHandlers.has('subscribe:watchlist')).toBe(true);
    });

    test('should register custom event handler', () => {
      const customHandler = jest.fn();
      wsServer.registerEventHandler('custom:event', customHandler);

      expect(wsServer.eventHandlers.has('custom:event')).toBe(true);
      expect(wsServer.eventHandlers.get('custom:event')).toBe(customHandler);
    });
  });

  describe('Emitter Functions', () => {
    beforeEach(async () => {
      wsServer = new WebSocketServer(httpServer);
      await wsServer.initialize();
    });

    afterEach(async () => {
      if (wsServer && wsServer.initialized) {
        await wsServer.shutdown();
      }
    });

    test('should create emitter functions', () => {
      const emitters = createEmitters(wsServer);

      expect(emitters.emitPortfolioUpdate).toBeInstanceOf(Function);
      expect(emitters.emitTradeExecuted).toBeInstanceOf(Function);
      expect(emitters.emitTradeFailed).toBeInstanceOf(Function);
      expect(emitters.emitWatchlistQuote).toBeInstanceOf(Function);
      expect(emitters.emitPositionClosed).toBeInstanceOf(Function);
      expect(emitters.emitNotification).toBeInstanceOf(Function);
      expect(emitters.emitMarketStatus).toBeInstanceOf(Function);
    });

    test('should emit to user without errors', () => {
      const emitters = createEmitters(wsServer);

      expect(() => {
        emitters.emitPortfolioUpdate(testUser._id.toString(), {
          totalValue: 50000,
          dayChange: 1200,
          dayChangePercent: 2.5
        });
      }).not.toThrow();
    });

    test('should emit to room without errors', () => {
      const emitters = createEmitters(wsServer);

      expect(() => {
        emitters.emitWatchlistQuote('AAPL', {
          symbol: 'AAPL',
          price: 180.25,
          change: 1.5,
          changePercent: 0.84
        });
      }).not.toThrow();
    });

    test('should emit trade notifications without errors', () => {
      const emitters = createEmitters(wsServer);

      expect(() => {
        emitters.emitTradeExecuted(testUser._id.toString(), {
          id: 'trade-123',
          symbol: 'AAPL',
          side: 'buy',
          quantity: 100,
          price: 180.50
        });
      }).not.toThrow();

      expect(() => {
        emitters.emitTradeFailed(testUser._id.toString(), {
          symbol: 'GOOGL',
          side: 'sell',
          quantity: 50,
          reason: 'Insufficient funds'
        });
      }).not.toThrow();
    });

    test('should emit market status without errors', () => {
      const emitters = createEmitters(wsServer);

      expect(() => {
        emitters.emitMarketStatus({
          status: 'open',
          nextChange: '2025-01-17T16:00:00Z',
          message: 'Markets are currently open'
        });
      }).not.toThrow();
    });
  });

  describe('Connection Management', () => {
    beforeEach(async () => {
      wsServer = new WebSocketServer(httpServer);
      await wsServer.initialize();
    });

    afterEach(async () => {
      if (wsServer && wsServer.initialized) {
        await wsServer.shutdown();
      }
    });

    test('should track connection statistics', () => {
      const stats = wsServer.getStats();

      expect(stats).toHaveProperty('initialized');
      expect(stats).toHaveProperty('totalConnections');
      expect(stats).toHaveProperty('uniqueUsers');
      expect(stats).toHaveProperty('redisAdapter');
      expect(stats).toHaveProperty('uptime');
      expect(stats.initialized).toBe(true);
    });

    test('should return zero connections initially', () => {
      const count = wsServer.getTotalConnectionCount();
      expect(count).toBe(0);
    });

    test('should return zero connections for non-existent user', () => {
      const count = wsServer.getUserConnectionCount('non-existent-user');
      expect(count).toBe(0);
    });
  });

  describe('Graceful Shutdown', () => {
    beforeEach(async () => {
      wsServer = new WebSocketServer(httpServer);
      await wsServer.initialize();
    });

    test('should shutdown gracefully', async () => {
      expect(wsServer.initialized).toBe(true);

      await wsServer.shutdown();

      expect(wsServer.initialized).toBe(false);
      expect(wsServer.io).toBeNull();
      expect(wsServer.activeConnections.size).toBe(0);
    });

    test('should clear Redis clients on shutdown if present', async () => {
      // Mock Redis clients
      wsServer.redisPubClient = { quit: jest.fn().mockResolvedValue(true) };
      wsServer.redisSubClient = { quit: jest.fn().mockResolvedValue(true) };

      await wsServer.shutdown();

      expect(wsServer.redisPubClient).toBeNull();
      expect(wsServer.redisSubClient).toBeNull();
    });

    test('should handle shutdown errors gracefully', async () => {
      // Mock io.close to throw error
      wsServer.io.close = jest.fn(() => {
        throw new Error('Shutdown error');
      });

      await expect(wsServer.shutdown()).rejects.toThrow('Shutdown error');
    });
  });

  describe('Complete Integration Flow', () => {
    test('should initialize complete WebSocket stack', async () => {
      // Create server
      wsServer = new WebSocketServer(httpServer);

      // Initialize
      await wsServer.initialize();
      expect(wsServer.initialized).toBe(true);

      // Add authentication
      const authMiddleware = createAuthMiddleware();
      wsServer.setAuthMiddleware(authMiddleware);
      expect(wsServer.authMiddleware).toBeDefined();

      // Add rate limiting
      const rateLimiter = new RateLimiter(null);
      expect(rateLimiter).toBeDefined();

      // Register event handlers
      const handlers = createEventHandlers(rateLimiter);
      Object.entries(handlers).forEach(([event, handler]) => {
        wsServer.registerEventHandler(event, handler);
      });
      expect(wsServer.eventHandlers.size).toBeGreaterThan(0);

      // Create emitters
      const emitters = createEmitters(wsServer);
      expect(emitters).toBeDefined();

      // Verify server is fully operational
      const stats = wsServer.getStats();
      expect(stats.initialized).toBe(true);

      // Shutdown cleanly
      await wsServer.shutdown();
      expect(wsServer.initialized).toBe(false);
    });
  });
});
