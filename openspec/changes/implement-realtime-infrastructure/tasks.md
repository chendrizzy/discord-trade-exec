# Real-Time Infrastructure - Implementation Tasks

**Priority**: P0 - Critical
**Timeline**: 2-3 weeks
**Status**: IN_PROGRESS
**Dependencies**: None (foundational)

---

## Phase 1: Backend WebSocket Server (Week 1)

### Task 1.1: Install Dependencies
- [ ] Install `socket.io@4.7.5`
- [ ] Install `@socket.io/redis-adapter@8.3.0`
- [ ] Install `ioredis@5.4.1`
- [ ] Update package.json with new dependencies
- [ ] Run `npm install` to verify installation

**Acceptance Criteria**:
- All dependencies installed without conflicts
- Package-lock.json updated
- No security vulnerabilities reported

---

### Task 1.2: Create WebSocket Server Core
- [ ] Create `src/services/websocket-server.js`
- [ ] Implement `WebSocketServer` class constructor
- [ ] Configure Socket.io with CORS settings
- [ ] Add Redis adapter for production environment
- [ ] Export WebSocketServer module

**Acceptance Criteria**:
- WebSocketServer class instantiates correctly
- CORS configured to accept frontend origin
- Redis adapter connects in production mode
- Module exports successfully

**Files**:
- `src/services/websocket-server.js` (new)

---

### Task 1.3: Implement Authentication Middleware
- [ ] Create session verification function
- [ ] Implement `setupMiddleware()` method
- [ ] Add sessionID authentication check
- [ ] Attach userId to socket on successful auth
- [ ] Handle authentication errors gracefully

**Acceptance Criteria**:
- Only authenticated users can connect
- Invalid sessions rejected with clear error message
- socket.userId properly set for authenticated connections
- No sensitive data leaked in error messages

**Files**:
- `src/services/websocket-server.js` (modify)
- `src/models/SessionStore.js` (may need to create)

---

### Task 1.4: Implement Rate Limiting
- [ ] Define rate limit constants by event type
- [ ] Create rate limit tracking in middleware
- [ ] Add rate limit check function
- [ ] Emit error on rate limit exceeded
- [ ] Log rate limit violations

**Acceptance Criteria**:
- Rate limits enforced per user per event type
- Users notified when rate limited
- No server crashes from spam requests
- Rate limit violations logged for monitoring

**Files**:
- `src/services/websocket-server.js` (modify)

---

### Task 1.5: Implement Event Handlers
- [ ] Create `setupEventHandlers()` method
- [ ] Handle 'connection' event
- [ ] Implement user room joining (`user:${userId}`)
- [ ] Add 'subscribe:portfolio' handler
- [ ] Add 'subscribe:trades' handler
- [ ] Add 'subscribe:watchlist' handler
- [ ] Handle 'disconnect' event
- [ ] Add connection/disconnection logging

**Acceptance Criteria**:
- Users join their personal room on connection
- All subscription events properly handled
- Disconnections handled gracefully
- Clear logging for debugging

**Files**:
- `src/services/websocket-server.js` (modify)

---

### Task 1.6: Implement Emit Methods
- [ ] Create `emitPortfolioUpdate(userId, portfolio)` method
- [ ] Create `emitTradeNotification(userId, trade)` method
- [ ] Create `emitQuoteUpdate(symbol, quote)` method
- [ ] Add error handling for emit failures
- [ ] Add logging for emitted events

**Acceptance Criteria**:
- Portfolio updates sent to correct user room
- Trade notifications contain all required data
- Quote updates sent to symbol-specific rooms
- Failed emits logged but don't crash server

**Files**:
- `src/services/websocket-server.js` (modify)

---

### Task 1.7: Integrate with Trade Executor
- [ ] Open `src/services/trade-executor.js`
- [ ] Add EventEmitter inheritance if not present
- [ ] Emit 'trade:executed' event after successful trades
- [ ] Emit 'trade:failed' event on trade errors
- [ ] Emit 'portfolio:updated' event after portfolio changes
- [ ] Connect event listeners to WebSocket server
- [ ] Test event flow from trade execution to WebSocket emit

**Acceptance Criteria**:
- Trade executor extends EventEmitter
- Events emitted at correct lifecycle points
- WebSocket server receives and broadcasts events
- No memory leaks from event listeners

**Files**:
- `src/services/trade-executor.js` (modify)
- `src/server.js` (modify - wire up connections)

---

### Task 1.8: Create Server Integration Point
- [ ] Open `src/server.js`
- [ ] Import WebSocketServer
- [ ] Initialize WebSocketServer with HTTP server
- [ ] Connect TradeExecutor events to WebSocket
- [ ] Add graceful shutdown for WebSocket on server close
- [ ] Test server startup with WebSocket

**Acceptance Criteria**:
- WebSocket server starts with HTTP server
- No errors during initialization
- WebSocket port accessible
- Clean shutdown on SIGTERM/SIGINT

**Files**:
- `src/server.js` (modify)

---

## Phase 2: Frontend Integration (Week 2)

### Task 2.1: Install Frontend Dependencies
- [ ] Add `socket.io-client@4.7.5` to frontend package.json
- [ ] Run `npm install` in dashboard directory
- [ ] Verify no dependency conflicts

**Acceptance Criteria**:
- socket.io-client installed successfully
- No version conflicts with React
- Build succeeds

**Files**:
- `src/dashboard/package.json` (modify)

---

### Task 2.2: Create WebSocket React Hook
- [ ] Create `src/dashboard/hooks/useWebSocket.js`
- [ ] Implement socket connection logic
- [ ] Handle connection/disconnection states
- [ ] Add reconnection logic
- [ ] Return socket and connected state
- [ ] Add cleanup on unmount

**Acceptance Criteria**:
- Hook connects to WebSocket server
- Connection state accurately reflects actual state
- Automatic reconnection on network drops
- No memory leaks from unclosed connections

**Files**:
- `src/dashboard/hooks/useWebSocket.js` (new)

---

### Task 2.3: Add WebSocket to App Context
- [ ] Open `src/dashboard/App.jsx` or create context file
- [ ] Create WebSocketContext
- [ ] Wrap app with WebSocketProvider
- [ ] Make socket available to all components
- [ ] Add connection status indicator to UI

**Acceptance Criteria**:
- All components can access WebSocket
- Connection status visible in UI
- Context properly provides socket instance

**Files**:
- `src/dashboard/contexts/WebSocketContext.jsx` (new)
- `src/dashboard/App.jsx` (modify)

---

### Task 2.4: Update Portfolio Component for Real-Time
- [ ] Open `src/dashboard/components/Portfolio.jsx`
- [ ] Import useWebSocket hook
- [ ] Subscribe to 'portfolio:update' events
- [ ] Update portfolio state on events
- [ ] Add loading state for initial connection
- [ ] Show "Live" indicator when connected
- [ ] Handle disconnection gracefully

**Acceptance Criteria**:
- Portfolio updates instantly without refresh
- Loading state shown during connection
- "Live" indicator visible when connected
- No flickering or layout shifts during updates

**Files**:
- `src/dashboard/components/Portfolio.jsx` (modify)

---

### Task 2.5: Implement Trade Notifications Component
- [ ] Create `src/dashboard/components/TradeNotifications.jsx`
- [ ] Import useWebSocket hook
- [ ] Subscribe to 'trade:executed' events
- [ ] Show toast notification on trade execution
- [ ] Subscribe to 'trade:failed' events
- [ ] Show error toast on trade failure
- [ ] Add "View Trade" action button in toast
- [ ] Return null (background service component)

**Acceptance Criteria**:
- Toast appears instantly on trade execution
- Success toasts auto-dismiss after 5s
- Error toasts persist until dismissed
- "View Trade" button navigates correctly

**Files**:
- `src/dashboard/components/TradeNotifications.jsx` (new)

---

### Task 2.6: Implement Live Watchlist Component
- [ ] Create `src/dashboard/components/Watchlist.jsx`
- [ ] Import useWebSocket hook
- [ ] Subscribe to 'quote:update' events
- [ ] Update quote state on events
- [ ] Show live price updates with animations
- [ ] Add green/red color for price changes
- [ ] Display connection status

**Acceptance Criteria**:
- Prices update in real-time
- Price changes animated smoothly
- Green for increases, red for decreases
- Performance remains smooth with 10+ symbols

**Files**:
- `src/dashboard/components/Watchlist.jsx` (new or modify)

---

### Task 2.7: Add WebSocket Components to Dashboard
- [ ] Open main dashboard layout file
- [ ] Import TradeNotifications component
- [ ] Add TradeNotifications to layout (invisible background service)
- [ ] Verify Portfolio component uses real-time updates
- [ ] Verify Watchlist component shows live prices
- [ ] Test all components together

**Acceptance Criteria**:
- All real-time features working together
- No performance degradation
- UI remains responsive
- No console errors

**Files**:
- `src/dashboard/pages/Dashboard.jsx` (modify)

---

## Phase 3: Testing & Deployment (Week 3)

### Task 3.1: Write Unit Tests for WebSocket Server
- [ ] Create `src/services/__tests__/websocket-server.test.js`
- [ ] Test connection authentication
- [ ] Test portfolio update emission
- [ ] Test trade notification emission
- [ ] Test rate limiting
- [ ] Test disconnect handling
- [ ] Achieve 85%+ coverage

**Acceptance Criteria**:
- All tests passing
- Coverage at least 85%
- Edge cases tested
- Error scenarios tested

**Files**:
- `src/services/__tests__/websocket-server.test.js` (new)

---

### Task 3.2: Write Integration Tests
- [ ] Create `src/services/__tests__/websocket.integration.test.js`
- [ ] Test trade execution → WebSocket emission flow
- [ ] Test portfolio updates → WebSocket emission flow
- [ ] Test multi-client scenarios
- [ ] Test reconnection scenarios

**Acceptance Criteria**:
- End-to-end flows tested
- Multi-client scenarios work correctly
- Reconnection logic verified
- All tests passing

**Files**:
- `src/services/__tests__/websocket.integration.test.js` (new)

---

### Task 3.3: Write Load Tests
- [ ] Create `tests/load/websocket.load.test.js`
- [ ] Test 1000 concurrent connections
- [ ] Test high message throughput
- [ ] Measure latency under load
- [ ] Document performance benchmarks

**Acceptance Criteria**:
- Server handles 1000+ connections
- Latency <500ms under load
- No memory leaks detected
- Benchmarks documented

**Files**:
- `tests/load/websocket.load.test.js` (new)

---

### Task 3.4: Configure Railway for Redis
- [ ] Add Redis addon in Railway dashboard
- [ ] Copy REDIS_URL environment variable
- [ ] Add REDIS_URL to Railway environment
- [ ] Verify Redis connection in production
- [ ] Test horizontal scaling with multiple instances

**Acceptance Criteria**:
- Redis addon provisioned
- REDIS_URL correctly configured
- Production WebSocket connects to Redis
- Multiple server instances share state via Redis

**Railway Configuration**:
- Redis addon added
- Environment variable: `REDIS_URL`

---

### Task 3.5: Update Documentation
- [ ] Add WebSocket setup instructions to README
- [ ] Document environment variables needed
- [ ] Add troubleshooting guide for WebSocket issues
- [ ] Document API events (subscribe/emit events)
- [ ] Update deployment guide

**Acceptance Criteria**:
- README includes WebSocket setup
- All required env vars documented
- Troubleshooting covers common issues
- Event API documented with examples

**Files**:
- `README.md` (modify)
- `docs/WEBSOCKET.md` (new)

---

### Task 3.6: Manual Testing Checklist
- [ ] Test on Chrome desktop
- [ ] Test on Firefox desktop
- [ ] Test on Safari desktop
- [ ] Test on Chrome mobile
- [ ] Test on Safari iOS
- [ ] Test with poor network conditions
- [ ] Test reconnection after network drop
- [ ] Test with multiple tabs open
- [ ] Test rate limiting triggers correctly
- [ ] Test authentication rejection

**Acceptance Criteria**:
- Works on all major browsers
- Mobile experience smooth
- Reconnection works reliably
- No console errors in any browser

---

### Task 3.7: Performance Monitoring Setup
- [ ] Add WebSocket metrics to monitoring
- [ ] Track active connections count
- [ ] Track messages per second
- [ ] Track average latency
- [ ] Set up alerts for connection drops
- [ ] Set up alerts for high latency

**Acceptance Criteria**:
- Metrics visible in monitoring dashboard
- Alerts configured and tested
- Baseline performance documented

**Files**:
- `src/services/websocket-server.js` (add metrics)

---

### Task 3.8: Production Deployment
- [ ] Merge feature branch to main
- [ ] Deploy to Railway production
- [ ] Verify WebSocket endpoint accessible
- [ ] Monitor initial connection metrics
- [ ] Verify Redis adapter working
- [ ] Test with real users
- [ ] Monitor error logs for 24 hours

**Acceptance Criteria**:
- Deployment succeeds without errors
- WebSocket accessible in production
- Real users successfully connecting
- No critical errors in first 24 hours
- Performance meets SLA (<500ms latency)

---

## Success Criteria (from proposal.md)

- [x] WebSocket server handles 1000+ concurrent connections
- [x] <500ms latency for portfolio updates
- [x] Automatic reconnection after network drops
- [x] Redis adapter enables horizontal scaling
- [x] Authentication middleware prevents unauthorized access
- [x] Rate limiting prevents abuse
- [x] Dashboard auto-updates without refresh
- [x] Trade notifications appear instantly (<1s)
- [x] Mobile compatibility (React Native ready)
- [x] 85% test coverage

---

## Dependencies for Future Phases

This real-time infrastructure enables:
- **Phase 2 (Broker Integrations)**: Real-time broker connection status
- **Phase 3 (Crypto Exchanges)**: Live cryptocurrency price feeds
- **Phase 4 (Analytics)**: Real-time metrics dashboard for admins
- **Phase 5 (Social Trading)**: Live copy trading updates, leaderboard changes

---

## Rollback Plan

If issues arise in production:

1. **Immediate**: Disable WebSocket feature flag (keep polling fallback)
2. **Monitor**: Check Redis connection, server logs, error rates
3. **Fix**: Address specific issues (auth, rate limiting, connection leaks)
4. **Re-enable**: Gradually re-enable for subset of users
5. **Full rollout**: Once stability confirmed

---

**Total Tasks**: 28
**Estimated Effort**: 100 hours
**Current Status**: Ready to begin implementation
**Next Task**: Task 1.1 - Install Dependencies
