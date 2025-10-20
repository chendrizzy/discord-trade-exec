/**
 * Trader Dashboard API Routes
 *
 * API endpoints for personal trader dashboard.
 * All routes require authentication via requireTrader middleware.
 */

const express = require('express');
const router = express.Router();
const requireTrader = require('../../middleware/requireTrader');
const { overviewLimiter, analyticsLimiter, tradesLimiter, dashboardLimiter } = require('../../middleware/rateLimiter');
const redis = require('../../services/redis');
const polar = require('../../services/polar');

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
router.get('/overview', overviewLimiter, async (req, res) => {
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

    const avgSize = activePositions.length > 0
      ? activePositions.reduce((sum, t) => sum + (t.quantity * t.entryPrice), 0) / activePositions.length
      : 0;

    const totalExposure = activePositions.reduce((sum, t) => sum + (t.quantity * t.entryPrice), 0);
    const largestPosition = activePositions.length > 0
      ? Math.max(...activePositions.map(t => t.quantity * t.entryPrice))
      : 0;

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

    const following = await Promise.all(
      followedProviders.map(async sub => {
        // Calculate this week's performance for this user
        const weekPnLForProvider = await Trade.aggregate([
          {
            $match: {
              communityId: tenantId,
              userId,
              'signalSource.providerId': sub.providerId._id,
              entryTime: { $gte: weekStart },
              status: { $in: ['FILLED', 'PARTIAL'] }
            }
          },
          {
            $group: {
              _id: null,
              totalPnL: { $sum: '$profitLoss' }
            }
          }
        ]);

        return {
          id: sub.providerId._id.toString(),
          name: sub.providerId.name,
          performanceThisWeek: weekPnLForProvider[0]?.totalPnL || 0,
          signalsReceived: sub.stats.signalsReceived,
          tradesExecuted: sub.stats.signalsExecuted
        };
      })
    );

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
    console.error('[Trader API] Error fetching overview:', error);
    res.status(500).json({ error: 'Failed to fetch trader overview' });
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
router.get('/signals', dashboardLimiter, async (req, res) => {
  try {
    const { filter = 'all', sortBy = 'winRate', minWinRate } = req.query;
    const user = req.user;

    // TODO: Replace with actual database query
    // const providers = await SignalProvider.find({ tenantId: user.tenantId, enabled: true });
    // Apply user's followed status from UserSignalSubscription model

    const mockProviders = [
      {
        id: 'provider_1',
        name: '#crypto-signals',
        description: 'High-quality crypto trading signals',
        channelId: '123456789012345678',
        stats: {
          totalSignals: 2345,
          winRate: 68.5,
          avgPnL: 234.56,
          followers: 34,
          signalsThisWeek: 312
        },
        performance: {
          week: 12.5,
          month: 45.3,
          allTime: 234.5
        },
        following: true
      },
      {
        id: 'provider_2',
        name: '#forex-alerts',
        description: 'Professional forex trading alerts',
        channelId: '234567890123456789',
        stats: {
          totalSignals: 1876,
          winRate: 72.1,
          avgPnL: 189.34,
          followers: 28,
          signalsThisWeek: 198
        },
        performance: {
          week: 8.3,
          month: 32.1,
          allTime: 189.2
        },
        following: true
      },
      {
        id: 'provider_3',
        name: '#options-flow',
        description: 'Options flow trading signals',
        channelId: '345678901234567890',
        stats: {
          totalSignals: 1234,
          winRate: 65.3,
          avgPnL: 156.78,
          followers: 19,
          signalsThisWeek: 145
        },
        performance: {
          week: 5.7,
          month: 28.9,
          allTime: 156.8
        },
        following: false
      }
    ];

    res.json({ providers: mockProviders });
  } catch (error) {
    console.error('[Trader API] Error fetching signal providers:', error);
    res.status(500).json({ error: 'Failed to fetch signal providers' });
  }
});

/**
 * POST /api/trader/signals/:id/follow
 * Follow or unfollow a signal provider
 *
 * Body:
 * - following: Boolean (true to follow, false to unfollow)
 */
router.post('/signals/:id/follow', async (req, res) => {
  try {
    const { id } = req.params;
    const { following } = req.body;
    const user = req.user;

    // TODO: Update UserSignalSubscription in database
    // if (following) {
    //   await UserSignalSubscription.create({
    //     userId: user._id,
    //     providerId: id,
    //     tenantId: user.tenantId
    //   });
    // } else {
    //   await UserSignalSubscription.deleteOne({
    //     userId: user._id,
    //     providerId: id
    //   });
    // }

    console.log(`[Trader API] User ${user._id} ${following ? 'followed' : 'unfollowed'} provider ${id}`);

    res.json({
      success: true,
      message: `Successfully ${following ? 'followed' : 'unfollowed'} signal provider`,
      provider: {
        id,
        following
      }
    });
  } catch (error) {
    console.error('[Trader API] Error updating signal subscription:', error);
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
router.get('/trades', tradesLimiter, async (req, res) => {
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
      Trade.find(query)
        .sort({ entryTime: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Trade.countDocuments(query)
    ]);

    // Populate provider names for trades
    const tradesWithProviders = await Promise.all(
      trades.map(async trade => {
        let providerName = 'Unknown';

        if (trade.signalSource && trade.signalSource.providerId) {
          const provider = await SignalProvider.findById(trade.signalSource.providerId).lean();
          if (provider) {
            providerName = provider.name;
          }
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
      })
    );

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
    console.error('[Trader API] Error fetching trades:', error);
    res.status(500).json({ error: 'Failed to fetch trades' });
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
router.get('/analytics/performance', analyticsLimiter, async (req, res) => {
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
    console.error('[Trader API] Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

/**
 * PUT /api/trader/risk-profile
 * Update trader's risk management settings with validation
 *
 * Body:
 * - positionSizingMethod: 'fixed' | 'risk_based' | 'kelly'
 * - maxPositionSize: Max position size (0.005-0.1, default 0.02)
 * - defaultStopLoss: Default stop loss percentage (0.01-0.1, default 0.02)
 * - defaultTakeProfit: Default take profit percentage (0.02-0.2, default 0.04)
 * - maxDailyLoss: Maximum daily loss limit (0.02-0.2, default 0.05)
 * - maxOpenPositions: Maximum open positions (1-10, default 3)
 * - useTrailingStop: Enable trailing stop (boolean)
 * - trailingStopPercent: Trailing stop percentage (default 0.015)
 *
 * Constitution Compliance:
 * - Principle I: User-specific update (no tenant scoping needed)
 * - Principle V: Rate limiting applied (dashboardLimiter)
 *
 * Rate Limit: 100 requests/minute
 */
router.put('/risk-profile', dashboardLimiter, async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      positionSizingMethod,
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

    // Validation helper
    const validateRange = (value, min, max, name) => {
      if (value !== undefined && (value < min || value > max)) {
        throw new Error(`${name} must be between ${min} and ${max}`);
      }
    };

    // Validate inputs
    if (positionSizingMethod && !['fixed', 'risk_based', 'kelly'].includes(positionSizingMethod)) {
      return res.status(400).json({
        error: 'Invalid positionSizingMethod. Must be: fixed, risk_based, or kelly'
      });
    }

    try {
      validateRange(maxPositionSize, 0.005, 0.1, 'maxPositionSize');
      validateRange(defaultStopLoss, 0.01, 0.1, 'defaultStopLoss');
      validateRange(defaultTakeProfit, 0.02, 0.2, 'defaultTakeProfit');
      validateRange(maxDailyLoss, 0.02, 0.2, 'maxDailyLoss');
      validateRange(trailingStopPercent, 0.005, 0.05, 'trailingStopPercent');

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

    if (positionSizingMethod !== undefined) {
      updates['tradingConfig.riskManagement.positionSizingMethod'] = positionSizingMethod;
    }
    if (maxPositionSize !== undefined) {
      updates['tradingConfig.riskManagement.maxPositionSize'] = maxPositionSize;
    }
    if (defaultStopLoss !== undefined) {
      updates['tradingConfig.riskManagement.defaultStopLoss'] = defaultStopLoss;
    }
    if (defaultTakeProfit !== undefined) {
      updates['tradingConfig.riskManagement.defaultTakeProfit'] = defaultTakeProfit;
    }
    if (maxDailyLoss !== undefined) {
      updates['tradingConfig.riskManagement.maxDailyLoss'] = maxDailyLoss;
    }
    if (maxOpenPositions !== undefined) {
      updates['tradingConfig.riskManagement.maxOpenPositions'] = maxOpenPositions;
    }
    if (useTrailingStop !== undefined) {
      updates['tradingConfig.riskManagement.useTrailingStop'] = useTrailingStop;
    }
    if (trailingStopPercent !== undefined) {
      updates['tradingConfig.riskManagement.trailingStopPercent'] = trailingStopPercent;
    }

    // Update user's risk management config
    await User.findByIdAndUpdate(userId, { $set: updates }, { new: true, runValidators: true });

    // Fetch updated config for response
    const updatedUser = await User.findById(userId)
      .select('tradingConfig.riskManagement')
      .lean();

    console.log(
      `[Trader API] Risk profile updated for user ${req.user.discordUsername} (${userId})`
    );

    res.json({
      success: true,
      message: 'Risk profile updated successfully',
      riskProfile: updatedUser.tradingConfig.riskManagement
    });
  } catch (error) {
    console.error('[Trader API] Error updating risk profile:', error);

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
 */
router.put('/notifications', async (req, res) => {
  try {
    const user = req.user;
    const { discordDM, email, alertThresholds } = req.body;

    // TODO: Update user's notification preferences in database
    // await User.findByIdAndUpdate(user._id, {
    //   'preferences.notifications': {
    //     discordDM,
    //     email,
    //     alertThresholds
    //   }
    // });

    console.log(`[Trader API] Notification preferences updated for user ${user._id}`);

    res.json({
      success: true,
      message: 'Notification preferences updated successfully',
      preferences: {
        discordDM,
        email,
        alertThresholds
      }
    });
  } catch (error) {
    console.error('[Trader API] Error updating notification preferences:', error);
    res.status(500).json({ error: 'Failed to update notification preferences' });
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

    const subscription = await polar.getUserSubscription(customerId);

    res.json(subscription);
  } catch (error) {
    console.error('[Trader API] Error fetching subscription:', error);
    res.status(500).json({ error: 'Failed to fetch subscription information' });
  }
});

module.exports = router;
