# Implement Multi-Broker Integrations (P0 - Critical)

## Overview

**Priority**: P0 - Critical
**Timeline**: 4-6 weeks
**Effort**: 160 hours
**Dependencies**: None (can start immediately)

This proposal implements Interactive Brokers (IBKR) and Charles Schwab broker adapters to fulfill the documented "multi-broker support" promise in the Premium subscription tier ($299/month).

---

## Business Justification

### Revenue Impact

**Current State**: Premium tier promises "multi-broker + priority execution" but only Alpaca is supported

**Financial Impact**:
- Premium tier conversion rate: 0% → **Target: 15%**
- Additional revenue: **$4,485/month** (15 premium users × $299)
- Annual recurring revenue: **$53,820**

### Competitive Positioning

**Competitor Analysis**:
- **eToro**: Multi-broker (stocks + crypto)
- **TradingView**: Connects to 50+ brokers
- **3Commas**: Multi-exchange crypto bots
- **Us**: Alpaca-only ❌

**Market Gap**: Serious traders require IBKR for:
- International stocks (100+ countries)
- Options trading
- Futures contracts
- Lower margin rates (1.6% vs Alpaca's 3.75%)

---

## Technical Scope

### Adapters to Implement

#### 1. IBKRAdapter (Interactive Brokers)

**API**: TWS API (Trader Workstation)
**Supported Assets**: Stocks, Options, Futures, Forex, Bonds
**Key Features**:
- Market/limit/stop orders
- Options chains
- Real-time quotes
- Portfolio positions
- Account balance

**Technical Challenges**:
- Complex authentication flow (requires TWS/IB Gateway running)
- Asynchronous message-based API (not REST)
- Rate limiting: 50 messages/second

**npm Package**: `@stoqey/ib` (most maintained wrapper)

#### 2. SchwabAdapter (Charles Schwab)

**API**: Schwab Developer Platform (formerly TD Ameritrade)
**Supported Assets**: Stocks, ETFs, Options, Mutual Funds
**Key Features**:
- Market/limit/stop/stop-limit orders
- Streaming quotes via WebSocket
- Account info + positions
- Historical data

**Technical Challenges**:
- OAuth2 flow (requires refresh token management)
- Transition from TD Ameritrade APIs (August 2024 migration)
- Rate limiting: 120 requests/minute

**npm Package**: Custom HTTP client with `axios` (official SDK not yet available)

---

## Implementation Plan

### Phase 1: IBKR Integration (2-3 weeks)

**Week 1: Setup + Authentication**
```javascript
// src/brokers/adapters/IBKRAdapter.js
class IBKRAdapter extends BrokerAdapter {
  constructor(config) {
    super();
    this.ib = new IBApi({
      clientId: config.clientId,
      host: config.host || '127.0.0.1',
      port: config.port || 4001
    });
  }

  async connect() {
    // Connect to TWS/IB Gateway
    await this.ib.connect();

    // Authenticate
    this.reqId = await this.ib.getNextValidId();

    // Verify connection
    return this.isConnected();
  }

  async getBalance() {
    // Request account summary
    const summary = await this.ib.reqAccountSummary();
    return {
      cash: summary.TotalCashValue,
      equity: summary.NetLiquidation,
      buyingPower: summary.BuyingPower
    };
  }
}
```

**Week 2: Order Execution**
```javascript
async placeOrder(order) {
  const contract = {
    symbol: order.symbol,
    secType: 'STK',
    exchange: 'SMART',
    currency: 'USD'
  };

  const ibOrder = {
    action: order.side.toUpperCase(),
    orderType: this.convertOrderType(order.type),
    totalQuantity: order.quantity,
    lmtPrice: order.limitPrice,
    auxPrice: order.stopPrice
  };

  const orderId = await this.ib.placeOrder(contract, ibOrder);

  return {
    orderId,
    status: 'submitted',
    timestamp: new Date().toISOString()
  };
}
```

**Week 3: Testing + Polish**
- Unit tests (90% coverage target)
- Integration tests with paper trading account
- Error handling + reconnection logic
- Rate limiting implementation

### Phase 2: Schwab Integration (2-3 weeks)

**Week 1: OAuth2 + API Client**
```javascript
// src/brokers/adapters/SchwabAdapter.js
class SchwabAdapter extends BrokerAdapter {
  constructor(config) {
    super();
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.accessToken = null;
    this.refreshToken = config.refreshToken;
    this.baseURL = 'https://api.schwabapi.com/trader/v1';
  }

  async authenticate() {
    // OAuth2 token refresh
    const response = await axios.post(
      'https://api.schwabapi.com/v1/oauth/token',
      {
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken
      },
      {
        auth: { username: this.apiKey, password: this.apiSecret }
      }
    );

    this.accessToken = response.data.access_token;
    return true;
  }

  async getPositions() {
    const response = await this.request('GET', '/accounts/{accountId}/positions');

    return response.data.map(pos => ({
      symbol: pos.instrument.symbol,
      quantity: pos.longQuantity - pos.shortQuantity,
      marketValue: pos.marketValue,
      averageCost: pos.averagePrice
    }));
  }
}
```

**Week 2: Order Management**
```javascript
async placeOrder(order) {
  const schwabOrder = {
    orderType: this.convertOrderType(order.type),
    session: 'NORMAL',
    duration: 'DAY',
    orderStrategyType: 'SINGLE',
    orderLegCollection: [{
      instruction: order.side === 'buy' ? 'BUY' : 'SELL',
      quantity: order.quantity,
      instrument: {
        symbol: order.symbol,
        assetType: 'EQUITY'
      }
    }],
    price: order.limitPrice,
    stopPrice: order.stopPrice
  };

  const response = await this.request('POST', `/accounts/{accountId}/orders`, schwabOrder);

  return {
    orderId: response.headers['location'].split('/').pop(),
    status: 'placed',
    timestamp: new Date().toISOString()
  };
}
```

**Week 3: Testing + Polish**
- Unit tests (90% coverage)
- Paper trading validation
- OAuth refresh token persistence
- Error handling

### Phase 3: UI Integration (1 week)

**Broker Selection Wizard**
```jsx
// src/dashboard/components/BrokerSetup.jsx
const BrokerSetup = () => {
  const [selectedBroker, setSelectedBroker] = useState(null);

  const brokers = [
    { id: 'alpaca', name: 'Alpaca', logo: '/alpaca.png', features: ['Stocks', 'ETFs', 'Crypto'] },
    { id: 'ibkr', name: 'Interactive Brokers', logo: '/ibkr.png', features: ['Stocks', 'Options', 'Futures', 'International'], badge: 'Premium' },
    { id: 'schwab', name: 'Charles Schwab', logo: '/schwab.png', features: ['Stocks', 'Options', 'Mutual Funds'], badge: 'Premium' }
  ];

  return (
    <div className="broker-wizard">
      <h2>Connect Your Broker</h2>

      <div className="broker-grid">
        {brokers.map(broker => (
          <BrokerCard
            key={broker.id}
            broker={broker}
            selected={selectedBroker === broker.id}
            onSelect={() => setSelectedBroker(broker.id)}
          />
        ))}
      </div>

      {selectedBroker && (
        <BrokerConnectionForm broker={selectedBroker} />
      )}
    </div>
  );
};
```

**Connection Testing**
```jsx
const testConnection = async (broker, credentials) => {
  try {
    const response = await axios.post(`/api/brokers/${broker}/test`, credentials);

    if (response.data.success) {
      toast.success(`Connected to ${broker}!`);
      return true;
    }
  } catch (error) {
    toast.error(`Connection failed: ${error.message}`);
    return false;
  }
};
```

---

## Data Model Updates

### User Model Extension

```javascript
// src/models/User.js - Add broker connections
const UserSchema = new mongoose.Schema({
  // ... existing fields

  brokerConnections: [{
    broker: {
      type: String,
      enum: ['alpaca', 'ibkr', 'schwab'],
      required: true
    },
    accountId: {
      type: String,
      required: true,
      encrypted: true
    },
    credentials: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      encrypted: true
    },
    isPaperTrading: {
      type: Boolean,
      default: false
    },
    isActive: {
      type: Boolean,
      default: true
    },
    connectedAt: {
      type: Date,
      default: Date.now
    },
    lastSyncAt: Date,
    status: {
      type: String,
      enum: ['connected', 'disconnected', 'error'],
      default: 'connected'
    }
  }],

  primaryBroker: {
    type: String,
    enum: ['alpaca', 'ibkr', 'schwab']
  }
});
```

---

## API Endpoints

### New Routes

```javascript
// src/routes/api/brokers.js

// Test broker connection
router.post('/brokers/:broker/test', requireAuth, async (req, res) => {
  const { broker } = req.params;
  const credentials = req.body;

  try {
    const adapter = BrokerFactory.create(broker, credentials);
    await adapter.connect();

    const balance = await adapter.getBalance();

    res.json({
      success: true,
      broker,
      balance
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Save broker connection
router.post('/brokers/:broker/connect', requireAuth, async (req, res) => {
  const { broker } = req.params;
  const credentials = req.body;

  // Test connection first
  const adapter = BrokerFactory.create(broker, credentials);
  await adapter.connect();

  // Save to database
  req.user.brokerConnections.push({
    broker,
    accountId: credentials.accountId,
    credentials,
    isPaperTrading: credentials.isPaperTrading || false
  });

  await req.user.save();

  res.json({
    success: true,
    broker,
    connectionId: req.user.brokerConnections[req.user.brokerConnections.length - 1]._id
  });
});

// Get broker comparison
router.get('/brokers/compare', async (req, res) => {
  const comparison = {
    alpaca: {
      fees: { commission: '$0', marginRate: '3.75%' },
      assets: ['Stocks', 'ETFs', 'Crypto'],
      minDeposit: '$0',
      rating: 4.2
    },
    ibkr: {
      fees: { commission: '$0.0035/share (min $0.35)', marginRate: '1.6%' },
      assets: ['Stocks', 'Options', 'Futures', 'Forex', 'Bonds'],
      minDeposit: '$0',
      rating: 4.8
    },
    schwab: {
      fees: { commission: '$0', marginRate: '7.25%' },
      assets: ['Stocks', 'Options', 'Mutual Funds'],
      minDeposit: '$0',
      rating: 4.6
    }
  };

  res.json(comparison);
});
```

---

## Testing Strategy

### Unit Tests (90% Coverage)

```javascript
// src/brokers/adapters/__tests__/IBKRAdapter.test.js
describe('IBKRAdapter', () => {
  let adapter;

  beforeEach(() => {
    adapter = new IBKRAdapter({
      clientId: 1,
      host: '127.0.0.1',
      port: 4001
    });
  });

  describe('connect()', () => {
    it('should connect to TWS successfully', async () => {
      // Mock IB API connection
      const connected = await adapter.connect();
      expect(connected).toBe(true);
    });

    it('should handle connection errors gracefully', async () => {
      // Mock connection failure
      await expect(adapter.connect()).rejects.toThrow('Connection failed');
    });
  });

  describe('placeOrder()', () => {
    it('should place market order', async () => {
      const order = {
        symbol: 'AAPL',
        side: 'buy',
        type: 'market',
        quantity: 10
      };

      const result = await adapter.placeOrder(order);

      expect(result).toHaveProperty('orderId');
      expect(result.status).toBe('submitted');
    });

    it('should place limit order with price', async () => {
      const order = {
        symbol: 'TSLA',
        side: 'sell',
        type: 'limit',
        quantity: 5,
        limitPrice: 250.00
      };

      const result = await adapter.placeOrder(order);
      expect(result).toHaveProperty('orderId');
    });
  });

  describe('getBalance()', () => {
    it('should retrieve account balance', async () => {
      const balance = await adapter.getBalance();

      expect(balance).toHaveProperty('cash');
      expect(balance).toHaveProperty('equity');
      expect(balance).toHaveProperty('buyingPower');
    });
  });
});
```

### Integration Tests

```javascript
// tests/integration/brokers/ibkr.test.js
describe('IBKR Integration Tests', () => {
  it('should execute full trade lifecycle', async () => {
    // Connect to paper trading
    const adapter = new IBKRAdapter(paperTradingConfig);
    await adapter.connect();

    // Place order
    const order = await adapter.placeOrder({
      symbol: 'SPY',
      side: 'buy',
      type: 'market',
      quantity: 1
    });

    expect(order.status).toBe('submitted');

    // Wait for fill
    await waitForOrderFill(order.orderId, 10000);

    // Verify position
    const positions = await adapter.getPositions();
    const spyPosition = positions.find(p => p.symbol === 'SPY');

    expect(spyPosition).toBeDefined();
    expect(spyPosition.quantity).toBe(1);
  });
});
```

---

## Security Considerations

### Credential Encryption

All broker credentials MUST be encrypted at rest:

```javascript
// src/middleware/encryption.js
const encryptBrokerCredentials = (credentials) => {
  const algorithm = 'aes-256-gcm';
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(JSON.stringify(credentials), 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
};
```

### Rate Limiting

Enforce broker-specific rate limits:

```javascript
// src/middleware/rateLimiter.js
const brokerRateLimits = {
  ibkr: { maxRequests: 50, windowMs: 1000 },  // 50/second
  schwab: { maxRequests: 120, windowMs: 60000 }, // 120/minute
  alpaca: { maxRequests: 200, windowMs: 60000 }  // 200/minute
};

const brokerLimiter = (broker) => {
  const limit = brokerRateLimits[broker];

  return rateLimit({
    windowMs: limit.windowMs,
    max: limit.maxRequests,
    message: `Rate limit exceeded for ${broker}`
  });
};
```

---

## Success Criteria

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

---

## Documentation Updates

### Files to Update

1. **openspec/project.md** - Update broker adapter list:
```diff
- Implementations: AlpacaAdapter, plus future TD Ameritrade, Interactive Brokers
+ Implementations: AlpacaAdapter, IBKRAdapter, SchwabAdapter
```

2. **README.md** - Add broker setup instructions

3. **docs/BROKER-SETUP.md** (new file) - Per-broker connection guides

---

## Risks & Mitigations

### Risk 1: IBKR TWS Requirement 🔴

**Risk**: Users must run TWS/IB Gateway locally (adds complexity)

**Mitigation**:
- Provide one-click Docker image with TWS
- Clear setup documentation with screenshots
- Support both paper + live trading modes

### Risk 2: Schwab API Transition 🟡

**Risk**: TD Ameritrade → Schwab migration still in progress

**Mitigation**:
- Monitor Schwab API updates closely
- Build with fallback to legacy TD endpoints
- Test frequently during transition period

### Risk 3: Rate Limit Violations 🟡

**Risk**: Hitting broker rate limits during high volume

**Mitigation**:
- Implement request queuing
- Add caching for non-time-sensitive data (positions, balance)
- Monitor rate limit usage in real-time

---

## Rollout Plan

### Phase 1: Internal Testing (Week 1)

- Deploy to staging environment
- Test with paper trading accounts
- Validate all order types
- Stress test rate limiting

### Phase 2: Beta Release (Week 2)

- Invite 10 premium users
- Monitor error rates closely
- Collect feedback
- Fix critical bugs

### Phase 3: General Availability (Week 3)

- Launch to all premium subscribers
- Marketing announcement (Twitter, email)
- Update landing page with broker logos
- Monitor conversion rates

---

## Estimated Cost

### Development

- Senior Backend Engineer: 120 hours × $100/hr = **$12,000**
- Frontend Engineer: 40 hours × $80/hr = **$3,200**
- QA Engineer: 20 hours × $60/hr = **$1,200**

**Total Development Cost**: **$16,400**

### External Services

- IBKR Paper Trading Account: **Free**
- Schwab Developer Account: **Free**
- Monitoring (DataDog): **$50/month**

### ROI

- First year revenue (15 premium users × $299 × 12): **$53,820**
- Development cost: **$16,400**
- **Net profit Year 1**: **$37,420**
- **ROI**: **228%**

---

**Document Status**: 🚀 Ready for Implementation
**Next Action**: Await approval → Begin Phase 1 (IBKR Integration)
