const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');
const logger = require('../utils/logger');

/**
 * BullMQ Configuration - Shared queue and worker factory
 *
 * Graceful Fallback: Disabled when no REDIS_URL configured
 */
class BullMQConfig {
  constructor() {
    this.enabled = !!process.env.REDIS_URL;

    if (!this.enabled) {
      logger.warn('[BullMQ] Disabled - no REDIS_URL configured');
      logger.warn('[BullMQ] Background jobs will not run in this mode');
      logger.warn('[BullMQ] Real-time analysis will still function normally');
      return;
    }

    // Create Redis connection for BullMQ
    this.connection = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times) => {
        if (times > 10) {
          logger.error('[BullMQ] Redis connection failed after 10 retries');
          return null;
        }
        return Math.min(times * 100, 3000);
      }
    });

    this.connection.on('error', (err) => {
      logger.error('[BullMQ] Redis connection error', {
        error: err.message,
        stack: err.stack,
        redisUrl: process.env.REDIS_URL ? 'configured' : 'missing'
      });
    });

    this.connection.on('connect', () => {
      logger.info('[BullMQ] Redis connected');
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
      logger.error('[BullMQ] Failed to create queue', {
        queueName: name,
        error: err.message,
        stack: err.stack
      });
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
      logger.error('[BullMQ] Failed to create worker', {
        workerName: name,
        error: err.message,
        stack: err.stack
      });
      return null;
    }
  }

  /**
   * Close all connections
   */
  async close() {
    if (this.connection) {
      await this.connection.quit();
      logger.info('[BullMQ] Redis connection closed');
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
