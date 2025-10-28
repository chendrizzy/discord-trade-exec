/**
 * Trader Dashboard API Routes
 *
 * API endpoints for personal trader dashboard.
 * All routes require authentication via requireTrader middleware.
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const requireTrader = require('../../middleware/requireTrader');
const { overviewLimiter, analyticsLimiter, tradesLimiter, dashboardLimiter } = require('../../middleware/rateLimiter');
const redis = require('../../services/redis');
const BillingProviderFactory = require('../../services/billing/BillingProviderFactory');
const logger = require('../../utils/logger');
const { validate } = require('../../middleware/validation');
const { AppError, ErrorCodes } = require('../../middleware/errorHandler');
const {
  followSignalParams,
  followSignalBody,
  overviewQuery,
  signalsQuery,
  tradesQuery,
  analyticsPerformanceQuery,
  updateRiskProfileBody,
  updateNotificationsBody
} = require('../../validators/trader.validators');

// Apply trader authorization to all routes
router.use(requireTrader);

/**
 * GET /api/trader/overview
 * Get personal trader overview with metrics
 *
 * Rate Limit: 100 requests/minute (Constitution Principle V)
 *
 * Returns:
 * - Personal P&L and statistics
 * - Active positions count
 * - Execution rate
 * - Top followed signal providers
 * - Recent trade history
 */
router.get('/overview', overviewLimiter, validate(overviewQuery, 'query'), async (req, res) => {
  try {
    const user = req.user;
    const userId = user._id;
    const tenantId = user.communityId; // Constitution Principle I: MUST include tenant scoping

    // Time boundaries
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Import models
    const Trade = require('../../models/Trade');
    const SignalProvider = require('../../models/SignalProvider');
    const UserSignalSubscription = require('../../models/UserSignalSubscription');

    // Personal P&L aggregation (tenant-scoped)
    const [allTimePnL, todayPnL, weekPnL, monthPnL] = await Promise.all([
      Trade.aggregate([
        {
          $match: {
            communityId: tenantId,
            userId,
            status: { $in: ['FILLED', 'PARTIAL'] }
          }
        },
        {
          $group: {
            _id: null,
            totalPnL: { $sum: '$profitLoss' },
            totalTrades: { $sum: 1 },
            successfulTrades: {
              $sum: { $cond: [{ $gt: ['$profitLoss', 0] }, 1, 0] }
            }
          }
        }
      ]),
      Trade.aggregate([
        {
          $match: {
            communityId: tenantId,
            userId,
            status: { $in: ['FILLED', 'PARTIAL'] },
            entryTime: { $gte: todayStart }
          }
        },
        {
          $group: {
            _id: null,
            totalPnL: { $sum: '$profitLoss' }
          }
        }
      ]),
      Trade.aggregate([
        {
          $match: {
            communityId: tenantId,
            userId,
            status: { $in: ['FILLED', 'PARTIAL'] },
            entryTime: { $gte: weekStart }
          }
        },
        {
          $group: {
            _id: null,
            totalPnL: { $sum: '$profitLoss' }
          }
        }
      ]),
      Trade.aggregate([
        {
          $match: {
            communityId: tenantId,
            userId,
            status: { $in: ['FILLED', 'PARTIAL'] },
            entryTime: { $gte: monthStart }
          }
        },
        {
          $group: {
            _id: null,
            totalPnL: { $sum: '$profitLoss' }
          }
        }
      ])
    ]);

    const allTimeStats = allTimePnL[0] || { totalPnL: 0, totalTrades: 0, successfulTrades: 0 };
    const winRate = allTimeStats.totalTrades > 0 ? (allTimeStats.successfulTrades / allTimeStats.totalTrades) * 100 : 0;

    // Active positions (OPEN trades)
    const activePositions = await Trade.find({
      communityId: tenantId,
      userId,
      status: 'OPEN'
    }).lean();

    const avgSize =
      activePositions.length > 0
        ? activePositions.reduce((sum, t) => sum + t.quantity * t.entryPrice, 0) / activePositions.length
        : 0;

    const totalExposure = activePositions.reduce((sum, t) => sum + t.quantity * t.entryPrice, 0);
    const largestPosition =
      activePositions.length > 0 ? Math.max(...activePositions.map(t => t.quantity * t.entryPrice)) : 0;

    // Execution rate (signals received vs executed)
    const subscriptions = await UserSignalSubscription.find({
      communityId: tenantId,
      userId,
      active: true
    }).lean();

    const totalSignalsReceived = subscriptions.reduce((sum, sub) => sum + sub.stats.signalsReceived, 0);
    const totalSignalsExecuted = subscriptions.reduce((sum, sub) => sum + sub.stats.signalsExecuted, 0);
    const executionRate = totalSignalsReceived > 0 ? (totalSignalsExecuted / totalSignalsReceived) * 100 : 0;

    const failedTrades = await Trade.countDocuments({
      communityId: tenantId,
      userId,
      status: 'FAILED'
    });

    // Top followed providers
    const followedProviders = await UserSignalSubscription.find({
      communityId: tenantId,
      userId,
      active: true
    })
      .populate('providerId')
      .sort({ 'stats.totalPnL': -1 })
      .limit(3)
      .lean();

    // US2-T04: Optimize N+1 query - single aggregation for all providers' weekly P&L
    const providerIds = followedProviders.map(sub => sub.providerId._id);

    const weekPnLByProvider = await Trade.aggregate([
      {
        $match: {
          communityId: tenantId,
          userId,
          'signalSource.providerId': { $in: providerIds },
          entryTime: { $gte: weekStart },
          status: { $in: ['FILLED', 'PARTIAL'] }
        }
      },
      {
        $group: {
          _id: '$signalSource.providerId',
          totalPnL: { $sum: '$profitLoss' }
        }
      }
    ]);

    // Create lookup map for O(1) access
    const pnlMap = new Map(weekPnLByProvider.map(item => [item._id.toString(), item.totalPnL]));

    const following = followedProviders.map(sub => ({
      id: sub.providerId._id.toString(),
      name: sub.providerId.name,
      performanceThisWeek: pnlMap.get(sub.providerId._id.toString()) || 0,
      signalsReceived: sub.stats.signalsReceived,
      tradesExecuted: sub.stats.signalsExecuted
    }));

    // Recent trades
    const recentTrades = await Trade.find({
      communityId: tenantId,
      userId,
      status: { $in: ['FILLED', 'PARTIAL'] }
    })
      .sort({ entryTime: -1 })
      .limit(10)
      .lean();

    const recentTradesFormatted = recentTrades.map(trade => ({
      id: trade._id.toString(),
      symbol: trade.symbol,
      side: trade.side.toLowerCase(),
      size: trade.quantity,
      entryPrice: trade.entryPrice,
      exitPrice: trade.exitPrice,
      pnl: trade.profitLoss,
      pnlPercent: trade.profitLossPercentage,
      timestamp: trade.entryTime
    }));

    const overview = {
      personal: {
        totalPnL: allTimeStats.totalPnL,
        totalPnLPercent: 0, // TODO: Calculate based on initial capital
        todayPnL: todayPnL[0]?.totalPnL || 0,
        weekPnL: weekPnL[0]?.totalPnL || 0,
        monthPnL: monthPnL[0]?.totalPnL || 0,
        winRate,
        totalTrades: allTimeStats.totalTrades,
        successfulTrades: allTimeStats.successfulTrades
      },
      positions: {
        active: activePositions.length,
        avgSize,
        totalExposure,
        largestPosition
      },
      execution: {
        rate: executionRate,
        avgSlippage: 0, // TODO: Calculate from trade execution data
        avgLatency: 0, // TODO: Calculate from trade execution timestamps
        failedSignals: failedTrades
      },
      following,
      recentTrades: recentTradesFormatted
    };

    res.json(overview);
  } catch (error) {

    logger.error('[Trader API] Error fetching overview:', {

      error: error.message,


      correlationId: req.correlationId

    });

    throw new AppError(

      'Operation failed',

      500,

      ErrorCodes.INTERNAL_SERVER_ERROR

    );

  }
});

/**
 * GET /api/trader/signals
 * Get available signal providers from community (community-scoped)
 *
 * Rate Limit: 100 requests/minute (Constitution Principle V)
 *
 * Query params:
 * - filter: Filter type (all, following, available)
 * - sortBy: Sort by (winRate, followers, signals)
 * - minWinRate: Minimum win rate filter
 */
router.get('/signals', dashboardLimiter, validate(signalsQuery, 'query'), async (req, res) => {
  try {
    const { filter = 'all', sortBy = 'winRate', minWinRate } = req.query;
    const user = req.user;
    const userId = user._id;
    const tenantId = user.communityId; // Constitution Principle I: MUST include tenant scoping

    // Time boundaries
    const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Import models
    const SignalProvider = require('../../models/SignalProvider');
    const Signal = require('../../models/Signal');
    const UserSignalSubscription = require('../../models/UserSignalSubscription');
    const Trade = require('../../models/Trade');

    // Build provider query (tenant-scoped)
    const providerQuery = {
      communityId: tenantId,
      enabled: true,
      verificationStatus: 'verified'
    };

    // Apply minimum win rate filter
    if (minWinRate) {
      providerQuery['performance.winRate'] = { $gte: parseFloat(minWinRate) };
    }

    // Determine sort criteria
    let sort = {};
    switch (sortBy) {
      case 'followers':
        sort = { 'stats.followerCount': -1 };
        break;
      case 'signals':
        sort = { 'stats.signalCount': -1 };
        break;
      case 'winRate':
      default:
        sort = { 'performance.winRate': -1 };
        break;
    }

    // Fetch providers
    const providers = await SignalProvider.find(providerQuery).sort(sort).lean();

    // Get user's subscriptions
    const subscriptions = await UserSignalSubscription.find({
      communityId: tenantId,
      userId,
      active: true
    })
      .select('providerId')
      .lean();

    const followedProviderIds = new Set(subscriptions.map(sub => sub.providerId.toString()));

    // US2-T04: Optimize N+1 queries - aggregate all stats in parallel batches
    const providerIds = providers.map(p => p._id);

    // Batch 1: Signal counts (2 aggregations instead of 2N queries)
    const [signalStatsAll, signalStatsWeek] = await Promise.all([
      Signal.aggregate([
        {
          $match: {
            communityId: tenantId,
            providerId: { $in: providerIds }
          }
        },
        {
          $group: {
            _id: '$providerId',
            count: { $sum: 1 }
          }
        }
      ]),
      Signal.aggregate([
        {
          $match: {
            communityId: tenantId,
            providerId: { $in: providerIds },
            createdAt: { $gte: weekStart }
          }
        },
        {
          $group: {
            _id: '$providerId',
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    // Batch 2: Follower counts (1 aggregation instead of N queries)
    const followerStats = await UserSignalSubscription.aggregate([
      {
        $match: {
          communityId: tenantId,
          providerId: { $in: providerIds },
          active: true
        }
      },
      {
        $group: {
          _id: '$providerId',
          count: { $sum: 1 }
        }
      }
    ]);

    // Batch 3: Trade performance (3 aggregations with $facet instead of 3N queries)
    const tradePerf = await Trade.aggregate([
      {
        $match: {
          communityId: tenantId,
          'signalSource.providerId': { $in: providerIds },
          status: { $in: ['FILLED', 'PARTIAL'] }
        }
      },
      {
        $facet: {
          week: [
            { $match: { entryTime: { $gte: weekStart } } },
            { $group: { _id: '$signalSource.providerId', totalPnL: { $sum: '$profitLoss' } } }
          ],
          month: [
            { $match: { entryTime: { $gte: monthStart } } },
            { $group: { _id: '$signalSource.providerId', totalPnL: { $sum: '$profitLoss' } } }
          ],
          allTime: [{ $group: { _id: '$signalSource.providerId', totalPnL: { $sum: '$profitLoss' } } }]
        }
      }
    ]);

    // Create lookup maps for O(1) access
    const signalTotalMap = new Map(signalStatsAll.map(s => [s._id.toString(), s.count]));
    const signalWeekMap = new Map(signalStatsWeek.map(s => [s._id.toString(), s.count]));
    const followerMap = new Map(followerStats.map(f => [f._id.toString(), f.count]));
    const weekPerfMap = new Map(tradePerf[0].week.map(t => [t._id.toString(), t.totalPnL]));
    const monthPerfMap = new Map(tradePerf[0].month.map(t => [t._id.toString(), t.totalPnL]));
    const allTimePerfMap = new Map(tradePerf[0].allTime.map(t => [t._id.toString(), t.totalPnL]));

    // Map providers with pre-computed stats (no more queries in loop!)
    const providersWithDetails = providers.map(provider => {
      const isFollowing = followedProviderIds.has(provider._id.toString());
      const providerId = provider._id.toString();

      // Apply filter
      if (filter === 'following' && !isFollowing) return null;
      if (filter === 'available' && isFollowing) return null;

      return {
        id: providerId,
        name: provider.name,
        description: provider.description || '',
        channelId: provider.discordChannelId,
        stats: {
          totalSignals: signalTotalMap.get(providerId) || 0,
          winRate: provider.performance?.winRate || 0,
          avgPnL: provider.performance?.avgPnL || 0,
          followers: followerMap.get(providerId) || 0,
          signalsThisWeek: signalWeekMap.get(providerId) || 0
        },
        performance: {
          week: weekPerfMap.get(providerId) || 0,
          month: monthPerfMap.get(providerId) || 0,
          allTime: allTimePerfMap.get(providerId) || 0
        },
        following: isFollowing
      };
    });

    // Filter out nulls (from filter application)
    const filteredProviders = providersWithDetails.filter(p => p !== null);

    res.json({ providers: filteredProviders });
  } catch (error) {

    logger.error('[Trader API] Error fetching signal providers:', {

      error: error.message,


      correlationId: req.correlationId

    });

    throw new AppError(

      'Operation failed',

      500,

      ErrorCodes.INTERNAL_SERVER_ERROR

    );

  }
});

/**
 * POST /api/trader/signals/:id/follow
 * Follow or unfollow a signal provider
 *
 * Body:
 * - following: Boolean (true to follow, false to unfollow)
 * - autoExecute: Boolean (optional, auto-execute signals from this provider)
 */
router.post('/signals/:id/follow', validate(followSignalParams, 'params'), validate(followSignalBody, 'body'), async (req, res) => {
  try {
    const { id: providerId } = req.params;
    const { following, autoExecute = false } = req.body;
    const user = req.user;
    const userId = user._id;
    const tenantId = user.communityId; // Constitution Principle I: MUST include tenant scoping

    // Import models
    const SignalProvider = require('../../models/SignalProvider');
    const UserSignalSubscription = require('../../models/UserSignalSubscription');

    // Validate provider exists and is in user's community
    const provider = await SignalProvider.findOne({
      _id: providerId,
      communityId: tenantId,
      enabled: true
    });

    if (!provider) {
      return res.status(404).json({ error: 'Signal provider not found in your community' });
    }

    if (following) {
      // Follow provider - create or update subscription
      let subscription = await UserSignalSubscription.findOne({
        communityId: tenantId,
        userId,
        providerId
      });

      if (subscription) {
        // Update existing subscription
        subscription.active = true;
        subscription.autoExecute = autoExecute;
        await subscription.save();
      } else {
        // Create new subscription
        subscription = await UserSignalSubscription.create({
          communityId: tenantId,
          userId,
          providerId,
          active: true,
          autoExecute,
          stats: {
            signalsReceived: 0,
            signalsExecuted: 0,
            totalPnL: 0
          }
        });
      }

      logger.info('[Trader API] User followed signal provider', {
        userId,
        username: user.discordUsername,
        providerId,
        providerName: provider.name,
        autoExecute
      });

      res.json({
        success: true,
        message: 'Successfully followed signal provider',
        provider: {
          id: provider._id.toString(),
          name: provider.name,
          following: true,
          autoExecute
        }
      });
    } else {
      // Unfollow provider - mark subscription inactive
      const subscription = await UserSignalSubscription.findOne({
        communityId: tenantId,
        userId,
        providerId
      });

      if (subscription) {
        subscription.active = false;
        await subscription.save();

        logger.info('[Trader API] User unfollowed signal provider', {
          userId,
          username: user.discordUsername,
          providerId,
          providerName: provider.name
        });
      }

      res.json({
        success: true,
        message: 'Successfully unfollowed signal provider',
        provider: {
          id: provider._id.toString(),
          name: provider.name,
          following: false
        }
      });
    }
  } catch (error) {
    logger.error('[Trader API] Error updating signal subscription:', { error: error.message });

    // Handle duplicate key errors (shouldn't happen with findOne first, but defensive)
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Subscription already exists' });
    }

    res.status(500).json({ error: 'Failed to update signal subscription' });
  }
});

/**
 * GET /api/trader/trades
 * Get personal trade history with pagination and filters
 *
 * Rate Limit: 50 requests/minute (Constitution Principle V)
 *
 * Query params:
 * - page: Page number (default: 1)
 * - limit: Results per page (default: 25)
 * - startDate: Filter by start date
 * - endDate: Filter by end date
 * - symbol: Filter by symbol
 * - side: Filter by side (buy/sell)
 */
router.get('/trades', tradesLimiter, validate(tradesQuery, 'query'), async (req, res) => {
  try {
    const { page = 1, limit = 25, startDate, endDate, symbol, side } = req.query;
    const skip = (page - 1) * limit;
    const user = req.user;
    const userId = user._id;
    const tenantId = user.communityId; // Constitution Principle I: MUST include tenant scoping

    // Import models
    const Trade = require('../../models/Trade');
    const SignalProvider = require('../../models/SignalProvider');

    // Build query (tenant-scoped)
    const query = {
      communityId: tenantId,
      userId
    };

    // Apply filters
    if (startDate || endDate) {
      query.entryTime = {};
      if (startDate) query.entryTime.$gte = new Date(startDate);
      if (endDate) query.entryTime.$lte = new Date(endDate);
    }
    if (symbol) query.symbol = symbol;
    if (side) query.side = side.toUpperCase();

    // Execute query with pagination
    const [trades, total] = await Promise.all([
      Trade.find(query).sort({ entryTime: -1 }).skip(skip).limit(parseInt(limit)).lean(),
      Trade.countDocuments(query)
    ]);

    // US2-T04: Optimize N+1 query - batch fetch all provider names
    const providerIds = trades
      .filter(t => t.signalSource && t.signalSource.providerId)
      .map(t => t.signalSource.providerId);

    const providers = await SignalProvider.find({
      _id: { $in: providerIds }
    })
      .select('_id name')
      .lean();

    // Create provider lookup map for O(1) access
    const providerMap = new Map(providers.map(p => [p._id.toString(), p.name]));

    // Map trades with provider names (no queries in loop!)
    const tradesWithProviders = trades.map(trade => {
      let providerName = 'Unknown';

      if (trade.signalSource && trade.signalSource.providerId) {
        providerName = providerMap.get(trade.signalSource.providerId.toString()) || 'Unknown';
      }

      return {
        id: trade._id.toString(),
        symbol: trade.symbol,
        side: trade.side.toLowerCase(),
        size: trade.quantity,
        entryPrice: trade.entryPrice,
        exitPrice: trade.exitPrice,
        pnl: trade.profitLoss,
        pnlPercent: trade.profitLossPercentage,
        fee: trade.fees.total,
        broker: trade.exchange,
        provider: providerName,
        status: trade.status === 'OPEN' ? 'open' : 'closed',
        openedAt: trade.entryTime,
        closedAt: trade.exitTime
      };
    });

    res.json({
      trades: tradesWithProviders,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {

    logger.error('[Trader API] Error fetching trades:', {

      error: error.message,


      correlationId: req.correlationId

    });

    throw new AppError(

      'Operation failed',

      500,

      ErrorCodes.INTERNAL_SERVER_ERROR

    );

  }
});

/**
 * GET /api/trader/analytics/performance
 * Get personal performance analytics with caching
 *
 * Rate Limit: 20 requests/minute (Constitution Principle V)
 *
 * Query params:
 * - startDate: Start date (ISO format)
 * - endDate: End date (ISO format)
 * - groupBy: Grouping period (day, week, month)
 */
router.get('/analytics/performance', analyticsLimiter, validate(analyticsPerformanceQuery, 'query'), async (req, res) => {
  try {
    const { startDate, endDate, groupBy = 'day' } = req.query;
    const user = req.user;
    const userId = user._id;
    const tenantId = user.communityId; // Constitution Principle I: MUST include tenant scoping

    // Generate cache key
    const cacheKey = `trader:analytics:${userId}:${startDate}:${endDate}:${groupBy}`;

    // Use Redis cache with 5-minute TTL (Constitution Principle VII)
    const data = await redis.getOrCompute(cacheKey, async () => {
      const Trade = require('../../models/Trade');

      // Parse date range
      const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate) : new Date();

      // Determine date grouping format
      let dateFormat;
      switch (groupBy) {
        case 'week':
          dateFormat = '%Y-W%V'; // ISO week
          break;
        case 'month':
          dateFormat = '%Y-%m';
          break;
        case 'day':
        default:
          dateFormat = '%Y-%m-%d';
          break;
      }

      // Aggregation pipeline (tenant-scoped)
      const performance = await Trade.aggregate([
        {
          $match: {
            communityId: tenantId,
            userId,
            entryTime: { $gte: start, $lte: end },
            status: { $in: ['FILLED', 'PARTIAL'] }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: dateFormat, date: '$entryTime' } },
            pnl: { $sum: '$profitLoss' },
            trades: { $sum: 1 },
            successfulTrades: {
              $sum: { $cond: [{ $gt: ['$profitLoss', 0] }, 1, 0] }
            }
          }
        },
        {
          $sort: { _id: 1 }
        },
        {
          $project: {
            date: '$_id',
            pnl: 1,
            trades: 1,
            winRate: {
              $cond: [
                { $gt: ['$trades', 0] },
                { $multiply: [{ $divide: ['$successfulTrades', '$trades'] }, 100] },
                0
              ]
            }
          }
        }
      ]);

      // Calculate summary statistics
      const totalPnL = performance.reduce((sum, day) => sum + day.pnl, 0);
      const totalTrades = performance.reduce((sum, day) => sum + day.trades, 0);
      const avgWinRate = performance.length > 0
        ? performance.reduce((sum, day) => sum + day.winRate, 0) / performance.length
        : 0;

      const bestDay = performance.length > 0
        ? performance.reduce((best, day) => day.pnl > best.pnl ? day : best, performance[0])
        : null;

      const worstDay = performance.length > 0
        ? performance.reduce((worst, day) => day.pnl < worst.pnl ? day : worst, performance[0])
        : null;

      return {
        performance: performance.map(({ _id, ...rest }) => ({
          date: rest.date,
          pnl: rest.pnl,
          trades: rest.trades,
          winRate: rest.winRate
        })),
        summary: {
          totalPnL,
          totalTrades,
          avgWinRate,
          bestDay: bestDay?.date || null,
          worstDay: worstDay?.date || null
        }
      };
    }, 300); // 5-minute cache per Constitution Principle VII

    res.json(data);
  } catch (error) {

    logger.error('[Trader API] Error fetching analytics:', {

      error: error.message,


      correlationId: req.correlationId

    });

    throw new AppError(

      'Operation failed',

      500,

      ErrorCodes.INTERNAL_SERVER_ERROR

    );

  }
});

/**
 * GET /api/trader/risk-profile
 * Retrieve trader's risk management settings
 *
 * Rate Limit: 100 requests/minute (Constitution Principle V)
 */
router.get('/risk-profile', dashboardLimiter, async (req, res) => {
  try {
    const User = require('../../models/User');
    const user = await User.findById(req.user._id)
      .select('tradingConfig.riskManagement')
      .lean();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const risk = user.tradingConfig?.riskManagement || {};
    const positionSizingMethod = risk.positionSizingMethod || 'risk_based';

    const response = {
      positionSizingMode: positionSizingMethod === 'fixed' ? 'fixed' : 'percentage',
      positionSizePercent: Math.round(((risk.maxPositionSize ?? 0.02) * 100) * 10) / 10,
      positionSizeFixed: risk.fixedPositionSize ?? 1000,
      maxPositionSize: Math.round(((risk.maxPositionSize ?? 0.02) * 100) * 10) / 10,
      defaultStopLoss: Math.round(((risk.defaultStopLoss ?? 0.02) * 100) * 10) / 10,
      defaultTakeProfit: Math.round(((risk.defaultTakeProfit ?? 0.04) * 100) * 10) / 10,
      maxDailyLoss: Math.round(((risk.maxDailyLoss ?? 0.05) * 100) * 10) / 10,
      maxOpenPositions: risk.maxOpenPositions ?? 3,
      useTrailingStop: risk.useTrailingStop ?? false,
      trailingStopPercent: Math.round(((risk.trailingStopPercent ?? 0.015) * 100) * 10) / 10
    };

    res.json({
      success: true,
      data: response
    });
  } catch (error) {

    logger.error('[Trader API] Error fetching risk profile:', {

      error: error.message,


      correlationId: req.correlationId

    });

    throw new AppError(

      'Operation failed',

      500,

      ErrorCodes.INTERNAL_SERVER_ERROR

    );

  }
});

/**
 * PUT /api/trader/risk-profile
 * Update trader's risk management settings with validation
 *
 * Accepts both percentage-based and fixed sizing payloads from dashboard UI.
 *
 * Rate Limit: 100 requests/minute
 */
router.put('/risk-profile', dashboardLimiter, validate(updateRiskProfileBody, 'body'), async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      positionSizingMode,
      positionSizingMethod,
      positionSizing,
      positionSizePercent,
      positionSizeFixed,
      maxPositionSize,
      defaultStopLoss,
      defaultTakeProfit,
      maxDailyLoss,
      maxOpenPositions,
      useTrailingStop,
      trailingStopPercent
    } = req.body;

    // Import models
    const User = require('../../models/User');

    const requestedMode = positionSizingMode ?? positionSizing;
    const resolvedPositionSizingMethod =
      positionSizingMethod ||
      (requestedMode === 'fixed' ? 'fixed' : 'risk_based');

    const percentageToDecimal = value =>
      value !== undefined ? Math.round((Number(value) / 100) * 10000) / 10000 : undefined;

    const decimalToPercentage = value =>
      value !== undefined ? Math.round(Number(value) * 1000) / 10 : undefined;

    // Validation helper
    const validateRange = (value, min, max, name) => {
      if (value !== undefined && (value < min || value > max)) {
        throw new Error(`${name} must be between ${min} and ${max}`);
      }
    };

    // Validate inputs
    if (resolvedPositionSizingMethod && !['fixed', 'risk_based', 'kelly'].includes(resolvedPositionSizingMethod)) {
      return res.status(400).json({
        error: 'Invalid positionSizingMethod. Must be: fixed, risk_based, or kelly'
      });
    }

    try {
      const maxPositionSizeDecimal = percentageToDecimal(
        maxPositionSize !== undefined ? maxPositionSize : positionSizePercent
      );
      const defaultStopLossDecimal = percentageToDecimal(defaultStopLoss);
      const defaultTakeProfitDecimal = percentageToDecimal(defaultTakeProfit);
      const maxDailyLossDecimal = percentageToDecimal(maxDailyLoss);
      const trailingStopDecimal = percentageToDecimal(trailingStopPercent);

      validateRange(maxPositionSizeDecimal, 0.005, 0.1, 'maxPositionSize');
      validateRange(defaultStopLossDecimal, 0.01, 0.1, 'defaultStopLoss');
      validateRange(defaultTakeProfitDecimal, 0.02, 0.2, 'defaultTakeProfit');
      validateRange(maxDailyLossDecimal, 0.02, 0.2, 'maxDailyLoss');
      validateRange(trailingStopDecimal, 0.005, 0.05, 'trailingStopPercent');

      if (maxOpenPositions !== undefined && (maxOpenPositions < 1 || maxOpenPositions > 10)) {
        throw new Error('maxOpenPositions must be between 1 and 10');
      }
    } catch (validationError) {
      return res.status(400).json({ error: validationError.message });
    }

    // Get current user with full tradingConfig
    const currentUser = await User.findById(userId);
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Build update object (only update provided fields)
    const updates = {};

    if (resolvedPositionSizingMethod !== undefined) {
      updates['tradingConfig.riskManagement.positionSizingMethod'] = resolvedPositionSizingMethod;
    }
    if (positionSizeFixed !== undefined) {
      updates['tradingConfig.riskManagement.fixedPositionSize'] = positionSizeFixed;
    }
    if (maxPositionSize !== undefined) {
      updates['tradingConfig.riskManagement.maxPositionSize'] = percentageToDecimal(maxPositionSize);
    } else if (positionSizePercent !== undefined) {
      updates['tradingConfig.riskManagement.maxPositionSize'] = percentageToDecimal(positionSizePercent);
    }
    if (defaultStopLoss !== undefined) {
      updates['tradingConfig.riskManagement.defaultStopLoss'] = percentageToDecimal(defaultStopLoss);
    }
    if (defaultTakeProfit !== undefined) {
      updates['tradingConfig.riskManagement.defaultTakeProfit'] = percentageToDecimal(defaultTakeProfit);
    }
    if (maxDailyLoss !== undefined) {
      updates['tradingConfig.riskManagement.maxDailyLoss'] = percentageToDecimal(maxDailyLoss);
    }
    if (maxOpenPositions !== undefined) {
      updates['tradingConfig.riskManagement.maxOpenPositions'] = maxOpenPositions;
    }
    if (useTrailingStop !== undefined) {
      updates['tradingConfig.riskManagement.useTrailingStop'] = useTrailingStop;
    }
    if (trailingStopPercent !== undefined) {
      updates['tradingConfig.riskManagement.trailingStopPercent'] = percentageToDecimal(trailingStopPercent);
    }

    // Update user's risk management config
    await User.findByIdAndUpdate(userId, { $set: updates }, { new: true, runValidators: true });

    // Fetch updated config for response
    const updatedUser = await User.findById(userId)
      .select('tradingConfig.riskManagement')
      .lean();

    logger.info('[Trader API] Risk profile updated', {
      userId,
      username: req.user.discordUsername,
      riskTolerance: updates.riskTolerance,
      maxPositionSize: updates.maxPositionSize
    });

    const updatedRisk = updatedUser.tradingConfig.riskManagement;

    res.json({
      success: true,
      message: 'Risk profile updated successfully',
      riskProfile: {
        positionSizingMode: resolvedPositionSizingMethod === 'fixed' ? 'fixed' : 'percentage',
        positionSizePercent: decimalToPercentage(updatedRisk.maxPositionSize) ?? 0,
        positionSizeFixed: updatedRisk.fixedPositionSize ?? 1000,
        maxPositionSize: decimalToPercentage(updatedRisk.maxPositionSize) ?? 0,
        defaultStopLoss: decimalToPercentage(updatedRisk.defaultStopLoss) ?? 0,
        defaultTakeProfit: decimalToPercentage(updatedRisk.defaultTakeProfit) ?? 0,
        maxDailyLoss: decimalToPercentage(updatedRisk.maxDailyLoss) ?? 0,
        maxOpenPositions: updatedRisk.maxOpenPositions ?? 3,
        useTrailingStop: updatedRisk.useTrailingStop ?? false,
        trailingStopPercent: decimalToPercentage(updatedRisk.trailingStopPercent) ?? 0
      }
    });
  } catch (error) {
    logger.error('[Trader API] Error updating risk profile:', { error: error.message });

    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({
        error: 'Validation failed',
        details: errors
      });
    }

    res.status(500).json({ error: 'Failed to update risk profile' });
  }
});

/**
 * PUT /api/trader/notifications
 * Update notification preferences
 *
 * Body:
 * - discordDM: Enable Discord DM notifications
 * - email: Enable email notifications
 * - alertThresholds: Alert threshold settings
 *   - profitTarget: Threshold for profit alerts (percentage)
 *   - lossLimit: Threshold for loss alerts (percentage)
 *   - positionSize: Alert when position size exceeds threshold
 */
router.get('/notifications', dashboardLimiter, async (req, res) => {
  try {
    const User = require('../../models/User');
    const user = await User.findById(req.user._id)
      .select('preferences.notifications preferences.notificationHistory')
      .lean();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const settings = user.preferences?.notifications || {};
    const history = user.preferences?.notificationHistory || [];

    res.json({
      success: true,
      data: {
        settings: {
          discordEnabled: settings.discordEnabled ?? true,
          emailEnabled: settings.emailEnabled ?? false,
          notifyOnTrade: settings.notifyOnTrade ?? true,
          notifyOnProfit: settings.notifyOnProfit ?? true,
          notifyOnLoss: settings.notifyOnLoss ?? true,
          notifyOnDailyLimit: settings.notifyOnDailyLimit ?? true,
          notifyOnPositionSize: settings.notifyOnPositionSize ?? false,
          dailyLossThreshold: settings.dailyLossThreshold ?? 500,
          positionSizeThreshold: settings.positionSizeThreshold ?? 1000,
          profitThreshold: settings.profitThreshold ?? 100
        },
        history: history.slice(-20).map(entry => ({
          id: entry.id,
          type: entry.type,
          channel: entry.channel,
          message: entry.message,
          sentAt: entry.sentAt,
          status: entry.status
        }))
      }
    });
  } catch (error) {

    logger.error('[Trader API] Error fetching notification preferences:', {

      error: error.message,


      correlationId: req.correlationId

    });

    throw new AppError(

      'Operation failed',

      500,

      ErrorCodes.INTERNAL_SERVER_ERROR

    );

  }
});

router.put('/notifications', dashboardLimiter, validate(updateNotificationsBody, 'body'), async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      discordEnabled,
      emailEnabled,
      notifyOnTrade,
      notifyOnProfit,
      notifyOnLoss,
      notifyOnDailyLimit,
      notifyOnPositionSize,
      dailyLossThreshold,
      positionSizeThreshold,
      profitThreshold
    } = req.body;

    // Import models
    const User = require('../../models/User');

    // Get current user
    const currentUser = await User.findById(userId);
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Build update object (only update provided fields)
    const updates = {};

    if (discordEnabled !== undefined) {
      updates['preferences.notifications.discordEnabled'] = discordEnabled;
    }
    if (emailEnabled !== undefined) {
      updates['preferences.notifications.emailEnabled'] = emailEnabled;
    }
    if (notifyOnTrade !== undefined) {
      updates['preferences.notifications.notifyOnTrade'] = notifyOnTrade;
    }
    if (notifyOnProfit !== undefined) {
      updates['preferences.notifications.notifyOnProfit'] = notifyOnProfit;
    }
    if (notifyOnLoss !== undefined) {
      updates['preferences.notifications.notifyOnLoss'] = notifyOnLoss;
    }
    if (notifyOnDailyLimit !== undefined) {
      updates['preferences.notifications.notifyOnDailyLimit'] = notifyOnDailyLimit;
    }
    if (notifyOnPositionSize !== undefined) {
      updates['preferences.notifications.notifyOnPositionSize'] = notifyOnPositionSize;
    }
    if (dailyLossThreshold !== undefined) {
      updates['preferences.notifications.dailyLossThreshold'] = dailyLossThreshold;
    }
    if (positionSizeThreshold !== undefined) {
      updates['preferences.notifications.positionSizeThreshold'] = positionSizeThreshold;
    }
    if (profitThreshold !== undefined) {
      updates['preferences.notifications.profitThreshold'] = profitThreshold;
    }

    // Update user preferences
    await User.findByIdAndUpdate(userId, { $set: updates }, { new: true, runValidators: true });

    // Fetch updated preferences for response
    const updatedUser = await User.findById(userId)
      .select('preferences.notifications')
      .lean();

    logger.info('[Trader API] Notification preferences updated', {
      userId,
      username: req.user.discordUsername,
      enableTradeAlerts: updates.enableTradeAlerts,
      enableMarketUpdates: updates.enableMarketUpdates
    });

    res.json({
      success: true,
      message: 'Notification preferences updated successfully',
      preferences: updatedUser.preferences.notifications
    });
  } catch (error) {
    logger.error('[Trader API] Error updating notification preferences:', { error: error.message });

    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({
        error: 'Validation failed',
        details: errors
      });
    }

    res.status(500).json({ error: 'Failed to update notification preferences' });
  }
});

router.post('/notifications/test', dashboardLimiter, async (req, res) => {
  try {
    const { type } = req.body;
    const channel = ['discord', 'email', 'sms'].includes(type) ? type : 'discord';

    const User = require('../../models/User');
    const historyEntry = {
      id: new mongoose.Types.ObjectId().toString(),
      type: 'test',
      channel,
      message: `Test ${channel} notification sent at ${new Date().toISOString()}`,
      sentAt: new Date(),
      status: 'sent'
    };

    await User.findByIdAndUpdate(
      req.user._id,
      {
        $push: {
          'preferences.notificationHistory': {
            $each: [historyEntry],
            $slice: -20
          }
        }
      },
      { new: true }
    );

    res.json({
      success: true,
      message: `Test ${channel} notification dispatched`,
      notification: historyEntry
    });
  } catch (error) {

    logger.error('[Trader API] Error sending test notification:', {

      error: error.message,


      correlationId: req.correlationId

    });

    throw new AppError(

      'Operation failed',

      500,

      ErrorCodes.INTERNAL_SERVER_ERROR

    );

  }
});

/**
 * GET /api/trader/subscription
 * Get personal subscription information
 *
 * Rate Limit: 100 requests/minute (Constitution Principle V)
 */
router.get('/subscription', dashboardLimiter, async (req, res) => {
  try {
    const user = req.user;

    // Get Polar customer ID from user subscription
    const customerId = user.subscription?.polarCustomerId;

    if (!customerId) {
      // Free tier user - return free tier subscription
      return res.json({
        tier: 'free',
        status: 'active',
        limits: {
          signalsPerDay: user.limits.signalsPerDay || 5,
          maxBrokers: user.limits.maxBrokers || 1
        }
      });
    }

    const billingProvider = BillingProviderFactory.createProvider();
    const subscription = await billingProvider.getSubscription(customerId);

    res.json(subscription);
  } catch (error) {

    logger.error('[Trader API] Error fetching subscription:', {

      error: error.message,


      correlationId: req.correlationId

    });

    throw new AppError(

      'Operation failed',

      500,

      ErrorCodes.INTERNAL_SERVER_ERROR

    );

  }
});

module.exports = router;
