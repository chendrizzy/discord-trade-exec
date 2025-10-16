// External dependencies
const { createAdapter } = require('@socket.io/redis-adapter');
const Redis = require('ioredis');
const socketIO = require('socket.io');

// Internal utilities and services
const WebSocketServer = require('../../src/services/WebSocketServer');

// Mock dependencies
jest.mock('socket.io');
jest.mock('@socket.io/redis-adapter');
jest.mock('ioredis');

describe('WebSocketServer', () => {
  let wsServer;
  let mockHttpServer;
  let mockIO;
  let mockSocket;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock HTTP server
    mockHttpServer = {
      listen: jest.fn(),
      close: jest.fn()
    };

    // Mock socket
    mockSocket = {
      id: 'socket-123',
      userId: 'user-456',
      user: { id: 'user-456', name: 'Test User' },
      sessionID: 'session-789',
      handshake: {
        auth: {
          sessionID: 'session-789',
          userId: 'user-456',
          userName: 'Test User'
        }
      },
      join: jest.fn(),
      leave: jest.fn(),
      emit: jest.fn(),
      on: jest.fn(),
      rateLimit: new Map()
    };

    // Mock Socket.io instance
    mockIO = {
      use: jest.fn(middleware => {
        // Store middleware for testing
        mockIO.middleware = mockIO.middleware || [];
        mockIO.middleware.push(middleware);
      }),
      on: jest.fn((event, handler) => {
        mockIO.handlers = mockIO.handlers || {};
        mockIO.handlers[event] = handler;
      }),
      emit: jest.fn(),
      to: jest.fn(() => ({
        emit: jest.fn()
      })),
      adapter: jest.fn(),
      close: jest.fn(),
      sockets: {
        sockets: new Map([[mockSocket.id, mockSocket]])
      }
    };

    // Mock socket.io constructor
    socketIO.mockReturnValue(mockIO);

    // Mock Redis
    const mockRedis = {
      duplicate: jest.fn().mockReturnThis(),
      on: jest.fn()
    };
    Redis.mockReturnValue(mockRedis);

    // Reset environment
    delete process.env.NODE_ENV;
    delete process.env.REDIS_URL;
  });

  afterEach(() => {
    // Clean up WebSocket server resources
    if (wsServer && wsServer.cleanup) {
      wsServer.cleanup();
    }
  });

  describe('Constructor & Initialization', () => {
    test('should initialize WebSocket server with correct CORS configuration', () => {
      wsServer = new WebSocketServer(mockHttpServer);

      expect(socketIO).toHaveBeenCalledWith(
        mockHttpServer,
        expect.objectContaining({
          cors: expect.objectContaining({
            origin: expect.any(String),
            credentials: true,
            methods: ['GET', 'POST']
          }),
          transports: ['websocket', 'polling']
        })
      );
    });

    test('should use environment variable for CORS origin', () => {
      process.env.FRONTEND_URL = 'https://example.com';
      wsServer = new WebSocketServer(mockHttpServer);

      expect(socketIO).toHaveBeenCalledWith(
        mockHttpServer,
        expect.objectContaining({
          cors: expect.objectContaining({
            origin: 'https://example.com'
          })
        })
      );
    });

    test('should configure rate limits correctly', () => {
      wsServer = new WebSocketServer(mockHttpServer);

      expect(wsServer.RATE_LIMITS).toEqual({
        'subscribe:portfolio': { max: 1, window: 60000 },
        'subscribe:trades': { max: 1, window: 60000 },
        'subscribe:watchlist': { max: 10, window: 60000 }
      });
    });

    test('should set max connections per user', () => {
      wsServer = new WebSocketServer(mockHttpServer);

      expect(wsServer.MAX_CONNECTIONS_PER_USER).toBe(5);
    });

    test('should setup Redis adapter in production with REDIS_URL', () => {
      process.env.NODE_ENV = 'production';
      process.env.REDIS_URL = 'redis://localhost:6379';

      wsServer = new WebSocketServer(mockHttpServer);

      expect(Redis).toHaveBeenCalledWith('redis://localhost:6379', expect.any(Object));
    });

    test('should not setup Redis adapter in development', () => {
      process.env.NODE_ENV = 'development';

      wsServer = new WebSocketServer(mockHttpServer);

      expect(mockIO.adapter).not.toHaveBeenCalled();
    });

    test('should initialize connection statistics', () => {
      wsServer = new WebSocketServer(mockHttpServer);

      expect(wsServer.connectionStats).toEqual({
        total: 0,
        active: 0,
        byUser: expect.any(Map)
      });
    });
  });

  describe('Authentication Middleware', () => {
    beforeEach(() => {
      wsServer = new WebSocketServer(mockHttpServer);
    });

    test('should accept valid session with userId', () => {
      const authMiddleware = mockIO.middleware[0];
      const next = jest.fn();

      authMiddleware(mockSocket, next);

      expect(mockSocket.sessionID).toBe('session-789');
      expect(mockSocket.userId).toBe('user-456');
      expect(mockSocket.user).toEqual({
        id: 'user-456',
        name: 'Test User'
      });
      expect(next).toHaveBeenCalledWith();
    });

    test('should reject connection without sessionID', () => {
      const authMiddleware = mockIO.middleware[0];
      const next = jest.fn();

      const invalidSocket = {
        ...mockSocket,
        handshake: { auth: {} }
      };

      authMiddleware(invalidSocket, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Authentication required')
        })
      );
    });

    test('should handle authentication errors gracefully', () => {
      const authMiddleware = mockIO.middleware[0];
      const next = jest.fn();

      // Simulate error by making socket.handshake throw
      const errorSocket = {
        handshake: {
          get auth() {
            throw new Error('Network error');
          }
        }
      };

      authMiddleware(errorSocket, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Authentication failed'
        })
      );
    });
  });

  describe('Connection Pool Limiting', () => {
    beforeEach(() => {
      wsServer = new WebSocketServer(mockHttpServer);
    });

    test('should allow connection within pool limit', () => {
      const poolMiddleware = mockIO.middleware[1];
      const next = jest.fn();

      // Mock 3 existing connections for this user
      mockIO.sockets.sockets = new Map([
        ['socket-1', { userId: 'user-456' }],
        ['socket-2', { userId: 'user-456' }],
        ['socket-3', { userId: 'user-456' }]
      ]);

      poolMiddleware(mockSocket, next);

      expect(next).toHaveBeenCalledWith();
    });

    test('should reject connection exceeding pool limit', () => {
      const poolMiddleware = mockIO.middleware[1];
      const next = jest.fn();

      // Mock 5 existing connections (at limit)
      mockIO.sockets.sockets = new Map([
        ['socket-1', { userId: 'user-456' }],
        ['socket-2', { userId: 'user-456' }],
        ['socket-3', { userId: 'user-456' }],
        ['socket-4', { userId: 'user-456' }],
        ['socket-5', { userId: 'user-456' }]
      ]);

      poolMiddleware(mockSocket, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Too many connections')
        })
      );
    });

    test('should allow connection for different users', () => {
      const poolMiddleware = mockIO.middleware[1];
      const next = jest.fn();

      // Mock 5 connections for a DIFFERENT user
      mockIO.sockets.sockets = new Map([
        ['socket-1', { userId: 'other-user' }],
        ['socket-2', { userId: 'other-user' }],
        ['socket-3', { userId: 'other-user' }],
        ['socket-4', { userId: 'other-user' }],
        ['socket-5', { userId: 'other-user' }]
      ]);

      poolMiddleware(mockSocket, next);

      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('Rate Limiting', () => {
    beforeEach(() => {
      wsServer = new WebSocketServer(mockHttpServer);
    });

    test('should allow first call within rate limit', () => {
      const result = wsServer.checkRateLimit(mockSocket, 'subscribe:portfolio');

      expect(result).toBe(true);
    });

    test('should enforce rate limit for portfolio subscription (1/minute)', () => {
      // First call - should succeed
      expect(wsServer.checkRateLimit(mockSocket, 'subscribe:portfolio')).toBe(true);

      // Second call within same minute - should fail
      expect(wsServer.checkRateLimit(mockSocket, 'subscribe:portfolio')).toBe(false);
    });

    test('should enforce rate limit for watchlist subscription (10/minute)', () => {
      // First 10 calls should succeed
      for (let i = 0; i < 10; i++) {
        expect(wsServer.checkRateLimit(mockSocket, 'subscribe:watchlist')).toBe(true);
      }

      // 11th call should fail
      expect(wsServer.checkRateLimit(mockSocket, 'subscribe:watchlist')).toBe(false);
    });

    test('should reset rate limit after time window expires', () => {
      jest.useFakeTimers();

      // First call
      expect(wsServer.checkRateLimit(mockSocket, 'subscribe:portfolio')).toBe(true);

      // Fast forward 61 seconds (beyond 60s window)
      jest.advanceTimersByTime(61000);

      // Should allow again
      expect(wsServer.checkRateLimit(mockSocket, 'subscribe:portfolio')).toBe(true);

      jest.useRealTimers();
    });

    test('should return true for events without rate limit', () => {
      const result = wsServer.checkRateLimit(mockSocket, 'custom:event');

      expect(result).toBe(true);
    });

    test('should track rate limits independently per socket', () => {
      const socket2 = { ...mockSocket, id: 'socket-2', rateLimit: new Map() };

      // Use up socket1's limit
      expect(wsServer.checkRateLimit(mockSocket, 'subscribe:portfolio')).toBe(true);
      expect(wsServer.checkRateLimit(mockSocket, 'subscribe:portfolio')).toBe(false);

      // socket2 should still have its own limit
      expect(wsServer.checkRateLimit(socket2, 'subscribe:portfolio')).toBe(true);
    });
  });

  describe('Event Handlers - Connection', () => {
    beforeEach(() => {
      wsServer = new WebSocketServer(mockHttpServer);
    });

    test('should handle new connection and join user room', () => {
      const connectionHandler = mockIO.handlers.connection;

      connectionHandler(mockSocket);

      expect(mockSocket.join).toHaveBeenCalledWith('user:user-456');
      expect(wsServer.connectionStats.total).toBe(1);
    });

    test('should track connections by user', () => {
      const connectionHandler = mockIO.handlers.connection;

      connectionHandler(mockSocket);

      expect(wsServer.connectionStats.byUser.get('user-456')).toBe(1);
    });

    test('should handle disconnect and clean up user tracking', () => {
      const connectionHandler = mockIO.handlers.connection;

      // Connect
      connectionHandler(mockSocket);
      expect(wsServer.connectionStats.byUser.get('user-456')).toBe(1);

      // Get disconnect handler
      const disconnectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'disconnect')[1];

      // Disconnect
      disconnectHandler('client disconnect');

      expect(wsServer.connectionStats.byUser.has('user-456')).toBe(false);
    });

    test('should decrement user count for multiple connections', () => {
      const connectionHandler = mockIO.handlers.connection;

      // Simulate 1 existing connection from same user
      wsServer.connectionStats.byUser.set('user-456', 1);

      // Add 2nd connection (now 2 total)
      connectionHandler(mockSocket);
      expect(wsServer.connectionStats.byUser.get('user-456')).toBe(2);

      // Get disconnect handler
      const disconnectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'disconnect')[1];

      // Disconnect 2nd connection
      disconnectHandler('client disconnect');

      // Should decrease but not remove (1 connection remains)
      expect(wsServer.connectionStats.byUser.get('user-456')).toBe(1);
    });
  });

  describe('Event Handlers - Subscriptions', () => {
    beforeEach(() => {
      wsServer = new WebSocketServer(mockHttpServer);
      const connectionHandler = mockIO.handlers.connection;
      connectionHandler(mockSocket);
    });

    test('should handle portfolio subscription', () => {
      const subscribeHandler = mockSocket.on.mock.calls.find(call => call[0] === 'subscribe:portfolio')[1];

      subscribeHandler();

      expect(mockSocket.join).toHaveBeenCalledWith('portfolio-updates');
      expect(mockSocket.emit).toHaveBeenCalledWith('subscription:confirmed', {
        type: 'portfolio'
      });
    });

    test('should handle trades subscription', () => {
      const subscribeHandler = mockSocket.on.mock.calls.find(call => call[0] === 'subscribe:trades')[1];

      subscribeHandler();

      expect(mockSocket.join).toHaveBeenCalledWith('trade-updates');
      expect(mockSocket.emit).toHaveBeenCalledWith('subscription:confirmed', {
        type: 'trades'
      });
    });

    test('should handle watchlist subscription with valid symbols', () => {
      const subscribeHandler = mockSocket.on.mock.calls.find(call => call[0] === 'subscribe:watchlist')[1];

      const symbols = ['AAPL', 'TSLA', 'NVDA'];
      subscribeHandler(symbols);

      expect(mockSocket.join).toHaveBeenCalledWith('symbol:AAPL');
      expect(mockSocket.join).toHaveBeenCalledWith('symbol:TSLA');
      expect(mockSocket.join).toHaveBeenCalledWith('symbol:NVDA');
      expect(mockSocket.emit).toHaveBeenCalledWith('subscription:confirmed', {
        type: 'watchlist',
        symbols
      });
    });

    test('should reject watchlist subscription with invalid symbols', () => {
      const subscribeHandler = mockSocket.on.mock.calls.find(call => call[0] === 'subscribe:watchlist')[1];

      subscribeHandler('AAPL'); // String instead of array

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Invalid symbols array'
      });
    });

    test('should reject watchlist subscription with empty array', () => {
      const subscribeHandler = mockSocket.on.mock.calls.find(call => call[0] === 'subscribe:watchlist')[1];

      subscribeHandler([]);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Invalid symbols array'
      });
    });

    test('should handle watchlist unsubscription', () => {
      const unsubscribeHandler = mockSocket.on.mock.calls.find(call => call[0] === 'unsubscribe:watchlist')[1];

      const symbols = ['AAPL', 'TSLA'];
      unsubscribeHandler(symbols);

      expect(mockSocket.leave).toHaveBeenCalledWith('symbol:AAPL');
      expect(mockSocket.leave).toHaveBeenCalledWith('symbol:TSLA');
      expect(mockSocket.emit).toHaveBeenCalledWith('unsubscription:confirmed', {
        type: 'watchlist',
        symbols
      });
    });

    test('should enforce rate limits on subscriptions', () => {
      const subscribeHandler = mockSocket.on.mock.calls.find(call => call[0] === 'subscribe:portfolio')[1];

      // First call succeeds
      subscribeHandler();
      expect(mockSocket.join).toHaveBeenCalledWith('portfolio-updates');

      // Second call should be rate limited
      subscribeHandler();
      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: expect.stringContaining('Rate limit exceeded')
      });
    });
  });

  describe('Emit Methods', () => {
    beforeEach(() => {
      wsServer = new WebSocketServer(mockHttpServer);
    });

    test('should emit portfolio update to specific user', () => {
      const portfolio = {
        totalValue: 100000,
        cash: 50000,
        equity: 50000,
        positions: [],
        dayChange: 5000,
        dayChangePercent: 5
      };

      wsServer.emitPortfolioUpdate('user-456', portfolio);

      expect(mockIO.to).toHaveBeenCalledWith('user:user-456');
    });

    test('should not emit portfolio update without userId', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      wsServer.emitPortfolioUpdate(null, { totalValue: 100000 });

      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid portfolio update'));
      expect(mockIO.to).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    test('should emit trade notification to specific user', () => {
      const trade = {
        id: 'trade-123',
        symbol: 'AAPL',
        side: 'buy',
        quantity: 10,
        price: 150.5,
        status: 'filled'
      };

      wsServer.emitTradeNotification('user-456', trade);

      expect(mockIO.to).toHaveBeenCalledWith('user:user-456');
    });

    test('should emit trade failure to specific user', () => {
      const error = {
        message: 'Insufficient buying power',
        signal: { symbol: 'TSLA', action: 'buy' }
      };

      wsServer.emitTradeFailure('user-456', error);

      expect(mockIO.to).toHaveBeenCalledWith('user:user-456');
    });

    test('should emit quote update to symbol room', () => {
      const quote = {
        price: 150.5,
        change: 5.5,
        changePercent: 3.79,
        volume: 1000000
      };

      wsServer.emitQuoteUpdate('AAPL', quote);

      expect(mockIO.to).toHaveBeenCalledWith('symbol:AAPL');
    });

    test('should emit market status to all clients', () => {
      const status = {
        isOpen: true,
        nextOpen: '2024-01-02T09:30:00Z',
        nextClose: '2024-01-02T16:00:00Z'
      };

      wsServer.emitMarketStatus(status);

      expect(mockIO.emit).toHaveBeenCalledWith(
        'market:status',
        expect.objectContaining({
          isOpen: true
        })
      );
    });

    test('should not emit quote update for invalid data', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      wsServer.emitQuoteUpdate(null, { price: 150 });

      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid quote update'));

      consoleWarnSpy.mockRestore();
    });
  });

  describe('Statistics & Monitoring', () => {
    beforeEach(() => {
      wsServer = new WebSocketServer(mockHttpServer);
    });

    test('should return connection statistics', () => {
      wsServer.connectionStats = {
        total: 100,
        active: 50,
        byUser: new Map([
          ['user-1', 2],
          ['user-2', 3]
        ])
      };

      const stats = wsServer.getStats();

      expect(stats).toEqual({
        totalConnections: 100,
        activeConnections: 50,
        uniqueUsers: 2,
        averageConnectionsPerUser: '25.00'
      });
    });

    test('should handle zero active connections in stats', () => {
      wsServer.connectionStats = {
        total: 0,
        active: 0,
        byUser: new Map()
      };

      const stats = wsServer.getStats();

      expect(stats.averageConnectionsPerUser).toBe(0);
    });
  });

  describe('Graceful Shutdown', () => {
    beforeEach(() => {
      wsServer = new WebSocketServer(mockHttpServer);
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('should notify clients before shutdown', async () => {
      const closePromise = wsServer.close();

      expect(mockIO.emit).toHaveBeenCalledWith('server:shutdown', {
        message: 'Server is shutting down',
        timestamp: expect.any(String)
      });

      // Fast forward through the 1 second delay
      jest.advanceTimersByTime(1000);

      await closePromise;

      expect(mockIO.close).toHaveBeenCalled();
    });

    test('should close all connections after notification', async () => {
      const closePromise = wsServer.close();

      jest.advanceTimersByTime(1000);

      await closePromise;

      expect(mockIO.close).toHaveBeenCalled();
    });
  });

  describe('Edge Cases & Error Handling', () => {
    beforeEach(() => {
      wsServer = new WebSocketServer(mockHttpServer);
    });

    test('should handle missing portfolio data gracefully', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      wsServer.emitPortfolioUpdate('user-456', null);

      expect(consoleWarnSpy).toHaveBeenCalled();
      expect(mockIO.to).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    test('should handle missing trade data gracefully', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      wsServer.emitTradeNotification('user-456', null);

      expect(consoleWarnSpy).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    test('should handle Redis adapter setup failure gracefully', () => {
      process.env.NODE_ENV = 'production';
      process.env.REDIS_URL = 'redis://localhost:6379';

      // Make Redis constructor throw
      Redis.mockImplementation(() => {
        throw new Error('Connection refused');
      });

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      // Should not throw, should fall back to single-instance mode
      expect(() => {
        wsServer = new WebSocketServer(mockHttpServer);
      }).not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Redis adapter setup failed'),
        expect.anything()
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('single-instance mode'));

      consoleErrorSpy.mockRestore();
      consoleLogSpy.mockRestore();
    });

    test('should handle socket error events', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const connectionHandler = mockIO.handlers.connection;

      connectionHandler(mockSocket);

      const errorHandler = mockSocket.on.mock.calls.find(call => call[0] === 'error')[1];

      errorHandler(new Error('Socket error'));

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('WebSocket error'), expect.any(Error));

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Performance', () => {
    beforeEach(() => {
      wsServer = new WebSocketServer(mockHttpServer);
    });

    test('should handle multiple concurrent connections efficiently', () => {
      const connectionHandler = mockIO.handlers.connection;

      const startTime = Date.now();

      // Simulate 100 concurrent connections
      for (let i = 0; i < 100; i++) {
        const socket = {
          ...mockSocket,
          id: `socket-${i}`,
          userId: `user-${i}`,
          join: jest.fn(),
          on: jest.fn(),
          emit: jest.fn(),
          rateLimit: new Map()
        };

        connectionHandler(socket);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should handle 100 connections in less than 100ms
      expect(duration).toBeLessThan(100);
    });

    test('should check rate limits quickly', () => {
      const iterations = 1000;

      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        wsServer.checkRateLimit(mockSocket, 'subscribe:watchlist');
      }

      const endTime = Date.now();
      const averageTime = (endTime - startTime) / iterations;

      // Should check rate limit in less than 1ms on average
      expect(averageTime).toBeLessThan(1);
    });
  });
});
