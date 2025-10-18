# Discord Alert System Architecture

## Files
- `src/services/polymarket/AlertFormatter.js`
- `src/services/polymarket/DiscordAlertService.js`

## Design Decision: Redis-First Deduplication

**Rationale**: 10-50x faster lookups, multi-instance support, automatic TTL

---

## AlertFormatter.js

### Static Methods (No State)

```javascript
class AlertFormatter {
  static formatWhaleAlert(alert) {
    return {
      title: `🐋 WHALE ALERT: ${(alert.context.amount / 1000).toFixed(0)}K Bet`,
      description: 'Large position detected on Polymarket',
      color: this.getSeverityColor(alert.severity),
      fields: [
        { name: 'Wallet', value: `\`${alert.context.walletAddress.substring(0, 10)}...\``, inline: true },
        { name: 'Amount', value: `$${alert.context.amount.toLocaleString()}`, inline: true },
        { name: 'Market', value: `[View on Polymarket](https://polymarket.com/event/${alert.context.marketId})`, inline: false },
        { name: 'Outcome', value: alert.context.outcome, inline: true },
        { name: 'TX', value: `[Polygonscan](https://polygonscan.com/tx/${alert.context.txHash})`, inline: true }
      ],
      footer: { text: 'Not financial advice. Polymarket Intelligence • polymarket.com' },
      timestamp: new Date().toISOString()
    };
  }

  static formatVolumeSpikeAlert(alert) { /* Similar structure */ }
  static formatSentimentShiftAlert(alert) { /* Similar structure */ }
  static formatAnomalyAlert(alert) { /* Similar structure */ }

  static getSeverityColor(severity) {
    return {
      CRITICAL: 0xFF0000, // Red
      HIGH: 0xFF6B35,     // Orange
      MEDIUM: 0xFFD700,   // Yellow
      LOW: 0x00FF00       // Green
    }[severity] || 0x808080; // Gray default
  }
}
```

---

## DiscordAlertService.js

### Class Design

```javascript
class DiscordAlertService {
  constructor() {
    if (DiscordAlertService.instance) return DiscordAlertService.instance;

    this.cacheManager = require('./CacheManager');
    this.webhookUrl = process.env.DISCORD_POLYMARKET_ALERTS_WEBHOOK;
    this.rateLimitKey = 'polymarket:alerts:rate';

    this.cooldowns = {
      WHALE_BET: 3600,        // 1 hour
      VOLUME_SPIKE: 900,      // 15 minutes
      SENTIMENT_SHIFT: 900,   // 15 minutes
      ANOMALY: 1800           // 30 minutes
    };

    DiscordAlertService.instance = this;
  }

  async sendAlert(alert) {
    // 3-layer check: rate limit → dedup → send
  }

  async checkRateLimit() {
    // Sliding window: 10 alerts/minute
  }

  async checkDuplication(alert) {
    // Redis → Database → Memory fallback
  }

  async formatAndSend(alert) {
    // Format embed → POST to webhook
  }
}
```

### Key Methods

#### `sendAlert(alert)` - Main Entry Point

```javascript
async sendAlert(alert) {
  try {
    // 1. Check rate limit (10/min)
    const rateLimitOk = await this.checkRateLimit();
    if (!rateLimitOk) {
      console.warn('[Discord] Rate limit exceeded, queueing alert');
      return { queued: true };
    }

    // 2. Check deduplication
    const isDuplicate = await this.checkDuplication(alert);
    if (isDuplicate) {
      console.log('[Discord] Duplicate alert suppressed');
      return { duplicate: true };
    }

    // 3. Format and send
    await this.formatAndSend(alert);

    return { sent: true };

  } catch (error) {
    console.error('[Discord] Alert send error:', error);
    return { error: error.message };
  }
}
```

#### `checkRateLimit()` - Sliding Window (Redis)

```javascript
async checkRateLimit() {
  if (!this.cacheManager.enabled) {
    return true; // No rate limiting in dev mode
  }

  const redis = this.cacheManager.client;
  const now = Date.now();
  const windowStart = now - 60000; // 1 minute

  // Remove old entries
  await redis.zremrangebyscore(this.rateLimitKey, '-inf', windowStart);

  // Count recent alerts
  const count = await redis.zcard(this.rateLimitKey);

  if (count >= 10) {
    return false; // Rate limited
  }

  // Add current alert
  await redis.zadd(this.rateLimitKey, now, `${now}:${Math.random()}`);
  await redis.expire(this.rateLimitKey, 60);

  return true; // OK to send
}
```

#### `checkDuplication(alert)` - 3-Layer Check

```javascript
async checkDuplication(alert) {
  const fingerprint = this.getAlertFingerprint(alert);
  const cooldown = this.cooldowns[alert.alertType];
  const cacheKey = `alert:dedup:${fingerprint}`;

  // Layer 1: Redis (fast path <1ms)
  if (this.cacheManager.enabled) {
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return true; // Duplicate

    await this.cacheManager.set(cacheKey, '1', cooldown);
  }

  // Layer 2: Database (fallback + audit trail)
  const cutoff = new Date(Date.now() - cooldown * 1000);
  const recent = await PolymarketAlert.findOne({
    fingerprint,
    createdAt: { $gte: cutoff },
    sent: true
  });

  if (recent) return true; // Duplicate

  // Layer 3: In-memory (emergency fallback)
  if (!this.cacheManager.enabled) {
    // Use Map with TTL cleanup
    if (this.memoryDedup.has(fingerprint)) {
      return true;
    }
    this.memoryDedup.set(fingerprint, Date.now());
    setTimeout(() => this.memoryDedup.delete(fingerprint), cooldown * 1000);
  }

  return false; // Not a duplicate
}
```

#### `getAlertFingerprint(alert)` - Unique ID

```javascript
getAlertFingerprint(alert) {
  switch (alert.alertType) {
    case 'WHALE_BET':
      return `whale:${alert.context.walletAddress}`;

    case 'VOLUME_SPIKE':
    case 'SENTIMENT_SHIFT':
      return `${alert.alertType.toLowerCase()}:${alert.context.marketId}`;

    case 'ANOMALY':
      return `anomaly:${alert.context.patternType}:${alert.context.marketId}`;

    default:
      return `unknown:${alert._id}`;
  }
}
```

#### `formatAndSend(alert)` - Webhook POST

```javascript
async formatAndSend(alert) {
  // Format embed based on type
  const embed = AlertFormatter[`format${alert.alertType.replace('_', '')}Alert`](alert);

  // POST to Discord webhook
  const response = await fetch(this.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] })
  });

  if (!response.ok) {
    throw new Error(`Discord API error: ${response.status}`);
  }

  // Mark alert as sent in database
  await PolymarketAlert.findByIdAndUpdate(alert._id, {
    sent: true,
    sentAt: new Date()
  });

  console.log(`[Discord] Alert sent: ${alert.alertType} - ${alert.title}`);
}
```

### BullMQ Integration

**Queue**: `polymarket-alerts`
- **Purpose**: Async alert delivery with retry
- **Concurrency**: 5 workers (respect rate limits)
- **Retry**: 3 attempts with exponential backoff

```javascript
// Queue alert for delivery
async queueAlert(alert) {
  const queue = bullmqConfig.createQueue('polymarket-alerts');
  await queue.add('send', {
    alertId: alert._id.toString()
  }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 }
  });
}
```

### Configuration

```javascript
DISCORD_POLYMARKET_ALERTS_WEBHOOK=https://discord.com/api/webhooks/...
POLYMARKET_ALERT_RATE_LIMIT=10 // alerts per minute
POLYMARKET_ALERT_COOLDOWN_WHALE=3600 // 1 hour
POLYMARKET_ALERT_COOLDOWN_SPIKE=900 // 15 minutes
POLYMARKET_ALERT_COOLDOWN_SENTIMENT=900 // 15 minutes
POLYMARKET_ALERT_COOLDOWN_ANOMALY=1800 // 30 minutes
```

### Error Handling

```javascript
// Webhook failures
try {
  await this.formatAndSend(alert);
} catch (error) {
  if (error.message.includes('429')) {
    // Rate limited by Discord - queue for retry
    await this.queueAlert(alert);
  } else {
    // Log error, mark alert as failed
    await PolymarketAlert.findByIdAndUpdate(alert._id, {
      failed: true,
      error: error.message
    });
  }
}
```
