'use strict';

/**
 * Redis Connection Manager
 *
 * Handles Redis connection for:
 * - Session storage
 * - WebSocket adapter (horizontal scaling)
 * - Rate limiting
 * - Market data caching
 *
 * Constitutional Principle VII: Graceful Error Handling - Falls back to in-memory if Redis unavailable
 */

const Redis = require('ioredis');
const { getConfig, isDevelopment } = require('./env');

let redisClient = null;
let isPubSubMode = false;

/**
 * Redis connection options
 */
const redisOptions = {
  retryStrategy: times => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  enableOfflineQueue: true,
  connectTimeout: 10000,
  lazyConnect: true // Don't connect immediately - allows graceful fallback
};

/**
 * Connect to Redis with graceful fallback
 * @param {boolean} enablePubSub - Enable pub/sub mode for WebSocket adapter
 * @returns {Promise<Redis|null>} Redis client or null if unavailable
 */
async function connect(enablePubSub = false) {
  const config = getConfig();

  // Skip Redis in test environment unless explicitly required
  if (process.env.NODE_ENV === 'test' && !process.env.REDIS_URL) {
    console.log('⚠️  Redis skipped in test environment');
    return null;
  }

  // If Redis URL not provided, use in-memory fallback for development
  if (!config.REDIS_URL) {
    if (isDevelopment()) {
      console.warn('⚠️  REDIS_URL not configured - using in-memory fallback for sessions/cache');
      console.warn('   - WebSocket horizontal scaling disabled');
      console.warn('   - Set REDIS_URL in .env for production-like testing');
      return null;
    } else {
      throw new Error('REDIS_URL is required in production environment');
    }
  }

  try {
    isPubSubMode = enablePubSub;

    // Create Redis client
    redisClient = new Redis(config.REDIS_URL, {
      ...redisOptions,
      ...(enablePubSub && { enableOfflineQueue: false }) // Disable queue for pub/sub
    });

    // Connect
    await redisClient.connect();

    console.log('✅ Redis connected successfully');
    console.log(`   - Host: ${redisClient.options.host}`);
    console.log(`   - Port: ${redisClient.options.port}`);
    console.log(`   - Mode: ${enablePubSub ? 'Pub/Sub' : 'Standard'}`);

    // Set up event listeners
    setupEventListeners();

    return redisClient;
  } catch (error) {
    console.error('❌ Redis connection failed:', error.message);

    if (isDevelopment()) {
      console.warn('⚠️  Falling back to in-memory storage for development');
      redisClient = null;
      return null;
    } else {
      throw new Error('Redis connection required in production');
    }
  }
}

/**
 * Set up Redis event listeners
 */
function setupEventListeners() {
  if (!redisClient) return;

  redisClient.on('error', err => {
    console.error('❌ Redis error:', err.message);
  });

  redisClient.on('connect', () => {
    console.log('✅ Redis connected');
  });

  redisClient.on('reconnecting', () => {
    console.log('⚠️  Redis reconnecting...');
  });

  redisClient.on('close', () => {
    console.warn('⚠️  Redis connection closed');
  });

  redisClient.on('ready', () => {
    console.log('✅ Redis ready');
  });

  // Graceful shutdown handlers
  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);
}

/**
 * Disconnect from Redis gracefully
 * @returns {Promise<void>}
 */
async function disconnect() {
  if (!redisClient) {
    return;
  }

  try {
    await redisClient.quit();
    redisClient = null;
    console.log('✅ Redis connection closed gracefully');
  } catch (error) {
    console.error('❌ Error closing Redis connection:', error);
    // Force disconnect if graceful quit fails
    if (redisClient) {
      redisClient.disconnect();
      redisClient = null;
    }
  }
}

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown() {
  console.log('\n📦 Closing Redis connection...');
  await disconnect();
}

/**
 * Get Redis client instance
 * @returns {Redis|null}
 */
function getClient() {
  return redisClient;
}

/**
 * Check if Redis is available and connected
 * @returns {boolean}
 */
function isAvailable() {
  return redisClient !== null && redisClient.status === 'ready';
}

/**
 * Health check for Redis connection
 * @returns {Promise<boolean>}
 */
async function healthCheck() {
  if (!redisClient || redisClient.status !== 'ready') {
    return false;
  }

  try {
    const result = await redisClient.ping();
    return result === 'PONG';
  } catch (error) {
    console.error('❌ Redis health check failed:', error.message);
    return false;
  }
}

/**
 * Get Redis connection status
 * @returns {Object}
 */
function getStatus() {
  if (!redisClient) {
    return {
      connected: false,
      status: 'not_configured',
      fallbackMode: true
    };
  }

  return {
    connected: redisClient.status === 'ready',
    status: redisClient.status,
    host: redisClient.options.host,
    port: redisClient.options.port,
    mode: isPubSubMode ? 'pub/sub' : 'standard',
    fallbackMode: false
  };
}

/**
 * Create a new Redis client for pub/sub
 * Required for Socket.IO Redis adapter
 * @returns {Promise<Redis|null>}
 */
async function createPubSubClient() {
  const config = getConfig();

  if (!config.REDIS_URL) {
    return null;
  }

  try {
    const pubSubClient = new Redis(config.REDIS_URL, {
      ...redisOptions,
      enableOfflineQueue: false
    });

    await pubSubClient.connect();
    console.log('✅ Redis pub/sub client created');

    return pubSubClient;
  } catch (error) {
    console.error('❌ Failed to create Redis pub/sub client:', error.message);
    return null;
  }
}

module.exports = {
  connect,
  disconnect,
  getClient,
  isAvailable,
  healthCheck,
  getStatus,
  createPubSubClient
};
