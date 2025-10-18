# BullMQ Infrastructure Architecture

## Files
- `src/config/bullmq.js` - Queue configuration and factory
- `src/jobs/index.js` - Worker orchestration
- `src/jobs/workers/whaleUpdates.js` - Whale update worker
- `src/jobs/workers/anomalyBatch.js` - Anomaly batch worker
- `src/jobs/workers/analysis.js` - Analysis worker
- `src/jobs/workers/alerts.js` - Alert delivery worker

---

## Queue Configuration (`src/config/bullmq.js`)

### BullMQConfig Class

```javascript
const { Queue, Worker, QueueScheduler } = require('bullmq');
const Redis = require('ioredis');

class BullMQConfig {
  constructor() {
    this.enabled = !!process.env.REDIS_URL;

    if (!this.enabled) {
      console.warn('[BullMQ] Disabled - no REDIS_URL configured');
      console.warn('[BullMQ] Background jobs will not run in this mode');
      return;
    }

    this.connection = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false
    });

    this.defaultJobOptions = {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 1000 }
    };
  }

  createQueue(name, options = {}) {
    if (!this.enabled) return null;
    return new Queue(name, {
      connection: this.connection,
      defaultJobOptions: { ...this.defaultJobOptions, ...options }
    });
  }

  createWorker(name, processor, options = {}) {
    if (!this.enabled) return null;
    return new Worker(name, processor, {
      connection: this.connection,
      concurrency: options.concurrency || 5,
      ...options
    });
  }
}

module.exports = new BullMQConfig();
```

---

## Queue Definitions

### 1. Whale Updates Queue
**Name**: `polymarket-whale-updates`
**Schedule**: Hourly (`0 * * * *`)
**Concurrency**: 1 (prevent overlapping)
**Timeout**: 10 minutes

```javascript
{
  name: 'polymarket-whale-updates',
  repeat: { pattern: '0 * * * *' },
  jobOptions: {
    timeout: 600000, // 10 minutes
    attempts: 2
  }
}
```

### 2. Anomaly Batch Queue
**Name**: `polymarket-anomaly-batch`
**Schedule**: Every 30 seconds
**Concurrency**: 3
**Timeout**: 45 seconds

```javascript
{
  name: 'polymarket-anomaly-batch',
  repeat: { every: 30000 },
  jobOptions: {
    timeout: 45000,
    attempts: 3
  }
}
```

### 3. Analysis Queue
**Name**: `polymarket-analysis`
**Schedule**: On-demand (no repeat)
**Concurrency**: 10
**Timeout**: 5 seconds

```javascript
{
  name: 'polymarket-analysis',
  jobOptions: {
    timeout: 5000,
    attempts: 2
  }
}
```

### 4. Alerts Queue
**Name**: `polymarket-alerts`
**Schedule**: On-demand
**Concurrency**: 5 (respect rate limits)
**Timeout**: 10 seconds

```javascript
{
  name: 'polymarket-alerts',
  jobOptions: {
    timeout: 10000,
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 }
  }
}
```

---

## Worker Implementations

### Worker: `whaleUpdates.js`

```javascript
const whaleDetector = require('../../services/polymarket/WhaleDetector');

module.exports = async (job) => {
  const { batchSize = 1000 } = job.data;

  job.log(`Starting whale updates (batch: ${batchSize})`);
  job.updateProgress(0);

  const result = await whaleDetector.updateAllWhales({
    batchSize,
    onProgress: (progress) => job.updateProgress(progress)
  });

  job.log(`Completed: ${result.updated} wallets updated`);

  return {
    walletsUpdated: result.updated,
    errors: result.errors,
    duration: result.duration
  };
};
```

### Worker: `anomalyBatch.js`

```javascript
const anomalyDetector = require('../../services/polymarket/AnomalyDetector');
const PolymarketTransaction = require('../../models/PolymarketTransaction');

module.exports = async (job) => {
  const now = new Date();
  const thirtySecondsAgo = new Date(now - 30000);

  // Get all NORMAL-priority transactions from last interval
  const transactions = await PolymarketTransaction.find({
    timestamp: { $gte: thirtySecondsAgo },
    'metadata.anomalyChecked': { $ne: true }
  });

  job.log(`Processing ${transactions.length} transactions`);

  const results = { detected: 0, checked: transactions.length };

  for (const tx of transactions) {
    const result = await anomalyDetector.checkTransaction(tx, 'NORMAL');
    if (result.detected) results.detected++;

    // Mark as checked
    await PolymarketTransaction.findByIdAndUpdate(tx._id, {
      'metadata.anomalyChecked': true
    });
  }

  return results;
};
```

### Worker: `analysis.js`

```javascript
const analysisPipeline = require('../../services/polymarket/AnalysisPipeline');
const PolymarketTransaction = require('../../models/PolymarketTransaction');

module.exports = async (job) => {
  const { transactionId } = job.data;

  const transaction = await PolymarketTransaction.findById(transactionId);
  if (!transaction) {
    throw new Error(`Transaction ${transactionId} not found`);
  }

  const result = await analysisPipeline.processTransaction(transaction);

  return result;
};
```

### Worker: `alerts.js`

```javascript
const discordAlertService = require('../../services/polymarket/DiscordAlertService');
const PolymarketAlert = require('../../models/PolymarketAlert');

module.exports = async (job) => {
  const { alertId } = job.data;

  const alert = await PolymarketAlert.findById(alertId);
  if (!alert) {
    throw new Error(`Alert ${alertId} not found`);
  }

  const result = await discordAlertService.sendAlert(alert);

  return result;
};
```

---

## Worker Orchestration (`src/jobs/index.js`)

```javascript
const bullmqConfig = require('../config/bullmq');

// Import processors
const whaleUpdatesProcessor = require('./workers/whaleUpdates');
const anomalyBatchProcessor = require('./workers/anomalyBatch');
const analysisProcessor = require('./workers/analysis');
const alertsProcessor = require('./workers/alerts');

class JobOrchestrator {
  async start() {
    if (!bullmqConfig.enabled) {
      console.warn('[Jobs] BullMQ disabled - background jobs will not run');
      return;
    }

    console.log('[Jobs] Starting workers...');

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

    // Event handlers
    Object.entries(this.workers).forEach(([name, worker]) => {
      worker.on('completed', (job) => {
        console.log(`[${name}] Job ${job.id} completed`);
      });

      worker.on('failed', (job, err) => {
        console.error(`[${name}] Job ${job.id} failed:`, err.message);
      });

      worker.on('progress', (job, progress) => {
        console.log(`[${name}] Job ${job.id} progress: ${progress}%`);
      });
    });

    // Schedule recurring jobs
    await this.scheduleRecurringJobs();

    console.log('[Jobs] All workers started');
  }

  async scheduleRecurringJobs() {
    const whaleQueue = bullmqConfig.createQueue('polymarket-whale-updates');
    const anomalyQueue = bullmqConfig.createQueue('polymarket-anomaly-batch');

    // Hourly whale updates
    await whaleQueue.add(
      'update-all-whales',
      { batchSize: 1000 },
      { repeat: { pattern: '0 * * * *' } }
    );

    // 30-second anomaly batches
    await anomalyQueue.add(
      'batch-detection',
      {},
      { repeat: { every: 30000 } }
    );

    console.log('[Jobs] Recurring jobs scheduled');
  }

  async stop() {
    console.log('[Jobs] Stopping workers...');

    await Promise.all(
      Object.values(this.workers).map(w => w.close())
    );

    console.log('[Jobs] All workers stopped');
  }
}

module.exports = new JobOrchestrator();
```

---

## Integration with Main App

**Modify**: `src/services/polymarket/PolymarketService.js`

```javascript
const jobOrchestrator = require('../../jobs');

async initialize() {
  // ... existing initialization

  // Start background jobs
  await jobOrchestrator.start();

  console.log('[PolymarketService] Background jobs started');
}

async stop() {
  // ... existing stop logic

  // Stop background jobs
  await jobOrchestrator.stop();
}
```

---

## Development Mode (No Redis)

When `REDIS_URL` is not set:
- BullMQ automatically disabled
- Warning logs explain which jobs won't run
- Services still function for real-time analysis
- Background jobs (whale updates, batch anomalies) skipped

```
[BullMQ] Disabled - no REDIS_URL configured
[BullMQ] Background jobs will not run in this mode
[Jobs] BullMQ disabled - background jobs will not run
```

---

## Configuration

```javascript
REDIS_URL=redis://localhost:6379

# BullMQ Job Settings
BULLMQ_WHALE_UPDATE_BATCH_SIZE=1000
BULLMQ_ANOMALY_BATCH_INTERVAL=30000
BULLMQ_ANALYSIS_CONCURRENCY=10
BULLMQ_ALERTS_CONCURRENCY=5
```

---

## Monitoring

```javascript
// Get queue stats
const queue = bullmqConfig.createQueue('polymarket-whale-updates');
const counts = await queue.getJobCounts();

console.log({
  waiting: counts.waiting,
  active: counts.active,
  completed: counts.completed,
  failed: counts.failed
});
```

### BullMQ Board (Optional UI)
```bash
npm install @bull-board/express
```

Provides web UI for monitoring queues, jobs, and workers at `/admin/queues`
