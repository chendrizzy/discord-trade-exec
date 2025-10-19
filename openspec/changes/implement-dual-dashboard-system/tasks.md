# Implementation Tasks: Dual Dashboard System

## Phase 1: Foundation & Routing (Week 1)

### 1.1 Create routing infrastructure
- [ ] Create `src/middleware/dashboardRouter.js` with role detection logic
- [ ] Implement automatic redirect based on `user.communityRole`
- [ ] Add deep link preservation through auth flow (`returnTo` parameter)
- [ ] Handle unauthenticated user redirects to Discord OAuth
- [ ] Add unit tests for routing logic (all role scenarios)
- [ ] **Validation**: All routing scenarios pass tests

### 1.2 Set up dashboard page structure
- [ ] Create `src/dashboard/pages/CommunityDashboard.jsx` container
- [ ] Create `src/dashboard/pages/TraderDashboard.jsx` container
- [ ] Set up React Router routes for `/dashboard/community/*` and `/dashboard/trader/*`
- [ ] Add 404 handling for invalid dashboard routes
- [ ] Implement layout components (header, sidebar, content area)
- [ ] **Validation**: Both dashboards render without errors

### 1.3 Implement access control middleware
- [ ] Create `src/middleware/requireCommunityAdmin.js` for admin endpoints
- [ ] Create `src/middleware/requireTrader.js` for trader endpoints
- [ ] Add role validation on all protected routes
- [ ] Return 403 Forbidden with clear error messages for unauthorized access
- [ ] Add integration tests for access control
- [ ] **Validation**: Unauthorized access attempts are properly blocked

## Phase 2: Community Dashboard (Week 2)

### 2.1 Community overview page
- [ ] Create `src/dashboard/components/CommunityOverview.jsx`
- [ ] Implement `/api/community/overview` endpoint with KPIs
- [ ] Add real-time member count and activity metrics
- [ ] Display top signal providers by performance
- [ ] Create recent activity feed component
- [ ] Add loading states and error handling
- [ ] **Validation**: Overview loads in <2s with accurate data

### 2.2 Signal management interface
- [ ] Create `src/dashboard/components/SignalManagement.jsx`
- [ ] Implement `/api/community/signals` GET and PUT endpoints
- [ ] Add Discord channel validation via Discord API
- [ ] Create signal provider enable/disable toggle
- [ ] Implement signal provider configuration form
- [ ] Add success/error toast notifications
- [ ] **Validation**: Signal channels can be added and validated

### 2.3 Member management
- [ ] Create `src/dashboard/components/MemberActivity.jsx`
- [ ] Implement `/api/community/members` endpoint with pagination
- [ ] Add member role update functionality via `/api/community/members/:id/role`
- [ ] Create member detail view with trade history
- [ ] Add SecurityAudit logging for role changes
- [ ] Implement member search and filtering
- [ ] **Validation**: Role changes are logged and immediately effective

### 2.4 Community analytics
- [ ] Create `src/dashboard/components/CommunityAnalytics.jsx`
- [ ] Implement `/api/community/analytics/performance` endpoint
- [ ] Add P&L aggregation query with date range filters
- [ ] Create interactive charts using Recharts (line, bar charts)
- [ ] Implement Redis caching (5-minute TTL) for analytics
- [ ] Add export functionality for analytics reports
- [ ] **Validation**: Analytics load with cached data, charts are interactive

### 2.5 Billing and subscription
- [ ] Create `src/dashboard/components/BillingSettings.jsx`
- [ ] Implement `/api/community/subscription` endpoint
- [ ] Display current tier, usage limits, renewal date
- [ ] Add tier upgrade/downgrade UI with Stripe integration
- [ ] Link to Stripe customer portal for payment management
- [ ] Add usage progress bars and limit warnings
- [ ] **Validation**: Subscription changes reflect immediately

### 2.6 Discord integration settings
- [ ] Create `src/dashboard/components/IntegrationSettings.jsx`
- [ ] Add webhook configuration form for channels
- [ ] Implement channel validation and bot permission checks
- [ ] Create "Send Test Notification" functionality
- [ ] Display current bot status and permissions
- [ ] Add troubleshooting guide for common Discord issues
- [ ] **Validation**: Test notifications are received in configured channels

## Phase 3: Trader Dashboard (Week 3)

### 3.1 Trader overview page
- [ ] Create `src/dashboard/components/TraderOverview.jsx`
- [ ] Implement `/api/trader/overview` endpoint with personal metrics
- [ ] Display personal P&L, active positions, execution rate
- [ ] Add top followed signal providers section
- [ ] Create recent trade history widget
- [ ] Implement empty state with onboarding guide
- [ ] **Validation**: Overview displays accurate personal data in <2s

### 3.2 Signal feed and provider discovery
- [ ] Create `src/dashboard/components/SignalFeed.jsx`
- [ ] Implement `/api/trader/signals` endpoint (community-scoped providers)
- [ ] Add follow/unfollow functionality via `/api/trader/signals/:id/follow`
- [ ] Create signal provider detail modal with performance charts
- [ ] Implement provider filtering (by win rate, P&L, category)
- [ ] Add saved filter presets
- [ ] **Validation**: Following providers updates signal delivery

### 3.3 Broker management
- [ ] Reuse existing `BrokerManagement.jsx` component from unified dashboard
- [ ] Update component to work within trader dashboard layout
- [ ] Ensure OAuth flows work from new route context
- [ ] Add broker connection health checks
- [ ] Display broker balances and positions
- [ ] **Validation**: Brokers can be added/removed without errors

### 3.4 Trade history and analysis
- [ ] Create `src/dashboard/components/TradeHistory.jsx`
- [ ] Implement `/api/trader/trades` endpoint with pagination and filters
- [ ] Add sortable table with all trade columns
- [ ] Implement date range filtering with presets (7d, 30d, etc.)
- [ ] Create CSV export functionality
- [ ] Add trade detail modal with full execution data
- [ ] **Validation**: 10,000 trades export in <5s

### 3.5 Risk and position settings
- [ ] Create `src/dashboard/components/RiskSettings.jsx`
- [ ] Add position sizing configuration (percentage or fixed amount)
- [ ] Implement default stop-loss/take-profit settings
- [ ] Create risk profile presets (conservative, moderate, aggressive)
- [ ] Add position size calculator with live preview
- [ ] Save settings to `User.tradingConfig.riskManagement`
- [ ] **Validation**: Settings are applied to new trades immediately

### 3.6 Notifications and alerts
- [ ] Create `src/dashboard/components/PersonalSettings.jsx` (notifications tab)
- [ ] Add Discord DM notification toggles
- [ ] Implement alert threshold configuration (daily loss, position size)
- [ ] Create "Send Test Notification" for each channel
- [ ] Add notification history/log
- [ ] **Validation**: Test notifications are received via configured channels

### 3.7 Personal subscription management
- [ ] Reuse `SubscriptionCard` component with `type="user"` prop
- [ ] Display personal tier, usage, and renewal information
- [ ] Add inline upgrade flow with Stripe
- [ ] Link to Stripe customer portal
- [ ] Show signal usage progress (daily limit tracking)
- [ ] **Validation**: Upgrades complete and tier changes immediately

## Phase 4: Shared Components (Week 4)

### 4.1 Performance chart component
- [ ] Create `src/dashboard/components/shared/PerformanceChart.jsx`
- [ ] Support both `scope="community"` and `scope="user"` props
- [ ] Fetch data from appropriate API endpoint based on scope
- [ ] Implement date range selector (7d, 30d, 90d, 1y, all)
- [ ] Use Recharts for line chart rendering
- [ ] Add loading skeleton and error states
- [ ] **Validation**: Chart displays correct data for both scopes

### 4.2 Trade table component
- [ ] Create `src/dashboard/components/shared/TradeTable.jsx`
- [ ] Support `scope` and optional `memberId` props
- [ ] Implement client-side sorting by any column
- [ ] Add pagination (25 trades per page default)
- [ ] Create consistent column formatting (currency, percentages)
- [ ] **Validation**: Table works in both community and trader contexts

### 4.3 Signal provider card
- [ ] Create `src/dashboard/components/shared/SignalCard.jsx`
- [ ] Support `viewMode="admin"` and `viewMode="trader"` props
- [ ] Render appropriate actions based on view mode
- [ ] Display performance metrics (win rate, total signals, avg P&L)
- [ ] Add trend indicators (up/down arrows for recent performance)
- [ ] **Validation**: Card renders correctly in both dashboards

### 4.4 Broker status badge
- [ ] Create `src/dashboard/components/shared/BrokerStatusBadge.jsx`
- [ ] Display status colors (green=connected, red=error, yellow=validating)
- [ ] Add tooltip with connection details and last validated time
- [ ] Implement "Reconnect" button for error states
- [ ] **Validation**: Badge accurately reflects broker connection status

### 4.5 Subscription card component
- [ ] Create `src/dashboard/components/shared/SubscriptionCard.jsx`
- [ ] Support `type="community"` and `type="user"` props
- [ ] Display appropriate metrics based on subscription type
- [ ] Add upgrade/downgrade CTAs
- [ ] Link to Stripe customer portal
- [ ] **Validation**: Card displays correct data for both types

## Phase 5: API Implementation (Week 5)

### 5.1 Community API endpoints
- [ ] Implement `GET /api/community/overview` with aggregated metrics
- [ ] Implement `GET /api/community/members` with pagination
- [ ] Implement `POST /api/community/members/:id/role` with audit logging
- [ ] Implement `GET /api/community/signals` for provider list
- [ ] Implement `PUT /api/community/signals/:id` for provider config
- [ ] Implement `GET /api/community/analytics/performance` with caching
- [ ] Implement `GET /api/community/subscription` for billing info
- [ ] Add rate limiting (100 req/min for overview, 20 req/min for analytics)
- [ ] **Validation**: All endpoints return correct data with proper authorization

### 5.2 Trader API endpoints
- [ ] Implement `GET /api/trader/overview` with personal metrics
- [ ] Implement `GET /api/trader/signals` (community-scoped providers)
- [ ] Implement `POST /api/trader/signals/:id/follow` with validation
- [ ] Implement `GET /api/trader/trades` with pagination and filters
- [ ] Implement `GET /api/trader/analytics/performance` with caching
- [ ] Implement `PUT /api/trader/risk-profile` for settings update
- [ ] Implement `PUT /api/trader/notifications` for preference updates
- [ ] Add rate limiting (100 req/min general, 50 req/min for trades)
- [ ] **Validation**: All endpoints enforce user-scoping correctly

### 5.3 Authorization middleware
- [ ] Ensure all `/api/community/*` endpoints use `requireCommunityAdmin`
- [ ] Ensure all `/api/trader/*` endpoints validate user session
- [ ] Add tenant scoping validation on all queries
- [ ] Return consistent error responses (403 with clear messages)
- [ ] **Validation**: Cross-community and cross-role access attempts are blocked

### 5.4 Audit logging integration
- [ ] Add SecurityAudit calls for member role changes
- [ ] Add SecurityAudit calls for broker additions/removals
- [ ] Add SecurityAudit calls for signal provider config changes
- [ ] Add SecurityAudit calls for subscription upgrades/downgrades
- [ ] **Validation**: All sensitive operations are logged with complete metadata

## Phase 6: Testing & Quality (Week 6)

### 6.1 Unit tests
- [ ] Test routing middleware for all role scenarios
- [ ] Test access control middleware for authorization logic
- [ ] Test API endpoints for correct data scoping
- [ ] Test shared components with different props
- [ ] Achieve 90%+ coverage on new code
- [ ] **Validation**: All unit tests pass, coverage meets threshold

### 6.2 Integration tests
- [ ] Test complete community dashboard flow (login → overview → member management)
- [ ] Test complete trader dashboard flow (login → overview → follow provider → view trades)
- [ ] Test role switching behavior for multi-community users
- [ ] Test deep link preservation through authentication
- [ ] **Validation**: E2E flows complete without errors

### 6.3 Performance tests
- [ ] Measure route decision overhead (<500ms target)
- [ ] Load test analytics endpoints with realistic data volumes
- [ ] Verify Redis caching reduces database load
- [ ] Test pagination performance with 10,000+ trades
- [ ] **Validation**: All performance targets met

### 6.4 Security testing
- [ ] Attempt cross-community data access (should fail)
- [ ] Attempt role escalation (trader → admin, should fail)
- [ ] Test API rate limiting enforcement
- [ ] Verify encrypted broker credentials are never exposed
- [ ] **Validation**: All security tests pass, no data leakage

## Phase 7: Migration & Deployment (Week 7)

### 7.1 Feature flag setup
- [ ] Add `ENABLE_DUAL_DASHBOARDS` environment variable
- [ ] Implement feature flag check in routing middleware
- [ ] Create gradual rollout configuration (0%, 25%, 50%, 100%)
- [ ] **Validation**: Feature flag toggles dashboards without restart

### 7.2 Database migration (if needed)
- [ ] Add any required indexes for performance
- [ ] Run migration script to ensure all users have `communityRole` set
- [ ] Backfill missing `communityId` references (if any)
- [ ] **Validation**: All users have valid role and community assignments

### 7.3 Gradual rollout
- [ ] Deploy with `ENABLE_DUAL_DASHBOARDS=false` (existing behavior)
- [ ] Enable for 25% of users, monitor for 48 hours
- [ ] Enable for 50% of users, monitor for 24 hours
- [ ] Enable for 100% of users
- [ ] **Validation**: No increase in error rates, positive user feedback

### 7.4 Deprecation of unified dashboard
- [ ] Add deprecation banner to old `/dashboard` route
- [ ] Update documentation to reference new dashboards
- [ ] Communicate change to users via email/Discord announcements
- [ ] Set sunset date for old dashboard (30 days)
- [ ] **Validation**: Users are successfully migrated to new dashboards

### 7.5 Cleanup
- [ ] Remove old unified dashboard code after sunset period
- [ ] Remove feature flag after 100% rollout confirmed stable
- [ ] Update API documentation with new endpoint structure
- [ ] Archive old dashboard components in git history
- [ ] **Validation**: Codebase is clean, no dead code remains

## Dependencies

**Must Complete First:**
- None (independent implementation)

**Can Parallelize:**
- Phase 2 (Community Dashboard) and Phase 3 (Trader Dashboard) can be built in parallel
- Phase 4 (Shared Components) can be built alongside Phases 2 and 3

**Blocking Later Work:**
- Phase 1 must complete before Phases 2-3
- Phase 5 (API) must complete before full testing in Phase 6
- Phase 6 must complete before deployment in Phase 7

## Success Criteria

- [ ] Community hosts can access all community management features without seeing trader-only UI
- [ ] Traders can access all personal trading features without seeing community management UI
- [ ] All existing functionality remains intact (zero regressions)
- [ ] Route decision overhead is <500ms
- [ ] Test coverage is 90%+ on new code
- [ ] No data leakage between users or communities
- [ ] Performance targets met: <2s page loads, <5s exports
- [ ] Positive user feedback (>80% satisfaction in post-launch survey)
