# Dual Dashboard System - Deployment Guide

This guide covers deploying the dual dashboard system (Phases 1-6) to staging and production environments with gradual rollout capability.

## Overview

The dual dashboard system provides separate, optimized dashboards for:
- **Community Dashboard**: Admin/moderator view with member management, signal provider configuration, and analytics
- **Trader Dashboard**: Individual trader view with signal feed, trade history, and personal settings

## Prerequisites

1. **Environment Setup**:
   - MongoDB database accessible
   - Redis cache accessible (optional but recommended for analytics)
   - Stripe account for subscription management
   - Discord bot configured for webhooks

2. **Dependencies Installed**:
   ```bash
   npm install
   ```

3. **Tests Passing**:
   ```bash
   npm run test:integration
   ```

## Deployment Process

### 1. Staging Deployment (100% Rollout)

Deploy to staging environment with full rollout for testing:

```bash
cd scripts/deployment
chmod +x deploy-dual-dashboard.sh
./deploy-dual-dashboard.sh staging 100
```

**Expected Output**:
- ✅ Pre-deployment checks passed
- ✅ Database indexes created
- ✅ Frontend built
- ✅ Feature flags configured
- ✅ Application deployed
- ✅ Post-deployment verification passed
- ✅ Deployment report generated

### 2. Production Deployment (Gradual Rollout)

#### Phase 1: 10% Rollout

Deploy to 10% of users to validate in production:

```bash
./deploy-dual-dashboard.sh production 10
```

**Monitoring (24-48 hours)**:
- Check error rates in application logs
- Monitor SecurityAudit collection for access control issues
- Review user engagement metrics
- Gather user feedback

#### Phase 2: 50% Rollout

If Phase 1 is stable, increase to 50%:

```bash
./deploy-dual-dashboard.sh production 50
```

**Monitoring (24-48 hours)**:
- Validate performance under increased load
- Check Redis cache hit rates
- Monitor database query performance
- Review API response times

#### Phase 3: 100% Rollout

If Phase 2 is stable, complete the rollout:

```bash
./deploy-dual-dashboard.sh production 100
```

**Final Validation**:
- All users see new dual dashboard system
- Legacy dashboard code can be deprecated
- Performance metrics meet targets

## Feature Flag Configuration

### Environment Variables

```bash
# Enable/disable the feature
ENABLE_DUAL_DASHBOARDS=true

# Gradual rollout percentage (1-100)
DUAL_DASHBOARD_ROLLOUT_PERCENTAGE=10

# Optional: Track when flags were last updated
FEATURE_FLAGS_UPDATED_AT=2025-01-15T10:30:00Z
```

### How Rollout Works

The feature flag middleware uses **consistent hashing** based on user ID:

```javascript
// Same user always gets same result
const userId = user._id.toString();
const hash = hashString(userId);
const userPercentile = hash % 100; // 0-99

// Enable if user falls within rollout percentage
return userPercentile < rolloutPercentage;
```

**Benefits**:
- Users don't flip-flop between old and new dashboards
- Predictable rollout behavior
- Easy to debug specific user issues

### Checking Feature Flag Status

```bash
# Via API endpoint (admin only)
curl https://your-app.com/api/admin/feature-flags

# Via environment variable
echo $DUAL_DASHBOARD_ROLLOUT_PERCENTAGE
```

## Database Migrations

### Create Indexes

The deployment script automatically creates indexes. To run manually:

```bash
node scripts/deployment/create-dual-dashboard-indexes.js production
```

**Indexes Created**:
- User collection: tenant scoping, role queries, activity tracking
- Trade collection: tenant scoping, status queries, time series
- Signal collection: tenant scoping, provider queries, expiration
- SignalProvider collection: tenant scoping, performance sorting
- UserSignalSubscription collection: user-provider uniqueness, active subscriptions
- SecurityAudit collection: tenant scoping, risk level queries, TTL

### Verify Index Performance

```javascript
// MongoDB shell
db.trades.getIndexes()
db.trades.stats()

// Explain query performance
db.trades.find({ tenantId: ObjectId("..."), status: "FILLED" }).explain("executionStats")
```

## Rollback Procedure

If issues are detected after deployment:

### 1. Disable Feature Flag

```bash
# Via Railway CLI
railway env set ENABLE_DUAL_DASHBOARDS=false

# Via Heroku CLI
heroku config:set ENABLE_DUAL_DASHBOARDS=false --app discord-trade-exec

# Via .env file (staging)
echo "ENABLE_DUAL_DASHBOARDS=false" >> .env.staging
```

### 2. Redeploy

```bash
# Redeploy with feature disabled
railway up  # or heroku push

# Monitor logs
railway logs  # or heroku logs --tail
```

### 3. Revert Code (If Necessary)

```bash
# Find last stable commit
git log --oneline

# Revert to previous version
git revert HEAD
git push production main
```

## Performance Benchmarks

### Target Metrics

- **Route Decision Overhead**: <500ms
- **Overview Page Load**: <2s
- **Analytics Query**: <1s (with Redis cache)
- **API Response Time (p95)**: <500ms
- **Database Query Time (p95)**: <100ms

### Monitoring Queries

```javascript
// Average response times
db.securityAudits.aggregate([
  { $match: { action: { $regex: /^dashboard\./ }, timestamp: { $gte: ISODate("2025-01-15") } } },
  { $group: { _id: "$action", avgDuration: { $avg: "$duration" }, count: { $sum: 1 } } },
  { $sort: { avgDuration: -1 } }
])

// Slow queries (>1000ms)
db.securityAudits.find({
  duration: { $gt: 1000 },
  timestamp: { $gte: ISODate("2025-01-15") }
}).sort({ duration: -1 })
```

## Security Considerations

### Access Control Validation

All dashboard endpoints enforce role-based access:

```javascript
// Community dashboard - admin/moderator only
app.use('/dashboard/community', requireCommunityAdmin, communityDashboardRoutes);

// Trader dashboard - all authenticated users
app.use('/dashboard/trader', requireAuthenticated, traderDashboardRoutes);
```

### Tenant Isolation

All queries automatically scoped by `tenantId`:

```javascript
// Via tenantScopingPlugin
const trades = await Trade.find({ /* automatically adds tenantId */ });

// Manual scoping in aggregations
db.trades.aggregate([
  { $match: { tenantId: user.tenantId } },
  // ...
])
```

### Security Audit Logging

All security-sensitive operations logged to `SecurityAudit` collection:

```javascript
// Role changes
await SecurityAudit.log({
  communityId: user.tenantId,
  userId: admin._id,
  action: 'user.role_change',
  resourceType: 'User',
  resourceId: targetUser._id,
  operation: 'UPDATE',
  status: 'success',
  dataBefore: { role: 'trader' },
  dataAfter: { role: 'admin' },
  riskLevel: 'high',
  requiresReview: true
});
```

## Troubleshooting

### Issue: Users See Legacy Dashboard Instead of Dual Dashboard

**Cause**: Feature flag not enabled or rollout percentage too low

**Solution**:
```bash
# Check feature flag status
railway env | grep DUAL_DASHBOARD

# Ensure it's enabled
railway env set ENABLE_DUAL_DASHBOARDS=true
railway env set DUAL_DASHBOARD_ROLLOUT_PERCENTAGE=100
```

### Issue: "Permission Denied" on Dashboard Access

**Cause**: User role doesn't match dashboard requirements

**Solution**:
```javascript
// Verify user role in database
db.users.findOne({ discordId: "USER_DISCORD_ID" }, { communityRole: 1 })

// Update role if needed (admin action)
db.users.updateOne(
  { discordId: "USER_DISCORD_ID" },
  { $set: { communityRole: "admin" } }
)

// Verify SecurityAudit logging
db.securityAudits.find({
  action: "security.unauthorized_access",
  userId: ObjectId("USER_ID")
}).sort({ timestamp: -1 }).limit(10)
```

### Issue: Slow Dashboard Performance

**Cause**: Missing indexes or cache not configured

**Solution**:
```bash
# Recreate indexes
node scripts/deployment/create-dual-dashboard-indexes.js production

# Verify Redis connection
node scripts/test-redis-connection.js

# Check slow queries in MongoDB Atlas
# Performance Advisor > Slow Queries

# Enable Redis caching
railway env set REDIS_URL="redis://..."
```

### Issue: Analytics Data Not Updating

**Cause**: Redis cache TTL too long or stale data

**Solution**:
```javascript
// Clear Redis cache
const RedisService = require('./src/services/redis');
await RedisService.del('analytics:*'); // Clear all analytics caches

// Verify cache configuration
console.log(process.env.REDIS_URL);

// Test cache operations
await RedisService.set('test', 'value', 300);
const value = await RedisService.get('test');
```

## Post-Deployment Checklist

- [ ] All pre-deployment checks passed
- [ ] Database indexes created successfully
- [ ] Frontend build completed without errors
- [ ] Feature flags configured correctly
- [ ] Application deployed successfully
- [ ] Health check endpoint responding
- [ ] Sample user can access appropriate dashboard
- [ ] Role-based access control working correctly
- [ ] Analytics queries completing within target time
- [ ] Redis cache hit rate >60% (if configured)
- [ ] No error spikes in application logs
- [ ] SecurityAudit logging capturing events
- [ ] Deployment report generated and reviewed

## Support Contacts

- **Engineering Team**: eng@example.com
- **On-Call Engineer**: oncall@example.com
- **Status Page**: https://status.example.com
- **Internal Docs**: https://docs.example.com/dual-dashboard

## Additional Resources

- [Phase 1-6 Implementation Guide](./INTEGRATION_GUIDE.md)
- [Database Query Patterns](../DATABASE_QUERIES.md)
- [API Documentation](./API.md)
- [Security Audit Guide](./SECURITY_AUDIT.md)

---

**Last Updated**: 2025-01-15
**Version**: 1.0.0
