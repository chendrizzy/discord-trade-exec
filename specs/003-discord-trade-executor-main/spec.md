# Product Specification: Discord Trade Executor SaaS

**Feature Branch**: `003-discord-trade-executor-main`  
**Created**: 2025-10-21  
**Status**: Draft  
**Input**: Comprehensive product specification for Discord Trade Executor SaaS platform consolidating all OpenSpec proposals with constitutional alignment

**Constitution Version**: 1.0.0 (ratified 2025-10-21)  
**OpenSpec Proposals**: 20+ changes consolidated  
**Overall Completion**: ~45% (449/992 tasks across all proposals)

## Product Overview

Discord Trade Executor is an automated trading bot SaaS platform that:

- **Executes trades** from Discord signals and TradingView webhooks in real-time with <30 second latency
- **Supports multiple brokers**: Stocks (Alpaca, Interactive Brokers, Charles Schwab) and Crypto (Coinbase Pro, Kraken, Binance)
- **Provides subscription service**: Basic ($49/month), Pro ($99/month), Premium ($299/month) tiers
- **Features risk management**: Position sizing, stop-loss automation, daily loss limits
- **Delivers real-time updates**: WebSocket portfolio updates, trade notifications, market quotes
- **Includes business intelligence**: MRR/ARR tracking, cohort retention, churn prediction

**Business Model**: Recurring revenue SaaS targeting Discord trading communities (2M+ active traders)

**Target Market**: Retail traders seeking automated trade execution from signal providers

**Value Proposition**: Eliminate manual trade execution, reduce slippage through millisecond execution, support multiple brokers from single platform

**Current State**: Core trading operational, 5 broker adapters complete, WebSocket infrastructure started, analytics platform partial

**Deployment Status**: Development phase with 4 production blockers identified (security audit, test compliance, WebSocket auth, audit logging)

---

## User Scenarios & Testing

### US-001: Automated Trade Execution (P1 - CORE VALUE)

**Why this priority**: 
- Core product value: eliminates manual order entry (primary user pain point)
- Constitutional alignment: Security-First principle requires secure order validation
- Revenue dependency: All subscription tiers depend on reliable trade execution
- Test-First mandate: Financial transactions require >95% test coverage per constitution

**Independent Test**: Verify trade execution accuracy, latency <30s, multi-broker support, risk validation without implementation details. Test with paper trading accounts using standardized signal format across all supported brokers.

**Acceptance Scenarios**:

1. **Given** user has connected broker account and active subscription  
   **When** Discord bot detects signal `/buy AAPL 100 shares @market` from authorized channel  
   **Then** system validates risk limits → submits order via broker API → confirms execution → notifies user with fill price within 30 seconds

2. **Given** user has insufficient buying power for requested position  
   **When** signal is received for trade requiring $50,000 but account has $20,000  
   **Then** system rejects trade before submission → logs rejection → notifies user "Insufficient buying power: $20,000 available, $50,000 required"

3. **Given** market is closed (weekend or holiday)  
   **When** signal is received for NYSE-listed stock at 8pm Saturday  
   **Then** system queues order as pre-market → schedules submission for next market open → notifies user "Order queued for Monday 9:30am ET"

4. **Given** TradingView webhook sends alert with JSON payload  
   **When** webhook contains `{"ticker": "TSLA", "action": "buy", "quantity": 50, "type": "limit", "price": 250.00}`  
   **Then** system parses payload → validates schema → executes as limit order → confirms with "TSLA limit buy 50 shares @ $250.00 submitted"

5. **Given** daily loss limit configured at -5% portfolio value  
   **When** user's portfolio drops from $100,000 to $95,000 during trading session  
   **Then** system blocks new trades → closes open positions → notifies user "Daily loss limit reached (-5%). Trading disabled until tomorrow."

---

### US-002: Multi-Broker Integration (P1 - CONSTITUTIONAL REQUIREMENT)

**Why this priority**:
- Constitutional Principle III: Broker Abstraction mandates unified interface
- Market coverage: Users need access to stocks (Alpaca/IBKR/Schwab) and crypto (Coinbase/Kraken/Binance)
- Competitive advantage: Single platform for all broker types
- Security dependency: Each broker requires secure credential storage per Principle I

**Independent Test**: Verify identical signal produces correct orders across all 6 brokers, credentials stored securely, connection failures handled gracefully, broker-specific features mapped correctly.

**Acceptance Scenarios**:

1. **Given** user connects Alpaca account with API keys  
   **When** user submits keys in dashboard Settings → Brokers → Add Alpaca  
   **Then** system validates keys with test API call → encrypts keys → stores in MongoDB → displays "Alpaca connected successfully" with account value

2. **Given** user has IBKR and Alpaca connected, signal `/buy SPY 100`  
   **When** user configured default broker as IBKR in settings  
   **Then** system routes order to IBKR adapter → ignores Alpaca connection → confirms via IBKR execution

3. **Given** Schwab API returns 503 Service Unavailable during trade submission  
   **When** system attempts order placement for `BUY NVDA 25 shares`  
   **Then** system logs error → retries with exponential backoff (3 attempts) → notifies user "Schwab temporarily unavailable. Order not submitted." → does NOT charge user

4. **Given** user wants to trade Bitcoin on Coinbase Pro  
   **When** signal `/buy BTC 0.5 @market` received  
   **Then** system uses Coinbase adapter → converts to crypto order format (decimal quantity) → executes via CCXT library → confirms "BTC buy 0.5 @ $42,150 filled"

5. **Given** Interactive Brokers requires 2FA for API connection  
   **When** user initiates IBKR connection in dashboard  
   **Then** system displays instructions "Install IB Gateway, enable API access in TWS, whitelist IP: [server IP]" → tests connection → stores session token securely

---

### US-003: Real-Time Dashboard Updates (P2 - USER EXPERIENCE)

**Why this priority**:
- Constitutional Principle IV: Real-Time Standards mandate <100ms WebSocket latency
- User trust: Live portfolio values prevent stale data confusion
- Secondary to trade execution: Dashboard enhances experience but isn't core trading function
- Dependencies: Requires US-001 (trade execution) and US-002 (broker integration) working first

**Independent Test**: Verify WebSocket connection stability, updates reflect broker state within 500ms of change, disconnections auto-reconnect, multiple concurrent users receive isolated updates.

**Acceptance Scenarios**:

1. **Given** user logged into dashboard with portfolio value $50,000  
   **When** trade executes buying AAPL 100 shares @ $180 ($18,000 cost)  
   **Then** WebSocket pushes update → portfolio value changes to $32,000 cash + $18,000 AAPL → UI updates within 500ms without page refresh

2. **Given** user's WebSocket connection drops due to network interruption  
   **When** connection lost for 30 seconds then restored  
   **Then** client auto-reconnects with exponential backoff → requests full state sync → displays "Reconnected. Syncing portfolio..." → updates to current state

3. **Given** 100 concurrent users with dashboard open during market hours  
   **When** market moves and portfolio values update every second  
   **Then** each user receives ONLY their own portfolio updates → no cross-user data leakage → server handles 100+ concurrent WebSocket connections per constitutional standard (1000+ capacity)

4. **Given** user views Trade History tab showing last 50 trades  
   **When** new trade executes (SELL TSLA 10 shares)  
   **Then** WebSocket event `trade.executed` received → new row prepended to history table → shows timestamp, symbol, quantity, price, status without full page reload

5. **Given** broker account value changes outside platform (manual trade in broker app)  
   **When** system polls broker API every 60 seconds for balance sync  
   **Then** detects $5,000 deposit → pushes WebSocket update `portfolio.balanceChanged` → dashboard shows new cash balance → logs sync event

---

### US-004: Unified OAuth2 Authentication (P1 - SECURITY REQUIREMENT)

**Why this priority**:
- Constitutional Principle I: Security-First mandates secure auth (OWASP A07:2021 - Identity Failures)
- Cross-cutting dependency: All features require authenticated users
- Current gap: 39.9% complete per compliance audit (token refresh missing)
- Production blocker: Cannot deploy without secure session management

**Independent Test**: Verify OAuth2 flow completes, tokens refresh before expiry, sessions invalidate on logout, multiple providers supported, PKCE implemented for mobile clients.

**Acceptance Scenarios**:

1. **Given** unauthenticated user visits dashboard URL `/dashboard`  
   **When** page loads without valid session cookie  
   **Then** system redirects to `/auth/discord` → initiates OAuth2 authorization code flow with PKCE → Discord shows consent screen "Discord Trade Executor wants to: Identify you"

2. **Given** user approves Discord OAuth consent  
   **When** Discord redirects back to `/auth/discord/callback?code=ABC123&state=XYZ789`  
   **Then** system validates state parameter → exchanges code for access token → fetches user profile → creates session → sets secure httpOnly cookie → redirects to `/dashboard`

3. **Given** user logged in with access token expiring in 5 minutes  
   **When** user makes API request `/api/v1/portfolio` 3 minutes before expiry  
   **Then** system detects expiry approaching → refreshes token using refresh token → updates session → request proceeds without user interruption

4. **Given** user clicks "Logout" button in dashboard  
   **When** logout request sent to `/auth/logout`  
   **Then** system destroys session in MongoDB → clears session cookie → invalidates refresh token → redirects to login page → subsequent API requests return 401 Unauthorized

5. **Given** attacker steals session cookie from compromised browser  
   **When** attacker attempts to use cookie from different IP address/user agent  
   **Then** system detects suspicious session change → requires re-authentication → invalidates stolen session → logs security event → notifies user via email "New login detected from [location]"

---

### US-005: Analytics Platform & Business Intelligence (P2 - BUSINESS VALUE)

**Why this priority**:
- Revenue optimization: Churn prediction and cohort analysis inform retention strategies
- Secondary to core trading: Analytics enhance business but don't block user trading
- Current state: 69.4% complete (ML features pending)
- Dependencies: Requires complete trade execution (US-001) and auth (US-004) data pipeline

**Independent Test**: Verify MRR/ARR calculations match accounting records, churn predictions achieve >70% accuracy, cohort retention data accurate to user signups, admin dashboard visualizations load <2 seconds.

**Acceptance Scenarios**:

1. **Given** 500 active subscriptions (200 Basic @$49, 250 Pro @$99, 50 Premium @$299)  
   **When** admin views Analytics Dashboard → Revenue Metrics section  
   **Then** system displays MRR: $49,100 (200×$49 + 250×$99 + 50×$299), ARR: $589,200 (MRR × 12), growth rate: +15% MoM

2. **Given** ML model trained on 12 months historical user behavior (login frequency, trade volume, support tickets)  
   **When** model evaluates user ID 12345 who hasn't logged in for 14 days (previously logged in daily)  
   **Then** system assigns churn risk: 85% (high risk) → flags for retention campaign → admin sees alert "User 12345 at risk: Last login 14 days ago"

3. **Given** January 2024 signup cohort of 100 users  
   **When** admin views Cohort Retention Analysis chart  
   **Then** displays table showing Month 0: 100 users (100%), Month 1: 85 users (85%), Month 2: 72 users (72%), Month 3: 68 users (68%) with color-coded heatmap

4. **Given** premium user (ID 67890) executes 250 trades in March averaging $15,000 position size  
   **When** system calculates Customer Lifetime Value (CLV)  
   **Then** CLV = (Avg subscription value × retention months) + (trade volume bonus) = ($299 × 18 months) + $500 = $5,882 → tagged as "high value user" → eligible for priority support

5. **Given** admin exports financial report for Q1 2024  
   **When** clicks "Export → CSV" on Analytics Dashboard  
   **Then** system generates report with columns: Month, New Signups, Churn Count, Net Growth, MRR, Cumulative ARR → downloads `Q1_2024_Revenue_Report.csv` → includes granular daily breakdowns

---

### US-006: Risk Management & Position Sizing (P1 - FINANCIAL SAFETY)

**Why this priority**:
- Constitutional Principle I: Security-First requires financial risk controls
- Legal liability: Platform responsible for preventing catastrophic user losses
- User protection: Default risk limits prevent account blowups
- Test-First requirement: Risk validation needs >95% test coverage per Principle II

**Independent Test**: Verify position size calculations correct for account equity, daily loss limits enforced across all trades, stop-loss orders execute automatically, risk rules persist across sessions.

**Acceptance Scenarios**:

1. **Given** user has $10,000 account, configured max position size 10% ($1,000)  
   **When** signal received to buy AAPL 100 shares @ $180 ($18,000 total cost)  
   **Then** system calculates 100 × $180 = $18,000 > $1,000 limit → reduces quantity to 5 shares ($900 cost) → executes 5 shares → notifies "Position sized reduced to 5 shares (10% max rule)"

2. **Given** user enables stop-loss automation at -2% per trade  
   **When** buy order fills TSLA 10 shares @ $250 (cost basis: $2,500)  
   **Then** system automatically submits stop-loss sell order @ $245 (-2% = $2,450 exit) → monitors price → if price drops to $245 → stop triggers → closes position → locks loss at $50

3. **Given** user sets daily loss limit -$500  
   **When** cumulative P&L for day reaches -$485 after 3 losing trades  
   **Then** system blocks new trade signals → closes all open positions → notifies "Daily loss limit approaching (-$485 of -$500). Trading paused until tomorrow 00:00 UTC"

4. **Given** user attempts to override position size limit for "high conviction" trade  
   **When** user manually submits order for NVDA 200 shares @ $500 ($100,000) on $25,000 account (400% of equity)  
   **Then** system rejects order → logs override attempt → displays "Manual orders subject to risk limits. Max position: $2,500 (10% of $25,000 equity)" → order not submitted

5. **Given** user's portfolio drops -8% intraday (from $50,000 to $46,000)  
   **When** system detects -8% threshold breach (default circuit breaker)  
   **Then** sells all positions immediately → converts to cash → locks account → notifies "Emergency circuit breaker triggered (-8%). Account under review. Contact support." → admin alerted

---

### US-007: Audit Logging & Compliance Tracking (P1 - REGULATORY REQUIREMENT)

**Why this priority**:
- Constitutional Principle I: Security-First mandates immutable audit trail (OWASP A09:2021)
- Legal compliance: FinCEN/SEC require trade records for 6+ years
- Production blocker: Cannot deploy without audit system per compliance audit
- Forensics: Essential for investigating disputed trades or security incidents

**Independent Test**: Verify all financial operations logged immutably, logs survive database restarts, tampering attempts detected, retention policies enforced automatically, logs queryable by admin.

**Acceptance Scenarios**:

1. **Given** user executes trade: BUY AAPL 50 shares @ $175 via Alpaca  
   **When** order fills successfully  
   **Then** system writes immutable log entry: `{timestamp: "2024-03-15T14:23:11Z", userId: "12345", action: "TRADE_EXECUTED", broker: "alpaca", symbol: "AAPL", quantity: 50, price: 175.00, orderId: "alpaca_67890", ipAddress: "192.168.1.1", status: "filled"}` → log stored in append-only collection → cannot be edited/deleted

2. **Given** attacker compromises admin account and attempts to delete audit logs  
   **When** attacker runs MongoDB command `db.auditLogs.deleteMany({})`  
   **Then** system detects deletion attempt → blocks operation (append-only architecture) → logs tampering attempt → alerts security team → escalates to critical incident

3. **Given** compliance officer needs trade records for user ID 54321 from Q1 2024  
   **When** officer queries audit system with filters: userId=54321, dateRange=2024-01-01 to 2024-03-31, action=TRADE_EXECUTED  
   **Then** system returns 127 matching log entries → exports to CSV with columns: Timestamp, Symbol, Quantity, Price, Broker, Order ID, Status → includes cryptographic hash for integrity verification

4. **Given** audit log retention policy set to 7 years per regulations  
   **When** logs reach 7 years + 30 days age (grace period)  
   **Then** system archives logs to cold storage (AWS S3 Glacier) → removes from hot database → maintains searchable index → logs remain accessible via admin panel "Archived Logs" section

5. **Given** user updates broker API credentials (Schwab API keys changed)  
   **When** new credentials saved via dashboard Settings → Brokers → Edit Schwab  
   **Then** system logs: `{timestamp: "2024-03-15T10:00:00Z", userId: "12345", action: "CREDENTIALS_UPDATED", broker: "schwab", changedFields: ["apiKey", "apiSecret"], ipAddress: "192.168.1.1", userAgent: "Mozilla/5.0..."}` → does NOT log actual credential values → flags for security review

---

### US-008: WebSocket JWT Authentication (P1 - SECURITY BLOCKER)

**Why this priority**:
- Constitutional Principle I: Security-First requires authenticated WebSocket connections
- Production blocker: Current implementation lacks auth, enabling unauthorized access
- Constitutional Principle IV: Real-Time Standards mandate secure WebSocket auth
- Compliance gap: Identified in audit as critical vulnerability

**Independent Test**: Verify WebSocket connections require valid JWT, expired tokens rejected, connection upgrade validates origin, unauthorized connections logged and blocked, token refresh handled gracefully.

**Acceptance Scenarios**:

1. **Given** authenticated user with valid JWT token in session  
   **When** dashboard initiates WebSocket connection to `wss://api.example.com/ws`  
   **Then** client includes JWT in connection query param `?token=eyJhbGc...` → server validates JWT signature → checks expiry → authorizes connection → responds with `connection.authorized` event

2. **Given** attacker attempts WebSocket connection without JWT  
   **When** connection request sent to `wss://api.example.com/ws` (no token param)  
   **Then** server rejects connection → returns 401 Unauthorized → closes socket immediately → logs attempt: `{timestamp, ipAddress, error: "Missing JWT token"}` → rate limits IP after 5 failed attempts

3. **Given** user's JWT expires during active WebSocket session (token TTL: 1 hour)  
   **When** 55 minutes into session, 5 minutes before expiry  
   **Then** server sends `token.expiring` event → client refreshes token via `/auth/refresh` → client sends `connection.reauth` message with new JWT → server validates → updates connection auth → session continues uninterrupted

4. **Given** attacker steals JWT token from network traffic (HTTPS misconfiguration)  
   **When** attacker attempts to use stolen token from different IP/user agent  
   **Then** server detects token reuse from suspicious source → invalidates token → closes both connections → logs security event → forces re-authentication for legitimate user → notifies user "Session security issue detected"

5. **Given** user has multiple dashboard tabs open (2 browser windows)  
   **When** both tabs establish WebSocket connections with same JWT  
   **Then** server allows multiple connections from same authenticated user → isolates message routing per connection ID → portfolio updates broadcast to both tabs → logout in one tab closes both WebSocket connections

---

### US-009: OWASP Top 10 Security Audit (P1 - COMPLIANCE MANDATE)

**Why this priority**:
- Constitutional Principle I: Security-First explicitly requires OWASP compliance
- Production blocker: Cannot deploy without security validation per constitution
- Legal liability: Platform handles user financial credentials and data
- Current gap: Audit never scheduled per compliance report

**Independent Test**: Verify automated OWASP ZAP scan completes, vulnerability report generated, critical/high findings remediated, penetration testing passed, security baseline documented.

**Acceptance Scenarios**:

1. **Given** development team schedules security audit with third-party firm  
   **When** penetration testers run automated OWASP ZAP scan against staging environment  
   **Then** scan completes in 4-6 hours → generates report with findings categorized by OWASP Top 10 (A01:2021 Broken Access Control, A02:2021 Cryptographic Failures, etc.) → exports PDF with 50-page detailed analysis

2. **Given** audit report shows 3 Critical, 7 High, 12 Medium findings  
   **When** development team reviews findings  
   **Then** creates GitHub issues for each finding → assigns priority (Critical = P0, High = P1, Medium = P2) → estimates remediation timeline: Critical within 48 hours, High within 1 week, Medium within 2 weeks

3. **Given** Critical finding: SQL Injection vulnerability in `/api/v1/trades` endpoint  
   **When** team investigates code: `db.query("SELECT * FROM trades WHERE userId = " + req.params.id)`  
   **Then** remediates with parameterized query: `db.query("SELECT * FROM trades WHERE userId = ?", [req.params.id])` → adds input validation → writes regression test → re-scans endpoint → confirms fix → closes issue

4. **Given** High finding: Missing Content-Security-Policy headers enabling XSS attacks  
   **When** team reviews HTTP response headers  
   **Then** adds Helmet.js middleware with strict CSP: `helmet.contentSecurityPolicy({directives: {defaultSrc: ["'self'"], scriptSrc: ["'self'", "'unsafe-inline'"], styleSrc: ["'self'", "https://fonts.googleapis.com"]}})` → deploys → validates headers present → marks resolved

5. **Given** all Critical and High findings remediated (10/10 fixed)  
   **When** team requests re-scan from security firm  
   **Then** re-scan confirms 0 Critical, 0 High findings remaining → 12 Medium findings documented with accepted risk justifications → security firm issues "Cleared for Production" certificate → compliance audit updated to 100% OWASP compliance

---

### US-010: Crypto Exchange Expansion (Binance, Gemini, Bybit) (P3 - MARKET EXPANSION)

**Why this priority**:
- Market opportunity: Crypto traders demand additional exchange options
- Lower priority: Core stock trading (Alpaca/IBKR/Schwab) and initial crypto (Coinbase/Kraken) sufficient for MVP
- Current state: 68.75% complete (Coinbase/Kraken done, Binance/Gemini pending)
- Dependencies: Requires US-002 (broker abstraction) and US-006 (risk management) established first

**Independent Test**: Verify each exchange adapter executes orders correctly, cryptocurrency decimal precision handled accurately, exchange-specific features (futures, margin) supported, API rate limits respected.

**Acceptance Scenarios**:

1. **Given** user connects Binance account with API key and secret  
   **When** user adds Binance via dashboard Settings → Exchanges → Add Binance → enters keys  
   **Then** system validates keys via Binance `/api/v3/account` endpoint → tests permissions (spot trading enabled) → stores credentials encrypted → displays "Binance connected: $12,450.00 USDT balance"

2. **Given** user executes crypto trade signal `/buy ETH 2.5 @market` on Binance  
   **When** system routes order to Binance adapter  
   **Then** adapter formats order with 8 decimal precision (Binance standard) → submits via CCXT library → receives fill: 2.5 ETH @ $3,125.00 USDT → confirms "Binance: ETH buy 2.5 @ $3,125.00 filled" → updates portfolio

3. **Given** Gemini enforces strict rate limit: 120 requests/minute  
   **When** user has 50 active trading signals processing simultaneously  
   **Then** system implements token bucket rate limiter → queues requests exceeding limit → processes 120 req/min max → logs throttled requests → notifies user "Gemini rate limit: 12 orders queued, processing..."

4. **Given** user wants to trade Solana (SOL) only available on Bybit  
   **When** user adds Bybit adapter (new exchange not in initial spec)  
   **Then** development team creates `src/brokers/exchanges/bbit-adapter.js` following broker abstraction pattern → implements standard methods: `connect(), placeOrder(), getBalance(), getPositions()` → tests with paper trading → deploys → user trades SOL successfully

5. **Given** Binance supports futures trading (10x leverage)  
   **When** user signal includes leverage param `/buy BTC 0.1 leverage:10x`  
   **Then** system validates user enabled futures in settings → checks margin requirements → submits futures order via Binance Futures API → confirms "Binance Futures: BTC long 0.1 @ 10x leverage, liquidation price: $38,500"

---

### US-011: Social Trading Features (Copy Trading, Leaderboards) (P3 - COMMUNITY ENGAGEMENT)

**Why this priority**:
- User retention: Social features increase engagement and reduce churn
- Lowest priority: Not essential for core trading functionality
- Revenue potential: Premium feature for Pro/Premium tiers
- Dependencies: Requires complete US-001 (trade execution), US-003 (real-time updates), US-005 (analytics) before building social layer

**Independent Test**: Verify copy trading replicates signals accurately, leader portfolios display correctly, follower positions match leader allocations, privacy controls enforced, performance metrics calculated accurately.

**Acceptance Scenarios**:

1. **Given** premium user (leader) enables public profile with "Allow Copy Trading" enabled  
   **When** leader executes trade BUY TSLA 20 shares @ $250  
   **Then** system identifies 5 followers subscribed to leader → calculates proportional positions based on follower account sizes → executes copy trades: Follower A: 2 shares, Follower B: 5 shares, Follower C: 1 share → notifies followers "Copied [Leader Name]: TSLA +20 shares"

2. **Given** follower with $10,000 account, leader with $100,000 account (10x difference)  
   **When** leader buys NVDA 50 shares (5% of leader's portfolio)  
   **Then** system calculates follower's proportional position: 5% of $10,000 = $500 → buys 1 share NVDA @ $500 (assuming $500/share price) → maintains same portfolio allocation percentage → updates follower dashboard "Copy Trade: NVDA +1 share (5% allocation)"

3. **Given** leaderboard displays top 100 traders by 30-day return percentage  
   **When** user views Community → Leaderboards → 30 Day Performance  
   **Then** system queries analytics database → calculates verified returns (audited trades only) → displays ranked list: #1: @TradeMaster (+42.3% return, 156 trades, $250K portfolio), #2: @AlphaSeeker (+38.1%), #3: @BullRun2024 (+35.7%) → updates every 24 hours

4. **Given** follower enables copy trading with max loss limit -$1,000  
   **When** leader's strategy loses -$5,000 during volatile session  
   **Then** follower's proportional loss reaches -$500 (10x smaller account) → triggers follower's -$1,000 circuit breaker at 50% threshold → system auto-stops copy trading → closes follower positions → notifies "Copy trading paused: Loss limit approaching"

5. **Given** leader sets profile privacy to "Followers Only" (not public)  
   **When** non-follower user searches for leader's username in leaderboard  
   **Then** system hides leader from public search results → shows "Profile Private" if user attempts direct URL access → displays stats only to approved followers → maintains leader anonymity per privacy settings

---

### US-012: Subscription Billing & Tiered Plans (P1 - REVENUE CRITICAL)

**Why this priority**:
- Revenue dependency: All income from subscription billing
- Constitutional Principle V: API-First with provider abstraction (Polar.sh/Stripe)
- Legal requirement: PCI compliance for payment processing
- Test-First mandate: Billing logic requires >95% test coverage per Principle II

**Independent Test**: Verify subscriptions create correctly, upgrades/downgrades process immediately, failed payments retry with grace period, billing cycles accurate, invoices generated correctly, provider abstraction allows switching Polar.sh ↔ Stripe.

**Acceptance Scenarios**:

1. **Given** new user signs up and selects Pro plan ($99/month)  
   **When** user enters payment method (credit card via Stripe Checkout)  
   **Then** system creates Stripe customer → subscribes to Pro plan SKU → charges $99 immediately → sends confirmation email "Welcome to Pro Plan" → grants Pro features access → sets renewal date 30 days from today

2. **Given** existing Basic user ($49/month) wants to upgrade to Premium ($299/month)  
   **When** user clicks "Upgrade to Premium" in dashboard Billing section  
   **Then** system calculates prorated refund for unused Basic days: 15 days remaining = $24.50 credit → charges difference: $299 - $24.50 = $274.50 → upgrades immediately → updates features → sends receipt "Upgraded to Premium: $274.50 charged (prorated)"

3. **Given** user's credit card charge fails at renewal (expired card)  
   **When** Stripe webhook `invoice.payment_failed` received  
   **Then** system enters 7-day grace period → sends email "Payment failed: Update card" → retries charge on day 3, 5, 7 → if all fail → downgrades to Free tier → restricts features → logs "Subscription suspended: User 12345"

4. **Given** admin switches billing provider from Polar.sh to Stripe  
   **When** config updated: `BILLING_PROVIDER=stripe` (was `polar`)  
   **Then** system uses BillingProviderFactory pattern → loads StripeAdapter instead of PolarAdapter → all billing operations route through Stripe API → existing subscriptions migrate via bulk import script → no user interruption

5. **Given** Premium user cancels subscription mid-cycle (15 days into 30-day period)  
   **When** user clicks "Cancel Subscription" and confirms  
   **Then** system schedules cancellation for end of billing period (15 days from now) → continues Premium access until cycle ends → sends confirmation "Premium access until April 30, 2024" → no refund (per terms) → downgrades to Free tier on May 1

---

### US-013: Railway Production Deployment (P1 - OPERATIONAL REQUIREMENT)

**Why this priority**:
- Production necessity: Users cannot access system without deployment
- Infrastructure stability: Railway provides MongoDB Atlas + Redis integration
- Constitutional alignment: Principle VI (Observability) requires production monitoring
- Deployment blocker: Prerequisites include US-004 (OAuth2), US-007 (audit logs), US-008 (WebSocket auth), US-009 (security audit)

**Independent Test**: Verify Railway deployment succeeds, environment variables loaded, MongoDB connects, Redis caching works, health checks pass, rollback mechanism functional, zero-downtime deployments achieved.

**Acceptance Scenarios**:

1. **Given** development team completes all deployment prerequisites (security audit, audit logs, WebSocket auth)  
   **When** team runs `railway up` command from project root  
   **Then** Railway builds Docker container → installs dependencies → runs build scripts → deploys to production URL `https://discord-trade-exec.up.railway.app` → health check `/health` returns 200 OK → notifies team "Deployment successful: v1.0.0"

2. **Given** production environment requires MongoDB Atlas connection  
   **When** Railway service starts  
   **Then** reads `MONGODB_URI` environment variable → connects to Atlas cluster `mongodb+srv://cluster0.mongodb.net/tradeexec` → verifies connection with ping → logs "MongoDB connected: 45ms latency" → application starts successfully

3. **Given** new deployment (v1.0.1) introduces critical bug causing trades to fail  
   **When** monitoring detects error rate spike: 45% of trades failing (threshold: <1%)  
   **Then** on-call engineer triggers rollback: `railway rollback` → Railway reverts to previous version v1.0.0 → deployment completes in 30 seconds → error rate drops to 0.1% → team investigates v1.0.1 bug in staging

4. **Given** production traffic requires horizontal scaling to handle 500 concurrent users  
   **When** CPU utilization exceeds 80% during market open (9:30am ET)  
   **Then** Railway auto-scales from 2 instances to 5 instances → load balancer distributes traffic → Redis session store maintains state across instances → users experience no interruption → scaling completes in 90 seconds

5. **Given** production deployment needs zero-downtime update (v1.1.0 with new analytics features)  
   **When** team deploys via Railway with `RAILWAY_DEPLOY_STRATEGY=blue-green`  
   **Then** Railway spins up new instances (green) → runs health checks → gradually shifts traffic 10% → 50% → 100% to green → shuts down old instances (blue) → users see no downtime → deployment duration: 8 minutes

---

## Requirements

### Core Trading Engine

**FR-001**: System SHALL parse Discord messages matching pattern `/buy|sell [TICKER] [quantity] [@market|@limit price]` with <30 second latency measured from Discord message receipt to broker API call completion (excludes broker-side order processing time)

**FR-002**: System SHALL validate trade signals against risk limits (position size, daily loss limit, account equity) BEFORE submitting orders to broker APIs

**FR-003**: System SHALL support TradingView webhooks with JSON payload schema: `{ticker, action, quantity, type, price?, stopLoss?, takeProfit?}` validated via JSON Schema

**FR-004**: System SHALL implement order types: market, limit, stop-loss, stop-limit, trailing stop with broker-specific parameter mapping

**FR-005**: System SHALL calculate position sizes as percentage of account equity with configurable max position size (default: 10%)

**FR-006**: System SHALL enforce daily loss limits as percentage of portfolio value (default: -5%) blocking new trades when exceeded

**FR-007**: System SHALL automatically submit stop-loss orders at configured percentage below entry price (default: -2% for longs, +2% for shorts)

**FR-008**: System SHALL detect market status by querying broker API `/clock` or `/market_status` endpoint before order submission, queuing orders when market closed and scheduling submission for next market open with pre-market/after-hours configuration options

**FR-009**: System SHALL retry failed order submissions with exponential backoff (3 attempts: 1s, 2s, 4s delays) before notifying user of permanent failure

**FR-010**: System SHALL log all trade execution attempts with: timestamp, userId, broker, symbol, quantity, price, orderType, status, orderId, executionTime

### Broker Integration

**FR-011**: System SHALL implement unified broker interface with methods: `connect()`, `placeOrder()`, `cancelOrder()`, `getPositions()`, `getBalance()`, `getOrderStatus()`

**FR-012**: System SHALL support stock brokers: Alpaca (REST API v2), Interactive Brokers (IB Gateway API), Charles Schwab (OAuth2 + REST API)

**FR-013**: System SHALL support crypto brokers: Coinbase Pro (CCXT), Kraken (CCXT), Binance (CCXT), with additional adapters extensible via CCXT library

**FR-014**: System SHALL store broker credentials encrypted at rest using AES-256-GCM with user-specific encryption keys derived from master key + userId salt

**FR-015**: System SHALL validate broker API credentials on connection with test API call (e.g., `/account` endpoint) before storing credentials

**FR-016**: System SHALL handle broker-specific rate limits via token bucket algorithm maintaining usage at <50% of broker's aggregate rate limit measured per 1-minute rolling window: Alpaca (100/200 req/min used), IBKR (25/50 req/min used), Schwab (60/120 req/min used), crypto exchanges per CCXT limits

**FR-017**: System SHALL implement adapter pattern isolating broker-specific logic from core trading engine with `src/brokers/adapters/[broker]-adapter.js` structure

**FR-018**: System SHALL map broker error codes to standardized error types: `INSUFFICIENT_FUNDS`, `INVALID_SYMBOL`, `MARKET_CLOSED`, `RATE_LIMIT_EXCEEDED`, `AUTH_FAILED`

**FR-019**: System SHALL support broker connection health checks polling `/account` or `/balance` endpoints every 5 minutes with reconnection on failure

**FR-020**: System SHALL allow users to configure default broker per asset class (stocks → IBKR, crypto → Coinbase) with signal-level overrides

### Authentication & Authorization

**FR-021**: System SHALL implement OAuth2 authorization code flow with PKCE for Discord provider using Passport.js middleware

**FR-022**: System SHALL exchange authorization codes for access tokens (TTL: 1 hour) and refresh tokens (TTL: 30 days) stored in MongoDB sessions

**FR-023**: System SHALL refresh access tokens automatically when <5 minutes remain before expiry using refresh token grant

**FR-024**: System SHALL invalidate sessions on logout by destroying MongoDB session document and clearing httpOnly session cookie (secure flag enabled)

**FR-025**: System SHALL enforce session security by validating IP address + user agent on each request, requiring re-authentication if changed

**FR-026**: System SHALL implement rate limiting on auth endpoints: `/auth/login` (5 req/15min), `/auth/register` (3 req/hour), `/auth/refresh` (10 req/min)

**FR-027**: System SHALL support multiple OAuth2 providers (Discord primary, GitHub, Google future) with provider abstraction via Passport strategies

**FR-028**: System SHALL enforce password requirements for email/password fallback: minimum 12 characters, 1 uppercase, 1 lowercase, 1 number, 1 special character

**FR-029**: System SHALL log authentication events: login success/failure, token refresh, logout, password reset, credential changes with IP address and timestamp

**FR-030**: System SHALL implement CSRF protection using double-submit cookie pattern for state-changing API requests (POST/PUT/DELETE)

### Real-Time Infrastructure

**FR-031**: System SHALL establish WebSocket connections using Socket.IO with JWT authentication via connection query parameter `?token=[jwt]`

**FR-032**: System SHALL validate JWT tokens on WebSocket connection upgrade, rejecting connections with expired/invalid/missing tokens returning 401 Unauthorized

**FR-033**: System SHALL broadcast portfolio updates via WebSocket events: `portfolio.balanceChanged`, `portfolio.positionAdded`, `portfolio.positionClosed` with <500ms latency

**FR-034**: System SHALL emit trade execution events: `trade.submitted`, `trade.filled`, `trade.partialFill`, `trade.rejected`, `trade.cancelled` in real-time

**FR-035**: System SHALL push market data updates for watched symbols via `market.quote` events with NBBO (National Best Bid/Offer) data where available

**FR-036**: System SHALL implement WebSocket auto-reconnection with exponential backoff (attempts: 1s, 2s, 4s, 8s, 16s, 30s max) on client disconnect

**FR-037**: System SHALL sync full state on WebSocket reconnection by emitting `state.sync` event with current portfolio, positions, pending orders

**FR-038**: System SHALL isolate WebSocket messages by userId preventing cross-user data leakage via Redis Pub/Sub for multi-instance deployments

**FR-039**: System SHALL support horizontal scaling with Redis adapter for Socket.IO, enabling >1000 concurrent WebSocket connections per constitutional standard

**FR-040**: System SHALL emit connection lifecycle events: `connection.authorized`, `connection.closed`, `connection.error`, `token.expiring` (5 min warning)

### Analytics & Business Intelligence

**FR-041**: System SHALL calculate Monthly Recurring Revenue (MRR) as SUM(active_subscriptions.price) grouped by plan tier (Basic/Pro/Premium)

**FR-042**: System SHALL calculate Annual Recurring Revenue (ARR) as MRR × 12 with growth percentage comparing current month to previous month

**FR-043**: System SHALL implement churn prediction ML model (scikit-learn RandomForestClassifier) trained on features: login_frequency, trade_volume, days_since_last_trade, support_tickets_count

**FR-044**: System SHALL assign churn risk scores (0-100%) to active users, flagging high-risk users (>70%) for retention campaigns

**FR-045**: System SHALL track cohort retention by signup month, calculating retention percentages at Month 0, 1, 2, 3, 6, 12 intervals

**FR-046**: System SHALL calculate Customer Lifetime Value (CLV) as (Average Monthly Revenue × Average Retention Months) + Trade Volume Bonus

**FR-047**: System SHALL generate financial reports exportable as CSV with columns: Date, New Signups, Churn Count, Net Growth, MRR, Cumulative ARR

**FR-048**: System SHALL display analytics dashboard (admin-only) with charts: MRR trend (line chart), cohort retention (heatmap), churn risk distribution (histogram)

**FR-049**: System SHALL aggregate trade statistics per user: total_trades, win_rate (profitable trades / total), average_return, largest_win, largest_loss

**FR-050**: System SHALL implement A/B testing framework tracking experiment variants, conversion rates, statistical significance (chi-square test p<0.05)

### Audit Logging & Compliance

**FR-051**: System SHALL write immutable audit logs to append-only MongoDB collection `auditLogs` with TTL index set to 7 years (regulatory requirement)

**FR-052**: System SHALL log financial operations: `TRADE_EXECUTED`, `ORDER_CANCELLED`, `FUNDS_DEPOSITED`, `FUNDS_WITHDRAWN`, `SUBSCRIPTION_CHARGED` with full context

**FR-053**: System SHALL log security events: `LOGIN_SUCCESS`, `LOGIN_FAILED`, `PASSWORD_CHANGED`, `CREDENTIALS_UPDATED`, `SESSION_HIJACK_DETECTED`, `UNAUTHORIZED_ACCESS_ATTEMPT`

**FR-054**: System SHALL include in all log entries: timestamp (ISO 8601), userId, action, resourceType, resourceId, ipAddress, userAgent, status, errorMessage (if failed)

**FR-055**: System SHALL implement log integrity verification via cryptographic hashing where each log entry includes SHA-256 hash computed from: previousHash + timestamp + userId + action + resourceId, forming a verifiable chain (blockchain-style)

**FR-056**: System SHALL prevent audit log tampering by denying DELETE/UPDATE operations on `auditLogs` collection via MongoDB role-based access control

**FR-057**: System SHALL provide audit log query interface (admin-only) with filters: userId, action type, date range, resource type, exportable as CSV

**FR-058**: System SHALL archive logs older than 1 year to cold storage (AWS S3 Glacier) with maintained queryable index for compliance officer access

**FR-059**: System SHALL alert security team on suspicious patterns: >5 failed login attempts in 10 minutes, credential changes from unknown IP, trade volumes >200% of user average

**FR-060**: System SHALL generate monthly compliance reports summarizing: total audit log entries, security events count, failed login attempts, credential changes

### Subscription & Billing

**FR-061**: System SHALL implement billing provider abstraction with factory pattern supporting Polar.sh and Stripe via unified interface

**FR-062**: System SHALL create subscriptions with plan tiers: Free ($0 - paper trading only), Basic ($49/month - 1 broker), Pro ($99/month - 3 brokers), Premium ($299/month - unlimited)

**FR-063**: System SHALL process subscription upgrades immediately with prorated charges: `new_plan_price - (old_plan_price × days_remaining / 30)`

**FR-064**: System SHALL process subscription downgrades at end of billing cycle, maintaining current tier access until renewal date

**FR-065**: System SHALL implement payment failure grace period (7 days) with retry schedule: Day 3, Day 5, Day 7 before downgrading to Free tier

**FR-066**: System SHALL generate invoices with line items: subscription charges, prorated credits, taxes (if applicable), total amount, payment method

**FR-067**: System SHALL send billing notifications: payment successful, payment failed (with retry schedule), upcoming renewal (3 days before), subscription cancelled

**FR-068**: System SHALL process refunds (admin-initiated only) via billing provider API, updating subscription status and access immediately

**FR-069**: System SHALL enforce plan limits: Free (paper trading only), Basic (1 broker connection), Pro (3 brokers, basic analytics), Premium (unlimited brokers, ML features, priority support)

**FR-070**: System SHALL handle webhook events from billing providers: `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`, `charge.refunded`

### Security & Compliance

**FR-071**: System SHALL pass OWASP Top 10 security audit with 0 Critical and 0 High severity findings before production deployment

**FR-072**: System SHALL implement Content-Security-Policy headers via Helmet.js preventing XSS attacks: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' https://fonts.googleapis.com`

**FR-073**: System SHALL use parameterized queries for all database operations preventing SQL injection (MongoDB: use Mongoose models; Postgres: use prepared statements)

**FR-074**: System SHALL validate all user inputs with JSON Schema validation (API requests) and sanitization (HTML/SQL special characters escaped)

**FR-075**: System SHALL enforce HTTPS-only communication with HSTS header: `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`

**FR-076**: System SHALL implement rate limiting per IP address: API endpoints (100 req/min), WebSocket connections (10 conn/min), auth endpoints (see FR-026)

**FR-077**: System SHALL rotate encryption keys automatically on January 1st each year via scheduled cron job, maintaining backward-compatible decryption supporting previous 2 key versions for 60-day grace period during smooth transition

**FR-078**: System SHALL implement least privilege access control: users access own data only, admins access analytics/audit logs, system accounts isolated by function

**FR-079**: System SHALL sanitize error messages returned to clients, preventing information disclosure (e.g., "Authentication failed" not "User not found in database")

**FR-080**: System SHALL implement security headers: X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy: strict-origin-when-cross-origin

### Deployment & Operations

**FR-081**: System SHALL deploy to Railway platform with environment variables loaded from Railway dashboard (not committed to git)

**FR-082**: System SHALL connect to MongoDB Atlas cluster with connection string format `mongodb+srv://[username]:[password]@cluster0.mongodb.net/[database]`

**FR-083**: System SHALL use Redis for session storage (connect-mongo alternative) and Socket.IO adapter (multi-instance pub/sub)

**FR-084**: System SHALL expose health check endpoint `/health` returning 200 OK with response: `{status: "healthy", mongodb: "connected", redis: "connected", uptime: [seconds]}`

**FR-085**: System SHALL implement graceful shutdown handling SIGTERM signal: close WebSocket connections → drain HTTP requests → disconnect databases → exit with code 0

**FR-086**: System SHALL enable Railway auto-scaling based on CPU utilization threshold: scale up at >80%, scale down at <20%, min 2 instances, max 10 instances

**FR-087**: System SHALL implement blue-green deployment strategy for zero-downtime updates with gradual traffic shift: deploy new version (green) → health check → shift traffic in stages (0%→10%→25%→50%→100% with 2-minute health check intervals between stages) → shutdown old version (blue)

**FR-088**: System SHALL configure Winston logger with log levels: error (always), warn (production), info (staging), debug (development), with JSON formatting for log aggregation

**FR-089**: System SHALL implement structured logging including: timestamp, level, message, context (userId, requestId, traceId), error stack traces (if applicable)

**FR-090**: System SHALL send critical errors to monitoring service (Sentry.io or Railway logs) with alerting on: uncaught exceptions, database connection failures, broker API errors

---

## Key Entities

### User
- **id**: UUID (primary key)
- **discordId**: String (unique OAuth identifier)
- **email**: String (optional fallback auth)
- **passwordHash**: String (bcrypt, optional)
- **subscriptionTier**: Enum (Free, Basic, Pro, Premium)
- **subscriptionStatus**: Enum (active, past_due, cancelled, trial)
- **subscriptionRenewalDate**: DateTime
- **createdAt**: DateTime
- **lastLoginAt**: DateTime

### BrokerConnection
- **id**: UUID (primary key)
- **userId**: UUID (foreign key → User)
- **brokerType**: Enum (alpaca, ibkr, schwab, coinbase, kraken, binance)
- **credentials**: Object (encrypted JSON: {apiKey, apiSecret, accessToken})
- **isActive**: Boolean
- **lastHealthCheck**: DateTime
- **createdAt**: DateTime

### Trade
- **id**: UUID (primary key)
- **userId**: UUID (foreign key → User)
- **brokerConnectionId**: UUID (foreign key → BrokerConnection)
- **symbol**: String (ticker)
- **quantity**: Decimal
- **orderType**: Enum (market, limit, stop_loss, stop_limit, trailing_stop)
- **side**: Enum (buy, sell)
- **limitPrice**: Decimal (nullable)
- **stopPrice**: Decimal (nullable)
- **status**: Enum (pending, submitted, filled, partial_fill, rejected, cancelled)
- **submittedAt**: DateTime
- **filledAt**: DateTime (nullable)
- **fillPrice**: Decimal (nullable)
- **brokerOrderId**: String
- **errorMessage**: String (nullable)

### Position
- **id**: UUID (primary key)
- **userId**: UUID (foreign key → User)
- **brokerConnectionId**: UUID (foreign key → BrokerConnection)
- **symbol**: String
- **quantity**: Decimal
- **averageEntryPrice**: Decimal
- **currentPrice**: Decimal (updated via WebSocket)
- **unrealizedPnL**: Decimal (calculated field)
- **stopLossPrice**: Decimal (nullable, auto-submitted order)
- **openedAt**: DateTime
- **closedAt**: DateTime (nullable)

### AuditLog
- **id**: UUID (primary key)
- **timestamp**: DateTime (indexed)
- **userId**: UUID (indexed)
- **action**: Enum (TRADE_EXECUTED, ORDER_CANCELLED, LOGIN_SUCCESS, CREDENTIALS_UPDATED, ...)
- **resourceType**: String (Trade, User, BrokerConnection, etc.)
- **resourceId**: UUID
- **ipAddress**: String
- **userAgent**: String
- **status**: Enum (success, failure)
- **errorMessage**: String (nullable)
- **previousHash**: String (SHA-256, blockchain-style integrity)
- **currentHash**: String (SHA-256 of this record)

### Subscription
- **id**: UUID (primary key)
- **userId**: UUID (foreign key → User)
- **plan**: Enum (Free, Basic, Pro, Premium)
- **status**: Enum (active, past_due, cancelled, trial)
- **billingProvider**: Enum (polar, stripe)
- **billingProviderCustomerId**: String
- **billingProviderSubscriptionId**: String
- **currentPeriodStart**: DateTime
- **currentPeriodEnd**: DateTime
- **cancelledAt**: DateTime (nullable)
- **createdAt**: DateTime

---

## Success Criteria

**SC-001**: Users execute trades from Discord signals with <30 second median latency (P95 <45 seconds)

**SC-002**: System achieves 99.5% uptime during market hours (9:30am-4:00pm ET Mon-Fri) excluding scheduled maintenance windows (maximum 2 hours/month during pre-market hours 6:00am-9:30am ET)

**SC-003**: Users connect brokers successfully >98% of attempts (excluding user error like invalid credentials)

**SC-004**: WebSocket portfolio updates reflect broker state changes within 500ms (P95) and 1000ms (P99)

**SC-005**: Zero unauthorized data access incidents (cross-user data leakage, audit log tampering) in production

**SC-006**: System handles 1000+ concurrent WebSocket connections with <100ms latency per constitutional standard

**SC-007**: All P1 user stories (US-001, US-002, US-004, US-006, US-007, US-008, US-009, US-012, US-013) pass acceptance tests before production launch

**SC-008**: OAuth2 token refresh succeeds automatically >99.9% of attempts (excluding network failures outside system control)

**SC-009**: Subscription billing processes correctly with <0.1% error rate (payment failures due to declined cards excluded)

**SC-010**: MRR calculations match accounting records within $0.01 variance (rounding tolerance)

**SC-011**: Churn prediction model achieves >70% accuracy (F1 score >0.70) on holdout validation set

**SC-012**: Audit logs maintain immutability with 100% integrity verification via cryptographic hashing

**SC-013**: OWASP security audit passes with 0 Critical and 0 High findings (Medium findings documented with accepted risk)

**SC-014**: Risk management prevents catastrophic losses: 0 incidents of user losses exceeding configured daily loss limit due to system failure

**SC-015**: Stop-loss orders execute within 2 seconds of market price trigger (P95) during normal market conditions

**SC-016**: Railway deployment completes successfully >95% of attempts with automated rollback on health check failure

**SC-017**: Blue-green deployments achieve zero-downtime with <5 seconds of request latency spike during traffic shift

**SC-018**: System scales horizontally to 10 instances during peak load (market open 9:30am ET) without user disruption

**SC-019**: Broker API rate limits respected with 0 rate-limit-induced trade failures (requests queued and processed within acceptable latency)

**SC-020**: Trade execution success rate >98% (excluding market closures, insufficient funds, invalid symbols)

**SC-021**: Users receive real-time trade confirmations via WebSocket within 2 seconds of broker fill

**SC-022**: Analytics dashboard loads within 2 seconds for admins (P95 latency for initial page load with data)

**SC-023**: Cohort retention data accuracy: ±1% variance from manual SQL query verification

**SC-024**: System processes 10,000+ trades per day during high volume periods without performance degradation

**SC-025**: Automated tests achieve >80% global coverage and >95% coverage for critical paths (authentication, trade execution, risk validation, audit logging) per constitutional mandate

**SC-026**: Audit log hash chain validation succeeds for 100% of logs with zero integrity failures detected (validates FR-055 cryptographic hashing implementation)

---

## Edge Cases & Assumptions

### Edge Cases

1. **Market Halts/Circuit Breakers**: NYSE/NASDAQ trading halts require queuing orders with "market_halted" status, resuming automatically when trading resumes (detected via broker API status codes)

2. **Broker API Outages**: Complete broker unavailability (all retry attempts failed) triggers user notification "Broker offline - order not submitted" with no charge to user's trade quota, manual retry option provided

3. **Cryptocurrency Decimal Precision**: Different exchanges use varying precision (8 decimals for Binance, 10 for Kraken) requiring normalization layer in CCXT adapter to prevent rounding errors causing order rejections

4. **Pre-Market/After-Hours Trading**: Extended hours orders require explicit user opt-in (default: disabled) due to higher volatility and lower liquidity risks

5. **Partial Fills**: Orders partially filled (e.g., 60 of 100 shares) emit `trade.partialFill` WebSocket event, remaining quantity marked "pending_fill" with 5-minute timeout before cancellation

6. **Concurrent Signal Processing**: Multiple signals for same symbol within <5 seconds triggers aggregation logic (combine quantities if same direction, reject if conflicting directions with user notification)

7. **Session Expiry During Active WebSocket**: Token expiry during WebSocket session sends `token.expiring` event 5 minutes before expiry, client auto-refreshes token, connection persists without interruption

8. **Subscription Downgrade Mid-Cycle**: User downgrades Premium → Basic mid-month, system maintains Premium features until end of paid period, then applies Basic limits (broker connections >1 disconnected with 7-day warning)

9. **Billing Provider Switch**: Migrating Polar.sh → Stripe requires one-time manual export/import of subscription data, BillingProviderFactory handles runtime switching without code changes

10. **Multi-Device WebSocket Conflicts**: User opens dashboard on phone and laptop simultaneously, both WebSocket connections receive identical events (no deduplication needed, client handles UI updates)

11. **WebSocket Event Ordering During High Load**: System maintains causal order for related events (e.g., trade.submitted always emitted before trade.filled) via sequence numbers included in event payloads, preventing UI race conditions where fill notification arrives before submission confirmation

### Assumptions

1. **Discord API Reliability**: Assume Discord gateway uptime >99%, system logs missed messages during outages but does NOT queue historical signals (risk of executing stale trades)

2. **Broker API Response Times**: Assume broker APIs respond within 5 seconds P95 (Alpaca/IBKR/Schwab SLAs), timeouts set at 10 seconds with exponential backoff retries

3. **User Trading Knowledge**: Assume users understand basic trading concepts (market orders, limit orders, stop-loss), no in-app trading education provided (external docs only)

4. **Regulatory Compliance**: Assume users responsible for tax reporting (1099 forms from brokers), platform does NOT provide tax calculation or advice

5. **Market Data Licensing**: Assume real-time market data accessed via broker APIs (no direct exchange fees), users accept broker's data licensing terms

6. **Network Stability**: Assume Railway platform maintains >99.9% network uptime, database connections use automatic retry with connection pooling (max 100 connections)

7. **MongoDB Performance**: Assume MongoDB Atlas M10 cluster sufficient for <10,000 users, scaling to M20/M30 planned for >25,000 users (documented in scaling plan)

8. **Redis Reliability**: Assume Redis uptime >99.9% for session storage, fallback to MongoDB sessions on Redis failure (degrades WebSocket scaling but maintains functionality)

9. **HTTPS/TLS Everywhere**: Assume all communication encrypted in transit (Railway provides TLS termination), no plaintext HTTP endpoints exposed

10. **Timezone Handling**: All timestamps stored in UTC (ISO 8601 format), displayed in user's local timezone via browser conversion (no server-side timezone logic)

---

## Glossary

**Broker**: Financial service provider enabling trade execution across asset classes (stocks, options, crypto). Used interchangeably with "exchange" in crypto context. System supports 6 brokers: Alpaca, Interactive Brokers, Charles Schwab (stocks), Coinbase Pro, Kraken, Binance (crypto).

**Paper Trading**: Simulated trading using broker sandbox/testnet APIs with virtual funds (no real money at risk). Used for testing trade execution logic without financial liability. All brokers must support paper trading mode per Constitution Principle III.

**Market Hours**: Trading session times for primary exchange where security is listed (e.g., NYSE: 9:30am-4:00pm ET Mon-Fri, crypto exchanges: 24/7). System queries broker API `/clock` endpoint to detect market open/closed status.

**Constitutional Compliance Percentage**: Percentage of implementation tasks completed from OpenSpec proposals, calculated as (completed tasks / total tasks). NOT a measure of adherence to constitutional principles. Example: "OAuth2 39.9% complete" means 65/163 tasks done, not that system violates 60.1% of constitution.

**WebSocket Event Ordering**: Causal order preservation for related events (e.g., `trade.submitted` always precedes `trade.filled` for same order). Achieved via sequence numbers in event payloads to prevent UI race conditions.

**Rate Limit Headroom**: Buffer percentage maintained between actual API usage and broker's rate limit. System enforces 50% headroom (e.g., Alpaca allows 200 req/min, system uses max 100 req/min) measured per 1-minute rolling window.

**Audit Log Hash Chain**: Cryptographic integrity mechanism where each log entry's hash is computed from previous entry's hash plus current entry fields (SHA-256 of: previousHash + timestamp + userId + action + resourceId), creating tamper-evident blockchain-style chain.

---

## Out of Scope (Future Phases)

The following features are explicitly OUT OF SCOPE for this specification and deferred to future phases:

1. **Mobile Native Apps**: iOS/Android apps deferred, mobile-responsive web dashboard sufficient for MVP
2. **Options Trading**: Stock/crypto options require complex risk modeling, Phase 2 feature
3. **Futures/Forex**: Futures contracts and forex pairs excluded from initial broker integrations
4. **Paper Trading Competitions**: Gamified leaderboards with simulated trading deferred to social features expansion
5. **Custom Signal Webhooks**: User-configured webhook URLs (non-TradingView) deferred pending demand validation
6. **Portfolio Backtesting**: Historical strategy simulation excluded, analytics focus on forward-looking metrics
7. **Tax Reporting Integration**: 1099 generation and tax-loss harvesting deferred to Phase 3 compliance features
8. **Multi-Currency Support**: USD-only billing and portfolio values, international currencies Phase 2
9. **White-Label/B2B**: Self-hosted deployments for Discord communities deferred to enterprise tier
10. **Voice Trading**: Discord voice channel signal detection deferred pending voice recognition POC

---

## Dependencies

### External Services

1. **Discord API**: OAuth2 authentication, bot gateway for signal monitoring (v10 REST API, Gateway v10)
2. **Broker APIs**: Alpaca (v2 REST), IBKR (IB Gateway 10.19+), Schwab (OAuth2 + REST), Coinbase Pro (REST + FIX), Kraken (REST v2), Binance (REST + WebSocket)
3. **Railway Platform**: Deployment infrastructure, environment variables, auto-scaling, monitoring
4. **MongoDB Atlas**: Database hosting (M10 cluster minimum), automated backups, connection string managed via Railway secrets
5. **Redis Cloud**: Session storage, Socket.IO adapter, rate limiting (Upstash or Railway Redis addon)
6. **Billing Providers**: Polar.sh (preferred) or Stripe (fallback) for subscription management, webhook handling
7. **Email Service**: SendGrid or Resend for transactional emails (subscription notifications, security alerts)
8. **CCXT Library**: Unified cryptocurrency exchange API (v4.1.99+), handles exchange-specific quirks

### Internal Dependencies

1. **Constitution v1.0.0**: All development must comply with 7 core principles (Security-First, Test-First, Broker Abstraction, Real-Time Standards, API-First, Observability, Graceful Error Handling)
2. **OpenSpec Proposals**: 20+ change proposals consolidated into this spec, source of truth for implementation details (see openspec/changes/)
3. **Test Infrastructure**: Jest (unit/integration tests), Playwright (E2E tests), coverage >80% global, >95% critical paths
4. **Deployment Prerequisites**: 4 blockers must resolve before production: (1) OWASP security audit, (2) Test-first compliance for OAuth2/billing, (3) JWT WebSocket authentication, (4) Immutable audit logging

### Technical Prerequisites

1. **Node.js >=22.11.0**: Runtime environment with ES modules support
2. **MongoDB 8.0.4**: Database with aggregation pipeline, TTL indexes, change streams
3. **Redis 7.0+**: Pub/sub, session storage, rate limiting with token bucket algorithm
4. **TLS Certificates**: HTTPS enforcement via Railway (automatic Let's Encrypt provisioning)
5. **Environment Variables**: 25+ secrets managed via Railway dashboard (API keys, database URIs, encryption keys)

---

## Notes

- This specification consolidates 20+ OpenSpec proposals (see openspec/changes/) with completion percentages recalculated using quality gates formula
- Constitutional compliance required: 7 principles ratified 2025-10-21 establish non-negotiable standards
- 4 deployment blockers identified prevent production launch until resolved: (1) OWASP audit, (2) Test-first mandate compliance, (3) WebSocket JWT auth, (4) Audit logging
- Success Criteria SC-001 to SC-025 align with constitutional performance standards (<500ms trade execution, <200ms API, <100ms WebSocket, 1000+ concurrent connections)
- Priority assignments (P1/P2/P3) reflect constitutional principle criticality: P1 includes Security-First and Test-First mandates (US-001, US-002, US-004, US-006, US-007, US-008, US-009, US-012, US-013)
- Requirements FR-001 to FR-090 are technology-specific but testable, mapped to 13 user stories for traceability
- Key Entities schema reflects MongoDB document structure with Mongoose models, relationships via foreign key UUIDs
- Edge Cases section documents known failure modes with recovery strategies (no "unknown unknowns" accepted per Principle VII)
- Out of Scope section explicitly defers 10 features to prevent scope creep during implementation
- Next steps: Run /speckit.plan to generate implementation plan, then /speckit.tasks for breakdown, validation loop before /speckit.implement



<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.
  
  Assign priorities (P1, P2, P3, etc.) to each story, where P1 is the most critical.
  Think of each story as a standalone slice of functionality that can be:
  - Developed independently
  - Tested independently
  - Deployed independently
  - Demonstrated to users independently
-->

### User Story 1 - [Brief Title] (Priority: P1)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently - e.g., "Can be fully tested by [specific action] and delivers [specific value]"]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]
2. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

### User Story 2 - [Brief Title] (Priority: P2)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

