/**
 * Unit Tests for WebSocketServer (New Modular Architecture)
 * Tests the new modular WebSocket server with Redis adapter support
 */

const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const Redis = require('ioredis');
const WebSocketServer = require('../../../src/services/websocket/WebSocketServer');

// Mock dependencies
jest.mock('socket.io');
jest.mock('@socket.io/redis-adapter');
jest.mock('ioredis');
jest.mock('../../../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn()
}));

describe('WebSocketServer (Modular)', () => {
  let wsServer;
  let mockHttpServer;
  let mockIO;
  let mockSocket;
  let mockRedisPubClient;
  let mockRedisSubClient;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock HTTP server
    mockHttpServer = {
      listen: jest.fn(),
      close: jest.fn()
    };

    // Mock socket
    mockSocket = {
      id: 'socket-123',
      handshake: {
        auth: {
          sessionID: 'session-789',
          userId: 'user-456',
          userName: 'Test User',
          authenticated: true
        },
        address: '127.0.0.1'
      },
      join: jest.fn(),
      leave: jest.fn(),
      emit: jest.fn(),
      on: jest.fn()
    };

    // Mock Redis clients
    mockRedisPubClient = {
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(1),
      decr: jest.fn().mockResolvedValue(0),
      quit: jest.fn().mockResolvedValue('OK'),
      on: jest.fn()
    };

    mockRedisSubClient = {
      quit: jest.fn().mockResolvedValue('OK'),
      on: jest.fn()
    };

    Redis.mockImplementation((url) => {
      if (url === process.env.REDIS_URL) {
        return mockRedisPubClient;
      }
      return mockRedisSubClient;
    });

    // Mock Socket.io instance
    mockIO = {
      use: jest.fn(),
      on: jest.fn((event, handler) => {
        if (event === 'connection') {
          mockIO.connectionHandler = handler;
        }
      }),
      emit: jest.fn(),
      to: jest.fn(() => ({
        emit: jest.fn()
      })),
      adapter: jest.fn(),
      close: jest.fn(),
      disconnectSockets: jest.fn(),
      sockets: {
        sockets: new Map()
      }
    };

    Server.mockImplementation(() => mockIO);
    createAdapter.mockReturnValue(jest.fn());

    // Reset environment
    delete process.env.REDIS_URL;
  });

  afterEach(() => {
    if (wsServer) {
      wsServer.initialized = false;
    }
  });

  describe('Constructor', () => {
    test('should create WebSocket server with default options', () => {
      wsServer = new WebSocketServer(mockHttpServer);

      expect(Server).toHaveBeenCalledWith(
        mockHttpServer,
        expect.objectContaining({
          cors: expect.objectContaining({
            origin: expect.any(String),
            methods: ['GET', 'POST'],
            credentials: true
          }),
          transports: ['websocket', 'polling'],
          pingTimeout: 60000,
          pingInterval: 25000
        })
      );
    });

    test('should use custom CORS origin from environment', () => {
      process.env.CORS_ORIGIN = 'https://example.com';
      wsServer = new WebSocketServer(mockHttpServer);

      expect(Server).toHaveBeenCalledWith(
        mockHttpServer,
        expect.objectContaining({
          cors: expect.objectContaining({
            origin: 'https://example.com'
          })
        })
      );
    });

    test('should accept custom options', () => {
      const customOptions = {
        pingTimeout: 30000,
        pingInterval: 10000
      };

      wsServer = new WebSocketServer(mockHttpServer, customOptions);

      expect(Server).toHaveBeenCalledWith(
        mockHttpServer,
        expect.objectContaining(customOptions)
      );
    });

    test('should initialize with empty state', () => {
      wsServer = new WebSocketServer(mockHttpServer);

      expect(wsServer.initialized).toBe(false);
      expect(wsServer.io).toBe(mockIO);
      expect(wsServer.redisClient).toBeNull();
      expect(wsServer.activeConnections).toBeInstanceOf(Map);
      expect(wsServer.eventHandlers).toBeInstanceOf(Map);
    });
  });

  describe('initialize()', () => {
    test('should initialize without Redis when REDIS_URL not set', async () => {
      wsServer = new WebSocketServer(mockHttpServer);
      await wsServer.initialize();

      expect(wsServer.initialized).toBe(true);
      expect(mockIO.on).toHaveBeenCalledWith('connection', expect.any(Function));
      expect(Redis).not.toHaveBeenCalled();
    });

    test('should initialize with Redis adapter when REDIS_URL is set', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      wsServer = new WebSocketServer(mockHttpServer);
      await wsServer.initialize();

      expect(Redis).toHaveBeenCalledTimes(2); // Pub and Sub clients
      expect(createAdapter).toHaveBeenCalledWith(
        mockRedisPubClient,
        mockRedisSubClient
      );
      expect(mockIO.adapter).toHaveBeenCalled();
      expect(wsServer.initialized).toBe(true);
    });

    test('should not initialize twice', async () => {
      wsServer = new WebSocketServer(mockHttpServer);
      await wsServer.initialize();
      await wsServer.initialize();

      // Should only call setup once
      expect(mockIO.on).toHaveBeenCalledTimes(1);
    });

    test('should handle Redis initialization error gracefully', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      Redis.mockImplementation(() => {
        throw new Error('Connection refused');
      });

      wsServer = new WebSocketServer(mockHttpServer);

      await expect(wsServer.initialize()).rejects.toThrow();
      expect(wsServer.initialized).toBe(false);
    });
  });

  describe('Middleware Management', () => {
    beforeEach(async () => {
      wsServer = new WebSocketServer(mockHttpServer);
      await wsServer.initialize();
    });

    test('should apply authentication middleware', () => {
      const authMiddleware = jest.fn();
      wsServer.setAuthMiddleware(authMiddleware);

      expect(mockIO.use).toHaveBeenCalledWith(authMiddleware);
      expect(wsServer.authMiddleware).toBe(authMiddleware);
    });

    test('should apply rate limit middleware', () => {
      const rateLimitMiddleware = jest.fn();
      wsServer.setRateLimitMiddleware(rateLimitMiddleware);

      expect(mockIO.use).toHaveBeenCalledWith(rateLimitMiddleware);
      expect(wsServer.rateLimitMiddleware).toBe(rateLimitMiddleware);
    });
  });

  describe('Event Handler Registration', () => {
    beforeEach(async () => {
      wsServer = new WebSocketServer(mockHttpServer);
      await wsServer.initialize();
    });

    test('should register event handler', () => {
      const handler = jest.fn();
      wsServer.registerEventHandler('subscribe:portfolio', handler);

      expect(wsServer.eventHandlers.has('subscribe:portfolio')).toBe(true);
      expect(wsServer.eventHandlers.get('subscribe:portfolio')).toBe(handler);
    });

    test('should register multiple event handlers', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      wsServer.registerEventHandler('subscribe:portfolio', handler1);
      wsServer.registerEventHandler('subscribe:trades', handler2);

      expect(wsServer.eventHandlers.size).toBe(2);
      expect(wsServer.eventHandlers.get('subscribe:portfolio')).toBe(handler1);
      expect(wsServer.eventHandlers.get('subscribe:trades')).toBe(handler2);
    });
  });

  describe('Connection Handling', () => {
    beforeEach(async () => {
      wsServer = new WebSocketServer(mockHttpServer);
      await wsServer.initialize();
    });

    test('should handle new connection and track user', () => {
      wsServer.handleConnection(mockSocket);

      expect(mockSocket.join).toHaveBeenCalledWith('user:user-456');
      expect(wsServer.activeConnections.has('user-456')).toBe(true);
      expect(wsServer.activeConnections.get('user-456').has('socket-123')).toBe(true);
    });

    test('should attach registered event handlers on connection', () => {
      const portfolioHandler = jest.fn();
      const tradesHandler = jest.fn();

      wsServer.registerEventHandler('subscribe:portfolio', portfolioHandler);
      wsServer.registerEventHandler('subscribe:trades', tradesHandler);

      wsServer.handleConnection(mockSocket);

      expect(mockSocket.on).toHaveBeenCalledWith('subscribe:portfolio', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('subscribe:trades', expect.any(Function));
    });

    test('should call event handler when event is triggered', () => {
      const handler = jest.fn();
      wsServer.registerEventHandler('subscribe:portfolio', handler);

      wsServer.handleConnection(mockSocket);

      // Get the handler wrapper that was attached
      const onCalls = mockSocket.on.mock.calls.filter(call => call[0] === 'subscribe:portfolio');
      expect(onCalls.length).toBe(1);

      const [eventName, handlerWrapper] = onCalls[0];
      const testData = { test: 'data' };

      // Call the wrapper with test data
      handlerWrapper(testData);

      expect(handler).toHaveBeenCalledWith(mockSocket, testData);
    });

    test('should handle event handler errors gracefully', () => {
      const errorHandler = jest.fn(() => {
        throw new Error('Handler error');
      });

      wsServer.registerEventHandler('test:event', errorHandler);
      wsServer.handleConnection(mockSocket);

      // Get the handler wrapper
      const onCalls = mockSocket.on.mock.calls.filter(call => call[0] === 'test:event');
      const handlerWrapper = onCalls[0][1];

      // Should not throw
      expect(() => handlerWrapper({ test: 'data' })).not.toThrow();

      // Should emit error to client
      expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        event: 'test:event',
        message: expect.stringContaining('Internal server error')
      }));
    });

    test('should handle disconnect and clean up tracking', () => {
      wsServer.handleConnection(mockSocket);

      expect(wsServer.activeConnections.get('user-456').size).toBe(1);

      // Get disconnect handler
      const disconnectCall = mockSocket.on.mock.calls.find(call => call[0] === 'disconnect');
      const disconnectHandler = disconnectCall[1];

      // Trigger disconnect
      disconnectHandler('client disconnect');

      expect(wsServer.activeConnections.has('user-456')).toBe(false);
    });

    test('should track multiple connections for same user', () => {
      const socket2 = {
        ...mockSocket,
        id: 'socket-456',
        join: jest.fn(),
        on: jest.fn(),
        emit: jest.fn()
      };

      wsServer.handleConnection(mockSocket);
      wsServer.handleConnection(socket2);

      const userConnections = wsServer.activeConnections.get('user-456');
      expect(userConnections.size).toBe(2);
      expect(userConnections.has('socket-123')).toBe(true);
      expect(userConnections.has('socket-456')).toBe(true);
    });

    test('should send welcome message on connection', () => {
      wsServer.handleConnection(mockSocket);

      expect(mockSocket.emit).toHaveBeenCalledWith('connected', {
        socketId: 'socket-123',
        userId: 'user-456',
        timestamp: expect.any(String),
        message: 'WebSocket connection established'
      });
    });

    test('should handle connection from user without userId', () => {
      const anonymousSocket = {
        ...mockSocket,
        handshake: {
          auth: {}
        }
      };

      wsServer.handleConnection(anonymousSocket);

      // Should not track connection
      expect(wsServer.activeConnections.size).toBe(0);
      // Should still attach event handlers
      expect(anonymousSocket.on).toHaveBeenCalled();
    });
  });

  describe('Broadcasting Methods', () => {
    beforeEach(async () => {
      wsServer = new WebSocketServer(mockHttpServer);
      await wsServer.initialize();
    });

    test('emitToUser() should broadcast to user room', () => {
      const data = { test: 'data' };
      wsServer.emitToUser('user-123', 'test:event', data);

      expect(mockIO.to).toHaveBeenCalledWith('user:user-123');
      const roomEmitter = mockIO.to.mock.results[0].value;
      expect(roomEmitter.emit).toHaveBeenCalledWith('test:event', data);
    });

    test('emitToUser() should not crash when server not initialized', () => {
      wsServer.initialized = false;
      wsServer.io = null;

      expect(() => {
        wsServer.emitToUser('user-123', 'test:event', { test: 'data' });
      }).not.toThrow();
    });

    test('emitToRoom() should broadcast to specific room', () => {
      const data = { test: 'data' };
      wsServer.emitToRoom('portfolio:user-123', 'portfolio:updated', data);

      expect(mockIO.to).toHaveBeenCalledWith('portfolio:user-123');
    });

    test('emitToAll() should broadcast to all clients', () => {
      const data = { market: 'data' };
      wsServer.emitToAll('market:status', data);

      expect(mockIO.emit).toHaveBeenCalledWith('market:status', data);
    });
  });

  describe('Connection Statistics', () => {
    beforeEach(async () => {
      wsServer = new WebSocketServer(mockHttpServer);
      await wsServer.initialize();
    });

    test('getUserConnectionCount() should return count for user', () => {
      wsServer.handleConnection(mockSocket);

      const count = wsServer.getUserConnectionCount('user-456');
      expect(count).toBe(1);
    });

    test('getUserConnectionCount() should return 0 for unknown user', () => {
      const count = wsServer.getUserConnectionCount('unknown-user');
      expect(count).toBe(0);
    });

    test('getTotalConnectionCount() should return total count', () => {
      mockIO.sockets.sockets = new Map([
        ['socket-1', {}],
        ['socket-2', {}],
        ['socket-3', {}]
      ]);

      const count = wsServer.getTotalConnectionCount();
      expect(count).toBe(3);
    });

    test('getStats() should return comprehensive statistics', () => {
      wsServer.activeConnections.set('user-1', new Set(['socket-1', 'socket-2']));
      wsServer.activeConnections.set('user-2', new Set(['socket-3']));
      mockIO.sockets.sockets = new Map([
        ['socket-1', {}],
        ['socket-2', {}],
        ['socket-3', {}]
      ]);

      const stats = wsServer.getStats();

      expect(stats).toEqual({
        initialized: true,
        totalConnections: 3,
        uniqueUsers: 2,
        redisAdapter: false,
        uptime: expect.any(Number)
      });
    });

    test('getStats() should indicate Redis adapter when present', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      wsServer = new WebSocketServer(mockHttpServer);
      await wsServer.initialize();

      const stats = wsServer.getStats();
      expect(stats.redisAdapter).toBe(true);
    });
  });

  describe('Graceful Shutdown', () => {
    beforeEach(async () => {
      wsServer = new WebSocketServer(mockHttpServer);
      await wsServer.initialize();
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('should notify clients before shutdown', async () => {
      const shutdownPromise = wsServer.shutdown();

      expect(mockIO.emit).toHaveBeenCalledWith('server:shutdown', {
        message: 'Server is shutting down for maintenance',
        timestamp: expect.any(String)
      });

      jest.advanceTimersByTime(1000);
      await shutdownPromise;

      expect(mockIO.disconnectSockets).toHaveBeenCalledWith(true);
      expect(mockIO.close).toHaveBeenCalled();
    });

    test('should close Redis clients on shutdown', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      wsServer = new WebSocketServer(mockHttpServer);
      await wsServer.initialize();

      const shutdownPromise = wsServer.shutdown();
      jest.advanceTimersByTime(1000);
      await shutdownPromise;

      expect(mockRedisPubClient.quit).toHaveBeenCalled();
      expect(mockRedisSubClient.quit).toHaveBeenCalled();
    });

    test('should reset state on shutdown', async () => {
      wsServer.activeConnections.set('user-1', new Set(['socket-1']));

      const shutdownPromise = wsServer.shutdown();
      jest.advanceTimersByTime(1000);
      await shutdownPromise;

      expect(wsServer.initialized).toBe(false);
      expect(wsServer.activeConnections.size).toBe(0);
      expect(wsServer.io).toBeNull();
      expect(wsServer.redisPubClient).toBeNull();
      expect(wsServer.redisSubClient).toBeNull();
    });

    test('should handle shutdown errors gracefully', async () => {
      mockIO.close.mockImplementation(() => {
        throw new Error('Close error');
      });

      await expect(wsServer.shutdown()).rejects.toThrow('Close error');
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      wsServer = new WebSocketServer(mockHttpServer);
      await wsServer.initialize();
    });

    test('should handle socket error events', () => {
      wsServer.handleConnection(mockSocket);

      const errorCall = mockSocket.on.mock.calls.find(call => call[0] === 'error');
      expect(errorCall).toBeDefined();

      const errorHandler = errorCall[1];
      const testError = new Error('Socket error');

      // Should not throw
      expect(() => errorHandler(testError)).not.toThrow();
    });

    test('should warn when emitting without initialization', () => {
      wsServer.io = null;
      wsServer.emitToUser('user-123', 'test', {});

      // Should not crash, just log warning
      expect(mockIO.to).not.toHaveBeenCalled();
    });
  });
});
