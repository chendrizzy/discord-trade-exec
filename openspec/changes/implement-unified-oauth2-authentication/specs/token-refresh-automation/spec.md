# Spec: Token Refresh Automation

## ADDED Requirements

### Requirement: Proactive Token Refresh Cron Job

The system SHALL run a background cron job every hour to proactively refresh OAuth2 tokens expiring within 24 hours. The job MUST prioritize brokers with shorter token expiration (TD Ameritrade 30min > E*TRADE 2hr > IBKR 24hr > Alpaca 7d).

**Rationale**: Proactive token refresh prevents authentication failures during active trading and eliminates the need for users to manually reconnect accounts.

#### Scenario: Hourly cron job refreshes tokens expiring soon

**Given** current time = 2025-10-25T10:00:00Z
**And** database contains users with OAuth2 tokens:
- User A: IBKR tokens expire at 2025-10-25T18:00:00Z (8 hours) ✅ Refresh
- User B: Alpaca tokens expire at 2025-11-01T10:00:00Z (7 days) ❌ Skip
- User C: TD Ameritrade tokens expire at 2025-10-25T10:20:00Z (20 min) ✅ Refresh (priority)
**When** TokenRefreshJob cron executes at :00 minute mark
**Then** job queries MongoDB:
```javascript
const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
const users = await User.find({
  'oauthTokens': { $exists: true }
});
```
**And** iterates through each user's oauthTokens Map
**And** identifies tokens with expiresAt < tomorrow:
- User A: IBKR (8h remaining) → add to refresh queue
- User C: TD Ameritrade (20min remaining) → add to refresh queue with HIGH priority
**And** sorts refresh queue by urgency: TD Ameritrade (20min) → IBKR (8h)
**And** calls OAuth2Service.refreshAccessToken('tdameritrade', User C ID)
**And** calls OAuth2Service.refreshAccessToken('ibkr', User A ID)
**And** logs: "[TokenRefreshJob] Refreshed 2 broker tokens for 2 users"

---

#### Scenario: Handle partial token refresh failures gracefully

**Given** TokenRefreshJob needs to refresh 5 tokens:
- User A: IBKR (success)
- User B: TD Ameritrade (fails - invalid refresh token)
- User C: Alpaca (success)
- User D: E*TRADE (fails - broker API down)
- User E: IBKR (success)
**When** cron job executes
**Then** job processes each token refresh independently
**And** User B TD Ameritrade refresh fails with error: "invalid_grant"
**And** job catches error and marks User B tokens as invalid:
```javascript
user.oauthTokens.set('tdameritrade', {
  ...existingTokens,
  isValid: false,
  lastRefreshError: 'invalid_grant',
  lastRefreshAttempt: new Date()
});
```
**And** continues processing remaining tokens (does NOT abort job)
**And** User D E*TRADE refresh fails with error: "503 Service Unavailable"
**And** job retries E*TRADE refresh after 5 minutes (transient error)
**And** completes successfully for Users A, C, E
**And** sends email notifications to Users B and D about failed refreshes
**And** logs summary: "[TokenRefreshJob] Success: 3/5, Failed: 2/5"

---

### Requirement: Adaptive Refresh Scheduling by Broker

The system SHALL schedule token refresh frequency based on broker-specific token expiration periods. TD Ameritrade (30min expiry) MUST refresh every 15 minutes, while Alpaca (7-day expiry) refreshes every 24 hours.

**Rationale**: Different brokers have vastly different token lifetimes. Adaptive scheduling prevents over-refreshing long-lived tokens and under-refreshing short-lived tokens.

#### Scenario: TD Ameritrade tokens refreshed every 15 minutes (short expiry)

**Given** TD Ameritrade OAuth2 tokens expire every 30 minutes
**And** TD Ameritrade refresh cron runs every 15 minutes
**And** user has TD Ameritrade tokens expiring at 10:25 AM
**And** current time = 10:10 AM (15 minutes before expiration)
**When** TD Ameritrade-specific refresh job runs
**Then** job queries ONLY TD Ameritrade tokens:
```javascript
const tdUsers = await User.find({
  'oauthTokens.tdameritrade': { $exists: true }
});
```
**And** identifies TD Ameritrade tokens expiring within 20 minutes
**And** refreshes user's TD Ameritrade tokens
**And** new tokens valid for another 30 minutes (until 10:55 AM)
**And** next refresh scheduled for 10:40 AM (15-minute interval)

---

#### Scenario: Alpaca tokens refreshed daily (long expiry)

**Given** Alpaca OAuth2 tokens expire every 7 days
**And** Alpaca refresh cron runs once per day at 2:00 AM
**And** user has Alpaca tokens expiring in 3 days
**When** daily Alpaca refresh job runs at 2:00 AM
**Then** job queries Alpaca tokens expiring within 7 days
**And** refreshes user's Alpaca tokens
**And** new tokens valid for 7 days
**And** next refresh not scheduled until tokens < 7 days remaining

---

### Requirement: Token Refresh Failure Notifications

The system SHALL send email and dashboard notifications to users when OAuth2 token refresh fails. Notifications MUST include broker name, failure reason, and reconnection instructions.

**Rationale**: Users need to be notified of authentication failures so they can reconnect accounts before trading is disrupted.

#### Scenario: Email notification sent on token refresh failure

**Given** User A has IBKR OAuth2 tokens
**And** IBKR refresh token is invalid/revoked
**When** TokenRefreshJob attempts to refresh IBKR tokens
**And** IBKR returns 400 Bad Request: "invalid_grant"
**Then** system sends email to User A:
```
To: user@example.com
Subject: Reconnect Your Interactive Brokers Account

Hi User A,

Your Interactive Brokers connection has expired and needs to be reconnected.

Reason: Refresh token no longer valid

Please reconnect your account in the dashboard to resume automated trading:
https://example.com/dashboard/brokers

Best regards,
Discord Trade Exec Team
```
**And** email sent via EmailService
**And** email delivery logged to analytics

---

#### Scenario: Dashboard alert notification on token refresh failure

**Given** User A logs into dashboard
**And** IBKR token refresh failed 2 hours ago
**When** dashboard loads
**Then** prominent alert banner displays at top of page:
```
⚠️ Action Required: Your Interactive Brokers connection has expired.
[Reconnect IBKR →]
```
**And** alert is dismissible but reappears on next login until resolved
**And** BrokerConnectionCard shows red "Expired" status
**And** clicking "Reconnect IBKR →" initiates new OAuth2 flow

---

### Requirement: Refresh Token Rotation Support

The system SHALL rotate refresh tokens after each use when broker supports refresh token rotation. Old refresh tokens MUST be discarded after successful rotation to prevent replay attacks.

**Rationale**: Refresh token rotation is an OAuth2 security best practice that limits damage if refresh tokens are compromised.

#### Scenario: Rotate refresh token after successful token refresh (Alpaca)

**Given** Alpaca supports refresh token rotation
**And** user has Alpaca OAuth2 tokens:
```javascript
{
  accessToken: { encrypted: "old_access..." },
  refreshToken: { encrypted: "old_refresh_abc..." },
  expiresAt: new Date('2025-10-25T12:00:00Z')
}
```
**When** OAuth2Service.refreshAccessToken('alpaca', userId) is called
**Then** system sends refresh request to Alpaca with old refresh token
**And** Alpaca returns NEW access token AND NEW refresh token:
```json
{
  "access_token": "new_access_xyz...",
  "refresh_token": "new_refresh_def...",
  "token_type": "Bearer",
  "expires_in": 604800
}
```
**And** system encrypts new tokens
**And** updates user.oauthTokens.set('alpaca', newEncryptedTokens)
**And** old refresh token "old_refresh_abc..." is DISCARDED (not stored)
**And** Alpaca server invalidates old refresh token (if user tries to reuse it → error)

---

#### Scenario: Reuse refresh token when rotation not supported (IBKR)

**Given** IBKR does NOT support refresh token rotation
**And** user has IBKR OAuth2 tokens with refresh token "ibkr_refresh_123"
**When** OAuth2Service.refreshAccessToken('ibkr', userId) is called
**Then** system sends refresh request to IBKR
**And** IBKR returns new access token but SAME refresh token:
```json
{
  "access_token": "new_access_ibkr...",
  "refresh_token": "ibkr_refresh_123",
  "token_type": "Bearer",
  "expires_in": 86400
}
```
**And** system updates only access token in user.oauthTokens
**And** keeps existing refresh token "ibkr_refresh_123" unchanged
**And** same refresh token can be reused for next refresh

---

### Requirement: Token Refresh Retry Logic with Exponential Backoff

The system SHALL retry failed token refreshes with exponential backoff for transient errors (5xx broker errors, network timeouts). Permanent errors (4xx invalid tokens) MUST NOT be retried.

**Rationale**: Exponential backoff prevents overwhelming broker APIs during outages while quickly recovering when service is restored.

#### Scenario: Retry token refresh for transient error (503 Service Unavailable)

**Given** user has IBKR OAuth2 tokens expiring soon
**When** TokenRefreshJob calls OAuth2Service.refreshAccessToken('ibkr', userId)
**And** IBKR API returns 503 Service Unavailable
**Then** system identifies error as transient (5xx status code)
**And** schedules retry attempt #1 after 1 minute
**And** retry #1 fails again with 503
**And** schedules retry attempt #2 after 2 minutes (exponential backoff)
**And** retry #2 succeeds with new tokens
**And** user.oauthTokens updated with fresh tokens
**And** logs: "[OAuth2Service] IBKR token refresh succeeded after 2 retries"

---

#### Scenario: Do not retry token refresh for permanent error (invalid_grant)

**Given** user has TD Ameritrade OAuth2 tokens
**When** TokenRefreshJob calls OAuth2Service.refreshAccessToken('tdameritrade', userId)
**And** TD Ameritrade API returns 400 Bad Request: "invalid_grant"
**Then** system identifies error as permanent (4xx status code, "invalid_grant" error)
**And** marks tokens as invalid immediately
**And** does NOT schedule retry
**And** sends user notification: "Reconnect TD Ameritrade account"
**And** logs: "[OAuth2Service] TD Ameritrade token refresh failed - permanent error (invalid_grant)"

---

### Requirement: Token Refresh Performance Monitoring

The system SHALL track token refresh metrics including success rate, average refresh duration, failure reasons, and refresh frequency per broker. Metrics MUST be exposed via monitoring dashboard.

**Rationale**: Performance monitoring helps identify broker API issues, optimize refresh schedules, and ensure token refresh SLA (99.9% success rate).

#### Scenario: Track token refresh success metrics

**Given** TokenRefreshJob executes every hour
**When** job completes processing 100 token refreshes:
- 95 successful
- 3 failed (transient errors, retried successfully)
- 2 failed (permanent errors, user notified)
**Then** system logs metrics to analytics:
```javascript
{
  timestamp: new Date(),
  totalRefreshes: 100,
  successful: 95,
  failedTransient: 3,
  failedPermanent: 2,
  successRate: 0.95,
  avgRefreshDuration: 1250, // milliseconds
  brokerBreakdown: {
    alpaca: { total: 40, success: 40, failed: 0 },
    ibkr: { total: 30, success: 28, failed: 2 },
    tdameritrade: { total: 20, success: 18, failed: 2 },
    etrade: { total: 10, success: 9, failed: 1 }
  }
}
```
**And** metrics stored in analytics database
**And** dashboard displays success rate graph over time

---

#### Scenario: Alert on low token refresh success rate

**Given** token refresh success rate drops below 90% (SLA threshold)
**And** 15% of IBKR token refreshes failing with "503 Service Unavailable"
**When** monitoring system evaluates token refresh metrics
**Then** system generates alert:
```
⚠️ Token Refresh SLA Breach
Success Rate: 85% (threshold: 90%)
Affected Broker: IBKR
Failure Reason: 503 Service Unavailable (15% of requests)
Recommendation: IBKR API may be experiencing outage
```
**And** alert sent to operations team via Slack webhook
**And** incident logged for investigation

---

## MODIFIED Requirements

None. All token refresh automation requirements are new additions.

---

## REMOVED Requirements

None.

---

## Cross-References

- **Related Spec**: `oauth2-service` - Token refresh automation uses OAuth2Service.refreshAccessToken()
- **Related Spec**: `broker-oauth2-integrations` - Refresh jobs handle broker-specific token expiration periods
- **Related Spec**: `oauth2-ui-components` - Dashboard displays token refresh status and failure alerts
- **Dependency**: Cron job scheduler (node-cron or similar)
- **Dependency**: Email service for user notifications
- **Dependency**: Analytics database for token refresh metrics
- **Dependency**: Monitoring dashboard for token refresh SLA tracking

---

## Technical Notes

### Token Refresh Cron Job Implementation

```javascript
// src/jobs/tokenRefreshJob.js
const cron = require('node-cron');
const User = require('../models/User');
const OAuth2Service = require('../services/OAuth2Service');
const EmailService = require('../services/EmailService');

// Hourly job for most brokers
cron.schedule('0 * * * *', async () => {
  console.log('[TokenRefreshJob] Starting hourly token refresh...');
  await refreshExpiringTokens(24 * 60 * 60 * 1000); // 24 hours
});

// Every 15 minutes for TD Ameritrade (30-minute expiry)
cron.schedule('*/15 * * * *', async () => {
  console.log('[TokenRefreshJob] Starting TD Ameritrade token refresh...');
  await refreshExpiringTokens(20 * 60 * 1000, ['tdameritrade']); // 20 minutes
});

async function refreshExpiringTokens(expiryThreshold, brokers = null) {
  const expiryDate = new Date(Date.now() + expiryThreshold);

  const users = await User.find({
    'oauthTokens': { $exists: true }
  });

  let successCount = 0;
  let failureCount = 0;
  const failures = [];

  for (const user of users) {
    for (const [broker, tokenData] of user.oauthTokens) {
      // Skip if filtering by specific brokers
      if (brokers && !brokers.includes(broker)) continue;

      // Skip if tokens not expiring soon
      if (tokenData.expiresAt >= expiryDate) continue;

      try {
        await OAuth2Service.refreshAccessToken(broker, user.id);
        successCount++;
        console.log(`[TokenRefreshJob] Refreshed ${broker} tokens for user ${user.id}`);
      } catch (error) {
        failureCount++;
        failures.push({ userId: user.id, broker, error: error.message });
        console.error(`[TokenRefreshJob] Failed to refresh ${broker} tokens for user ${user.id}:`, error.message);

        // Send user notification on permanent failure
        if (error.statusCode >= 400 && error.statusCode < 500) {
          await EmailService.sendTokenRefreshFailureEmail(user.email, broker);
        }
      }
    }
  }

  console.log(`[TokenRefreshJob] Completed: ${successCount} success, ${failureCount} failures`);

  // Log metrics
  await logTokenRefreshMetrics({
    timestamp: new Date(),
    totalRefreshes: successCount + failureCount,
    successful: successCount,
    failed: failureCount,
    failures: failures
  });
}
```

### Exponential Backoff Retry Logic

```javascript
// src/services/OAuth2Service.js
async refreshAccessToken(broker, userId, retryCount = 0) {
  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [1000, 2000, 4000]; // 1s, 2s, 4s

  try {
    // Attempt token refresh
    const newTokens = await this.performTokenRefresh(broker, userId);
    return newTokens;
  } catch (error) {
    // Permanent error (4xx) - do not retry
    if (error.statusCode >= 400 && error.statusCode < 500) {
      console.error(`[OAuth2Service] Permanent error refreshing ${broker} tokens:`, error.message);
      await this.markTokensInvalid(broker, userId, error.message);
      throw error;
    }

    // Transient error (5xx, network) - retry with exponential backoff
    if (retryCount < MAX_RETRIES) {
      const delay = RETRY_DELAYS[retryCount];
      console.log(`[OAuth2Service] Retry ${retryCount + 1}/${MAX_RETRIES} for ${broker} after ${delay}ms`);

      await new Promise(resolve => setTimeout(resolve, delay));
      return await this.refreshAccessToken(broker, userId, retryCount + 1);
    }

    // Max retries exceeded
    console.error(`[OAuth2Service] Max retries exceeded for ${broker} token refresh`);
    throw error;
  }
}
```

### Token Refresh Metrics Logging

```javascript
// src/services/analytics/TokenRefreshMetrics.js
const AnalyticsEvent = require('../../models/AnalyticsEvent');

class TokenRefreshMetrics {
  static async logRefreshMetrics(data) {
    await AnalyticsEvent.create({
      eventType: 'token_refresh_job',
      metadata: {
        totalRefreshes: data.totalRefreshes,
        successful: data.successful,
        failed: data.failed,
        successRate: data.successful / data.totalRefreshes,
        avgRefreshDuration: data.avgRefreshDuration,
        brokerBreakdown: data.brokerBreakdown,
        failures: data.failures
      },
      timestamp: data.timestamp
    });
  }

  static async getSuccessRate(hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const metrics = await AnalyticsEvent.find({
      eventType: 'token_refresh_job',
      timestamp: { $gte: since }
    });

    const totalRefreshes = metrics.reduce((sum, m) => sum + m.metadata.totalRefreshes, 0);
    const totalSuccessful = metrics.reduce((sum, m) => sum + m.metadata.successful, 0);

    return totalSuccessful / totalRefreshes;
  }
}

module.exports = TokenRefreshMetrics;
```

---

**Spec Status**: Complete
**Scenarios**: 11 scenarios defined
**Coverage**: Proactive token refresh, adaptive scheduling, failure notifications, token rotation, retry logic, performance monitoring
