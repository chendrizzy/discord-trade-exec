# Broker Test Accounts Setup Guide

Quick reference for setting up test/paper trading accounts for all 6 supported brokers.

---

## Priority 1: Easiest to Set Up (Start Here)

### 1. Alpaca - Paper Trading ⭐ RECOMMENDED FIRST
**Difficulty:** ⭐ Easy (5 minutes)
**Cost:** FREE
**Best for:** Initial testing, stock trading

**Setup Steps:**
1. Go to https://app.alpaca.markets/signup
2. Sign up with email (no SSN required for paper trading)
3. Email verification
4. Navigate to: Account → Paper Trading
5. Click "Generate New Key"
6. Copy both:
   - API Key ID (starts with `PK...` for paper)
   - Secret Key (shown only once)
7. **Save credentials securely**

**Test Credentials Format:**
```json
{
  "apiKey": "PKxxxxxxxxxxxxxxxxxx",
  "apiSecret": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "environment": "testnet"
}
```

**API Endpoint:** `https://paper-api.alpaca.markets`
**Features:** Stocks, Options, Paper trading with $100,000 virtual cash

---

### 2. Kraken - Demo Account ⭐ RECOMMENDED FOR CRYPTO
**Difficulty:** ⭐ Easy (10 minutes)
**Cost:** FREE
**Best for:** Crypto testing

**Setup Steps:**
1. Go to https://www.kraken.com/sign-up
2. Sign up and verify email
3. Navigate to: Settings → API
4. Click "Generate New Key"
5. Set permissions:
   - ✅ Query Funds
   - ✅ Query Open Orders & Trades
   - ✅ Create & Modify Orders
   - ❌ Withdraw Funds (leave unchecked)
6. Copy:
   - API Key
   - Private Key (shown only once)
7. **Save credentials securely**

**Test Credentials Format:**
```json
{
  "apiKey": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "privateKey": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx==",
  "environment": "live"
}
```

**Note:** Kraken doesn't have a testnet. Use small amounts or demo account for testing.

---

## Priority 2: Moderate Setup (15-30 minutes)

### 3. Coinbase Pro (Advanced Trade)
**Difficulty:** ⭐⭐ Moderate (15 minutes)
**Cost:** FREE (Sandbox available)
**Best for:** Crypto spot trading

**Setup Steps:**
1. Go to https://pro.coinbase.com/ (or https://www.coinbase.com/advanced-trade)
2. Sign up and complete identity verification (required for API)
3. Navigate to: Settings → API
4. Click "New API Key"
5. Set permissions:
   - ✅ View
   - ✅ Trade
   - ❌ Transfer (leave unchecked for safety)
6. Copy:
   - API Key
   - API Secret
   - Passphrase (if required)
7. **Save credentials securely**

**Sandbox (Test Environment):**
- Endpoint: `https://api-public.sandbox.pro.coinbase.com`
- Sign up at: https://public.sandbox.pro.coinbase.com

**Test Credentials Format:**
```json
{
  "apiKey": "xxxxxxxxxxxxxxxxxxxxxxxx",
  "apiSecret": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "passphrase": "xxxxxxxxxxxx",
  "environment": "testnet"
}
```

---

### 4. Moomoo - Paper Trading
**Difficulty:** ⭐⭐ Moderate (20 minutes + software install)
**Cost:** FREE
**Best for:** Stock trading with advanced charts

**Setup Steps:**
1. Download Moomoo app or OpenD Gateway:
   - https://www.moomoo.com/us/
   - OpenD: https://www.moomoo.com/us/support/topic3_596
2. Sign up for Moomoo account
3. Enable paper trading in app settings
4. Install OpenD Gateway (required for API access):
   ```bash
   # macOS
   brew install moomoo-opend

   # Or download from:
   # https://github.com/FutunnOpen/futu-api-doc
   ```
5. Configure OpenD:
   - Default port: 11111
   - Enable API access
   - Connect to paper trading account
6. Get credentials from Moomoo app

**Test Credentials Format:**
```json
{
  "host": "127.0.0.1",
  "port": 11111,
  "trdEnv": 1,  // 0 = real, 1 = simulate
  "environment": "testnet"
}
```

**Important:** OpenD Gateway must be running locally for API to work.

---

## Priority 3: Complex Setup (30-60 minutes)

### 5. Interactive Brokers (IBKR) - Paper Account
**Difficulty:** ⭐⭐⭐ Complex (30-45 minutes)
**Cost:** FREE (Paper account)
**Best for:** Professional-grade paper trading, options, futures

**Setup Steps:**
1. Sign up for paper trading account:
   - https://www.interactivebrokers.com/en/trading/paper-trading-account.php
2. Complete application (no funding required for paper)
3. Wait for approval (usually instant for paper accounts)
4. Download TWS (Trader Workstation) or IB Gateway:
   - https://www.interactivebrokers.com/en/trading/tws.php
   - **Recommended:** IB Gateway (lighter weight)
5. Install and configure:
   ```bash
   # Download IB Gateway
   # macOS: IBGateway-stable-standalone-macos-x64.dmg
   # Windows: IBGateway-stable-standalone-windows-x64.exe
   # Linux: IBGateway-stable-standalone-linux-x64.sh
   ```
6. Enable API access in Gateway:
   - Settings → API → Settings
   - ✅ Enable ActiveX and Socket Clients
   - Socket port: 4002 (paper) or 4001 (live)
   - ✅ Read-Only API
7. Login with paper account credentials
8. Keep Gateway running during testing

**Test Credentials Format:**
```json
{
  "accountId": "DUxxxxxxxx",  // Paper accounts start with DU
  "host": "127.0.0.1",
  "port": 4002,
  "clientId": 1,
  "environment": "testnet"
}
```

**Important:**
- IB Gateway must be running
- Re-login required every 24 hours
- Paper account has $1,000,000 virtual cash
- Full market data requires subscriptions (free for paper)

---

### 6. Charles Schwab - Developer Account
**Difficulty:** ⭐⭐⭐⭐ Very Complex (requires approval)
**Cost:** FREE (Paper trading via TD Ameritrade sandbox)
**Best for:** Stock and options trading (if you have approval)

**Setup Steps:**
1. **Note:** Schwab API access requires developer approval
2. Apply for developer access:
   - https://developer.schwab.com/
3. Create app and get:
   - Consumer Key (App Key)
   - Consumer Secret
4. Set up OAuth 2.0 redirect URI:
   - `http://localhost:3000/api/brokers/callback/schwab`
5. Wait for approval (can take days/weeks)

**Alternative:** Use TD Ameritrade API (Schwab acquired them):
- https://developer.tdameritrade.com/
- Easier to get approved
- Has sandbox environment

**Test Credentials Format:**
```json
{
  "consumerKey": "xxxxxxxxxxxxxxxxxxxxxxxx",
  "consumerSecret": "xxxxxxxxxxxxxxxxxxxxxxxx",
  "redirectUri": "http://localhost:3000/api/brokers/callback/schwab",
  "environment": "testnet"
}
```

**OAuth Flow Required:**
1. User redirects to Schwab for authorization
2. Schwab redirects back with auth code
3. Exchange auth code for access token
4. Use access token for API calls

---

## Recommended Testing Order

### Day 1: Basic Setup (2-3 hours)
1. ✅ Alpaca (stock) - 5 mins
2. ✅ Kraken (crypto) - 10 mins
3. ✅ Test both in dashboard
4. ✅ Verify connection, disconnection, reconnection

### Day 2: Crypto Expansion (1-2 hours)
1. ✅ Coinbase Pro (crypto) - 15 mins
2. ✅ Test multi-crypto broker setup
3. ✅ Compare fee structures

### Day 3: Advanced Stock Brokers (2-3 hours)
1. ✅ IBKR Paper Account - 30-45 mins
2. ✅ Install and configure IB Gateway
3. ✅ Test paper trading execution

### Day 4: Optional/Complex (if needed)
1. ⏳ Moomoo (if OpenD Gateway works)
2. ⏳ Schwab (if approval obtained)

---

## Quick Start: Minimal Testing Setup

**Want to test quickly? Just do these 2:**

### 1. Alpaca (5 minutes)
- Easiest stock broker
- No personal info required
- Instant API keys
- Full paper trading

### 2. Kraken (10 minutes)
- Easiest crypto exchange
- Quick email verification
- Instant API keys
- Real-ish trading (small amounts)

**With just these 2, you can test:**
- ✅ Stock broker connection
- ✅ Crypto broker connection
- ✅ Multi-broker management
- ✅ Different auth methods
- ✅ Different environments
- ✅ Connection testing
- ✅ Broker disconnection
- ✅ All UI components

---

## Environment Variables Setup

After getting credentials, update your `.env`:

```bash
# Development Environment
NODE_ENV=development
PORT=3000

# Database
MONGODB_URI=mongodb://localhost:27017/trade-executor-dev

# Session
SESSION_SECRET=your-super-secret-key-change-this

# AWS KMS for Credential Encryption
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
KMS_KEY_ID=your-kms-key-id

# Optional: Skip encryption in development (NOT RECOMMENDED)
# SKIP_ENCRYPTION=true  # Only for local testing without AWS
```

---

## Testing Without AWS KMS (Local Development)

If you don't have AWS KMS set up yet, you can temporarily use local encryption:

```javascript
// src/config/index.js - Add this flag
module.exports = {
  // ... other config
  encryption: {
    enabled: process.env.SKIP_ENCRYPTION !== 'true',
    algorithm: 'aes-256-gcm',
    localKey: process.env.ENCRYPTION_KEY || 'dev-only-key-DO-NOT-USE-IN-PROD'
  }
};
```

**⚠️ WARNING:** This is only for local testing. NEVER use in production!

---

## Troubleshooting

### Issue: "Invalid API Credentials"
**Solution:**
- Double-check API key copied correctly (no spaces)
- Verify API key has correct permissions
- For Coinbase Pro: check passphrase
- For IBKR: ensure Gateway is running

### Issue: "Connection Timeout"
**Solution:**
- For IBKR/Moomoo: verify desktop software running
- Check firewall settings
- Verify correct host/port

### Issue: "Encryption Failed"
**Solution:**
- Verify AWS KMS credentials in .env
- Check KMS key permissions
- Try SKIP_ENCRYPTION=true for local testing

### Issue: "Rate Limiting"
**Solution:**
- Wait 60 seconds between test connection attempts
- Don't spam the test button
- Rate limits: 10 requests per minute per broker

---

## Security Best Practices

1. **Never commit credentials:**
   ```bash
   # Already in .gitignore
   .env
   .env.local
   credentials/
   ```

2. **Use paper/testnet first:**
   - Always test with paper trading
   - Verify everything works before using real accounts

3. **Limit API permissions:**
   - ❌ Never enable withdrawals
   - ✅ Only enable read and trade permissions
   - 🔐 Use separate keys for testing vs production

4. **Rotate keys regularly:**
   - Regenerate API keys every 90 days
   - Delete unused API keys immediately

5. **Monitor usage:**
   - Check broker account for unexpected activity
   - Review API logs regularly

---

## Next Steps

After setting up test accounts:

1. ✅ Update `.env` with credentials
2. ✅ Start development server: `npm run dev`
3. ✅ Open QA testing plan: `docs/QA_BROKER_TESTING_PLAN.md`
4. ✅ Begin Scenario 1: First-Time Broker Connection
5. ✅ Work through all 10 test scenarios
6. ✅ Document any bugs found
7. ✅ Mark Phase 3 as production-ready (if all tests pass)

**Questions or issues?** Check:
- Broker API documentation links in QA_BROKER_TESTING_PLAN.md
- MOOMOO_OPEND_TROUBLESHOOTING.md for IBKR/Moomoo issues
- GitHub issues for known problems
