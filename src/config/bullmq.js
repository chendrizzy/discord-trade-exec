const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');

/**
 * BullMQ Configuration - Shared queue and worker factory
 *
 * Graceful Fallback: Disabled when no REDIS_URL configured
 */
class BullMQConfig {
  constructor() {
    this.enabled = !!process.env.REDIS_URL;

    if (!this.enabled) {
      console.warn('[BullMQ] Disabled - no REDIS_URL configured');
      console.warn('[BullMQ] Background jobs will not run in this mode');
      console.warn('[BullMQ] Real-time analysis will still function normally');
      return;
    }

    // Create Redis connection for BullMQ
    this.connection = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times) => {
        if (times > 10) {
          console.error('[BullMQ] Redis connection failed after 10 retries');
          return null;
        }
        return Math.min(times * 100, 3000);
      }
    });

    this.connection.on('error', (err) => {
      console.error('[BullMQ] Redis connection error:', err.message);
    });

    this.connection.on('connect', () => {
      console.log('[BullMQ] Redis connected');
    });

    // Default job options
    this.defaultJobOptions = {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      },
      removeOnComplete: {
        count: 100 // Keep last 100 completed jobs
      },
      removeOnFail: {
        count: 1000 // Keep last 1000 failed jobs for debugging
      }
    };
  }

  /**
   * Create a new queue
   * @param {string} name - Queue name
   * @param {Object} options - Queue options
   * @returns {Queue|null} BullMQ Queue or null if disabled
   */
  createQueue(name, options = {}) {
    if (!this.enabled) {
      return null;
    }

    try {
      return new Queue(name, {
        connection: this.connection,
        defaultJobOptions: {
          ...this.defaultJobOptions,
          ...options
        }
      });
    } catch (err) {
      console.error(`[BullMQ] Failed to create queue ${name}:`, err.message);
      return null;
    }
  }

  /**
   * Create a new worker
   * @param {string} name - Queue name to process
   * @param {Function} processor - Job processor function
   * @param {Object} options - Worker options
   * @returns {Worker|null} BullMQ Worker or null if disabled
   */
  createWorker(name, processor, options = {}) {
    if (!this.enabled) {
      return null;
    }

    try {
      return new Worker(name, processor, {
        connection: this.connection,
        concurrency: options.concurrency || 5,
        ...options
      });
    } catch (err) {
      console.error(`[BullMQ] Failed to create worker ${name}:`, err.message);
      return null;
    }
  }

  /**
   * Close all connections
   */
  async close() {
    if (this.connection) {
      await this.connection.quit();
      console.log('[BullMQ] Redis connection closed');
    }
  }

  /**
   * Get configuration status
   * @returns {Object} Config status
   */
  getStatus() {
    return {
      enabled: this.enabled,
      redisConnected: this.connection?.status === 'ready',
      defaultJobOptions: this.defaultJobOptions
    };
  }
}

module.exports = new BullMQConfig();
