/**
 * Unit Tests for WebSocket Event Handlers
 * Tests all client-to-server event handlers
 */

// Mock logger before importing modules
jest.mock('../../../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn()
}));

const { createEventHandlers } = require('../../../src/services/websocket/handlers');

describe('WebSocket Event Handlers', () => {
  let handlers;
  let mockRateLimiter;
  let mockSocket;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock rate limiter
    mockRateLimiter = {
      checkEventLimit: jest.fn().mockResolvedValue(true),
      checkSubscriptionLimit: jest.fn().mockResolvedValue(true),
      incrementSubscription: jest.fn().mockResolvedValue(undefined),
      decrementSubscription: jest.fn().mockResolvedValue(undefined)
    };

    // Mock socket
    mockSocket = {
      id: 'socket-123',
      handshake: {
        auth: {
          userId: 'user-456',
          userName: 'Test User',
          authenticated: true
        }
      },
      join: jest.fn(),
      leave: jest.fn(),
      emit: jest.fn()
    };

    // Create handlers
    handlers = createEventHandlers(mockRateLimiter);
  });

  describe('handlePortfolioSubscribe', () => {
    describe('Successful Subscription', () => {
      test('should subscribe authenticated user to portfolio updates', async () => {
        await handlers['subscribe:portfolio'](mockSocket, {});

        expect(mockRateLimiter.checkEventLimit).toHaveBeenCalledWith(mockSocket, 'subscribe:portfolio');
        expect(mockRateLimiter.checkSubscriptionLimit).toHaveBeenCalledWith(mockSocket);
        expect(mockSocket.join).toHaveBeenCalledWith('portfolio:user-456');
        expect(mockRateLimiter.incrementSubscription).toHaveBeenCalledWith(mockSocket);
        expect(mockSocket.emit).toHaveBeenCalledWith('subscribed:portfolio', {
          success: true,
          userId: 'user-456',
          timestamp: expect.any(String)
        });
      });

      test('should emit confirmation with timestamp', async () => {
        const beforeTime = new Date().toISOString();
        await handlers['subscribe:portfolio'](mockSocket, {});
        const afterTime = new Date().toISOString();

        const emitCall = mockSocket.emit.mock.calls[0];
        expect(emitCall[0]).toBe('subscribed:portfolio');
        expect(emitCall[1].timestamp).toBeDefined();
        expect(emitCall[1].timestamp >= beforeTime).toBe(true);
        expect(emitCall[1].timestamp <= afterTime).toBe(true);
      });
    });

    describe('Authentication Validation', () => {
      test('should reject unauthenticated socket', async () => {
        mockSocket.handshake.auth.authenticated = false;

        await handlers['subscribe:portfolio'](mockSocket, {});

        expect(mockSocket.join).not.toHaveBeenCalled();
        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          event: 'subscribe:portfolio',
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        });
      });

      test('should reject socket without auth', async () => {
        mockSocket.handshake.auth = null;

        await handlers['subscribe:portfolio'](mockSocket, {});

        expect(mockSocket.join).not.toHaveBeenCalled();
        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          event: 'subscribe:portfolio',
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        });
      });
    });

    describe('Rate Limiting', () => {
      test('should reject when event rate limit exceeded', async () => {
        mockRateLimiter.checkEventLimit.mockResolvedValue(false);

        await handlers['subscribe:portfolio'](mockSocket, {});

        expect(mockSocket.join).not.toHaveBeenCalled();
        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          event: 'subscribe:portfolio',
          code: 'RATE_LIMIT',
          message: 'Too many subscription requests'
        });
      });

      test('should reject when subscription limit exceeded', async () => {
        mockRateLimiter.checkSubscriptionLimit.mockResolvedValue(false);

        await handlers['subscribe:portfolio'](mockSocket, {});

        expect(mockSocket.join).not.toHaveBeenCalled();
        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          event: 'subscribe:portfolio',
          code: 'SUBSCRIPTION_LIMIT',
          message: 'Maximum subscriptions reached'
        });
      });
    });

    describe('Error Handling', () => {
      test('should handle rate limiter errors gracefully', async () => {
        mockRateLimiter.checkEventLimit.mockRejectedValue(new Error('Rate limiter error'));

        await handlers['subscribe:portfolio'](mockSocket, {});

        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          event: 'subscribe:portfolio',
          code: 'SERVER_ERROR',
          message: 'Failed to subscribe to portfolio updates'
        });
      });

      test('should handle socket.join errors gracefully', async () => {
        mockSocket.join.mockImplementation(() => {
          throw new Error('Join error');
        });

        await handlers['subscribe:portfolio'](mockSocket, {});

        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          event: 'subscribe:portfolio',
          code: 'SERVER_ERROR',
          message: 'Failed to subscribe to portfolio updates'
        });
      });
    });
  });

  describe('handleTradesSubscribe', () => {
    describe('Successful Subscription', () => {
      test('should subscribe authenticated user to trade notifications', async () => {
        await handlers['subscribe:trades'](mockSocket, {});

        expect(mockRateLimiter.checkEventLimit).toHaveBeenCalledWith(mockSocket, 'subscribe:trades');
        expect(mockRateLimiter.checkSubscriptionLimit).toHaveBeenCalledWith(mockSocket);
        expect(mockSocket.join).toHaveBeenCalledWith('trades:user-456');
        expect(mockRateLimiter.incrementSubscription).toHaveBeenCalledWith(mockSocket);
        expect(mockSocket.emit).toHaveBeenCalledWith('subscribed:trades', {
          success: true,
          userId: 'user-456',
          timestamp: expect.any(String)
        });
      });
    });

    describe('Authentication Validation', () => {
      test('should reject unauthenticated socket', async () => {
        mockSocket.handshake.auth.authenticated = false;

        await handlers['subscribe:trades'](mockSocket, {});

        expect(mockSocket.join).not.toHaveBeenCalled();
        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          event: 'subscribe:trades',
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        });
      });
    });

    describe('Rate Limiting', () => {
      test('should reject when event rate limit exceeded', async () => {
        mockRateLimiter.checkEventLimit.mockResolvedValue(false);

        await handlers['subscribe:trades'](mockSocket, {});

        expect(mockSocket.join).not.toHaveBeenCalled();
        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          event: 'subscribe:trades',
          code: 'RATE_LIMIT',
          message: 'Too many subscription requests'
        });
      });

      test('should reject when subscription limit exceeded', async () => {
        mockRateLimiter.checkSubscriptionLimit.mockResolvedValue(false);

        await handlers['subscribe:trades'](mockSocket, {});

        expect(mockSocket.join).not.toHaveBeenCalled();
        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          event: 'subscribe:trades',
          code: 'SUBSCRIPTION_LIMIT',
          message: 'Maximum subscriptions reached'
        });
      });
    });
  });

  describe('handleWatchlistSubscribe', () => {
    describe('Successful Subscription', () => {
      test('should subscribe to single symbol', async () => {
        const data = { symbols: ['AAPL'] };

        await handlers['subscribe:watchlist'](mockSocket, data);

        expect(mockSocket.join).toHaveBeenCalledWith('watchlist:AAPL');
        expect(mockRateLimiter.incrementSubscription).toHaveBeenCalledTimes(1);
        expect(mockSocket.emit).toHaveBeenCalledWith('subscribed:watchlist', {
          success: true,
          symbols: ['AAPL'],
          userId: 'user-456',
          timestamp: expect.any(String)
        });
      });

      test('should subscribe to multiple symbols', async () => {
        const data = { symbols: ['AAPL', 'GOOGL', 'MSFT'] };

        await handlers['subscribe:watchlist'](mockSocket, data);

        expect(mockSocket.join).toHaveBeenCalledWith('watchlist:AAPL');
        expect(mockSocket.join).toHaveBeenCalledWith('watchlist:GOOGL');
        expect(mockSocket.join).toHaveBeenCalledWith('watchlist:MSFT');
        expect(mockRateLimiter.incrementSubscription).toHaveBeenCalledTimes(3);
        expect(mockSocket.emit).toHaveBeenCalledWith('subscribed:watchlist', {
          success: true,
          symbols: ['AAPL', 'GOOGL', 'MSFT'],
          userId: 'user-456',
          timestamp: expect.any(String)
        });
      });

      test('should normalize symbols to uppercase', async () => {
        const data = { symbols: ['aapl', 'googl'] };

        await handlers['subscribe:watchlist'](mockSocket, data);

        expect(mockSocket.join).toHaveBeenCalledWith('watchlist:AAPL');
        expect(mockSocket.join).toHaveBeenCalledWith('watchlist:GOOGL');
      });

      test('should limit to 50 symbols', async () => {
        const symbols = Array.from({ length: 60 }, (_, i) => `SYM${i}`);
        const data = { symbols };

        await handlers['subscribe:watchlist'](mockSocket, data);

        expect(mockSocket.join).toHaveBeenCalledTimes(50);
        expect(mockRateLimiter.incrementSubscription).toHaveBeenCalledTimes(50);

        const emitCall = mockSocket.emit.mock.calls.find(call => call[0] === 'subscribed:watchlist');
        expect(emitCall[1].symbols).toHaveLength(50);
      });
    });

    describe('Input Validation', () => {
      test('should reject null data', async () => {
        await handlers['subscribe:watchlist'](mockSocket, null);

        expect(mockSocket.join).not.toHaveBeenCalled();
        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          event: 'subscribe:watchlist',
          code: 'INVALID_PARAMS',
          message: 'Invalid symbols array'
        });
      });

      test('should reject non-array symbols', async () => {
        await handlers['subscribe:watchlist'](mockSocket, { symbols: 'AAPL' });

        expect(mockSocket.join).not.toHaveBeenCalled();
        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          event: 'subscribe:watchlist',
          code: 'INVALID_PARAMS',
          message: 'Invalid symbols array'
        });
      });

      test('should reject empty symbols array', async () => {
        await handlers['subscribe:watchlist'](mockSocket, { symbols: [] });

        expect(mockSocket.join).not.toHaveBeenCalled();
        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          event: 'subscribe:watchlist',
          code: 'INVALID_PARAMS',
          message: 'Invalid symbols array'
        });
      });
    });

    describe('Authentication Validation', () => {
      test('should reject unauthenticated socket', async () => {
        mockSocket.handshake.auth.authenticated = false;

        await handlers['subscribe:watchlist'](mockSocket, { symbols: ['AAPL'] });

        expect(mockSocket.join).not.toHaveBeenCalled();
        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          event: 'subscribe:watchlist',
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        });
      });
    });

    describe('Rate Limiting', () => {
      test('should reject when event rate limit exceeded', async () => {
        mockRateLimiter.checkEventLimit.mockResolvedValue(false);

        await handlers['subscribe:watchlist'](mockSocket, { symbols: ['AAPL'] });

        expect(mockSocket.join).not.toHaveBeenCalled();
        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          event: 'subscribe:watchlist',
          code: 'RATE_LIMIT',
          message: 'Too many subscription requests'
        });
      });

      test('should reject when subscription limit exceeded for any symbol', async () => {
        // Allow first symbol, reject second
        mockRateLimiter.checkSubscriptionLimit
          .mockResolvedValueOnce(true)
          .mockResolvedValueOnce(false);

        await handlers['subscribe:watchlist'](mockSocket, { symbols: ['AAPL', 'GOOGL'] });

        expect(mockSocket.join).not.toHaveBeenCalled();
        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          event: 'subscribe:watchlist',
          code: 'SUBSCRIPTION_LIMIT',
          message: 'Maximum subscriptions reached'
        });
      });
    });
  });

  describe('handleWatchlistUnsubscribe', () => {
    describe('Successful Unsubscription', () => {
      test('should unsubscribe from single symbol', async () => {
        const data = { symbols: ['AAPL'] };

        await handlers['unsubscribe:watchlist'](mockSocket, data);

        expect(mockSocket.leave).toHaveBeenCalledWith('watchlist:AAPL');
        expect(mockRateLimiter.decrementSubscription).toHaveBeenCalledTimes(1);
        expect(mockSocket.emit).toHaveBeenCalledWith('unsubscribed:watchlist', {
          success: true,
          symbols: ['AAPL'],
          userId: 'user-456',
          timestamp: expect.any(String)
        });
      });

      test('should unsubscribe from multiple symbols', async () => {
        const data = { symbols: ['AAPL', 'GOOGL', 'MSFT'] };

        await handlers['unsubscribe:watchlist'](mockSocket, data);

        expect(mockSocket.leave).toHaveBeenCalledWith('watchlist:AAPL');
        expect(mockSocket.leave).toHaveBeenCalledWith('watchlist:GOOGL');
        expect(mockSocket.leave).toHaveBeenCalledWith('watchlist:MSFT');
        expect(mockRateLimiter.decrementSubscription).toHaveBeenCalledTimes(3);
      });

      test('should normalize symbols to uppercase', async () => {
        const data = { symbols: ['aapl', 'googl'] };

        await handlers['unsubscribe:watchlist'](mockSocket, data);

        expect(mockSocket.leave).toHaveBeenCalledWith('watchlist:AAPL');
        expect(mockSocket.leave).toHaveBeenCalledWith('watchlist:GOOGL');
      });

      test('should limit to 50 symbols', async () => {
        const symbols = Array.from({ length: 60 }, (_, i) => `SYM${i}`);
        const data = { symbols };

        await handlers['unsubscribe:watchlist'](mockSocket, data);

        expect(mockSocket.leave).toHaveBeenCalledTimes(50);
        expect(mockRateLimiter.decrementSubscription).toHaveBeenCalledTimes(50);
      });
    });

    describe('Input Validation', () => {
      test('should reject null data', async () => {
        await handlers['unsubscribe:watchlist'](mockSocket, null);

        expect(mockSocket.leave).not.toHaveBeenCalled();
        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          event: 'unsubscribe:watchlist',
          code: 'INVALID_PARAMS',
          message: 'Invalid symbols array'
        });
      });

      test('should reject non-array symbols', async () => {
        await handlers['unsubscribe:watchlist'](mockSocket, { symbols: 'AAPL' });

        expect(mockSocket.leave).not.toHaveBeenCalled();
        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          event: 'unsubscribe:watchlist',
          code: 'INVALID_PARAMS',
          message: 'Invalid symbols array'
        });
      });

      test('should reject empty symbols array', async () => {
        await handlers['unsubscribe:watchlist'](mockSocket, { symbols: [] });

        expect(mockSocket.leave).not.toHaveBeenCalled();
        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          event: 'unsubscribe:watchlist',
          code: 'INVALID_PARAMS',
          message: 'Invalid symbols array'
        });
      });
    });

    describe('Authentication Validation', () => {
      test('should reject unauthenticated socket', async () => {
        mockSocket.handshake.auth.authenticated = false;

        await handlers['unsubscribe:watchlist'](mockSocket, { symbols: ['AAPL'] });

        expect(mockSocket.leave).not.toHaveBeenCalled();
        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          event: 'unsubscribe:watchlist',
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        });
      });
    });

    describe('Rate Limiting', () => {
      test('should reject when event rate limit exceeded', async () => {
        mockRateLimiter.checkEventLimit.mockResolvedValue(false);

        await handlers['unsubscribe:watchlist'](mockSocket, { symbols: ['AAPL'] });

        expect(mockSocket.leave).not.toHaveBeenCalled();
        expect(mockSocket.emit).toHaveBeenCalledWith('error', {
          event: 'unsubscribe:watchlist',
          code: 'RATE_LIMIT',
          message: 'Too many requests'
        });
      });
    });
  });

  describe('handlePing', () => {
    test('should respond with pong', () => {
      const data = { timestamp: '2025-10-17T12:00:00.000Z' };

      handlers.ping(mockSocket, data);

      expect(mockSocket.emit).toHaveBeenCalledWith('pong', {
        clientTimestamp: '2025-10-17T12:00:00.000Z',
        serverTimestamp: expect.any(String)
      });
    });

    test('should respond with pong without client timestamp', () => {
      handlers.ping(mockSocket, null);

      expect(mockSocket.emit).toHaveBeenCalledWith('pong', {
        clientTimestamp: undefined,
        serverTimestamp: expect.any(String)
      });
    });

    test('should include server timestamp', () => {
      const beforeTime = new Date().toISOString();
      handlers.ping(mockSocket, {});
      const afterTime = new Date().toISOString();

      const emitCall = mockSocket.emit.mock.calls[0];
      expect(emitCall[1].serverTimestamp).toBeDefined();
      expect(emitCall[1].serverTimestamp >= beforeTime).toBe(true);
      expect(emitCall[1].serverTimestamp <= afterTime).toBe(true);
    });
  });

  describe('createEventHandlers()', () => {
    test('should return all handler functions', () => {
      const handlers = createEventHandlers(mockRateLimiter);

      expect(handlers).toHaveProperty('subscribe:portfolio');
      expect(handlers).toHaveProperty('subscribe:trades');
      expect(handlers).toHaveProperty('subscribe:watchlist');
      expect(handlers).toHaveProperty('unsubscribe:watchlist');
      expect(handlers).toHaveProperty('ping');
      expect(typeof handlers['subscribe:portfolio']).toBe('function');
      expect(typeof handlers['subscribe:trades']).toBe('function');
      expect(typeof handlers['subscribe:watchlist']).toBe('function');
      expect(typeof handlers['unsubscribe:watchlist']).toBe('function');
      expect(typeof handlers.ping).toBe('function');
    });
  });

  describe('Edge Cases', () => {
    test('should handle socket without handshake.auth gracefully', async () => {
      mockSocket.handshake.auth = undefined;

      await handlers['subscribe:portfolio'](mockSocket, {});

      expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        code: 'UNAUTHORIZED'
      }));
    });

    test('should handle socket without userId gracefully', async () => {
      mockSocket.handshake.auth = { authenticated: true };

      await handlers['subscribe:portfolio'](mockSocket, {});

      expect(mockSocket.join).toHaveBeenCalledWith('portfolio:undefined');
      expect(mockSocket.emit).toHaveBeenCalledWith('subscribed:portfolio', expect.objectContaining({
        userId: undefined
      }));
    });
  });
});
