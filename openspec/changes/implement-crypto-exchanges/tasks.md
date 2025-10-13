# Implementation Tasks: Crypto Exchange Integrations

**Proposal**: implement-crypto-exchanges
**Priority**: P1 - High Impact
**Timeline**: 2-3 weeks (120 hours)
**Dependencies**: Broker Integrations (adapter pattern established)

---

## Phase 1: Coinbase Pro Adapter (1 week)

### Setup & Authentication

- [ ] **Install Dependencies**
  - [ ] Install required npm packages (axios, crypto)
  - [ ] Add Coinbase Pro configuration to environment variables
  - [ ] Set up Coinbase Pro API sandbox account for testing

- [ ] **Create CoinbaseProAdapter Class**
  - [ ] Implement `src/brokers/adapters/CoinbaseProAdapter.js`
  - [ ] Extend BrokerAdapter base class
  - [ ] Implement constructor with config (apiKey, apiSecret, passphrase)
  - [ ] Set baseURL to 'https://api.pro.coinbase.com'

- [ ] **Implement Request Signing**
  - [ ] Implement `sign(method, path, body)` method
  - [ ] Generate timestamp
  - [ ] Create message: timestamp + method + path + body
  - [ ] Create HMAC-SHA256 signature with base64-encoded secret
  - [ ] Return headers object with:
    - CB-ACCESS-KEY
    - CB-ACCESS-SIGN
    - CB-ACCESS-TIMESTAMP
    - CB-ACCESS-PASSPHRASE
    - Content-Type

### Order Management

- [ ] **Implement Order Placement**
  - [ ] Implement `placeOrder(order)` method
  - [ ] Build Coinbase Pro order object:
    - product_id: `${symbol}-USD`
    - side: buy/sell
    - type: market/limit
    - size: quantity as string
    - price: limitPrice as string (if limit order)
  - [ ] Sign request with POST method
  - [ ] Submit order to `/orders` endpoint
  - [ ] Return orderId, status, timestamp

- [ ] **Implement Order Status**
  - [ ] Implement `getOrderStatus(orderId)` method
  - [ ] Make GET request to `/orders/{orderId}`
  - [ ] Parse order status (open, done, pending, cancelled)
  - [ ] Return normalized status

- [ ] **Implement Order Cancellation**
  - [ ] Implement `cancelOrder(orderId)` method
  - [ ] Make DELETE request to `/orders/{orderId}`
  - [ ] Handle cancellation confirmation
  - [ ] Return success status

### Account & Position Management

- [ ] **Implement Balance Retrieval**
  - [ ] Implement `getBalance()` method
  - [ ] Make GET request to `/accounts` endpoint
  - [ ] Find USD account in response
  - [ ] Parse cash balance and available funds
  - [ ] Calculate total equity across all currencies
  - [ ] Return cash, equity, buyingPower

- [ ] **Implement Position Retrieval**
  - [ ] Implement `getPositions()` method
  - [ ] Make GET request to `/accounts` endpoint
  - [ ] Filter out accounts with zero balance
  - [ ] For each non-USD account, calculate market value
  - [ ] Return normalized positions (symbol, quantity, marketValue)

- [ ] **Implement Fee Structure**
  - [ ] Implement `getFees()` method
  - [ ] Return Coinbase Pro fee structure
  - [ ] Maker: 0.4% (may vary by volume)
  - [ ] Taker: 0.6% (may vary by volume)
  - [ ] Note: Consider implementing tier-based fees

### Price Data

- [ ] **Implement Price Fetching**
  - [ ] Implement `getPrice(symbol)` method
  - [ ] Make GET request to `/products/{symbol}-USD/ticker`
  - [ ] Parse current price
  - [ ] Return normalized price

- [ ] **Implement Product Info**
  - [ ] Implement `getProductInfo(symbol)` method
  - [ ] Make GET request to `/products/{symbol}-USD`
  - [ ] Parse min/max order sizes, price increments
  - [ ] Return product details

---

## Phase 2: Kraken Adapter (1 week)

### Setup & Authentication

- [ ] **Create KrakenAdapter Class**
  - [ ] Implement `src/brokers/adapters/KrakenAdapter.js`
  - [ ] Extend BrokerAdapter base class
  - [ ] Implement constructor with config (apiKey, apiSecret)
  - [ ] Set baseURL to 'https://api.kraken.com'

- [ ] **Implement Request Signing**
  - [ ] Implement `sign(path, nonce, postData)` method
  - [ ] Create message hash: path + SHA256(nonce + postData)
  - [ ] Create HMAC-SHA512 signature with base64-encoded secret
  - [ ] Return base64-encoded signature

- [ ] **Implement Private Request Helper**
  - [ ] Implement `privateRequest(path, params)` method
  - [ ] Generate nonce (timestamp in milliseconds × 1000)
  - [ ] Build URLSearchParams with nonce + params
  - [ ] Sign request
  - [ ] Add headers: API-Key, API-Sign
  - [ ] Make POST request
  - [ ] Handle Kraken error responses
  - [ ] Return response data

### Order Management

- [ ] **Implement Order Placement**
  - [ ] Implement `placeOrder(order)` method
  - [ ] Build Kraken order params:
    - ordertype: market/limit
    - type: buy/sell
    - pair: `${symbol}USD`
    - volume: quantity as string
    - price: limitPrice as string (if limit order)
  - [ ] Make request to `/0/private/AddOrder`
  - [ ] Extract transaction ID from response
  - [ ] Return orderId (txid[0]), status, timestamp

- [ ] **Implement Order Query**
  - [ ] Implement `getOrderStatus(orderId)` method
  - [ ] Make request to `/0/private/QueryOrders`
  - [ ] Parse order status (pending, open, closed, cancelled)
  - [ ] Return normalized status

- [ ] **Implement Order Cancellation**
  - [ ] Implement `cancelOrder(orderId)` method
  - [ ] Make request to `/0/private/CancelOrder`
  - [ ] Handle cancellation result
  - [ ] Return success status

### Account & Position Management

- [ ] **Implement Balance Retrieval**
  - [ ] Implement `getBalance()` method
  - [ ] Make request to `/0/private/Balance`
  - [ ] Parse currency balances
  - [ ] Find USD/ZUSD balance
  - [ ] Calculate total equity
  - [ ] Return cash, equity, buyingPower

- [ ] **Implement Position Retrieval**
  - [ ] Implement `getPositions()` method
  - [ ] Make request to `/0/private/Balance`
  - [ ] Filter out zero balances
  - [ ] For each crypto, fetch current price
  - [ ] Calculate market value
  - [ ] Return normalized positions

- [ ] **Implement Fee Structure**
  - [ ] Implement `getFees()` method
  - [ ] Make request to `/0/private/TradeVolume`
  - [ ] Parse maker and taker fee percentages
  - [ ] Return tier-based fees
  - [ ] Note: Kraken fees decrease with volume

### Price Data

- [ ] **Implement Price Fetching**
  - [ ] Implement `getPrice(symbol)` method
  - [ ] Make GET request to `/0/public/Ticker`
  - [ ] Parse current price (last trade price)
  - [ ] Return normalized price

- [ ] **Implement Asset Pairs**
  - [ ] Implement `getAssetPairs()` method
  - [ ] Make GET request to `/0/public/AssetPairs`
  - [ ] Parse available trading pairs
  - [ ] Return normalized pairs list

---

## Phase 3: Fee Comparison Tool

### Backend API

- [ ] **Implement Fee Comparison Endpoint**
  - [ ] Add route `GET /api/exchanges/compare-fees` to exchanges.js
  - [ ] Accept query params: symbol, quantity
  - [ ] Require authentication
  - [ ] Filter user's connected crypto exchanges
  - [ ] For each exchange:
    - Create adapter instance
    - Call `getFees()` method
    - Get current price
    - Calculate trade value
    - Calculate estimated taker fee
  - [ ] Sort exchanges by lowest fee
  - [ ] Calculate savings vs most expensive
  - [ ] Return JSON with exchanges array + recommendation

- [ ] **Add Exchange Recommendation Logic**
  - [ ] Consider fee as primary factor
  - [ ] Check liquidity (if available via API)
  - [ ] Check withdrawal fees
  - [ ] Consider user's exchange balance
  - [ ] Return recommended exchange with reasoning

### Frontend UI

- [ ] **Create FeeComparison Component**
  - [ ] Implement `src/dashboard/components/FeeComparison.jsx`
  - [ ] Accept props: symbol, quantity
  - [ ] Implement state: comparison, loading

- [ ] **Implement Fee Fetching**
  - [ ] Create `fetchComparison()` async function
  - [ ] Make GET request to `/api/exchanges/compare-fees`
  - [ ] Handle loading state
  - [ ] Handle errors
  - [ ] Store comparison data in state

- [ ] **Implement Comparison Table**
  - [ ] Display table with columns:
    - Exchange name
    - Taker fee percentage
    - Estimated cost
    - Savings amount
  - [ ] Highlight best rate row
  - [ ] Show "Best Rate" badge on cheapest option
  - [ ] Format currency values ($X.XX)
  - [ ] Show positive savings in green

- [ ] **Implement Recommendation Display**
  - [ ] Show recommendation section below table
  - [ ] Display recommended exchange name
  - [ ] Show total savings amount
  - [ ] Add visual indicator (💡 emoji)

- [ ] **Add Auto-Refresh**
  - [ ] Use useEffect to fetch on symbol/quantity change
  - [ ] Debounce rapid changes
  - [ ] Add manual refresh button
  - [ ] Show last updated timestamp

---

## Testing & Quality Assurance

### Coinbase Pro Testing

- [ ] **Unit Tests**
  - [ ] Create `src/brokers/adapters/__tests__/CoinbaseProAdapter.test.js`
  - [ ] Test `sign()` method signature generation
  - [ ] Test `placeOrder()` with market orders
  - [ ] Test `placeOrder()` with limit orders
  - [ ] Test `getBalance()` method
  - [ ] Test `getPositions()` method
  - [ ] Test `getFees()` method
  - [ ] Test error handling for API failures
  - [ ] Achieve ≥90% coverage

- [ ] **Integration Tests**
  - [ ] Create sandbox account on Coinbase Pro
  - [ ] Test full order lifecycle (place → fill → position)
  - [ ] Test balance updates after trades
  - [ ] Test order cancellation
  - [ ] Verify fee calculations

### Kraken Testing

- [ ] **Unit Tests**
  - [ ] Create `src/brokers/adapters/__tests__/KrakenAdapter.test.js`
  - [ ] Test `sign()` method signature generation
  - [ ] Test `privateRequest()` helper
  - [ ] Test `placeOrder()` with market orders
  - [ ] Test `placeOrder()` with limit orders
  - [ ] Test `getBalance()` method
  - [ ] Test `getFees()` method with tier structure
  - [ ] Test error handling
  - [ ] Achieve ≥90% coverage

- [ ] **Integration Tests**
  - [ ] Create test account on Kraken
  - [ ] Test full order lifecycle
  - [ ] Test tier-based fee calculation
  - [ ] Test balance retrieval
  - [ ] Verify position updates

### Fee Comparison Testing

- [ ] **Unit Tests**
  - [ ] Test fee comparison endpoint logic
  - [ ] Test sorting by lowest fee
  - [ ] Test savings calculation
  - [ ] Test recommendation algorithm
  - [ ] Mock adapter responses

- [ ] **UI Component Tests**
  - [ ] Test FeeComparison component rendering
  - [ ] Test loading states
  - [ ] Test error states
  - [ ] Test table data display
  - [ ] Test auto-refresh functionality

- [ ] **Integration Tests**
  - [ ] Test comparison with 3 connected exchanges
  - [ ] Test with 2 exchanges (edge case)
  - [ ] Test with 1 exchange (no comparison possible)
  - [ ] Verify real-time fee accuracy
  - [ ] Test with different symbols and quantities

---

## Data Model Updates

- [ ] **Extend User Model for Crypto**
  - [ ] Verify brokerConnections supports crypto exchanges
  - [ ] Add enum values: 'binance', 'coinbase_pro', 'kraken'
  - [ ] Ensure credentials encryption works for all exchanges
  - [ ] Test with passphrase field (Coinbase Pro specific)

- [ ] **Create Exchange Metadata Schema**
  - [ ] Create optional ExchangeMetadata schema
  - [ ] Store: exchange name, logo URL, fee structure
  - [ ] Store: supported assets list
  - [ ] Store: geographic restrictions
  - [ ] Use for dashboard display

---

## Documentation

- [ ] **Update README.md**
  - [ ] Add "Crypto Exchange Support" section
  - [ ] List supported exchanges (Binance, Coinbase Pro, Kraken)
  - [ ] Mention fee comparison tool
  - [ ] Add asset support table

- [ ] **Create Exchange Setup Guides**
  - [ ] Create `docs/EXCHANGE-SETUP.md`
  - [ ] Write Coinbase Pro setup guide
    - API key generation steps
    - Passphrase configuration
    - Permissions required
  - [ ] Write Kraken setup guide
    - API key creation steps
    - Required permissions
    - Security recommendations
  - [ ] Add troubleshooting section

- [ ] **Update API Documentation**
  - [ ] Document `/api/exchanges/compare-fees` endpoint
  - [ ] Add request/response examples
  - [ ] Document error codes
  - [ ] Document authentication requirements

- [ ] **Update openspec/project.md**
  - [ ] Update exchange adapter list
  - [ ] Add Coinbase Pro and Kraken to implementations

---

## Security & Performance

- [ ] **Implement Rate Limiting**
  - [ ] Add Coinbase Pro rate limiting (3 requests/second)
  - [ ] Add Kraken rate limiting (varies by tier)
  - [ ] Implement request queuing per exchange
  - [ ] Add rate limit monitoring
  - [ ] Handle 429 errors gracefully

- [ ] **Credential Security**
  - [ ] Verify encryption works for all credential types
  - [ ] Test passphrase encryption (Coinbase Pro)
  - [ ] Ensure API secrets never logged
  - [ ] Validate credential format before saving
  - [ ] Implement credential rotation support

- [ ] **Error Handling**
  - [ ] Handle exchange downtime gracefully
  - [ ] Implement fallback to other exchanges
  - [ ] Add circuit breaker pattern
  - [ ] Log all exchange errors
  - [ ] Show user-friendly error messages

- [ ] **Performance Optimization**
  - [ ] Implement price data caching (30s TTL)
  - [ ] Implement fee structure caching (5min TTL)
  - [ ] Batch multiple price requests
  - [ ] Optimize comparison endpoint response time (<500ms)

---

## Rollout Plan

- [ ] **Week 1: Coinbase Pro Release**
  - [ ] Deploy Coinbase Pro adapter to staging
  - [ ] Test with 5 beta users
  - [ ] Monitor error rates
  - [ ] Collect feedback
  - [ ] Fix critical bugs
  - [ ] Deploy to production

- [ ] **Week 2: Kraken Release**
  - [ ] Deploy Kraken adapter to staging
  - [ ] Test with 5 beta users
  - [ ] Monitor tier-based fee calculations
  - [ ] Collect feedback
  - [ ] Fix critical bugs
  - [ ] Deploy to production

- [ ] **Week 3: Fee Comparison Tool**
  - [ ] Deploy fee comparison endpoint
  - [ ] Deploy FeeComparison UI component
  - [ ] Test with all 3 exchanges
  - [ ] Announce feature via email/Twitter
  - [ ] Monitor usage analytics
  - [ ] Track user savings

---

## Success Validation

### Functional Requirements
- [ ] Coinbase Pro adapter passes 90% test coverage
- [ ] Kraken adapter passes 90% test coverage
- [ ] Fee comparison shows accurate real-time fees
- [ ] Users can switch exchanges per trade
- [ ] Order execution latency <2s
- [ ] Geographic restrictions handled gracefully
- [ ] Exchange downtime doesn't break entire platform

### Non-Functional Requirements
- [ ] API response time <500ms for fee comparison
- [ ] All credentials encrypted at rest
- [ ] Rate limiting enforced per exchange
- [ ] Graceful error handling for exchange downtime
- [ ] WebSocket support for live price feeds (stretch goal)

### Business Requirements
- [ ] Attract 20+ new crypto-focused subscribers
- [ ] Average user saves $50+ per trade via fee comparison
- [ ] No customer complaints about exchange compatibility
- [ ] Documentation complete and accurate
- [ ] Admin dashboard tracks exchange usage stats

---

## Asset Support (Initial Launch)

| Asset | Binance | Coinbase Pro | Kraken |
|-------|---------|--------------|--------|
| BTC | ✅ | ✅ | ✅ |
| ETH | ✅ | ✅ | ✅ |
| SOL | ✅ | ✅ | ✅ |
| ADA | ✅ | ✅ | ✅ |
| DOT | ✅ | ✅ | ✅ |
| MATIC | ✅ | ✅ | ✅ |
| LINK | ✅ | ✅ | ✅ |
| UNI | ✅ | ✅ | ✅ |
| AVAX | ✅ | ✅ | ✅ |
| ATOM | ✅ | ✅ | ✅ |

**Total**: 10 major cryptocurrencies at launch, expandable to 50+

---

## ROI Tracking

**Development Cost**: $9,600 (120 hours × $80/hr)
**Expected Revenue**: +$2,400/month from crypto-focused users
**Payback Period**: 4 months

**Metrics to Monitor**:
- New crypto-focused subscribers
- Fee comparison tool usage
- Average savings per trade
- User retention in crypto segment
- Exchange distribution (which exchanges users prefer)
