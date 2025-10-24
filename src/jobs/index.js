const bullmqConfig = require('../config/bullmq');

// Import processors
const whaleUpdatesProcessor = require('./workers/whaleUpdates');
const anomalyBatchProcessor = require('./workers/anomalyBatch');
const analysisProcessor = require('./workers/analysis');
const alertsProcessor = require('./workers/alerts');
const logger = require('../utils/logger');

/**
 * JobOrchestrator - Central BullMQ worker management
 *
 * Manages 4 worker pools:
 * - Whale Updates (hourly)
 * - Anomaly Batch (30s interval)
 * - Analysis (on-demand)
 * - Alerts (on-demand)
 */
class JobOrchestrator {
  constructor() {
    this.workers = {};
    this.queues = {};
  }

  /**
   * Start all workers and schedule recurring jobs
   */
  async start() {
    if (!bullmqConfig.enabled) {
      logger.warn('[Jobs] BullMQ disabled - background jobs will not run');
      logger.warn('[Jobs] Real-time analysis will continue normally');
      return;
    }

    logger.info('[Jobs] Starting workers...');

    try {
      // Create workers
      this.workers = {
        whaleUpdates: bullmqConfig.createWorker(
          'polymarket-whale-updates',
          whaleUpdatesProcessor,
          { concurrency: 1 }
        ),
        anomalyBatch: bullmqConfig.createWorker(
          'polymarket-anomaly-batch',
          anomalyBatchProcessor,
          { concurrency: 3 }
        ),
        analysis: bullmqConfig.createWorker(
          'polymarket-analysis',
          analysisProcessor,
          { concurrency: 10 }
        ),
        alerts: bullmqConfig.createWorker(
          'polymarket-alerts',
          alertsProcessor,
          { concurrency: 5 }
        )
      };

      // Create queues
      this.queues = {
        whaleUpdates: bullmqConfig.createQueue('polymarket-whale-updates'),
        anomalyBatch: bullmqConfig.createQueue('polymarket-anomaly-batch'),
        analysis: bullmqConfig.createQueue('polymarket-analysis'),
        alerts: bullmqConfig.createQueue('polymarket-alerts')
      };

      // Attach event handlers
      this._attachEventHandlers();

      // Schedule recurring jobs
      await this.scheduleRecurringJobs();

      logger.info('[Jobs] All workers started successfully');
    } catch (err) {
      logger.error('[Jobs] Worker startup error', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Attach event handlers to workers
   * @private
   */
  _attachEventHandlers() {
    Object.entries(this.workers).forEach(([name, worker]) => {
      if (!worker) return;

      worker.on('completed', (job) => {
        logger.info('[Jobs] Job completed', {
          workerName: name,
          jobId: job.id
        });
      });

      worker.on('failed', (job, err) => {
        logger.error('[Jobs] Job failed', {
          workerName: name,
          jobId: job?.id,
          error: err.message,
          stack: err.stack
        });
      });

      worker.on('progress', (job, progress) => {
        logger.info('[Jobs] Job progress', {
          workerName: name,
          jobId: job.id,
          progressPercent: progress
        });
      });

      worker.on('error', (err) => {
        logger.error('[Jobs] Worker error', {
          workerName: name,
          error: err.message,
          stack: err.stack
        });
      });
    });
  }

  /**
   * Schedule recurring jobs
   */
  async scheduleRecurringJobs() {
    if (!this.queues.whaleUpdates || !this.queues.anomalyBatch) {
      logger.warn('[Jobs] Queues not available - recurring jobs not scheduled');
      return;
    }

    logger.info('[Jobs] Scheduling recurring jobs...');

    try {
      // Hourly whale updates
      await this.queues.whaleUpdates.add(
        'update-all-whales',
        {
          batchSize: parseInt(process.env.BULLMQ_WHALE_UPDATE_BATCH_SIZE || '1000', 10)
        },
        {
          repeat: {
            pattern: '0 * * * *' // Every hour on the hour
          },
          jobId: 'whale-updates-hourly' // Prevent duplicates
        }
      );

      // 30-second anomaly batches
      const anomalyInterval = parseInt(
        process.env.BULLMQ_ANOMALY_BATCH_INTERVAL || '30000',
        10
      );

      await this.queues.anomalyBatch.add(
        'batch-detection',
        {},
        {
          repeat: {
            every: anomalyInterval
          },
          jobId: 'anomaly-batch-recurring' // Prevent duplicates
        }
      );

      logger.info('[Jobs] Recurring jobs scheduled', {
        whaleUpdates: 'Hourly (0 * * * *)',
        anomalyBatch: `Every ${anomalyInterval / 1000}s`,
        anomalyIntervalMs: anomalyInterval
      });
    } catch (err) {
      logger.error('[Jobs] Schedule recurring jobs error', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Queue a single analysis job
   * @param {string} transactionId - Transaction ID to analyze
   */
  async queueAnalysis(transactionId) {
    if (!this.queues.analysis) {
      logger.warn('[Jobs] Analysis queue not available');
      return null;
    }

    return this.queues.analysis.add('analyze', {
      transactionId
    });
  }

  /**
   * Queue a single alert job
   * @param {string} alertId - Alert ID to send
   */
  async queueAlert(alertId) {
    if (!this.queues.alerts) {
      logger.warn('[Jobs] Alerts queue not available');
      return null;
    }

    return this.queues.alerts.add('send', {
      alertId
    });
  }

  /**
   * Stop all workers gracefully
   */
  async stop() {
    logger.info('[Jobs] Stopping workers...');

    try {
      // Close all workers
      await Promise.all(
        Object.values(this.workers)
          .filter(w => w)
          .map(w => w.close())
      );

      // Close all queues
      await Promise.all(
        Object.values(this.queues)
          .filter(q => q)
          .map(q => q.close())
      );

      logger.info('[Jobs] All workers stopped');
    } catch (err) {
      logger.error('[Jobs] Worker shutdown error', {
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Get job statistics
   * @returns {Promise<Object>} Stats for all queues
   */
  async getStats() {
    if (!bullmqConfig.enabled) {
      return { enabled: false };
    }

    const stats = {};

    for (const [name, queue] of Object.entries(this.queues)) {
      if (!queue) continue;

      try {
        const counts = await queue.getJobCounts();
        stats[name] = counts;
      } catch (err) {
        logger.error('[Jobs] Get stats error', {
          queueName: name,
          error: err.message,
          stack: err.stack
        });
        stats[name] = { error: err.message };
      }
    }

    return {
      enabled: true,
      ...stats
    };
  }
}

module.exports = new JobOrchestrator();
