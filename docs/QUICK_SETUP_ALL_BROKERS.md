# Quick Setup: All Broker Connections

**Goal:** Get all 6 broker test accounts configured in 60-90 minutes

**Strategy:** Start with easiest, build momentum, finish with complex ones

---

## ⚡ Setup Order (Optimized for Speed)

| Order | Broker | Time | Difficulty | Type |
|-------|--------|------|------------|------|
| 1️⃣ | Alpaca | 5 min | ⭐ Easy | Stock |
| 2️⃣ | Kraken | 10 min | ⭐ Easy | Crypto |
| 3️⃣ | Coinbase Pro | 15 min | ⭐⭐ Moderate | Crypto |
| 4️⃣ | IBKR | 30 min | ⭐⭐⭐ Complex | Stock |
| 5️⃣ | Moomoo | 20 min | ⭐⭐ Moderate | Stock |
| 6️⃣ | Schwab | Pending | ⭐⭐⭐⭐ Very Hard | Stock |

**Total Time:** ~80 minutes (excluding Schwab which requires approval)

---

## Pre-Setup Checklist

```bash
# 1. Ensure development environment ready
cd /Volumes/CHENDRIX/GitHub/0projects.util/discord-trade-exec

# 2. Check MongoDB running
mongosh --eval "db.runCommand({ ping: 1 })"
# If not running:
brew services start mongodb-community

# 3. Verify .env exists
ls -la .env

# 4. Start dev server in separate terminal
npm run dev
# Should run on http://localhost:3000

# 5. Open browser to dashboard
open http://localhost:3000
```

---

## 1️⃣ Alpaca - Stock Broker (5 minutes) ⚡

### Sign Up & Get API Keys

1. **Open:** https://app.alpaca.markets/signup
2. **Sign up:** Use email (no SSN required for paper trading)
3. **Verify email:** Check inbox and click verification link
4. **Navigate:** Account → Paper Trading (left sidebar)
5. **Generate Key:** Click "Generate New Key" button
6. **COPY IMMEDIATELY** (shown only once):
   ```
   API Key ID: PKxxxxxxxxxxxxxxxxxx
   Secret Key: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

### Add to .env

```bash
# Add these to your .env file:
ALPACA_API_KEY=PKxxxxxxxxxxxxxxxxxx
ALPACA_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ALPACA_PAPER_TRADING=true
ALPACA_BASE_URL=https://paper-api.alpaca.markets
```

### Test in Dashboard

1. Login to http://localhost:3000
2. Click **Settings** tab
3. Click **Configure Broker** button
4. Select **Stock Brokers**
5. Click **Alpaca** card
6. Select **API Key** authentication
7. Enter:
   - API Key: `PKxxxxxxxxxxxxxxxxxx`
   - API Secret: `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - Environment: **Paper Trading**
8. Click **Test Connection**
9. ✅ Should see: "Connection successful" + Balance: $100,000.00
10. Click **Save Configuration**
11. ✅ Should see Alpaca card in BrokerManagement section

**✅ Alpaca Complete!** You can now trade stocks on paper.

---

## 2️⃣ Kraken - Crypto Exchange (10 minutes) ⚡

### Sign Up & Get API Keys

1. **Open:** https://www.kraken.com/sign-up
2. **Sign up:** Email + password
3. **Verify email:** Check inbox and verify
4. **Login:** https://www.kraken.com/sign-in
5. **Navigate:** Settings → API (or https://www.kraken.com/u/security/api)
6. **Generate Key:** Click "Generate New Key"
7. **Set Permissions:**
   - ✅ Query Funds
   - ✅ Query Open Orders & Trades
   - ✅ Query Closed Orders & Trades
   - ✅ Create & Modify Orders
   - ✅ Cancel/Close Orders
   - ❌ Withdraw Funds (UNCHECK - security)
8. **Key Description:** "Trading Bot API"
9. **Generate Key Pair**
10. **COPY IMMEDIATELY:**
    ```
    API Key: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    Private Key: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx==
    ```

### Add to .env

```bash
# Add these to your .env file:
KRAKEN_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
KRAKEN_PRIVATE_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx==
KRAKEN_ENVIRONMENT=live  # Kraken doesn't have testnet
```

### Test in Dashboard

1. In dashboard, click **Settings**
2. Click **Configure Broker**
3. Select **Crypto Exchanges**
4. Click **Kraken** card
5. Select **API Key** authentication
6. Enter:
   - API Key: Your Kraken API Key
   - Private Key: Your Kraken Private Key
   - Environment: **Live** (use small amounts for testing)
7. Click **Test Connection**
8. ✅ Should see: "Connection successful" + your balance
9. Click **Save Configuration**
10. ✅ Should see Kraken card in BrokerManagement

**✅ Kraken Complete!** You can now trade crypto.

---

## 3️⃣ Coinbase Pro - Crypto Exchange (15 minutes) 💰

### Sign Up & Get API Keys

1. **Open:** https://www.coinbase.com/signup
2. **Sign up:** Email, password, verify identity (required for API)
3. **Complete KYC:** Upload ID (takes 5-10 minutes usually)
4. **Navigate:** Settings → API (or Advanced Trade → API)
5. **Create API Key:**
   - Name: "Trading Bot"
   - Permissions:
     - ✅ View
     - ✅ Trade
     - ❌ Transfer (UNCHECK)
6. **COPY IMMEDIATELY:**
   ```
   API Key: xxxxxxxxxxxxxxxxxxxxxxxx
   API Secret: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

### Alternative: Use Sandbox (No KYC Required)

1. **Sandbox:** https://public.sandbox.pro.coinbase.com
2. **Sign up:** No verification needed
3. **Get API keys:** Same process as above
4. **Note:** Sandbox endpoint is different

### Add to .env

```bash
# Production (real account):
COINBASE_PRO_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxx
COINBASE_PRO_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
COINBASE_PRO_PASSPHRASE=xxxxxxxxxxxx  # if required
COINBASE_PRO_ENVIRONMENT=live

# OR Sandbox (test):
COINBASE_PRO_API_KEY=sandbox-key-xxxxxxxx
COINBASE_PRO_API_SECRET=sandbox-secret-xxxxxxxx
COINBASE_PRO_ENVIRONMENT=testnet
COINBASE_PRO_BASE_URL=https://api-public.sandbox.pro.coinbase.com
```

### Test in Dashboard

1. Click **Settings** → **Configure Broker**
2. Select **Crypto Exchanges**
3. Click **Coinbase Pro**
4. Select **API Key**
5. Enter credentials
6. Select environment (Live or Testnet)
7. **Test Connection**
8. ✅ Should see balance
9. **Save Configuration**

**✅ Coinbase Pro Complete!** Second crypto exchange ready.

---

## 4️⃣ Interactive Brokers (IBKR) - Stock Broker (30 minutes) 🏦

**Note:** You already have IBKR credentials in your .env! This might already work.

### Check Existing Setup

```bash
# Check your .env has these:
grep IBKR .env
```

If you see:
```
IBKR_CLIENT_ID=***
IBKR_HOST=***
IBKR_PORT=***
IBKR_PAPER_TRADING=***
```

**Skip to "Test Existing IBKR" section below!**

### New Setup (If Needed)

1. **Sign up for Paper Trading:**
   - https://www.interactivebrokers.com/en/trading/paper-trading-account.php
2. **Fill application:** No funding required for paper account
3. **Wait for approval:** Usually instant for paper
4. **Download IB Gateway:**
   - macOS: https://www.interactivebrokers.com/en/trading/ibgateway-stable.php
   - Click "Download Latest Stable Version"
   - Install: `IBGateway-stable-standalone-macos-x64.dmg`

### Configure IB Gateway

1. **Launch IB Gateway**
2. **Login:**
   - Username: Your paper account (starts with 'DU')
   - Password: Your password
3. **Configure API:**
   - Click: **Configure → Settings → API → Settings**
   - ✅ Enable ActiveX and Socket Clients
   - Socket port: **4002** (paper) or **4001** (live)
   - ✅ Read-Only API (safer)
   - Master API client ID: **1**
4. **Click OK and restart Gateway**

### Add to .env

```bash
# Paper Trading (recommended):
IBKR_ACCOUNT_ID=DUxxxxxxx  # Your paper account ID
IBKR_HOST=127.0.0.1
IBKR_PORT=4002  # 4002 for paper, 4001 for live
IBKR_CLIENT_ID=1
IBKR_PAPER_TRADING=true

# OR use existing values from your .env
```

### Test Existing IBKR (If Already Configured)

1. **Start IB Gateway:**
   - Launch IB Gateway app
   - Login with paper account
   - Verify API enabled (Configure → Settings → API)
   - Keep Gateway running

2. **Test in Dashboard:**
   - Click **Settings** → **Configure Broker**
   - Select **Stock Brokers**
   - Click **Interactive Brokers**
   - If saved: credentials auto-populate
   - If new: enter manually
   - Click **Test Connection**
   - ✅ Should connect if Gateway is running
   - **Save Configuration**

**Common Issues:**
```bash
# If connection fails:
# 1. Check Gateway is running and logged in
# 2. Check port matches (4002 for paper)
# 3. Check API enabled in Gateway settings
# 4. Check firewall not blocking localhost
```

**✅ IBKR Complete!** Professional-grade paper trading ready.

---

## 5️⃣ Moomoo - Stock Broker (20 minutes) 📱

**Note:** You already have Moomoo credentials! Check if it works first.

### Check Existing Setup

```bash
# Check your .env:
grep MOOMOO .env
```

If you see Moomoo credentials, **skip to "Test Existing Moomoo"!**

### New Setup (If Needed)

1. **Download Moomoo App:**
   - iOS: App Store
   - Android: Google Play
   - Desktop: https://www.moomoo.com/us/download

2. **Sign Up:**
   - Open app
   - Create account
   - Verify email/phone

3. **Enable Paper Trading:**
   - In app: Settings → Paper Trading
   - Toggle ON
   - You get virtual money to trade

4. **Install OpenD Gateway (Required for API):**
   ```bash
   # macOS:
   # Download from: https://www.moomoo.com/us/support/topic3_596
   # Or check: https://github.com/FutunnOpen/futu-api-doc

   # Install and run:
   # The OpenD gateway needs to run locally for API access
   ```

5. **Configure OpenD:**
   - Default port: 11111
   - Connect to Moomoo paper account
   - Enable API access

### Add to .env

```bash
MOOMOO_HOST=127.0.0.1
MOOMOO_PORT=11111
MOOMOO_TRD_ENV=1  # 0 = real, 1 = simulate/paper
MOOMOO_PAPER_TRADING=true
```

### Test Existing Moomoo (If Already Configured)

1. **Ensure OpenD Gateway Running:**
   - Launch OpenD Gateway
   - Connect to paper trading account
   - Verify port 11111

2. **Configure in Dashboard:**
   - Click **Settings** → **Configure Broker**
   - Select **Stock Brokers**
   - Click **Moomoo**

3. **You'll See a 6-Step Configuration Wizard:**

   **Step 1: Select Broker Type**
   - Choose "Stock Brokers"

   **Step 2: Select Broker**
   - Click on Moomoo card

   **Step 3: Choose Auth Method**
   - Select "API Key" (only option for Moomoo)

   **Step 4: Enter Credentials** (NEW Dynamic Fields!)

   📢 **Prerequisite Warning** (appears automatically):
   > ⚠️ **Moomoo requires OpenD Gateway running locally on your computer.**
   > Please download and start OpenD before testing your connection.
   >
   > <details>
   > <summary>View Installation Steps</summary>
   >
   > 1. Download OpenD Gateway from https://openapi.moomoo.com
   > 2. Install OpenD on your local computer
   > 3. Start OpenD Gateway service (default port: 11111)
   > 4. Verify OpenD is running by checking localhost:11111
   > 5. Return here to configure your Moomoo connection
   > </details>

   **Dynamic Credential Fields:**

   - **Account ID** * (required)
     - Your Moomoo account ID
     - Helper text: "The account identifier for your Moomoo trading account"

   - **Password** * (required)
     - Your Moomoo account password
     - Shows/hides with 👁️ toggle button
     - Helper text: "Trading password for your Moomoo account"

   - **OpenD Gateway Host** * (required)
     - Default: `127.0.0.1` (auto-filled)
     - Helper text: "Local OpenD gateway host address (default: 127.0.0.1)"

   - **OpenD Gateway Port** * (required)
     - Default: `11111` (auto-filled)
     - Helper text: "Local OpenD gateway port (default: 11111)"

   💡 **Pro Tip:** Host and Port fields are pre-filled with defaults. Leave them as-is unless you changed OpenD's configuration.

   **Step 5: Select Environment**
   - Choose "Paper Trading" (recommended)

   **Step 6: Test & Save**
   - Click **Test Connection**
   - ✅ Should see: "Connection successful" + balance (if OpenD running)
   - Click **Save Configuration**

**✅ Moomoo Complete!** You can now trade stocks on paper via Moomoo.

---

## 6️⃣ Schwab - Stock Broker (PENDING APPROVAL) ⏸️

**Status:** Requires developer account approval

### Current Situation

Schwab API requires:
1. Developer account application
2. Approval process (can take weeks)
3. OAuth 2.0 setup (more complex)

### Quick Alternative: Use What You Have

You already have:
- ✅ Alpaca (stock)
- ✅ IBKR (stock)
- ✅ Moomoo (stock)

**Three stock brokers is plenty for testing!**

### If You Want to Apply

1. **Apply:** https://developer.schwab.com/
2. **Create App:**
   - App name: "Trading Bot"
   - Callback URL: `http://localhost:3000/api/brokers/callback/schwab`
3. **Wait for approval**
4. **Get Consumer Key and Secret**

**For now, skip Schwab.** You have enough to fully test the system.

---

## 🎯 Quick Test: All Brokers

After setting up, verify all in dashboard:

```bash
# 1. Navigate to Settings tab
# 2. Should see in BrokerManagement section:

Stock Brokers (3):
✅ Alpaca - Paper Trading
✅ Interactive Brokers - Paper Trading
✅ Moomoo - Paper Trading (if OpenD works)

Crypto Exchanges (2):
✅ Kraken - Live Trading (small amounts)
✅ Coinbase Pro - Live/Testnet

# 3. Test each connection:
# Click "Test Connection" on each card
# All should show green success + balance
```

---

## ⚡ Fastest Path (30 minutes)

**Just want to test the system works?**

**Do only these 2:**
1. ✅ **Alpaca** (5 min) - Stock broker
2. ✅ **Kraken** (10 min) - Crypto exchange

**This gives you:**
- Stock broker connection ✅
- Crypto exchange connection ✅
- Multi-broker management ✅
- Different environments (paper vs live) ✅
- All UI components tested ✅

**Then add more later if needed!**

---

## 📝 Final .env Configuration

After all setups, your .env should have:

```bash
# Development
NODE_ENV=development
PORT=3000

# Database
MONGODB_URI=mongodb://localhost:27017/trade-executor-dev

# Session
SESSION_SECRET=your-super-secret-key

# Encryption (for production)
ENCRYPTION_KEY=your-encryption-key
# OR for AWS KMS:
# AWS_REGION=us-east-1
# AWS_ACCESS_KEY_ID=xxx
# AWS_SECRET_ACCESS_KEY=xxx
# KMS_KEY_ID=xxx

# Stock Brokers
ALPACA_API_KEY=PKxxxxxxxxxx
ALPACA_API_SECRET=xxxxxxxxxx
ALPACA_PAPER_TRADING=true

IBKR_ACCOUNT_ID=DUxxxxxxx
IBKR_HOST=127.0.0.1
IBKR_PORT=4002
IBKR_CLIENT_ID=1
IBKR_PAPER_TRADING=true

MOOMOO_HOST=127.0.0.1
MOOMOO_PORT=11111
MOOMOO_TRD_ENV=1
MOOMOO_PAPER_TRADING=true

# Crypto Exchanges
KRAKEN_API_KEY=xxxxxxxxxx
KRAKEN_PRIVATE_KEY=xxxxxxxxxx

COINBASE_PRO_API_KEY=xxxxxxxxxx
COINBASE_PRO_API_SECRET=xxxxxxxxxx
COINBASE_PRO_ENVIRONMENT=testnet
```

---

## 🐛 Troubleshooting

### All Connections Fail
```bash
# Check server running:
curl http://localhost:3000/api/brokers

# Check MongoDB:
mongosh --eval "db.runCommand({ ping: 1 })"

# Check logs:
tail -f logs/app.log  # or check console
```

### IBKR Connection Fails
```bash
# 1. Is IB Gateway running?
ps aux | grep gateway

# 2. Is it logged in?
# Check the Gateway window - should show "Connected"

# 3. Is API enabled?
# Gateway → Configure → Settings → API → Check settings

# 4. Correct port?
# Paper: 4002
# Live: 4001
```

### Moomoo Connection Fails
```bash
# 1. Is OpenD Gateway running?
lsof -i :11111

# 2. Is it connected to paper account?
# Check OpenD window

# 3. Try restarting OpenD Gateway
```

### Encryption Errors
```bash
# Quick fix for local development:
# Add to .env:
SKIP_ENCRYPTION=true

# ⚠️ ONLY FOR LOCAL TESTING
# DO NOT USE IN PRODUCTION
```

---

## ✅ Success Checklist

After completing all setups:

### In Dashboard
- [ ] Navigate to Settings tab
- [ ] See all configured brokers in BrokerManagement
- [ ] Each broker card shows:
  - [ ] Correct name
  - [ ] Correct type (Stocks/Crypto)
  - [ ] Correct environment (Paper/Live)
  - [ ] Configured date
  - [ ] Last verified date

### Connection Tests
- [ ] Click "Test Connection" on each broker
- [ ] Each shows green success message
- [ ] Each displays account balance
- [ ] No console errors

### Multi-Broker Management
- [ ] Can see all brokers in grid layout
- [ ] Can test connections independently
- [ ] Can disconnect any broker
- [ ] Empty state appears when all disconnected
- [ ] Security alert displays

### Ready for Trading
- [ ] At least 1 stock broker connected
- [ ] At least 1 crypto exchange connected
- [ ] All connections verified working
- [ ] No errors in console or logs

---

## 🚀 Next Steps

After all brokers configured:

1. **Run Full QA Tests:**
   ```bash
   # Follow: docs/QA_BROKER_TESTING_PLAN.md
   # Test all 10 scenarios
   ```

2. **Test Paper Trading Execution:**
   - Create test signal
   - Execute on IBKR/Alpaca
   - Verify order fills

3. **Monitor Analytics:**
   ```bash
   mongosh trade-executor-dev
   db.analyticsevents.find({
     eventType: "broker_connected"
   }).sort({ createdAt: -1 })
   ```

4. **Mark Phase 3 Complete:**
   - Update BROKER_INTEGRATION_STATUS.md
   - Document any issues found
   - Prepare for production deployment

---

## 📞 Need Help?

**Quick References:**
- Full QA Plan: `docs/QA_BROKER_TESTING_PLAN.md`
- Detailed Setup: `docs/BROKER_TEST_ACCOUNTS_SETUP.md`
- Immediate Steps: `docs/QA_IMMEDIATE_NEXT_STEPS.md`
- IBKR Issues: `docs/MOOMOO_OPEND_TROUBLESHOOTING.md`

**Broker Docs:**
- Alpaca: https://alpaca.markets/docs/
- IBKR: https://interactivebrokers.github.io/tws-api/
- Kraken: https://docs.kraken.com/rest/
- Coinbase: https://docs.cloud.coinbase.com/

**Still stuck?** Create GitHub issue with:
- Broker name
- Error message
- Steps tried
- Console logs
