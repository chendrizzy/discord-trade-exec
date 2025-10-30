/**
 * SubscriptionCacheService - Redis Caching Layer
 *
 * Feature: 004-subscription-gating
 * Phase: 2 (Foundational)
 * Task: T017 - Implement SubscriptionCacheService with Redis TTL
 *
 * Purpose: Redis caching layer for subscription verification results
 *
 * This service provides:
 * - 60-second TTL caching for verification results
 * - Batch operations for efficiency
 * - Cache invalidation
 * - Automatic serialization/deserialization
 *
 * Performance: Fast in-memory Redis operations
 *
 * @see specs/004-subscription-gating/contracts/subscription-verification-api.md
 */

const logger = require('@utils/logger');
const { validateSnowflake } = require('@utils/validators');

// Cache TTL in seconds
const CACHE_TTL_SECONDS = 60;

class SubscriptionCacheService {
  /**
   * Create a SubscriptionCacheService
   *
   * @param {import('redis').RedisClientType} redisClient - Redis client instance
   * @throws {Error} If Redis client is not provided
   */
  constructor(redisClient) {
    if (!redisClient) {
      throw new Error('Redis client is required');
    }

    this.redisClient = redisClient;
    logger.info('SubscriptionCacheService initialized', {
      ttlSeconds: CACHE_TTL_SECONDS
    });
  }

  /**
   * Validate Discord snowflake ID format
   *
   * @param {string} id - ID to validate
   * @param {string} type - Type of ID (for error message)
   * @throws {Error} If ID format is invalid
   * @private
   */
  _validateSnowflake(id, type) {
    try {
      validateSnowflake(id, type);
    } catch (error) {
      // Convert SubscriptionVerificationError to generic Error for cache service
      throw new Error(error.message);
    }
  }

  /**
   * Generate cache key for guild/user combination
   *
   * @param {string} guildId - Discord guild ID
   * @param {string} userId - Discord user ID
   * @returns {string} Cache key
   * @private
   */
  _getCacheKey(guildId, userId) {
    return `sub:${guildId}:${userId}`;
  }

  /**
   * Parse cached data and convert Date strings back to Date objects
   *
   * @param {string} data - JSON string from cache
   * @returns {Object} Parsed object with Date objects
   * @private
   */
  _parseCacheData(data) {
    try {
      const parsed = JSON.parse(data);

      // Convert verifiedAt string back to Date object
      if (parsed.verifiedAt) {
        parsed.verifiedAt = new Date(parsed.verifiedAt);
      }

      return parsed;
    } catch (error) {
      throw new Error(`Cache data parsing error: ${error.message}`);
    }
  }

  /**
   * Serialize data for caching (convert Date objects to ISO strings)
   *
   * @param {Object} data - Data to serialize
   * @returns {string} JSON string
   * @private
   */
  _serializeCacheData(data) {
    return JSON.stringify(data);
  }

  /**
   * Get cached subscription status
   *
   * @param {string} guildId - Discord guild ID (17-19 digits)
   * @param {string} userId - Discord user ID (17-19 digits)
   * @returns {Promise<SubscriptionVerificationResult | null>} Cached result or null if not found
   * @throws {Error} If cache operation fails
   */
  async get(guildId, userId) {
    const startTime = Date.now();

    // Validate inputs
    this._validateSnowflake(guildId, 'guild');
    this._validateSnowflake(userId, 'user');

    try {
      const cacheKey = this._getCacheKey(guildId, userId);
      const cached = await this.redisClient.get(cacheKey);
      const duration = Date.now() - startTime;

      if (!cached) {
        logger.debug('Cache miss', { guildId, userId, duration });
        return null;
      }

      logger.debug('Cache hit', { guildId, userId, duration });
      return this._parseCacheData(cached);
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Cache get error', {
        error: error.message,
        stack: error.stack,
        guildId,
        userId,
        duration
      });
      throw new Error(`Cache error: ${error.message}`);
    }
  }

  /**
   * Cache subscription status for 60 seconds
   *
   * @param {string} guildId - Discord guild ID (17-19 digits)
   * @param {string} userId - Discord user ID (17-19 digits)
   * @param {SubscriptionVerificationResult} result - Verification result to cache
   * @returns {Promise<void>}
   * @throws {Error} If cache operation fails
   */
  async set(guildId, userId, result) {
    const startTime = Date.now();

    // Validate inputs
    this._validateSnowflake(guildId, 'guild');
    this._validateSnowflake(userId, 'user');

    try {
      const cacheKey = this._getCacheKey(guildId, userId);
      const serialized = this._serializeCacheData(result);

      await this.redisClient.setEx(cacheKey, CACHE_TTL_SECONDS, serialized);
      const duration = Date.now() - startTime;

      logger.debug('Cache write success', {
        guildId,
        userId,
        hasAccess: result.hasAccess,
        duration
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Cache set error', {
        error: error.message,
        stack: error.stack,
        guildId,
        userId,
        duration
      });
      throw new Error(`Cache error: ${error.message}`);
    }
  }

  /**
   * Invalidate cache for a specific user
   *
   * @param {string} guildId - Discord guild ID (17-19 digits)
   * @param {string} userId - Discord user ID (17-19 digits)
   * @returns {Promise<void>}
   * @throws {Error} If cache operation fails
   */
  async invalidate(guildId, userId) {
    const startTime = Date.now();

    // Validate inputs
    this._validateSnowflake(guildId, 'guild');
    this._validateSnowflake(userId, 'user');

    try {
      const cacheKey = this._getCacheKey(guildId, userId);
      const result = await this.redisClient.del(cacheKey);
      const duration = Date.now() - startTime;

      logger.debug('Cache invalidation', {
        guildId,
        userId,
        keysDeleted: result,
        duration
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Cache invalidation error', {
        error: error.message,
        stack: error.stack,
        guildId,
        userId,
        duration
      });
      throw new Error(`Cache error: ${error.message}`);
    }
  }

  /**
   * Batch get cached statuses for multiple users
   *
   * @param {string} guildId - Discord guild ID (17-19 digits)
   * @param {string[]} userIds - Array of user IDs (17-19 digits each)
   * @returns {Promise<Map<string, SubscriptionVerificationResult>>} Map of userId to result
   * @throws {Error} If cache operation fails
   */
  async getBatch(guildId, userIds) {
    const startTime = Date.now();

    // Validate guild ID
    this._validateSnowflake(guildId, 'guild');

    // Handle empty array
    if (!userIds || userIds.length === 0) {
      logger.debug('Batch get with empty user list', { guildId });
      return new Map();
    }

    // Validate all user IDs
    for (const userId of userIds) {
      this._validateSnowflake(userId, 'user');
    }

    try {
      // Generate cache keys for all users
      const cacheKeys = userIds.map(userId => this._getCacheKey(guildId, userId));

      // Batch get from Redis
      const results = await this.redisClient.mGet(cacheKeys);

      // Build result map (only include cache hits)
      const resultMap = new Map();

      for (let i = 0; i < userIds.length; i++) {
        const cached = results[i];

        if (cached) {
          const userId = userIds[i];
          resultMap.set(userId, this._parseCacheData(cached));
        }
      }

      const duration = Date.now() - startTime;
      const hitCount = resultMap.size;
      const missCount = userIds.length - hitCount;

      logger.debug('Batch cache operation', {
        guildId,
        totalRequested: userIds.length,
        hits: hitCount,
        misses: missCount,
        hitRate: ((hitCount / userIds.length) * 100).toFixed(1) + '%',
        duration
      });

      return resultMap;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Batch cache error', {
        error: error.message,
        stack: error.stack,
        guildId,
        userCount: userIds.length,
        duration
      });
      throw new Error(`Cache error: ${error.message}`);
    }
  }
}

module.exports = { SubscriptionCacheService };
