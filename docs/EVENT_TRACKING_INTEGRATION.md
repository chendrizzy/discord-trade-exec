# Event Tracking Integration Guide

## Overview

This document describes where analytics event tracking has been integrated and where it needs to be added when additional features are implemented.

## Completed Integrations

### ✅ User Signup (src/middleware/auth.js:40-46)

**Location**: Discord OAuth strategy callback
**Event Type**: `signup`
**Trigger**: When a new user is created during first Discord OAuth login

```javascript
await analyticsEventService.trackSignup(user._id, {
  method: 'discord',
  email: profile.email,
  initialTier: 'free',
  trialDays: 7
});
```

### ✅ User Login (src/middleware/auth.js:55-58)

**Location**: Discord OAuth strategy callback
**Event Type**: `login`
**Trigger**: When an existing user logs in via Discord OAuth

```javascript
await analyticsEventService.trackLogin(user._id, {
  method: 'discord'
});
```

### ✅ Broker Connection (src/routes/api/brokers.js:204-213)

**Location**: POST `/api/brokers/configure` endpoint
**Event Type**: `broker_connected`
**Trigger**: When user successfully configures a broker

```javascript
await analyticsEventService.trackBrokerConnected(
  user._id,
  {
    broker: brokerKey,
    accountType: brokerType,
    isReconnection: !!user.brokerConfigs[brokerKey]?.lastVerified
  },
  req
);
```

## Pending Integrations

### ⏳ Subscription Events

**Status**: Awaiting implementation of subscription management endpoints

#### subscription_created
**Where to add**: When payment processor webhook confirms new subscription
**Suggested location**: Payment webhook handler (to be created)

```javascript
// Example implementation
await analyticsEventService.trackSubscriptionCreated(
  user._id,
  {
    tier: subscriptionData.tier,
    amount: subscriptionData.amount,
    billingPeriod: subscriptionData.billingPeriod || 'monthly',
    trialDays: subscriptionData.trialDays || 0
  },
  req
);
```

#### subscription_canceled
**Where to add**: When user cancels subscription or payment fails
**Suggested location**: Cancellation endpoint or payment webhook handler

```javascript
// Example implementation
await analyticsEventService.trackSubscriptionCanceled(
  user._id,
  {
    tier: user.subscription.tier,
    reason: cancellationData.reason || 'user_requested',
    feedback: cancellationData.feedback
  },
  req
);
```

#### subscription_renewed
**Where to add**: When recurring payment succeeds
**Suggested location**: Payment webhook handler for renewals

```javascript
// Example implementation
await analyticsEventService.trackSubscriptionRenewed(
  user._id,
  {
    tier: user.subscription.tier,
    amount: renewalData.amount,
    renewalCount: user.subscription.renewalCount || 1
  },
  req
);
```

### ⏳ Trade Execution Events

**Status**: Trade creation not yet implemented in codebase

#### trade_executed
**Where to add**: After trade is successfully executed and saved
**Suggested location**: Trade execution service (to be created)

```javascript
// Example implementation
// Add after: await trade.save()

await analyticsEventService.trackTradeExecuted(
  trade.userId,
  {
    symbol: trade.symbol,
    side: trade.side,
    quantity: trade.quantity,
    price: trade.entryPrice,
    broker: trade.broker,
    profit: trade.profitLoss,
    signalId: trade.signalId
  },
  req
);
```

**Recommended locations**:
1. Signal execution handler
2. Manual trade execution endpoint
3. Bot trade execution service
4. Webhook from broker confirming trade

### ⏳ Signal Subscription Events

**Status**: No signal subscription management found in codebase

#### signal_subscribed
**Where to add**: When user subscribes to a signal provider
**Suggested location**: Signal subscription endpoint (to be created)

```javascript
// Example implementation
await analyticsEventService.trackSignalSubscribed(
  user._id,
  {
    providerId: provider._id,
    providerName: provider.name,
    subscriptionType: subscriptionData.type || 'standard'
  },
  req
);
```

## Implementation Checklist

When implementing new features that should emit analytics events:

1. **Import the service**:
   ```javascript
   const analyticsEventService = require('../../services/analytics/AnalyticsEventService');
   ```

2. **Call after successful operation**:
   - Place event tracking AFTER the database save/update succeeds
   - Use appropriate convenience method (trackSignup, trackLogin, etc.)
   - Pass the Express `req` object for metadata extraction

3. **Handle errors gracefully**:
   - Event tracking failures should NOT break the main operation
   - The service already logs errors internally
   - Consider the immediate flag for critical events (revenue, churn)

4. **Event Data Best Practices**:
   - Include enough context for analytics (tier, amount, method, etc.)
   - Don't include sensitive data (passwords, full API keys)
   - Use consistent naming conventions for event data fields

## Event Batching Behavior

- **Batched events** (default): signup, login, trade_executed
  - Buffered in memory, flushed every 30 seconds or after 50 events
  - Better performance for high-frequency events

- **Immediate events** (immediate: true): subscription events, broker_connected
  - Written immediately to database
  - Used for critical business events that affect analytics calculations

## Testing Event Tracking

When adding event tracking to new code:

1. **Manual Testing**:
   - Perform the action (signup, login, etc.)
   - Check MongoDB `analyticsevents` collection
   - Verify event data is correct

2. **Unit Tests**:
   - Mock AnalyticsEventService
   - Assert tracking method was called with correct parameters
   - See existing tests for examples

3. **Integration Tests**:
   - Perform end-to-end action
   - Query AnalyticsEvent.find() to verify event was created
   - Check event data matches expected structure

## Event Schema Reference

```javascript
{
  userId: ObjectId,  // Required
  eventType: String, // Required (see enum in AnalyticsEvent.js)
  eventData: Mixed,  // Optional additional data
  timestamp: Date,   // Auto-generated
  metadata: {
    source: String,     // Referer/Origin
    userAgent: String,  // User-Agent header
    ipAddress: String   // Client IP
  }
}
```

## Supported Event Types

As defined in `src/models/AnalyticsEvent.js`:

- `signup` ✅ Implemented
- `subscription_created` ⏳ Pending
- `subscription_canceled` ⏳ Pending
- `subscription_renewed` ⏳ Pending
- `trade_executed` ⏳ Pending
- `login` ✅ Implemented
- `broker_connected` ✅ Implemented
- `signal_subscribed` ⏳ Pending

## Monitoring Event Tracking

### Check Buffer Status
```javascript
const status = analyticsEventService.getBufferStatus();
console.log(`Buffered events: ${status.bufferedEvents}/${status.batchSize}`);
```

### Force Flush
```javascript
await analyticsEventService.flush();
```

### Graceful Shutdown
```javascript
// Already integrated in application shutdown
await analyticsEventService.shutdown();
```

## Next Steps

1. Implement subscription management endpoints
2. Add subscription event tracking to payment webhooks
3. Implement trade execution service
4. Add trade event tracking to execution flow
5. Create signal subscription management
6. Add signal subscription event tracking
7. Write integration tests for all event types
8. Add monitoring/alerting for event tracking failures

## Related Files

- Service: `src/services/analytics/AnalyticsEventService.js`
- Model: `src/models/AnalyticsEvent.js`
- Tests: `tests/unit/analytics/AnalyticsEventService.test.js` (to be created)
- Integration: `tests/integration/analytics-events.test.js` (to be created)
