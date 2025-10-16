# Broker Connection QA Testing Plan

## Overview
Comprehensive manual QA testing plan for Phase 3: UI Integration of broker connections.

**Testing Date:** 2025-01-16
**Tester:** [Your Name]
**Environment:** Development (localhost:3000)
**Version:** main branch (commit 2c8b804)

---

## Pre-Testing Setup

### 1. Environment Configuration

**Required Environment Variables:**
```bash
# AWS KMS for credential encryption
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<your-aws-key>
AWS_SECRET_ACCESS_KEY=<your-aws-secret>
KMS_KEY_ID=<your-kms-key-id>

# Database
MONGODB_URI=mongodb://localhost:27017/trade-executor-dev

# Session
SESSION_SECRET=<strong-secret-key>

# Application
NODE_ENV=development
PORT=3000
```

**Verify Services Running:**
```bash
# Check MongoDB
mongosh --eval "db.runCommand({ ping: 1 })"

# Check Redis (if used for sessions)
redis-cli ping

# Check AWS KMS access
aws kms describe-key --key-id $KMS_KEY_ID
```

**Start Development Server:**
```bash
npm run dev
# or
npm start
```

---

## Test Account Setup

### Stock Brokers

#### 1. Alpaca (Paper Trading)
- **Sign up:** https://app.alpaca.markets/signup
- **Enable Paper Trading:** Account → Paper Trading
- **Get API Keys:** Account → API Keys → Generate New Key
- **Required Info:**
  - API Key ID
  - API Secret Key
  - Paper Trading endpoint: https://paper-api.alpaca.markets

#### 2. Interactive Brokers (Paper Trading)
- **Sign up:** https://www.interactivebrokers.com/en/trading/paper-trading-account.php
- **Download TWS/Gateway:** https://www.interactivebrokers.com/en/trading/tws.php
- **Set up IB Gateway:** Enable API access, port 4001/4002
- **Required Info:**
  - Account ID (starts with 'DU' for paper)
  - TWS/Gateway running locally
  - API access enabled

#### 3. Moomoo (Paper Trading)
- **Download OpenD:** https://www.moomoo.com/us/support/topic3_596
- **Sign up:** https://www.moomoo.com/us/
- **Enable Paper Trading:** Settings → Paper Trading
- **Required Info:**
  - Account credentials
  - OpenD Gateway running locally
  - Market data subscriptions

#### 4. Schwab (Paper Trading)
- **Sign up:** https://client.schwab.com/app/sim/login
- **Enable API Access:** Need to apply for developer access
- **Required Info:**
  - Consumer Key
  - Consumer Secret
  - OAuth 2.0 redirect URI

### Crypto Exchanges

#### 5. Coinbase Pro (Testnet/Sandbox)
- **Sign up:** https://pro.coinbase.com/
- **Enable API:** Settings → API → New API Key
- **Testnet:** https://public.sandbox.pro.coinbase.com
- **Required Info:**
  - API Key
  - API Secret
  - Passphrase (if required)

#### 6. Kraken (Demo Account)
- **Sign up:** https://www.kraken.com/sign-up
- **Enable API:** Settings → API → Generate New Key
- **Demo:** https://demo-futures.kraken.com
- **Required Info:**
  - API Key
  - Private Key
  - Permissions (read, trade)

---

## Test Scenarios

### Scenario 1: First-Time Broker Connection (Stock)

**Objective:** Connect Alpaca paper trading account for the first time

**Pre-conditions:**
- User logged into dashboard
- No brokers currently connected
- Alpaca test account created with API keys

**Test Steps:**

1. **Navigate to Settings**
   - [ ] Click "Settings" tab in navigation
   - [ ] Verify Settings page loads
   - [ ] Expected: BrokerConfigWizard button visible

2. **Open Broker Configuration Wizard**
   - [ ] Click "Configure Broker" or "Add Broker" button
   - [ ] Verify wizard modal/dialog opens
   - [ ] Expected: Step 1 - Broker Type Selection visible

3. **Select Broker Type**
   - [ ] Click "Stock Brokers" button
   - [ ] Verify button highlights/activates
   - [ ] Click "Next" or auto-advance
   - [ ] Expected: Step 2 - Broker Selection visible

4. **Select Broker**
   - [ ] Verify Alpaca appears in broker list
   - [ ] Verify broker logo/icon displays correctly
   - [ ] Click "Alpaca" card
   - [ ] Expected: Step 3 - Authentication Method visible

5. **Select Authentication Method**
   - [ ] Verify "API Key" option available
   - [ ] Click "API Key" button
   - [ ] Expected: Step 4 - Credentials Input visible

6. **Enter Credentials**
   - [ ] Enter API Key ID in "API Key" field
   - [ ] Enter API Secret Key in "API Secret" field
   - [ ] Verify password field masking works (eye icon toggle)
   - [ ] Select "Paper Trading" environment
   - [ ] Expected: All fields accept input, validation works

7. **Test Connection**
   - [ ] Click "Test Connection" button
   - [ ] Verify button shows loading state ("Testing...")
   - [ ] Verify button is disabled during test
   - [ ] Wait for response (should be < 5 seconds)
   - [ ] **Expected Success:**
     - ✅ Green success message appears
     - ✅ Account balance displays
     - ✅ "Save Configuration" button enables
   - [ ] **If Failure:**
     - ❌ Red error message with specific reason
     - ❌ "Save Configuration" button remains disabled
     - ❌ Can retry with different credentials

8. **Save Configuration**
   - [ ] Click "Save Configuration" or "Finish" button
   - [ ] Verify loading state during save
   - [ ] Verify success message appears
   - [ ] Verify wizard closes
   - [ ] Expected: Returns to Settings page

9. **Verify in BrokerManagement**
   - [ ] Scroll to BrokerManagement section
   - [ ] Verify Alpaca broker card appears
   - [ ] Verify displays: "Alpaca" name
   - [ ] Verify displays: "Stocks" badge
   - [ ] Verify displays: "Paper Trading" badge
   - [ ] Verify displays: "API Key" auth method
   - [ ] Verify displays: Configured date
   - [ ] Verify displays: Last verified date
   - [ ] Expected: All information accurate

10. **Test Connection from Management View**
    - [ ] Click "Test Connection" button on Alpaca card
    - [ ] Verify loading state with spinning icon
    - [ ] Verify button disabled during test
    - [ ] Wait for response
    - [ ] Verify success alert appears with balance
    - [ ] Expected: Connection successful, balance shown

**Success Criteria:**
- ✅ Complete flow from selection to save works smoothly
- ✅ Connection test succeeds with real credentials
- ✅ Broker appears in management view with correct info
- ✅ Can test connection again from management view
- ✅ No console errors during flow

---

### Scenario 2: Connect Crypto Exchange

**Objective:** Connect Kraken exchange for crypto trading

**Pre-conditions:**
- User logged into dashboard
- Kraken test account created with API keys

**Test Steps:**

1. **Open Wizard**
   - [ ] Navigate to Settings
   - [ ] Click "Configure Broker" button

2. **Select Crypto Type**
   - [ ] Click "Crypto Exchanges" button
   - [ ] Verify crypto brokers list appears

3. **Select Kraken**
   - [ ] Click "Kraken" card
   - [ ] Verify Kraken details display

4. **Enter API Credentials**
   - [ ] Enter Kraken API Key
   - [ ] Enter Kraken Private Key
   - [ ] Select environment (Live/Testnet)

5. **Test and Save**
   - [ ] Test connection
   - [ ] Verify balance retrieval works
   - [ ] Save configuration

6. **Verify Multi-Broker Display**
   - [ ] Verify both Alpaca and Kraken cards visible
   - [ ] Verify different icons for stock vs crypto
   - [ ] Verify security alert still displays

**Success Criteria:**
- ✅ Can connect multiple brokers simultaneously
- ✅ Crypto broker connection works same as stock broker
- ✅ Both brokers display correctly in management view

---

### Scenario 3: Test Connection Failure Handling

**Objective:** Verify proper error handling for invalid credentials

**Test Steps:**

1. **Attempt Connection with Invalid Credentials**
   - [ ] Open wizard, select broker
   - [ ] Enter INVALID API key (e.g., "invalid-key-123")
   - [ ] Enter INVALID secret (e.g., "invalid-secret-456")
   - [ ] Click "Test Connection"

2. **Verify Error Handling**
   - [ ] Verify error message displays
   - [ ] Verify error is specific (not generic)
   - [ ] Verify "Save" button remains disabled
   - [ ] Verify can modify credentials and retry
   - [ ] Verify no partial data saved

3. **Retry with Correct Credentials**
   - [ ] Clear fields
   - [ ] Enter VALID credentials
   - [ ] Test connection
   - [ ] Verify success this time

**Success Criteria:**
- ✅ Clear error messages for invalid credentials
- ✅ Cannot save invalid configuration
- ✅ Can retry without restarting wizard
- ✅ No data corruption from failed attempts

---

### Scenario 4: Disconnect Broker

**Objective:** Remove broker connection safely

**Test Steps:**

1. **Navigate to BrokerManagement**
   - [ ] Go to Settings tab
   - [ ] Locate configured broker card

2. **Initiate Disconnect**
   - [ ] Click trash/delete icon button
   - [ ] Verify confirmation dialog appears
   - [ ] Verify dialog shows broker name
   - [ ] Verify dialog warns about action

3. **Cancel Disconnect**
   - [ ] Click "Cancel" on confirmation
   - [ ] Verify dialog closes
   - [ ] Verify broker still present
   - [ ] Verify no changes made

4. **Confirm Disconnect**
   - [ ] Click delete button again
   - [ ] Click "Confirm" or "Yes"
   - [ ] Verify loading/processing indication
   - [ ] Verify broker card disappears
   - [ ] If last broker: verify empty state displays

**Success Criteria:**
- ✅ Confirmation required before deletion
- ✅ Can cancel without consequences
- ✅ Successful deletion removes broker
- ✅ Empty state appears when no brokers

---

### Scenario 5: Multiple Broker Management

**Objective:** Connect and manage all 6 brokers simultaneously

**Test Steps:**

1. **Connect All Stock Brokers**
   - [ ] Connect Alpaca (paper)
   - [ ] Connect IBKR (paper)
   - [ ] Connect Moomoo (paper)
   - [ ] Connect Schwab (paper)
   - [ ] Verify all 4 stock brokers display

2. **Connect All Crypto Exchanges**
   - [ ] Connect Coinbase Pro
   - [ ] Connect Kraken
   - [ ] Verify all 2 crypto exchanges display

3. **Verify Display**
   - [ ] All 6 broker cards visible
   - [ ] Grid layout works correctly
   - [ ] Responsive on mobile (375px width)
   - [ ] Responsive on tablet (768px width)
   - [ ] Responsive on desktop (1440px width)

4. **Test All Connections**
   - [ ] Test each broker connection
   - [ ] Verify all succeed (or expected failures noted)
   - [ ] Verify no conflicts between brokers

**Success Criteria:**
- ✅ Can connect maximum number of brokers
- ✅ UI handles multiple brokers gracefully
- ✅ No performance issues with 6 brokers
- ✅ Responsive at all breakpoints

---

### Scenario 6: Premium Tier Gating (if applicable)

**Objective:** Verify tier limits enforced

**Test Steps:**

1. **Test Free Tier Limit**
   - [ ] Create/use free tier account
   - [ ] Attempt to connect 2nd broker
   - [ ] Verify limit enforcement message
   - [ ] Verify upgrade prompt appears

2. **Test Pro Tier Limit**
   - [ ] Upgrade to Pro tier
   - [ ] Verify can connect multiple brokers
   - [ ] Verify limit matches tier settings

**Success Criteria:**
- ✅ Tier limits properly enforced
- ✅ Clear upgrade messaging
- ✅ Premium tiers have expected limits

---

### Scenario 7: Paper Trading Execution (IBKR/Schwab)

**Objective:** Execute real paper trade through connected broker

**Pre-conditions:**
- IBKR or Schwab connected in paper trading mode
- Sufficient paper trading balance

**Test Steps:**

1. **Create Test Signal**
   - [ ] Navigate to signal creation or Discord integration
   - [ ] Create BUY signal for AAPL (or test symbol)
   - [ ] Specify: Symbol, Action, Quantity, Price (optional)

2. **Execute Trade**
   - [ ] Verify trade executor picks up signal
   - [ ] Verify broker selection logic works
   - [ ] Verify order sent to broker
   - [ ] Monitor execution logs

3. **Verify Trade Execution**
   - [ ] Check broker account for filled order
   - [ ] Verify correct symbol, quantity, price
   - [ ] Verify trade recorded in dashboard
   - [ ] Verify balance updated

4. **Test Order Types**
   - [ ] Test MARKET order
   - [ ] Test LIMIT order
   - [ ] Test STOP LOSS order
   - [ ] Test TAKE PROFIT order

**Success Criteria:**
- ✅ Orders execute successfully in paper trading
- ✅ Correct broker receives order
- ✅ Order details match signal
- ✅ Dashboard reflects executed trades

---

### Scenario 8: Rate Limiting

**Objective:** Verify rate limiting protects broker APIs

**Test Steps:**

1. **Rapid Connection Tests**
   - [ ] Test connection 10 times in rapid succession
   - [ ] Verify rate limiting kicks in
   - [ ] Verify clear rate limit message
   - [ ] Verify retry-after time shown

2. **Rapid Configuration Attempts**
   - [ ] Try to save 5 brokers rapidly
   - [ ] Verify rate limiting prevents abuse
   - [ ] Verify graceful error handling

**Success Criteria:**
- ✅ Rate limiting active on broker endpoints
- ✅ Clear messaging when limited
- ✅ No broker API abuse possible

---

### Scenario 9: Security Validation

**Objective:** Verify credentials properly encrypted

**Test Steps:**

1. **Database Inspection**
   ```bash
   mongosh trade-executor-dev
   db.users.findOne({ discordId: "YOUR_DISCORD_ID" })
   ```
   - [ ] Verify brokerConfigs exists
   - [ ] Verify credentials.encrypted is present
   - [ ] Verify credentials.iv is present
   - [ ] Verify credentials.authTag is present
   - [ ] Verify NO plain text API keys visible

2. **Decryption Test**
   - [ ] Test connection uses encrypted credentials
   - [ ] Verify decryption successful
   - [ ] Verify connection works with decrypted creds

**Success Criteria:**
- ✅ All credentials encrypted in database
- ✅ No plain text secrets visible
- ✅ Decryption works correctly
- ✅ AES-256-GCM encryption verified

---

### Scenario 10: Analytics Events

**Objective:** Verify broker connection events tracked

**Test Steps:**

1. **Check Analytics Integration**
   - [ ] Connect new broker
   - [ ] Check database for analytics event:
   ```bash
   db.analyticsevents.find({ eventType: "broker_connected" }).sort({ createdAt: -1 }).limit(1)
   ```
   - [ ] Verify event contains:
     - eventType: "broker_connected"
     - userId
     - broker name
     - accountType (stock/crypto)
     - timestamp

2. **Check Disconnect Events**
   - [ ] Disconnect broker
   - [ ] Verify "broker_disconnected" event created

**Success Criteria:**
- ✅ broker_connected events logged
- ✅ broker_disconnected events logged
- ✅ Events contain correct metadata

---

## Bug Tracking Template

### Bug Report Format

```markdown
## Bug #[NUMBER]: [Brief Description]

**Severity:** Critical / High / Medium / Low
**Status:** Open / In Progress / Fixed / Closed

**Environment:**
- Browser: [Chrome 120 / Firefox 121 / Safari 17]
- OS: [macOS 14 / Windows 11 / Ubuntu 22.04]
- Server: Development (localhost:3000)

**Steps to Reproduce:**
1.
2.
3.

**Expected Behavior:**
[What should happen]

**Actual Behavior:**
[What actually happened]

**Screenshots:**
[If applicable]

**Console Errors:**
```
[Paste any console errors]
```

**Database State:**
[If relevant]

**Suggested Fix:**
[If known]
```

---

## Test Results Summary

### Completion Checklist

- [ ] Scenario 1: First-Time Stock Broker Connection
- [ ] Scenario 2: Crypto Exchange Connection
- [ ] Scenario 3: Connection Failure Handling
- [ ] Scenario 4: Broker Disconnection
- [ ] Scenario 5: Multiple Broker Management
- [ ] Scenario 6: Premium Tier Gating
- [ ] Scenario 7: Paper Trading Execution
- [ ] Scenario 8: Rate Limiting
- [ ] Scenario 9: Security Validation
- [ ] Scenario 10: Analytics Events

### Overall Results

**Total Tests:** 10
**Passed:** ___
**Failed:** ___
**Blocked:** ___

**Bugs Found:** ___
**Critical:** ___
**High:** ___
**Medium:** ___
**Low:** ___

**Sign Off:**
- QA Tester: ________________ Date: __________
- Developer: ________________ Date: __________
- Product Owner: ____________ Date: __________

---

## Next Steps After QA

1. **If All Tests Pass:**
   - Mark Phase 3 as production-ready
   - Update BROKER_INTEGRATION_STATUS.md
   - Begin Phase 4 planning (if applicable)
   - Deploy to staging environment

2. **If Bugs Found:**
   - Prioritize by severity
   - Create GitHub issues for each bug
   - Fix critical/high bugs before deployment
   - Retest after fixes

3. **Documentation Updates:**
   - Update user documentation with broker setup guides
   - Create video tutorials for broker connection
   - Update FAQ with common issues
   - Document supported brokers and features

---

## Appendix: Quick Reference

### Broker API Documentation Links

- **Alpaca:** https://alpaca.markets/docs/api-references/trading-api/
- **Interactive Brokers:** https://interactivebrokers.github.io/tws-api/
- **Moomoo:** https://www.moomoo.com/us/support/topic3_596
- **Schwab:** https://developer.schwab.com/
- **Coinbase Pro:** https://docs.cloud.coinbase.com/
- **Kraken:** https://docs.kraken.com/rest/

### Common Test Credentials Format

```javascript
// Alpaca Paper Trading
{
  apiKey: "PK...",  // Starts with PK for paper
  apiSecret: "...",
  environment: "testnet"
}

// Coinbase Pro Sandbox
{
  apiKey: "...",
  apiSecret: "...",
  passphrase: "...",
  environment: "testnet"
}

// Kraken
{
  apiKey: "...",
  privateKey: "...",
  environment: "live" // No testnet
}
```

### MongoDB Queries for Debugging

```javascript
// Find user's broker configs
db.users.findOne(
  { discordId: "YOUR_ID" },
  { brokerConfigs: 1 }
)

// Check analytics events
db.analyticsevents.find({
  eventType: { $in: ["broker_connected", "broker_disconnected"] }
}).sort({ createdAt: -1 })

// Check trades from broker
db.trades.find({
  broker: "alpaca"
}).sort({ createdAt: -1 })
```
