const Redis = require('ioredis');
const logger = require('../../../utils/logger');

/**
 * WebSocket Rate Limiting Middleware
 *
 * Prevents abuse by limiting:
 * - Connection attempts per IP (10/minute)
 * - Events per user (100/minute)
 * - Subscriptions per user (50 total)
 *
 * Uses Redis for distributed rate limiting across multiple servers
 * Falls back to in-memory Map if Redis unavailable
 *
 * Usage:
 *   const rateLimiter = createRateLimitMiddleware(redisClient);
 *   io.use(rateLimiter.connectionLimit);
 *
 *   // In event handlers:
 *   if (!rateLimiter.checkEventLimit(socket, eventName)) {
 *     socket.emit('error', { code: 'RATE_LIMIT', message: 'Too many requests' });
 *     return;
 *   }
 */

class RateLimiter {
  constructor(redisClient = null) {
    this.redisClient = redisClient;

    // Fallback in-memory storage (not shared across servers)
    this.inMemoryStore = new Map();

    // Rate limit configurations
    this.limits = {
      // Connection limits
      connectionsPerIP: {
        max: 10,
        window: 60 * 1000 // 1 minute
      },

      // Event limits (per user)
      eventsPerUser: {
        max: 100,
        window: 60 * 1000 // 1 minute
      },

      // Subscription limits (per user, total)
      subscriptionsPerUser: {
        max: 50
      }
    };

    // Cleanup interval for in-memory store
    this.cleanupInterval = null;
    if (!redisClient) {
      this.cleanupInterval = setInterval(() => this.cleanupInMemory(), 60 * 1000); // Every minute
    }

    logger.info(`Rate limiter initialized (Redis: ${redisClient ? 'enabled' : 'disabled'})`);
  }

  /**
   * Get rate limit key for Redis
   * @param {string} type - Limit type (connection, event, subscription)
   * @param {string} identifier - IP address or user ID
   * @returns {string} Redis key
   */
  getRateLimitKey(type, identifier) {
    return `ratelimit:${type}:${identifier}`;
  }

  /**
   * Check and increment rate limit counter
   * @param {string} key - Rate limit key
   * @param {number} max - Maximum allowed
   * @param {number} window - Time window in ms
   * @returns {Promise<boolean>} True if allowed, false if rate limited
   */
  async checkAndIncrement(key, max, window) {
    if (this.redisClient) {
      return this.checkAndIncrementRedis(key, max, window);
    } else {
      return this.checkAndIncrementMemory(key, max, window);
    }
  }

  /**
   * Redis-based rate limiting
   * @param {string} key - Rate limit key
   * @param {number} max - Maximum allowed
   * @param {number} window - Time window in ms
   * @returns {Promise<boolean>} True if allowed, false if rate limited
   */
  async checkAndIncrementRedis(key, max, window) {
    try {
      const windowSeconds = Math.ceil(window / 1000);

      // Use Redis INCR with expiry
      const current = await this.redisClient.incr(key);

      // Set expiry on first increment
      if (current === 1) {
        await this.redisClient.expire(key, windowSeconds);
      }

      return current <= max;
    } catch (error) {
      logger.error('Redis rate limit check failed:', error);
      // Fail open - allow request if Redis error
      return true;
    }
  }

  /**
   * In-memory rate limiting (fallback)
   * @param {string} key - Rate limit key
   * @param {number} max - Maximum allowed
   * @param {number} window - Time window in ms
   * @returns {boolean} True if allowed, false if rate limited
   */
  checkAndIncrementMemory(key, max, window) {
    const now = Date.now();

    if (!this.inMemoryStore.has(key)) {
      this.inMemoryStore.set(key, {
        count: 1,
        resetAt: now + window
      });
      return true;
    }

    const entry = this.inMemoryStore.get(key);

    // Reset if window expired
    if (now >= entry.resetAt) {
      entry.count = 1;
      entry.resetAt = now + window;
      return true;
    }

    // Increment and check limit
    entry.count++;
    return entry.count <= max;
  }

  /**
   * Cleanup expired entries from in-memory store
   */
  cleanupInMemory() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.inMemoryStore.entries()) {
      if (now >= entry.resetAt) {
        this.inMemoryStore.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`Cleaned ${cleaned} expired rate limit entries from memory`);
    }
  }

  /**
   * Connection rate limit middleware
   * Limits connection attempts per IP address
   * @returns {Function} Socket.io middleware
   */
  connectionLimit() {
    return async (socket, next) => {
      try {
        // Get client IP address
        const ip = socket.handshake.address || socket.request.connection.remoteAddress;
        const key = this.getRateLimitKey('connection', ip);

        // Check rate limit
        const allowed = await this.checkAndIncrement(
          key,
          this.limits.connectionsPerIP.max,
          this.limits.connectionsPerIP.window
        );

        if (!allowed) {
          const error = new Error('Too many connection attempts. Please try again later.');
          error.data = {
            code: 'RATE_LIMIT_EXCEEDED',
            type: 'connection',
            limit: this.limits.connectionsPerIP.max,
            window: this.limits.connectionsPerIP.window
          };

          logger.warn(`Connection rate limit exceeded for IP: ${ip}`);
          return next(error);
        }

        next();
      } catch (error) {
        logger.error('Connection rate limit middleware error:', error);
        // Fail open - allow connection
        next();
      }
    };
  }

  /**
   * Check event rate limit for a user
   * @param {Socket} socket - Socket.io socket
   * @param {string} eventName - Event name
   * @returns {Promise<boolean>} True if allowed, false if rate limited
   */
  async checkEventLimit(socket, eventName) {
    try {
      const userId = socket.handshake.auth?.userId;
      if (!userId) {
        // Allow events for unauthenticated sockets (let auth middleware handle)
        return true;
      }

      const key = this.getRateLimitKey('event', userId);

      const allowed = await this.checkAndIncrement(
        key,
        this.limits.eventsPerUser.max,
        this.limits.eventsPerUser.window
      );

      if (!allowed) {
        logger.warn(`Event rate limit exceeded for user ${userId} (event: ${eventName})`);
      }

      return allowed;
    } catch (error) {
      logger.error('Event rate limit check failed:', error);
      // Fail open - allow event
      return true;
    }
  }

  /**
   * Check subscription limit for a user
   * @param {Socket} socket - Socket.io socket
   * @returns {Promise<boolean>} True if allowed, false if limit reached
   */
  async checkSubscriptionLimit(socket) {
    try {
      const userId = socket.handshake.auth?.userId;
      if (!userId) {
        return true;
      }

      const key = this.getRateLimitKey('subscription', userId);

      if (this.redisClient) {
        const current = await this.redisClient.get(key);
        const count = current ? parseInt(current, 10) : 0;
        return count < this.limits.subscriptionsPerUser.max;
      } else {
        const entry = this.inMemoryStore.get(key);
        const count = entry?.count || 0;
        return count < this.limits.subscriptionsPerUser.max;
      }
    } catch (error) {
      logger.error('Subscription limit check failed:', error);
      return true;
    }
  }

  /**
   * Increment subscription count
   * @param {Socket} socket - Socket.io socket
   */
  async incrementSubscription(socket) {
    try {
      const userId = socket.handshake.auth?.userId;
      if (!userId) return;

      const key = this.getRateLimitKey('subscription', userId);

      if (this.redisClient) {
        await this.redisClient.incr(key);
        // Don't expire - subscriptions are per session
      } else {
        const entry = this.inMemoryStore.get(key) || { count: 0 };
        entry.count++;
        this.inMemoryStore.set(key, entry);
      }
    } catch (error) {
      logger.error('Failed to increment subscription count:', error);
    }
  }

  /**
   * Decrement subscription count
   * @param {Socket} socket - Socket.io socket
   */
  async decrementSubscription(socket) {
    try {
      const userId = socket.handshake.auth?.userId;
      if (!userId) return;

      const key = this.getRateLimitKey('subscription', userId);

      if (this.redisClient) {
        const current = await this.redisClient.get(key);
        if (current && parseInt(current, 10) > 0) {
          await this.redisClient.decr(key);
        }
      } else {
        const entry = this.inMemoryStore.get(key);
        if (entry && entry.count > 0) {
          entry.count--;
        }
      }
    } catch (error) {
      logger.error('Failed to decrement subscription count:', error);
    }
  }

  /**
   * Reset subscription count for a user
   * @param {string} userId - User ID
   */
  async resetSubscriptions(userId) {
    try {
      const key = this.getRateLimitKey('subscription', userId);

      if (this.redisClient) {
        await this.redisClient.del(key);
      } else {
        this.inMemoryStore.delete(key);
      }
    } catch (error) {
      logger.error('Failed to reset subscription count:', error);
    }
  }

  /**
   * Shutdown rate limiter and clear cleanup interval
   * Should be called during graceful shutdown or in test teardown
   */
  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('[RateLimiter] Shutdown complete - cleanup interval cleared');
    }
  }
}

/**
 * Create rate limit middleware
 * @param {Redis} redisClient - Redis client instance (optional)
 * @returns {RateLimiter} Rate limiter instance
 */
function createRateLimitMiddleware(redisClient = null) {
  return new RateLimiter(redisClient);
}

module.exports = {
  createRateLimitMiddleware,
  RateLimiter
};
