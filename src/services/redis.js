/**
 * Redis Caching Service
 *
 * Production Redis caching with intelligent graceful fallback to in-memory Map.
 * Automatically falls back when REDIS_URL not configured or Redis unavailable.
 *
 * @see openspec/changes/implement-production-redis-caching/proposal.md
 */

const redis = require('redis');
const logger = require('../utils/logger');
const logger = require('../utils/logger');

// Cache mode tracking
let cacheMode = 'initializing';
let client = null;
const memoryCache = new Map();

/**
 * Initialize Redis client with connection handling
 */
const initializeRedis = async () => {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    logger.warn('[Redis] REDIS_URL not configured - using in-memory fallback');
    cacheMode = 'memory';
    return;
  }

  try {
    client = redis.createClient({
      url: redisUrl,
      socket: {
        connectTimeout: 5000,
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            logger.error('[Redis] Max reconnection attempts reached - falling back to memory cache');
            cacheMode = 'memory';
            return new Error('Max reconnection attempts');
          }
          return Math.min(retries * 100, 3000);
        }
      }
    });

    client.on('error', (err) => {
      console.error('[Redis] Connection error:', err.message);
      if (cacheMode === 'redis') {
        logger.warn('[Redis] Falling back to memory cache due to error');
        cacheMode = 'memory';
      }
    });

    client.on('connect', () => {
      logger.info('[Redis] Connected successfully');
      cacheMode = 'redis';
    });

    client.on('reconnecting', () => {
      logger.info('[Redis] Reconnecting...');
    });

    await client.connect();
    logger.info('[Redis] Initialization complete - using distributed Redis cache');
    cacheMode = 'redis';
  } catch (err) {
    console.error('[Redis] Failed to initialize:', err.message);
    logger.warn('[Redis] Falling back to in-memory cache');
    cacheMode = 'memory';
    client = null;
  }
};

/**
 * Get cached value
 * @param {string} key - Cache key
 * @returns {Promise<any>} Cached value or null
 */
const get = async (key) => {
  if (cacheMode === 'redis' && client) {
    try {
      const value = await client.get(key);
      if (value) {
        console.log(`[Cache:Redis] HIT: ${key}`);
        return JSON.parse(value);
      }
      return null;
    } catch (err) {
      console.error(`[Redis] GET error for key ${key}:`, err.message);
      logger.warn('[Redis] Falling back to memory cache');
      cacheMode = 'memory';
    }
  }

  // Memory cache fallback
  const cached = memoryCache.get(key);
  if (!cached) return null;

  if (cached.expiry && Date.now() > cached.expiry) {
    memoryCache.delete(key);
    return null;
  }

  console.log(`[Cache:Memory] HIT: ${key}`);
  return cached.value;
};

/**
 * Set cached value with TTL
 * @param {string} key - Cache key
 * @param {any} value - Value to cache
 * @param {number} ttlSeconds - Time to live in seconds (default: 300 = 5 minutes)
 * @returns {Promise<void>}
 */
const set = async (key, value, ttlSeconds = 300) => {
  if (cacheMode === 'redis' && client) {
    try {
      await client.setEx(key, ttlSeconds, JSON.stringify(value));
      console.log(`[Cache:Redis] SET: ${key} (TTL: ${ttlSeconds}s)`);
      return;
    } catch (err) {
      console.error(`[Redis] SET error for key ${key}:`, err.message);
      logger.warn('[Redis] Falling back to memory cache');
      cacheMode = 'memory';
    }
  }

  // Memory cache fallback
  const expiry = Date.now() + (ttlSeconds * 1000);
  memoryCache.set(key, { value, expiry });
  console.log(`[Cache:Memory] SET: ${key} (TTL: ${ttlSeconds}s)`);
};

/**
 * Delete cached value
 * @param {string} key - Cache key
 * @returns {Promise<void>}
 */
const del = async (key) => {
  if (cacheMode === 'redis' && client) {
    try {
      await client.del(key);
      console.log(`[Cache:Redis] DEL: ${key}`);
      return;
    } catch (err) {
      console.error(`[Redis] DEL error for key ${key}:`, err.message);
    }
  }

  memoryCache.delete(key);
  console.log(`[Cache:Memory] DEL: ${key}`);
};

/**
 * Delete all cached values matching pattern
 * @param {string} pattern - Key pattern (e.g., 'community:*')
 * @returns {Promise<void>}
 */
const delPattern = async (pattern) => {
  if (cacheMode === 'redis' && client) {
    try {
      const keys = await client.keys(pattern);
      if (keys.length > 0) {
        await client.del(keys);
        console.log(`[Cache:Redis] DEL PATTERN: ${pattern} (${keys.length} keys)`);
        return;
      }
    } catch (err) {
      console.error(`[Redis] DEL PATTERN error for ${pattern}:`, err.message);
    }
  }

  // Memory cache fallback
  const regex = new RegExp('^' + pattern.replace('*', '.*') + '$');
  const keysToDelete = [];

  for (const [key] of memoryCache) {
    if (regex.test(key)) {
      keysToDelete.push(key);
    }
  }

  keysToDelete.forEach(key => memoryCache.delete(key));
  console.log(`[Cache:Memory] DEL PATTERN: ${pattern} (${keysToDelete.length} keys)`);
};

/**
 * Get or compute cached value
 * @param {string} key - Cache key
 * @param {Function} computeFn - Function to compute value if not cached
 * @param {number} ttlSeconds - Time to live in seconds
 * @returns {Promise<any>} Cached or computed value
 */
const getOrCompute = async (key, computeFn, ttlSeconds = 300) => {
  const cached = await get(key);
  if (cached !== null) {
    return cached;
  }

  console.log(`[Cache:${cacheMode}] MISS: ${key} - computing...`);
  const value = await computeFn();
  await set(key, value, ttlSeconds);
  return value;
};

/**
 * Increment counter
 * @param {string} key - Counter key
 * @param {number} amount - Amount to increment (default: 1)
 * @returns {Promise<number>} New counter value
 */
const increment = async (key, amount = 1) => {
  if (cacheMode === 'redis' && client) {
    try {
      const result = await client.incrBy(key, amount);
      return result;
    } catch (err) {
      console.error(`[Redis] INCR error for key ${key}:`, err.message);
    }
  }

  // Memory cache fallback
  const current = await get(key) || 0;
  const newValue = current + amount;
  await set(key, newValue);
  return newValue;
};

/**
 * Check if key exists
 * @param {string} key - Cache key
 * @returns {Promise<boolean>} True if key exists
 */
const exists = async (key) => {
  if (cacheMode === 'redis' && client) {
    try {
      const result = await client.exists(key);
      return result === 1;
    } catch (err) {
      console.error(`[Redis] EXISTS error for key ${key}:`, err.message);
    }
  }

  return memoryCache.has(key);
};

/**
 * Get cache statistics
 * @returns {Promise<Object>} Cache statistics
 */
const getStats = async () => {
  if (cacheMode === 'redis' && client) {
    try {
      const info = await client.info('memory');
      const dbSize = await client.dbSize();

      return {
        mode: 'redis',
        keys: dbSize,
        memoryUsed: info.match(/used_memory_human:(.+)/)?.[1] || 'unknown',
        connected: client.isReady
      };
    } catch (err) {
      console.error('[Redis] STATS error:', err.message);
    }
  }

  // Memory cache statistics
  let totalSize = 0;
  let expiredCount = 0;

  for (const [, cached] of memoryCache) {
    if (cached.expiry && Date.now() > cached.expiry) {
      expiredCount++;
    }
    totalSize += JSON.stringify(cached.value).length;
  }

  return {
    mode: 'memory',
    keys: memoryCache.size,
    expired: expiredCount,
    sizeBytes: totalSize,
    sizeKB: (totalSize / 1024).toFixed(2)
  };
};

/**
 * Clear all cache
 * @returns {Promise<void>}
 */
const clear = async () => {
  if (cacheMode === 'redis' && client) {
    try {
      await client.flushDb();
      logger.info('[Cache:Redis] CLEARED all keys');
      return;
    } catch (err) {
      console.error('[Redis] CLEAR error:', err.message);
    }
  }

  memoryCache.clear();
  logger.info('[Cache:Memory] CLEARED all keys');
};

/**
 * Get current cache mode
 * @returns {string} 'redis', 'memory', or 'initializing'
 */
const getMode = () => cacheMode;

/**
 * Gracefully close Redis connection
 * @returns {Promise<void>}
 */
const close = async () => {
  if (client && client.isReady) {
    await client.quit();
    logger.info('[Redis] Connection closed gracefully');
  }
};

// Initialize on module load
initializeRedis().catch(err => {
  console.error('[Redis] Initialization failed:', err);
  cacheMode = 'memory';
});

module.exports = {
  get,
  set,
  del,
  delPattern,
  getOrCompute,
  increment,
  exists,
  getStats,
  clear,
  getMode,
  close
};
