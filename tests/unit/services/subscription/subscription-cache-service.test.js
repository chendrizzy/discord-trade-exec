/**
 * Unit tests for SubscriptionCacheService
 *
 * Feature: 004-subscription-gating
 * Phase: 2 (Foundational)
 * Task: T016 - Write failing tests for SubscriptionCacheService
 *
 * TDD Approach: These tests are written FIRST and expected to FAIL until T017 implements the service.
 *
 * Test Coverage:
 * - Constructor with Redis client validation
 * - get() with cache hit/miss scenarios
 * - set() with TTL enforcement (60 seconds)
 * - invalidate() for cache invalidation
 * - getBatch() for batch operations
 * - Cache key generation
 * - Error handling for Redis failures
 *
 * @see specs/004-subscription-gating/contracts/subscription-verification-api.md
 */

const { SubscriptionCacheService } = require('@services/subscription/SubscriptionCacheService');

// Mock Redis client
jest.mock('redis');

describe('SubscriptionCacheService - TDD Tests', () => {
  let service;
  let mockRedisClient;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Mock Redis client
    mockRedisClient = {
      get: jest.fn(),
      setEx: jest.fn(),
      del: jest.fn(),
      mGet: jest.fn(),
      multi: jest.fn(),
      quit: jest.fn(),
      isOpen: true
    };

    // Create service with mock Redis client
    service = new SubscriptionCacheService(mockRedisClient);
  });

  describe('Constructor', () => {
    it('should create service with Redis client', () => {
      expect(service).toBeDefined();
      expect(service.redisClient).toBe(mockRedisClient);
    });

    it('should throw error if Redis client is not provided', () => {
      expect(() => new SubscriptionCacheService()).toThrow('Redis client is required');
    });
  });

  describe('get() - Cache Retrieval', () => {
    it('should return cached result on cache hit', async () => {
      const cachedData = {
        hasAccess: true,
        verifiedAt: '2025-01-01T00:00:00.000Z',
        userRoleIds: ['11111111111111111'],
        matchingRoles: ['11111111111111111'],
        cacheHit: false,
        apiLatency: 50
      };

      mockRedisClient.get.mockResolvedValue(JSON.stringify(cachedData));

      const result = await service.get('1234567890123456789', '9876543210987654321');

      expect(result).toBeDefined();
      expect(result.hasAccess).toBe(true);
      expect(result.userRoleIds).toEqual(['11111111111111111']);
      expect(mockRedisClient.get).toHaveBeenCalledWith('sub:1234567890123456789:9876543210987654321');
    });

    it('should return null on cache miss', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await service.get('1234567890123456789', '9876543210987654321');

      expect(result).toBeNull();
      expect(mockRedisClient.get).toHaveBeenCalledWith('sub:1234567890123456789:9876543210987654321');
    });

    it('should validate guild ID format', async () => {
      await expect(
        service.get('invalid', '9876543210987654321')
      ).rejects.toThrow(/invalid.*guild.*id/i);
    });

    it('should validate user ID format', async () => {
      await expect(
        service.get('1234567890123456789', 'invalid')
      ).rejects.toThrow(/invalid.*user.*id/i);
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('Redis connection failed'));

      await expect(
        service.get('1234567890123456789', '9876543210987654321')
      ).rejects.toThrow(/cache.*error/i);
    });

    it('should parse verifiedAt as Date object', async () => {
      const cachedData = {
        hasAccess: true,
        verifiedAt: '2025-01-01T00:00:00.000Z',
        userRoleIds: [],
        matchingRoles: [],
        cacheHit: false
      };

      mockRedisClient.get.mockResolvedValue(JSON.stringify(cachedData));

      const result = await service.get('1234567890123456789', '9876543210987654321');

      expect(result.verifiedAt).toBeInstanceOf(Date);
      expect(result.verifiedAt.toISOString()).toBe('2025-01-01T00:00:00.000Z');
    });

    it('should handle malformed JSON in cache', async () => {
      mockRedisClient.get.mockResolvedValue('not valid json');

      await expect(
        service.get('1234567890123456789', '9876543210987654321')
      ).rejects.toThrow(/cache.*error/i);
    });
  });

  describe('set() - Cache Storage', () => {
    it('should cache verification result with 60-second TTL', async () => {
      const result = {
        hasAccess: true,
        verifiedAt: new Date('2025-01-01T00:00:00.000Z'),
        userRoleIds: ['11111111111111111'],
        matchingRoles: ['11111111111111111'],
        cacheHit: false,
        apiLatency: 50
      };

      mockRedisClient.setEx.mockResolvedValue('OK');

      await service.set('1234567890123456789', '9876543210987654321', result);

      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        'sub:1234567890123456789:9876543210987654321',
        60,
        expect.any(String)
      );

      // Verify JSON serialization
      const serializedData = mockRedisClient.setEx.mock.calls[0][2];
      const parsedData = JSON.parse(serializedData);
      expect(parsedData.hasAccess).toBe(true);
      expect(parsedData.verifiedAt).toBe('2025-01-01T00:00:00.000Z');
    });

    it('should validate guild ID format', async () => {
      const result = {
        hasAccess: true,
        verifiedAt: new Date(),
        userRoleIds: [],
        matchingRoles: [],
        cacheHit: false
      };

      await expect(
        service.set('invalid', '9876543210987654321', result)
      ).rejects.toThrow(/invalid.*guild.*id/i);
    });

    it('should validate user ID format', async () => {
      const result = {
        hasAccess: true,
        verifiedAt: new Date(),
        userRoleIds: [],
        matchingRoles: [],
        cacheHit: false
      };

      await expect(
        service.set('1234567890123456789', 'invalid', result)
      ).rejects.toThrow(/invalid.*user.*id/i);
    });

    it('should handle Redis errors during set', async () => {
      const result = {
        hasAccess: true,
        verifiedAt: new Date(),
        userRoleIds: [],
        matchingRoles: [],
        cacheHit: false
      };

      mockRedisClient.setEx.mockRejectedValue(new Error('Redis write failed'));

      await expect(
        service.set('1234567890123456789', '9876543210987654321', result)
      ).rejects.toThrow(/cache.*error/i);
    });

    it('should serialize Date objects correctly', async () => {
      const result = {
        hasAccess: false,
        verifiedAt: new Date('2025-12-31T23:59:59.999Z'),
        userRoleIds: [],
        matchingRoles: [],
        reason: 'no_subscription',
        cacheHit: false
      };

      mockRedisClient.setEx.mockResolvedValue('OK');

      await service.set('1234567890123456789', '9876543210987654321', result);

      const serializedData = mockRedisClient.setEx.mock.calls[0][2];
      const parsedData = JSON.parse(serializedData);
      expect(parsedData.verifiedAt).toBe('2025-12-31T23:59:59.999Z');
    });
  });

  describe('invalidate() - Cache Invalidation', () => {
    it('should invalidate cache for specific user', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      await service.invalidate('1234567890123456789', '9876543210987654321');

      expect(mockRedisClient.del).toHaveBeenCalledWith('sub:1234567890123456789:9876543210987654321');
    });

    it('should validate guild ID format', async () => {
      await expect(
        service.invalidate('invalid', '9876543210987654321')
      ).rejects.toThrow(/invalid.*guild.*id/i);
    });

    it('should validate user ID format', async () => {
      await expect(
        service.invalidate('1234567890123456789', 'invalid')
      ).rejects.toThrow(/invalid.*user.*id/i);
    });

    it('should handle Redis errors during invalidation', async () => {
      mockRedisClient.del.mockRejectedValue(new Error('Redis delete failed'));

      await expect(
        service.invalidate('1234567890123456789', '9876543210987654321')
      ).rejects.toThrow(/cache.*error/i);
    });

    it('should succeed even if key does not exist', async () => {
      mockRedisClient.del.mockResolvedValue(0); // 0 = key did not exist

      await expect(
        service.invalidate('1234567890123456789', '9876543210987654321')
      ).resolves.not.toThrow();
    });
  });

  describe('getBatch() - Batch Operations', () => {
    it('should retrieve multiple cached results', async () => {
      const cachedData1 = {
        hasAccess: true,
        verifiedAt: '2025-01-01T00:00:00.000Z',
        userRoleIds: ['11111111111111111'],
        matchingRoles: ['11111111111111111'],
        cacheHit: false
      };

      const cachedData2 = {
        hasAccess: false,
        verifiedAt: '2025-01-01T00:00:01.000Z',
        userRoleIds: [],
        matchingRoles: [],
        reason: 'no_subscription',
        cacheHit: false
      };

      mockRedisClient.mGet.mockResolvedValue([
        JSON.stringify(cachedData1),
        JSON.stringify(cachedData2),
        null  // Cache miss for third user
      ]);

      const result = await service.getBatch('1234567890123456789', [
        '9876543210987654321',
        '8876543210987654321',
        '7876543210987654321'
      ]);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(2);
      expect(result.get('9876543210987654321').hasAccess).toBe(true);
      expect(result.get('8876543210987654321').hasAccess).toBe(false);
      expect(result.has('7876543210987654321')).toBe(false);

      expect(mockRedisClient.mGet).toHaveBeenCalledWith([
        'sub:1234567890123456789:9876543210987654321',
        'sub:1234567890123456789:8876543210987654321',
        'sub:1234567890123456789:7876543210987654321'
      ]);
    });

    it('should return empty Map when all keys miss', async () => {
      mockRedisClient.mGet.mockResolvedValue([null, null, null]);

      const result = await service.getBatch('1234567890123456789', [
        '9876543210987654321',
        '8876543210987654321',
        '7876543210987654321'
      ]);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });

    it('should validate guild ID format', async () => {
      await expect(
        service.getBatch('invalid', ['9876543210987654321'])
      ).rejects.toThrow(/invalid.*guild.*id/i);
    });

    it('should validate user ID format in array', async () => {
      await expect(
        service.getBatch('1234567890123456789', ['9876543210987654321', 'invalid', '7876543210987654321'])
      ).rejects.toThrow(/invalid.*user.*id/i);
    });

    it('should handle empty user ID array', async () => {
      const result = await service.getBatch('1234567890123456789', []);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
      expect(mockRedisClient.mGet).not.toHaveBeenCalled();
    });

    it('should handle Redis errors during batch get', async () => {
      mockRedisClient.mGet.mockRejectedValue(new Error('Redis batch read failed'));

      await expect(
        service.getBatch('1234567890123456789', ['9876543210987654321'])
      ).rejects.toThrow(/cache.*error/i);
    });

    it('should parse Date objects in batch results', async () => {
      const cachedData = {
        hasAccess: true,
        verifiedAt: '2025-01-01T00:00:00.000Z',
        userRoleIds: [],
        matchingRoles: [],
        cacheHit: false
      };

      mockRedisClient.mGet.mockResolvedValue([JSON.stringify(cachedData)]);

      const result = await service.getBatch('1234567890123456789', ['9876543210987654321']);

      const entry = result.get('9876543210987654321');
      expect(entry.verifiedAt).toBeInstanceOf(Date);
    });

    it('should handle malformed JSON in batch results', async () => {
      mockRedisClient.mGet.mockResolvedValue([
        JSON.stringify({ hasAccess: true }),
        'not valid json',
        JSON.stringify({ hasAccess: false })
      ]);

      await expect(
        service.getBatch('1234567890123456789', [
          '9876543210987654321',
          '8876543210987654321',
          '7876543210987654321'
        ])
      ).rejects.toThrow(/cache.*error/i);
    });
  });

  describe('Cache Key Generation', () => {
    it('should use consistent cache key format', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      await service.get('1234567890123456789', '9876543210987654321');

      expect(mockRedisClient.get).toHaveBeenCalledWith('sub:1234567890123456789:9876543210987654321');
    });

    it('should generate different keys for different users', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      await service.get('1234567890123456789', '9876543210987654321');
      await service.get('1234567890123456789', '8876543210987654321');

      expect(mockRedisClient.get).toHaveBeenNthCalledWith(1, 'sub:1234567890123456789:9876543210987654321');
      expect(mockRedisClient.get).toHaveBeenNthCalledWith(2, 'sub:1234567890123456789:8876543210987654321');
    });

    it('should generate different keys for different guilds', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      await service.get('1234567890123456789', '9876543210987654321');
      await service.get('2234567890123456789', '9876543210987654321');

      expect(mockRedisClient.get).toHaveBeenNthCalledWith(1, 'sub:1234567890123456789:9876543210987654321');
      expect(mockRedisClient.get).toHaveBeenNthCalledWith(2, 'sub:2234567890123456789:9876543210987654321');
    });
  });

  describe('setBatch() - Batch Write Operations (T082)', () => {
    it('should batch write multiple users with pipeline', async () => {
      const userResults = new Map([
        ['9876543210987654321', {
          hasAccess: true,
          verifiedAt: new Date(),
          userRoleIds: [],
          matchingRoles: [],
          cacheHit: false
        }],
        ['8876543210987654321', {
          hasAccess: false,
          verifiedAt: new Date(),
          userRoleIds: [],
          matchingRoles: [],
          cacheHit: false
        }]
      ]);

      const pipelineMock = {
        setEx: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };
      mockRedisClient.multi.mockReturnValue(pipelineMock);

      const count = await service.setBatch('1234567890123456789', userResults);

      expect(count).toBe(2);
      expect(mockRedisClient.multi).toHaveBeenCalled();
      expect(pipelineMock.setEx).toHaveBeenCalledTimes(2);
      expect(pipelineMock.exec).toHaveBeenCalled();
    });

    it('should return 0 for empty results map', async () => {
      const userResults = new Map();

      const count = await service.setBatch('1234567890123456789', userResults);

      expect(count).toBe(0);
      expect(mockRedisClient.multi).not.toHaveBeenCalled();
    });

    it('should validate guild ID format', async () => {
      const userResults = new Map([
        ['9876543210987654321', { hasAccess: true }]
      ]);

      await expect(service.setBatch('invalid', userResults))
        .rejects.toThrow('Invalid guild ID format');
    });

    it('should validate all user IDs in map', async () => {
      const userResults = new Map([
        ['invalid', { hasAccess: true }]
      ]);

      await expect(service.setBatch('1234567890123456789', userResults))
        .rejects.toThrow('Invalid user ID format');
    });

    it('should handle pipeline errors gracefully', async () => {
      const userResults = new Map([
        ['9876543210987654321', { hasAccess: true }]
      ]);

      const pipelineMock = {
        setEx: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(new Error('Pipeline failed'))
      };
      mockRedisClient.multi.mockReturnValue(pipelineMock);

      await expect(service.setBatch('1234567890123456789', userResults))
        .rejects.toThrow('Cache error: Pipeline failed');
    });
  });

  describe('getMetrics() - Performance Monitoring (T082)', () => {
    it('should return metrics when Redis is connected', async () => {
      mockRedisClient.isOpen = true;

      const metrics = await service.getMetrics();

      expect(metrics).toEqual({
        isConnected: true,
        ttl_seconds: 60,
        keys_pattern: 'sub:*:*'
      });
    });

    it('should handle disconnected Redis client', async () => {
      mockRedisClient.isOpen = false;

      const metrics = await service.getMetrics();

      expect(metrics.isConnected).toBe(false);
    });

    it('should handle metrics collection errors', async () => {
      Object.defineProperty(mockRedisClient, 'isOpen', {
        get: jest.fn(() => {
          throw new Error('Connection check failed');
        })
      });

      await expect(service.getMetrics())
        .rejects.toThrow('Metrics error');
    });
  });

  describe('Performance', () => {
    it('should complete get() operation quickly', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const start = Date.now();
      await service.get('1234567890123456789', '9876543210987654321');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });

    it('should complete set() operation quickly', async () => {
      const result = {
        hasAccess: true,
        verifiedAt: new Date(),
        userRoleIds: [],
        matchingRoles: [],
        cacheHit: false
      };

      mockRedisClient.setEx.mockResolvedValue('OK');

      const start = Date.now();
      await service.set('1234567890123456789', '9876543210987654321', result);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });

    it('should complete setBatch() operation efficiently', async () => {
      const userResults = new Map();
      for (let i = 0; i < 10; i++) {
        userResults.set(`987654321098765432${i}`, {
          hasAccess: true,
          verifiedAt: new Date(),
          userRoleIds: [],
          matchingRoles: [],
          cacheHit: false
        });
      }

      const pipelineMock = {
        setEx: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      };
      mockRedisClient.multi.mockReturnValue(pipelineMock);

      const start = Date.now();
      await service.setBatch('1234567890123456789', userResults);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });
  });
});
