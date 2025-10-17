# Spec: Discord Alert Integration System

## ADDED Requirements

### Requirement: Formatted Discord Embed Alerts

The system SHALL format all Polymarket alerts as rich Discord embeds with color-coded severity, contextual metadata, and legal disclaimers. Embeds MUST include direct links to market details.

**Rationale**: Rich embeds provide structured, scannable information that users can act on quickly.

#### Scenario: Format whale bet alert embed

**Given** whale wallet 0x9c4d1e placed $500,000 bet on "Trump Win"
**And** alert metadata includes:
```json
{
  "walletAddress": "0x9c4d1e...",
  "totalVolume": "2500000",
  "winRate": 78.5,
  "marketTitle": "Presidential Election 2024: Winner",
  "outcome": "Trump Win",
  "amount": "500000",
  "currentOdds": "52% Trump / 48% Harris"
}
```
**When** AlertFormatter.formatWhaleAlert() called
**Then** Discord embed generated with:
```json
{
  "title": "🐋 WHALE ALERT",
  "description": "Presidential Election 2024: Winner",
  "color": 16744192, // Orange (0xFF6B00)
  "fields": [
    {
      "name": "Wallet",
      "value": "`0x9c4d1e...`",
      "inline": true
    },
    {
      "name": "Historical Accuracy",
      "value": "78.5%",
      "inline": true
    },
    {
      "name": "Action",
      "value": "BUY $500K → Trump Win",
      "inline": false
    },
    {
      "name": "Current Odds",
      "value": "52% Trump / 48% Harris",
      "inline": true
    },
    {
      "name": "Volume Spike",
      "value": "+320% (last 15 min)",
      "inline": true
    },
    {
      "name": "Sentiment",
      "value": "BULLISH (+15% shift)",
      "inline": false
    }
  ],
  "footer": {
    "text": "⚠️ This is informational only, not investment advice. Trade at your own risk."
  },
  "timestamp": "2025-10-17T08:45:00.000Z"
}
```
**And** embed posted to Discord channel
**And** polymarket_alerts.sent_to_discord updated to TRUE

---

### Requirement: Multi-Channel Alert Routing

The system SHALL route alerts to different Discord channels based on alert type and severity. Critical alerts MUST be sent to all configured channels.

**Rationale**: Different alert types serve different purposes—users may want whale tracking in one channel and anomalies in another.

#### Scenario: Route whale alerts to dedicated channel

**Given** Discord webhook configured:
```javascript
{
  alerts: process.env.DISCORD_POLYMARKET_ALERTS_WEBHOOK,
  whales: process.env.DISCORD_POLYMARKET_WHALES_WEBHOOK,
  anomalies: process.env.DISCORD_POLYMARKET_ANOMALIES_WEBHOOK
}
```
**And** alert generated with type: WHALE_BET, severity: HIGH
**When** DiscordAlertService.sendAlert() called
**Then** system routes to whales webhook
**And** message posted to #whale-tracking channel
**And** NOT posted to #polymarket-signals or #market-anomalies

---

#### Scenario: Broadcast critical anomaly alerts to all channels

**Given** anomaly detected: COORDINATED_BETTING, severity: CRITICAL
**When** DiscordAlertService.sendAlert() called with severity: CRITICAL
**Then** alert sent to ALL configured webhooks:
- #polymarket-signals (general alerts)
- #whale-tracking (whales channel)
- #market-anomalies (anomalies channel)
**And** embed includes 🚨 emoji prefix for critical severity
**And** @everyone mention added to message

---

### Requirement: Alert Rate Limiting

The system SHALL limit Discord alerts to maximum 10 per minute per channel to prevent spam. Additional alerts MUST be queued and sent in batches.

**Rationale**: Excessive alerts degrade user experience and may trigger Discord rate limits.

#### Scenario: Queue alerts when rate limit reached

**Given** 10 whale alerts sent to #whale-tracking in last minute
**And** new whale alert generated
**When** DiscordAlertService.sendAlert() called
**Then** system checks rate limit counter
**And** current count (10) >= max per minute (10)
**And** alert added to queue instead of immediate send
**And** queue processed after 60-second window resets
**And** database record shows sent_to_discord = FALSE (pending)

---

#### Scenario: Batch send queued alerts

**Given** alert queue contains 5 pending alerts
**And** rate limit window reset 10 seconds ago
**When** queue processor runs (every 10 seconds)
**Then** system retrieves queued alerts
**And** sends up to 10 alerts immediately
**And** updates sent_to_discord = TRUE for each sent alert
**And** remaining alerts stay in queue for next cycle

---

### Requirement: User Alert Preferences

The system SHALL respect user-configured alert preferences including minimum thresholds, enabled alert types, and channel subscriptions. Users MUST be able to mute specific alert types.

**Rationale**: Not all users want all alerts—customization improves signal-to-noise ratio.

#### Scenario: Respect user minimum whale bet threshold

**Given** user has configured preference:
```json
{
  "whaleAlerts": {
    "enabled": true,
    "minBetSize": 250000 // $250K minimum
  }
}
```
**And** whale places $150,000 bet
**When** alert would normally trigger (whale detected, bet amount > $100K)
**Then** system checks user preference minBetSize = $250,000
**And** current bet ($150,000) < user threshold ($250,000)
**And** NO alert sent to this specific user
**And** other users with lower thresholds still receive alert

---

#### Scenario: Mute specific alert types

**Given** user has muted sentiment shift alerts:
```json
{
  "sentimentShiftAlerts": {
    "enabled": false
  }
}
```
**And** sentiment shift detected: Trump +50% in 15 minutes
**When** SENTIMENT_SHIFT alert generated
**Then** system checks user preferences
**And** sentimentShiftAlerts.enabled = false
**And** NO alert sent to this user
**And** other users with enabled preference receive alert

---

### Requirement: Alert History API

The system SHALL provide GET /api/polymarket/alerts endpoint returning paginated alert history with filtering by type, severity, and date range.

**Rationale**: Users need to review past alerts to validate signal quality and analyze patterns.

#### Scenario: Retrieve recent alerts via API

**Given** database contains 150 polymarket alerts
**When** client sends GET /api/polymarket/alerts?limit=20
**Then** system queries polymarket_alerts table
**And** orders by created_at DESC
**And** LIMIT 20
**And** response includes:
```json
{
  "success": true,
  "alerts": [
    {
      "id": 1234,
      "type": "WHALE_BET",
      "severity": "HIGH",
      "market": {
        "id": "0x7a3b2f...",
        "title": "Presidential Election 2024"
      },
      "wallet": "0x9c4d1e...",
      "amount": "500000",
      "outcome": "Trump Win",
      "timestamp": "2025-10-17T08:45:00Z",
      "metadata": {
        "whaleScore": 85,
        "winRate": 78.5,
        "volumeSpike": 320
      }
    },
    // ... 19 more alerts
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "hasMore": true
  }
}
```
**And** response status is 200 OK

---

#### Scenario: Filter alerts by type and severity

**Given** user wants only critical whale alerts from last 24 hours
**When** client sends GET /api/polymarket/alerts?type=WHALE_BET&severity=CRITICAL&since=2025-10-16T08:45:00Z
**Then** system queries WHERE:
- alert_type = 'WHALE_BET'
- severity = 'CRITICAL'
- created_at >= '2025-10-16T08:45:00Z'
**And** response includes only matching alerts
**And** pagination metadata reflects filtered result count

---

### Requirement: WebSocket Real-Time Alert Streaming

The system SHALL broadcast alerts to dashboard clients via WebSocket for real-time updates without polling. Clients MUST receive alerts within 1 second of generation.

**Rationale**: Dashboard users expect instant notifications for time-sensitive trading signals.

#### Scenario: Broadcast alert to connected WebSocket clients

**Given** 5 dashboard clients connected to WebSocket: wss://app.com/polymarket/stream
**And** new whale alert generated
**When** DiscordAlertService.sendAlert() completes successfully
**Then** WebSocketServer broadcasts message to all connected clients:
```json
{
  "event": "alert",
  "data": {
    "id": 1234,
    "type": "WHALE_BET",
    "severity": "HIGH",
    "market": {
      "id": "0x7a3b2f...",
      "title": "Presidential Election 2024"
    },
    "wallet": "0x9c4d1e...",
    "amount": "500000",
    "outcome": "Trump Win",
    "timestamp": "2025-10-17T08:45:00Z"
  }
}
```
**And** all 5 clients receive message within 1 second
**And** dashboard UI updates alert feed in real-time

---

## MODIFIED Requirements

None. All Discord integration requirements are new additions.

---

## REMOVED Requirements

None.

---

## Cross-References

- **Related Spec**: `whale-tracking` - Generates whale bet alerts
- **Related Spec**: `market-sentiment` - Generates sentiment shift and volume spike alerts
- **Dependency**: Discord webhook URLs configured in environment variables
- **Dependency**: WebSocket server for real-time dashboard updates

---

## Technical Notes

### Discord Webhook Configuration

```javascript
// src/config/discord.js
module.exports = {
  polymarket: {
    webhooks: {
      alerts: process.env.DISCORD_POLYMARKET_ALERTS_WEBHOOK,
      whales: process.env.DISCORD_POLYMARKET_WHALES_WEBHOOK,
      anomalies: process.env.DISCORD_POLYMARKET_ANOMALIES_WEBHOOK
    },
    rateLimit: {
      maxPerMinute: 10,
      queueEnabled: true
    }
  }
};
```

### Alert Routing Logic

```javascript
// src/services/polymarket/DiscordAlertService.js
class DiscordAlertService {
  getWebhookForAlert(alert) {
    const { type, severity } = alert;

    // Critical alerts go to all channels
    if (severity === 'CRITICAL') {
      return Object.values(this.config.webhooks);
    }

    // Route by type
    switch (type) {
      case 'WHALE_BET':
      case 'WHALE_PROMOTION':
        return [this.config.webhooks.whales];

      case 'VOLUME_SPIKE':
      case 'SENTIMENT_SHIFT':
        return [this.config.webhooks.alerts];

      case 'COORDINATED_BETTING':
      case 'SUDDEN_REVERSAL':
      case 'FLASH_WHALE':
        return [this.config.webhooks.anomalies];

      default:
        return [this.config.webhooks.alerts];
    }
  }
}
```

### Rate Limiter Implementation

```javascript
// src/services/polymarket/RateLimiter.js
const redis = require('redis');

class RateLimiter {
  constructor(redisClient, maxPerMinute = 10) {
    this.redis = redisClient;
    this.maxPerMinute = maxPerMinute;
  }

  async checkLimit(channel) {
    const key = `rate_limit:${channel}`;
    const current = await this.redis.incr(key);

    if (current === 1) {
      // First request in window, set expiration
      await this.redis.expire(key, 60);
    }

    return current <= this.maxPerMinute;
  }

  async getCurrentCount(channel) {
    const key = `rate_limit:${channel}`;
    return await this.redis.get(key) || 0;
  }
}
```

### Alert Queue Processor

```javascript
// src/jobs/processAlertQueue.js
const cron = require('node-cron');

// Run every 10 seconds
cron.schedule('*/10 * * * * *', async () => {
  const pendingAlerts = await PolymarketAlert.findAll({
    where: { sent_to_discord: false },
    order: [['created_at', 'ASC']],
    limit: 10 // Process up to 10 alerts per cycle
  });

  for (const alert of pendingAlerts) {
    const canSend = await rateLimiter.checkLimit(alert.channel);

    if (canSend) {
      await discordAlertService.sendAlert(alert);
      alert.sent_to_discord = true;
      await alert.save();
    }
  }
});
```

### WebSocket Alert Broadcast

```javascript
// src/services/websocket/AlertBroadcaster.js
class AlertBroadcaster {
  constructor(wss) {
    this.wss = wss; // WebSocket server instance
  }

  broadcastAlert(alert) {
    const message = JSON.stringify({
      event: 'alert',
      data: {
        id: alert.id,
        type: alert.alert_type,
        severity: alert.severity,
        market: alert.market,
        timestamp: alert.created_at,
        ...alert.metadata
      }
    });

    // Send to all connected clients
    this.wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
}
```

### Alert Embed Color Mapping

```javascript
const SEVERITY_COLORS = {
  LOW: 0x808080,      // Gray
  MEDIUM: 0xFFD700,   // Gold
  HIGH: 0xFF6B00,     // Orange
  CRITICAL: 0xFF0000  // Red
};

function getEmbedColor(severity) {
  return SEVERITY_COLORS[severity] || SEVERITY_COLORS.MEDIUM;
}
```

### User Preferences Schema

```sql
CREATE TABLE polymarket_user_preferences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  whale_alerts_enabled BOOLEAN DEFAULT TRUE,
  whale_min_bet_size DECIMAL(20, 6) DEFAULT 100000,
  sentiment_shift_alerts_enabled BOOLEAN DEFAULT TRUE,
  sentiment_min_shift_pct DECIMAL(5, 2) DEFAULT 10.0,
  volume_spike_alerts_enabled BOOLEAN DEFAULT TRUE,
  anomaly_alerts_enabled BOOLEAN DEFAULT TRUE,
  discord_channel_id VARCHAR(20), -- Optional: user's preferred Discord channel
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id)
);
```

### Alert Formatting Examples

**Whale Alert**:
```
🐋 WHALE ALERT
Presidential Election 2024: Winner

Wallet: 0x9c4d1e...
Historical Accuracy: 78.5%

Action: BUY $500K → Trump Win

Current Odds: 52% Trump / 48% Harris
Volume Spike: +320% (last 15 min)
Sentiment: BULLISH (+15% shift)

⚠️ This is informational only, not investment advice.
```

**Volume Spike Alert**:
```
📈 VOLUME SPIKE
Presidential Election 2024: Winner

Current Volume: $900K (last 15 min)
24-Hour Average: $280K
Spike Multiplier: 3.2x

Dominant Outcome: Trump Win (84.7%)
Net Sentiment: +$540K Trump

⚠️ This is informational only, not investment advice.
```

**Anomaly Alert**:
```
🚨 MARKET ANOMALY DETECTED
Presidential Election 2024: Winner

Type: Coordinated Betting
Severity: CRITICAL

5 wallets placed $720K on Trump Win
within 60-second window

⚠️ Potential market manipulation. Investigate before trading.
⚠️ This is informational only, not investment advice.
```

---

**Spec Status**: Complete
**Scenarios**: 8 scenarios defined
**Coverage**: Discord embeds, multi-channel routing, rate limiting, user preferences, alert history API, WebSocket streaming
