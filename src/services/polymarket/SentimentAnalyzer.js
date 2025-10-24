const PolymarketTransaction = require('../../models/PolymarketTransaction');
const cacheManager = require('./CacheManager');
const logger = require('../../utils/logger');

/**
 * SentimentAnalyzer - Real-time market sentiment analysis for Polymarket
 *
 * Performance Target: <2s per analysis (cache hit: <1ms)
 * Caching: 1-min TTL for sentiment, 5-min for baseline
 */
class SentimentAnalyzer {
  constructor() {
    if (SentimentAnalyzer.instance) return SentimentAnalyzer.instance;

    this.stats = {
      analyzed: 0,
      cacheHits: 0,
      cacheMisses: 0
    };

    // Detection thresholds
    this.thresholds = {
      volumeSpike: 200, // 200% increase = 3x baseline
      sentimentShift: 10, // 10% change in dominant outcome
      minTransactionsForAnalysis: 5
    };

    SentimentAnalyzer.instance = this;
  }

  /**
   * Analyze market sentiment with caching
   * @param {string} marketId - Polymarket market ID
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} Sentiment analysis results
   */
  async analyzeMarket(marketId, options = {}) {
    const { forceRefresh = false } = options;
    const cacheKey = `sentiment:${marketId}`;

    // Check cache first
    if (!forceRefresh) {
      const cached = await cacheManager.get(cacheKey);
      if (cached) {
        this.stats.cacheHits++;
        return cached;
      }
    }

    this.stats.cacheMisses++;

    const startTime = Date.now();

    try {
      // Get market statistics (last hour)
      const oneHourAgo = new Date(Date.now() - 3600000);

      const [sentiment, volumeSpike, sentimentShift] = await Promise.all([
        this._calculateMarketSentiment(marketId, oneHourAgo),
        this.detectVolumeSpike(marketId),
        this.detectSentimentShift(marketId)
      ]);

      const result = {
        marketId,
        timestamp: new Date(),
        ...sentiment,
        volumeSpike,
        sentimentShift,
        processingTime: Date.now() - startTime
      };

      // Cache for 1 minute
      await cacheManager.set(cacheKey, result, cacheManager.ttls.SENTIMENT);

      this.stats.analyzed++;

      return result;
    } catch (err) {
      logger.error('[SentimentAnalyzer] Analysis failed', {
        marketId,
        error: err.message,
        stack: err.stack
      });
      throw err;
    }
  }

  /**
   * Calculate current market sentiment
   * @private
   * @param {string} marketId
   * @param {Date} since - Start time for analysis
   * @returns {Promise<Object>} Sentiment data
   */
  async _calculateMarketSentiment(marketId, since) {
    const result = await PolymarketTransaction.aggregate([
      {
        $match: {
          marketId,
          timestamp: { $gte: since }
        }
      },
      {
        $group: {
          _id: '$outcome',
          volume: { $sum: { $toDouble: '$makerAmountFilled' } },
          count: { $sum: 1 },
          avgBetSize: { $avg: { $toDouble: '$makerAmountFilled' } }
        }
      },
      {
        $sort: { volume: -1 }
      }
    ]);

    if (!result.length) {
      return {
        totalVolume: 0,
        totalTransactions: 0,
        dominantOutcome: null,
        dominantPercentage: 0,
        outcomes: []
      };
    }

    const totalVolume = result.reduce((sum, item) => sum + item.volume, 0);
    const totalTransactions = result.reduce((sum, item) => sum + item.count, 0);

    const dominantOutcome = result[0]._id;
    const dominantVolume = result[0].volume;
    const dominantPercentage = (dominantVolume / totalVolume) * 100;

    return {
      totalVolume: Math.round(totalVolume),
      totalTransactions,
      dominantOutcome,
      dominantPercentage: Math.round(dominantPercentage * 100) / 100,
      outcomes: result.map(item => ({
        outcome: item._id,
        volume: Math.round(item.volume),
        count: item.count,
        percentage: Math.round((item.volume / totalVolume) * 100 * 100) / 100,
        avgBetSize: Math.round(item.avgBetSize)
      }))
    };
  }

  /**
   * Detect volume spike (>200% increase over baseline)
   * @param {string} marketId
   * @returns {Promise<Object>} Spike detection result
   */
  async detectVolumeSpike(marketId) {
    try {
      // Get current hour volume
      const oneHourAgo = new Date(Date.now() - 3600000);
      const currentHourVolume = await this._getMarketVolume(marketId, oneHourAgo);

      // Get baseline (24hr average) with cache
      const baseline = await this._getMarketBaseline(marketId);

      if (!baseline || baseline === 0) {
        return { detected: false, reason: 'insufficient_baseline' };
      }

      const percentageIncrease = ((currentHourVolume - baseline) / baseline) * 100;

      const detected = percentageIncrease >= this.thresholds.volumeSpike;

      return {
        detected,
        percentage: Math.round(percentageIncrease * 100) / 100,
        currentVolume: Math.round(currentHourVolume),
        baseline: Math.round(baseline),
        threshold: this.thresholds.volumeSpike
      };
    } catch (err) {
      logger.error('[SentimentAnalyzer] Volume spike detection error', {
        marketId,
        error: err.message,
        stack: err.stack
      });
      return { detected: false, error: err.message };
    }
  }

  /**
   * Detect sentiment shift (>10% change in dominant outcome)
   * @param {string} marketId
   * @returns {Promise<Object>} Shift detection result
   */
  async detectSentimentShift(marketId) {
    try {
      const now = new Date();
      const fiveMinutesAgo = new Date(now - 300000);
      const tenMinutesAgo = new Date(now - 600000);

      // Get current 5-min window
      const current = await this._calculateMarketSentiment(marketId, fiveMinutesAgo);

      // Get previous 5-min window
      const previous = await this._calculateMarketSentiment(marketId, tenMinutesAgo);

      // Need sufficient transactions
      if (current.totalTransactions < this.thresholds.minTransactionsForAnalysis ||
          previous.totalTransactions < this.thresholds.minTransactionsForAnalysis) {
        return { detected: false, reason: 'insufficient_transactions' };
      }

      const shift = Math.abs(current.dominantPercentage - previous.dominantPercentage);
      const detected = shift >= this.thresholds.sentimentShift;

      return {
        detected,
        shift: Math.round(shift * 100) / 100,
        from: {
          outcome: previous.dominantOutcome,
          percentage: previous.dominantPercentage
        },
        to: {
          outcome: current.dominantOutcome,
          percentage: current.dominantPercentage
        },
        threshold: this.thresholds.sentimentShift
      };
    } catch (err) {
      logger.error('[SentimentAnalyzer] Sentiment shift detection error', {
        marketId,
        error: err.message,
        stack: err.stack
      });
      return { detected: false, error: err.message };
    }
  }

  /**
   * Get market volume for time period
   * @private
   * @param {string} marketId
   * @param {Date} since
   * @returns {Promise<number>} Total volume
   */
  async _getMarketVolume(marketId, since) {
    const result = await PolymarketTransaction.aggregate([
      {
        $match: {
          marketId,
          timestamp: { $gte: since }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: { $toDouble: '$makerAmountFilled' } }
        }
      }
    ]);

    return result[0]?.total || 0;
  }

  /**
   * Get 24-hour baseline volume with caching
   * @private
   * @param {string} marketId
   * @returns {Promise<number>} Average hourly volume
   */
  async _getMarketBaseline(marketId) {
    const cacheKey = `baseline:${marketId}`;

    return cacheManager.getOrCompute(
      cacheKey,
      async () => {
        const twentyFourHoursAgo = new Date(Date.now() - 86400000);

        const result = await PolymarketTransaction.aggregate([
          {
            $match: {
              marketId,
              timestamp: { $gte: twentyFourHoursAgo }
            }
          },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: '%Y-%m-%d-%H',
                  date: '$timestamp'
                }
              },
              hourlyVolume: { $sum: { $toDouble: '$makerAmountFilled' } }
            }
          },
          {
            $group: {
              _id: null,
              avgHourlyVolume: { $avg: '$hourlyVolume' }
            }
          }
        ]);

        return result[0]?.avgHourlyVolume || 0;
      },
      cacheManager.ttls.MARKET_STATS // 5 minutes
    );
  }

  /**
   * Get trending markets (highest volume spikes)
   * @param {number} limit - Number of markets to return
   * @returns {Promise<Array>} Trending markets
   */
  async getTrendingMarkets(limit = 10) {
    try {
      // Get all markets with activity in last hour
      const oneHourAgo = new Date(Date.now() - 3600000);

      const activeMarkets = await PolymarketTransaction.aggregate([
        {
          $match: {
            timestamp: { $gte: oneHourAgo }
          }
        },
        {
          $group: {
            _id: '$marketId',
            volume: { $sum: { $toDouble: '$makerAmountFilled' } }
          }
        },
        {
          $sort: { volume: -1 }
        },
        {
          $limit: limit * 2 // Get extra for filtering
        }
      ]);

      // Analyze each for volume spike
      const analyzed = await Promise.all(
        activeMarkets.map(async (market) => {
          const volumeSpike = await this.detectVolumeSpike(market._id);
          return {
            marketId: market._id,
            volume: market.volume,
            volumeSpike
          };
        })
      );

      // Filter and sort by spike percentage
      return analyzed
        .filter(m => m.volumeSpike.detected)
        .sort((a, b) => b.volumeSpike.percentage - a.volumeSpike.percentage)
        .slice(0, limit);
    } catch (err) {
      logger.error('[SentimentAnalyzer] Get trending markets error', {
        limit,
        error: err.message,
        stack: err.stack
      });
      return [];
    }
  }

  /**
   * Get analyzer statistics
   * @returns {Object} Stats
   */
  getStats() {
    return {
      ...this.stats,
      cacheHitRate: this.stats.cacheMisses > 0
        ? `${Math.round((this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses)) * 100)}%`
        : 'N/A',
      thresholds: this.thresholds
    };
  }

  /**
   * Clear sentiment caches
   */
  async clearCache() {
    await cacheManager.flush('sentiment:*');
    await cacheManager.flush('baseline:*');
    logger.info('[SentimentAnalyzer] Cache cleared');
  }
}

module.exports = new SentimentAnalyzer();
