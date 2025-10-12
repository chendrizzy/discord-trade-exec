# Phase 2 Implementation Plan

## Overview
Phase 2 transforms the bot from a simple signal executor into a professional trading platform with customizable risk management and multi-provider support.

**Revenue Target**: $5k → $20k/month (40+ users)

---

## 🎯 Core Features

### 1. Risk Management Dashboard (+$6k-15k/month)
**User Value**: "I want MY risk settings, not defaults"

#### 1.1 Web Dashboard Structure
**Tech Stack**:
- Frontend: React + Tailwind CSS
- Backend: Express.js (already installed)
- Auth: Discord OAuth2
- Database: Existing MongoDB

**Routes**:
```
/dashboard              → Main dashboard (requires auth)
/dashboard/risk         → Risk management settings
/dashboard/exchanges    → Exchange API key management
/dashboard/analytics    → Performance analytics
/auth/discord           → OAuth2 login
/auth/discord/callback  → OAuth2 callback
/auth/logout            → Logout
```

#### 1.2 Risk Configuration Features
```javascript
// User-configurable settings
{
  positionSizing: {
    mode: 'percentage' | 'fixed' | 'kelly',
    percentage: 0.5-10,      // % of portfolio
    fixedAmount: 0-10000,    // Fixed $ amount
    maxPositionSize: 1000    // Hard cap
  },
  stopLoss: {
    defaultPercentage: 1-10,
    trailingStop: true/false,
    breakEvenTrigger: 2      // Move SL to BE at 2% profit
  },
  maxDailyLoss: {
    percentage: 1-10,
    amount: 100-5000,
    pauseTrading: true/false  // Auto-pause if hit
  },
  perExchange: {
    binance: { maxPositions: 3, maxDailyLoss: 5% },
    coinbase: { maxPositions: 2, maxDailyLoss: 3% }
  }
}
```

#### 1.3 Position Size Calculator
Real-time calculator showing:
- Account balance → Position size → Risk amount
- Stop loss distance → R:R ratio
- Maximum positions with current settings
- Portfolio heat map

---

### 2. Multi-Signal Provider Support (+$3k-8k/month)
**User Value**: "I follow 5 different signal providers"

#### 2.1 Provider Management
```javascript
// Signal Provider Schema (new model)
{
  userId: ObjectId,           // Owner
  name: 'AlphaSignals',
  source: 'discord' | 'telegram' | 'tradingview',
  discordChannelId: '...',    // For Discord providers
  enabled: true,

  // Performance tracking
  stats: {
    totalSignals: 150,
    successfulTrades: 98,
    winRate: 65.3,
    averageROI: 2.3,
    profitFactor: 1.85,
    lastSignalAt: Date
  },

  // Auto-disable logic
  autoDisable: {
    enabled: true,
    minWinRate: 55,
    minProfitFactor: 1.2,
    evaluationPeriod: 30      // days
  },

  // Signal filtering
  filters: {
    minConfidence: 7,
    symbols: ['BTC', 'ETH'],  // null = all
    exchanges: ['binance']
  }
}
```

#### 2.2 Signal Conflict Resolution
When multiple providers signal simultaneously:
```javascript
// Conflict resolution strategies
{
  strategy: 'highest-confidence' | 'majority-vote' | 'best-performer' | 'skip',

  // If BUY and SELL conflict:
  oppositeSignalBehavior: 'skip' | 'close-position' | 'follow-best-performer'
}
```

#### 2.3 Provider Leaderboard
Real-time leaderboard showing:
- Win rate (last 30/90 days)
- Profit factor
- Total signals
- Average hold time
- Best/worst trades
- Sharpe ratio

---

### 3. Security Enhancements

#### 3.1 Exchange API Key Encryption
```javascript
// Encryption strategy
const crypto = require('crypto');

// Encrypt before storing
function encryptApiKey(key) {
  const algorithm = 'aes-256-gcm';
  const secret = process.env.ENCRYPTION_KEY;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, secret, iv);

  let encrypted = cipher.update(key, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return {
    encrypted: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

// Decrypt when needed
function decryptApiKey(encrypted, iv, authTag) {
  const algorithm = 'aes-256-gcm';
  const secret = process.env.ENCRYPTION_KEY;
  const decipher = crypto.createDecipheriv(
    algorithm,
    secret,
    Buffer.from(iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
```

**Database Schema Update**:
```javascript
// User.tradingConfig.exchanges
{
  binance: {
    enabled: true,
    apiKey: {
      encrypted: '...',
      iv: '...',
      authTag: '...'
    },
    apiSecret: {
      encrypted: '...',
      iv: '...',
      authTag: '...'
    },
    permissions: ['read', 'trade'],  // Validate on connection
    testnet: false
  }
}
```

#### 3.2 Rate Limiting
```javascript
const rateLimit = require('express-rate-limit');

// Webhook endpoints
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,     // 1 minute
  max: 100,                 // 100 requests per minute
  message: 'Too many webhook requests'
});

// Dashboard API
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,                  // 100 requests per 15min
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/webhook', webhookLimiter);
app.use('/api', apiLimiter);
```

#### 3.3 API Key Permission Validation
```javascript
// Validate exchange API keys before saving
async function validateExchangeApiKey(exchange, apiKey, apiSecret) {
  const ccxt = require('ccxt');

  try {
    const exchangeInstance = new ccxt[exchange]({
      apiKey: apiKey,
      secret: apiSecret,
      sandbox: true  // Test on sandbox first
    });

    // Fetch account info to verify credentials
    const balance = await exchangeInstance.fetchBalance();

    // Check permissions
    const permissions = await exchangeInstance.fetchPermissions();

    // Ensure it has trading permission but NOT withdrawal
    if (!permissions.includes('trade')) {
      throw new Error('API key missing trading permission');
    }
    if (permissions.includes('withdraw')) {
      throw new Error('API key has withdrawal permission (security risk)');
    }

    return {
      valid: true,
      permissions: permissions,
      balance: balance.total
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message
    };
  }
}
```

---

## 📁 File Structure (New Files)

```
src/
├── dashboard/
│   ├── app.jsx              # React main app
│   ├── components/
│   │   ├── RiskSettings.jsx
│   │   ├── ProviderManager.jsx
│   │   ├── Analytics.jsx
│   │   └── ExchangeKeys.jsx
│   └── styles/
│       └── dashboard.css
│
├── routes/
│   ├── dashboard.js         # Dashboard routes
│   ├── auth.js              # OAuth2 routes
│   └── api/
│       ├── risk.js          # Risk settings API
│       ├── providers.js     # Provider management API
│       └── exchanges.js     # Exchange API management
│
├── models/
│   └── SignalProvider.js    # New model
│
├── middleware/
│   ├── auth.js              # Authentication middleware
│   ├── rateLimiter.js       # Rate limiting
│   └── encryption.js        # Encryption utilities
│
└── utils/
    ├── positionCalculator.js # Position sizing logic
    ├── riskManager.js        # Dynamic risk management
    └── providerScoring.js    # Provider performance scoring
```

---

## 🗄️ Database Schema Updates

### User Model Additions
```javascript
// Add to existing User schema
{
  // New fields
  dashboardSettings: {
    theme: 'light' | 'dark',
    notifications: {
      email: true,
      discord: true,
      tradeExecution: true,
      dailySummary: true
    },
    timezone: 'America/New_York'
  },

  // Update tradingConfig
  tradingConfig: {
    // ... existing fields ...

    // NEW: Dynamic risk management
    riskManagement: {
      positionSizing: {
        mode: 'percentage',
        percentage: 2,
        fixedAmount: null,
        maxPositionSize: 1000
      },
      stopLoss: {
        defaultPercentage: 2,
        trailingStop: false,
        breakEvenTrigger: 3
      },
      maxDailyLoss: {
        percentage: 5,
        amount: 500,
        pauseTrading: true,
        currentDailyLoss: 0,
        lastResetDate: Date
      },
      perExchange: {
        binance: {
          maxPositions: 3,
          maxDailyLoss: 5,
          currentPositions: 0
        }
      }
    }
  },

  // Track active signal providers
  signalProviders: [
    {
      providerId: ObjectId,
      priority: 1-10,
      enabled: true
    }
  ]
}
```

---

## 🔨 Implementation Phases

### Phase 2.1: Dashboard Foundation (Week 1)
**Goal**: Basic dashboard with authentication

**Tasks**:
1. Set up Discord OAuth2
2. Create Express routes for dashboard
3. Build React app structure
4. Implement authentication middleware
5. Create basic dashboard layout

**Deliverable**: Users can log in and see dashboard skeleton

---

### Phase 2.2: Risk Management (Week 2)
**Goal**: Fully configurable risk settings

**Tasks**:
1. Build risk settings UI
2. Create risk calculation utilities
3. Update trade executor to use dynamic risk
4. Add position size calculator
5. Implement daily loss tracking

**Deliverable**: Users can configure and test risk settings

---

### Phase 2.3: Signal Provider System (Week 3)
**Goal**: Multi-provider support with performance tracking

**Tasks**:
1. Create SignalProvider model
2. Build provider management UI
3. Implement performance tracking
4. Add conflict resolution logic
5. Create provider leaderboard

**Deliverable**: Users can add/manage multiple signal providers

---

### Phase 2.4: Security Hardening (Week 4)
**Goal**: Enterprise-grade security

**Tasks**:
1. Implement API key encryption
2. Add rate limiting
3. Add API permission validation
4. Security audit
5. Penetration testing

**Deliverable**: Production-ready security

---

## 📊 Success Metrics

### Technical Metrics
- Dashboard load time < 1s
- API response time < 200ms
- Zero API key leaks
- 99.9% uptime

### Business Metrics
- 40+ paying users ($49-299/month)
- $20k+ MRR
- <5% monthly churn
- 4.5+ star rating

### User Engagement
- 80%+ users configure risk settings
- 60%+ users add 2+ signal providers
- 90%+ users check dashboard weekly
- 50%+ users upgrade to Pro/Premium

---

## 🚀 Quick Start (Development)

```bash
# Install new dependencies
npm install react react-dom passport passport-discord express-rate-limit

# Generate encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Add to .env
ENCRYPTION_KEY=<generated_key>
DISCORD_CLIENT_ID=<your_client_id>
DISCORD_CLIENT_SECRET=<your_client_secret>
DASHBOARD_URL=http://localhost:3000

# Start development
npm run dev  # Will start both backend and React dev server
```

---

## 💰 Pricing Impact

### New Premium Features
**Pro Plan ($99/month)** - Add:
- ✅ Customizable risk management
- ✅ Up to 5 signal providers
- ✅ Advanced analytics
- ✅ Provider performance tracking

**Premium Plan ($299/month)** - Add:
- ✅ Unlimited signal providers
- ✅ White-label dashboards (future)
- ✅ API access for custom integrations
- ✅ Dedicated account manager

---

## 🔧 Technical Decisions

### Why React for Dashboard?
- Fast development with component reuse
- Rich ecosystem (charts, forms, etc.)
- Easy to build interactive calculators
- Can deploy as SPA or SSR

### Why Discord OAuth2?
- Users already have Discord accounts
- No email verification needed
- Seamless UX (one-click login)
- Links directly to Discord ID

### Why AES-256-GCM for Encryption?
- Industry standard
- Authenticated encryption (prevents tampering)
- Fast performance
- Built into Node.js crypto

---

## 🎓 Learning Resources

### For Developers
- Discord OAuth2: https://discord.com/developers/docs/topics/oauth2
- React Dashboard: https://reactjs.org/docs/getting-started.html
- CCXT Exchange APIs: https://docs.ccxt.com/
- Encryption Best Practices: https://www.npmjs.com/package/crypto

### For Testing
- Use Binance testnet: https://testnet.binance.vision/
- Stripe test mode: Use test keys
- Create test signal providers with known outcomes

---

## ✅ Phase 2 Completion Criteria

- [ ] Dashboard accessible via Discord OAuth2
- [ ] Risk settings fully configurable
- [ ] Position calculator shows accurate calculations
- [ ] Multiple signal providers can be added
- [ ] Provider performance tracked accurately
- [ ] Conflict resolution works as expected
- [ ] API keys encrypted at rest
- [ ] Rate limiting prevents abuse
- [ ] API permissions validated on save
- [ ] All security tests pass
- [ ] 40+ beta users recruited
- [ ] $20k+ MRR achieved

---

Generated: 2025-10-06
Status: Phase 2 Planning Complete, Ready to Implement
Next: Dashboard Foundation (Week 1)
