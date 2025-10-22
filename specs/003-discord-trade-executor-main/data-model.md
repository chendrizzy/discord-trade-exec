# Data Model

**Feature**: 003-discord-trade-executor-main  
**Phase**: Phase 1 - Design Artifacts  
**Date**: 2025-10-22  
**Status**: COMPLETE

---

## Overview

This document defines the 6 core entities for the Discord Trade Executor SaaS platform using MongoDB document model with Mongoose schemas. All entities include validation rules, indexes, relationships, and state transitions required by the specification.

**Database**: MongoDB Atlas 8.0.4+  
**ODM**: Mongoose 8.0.4  
**Encryption**: AES-256-GCM for sensitive fields (broker credentials)

---

## Entity: User

**Purpose**: Represents authenticated users with subscription and Discord identity.

### Schema

```javascript
const UserSchema = new mongoose.Schema({
  id: {
    type: String,
    default: () => uuidv4(),
    required: true,
    unique: true,
    index: true
  },
  discordId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    validate: {
      validator: (v) => /^\d{17,19}$/.test(v),
      message: 'Discord ID must be 17-19 digits'
    }
  },
  email: {
    type: String,
    sparse: true,
    unique: true,
    lowercase: true,
    validate: {
      validator: (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      message: 'Invalid email format'
    }
  },
  passwordHash: {
    type: String,
    select: false  // Never include in queries by default
  },
  subscriptionTier: {
    type: String,
    enum: ['Free', 'Basic', 'Pro', 'Premium'],
    default: 'Free',
    required: true
  },
  subscriptionStatus: {
    type: String,
    enum: ['active', 'past_due', 'cancelled', 'trial'],
    default: 'active',
    required: true
  },
  subscriptionRenewalDate: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true
  },
  lastLoginAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: false,
  collection: 'users'
});
```

### Indexes

```javascript
UserSchema.index({ discordId: 1 }, { unique: true });
UserSchema.index({ email: 1 }, { unique: true, sparse: true });
UserSchema.index({ subscriptionRenewalDate: 1 });  // For billing reminders
UserSchema.index({ subscriptionTier: 1, subscriptionStatus: 1 });  // For analytics
```

### Validation Rules

- `discordId`: Required, unique, 17-19 digits (Discord snowflake format)
- `email`: Optional (for fallback auth), unique if present, valid email format
- `subscriptionTier`: One of Free/Basic/Pro/Premium
- `subscriptionStatus`: One of active/past_due/cancelled/trial
- `passwordHash`: Only set if email/password auth used (bcrypt, never exposed)

### Relationships

- One-to-Many → `BrokerConnection` (via `userId`)
- One-to-Many → `Trade` (via `userId`)
- One-to-Many → `Position` (via `userId`)
- One-to-One → `Subscription` (via `userId`)
- One-to-Many → `AuditLog` (via `userId`)

---

## Entity: BrokerConnection

**Purpose**: Stores encrypted broker API credentials and connection health status.

### Schema

```javascript
const BrokerConnectionSchema = new mongoose.Schema({
  id: {
    type: String,
    default: () => uuidv4(),
    required: true,
    unique: true
  },
  userId: {
    type: String,
    ref: 'User',
    required: true,
    index: true
  },
  brokerType: {
    type: String,
    enum: ['alpaca', 'ibkr', 'schwab', 'coinbase', 'kraken', 'binance'],
    required: true
  },
  credentials: {
    type: Object,
    required: true,
    // Stored encrypted via AES-256-GCM
    // Structure varies by broker: {apiKey, apiSecret} or {accessToken, refreshToken}
    select: false  // Never include in queries by default
  },
  isActive: {
    type: Boolean,
    default: true,
    required: true
  },
  lastHealthCheck: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true
  }
}, {
  timestamps: false,
  collection: 'broker_connections'
});
```

### Indexes

```javascript
BrokerConnectionSchema.index({ userId: 1, brokerType: 1 });
BrokerConnectionSchema.index({ isActive: 1 });
BrokerConnectionSchema.index({ lastHealthCheck: 1 });  // For stale connection cleanup
```

### Validation Rules

- `userId`: Required, references User.id
- `brokerType`: One of alpaca/ibkr/schwab/coinbase/kraken/binance
- `credentials`: Encrypted JSON object (never stored plaintext)
- `isActive`: Boolean flag for soft-delete

### Encryption

Credentials encrypted at rest using AES-256-GCM:

```javascript
const encryptedCredentials = encrypt(
  JSON.stringify({apiKey, apiSecret}),
  masterKey,
  userId  // Salt for user-specific keys
);
```

### Relationships

- Many-to-One → `User` (via `userId`)
- One-to-Many → `Trade` (via `brokerConnectionId`)
- One-to-Many → `Position` (via `brokerConnectionId`)

---

## Entity: Trade

**Purpose**: Records all trade execution attempts with status tracking and audit trail.

### Schema

```javascript
const TradeSchema = new mongoose.Schema({
  id: {
    type: String,
    default: () => uuidv4(),
    required: true,
    unique: true
  },
  userId: {
    type: String,
    ref: 'User',
    required: true,
    index: true
  },
  brokerConnectionId: {
    type: String,
    ref: 'BrokerConnection',
    required: true
  },
  symbol: {
    type: String,
    required: true,
    uppercase: true,
    validate: {
      validator: (v) => /^[A-Z]{1,10}$/.test(v),
      message: 'Symbol must be 1-10 uppercase letters'
    }
  },
  quantity: {
    type: mongoose.Decimal128,
    required: true,
    validate: {
      validator: (v) => parseFloat(v.toString()) > 0,
      message: 'Quantity must be positive'
    }
  },
  orderType: {
    type: String,
    enum: ['market', 'limit', 'stop_loss', 'stop_limit', 'trailing_stop'],
    required: true
  },
  side: {
    type: String,
    enum: ['buy', 'sell'],
    required: true
  },
  limitPrice: {
    type: mongoose.Decimal128,
    default: null
  },
  stopPrice: {
    type: mongoose.Decimal128,
    default: null
  },
  status: {
    type: String,
    enum: ['pending', 'submitted', 'filled', 'partial_fill', 'rejected', 'cancelled'],
    default: 'pending',
    required: true,
    index: true
  },
  submittedAt: {
    type: Date,
    default: null
  },
  filledAt: {
    type: Date,
    default: null
  },
  fillPrice: {
    type: mongoose.Decimal128,
    default: null
  },
  brokerOrderId: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },
  errorMessage: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true
  }
}, {
  timestamps: false,
  collection: 'trades'
});
```

### Indexes

```javascript
TradeSchema.index({ userId: 1, submittedAt: -1 });  // User trade history
TradeSchema.index({ status: 1, submittedAt: -1 });  // Pending orders dashboard
TradeSchema.index({ brokerOrderId: 1 }, { unique: true, sparse: true });  // Webhook lookups
TradeSchema.index({ symbol: 1, submittedAt: -1 });  // Symbol-specific queries
```

### Validation Rules

- `symbol`: 1-10 uppercase letters (stock tickers or crypto pairs)
- `quantity`: Positive decimal (supports fractional shares/crypto)
- `orderType`: One of market/limit/stop_loss/stop_limit/trailing_stop
- `side`: buy or sell
- `limitPrice`: Required if orderType is limit or stop_limit
- `stopPrice`: Required if orderType is stop_loss, stop_limit, or trailing_stop

### State Transitions

```
pending → submitted → filled
pending → submitted → partial_fill → filled
pending → submitted → rejected
pending → submitted → cancelled
pending → rejected (failed risk validation)
```

### Relationships

- Many-to-One → `User` (via `userId`)
- Many-to-One → `BrokerConnection` (via `brokerConnectionId`)

---

## Entity: Position

**Purpose**: Tracks open positions with real-time P&L and stop-loss automation.

### Schema

```javascript
const PositionSchema = new mongoose.Schema({
  id: {
    type: String,
    default: () => uuidv4(),
    required: true,
    unique: true
  },
  userId: {
    type: String,
    ref: 'User',
    required: true,
    index: true
  },
  brokerConnectionId: {
    type: String,
    ref: 'BrokerConnection',
    required: true
  },
  symbol: {
    type: String,
    required: true,
    uppercase: true
  },
  quantity: {
    type: mongoose.Decimal128,
    required: true
  },
  averageEntryPrice: {
    type: mongoose.Decimal128,
    required: true
  },
  currentPrice: {
    type: mongoose.Decimal128,
    required: true
  },
  unrealizedPnL: {
    type: mongoose.Decimal128,
    default: 0
    // Calculated: (currentPrice - averageEntryPrice) * quantity
  },
  stopLossPrice: {
    type: mongoose.Decimal128,
    default: null
  },
  openedAt: {
    type: Date,
    default: Date.now,
    immutable: true
  },
  closedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: false,
  collection: 'positions'
});
```

### Indexes

```javascript
PositionSchema.index({ userId: 1, symbol: 1 }, { unique: true });  // One position per user+symbol
PositionSchema.index({ closedAt: 1 });  // Filter active positions (closedAt: null)
PositionSchema.index({ userId: 1, closedAt: 1 });  // User's active positions
```

### Validation Rules

- `symbol`: Uppercase ticker
- `quantity`: Positive decimal
- `averageEntryPrice`: Cost basis per share/coin
- `currentPrice`: Updated via WebSocket market data
- `unrealizedPnL`: Calculated field, updated on price changes

### Calculated Fields

```javascript
PositionSchema.virtual('realizedPnL').get(function() {
  if (!this.closedAt) return 0;
  return (this.currentPrice - this.averageEntryPrice) * parseFloat(this.quantity.toString());
});
```

### Relationships

- Many-to-One → `User` (via `userId`)
- Many-to-One → `BrokerConnection` (via `brokerConnectionId`)

---

## Entity: AuditLog

**Purpose**: Immutable append-only log with cryptographic integrity for compliance.

### Schema

```javascript
const AuditLogSchema = new mongoose.Schema({
  id: {
    type: String,
    default: () => uuidv4(),
    required: true,
    unique: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    immutable: true,
    index: true
  },
  userId: {
    type: String,
    ref: 'User',
    required: true,
    index: true
  },
  action: {
    type: String,
    enum: [
      'TRADE_EXECUTED', 'ORDER_CANCELLED', 'LOGIN_SUCCESS', 'LOGIN_FAILED',
      'PASSWORD_CHANGED', 'CREDENTIALS_UPDATED', 'SESSION_HIJACK_DETECTED',
      'UNAUTHORIZED_ACCESS_ATTEMPT', 'FUNDS_DEPOSITED', 'FUNDS_WITHDRAWN',
      'SUBSCRIPTION_CHARGED', 'SUBSCRIPTION_CANCELLED'
    ],
    required: true,
    index: true
  },
  resourceType: {
    type: String,
    required: true
  },
  resourceId: {
    type: String,
    required: true
  },
  ipAddress: {
    type: String,
    required: true,
    validate: {
      validator: (v) => /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$|^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/.test(v),
      message: 'Invalid IP address format'
    }
  },
  userAgent: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['success', 'failure'],
    required: true
  },
  errorMessage: {
    type: String,
    default: null
  },
  previousHash: {
    type: String,
    default: null,
    immutable: true
  },
  currentHash: {
    type: String,
    required: true,
    immutable: true
  }
}, {
  timestamps: false,
  collection: 'audit_logs'
});
```

### Indexes

```javascript
AuditLogSchema.index({ timestamp: -1 });  // Recent logs first
AuditLogSchema.index({ userId: 1, timestamp: -1 });  // User audit trail
AuditLogSchema.index({ action: 1, timestamp: -1 });  // Filter by action type
AuditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 220752000 });  // TTL 7 years
```

### Validation Rules

- `action`: One of predefined security/financial events
- `ipAddress`: Valid IPv4 or IPv6
- `status`: success or failure
- `previousHash`: SHA-256 hash of previous log entry (blockchain-style chaining)
- `currentHash`: SHA-256 hash of this entry (timestamp + userId + action + resourceId)

### Cryptographic Integrity

```javascript
function calculateHash(entry) {
  const data = `${entry.timestamp}|${entry.userId}|${entry.action}|${entry.resourceId}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

// On insert
const previousEntry = await AuditLog.findOne().sort({ timestamp: -1 });
const currentHash = calculateHash(newEntry);
newEntry.previousHash = previousEntry ? previousEntry.currentHash : null;
newEntry.currentHash = currentHash;
```

### Immutability

MongoDB RBAC prevents DELETE/UPDATE operations:

```javascript
// MongoDB role configuration (admin only)
db.grantRolesToUser("appUser", [
  { role: "readWrite", db: "tradeexec" }
]);

// Deny audit log modifications
db.revokePrivilegesFromRole("readWrite", [
  { resource: { db: "tradeexec", collection: "audit_logs" }, actions: ["update", "remove"] }
]);
```

### Relationships

- Many-to-One → `User` (via `userId`)

---

## Entity: Subscription

**Purpose**: Manages billing subscriptions with provider abstraction (Polar.sh/Stripe).

### Schema

```javascript
const SubscriptionSchema = new mongoose.Schema({
  id: {
    type: String,
    default: () => uuidv4(),
    required: true,
    unique: true
  },
  userId: {
    type: String,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  plan: {
    type: String,
    enum: ['Free', 'Basic', 'Pro', 'Premium'],
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'past_due', 'cancelled', 'trial'],
    required: true
  },
  billingProvider: {
    type: String,
    enum: ['polar', 'stripe'],
    required: true
  },
  billingProviderCustomerId: {
    type: String,
    required: true
  },
  billingProviderSubscriptionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  currentPeriodStart: {
    type: Date,
    required: true
  },
  currentPeriodEnd: {
    type: Date,
    required: true,
    index: true
  },
  cancelledAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true
  }
}, {
  timestamps: false,
  collection: 'subscriptions'
});
```

### Indexes

```javascript
SubscriptionSchema.index({ userId: 1 }, { unique: true });  // One subscription per user
SubscriptionSchema.index({ billingProviderSubscriptionId: 1 }, { unique: true });
SubscriptionSchema.index({ currentPeriodEnd: 1 });  // Renewal processing
SubscriptionSchema.index({ status: 1, currentPeriodEnd: 1 });  // Active subscriptions expiring soon
```

### Validation Rules

- `plan`: One of Free/Basic/Pro/Premium
- `status`: One of active/past_due/cancelled/trial
- `billingProvider`: polar or stripe
- `billingProviderCustomerId`: External ID from Polar.sh/Stripe
- `billingProviderSubscriptionId`: External subscription ID (unique across providers)

### State Transitions

```
trial → active (payment successful)
active → past_due (payment failed, grace period)
past_due → active (retry successful)
past_due → cancelled (grace period expired)
active → cancelled (user initiated)
cancelled → active (user reactivates)
```

### Relationships

- One-to-One → `User` (via `userId`)

---

## Entity Relationships Diagram

```
User (1) ----< (M) BrokerConnection
  |
  +----< (M) Trade
  |
  +----< (M) Position
  |
  +----< (M) AuditLog
  |
  +----> (1) Subscription

BrokerConnection (1) ----< (M) Trade
                    |
                    +----< (M) Position
```

---

## Migration Strategy

1. **Initial Setup**: Create collections with indexes via Mongoose schema sync
2. **Seed Data**: Development seed script creates test users, broker connections, paper trades
3. **Production Migration**: Use `scripts/db/migrate.js` for schema changes (add fields, indexes)
4. **Backward Compatibility**: New fields added with defaults, never remove fields (soft-delete only)

---

## Performance Considerations

### Query Optimization

- **User Trade History**: Index on `(userId, submittedAt DESC)` enables fast pagination
- **Active Positions**: Index on `(userId, closedAt)` with `closedAt: null` filter
- **Audit Log Search**: Compound index `(userId, timestamp DESC)` for user audit trail

### Data Volume Estimates

- **Users**: 10,000 users × 500 bytes = 5 MB
- **Trades**: 10,000 trades/day × 1 KB × 365 days = 3.65 GB/year
- **AuditLogs**: 50,000 events/day × 500 bytes × 365 days = 9.1 GB/year (TTL cleanup after 7 years)
- **Total Year 1**: ~13 GB (MongoDB Atlas M10 sufficient)

### Scaling Plan

- **10K users**: MongoDB Atlas M10 (10 GB storage, 2 vCPU)
- **50K users**: Upgrade to M20 (20 GB storage, 4 vCPU)
- **100K+ users**: Shard by `userId` hash (enable horizontal scaling)

---

## Next Steps

1. ✅ **Data model complete** - 6 entities defined with schemas, indexes, validation
2. ⏳ **Generate contracts/** - API spec, WebSocket events, broker adapter interface
3. ⏳ **Generate quickstart.md** - Developer setup guide
4. ⏳ **Update agent context** - Run update-agent-context.ps1
5. ⏳ **Implement models** - Create Mongoose models in `src/models/`

**Status**: READY FOR CONTRACTS GENERATION
