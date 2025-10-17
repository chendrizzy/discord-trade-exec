# Spec: Market Sentiment Analysis System

## ADDED Requirements

### Requirement: Real-Time Volume Aggregation by Outcome

The system SHALL aggregate betting volume by outcome for each market within a rolling 15-minute time window. Volume totals MUST update in real-time as new transactions are processed.

**Rationale**: Recent volume trends indicate where "smart money" is flowing, providing directional signals.

#### Scenario: Calculate volume by outcome for binary market

**Given** market 0x7a3b2f has 2 outcomes: 0 = "Trump Win", 1 = "Harris Win"
**And** current time is 2025-10-17 08:45:00
**And** SentimentAnalyzer analyzes last 15 minutes (since 08:30:00)
**When** transactions in time window are:
- 08:32:15 - Wallet A → $150K on outcome 0
- 08:35:40 - Wallet B → $80K on outcome 1
- 08:38:22 - Wallet C → $220K on outcome 0
- 08:40:05 - Wallet D → $50K on outcome 1
- 08:42:30 - Wallet E → $350K on outcome 0
**Then** SentimentAnalyzer.analyzeMarket() calculates:
```json
{
  "volumeByOutcome": {
    "0": "720000", // $150K + $220K + $350K = $720K (Trump)
    "1": "130000"  // $80K + $50K = $130K (Harris)
  },
  "totalVolume": "850000"
}
```

---

#### Scenario: Identify dominant outcome

**Given** volumeByOutcome calculated as:
```json
{
  "0": "720000", // Trump Win
  "1": "130000"  // Harris Win
}
```
**When** SentimentAnalyzer.findDominantOutcome() called
**Then** function returns:
```json
{
  "outcome": 0,
  "outcomeName": "Trump Win",
  "volume": "720000",
  "percentage": 84.7 // (720000 / 850000) * 100
}
```
**And** indicates Trump Win has 84.7% of recent betting volume

---

### Requirement: Volume Spike Detection

The system SHALL detect volume spikes by comparing current 15-minute volume to 24-hour average. Spikes >200% of average MUST trigger HIGH severity alerts.

**Rationale**: Sudden volume increases signal breaking news, insider activity, or coordinated betting—all valuable trading signals.

#### Scenario: Detect volume spike exceeding threshold

**Given** market 0x7a3b2f has 24-hour average volume of $280,000 per 15-minute window
**And** current 15-minute window has total volume of $900,000
**When** SentimentAnalyzer.detectVolumeSpike() calculates spike multiplier:
- Current: $900,000
- Average: $280,000
- Multiplier: 900000 / 280000 = 3.21
**Then** spike detection returns:
```json
{
  "currentVolume": "900000",
  "avgVolume": "280000",
  "spikeMultiplier": 3.21,
  "isSpike": true // (3.21 >= 2.0 threshold)
}
```
**And** VOLUME_SPIKE alert generated with severity: HIGH

---

#### Scenario: No alert when volume within normal range

**Given** market 0x7a3b2f has 24-hour average volume of $280,000 per 15-minute window
**And** current 15-minute window has total volume of $320,000
**When** SentimentAnalyzer.detectVolumeSpike() calculates:
- Multiplier: 320000 / 280000 = 1.14
**Then** spike detection returns:
```json
{
  "isSpike": false // (1.14 < 2.0 threshold)
}
```
**And** NO alert generated (volume within normal range)

---

### Requirement: Sentiment Shift Tracking

The system SHALL compare current volume distribution to previous time window and calculate net sentiment shift for each outcome. Shifts >10% MUST be highlighted in alerts.

**Rationale**: Rapid sentiment reversals indicate changing market conditions and potential trading opportunities.

#### Scenario: Calculate sentiment shift between time windows

**Given** previous 15-minute window (08:15-08:30) had volume distribution:
```json
{
  "0": "300000", // Trump Win
  "1": "400000"  // Harris Win
}
```
**And** current window (08:30-08:45) has volume distribution:
```json
{
  "0": "720000", // Trump Win
  "1": "130000"  // Harris Win
}
```
**When** SentimentAnalyzer.calculateSentimentShift() called
**Then** function calculates raw shifts:
```json
{
  "0": "+420000", // $720K - $300K = +$420K Trump
  "1": "-270000"  // $130K - $400K = -$270K Harris
}
```
**And** function calculates percentage shifts:
```json
{
  "0": "+140%", // (420000 / 300000) * 100
  "1": "-67.5%" // (270000 / 400000) * 100
}
```
**And** SENTIMENT_SHIFT alert generated (Trump +140% exceeds +10% threshold)

---

### Requirement: Market Sentiment API Endpoint

The system SHALL expose GET /api/polymarket/sentiment/:marketId returning current sentiment data including volume breakdown, dominant outcome, spike status, and sentiment shifts.

**Rationale**: Users and dashboard need programmatic access to real-time sentiment analysis.

#### Scenario: Retrieve sentiment data via API

**Given** market 0x7a3b2f has active sentiment analysis running
**When** client sends GET /api/polymarket/sentiment/0x7a3b2f
**Then** response includes:
```json
{
  "success": true,
  "marketId": "0x7a3b2f...",
  "marketTitle": "Presidential Election 2024: Winner",
  "timestamp": "2025-10-17T08:45:00Z",
  "timeWindow": "15 minutes",
  "sentiment": {
    "volumeByOutcome": {
      "0": "720000", // Trump Win
      "1": "130000"  // Harris Win
    },
    "totalVolume": "850000",
    "dominantOutcome": {
      "outcome": 0,
      "name": "Trump Win",
      "volume": "720000",
      "percentage": 84.7
    },
    "volumeSpike": {
      "currentVolume": "850000",
      "avgVolume": "280000",
      "spikeMultiplier": 3.04,
      "isSpike": true
    },
    "sentimentShift": {
      "0": {
        "raw": "+420000",
        "percentage": "+140%"
      },
      "1": {
        "raw": "-270000",
        "percentage": "-67.5%"
      }
    }
  }
}
```
**And** response status is 200 OK

---

### Requirement: Sentiment Caching for Performance

The system SHALL cache sentiment analysis results in Redis with 1-minute TTL to reduce database load. Cache keys MUST include marketId and time window.

**Rationale**: Sentiment queries can be expensive (aggregating 15 minutes of transactions). Caching improves API response times.

#### Scenario: Serve sentiment from Redis cache

**Given** sentiment for market 0x7a3b2f was calculated 30 seconds ago
**And** result cached in Redis with key: `sentiment:0x7a3b2f:15min`
**And** TTL remaining: 30 seconds
**When** client sends GET /api/polymarket/sentiment/0x7a3b2f
**Then** system checks Redis cache
**And** cache HIT (key exists and not expired)
**And** response served from cache (no database query)
**And** response time: <50ms

---

#### Scenario: Recalculate sentiment after cache expiration

**Given** sentiment cache for market 0x7a3b2f expired 10 seconds ago
**When** client sends GET /api/polymarket/sentiment/0x7a3b2f
**Then** system checks Redis cache
**And** cache MISS (key expired)
**And** SentimentAnalyzer.analyzeMarket() recalculates from database
**And** new result cached with 60-second TTL
**And** response includes fresh sentiment data
**And** response time: <500ms (includes database query)

---

## MODIFIED Requirements

None. All sentiment analysis requirements are new additions.

---

## REMOVED Requirements

None.

---

## Cross-References

- **Related Spec**: `whale-tracking` - Whale bets contribute to overall market sentiment
- **Related Spec**: `discord-integration` - Sentiment shifts trigger Discord alerts
- **Dependency**: polymarket_transactions table must have timestamp index
- **Dependency**: Redis cache server for performance optimization

---

## Technical Notes

### Sentiment Analysis SQL Query

```sql
-- Optimized query for 15-minute volume aggregation
SELECT
  outcome,
  SUM(amount) as total_volume,
  COUNT(*) as bet_count
FROM polymarket_transactions
WHERE
  market_id = $1
  AND timestamp >= NOW() - INTERVAL '15 minutes'
GROUP BY outcome
ORDER BY total_volume DESC;
```

### 24-Hour Average Calculation

```sql
-- Calculate 24-hour average volume per 15-minute window
WITH hourly_volumes AS (
  SELECT
    date_trunc('hour', timestamp) +
    (EXTRACT(MINUTE FROM timestamp)::int / 15) * INTERVAL '15 minutes' AS window_start,
    SUM(amount) as window_volume
  FROM polymarket_transactions
  WHERE
    market_id = $1
    AND timestamp >= NOW() - INTERVAL '24 hours'
  GROUP BY window_start
)
SELECT AVG(window_volume) as avg_15min_volume
FROM hourly_volumes;
```

### Redis Cache Key Schema

```javascript
// Cache keys follow this pattern:
const cacheKey = `sentiment:${marketId}:${timeWindow}`;

// Examples:
// sentiment:0x7a3b2f...:15min
// sentiment:0x7a3b2f...:1hour
// sentiment:0x7a3b2f...:24hour

// Cache values are JSON-serialized sentiment objects:
{
  "volumeByOutcome": {...},
  "dominantOutcome": {...},
  "volumeSpike": {...},
  "sentimentShift": {...},
  "calculatedAt": "2025-10-17T08:45:00Z"
}
```

### Sentiment Alert Trigger Conditions

```javascript
const SENTIMENT_ALERT_THRESHOLDS = {
  volumeSpike: {
    multiplier: 2.0, // 200% of average
    severity: 'HIGH'
  },
  sentimentShift: {
    minPercentage: 10, // 10% shift
    severities: {
      extreme: { threshold: 50, severity: 'CRITICAL' }, // >50% shift
      high: { threshold: 25, severity: 'HIGH' },        // 25-50% shift
      medium: { threshold: 10, severity: 'MEDIUM' }     // 10-25% shift
    }
  }
};

function shouldTriggerAlert(sentiment) {
  // Volume spike check
  if (sentiment.volumeSpike.isSpike) {
    return {
      trigger: true,
      type: 'VOLUME_SPIKE',
      severity: SENTIMENT_ALERT_THRESHOLDS.volumeSpike.severity
    };
  }

  // Sentiment shift check
  for (const [outcome, shift] of Object.entries(sentiment.sentimentShift)) {
    const shiftPct = Math.abs(parseFloat(shift.percentage));

    if (shiftPct >= 50) {
      return {
        trigger: true,
        type: 'SENTIMENT_SHIFT',
        severity: 'CRITICAL',
        outcome,
        shift: shift.percentage
      };
    } else if (shiftPct >= 25) {
      return {
        trigger: true,
        type: 'SENTIMENT_SHIFT',
        severity: 'HIGH',
        outcome,
        shift: shift.percentage
      };
    } else if (shiftPct >= 10) {
      return {
        trigger: true,
        type: 'SENTIMENT_SHIFT',
        severity: 'MEDIUM',
        outcome,
        shift: shift.percentage
      };
    }
  }

  return { trigger: false };
}
```

### Real-Time Sentiment Update Flow

```
1. NEW TRANSACTION DETECTED (EventListener)
   ↓
2. INVALIDATE REDIS CACHE
   - Delete key: sentiment:${marketId}:15min
   ↓
3. TRIGGER SENTIMENT RECALCULATION
   - Query last 15 minutes of transactions
   - Calculate volume by outcome
   - Detect spikes and shifts
   ↓
4. CACHE UPDATED SENTIMENT
   - Set Redis key with 60-second TTL
   ↓
5. CHECK ALERT THRESHOLDS
   - If triggered → Generate alert
   - If not → No action
   ↓
6. WEBSOCKET BROADCAST (Dashboard)
   - Send updated sentiment to connected clients
```

---

**Spec Status**: Complete
**Scenarios**: 8 scenarios defined
**Coverage**: Volume aggregation, spike detection, sentiment shifts, API endpoints, caching
