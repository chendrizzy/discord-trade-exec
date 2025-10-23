/**
 * Analytics Redis Cache Wrapper
 *
 * Provides caching layer for expensive analytics queries.
 * Supports TTL configuration, cache warming, and invalidation.
 */

const redis = require('redis');
const { promisify } = require('util');
const logger = require('../utils/logger');

class AnalyticsCache {
  constructor(options = {}) {
    this.enabled = process.env.REDIS_URL || process.env.REDIS_ENABLED === 'true';
    this.defaultTTL = options.defaultTTL || 300; // 5 minutes default

    // Cache key prefixes (must be initialized even when Redis is disabled)
    this.prefixes = {
      MRR: 'analytics:mrr',
      ARR: 'analytics:arr',
      LTV: 'analytics:ltv',
      CHURN: 'analytics:churn',
      COHORT: 'analytics:cohort',
      DASHBOARD: 'analytics:dashboard',
      CHURN_RISKS: 'analytics:churn_risks'
    };

    // TTL configurations (in seconds)
    this.ttls = {
      MRR: 600, // 10 minutes
      ARR: 600, // 10 minutes
      LTV: 1800, // 30 minutes
      CHURN: 1800, // 30 minutes (historical data)
      COHORT: 3600, // 1 hour (very expensive query)
      DASHBOARD: 300, // 5 minutes (frequently accessed)
      CHURN_RISKS: 600 // 10 minutes
    };

    if (!this.enabled) {
      logger.warn('Redis caching disabled - no REDIS_URL configured');
      return;
    }

    try {
      this.client = redis.createClient({
        url: process.env.REDIS_URL,
        socket: {
          reconnectStrategy: retries => {
            if (retries > 10) {
              return new Error('Redis max retries exceeded');
            }
            return Math.min(retries * 100, 3000);
          }
        }
      });

      this.client.on('error', err => {
        console.error('Redis client error:', err);
        this.enabled = false; // Disable on persistent errors
      });

      this.client.on('connect', () => {
        logger.info('Redis cache connected');
      });

      // Connect to Redis
      this.client.connect().catch(err => {
        console.error('Failed to connect to Redis:', err);
        this.enabled = false;
      });
    } catch (error) {
      logger.error('Failed to initialize Redis client:', { error: error.message, stack: error.stack });
      this.enabled = false;
    }
  }

  /**
   * Generate cache key
   * @private
   */
  generateKey(prefix, params = {}) {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}:${params[key]}`)
      .join('|');

    return sortedParams ? `${prefix}:${sortedParams}` : prefix;
  }

  /**
   * Get cached data
   * @param {string} prefix - Cache key prefix
   * @param {Object} params - Query parameters for cache key
   * @returns {Promise<Object|null>} Cached data or null
   */
  async get(prefix, params = {}) {
    if (!this.enabled || !this.client?.isOpen) {
      return null;
    }

    try {
      const key = this.generateKey(prefix, params);
      const data = await this.client.get(key);

      if (data) {
        return JSON.parse(data);
      }

      return null;
    } catch (error) {
      logger.error('Cache get error:', { error: error.message, stack: error.stack });
      return null; // Fail gracefully
    }
  }

  /**
   * Set cached data
   * @param {string} prefix - Cache key prefix
   * @param {Object} data - Data to cache
   * @param {Object} params - Query parameters for cache key
   * @param {number} ttl - Time to live in seconds (optional)
   * @returns {Promise<boolean>} Success status
   */
  async set(prefix, data, params = {}, ttl = null) {
    if (!this.enabled || !this.client?.isOpen) {
      return false;
    }

    try {
      const key = this.generateKey(prefix, params);
      const cacheData = JSON.stringify(data);
      const cacheTTL = ttl || this.ttls[prefix.split(':')[1]] || this.defaultTTL;

      await this.client.setEx(key, cacheTTL, cacheData);
      return true;
    } catch (error) {
      logger.error('Cache set error:', { error: error.message, stack: error.stack });
      return false;
    }
  }

  /**
   * Invalidate cache by prefix
   * @param {string} prefix - Cache key prefix
   * @returns {Promise<number>} Number of keys deleted
   */
  async invalidate(prefix) {
    if (!this.enabled || !this.client?.isOpen) {
      return 0;
    }

    try {
      const pattern = `${prefix}*`;
      const keys = await this.client.keys(pattern);

      if (keys.length === 0) {
        return 0;
      }

      await this.client.del(keys);
      return keys.length;
    } catch (error) {
      logger.error('Cache invalidate error:', { error: error.message, stack: error.stack });
      return 0;
    }
  }

  /**
   * Invalidate all analytics caches
   * @returns {Promise<number>} Number of keys deleted
   */
  async invalidateAll() {
    if (!this.enabled || !this.client?.isOpen) {
      return 0;
    }

    try {
      const pattern = 'analytics:*';
      const keys = await this.client.keys(pattern);

      if (keys.length === 0) {
        return 0;
      }

      await this.client.del(keys);
      return keys.length;
    } catch (error) {
      logger.error('Cache invalidate all error:', { error: error.message, stack: error.stack });
      return 0;
    }
  }

  /**
   * Wrap a function with caching
   * @param {string} prefix - Cache key prefix
   * @param {Function} fn - Async function to wrap
   * @param {Object} params - Query parameters
   * @param {number} ttl - Time to live (optional)
   * @returns {Promise<Object>} Function result (from cache or fresh)
   */
  async wrap(prefix, fn, params = {}, ttl = null) {
    // Try to get from cache
    const cached = await this.get(prefix, params);
    if (cached) {
      return { data: cached, fromCache: true };
    }

    // Execute function if cache miss
    const result = await fn();

    // Cache the result
    await this.set(prefix, result, params, ttl);

    return { data: result, fromCache: false };
  }

  /**
   * Get cache statistics
   * @returns {Promise<Object>} Cache stats
   */
  async getStats() {
    if (!this.enabled || !this.client?.isOpen) {
      return {
        enabled: false,
        connected: false
      };
    }

    try {
      const info = await this.client.info('stats');
      const keyspace = await this.client.info('keyspace');

      // Parse Redis INFO output
      const stats = {
        enabled: true,
        connected: true,
        totalKeys: 0,
        analyticsKeys: 0
      };

      // Count analytics keys
      const analyticsKeys = await this.client.keys('analytics:*');
      stats.analyticsKeys = analyticsKeys.length;

      return stats;
    } catch (error) {
      logger.error('Failed to get cache stats:', { error: error.message, stack: error.stack });
      return {
        enabled: this.enabled,
        connected: false,
        error: error.message
      };
    }
  }

  /**
   * Warm cache with common queries
   * @param {Object} services - Analytics services (RevenueMetrics, ChurnPredictor, etc.)
   * @returns {Promise<Object>} Warming results
   */
  async warmCache(services) {
    if (!this.enabled || !this.client?.isOpen) {
      return { warmed: 0, message: 'Cache not enabled' };
    }

    const results = {
      warmed: 0,
      failed: 0,
      errors: []
    };

    try {
      // Warm MRR cache
      try {
        const mrr = await services.revenueMetrics.calculateMRR();
        await this.set(this.prefixes.MRR, mrr, {});
        results.warmed++;
      } catch (error) {
        results.failed++;
        results.errors.push({ metric: 'MRR', error: error.message });
      }

      // Warm LTV cache
      try {
        const ltv = await services.revenueMetrics.calculateLTV();
        await this.set(this.prefixes.LTV, ltv, {});
        results.warmed++;
      } catch (error) {
        results.failed++;
        results.errors.push({ metric: 'LTV', error: error.message });
      }

      // Warm dashboard cache (most frequently accessed)
      try {
        const dashboard = await services.getDashboardMetrics();
        await this.set(this.prefixes.DASHBOARD, dashboard, {});
        results.warmed++;
      } catch (error) {
        results.failed++;
        results.errors.push({ metric: 'DASHBOARD', error: error.message });
      }

      return results;
    } catch (error) {
      logger.error('Cache warming error:', { error: error.message, stack: error.stack });
      return {
        warmed: results.warmed,
        failed: results.failed + 1,
        errors: [...results.errors, { metric: 'OVERALL', error: error.message }]
      };
    }
  }

  /**
   * Close Redis connection
   */
  async close() {
    if (this.client?.isOpen) {
      await this.client.quit();
    }
  }
}

// Singleton instance
let instance = null;

/**
 * Get singleton cache instance
 * @returns {AnalyticsCache} Cache instance
 */
function getCacheInstance(options = {}) {
  if (!instance) {
    instance = new AnalyticsCache(options);
  }
  return instance;
}

module.exports = {
  AnalyticsCache,
  getCacheInstance
};
