const redis = require('redis');
const logger = require('../../utils/logger');

/**
 * CacheManager - Shared Redis caching wrapper for Polymarket intelligence
 *
 * Pattern: Matches analytics-cache.js for consistency
 * Fallback: Graceful degradation to in-memory Map when Redis unavailable
 */
class CacheManager {
  constructor() {
    if (CacheManager.instance) return CacheManager.instance;

    this.enabled = !!(process.env.REDIS_URL || process.env.REDIS_ENABLED === 'true');

    // TTL configurations (seconds)
    this.ttls = {
      SENTIMENT: 60,        // 1 minute - high volatility
      MARKET_STATS: 300,    // 5 minutes - moderate volatility
      WHALE_LIST: 600,      // 10 minutes - low volatility
      ALERT_DEDUP: 3600     // 1 hour - varies by alert type
    };

    // In-memory fallback
    this.memoryCache = new Map();
    this.maxMemoryCacheSize = parseInt(process.env.POLYMARKET_CACHE_MAX_MEMORY || '1000', 10);

    if (!this.enabled) {
      logger.warn('[CacheManager] Redis disabled - using in-memory fallback');
      logger.warn('[CacheManager] Set REDIS_URL or REDIS_ENABLED=true to enable Redis');
      CacheManager.instance = this;
      return;
    }

    // Initialize Redis client
    this.client = redis.createClient({
      url: process.env.REDIS_URL,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            logger.error('[CacheManager] Redis reconnection failed after 10 attempts');
            return new Error('Redis reconnection limit exceeded');
          }
          return Math.min(retries * 100, 3000);
        }
      }
    });

    // Redis error handling
    this.client.on('error', (err) => {
      console.error('[CacheManager] Redis error:', err.message);
      this.enabled = false; // Fallback to memory on error
    });

    this.client.on('connect', () => {
      logger.info('[CacheManager] Redis connected');
    });

    this.client.on('ready', () => {
      logger.info('[CacheManager] Redis ready');
    });

    // Connect to Redis
    this.client.connect().catch((err) => {
      console.error('[CacheManager] Redis connection failed:', err.message);
      this.enabled = false;
    });

    CacheManager.instance = this;
  }

  /**
   * Get cached value
   * @param {string} key - Cache key
   * @returns {Promise<any>} Cached value or null
   */
  async get(key) {
    if (!this.enabled || !this.client.isReady) {
      return this.memoryCache.get(key) || null;
    }

    try {
      const value = await this.client.get(key);
      if (!value) return null;

      const parsed = JSON.parse(value);

      // Also cache in memory for double-fallback
      this.memoryCache.set(key, parsed);

      return parsed;
    } catch (err) {
      console.error('[CacheManager] Get error:', err.message);
      // Fallback to memory cache
      return this.memoryCache.get(key) || null;
    }
  }

  /**
   * Set cached value with TTL
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in seconds (defaults to SENTIMENT TTL)
   */
  async set(key, value, ttl = this.ttls.SENTIMENT) {
    // Always set in memory cache
    this._setMemoryCache(key, value, ttl);

    if (!this.enabled || !this.client.isReady) {
      return;
    }

    try {
      await this.client.setEx(key, ttl, JSON.stringify(value));
    } catch (err) {
      console.error('[CacheManager] Set error:', err.message);
      // Already cached in memory, continue gracefully
    }
  }

  /**
   * Set value in memory cache with TTL cleanup
   * @private
   */
  _setMemoryCache(key, value, ttl) {
    // Enforce max cache size (FIFO eviction)
    if (this.memoryCache.size >= this.maxMemoryCacheSize) {
      const firstKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(firstKey);
    }

    this.memoryCache.set(key, value);

    // Auto-cleanup after TTL
    setTimeout(() => {
      this.memoryCache.delete(key);
    }, ttl * 1000);
  }

  /**
   * Delete cached value
   * @param {string} key - Cache key
   */
  async del(key) {
    this.memoryCache.delete(key);

    if (!this.enabled || !this.client.isReady) {
      return;
    }

    try {
      await this.client.del(key);
    } catch (err) {
      console.error('[CacheManager] Delete error:', err.message);
    }
  }

  /**
   * Bulk delete by pattern
   * @param {string} pattern - Redis key pattern (e.g., "sentiment:*")
   */
  async flush(pattern) {
    if (!this.enabled || !this.client.isReady) {
      // Clear matching keys from memory cache
      const regex = new RegExp(pattern.replace('*', '.*'));
      for (const key of this.memoryCache.keys()) {
        if (regex.test(key)) {
          this.memoryCache.delete(key);
        }
      }
      return;
    }

    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
    } catch (err) {
      console.error('[CacheManager] Flush error:', err.message);
    }
  }

  /**
   * Check if key exists
   * @param {string} key - Cache key
   * @returns {Promise<boolean>}
   */
  async exists(key) {
    if (!this.enabled || !this.client.isReady) {
      return this.memoryCache.has(key);
    }

    try {
      const exists = await this.client.exists(key);
      return exists === 1;
    } catch (err) {
      console.error('[CacheManager] Exists error:', err.message);
      return this.memoryCache.has(key);
    }
  }

  /**
   * Get or compute value with cache stampede protection
   * @param {string} key - Cache key
   * @param {Function} computeFn - Async function to compute value if not cached
   * @param {number} ttl - TTL in seconds
   * @returns {Promise<any>}
   */
  async getOrCompute(key, computeFn, ttl = this.ttls.SENTIMENT) {
    // Check cache first
    let value = await this.get(key);
    if (value !== null) return value;

    // Single-flight pattern: Use lock to prevent duplicate computation
    const lockKey = `lock:${key}`;

    if (!this.enabled || !this.client.isReady) {
      // No Redis - compute directly
      value = await computeFn();
      await this.set(key, value, ttl);
      return value;
    }

    try {
      // Try to acquire lock (5 second expiry)
      const acquired = await this.client.set(lockKey, '1', {
        NX: true,
        EX: 5
      });

      if (!acquired) {
        // Another process is computing - wait and retry
        await new Promise(resolve => setTimeout(resolve, 100));
        return this.getOrCompute(key, computeFn, ttl);
      }

      // Compute and cache
      value = await computeFn();
      await this.set(key, value, ttl);
      await this.del(lockKey);

      return value;
    } catch (err) {
      console.error('[CacheManager] getOrCompute error:', err.message);
      // Fallback to direct computation
      value = await computeFn();
      await this.set(key, value, ttl);
      return value;
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getStats() {
    return {
      enabled: this.enabled,
      redisConnected: this.client?.isReady || false,
      memoryCacheSize: this.memoryCache.size,
      maxMemoryCacheSize: this.maxMemoryCacheSize,
      ttlConfig: this.ttls
    };
  }

  /**
   * Close Redis connection (for graceful shutdown)
   */
  async close() {
    if (this.client?.isReady) {
      await this.client.quit();
      logger.info('[CacheManager] Redis connection closed');
    }
  }
}

module.exports = new CacheManager();
