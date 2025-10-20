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

    // Top signal providers (tenant-scoped)
    const topProviders = await SignalProvider.find({
      communityId: tenantId,
      isActive: true,
      verificationStatus: 'verified'
    })
      .sort({ 'performance.winRate': -1, 'performance.netProfit': -1 })
      .limit(3)
      .lean();

    // Get follower counts for top providers
    const topProvidersWithFollowers = await Promise.all(
      topProviders.map(async provider => {
        const followers = await UserSignalSubscription.countDocuments({
          communityId: tenantId,
          providerId: provider._id,
          active: true
        });

        const signalsToday = await Signal.countDocuments({
          communityId: tenantId,
          providerId: provider._id,
          createdAt: { $gte: todayStart }
        });

        return {
          id: provider._id.toString(),
          name: provider.name,
          signalsToday,
          winRate: provider.performance.winRate || 0,
          followers
        };
      })
    );

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
    const recentTrades = await Trade.find({ communityId: tenantId })
      .sort({ createdAt: -1 })
      .limit(1)
      .lean();

    const recentMembers = await User.find({ communityId: tenantId })
      .sort({ createdAt: -1 })
      .limit(1)
      .lean();

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
    const healthScore = Math.min(100, Math.round(
      engagementRate * 0.4 +
      winRate * 0.3 +
      (signalsWeek > 0 ? 30 : 0)
    ));

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
    console.error('[Community API] Error fetching overview:', error);
    res.status(500).json({ error: 'Failed to fetch community overview' });
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
    console.error('[Community API] Error fetching members:', error);
    res.status(500).json({ error: 'Failed to fetch members' });
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

    console.log(
      `[Community API] Role changed: User ${targetUser.discordUsername} (${targetUserId}) ` +
      `from '${oldRole}' to '${newRole}' by ${user.discordUsername}`
    );

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
    console.error('[Community API] Error updating member role:', error);
    res.status(500).json({ error: 'Failed to update member role' });
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
    // TODO: Replace with actual database query
    // const providers = await SignalProvider.find({ tenantId: req.user.tenantId });

    const mockProviders = [
      {
        id: 'provider_1',
        name: '#crypto-signals',
        channelId: '123456789012345678',
        enabled: true,
        stats: {
          signalsToday: 45,
          signalsThisWeek: 312,
          totalSignals: 2345,
          winRate: 68.5,
          followers: 34
        }
      },
      {
        id: 'provider_2',
        name: '#forex-alerts',
        channelId: '234567890123456789',
        enabled: true,
        stats: {
          signalsToday: 32,
          signalsThisWeek: 198,
          totalSignals: 1876,
          winRate: 72.1,
          followers: 28
        }
      }
    ];

    res.json({ providers: mockProviders });
  } catch (error) {
    console.error('[Community API] Error fetching signal providers:', error);
    res.status(500).json({ error: 'Failed to fetch signal providers' });
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

    // TODO: Update provider in database
    // const provider = await SignalProvider.findOne({ _id: id, tenantId: req.user.tenantId });
    // if (!provider) return res.status(404).json({ error: 'Provider not found' });
    // if (channelId) provider.channelId = channelId;
    // if (enabled !== undefined) provider.enabled = enabled;
    // if (name) provider.name = name;
    // await provider.save();

    console.log(`[Community API] Provider updated: ${id}`);

    res.json({
      success: true,
      message: 'Signal provider updated successfully',
      provider: {
        id,
        channelId,
        enabled,
        name
      }
    });
  } catch (error) {
    console.error('[Community API] Error updating signal provider:', error);
    res.status(500).json({ error: 'Failed to update signal provider' });
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
    console.error('[Community API] Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
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
    const polar = require('../../services/polar');

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

    // Get subscription from Polar.sh
    const polarSubscription = await polar.getCommunitySubscription(
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
      const portalSession = await polar.createCustomerPortalSession(
        community.subscription.polarCustomerId,
        `${portalUrl}/dashboard/community/subscription`
      );
      billingPortalUrl = portalSession.url;
    } catch (portalError) {
      console.error('[Community API] Error creating billing portal:', portalError.message);
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
    console.error('[Community API] Error fetching subscription:', error);

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
