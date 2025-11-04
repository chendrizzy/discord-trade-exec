# Multi-User Architecture Compatibility

**Last Updated**: 2025-11-04

This document explains the architectural requirements for Discord trading bots and which brokers are compatible with multi-user deployments.

---

## Architecture Overview

### Intended Discord Bot Architecture

```
┌─────────────────────────────────────────────┐
│        Discord Bot (Cloud Server)           │
│                                             │
│  ┌────────────────────────────────────┐    │
│  │  100s-1000s of Discord Users      │    │
│  │  Each with their own credentials   │    │
│  └────────────────────────────────────┘    │
│                                             │
│  On User Trade Request:                     │
│  1. Fetch user's broker credentials from DB │
│  2. Create broker adapter with user's creds │
│  3. Make HTTPS API call to broker          │
│  4. Return result to user via Discord       │
│                                             │
└─────────────────────────────────────────────┘
                    │
                    │ HTTPS REST API
                    ▼
        ┌───────────────────────┐
        │  Broker Cloud APIs    │
        │  (Alpaca, Schwab,     │
        │   Binance, etc.)      │
        └───────────────────────┘
```

**Key Requirements**:
- ✅ **Stateless**: No persistent connections
- ✅ **Multi-Tenant**: Single bot serves all users
- ✅ **Cloud-Based**: All communication via HTTPS APIs
- ✅ **Per-User Credentials**: Each user stores their own API keys/tokens
- ✅ **Scalable**: Add users without infrastructure changes

---

## Broker Compatibility

### ✅ Multi-User Compatible (8 Brokers)

These brokers use **REST APIs with token/API key authentication** - perfect for multi-user cloud bots:

| Broker | API Type | Auth Method | Multi-User Ready |
|--------|----------|-------------|------------------|
| **Alpaca** | REST | API Key / OAuth 2.0 | ✅ Yes |
| **Schwab** | REST | OAuth 2.0 | ✅ Yes |
| **Binance** | REST | API Key | ✅ Yes |
| **Kraken** | REST | API Key | ✅ Yes |
| **Coinbase** | REST | JWT (API Key) | ✅ Yes |
| **E*TRADE** | REST | OAuth 1.0a | ✅ Yes |
| **WeBull** | REST | OAuth 2.0 | ✅ Yes |
| **TD Ameritrade** | REST | OAuth 2.0 | ✅ Yes |

**Why They Work**:
```javascript
// Example: Alpaca adapter in multi-user bot
async function executeTrade(discordUserId, symbol, quantity) {
  // 1. Get user's credentials from database
  const user = await User.findById(discordUserId);
  const { alpacaApiKey, alpacaSecret } = user.brokerCredentials;

  // 2. Create adapter with user's credentials
  const alpaca = new AlpacaAdapter({
    apiKey: alpacaApiKey,
    apiSecret: alpacaSecret
  });

  // 3. Make API call (stateless HTTPS request)
  const order = await alpaca.placeOrder(symbol, quantity, 'buy');

  // 4. Return result
  return order;
}
```

---

### ❌ NOT Multi-User Compatible (2 Brokers)

These brokers require **local Gateway processes** - only suitable for single-user deployments:

| Broker | API Type | Why Incompatible |
|--------|----------|------------------|
| **IBKR** | Socket (TWS API) | Requires TWS/IB Gateway on localhost |
| **Moomoo** | WebSocket (OpenD) | Requires OpenD Gateway on localhost |

**Why They Don't Work**:

#### IBKR Example (Broken in Multi-User)
```javascript
// IBKR adapter tries to connect to localhost
const ibkr = new IBKRAdapter({
  host: '127.0.0.1',  // ← Must be localhost
  port: 7496           // ← Gateway port
});

// Problem in multi-user bot:
// - Gateway must run on SAME machine as bot
// - Each user needs separate Gateway instance
// - Gateways require manual login with 2FA
// - Not scalable beyond 1-2 users
```

**Architectural Conflict**:
```
❌ What IBKR Requires:
User's Home Computer
  ├─ IB Gateway (manual login with 2FA)
  ├─ Trading Bot (connects to localhost:7496)
  └─ Works for single user only

❌ Multi-User Discord Bot:
Cloud Server
  ├─ 100 users
  ├─ No IB Gateway running
  ├─ Cannot connect to users' home computers
  └─ Fails: Connection refused to localhost:7496
```

---

## Deployment Modes

The platform supports two deployment modes:

### Mode 1: Multi-User (Default)

**Use Case**: Cloud-hosted Discord bot serving multiple users

**Supported Brokers**: 8 brokers (Alpaca, Schwab, Binance, Kraken, Coinbase, E*TRADE, WeBull, TD Ameritrade)

**Configuration**:
```javascript
// Set deployment mode
process.env.DEPLOYMENT_MODE = 'multi-user'; // default

// Broker factory validates automatically
const broker = await brokerFactory.createBroker('alpaca', credentials);
// ✅ Works - Alpaca is multi-user compatible

const ibkr = await brokerFactory.createBroker('ibkr', credentials);
// ❌ Throws Error: IBKR requires local Gateway, only supports single-user
```

---

### Mode 2: Single-User

**Use Case**: User runs bot on their own machine for personal trading

**Supported Brokers**: All 10 brokers (includes IBKR and Moomoo)

**Configuration**:
```javascript
// Enable single-user mode
process.env.DEPLOYMENT_MODE = 'single-user';

// IBKR now allowed (user runs Gateway on same machine)
const ibkr = await brokerFactory.createBroker('ibkr', {
  host: '127.0.0.1',
  port: 7496,
  clientId: 1
}, { deploymentMode: 'single-user' });
// ✅ Works - User runs IB Gateway locally
```

**Requirements**:
- User must install and run IB Gateway or OpenD
- Bot must run on same machine as Gateway
- Manual login to Gateway with 2FA
- Only works for one user at a time

---

## Runtime Validation

The broker factory automatically validates broker selection:

```javascript
const brokerFactory = require('./src/brokers/BrokerFactory');

// Multi-user mode (default)
try {
  const ibkr = await brokerFactory.createBroker('ibkr', credentials);
} catch (error) {
  console.error(error.message);
  // Error: Interactive Brokers (ibkr) requires local TWS or IB Gateway
  // and only supports single-user deployments.
  //
  // Problem: Interactive Brokers API connects to localhost:7496,
  // expecting a Gateway process running on the same machine...
  //
  // For multi-user Discord bots, use one of these brokers instead:
  //   - Alpaca (alpaca)
  //   - Charles Schwab (schwab)
  //   - Binance (binance)
  //   ...
}

// Override for single-user deployment
const ibkr = await brokerFactory.createBroker('ibkr', credentials, {
  deploymentMode: 'single-user'
});
// ✅ Validation passes
```

---

## Broker Configuration API

### Check Multi-User Compatibility

```javascript
const { getMultiUserBrokers, requiresLocalGateway } = require('./src/config/brokers');

// Get list of multi-user compatible brokers
const multiUserBrokers = getMultiUserBrokers();
// Returns: ['alpaca', 'schwab', 'binance', 'kraken', 'coinbase', 'etrade', 'webull', 'tdameritrade']

// Check if specific broker requires Gateway
const needsGateway = requiresLocalGateway('ibkr');
// Returns: true

const cloudBased = requiresLocalGateway('alpaca');
// Returns: false
```

### Get Broker Configuration

```javascript
const { getBrokerConfig } = require('./src/config/brokers');

const ibkrConfig = getBrokerConfig('ibkr');
console.log(ibkrConfig);
// {
//   name: 'Interactive Brokers',
//   deploymentMode: 'single-user-only',
//   requiresLocalGateway: true,
//   gatewayProcess: 'TWS or IB Gateway',
//   gatewayPort: 7496,
//   warning: '⚠️ IBKR requires IB Gateway running locally...',
//   ...
// }

const alpacaConfig = getBrokerConfig('alpaca');
console.log(alpacaConfig);
// {
//   name: 'Alpaca',
//   deploymentMode: 'multi-user',
//   requiresLocalGateway: false,
//   apiType: 'REST',
//   authMethod: 'API Key / OAuth 2.0',
//   ...
// }
```

---

## Discord Bot Integration

### Broker Selection Command

```javascript
// In Discord slash command handler
const { getMultiUserBrokers, getBrokerConfig } = require('../config/brokers');

// /setup broker command
async function handleBrokerSelection(interaction) {
  // Get deployment mode from environment
  const isMultiUser = process.env.DEPLOYMENT_MODE !== 'single-user';

  // Get compatible brokers
  const brokers = isMultiUser
    ? getMultiUserBrokers()
    : getAllBrokers();

  // Create selection options
  const options = brokers.map(brokerId => {
    const config = getBrokerConfig(brokerId);
    return {
      label: config.name,
      value: brokerId,
      description: config.requiresLocalGateway
        ? '⚠️ Single-user only'
        : 'Cloud-based API',
      emoji: config.type === 'crypto' ? '₿' : '📈'
    };
  });

  await interaction.reply({
    content: 'Select your broker:',
    components: [createSelectMenu(options)]
  });
}
```

### Connection Testing with Warnings

```javascript
// Test broker connection
async function testBrokerConnection(userId, brokerId, credentials) {
  const result = await brokerFactory.testConnection(brokerId, credentials);

  // Check for gateway warnings
  if (result.warnings.length > 0) {
    const gatewayWarning = result.warnings.find(w => w.type === 'gateway-required');
    if (gatewayWarning) {
      return {
        success: false,
        message: `⚠️ ${gatewayWarning.message}\n\n` +
                 `${gatewayWarning.gatewayProcess} must be running on localhost:${gatewayWarning.gatewayPort}`
      };
    }
  }

  return result;
}
```

### UI Warning Implementation

The broker configuration wizard displays warnings for single-user only brokers:

**Visual Indicators**:
- "Single-User Only" badge on IBKR and Moomoo broker cards
- Amber warning Alert when single-user broker is selected
- Detailed requirements list explaining setup needs

**Warning Content** (automatically shown for IBKR/Moomoo):
- Explanation of single-user deployment requirement
- Gateway installation instructions
- Local deployment requirement (bot + Gateway on same machine)
- Manual 2FA authentication requirement
- Single-user limitation clarification

**Implementation** (BrokerConfigWizard.jsx lines 554-572):
```javascript
{showWarning && (
  <Alert variant="warning" className="border-amber-500/50 bg-amber-500/10">
    <AlertCircle className="h-4 w-4" text-amber-600" />
    <AlertDescription>
      <div className="font-semibold mb-2">Single-User Deployment Required</div>
      <div className="text-muted-foreground mb-3">{selectedBroker.warning}</div>
      <div className="space-y-1 text-xs">
        <div><strong>Requirements:</strong></div>
        <ul className="list-disc list-inside ml-2">
          <li>Install {selectedBroker.gatewayProcess} on your local machine</li>
          <li>Run the bot on the same machine as the Gateway</li>
          <li>Manual login with 2FA authentication</li>
          <li>Only supports one user at a time</li>
        </ul>
      </div>
    </AlertDescription>
  </Alert>
)}
```

---

## Migration Guide

### Existing Discord Bots Using IBKR/Moomoo

If your bot currently uses IBKR or Moomoo:

#### Option 1: Switch to Compatible Broker

```javascript
// Old code (IBKR)
const ibkr = await brokerFactory.createBroker('ibkr', {
  host: '127.0.0.1',
  port: 7496
});

// New code (Alpaca - similar features)
const alpaca = await brokerFactory.createBroker('alpaca', {
  apiKey: user.alpacaKey,
  apiSecret: user.alpacaSecret
});
```

**Recommended Alternatives**:
- IBKR users → Alpaca or Schwab (stocks, options)
- Moomoo users → Alpaca or WeBull (US stocks)

#### Option 2: Deploy as Single-User

```javascript
// Set environment variable
process.env.DEPLOYMENT_MODE = 'single-user';

// Document requirements for users
const setupGuide = `
1. Install IB Gateway from Interactive Brokers
2. Enable API access in TWS settings
3. Log in to Gateway with 2FA
4. Run Discord bot on same machine as Gateway
5. Connect to localhost:7496
`;
```

---

## Testing

### Unit Tests

```bash
# Test broker configuration validation
npm test src/config/__tests__/brokers.test.js

# All 32 tests should pass
```

### Integration Test

```javascript
const brokerFactory = require('../brokers/BrokerFactory');

// Test multi-user validation
test('should block IBKR in multi-user mode', async () => {
  await expect(async () => {
    await brokerFactory.createBroker('ibkr', {}, { deploymentMode: 'multi-user' });
  }).rejects.toThrow(/requires local.*Gateway/);
});

// Test single-user override
test('should allow IBKR in single-user mode', async () => {
  const ibkr = await brokerFactory.createBroker('ibkr', {
    host: '127.0.0.1',
    port: 7496,
    clientId: 1
  }, { deploymentMode: 'single-user' });

  expect(ibkr).toBeDefined();
});
```

---

## Summary

**Multi-User Compatible**: 8 brokers using REST APIs with token/API key authentication

**Single-User Only**: 2 brokers (IBKR, Moomoo) requiring local Gateway processes

**Default Behavior**: Platform defaults to multi-user mode and validates broker selection automatically

**Override**: Single-user deployments can use all 10 brokers by setting `DEPLOYMENT_MODE=single-user`

**Recommendation**: For cloud-hosted Discord bots serving multiple users, use the 8 multi-user compatible brokers. Reserve IBKR/Moomoo for personal single-user deployments.

---

**See Also**:
- [Broker API Access Requirements](../reports/analysis/broker-api-access-requirements.md)
- [IBKR Multi-User Limitation](../reports/analysis/ibkr-multi-user-limitation.md)
- [Multi-User Architecture Audit](../reports/analysis/multi-user-architecture-audit.md)
