const anomalyDetector = require('../../services/polymarket/AnomalyDetector');
const PolymarketTransaction = require('../../models/PolymarketTransaction');

/**
 * Anomaly Batch Worker
 *
 * Schedule: Every 30 seconds
 * Concurrency: 3
 * Timeout: 45 seconds
 *
 * Processes NORMAL-priority transactions in batches
 */
module.exports = async (job) => {
  const now = new Date();
  const thirtySecondsAgo = new Date(now - 30000);

  job.log('Starting anomaly batch detection');

  try {
    // Get all NORMAL-priority transactions from last interval
    const transactions = await PolymarketTransaction.find({
      timestamp: { $gte: thirtySecondsAgo },
      'metadata.anomalyChecked': { $ne: true }
    }).limit(100); // Limit to prevent overwhelming

    job.log(`Processing ${transactions.length} transactions`);
    job.updateProgress(0);

    const results = { detected: 0, checked: transactions.length };

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];

      const result = await anomalyDetector.checkTransaction(tx, 'NORMAL');
      if (result.detected) {
        results.detected++;
      }

      // Mark as checked
      await PolymarketTransaction.findByIdAndUpdate(tx._id, {
        'metadata.anomalyChecked': true
      });

      // Update progress
      job.updateProgress(Math.round(((i + 1) / transactions.length) * 100));
    }

    job.log(`Completed: ${results.detected} anomalies detected out of ${results.checked} transactions`);

    return results;
  } catch (err) {
    job.log(`Error: ${err.message}`);
    throw err;
  }
};
