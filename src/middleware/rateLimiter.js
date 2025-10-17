// External dependencies
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const Redis = require('ioredis');

// Redis client for distributed rate limiting (optional, falls back to in-memory)
let redisClient = null;
if (process.env.NODE_ENV === 'production' && process.env.REDIS_URL) {
  try {
    redisClient = new Redis(process.env.REDIS_URL, {
      retryStrategy: times => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3
    });

    redisClient.on('error', err => {
      console.error('Redis rate limiter error:', err.message);
      console.log('⚠️  Falling back to in-memory rate limiting');
    });

    redisClient.on('connect', () => {
      console.log('✅ Redis rate limiter connected');
    });
  } catch (error) {
    console.error('Failed to initialize Redis rate limiter:', error.message);
    console.log('⚠️  Using in-memory rate limiting');
  }
}

/**
 * Redis Store for express-rate-limit
 * Implements distributed rate limiting across multiple server instances
 */
class RedisStore {
  constructor() {
    this.prefix = 'rl:';
    this.client = redisClient;
  }

  async increment(key) {
    if (!this.client) {
      // Fallback: return Infinity to let express-rate-limit handle it in-memory
      return { totalHits: 0, resetTime: undefined };
    }

    const fullKey = `${this.prefix}${key}`;
    const multi = this.client.multi();

    multi.incr(fullKey);
    multi.pttl(fullKey);

    const results = await multi.exec();

    if (!results || results.length !== 2) {
      return { totalHits: 0, resetTime: undefined };
    }

    const [[, count], [, ttl]] = results;
    const resetTime = ttl > 0 ? new Date(Date.now() + ttl) : undefined;

    return {
      totalHits: count,
      resetTime
    };
  }

  async decrement(key) {
    if (!this.client) return;

    const fullKey = `${this.prefix}${key}`;
    await this.client.decr(fullKey);
  }

  async resetKey(key) {
    if (!this.client) return;

    const fullKey = `${this.prefix}${key}`;
    await this.client.del(fullKey);
  }

  async resetAll() {
    if (!this.client) return;

    const keys = await this.client.keys(`${this.prefix}*`);
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }
}

// Webhook endpoints rate limiter
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 100, // 100 requests per minute
  message: { error: 'Too many webhook requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: req.rateLimit.resetTime
    });
  }
});

// Dashboard API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes
  message: { error: 'Too many API requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// Strict rate limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 login attempts per 15 minutes
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// Login rate limiter (per IP)
const loginLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 attempts per hour
  skipSuccessfulRequests: true, // Don't count successful logins
  message: { error: 'Too many login attempts, please try again later' }
});

/**
 * Exchange API Rate Limiter
 * Enforces per-user rate limits for crypto exchange API calls
 * 10 requests per minute per user for fee comparison endpoint
 */
const exchangeApiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 10, // 10 requests per minute per user
  message: { error: 'Too many exchange API requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => {
    // Per-user rate limiting (requires authentication)
    return req.user ? `exchange:${req.user._id}` : ipKeyGenerator(req);
  },
  handler: (req, res) => {
    const resetTime = req.rateLimit.resetTime;
    const retryAfter = resetTime ? Math.ceil((resetTime.getTime() - Date.now()) / 1000) : 60;

    res.status(429).json({
      success: false,
      error: 'Too many exchange API requests',
      message: 'You have exceeded the rate limit for exchange API calls. Please try again later.',
      retryAfter: retryAfter,
      limit: 10,
      remaining: 0,
      resetTime: resetTime ? resetTime.toISOString() : undefined
    });
  },
  skip: req => {
    // Skip rate limiting for admin users in development
    return process.env.NODE_ENV !== 'production' && req.user?.isAdmin;
  },
  store: redisClient ? new RedisStore() : undefined
});

/**
 * Broker Call Tracker
 * Tracks individual stock broker API calls to respect broker-specific rate limits
 * IBKR: 50 requests/second
 * Schwab: 120 requests/minute
 * Alpaca: 200 requests/minute
 */
class BrokerCallTracker {
  constructor() {
    // Store format: { userId: { brokerKey: { calls: [], resetTime: timestamp } } }
    this.tracker = new Map();

    // Broker-specific rate limits
    this.brokerLimits = {
      ibkr: { max: 50, window: 1000, message: 'IBKR API rate limit exceeded (50 requests/second)' },
      schwab: { max: 120, window: 60000, message: 'Schwab API rate limit exceeded (120 requests/minute)' },
      alpaca: { max: 200, window: 60000, message: 'Alpaca API rate limit exceeded (200 requests/minute)' },
      // Crypto brokers (in case used as brokers)
      binance: { max: 1200, window: 60000, message: 'Binance API rate limit exceeded (1200 requests/minute)' },
      coinbase: { max: 10, window: 1000, message: 'Coinbase Pro API rate limit exceeded (10 requests/second)' },
      kraken: { max: 15, window: 1000, message: 'Kraken API rate limit exceeded (15 requests/second)' }
    };

    // Cleanup old entries every 5 minutes
    this.cleanupInterval = setInterval(
      () => {
        this.cleanup();
      },
      5 * 60 * 1000
    );
  }

  /**
   * Check if broker API call is allowed for user
   * @param {string} userId - User ID
   * @param {string} brokerKey - Broker key (lowercase)
   * @returns {Object} - { allowed: boolean, retryAfter?: number, remaining?: number }
   */
  checkLimit(userId, brokerKey) {
    const limit = this.brokerLimits[brokerKey.toLowerCase()];
    if (!limit) {
      // Unknown broker, allow by default
      return { allowed: true };
    }

    // Get or create user tracker
    if (!this.tracker.has(userId)) {
      this.tracker.set(userId, new Map());
    }

    const userTracker = this.tracker.get(userId);

    // Get or create broker tracker for user
    if (!userTracker.has(brokerKey)) {
      userTracker.set(brokerKey, { calls: [], resetTime: null });
    }

    const brokerTracker = userTracker.get(brokerKey);
    const now = Date.now();

    // Remove calls outside the current window (sliding window algorithm)
    brokerTracker.calls = brokerTracker.calls.filter(timestamp => now - timestamp < limit.window);

    // Check if limit exceeded
    if (brokerTracker.calls.length >= limit.max) {
      const oldestCall = brokerTracker.calls[0];
      const retryAfter = Math.ceil((oldestCall + limit.window - now) / 1000);

      return {
        allowed: false,
        retryAfter: retryAfter,
        message: limit.message,
        limit: limit.max,
        window: `${limit.window / 1000}s`
      };
    }

    // Record this call
    brokerTracker.calls.push(now);

    return {
      allowed: true,
      remaining: limit.max - brokerTracker.calls.length,
      limit: limit.max,
      resetTime: now + limit.window
    };
  }

  /**
   * Clean up old entries to prevent memory leaks
   */
  cleanup() {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutes

    for (const [userId, userTracker] of this.tracker.entries()) {
      for (const [brokerKey, brokerTracker] of userTracker.entries()) {
        // Remove calls older than 10 minutes
        brokerTracker.calls = brokerTracker.calls.filter(timestamp => now - timestamp < maxAge);

        // Remove broker tracker if no recent calls
        if (brokerTracker.calls.length === 0) {
          userTracker.delete(brokerKey);
        }
      }

      // Remove user tracker if no brokers tracked
      if (userTracker.size === 0) {
        this.tracker.delete(userId);
      }
    }
  }

  /**
   * Get current usage for a user and broker
   * @param {string} userId - User ID
   * @param {string} brokerKey - Broker key
   * @returns {Object} - { current: number, limit: number, remaining: number }
   */
  getUsage(userId, brokerKey) {
    const limit = this.brokerLimits[brokerKey.toLowerCase()];
    if (!limit) {
      return { current: 0, limit: 0, remaining: 0 };
    }

    const userTracker = this.tracker.get(userId);
    if (!userTracker) {
      return { current: 0, limit: limit.max, remaining: limit.max };
    }

    const brokerTracker = userTracker.get(brokerKey);
    if (!brokerTracker) {
      return { current: 0, limit: limit.max, remaining: limit.max };
    }

    const now = Date.now();
    const recentCalls = brokerTracker.calls.filter(timestamp => now - timestamp < limit.window);

    return {
      current: recentCalls.length,
      limit: limit.max,
      remaining: Math.max(0, limit.max - recentCalls.length)
    };
  }

  /**
   * Get rate limit configs for a broker
   * @param {string} brokerKey - Broker key
   * @returns {Object} - { max: number, window: number, message: string }
   */
  getLimitConfig(brokerKey) {
    return this.brokerLimits[brokerKey.toLowerCase()] || null;
  }

  /**
   * Clean up interval on shutdown
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

/**
 * In-Memory Exchange Call Tracker
 * Tracks individual exchange API calls to respect exchange-specific rate limits
 * Coinbase Pro: 10 requests/second
 * Kraken: 15-20 requests/second
 */
class ExchangeCallTracker {
  constructor() {
    // Store format: { userId: { exchangeName: { calls: [], resetTime: timestamp } } }
    this.tracker = new Map();

    // Exchange-specific rate limits (per second)
    this.exchangeLimits = {
      coinbasepro: { max: 8, window: 1000 }, // Conservative: 8 req/sec (vs 10 limit)
      kraken: { max: 12, window: 1000 }, // Conservative: 12 req/sec (vs 15-20 limit)
      binance: { max: 10, window: 1000 },
      bybit: { max: 10, window: 1000 },
      okx: { max: 10, window: 1000 }
    };

    // Cleanup old entries every 5 minutes
    this.cleanupInterval = setInterval(
      () => {
        this.cleanup();
      },
      5 * 60 * 1000
    );
  }

  /**
   * Check if exchange API call is allowed for user
   * @param {string} userId - User ID
   * @param {string} exchangeName - Exchange name (lowercase)
   * @returns {Object} - { allowed: boolean, retryAfter?: number }
   */
  checkLimit(userId, exchangeName) {
    const limit = this.exchangeLimits[exchangeName.toLowerCase()];
    if (!limit) {
      // Unknown exchange, allow by default
      return { allowed: true };
    }

    // Get or create user tracker
    if (!this.tracker.has(userId)) {
      this.tracker.set(userId, new Map());
    }

    const userTracker = this.tracker.get(userId);

    // Get or create exchange tracker for user
    if (!userTracker.has(exchangeName)) {
      userTracker.set(exchangeName, { calls: [], resetTime: null });
    }

    const exchangeTracker = userTracker.get(exchangeName);
    const now = Date.now();

    // Remove calls outside the current window
    exchangeTracker.calls = exchangeTracker.calls.filter(timestamp => now - timestamp < limit.window);

    // Check if limit exceeded
    if (exchangeTracker.calls.length >= limit.max) {
      const oldestCall = exchangeTracker.calls[0];
      const retryAfter = Math.ceil((oldestCall + limit.window - now) / 1000);

      return {
        allowed: false,
        retryAfter: retryAfter,
        message: `Rate limit exceeded for ${exchangeName}. Max ${limit.max} requests per ${limit.window / 1000} seconds.`
      };
    }

    // Record this call
    exchangeTracker.calls.push(now);

    return {
      allowed: true,
      remaining: limit.max - exchangeTracker.calls.length
    };
  }

  /**
   * Clean up old entries to prevent memory leaks
   */
  cleanup() {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutes

    for (const [userId, userTracker] of this.tracker.entries()) {
      for (const [exchangeName, exchangeTracker] of userTracker.entries()) {
        // Remove calls older than 10 minutes
        exchangeTracker.calls = exchangeTracker.calls.filter(timestamp => now - timestamp < maxAge);

        // Remove exchange tracker if no recent calls
        if (exchangeTracker.calls.length === 0) {
          userTracker.delete(exchangeName);
        }
      }

      // Remove user tracker if no exchanges tracked
      if (userTracker.size === 0) {
        this.tracker.delete(userId);
      }
    }
  }

  /**
   * Get current usage for a user and exchange
   * @param {string} userId - User ID
   * @param {string} exchangeName - Exchange name
   * @returns {Object} - { current: number, limit: number, remaining: number }
   */
  getUsage(userId, exchangeName) {
    const limit = this.exchangeLimits[exchangeName.toLowerCase()];
    if (!limit) {
      return { current: 0, limit: 0, remaining: 0 };
    }

    const userTracker = this.tracker.get(userId);
    if (!userTracker) {
      return { current: 0, limit: limit.max, remaining: limit.max };
    }

    const exchangeTracker = userTracker.get(exchangeName);
    if (!exchangeTracker) {
      return { current: 0, limit: limit.max, remaining: limit.max };
    }

    const now = Date.now();
    const recentCalls = exchangeTracker.calls.filter(timestamp => now - timestamp < limit.window);

    return {
      current: recentCalls.length,
      limit: limit.max,
      remaining: Math.max(0, limit.max - recentCalls.length)
    };
  }

  /**
   * Clean up interval on shutdown
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Create global tracker instances
const brokerCallTracker = new BrokerCallTracker();
const exchangeCallTracker = new ExchangeCallTracker();

/**
 * Middleware to enforce broker-specific rate limits
 * Use this before making actual API calls to stock brokers (IBKR, Schwab, Alpaca)
 * @param {string} brokerKey - Optional broker key, if not provided will extract from req.body or req.params
 */
const checkBrokerRateLimit = (brokerKey = null) => {
  return (req, res, next) => {
    // Only applies to authenticated users
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // Get broker key from parameter, body, params, or query
    const broker = brokerKey || req.body?.brokerKey || req.params?.brokerKey || req.query?.brokerKey;

    if (!broker) {
      // No broker specified, continue (will be validated later)
      return next();
    }

    // Check rate limit for this broker
    const result = brokerCallTracker.checkLimit(req.user._id.toString(), broker.toLowerCase());

    // Add rate limit info to response headers
    if (result.limit) {
      res.set({
        'X-RateLimit-Limit': result.limit.toString(),
        'X-RateLimit-Remaining': (result.remaining || 0).toString()
      });

      if (result.resetTime) {
        res.set('X-RateLimit-Reset', new Date(result.resetTime).toISOString());
      }
    }

    if (!result.allowed) {
      res.set('Retry-After', result.retryAfter.toString());

      return res.status(429).json({
        success: false,
        error: 'RATE_LIMIT_EXCEEDED',
        message: result.message,
        retryAfter: result.retryAfter,
        limit: result.limit,
        window: result.window,
        broker: broker
      });
    }

    next();
  };
};

/**
 * Dynamic broker rate limiter that extracts broker from request
 * Use when broker key is in req.body, req.params, or req.query
 */
const dynamicBrokerRateLimiter = checkBrokerRateLimit();

/**
 * Get rate limit status for all brokers for a user (admin/debugging)
 */
const getBrokerRateLimitStatus = (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  const userId = req.user._id.toString();
  const brokers = ['ibkr', 'schwab', 'alpaca', 'binance', 'coinbase', 'kraken'];

  const status = brokers.map(broker => {
    const usage = brokerCallTracker.getUsage(userId, broker);
    const config = brokerCallTracker.getLimitConfig(broker);

    return {
      broker,
      current: usage.current,
      limit: usage.limit,
      remaining: usage.remaining,
      percentUsed: usage.limit > 0 ? ((usage.current / usage.limit) * 100).toFixed(1) : 0,
      window: config ? `${config.window / 1000}s` : 'N/A'
    };
  });

  res.json({
    success: true,
    userId,
    timestamp: new Date().toISOString(),
    brokers: status
  });
};

/**
 * Middleware to enforce exchange-specific rate limits
 * Use this before making actual API calls to exchanges
 */
const checkExchangeRateLimit = (req, res, next) => {
  // Only applies to authenticated users
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  // Exchange name should be in request body or query
  const exchangeName = req.body?.exchange || req.query?.exchange;

  if (!exchangeName) {
    // No exchange specified, continue (will be validated later)
    return next();
  }

  // Check rate limit for this exchange
  const result = exchangeCallTracker.checkLimit(req.user._id.toString(), exchangeName.toLowerCase());

  if (!result.allowed) {
    return res.status(429).json({
      success: false,
      error: 'Exchange rate limit exceeded',
      message: result.message,
      retryAfter: result.retryAfter,
      exchange: exchangeName
    });
  }

  // Add rate limit info to response headers
  const usage = exchangeCallTracker.getUsage(req.user._id.toString(), exchangeName.toLowerCase());
  res.set({
    'X-RateLimit-Limit': usage.limit.toString(),
    'X-RateLimit-Remaining': usage.remaining.toString()
  });

  next();
};

/**
 * Get rate limit status for all exchanges for a user (admin/debugging)
 */
const getExchangeRateLimitStatus = (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  const userId = req.user._id.toString();
  const exchanges = ['coinbasepro', 'kraken', 'binance', 'bybit', 'okx'];

  const status = exchanges.map(exchange => {
    const usage = exchangeCallTracker.getUsage(userId, exchange);
    return {
      exchange,
      current: usage.current,
      limit: usage.limit,
      remaining: usage.remaining,
      percentUsed: usage.limit > 0 ? ((usage.current / usage.limit) * 100).toFixed(1) : 0
    };
  });

  res.json({
    success: true,
    userId,
    timestamp: new Date().toISOString(),
    exchanges: status
  });
};

// Graceful shutdown
process.on('SIGTERM', () => {
  brokerCallTracker.destroy();
  exchangeCallTracker.destroy();
  if (redisClient) {
    redisClient.disconnect();
  }
});

module.exports = {
  webhookLimiter,
  apiLimiter,
  authLimiter,
  loginLimiter,
  exchangeApiLimiter,
  checkExchangeRateLimit,
  getExchangeRateLimitStatus,
  exchangeCallTracker,
  // Broker-specific rate limiting
  checkBrokerRateLimit,
  dynamicBrokerRateLimiter,
  getBrokerRateLimitStatus,
  brokerCallTracker,
  redisClient
};
