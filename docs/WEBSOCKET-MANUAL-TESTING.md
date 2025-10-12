# WebSocket Real-Time Updates - Manual Testing Checklist

## Overview

This manual testing checklist ensures WebSocket real-time features work correctly across all supported browsers and platforms before production deployment.

**Target Areas:**
- Real-time portfolio updates
- Live trade notifications
- Live watchlist quotes
- Connection resilience
- Multi-tab behavior
- Mobile experience

**Test Duration:** ~45 minutes per browser
**Required Tools:** Chrome DevTools, Firefox DevTools, Safari Web Inspector

---

## Prerequisites

### Test Environment Setup

1. **Start the Application:**
   ```bash
   npm start
   ```

2. **Open Browser DevTools:**
   - **Chrome/Edge:** F12 or Cmd+Option+I (Mac)
   - **Firefox:** F12 or Cmd+Option+I (Mac)
   - **Safari:** Enable Dev menu in Preferences → Advanced → "Show Develop menu"

3. **Navigate to Dashboard:**
   ```
   http://localhost:5000/dashboard
   ```

4. **Login with Test Account:**
   - Email: `test@example.com`
   - Password: `test123`

---

## Test Suite

### 1. Cross-Browser Connection Tests

#### 1.1 Chrome Desktop

**Steps:**
1. Open dashboard in Chrome
2. Open DevTools → Network tab
3. Filter by "WS" (WebSocket connections)
4. Verify WebSocket connection established
5. Check connection status indicator (should show "Connected")

**Expected Results:**
- [x] WebSocket connection appears in Network tab
- [x] Status shows `101 Switching Protocols`
- [x] Connection indicator shows "Connected" or green dot
- [x] No console errors related to WebSocket

**Screenshot Location:** `screenshots/chrome-ws-connection.png`

---

#### 1.2 Firefox Desktop

**Steps:**
1. Open dashboard in Firefox
2. Open DevTools → Network tab → WS filter
3. Verify WebSocket connection
4. Check for any Firefox-specific issues

**Expected Results:**
- [x] WebSocket connection successful
- [x] No CORS errors
- [x] Connection indicator shows connected state
- [x] Real-time updates work correctly

**Screenshot Location:** `screenshots/firefox-ws-connection.png`

---

#### 1.3 Safari Desktop

**Steps:**
1. Open dashboard in Safari
2. Open Web Inspector → Network tab
3. Filter by "WebSocket"
4. Verify connection and check for Safari-specific issues

**Expected Results:**
- [x] WebSocket connection established
- [x] No Safari compatibility warnings
- [x] Connection indicator functional
- [x] Real-time features work correctly

**Notes:** Safari may have stricter security policies - verify CORS settings

**Screenshot Location:** `screenshots/safari-ws-connection.png`

---

#### 1.4 Mobile Chrome (Android/iOS)

**Steps:**
1. Open dashboard on mobile Chrome
2. Access via Chrome DevTools → Remote Debugging (Android) or Safari → Develop menu (iOS)
3. Verify WebSocket connection
4. Test touch interactions

**Expected Results:**
- [x] Connection works on mobile network
- [x] UI responsive and usable on small screens
- [x] No mobile-specific connection issues
- [x] Touch events don't interfere with WebSocket

**Screenshot Location:** `screenshots/mobile-chrome-ws.png`

---

#### 1.5 Mobile Safari (iOS)

**Steps:**
1. Open dashboard on iPhone/iPad
2. Connect to Mac → Safari → Develop → [Device] → Dashboard
3. Verify WebSocket connection in Web Inspector
4. Test iOS-specific behaviors

**Expected Results:**
- [x] Connection works correctly on iOS
- [x] No iOS-specific errors
- [x] Background tab behavior works as expected
- [x] Real-time updates work after app backgrounding

**Screenshot Location:** `screenshots/mobile-safari-ws.png`

---

### 2. Real-Time Portfolio Updates

#### 2.1 Initial Portfolio Load

**Steps:**
1. Login to dashboard
2. Wait for WebSocket connection
3. Verify portfolio data loads

**Expected Results:**
- [x] Portfolio total value displays correctly
- [x] Cash and equity breakdown shown
- [x] Position list populated
- [x] Day change percentage calculated

**Data Validation:**
- Total Value: `$______`
- Cash: `$______`
- Equity: `$______`
- Positions: `____ items`

---

#### 2.2 Live Portfolio Updates

**Steps:**
1. Place a trade via Discord or API
2. Monitor dashboard for real-time update
3. Verify portfolio reflects new values

**Expected Results:**
- [x] Portfolio updates within 2 seconds of trade execution
- [x] Values update smoothly (no flickering)
- [x] Percentage changes recalculated correctly
- [x] Position list updates with new trade

**Timing:**
- Trade executed at: `______`
- Portfolio updated at: `______`
- Latency: `______ ms`

---

#### 2.3 Market Hours Updates

**Steps:**
1. Monitor portfolio during market hours
2. Verify real-time price updates for positions
3. Check update frequency

**Expected Results:**
- [x] Position values update as market moves
- [x] Total portfolio value recalculates
- [x] Updates occur every 1-5 seconds during active trading
- [x] No excessive CPU usage from updates

---

### 3. Live Trade Notifications

#### 3.1 Trade Execution Notifications

**Steps:**
1. Execute a buy order
2. Watch for toast notification
3. Verify notification content

**Expected Results:**
- [x] Notification appears immediately (< 1 second)
- [x] Shows correct: symbol, side, quantity, price
- [x] Success notification is green
- [x] Notification auto-dismisses after 5 seconds

**Example:**
```
✅ BUY 10 AAPL @ $175.50
```

---

#### 3.2 Trade Failure Notifications

**Steps:**
1. Attempt trade with insufficient funds
2. Watch for error notification
3. Verify error message clarity

**Expected Results:**
- [x] Error notification appears immediately
- [x] Clear error message displayed
- [x] Error notification is red
- [x] User can dismiss manually

**Example:**
```
❌ Trade failed: Insufficient funds
```

---

#### 3.3 Notification Queue Management

**Steps:**
1. Execute multiple trades rapidly (3-5 trades)
2. Observe notification behavior
3. Verify all notifications display

**Expected Results:**
- [x] Notifications stack vertically
- [x] Maximum 5 visible at once
- [x] Oldest notifications dismiss first
- [x] No notifications lost or skipped

---

### 4. Live Watchlist Quotes

#### 4.1 Watchlist Subscription

**Steps:**
1. Add symbols to watchlist (AAPL, TSLA, NVDA)
2. Verify WebSocket subscription
3. Monitor real-time price updates

**Expected Results:**
- [x] Subscription confirmed in DevTools
- [x] Prices update in real-time
- [x] Price changes show green (up) or red (down)
- [x] Percentage changes calculated correctly

---

#### 4.2 Watchlist Update Frequency

**Steps:**
1. Monitor watchlist during active trading
2. Note update frequency
3. Verify no missed updates

**Expected Results:**
- [x] Updates every 1-3 seconds during market hours
- [x] No stale data (verify with external source)
- [x] Smooth updates (no flickering)
- [x] Timestamps show recent updates

---

#### 4.3 Watchlist Symbol Management

**Steps:**
1. Add new symbol to watchlist
2. Remove symbol from watchlist
3. Verify subscription changes

**Expected Results:**
- [x] New symbol starts receiving updates immediately
- [x] Removed symbol stops receiving updates
- [x] No memory leaks from unsubscribed symbols
- [x] WebSocket messages decrease after removal

---

### 5. Connection Resilience Tests

#### 5.1 Network Interruption

**Steps:**
1. Establish WebSocket connection
2. Disable network (Airplane mode or DevTools offline)
3. Wait 5 seconds
4. Re-enable network
5. Verify auto-reconnection

**Expected Results:**
- [x] Connection indicator shows "Disconnected"
- [x] UI shows reconnection attempt
- [x] Auto-reconnects within 5 seconds
- [x] Subscriptions restored after reconnection
- [x] No data loss or duplicate notifications

**Reconnection Time:** `______ seconds`

---

#### 5.2 Server Restart

**Steps:**
1. Establish connection
2. Restart server: `npm restart`
3. Monitor dashboard behavior
4. Verify reconnection

**Expected Results:**
- [x] Client detects server disconnect
- [x] Shows "Reconnecting..." message
- [x] Reconnects automatically when server available
- [x] Full functionality restored

---

#### 5.3 Poor Network Conditions

**Steps:**
1. Open DevTools → Network tab
2. Enable throttling: "Slow 3G"
3. Test WebSocket functionality
4. Verify graceful degradation

**Expected Results:**
- [x] Connection maintained on slow network
- [x] Updates still arrive (with delay)
- [x] No timeout errors
- [x] UI remains responsive

**Notes:** Updates may be delayed by 2-5 seconds on slow 3G

---

#### 5.4 Rate Limiting Behavior

**Steps:**
1. Rapidly subscribe/unsubscribe to portfolio (10+ times)
2. Monitor for rate limit errors
3. Verify rate limit message

**Expected Results:**
- [x] Rate limit triggered after excessive requests
- [x] Error message clear: "Rate limit exceeded"
- [x] Connection maintained (not disconnected)
- [x] Normal operation resumes after cooldown

---

### 6. Multi-Tab Behavior

#### 6.1 Multiple Tabs Same User

**Steps:**
1. Open dashboard in 3 separate tabs
2. Verify all tabs connect successfully
3. Execute trade in one tab
4. Verify updates in all tabs

**Expected Results:**
- [x] All tabs establish separate connections
- [x] All tabs receive same updates
- [x] No connection limit errors (max 5 per user)
- [x] Updates synchronized across tabs

---

#### 6.2 Tab Close Behavior

**Steps:**
1. Open 3 tabs
2. Close 1 tab
3. Verify remaining tabs unaffected
4. Check server connection count

**Expected Results:**
- [x] Closed tab disconnects cleanly
- [x] Other tabs remain connected
- [x] No memory leaks
- [x] Server connection count decreases by 1

---

#### 6.3 Connection Limit Enforcement

**Steps:**
1. Open 5 tabs (max allowed per user)
2. Attempt to open 6th tab
3. Verify connection rejection

**Expected Results:**
- [x] First 5 tabs connect successfully
- [x] 6th tab shows error: "Too many connections (max 5)"
- [x] Error message clear and user-friendly
- [x] User can close tab to make room

---

### 7. Mobile-Specific Tests

#### 7.1 Mobile Portrait Mode

**Steps:**
1. Open dashboard on mobile (portrait)
2. Test all WebSocket features
3. Verify responsive layout

**Expected Results:**
- [x] WebSocket connects on mobile
- [x] All UI elements visible and functional
- [x] Touch scrolling works correctly
- [x] Notifications don't block content

---

#### 7.2 Mobile Landscape Mode

**Steps:**
1. Rotate device to landscape
2. Verify layout adapts
3. Test WebSocket features

**Expected Results:**
- [x] Connection maintained during rotation
- [x] Layout responsive in landscape
- [x] All features accessible
- [x] No UI overlap or clipping

---

#### 7.3 Background Tab Behavior (Mobile)

**Steps:**
1. Connect on mobile
2. Switch to different app (dashboard in background)
3. Wait 30 seconds
4. Return to dashboard

**Expected Results:**
- [x] Connection maintained or auto-reconnects
- [x] Updates resume immediately
- [x] No duplicate notifications
- [x] Battery usage reasonable

---

#### 7.4 Mobile Network Switch

**Steps:**
1. Connect on WiFi
2. Switch to cellular data (or vice versa)
3. Monitor connection behavior

**Expected Results:**
- [x] Connection maintained or reconnects quickly
- [x] No data loss during switch
- [x] User notified of network change (if applicable)
- [x] Full functionality restored

---

### 8. Performance & Resource Usage

#### 8.1 CPU Usage

**Steps:**
1. Open dashboard
2. Monitor CPU usage in Task Manager/Activity Monitor
3. Leave dashboard open for 10 minutes
4. Check CPU usage during active trading

**Expected Results:**
- [x] Idle CPU usage: < 5%
- [x] Active trading CPU usage: < 15%
- [x] No CPU spikes from WebSocket messages
- [x] No runaway processes

**Measurements:**
- Idle CPU: `______%`
- Active CPU: `______%`

---

#### 8.2 Memory Usage

**Steps:**
1. Open dashboard
2. Monitor memory usage in DevTools → Memory
3. Leave open for 30 minutes
4. Check for memory leaks

**Expected Results:**
- [x] Initial memory: < 100MB
- [x] Memory growth: < 5MB per 10 minutes
- [x] No unbounded growth
- [x] Memory freed after tab close

**Measurements:**
- Initial: `______MB`
- After 30 min: `______MB`
- Growth rate: `______MB/min`

---

#### 8.3 Network Bandwidth

**Steps:**
1. Open DevTools → Network
2. Monitor WebSocket traffic
3. Calculate data usage over 10 minutes

**Expected Results:**
- [x] Idle bandwidth: < 1 KB/s
- [x] Active trading: < 10 KB/s
- [x] No excessive polling
- [x] Efficient binary protocol (Socket.io)

**Measurements:**
- Data sent: `______KB`
- Data received: `______KB`
- Total: `______KB`

---

### 9. Error Handling

#### 9.1 Authentication Errors

**Steps:**
1. Attempt connection without session ID
2. Attempt connection without user ID
3. Verify error messages

**Expected Results:**
- [x] Clear error: "Authentication required"
- [x] Connection rejected
- [x] User redirected to login
- [x] No sensitive data exposed

---

#### 9.2 Invalid Message Handling

**Steps:**
1. Use DevTools console to send invalid message:
   ```javascript
   window.socket.emit('invalid:event', { bad: 'data' });
   ```
2. Verify error handling

**Expected Results:**
- [x] No client-side crash
- [x] Error logged in console
- [x] Connection maintained
- [x] Other features unaffected

---

#### 9.3 Server Error Responses

**Steps:**
1. Trigger server error (e.g., invalid symbol)
2. Monitor error notification
3. Verify user feedback

**Expected Results:**
- [x] Error notification displayed
- [x] Error message user-friendly
- [x] Connection maintained
- [x] User can retry action

---

### 10. Security Tests

#### 10.1 CORS Verification

**Steps:**
1. Check DevTools → Console for CORS errors
2. Verify allowed origins in Network tab
3. Test from unauthorized origin (if possible)

**Expected Results:**
- [x] No CORS errors from authorized origins
- [x] Unauthorized origins rejected
- [x] CORS policy clearly defined
- [x] No overly permissive settings

---

#### 10.2 Authentication Token Security

**Steps:**
1. Inspect WebSocket handshake in DevTools
2. Verify credentials not in URL
3. Check token storage method

**Expected Results:**
- [x] Session ID in auth object, not query params
- [x] Tokens stored securely (httpOnly cookies or sessionStorage)
- [x] No sensitive data in WebSocket messages
- [x] TLS/SSL encryption active (wss://)

---

#### 10.3 XSS Prevention

**Steps:**
1. Attempt to inject script via trade notification:
   ```javascript
   { symbol: '<script>alert("XSS")</script>' }
   ```
2. Verify script doesn't execute

**Expected Results:**
- [x] Script tags escaped/sanitized
- [x] No alert appears
- [x] Raw HTML not rendered
- [x] XSS attempt logged (server-side)

---

## Test Summary

### Browser Compatibility Matrix

| Feature | Chrome | Firefox | Safari | Mobile Chrome | Mobile Safari |
|---------|--------|---------|--------|---------------|---------------|
| Connection | [ ] | [ ] | [ ] | [ ] | [ ] |
| Portfolio Updates | [ ] | [ ] | [ ] | [ ] | [ ] |
| Trade Notifications | [ ] | [ ] | [ ] | [ ] | [ ] |
| Watchlist Quotes | [ ] | [ ] | [ ] | [ ] | [ ] |
| Reconnection | [ ] | [ ] | [ ] | [ ] | [ ] |
| Multi-Tab | [ ] | [ ] | [ ] | [ ] | [ ] |

### Issues Found

| #  | Browser | Issue | Severity | Status |
|----|---------|-------|----------|--------|
| 1  |         |       |          |        |
| 2  |         |       |          |        |
| 3  |         |       |          |        |

### Performance Metrics

| Metric | Chrome | Firefox | Safari | Mobile Chrome | Mobile Safari |
|--------|--------|---------|--------|---------------|---------------|
| Connection Time | ___ ms | ___ ms | ___ ms | ___ ms | ___ ms |
| Update Latency | ___ ms | ___ ms | ___ ms | ___ ms | ___ ms |
| CPU Usage | ___% | ___% | ___% | ___% | ___% |
| Memory Usage | ___ MB | ___ MB | ___ MB | ___ MB | ___ MB |

---

## Sign-Off

**Tester Name:** `_______________`
**Test Date:** `_______________`
**Environment:** `[ ] Development [ ] Staging [ ] Production`
**Overall Status:** `[ ] Pass [ ] Fail [ ] Conditional Pass`

**Notes:**
```
_____________________________________________________________
_____________________________________________________________
_____________________________________________________________
```

**Approved By:** `_______________`
**Approval Date:** `_______________`

---

## Appendix

### Useful DevTools Commands

```javascript
// Check WebSocket connection status
window.socket?.connected

// Get socket ID
window.socket?.id

// Manually subscribe to updates
window.socket?.emit('subscribe:portfolio')
window.socket?.emit('subscribe:trades')
window.socket?.emit('subscribe:watchlist', ['AAPL', 'TSLA'])

// Disconnect and reconnect
window.socket?.disconnect()
window.socket?.connect()

// Check active subscriptions (if implemented)
window.socket?.emit('debug:subscriptions')
```

### Common Issues and Solutions

**Issue:** WebSocket won't connect
**Solution:** Check CORS settings, verify server running, check firewall

**Issue:** Connection drops frequently
**Solution:** Check network stability, verify timeout settings, review server logs

**Issue:** Updates delayed
**Solution:** Check network latency, verify not rate limited, check server load

**Issue:** Multi-tab issues
**Solution:** Verify connection pooling working, check user ID tracking, review connection limit

---

*Last Updated: October 2025*
*Manual Testing Checklist Version: 1.0*
