# Database Migration Plan: Dual Dashboard System

**Status**: 📋 **IMPLEMENTATION ROADMAP**
**Priority**: Medium (can be done post-deployment with mock data)
**Estimated Effort**: 2-3 weeks (incremental)

---

## Overview

The dual dashboard system is currently **scaffolded with mock data** and ready for deployment. This document outlines the incremental plan for implementing real database queries to replace mock data in Phases 2, 3, and 5.

**Key Insight**: The scaffolded system provides immediate value by validating UX, routing, and access control. Database integration can proceed in parallel with user testing.

---

## Current State

### ✅ Complete
- Phase 1: Routing infrastructure (100%)
- Phase 4: Shared components (100%)
- Phase 6: Testing framework (100%)
- Phase 7: Deployment automation (100%)
- Database models: Signal, UserSignalSubscription (100%)
- Database indexes: 42 indexes across 7 models (100%)

### 📦 Scaffolded (UI Complete, DB Pending)
- Phase 2: Community Dashboard (95% - needs DB queries)
- Phase 3: Trader Dashboard (90% - needs DB queries + broker mgmt)
- Phase 5: API Implementation (80% - needs DB queries)

---

## Migration Strategy

### Approach: **Incremental Integration**

1. **Deploy scaffolded version first** (mock data)
   - Validates routing, access control, UX
   - Users can provide feedback on interface
   - No risk of data corruption

2. **Implement DB queries incrementally**
   - Replace mock data one endpoint at a time
   - Test each integration thoroughly
   - Roll out via feature flags if needed

3. **Validate in production**
   - Monitor query performance
   - Optimize indexes based on real usage
   - Gather user feedback on data accuracy

---

## Phase 2: Community Dashboard Database Integration

### Priority Order

#### 🔴 HIGH PRIORITY (Week 1)

**2.1 Community Overview - Member Metrics**
- **Endpoint**: `GET /api/community/overview`
- **Current**: Mock data (static counts)
- **Needed**: Real-time aggregation from User collection

**Implementation**:
```javascript
// src/routes/api/community.js
router.get('/overview', requireCommunityAdmin, async (req, res) => {
  const communityId = req.user.tenantId;

  // Member count
  const memberCount = await User.countDocuments({
    tenantId: communityId,
    status: 'active'
  });

  // Active traders (trades in last 30 days)
  const activeTraders = await Trade.distinct('userId', {
    tenantId: communityId,
    createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
  });

  // Today's activity
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const todayTrades = await Trade.countDocuments({
    tenantId: communityId,
    createdAt: { $gte: todayStart }
  });

  res.json({
    memberCount,
    activeTraders: activeTraders.length,
    todayTrades,
    // ... other metrics
  });
});
```

**Validation**:
- Numbers match database reality
- Query completes in <500ms
- Redis caching reduces load

---

**2.2 Signal Provider Performance**
- **Endpoint**: `GET /api/community/signals`
- **Current**: Mock provider data
- **Needed**: Real SignalProvider aggregation

**Implementation**:
```javascript
router.get('/signals', requireCommunityAdmin, async (req, res) => {
  const communityId = req.user.tenantId;

  const providers = await SignalProvider.find({
    communityId,
    enabled: true
  })
  .populate('performance.totalSignals')
  .populate('performance.successfulSignals')
  .sort({ 'performance.winRate': -1 })
  .lean();

  res.json({ providers });
});
```

**Validation**:
- Providers sorted by win rate
- Performance metrics accurate
- Query optimized with indexes

---

**2.3 Member Activity Table**
- **Endpoint**: `GET /api/community/members`
- **Current**: Mock member list
- **Needed**: Paginated User query with trade stats

**Implementation**:
```javascript
router.get('/members', requireCommunityAdmin, async (req, res) => {
  const { page = 1, limit = 25, search, role } = req.query;
  const communityId = req.user.tenantId;

  const query = { tenantId: communityId };
  if (search) {
    query.$or = [
      { discordUsername: new RegExp(search, 'i') },
      { email: new RegExp(search, 'i') }
    ];
  }
  if (role) {
    query.communityRole = role;
  }

  const members = await User.find(query)
    .select('discordUsername email communityRole createdAt lastActive')
    .sort({ lastActive: -1 })
    .limit(limit)
    .skip((page - 1) * limit)
    .lean();

  // Enrich with trade stats (parallel queries)
  const memberIds = members.map(m => m._id);
  const tradeStats = await Trade.aggregate([
    { $match: {
      tenantId: communityId,
      userId: { $in: memberIds }
    }},
    { $group: {
      _id: '$userId',
      totalTrades: { $sum: 1 },
      totalPnL: { $sum: '$profitLoss' }
    }}
  ]);

  // Merge stats into members
  const statsMap = new Map(tradeStats.map(s => [s._id.toString(), s]));
  members.forEach(m => {
    const stats = statsMap.get(m._id.toString()) || { totalTrades: 0, totalPnL: 0 };
    m.totalTrades = stats.totalTrades;
    m.totalPnL = stats.totalPnL;
  });

  const total = await User.countDocuments(query);

  res.json({ members, total, page, pages: Math.ceil(total / limit) });
});
```

**Validation**:
- Pagination works correctly
- Search filters members
- Trade stats accurate
- Query <500ms for 10,000 members

---

#### 🟡 MEDIUM PRIORITY (Week 2)

**2.4 Community Analytics**
- **Endpoint**: `GET /api/community/analytics/performance`
- **Current**: Mock chart data
- **Needed**: Time series aggregation with Redis caching

**Implementation**:
```javascript
const RedisService = require('../../services/redis');

router.get('/analytics/performance', requireCommunityAdmin, async (req, res) => {
  const { dateRange = '30d' } = req.query;
  const communityId = req.user.tenantId;

  // Check Redis cache
  const cacheKey = `analytics:community:${communityId}:${dateRange}`;
  const cached = await RedisService.get(cacheKey);
  if (cached) {
    return res.json(JSON.parse(cached));
  }

  // Calculate date range
  const days = parseInt(dateRange);
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Aggregate trade performance by day
  const dailyPerformance = await Trade.aggregate([
    { $match: {
      tenantId: communityId,
      createdAt: { $gte: startDate },
      status: 'FILLED',
      exitPrice: { $exists: true }
    }},
    { $group: {
      _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
      totalTrades: { $sum: 1 },
      totalPnL: { $sum: '$profitLoss' },
      winningTrades: {
        $sum: { $cond: [{ $gt: ['$profitLoss', 0] }, 1, 0] }
      }
    }},
    { $sort: { _id: 1 } },
    { $project: {
      date: '$_id',
      totalTrades: 1,
      totalPnL: 1,
      winRate: {
        $multiply: [
          { $divide: ['$winningTrades', '$totalTrades'] },
          100
        ]
      },
      _id: 0
    }}
  ]);

  const result = { dailyPerformance, dateRange };

  // Cache for 5 minutes
  await RedisService.set(cacheKey, JSON.stringify(result), 300);

  res.json(result);
});
```

**Validation**:
- Chart data matches trades
- Redis cache reduces DB load
- Query <1s with caching
- Date range filters work

---

**2.5 Role Management with Audit Logging**
- **Endpoint**: `POST /api/community/members/:id/role`
- **Current**: Scaffolded endpoint
- **Needed**: User update + SecurityAudit logging

**Implementation**:
```javascript
const SecurityAudit = require('../../models/SecurityAudit');

router.post('/members/:id/role', requireCommunityAdmin, async (req, res) => {
  const { role } = req.body;
  const { id: userId } = req.params;
  const communityId = req.user.tenantId;

  // Validate role
  if (!['admin', 'moderator', 'trader', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  // Get current user state
  const user = await User.findOne({ _id: userId, tenantId: communityId });
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const oldRole = user.communityRole;

  // Update role
  user.communityRole = role;
  await user.save();

  // Log to SecurityAudit
  await SecurityAudit.log({
    communityId,
    userId: req.user._id,
    action: 'user.role_change',
    resourceType: 'User',
    resourceId: userId,
    operation: 'UPDATE',
    status: 'success',
    dataBefore: { role: oldRole },
    dataAfter: { role },
    riskLevel: 'high',
    requiresReview: true,
    metadata: {
      performedBy: req.user.discordUsername,
      timestamp: new Date()
    }
  });

  res.json({ success: true, user });
});
```

**Validation**:
- Role changes persist
- SecurityAudit entries created
- High-risk operations flagged
- Audit log queryable

---

#### 🟢 LOW PRIORITY (Week 3)

**2.6 Billing and Subscription**
- **Endpoint**: `GET /api/community/subscription`
- **Current**: Billing provider abstraction wired to Polar mock data
- **Needed**: Live Polar product IDs + webhook-driven status updates

**Implementation**:
```javascript
const BillingProviderFactory = require('../../services/billing/BillingProviderFactory');

router.get('/subscription', requireCommunityAdmin, async (req, res) => {
  const community = await Community.findById(req.user.tenantId);

  if (!community.subscription?.polarCustomerId) {
    return res.json({ tier: 'free', subscription: null });
  }

  const billingProvider = BillingProviderFactory.createProvider();
  const subscription = await billingProvider.getSubscription(
    community.subscription.polarCustomerId
  );

  res.json({
    tier: community.subscription.tier,
    subscription,
    usage: {
      members: await User.countDocuments({ communityId: community._id }),
      signals: await Signal.countDocuments({ communityId: community._id })
    }
  });
});
```

**Dependencies**:
- Polar billing provider (`BillingProviderFactory` + `polar.js`)
- Community subscription schema includes `polarCustomerId`
- Tier limits defined in configuration

---

## Phase 3: Trader Dashboard Database Integration

### Priority Order

#### 🔴 HIGH PRIORITY (Week 1)

**3.1 Trader Overview - Personal Metrics**
- **Endpoint**: `GET /api/trader/overview`
- **Current**: Mock personal data
- **Needed**: User-specific aggregation

**Implementation**:
```javascript
router.get('/overview', requireAuthenticated, async (req, res) => {
  const userId = req.user._id;
  const communityId = req.user.tenantId;

  // Active positions
  const activePositions = await Trade.countDocuments({
    userId,
    tenantId: communityId,
    status: 'OPEN'
  });

  // P&L calculation (last 30 days)
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const pnlStats = await Trade.aggregate([
    { $match: {
      userId,
      tenantId: communityId,
      status: 'FILLED',
      exitPrice: { $exists: true },
      createdAt: { $gte: startDate }
    }},
    { $group: {
      _id: null,
      totalPnL: { $sum: '$profitLoss' },
      totalTrades: { $sum: 1 },
      winningTrades: {
        $sum: { $cond: [{ $gt: ['$profitLoss', 0] }, 1, 0] }
      }
    }}
  ]);

  const stats = pnlStats[0] || { totalPnL: 0, totalTrades: 0, winningTrades: 0 };
  const winRate = stats.totalTrades > 0
    ? (stats.winningTrades / stats.totalTrades) * 100
    : 0;

  // Followed providers
  const followedProviders = await UserSignalSubscription.countDocuments({
    userId,
    communityId,
    active: true
  });

  res.json({
    activePositions,
    totalPnL: stats.totalPnL,
    winRate,
    totalTrades: stats.totalTrades,
    followedProviders
  });
});
```

**Validation**:
- Personal metrics accurate
- Only user's data returned
- Query <500ms

---

**3.2 Signal Feed - Provider Discovery**
- **Endpoint**: `GET /api/trader/signals`
- **Current**: Mock provider list
- **Needed**: Community-scoped providers with follow status

**Implementation**:
```javascript
router.get('/signals', requireAuthenticated, async (req, res) => {
  const userId = req.user._id;
  const communityId = req.user.tenantId;

  // Get all providers in community
  const providers = await SignalProvider.find({
    communityId,
    enabled: true
  })
  .select('name description performance discordChannelId')
  .sort({ 'performance.winRate': -1 })
  .lean();

  // Get user's follow status
  const subscriptions = await UserSignalSubscription.find({
    userId,
    communityId,
    active: true
  }).select('providerId');

  const followedIds = new Set(subscriptions.map(s => s.providerId.toString()));

  // Enrich providers with follow status
  providers.forEach(p => {
    p.isFollowing = followedIds.has(p._id.toString());
  });

  res.json({ providers });
});
```

**Validation**:
- Providers scoped to community
- Follow status accurate
- Performance metrics displayed

---

**3.3 Follow/Unfollow Providers**
- **Endpoint**: `POST /api/trader/signals/:id/follow`
- **Current**: Scaffolded
- **Needed**: Create/update UserSignalSubscription

**Implementation**:
```javascript
router.post('/signals/:id/follow', requireAuthenticated, async (req, res) => {
  const { id: providerId } = req.params;
  const { autoExecute = false } = req.body;
  const userId = req.user._id;
  const communityId = req.user.tenantId;

  // Validate provider exists in community
  const provider = await SignalProvider.findOne({
    _id: providerId,
    communityId
  });
  if (!provider) {
    return res.status(404).json({ error: 'Provider not found' });
  }

  // Find or create subscription
  let subscription = await UserSignalSubscription.findOne({
    userId,
    providerId
  });

  if (subscription) {
    // Update existing
    subscription.active = true;
    subscription.autoExecute = autoExecute;
    await subscription.save();
  } else {
    // Create new
    subscription = await UserSignalSubscription.create({
      communityId,
      userId,
      providerId,
      active: true,
      autoExecute
    });
  }

  res.json({ success: true, subscription });
});

router.delete('/signals/:id/follow', requireAuthenticated, async (req, res) => {
  const { id: providerId } = req.params;
  const userId = req.user._id;

  await UserSignalSubscription.updateOne(
    { userId, providerId },
    { $set: { active: false } }
  );

  res.json({ success: true });
});
```

**Validation**:
- Subscription created/updated
- Unique constraint enforced (one sub per user per provider)
- Active status toggles correctly

---

**3.4 Trade History with Pagination**
- **Endpoint**: `GET /api/trader/trades`
- **Current**: Mock trade list
- **Needed**: Paginated Trade query with filters

**Implementation**:
```javascript
router.get('/trades', requireAuthenticated, async (req, res) => {
  const {
    page = 1,
    limit = 25,
    status,
    dateFrom,
    dateTo,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;

  const userId = req.user._id;
  const communityId = req.user.tenantId;

  // Build query
  const query = { userId, tenantId: communityId };

  if (status) query.status = status;
  if (dateFrom || dateTo) {
    query.createdAt = {};
    if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
    if (dateTo) query.createdAt.$lte = new Date(dateTo);
  }

  // Execute query
  const trades = await Trade.find(query)
    .populate('signalSource.providerId', 'name')
    .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
    .limit(parseInt(limit))
    .skip((page - 1) * limit)
    .lean();

  const total = await Trade.countDocuments(query);

  res.json({
    trades,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / limit)
  });
});
```

**Validation**:
- Pagination works for 10,000+ trades
- Filters apply correctly
- Sorting by any column
- Query <500ms

---

#### 🟡 MEDIUM PRIORITY (Week 2)

**3.5 Risk Profile Settings**
- **Endpoint**: `PUT /api/trader/risk-profile`
- **Current**: Scaffolded
- **Needed**: Update User.tradingConfig

**Implementation**:
```javascript
router.put('/risk-profile', requireAuthenticated, async (req, res) => {
  const {
    positionSizing,
    riskManagement,
    defaultStopLoss,
    defaultTakeProfit,
    maxLeverage
  } = req.body;

  const user = await User.findById(req.user._id);

  // Update trading config
  user.tradingConfig = {
    ...user.tradingConfig,
    positionSizing: {
      enabled: positionSizing?.enabled ?? true,
      method: positionSizing?.method ?? 'percentage',
      percentagePerTrade: positionSizing?.percentagePerTrade ?? 2
    },
    riskManagement: {
      enabled: riskManagement?.enabled ?? true,
      defaultStopLoss: defaultStopLoss ?? 2,
      defaultTakeProfit: defaultTakeProfit ?? 5,
      maxLeverage: maxLeverage ?? 1
    }
  };

  await user.save();

  res.json({ success: true, tradingConfig: user.tradingConfig });
});
```

**Validation**:
- Settings persist
- Applied to new trades
- Validation on percentages

---

**3.6 Personal Analytics**
- **Endpoint**: `GET /api/trader/analytics/performance`
- **Current**: Mock chart data
- **Needed**: User-specific time series with caching

**Implementation**: Similar to community analytics but filtered by userId

---

## Phase 5: Cross-Cutting API Concerns

### 5.1 Rate Limiting

**Install Dependency**:
```bash
npm install express-rate-limit
```

**Implementation**:
```javascript
// src/middleware/rateLimiter.js
const rateLimit = require('express-rate-limit');

const overviewLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: 'Too many requests, please try again later'
});

const analyticsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: 'Analytics rate limit exceeded'
});

module.exports = { overviewLimiter, analyticsLimiter };
```

**Apply to Routes**:
```javascript
const { overviewLimiter, analyticsLimiter } = require('../../middleware/rateLimiter');

router.get('/overview', overviewLimiter, requireCommunityAdmin, async (req, res) => {
  // ...
});

router.get('/analytics/performance', analyticsLimiter, requireCommunityAdmin, async (req, res) => {
  // ...
});
```

---

### 5.2 Tenant Scoping Validation

**Enhance Middleware**:
```javascript
// src/middleware/requireCommunityAdmin.js
async function requireCommunityAdmin(req, res, next) {
  if (!req.user || !['admin', 'moderator'].includes(req.user.communityRole)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  // Ensure all queries include tenantId
  req.tenantId = req.user.tenantId;

  next();
}
```

**Apply in Queries**:
```javascript
// Always include tenantId in queries
const members = await User.find({
  tenantId: req.tenantId, // Enforced by middleware
  // ... other filters
});
```

---

### 5.3 Error Handling

**Create Error Handler**:
```javascript
// src/middleware/errorHandler.js
function errorHandler(err, req, res, next) {
  console.error('API Error:', err);

  // MongoDB errors
  if (err.name === 'CastError') {
    return res.status(400).json({ error: 'Invalid ID format' });
  }
  if (err.code === 11000) {
    return res.status(409).json({ error: 'Duplicate entry' });
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }

  // Default
  res.status(500).json({ error: 'Internal server error' });
}

module.exports = errorHandler;
```

**Apply Globally**:
```javascript
// src/app.js
const errorHandler = require('./middleware/errorHandler');

// ... routes ...

app.use(errorHandler);
```

---

## Testing Strategy

### Unit Tests for Each Endpoint

```javascript
// tests/integration/community-api.test.js
describe('Community API - Database Integration', () => {
  describe('GET /api/community/overview', () => {
    it('returns accurate member count', async () => {
      // Seed test data
      await User.create([
        { tenantId: community._id, discordUsername: 'user1' },
        { tenantId: community._id, discordUsername: 'user2' }
      ]);

      const res = await request(app)
        .get('/api/community/overview')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.memberCount).toBe(2);
    });

    it('returns accurate trade count', async () => {
      // Seed trades
      await Trade.create([
        { tenantId: community._id, userId: user1._id, symbol: 'BTC/USD' }
      ]);

      const res = await request(app)
        .get('/api/community/overview')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.body.todayTrades).toBe(1);
    });
  });
});
```

---

## Performance Optimization

### Index Validation

Run after each integration:
```bash
node scripts/deployment/create-dual-dashboard-indexes.js production
```

### Query Performance Testing

```javascript
// Add to each query
const startTime = Date.now();
const result = await Trade.find({ ... });
const duration = Date.now() - startTime;

if (duration > 500) {
  console.warn(`Slow query: ${duration}ms`, { query });
}
```

### Redis Caching Verification

```javascript
// Monitor cache hit rate
const cacheStats = {
  hits: 0,
  misses: 0,
  hitRate() {
    return this.hits / (this.hits + this.misses) * 100;
  }
};

// In cached endpoints
const cached = await RedisService.get(key);
if (cached) {
  cacheStats.hits++;
} else {
  cacheStats.misses++;
}
```

---

## Deployment Strategy

### Incremental Rollout

**Week 1**: High-priority endpoints
- Deploy to staging
- Validate queries
- Monitor performance
- Deploy to production (10%)

**Week 2**: Medium-priority endpoints
- Deploy to staging
- Validate integrations
- Deploy to production (50%)

**Week 3**: Low-priority endpoints
- Complete remaining integrations
- Full validation
- Deploy to production (100%)

---

## Rollback Plan

If database integration causes issues:

1. **Revert Endpoint to Mock Data**:
   ```javascript
   if (process.env.USE_MOCK_DATA === 'true') {
     return res.json(mockData);
   }
   // Real query
   ```

2. **Feature Flag Control**:
   ```javascript
   if (!featureFlags.isDbIntegrationEnabled()) {
     return res.json(mockData);
   }
   ```

3. **Full Rollback**:
   ```bash
   git revert [integration-commit]
   ```

---

## Success Criteria

### Database Integration Complete When:

- [ ] All mock data replaced with real queries
- [ ] All endpoints return accurate data
- [ ] Query performance <500ms (p95)
- [ ] Redis cache hit rate >60%
- [ ] No data leakage between communities
- [ ] SecurityAudit logging captures all sensitive ops
- [ ] Rate limiting prevents abuse
- [ ] Error handling is comprehensive
- [ ] 90%+ test coverage maintained
- [ ] Production monitoring validates performance

---

## Timeline Summary

| Week | Focus | Endpoints |
|------|-------|-----------|
| Week 1 | High-priority community & trader | Overview, signals, members, trades |
| Week 2 | Medium-priority analytics | Performance charts, analytics, risk settings |
| Week 3 | Low-priority integrations | Billing, notifications, advanced features |

**Total Estimated Time**: 2-3 weeks (can be done incrementally post-deployment)

---

**📚 References**

- Database query patterns: `docs/DATABASE_QUERIES.md`
- Integration guide: `openspec/changes/implement-dual-dashboard-system/INTEGRATION_GUIDE.md`
- Model definitions: `src/models/*.js`
- Existing API patterns: `src/routes/api/*.js`

---

**🚀 Ready to Begin**

Database migration can start immediately after staging deployment validates the scaffolded system. The incremental approach ensures minimal risk and continuous validation.
