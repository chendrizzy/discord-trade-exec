/**
 * Cache Service
 *
 * Provides caching layer for API responses to reduce external API calls
 * and improve response times. Supports both Redis (production) and
 * in-memory caching (development/fallback).
 *
 * Cache Strategy:
 * - Price Data: 10-30 second TTL (high volatility)
 * - Fee Structures: 5-10 minute TTL (rarely change)
 * - User Credentials: NEVER cached (security)
 *
 * Features:
 * - Automatic TTL expiration
 * - Redis support for distributed caching
 * - In-memory fallback
 * - Cache statistics tracking
 * - Graceful degradation
 */

const Redis = require('ioredis');
const NodeCache = require('node-cache');
const logger = require('../utils/logger');
const logger = require('../utils/logger');

class CacheService {
  constructor() {
    this.cacheType = 'none'; // 'redis', 'memory', or 'none'
    this.redisClient = null;
    this.memoryCache = null;

    // Cache statistics
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0
    };

    // Default TTL values (in seconds)
    this.DEFAULT_TTL = {
      PRICE: 10, // 10 seconds for price data (high volatility)
      FEES: 300, // 5 minutes for fee structures (rarely change)
      MARKET_STATUS: 60, // 1 minute for market status
      EXCHANGE_INFO: 600 // 10 minutes for exchange info
    };

    this.initialize();
  }

  /**
   * Initialize cache (Redis preferred, fallback to in-memory)
   */
  initialize() {
    // Try Redis first (for production/multi-instance setups)
    if (process.env.REDIS_URL) {
      try {
        this.redisClient = new Redis(process.env.REDIS_URL, {
          retryStrategy: times => {
            const delay = Math.min(times * 50, 2000);
            return delay;
          },
          maxRetriesPerRequest: 3,
          enableOfflineQueue: false
        });

        this.redisClient.on('connect', () => {
          this.cacheType = 'redis';
          logger.info('✅ CacheService: Redis cache initialized');
        });

        this.redisClient.on('error', err => {
          console.error('❌ CacheService: Redis error:', err.message);
          this.fallbackToMemory();
        });

        this.redisClient.on('close', () => {
          logger.warn('⚠️  CacheService: Redis connection closed');
          this.fallbackToMemory();
        });

        // Test Redis connection
        this.redisClient
          .ping()
          .then(() => {
            this.cacheType = 'redis';
          })
          .catch(() => {
            this.fallbackToMemory();
          });
      } catch (error) {
        console.error('❌ CacheService: Failed to initialize Redis:', error.message);
        this.fallbackToMemory();
      }
    } else {
      // No Redis URL, use in-memory cache
      this.fallbackToMemory();
    }
  }

  /**
   * Fallback to in-memory cache when Redis is unavailable
   */
  fallbackToMemory() {
    if (this.cacheType === 'memory') return; // Already using memory cache

    this.cacheType = 'memory';
    this.memoryCache = new NodeCache({
      stdTTL: this.DEFAULT_TTL.PRICE,
      checkperiod: 30, // Check for expired keys every 30 seconds
      useClones: false, // Don't clone objects (better performance)
      deleteOnExpire: true
    });

    logger.info('⚠️  CacheService: Using in-memory cache (Redis unavailable)');
  }

  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {Promise<any>} - Cached value or null if not found
   */
  async get(key) {
    try {
      let value = null;

      if (this.cacheType === 'redis') {
        const data = await this.redisClient.get(key);
        value = data ? JSON.parse(data) : null;
      } else if (this.cacheType === 'memory') {
        value = this.memoryCache.get(key);
      }

      if (value !== null && value !== undefined) {
        this.stats.hits++;
        return value;
      }

      this.stats.misses++;
      return null;
    } catch (error) {
      console.error('CacheService: Error getting key:', key, error.message);
      this.stats.errors++;
      return null;
    }
  }

  /**
   * Set value in cache with optional TTL
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in seconds (optional)
   * @returns {Promise<boolean>} - Success status
   */
  async set(key, value, ttl = this.DEFAULT_TTL.PRICE) {
    try {
      if (this.cacheType === 'redis') {
        await this.redisClient.setex(key, ttl, JSON.stringify(value));
      } else if (this.cacheType === 'memory') {
        this.memoryCache.set(key, value, ttl);
      }

      this.stats.sets++;
      return true;
    } catch (error) {
      console.error('CacheService: Error setting key:', key, error.message);
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Delete value from cache
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} - Success status
   */
  async del(key) {
    try {
      if (this.cacheType === 'redis') {
        await this.redisClient.del(key);
      } else if (this.cacheType === 'memory') {
        this.memoryCache.del(key);
      }

      this.stats.deletes++;
      return true;
    } catch (error) {
      console.error('CacheService: Error deleting key:', key, error.message);
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Delete all keys matching a pattern (Redis only)
   * @param {string} pattern - Key pattern (e.g., "exchange:*")
   * @returns {Promise<number>} - Number of keys deleted
   */
  async delPattern(pattern) {
    try {
      if (this.cacheType === 'redis') {
        const keys = await this.redisClient.keys(pattern);
        if (keys.length > 0) {
          await this.redisClient.del(...keys);
          this.stats.deletes += keys.length;
          return keys.length;
        }
        return 0;
      } else if (this.cacheType === 'memory') {
        // In-memory cache doesn't support pattern matching efficiently
        // Just flush all keys (use sparingly)
        const keys = this.memoryCache.keys();
        const matchingKeys = keys.filter(key => {
          const regex = new RegExp(pattern.replace('*', '.*'));
          return regex.test(key);
        });
        this.memoryCache.del(matchingKeys);
        this.stats.deletes += matchingKeys.length;
        return matchingKeys.length;
      }

      return 0;
    } catch (error) {
      console.error('CacheService: Error deleting pattern:', pattern, error.message);
      this.stats.errors++;
      return 0;
    }
  }

  /**
   * Clear all cache
   * @returns {Promise<boolean>} - Success status
   */
  async clear() {
    try {
      if (this.cacheType === 'redis') {
        await this.redisClient.flushdb();
      } else if (this.cacheType === 'memory') {
        this.memoryCache.flushAll();
      }

      logger.info('CacheService: Cache cleared');
      return true;
    } catch (error) {
      console.error('CacheService: Error clearing cache:', error.message);
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Check if key exists in cache
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} - True if exists
   */
  async has(key) {
    try {
      if (this.cacheType === 'redis') {
        const exists = await this.redisClient.exists(key);
        return exists === 1;
      } else if (this.cacheType === 'memory') {
        return this.memoryCache.has(key);
      }

      return false;
    } catch (error) {
      console.error('CacheService: Error checking key:', key, error.message);
      return false;
    }
  }

  /**
   * Get time-to-live for a key
   * @param {string} key - Cache key
   * @returns {Promise<number>} - TTL in seconds (-1 if no expiry, -2 if key doesn't exist)
   */
  async ttl(key) {
    try {
      if (this.cacheType === 'redis') {
        return await this.redisClient.ttl(key);
      } else if (this.cacheType === 'memory') {
        const ttl = this.memoryCache.getTtl(key);
        if (ttl === undefined) return -2; // Key doesn't exist
        if (ttl === 0) return -1; // No expiry
        return Math.floor((ttl - Date.now()) / 1000); // Convert to seconds
      }

      return -2;
    } catch (error) {
      console.error('CacheService: Error getting TTL:', key, error.message);
      return -2;
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} - Cache stats
   */
  getStats() {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? ((this.stats.hits / totalRequests) * 100).toFixed(2) : 0;

    return {
      type: this.cacheType,
      hits: this.stats.hits,
      misses: this.stats.misses,
      sets: this.stats.sets,
      deletes: this.stats.deletes,
      errors: this.stats.errors,
      totalRequests,
      hitRate: `${hitRate}%`,
      hitRateNumeric: parseFloat(hitRate)
    };
  }

  /**
   * Reset cache statistics
   */
  resetStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0
    };
  }

  /**
   * Generate cache key for exchange price data
   * @param {string} exchangeName - Exchange name
   * @param {string} symbol - Trading symbol
   * @returns {string} - Cache key
   */
  static getPriceKey(exchangeName, symbol) {
    return `exchange:price:${exchangeName.toLowerCase()}:${symbol.toUpperCase()}`;
  }

  /**
   * Generate cache key for exchange fee data
   * @param {string} exchangeName - Exchange name
   * @param {string} symbol - Trading symbol (optional)
   * @returns {string} - Cache key
   */
  static getFeeKey(exchangeName, symbol = 'default') {
    return `exchange:fees:${exchangeName.toLowerCase()}:${symbol.toUpperCase()}`;
  }

  /**
   * Generate cache key for market status
   * @param {string} exchangeName - Exchange name
   * @returns {string} - Cache key
   */
  static getMarketStatusKey(exchangeName) {
    return `exchange:market:${exchangeName.toLowerCase()}`;
  }

  /**
   * Generate cache key for exchange info
   * @param {string} exchangeName - Exchange name
   * @returns {string} - Cache key
   */
  static getExchangeInfoKey(exchangeName) {
    return `exchange:info:${exchangeName.toLowerCase()}`;
  }

  /**
   * Gracefully close cache connections
   */
  async close() {
    try {
      if (this.redisClient) {
        await this.redisClient.quit();
        logger.info('✅ CacheService: Redis connection closed');
      }

      if (this.memoryCache) {
        this.memoryCache.close();
        logger.info('✅ CacheService: Memory cache closed');
      }
    } catch (error) {
      console.error('CacheService: Error closing cache:', error.message);
    }
  }
}

// Create singleton instance
const cacheService = new CacheService();

// Graceful shutdown
process.on('SIGTERM', async () => {
  await cacheService.close();
});

process.on('SIGINT', async () => {
  await cacheService.close();
});

module.exports = cacheService;
