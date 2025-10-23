'use strict';

/**
 * Rate Limiter Utility
 *
 * Provides token bucket rate limiting for:
 * - Broker API calls
 * - WebSocket messages
 * - HTTP API endpoints
 *
 * Constitutional Principle III: Performance and Scalability
 * FR-066-067: Rate limiting to prevent abuse
 */

const { getClient, isAvailable } = require('../../config/redis');
const logger = require('../../utils/logger');

/**
 * Token Bucket Rate Limiter
 *
 * Uses Redis for distributed rate limiting across instances
 * Falls back to in-memory for development
 */
class RateLimiter {
  /**
   * @param {Object} options - Rate limiter options
   * @param {number} options.tokensPerInterval - Number of tokens per interval
   * @param {number} options.interval - Interval in milliseconds
   * @param {string} options.keyPrefix - Redis key prefix
   */
  constructor(options = {}) {
    this.tokensPerInterval = options.tokensPerInterval || 100;
    this.interval = options.interval || 60000; // 1 minute default
    this.keyPrefix = options.keyPrefix || 'ratelimit';
    this.useRedis = isAvailable();

    // In-memory fallback for development
    if (!this.useRedis) {
      this.buckets = new Map();
      logger.warn('⚠️  Rate limiter using in-memory storage (not suitable for production)');
    }
  }

  /**
   * Get Redis key for identifier
   * @param {string} identifier - Unique identifier (userId, IP, etc.)
   * @returns {string} Redis key
   */
  getKey(identifier) {
    return `${this.keyPrefix}:${identifier}`;
  }

  /**
   * Try to consume tokens
   * @param {string} identifier - Unique identifier
   * @param {number} tokens - Number of tokens to consume (default: 1)
   * @returns {Promise<Object>} Result with allowed, remaining, resetAt
   */
  async tryConsume(identifier, tokens = 1) {
    if (this.useRedis) {
      return this.tryConsumeRedis(identifier, tokens);
    } else {
      return this.tryConsumeMemory(identifier, tokens);
    }
  }

  /**
   * Redis-based token consumption
   * @private
   */
  async tryConsumeRedis(identifier, tokens) {
    const redis = getClient();
    const key = this.getKey(identifier);
    const now = Date.now();

    // Lua script for atomic token bucket operations
    const script = `
      local key = KEYS[1]
      local tokens_to_consume = tonumber(ARGV[1])
      local max_tokens = tonumber(ARGV[2])
      local interval = tonumber(ARGV[3])
      local now = tonumber(ARGV[4])
      
      -- Get current bucket state
      local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
      local current_tokens = tonumber(bucket[1]) or max_tokens
      local last_refill = tonumber(bucket[2]) or now
      
      -- Calculate tokens to add based on time elapsed
      local time_elapsed = now - last_refill
      local tokens_to_add = math.floor((time_elapsed / interval) * max_tokens)
      
      if tokens_to_add > 0 then
        current_tokens = math.min(max_tokens, current_tokens + tokens_to_add)
        last_refill = now
      end
      
      -- Try to consume tokens
      if current_tokens >= tokens_to_consume then
        current_tokens = current_tokens - tokens_to_consume
        
        -- Update bucket state
        redis.call('HMSET', key, 'tokens', current_tokens, 'last_refill', last_refill)
        redis.call('EXPIRE', key, math.ceil(interval / 1000 * 2)) -- TTL = 2x interval
        
        -- Calculate reset time
        local reset_at = last_refill + math.ceil((max_tokens - current_tokens) / max_tokens * interval)
        
        return {1, current_tokens, reset_at}
      else
        -- Calculate when enough tokens will be available
        local tokens_needed = tokens_to_consume - current_tokens
        local time_needed = math.ceil((tokens_needed / max_tokens) * interval)
        local reset_at = now + time_needed
        
        return {0, current_tokens, reset_at}
      end
    `;

    try {
      const result = await redis.eval(script, 1, key, tokens, this.tokensPerInterval, this.interval, now);

      return {
        allowed: result[0] === 1,
        remaining: result[1],
        resetAt: new Date(result[2]),
        retryAfter: result[0] === 0 ? Math.ceil((result[2] - now) / 1000) : 0
      };
    } catch (error) {
      logger.error('Rate limiter Redis error:', { error: error.message, stack: error.stack });
      // Allow on error (fail open)
      return {
        allowed: true,
        remaining: this.tokensPerInterval,
        resetAt: new Date(now + this.interval),
        retryAfter: 0
      };
    }
  }

  /**
   * In-memory token consumption (fallback for dev)
   * @private
   */
  async tryConsumeMemory(identifier, tokens) {
    const now = Date.now();
    const key = this.getKey(identifier);

    // Get or create bucket
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = {
        tokens: this.tokensPerInterval,
        lastRefill: now
      };
      this.buckets.set(key, bucket);
    }

    // Calculate tokens to add based on time elapsed
    const timeElapsed = now - bucket.lastRefill;
    const tokensToAdd = Math.floor((timeElapsed / this.interval) * this.tokensPerInterval);

    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(this.tokensPerInterval, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
    }

    // Try to consume tokens
    if (bucket.tokens >= tokens) {
      bucket.tokens -= tokens;

      // Calculate reset time
      const resetAt =
        bucket.lastRefill +
        Math.ceil(((this.tokensPerInterval - bucket.tokens) / this.tokensPerInterval) * this.interval);

      return {
        allowed: true,
        remaining: bucket.tokens,
        resetAt: new Date(resetAt),
        retryAfter: 0
      };
    } else {
      // Calculate when enough tokens will be available
      const tokensNeeded = tokens - bucket.tokens;
      const timeNeeded = Math.ceil((tokensNeeded / this.tokensPerInterval) * this.interval);
      const resetAt = now + timeNeeded;

      return {
        allowed: false,
        remaining: bucket.tokens,
        resetAt: new Date(resetAt),
        retryAfter: Math.ceil(timeNeeded / 1000)
      };
    }
  }

  /**
   * Get current token count (does not consume)
   * @param {string} identifier - Unique identifier
   * @returns {Promise<number>} Current token count
   */
  async getRemaining(identifier) {
    if (this.useRedis) {
      const redis = getClient();
      const key = this.getKey(identifier);
      const tokens = await redis.hget(key, 'tokens');
      return tokens ? parseInt(tokens, 10) : this.tokensPerInterval;
    } else {
      const key = this.getKey(identifier);
      const bucket = this.buckets.get(key);
      return bucket ? bucket.tokens : this.tokensPerInterval;
    }
  }

  /**
   * Reset rate limit for identifier
   * @param {string} identifier - Unique identifier
   */
  async reset(identifier) {
    if (this.useRedis) {
      const redis = getClient();
      const key = this.getKey(identifier);
      await redis.del(key);
    } else {
      const key = this.getKey(identifier);
      this.buckets.delete(key);
    }
  }

  /**
   * Express middleware for rate limiting
   * @param {Object} options - Middleware options
   * @param {Function} options.keyGenerator - Function to generate key from req
   * @param {Function} options.onLimitReached - Callback when limit reached
   * @returns {Function} Express middleware
   */
  middleware(options = {}) {
    const keyGenerator = options.keyGenerator || (req => req.ip || req.connection.remoteAddress);
    const onLimitReached = options.onLimitReached || null;

    return async (req, res, next) => {
      const identifier = keyGenerator(req);

      try {
        const result = await this.tryConsume(identifier);

        // Set rate limit headers
        res.setHeader('X-RateLimit-Limit', this.tokensPerInterval);
        res.setHeader('X-RateLimit-Remaining', result.remaining);
        res.setHeader('X-RateLimit-Reset', result.resetAt.toISOString());

        if (!result.allowed) {
          res.setHeader('Retry-After', result.retryAfter);

          if (onLimitReached) {
            onLimitReached(req, res, result);
          }

          return res.status(429).json({
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: 'Too many requests, please try again later',
              retryAfter: result.retryAfter,
              resetAt: result.resetAt.toISOString()
            }
          });
        }

        next();
      } catch (error) {
        logger.error('Rate limiter middleware error:', { error: error.message, stack: error.stack });
        // Fail open on error
        next();
      }
    };
  }
}

/**
 * Create preset rate limiters for common use cases
 */
const presets = {
  // API endpoints - 100 requests per minute
  api: () =>
    new RateLimiter({
      tokensPerInterval: 100,
      interval: 60000,
      keyPrefix: 'ratelimit:api'
    }),

  // Authentication - 5 attempts per 15 minutes
  auth: () =>
    new RateLimiter({
      tokensPerInterval: 5,
      interval: 900000, // 15 minutes
      keyPrefix: 'ratelimit:auth'
    }),

  // Broker API - 30 requests per minute (conservative)
  broker: brokerName =>
    new RateLimiter({
      tokensPerInterval: 30,
      interval: 60000,
      keyPrefix: `ratelimit:broker:${brokerName}`
    }),

  // WebSocket messages - 50 messages per 10 seconds
  websocket: () =>
    new RateLimiter({
      tokensPerInterval: 50,
      interval: 10000,
      keyPrefix: 'ratelimit:websocket'
    }),

  // Trade execution - 10 trades per minute
  trade: () =>
    new RateLimiter({
      tokensPerInterval: 10,
      interval: 60000,
      keyPrefix: 'ratelimit:trade'
    })
};

module.exports = {
  RateLimiter,
  presets
};
