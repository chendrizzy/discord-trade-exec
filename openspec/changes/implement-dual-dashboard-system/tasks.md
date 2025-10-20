# Implementation Tasks: Dual Dashboard System

## Phase 1: Foundation & Routing (Week 1) ✅ COMPLETE

### 1.1 Create routing infrastructure ✅
- [x] Create `src/middleware/dashboardRouter.js` with role detection logic
- [x] Implement automatic redirect based on `user.communityRole`
- [x] Add deep link preservation through auth flow (`returnTo` parameter)
- [x] Handle unauthenticated user redirects to Discord OAuth
- [x] Add unit tests for routing logic (all role scenarios)
- [x] **Validation**: All routing scenarios pass tests (48/48 tests passing)

### 1.2 Set up dashboard page structure ✅
- [x] Create `src/dashboard/pages/CommunityDashboard.jsx` container
- [x] Create `src/dashboard/pages/TraderDashboard.jsx` container
- [x] Set up React Router routes for `/dashboard/community/*` and `/dashboard/trader/*`
- [x] Add 404 handling for invalid dashboard routes
- [x] Implement layout components (header, sidebar, content area)
- [x] **Validation**: Both dashboards render without errors

### 1.3 Implement access control middleware ✅
- [x] Create `src/middleware/requireCommunityAdmin.js` for admin endpoints
- [x] Create `src/middleware/requireTrader.js` for trader endpoints
- [x] Add role validation on all protected routes
- [x] Return 403 Forbidden with clear error messages for unauthorized access
- [x] Add integration tests for access control
- [x] **Validation**: Unauthorized access attempts are properly blocked

## Phase 2: Community Dashboard (Week 2) 📦 SCAFFOLDED

> **Note**: All components and API endpoints created with complete UI structure and mock data. Integration points clearly marked with TODO comments. See `INTEGRATION_GUIDE.md` for step-by-step implementation details.

### 2.1 Community overview page 📦
- [x] Create `src/dashboard/components/CommunityOverview.jsx` (SCAFFOLDED)
- [x] Implement `/api/community/overview` endpoint with KPIs (SCAFFOLDED - mock data)
- [ ] Add real-time member count and activity metrics (TODO: database queries needed)
- [ ] Display top signal providers by performance (TODO: database queries needed)
- [x] Create recent activity feed component (SCAFFOLDED - mock data)
- [x] Add loading states and error handling (COMPLETE)
- [ ] **Validation**: Overview loads in <2s with accurate data (TODO: integrate real data)

### 2.2 Signal management interface 📦
- [x] Create `src/dashboard/components/SignalManagement.jsx` (SCAFFOLDED)
- [x] Implement `/api/community/signals` GET and PUT endpoints (SCAFFOLDED - mock data)
- [ ] Add Discord channel validation via Discord API (TODO: Discord integration in `src/services/discord.js`)
- [x] Create signal provider enable/disable toggle (SCAFFOLDED - UI complete)
- [x] Implement signal provider configuration form (SCAFFOLDED - UI complete)
- [x] Add success/error toast notifications (COMPLETE)
- [ ] **Validation**: Signal channels can be added and validated (TODO: Discord integration needed)

### 2.3 Member management 📦
- [x] Create `src/dashboard/components/MemberActivity.jsx` (SCAFFOLDED)
- [x] Implement `/api/community/members` endpoint with pagination (SCAFFOLDED - mock data)
- [x] Add member role update functionality via `/api/community/members/:id/role` (SCAFFOLDED - API structure complete)
- [x] Create member detail view with trade history (SCAFFOLDED - mock data)
- [ ] Add SecurityAudit logging for role changes (TODO: database integration needed)
- [x] Implement member search and filtering (SCAFFOLDED - UI complete)
- [ ] **Validation**: Role changes are logged and immediately effective (TODO: database + audit integration)

### 2.4 Community analytics 📦
- [x] Create `src/dashboard/components/CommunityAnalytics.jsx` (SCAFFOLDED)
- [x] Implement `/api/community/analytics/performance` endpoint (SCAFFOLDED - mock data with Redis caching structure)
- [ ] Add P&L aggregation query with date range filters (TODO: database queries in `INTEGRATION_GUIDE.md`)
- [x] Create interactive charts using Recharts (SCAFFOLDED - placeholder for data integration)
- [x] Implement Redis caching (5-minute TTL) for analytics (SCAFFOLDED - `src/services/redis.js` with in-memory fallback)
- [x] Add export functionality for analytics reports (SCAFFOLDED - stub in UI)
- [ ] **Validation**: Analytics load with cached data, charts are interactive (TODO: integrate real data + Recharts)

### 2.5 Billing and subscription 📦
- [x] Create `src/dashboard/components/BillingSettings.jsx` (SCAFFOLDED)
- [x] Implement `/api/community/subscription` endpoint (SCAFFOLDED - mock data)
- [x] Display current tier, usage limits, renewal date (SCAFFOLDED - UI complete with mock data)
- [x] Add tier upgrade/downgrade UI with Stripe integration (SCAFFOLDED - UI complete, needs Stripe.js integration)
- [x] Link to Stripe customer portal for payment management (SCAFFOLDED - `src/services/stripe.js` stub)
- [x] Add usage progress bars and limit warnings (COMPLETE)
- [ ] **Validation**: Subscription changes reflect immediately (TODO: Stripe integration in `INTEGRATION_GUIDE.md`)

### 2.6 Discord integration settings 📦
- [x] Create `src/dashboard/components/IntegrationSettings.jsx` (SCAFFOLDED)
- [x] Add webhook configuration form for channels (SCAFFOLDED - UI complete)
- [x] Implement channel validation and bot permission checks (SCAFFOLDED - `src/services/discord.js` stub)
- [x] Create "Send Test Notification" functionality (SCAFFOLDED - UI button complete, needs Discord integration)
- [x] Display current bot status and permissions (SCAFFOLDED - mock data)
- [x] Add troubleshooting guide for common Discord issues (SCAFFOLDED - static content in component)
- [ ] **Validation**: Test notifications are received in configured channels (TODO: Discord.js integration)

## Phase 3: Trader Dashboard (Week 3) 📦 SCAFFOLDED

> **Note**: All components and API endpoints created with complete UI structure and mock data. Integration points clearly marked with TODO comments. See `INTEGRATION_GUIDE.md` for step-by-step implementation details.

### 3.1 Trader overview page 📦
- [x] Create `src/dashboard/components/TraderOverview.jsx` (SCAFFOLDED)
- [x] Implement `/api/trader/overview` endpoint with personal metrics (SCAFFOLDED - mock data)
- [x] Display personal P&L, active positions, execution rate (SCAFFOLDED - UI complete with mock data)
- [x] Add top followed signal providers section (SCAFFOLDED - mock data)
- [x] Create recent trade history widget (SCAFFOLDED - mock data)
- [x] Implement empty state with onboarding guide (COMPLETE)
- [ ] **Validation**: Overview displays accurate personal data in <2s (TODO: integrate real database queries)

### 3.2 Signal feed and provider discovery 📦
- [x] Create `src/dashboard/components/SignalFeed.jsx` (SCAFFOLDED)
- [x] Implement `/api/trader/signals` endpoint (community-scoped providers) (SCAFFOLDED - mock data)
- [x] Add follow/unfollow functionality via `/api/trader/signals/:id/follow` (SCAFFOLDED - API structure complete)
- [x] Create signal provider detail modal with performance charts (SCAFFOLDED - UI complete with mock data)
- [x] Implement provider filtering (by win rate, P&L, category) (COMPLETE - client-side filtering ready)
- [x] Add saved filter presets (SCAFFOLDED - UI complete, needs localStorage persistence)
- [ ] **Validation**: Following providers updates signal delivery (TODO: database integration for UserSignalSubscription)

### 3.3 Broker management ⏳ PENDING
- [ ] Reuse existing `BrokerManagement.jsx` component from unified dashboard (TODO: Phase 3.3 - component not yet adapted)
- [ ] Update component to work within trader dashboard layout
- [ ] Ensure OAuth flows work from new route context
- [ ] Add broker connection health checks
- [ ] Display broker balances and positions
- [ ] **Validation**: Brokers can be added/removed without errors

### 3.4 Trade history and analysis 📦
- [x] Create `src/dashboard/components/TradeHistory.jsx` (SCAFFOLDED)
- [x] Implement `/api/trader/trades` endpoint with pagination and filters (SCAFFOLDED - mock data)
- [x] Add sortable table with all trade columns (COMPLETE - client-side sorting ready)
- [x] Implement date range filtering with presets (7d, 30d, etc.) (COMPLETE - UI ready)
- [x] Create CSV export functionality (SCAFFOLDED - stub in UI, needs implementation)
- [x] Add trade detail modal with full execution data (SCAFFOLDED - UI complete with mock data)
- [ ] **Validation**: 10,000 trades export in <5s (TODO: implement CSV export logic + database queries)

### 3.5 Risk and position settings 📦
- [x] Create `src/dashboard/components/RiskSettings.jsx` (SCAFFOLDED)
- [x] Add position sizing configuration (percentage or fixed amount) (COMPLETE - UI with state management)
- [x] Implement default stop-loss/take-profit settings (COMPLETE - UI with state management)
- [x] Create risk profile presets (conservative, moderate, aggressive) (COMPLETE)
- [x] Add position size calculator with live preview (COMPLETE - client-side calculation ready)
- [ ] Save settings to `User.tradingConfig.riskManagement` (TODO: PUT /api/trader/risk-profile needs database integration)
- [ ] **Validation**: Settings are applied to new trades immediately (TODO: database integration + trade execution logic)

### 3.6 Notifications and alerts 📦
- [x] Create `src/dashboard/components/PersonalSettings.jsx` (notifications tab) (SCAFFOLDED)
- [x] Add Discord DM notification toggles (SCAFFOLDED - UI complete)
- [x] Implement alert threshold configuration (daily loss, position size) (SCAFFOLDED - UI complete)
- [x] Create "Send Test Notification" for each channel (SCAFFOLDED - UI buttons complete, needs Discord integration)
- [x] Add notification history/log (SCAFFOLDED - UI component with mock data)
- [ ] **Validation**: Test notifications are received via configured channels (TODO: Discord.js integration + database)

### 3.7 Personal subscription management 📦
- [x] Reuse `SubscriptionCard` component with `type="user"` prop (SCAFFOLDED - placeholder in PersonalSettings tab)
- [x] Display personal tier, usage, and renewal information (SCAFFOLDED - mock data via API)
- [x] Add inline upgrade flow with Stripe (SCAFFOLDED - UI complete, needs Stripe.js integration)
- [x] Link to Stripe customer portal (SCAFFOLDED - `src/services/stripe.js` stub)
- [x] Show signal usage progress (daily limit tracking) (SCAFFOLDED - UI with mock data)
- [ ] **Validation**: Upgrades complete and tier changes immediately (TODO: Stripe integration in `INTEGRATION_GUIDE.md`)

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

## Phase 5: API Implementation (Week 5) 📦 PARTIALLY SCAFFOLDED

> **Note**: All API route files created (`src/routes/api/community.js`, `src/routes/api/trader.js`) with Express route structure, middleware authorization, and mock data responses. Database queries need implementation per `INTEGRATION_GUIDE.md`.

### 5.1 Community API endpoints 📦
- [x] Implement `GET /api/community/overview` with aggregated metrics (SCAFFOLDED - route exists with mock data)
- [x] Implement `GET /api/community/members` with pagination (SCAFFOLDED - route exists with mock data)
- [x] Implement `POST /api/community/members/:id/role` with audit logging (SCAFFOLDED - route structure complete, needs DB + audit)
- [x] Implement `GET /api/community/signals` for provider list (SCAFFOLDED - route exists with mock data)
- [x] Implement `PUT /api/community/signals/:id` for provider config (SCAFFOLDED - route exists, needs DB queries)
- [x] Implement `GET /api/community/analytics/performance` with caching (SCAFFOLDED - route + Redis structure exists)
- [x] Implement `GET /api/community/subscription` for billing info (SCAFFOLDED - route exists, needs Stripe integration)
- [ ] Add rate limiting (100 req/min for overview, 20 req/min for analytics) (TODO: express-rate-limit middleware)
- [ ] **Validation**: All endpoints return correct data with proper authorization (TODO: database queries needed)

### 5.2 Trader API endpoints 📦
- [x] Implement `GET /api/trader/overview` with personal metrics (SCAFFOLDED - route exists with mock data)
- [x] Implement `GET /api/trader/signals` (community-scoped providers) (SCAFFOLDED - route exists with mock data)
- [x] Implement `POST /api/trader/signals/:id/follow` with validation (SCAFFOLDED - route structure complete, needs DB)
- [x] Implement `GET /api/trader/trades` with pagination and filters (SCAFFOLDED - route exists with mock data)
- [x] Implement `GET /api/trader/analytics/performance` with caching (SCAFFOLDED - route + Redis structure exists)
- [x] Implement `PUT /api/trader/risk-profile` for settings update (SCAFFOLDED - route exists, needs DB)
- [x] Implement `PUT /api/trader/notifications` for preference updates (SCAFFOLDED - route exists, needs DB)
- [ ] Add rate limiting (100 req/min general, 50 req/min for trades) (TODO: express-rate-limit middleware)
- [ ] **Validation**: All endpoints enforce user-scoping correctly (TODO: database queries with tenantId scoping)

### 5.3 Authorization middleware ✅
- [x] Ensure all `/api/community/*` endpoints use `requireCommunityAdmin` (COMPLETE - applied to all routes)
- [x] Ensure all `/api/trader/*` endpoints validate user session (COMPLETE - requireTrader applied)
- [ ] Add tenant scoping validation on all queries (TODO: implement in database queries)
- [x] Return consistent error responses (403 with clear messages) (COMPLETE - middleware handles this)
- [ ] **Validation**: Cross-community and cross-role access attempts are blocked (TODO: integration testing needed)

### 5.4 Audit logging integration ⏳ PENDING
- [ ] Add SecurityAudit calls for member role changes (TODO: implement in role change endpoint)
- [ ] Add SecurityAudit calls for broker additions/removals (TODO: Phase 3.3 pending)
- [ ] Add SecurityAudit calls for signal provider config changes (TODO: implement in signal endpoints)
- [ ] Add SecurityAudit calls for subscription upgrades/downgrades (TODO: implement in subscription handlers)
- [ ] **Validation**: All sensitive operations are logged with complete metadata

## Phase 6: Testing & Quality (Week 6)

> **Note**: Phase 1 routing and access control tests complete (48/48 passing). Phases 2-5 need comprehensive testing once database integration is complete.

### 6.1 Unit tests
- [x] Test routing middleware for all role scenarios (COMPLETE - 48 tests passing from Phase 1)
- [x] Test access control middleware for authorization logic (COMPLETE - included in Phase 1 tests)
- [ ] Test API endpoints for correct data scoping (TODO: after database queries implemented)
- [ ] Test shared components with different props (TODO: Phase 4 components not yet created)
- [ ] Achieve 90%+ coverage on new code (TODO: currently ~60% with Phase 1 tests only)
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
