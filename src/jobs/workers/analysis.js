const analysisPipeline = require('../../services/polymarket/AnalysisPipeline');
const PolymarketTransaction = require('../../models/PolymarketTransaction');

/**
 * Analysis Worker
 *
 * Schedule: On-demand (no repeat)
 * Concurrency: 10
 * Timeout: 5 seconds
 *
 * Processes queued transaction analysis
 */
module.exports = async (job) => {
  const { transactionId } = job.data;

  job.log(`Analyzing transaction: ${transactionId}`);

  try {
    const transaction = await PolymarketTransaction.findById(transactionId);

    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    const result = await analysisPipeline.processTransaction(transaction);

    job.log(`Analysis complete: ${result.processingTime}ms`);

    return result;
  } catch (err) {
    job.log(`Error: ${err.message}`);
    throw err;
  }
};
