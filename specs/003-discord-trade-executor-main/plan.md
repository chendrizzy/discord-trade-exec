# Implementation Plan: Discord Trade Executor SaaS

**Branch**: `003-discord-trade-executor-main` | **Date**: 2025-10-22 | **Spec**: [spec.md](./spec.md)  
**Input**: Comprehensive product specification consolidating 20+ OpenSpec proposals with constitutional alignment  
**Constitution Version**: 1.0.0 (ratified 2025-10-21)

**Note**: This plan follows the Speckit workflow after specification creation. Execute deployment blockers first, then core features per priority assignments.

## Summary

**Primary Requirement**: Build a production-ready SaaS platform that automates trade execution from Discord signals and TradingView webhooks across multiple brokers (stocks and crypto) with real-time portfolio updates, risk management, subscription billing, and business analytics.

**Technical Approach**: 
- **Backend**: Node.js (22.11.0+) with Express.js API framework, MongoDB Atlas for persistence, Redis for session/WebSocket scaling
- **Real-Time**: Socket.IO with JWT authentication, Redis adapter for horizontal scaling (1000+ concurrent connections)
- **Broker Abstraction**: Adapter pattern with factory (6 brokers: Alpaca, IBKR, Schwab, Coinbase, Kraken, Binance via CCXT)
- **Frontend**: React 19.2.0 SPA with Vite build, TailwindCSS + Radix UI, WebSocket client for live updates
- **Security**: OAuth2 (Discord), AES-256-GCM encryption, OWASP Top 10 compliance, immutable audit logs
- **Deployment**: Railway platform with MongoDB Atlas, Redis Cloud, blue-green deployments, auto-scaling
- **Testing**: Jest (unit/integration), Playwright (E2E), >95% coverage for critical paths per Test-First principle

**Current State**: 45% complete (449/992 tasks), 4 deployment blockers identified (OWASP audit, test compliance, WebSocket JWT auth, audit logging)

**Current State**: 45% complete (449/992 tasks), 4 deployment blockers identified (OWASP audit, test compliance, WebSocket JWT auth, audit logging)

## Technical Context

**Language/Version**: Node.js >=22.11.0 (runtime), JavaScript ES2023 (codebase uses `use strict`)  
**Primary Dependencies**: 
- **Backend**: Express.js 4.18.2, Mongoose 8.0.4, Discord.js 14.14.1, Socket.IO 4.7.5, CCXT 4.1.99, Passport.js 0.7.0, Winston 3.11.0
- **Broker APIs**: @alpacahq/alpaca-trade-api 3.1.3, @stoqey/ib 1.5.1 (Interactive Brokers), CCXT library (Coinbase/Kraken/Binance)
- **Frontend**: React 19.2.0, Vite 6.0.5, TailwindCSS 3.4.16, Radix UI components, Recharts 3.2.1
- **Security**: Helmet 7.1.0, Joi 18.0.1, jsonwebtoken 9.0.2, bcrypt 6.0.0, rate-limiter-flexible 5.0.3  

**Storage**: 
- **Primary Database**: MongoDB Atlas 8.0.4+ (documents: User, Trade, Position, AuditLog, Subscription, BrokerConnection)
- **Session Store**: MongoDB via connect-mongo 5.1.0 (fallback) OR Redis 7.0+ via ioredis 5.4.1 (preferred for WebSocket scaling)
- **Cache Layer**: Redis 7.0+ for Socket.IO adapter (@socket.io/redis-adapter 8.3.0), rate limiting, market data cache  

**Testing**: 
- **Unit/Integration**: Jest 30.2.0 with MongoDB Memory Server 10.2.1, Sinon 21.0.0 for mocking, Supertest 7.1.4 for API tests
- **E2E**: Playwright 1.55.0 for browser automation
- **Coverage Targets**: >80% global, >95% critical paths (auth, trade execution, risk validation, billing) per Constitution Principle II  

**Target Platform**: 
- **Server**: Linux (Railway containerized deployment), horizontal scaling via Railway auto-scale
- **Client**: Modern browsers (Chrome/Firefox/Safari latest 2 versions), mobile-responsive web (no native apps in MVP)  

**Project Type**: Web application (backend API + frontend SPA) with real-time WebSocket layer  

**Performance Goals**:
- Trade execution latency: <500ms p95 (signal received → broker order submitted)
- API response time: <200ms p95 (dashboard data endpoints)
- WebSocket message delivery: <100ms p95 (trade notification → user receipt)
- Database query time: <50ms p95 (portfolio queries, user data)
- Page load time: <3s p95 (dashboard initial load with data)
- Concurrent WebSocket connections: 1000+ per instance (Redis adapter enables horizontal scaling beyond)  

**Constraints**:
- **Financial Compliance**: Immutable audit logs (7-year retention per SEC/FinCEN requirements), all financial operations logged with cryptographic integrity
- **Security**: OWASP Top 10 compliance mandatory before production, AES-256-GCM encryption for credentials, JWT auth for WebSockets
- **Broker Rate Limits**: Alpaca (200 req/min), IBKR (50 req/min), Schwab (120 req/min), exchanges per CCXT specs - must maintain 50% headroom
- **Uptime**: 99.5% during market hours (9:30am-4:00pm ET Mon-Fri)
- **Test-First**: >95% test coverage for critical paths (auth, trade execution, billing, risk management) per Constitution Principle II NON-NEGOTIABLE  

**Scale/Scope**:
- **Users**: Target 10,000 users in first year (Free/Basic/Pro/Premium tiers)
- **Trades**: Support 10,000+ trades/day during peak periods without performance degradation
- **Codebase**: 13 user stories, 90 functional requirements, 6 key entities, 25 success criteria
- **Brokers**: 6 broker integrations (3 stock brokers: Alpaca/IBKR/Schwab, 3 crypto exchanges: Coinbase/Kraken/Binance)
- **Features**: Trade execution, multi-broker support, real-time dashboard, OAuth2 auth, risk management, audit logging, WebSocket infrastructure, subscription billing, analytics platform, deployment automation

- **Features**: Trade execution, multi-broker support, real-time dashboard, OAuth2 auth, risk management, audit logging, WebSocket infrastructure, subscription billing, analytics platform, deployment automation

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### ✅ Principle I: Security-First Development (NON-NEGOTIABLE)

**Status**: ✅ COMPLIANT with 1 DEPLOYMENT BLOCKER pending implementation

- [x] **AES-256-GCM encryption** specified for all sensitive data (FR-014: broker credentials, FR-077: key rotation)
- [x] **Input validation** required on ALL user inputs (FR-074: JSON Schema validation, sanitization)
- [x] **OAuth2 authentication** specified with secure session management (US-004: OAuth2 flow, FR-021-030)
- [x] **Rate limiting** on ALL endpoints (FR-026: auth endpoints, FR-076: API/WebSocket rate limits)
- [x] **Security headers** via Helmet.js (FR-072: Content-Security-Policy, FR-080: additional headers)
- [x] **API key permissions** validated (FR-015: test API call on connection, read/trade only)
- [x] **Encrypted data never logged** (FR-054: audit log fields exclude credential values)

**DEPLOYMENT BLOCKER**:
- ⏳ **US-009**: OWASP Top 10 security audit NOT YET COMPLETED (FR-071 requires 0 Critical/0 High findings before production)
  - **Action Required**: Schedule third-party penetration test, run automated OWASP ZAP scan, remediate all Critical/High findings
  - **Acceptance Criteria**: 5 scenarios defined in US-009 (scan completion, remediation, SQL injection fix, CSP headers, clearance certificate)
  - **Timeline**: 1-2 weeks estimated per action plan

**Verification**: Security audit checklist in spec (FR-071 to FR-080), constitution compliance audit shows 62/100 score with blocker documented

---

### ✅ Principle II: Test-First for Critical Paths (NON-NEGOTIABLE)

**Status**: ⚠️ PARTIALLY COMPLIANT with 1 DEPLOYMENT BLOCKER pending test coverage

- [x] **TDD mandatory** for financial operations (US-001: trade execution with 5 acceptance scenarios)
- [x] **TDD mandatory** for security features (US-004: OAuth2 with 5 scenarios, US-008: WebSocket JWT auth with 5 scenarios)
- [x] **TDD mandatory** for billing (US-012: subscription billing with 5 scenarios)
- [x] **TDD mandatory** for integration points (US-002: broker adapters with 5 scenarios per broker)
- [x] **Tests written FIRST** principle documented (all 13 user stories include "Independent Test" descriptions)
- [x] **Red-Green-Refactor** cycle required per constitution development workflow

**DEPLOYMENT BLOCKER**:
- ⏳ **SC-025**: Test coverage >95% for critical paths NOT YET ACHIEVED for OAuth2 and billing modules
  - **Current State**: OAuth2 at 39.9% (65/163 tasks), billing provider abstraction specified but not fully tested
  - **Action Required**: Write tests FIRST for FR-021 to FR-030 (OAuth2), FR-061 to FR-070 (billing), achieve >95% line/branch coverage
  - **Acceptance Criteria**: Jest coverage reports show >95% for `src/auth/*`, `src/billing/*`, all tests pass in CI/CD
  - **Timeline**: 1 week estimated per action plan

**Verification**: SC-025 success criterion enforces coverage targets, 65 acceptance scenarios provide test templates, Jest configured in package.json

---

### ✅ Principle III: Broker Abstraction & Adapter Pattern

**Status**: ✅ COMPLIANT - Adapter pattern fully specified

- [x] **Base interface** defined (FR-011: `BrokerAdapter` with standardized methods: `connect()`, `placeOrder()`, `cancelOrder()`, `getPositions()`, `getBalance()`, `getOrderStatus()`)
- [x] **Factory pattern** specified (FR-017: `BrokerFactory` instantiates adapters based on broker type)
- [x] **Implementations** documented (FR-012: Alpaca/IBKR/Schwab, FR-013: Coinbase/Kraken/Binance via CCXT)
- [x] **Rate limiting** per adapter (FR-016: token bucket algorithm with broker-specific limits)
- [x] **Error handling** standardized (FR-018: map broker error codes to `INSUFFICIENT_FUNDS`, `INVALID_SYMBOL`, etc.)
- [x] **Paper trading** required (US-001 Independent Test specifies paper trading accounts for testing)
- [x] **No direct API calls** in application code (FR-017: adapter pattern isolates broker-specific logic)

**Verification**: US-002 (P1 priority), 10 requirements (FR-011 to FR-020), package.json shows broker SDKs (alpaca-trade-api, @stoqey/ib, ccxt)

---

### ✅ Principle IV: Real-Time Communication Standards

**Status**: ⚠️ PARTIALLY COMPLIANT with 1 DEPLOYMENT BLOCKER pending JWT authentication

- [x] **Socket.IO** specified with Redis adapter (FR-031, FR-039: @socket.io/redis-adapter for horizontal scaling)
- [x] **Automatic reconnection** with exponential backoff (FR-036: 1s, 2s, 4s, 8s, 16s, 30s max)
- [x] **Room-based isolation** documented (FR-038: Redis Pub/Sub prevents cross-user data leakage)
- [x] **Heartbeat mechanism** for connection health (FR-040: connection lifecycle events including `connection.error`)
- [x] **Graceful degradation** to polling fallback (Constitution Principle IV requires system function without WebSocket)
- [x] **Message throttling** specified (Constitution Principle IV: max 10 messages/second per user)
- [x] **Connection limits** defined (SC-006: 1000+ concurrent connections per instance, horizontal scaling beyond)

**DEPLOYMENT BLOCKER**:
- ⏳ **US-008**: JWT-based WebSocket authentication NOT YET IMPLEMENTED (FR-031, FR-032 specified but code pending)
  - **Current State**: WebSocket infrastructure started (6.8% complete per OpenSpec proposal), JWT auth layer missing
  - **Action Required**: Implement JWT token validation on WebSocket connection upgrade (query param `?token=[jwt]`), reject unauthorized connections
  - **Acceptance Criteria**: 5 scenarios in US-008 (auth flow, expired tokens, unauthorized access, token refresh, multi-device)
  - **Timeline**: 3-5 days estimated per action plan

**Verification**: US-003 (Real-Time Dashboard P2), US-008 (WebSocket Auth P1), 10 requirements (FR-031 to FR-040), package.json shows socket.io 4.7.5

---

### ✅ Principle V: API-First Design with Provider Abstraction

**Status**: ✅ COMPLIANT - Provider abstraction fully specified

- [x] **Base interface** defined (FR-061: `BillingProvider` abstract class with standardized methods)
- [x] **Factory pattern** specified (FR-061: `BillingProviderFactory` selects via `BILLING_PROVIDER` env var)
- [x] **Multiple providers** supported (US-012: Polar.sh primary, Stripe fallback)
- [x] **Data normalization** documented (FR-070: provider-specific webhook events normalized to internal models)
- [x] **Webhook security** specified (Constitution Principle V: HMAC-SHA256 signature verification)
- [x] **Mock support** for development (Constitution Principle V: dev mode works without external API dependency)

**Verification**: US-012 (Subscription Billing P1), 10 requirements (FR-061 to FR-070), package.json shows @polar-sh/sdk 0.37.0

---

### ✅ Principle VI: Observability & Operational Transparency

**Status**: ✅ COMPLIANT - Observability infrastructure fully specified

- [x] **Structured logging** via Winston (FR-088: severity levels error/warn/info/debug, JSON formatting)
- [x] **Request logging** for ALL API calls (FR-089: timestamp, level, message, context with userId/requestId/traceId)
- [x] **Error tracking** with context (FR-090: Sentry.io or Railway logs with alerting on uncaught exceptions)
- [x] **Performance monitoring** documented (Technical Context: trade latency <500ms p95, API <200ms p95, WebSocket <100ms p95)
- [x] **Health check endpoints** specified (FR-084: `/health` returns 200 OK with MongoDB/Redis connection status)
- [x] **Metrics collection** for business KPIs (FR-041-050: MRR/ARR, churn prediction, cohort retention)
- [x] **Audit logs** immutable (FR-051-060: append-only MongoDB collection, 7-year retention, cryptographic hashing)
- [x] **Log sanitization** enforced (FR-054: excludes API keys, passwords, session tokens, PII beyond userIds)

**Verification**: US-013 (Railway Deployment P1), FR-088 to FR-090, package.json shows winston 3.11.0

---

### ✅ Principle VII: Graceful Error Handling & User Communication

**Status**: ✅ COMPLIANT - Error handling patterns fully specified

- [x] **User-facing errors** generic and actionable (FR-079: "Authentication failed" not "User not found in database")
- [x] **Internal errors** detailed with full context (FR-089: error stack traces in logs)
- [x] **No information disclosure** (FR-079: sanitize error messages, no stack traces to users)
- [x] **Retry logic** for transient failures (FR-009: exponential backoff 1s, 2s, 4s for broker API calls)
- [x] **Fallback behavior** documented (Edge Cases: broker outages handled gracefully, WebSocket falls back to polling)
- [x] **User notifications** for critical errors (US-001 scenarios: trade failures sent via Discord DM and dashboard)
- [x] **HTTP status codes** semantically correct (FR-076: 400 client errors, 401 unauth, 403 forbidden, 429 rate limited, 500 server, 503 unavailable)

**Verification**: 10 edge cases documented with recovery strategies, FR-009 (retry logic), FR-079 (error sanitization)

---

### 📊 Constitution Compliance Summary

| Principle                              | Status      | Blockers                                       | Verification              |
| -------------------------------------- | ----------- | ---------------------------------------------- | ------------------------- |
| **I. Security-First (NON-NEGOTIABLE)** | ✅ Specified | ⏳ 1 blocker (OWASP audit pending)              | US-009, FR-071-080        |
| **II. Test-First (NON-NEGOTIABLE)**    | ⚠️ Partial   | ⏳ 1 blocker (coverage <95% for OAuth2/billing) | SC-025, 65 test scenarios |
| **III. Broker Abstraction**            | ✅ Compliant | None                                           | US-002, FR-011-020        |
| **IV. Real-Time Standards**            | ⚠️ Partial   | ⏳ 1 blocker (JWT WebSocket auth pending)       | US-008, FR-031-040        |
| **V. API-First Provider Abstraction**  | ✅ Compliant | None                                           | US-012, FR-061-070        |
| **VI. Observability**                  | ✅ Compliant | None                                           | US-013, FR-088-090        |
| **VII. Graceful Error Handling**       | ✅ Compliant | None                                           | 10 edge cases, FR-009/079 |

**Overall Assessment**: 
- **Specification Phase**: ✅ PASS - All principles addressed in spec with comprehensive requirements
- **Implementation Phase**: ⏳ BLOCKED - 3 deployment blockers (1 overlaps with 2 principles) prevent production deployment:
  1. US-009: OWASP security audit (Principle I)
  2. SC-025: Test coverage >95% for critical paths (Principle II)
  3. US-008: JWT WebSocket authentication (Principle IV)
- **Additional Blocker**: US-007 (immutable audit logging) also required but overlaps with Principle I/VI compliance

**Next Actions**:
1. ✅ Proceed to Phase 0 (research.md) - constitution check PASSED for planning
2. ⏳ Resolve 4 deployment blockers before `/speckit.implement` execution (1-2 weeks timeline)
3. ✅ Re-check constitution compliance after Phase 1 design (data-model.md, contracts/)

---

---

## Project Structure

### Documentation (this feature)

```text
specs/003-discord-trade-executor-main/
├── spec.md              # Feature specification (COMPLETE - 959 lines, 13 user stories, 90 requirements)
├── plan.md              # This file (IN PROGRESS - Phase 0-1 planning)
├── research.md          # Phase 0 output (PENDING - technology decisions, best practices)
├── data-model.md        # Phase 1 output (PENDING - entity schemas, relationships, validation)
├── quickstart.md        # Phase 1 output (PENDING - developer onboarding, local setup)
├── contracts/           # Phase 1 output (PENDING - API contracts, OpenAPI specs)
│   ├── api-spec.yaml   # REST API OpenAPI 3.0 specification
│   ├── websocket-events.md  # Socket.IO event schemas (portfolio.*, trade.*, market.*, connection.*)
│   └── broker-adapter-interface.md  # BrokerAdapter contract (15 methods)
├── tasks.md             # Phase 2 output (PENDING - created by /speckit.tasks command)
└── checklists/
    └── requirements.md  # Quality validation checklist (COMPLETE - all gates passed)
```

### Source Code (repository root)

**Structure Type**: Web application (backend API + frontend SPA)

```text
discord-trade-exec/
├── src/                       # Backend Node.js application
│   ├── index.js              # Express server entry point, middleware setup
│   ├── config/               # Configuration management
│   │   ├── database.js       # MongoDB connection, Mongoose setup
│   │   ├── redis.js          # Redis connection for sessions + Socket.IO adapter
│   │   └── env.js            # Environment variable validation (dotenv)
│   ├── models/               # Mongoose schemas (6 core entities)
│   │   ├── User.js           # User (id, discordId, subscriptionTier, subscriptionStatus)
│   │   ├── BrokerConnection.js  # BrokerConnection (userId, brokerType, credentials encrypted)
│   │   ├── Trade.js          # Trade (symbol, quantity, orderType, status, fillPrice)
│   │   ├── Position.js       # Position (symbol, averageEntryPrice, unrealizedPnL, stopLossPrice)
│   │   ├── AuditLog.js       # AuditLog (timestamp, action, ipAddress, previousHash, currentHash)
│   │   └── Subscription.js   # Subscription (plan, billingProvider, currentPeriodStart/End)
│   ├── routes/               # Express route handlers (API endpoints)
│   │   ├── auth.js           # OAuth2 routes (/auth/discord, /auth/discord/callback, /auth/logout)
│   │   ├── brokers.js        # Broker management (/api/v1/brokers - CRUD operations)
│   │   ├── trades.js         # Trade execution (/api/v1/trades - POST /buy, POST /sell)
│   │   ├── portfolio.js      # Portfolio queries (/api/v1/portfolio - GET positions, balance)
│   │   ├── subscriptions.js  # Billing operations (/api/v1/subscriptions - upgrade, cancel)
│   │   ├── analytics.js      # Business intelligence (/api/v1/analytics - MRR/ARR, churn)
│   │   └── webhooks.js       # External webhooks (/webhooks/tradingview, /webhooks/billing)
│   ├── services/             # Business logic layer
│   │   ├── TradeExecutionService.js  # Core trading engine (signal parsing, risk validation, order submission)
│   │   ├── RiskManagementService.js  # Position sizing, daily loss limits, stop-loss automation
│   │   ├── BrokerFactory.js          # Broker adapter factory pattern
│   │   ├── BillingProviderFactory.js # Billing provider factory (Polar.sh/Stripe)
│   │   ├── AnalyticsService.js       # MRR/ARR calculation, churn prediction ML model
│   │   └── AuditLogService.js        # Immutable logging with cryptographic hashing
│   ├── brokers/              # Broker adapter implementations
│   │   ├── adapters/
│   │   │   ├── BrokerAdapter.js     # Base abstract class (15 methods interface)
│   │   │   ├── AlpacaAdapter.js     # Alpaca implementation (@alpacahq/alpaca-trade-api)
│   │   │   ├── IBKRAdapter.js       # Interactive Brokers (@stoqey/ib)
│   │   │   ├── SchwabAdapter.js     # Charles Schwab (OAuth2 + REST)
│   │   │   ├── CoinbaseAdapter.js   # Coinbase Pro via CCXT
│   │   │   ├── KrakenAdapter.js     # Kraken via CCXT
│   │   │   └── BinanceAdapter.js    # Binance via CCXT
│   │   └── utils/
│   │       ├── RateLimiter.js       # Token bucket algorithm per broker
│   │       └── ErrorMapper.js       # Standardize broker error codes
│   ├── billing/              # Billing provider implementations
│   │   ├── providers/
│   │   │   ├── BillingProvider.js   # Base abstract class (9 methods)
│   │   │   ├── PolarProvider.js     # Polar.sh implementation (@polar-sh/sdk)
│   │   │   └── StripeProvider.js    # Stripe implementation (fallback)
│   │   └── webhooks/
│   │       ├── PolarWebhookHandler.js   # HMAC verification + event processing
│   │       └── StripeWebhookHandler.js  # HMAC verification + event processing
│   ├── websocket/            # Socket.IO real-time infrastructure
│   │   ├── socketServer.js   # Socket.IO server setup, Redis adapter, JWT auth middleware
│   │   ├── handlers/
│   │   │   ├── PortfolioHandler.js  # portfolio.* events (balanceChanged, positionAdded/Closed)
│   │   │   ├── TradeHandler.js      # trade.* events (submitted, filled, partialFill, rejected)
│   │   │   └── MarketHandler.js     # market.* events (quote updates, NBBO data)
│   │   └── middleware/
│   │       └── JWTAuthMiddleware.js  # JWT token validation on connection upgrade
│   ├── middleware/           # Express middleware
│   │   ├── auth.js           # Passport.js authentication, session validation
│   │   ├── rateLimiter.js    # Rate limiting (rate-limiter-flexible)
│   │   ├── validator.js      # Input validation (Joi schemas)
│   │   ├── errorHandler.js   # Global error handling, sanitized user messages
│   │   └── logger.js         # Request logging (Winston structured logs)
│   ├── utils/                # Shared utilities
│   │   ├── encryption.js     # AES-256-GCM encryption/decryption
│   │   ├── jwt.js            # JWT token generation/validation
│   │   └── nlp.js            # Natural.js signal parsing from Discord messages
│   └── bot/                  # Discord bot integration
│       ├── discordBot.js     # Discord.js client, event listeners
│       └── signalParser.js   # Parse /buy, /sell commands from Discord channels
│
├── src/dashboard/            # Frontend React SPA
│   ├── main.jsx              # Vite entry point, React root render
│   ├── App.jsx               # Main App component, routing
│   ├── components/           # Reusable UI components
│   │   ├── ui/               # shadcn/ui components (Button, Dialog, Tabs, Toast, etc.)
│   │   ├── Portfolio.jsx     # Portfolio overview (positions, balance, P&L)
│   │   ├── TradeHistory.jsx  # Trade history table with filtering
│   │   ├── BrokerSetup.jsx   # Broker connection wizard
│   │   ├── RiskSettings.jsx  # Risk management configuration UI
│   │   └── AnalyticsDashboard.jsx  # Admin analytics (MRR/ARR, cohort retention)
│   ├── pages/                # Page-level components
│   │   ├── Dashboard.jsx     # Main dashboard page
│   │   ├── Settings.jsx      # User settings page
│   │   ├── Billing.jsx       # Subscription management page
│   │   └── Login.jsx         # OAuth2 login page
│   ├── services/             # Frontend API clients
│   │   ├── api.js            # Axios instance with interceptors
│   │   ├── websocket.js      # Socket.IO client with auto-reconnect
│   │   └── auth.js           # Auth state management
│   ├── hooks/                # Custom React hooks
│   │   ├── useWebSocket.js   # WebSocket connection hook
│   │   ├── usePortfolio.js   # Portfolio state management
│   │   └── useTrades.js      # Trade history hook
│   └── lib/                  # Shared frontend utilities
│       ├── utils.js          # Helper functions (cn() from tailwind-merge)
│       └── constants.js      # Constants (API URLs, WebSocket events)
│
├── tests/                    # Test suites
│   ├── unit/                 # Unit tests (Jest)
│   │   ├── services/         # Business logic tests (>95% coverage for critical paths)
│   │   │   ├── TradeExecutionService.test.js
│   │   │   ├── RiskManagementService.test.js
│   │   │   └── BillingProviderFactory.test.js
│   │   ├── brokers/          # Broker adapter tests (mock external APIs)
│   │   │   ├── AlpacaAdapter.test.js
│   │   │   ├── IBKRAdapter.test.js
│   │   │   └── CoinbaseAdapter.test.js
│   │   └── utils/            # Utility function tests
│   │       ├── encryption.test.js
│   │       └── nlp.test.js
│   ├── integration/          # Integration tests (Supertest + MongoDB Memory Server)
│   │   ├── api/              # API endpoint tests
│   │   │   ├── auth.test.js
│   │   │   ├── trades.test.js
│   │   │   └── portfolio.test.js
│   │   └── websocket/        # WebSocket integration tests
│   │       ├── portfolio-updates.test.js
│   │       └── jwt-auth.test.js
│   └── e2e/                  # End-to-end tests (Playwright)
│       ├── trade-execution.spec.js  # Full trade flow (signal → execution → notification)
│       ├── broker-setup.spec.js     # Broker connection wizard
│       └── subscription.spec.js     # Billing upgrade/downgrade flows
│
├── scripts/                  # Deployment and utility scripts
│   ├── deployment/
│   │   ├── deploy-staging.sh         # Railway staging deployment
│   │   ├── setup-monitoring.sh       # Configure Sentry/Railway monitoring
│   │   ├── validate-websocket-deployment.js  # Health check script
│   │   └── stress-test-rate-limits.js        # Load testing for broker rate limits
│   └── db/
│       ├── migrate.js        # Database migration runner (not yet implemented)
│       └── seed.js           # Seed data for development
│
├── docs/                     # Project documentation
│   ├── API_INTEGRATION_GUIDE.md
│   ├── BROKER_INTEGRATION_ROADMAP.md
│   ├── DEPLOYMENT.md
│   └── SECURITY.md
│
├── .specify/                 # Speckit workflow system
│   ├── memory/
│   │   └── constitution.md   # Project constitution v1.0.0 (ratified 2025-10-21)
│   ├── scripts/
│   │   └── powershell/       # Workflow automation scripts
│   └── templates/            # Speckit templates
│
├── openspec/                 # OpenSpec change proposals (20+ proposals consolidated into this spec)
│   └── changes/
│       ├── implement-broker-integrations/  # 88.6% complete
│       ├── implement-dual-dashboard-system/  # 45% complete
│       ├── implement-unified-oauth2-authentication/  # 39.9% complete
│       └── ... [17 more proposals]
│
├── package.json              # Node.js dependencies (see dependencies section above)
├── vite.config.js            # Vite frontend build configuration
├── jest.config.js            # Jest test configuration
├── playwright.config.js      # Playwright E2E test configuration
├── tailwind.config.js        # TailwindCSS configuration
├── .env.example              # Environment variable template (25+ secrets)
└── README.md                 # Project overview
```

**Structure Decision**: 
- **Web application architecture** selected (backend API + frontend SPA) based on project requirements for real-time dashboard, multi-broker integration, and subscription billing
- **Backend separation**: Business logic in `/services`, broker implementations in `/brokers`, API routes in `/routes` following separation of concerns
- **Frontend separation**: React components in `/src/dashboard/components`, pages in `/pages`, API clients in `/services` following standard React/Vite project structure
- **Test organization**: Tests mirror source structure (`/tests/unit`, `/integration`, `/e2e`) with >95% coverage requirement for critical paths per Constitution Principle II
- **Real-time layer**: WebSocket infrastructure isolated in `/src/websocket` with handlers, middleware for JWT auth per Constitution Principle IV
- **Broker abstraction**: Adapter pattern implementation in `/src/brokers/adapters` with base class and 6 broker implementations per Constitution Principle III
- **Provider abstraction**: Billing providers in `/src/billing/providers` with factory pattern per Constitution Principle V
- **Existing structure honored**: Project already has established patterns (backend in `/src`, frontend in `/src/dashboard`, tests in `/tests`) which align with plan requirements

**Rationale**: This structure supports horizontal scaling (stateless API layer, WebSocket via Redis adapter), maintainability (clear separation of concerns), testability (unit/integration/E2E isolation), and constitutional compliance (Security-First via encryption utils, Test-First via comprehensive test organization, adapter patterns for brokers/billing)

---

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

**Status**: ✅ NO VIOLATIONS - Constitution Check passed for specification phase

All 7 constitutional principles addressed in specification:
- No unjustified complexity introduced
- Adapter patterns (brokers, billing providers) justified by Constitutional Principles III & V
- WebSocket infrastructure justified by Constitutional Principle IV (Real-Time Standards)
- Security measures (encryption, OAuth2, OWASP) mandated by Constitutional Principle I (NON-NEGOTIABLE)
- Test-First approach mandated by Constitutional Principle II (NON-NEGOTIABLE)

**Implementation blockers** (3 deployment blockers) represent *missing implementations* of constitutional requirements, not violations of constitution:
1. US-009: OWASP audit (required by Principle I, not yet executed)
2. SC-025: Test coverage >95% (required by Principle II, not yet achieved for OAuth2/billing)
3. US-008: JWT WebSocket auth (required by Principle IV, not yet implemented)

Table intentionally left empty—no complexity justifications needed.

---

## Phase 0-1 Output Files

The following files will be generated by this planning phase:

### Phase 0: Research & Technology Decisions
**File**: `research.md` (NEXT STEP - being created after this plan.md)

**Contents**:
- Technology selection rationale (Node.js 22.11.0, Express.js, MongoDB Atlas, Redis, Socket.IO)
- Broker SDK evaluation (Alpaca API, IB Gateway, CCXT for crypto exchanges)
- Billing provider comparison (Polar.sh vs Stripe)
- Security best practices (OWASP compliance, AES-256-GCM encryption, JWT authentication)
- Performance optimization strategies (Redis adapter for WebSocket scaling, rate limiting patterns)
- Deployment infrastructure decisions (Railway platform, MongoDB Atlas, Redis Cloud)

### Phase 1: Design Artifacts
**Files**: `data-model.md`, `contracts/`, `quickstart.md` (PENDING - created after research.md)

**Contents**:
1. **data-model.md**: 
   - 6 core entities (User, BrokerConnection, Trade, Position, AuditLog, Subscription)
   - Mongoose schema definitions with field types, validation rules, indexes
   - Entity relationships (foreign keys, references)
   - State transitions (Trade status: pending → submitted → filled, Subscription status: active → past_due → cancelled)

2. **contracts/**:
   - `api-spec.yaml`: OpenAPI 3.0 specification for REST API endpoints (auth, brokers, trades, portfolio, subscriptions, analytics)
   - `websocket-events.md`: Socket.IO event schemas (portfolio.*, trade.*, market.*, connection.*)
   - `broker-adapter-interface.md`: BrokerAdapter contract (15 methods: connect, disconnect, placeOrder, cancelOrder, getPositions, getBalance, getOrderStatus, etc.)

3. **quickstart.md**:
   - Local development setup instructions (Node.js installation, MongoDB/Redis setup, environment variables)
   - How to run backend (`npm run dev`), frontend (`npm run dev:dashboard`), tests (`npm test`)
   - How to connect test broker accounts (Alpaca paper trading, Coinbase sandbox)
   - How to trigger Discord signals in development
   - Troubleshooting common issues

---

## Implementation Roadmap

**Timeline**: 3-5 weeks from plan approval to production deployment

### Phase 0: Research (THIS PHASE - 4-6 hours)
- ✅ Generate research.md resolving all technical unknowns
- ✅ Document technology selections with rationale
- ✅ Identify best practices for each major component

### Phase 1: Design (1-2 days)
- ✅ Generate data-model.md with 6 entity schemas
- ✅ Generate API contracts (OpenAPI spec, WebSocket events)
- ✅ Generate quickstart.md for developer onboarding
- ✅ Update agent context with new technologies
- ✅ Re-check constitution compliance post-design

### Phase 2: Task Breakdown (4-8 hours)
- ⏳ Run `/speckit.tasks` to generate tasks.md
- ⏳ Organize tasks by 13 user stories (US-001 to US-013)
- ⏳ Mark parallel tasks `[P]` (different files, no dependencies)
- ⏳ Identify test-first tasks for critical paths (>95% coverage required)

### Phase 3: Validation & Sync (4-6 hours)
- ⏳ Run `/speckit.analyze` to validate plan/tasks alignment
- ⏳ Check for conflicts with 20+ OpenSpec proposals
- ⏳ Verify deployment blockers addressed in task sequence
- ⏳ Confirm constitutional compliance throughout plan

### Phase 4: Blocker Resolution (1-2 weeks)
**Priority Order** (must complete before proceeding to core features):

1. **US-009: OWASP Security Audit** (3-5 days)
   - Schedule third-party penetration test
   - Run automated OWASP ZAP scan against staging environment
   - Remediate all Critical and High findings (SQL injection, XSS, CSP headers)
   - Obtain "Cleared for Production" certificate
   - Update constitution compliance audit to 100% OWASP compliance

2. **US-007: Immutable Audit Logging** (2-3 days)
   - Implement append-only MongoDB collection with TTL index (7-year retention)
   - Add cryptographic hashing (SHA-256) for log integrity (blockchain-style)
   - Prevent DELETE/UPDATE operations via MongoDB RBAC
   - Create admin query interface with filters (userId, action, date range)
   - Test tampering detection and archival to AWS S3 Glacier

3. **US-008: JWT WebSocket Authentication** (2-3 days)
   - Implement JWT validation middleware on Socket.IO connection upgrade
   - Add token refresh mechanism (5-minute warning before expiry)
   - Handle token expiry during active WebSocket sessions
   - Test unauthorized access rejection (expired, missing, invalid tokens)
   - Support multi-device sessions (multiple connections with same JWT)

4. **SC-025: Test Coverage >95% for Critical Paths** (3-5 days)
   - Write tests FIRST for OAuth2 (FR-021 to FR-030) - bring 39.9% → 100%
   - Write tests FIRST for billing (FR-061 to FR-070) - achieve >95% coverage
   - Verify Jest coverage reports show >95% line/branch for `src/auth/*`, `src/billing/*`
   - All tests pass in CI/CD pipeline before proceeding

### Phase 5: Core Feature Implementation (2-3 weeks)
**Execution order** (after all blockers resolved):

1. **Complete OAuth2 token refresh** (39.9% → 100%) - US-004 remaining work
2. **Complete realtime infrastructure** (6.8% → 100%) - US-003 WebSocket layer beyond JWT auth
3. **Deploy broker integrations** (88.6% → 100%) - US-002 final testing and production deployment
4. **Integrate dual dashboard data** (45% → 100%) - US-003 connect scaffolded UI to backend APIs
5. **Implement analytics ML features** (69.4% → 100%) - US-005 churn prediction model, A/B testing
6. **Launch to production** with monitoring (US-013)

### Phase 6: Post-Launch (Ongoing)
- Monitor SC-001 to SC-025 success criteria achievement
- Address P2/P3 user stories as capacity allows (US-010 crypto expansion, US-011 social trading)
- Quarterly constitution compliance audits
- Annual OWASP security audit renewals

---

## Next Steps

1. ✅ **Review this plan** - Validate technical context, structure decisions, implementation roadmap
2. ⏳ **Generate research.md** - Phase 0 output documenting technology selections
3. ⏳ **Generate data-model.md + contracts/** - Phase 1 design artifacts
4. ⏳ **Run /speckit.tasks** - Generate task breakdown after Phase 1 complete
5. ⏳ **Begin blocker resolution** - Cannot proceed to `/speckit.implement` until 4 blockers resolved

**Estimated Time to Implementation-Ready**: 8-16 hours (Phase 0-2 planning), then 1-2 weeks (Phase 4 blocker resolution)

---

**Plan Status**: ✅ COMPLETE - Constitution check passed, structure defined, roadmap established  
**Next Command**: Generate research.md (Phase 0 output)  
**Blocker**: Cannot run `/speckit.implement` until 4 deployment blockers resolved (US-009, US-007, US-008, SC-025)

