/**
 * Community Dashboard API Routes
 *
 * API endpoints for community hosts (admin/moderator roles).
 * All routes require authentication via requireCommunityAdmin middleware.
 */

const express = require('express');
const router = express.Router();
const requireCommunityAdmin = require('../../middleware/requireCommunityAdmin');
const { overviewLimiter, analyticsLimiter, dashboardLimiter } = require('../../middleware/rateLimiter');
const redis = require('../../services/redis');
const discord = require('../../services/discord');
const logger = require('../../utils/logger');
const { AppError, ErrorCodes } = require('../../middleware/errorHandler');

// Apply community admin authorization to all routes
router.use(requireCommunityAdmin);

/**
 * GET /api/community/overview
 * Get community overview with KPIs and metrics
 *
 * Rate Limit: 100 requests/minute (Constitution Principle V)
 *
 * Returns:
 * - Member count and activity metrics
 * - Top signal providers by performance
 * - Recent activity feed
 * - Community health indicators
 */
router.get('/overview', overviewLimiter, async (req, res) => {
  try {
    const user = req.user;
    const tenantId = user.communityId; // Constitution Principle I: MUST include tenant scoping

    // Time boundaries
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Import models
    const User = require('../../models/User');
    const Signal = require('../../models/Signal');
    const SignalProvider = require('../../models/SignalProvider');
    const UserSignalSubscription = require('../../models/UserSignalSubscription');
    const Trade = require('../../models/Trade');

    // Member metrics (tenant-scoped)
    const [totalMembers, activeToday, activeThisWeek, newThisMonth] = await Promise.all([
      User.countDocuments({ communityId: tenantId }),
      User.countDocuments({ communityId: tenantId, lastActive: { $gte: todayStart } }),
      User.countDocuments({ communityId: tenantId, lastActive: { $gte: weekStart } }),
      User.countDocuments({ communityId: tenantId, createdAt: { $gte: monthStart } })
    ]);

    // Signal metrics (tenant-scoped)
    const [signalsToday, signalsWeek, signalsMonth] = await Promise.all([
      Signal.countDocuments({ communityId: tenantId, createdAt: { $gte: todayStart } }),
      Signal.countDocuments({ communityId: tenantId, createdAt: { $gte: weekStart } }),
      Signal.countDocuments({ communityId: tenantId, createdAt: { $gte: monthStart } })
    ]);

    // Top signal providers with follower/signal counts (single aggregation query)
    // Replaces N+1 pattern (3 providers × 2 queries = 6 extra DB round trips)
    // Performance: <50ms p95 (from ~300ms)
    const topProvidersWithFollowers = await SignalProvider.aggregate([
      // Match active verified providers in this community
      {
        $match: {
          communityId: tenantId,
          isActive: true,
          verificationStatus: 'verified'
        }
      },
      // Sort by win rate and net profit
      {
        $sort: {
          'performance.winRate': -1,
          'performance.netProfit': -1
        }
      },
      // Limit to top 3
      {
        $limit: 3
      },
      // Join with UserSignalSubscription to count followers
      {
        $lookup: {
          from: 'usersignalsubscriptions',
          let: { providerId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$communityId', tenantId] },
                    { $eq: ['$providerId', '$$providerId'] },
                    { $eq: ['$active', true] }
                  ]
                }
              }
            },
            {
              $count: 'count'
            }
          ],
          as: 'followerStats'
        }
      },
      // Join with Signal to count today's signals
      {
        $lookup: {
          from: 'signals',
          let: { providerId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$communityId', tenantId] },
                    { $eq: ['$providerId', '$$providerId'] },
                    { $gte: ['$createdAt', todayStart] }
                  ]
                }
              }
            },
            {
              $count: 'count'
            }
          ],
          as: 'todaySignalStats'
        }
      },
      // Project final shape
      {
        $project: {
          id: { $toString: '$_id' },
          name: 1,
          signalsToday: {
            $ifNull: [{ $arrayElemAt: ['$todaySignalStats.count', 0] }, 0]
          },
          winRate: { $ifNull: ['$performance.winRate', 0] },
          followers: {
            $ifNull: [{ $arrayElemAt: ['$followerStats.count', 0] }, 0]
          },
          _id: 0
        }
      }
    ]);

    // Performance metrics (tenant-scoped aggregation)
    const performanceStats = await Trade.aggregate([
      {
        $match: {
          communityId: tenantId,
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
    ]);

    const stats = performanceStats[0] || {
      totalPnL: 0,
      totalTrades: 0,
      successfulTrades: 0
    };

    const winRate = stats.totalTrades > 0 ? (stats.successfulTrades / stats.totalTrades) * 100 : 0;
    const avgPnLPerMember = totalMembers > 0 ? stats.totalPnL / totalMembers : 0;

    // Recent activity (simplified - can be enhanced with AnalyticsEvent model)
    const recentTrades = await Trade.find({ communityId: tenantId }).sort({ createdAt: -1 }).limit(1).lean();

    const recentMembers = await User.find({ communityId: tenantId }).sort({ createdAt: -1 }).limit(1).lean();

    const recentEvents = [];

    if (recentMembers.length > 0) {
      recentEvents.push({
        id: `member_${recentMembers[0]._id}`,
        type: 'new_member',
        description: `${recentMembers[0].discordUsername} joined the community`,
        timestamp: recentMembers[0].createdAt
      });
    }

    if (signalsToday > 0 && topProvidersWithFollowers.length > 0) {
      recentEvents.push({
        id: `signal_${Date.now()}`,
        type: 'signal',
        description: `${signalsToday} new signals today from ${topProvidersWithFollowers[0].name}`,
        timestamp: new Date()
      });
    }

    if (stats.totalTrades >= 1000) {
      recentEvents.push({
        id: `milestone_trades`,
        type: 'milestone',
        description: `Community reached ${Math.floor(stats.totalTrades / 1000) * 1000} total trades`,
        timestamp: recentTrades.length > 0 ? recentTrades[0].createdAt : new Date()
      });
    }

    // Health score calculation
    const engagementRate = totalMembers > 0 ? (activeThisWeek / totalMembers) * 100 : 0;
    const healthScore = Math.min(100, Math.round(engagementRate * 0.4 + winRate * 0.3 + (signalsWeek > 0 ? 30 : 0)));

    const overview = {
      members: {
        total: totalMembers,
        activeToday,
        activeThisWeek,
        newThisMonth,
        growth: {
          daily: 0, // TODO: Calculate from historical data
          weekly: 0, // TODO: Calculate from historical data
          monthly: 0 // TODO: Calculate from historical data
        }
      },
      signals: {
        totalToday: signalsToday,
        totalThisWeek: signalsWeek,
        totalThisMonth: signalsMonth,
        avgPerDay: signalsWeek > 0 ? Math.round(signalsWeek / 7) : 0,
        topProviders: topProvidersWithFollowers
      },
      performance: {
        totalPnL: stats.totalPnL,
        avgPnLPerMember,
        winRate,
        totalTrades: stats.totalTrades,
        successfulTrades: stats.successfulTrades
      },
      activity: {
        recentEvents: recentEvents.slice(0, 3)
      },
      health: {
        score: healthScore,
        indicators: {
          engagement: engagementRate > 60 ? 'high' : engagementRate > 30 ? 'medium' : 'low',
          retention: activeThisWeek > totalMembers * 0.5 ? 'high' : 'medium',
          growth: newThisMonth > 0 ? 'high' : 'low',
          satisfaction: winRate > 60 ? 'high' : winRate > 40 ? 'medium' : 'low'
        }
      }
    };

    res.json(overview);
  } catch (error) {

    logger.error('[Community API] Error fetching overview:', {

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
 * GET /api/community/members
 * Get list of community members with pagination
 *
 * Rate Limit: 100 requests/minute (Constitution Principle V)
 *
 * Query params:
 * - page: Page number (default: 1)
 * - limit: Results per page (default: 25)
 * - search: Search by username
 * - role: Filter by communityRole
 */
router.get('/members', dashboardLimiter, async (req, res) => {
  try {
    const { page = 1, limit = 25, search, role } = req.query;
    const skip = (page - 1) * limit;
    const tenantId = req.user.communityId; // Constitution Principle I: MUST include tenant scoping

    // Import models
    const User = require('../../models/User');
    const Trade = require('../../models/Trade');

    // Build query (tenant-scoped)
    const query = { communityId: tenantId };

    // Apply search filter
    if (search) {
      query.$or = [
        { discordUsername: new RegExp(search, 'i') },
        { discordTag: new RegExp(search, 'i') }
      ];
    }

    // Apply role filter
    if (role) {
      query.communityRole = role;
    }

    // Execute query with pagination
    const [members, total] = await Promise.all([
      User.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('discordUsername communityRole subscription.status createdAt lastActive')
        .lean(),
      User.countDocuments(query)
    ]);

    // Fetch trading stats for each member
    const membersWithStats = await Promise.all(
      members.map(async member => {
        const stats = await Trade.aggregate([
          {
            $match: {
              communityId: tenantId,
              userId: member._id,
              status: { $in: ['FILLED', 'PARTIAL'] }
            }
          },
          {
            $group: {
              _id: null,
              totalTrades: { $sum: 1 },
              totalPnL: { $sum: '$profitLoss' },
              successfulTrades: {
                $sum: { $cond: [{ $gt: ['$profitLoss', 0] }, 1, 0] }
              }
            }
          }
        ]);

        const memberStats = stats[0] || { totalTrades: 0, totalPnL: 0, successfulTrades: 0 };
        const winRate = memberStats.totalTrades > 0
          ? (memberStats.successfulTrades / memberStats.totalTrades) * 100
          : 0;

        return {
          id: member._id.toString(),
          username: member.discordUsername,
          communityRole: member.communityRole,
          accountStatus: member.subscription?.status || 'inactive',
          joinedAt: member.createdAt,
          lastActive: member.lastActive || member.createdAt,
          stats: {
            totalTrades: memberStats.totalTrades,
            winRate,
            totalPnL: memberStats.totalPnL
          }
        };
      })
    );

    res.json({
      members: membersWithStats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {

    logger.error('[Community API] Error fetching members:', {

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
 * POST /api/community/members/:id/role
 * Update member's community role with SecurityAudit logging
 *
 * Body:
 * - role: New community role (admin, moderator, trader, viewer)
 *
 * Constitution Compliance:
 * - Principle I: Tenant-scoped query (communityId)
 * - Principle III: SecurityAudit logging for role changes (HIGH risk)
 *
 * Rate Limit: 20 requests/minute (sensitive operation)
 */
router.post('/members/:id/role', dashboardLimiter, async (req, res) => {
  try {
    const { id: targetUserId } = req.params;
    const { role: newRole } = req.body;
    const user = req.user;
    const tenantId = user.communityId; // Constitution Principle I: MUST include tenant scoping

    // Import models
    const User = require('../../models/User');
    const SecurityAudit = require('../../models/SecurityAudit');

    // Validate role
    const validRoles = ['admin', 'moderator', 'trader', 'viewer'];
    if (!validRoles.includes(newRole)) {
      return res.status(400).json({
        error: `Invalid role. Must be one of: ${validRoles.join(', ')}`
      });
    }

    // Get target user (tenant-scoped)
    const targetUser = await User.findOne({
      _id: targetUserId,
      communityId: tenantId
    });

    if (!targetUser) {
      // Log unauthorized attempt (Constitution Principle III)
      await SecurityAudit.log({
        communityId: tenantId,
        userId: user._id,
        userRole: user.communityRole,
        username: user.discordUsername,
        action: 'security.unauthorized_access',
        resourceType: 'User',
        resourceId: targetUserId,
        operation: 'UPDATE',
        status: 'blocked',
        statusCode: 404,
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('user-agent'),
        endpoint: req.path,
        httpMethod: req.method,
        errorMessage: 'Target user not found in community',
        riskLevel: 'high',
        requiresReview: true
      });

      return res.status(404).json({ error: 'Member not found in this community' });
    }

    const oldRole = targetUser.communityRole;

    // No change needed
    if (oldRole === newRole) {
      return res.json({
        success: true,
        message: 'Member already has this role',
        member: {
          id: targetUser._id.toString(),
          username: targetUser.discordUsername,
          role: newRole
        }
      });
    }

    // Update role
    targetUser.communityRole = newRole;
    await targetUser.save();

    // Log role change to SecurityAudit (Constitution Principle III)
    await SecurityAudit.log({
      communityId: tenantId,
      userId: user._id,
      userRole: user.communityRole,
      username: user.discordUsername,
      action: 'user.role_change',
      resourceType: 'User',
      resourceId: targetUser._id,
      operation: 'UPDATE',
      status: 'success',
      statusCode: 200,
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('user-agent'),
      endpoint: req.path,
      httpMethod: req.method,
      dataBefore: { communityRole: oldRole },
      dataAfter: { communityRole: newRole },
      changes: [`communityRole: ${oldRole} → ${newRole}`],
      riskLevel: 'high',
      requiresReview: true
    });

    logger.info('[Community API] Member role changed', {
      targetUserId,
      targetUsername: targetUser.discordUsername,
      oldRole,
      newRole,
      changedBy: user.discordUsername,
      changedById: user._id,
      communityId: user.communityId
    });

    res.json({
      success: true,
      message: 'Member role updated successfully',
      member: {
        id: targetUser._id.toString(),
        username: targetUser.discordUsername,
        role: newRole,
        previousRole: oldRole
      }
    });
  } catch (error) {

    logger.error('[Community API] Error updating member role:', {

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
 * GET /api/community/signals
 * Get list of signal providers and their configuration
 *
 * Rate Limit: 100 requests/minute (Constitution Principle V)
 */
router.get('/signals', dashboardLimiter, async (req, res) => {
  try {
    const tenantId = req.user.communityId; // Constitution Principle I: MUST include tenant scoping

    // Time boundaries
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Import models
    const SignalProvider = require('../../models/SignalProvider');
    const Signal = require('../../models/Signal');
    const UserSignalSubscription = require('../../models/UserSignalSubscription');

    // Fetch all providers for this community (tenant-scoped)
    const providers = await SignalProvider.find({
      communityId: tenantId
    })
      .select('name discordChannelId enabled performance verificationStatus')
      .sort({ 'performance.winRate': -1 })
      .lean();

    // Enhance each provider with stats
    const providersWithStats = await Promise.all(
      providers.map(async provider => {
        // Count signals
        const [signalsToday, signalsWeek, totalSignals, followers] = await Promise.all([
          Signal.countDocuments({
            communityId: tenantId,
            providerId: provider._id,
            createdAt: { $gte: todayStart }
          }),
          Signal.countDocuments({
            communityId: tenantId,
            providerId: provider._id,
            createdAt: { $gte: weekStart }
          }),
          Signal.countDocuments({
            communityId: tenantId,
            providerId: provider._id
          }),
          UserSignalSubscription.countDocuments({
            communityId: tenantId,
            providerId: provider._id,
            active: true
          })
        ]);

        return {
          id: provider._id.toString(),
          name: provider.name,
          channelId: provider.discordChannelId,
          enabled: provider.enabled,
          verificationStatus: provider.verificationStatus,
          stats: {
            signalsToday,
            signalsThisWeek: signalsWeek,
            totalSignals,
            winRate: provider.performance?.winRate || 0,
            followers
          }
        };
      })
    );

    res.json({ providers: providersWithStats });
  } catch (error) {

    logger.error('[Community API] Error fetching signal providers:', {

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
 * PUT /api/community/signals/:id
 * Update signal provider configuration
 *
 * Body:
 * - channelId: Discord channel ID
 * - enabled: Whether provider is enabled
 * - name: Provider display name
 */
router.put('/signals/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { channelId, enabled, name } = req.body;
    const tenantId = req.user.communityId; // Constitution Principle I: MUST include tenant scoping

    // Import models
    const SignalProvider = require('../../models/SignalProvider');

    // Validate Discord channel if provided
    if (channelId) {
      const validation = await discord.validateChannel(channelId);
      if (!validation.valid) {
        return res.status(400).json({
          error: 'Invalid Discord channel',
          details: validation.error
        });
      }
    }

    // Find provider (tenant-scoped)
    const provider = await SignalProvider.findOne({
      _id: id,
      communityId: tenantId
    });

    if (!provider) {
      return res.status(404).json({ error: 'Provider not found in this community' });
    }

    // Update fields
    if (channelId !== undefined) provider.discordChannelId = channelId;
    if (enabled !== undefined) provider.enabled = enabled;
    if (name !== undefined) provider.name = name;

    await provider.save();

    logger.info('Provider updated: ' + id + ' in community ' + tenantId + '');

    res.json({
      success: true,
      message: 'Signal provider updated successfully',
      provider: {
        id: provider._id.toString(),
        name: provider.name,
        channelId: provider.discordChannelId,
        enabled: provider.enabled
      }
    });
  } catch (error) {

    logger.error('[Community API] Error updating signal provider:', {

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
 * GET /api/community/analytics/performance
 * Get community performance analytics with caching
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
    const tenantId = req.user.communityId; // Constitution Principle I: MUST include tenant scoping

    // Generate cache key
    const cacheKey = `community:analytics:${tenantId}:${startDate}:${endDate}:${groupBy}`;

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

    logger.error('[Community API] Error fetching analytics:', {

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
 * GET /api/community/subscription
 * Get community subscription and billing information from Polar.sh
 *
 * Returns:
 * - Polar.sh subscription status and details
 * - Current tier and limits
 * - Usage metrics vs limits
 * - Billing portal URL
 *
 * Constitution Compliance:
 * - Principle I: Tenant-scoped usage queries
 * - Principle V: Rate limiting applied
 *
 * Rate Limit: 100 requests/minute
 */
router.get('/subscription', dashboardLimiter, async (req, res) => {
  try {
    const user = req.user;
    const tenantId = user.communityId; // Constitution Principle I: MUST include tenant scoping

    // Import models and services
    const Community = require('../../models/Community');
    const User = require('../../models/User');
    const Signal = require('../../models/Signal');
    const SignalProvider = require('../../models/SignalProvider');
    const BillingProviderFactory = require('../../services/billing/BillingProviderFactory');
    const billingProvider = BillingProviderFactory.createProvider();

    // Get community from database
    const community = await Community.findById(tenantId);
    if (!community) {
      return res.status(404).json({ error: 'Community not found' });
    }

    // Check if community has Polar customer ID
    if (!community.subscription || !community.subscription.polarCustomerId) {
      // No Polar customer - return free tier info
      const [memberCount, signalCount, providerCount] = await Promise.all([
        User.countDocuments({ communityId: tenantId }),
        Signal.countDocuments({ communityId: tenantId }),
        SignalProvider.countDocuments({ communityId: tenantId })
      ]);

      return res.json({
        tier: 'free',
        status: 'trial',
        subscription: null,
        limits: {
          maxMembers: 10,
          maxSignalProviders: 2,
          maxSignalsPerDay: 50
        },
        usage: {
          members: memberCount,
          signalProviders: providerCount,
          signalsToday: signalCount
        },
        billing: {
          hasPolarCustomer: false
        }
      });
    }

    // Get subscription from billing provider
    const polarSubscription = await billingProvider.getSubscription(
      community.subscription.polarCustomerId
    );

    // Calculate current usage (tenant-scoped)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [memberCount, signalProviderCount, signalsTodayCount] = await Promise.all([
      User.countDocuments({ communityId: tenantId }),
      SignalProvider.countDocuments({ communityId: tenantId }),
      Signal.countDocuments({
        communityId: tenantId,
        createdAt: { $gte: todayStart }
      })
    ]);

    // Determine tier from subscription (stored in Community model)
    const tier = community.subscription.tier || 'free';

    // Use limits from community document (set by webhook handlers)
    const limits = {
      maxMembers: community.limits.memberCount,
      maxSignalProviders: community.limits.signalProvidersCount,
      maxSignalsPerDay: community.limits.signalsPerDay
    };

    // Create billing portal session for subscription management
    const portalUrl = process.env.APP_URL || 'http://localhost:3000';
    let billingPortalUrl = null;

    try {
      const portalSession = await billingProvider.createCustomerPortalSession(
        community.subscription.polarCustomerId,
        `${portalUrl}/dashboard/community/subscription`
      );
      billingPortalUrl = portalSession.url;
    } catch (portalError) {
      logger.error('[Community API] Error creating billing portal', {
        error: portalError.message,
        stack: portalError.stack,
        communityId: user.communityId
      });
      // Continue without portal URL
    }

    res.json({
      tier,
      status: polarSubscription?.status || community.subscription.status || 'trial',
      subscription: polarSubscription,
      limits,
      usage: {
        members: memberCount,
        signalProviders: signalProviderCount,
        signalsToday: signalsTodayCount
      },
      billing: {
        hasPolarCustomer: true,
        portalUrl: billingPortalUrl
      }
    });
  } catch (error) {
    logger.error('[Community API] Error fetching subscription:', { error: error.message });

    // Handle Polar-specific errors
    if (error.message?.includes('Polar')) {
      return res.status(400).json({
        error: 'Invalid subscription request',
        message: error.message
      });
    }

    res.status(500).json({ error: 'Failed to fetch subscription information' });
  }
});

module.exports = router;
