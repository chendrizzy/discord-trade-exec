const whaleDetector = require('../../services/polymarket/WhaleDetector');

/**
 * Whale Updates Worker
 *
 * Schedule: Hourly (0 * * * *)
 * Concurrency: 1 (prevent overlapping)
 * Timeout: 10 minutes
 */
module.exports = async (job) => {
  const { batchSize = 1000 } = job.data;

  job.log(`Starting whale updates (batch: ${batchSize})`);
  job.updateProgress(0);

  try {
    const result = await whaleDetector.updateAllWhales({
      batchSize,
      onProgress: (progress) => {
        job.updateProgress(progress);
      }
    });

    job.log(`Completed: ${result.updated} wallets updated, ${result.errors} errors`);

    return {
      walletsUpdated: result.updated,
      errors: result.errors,
      duration: result.duration
    };
  } catch (err) {
    job.log(`Error: ${err.message}`);
    throw err;
  }
};
