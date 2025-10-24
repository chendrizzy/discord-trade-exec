const PolymarketWallet = require('../../models/PolymarketWallet');
const PolymarketTransaction = require('../../models/PolymarketTransaction');
const cacheManager = require('./CacheManager');
const logger = require('../../utils/logger');

/**
 * WhaleDetector - Service for identifying and tracking high-value Polymarket wallets
 *
 * Design: Service orchestrates model methods (Option B from research)
 * Performance Target: <500ms per wallet update
 */
class WhaleDetector {
  constructor() {
    if (WhaleDetector.instance) return WhaleDetector.instance;

    this.stats = {
      walletsTracked: 0,
      whalesDetected: 0,
      lastUpdateTime: null
    };

    WhaleDetector.instance = this;
  }

  /**
   * Update all whale wallets (called by BullMQ hourly job)
   * @param {Object} options - Update options
   * @param {number} options.batchSize - Wallets per batch (default: 1000)
   * @param {Function} options.onProgress - Progress callback
   * @returns {Promise<Object>} Update results
   */
  async updateAllWhales(options = {}) {
    const { batchSize = 1000, onProgress } = options;
    const startTime = Date.now();

    logger.info('[WhaleDetector] Starting whale update batch');

    try {
      // Get all wallets flagged as whales
      const whales = await PolymarketWallet.find({ isWhale: true })
        .select('address totalVolume')
        .lean();

      const total = whales.length;
      let updated = 0;
      let errors = 0;

      logger.info('[WhaleDetector] Found whale wallets to update', { totalWhales: total });

      // Process in batches to avoid memory issues
      for (let i = 0; i < total; i += batchSize) {
        const batch = whales.slice(i, i + batchSize);

        await Promise.all(
          batch.map(async (whale) => {
            try {
              await this.updateWallet(whale.address);
              updated++;
            } catch (err) {
              logger.error('[WhaleDetector] Error updating wallet', { address: whale.address, error: err.message, stack: err.stack });
              errors++;
            }
          })
        );

        // Report progress
        if (onProgress) {
          const progress = Math.min(100, Math.floor(((i + batch.length) / total) * 100));
          onProgress(progress);
        }

        // Log batch completion
        logger.info('[WhaleDetector] Batch complete', {
          batchNumber: Math.floor(i / batchSize) + 1,
          updated,
          total
        });
      }

      const duration = Date.now() - startTime;

      this.stats.walletsTracked = total;
      this.stats.lastUpdateTime = new Date();

      logger.info('[WhaleDetector] Whale update complete', { updated, errors, total, durationMs: duration });

      return {
        updated,
        errors,
        total,
        duration
      };
    } catch (err) {
      logger.error('[WhaleDetector] Update all whales failed', { error: err.message, stack: err.stack });
      throw err;
    }
  }

  /**
   * Update single wallet's whale status and metrics
   * @param {string} walletAddress - Wallet address to update
   * @returns {Promise<Object>} Updated wallet or null
   */
  async updateWallet(walletAddress) {
    try {
      const wallet = await PolymarketWallet.findOne({ address: walletAddress });

      if (!wallet) {
        logger.warn('[WhaleDetector] Wallet not found', { address: walletAddress });
        return null;
      }

      // Delegate to model's updateWhaleStatus method (contains scoring logic)
      await wallet.updateWhaleStatus();

      // Invalidate cache
      await cacheManager.del(`whale:${walletAddress}`);
      await cacheManager.del('whale:top100');

      return wallet;
    } catch (err) {
      logger.error('[WhaleDetector] Update wallet error', { address: walletAddress, error: err.message, stack: err.stack });
      throw err;
    }
  }

  /**
   * Update win rates for all whales based on recent market resolutions
   * @returns {Promise<Object>} Update results
   */
  async updateWhaleWinRates() {
    logger.info('[WhaleDetector] Updating whale win rates');

    try {
      const whales = await PolymarketWallet.find({ isWhale: true })
        .select('address');

      let updated = 0;

      for (const whale of whales) {
        // Calculate win rate from transactions
        const winRate = await this._calculateWinRate(whale.address);

        if (winRate !== null) {
          await PolymarketWallet.findOneAndUpdate(
            { address: whale.address },
            { whaleScore: { winRate } },
            { new: true }
          );
          updated++;
        }
      }

      logger.info('[WhaleDetector] Win rates updated', { updatedWhales: updated });

      return { updated };
    } catch (err) {
      logger.error('[WhaleDetector] Update win rates failed', { error: err.message, stack: err.stack });
      throw err;
    }
  }

  /**
   * Calculate win rate for a wallet
   * @private
   * @param {string} walletAddress
   * @returns {Promise<number|null>} Win rate (0-100) or null
   */
  async _calculateWinRate(walletAddress) {
    try {
      const result = await PolymarketTransaction.aggregate([
        {
          $match: {
            maker: walletAddress,
            'metadata.resolved': true
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            wins: {
              $sum: {
                $cond: [{ $eq: ['$metadata.won', true] }, 1, 0]
              }
            }
          }
        }
      ]);

      if (!result.length || result[0].total === 0) {
        return null;
      }

      const winRate = (result[0].wins / result[0].total) * 100;
      return Math.round(winRate * 100) / 100; // 2 decimal places
    } catch (err) {
      logger.error('[WhaleDetector] Calculate win rate error', { address: walletAddress, error: err.message, stack: err.stack });
      return null;
    }
  }

  /**
   * Get top N whale wallets with caching
   * @param {number} limit - Number of whales to return (default: 100)
   * @param {string} sortBy - Sort field: 'volume' | 'score' | 'winRate' (default: 'score')
   * @returns {Promise<Array>} Top whale wallets
   */
  async getTopWhales(limit = 100, sortBy = 'score') {
    const cacheKey = `whale:top${limit}:${sortBy}`;

    return cacheManager.getOrCompute(
      cacheKey,
      async () => {
        const sortField = {
          volume: 'totalVolume',
          score: 'whaleScore.totalScore',
          winRate: 'whaleScore.winRate'
        }[sortBy] || 'whaleScore.totalScore';

        const whales = await PolymarketWallet.find({ isWhale: true })
          .sort({ [sortField]: -1 })
          .limit(limit)
          .select('address totalVolume whaleScore isWhale createdAt')
          .lean();

        return whales;
      },
      cacheManager.ttls.WHALE_LIST // 10 minutes
    );
  }

  /**
   * Check if wallet qualifies as whale and update if needed
   * @param {Object} wallet - Wallet document or address
   * @returns {Promise<boolean>} True if wallet is/became a whale
   */
  async checkAndUpdateWhaleStatus(wallet) {
    try {
      let walletDoc;

      if (typeof wallet === 'string') {
        walletDoc = await PolymarketWallet.findOne({ address: wallet });
      } else {
        walletDoc = wallet;
      }

      if (!walletDoc) {
        logger.warn('[WhaleDetector] Wallet not found');
        return false;
      }

      const wasWhale = walletDoc.isWhale;

      // Update status (model method contains all whale criteria logic)
      await walletDoc.updateWhaleStatus();

      const isWhale = walletDoc.isWhale;

      // Log whale detection
      if (isWhale && !wasWhale) {
        logger.info('[WhaleDetector] New whale detected', {
          address: walletDoc.address,
          totalVolume: walletDoc.totalVolume
        });
        this.stats.whalesDetected++;
      }

      return isWhale;
    } catch (err) {
      logger.error('[WhaleDetector] Check whale status error', { error: err.message, stack: err.stack });
      return false;
    }
  }

  /**
   * Get whale detection statistics
   * @returns {Object} Stats
   */
  getStats() {
    return {
      ...this.stats,
      cacheStats: cacheManager.getStats()
    };
  }

  /**
   * Clear whale caches
   */
  async clearCache() {
    await cacheManager.flush('whale:*');
    logger.info('[WhaleDetector] Cache cleared');
  }
}

module.exports = new WhaleDetector();
