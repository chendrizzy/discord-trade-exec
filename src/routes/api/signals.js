/**
 * Signal Quality API Routes
 *
 * Endpoints for signal quality analysis, provider leaderboards, and quality updates
 */

const express = require('express');
const router = express.Router();
const Trade = require('../../models/Trade');
const { ensureAuthenticated } = require('../../middleware/auth');
const { apiLimiter } = require('../../middleware/rateLimiter');
const signalQualityTracker = require('../../services/signal-quality-tracker');

// Apply rate limiting to all signal quality routes
router.use(apiLimiter);

/**
 * GET /api/signals/:signalId/quality
 * Get quality analysis for a specific signal/trade
 */
router.get('/:signalId/quality', ensureAuthenticated, async (req, res) => {
  try {
    const { signalId } = req.params;
    const {
      includeProviderStats = 'true',
      includePositionSizing = 'true'
    } = req.query;

    // Find the trade/signal
    const trade = await Trade.findById(signalId);
    if (!trade) {
      return res.status(404).json({
        success: false,
        error: 'Signal not found',
        message: `No signal found with ID: ${signalId}`
      });
    }

    // Check authorization - user can only view their own signals or if admin
    if (trade.userId !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized',
        message: 'You do not have permission to view this signal'
      });
    }

    // Analyze signal quality
    const qualityAnalysis = await signalQualityTracker.analyzeSignalQuality(trade, {
      includeProviderStats: includeProviderStats === 'true',
      includePositionSizing: includePositionSizing === 'true',
      context: {
        // Add any relevant market context here
        optimalTiming: false, // Could be enhanced with market hours check
        volatileMarket: false, // Could be enhanced with volatility index
        lowLiquidity: false    // Could be enhanced with volume data
      }
    });

    res.json({
      success: true,
      data: {
        signalId: trade._id,
        symbol: trade.symbol,
        side: trade.side,
        quality: qualityAnalysis.quality,
        smartMoney: qualityAnalysis.smartMoney,
        rareInformation: qualityAnalysis.rareInformation,
        provider: qualityAnalysis.provider,
        positionSizing: qualityAnalysis.positionSizing,
        timestamp: qualityAnalysis.timestamp
      }
    });
  } catch (error) {
    console.error('Error fetching signal quality:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze signal quality',
      message: error.message
    });
  }
});

/**
 * POST /api/signals/:signalId/quality/update
 * Recalculate and update quality analysis for a signal
 */
router.post('/:signalId/quality/update', ensureAuthenticated, async (req, res) => {
  try {
    const { signalId } = req.params;
    const { context = {}, riskParameters = {} } = req.body;

    // Find the trade/signal
    const trade = await Trade.findById(signalId);
    if (!trade) {
      return res.status(404).json({
        success: false,
        error: 'Signal not found',
        message: `No signal found with ID: ${signalId}`
      });
    }

    // Check authorization - user can only update their own signals or if admin
    if (trade.userId !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized',
        message: 'You do not have permission to update this signal'
      });
    }

    // Recalculate quality analysis
    const qualityAnalysis = await signalQualityTracker.analyzeSignalQuality(trade, {
      includeProviderStats: true,
      includePositionSizing: true,
      context,
      riskParameters
    });

    // Optionally store quality metrics in the trade document
    // (Would require adding fields to Trade model)
    trade.qualityTier = qualityAnalysis.quality.tier;
    trade.confidenceScore = qualityAnalysis.quality.confidence;
    trade.smartMoneyScore = qualityAnalysis.smartMoney.score;
    trade.rareInformationScore = qualityAnalysis.rareInformation.score;
    trade.qualityAnalyzedAt = new Date();
    await trade.save();

    res.json({
      success: true,
      data: {
        signalId: trade._id,
        updated: true,
        quality: qualityAnalysis.quality,
        smartMoney: qualityAnalysis.smartMoney,
        rareInformation: qualityAnalysis.rareInformation,
        timestamp: qualityAnalysis.timestamp
      },
      message: 'Signal quality updated successfully'
    });
  } catch (error) {
    console.error('Error updating signal quality:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update signal quality',
      message: error.message
    });
  }
});

/**
 * GET /api/providers/leaderboard
 * Get ranked provider leaderboard based on signal quality
 */
router.get('/providers/leaderboard', ensureAuthenticated, async (req, res) => {
  try {
    const {
      timeRange = '30d',
      minSignals = '10',
      limit = '50'
    } = req.query;

    // Validate parameters
    const validTimeRanges = ['7d', '30d', '90d', 'all'];
    if (!validTimeRanges.includes(timeRange)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid time range',
        message: `Time range must be one of: ${validTimeRanges.join(', ')}`
      });
    }

    const minSignalsNum = parseInt(minSignals, 10);
    const limitNum = parseInt(limit, 10);

    if (isNaN(minSignalsNum) || minSignalsNum < 1 || minSignalsNum > 100) {
      return res.status(400).json({
        success: false,
        error: 'Invalid minSignals',
        message: 'minSignals must be between 1 and 100'
      });
    }

    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        success: false,
        error: 'Invalid limit',
        message: 'limit must be between 1 and 100'
      });
    }

    // Generate leaderboard
    const leaderboard = await signalQualityTracker.getProviderLeaderboard({
      timeRange,
      minSignals: minSignalsNum,
      limit: limitNum
    });

    res.json({
      success: true,
      data: {
        leaderboard,
        filters: {
          timeRange,
          minSignals: minSignalsNum,
          limit: limitNum
        },
        count: leaderboard.length,
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('Error fetching provider leaderboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate provider leaderboard',
      message: error.message
    });
  }
});

/**
 * GET /api/signals/quality/stats
 * Get overall signal quality statistics
 */
router.get('/quality/stats', ensureAuthenticated, async (req, res) => {
  try {
    const { timeRange = '30d' } = req.query;

    // Calculate time range
    const startDate = new Date();
    if (timeRange === '7d') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (timeRange === '30d') {
      startDate.setDate(startDate.getDate() - 30);
    } else if (timeRange === '90d') {
      startDate.setDate(startDate.getDate() - 90);
    } else {
      startDate.setFullYear(startDate.getFullYear() - 1);
    }

    // Aggregate quality statistics
    const stats = await Trade.aggregate([
      {
        $match: {
          entryTime: { $gte: startDate },
          qualityTier: { $exists: true }
        }
      },
      {
        $group: {
          _id: '$qualityTier',
          count: { $sum: 1 },
          avgConfidence: { $avg: '$confidenceScore' },
          avgSmartMoney: { $avg: '$smartMoneyScore' },
          avgRareInfo: { $avg: '$rareInformationScore' },
          totalReturn: { $sum: '$profitLoss' }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Calculate totals
    const totals = {
      totalSignals: stats.reduce((sum, s) => sum + s.count, 0),
      totalReturn: stats.reduce((sum, s) => sum + (s.totalReturn || 0), 0)
    };

    res.json({
      success: true,
      data: {
        byTier: stats.map(s => ({
          tier: s._id,
          count: s.count,
          avgConfidence: Math.round(s.avgConfidence * 100) / 100,
          avgSmartMoney: Math.round(s.avgSmartMoney * 100) / 100,
          avgRareInfo: Math.round(s.avgRareInfo * 100) / 100,
          totalReturn: Math.round(s.totalReturn * 100) / 100,
          percentage: totals.totalSignals > 0 ? Math.round((s.count / totals.totalSignals) * 10000) / 100 : 0
        })),
        totals,
        timeRange,
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('Error fetching quality stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch quality statistics',
      message: error.message
    });
  }
});

/**
 * GET /api/providers/:providerId/quality
 * Get quality analysis for all signals from a specific provider
 */
router.get('/providers/:providerId/quality', ensureAuthenticated, async (req, res) => {
  try {
    const { providerId } = req.params;
    const {
      limit = '20',
      offset = '0'
    } = req.query;

    const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
    const offsetNum = Math.max(parseInt(offset, 10) || 0, 0);

    // Get provider stats
    const providerStats = await signalQualityTracker.getProviderStats(providerId);

    // Get recent signals with quality data
    const signals = await Trade.find({
      userId: providerId,
      qualityTier: { $exists: true }
    })
      .sort({ entryTime: -1 })
      .limit(limitNum)
      .skip(offsetNum)
      .select('symbol side entryPrice exitPrice profitLoss qualityTier confidenceScore smartMoneyScore entryTime');

    // Count total signals
    const totalSignals = await Trade.countDocuments({
      userId: providerId,
      qualityTier: { $exists: true }
    });

    res.json({
      success: true,
      data: {
        provider: {
          id: providerId,
          stats: providerStats
        },
        signals: signals.map(s => ({
          id: s._id,
          symbol: s.symbol,
          side: s.side,
          entryPrice: s.entryPrice,
          exitPrice: s.exitPrice,
          profitLoss: s.profitLoss,
          quality: {
            tier: s.qualityTier,
            confidence: s.confidenceScore,
            smartMoney: s.smartMoneyScore
          },
          entryTime: s.entryTime
        })),
        pagination: {
          total: totalSignals,
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + limitNum < totalSignals
        }
      }
    });
  } catch (error) {
    console.error('Error fetching provider quality:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch provider quality data',
      message: error.message
    });
  }
});

module.exports = router;
