# Interactive Brokers (IBKR) Setup Guide

This guide walks through setting up IBKR paper trading for development and testing.

## Prerequisites

- None! Paper trading is completely free with no deposit required

## Step 1: Create IBKR Account

### Sign Up for Paper Trading
1. Visit: https://www.interactivebrokers.com/en/index.php?f=1286
2. Click "Open Account" or "Paper Trading"
3. Fill out basic registration form:
   - Name and email
   - Country of residence
   - Basic personal information
4. Verify email address
5. **Paper trading approval is typically instant**

### Account Types
- **Paper Trading:** FREE, no deposit, instant approval
- **Live Trading:** Requires funding and verification (optional)

**Note:** Paper trading and live trading accounts are completely separate.

## Step 2: Download TWS or IB Gateway

### Option A: IB Gateway (Recommended for API-only)
- **Download:** https://www.interactivebrokers.com/en/trading/ibgateway-stable.php
- **Size:** ~200 MB
- **Platforms:** Windows, Mac, Linux
- **Lighter weight** than full TWS
- **Perfect for:** API connections without GUI trading

### Option B: Trader Workstation (TWS)
- **Download:** https://www.interactivebrokers.com/en/trading/tws.php
- **Size:** ~500 MB
- **Full trading platform** with charts and analysis
- **Use if:** You want the full GUI trading experience

**For development, IB Gateway is recommended** - it's lighter and designed for API access.

## Step 3: Install and Launch

### Installation
1. Run the installer for your platform
2. Accept license agreement
3. Install to default location
4. Launch IB Gateway or TWS

### Login
1. **Username:** Your IBKR username (from registration email)
2. **Password:** Your IBKR password
3. **Trading Mode:** Select "Paper Trading" (not Live)

**Important:** Always select "Paper Trading" mode for development!

## Step 4: Enable API Access

### Configure API Settings
1. In TWS/IB Gateway, go to:
   - **TWS:** File → Global Configuration → API → Settings
   - **IB Gateway:** Configure → Settings → API → Settings

2. **Enable these settings:**
   - ✅ Enable ActiveX and Socket Clients
   - ✅ Socket port: **4001** (paper trading default)
   - ✅ Master API client ID: **1** (or any positive integer)
   - ❌ Read-only API: **UNCHECK** (to allow trading)
   - ✅ Allow connections from localhost: **127.0.0.1**

3. **Optional settings:**
   - Download open orders on connection: ✅ Recommended
   - Use negative numbers to bind automatic orders: Your preference
   - Let API account management requests: Your preference

4. Click **OK** to save settings

### Verify API Port
- **Paper Trading Port:** 4001 (default)
- **Live Trading Port:** 7496
- Our `.env` configuration uses port 4001 by default

## Step 5: Configure Environment Variables

### Update .env file
```bash
# Copy from .env.example
cp .env.example .env

# Edit .env and set:
IBKR_CLIENT_ID=1
IBKR_HOST=127.0.0.1
IBKR_PORT=4001
IBKR_PAPER_TRADING=true
```

### Client ID
- Must match "Master API client ID" in TWS settings
- Default: 1
- Multiple applications can use different client IDs

## Step 6: Test Connection

### Keep TWS/IB Gateway Running
**Important:** TWS or IB Gateway must be running for API connections to work.

### Run Verification Test
```bash
node test-ibkr-adapter.js
```

Expected output:
```
=== IBKR Adapter Verification Test ===
✅ IBKR is registered
✅ IBKR is marked as available
✅ IBKRAdapter instance created successfully
✅ All required methods implemented
✅ getBrokerInfo() works
✅ Initial connection status is false (expected)
=== All verification tests passed! ===
```

### Test Authentication
```javascript
const BrokerFactory = require('./src/brokers/BrokerFactory');

async function testAuth() {
  const ibkr = BrokerFactory.createBroker('ibkr', {
    clientId: 1,
    host: '127.0.0.1',
    port: 4001
  }, {
    isTestnet: true
  });

  try {
    await ibkr.authenticate();
    console.log('✅ Connected to IBKR!');

    const balance = await ibkr.getBalance();
    console.log('Account balance:', balance);

    await ibkr.disconnect();
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
  }
}

testAuth();
```

## Troubleshooting

### "Connection timeout after 10 seconds"
**Cause:** TWS/IB Gateway not running or API not enabled

**Solutions:**
1. Verify TWS/IB Gateway is running
2. Check API settings are enabled
3. Confirm socket port is 4001
4. Check firewall isn't blocking localhost connections

### "TWS connection failed: Failed to connect"
**Cause:** Wrong port or TWS not listening

**Solutions:**
1. Verify port 4001 in both TWS settings and .env
2. Restart TWS/IB Gateway after changing API settings
3. Try clicking "Test Connection" in TWS API settings

### "Invalid symbol" errors
**Cause:** Symbol format doesn't match IBKR requirements

**Solutions:**
1. Use standard symbols (e.g., 'AAPL', 'TSLA', 'SPY')
2. For crypto: Not supported via TWS API directly
3. For forex: Use format like 'EUR.USD'

### "Market data not available"
**Cause:** Paper trading has limited market data access

**Solutions:**
1. Subscribe to paper trading market data (free)
2. Go to Account Management → Market Data Subscriptions
3. Enable "US Securities Snapshot and Futures Value Bundle" (free for paper trading)

### Orders rejected immediately
**Cause:** Trading hours or invalid order parameters

**Solutions:**
1. Check market hours (9:30 AM - 4:00 PM ET for US stocks)
2. Verify order quantity is valid (positive integer)
3. For limit orders, check price is reasonable
4. Paper trading can be more strict than expected

## Market Data Subscriptions

### Free Paper Trading Data
1. Log into Account Management: https://www.interactivebrokers.com/portal
2. Navigate to Settings → User Settings → Market Data Subscriptions
3. **For paper trading, these are FREE:**
   - US Securities Snapshot and Futures Value Bundle
   - US Equity and Options Add-On Streaming Bundle

### Without Market Data
- Order execution will still work
- Price data may be delayed or unavailable
- getMarketPrice() may return stale data

## Security Best Practices

### API Security
1. **Never share API credentials:** clientId is like a password
2. **Localhost only:** Only allow connections from 127.0.0.1
3. **Read-only in production:** Consider read-only API for monitoring
4. **Separate paper/live:** Use different credentials entirely

### Paper Trading Safety
- Paper trading cannot access real money
- Completely isolated from live accounts
- Safe for development and testing
- Can't accidentally lose real funds

## Resources

### Official Documentation
- **Paper Trading:** https://www.interactivebrokers.com/en/index.php?f=1286
- **TWS API Guide:** https://interactivebrokers.github.io/tws-api/
- **IB Gateway:** https://www.interactivebrokers.com/en/trading/ibgateway-stable.php
- **API Reference:** https://interactivebrokers.github.io/tws-api/classIBApi_1_1EClient.html

### Support
- **IBKR Support:** https://www.interactivebrokers.com/en/support/contact.php
- **API Forum:** https://groups.io/g/twsapi
- **Discord Trade Exec Issues:** https://github.com/[your-repo]/issues

## Next Steps

After successful IBKR setup:
1. ✅ Test basic authentication
2. ✅ Test account balance retrieval
3. ✅ Test market order placement
4. ✅ Test limit order placement
5. ✅ Test order cancellation
6. ✅ Test positions retrieval

See `openspec/changes/implement-broker-integrations/tasks.md` for full testing checklist.

---

**Last Updated:** 2025-10-13
**IBKR Adapter Version:** Phase 1 Week 1
**Status:** ✅ Basic implementation complete, authentication ready
