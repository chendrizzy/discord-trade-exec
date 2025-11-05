/**
 * Unit Tests for WebSocket Rate Limiting Middleware
 * Tests Redis-backed rate limiting with in-memory fallback
 */

const { createRateLimitMiddleware, RateLimiter } = require('../../../src/services/websocket/middleware/rateLimiter');

describe('WebSocket Rate Limiting Middleware', () => {
  let mockRedisClient;
  let rateLimiter;
  let mockSocket;
  let mockNext;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Mock Redis client
    mockRedisClient = {
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(1),
      decr: jest.fn().mockResolvedValue(0)
    };

    // Mock socket
    mockSocket = {
      id: 'socket-123',
      handshake: {
        auth: {
          userId: 'user-456'
        },
        address: '127.0.0.1'
      },
      request: {
        connection: {
          remoteAddress: '127.0.0.1'
        }
      }
    };

    // Mock next callback
    mockNext = jest.fn();
  });

  afterEach(() => {
    // Clean up rate limiter interval to prevent open handles
    if (rateLimiter && rateLimiter.shutdown) {
      rateLimiter.shutdown();
    }
    jest.useRealTimers();
  });

  describe('RateLimiter Class - Redis Mode', () => {
    beforeEach(() => {
      rateLimiter = new RateLimiter(mockRedisClient);
    });

    describe('Constructor', () => {
      test('should initialize with Redis client', () => {
        expect(rateLimiter.redisClient).toBe(mockRedisClient);
        expect(rateLimiter.inMemoryStore).toBeInstanceOf(Map);
      });

      test('should set default rate limits', () => {
        expect(rateLimiter.limits).toEqual({
          connectionsPerIP: {
            max: 10,
            window: 60000
          },
          eventsPerUser: {
            max: 100,
            window: 60000
          },
          subscriptionsPerUser: {
            max: 50
          }
        });
      });

      test('should not start cleanup interval with Redis', () => {
        const intervalSpy = jest.spyOn(global, 'setInterval');
        new RateLimiter(mockRedisClient);
        expect(intervalSpy).not.toHaveBeenCalled();
        intervalSpy.mockRestore();
      });
    });

    describe('checkAndIncrementRedis()', () => {
      test('should allow first request', async () => {
        mockRedisClient.incr.mockResolvedValue(1);

        const allowed = await rateLimiter.checkAndIncrementRedis('test:key', 10, 60000);

        expect(allowed).toBe(true);
        expect(mockRedisClient.incr).toHaveBeenCalledWith('test:key');
        expect(mockRedisClient.expire).toHaveBeenCalledWith('test:key', 60);
      });

      test('should allow requests within limit', async () => {
        mockRedisClient.incr.mockResolvedValue(5);

        const allowed = await rateLimiter.checkAndIncrementRedis('test:key', 10, 60000);

        expect(allowed).toBe(true);
      });

      test('should reject requests exceeding limit', async () => {
        mockRedisClient.incr.mockResolvedValue(11);

        const allowed = await rateLimiter.checkAndIncrementRedis('test:key', 10, 60000);

        expect(allowed).toBe(false);
      });

      test('should set expiry only on first increment', async () => {
        mockRedisClient.incr.mockResolvedValue(5); // Not first call

        await rateLimiter.checkAndIncrementRedis('test:key', 10, 60000);

        expect(mockRedisClient.expire).not.toHaveBeenCalled();
      });

      test('should convert window to seconds', async () => {
        mockRedisClient.incr.mockResolvedValue(1);

        await rateLimiter.checkAndIncrementRedis('test:key', 10, 120000); // 2 minutes

        expect(mockRedisClient.expire).toHaveBeenCalledWith('test:key', 120);
      });

      test('should fail open on Redis error', async () => {
        mockRedisClient.incr.mockRejectedValue(new Error('Redis connection error'));

        const allowed = await rateLimiter.checkAndIncrementRedis('test:key', 10, 60000);

        expect(allowed).toBe(true); // Fail open for availability
      });
    });

    describe('connectionLimit() middleware', () => {
      test('should allow connections within limit', async () => {
        mockRedisClient.incr.mockResolvedValue(5);

        const middleware = rateLimiter.connectionLimit();
        await middleware(mockSocket, mockNext);

        expect(mockNext).toHaveBeenCalledWith();
      });

      test('should reject connections exceeding limit', async () => {
        mockRedisClient.incr.mockResolvedValue(11);

        const middleware = rateLimiter.connectionLimit();
        await middleware(mockSocket, mockNext);

        expect(mockNext).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Too many connection attempts. Please try again later.',
            data: expect.objectContaining({
              code: 'RATE_LIMIT_EXCEEDED',
              type: 'connection',
              limit: 10,
              window: 60000
            })
          })
        );
      });

      test('should use IP address from handshake', async () => {
        mockRedisClient.incr.mockResolvedValue(1);

        const middleware = rateLimiter.connectionLimit();
        await middleware(mockSocket, mockNext);

        expect(mockRedisClient.incr).toHaveBeenCalledWith('ratelimit:connection:127.0.0.1');
      });

      test('should fail open on errors', async () => {
        mockRedisClient.incr.mockRejectedValue(new Error('Redis error'));

        const middleware = rateLimiter.connectionLimit();
        await middleware(mockSocket, mockNext);

        expect(mockNext).toHaveBeenCalledWith(); // Allow connection
      });
    });

    describe('checkEventLimit()', () => {
      test('should allow events within limit', async () => {
        mockRedisClient.incr.mockResolvedValue(50);

        const allowed = await rateLimiter.checkEventLimit(mockSocket, 'subscribe:portfolio');

        expect(allowed).toBe(true);
      });

      test('should reject events exceeding limit', async () => {
        mockRedisClient.incr.mockResolvedValue(101);

        const allowed = await rateLimiter.checkEventLimit(mockSocket, 'subscribe:portfolio');

        expect(allowed).toBe(false);
      });

      test('should allow events for unauthenticated sockets', async () => {
        mockSocket.handshake.auth = {};

        const allowed = await rateLimiter.checkEventLimit(mockSocket, 'some:event');

        expect(allowed).toBe(true);
        expect(mockRedisClient.incr).not.toHaveBeenCalled();
      });

      test('should use userId in rate limit key', async () => {
        mockRedisClient.incr.mockResolvedValue(1);

        await rateLimiter.checkEventLimit(mockSocket, 'subscribe:portfolio');

        expect(mockRedisClient.incr).toHaveBeenCalledWith('ratelimit:event:user-456');
      });

      test('should fail open on errors', async () => {
        mockRedisClient.incr.mockRejectedValue(new Error('Redis error'));

        const allowed = await rateLimiter.checkEventLimit(mockSocket, 'some:event');

        expect(allowed).toBe(true);
      });
    });

    describe('checkSubscriptionLimit()', () => {
      test('should allow subscriptions within limit', async () => {
        mockRedisClient.get.mockResolvedValue('25');

        const allowed = await rateLimiter.checkSubscriptionLimit(mockSocket);

        expect(allowed).toBe(true);
      });

      test('should reject subscriptions at limit', async () => {
        mockRedisClient.get.mockResolvedValue('50');

        const allowed = await rateLimiter.checkSubscriptionLimit(mockSocket);

        expect(allowed).toBe(false);
      });

      test('should allow first subscription (null from Redis)', async () => {
        mockRedisClient.get.mockResolvedValue(null);

        const allowed = await rateLimiter.checkSubscriptionLimit(mockSocket);

        expect(allowed).toBe(true);
      });

      test('should allow for unauthenticated sockets', async () => {
        mockSocket.handshake.auth = {};

        const allowed = await rateLimiter.checkSubscriptionLimit(mockSocket);

        expect(allowed).toBe(true);
        expect(mockRedisClient.get).not.toHaveBeenCalled();
      });
    });

    describe('incrementSubscription()', () => {
      test('should increment subscription count', async () => {
        await rateLimiter.incrementSubscription(mockSocket);

        expect(mockRedisClient.incr).toHaveBeenCalledWith('ratelimit:subscription:user-456');
      });

      test('should not increment for unauthenticated sockets', async () => {
        mockSocket.handshake.auth = {};

        await rateLimiter.incrementSubscription(mockSocket);

        expect(mockRedisClient.incr).not.toHaveBeenCalled();
      });

      test('should handle errors gracefully', async () => {
        mockRedisClient.incr.mockRejectedValue(new Error('Redis error'));

        await expect(rateLimiter.incrementSubscription(mockSocket)).resolves.not.toThrow();
      });
    });

    describe('decrementSubscription()', () => {
      test('should decrement subscription count', async () => {
        mockRedisClient.get.mockResolvedValue('5');

        await rateLimiter.decrementSubscription(mockSocket);

        expect(mockRedisClient.decr).toHaveBeenCalledWith('ratelimit:subscription:user-456');
      });

      test('should not decrement below zero', async () => {
        mockRedisClient.get.mockResolvedValue('0');

        await rateLimiter.decrementSubscription(mockSocket);

        expect(mockRedisClient.decr).not.toHaveBeenCalled();
      });

      test('should not decrement for unauthenticated sockets', async () => {
        mockSocket.handshake.auth = {};

        await rateLimiter.decrementSubscription(mockSocket);

        expect(mockRedisClient.get).not.toHaveBeenCalled();
      });
    });

    describe('resetSubscriptions()', () => {
      test('should delete subscription counter', async () => {
        await rateLimiter.resetSubscriptions('user-456');

        expect(mockRedisClient.del).toHaveBeenCalledWith('ratelimit:subscription:user-456');
      });

      test('should handle errors gracefully', async () => {
        mockRedisClient.del.mockRejectedValue(new Error('Redis error'));

        await expect(rateLimiter.resetSubscriptions('user-456')).resolves.not.toThrow();
      });
    });
  });

  describe('RateLimiter Class - In-Memory Mode', () => {
    beforeEach(() => {
      rateLimiter = new RateLimiter(null); // No Redis client
    });

    describe('Constructor', () => {
      test('should initialize without Redis client', () => {
        expect(rateLimiter.redisClient).toBeNull();
        expect(rateLimiter.inMemoryStore).toBeInstanceOf(Map);
      });

      test('should start cleanup interval without Redis', () => {
        const intervalSpy = jest.spyOn(global, 'setInterval');
        new RateLimiter(null);
        expect(intervalSpy).toHaveBeenCalledWith(expect.any(Function), 60000);
        intervalSpy.mockRestore();
      });
    });

    describe('checkAndIncrementMemory()', () => {
      test('should allow first request', () => {
        const allowed = rateLimiter.checkAndIncrementMemory('test:key', 10, 60000);

        expect(allowed).toBe(true);
        expect(rateLimiter.inMemoryStore.has('test:key')).toBe(true);
        expect(rateLimiter.inMemoryStore.get('test:key').count).toBe(1);
      });

      test('should allow requests within limit', () => {
        // First request
        rateLimiter.checkAndIncrementMemory('test:key', 10, 60000);

        // Second request
        const allowed = rateLimiter.checkAndIncrementMemory('test:key', 10, 60000);

        expect(allowed).toBe(true);
        expect(rateLimiter.inMemoryStore.get('test:key').count).toBe(2);
      });

      test('should reject requests exceeding limit', () => {
        // Set to limit
        rateLimiter.inMemoryStore.set('test:key', {
          count: 10,
          resetAt: Date.now() + 60000
        });

        const allowed = rateLimiter.checkAndIncrementMemory('test:key', 10, 60000);

        expect(allowed).toBe(false);
      });

      test('should reset after window expires', () => {
        // Set entry that expired
        rateLimiter.inMemoryStore.set('test:key', {
          count: 10,
          resetAt: Date.now() - 1000 // Expired 1 second ago
        });

        const allowed = rateLimiter.checkAndIncrementMemory('test:key', 10, 60000);

        expect(allowed).toBe(true);
        expect(rateLimiter.inMemoryStore.get('test:key').count).toBe(1);
      });

      test('should track resetAt timestamp', () => {
        const now = Date.now();
        jest.setSystemTime(now);

        rateLimiter.checkAndIncrementMemory('test:key', 10, 60000);

        const entry = rateLimiter.inMemoryStore.get('test:key');
        expect(entry.resetAt).toBe(now + 60000);
      });
    });

    describe('cleanupInMemory()', () => {
      test('should remove expired entries', () => {
        const now = Date.now();
        jest.setSystemTime(now);

        // Add expired entry
        rateLimiter.inMemoryStore.set('expired:key', {
          count: 5,
          resetAt: now - 1000 // Expired
        });

        // Add valid entry
        rateLimiter.inMemoryStore.set('valid:key', {
          count: 3,
          resetAt: now + 60000 // Not expired
        });

        rateLimiter.cleanupInMemory();

        expect(rateLimiter.inMemoryStore.has('expired:key')).toBe(false);
        expect(rateLimiter.inMemoryStore.has('valid:key')).toBe(true);
      });

      test('should clean multiple expired entries', () => {
        const now = Date.now();
        jest.setSystemTime(now);

        rateLimiter.inMemoryStore.set('expired1', { count: 1, resetAt: now - 1000 });
        rateLimiter.inMemoryStore.set('expired2', { count: 2, resetAt: now - 2000 });
        rateLimiter.inMemoryStore.set('valid', { count: 3, resetAt: now + 60000 });

        rateLimiter.cleanupInMemory();

        expect(rateLimiter.inMemoryStore.size).toBe(1);
        expect(rateLimiter.inMemoryStore.has('valid')).toBe(true);
      });
    });

    describe('checkSubscriptionLimit() - In-Memory', () => {
      test('should allow subscriptions within limit', async () => {
        rateLimiter.inMemoryStore.set('ratelimit:subscription:user-456', {
          count: 25
        });

        const allowed = await rateLimiter.checkSubscriptionLimit(mockSocket);

        expect(allowed).toBe(true);
      });

      test('should reject subscriptions at limit', async () => {
        rateLimiter.inMemoryStore.set('ratelimit:subscription:user-456', {
          count: 50
        });

        const allowed = await rateLimiter.checkSubscriptionLimit(mockSocket);

        expect(allowed).toBe(false);
      });

      test('should allow first subscription', async () => {
        const allowed = await rateLimiter.checkSubscriptionLimit(mockSocket);

        expect(allowed).toBe(true);
      });
    });

    describe('incrementSubscription() - In-Memory', () => {
      test('should create entry if not exists', async () => {
        await rateLimiter.incrementSubscription(mockSocket);

        const entry = rateLimiter.inMemoryStore.get('ratelimit:subscription:user-456');
        expect(entry.count).toBe(1);
      });

      test('should increment existing entry', async () => {
        rateLimiter.inMemoryStore.set('ratelimit:subscription:user-456', { count: 5 });

        await rateLimiter.incrementSubscription(mockSocket);

        const entry = rateLimiter.inMemoryStore.get('ratelimit:subscription:user-456');
        expect(entry.count).toBe(6);
      });
    });

    describe('decrementSubscription() - In-Memory', () => {
      test('should decrement subscription count', async () => {
        rateLimiter.inMemoryStore.set('ratelimit:subscription:user-456', { count: 5 });

        await rateLimiter.decrementSubscription(mockSocket);

        const entry = rateLimiter.inMemoryStore.get('ratelimit:subscription:user-456');
        expect(entry.count).toBe(4);
      });

      test('should not decrement below zero', async () => {
        rateLimiter.inMemoryStore.set('ratelimit:subscription:user-456', { count: 0 });

        await rateLimiter.decrementSubscription(mockSocket);

        const entry = rateLimiter.inMemoryStore.get('ratelimit:subscription:user-456');
        expect(entry.count).toBe(0);
      });
    });

    describe('resetSubscriptions() - In-Memory', () => {
      test('should delete subscription entry', async () => {
        rateLimiter.inMemoryStore.set('ratelimit:subscription:user-456', { count: 10 });

        await rateLimiter.resetSubscriptions('user-456');

        expect(rateLimiter.inMemoryStore.has('ratelimit:subscription:user-456')).toBe(false);
      });
    });
  });

  describe('createRateLimitMiddleware()', () => {
    test('should create RateLimiter instance with Redis', () => {
      const limiter = createRateLimitMiddleware(mockRedisClient);

      expect(limiter).toBeInstanceOf(RateLimiter);
      expect(limiter.redisClient).toBe(mockRedisClient);
    });

    test('should create RateLimiter instance without Redis', () => {
      const limiter = createRateLimitMiddleware(null);

      expect(limiter).toBeInstanceOf(RateLimiter);
      expect(limiter.redisClient).toBeNull();
    });

    test('should create RateLimiter instance with no arguments', () => {
      const limiter = createRateLimitMiddleware();

      expect(limiter).toBeInstanceOf(RateLimiter);
      expect(limiter.redisClient).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      rateLimiter = new RateLimiter(mockRedisClient);
    });

    test('should handle socket without handshake.auth gracefully', async () => {
      mockSocket.handshake.auth = undefined;

      const allowed = await rateLimiter.checkEventLimit(mockSocket, 'test:event');

      expect(allowed).toBe(true);
    });

    test('should handle socket without userId gracefully', async () => {
      mockSocket.handshake.auth = { authenticated: true };

      const allowed = await rateLimiter.checkEventLimit(mockSocket, 'test:event');

      expect(allowed).toBe(true);
    });

    test('should handle missing IP address', async () => {
      mockSocket.handshake.address = undefined;
      mockSocket.request.connection.remoteAddress = undefined;

      const middleware = rateLimiter.connectionLimit();
      await middleware(mockSocket, mockNext);

      // Should still attempt to rate limit (will use undefined as key)
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Performance', () => {
    test('should handle high-frequency rate limit checks efficiently', async () => {
      rateLimiter = new RateLimiter(null); // In-memory for deterministic performance

      const iterations = 1000;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        await rateLimiter.checkEventLimit(mockSocket, 'test:event');
      }

      const endTime = Date.now();
      const averageTime = (endTime - startTime) / iterations;

      // Should check in less than 1ms on average
      expect(averageTime).toBeLessThan(1);
    });
  });
});
