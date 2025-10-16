# Manual UI Testing Guide - Phase 3 QA
**Project:** Discord Trade Executor
**Date:** 2025-10-16
**Server:** http://localhost:5001
**Status:** Ready for Manual Testing

---

## Prerequisites

### Server Requirements
- ✅ Server running on http://localhost:5001 (verified)
- ✅ MongoDB connected and operational
- ✅ All 11 API endpoints verified working
- ✅ Bug #4 fixed: POST /api/brokers/test/:brokerKey endpoint active

### User Requirements
- Discord account for OAuth authentication
- Valid broker credentials for testing:
  - **Alpaca:** API Key + API Secret (paper trading recommended)
  - **IBKR:** Host, Port, Client ID (paper trading recommended)
  - **Kraken:** API Key + Private Key

### Browser Requirements
- Modern browser (Chrome, Firefox, Safari, Edge)
- JavaScript enabled
- Cookies enabled for session management
- Console access for debugging (F12)

---

## Test Execution Checklist

Track your progress through all 10 QA scenarios:

- [ ] **Scenario 1:** Fresh Broker Configuration
- [ ] **Scenario 2:** Connection Testing
- [ ] **Scenario 3:** Broker Switching
- [ ] **Scenario 4:** Error Handling
- [ ] **Scenario 5:** Security Validation
- [ ] **Scenario 6:** Environment Switching
- [ ] **Scenario 7:** Disconnect Functionality
- [ ] **Scenario 8:** Multi-Broker Configuration
- [ ] **Scenario 9:** Persistence Testing
- [ ] **Scenario 10:** Performance Testing

---

## Pre-Test Setup

### Step 1: Verify Server Status

1. Open terminal
2. Run health check:
   ```bash
   curl http://localhost:5001/health
   ```
3. **Expected Result:**
   ```json
   {
     "status": "ok",
     "timestamp": "2025-10-16T...",
     "uptime": 1234.56,
     "websocket": "ready"
   }
   ```

### Step 2: Open Browser Console

1. Navigate to http://localhost:5001
2. Press F12 (or Cmd+Option+I on Mac)
3. Go to Console tab
4. Keep console open to monitor for errors during testing

### Step 3: Clear Previous State (Optional)

If you've tested before and want a fresh start:
1. Clear browser cookies for localhost:5001
2. Clear browser local storage
3. Restart server to reset session

---

## Scenario 1: Fresh Broker Configuration

**Goal:** Verify first-time broker configuration works correctly

### Test Case 1.1: Configure Alpaca Broker

1. **Navigate to Dashboard**
   - [ ] Go to http://localhost:5001
   - [ ] Click "Login with Discord"
   - [ ] Complete Discord OAuth authorization
   - [ ] Verify redirect to dashboard

2. **Access Settings**
   - [ ] Click "Settings" tab in navigation
   - [ ] Verify "Configure Broker" button is visible
   - [ ] Check that broker list is initially empty

3. **Open Configuration Form**
   - [ ] Click "Configure Broker" button
   - [ ] Verify modal/form opens
   - [ ] Confirm broker dropdown shows: Alpaca, IBKR, Kraken

4. **Fill Alpaca Credentials**
   - [ ] Select "Alpaca" from dropdown
   - [ ] Enter API Key: `[Your Alpaca API Key]`
   - [ ] Enter API Secret: `[Your Alpaca API Secret]`
   - [ ] Select Environment: "Testnet" (Paper Trading)

5. **Validate Form Fields**
   - [ ] Verify API Key field shows masked/secure input
   - [ ] Verify API Secret field shows masked/secure input
   - [ ] Verify environment selector works
   - [ ] Check all required fields are marked

6. **Save Configuration**
   - [ ] Click "Save Configuration" button
   - [ ] **Expected:** Success message displayed
   - [ ] **Expected:** Form closes/clears
   - [ ] **Expected:** Alpaca appears in configured brokers list
   - [ ] **Expected:** Status shows "Not Verified" or similar

7. **Verify Database Storage**
   - [ ] Refresh the page
   - [ ] **Expected:** Alpaca still appears in configured list
   - [ ] **Expected:** Credentials are NOT visible in UI
   - [ ] Check browser console for no errors

**Success Criteria:**
- ✅ Form validates all required fields
- ✅ Broker configuration saved successfully
- ✅ Credentials encrypted and stored in database
- ✅ No credentials exposed in browser/console
- ✅ Configuration persists across page refresh

---

### Test Case 1.2: Configure IBKR Broker

1. **Open Configuration Form**
   - [ ] Click "Configure Broker" button again
   - [ ] Select "IBKR" from dropdown

2. **Fill IBKR Credentials**
   - [ ] Enter Host: `127.0.0.1` (or paper trading server)
   - [ ] Enter Port: `7497` (paper trading port)
   - [ ] Enter Client ID: `1` (or your client ID)
   - [ ] Select Environment: "Testnet"

3. **Save and Verify**
   - [ ] Click "Save Configuration"
   - [ ] **Expected:** Success message
   - [ ] **Expected:** IBKR appears in list alongside Alpaca
   - [ ] **Expected:** Both brokers show distinct configurations

**Success Criteria:**
- ✅ Multiple brokers can be configured
- ✅ Each broker maintains separate credentials
- ✅ No conflicts between broker configurations

---

### Test Case 1.3: Configure Kraken Broker

1. **Configure Third Broker**
   - [ ] Click "Configure Broker" button
   - [ ] Select "Kraken" from dropdown
   - [ ] Enter API Key: `[Your Kraken API Key]`
   - [ ] Enter Private Key: `[Your Kraken Private Key]`
   - [ ] Select Environment: "Live" (or "Testnet" if available)

2. **Save and Verify All Three**
   - [ ] Click "Save Configuration"
   - [ ] **Expected:** All 3 brokers now in configured list
   - [ ] **Expected:** Each shows correct broker name/icon
   - [ ] **Expected:** No duplicate entries

**Success Criteria:**
- ✅ All 3 brokers configured successfully
- ✅ UI displays all configurations correctly
- ✅ No performance issues with multiple brokers

---

## Scenario 2: Connection Testing

**Goal:** Verify "Test Connection" functionality for all brokers

### Test Case 2.1: Test Alpaca Connection

1. **Locate Test Button**
   - [ ] Find Alpaca in configured brokers list
   - [ ] Verify "Test Connection" button is visible

2. **Initiate Connection Test**
   - [ ] Click "Test Connection" for Alpaca
   - [ ] **Expected:** Loading indicator appears
   - [ ] **Expected:** Button disabled during test

3. **Verify Successful Connection**
   - [ ] Wait for response (should be < 5 seconds)
   - [ ] **Expected:** Success message displayed
   - [ ] **Expected:** Connection status updates to "Connected" or similar
   - [ ] **Expected:** Balance information displayed
   - [ ] **Expected:** Last verified timestamp appears
   - [ ] Check browser console for API call: `POST /api/brokers/test/alpaca`

4. **Verify Balance Display**
   - [ ] Confirm balance shows (e.g., "$200,000.00" for paper trading)
   - [ ] Verify currency formatting is correct
   - [ ] Check buying power or equity values if shown

**Success Criteria:**
- ✅ Connection test completes successfully
- ✅ Balance retrieved from Alpaca API
- ✅ lastVerified timestamp updated
- ✅ UI reflects current connection status

---

### Test Case 2.2: Test IBKR Connection

1. **Test IBKR Connection**
   - [ ] Click "Test Connection" for IBKR
   - [ ] **Expected:** Similar flow as Alpaca
   - [ ] **Expected:** IBKR-specific balance displayed
   - [ ] Verify connection status updates

2. **Compare with Alpaca**
   - [ ] Both brokers should show as "Connected"
   - [ ] Each displays distinct balance information
   - [ ] lastVerified timestamps are independent

**Success Criteria:**
- ✅ IBKR connection test successful
- ✅ No interference with Alpaca connection
- ✅ Independent status tracking

---

### Test Case 2.3: Test Kraken Connection

1. **Test Kraken Connection**
   - [ ] Click "Test Connection" for Kraken
   - [ ] Verify connection succeeds
   - [ ] Check balance display (may be $0.00 if no funds)

2. **Verify All Three Connected**
   - [ ] All 3 brokers show "Connected" status
   - [ ] All display their respective balances
   - [ ] All have recent lastVerified timestamps

**Success Criteria:**
- ✅ All 3 brokers connect successfully
- ✅ System handles multiple concurrent connections
- ✅ No conflicts or race conditions

---

## Scenario 3: Broker Switching

**Goal:** Verify switching between configured brokers

### Test Case 3.1: Select Different Brokers

1. **Test Broker Selection**
   - [ ] If there's an "Active Broker" selector, test it
   - [ ] Switch from Alpaca → IBKR
   - [ ] **Expected:** UI updates to show IBKR as active
   - [ ] Switch from IBKR → Kraken
   - [ ] **Expected:** UI updates to show Kraken as active

2. **Verify Correct Credentials Used**
   - [ ] After switching to each broker
   - [ ] Click "Test Connection" again
   - [ ] **Expected:** Each broker still connects with its own credentials
   - [ ] **Expected:** Balance matches the selected broker

**Success Criteria:**
- ✅ Broker switching works smoothly
- ✅ Correct credentials used for each broker
- ✅ No credential leakage between brokers

---

## Scenario 4: Error Handling

**Goal:** Verify system handles errors gracefully

### Test Case 4.1: Invalid Credentials

1. **Add Broker with Invalid Credentials**
   - [ ] Click "Configure Broker"
   - [ ] Select any broker (e.g., new Alpaca config)
   - [ ] Enter invalid API Key: `INVALID_KEY_12345`
   - [ ] Enter invalid API Secret: `INVALID_SECRET_67890`
   - [ ] Select environment: "Testnet"
   - [ ] Click "Save Configuration"

2. **Test Invalid Connection**
   - [ ] Click "Test Connection" for invalid broker
   - [ ] **Expected:** Error message displayed
   - [ ] **Expected:** Message is user-friendly (not raw error)
   - [ ] **Expected:** Status shows "Connection Failed" or similar
   - [ ] **Expected:** No crash or unhandled exceptions

3. **Verify Error Details**
   - [ ] Error message should indicate authentication failure
   - [ ] Should NOT expose internal error details
   - [ ] Should NOT show credentials in error message
   - [ ] Check browser console for proper error logging

**Success Criteria:**
- ✅ Invalid credentials handled gracefully
- ✅ User-friendly error messages
- ✅ No sensitive data in error messages
- ✅ System remains stable after error

---

### Test Case 4.2: Network Timeout

1. **Simulate Network Issues**
   - [ ] Open browser DevTools → Network tab
   - [ ] Enable "Offline" mode or throttle to "Slow 3G"
   - [ ] Click "Test Connection" for any broker
   - [ ] **Expected:** Timeout error or network error
   - [ ] **Expected:** Error message indicates connectivity issue

2. **Recovery Test**
   - [ ] Disable "Offline" mode
   - [ ] Click "Test Connection" again
   - [ ] **Expected:** Connection succeeds now
   - [ ] **Expected:** System recovered from previous error

**Success Criteria:**
- ✅ Timeout errors handled gracefully
- ✅ System recovers after network restoration
- ✅ No stale error states

---

### Test Case 4.3: Missing Required Fields

1. **Submit Incomplete Form**
   - [ ] Click "Configure Broker"
   - [ ] Select broker but leave API Key blank
   - [ ] Try to click "Save Configuration"
   - [ ] **Expected:** Form validation prevents submission
   - [ ] **Expected:** Required field highlighted
   - [ ] **Expected:** Helpful validation message

2. **Complete and Resubmit**
   - [ ] Fill in missing fields
   - [ ] **Expected:** Validation passes
   - [ ] **Expected:** Form submits successfully

**Success Criteria:**
- ✅ Form validation prevents incomplete submissions
- ✅ Clear feedback on missing/invalid fields
- ✅ User can correct and resubmit

---

## Scenario 5: Security Validation

**Goal:** Verify credentials are properly secured

### Test Case 5.1: Credential Storage

1. **Inspect Network Traffic**
   - [ ] Open DevTools → Network tab
   - [ ] Configure a new broker
   - [ ] Click "Save Configuration"
   - [ ] Find POST request to `/api/brokers/configure`
   - [ ] **Expected:** Credentials sent over HTTPS (in production)
   - [ ] **Expected:** Credentials encrypted in request body

2. **Check API Responses**
   - [ ] Click "Test Connection" for any broker
   - [ ] Find POST request to `/api/brokers/test/:brokerKey`
   - [ ] Inspect response body
   - [ ] **Expected:** NO credentials in response
   - [ ] **Expected:** Only balance and status returned

3. **Verify Database Encryption**
   - [ ] If you have database access, check stored credentials
   - [ ] **Expected:** Credentials encrypted (AWS KMS)
   - [ ] **Expected:** Not stored in plaintext

**Success Criteria:**
- ✅ Credentials transmitted securely
- ✅ No credentials in API responses
- ✅ Credentials encrypted at rest
- ✅ No sensitive data in browser console/logs

---

### Test Case 5.2: Authentication Requirements

1. **Test Without Login**
   - [ ] Open incognito/private browser window
   - [ ] Navigate to http://localhost:5001/dashboard directly
   - [ ] **Expected:** Redirected to login page
   - [ ] **Expected:** Cannot access dashboard without auth

2. **Test API Endpoints Without Auth**
   - [ ] Open terminal
   - [ ] Try API call without session:
     ```bash
     curl -X POST http://localhost:5001/api/brokers/test/alpaca
     ```
   - [ ] **Expected:** 401 Unauthorized response
   - [ ] **Expected:** Error message about authentication required

**Success Criteria:**
- ✅ Dashboard requires authentication
- ✅ All API endpoints require authentication
- ✅ Proper 401 responses for unauthenticated requests

---

## Scenario 6: Environment Switching

**Goal:** Verify environment (Testnet/Live) switching

### Test Case 6.1: Switch Between Environments

1. **Configure Broker with Testnet**
   - [ ] Configure Alpaca with Testnet environment
   - [ ] Test connection
   - [ ] **Expected:** Connects to paper trading account
   - [ ] Note balance displayed

2. **Reconfigure to Live**
   - [ ] Edit Alpaca configuration (if supported)
   - [ ] Change environment to "Live"
   - [ ] Save changes
   - [ ] **Expected:** Warning about live trading (if implemented)

3. **Test Live Connection**
   - [ ] Click "Test Connection"
   - [ ] **Expected:** Connects to live account
   - [ ] **Expected:** Different balance (likely)
   - [ ] **Expected:** Clear indication of "Live" mode

**Success Criteria:**
- ✅ Can switch between Testnet and Live
- ✅ Correct API endpoints used for each environment
- ✅ Clear UI indication of current environment
- ✅ Warning before live trading operations

---

## Scenario 7: Disconnect Functionality

**Goal:** Verify broker removal works correctly

### Test Case 7.1: Disconnect Single Broker

1. **Prepare State**
   - [ ] Have at least 2 brokers configured
   - [ ] Both should show "Connected" status

2. **Disconnect Alpaca**
   - [ ] Find "Disconnect" or "Remove" button for Alpaca
   - [ ] Click the button
   - [ ] **Expected:** Confirmation dialog appears
   - [ ] **Expected:** Warning about data removal

3. **Confirm Removal**
   - [ ] Confirm the disconnection
   - [ ] **Expected:** Success message
   - [ ] **Expected:** Alpaca removed from list
   - [ ] **Expected:** Other brokers (IBKR, Kraken) still present

4. **Verify Database Cleanup**
   - [ ] Refresh the page
   - [ ] **Expected:** Alpaca still not in list
   - [ ] **Expected:** Credentials removed from database
   - [ ] Try to test connection for removed broker
   - [ ] **Expected:** Broker no longer exists error

**Success Criteria:**
- ✅ Broker successfully removed from list
- ✅ Credentials deleted from database
- ✅ Other brokers unaffected
- ✅ Removal persists across page refresh

---

### Test Case 7.2: Disconnect All Brokers

1. **Remove Remaining Brokers**
   - [ ] Disconnect IBKR
   - [ ] Disconnect Kraken
   - [ ] **Expected:** All brokers removed

2. **Verify Empty State**
   - [ ] **Expected:** Configured brokers list is empty
   - [ ] **Expected:** "Configure Broker" button still available
   - [ ] **Expected:** Helpful message like "No brokers configured"

3. **Reconfigure from Scratch**
   - [ ] Configure Alpaca again
   - [ ] **Expected:** Works as in Scenario 1
   - [ ] **Expected:** No remnants of old configurations

**Success Criteria:**
- ✅ Can remove all brokers
- ✅ Empty state displayed correctly
- ✅ Can reconfigure without issues

---

## Scenario 8: Multi-Broker Operations

**Goal:** Verify simultaneous multi-broker functionality

### Test Case 8.1: Configure All 3 Brokers

1. **Set Up Complete Multi-Broker Environment**
   - [ ] Configure Alpaca (Testnet)
   - [ ] Configure IBKR (Testnet)
   - [ ] Configure Kraken (Live)
   - [ ] **Expected:** All 3 show in list

2. **Test All Connections Simultaneously**
   - [ ] Click "Test Connection" for Alpaca → wait for result
   - [ ] Click "Test Connection" for IBKR → wait for result
   - [ ] Click "Test Connection" for Kraken → wait for result
   - [ ] **Expected:** All 3 connect successfully
   - [ ] **Expected:** Each displays correct balance
   - [ ] **Expected:** No interference between connections

3. **Verify Independent Operations**
   - [ ] Each broker maintains its own:
     - [ ] Connection status
     - [ ] Balance information
     - [ ] Last verified timestamp
     - [ ] Environment setting

**Success Criteria:**
- ✅ All 3 brokers operate independently
- ✅ No cross-contamination of data
- ✅ UI handles multiple brokers cleanly

---

### Test Case 8.2: Concurrent Connection Tests

1. **Rapid Sequential Tests**
   - [ ] Click "Test Connection" for Alpaca
   - [ ] Immediately click "Test Connection" for IBKR
   - [ ] Immediately click "Test Connection" for Kraken
   - [ ] **Expected:** All 3 tests complete successfully
   - [ ] **Expected:** Results display correctly for each
   - [ ] **Expected:** No race conditions or errors

2. **Verify No Data Mix-Up**
   - [ ] Check Alpaca shows Alpaca balance (not IBKR's)
   - [ ] Check IBKR shows IBKR balance (not Kraken's)
   - [ ] Check Kraken shows Kraken balance (not Alpaca's)

**Success Criteria:**
- ✅ Concurrent operations handled correctly
- ✅ No data corruption or mix-ups
- ✅ System remains responsive

---

## Scenario 9: Persistence Testing

**Goal:** Verify configurations persist across sessions

### Test Case 9.1: Configuration Persistence

1. **Configure and Verify**
   - [ ] Configure at least 2 brokers (e.g., Alpaca and IBKR)
   - [ ] Test connections for both
   - [ ] Note the balance and status for each

2. **Log Out**
   - [ ] Click logout button
   - [ ] **Expected:** Redirected to login page
   - [ ] **Expected:** Session cleared

3. **Log Back In**
   - [ ] Log in with same Discord account
   - [ ] Navigate to Settings tab
   - [ ] **Expected:** Both brokers still configured
   - [ ] **Expected:** Status preserved (or shows "Needs verification")

4. **Test Connections Again**
   - [ ] Click "Test Connection" for both brokers
   - [ ] **Expected:** Both connect successfully
   - [ ] **Expected:** Credentials still work
   - [ ] **Expected:** Balances retrieved correctly

**Success Criteria:**
- ✅ Configurations persist after logout
- ✅ Credentials remain encrypted and functional
- ✅ User can resume work without reconfiguring

---

### Test Case 9.2: Browser Restart Persistence

1. **Configure Brokers**
   - [ ] Configure all 3 brokers
   - [ ] Test connections

2. **Close and Restart Browser**
   - [ ] Close browser completely
   - [ ] Reopen browser
   - [ ] Navigate to http://localhost:5001
   - [ ] Log in again

3. **Verify Persistence**
   - [ ] **Expected:** All 3 brokers still configured
   - [ ] **Expected:** Can test connections immediately
   - [ ] **Expected:** No data loss

**Success Criteria:**
- ✅ Data persists across browser restarts
- ✅ Database storage reliable
- ✅ No session-only storage issues

---

## Scenario 10: Performance Testing

**Goal:** Verify system responsiveness and speed

### Test Case 10.1: Connection Test Performance

1. **Measure Connection Test Speed**
   - [ ] Open browser DevTools → Network tab
   - [ ] Enable "Disable cache"
   - [ ] Clear all filters
   - [ ] Click "Test Connection" for Alpaca
   - [ ] Find POST request to `/api/brokers/test/alpaca`
   - [ ] Note response time
   - [ ] **Expected:** Response < 5 seconds
   - [ ] **Expected:** Preferably < 3 seconds

2. **Test All Brokers**
   - [ ] Repeat for IBKR
   - [ ] Repeat for Kraken
   - [ ] **Expected:** All complete within reasonable time
   - [ ] **Expected:** UI remains responsive during tests

**Performance Targets:**
- Connection test: < 5 seconds
- API response: < 3 seconds
- UI update: < 500ms
- Page load: < 2 seconds

---

### Test Case 10.2: UI Responsiveness

1. **Test Form Interactions**
   - [ ] Open "Configure Broker" form
   - [ ] Type in fields
   - [ ] **Expected:** No input lag
   - [ ] Switch between dropdowns
   - [ ] **Expected:** Smooth transitions

2. **Test With Multiple Brokers**
   - [ ] Configure 3 brokers
   - [ ] Scroll through broker list
   - [ ] **Expected:** No performance degradation
   - [ ] Click various buttons
   - [ ] **Expected:** Responsive UI

3. **Monitor Resource Usage**
   - [ ] Open browser Task Manager (Chrome: Shift+Esc)
   - [ ] Check memory usage
   - [ ] Check CPU usage
   - [ ] **Expected:** Reasonable resource consumption
   - [ ] **Expected:** No memory leaks over time

**Success Criteria:**
- ✅ Fast response times
- ✅ Smooth UI interactions
- ✅ No performance issues with multiple brokers
- ✅ Efficient resource usage

---

## Edge Cases and Additional Tests

### Edge Case 1: Duplicate Configuration Attempt

1. **Try to Configure Same Broker Twice**
   - [ ] Configure Alpaca
   - [ ] Try to configure Alpaca again with different credentials
   - [ ] **Expected:** System handles gracefully (update or prevent duplicate)

---

### Edge Case 2: Special Characters in Credentials

1. **Test with Special Characters**
   - [ ] Configure broker with API key containing special chars: `! @ # $ % & *`
   - [ ] **Expected:** Properly escaped and stored
   - [ ] Test connection
   - [ ] **Expected:** Works correctly

---

### Edge Case 3: Very Long Session

1. **Test Long Session**
   - [ ] Keep dashboard open for 30+ minutes
   - [ ] Try to test connection
   - [ ] **Expected:** Still works (or prompts re-authentication)

---

## Test Results Summary

After completing all tests, fill out this summary:

| Scenario | Status | Notes | Issues Found |
|----------|--------|-------|--------------|
| 1. Fresh Broker Configuration | ⬜ Pass / ⬜ Fail |  |  |
| 2. Connection Testing | ⬜ Pass / ⬜ Fail |  |  |
| 3. Broker Switching | ⬜ Pass / ⬜ Fail |  |  |
| 4. Error Handling | ⬜ Pass / ⬜ Fail |  |  |
| 5. Security Validation | ⬜ Pass / ⬜ Fail |  |  |
| 6. Environment Switching | ⬜ Pass / ⬜ Fail |  |  |
| 7. Disconnect Functionality | ⬜ Pass / ⬜ Fail |  |  |
| 8. Multi-Broker Operations | ⬜ Pass / ⬜ Fail |  |  |
| 9. Persistence Testing | ⬜ Pass / ⬜ Fail |  |  |
| 10. Performance Testing | ⬜ Pass / ⬜ Fail |  |  |

---

## Issue Tracking Template

For any bugs or issues found during testing, document them here:

### Issue #[N]: [Brief Description]
**Severity:** Critical / High / Medium / Low
**Scenario:** [Which test scenario]
**Steps to Reproduce:**
1.
2.
3.

**Expected Behavior:**

**Actual Behavior:**

**Screenshots/Logs:**

**Browser/Environment:**

**Additional Notes:**

---

## Completion Checklist

After finishing all tests:

- [ ] All 10 scenarios tested
- [ ] All test cases within scenarios completed
- [ ] Test results summary filled out
- [ ] Any issues documented with details
- [ ] Screenshots captured for critical issues
- [ ] Console logs saved for errors
- [ ] Performance metrics recorded

---

## Final Sign-Off

**Tester:** ___________________
**Date:** ___________________
**Overall Result:** ⬜ Pass / ⬜ Fail
**Ready for Production:** ⬜ Yes / ⬜ No

**Comments:**

---

**Document Created:** 2025-10-16
**Last Updated:** 2025-10-16
**Version:** 1.0
