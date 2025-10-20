# Database Queries Implementation Guide

This document provides specific MongoDB/Mongoose query patterns for implementing the dual dashboard API endpoints.

## Table of Contents
- [Community Dashboard Queries](#community-dashboard-queries)
- [Trader Dashboard Queries](#trader-dashboard-queries)
- [Shared Queries](#shared-queries)
- [Performance Optimization](#performance-optimization)

---

## Community Dashboard Queries

### GET /api/community/overview

**Database Collections**: `User`, `Trade`, `Signal`, `SignalProvider`

```javascript
// src/routes/api/community.js
router.get('/overview', async (req, res) => {
  try {
    const user = req.user;
    const tenantId = user.tenantId;

    // Member metrics
    const totalMembers = await User.countDocuments({ tenantId });
    const activeToday = await User.countDocuments({
      tenantId,
      'activity.lastSeen': { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });
    const activeThisWeek = await User.countDocuments({
      tenantId,
      'activity.lastSeen': { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    });

    // Get member counts from previous periods for growth calculation
    const now = new Date();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const membersYesterday = await User.countDocuments({
      tenantId,
      createdAt: { $lte: oneDayAgo }
    });
    const membersLastWeek = await User.countDocuments({
      tenantId,
      createdAt: { $lte: oneWeekAgo }
    });
    const membersLastMonth = await User.countDocuments({
      tenantId,
      createdAt: { $lte: oneMonthAgo }
    });

    // Signal metrics
    const totalSignalProviders = await SignalProvider.countDocuments({
      tenantId,
      enabled: true
    });
    const signalsToday = await Signal.countDocuments({
      tenantId,
      createdAt: { $gte: new Date(now.setHours(0, 0, 0, 0)) }
    });

    // Performance metrics (aggregation)
    const performanceAgg = await Trade.aggregate([
      {
        $match: {
          tenantId,
          status: 'FILLED',
          exitPrice: { $exists: true }
        }
      },
      {
        $group: {
          _id: null,
          totalPnL: { $sum: '$pnl' },
          totalTrades: { $sum: 1 },
          winningTrades: {
            $sum: { $cond: [{ $gte: ['$pnl', 0] }, 1, 0] }
          }
        }
      }
    ]);

    const perf = performanceAgg[0] || { totalPnL: 0, totalTrades: 0, winningTrades: 0 };

    // Top signal providers
    const topProviders = await SignalProvider.find({
      tenantId,
      enabled: true
    })
      .sort({ 'performance.totalPnL': -1 })
      .limit(5)
      .select('name performance');

    // Recent activity (last 10 trades)
    const recentActivity = await Trade.find({ tenantId })
      .sort({ timestamp: -1 })
      .limit(10)
      .populate('userId', 'username discriminator')
      .select('symbol side pnl timestamp status');

    res.json({
      members: {
        total: totalMembers,
        activeToday,
        activeThisWeek,
        newThisMonth: totalMembers - membersLastMonth,
        growth: {
          daily: membersYesterday > 0 ? ((totalMembers - membersYesterday) / membersYesterday * 100) : 0,
          weekly: membersLastWeek > 0 ? ((totalMembers - membersLastWeek) / membersLastWeek * 100) : 0,
          monthly: membersLastMonth > 0 ? ((totalMembers - membersLastMonth) / membersLastMonth * 100) : 0
        }
      },
      signals: {
        totalProviders: totalSignalProviders,
        signalsToday,
        avgPerDay: signalsToday // Simplified - calculate properly with date ranges
      },
      performance: {
        totalPnL: perf.totalPnL,
        totalTrades: perf.totalTrades,
        winRate: perf.totalTrades > 0 ? (perf.winningTrades / perf.totalTrades * 100) : 0
      },
      topProviders,
      recentActivity
    });
  } catch (error) {
    console.error('[Community API] Error fetching overview:', error);
    res.status(500).json({ error: 'Failed to fetch community overview' });
  }
});
```

---

### GET /api/community/members

**Pagination Pattern**:

```javascript
router.get('/members', async (req, res) => {
  try {
    const user = req.user;
    const tenantId = user.tenantId;
    const { page = 1, limit = 25, search = '', role = '', status = '' } = req.query;

    // Build filter
    const filter = { tenantId };

    if (search) {
      filter.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    if (role) {
      filter.communityRole = role;
    }

    if (status) {
      filter['activity.status'] = status;
    }

    // Get total count for pagination
    const total = await User.countDocuments(filter);

    // Get paginated members with trade stats
    const members = await User.aggregate([
      { $match: filter },
      {
        $lookup: {
          from: 'trades',
          let: { userId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$userId', '$$userId'] },
                    { $eq: ['$status', 'FILLED'] }
                  ]
                }
              }
            },
            {
              $group: {
                _id: null,
                totalTrades: { $sum: 1 },
                totalPnL: { $sum: '$pnl' },
                winningTrades: {
                  $sum: { $cond: [{ $gte: ['$pnl', 0] }, 1, 0] }
                }
              }
            }
          ],
          as: 'tradeStats'
        }
      },
      {
        $project: {
          username: 1,
          discriminator: 1,
          communityRole: 1,
          joinedAt: 1,
          'activity.lastSeen': 1,
          'activity.status': 1,
          tradeStats: { $arrayElemAt: ['$tradeStats', 0] }
        }
      },
      { $sort: { joinedAt: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: parseInt(limit) }
    ]);

    res.json({
      members,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('[Community API] Error fetching members:', error);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});
```

---

### POST /api/community/members/:id/role

**With SecurityAudit Logging**:

```javascript
const SecurityAudit = require('../../models/SecurityAudit');

router.post('/members/:id/role', async (req, res) => {
  try {
    const user = req.user;
    const { id } = req.params;
    const { role } = req.body;

    // Validate role
    const validRoles = ['admin', 'moderator', 'trader', 'viewer'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Get target member
    const member = await User.findOne({
      _id: id,
      tenantId: user.tenantId
    });

    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Store old role for audit
    const oldRole = member.communityRole;

    // Update role
    member.communityRole = role;
    await member.save();

    // Log security audit
    await SecurityAudit.create({
      userId: user._id,
      tenantId: user.tenantId,
      action: 'ROLE_CHANGE',
      targetUserId: member._id,
      metadata: {
        oldRole,
        newRole: role,
        targetUsername: member.username,
        adminUsername: user.username
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({
      success: true,
      message: `Role updated to ${role}`,
      member: {
        id: member._id,
        username: member.username,
        role: member.communityRole
      }
    });
  } catch (error) {
    console.error('[Community API] Error updating role:', error);
    res.status(500).json({ error: 'Failed to update member role' });
  }
});
```

---

### GET /api/community/analytics/performance

**With Redis Caching**:

```javascript
const { getOrCompute } = require('../../services/redis');

router.get('/analytics/performance', async (req, res) => {
  try {
    const user = req.user;
    const { range = '30d' } = req.query;
    const tenantId = user.tenantId;

    // Cache key
    const cacheKey = `analytics:${tenantId}:${range}`;

    // Try to get from cache, or compute
    const analytics = await getOrCompute(
      cacheKey,
      async () => {
        // Calculate date range
        const endDate = new Date();
        let startDate;

        switch (range) {
          case '7d':
            startDate = new Date(endDate - 7 * 24 * 60 * 60 * 1000);
            break;
          case '30d':
            startDate = new Date(endDate - 30 * 24 * 60 * 60 * 1000);
            break;
          case '90d':
            startDate = new Date(endDate - 90 * 24 * 60 * 60 * 1000);
            break;
          case '1y':
            startDate = new Date(endDate - 365 * 24 * 60 * 60 * 1000);
            break;
          default:
            startDate = new Date(0); // all time
        }

        // Time series data (daily aggregation)
        const timeSeries = await Trade.aggregate([
          {
            $match: {
              tenantId,
              status: 'FILLED',
              timestamp: { $gte: startDate, $lte: endDate }
            }
          },
          {
            $group: {
              _id: {
                $dateToString: { format: '%Y-%m-%d', date: '$timestamp' }
              },
              dailyPnL: { $sum: '$pnl' },
              tradesCount: { $sum: 1 }
            }
          },
          { $sort: { _id: 1 } }
        ]);

        // Calculate cumulative P&L
        let cumulativePnL = 0;
        const enrichedTimeSeries = timeSeries.map(day => {
          cumulativePnL += day.dailyPnL;
          return {
            date: day._id,
            dailyPnL: day.dailyPnL,
            cumulativePnL,
            tradesCount: day.tradesCount
          };
        });

        // Summary stats
        const summary = await Trade.aggregate([
          {
            $match: {
              tenantId,
              status: 'FILLED',
              timestamp: { $gte: startDate, $lte: endDate }
            }
          },
          {
            $group: {
              _id: null,
              totalPnL: { $sum: '$pnl' },
              totalTrades: { $sum: 1 },
              winningTrades: {
                $sum: { $cond: [{ $gte: ['$pnl', 0] }, 1, 0] }
              }
            }
          }
        ]);

        const summaryData = summary[0] || { totalPnL: 0, totalTrades: 0, winningTrades: 0 };

        return {
          timeSeries: enrichedTimeSeries,
          summary: {
            totalPnL: summaryData.totalPnL,
            totalTrades: summaryData.totalTrades,
            winRate: summaryData.totalTrades > 0
              ? (summaryData.winningTrades / summaryData.totalTrades * 100)
              : 0
          }
        };
      },
      300 // 5 minutes TTL
    );

    res.json(analytics);
  } catch (error) {
    console.error('[Community API] Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch performance analytics' });
  }
});
```

---

## Trader Dashboard Queries

### GET /api/trader/overview

```javascript
router.get('/overview', async (req, res) => {
  try {
    const userId = req.user._id;

    // Personal P&L and trade stats
    const tradeStats = await Trade.aggregate([
      {
        $match: {
          userId,
          status: 'FILLED',
          exitPrice: { $exists: true }
        }
      },
      {
        $group: {
          _id: null,
          totalPnL: { $sum: '$pnl' },
          totalTrades: { $sum: 1 },
          winningTrades: {
            $sum: { $cond: [{ $gte: ['$pnl', 0] }, 1, 0] }
          },
          avgPnL: { $avg: '$pnl' }
        }
      }
    ]);

    const stats = tradeStats[0] || {
      totalPnL: 0,
      totalTrades: 0,
      winningTrades: 0,
      avgPnL: 0
    };

    // Active positions
    const activePositions = await Trade.countDocuments({
      userId,
      status: 'FILLED',
      exitPrice: { $exists: false }
    });

    // Execution rate (signals followed vs received)
    const signalsReceived = await Signal.countDocuments({
      tenantId: req.user.tenantId,
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    });

    const signalsExecuted = await Trade.countDocuments({
      userId,
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    });

    // Followed providers
    const followedProviders = await UserSignalSubscription.find({ userId })
      .populate('providerId', 'name performance')
      .limit(5);

    // Recent trades
    const recentTrades = await Trade.find({ userId })
      .sort({ timestamp: -1 })
      .limit(5)
      .select('symbol side pnl timestamp status');

    res.json({
      performance: {
        totalPnL: stats.totalPnL,
        totalTrades: stats.totalTrades,
        winRate: stats.totalTrades > 0
          ? (stats.winningTrades / stats.totalTrades * 100)
          : 0,
        avgPnL: stats.avgPnL
      },
      activePositions,
      executionRate: signalsReceived > 0
        ? (signalsExecuted / signalsReceived * 100)
        : 0,
      followedProviders,
      recentTrades
    });
  } catch (error) {
    console.error('[Trader API] Error fetching overview:', error);
    res.status(500).json({ error: 'Failed to fetch trader overview' });
  }
});
```

---

### POST /api/trader/signals/:id/follow

```javascript
const UserSignalSubscription = require('../../models/UserSignalSubscription');

router.post('/signals/:id/follow', async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const { following } = req.body;

    // Verify provider exists and is in same community
    const provider = await SignalProvider.findOne({
      _id: id,
      tenantId: req.user.tenantId,
      enabled: true
    });

    if (!provider) {
      return res.status(404).json({ error: 'Signal provider not found' });
    }

    if (following) {
      // Create subscription
      await UserSignalSubscription.findOneAndUpdate(
        { userId, providerId: id },
        {
          userId,
          providerId: id,
          tenantId: req.user.tenantId,
          active: true
        },
        { upsert: true }
      );
    } else {
      // Remove subscription
      await UserSignalSubscription.deleteOne({
        userId,
        providerId: id
      });
    }

    res.json({
      success: true,
      message: `Successfully ${following ? 'followed' : 'unfollowed'} signal provider`
    });
  } catch (error) {
    console.error('[Trader API] Error updating signal subscription:', error);
    res.status(500).json({ error: 'Failed to update signal subscription' });
  }
});
```

---

### GET /api/trader/trades

**With Filters and Pagination**:

```javascript
router.get('/trades', async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      page = 1,
      limit = 25,
      symbol = '',
      side = '',
      startDate = '',
      endDate = '',
      status = ''
    } = req.query;

    // Build filter
    const filter = { userId };

    if (symbol) {
      filter.symbol = { $regex: symbol, $options: 'i' };
    }

    if (side) {
      filter.side = side;
    }

    if (status) {
      filter.status = status;
    }

    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) filter.timestamp.$gte = new Date(startDate);
      if (endDate) filter.timestamp.$lte = new Date(endDate);
    }

    // Get total count
    const total = await Trade.countDocuments(filter);

    // Get paginated trades
    const trades = await Trade.find(filter)
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    res.json({
      trades,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('[Trader API] Error fetching trades:', error);
    res.status(500).json({ error: 'Failed to fetch trades' });
  }
});
```

---

## Performance Optimization

### Indexes

Add these indexes to your MongoDB collections for optimal query performance:

```javascript
// User collection
db.users.createIndex({ tenantId: 1, communityRole: 1 });
db.users.createIndex({ tenantId: 1, 'activity.lastSeen': -1 });
db.users.createIndex({ tenantId: 1, createdAt: -1 });

// Trade collection
db.trades.createIndex({ tenantId: 1, status: 1, timestamp: -1 });
db.trades.createIndex({ userId: 1, timestamp: -1 });
db.trades.createIndex({ userId: 1, status: 1, exitPrice: 1 });
db.trades.createIndex({ tenantId: 1, timestamp: 1 }); // For time series

// Signal collection
db.signals.createIndex({ tenantId: 1, createdAt: -1 });
db.signals.createIndex({ providerId: 1, createdAt: -1 });

// SignalProvider collection
db.signalproviders.createIndex({ tenantId: 1, enabled: 1 });
db.signalproviders.createIndex({ tenantId: 1, 'performance.totalPnL': -1 });

// UserSignalSubscription collection
db.usersignalsubscriptions.createIndex({ userId: 1, providerId: 1 }, { unique: true });
db.usersignalsubscriptions.createIndex({ userId: 1, active: 1 });
```

### Redis Caching Strategy

```javascript
// Cache keys follow pattern: {type}:{tenantId}:{range/id}
// Examples:
// - analytics:community_123:30d
// - overview:community_123
// - subscription:community_123

// TTLs:
// - Analytics: 300 seconds (5 minutes)
// - Overview: 60 seconds (1 minute)
// - Subscription: 3600 seconds (1 hour)
```

---

## Next Steps

1. **Implement Database Models**: Ensure all referenced models exist (`Trade`, `Signal`, `SignalProvider`, `UserSignalSubscription`, `SecurityAudit`)
2. **Add Indexes**: Run the index creation commands in MongoDB
3. **Setup Redis**: Configure Redis connection in `src/services/redis.js`
4. **Replace Mock Data**: Update API routes in `src/routes/api/community.js` and `src/routes/api/trader.js`
5. **Test Queries**: Use integration tests to verify query performance
6. **Monitor Performance**: Add logging for slow queries (>100ms)

See `INTEGRATION_GUIDE.md` for Stripe and Discord integration patterns.
