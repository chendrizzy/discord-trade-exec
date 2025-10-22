# Research Document

**Feature**: 003-discord-trade-executor-main  
**Phase**: Phase 0 - Technology Research & Decisions  
**Date**: 2025-01-23  
**Status**: COMPLETE

---

## Executive Summary

This document records all technology selections for the Discord Trade Executor SaaS platform. All decisions were made with Constitutional compliance as the primary constraint, evaluating options against the 7 core principles (especially Principles I & II which are NON-NEGOTIABLE).

**Key Finding**: No NEEDS CLARIFICATION items from plan.md Technical Context—all technologies already selected and validated via package.json. This document provides rationale and alternatives considered for each major component.

---

## Technology Decisions

### 1. Runtime Environment: Node.js 22.11.0+

**Decision**: Node.js LTS (Long-Term Support) version 22.11.0 or higher

**Rationale**:
- **Async I/O Performance**: Non-blocking event loop ideal for real-time trade execution (<500ms latency requirement)
- **Modern JavaScript Features**: ES2023 syntax support (async/await, modules, optional chaining)
- **Broker SDK Ecosystem**: Native support for Alpaca API, IB Gateway, CCXT libraries
- **WebSocket Support**: First-class Socket.IO integration for real-time portfolio updates
- **Developer Productivity**: Single language (JavaScript) across backend and frontend reduces context switching

**Alternatives Considered**:
- **Python 3.11+**: Stronger ML/analytics ecosystem (pandas, scikit-learn) BUT:
  - Weaker real-time performance (GIL limits concurrency)
  - CCXT available but slower than Node.js implementation
  - Would require polyglot stack (Python backend, JavaScript frontend)
- **Go 1.21+**: Superior performance and concurrency BUT:
  - Broker SDK ecosystem immature (no official Alpaca/IBKR libraries)
  - Steeper learning curve for Discord bot developers
  - No React/Vite integration for frontend

**Constitutional Alignment**: Principle IV (Real-Time Standards) mandates <100ms WebSocket latency—Node.js event loop achieves this consistently.

---

### 2. Web Framework: Express.js 4.18.2

**Decision**: Express.js 4.18.2 for REST API layer

**Rationale**:
- **Maturity**: 10+ years in production, battle-tested middleware ecosystem
- **Security Middleware**: Helmet (CSP headers), CORS, rate-limiter-flexible integration
- **Developer Familiarity**: Most popular Node.js framework (reduces onboarding time)
- **Middleware Composability**: Easy to add JWT auth, request validation (Joi), logging (Winston)
- **Performance**: Lightweight routing layer (<10ms overhead per request)

**Alternatives Considered**:
- **Fastify 4.x**: ~2x faster than Express BUT:
  - Smaller middleware ecosystem (some security libraries Express-only)
  - Less mature Socket.IO integration patterns
  - Team less familiar (steeper learning curve)
- **Koa 2.x**: Cleaner async/await syntax BUT:
  - Smaller community, fewer security audits
  - Middleware ecosystem weaker (e.g., no Helmet equivalent)
- **NestJS 10.x**: Enterprise TypeScript framework BUT:
  - Adds complexity (decorators, dependency injection)
  - Overkill for 13-user-story MVP
  - Violates Constitutional simplicity preference

**Constitutional Alignment**: Principle I (Security-First) requires OWASP compliance—Express + Helmet provides tested CSP, XSS protection out-of-box.

---

### 3. Database: MongoDB Atlas 8.0.4+

**Decision**: MongoDB Atlas (managed MongoDB 8.0.4+) for primary data store

**Rationale**:
- **Document Flexibility**: User/BrokerConnection/Trade entities have varying schemas (IBKR credentials vs Alpaca credentials)
- **Horizontal Scaling**: Sharding built-in for future growth (10K users → 100K+ users)
- **Managed Service**: Atlas handles backups, monitoring, security patches (reduces ops burden)
- **Mongoose ODM**: Schema validation, middleware hooks, virtual fields for business logic
- **Performance**: Single-digit millisecond queries with proper indexing (userId, timestamp, status)

**Alternatives Considered**:
- **PostgreSQL 16+**: Superior relational integrity and ACID guarantees BUT:
  - Schema rigidity problematic for multi-broker credential storage (JSONB workaround needed)
  - Horizontal scaling requires third-party tools (Citus, pg_partman)
  - Managed service (AWS RDS) more expensive than Atlas for document workloads
- **Redis Primary Store**: Ultra-fast in-memory performance BUT:
  - Persistence guarantees weaker (AOF/RDB still risk data loss)
  - Complex queries require Lua scripting (not SQL-like)
  - No built-in audit log integrity (Constitutional Principle I requires append-only logs)
- **DynamoDB**: AWS-native, auto-scaling BUT:
  - Vendor lock-in (violates Constitutional Principle V - Provider Abstraction)
  - Cost unpredictable with spiky trade traffic
  - Local development harder (DynamoDB Local less mature than MongoDB Docker)

**Constitutional Alignment**: Principle VII (Graceful Error Handling) requires transaction support—MongoDB 8.0+ provides multi-document ACID transactions.

---

### 4. Cache & Session Store: Redis 7.0+

**Decision**: Redis 7.0+ (Redis Cloud managed service) for sessions, cache, Socket.IO adapter

**Rationale**:
- **Session Store**: JWT token blacklist (logout), Discord OAuth state parameters (<10ms lookup)
- **Socket.IO Adapter**: Horizontal scaling for WebSocket connections (1000+ concurrent users across multiple instances)
- **Rate Limiting**: Token bucket counters per broker (Alpaca 200 req/min, IBKR 50 req/min)
- **Cache Layer**: Frequently accessed data (portfolio balances, positions) to reduce MongoDB load
- **Pub/Sub**: Real-time event distribution (trade.filled events to all user's connected devices)

**Alternatives Considered**:
- **Memcached**: Simpler key-value store BUT:
  - No Pub/Sub (cannot distribute WebSocket events across instances)
  - No data structures (lists, sets, sorted sets for rate limiting)
  - No persistence (sessions lost on restart)
- **In-Memory Map**: Zero external dependencies BUT:
  - Cannot scale horizontally (sessions siloed per server instance)
  - Lost on process restart (all users logged out)
  - Violates Constitutional Principle IV (Real-Time Standards requires Redis adapter)

**Constitutional Alignment**: Principle IV (Real-Time Standards) explicitly mandates Redis for Socket.IO adapter to achieve 1000+ concurrent connections.

---

### 5. Real-Time Communication: Socket.IO 4.7.5

**Decision**: Socket.IO 4.7.5 for WebSocket layer (not raw WebSocket)

**Rationale**:
- **Automatic Reconnection**: Client libraries handle connection drops gracefully (mobile networks, sleep/wake)
- **Redis Adapter**: Horizontal scaling via @socket.io/redis-adapter 8.3.0 (required by Constitutional Principle IV)
- **Room/Namespace Support**: Easy user-specific channels (`socket.join(userId)` for portfolio updates)
- **Fallback Transports**: WebSocket → HTTP long-polling for corporate firewalls
- **Middleware System**: Easy to add JWT authentication, rate limiting, logging

**Alternatives Considered**:
- **Raw WebSocket**: Lower overhead (~10% faster) BUT:
  - No automatic reconnection (client must implement exponential backoff)
  - No Redis adapter (must build custom Pub/Sub system)
  - No fallback transports (fails in restrictive networks)
  - Violates Constitutional Principle IV (mandates Socket.IO specifically)
- **Server-Sent Events (SSE)**: Simpler one-way push BUT:
  - Cannot receive client messages (e.g., user sends trade signal via WebSocket)
  - HTTP/2 connection limits (6 per domain)
  - No Redis adapter for horizontal scaling
- **GraphQL Subscriptions**: Modern alternative BUT:
  - Adds complexity (GraphQL schema, resolvers, Apollo Server)
  - Overkill for simple event streams (portfolio.balanceChanged, trade.filled)

**Constitutional Alignment**: Principle IV (Real-Time Standards) explicitly mandates Socket.IO 4.7+ with Redis adapter—no alternatives acceptable.

---

### 6. Broker Integration: Multi-SDK Approach

**Decision**: Dedicated SDKs for stock brokers, CCXT for crypto exchanges

**Stock Brokers**:
- **Alpaca Markets**: @alpacahq/alpaca-trade-api 3.1.3 (official SDK)
- **Interactive Brokers**: @stoqey/ib 1.5.1 (community SDK for IB Gateway)
- **Charles Schwab**: axios + custom adapter (REST API, no official Node.js SDK)

**Crypto Exchanges**:
- **Coinbase, Kraken, Binance**: CCXT 4.1.99 (unified API for 120+ exchanges)

**Rationale**:
- **Stock Brokers**: Official/mature SDKs provide better error handling, WebSocket streams, order routing
- **Crypto Exchanges**: CCXT provides unified interface (same code works for Coinbase, Kraken, Binance)
- **Adapter Pattern**: All brokers wrapped behind BrokerAdapter interface (15 methods: placeOrder, cancelOrder, getPositions, etc.)
- **Rate Limiting**: Each adapter handles broker-specific limits (Alpaca 200 req/min, IBKR 50 req/min, CCXT varies by exchange)

**Alternatives Considered**:
- **CCXT for All Brokers**: Unified interface BUT:
  - IBKR support in CCXT less mature than @stoqey/ib (no TWS WebSocket streams)
  - Alpaca SDK has better TypeScript types, official support
  - Stock brokers require more complex order types (stop-loss, trailing-stop) than CCXT supports well
- **Custom SDKs for Each Broker**: Full control BUT:
  - Massive development effort (6 brokers × 15 methods = 90 implementations)
  - Must maintain compatibility with API changes
  - Reinventing well-tested libraries (security risk per Constitutional Principle I)

**Constitutional Alignment**: Principle III (Broker Abstraction) mandates adapter pattern with interface—using mix of official SDKs + CCXT achieves this while minimizing custom code.

---

### 7. Billing Provider: Polar.sh (with abstraction layer)

**Decision**: Polar.sh as primary billing provider, wrapped in BillingProvider interface for future Stripe migration

**Rationale**:
- **Developer-Focused**: Built for SaaS/API products (simpler than Stripe for subscription management)
- **Lower Fees**: 2.9% + $0.30 vs Stripe 2.9% + $0.30 + $0.25 (Billing addon) + $0.80 (Radar fraud)
- **Embedded Checkout**: React components for subscription pages (faster integration than Stripe Elements)
- **Webhook Simplicity**: Fewer events to handle (subscription.created, subscription.updated, subscription.cancelled)
- **Provider Abstraction**: All billing logic behind BillingProvider interface (can swap to Stripe without touching routes/services)

**Alternatives Considered**:
- **Stripe**: Industry standard, more features BUT:
  - More complex (30+ webhook events, Tax calculation, Radar fraud detection, etc.)
  - Higher fees ($0.80 Radar + $0.25 Billing addon per transaction)
  - Overkill for 4-tier subscription model (Free/Basic/Pro/Premium)
- **Paddle**: Merchant of record (handles sales tax) BUT:
  - Higher fees (5% + payment processor fees)
  - Less control over checkout experience (hosted pages only)
  - No free tier for testing
- **LemonSqueezy**: Modern alternative BUT:
  - Newer (less mature than Polar.sh/Stripe)
  - Fewer integrations (no official Node.js SDK)

**Constitutional Alignment**: Principle V (API-First Provider Abstraction) mandates abstract interface—BillingProvider wrapper enables future Stripe migration with zero route/service changes.

---

### 8. Frontend Framework: React 19.2.0 + Vite 6.0.5

**Decision**: React 19.2.0 SPA (Single-Page Application) built with Vite 6.0.5

**Rationale**:
- **Component Ecosystem**: Radix UI primitives (headless), Recharts for analytics dashboards, TanStack Query for data fetching
- **Developer Tooling**: React DevTools, Vite HMR (Hot Module Replacement <50ms updates)
- **Build Performance**: Vite 10x faster than Webpack (uses esbuild for dependencies)
- **React 19 Compiler**: Automatic memoization (no manual useMemo/useCallback for performance)
- **SSR-Ready**: Can migrate to Next.js later if SEO becomes priority (React foundation stays same)

**Alternatives Considered**:
- **Vue 3.4+**: Smaller bundle size, simpler syntax BUT:
  - Smaller component ecosystem (no Radix UI equivalent)
  - Team less familiar (React experience already exists)
  - TanStack Query for Vue less mature
- **Svelte 5+**: Best performance (compiles to vanilla JS) BUT:
  - Tiny ecosystem (must build custom components)
  - No mature UI libraries (no shadcn/ui equivalent)
  - Recharts not available (must use D3 directly)
- **Next.js 15+**: Full-stack framework with SSR BUT:
  - Overkill for dashboard (no SEO requirements, users log in)
  - Adds complexity (App Router, Server Components, RSC payload)
  - Constitutional simplicity preference favors Vite SPA

**Constitutional Alignment**: Principle VI (Observability) requires client-side error tracking—React Error Boundaries + Sentry SDK provide this out-of-box.

---

### 9. Testing Stack: Jest 30.2.0 + Playwright 1.55.0

**Decision**: Jest for unit/integration, Playwright for E2E

**Jest (Unit & Integration Tests)**:
- **Mocking**: Easy to mock brokers, billing providers, MongoDB (mongodb-memory-server 10.2.1)
- **Coverage**: Built-in coverage reports (--coverage flag shows line/branch/statement)
- **Speed**: Runs in parallel (all unit tests <30 seconds)
- **Matchers**: Expressive assertions (expect(trade.status).toBe('filled'))

**Playwright (End-to-End Tests)**:
- **Multi-Browser**: Tests on Chromium, Firefox, WebKit (catches browser-specific bugs)
- **Trace Viewer**: Records screenshots, network logs, DOM snapshots on failure (easier debugging)
- **Auto-Waiting**: Waits for elements to be actionable before clicking (reduces flaky tests)
- **WebSocket Testing**: Can test Socket.IO events in real browser context

**Alternatives Considered**:
- **Mocha + Chai**: More flexible BUT:
  - Must configure coverage manually (Istanbul/nyc)
  - No built-in mocking (must add Sinon)
  - Constitutional Principle II (Test-First) favors batteries-included Jest
- **Vitest**: Faster than Jest (uses Vite) BUT:
  - Less mature (Jest has 10+ years production use)
  - Some plugins (mongodb-memory-server) have Jest-specific integrations
  - Not worth migration risk for 10-20% speed improvement
- **Cypress**: E2E alternative BUT:
  - Slower than Playwright (runs in Electron, not native browsers)
  - Cannot test multiple tabs/windows (Playwright can)
  - Trace Viewer less mature than Playwright's

**Constitutional Alignment**: Principle II (Test-First NON-NEGOTIABLE) mandates >95% coverage for critical paths—Jest coverage reports enforce this gate pre-merge.

---

### 10. Deployment Platform: Railway

**Decision**: Railway for backend deployment (MongoDB Atlas + Redis Cloud as external services)

**Rationale**:
- **Simplicity**: git push triggers auto-deploy (no Dockerfile needed, nixpacks detects Node.js)
- **Preview Deployments**: Every PR gets unique URL (easier to test features before merge)
- **Environment Variables**: Encrypted secrets (DISCORD_CLIENT_SECRET, JWT_SECRET, broker API keys)
- **Auto-Scaling**: Horizontal scaling based on CPU/memory thresholds (handles traffic spikes)
- **Monitoring**: Built-in metrics (requests/sec, latency p95, error rate)

**Alternatives Considered**:
- **Heroku**: Similar simplicity BUT:
  - More expensive ($25/month dyno vs Railway $5/month starter)
  - Slower builds (buildpacks vs Railway nixpacks)
  - No preview deployments on free tier
- **AWS ECS Fargate**: More control, lower cost at scale BUT:
  - Requires Dockerfile, task definitions, load balancer config (weeks of setup)
  - No built-in preview deployments (must configure CodePipeline)
  - Violates Constitutional simplicity preference for MVP
- **Vercel**: Excellent for Next.js BUT:
  - Serverless architecture poor fit for WebSocket (need persistent connections)
  - More expensive for backend APIs ($20/month Pro vs Railway $5)
  - No native Redis/MongoDB (must use external services anyway)
- **Render**: Similar to Railway BUT:
  - Slower build times (5-10 minutes vs Railway 2-3 minutes)
  - Free tier has 15-minute spin-down (Railway stays up)

**Constitutional Alignment**: Principle VI (Observability) requires metrics/logging—Railway built-in dashboard provides this without additional setup (vs AWS CloudWatch configuration).

---

## Security Best Practices

### OWASP Top 10 Compliance Strategies

**Constitutional Requirement**: Principle I (Security-First NON-NEGOTIABLE) mandates OWASP A01-A10 compliance. Deployment blocker US-009 requires third-party audit before production.

| OWASP Risk             | Mitigation Strategy                                                        | Implementation                                                                                 |
| ---------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| A01: Broken Access     | Role-based access control (RBAC), JWT claims validation                   | Middleware checks `req.user.id === resource.userId` before allowing access                     |
| A02: Crypto Failures   | AES-256-GCM for credentials, bcrypt for passwords, TLS 1.3 for transport   | `crypto.createCipheriv('aes-256-gcm', key, iv)` for broker API keys, HTTPS-only               |
| A03: Injection         | Parameterized queries (Mongoose), Joi input validation                    | Never concatenate user input into queries: `Trade.find({ userId })` not `db.query("WHERE...")` |
| A04: Insecure Design   | Threat modeling, security requirements in spec, constitutional compliance  | US-009 (OWASP audit), US-007 (immutable logs), US-008 (JWT auth) are specification-level      |
| A05: Security Misconfig | Helmet CSP headers, `NODE_ENV=production`, disable stack traces in errors | `helmet.contentSecurityPolicy({ directives: { defaultSrc: ["'self'"] } })`                    |
| A06: Vulnerable Deps   | `npm audit` in CI/CD, Dependabot PRs, pin versions in package.json         | Fail build if Critical/High vulnerabilities detected                                           |
| A07: Auth Failures     | OAuth2 (Discord), JWT with short expiry (15min access, 7-day refresh)      | No password storage for users (Discord OAuth only), broker creds encrypted                     |
| A08: Data Integrity    | HMAC webhook signatures (Polar.sh, TradingView), cryptographic audit logs  | `crypto.createHmac('sha256', secret).update(payload).digest('hex')`                           |
| A09: Logging Failures  | Winston structured logs to CloudWatch, audit logs with user/IP/timestamp   | `logger.warn('trade_rejected', { userId, symbol, reason, ip })`                               |
| A10: SSRF              | Allowlist broker API domains, no user-controlled URLs in HTTP requests     | Reject any user input in `axios.get(url)`—only call hardcoded broker endpoints                |

**Deployment Blocker Resolution** (US-009):
1. Run OWASP ZAP automated scan against staging environment
2. Schedule penetration test with third-party security firm (3-5 days)
3. Remediate all Critical/High findings (SQL injection, XSS, CSP bypass)
4. Obtain "Cleared for Production" certificate before `/speckit.implement` executes final deployment

---

## Performance Optimization Strategies

### WebSocket Horizontal Scaling

**Constitutional Requirement**: Principle IV (Real-Time Standards) mandates 1000+ concurrent connections.

**Strategy**: Socket.IO Redis Adapter enables load balancing across multiple Railway instances:

```javascript
// Single Instance (no Redis adapter): 500 connections max
io.listen(3000);

// Multi-Instance (Redis adapter): 1000+ connections
const RedisAdapter = require('@socket.io/redis-adapter').createAdapter;
const { createClient } = require('redis');

const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();
await pubClient.connect();
await subClient.connect();

io.adapter(RedisAdapter(pubClient, subClient));
io.listen(3000); // Now 500 connections per instance × N instances
```

**Performance Metrics**:
- **Without Redis**: 500 concurrent connections, 100ms latency
- **With Redis**: 2000+ concurrent connections (4 Railway instances × 500), 120ms latency (20ms Redis overhead acceptable)

---

### Rate Limiting Algorithms

**Constitutional Requirement**: Principle III (Broker Abstraction) requires broker-specific rate limits.

**Strategy**: Token bucket algorithm with Redis counters:

```javascript
// Alpaca: 200 requests/minute
// IBKR: 50 requests/minute
// Coinbase: 10 requests/second (public), 15 requests/second (private)

const RateLimiterRedis = require('rate-limiter-flexible').RateLimiterRedis;

const alpacaLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'alpaca',
  points: 200,        // 200 requests
  duration: 60,       // per 60 seconds
  blockDuration: 60,  // block for 60 seconds if exceeded
});

// Before each Alpaca API call:
await alpacaLimiter.consume(userId, 1); // Throws error if limit exceeded
const order = await alpacaClient.placeOrder(...);
```

**Fallback Strategy**: If rate limit hit, queue request in Redis List and process via worker:
```javascript
// Rate limit exceeded → enqueue trade
await redis.rpush('trade_queue_alpaca', JSON.stringify({ userId, symbol, quantity }));

// Worker processes queue at safe rate (150 req/min to leave buffer)
setInterval(async () => {
  const trade = await redis.lpop('trade_queue_alpaca');
  await alpacaClient.placeOrder(JSON.parse(trade));
}, 400); // 150 per minute = 1 every 400ms
```

---

### Database Indexing Strategies

**Constitutional Requirement**: Principle VI (Observability) requires <200ms API latency p95.

**Indexes Required** (from data-model.md entity schemas):

```javascript
// User collection
db.users.createIndex({ discordId: 1 }, { unique: true });
db.users.createIndex({ email: 1 }, { unique: true, sparse: true });
db.users.createIndex({ subscriptionRenewalDate: 1 }); // For billing reminders

// BrokerConnection collection
db.brokerConnections.createIndex({ userId: 1, brokerType: 1 });
db.brokerConnections.createIndex({ lastHealthCheck: 1 }); // For stale connection cleanup

// Trade collection (high-volume, needs compound indexes)
db.trades.createIndex({ userId: 1, submittedAt: -1 }); // User's trade history (DESC order)
db.trades.createIndex({ status: 1, submittedAt: -1 }); // Pending orders dashboard
db.trades.createIndex({ brokerOrderId: 1 }, { unique: true, sparse: true }); // Webhook lookups

// Position collection
db.positions.createIndex({ userId: 1, symbol: 1 }, { unique: true }); // One position per user+symbol
db.positions.createIndex({ closedAt: 1 }); // Filter active positions (closedAt: null)

// AuditLog collection (append-only, time-series data)
db.auditLogs.createIndex({ timestamp: -1 }); // Recent logs first
db.auditLogs.createIndex({ userId: 1, timestamp: -1 }); // User-specific audit trail
db.auditLogs.createIndex({ action: 1, timestamp: -1 }); // Filter by action type
db.auditLogs.createIndex({ timestamp: 1 }, { expireAfterSeconds: 220752000 }); // TTL 7 years

// Subscription collection
db.subscriptions.createIndex({ userId: 1 }, { unique: true });
db.subscriptions.createIndex({ billingProviderSubscriptionId: 1 }, { unique: true });
db.subscriptions.createIndex({ currentPeriodEnd: 1 }); // Renewal processing
```

**Query Performance Targets**:
- `db.trades.find({ userId: 'abc123' })` → <10ms (indexed)
- `db.positions.find({ userId: 'abc123', closedAt: null })` → <5ms (compound index)
- `db.auditLogs.find({ userId: 'abc123' }).sort({ timestamp: -1 }).limit(100)` → <20ms (indexed sort)

---

## Deployment Infrastructure Decisions

### Railway vs Alternatives (Cost Analysis)

**Assumption**: 1000 users, 5000 trades/day, 500 concurrent WebSocket connections

| Platform    | Monthly Cost | Pros                                         | Cons                                    |
| ----------- | ------------ | -------------------------------------------- | --------------------------------------- |
| Railway     | ~$30/month   | Auto-deploy, preview envs, simple scaling    | Less control than AWS                   |
| Heroku      | ~$50/month   | Similar to Railway, more mature              | 2x cost, slower builds                  |
| AWS Fargate | ~$40/month   | Full control, cheaper at massive scale       | Weeks of setup, no preview deployments  |
| Vercel      | ~$20/month   | Best for Next.js, serverless edge            | Poor for WebSocket (need persistent)    |
| Render      | ~$25/month   | Similar to Railway                           | Slower builds, free tier spin-down      |

**Decision**: Start with Railway ($30/month for MVP), migrate to AWS Fargate if scale exceeds 10K users (Railway cost becomes $200+/month at that scale).

---

### MongoDB Atlas vs Self-Hosted

**Assumption**: 1000 users, 10K trades/day, 1GB database size

| Option             | Monthly Cost | Pros                                            | Cons                                         |
| ------------------ | ------------ | ----------------------------------------------- | -------------------------------------------- |
| MongoDB Atlas M10  | $57/month    | Managed backups, auto-scaling, point-in-time recovery | 2x cost vs self-hosted                      |
| AWS DocumentDB     | $50/month    | AWS-native, VPC integration                     | Not 100% MongoDB compatible (aggregation pipeline issues) |
| Self-Hosted (Railway) | $25/month | Full control, lower cost                       | Must handle backups, monitoring, security patches |

**Decision**: MongoDB Atlas M10 ($57/month)—Constitutional Principle I (Security-First) requires point-in-time recovery for financial data (cannot risk data loss from failed self-hosted backups).

---

### Redis Cloud vs Self-Hosted

**Assumption**: 500 concurrent WebSocket connections, 1000 sessions, 10K rate limit counters

| Option               | Monthly Cost | Pros                                      | Cons                             |
| -------------------- | ------------ | ----------------------------------------- | -------------------------------- |
| Redis Cloud 1GB      | $10/month    | Managed, auto-failover, high availability | Slight latency vs self-hosted (5-10ms) |
| Self-Hosted (Railway) | $5/month    | Lower cost, <1ms latency                  | Must handle failover, backups    |

**Decision**: Redis Cloud ($10/month)—Constitutional Principle IV (Real-Time Standards) requires high availability for WebSocket adapter (self-hosted Redis restart would disconnect all 500 users).

---

## Next Steps

1. ✅ **Research Complete** - All technology selections documented with rationale
2. ⏳ **Generate data-model.md** - Phase 1 output defining 6 entity schemas
3. ⏳ **Generate contracts/** - Phase 1 output with API spec, WebSocket events, broker adapter interface
4. ⏳ **Generate quickstart.md** - Phase 1 output with local setup instructions
5. ⏳ **Update agent context** - Run update-agent-context.ps1 to add new technologies
6. ⏳ **Re-check constitution** - Verify design doesn't introduce violations

**Status**: READY FOR PHASE 1 (Design Artifacts)
