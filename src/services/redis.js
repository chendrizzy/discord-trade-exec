/**
 * Redis Caching Service
 *
 * Handles Redis caching for analytics and performance optimization.
 *
 * TODO: Implement actual Redis integration
 * - Install: npm install redis
 * - Configure: Set REDIS_URL in environment
 * - Initialize: const redis = require('redis');
 *              const client = redis.createClient({ url: process.env.REDIS_URL });
 */

// In-memory cache fallback (replace with actual Redis)
const memoryCache = new Map();

/**
 * Get cached value
 * @param {string} key - Cache key
 * @returns {Promise<any>} Cached value or null
 *
 * TODO: Replace with actual Redis call:
 * const value = await client.get(key);
 * return value ? JSON.parse(value) : null;
 */
const get = async (key) => {
  // Check memory cache first
  const cached = memoryCache.get(key);
  if (!cached) return null;

  // Check if expired
  if (cached.expiry && Date.now() > cached.expiry) {
    memoryCache.delete(key);
    return null;
  }

  console.log(`[Cache] HIT: ${key}`);
  return cached.value;
};

/**
 * Set cached value with TTL
 * @param {string} key - Cache key
 * @param {any} value - Value to cache
 * @param {number} ttlSeconds - Time to live in seconds (default: 300 = 5 minutes)
 * @returns {Promise<void>}
 *
 * TODO: Replace with actual Redis call:
 * await client.setEx(key, ttlSeconds, JSON.stringify(value));
 */
const set = async (key, value, ttlSeconds = 300) => {
  const expiry = Date.now() + (ttlSeconds * 1000);

  memoryCache.set(key, {
    value,
    expiry
  });

  console.log(`[Cache] SET: ${key} (TTL: ${ttlSeconds}s)`);
};

/**
 * Delete cached value
 * @param {string} key - Cache key
 * @returns {Promise<void>}
 *
 * TODO: Replace with actual Redis call:
 * await client.del(key);
 */
const del = async (key) => {
  memoryCache.delete(key);
  console.log(`[Cache] DEL: ${key}`);
};

/**
 * Delete all cached values matching pattern
 * @param {string} pattern - Key pattern (e.g., 'community:*')
 * @returns {Promise<void>}
 *
 * TODO: Replace with actual Redis call:
 * const keys = await client.keys(pattern);
 * if (keys.length > 0) await client.del(keys);
 */
const delPattern = async (pattern) => {
  const regex = new RegExp('^' + pattern.replace('*', '.*') + '$');
  const keysToDelete = [];

  for (const [key] of memoryCache) {
    if (regex.test(key)) {
      keysToDelete.push(key);
    }
  }

  keysToDelete.forEach(key => memoryCache.delete(key));
  console.log(`[Cache] DEL PATTERN: ${pattern} (${keysToDelete.length} keys)`);
};

/**
 * Get or compute cached value
 * @param {string} key - Cache key
 * @param {Function} computeFn - Function to compute value if not cached
 * @param {number} ttlSeconds - Time to live in seconds
 * @returns {Promise<any>} Cached or computed value
 */
const getOrCompute = async (key, computeFn, ttlSeconds = 300) => {
  // Try to get from cache first
  const cached = await get(key);
  if (cached !== null) {
    return cached;
  }

  // Compute value
  console.log(`[Cache] MISS: ${key} - computing...`);
  const value = await computeFn();

  // Store in cache
  await set(key, value, ttlSeconds);

  return value;
};

/**
 * Increment counter
 * @param {string} key - Counter key
 * @param {number} amount - Amount to increment (default: 1)
 * @returns {Promise<number>} New counter value
 *
 * TODO: Replace with actual Redis call:
 * return await client.incrBy(key, amount);
 */
const increment = async (key, amount = 1) => {
  const current = await get(key) || 0;
  const newValue = current + amount;
  await set(key, newValue);
  return newValue;
};

/**
 * Get cache statistics
 * @returns {Object} Cache statistics
 */
const getStats = () => {
  let totalSize = 0;
  let expiredCount = 0;

  for (const [, cached] of memoryCache) {
    if (cached.expiry && Date.now() > cached.expiry) {
      expiredCount++;
    }
    totalSize += JSON.stringify(cached.value).length;
  }

  return {
    keys: memoryCache.size,
    expired: expiredCount,
    sizeBytes: totalSize,
    sizeKB: (totalSize / 1024).toFixed(2)
  };
};

/**
 * Clear all cache
 * @returns {Promise<void>}
 *
 * TODO: Replace with actual Redis call:
 * await client.flushDb();
 */
const clear = async () => {
  memoryCache.clear();
  console.log('[Cache] CLEARED all keys');
};

module.exports = {
  get,
  set,
  del,
  delPattern,
  getOrCompute,
  increment,
  getStats,
  clear
};
