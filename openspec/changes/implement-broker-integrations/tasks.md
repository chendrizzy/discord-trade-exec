# Implementation Tasks: Multi-Broker Integrations

**Proposal**: implement-broker-integrations
**Priority**: P0 - Critical
**Timeline**: 4-6 weeks (160 hours)

---

## Phase 1: IBKR Integration (2-3 weeks)

### Week 1: Setup + Authentication

- [ ] **Install Dependencies**
  - [ ] Install `@stoqey/ib` npm package
  - [ ] Add IBKR configuration to environment variables
  - [ ] Set up TWS/IB Gateway connection testing environment

- [ ] **Create IBKRAdapter Class**
  - [ ] Implement `src/brokers/adapters/IBKRAdapter.js`
  - [ ] Extend BrokerAdapter base class
  - [ ] Implement constructor with config (clientId, host, port)
  - [ ] Add TWS API connection handling

- [ ] **Implement Authentication**
  - [ ] Implement `connect()` method
  - [ ] Handle TWS/IB Gateway connection
  - [ ] Request next valid ID
  - [ ] Implement connection verification (`isConnected()`)
  - [ ] Add error handling for connection failures

- [ ] **Implement Account Balance Retrieval**
  - [ ] Implement `getBalance()` method
  - [ ] Request account summary from TWS API
  - [ ] Parse and return cash, equity, buyingPower
  - [ ] Handle API response errors

### Week 2: Order Execution

- [ ] **Implement Order Placement**
  - [ ] Implement `placeOrder(order)` method
  - [ ] Create contract object (symbol, secType, exchange, currency)
  - [ ] Convert order types (market, limit, stop, stop-limit)
  - [ ] Build IBKR order object with action, quantity, prices
  - [ ] Submit order and return orderId + status

- [ ] **Implement Order Type Conversion**
  - [ ] Create `convertOrderType()` helper method
  - [ ] Map 'market' → 'MKT'
  - [ ] Map 'limit' → 'LMT'
  - [ ] Map 'stop' → 'STP'
  - [ ] Map 'stop_limit' → 'STP LMT'

- [ ] **Implement Position Retrieval**
  - [ ] Implement `getPositions()` method
  - [ ] Request current positions from TWS API
  - [ ] Parse position data (symbol, quantity, avgCost, marketValue)
  - [ ] Return normalized position array

- [ ] **Implement Order Status Tracking**
  - [ ] Add order status event listeners
  - [ ] Handle order filled/partially filled events
  - [ ] Handle order cancelled/rejected events
  - [ ] Store order status updates

### Week 3: Testing + Polish

- [ ] **Unit Tests (90% Coverage)**
  - [ ] Create `src/brokers/adapters/__tests__/IBKRAdapter.test.js`
  - [ ] Test `connect()` success and failure scenarios
  - [ ] Test `placeOrder()` with market orders
  - [ ] Test `placeOrder()` with limit orders
  - [ ] Test `placeOrder()` with stop orders
  - [ ] Test `getBalance()` method
  - [ ] Test `getPositions()` method
  - [ ] Test order type conversion
  - [ ] Test error handling for all methods

- [ ] **Integration Tests**
  - [ ] Create `tests/integration/brokers/ibkr.test.js`
  - [ ] Test full trade lifecycle (connect → order → fill → position)
  - [ ] Test with paper trading account
  - [ ] Verify position updates after trades
  - [ ] Test reconnection after disconnect

- [ ] **Error Handling + Reconnection**
  - [ ] Implement automatic reconnection logic
  - [ ] Handle TWS disconnect gracefully
  - [ ] Add retry logic with exponential backoff
  - [ ] Log connection state changes

- [ ] **Rate Limiting**
  - [ ] Implement request queuing (50 messages/second limit)
  - [ ] Add rate limiter middleware
  - [ ] Test rate limit enforcement
  - [ ] Handle rate limit exceeded errors

---

## Phase 2: Schwab Integration (2-3 weeks)

### Week 1: OAuth2 + API Client

- [ ] **Setup Schwab API Client**
  - [ ] Register Schwab Developer Account
  - [ ] Obtain API credentials (key + secret)
  - [ ] Add Schwab config to environment variables

- [ ] **Create SchwabAdapter Class**
  - [ ] Implement `src/brokers/adapters/SchwabAdapter.js`
  - [ ] Extend BrokerAdapter base class
  - [ ] Implement constructor with config (apiKey, apiSecret, refreshToken)
  - [ ] Set baseURL to Schwab API endpoint

- [ ] **Implement OAuth2 Authentication**
  - [ ] Implement `authenticate()` method
  - [ ] Handle OAuth2 token refresh flow
  - [ ] Store access token and refresh token
  - [ ] Implement automatic token refresh
  - [ ] Handle OAuth errors (expired tokens, invalid credentials)

- [ ] **Implement HTTP Request Helper**
  - [ ] Create `request(method, endpoint, data)` helper
  - [ ] Add Authorization header with access token
  - [ ] Handle 401 responses (re-authenticate)
  - [ ] Add error handling for network failures

- [ ] **Implement Position Retrieval**
  - [ ] Implement `getPositions()` method
  - [ ] Make GET request to `/accounts/{accountId}/positions`
  - [ ] Parse Schwab position format
  - [ ] Return normalized positions (symbol, quantity, marketValue, avgCost)

### Week 2: Order Management

- [ ] **Implement Order Placement**
  - [ ] Implement `placeOrder(order)` method
  - [ ] Build Schwab order object (orderType, session, duration, legs)
  - [ ] Convert order types (market, limit, stop, stop-limit)
  - [ ] Handle order leg collection (instrument, instruction, quantity)
  - [ ] Submit order via POST to `/accounts/{accountId}/orders`
  - [ ] Extract orderId from response headers
  - [ ] Return order confirmation

- [ ] **Implement Order Type Conversion**
  - [ ] Create `convertOrderType()` helper
  - [ ] Map 'market' → 'MARKET'
  - [ ] Map 'limit' → 'LIMIT'
  - [ ] Map 'stop' → 'STOP'
  - [ ] Map 'stop_limit' → 'STOP_LIMIT'

- [ ] **Implement Account Balance**
  - [ ] Implement `getBalance()` method
  - [ ] Request account details
  - [ ] Parse cash balance, equity, buying power
  - [ ] Return normalized balance object

- [ ] **Implement Order Status**
  - [ ] Implement `getOrderStatus(orderId)` method
  - [ ] Make GET request to order status endpoint
  - [ ] Parse order status (filled, pending, cancelled)
  - [ ] Handle partial fills

### Week 3: Testing + Polish

- [ ] **Unit Tests (90% Coverage)**
  - [ ] Create `src/brokers/adapters/__tests__/SchwabAdapter.test.js`
  - [ ] Test `authenticate()` success and refresh token flow
  - [ ] Test `placeOrder()` with all order types
  - [ ] Test `getPositions()` method
  - [ ] Test `getBalance()` method
  - [ ] Test `getOrderStatus()` method
  - [ ] Test error handling (401, network errors)
  - [ ] Mock all API responses

- [ ] **Integration Tests**
  - [ ] Create `tests/integration/brokers/schwab.test.js`
  - [ ] Test OAuth flow end-to-end
  - [ ] Test full trade lifecycle
  - [ ] Verify paper trading execution
  - [ ] Test token refresh persistence

- [ ] **OAuth Refresh Token Persistence**
  - [ ] Store refresh tokens in encrypted database
  - [ ] Implement token rotation on refresh
  - [ ] Add token expiration monitoring
  - [ ] Handle token revocation

- [ ] **Rate Limiting**
  - [ ] Implement 120 requests/minute limit
  - [ ] Add request queuing
  - [ ] Test rate limit enforcement
  - [ ] Handle 429 Too Many Requests errors

---

## Phase 3: UI Integration (1 week)

### Dashboard Components

- [ ] **Create BrokerSetup Component**
  - [ ] Implement `src/dashboard/components/BrokerSetup.jsx`
  - [ ] Display broker selection grid (Alpaca, IBKR, Schwab)
  - [ ] Show broker logos and feature badges
  - [ ] Highlight Premium badge for IBKR/Schwab
  - [ ] Handle broker selection state

- [ ] **Create BrokerCard Component**
  - [ ] Implement `src/dashboard/components/BrokerCard.jsx`
  - [ ] Display broker logo, name, features
  - [ ] Show Premium badge if applicable
  - [ ] Handle selection state
  - [ ] Add click handler

- [ ] **Create BrokerConnectionForm Component**
  - [ ] Implement `src/dashboard/components/BrokerConnectionForm.jsx`
  - [ ] Render broker-specific form fields
  - [ ] IBKR: clientId, host, port, paper trading toggle
  - [ ] Schwab: API key, API secret, OAuth redirect
  - [ ] Alpaca: API key, API secret, paper trading toggle
  - [ ] Add form validation
  - [ ] Handle submission

- [ ] **Implement Connection Testing UI**
  - [ ] Add "Test Connection" button
  - [ ] Show loading spinner during test
  - [ ] Display success toast on successful connection
  - [ ] Display error toast with details on failure
  - [ ] Show balance after successful test

- [ ] **Implement Broker Management Page**
  - [ ] Create `/dashboard/brokers` route
  - [ ] List connected brokers
  - [ ] Show connection status (connected, disconnected, error)
  - [ ] Add "Connect New Broker" button
  - [ ] Add "Disconnect" action for each broker
  - [ ] Add "Set as Primary" action

### API Integration

- [ ] **Test Broker Connection Endpoint**
  - [ ] Create POST `/api/brokers/:broker/test` route
  - [ ] Accept credentials in request body
  - [ ] Create broker adapter instance
  - [ ] Call `adapter.connect()`
  - [ ] Call `adapter.getBalance()`
  - [ ] Return success + balance or error message

- [ ] **Save Broker Connection Endpoint**
  - [ ] Create POST `/api/brokers/:broker/connect` route
  - [ ] Test connection first
  - [ ] Encrypt credentials before saving
  - [ ] Add broker to user.brokerConnections array
  - [ ] Save to database
  - [ ] Return success + connectionId

- [ ] **Get Connected Brokers Endpoint**
  - [ ] Create GET `/api/brokers/user/configured` route
  - [ ] Return user's brokerConnections (without credentials)
  - [ ] Include connection status
  - [ ] Include last sync timestamp

- [ ] **Broker Comparison Endpoint**
  - [ ] Create GET `/api/brokers/compare` route
  - [ ] Return broker comparison data (fees, assets, ratings)
  - [ ] Include support for free vs premium tiers

- [ ] **Disconnect Broker Endpoint**
  - [ ] Create DELETE `/api/brokers/:connectionId` route
  - [ ] Remove broker connection from user
  - [ ] Clean up any cached data
  - [ ] Return success confirmation

---

## Data Model Updates

- [ ] **Extend User Model**
  - [ ] Update `src/models/User.js`
  - [ ] Add `brokerConnections` array field
  - [ ] Add broker field (enum: alpaca, ibkr, schwab)
  - [ ] Add accountId field (encrypted)
  - [ ] Add credentials field (encrypted, Mixed type)
  - [ ] Add isPaperTrading field (Boolean)
  - [ ] Add isActive field (Boolean)
  - [ ] Add connectedAt field (Date)
  - [ ] Add lastSyncAt field (Date)
  - [ ] Add status field (enum: connected, disconnected, error)
  - [ ] Add `primaryBroker` field (enum: alpaca, ibkr, schwab)

- [ ] **Implement Credential Encryption**
  - [ ] Create `src/middleware/encryption.js`
  - [ ] Implement `encryptBrokerCredentials(credentials)` function
  - [ ] Use AES-256-GCM algorithm
  - [ ] Generate random IV for each encryption
  - [ ] Return encrypted data + IV + authTag
  - [ ] Implement `decryptBrokerCredentials(encrypted, iv, authTag)` function
  - [ ] Add error handling for decryption failures

---

## Security Implementation

- [ ] **Rate Limiting Middleware**
  - [ ] Create `src/middleware/rateLimiter.js`
  - [ ] Define broker-specific rate limits
  - [ ] IBKR: 50 requests/second
  - [ ] Schwab: 120 requests/minute
  - [ ] Alpaca: 200 requests/minute
  - [ ] Create `brokerLimiter(broker)` function
  - [ ] Apply rate limiting to broker API routes

- [ ] **Premium Tier Gating**
  - [ ] Add `requirePremium` middleware
  - [ ] Check user subscription tier
  - [ ] Block IBKR/Schwab access for non-premium users
  - [ ] Return 403 Forbidden with upgrade message
  - [ ] Apply to all premium broker routes

- [ ] **Credential Validation**
  - [ ] Validate API credentials format before saving
  - [ ] Test connection before persisting credentials
  - [ ] Prevent storing invalid credentials
  - [ ] Sanitize input to prevent injection

---

## Testing & Quality Assurance

- [ ] **Achieve 90% Code Coverage**
  - [ ] Run `npm test -- --coverage`
  - [ ] Verify IBKRAdapter coverage ≥90%
  - [ ] Verify SchwabAdapter coverage ≥90%
  - [ ] Verify API routes coverage ≥90%
  - [ ] Fix uncovered edge cases

- [ ] **Integration Test Suite**
  - [ ] Test complete user flow: select broker → test → save → trade
  - [ ] Test IBKR paper trading execution
  - [ ] Test Schwab paper trading execution
  - [ ] Test broker switching
  - [ ] Test reconnection scenarios

- [ ] **Error Scenario Testing**
  - [ ] Test invalid credentials
  - [ ] Test network failures
  - [ ] Test rate limit violations
  - [ ] Test OAuth token expiration
  - [ ] Test TWS disconnect

- [ ] **Performance Testing**
  - [ ] Measure API response times (target <500ms P95)
  - [ ] Test under load (100 concurrent users)
  - [ ] Verify rate limiting doesn't block legitimate requests
  - [ ] Test reconnection performance

---

## Documentation

- [ ] **Update openspec/project.md**
  - [ ] Update broker adapter list
  - [ ] Change "AlpacaAdapter, plus future TD Ameritrade, Interactive Brokers"
  - [ ] To: "AlpacaAdapter, IBKRAdapter, SchwabAdapter"

- [ ] **Update README.md**
  - [ ] Add "Multi-Broker Support" section
  - [ ] List supported brokers (Alpaca, IBKR, Schwab)
  - [ ] Link to broker setup guides

- [ ] **Create docs/BROKER-SETUP.md**
  - [ ] Write IBKR setup guide
  - [ ] Include TWS/IB Gateway installation
  - [ ] Include paper trading setup
  - [ ] Write Schwab setup guide
  - [ ] Include OAuth registration steps
  - [ ] Include API credential generation
  - [ ] Add troubleshooting section

- [ ] **Update API Documentation**
  - [ ] Document broker API endpoints
  - [ ] Add request/response examples
  - [ ] Document error codes
  - [ ] Add authentication requirements

---

## Rollout & Monitoring

- [ ] **Internal Testing (Week 1)**
  - [ ] Deploy to staging environment
  - [ ] Test with paper trading accounts
  - [ ] Validate all order types work
  - [ ] Stress test rate limiting
  - [ ] Fix critical bugs

- [ ] **Beta Release (Week 2)**
  - [ ] Invite 10 premium users
  - [ ] Monitor error rates via logs
  - [ ] Collect user feedback
  - [ ] Track connection success rate
  - [ ] Fix reported issues

- [ ] **General Availability (Week 3)**
  - [ ] Deploy to production
  - [ ] Launch to all premium subscribers
  - [ ] Send email announcement
  - [ ] Post Twitter announcement
  - [ ] Update landing page with broker logos
  - [ ] Monitor conversion rates

- [ ] **Post-Launch Monitoring**
  - [ ] Set up DataDog monitoring
  - [ ] Track broker connection success rates
  - [ ] Monitor order execution latency
  - [ ] Track premium tier conversion rate
  - [ ] Monitor error rates by broker
  - [ ] Set up alerts for critical failures

---

## Success Validation

### Functional Requirements
- [ ] IBKRAdapter passes all unit tests (90% coverage)
- [ ] SchwabAdapter passes all unit tests (90% coverage)
- [ ] Users can connect IBKR/Schwab accounts via dashboard
- [ ] Connection testing works for all brokers
- [ ] Market orders execute successfully
- [ ] Limit/stop orders execute successfully
- [ ] Portfolio positions retrieved accurately
- [ ] Account balance displayed correctly
- [ ] Error handling prevents credential leaks

### Non-Functional Requirements
- [ ] API response time <500ms (P95)
- [ ] Broker credentials encrypted at rest
- [ ] Rate limiting enforced per broker
- [ ] Graceful reconnection after disconnects
- [ ] Premium tier feature gate enforced

### Business Requirements
- [ ] Premium tier conversion rate ≥10%
- [ ] No customer complaints about missing brokers
- [ ] Documentation updated (README, OpenSpec)
- [ ] Admin dashboard shows broker usage stats
