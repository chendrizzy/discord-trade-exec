const PolymarketTransaction = require('../../models/PolymarketTransaction');
const PolymarketAlert = require('../../models/PolymarketAlert');
const logger = require('../../utils/logger');

/**
 * AnomalyDetector - Hybrid smart triggering for market manipulation detection
 *
 * Design: Option C - Real-time for CRITICAL, batched for NORMAL
 * Performance: <1s real-time, <30s batched
 */
class AnomalyDetector {
  constructor() {
    if (AnomalyDetector.instance) return AnomalyDetector.instance;

    this.stats = {
      detected: 0,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      transactionsPerMinute: 0
    };

    // Detection thresholds
    this.thresholds = {
      criticalAmount: parseInt(process.env.ANOMALY_CRITICAL_THRESHOLD || '100000', 10),
      coordinatedMinWallets: parseInt(process.env.ANOMALY_COORDINATED_MIN_WALLETS || '5', 10),
      reversalThreshold: parseInt(process.env.ANOMALY_REVERSAL_THRESHOLD || '30', 10),
      flashWhaleRatio: parseFloat(process.env.ANOMALY_FLASH_WHALE_RATIO || '0.5')
    };

    AnomalyDetector.instance = this;
  }

  /**
   * Classify transaction priority
   * @param {Object} transaction - Transaction document
   * @param {Object} walletInfo - Wallet info (optional)
   * @returns {string} 'CRITICAL' or 'NORMAL'
   */
  classifyPriority(transaction, walletInfo = null) {
    const amount = parseFloat(transaction.makerAmountFilled);

    // CRITICAL: Large bets or whale wallets
    if (amount >= this.thresholds.criticalAmount) return 'CRITICAL';
    if (walletInfo?.isWhale) return 'CRITICAL';

    // NORMAL: Everything else
    return 'NORMAL';
  }

  /**
   * Check transaction for anomalies
   * @param {Object} transaction - Transaction to analyze
   * @param {string} priority - 'CRITICAL' (real-time) or 'NORMAL' (batched)
   * @returns {Promise<Object>} Detection result
   */
  async checkTransaction(transaction, priority = 'NORMAL') {
    try {
      const detections = await Promise.all([
        this.detectCoordinatedBetting(transaction),
        this.detectSuddenReversal(transaction),
        priority === 'CRITICAL' ? this.detectFlashWhale(transaction) : Promise.resolve({ detected: false })
      ]);

      // Find highest severity detection
      const detected = detections.find(d => d.detected);

      if (detected) {
        this.stats.detected++;
        this.stats[detected.severity.toLowerCase()]++;

        // Log anomaly
        await this.logAnomaly({
          ...detected,
          transaction,
          priority
        });
      }

      return detected || { detected: false };
    } catch (err) {
      console.error('[AnomalyDetector] Check transaction error:', err.message);
      return { detected: false, error: err.message };
    }
  }

  /**
   * Detect coordinated betting pattern
   * Pattern: 5+ wallets, same outcome, 1-minute window
   * @param {Object} transaction
   * @returns {Promise<Object>} Detection result
   */
  async detectCoordinatedBetting(transaction) {
    const oneMinuteAgo = new Date(Date.now() - 60000);

    try {
      const recentTransactions = await PolymarketTransaction.aggregate([
        {
          $match: {
            marketId: transaction.marketId,
            outcome: transaction.outcome,
            timestamp: { $gte: oneMinuteAgo }
          }
        },
        {
          $group: {
            _id: null,
            wallets: { $addToSet: '$maker' },
            count: { $sum: 1 },
            totalVolume: { $sum: { $toDouble: '$makerAmountFilled' } }
          }
        }
      ]);

      const walletCount = recentTransactions[0]?.wallets.length || 0;
      const totalVolume = recentTransactions[0]?.totalVolume || 0;

      if (walletCount >= this.thresholds.coordinatedMinWallets) {
        return {
          detected: true,
          pattern: 'COORDINATED_BETTING',
          walletCount,
          totalVolume: Math.round(totalVolume),
          timeWindow: '1 minute',
          severity: this.calculateSeverity({ walletCount, totalVolume })
        };
      }

      return { detected: false };
    } catch (err) {
      console.error('[AnomalyDetector] Coordinated betting detection error:', err.message);
      return { detected: false, error: err.message };
    }
  }

  /**
   * Detect sudden sentiment reversal
   * Pattern: Dominant outcome flips >30% in 5 minutes
   * @param {Object} transaction
   * @returns {Promise<Object>} Detection result
   */
  async detectSuddenReversal(transaction) {
    try {
      const now = new Date();
      const fiveMinutesAgo = new Date(now - 300000);
      const tenMinutesAgo = new Date(now - 600000);

      // Current 5-min window
      const current = await this._getOutcomeVolumes(
        transaction.marketId,
        fiveMinutesAgo,
        now
      );

      // Previous 5-min window
      const previous = await this._getOutcomeVolumes(
        transaction.marketId,
        tenMinutesAgo,
        fiveMinutesAgo
      );

      if (!current || !previous) {
        return { detected: false };
      }

      const shift = Math.abs(
        current.dominantPercentage - previous.dominantPercentage
      );

      const outcomeFlipped = current.dominantOutcome !== previous.dominantOutcome;

      if (shift > this.thresholds.reversalThreshold && outcomeFlipped) {
        return {
          detected: true,
          pattern: 'SUDDEN_REVERSAL',
          shift: Math.round(shift * 100) / 100,
          from: previous.dominantOutcome,
          to: current.dominantOutcome,
          severity: this.calculateSeverity({ shift })
        };
      }

      return { detected: false };
    } catch (err) {
      console.error('[AnomalyDetector] Sudden reversal detection error:', err.message);
      return { detected: false, error: err.message };
    }
  }

  /**
   * Detect flash whale pattern (async, 60s delay)
   * Pattern: Large bet → immediate opposite bets
   * @param {Object} transaction
   * @returns {Promise<Object>} Detection result (always { detected: false } - async detection)
   */
  async detectFlashWhale(transaction) {
    const amount = parseFloat(transaction.makerAmountFilled);

    if (amount < this.thresholds.criticalAmount) {
      return { detected: false };
    }

    const oppositeOutcome = transaction.outcome === 'YES' ? 'NO' : 'YES';

    // Schedule async check after 60 seconds
    setTimeout(async () => {
      try {
        const oneMinuteAgo = transaction.timestamp;
        const now = new Date();

        const oppositeBets = await PolymarketTransaction.aggregate([
          {
            $match: {
              marketId: transaction.marketId,
              outcome: oppositeOutcome,
              timestamp: { $gte: oneMinuteAgo, $lte: now }
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: { $toDouble: '$makerAmountFilled' } },
              count: { $sum: 1 }
            }
          }
        ]);

        const oppositeTotal = oppositeBets[0]?.total || 0;
        const oppositeCount = oppositeBets[0]?.count || 0;

        if (oppositeTotal > amount * this.thresholds.flashWhaleRatio) {
          await this.logAnomaly({
            pattern: 'FLASH_WHALE',
            originalBet: amount,
            oppositeBets: Math.round(oppositeTotal),
            oppositeCount,
            ratio: Math.round((oppositeTotal / amount) * 100) / 100,
            severity: 'HIGH',
            transaction
          });

          this.stats.detected++;
          this.stats.high++;
        }
      } catch (err) {
        console.error('[AnomalyDetector] Flash whale async detection error:', err.message);
      }
    }, 60000);

    // Return immediately (async detection)
    return { detected: false };
  }

  /**
   * Get outcome volume distribution for time window
   * @private
   * @param {string} marketId
   * @param {Date} start
   * @param {Date} end
   * @returns {Promise<Object|null>}
   */
  async _getOutcomeVolumes(marketId, start, end) {
    try {
      const result = await PolymarketTransaction.aggregate([
        {
          $match: {
            marketId,
            timestamp: { $gte: start, $lte: end }
          }
        },
        {
          $group: {
            _id: '$outcome',
            volume: { $sum: { $toDouble: '$makerAmountFilled' } }
          }
        },
        {
          $sort: { volume: -1 }
        }
      ]);

      if (!result.length) return null;

      const totalVolume = result.reduce((sum, item) => sum + item.volume, 0);
      const dominantOutcome = result[0]._id;
      const dominantVolume = result[0].volume;
      const dominantPercentage = (dominantVolume / totalVolume) * 100;

      return {
        dominantOutcome,
        dominantPercentage,
        totalVolume
      };
    } catch (err) {
      console.error('[AnomalyDetector] Get outcome volumes error:', err.message);
      return null;
    }
  }

  /**
   * Calculate severity based on anomaly data
   * @param {Object} data - Anomaly-specific data
   * @returns {string} 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
   */
  calculateSeverity(data) {
    // Coordinated betting severity
    if (data.walletCount) {
      if (data.walletCount > 20) return 'CRITICAL';
      if (data.walletCount > 10) return 'HIGH';
      if (data.walletCount > 5) return 'MEDIUM';
      return 'LOW';
    }

    // Sudden reversal severity
    if (data.shift) {
      if (data.shift > 70) return 'CRITICAL';
      if (data.shift > 50) return 'HIGH';
      if (data.shift > 30) return 'MEDIUM';
      return 'LOW';
    }

    // Default
    return 'MEDIUM';
  }

  /**
   * Log detected anomaly
   * @param {Object} anomalyData - Anomaly details
   */
  async logAnomaly(anomalyData) {
    try {
      const alert = await PolymarketAlert.create({
        alertType: 'ANOMALY',
        severity: anomalyData.severity,
        title: `Anomaly Detected: ${anomalyData.pattern}`,
        message: this._formatAnomalyMessage(anomalyData),
        context: {
          patternType: anomalyData.pattern,
          marketId: anomalyData.transaction.marketId,
          txHash: anomalyData.transaction.txHash,
          ...anomalyData
        },
        metadata: {
          detectedAt: new Date(),
          priority: anomalyData.priority
        }
      });

      console.log(`[AnomalyDetector] ${anomalyData.severity} anomaly logged: ${anomalyData.pattern}`);

      return alert;
    } catch (err) {
      console.error('[AnomalyDetector] Log anomaly error:', err.message);
    }
  }

  /**
   * Format anomaly message
   * @private
   */
  _formatAnomalyMessage(data) {
    switch (data.pattern) {
      case 'COORDINATED_BETTING':
        return `${data.walletCount} wallets placed coordinated bets totaling $${data.totalVolume.toLocaleString()} within ${data.timeWindow}`;

      case 'SUDDEN_REVERSAL':
        return `Market sentiment reversed ${data.shift}% from ${data.from} to ${data.to} in 5 minutes`;

      case 'FLASH_WHALE':
        return `Large bet of $${data.originalBet.toLocaleString()} followed by $${data.oppositeBets.toLocaleString()} in opposite bets (${data.ratio}x ratio)`;

      default:
        return 'Anomaly detected';
    }
  }

  /**
   * Get adaptive batch interval based on transaction rate
   * @returns {number} Interval in milliseconds
   */
  getAdaptiveInterval() {
    const txRate = this.stats.transactionsPerMinute;

    if (txRate > 100) return 15000;  // High activity: 15s
    if (txRate > 20) return 30000;   // Normal: 30s
    return 60000;                     // Low activity: 60s
  }

  /**
   * Update transaction rate metric
   * @param {number} rate - Transactions per minute
   */
  updateTransactionRate(rate) {
    this.stats.transactionsPerMinute = rate;
  }

  /**
   * Get detector statistics
   * @returns {Object} Stats
   */
  getStats() {
    return {
      ...this.stats,
      thresholds: this.thresholds,
      adaptiveInterval: this.getAdaptiveInterval()
    };
  }
}

module.exports = new AnomalyDetector();
