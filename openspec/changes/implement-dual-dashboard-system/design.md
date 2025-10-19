# Design: Dual Dashboard System

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Express Routes                          │
├─────────────────────────────────────────────────────────────┤
│  /dashboard                                                  │
│    ↓                                                         │
│  Role Detection Middleware                                   │
│    ↓                                                         │
│  ┌──────────────────┐         ┌───────────────────┐        │
│  │ Community Host   │         │  Trader User      │        │
│  │   Dashboard      │         │   Dashboard       │        │
│  │ /dashboard/      │         │ /dashboard/       │        │
│  │   community      │         │   trader          │        │
│  └──────────────────┘         └───────────────────┘        │
│         ↓                              ↓                     │
│  ┌──────────────────────────────────────────────┐          │
│  │          Shared Components Layer              │          │
│  │  - UI Primitives (shadcn/ui)                 │          │
│  │  - Charts, Tables, Forms                     │          │
│  │  - Hooks, Utils                              │          │
│  └──────────────────────────────────────────────┘          │
│         ↓                              ↓                     │
│  ┌──────────────────────────────────────────────┐          │
│  │              API Layer                        │          │
│  │  /api/community/*     /api/trader/*          │          │
│  └──────────────────────────────────────────────┘          │
│         ↓                              ↓                     │
│  ┌──────────────────────────────────────────────┐          │
│  │            Data Models                        │          │
│  │  Community, User (with tenant scoping)       │          │
│  └──────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

## Component Structure

### Community Host Dashboard

```
src/dashboard/pages/
  CommunityDashboard.jsx         # Main dashboard container
    ├── CommunityOverview.jsx    # KPIs: members, signals, execution rate
    ├── SignalManagement.jsx     # Configure signal channels, providers
    ├── MemberActivity.jsx       # Member list, activity feed, permissions
    ├── CommunityAnalytics.jsx   # Performance metrics, engagement
    ├── BillingSettings.jsx      # Community subscription, usage limits
    └── IntegrationSettings.jsx  # Discord webhook config, channels
```

### Trader Dashboard

```
src/dashboard/pages/
  TraderDashboard.jsx            # Main dashboard container
    ├── TraderOverview.jsx       # Personal P&L, active positions
    ├── SignalFeed.jsx           # Available signals from community
    ├── BrokerManagement.jsx     # Personal broker connections (reused)
    ├── TradeHistory.jsx         # Personal execution history
    ├── RiskSettings.jsx         # Position sizing, stop-loss preferences
    └── PersonalSettings.jsx     # Notifications, alerts, subscription
```

### Shared Components

```
src/dashboard/components/
  shared/
    ├── PerformanceChart.jsx     # Generic P&L chart (scoped by user/community)
    ├── TradeTable.jsx           # Generic trade history table
    ├── SignalCard.jsx           # Signal display component
    ├── BrokerStatusBadge.jsx    # Broker connection status
    └── SubscriptionCard.jsx     # Subscription details card

  ui/                            # Existing shadcn/ui primitives (unchanged)
    ├── button.jsx
    ├── card.jsx
    ├── dialog.jsx
    └── ...
```

## Routing Strategy

### Role Detection Flow

```javascript
// src/middleware/dashboardRouter.js
const dashboardRouter = (req, res, next) => {
  // 1. Check authentication
  if (!req.isAuthenticated()) {
    return res.redirect('/auth/discord');
  }

  // 2. Detect user role from session/database
  const user = req.user;
  const role = user.communityRole;

  // 3. Route based on role
  if (role === 'admin' || role === 'moderator') {
    // Community hosts
    if (!req.path.startsWith('/dashboard/community')) {
      return res.redirect('/dashboard/community');
    }
  } else {
    // Traders, viewers
    if (!req.path.startsWith('/dashboard/trader')) {
      return res.redirect('/dashboard/trader');
    }
  }

  next();
};
```

### URL Structure

```
/dashboard                        → Auto-redirect based on role
/dashboard/community              → Community host landing
/dashboard/community/signals      → Signal management
/dashboard/community/members      → Member management
/dashboard/community/analytics    → Community analytics
/dashboard/community/settings     → Community settings

/dashboard/trader                 → Trader landing
/dashboard/trader/signals         → Signal feed
/dashboard/trader/brokers         → Broker management
/dashboard/trader/history         → Trade history
/dashboard/trader/settings        → Personal settings
```

## API Design

### Community Host Endpoints

```
GET  /api/community/overview          # Community KPIs
GET  /api/community/members           # List members with stats
POST /api/community/members/:id/role  # Update member role
GET  /api/community/signals           # Signal providers config
PUT  /api/community/signals/:id       # Update signal provider
GET  /api/community/analytics         # Community performance
GET  /api/community/subscription      # Community billing info
```

### Trader Endpoints

```
GET  /api/trader/overview             # Personal trading KPIs
GET  /api/trader/signals              # Available signals (filtered by community)
POST /api/trader/signals/:id/follow   # Follow/unfollow signal provider
GET  /api/trader/trades               # Personal trade history
GET  /api/trader/brokers              # Personal broker connections
POST /api/trader/brokers              # Add broker connection
GET  /api/trader/settings             # Personal preferences
PUT  /api/trader/risk-profile         # Update risk settings
```

## Data Access Patterns

### Tenant Scoping (Already Implemented)

Both dashboards leverage existing tenant scoping via the `tenantScopingPlugin`:

```javascript
// Community Host queries (community-scoped)
const members = await User.find({ communityId: req.user.communityId });
const signals = await SignalProvider.find({ communityId: req.user.communityId });

// Trader queries (user-scoped within community)
const myTrades = await Trade.find({
  userId: req.user._id,
  communityId: req.user.communityId
});
```

### Performance Optimization

- **Aggregation pipelines** for community-wide metrics
- **Indexed queries** on `communityId` + role/user combinations
- **Pagination** for member lists and trade history
- **Caching** for frequently accessed community stats (Redis)

## Security Considerations

### Access Control

```javascript
// Middleware example
const requireCommunityAdmin = (req, res, next) => {
  if (!['admin', 'moderator'].includes(req.user.communityRole)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
};

// Usage
router.get('/api/community/members', requireCommunityAdmin, getMembers);
```

### Data Isolation

- Enforce `communityId` filtering on all queries
- Validate user belongs to community before returning data
- Prevent cross-community data leakage
- Audit trail for admin actions via `SecurityAudit` model

## Migration Strategy

### Phase 1: Build New Dashboards (Non-Breaking)

1. Create new routes `/dashboard/community` and `/dashboard/trader`
2. Build dashboard components
3. Implement role-based routing middleware
4. Add API endpoints with proper authorization
5. Comprehensive testing

**Status:** Current dashboard (`/dashboard`) remains functional

### Phase 2: Feature Flag Rollout

1. Add feature flag `ENABLE_DUAL_DASHBOARDS` in config
2. Gradual user migration via percentage rollout
3. Monitor for issues, collect feedback
4. A/B test for UX improvements

**Status:** Both old and new dashboards available

### Phase 3: Full Migration

1. Update auth flow to redirect to role-appropriate dashboard
2. Add deprecation notice to old dashboard
3. Sunset old unified dashboard after 30-day transition period
4. Remove legacy dashboard code

**Status:** Only dual dashboards active

## Testing Strategy

### Unit Tests

```javascript
// Dashboard routing
describe('Dashboard Router', () => {
  it('should redirect admins to community dashboard', async () => {
    const user = { communityRole: 'admin' };
    // Test redirect logic
  });

  it('should redirect traders to trader dashboard', async () => {
    const user = { communityRole: 'trader' };
    // Test redirect logic
  });
});

// API authorization
describe('Community API', () => {
  it('should deny traders access to community endpoints', async () => {
    // Test 403 response
  });
});
```

### Integration Tests

```javascript
describe('Community Dashboard Flow', () => {
  it('should display community metrics for admin', async () => {
    // E2E test with Playwright
  });

  it('should allow admin to update member roles', async () => {
    // Test member management workflow
  });
});

describe('Trader Dashboard Flow', () => {
  it('should display personal trades for trader', async () => {
    // E2E test
  });

  it('should allow trader to follow signal providers', async () => {
    // Test signal subscription workflow
  });
});
```

### Performance Tests

- Measure route decision overhead (<500ms)
- Load test API endpoints with realistic data volumes
- Verify proper query optimization and indexing

## Rollback Plan

If critical issues arise during migration:

1. **Immediate:** Disable feature flag, revert to unified dashboard
2. **Routing:** Update middleware to bypass role detection
3. **API:** Maintain backward compatibility with old endpoints
4. **Database:** No schema changes required (only application-level routing)

Recovery time: <15 minutes (config change + deployment)

## Open Questions

1. **Multi-role users:** How do we handle users who are both community hosts AND traders in different communities?
   - **Proposal:** Add role switcher in UI, default to most privileged role

2. **Dashboard customization:** Should users be able to customize widget layout?
   - **Answer:** Out of scope for initial implementation (future enhancement)

3. **Mobile experience:** Do we need mobile-specific dashboard views?
   - **Answer:** Responsive design first, mobile app later

## Trade-offs

### Chosen Approach: Separate Dashboards

**Pros:**
- Clear separation of concerns
- Tailored UX for each user type
- Easier to reason about and maintain
- Future-proof for role-specific features

**Cons:**
- Some code duplication (mitigated by shared components)
- Additional routing complexity
- Two dashboards to maintain

### Alternative Considered: Single Dashboard with Tabs

**Why Rejected:**
- Still cluttered with all features visible
- Harder to optimize per-role workflows
- Confusing mental model for users
- Doesn't scale well as features grow

### Alternative Considered: Completely Separate Apps

**Why Rejected:**
- Massive development effort
- Difficult to share components/logic
- Authentication/session complexity
- Overkill for current requirements
