# QA Testing - Immediate Next Steps

## Current Status ✅

**Completed:**
- ✅ Phase 3: UI Integration implementation complete
- ✅ BrokerManagement component created and tested
- ✅ 28 unit tests passing
- ✅ 10 E2E tests created
- ✅ Comprehensive QA testing plan created
- ✅ Test account setup guide created
- ✅ Environment already has IBKR and Moomoo credentials

**Ready to Begin:** Manual QA Testing

---

## Quick Start: 30-Minute Basic Testing

### Step 1: Start Development Environment (5 min)

```bash
# Navigate to project
cd /Volumes/CHENDRIX/GitHub/0projects.util/discord-trade-exec

# Ensure MongoDB is running
mongosh --eval "db.runCommand({ ping: 1 })" || brew services start mongodb-community

# Start development server
npm run dev
# Server should start on http://localhost:3000
```

**Verify:**
- [ ] Server starts without errors
- [ ] MongoDB connection successful
- [ ] Dashboard accessible at http://localhost:3000

---

### Step 2: Quick Alpaca Setup (5 min) ⭐ START HERE

**Why Alpaca First:**
- Fastest to set up (5 minutes)
- No personal info required
- Instant API keys
- Perfect for initial testing

**Setup:**
1. Open https://app.alpaca.markets/signup in new tab
2. Sign up with email
3. Navigate to: Account → Paper Trading
4. Click "Generate New Key"
5. **COPY IMMEDIATELY** (shown only once):
   - API Key ID (starts with `PK...`)
   - Secret Key

**Save to .env:**
```bash
# Add to .env file
ALPACA_API_KEY=PKxxxxxxxxxxxxxxxxxx
ALPACA_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ALPACA_PAPER_TRADING=true
```

---

### Step 3: Test Alpaca Connection in Dashboard (10 min)

1. **Login to Dashboard:**
   - Go to http://localhost:3000
   - Login with Discord (if needed)

2. **Navigate to Settings:**
   - Click "Settings" tab in sidebar

3. **Open Broker Configuration:**
   - Click "Configure Broker" button
   - Should see broker selection wizard

4. **Configure Alpaca:**
   - Select "Stock Brokers"
   - Click "Alpaca" card
   - Select "API Key" authentication
   - Enter your API Key and Secret
   - Select "Paper Trading" environment
   - Click "Test Connection"

5. **Verify Success:**
   - ✅ Should see "Connection successful"
   - ✅ Should show balance: $100,000.00 (default paper)
   - ✅ "Save Configuration" button enabled

6. **Save Configuration:**
   - Click "Save Configuration"
   - Should see success message
   - Wizard should close

7. **Verify in BrokerManagement:**
   - Scroll down on Settings page
   - Should see Alpaca broker card
   - Verify displays:
     - Name: "Alpaca"
     - Type: "Stocks" badge
     - Environment: "Paper Trading" badge
     - Auth: "API Key" badge
     - Configured date
     - Last verified date

8. **Test from Management View:**
   - Click "Test Connection" on Alpaca card
   - Should show loading spinner
   - Should see success alert with balance

---

### Step 4: Test Existing IBKR Configuration (10 min)

**You already have IBKR credentials in .env!**

```bash
# Verify these exist in your .env:
IBKR_CLIENT_ID=***
IBKR_HOST=***
IBKR_PORT=***
IBKR_PAPER_TRADING=***
```

**Test Steps:**

1. **Start IB Gateway (if not running):**
   - Launch IB Gateway application
   - Login with paper trading account
   - Ensure API access enabled
   - Port should match your .env (usually 4002 for paper)

2. **Test IBKR in Dashboard:**
   - In dashboard Settings tab
   - Click "Configure Broker"
   - Select "Stock Brokers"
   - Select "Interactive Brokers"
   - Your credentials should auto-populate (if stored)
   - OR enter manually if new connection
   - Click "Test Connection"

3. **Expected Result:**
   - ✅ Connection successful
   - ✅ Shows account balance
   - ✅ Can save configuration

**If IBKR Test Fails:**
- Check IB Gateway is running
- Verify port matches (4002 for paper, 4001 for live)
- Check API settings in Gateway
- Review: `docs/MOOMOO_OPEND_TROUBLESHOOTING.md`

---

## Full Testing Plan (2-3 hours)

Once basic testing works, proceed with:

### Testing Matrix

| Broker | Priority | Time | Status |
|--------|----------|------|--------|
| Alpaca | P0 ⭐ | 5 min | ⏳ |
| IBKR | P0 | 15 min | ⏳ |
| Kraken | P1 | 10 min | ⏳ |
| Coinbase Pro | P1 | 15 min | ⏳ |
| Moomoo | P2 | 20 min | ⏳ |
| Schwab | P3 | N/A (pending approval) | ⏸️ |

### Detailed Test Scenarios

Follow the comprehensive plan in:
📄 **`docs/QA_BROKER_TESTING_PLAN.md`**

**10 Scenarios to Test:**
1. ✅ First-Time Stock Broker Connection (Alpaca)
2. ✅ Crypto Exchange Connection (Kraken)
3. ✅ Connection Failure Handling
4. ✅ Broker Disconnection
5. ✅ Multiple Broker Management
6. ✅ Premium Tier Gating (if applicable)
7. ✅ Paper Trading Execution
8. ✅ Rate Limiting
9. ✅ Security Validation
10. ✅ Analytics Events

---

## Troubleshooting Quick Reference

### Issue: "Cannot connect to database"
```bash
# Check MongoDB status
brew services list | grep mongodb

# Start if not running
brew services start mongodb-community

# Verify connection
mongosh --eval "db.runCommand({ ping: 1 })"
```

### Issue: "Invalid API credentials" (Alpaca)
**Check:**
- API Key starts with `PK` (paper) or `AK` (live)
- No extra spaces when copying
- Environment set to "testnet" for paper keys

### Issue: "IBKR Connection Failed"
**Check:**
- IB Gateway is running and logged in
- API access enabled in Gateway settings
- Port 4002 (paper) or 4001 (live)
- Firewall not blocking connection

### Issue: "Encryption failed"
**Quick Fix for Local Testing:**
```bash
# Add to .env (DEVELOPMENT ONLY)
SKIP_ENCRYPTION=true
```
⚠️ **This disables encryption - only for local testing!**

---

## Success Criteria

### ✅ Basic Testing Complete When:
- [ ] Alpaca connects successfully
- [ ] Can test connection from management view
- [ ] Can disconnect broker
- [ ] Broker card displays all info correctly
- [ ] No console errors during flow

### ✅ Full Testing Complete When:
- [ ] All 10 test scenarios passed
- [ ] At least 3 brokers tested (1 stock, 1 crypto minimum)
- [ ] All bugs documented
- [ ] Security validation completed
- [ ] Analytics events verified

---

## After Testing

### If All Tests Pass ✅

1. **Update Status:**
   ```bash
   # Update BROKER_INTEGRATION_STATUS.md
   # Mark Phase 3 as "COMPLETE - Production Ready"
   ```

2. **Commit Testing Results:**
   ```bash
   git add docs/QA_*.md
   git commit -m "docs: Add QA testing results for Phase 3 broker integration"
   ```

3. **Next Steps:**
   - Deploy to staging environment
   - Begin user acceptance testing
   - Plan Phase 4 (if applicable)

### If Bugs Found 🐛

1. **Document Each Bug:**
   - Use bug report template in QA_BROKER_TESTING_PLAN.md
   - Include: severity, steps to reproduce, expected vs actual
   - Screenshots if applicable

2. **Prioritize:**
   - **Critical:** Blocks all testing, data loss, security issues
   - **High:** Major functionality broken, poor UX
   - **Medium:** Minor functionality issues
   - **Low:** Cosmetic, nice-to-have

3. **Fix and Retest:**
   - Fix critical/high bugs first
   - Retest affected scenarios
   - Update test results

---

## Quick Commands Reference

```bash
# Start development server
npm run dev

# Run unit tests
npm test tests/unit/components/BrokerManagement.test.js

# Run E2E tests
npm test tests/e2e/broker-connection-flow.spec.js

# Check MongoDB
mongosh trade-executor-dev
db.users.findOne({ discordId: "YOUR_ID" })

# Check analytics events
mongosh trade-executor-dev
db.analyticsevents.find({ eventType: "broker_connected" }).sort({ createdAt: -1 })

# View logs
tail -f logs/app.log  # if logging to file
# or check console output
```

---

## Time Estimate

- **Quick Start (Alpaca only):** 30 minutes
- **Basic Testing (2 brokers):** 1 hour
- **Full Testing (all scenarios):** 2-3 hours
- **Bug fixes + retest:** 1-2 hours

**Total:** 4-6 hours for comprehensive QA

---

## Need Help?

**Documentation:**
- 📄 Full QA Plan: `docs/QA_BROKER_TESTING_PLAN.md`
- 📄 Account Setup: `docs/BROKER_TEST_ACCOUNTS_SETUP.md`
- 📄 IBKR Troubleshooting: `docs/MOOMOO_OPEND_TROUBLESHOOTING.md`

**Broker API Docs:**
- Alpaca: https://alpaca.markets/docs/
- IBKR: https://interactivebrokers.github.io/tws-api/
- Kraken: https://docs.kraken.com/rest/

---

## ⭐ Ready to Start?

**Recommended First Steps (30 min):**

1. ✅ Start dev server: `npm run dev`
2. ✅ Set up Alpaca test account (5 min)
3. ✅ Test Alpaca in dashboard (10 min)
4. ✅ Verify all features work (10 min)
5. ✅ Document any issues found (5 min)

**Then decide:**
- Continue with more brokers? → Follow full QA plan
- Found bugs? → Document and fix
- Everything works? → Mark Phase 3 complete! 🎉
