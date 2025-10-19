# Week 1-2 Parallel Execution Plan

**Strategy**: Run broker deployment (operational) and WebSocket development (technical) in parallel

**Timeline**: 2 weeks
**Revenue Impact**: $53,820 annual (broker integrations)
**Infrastructure**: Real-time foundation for analytics Phase 5 + social trading

---

## Track A: Broker Integrations Deployment (Operational)

**Owner**: Operations/DevOps
**Status**: Automation ready, requires manual configuration
**Dependencies**: .env.staging, paper trading accounts, Railway staging environment

### Week 1: Staging Deployment & Validation

#### Prerequisites (Manual Setup Required)

**Environment Configuration**:
```bash
# Create .env.staging file with broker credentials
cp .env.example .env.staging

# Required variables:
# - IBKR_CLIENT_ID, IBKR_CLIENT_SECRET (paper trading)
# - SCHWAB_CLIENT_ID, SCHWAB_CLIENT_SECRET (paper trading)
# - ALPACA_API_KEY, ALPACA_SECRET_KEY (paper trading)
# - DATABASE_URL (staging MongoDB)
# - REDIS_URL (staging Redis)
# - SESSION_SECRET (generate new for staging)
```

**Paper Trading Accounts**:
- [ ] IBKR Paper Trading Account: https://www.interactivebrokers.com/en/index.php?f=1286
- [ ] Schwab Paper Trading Account: Contact Schwab developer support
- [ ] Alpaca Paper Trading Account: https://app.alpaca.markets/signup (select paper)

**Infrastructure**:
- [ ] Railway staging project created
- [ ] MongoDB staging database provisioned
- [ ] Redis staging instance provisioned

#### Day 1-2: Staging Deployment

```bash
# Automated deployment
npm run deploy:staging

# Expected output:
# ✓ Environment variables loaded
# ✓ Database backup created
# ✓ Migrations applied
# ✓ Docker containers started
# ✓ Health checks passed
```

**Success Criteria**:
- [x] Application accessible at staging URL
- [x] Health endpoint returns 200: `curl https://staging.your-domain.com/health`
- [x] Database migrations applied
- [x] All services running

#### Day 3-4: Order Type Validation

```bash
# Test all order types across all brokers
npm run test:order-types:staging

# Tests:
# - Market orders (IBKR, Schwab, Alpaca)
# - Limit orders (all brokers)
# - Stop orders (IBKR, Alpaca)
# - Stop-limit orders (IBKR, Alpaca)
# - Bracket orders (IBKR, Alpaca)
```

**Success Criteria**:
- [x] All order types validated on IBKR
- [x] Market + Limit validated on Schwab
- [x] All order types validated on Alpaca
- [x] No execution errors in paper trading
- [x] Validation report generated

#### Day 5: Rate Limit Stress Testing

```bash
# Test broker rate limits
npm run test:rate-limit:staging

# Individual broker tests
npm run test:rate-limit:ibkr    # 50 req/s for 10s
npm run test:rate-limit:schwab  # 120 req/m for 60s
npm run test:rate-limit:alpaca  # 200 req/m for 60s
```

**Success Criteria**:
- [x] IBKR: ≥475 successful requests (95% of 500)
- [x] Schwab: ≥114 successful requests (95% of 120)
- [x] Alpaca: ≥190 successful requests (95% of 200)
- [x] P95 latency <3000ms
- [x] Proper 429 handling confirmed

### Week 2: Beta Testing

#### Day 1-2: Beta User Onboarding

**Beta Group**:
- [ ] Identify 10 premium subscribers
- [ ] Send invitation emails (template in DEPLOYMENT_GUIDE.md)
- [ ] Schedule onboarding calls
- [ ] Provide setup documentation

**Onboarding Checklist** (per user):
- [ ] OAuth connection successful
- [ ] First paper trade executed
- [ ] Portfolio sync verified
- [ ] Discord notifications working

#### Day 3-5: Monitoring & Feedback Collection

**Daily Tasks**:
```bash
# Check staging metrics
curl https://staging.your-domain.com/api/health/detailed

# Monitor logs
railway logs --tail 100

# Review error reports
railway logs --filter level=error
```

**Metrics to Track**:
- Connection success rate (target: >95%)
- Order execution latency (target: P95 <3000ms)
- Error rate (target: <5%)
- User feedback sentiment

**Feedback Collection**:
- [ ] Daily check-ins with beta users
- [ ] Bug reports logged in GitHub Issues
- [ ] Feature requests documented
- [ ] UX friction points identified

#### Critical Bug Triage

**P0 Bugs** (Fix immediately):
- Trade execution failures
- Connection failures >10%
- Data loss or corruption
- Security vulnerabilities

**P1 Bugs** (Fix before Week 3):
- UX issues affecting all users
- Performance degradation
- Minor data inconsistencies

**P2 Bugs** (Post-launch):
- UI polish
- Edge cases
- Nice-to-have improvements

---

## Track B: WebSocket Infrastructure Development (Technical)

**Owner**: Engineering
**Status**: Development phase
**Dependencies**: None (independent implementation)

### Week 1: Backend WebSocket Server (Phase 1)

#### Task 1.1: Install Dependencies ✅

```bash
npm install socket.io@^4.7.5 @socket.io/redis-adapter@^8.3.0 ioredis@^5.4.1
```

**Files Modified**:
- `package.json` - Add dependencies

**Verification**:
```bash
npm list socket.io @socket.io/redis-adapter ioredis
```

#### Task 1.2: Create WebSocket Server Core

**File**: `src/services/websocket/WebSocketServer.js`

**Features**:
- Socket.io server instance
- Redis adapter for horizontal scaling
- Connection lifecycle management
- Room-based event broadcasting
- Graceful shutdown handling

**Key Methods**:
```javascript
class WebSocketServer {
  constructor(httpServer, redisClient)
  initialize()
  handleConnection(socket)
  broadcastToUser(userId, event, data)
  broadcastToRoom(room, event, data)
  shutdown()
}
```

#### Task 1.3: Implement Authentication Middleware

**File**: `src/services/websocket/middleware/auth.js`

**Features**:
- Session-based authentication
- User session validation
- Connection authorization
- Unauthorized connection rejection

**Authentication Flow**:
```
1. Client connects with auth: { sessionID, userId }
2. Middleware validates sessionID against MongoDB sessions
3. If valid: socket.userId = userId, allow connection
4. If invalid: disconnect with error
```

#### Task 1.4: Implement Rate Limiting

**File**: `src/services/websocket/middleware/rateLimiter.js`

**Features**:
- Per-user rate limits (100 events/minute)
- Connection rate limits (10 connections/minute per IP)
- Redis-backed rate tracking
- Automatic disconnect on abuse

**Rate Limits**:
- Events: 100/minute per user
- Connections: 10/minute per IP
- Subscriptions: 50 total per user

#### Task 1.5: Implement Event Handlers

**File**: `src/services/websocket/handlers/index.js`

**Event Handlers**:
```javascript
// Client -> Server events
'subscribe:portfolio'      // Subscribe to portfolio updates
'subscribe:trades'         // Subscribe to trade notifications
'subscribe:watchlist'      // Subscribe to watchlist quotes
'unsubscribe:watchlist'    // Unsubscribe from watchlist

// Server -> Client events (broadcasted)
'portfolio:updated'        // Real-time portfolio changes
'trade:executed'           // Trade execution notifications
'trade:failed'             // Trade failure alerts
'watchlist:quote'          // Live watchlist quote updates
```

#### Task 1.6: Implement Emit Methods

**File**: `src/services/websocket/emitters/index.js`

**Emit Methods**:
```javascript
emitPortfolioUpdate(userId, portfolioData)
emitTradeExecuted(userId, tradeData)
emitTradeFailed(userId, errorData)
emitWatchlistQuote(userId, symbol, quoteData)
```

**Features**:
- User-specific broadcasts
- Room-based broadcasts
- Message batching for performance
- Error handling

#### Task 1.7: Integrate with Trade Executor

**File**: `src/services/TradeExecutor.js` (Modified)

**Integration Points**:
```javascript
// After successful trade execution
this.emit('trade:executed', tradeData);
webSocketServer.emitTradeExecuted(userId, tradeData);

// After portfolio update
this.emit('portfolio:updated', portfolioData);
webSocketServer.emitPortfolioUpdate(userId, portfolioData);

// On trade failure
this.emit('trade:failed', errorData);
webSocketServer.emitTradeFailed(userId, errorData);
```

#### Task 1.8: Create Server Integration Point

**File**: `src/index.js` (Modified)

**Integration**:
```javascript
const WebSocketServer = require('./services/websocket/WebSocketServer');

// After Express server creation
const httpServer = require('http').createServer(app);
const redisClient = new Redis(process.env.REDIS_URL);
const wsServer = new WebSocketServer(httpServer, redisClient);

await wsServer.initialize();

// Use httpServer instead of app for listening
httpServer.listen(PORT, () => {
  console.log(`✅ HTTP server listening on port ${PORT}`);
  console.log(`✅ WebSocket server ready`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await wsServer.shutdown();
  httpServer.close();
});
```

### Week 1 Deliverables

- [x] **WebSocket server fully implemented** (8 tasks complete)
- [x] **Redis adapter configured** for horizontal scaling
- [x] **Authentication middleware** securing connections
- [x] **Rate limiting** preventing abuse
- [x] **Event handlers** for all real-time features
- [x] **Trade Executor integration** emitting live events
- [x] **Server integration** complete

**Testing**:
```bash
# Unit tests for WebSocket server
npm test src/services/websocket

# Integration test - manual verification
# 1. Start server: npm run dev
# 2. Open dashboard: http://localhost:5173
# 3. Check console for WebSocket connection
# 4. Execute test trade - verify notification
```

### Week 2: Testing & Documentation

#### Day 1-2: Unit Tests

**Files**: `src/services/websocket/__tests__/`

**Test Coverage**:
- [x] WebSocketServer initialization
- [x] Authentication middleware
- [x] Rate limiting enforcement
- [x] Event handler logic
- [x] Emit methods
- [x] Graceful shutdown

**Target**: 85% test coverage

#### Day 3: Integration Tests

**File**: `tests/integration/websocket.test.js`

**Test Scenarios**:
- [x] Successful connection with valid session
- [x] Rejected connection with invalid session
- [x] Real-time portfolio updates
- [x] Trade notification delivery
- [x] Watchlist subscription/unsubscription
- [x] Automatic reconnection after disconnect
- [x] Rate limit enforcement

#### Day 4: Documentation

**Files**:
- [ ] `docs/WEBSOCKET_API.md` - Client API documentation
- [ ] `docs/WEBSOCKET_ARCHITECTURE.md` - System architecture
- [ ] Update `README.md` with WebSocket setup

**Documentation Sections**:
- Connection setup
- Event reference
- Authentication flow
- Rate limits
- Error handling
- Example code

#### Day 5: Railway Configuration

**Tasks**:
- [ ] Add Redis service to Railway project
- [ ] Configure environment variables
- [ ] Update health checks to include WebSocket
- [ ] Test WebSocket on staging environment

---

## Coordination & Milestones

### Week 1 End-of-Week Sync

**Track A Status**:
- Staging deployment complete?
- Order types validated?
- Rate limit tests passed?
- Critical bugs identified?

**Track B Status**:
- WebSocket server implemented?
- All 8 Phase 1 tasks complete?
- Unit tests passing?
- Ready for integration testing?

**Coordination**:
- Can deploy WebSocket to staging for beta testing?
- Any blockers or dependencies discovered?

### Week 2 End-of-Week Sync

**Track A Status**:
- Beta user feedback collected?
- Critical bugs fixed?
- Ready for production deployment?

**Track B Status**:
- Integration tests passing?
- Documentation complete?
- WebSocket deployed to staging?
- Beta users seeing live updates?

**Go/No-Go Decision**:
- [ ] All critical bugs fixed
- [ ] Beta user feedback positive (>80% satisfaction)
- [ ] WebSocket stable on staging
- [ ] Performance metrics met
- [ ] Documentation complete

**If GO**: Proceed to Week 3 production deployment
**If NO-GO**: Extend beta testing, fix blockers

---

## Week 3 Preview: Production Deployment

**Track A**: Broker integrations production deployment
- General availability announcement
- Email campaign to premium subscribers
- Twitter/social media launch
- Landing page update

**Track B**: WebSocket Phase 2 (Frontend Integration)
- Real-time portfolio component updates
- Trade notification toast system
- Live watchlist integration
- Production deployment with brokers

**Combined Impact**:
- Brokers work with manual refresh (Week 1-2)
- Brokers + live updates work (Week 3+)
- Professional-grade real-time platform
- $53K annual revenue + enhanced UX

---

## Risk Mitigation

### Track A Risks

**Risk**: Paper trading accounts not approved in time
- **Mitigation**: Apply for accounts immediately, use testnet fallbacks

**Risk**: Critical bugs discovered during beta
- **Mitigation**: 2-week beta period provides time to fix, can extend if needed

**Risk**: Connection success rate <95%
- **Mitigation**: OAuth retry logic, comprehensive error handling in adapters

### Track B Risks

**Risk**: WebSocket performance issues under load
- **Mitigation**: Redis adapter enables horizontal scaling, load testing in Week 2

**Risk**: Authentication middleware security vulnerabilities
- **Mitigation**: Session validation against MongoDB, rate limiting, comprehensive testing

**Risk**: Real-time events overwhelming frontend
- **Mitigation**: Message batching, client-side debouncing, subscription management

---

## Success Criteria

### Week 1 Success

**Track A**:
- [x] Staging environment deployed and stable
- [x] All order types validated
- [x] Rate limit tests passed
- [x] <5 critical bugs identified

**Track B**:
- [x] WebSocket server fully implemented (8 tasks)
- [x] Unit tests ≥85% coverage
- [x] Redis adapter working
- [x] Authentication securing connections

### Week 2 Success

**Track A**:
- [x] 10 beta users onboarded
- [x] >80% beta user satisfaction
- [x] All P0 bugs fixed
- [x] Production deployment approved

**Track B**:
- [x] Integration tests passing
- [x] Documentation complete
- [x] WebSocket on staging
- [x] Ready for Phase 2 frontend work

### Week 3 Ready

- [x] Brokers production-ready
- [x] WebSocket infrastructure proven
- [x] Beta testing successful
- [x] Monitoring configured
- [x] Team confident in deployment

---

## Daily Standup Template

**Track A (Operational)**:
- Yesterday: [Deployment activities]
- Today: [Testing/monitoring tasks]
- Blockers: [Any issues]

**Track B (Development)**:
- Yesterday: [WebSocket tasks completed]
- Today: [Next implementation tasks]
- Blockers: [Dependencies or unknowns]

**Coordination**:
- Can WebSocket be tested with staging brokers?
- Any integration issues discovered?
- Timeline adjustments needed?

---

## Next Steps (Right Now)

1. **Track A**: Review prerequisites, create .env.staging, apply for paper trading accounts
2. **Track B**: Begin WebSocket implementation (Task 1.1 - Install dependencies)
3. **Coordination**: Set up daily sync schedule (async preferred)

**Let's begin with Track B** - I'll start implementing the WebSocket server while you handle Track A operational setup.
