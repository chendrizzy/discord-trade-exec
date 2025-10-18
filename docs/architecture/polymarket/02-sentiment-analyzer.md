# SentimentAnalyzer Service Architecture

## Design Decision: Optional Redis with Fallback

**Rationale**: Matches existing `analytics-cache.js` pattern, dev-friendly, production-ready

## File: `src/services/polymarket/SentimentAnalyzer.js`

### Class Design
```javascript
class SentimentAnalyzer {
  constructor() {
    if (SentimentAnalyzer.instance) return SentimentAnalyzer.instance;
    this.cacheManager = require('./CacheManager');
    SentimentAnalyzer.instance = this;
  }

  async analyzeMarket(marketId) {
    // Check cache first (1-min TTL)
    // Calculate sentiment metrics
    // Detect spikes and shifts
    // Cache results
  }

  async detectVolumeSpike(marketId) {
    // Compare 15-min volume to 24h average
    // Threshold: >200%
  }

  async detectSentimentShift(marketId) {
    // Compare current window to previous
    // Threshold: >10% change in dominant outcome
  }
}
```

### Key Methods

#### `analyzeMarket(marketId)` - Main Analysis
**Target**: <2s total (cache hit: <1ms)

**MongoDB Aggregation Pipeline**:
```javascript
PolymarketTransaction.aggregate([
  {
    $match: {
      marketId,
      timestamp: { $gte: fifteenMinutesAgo }
    }
  },
  {
    $group: {
      _id: '$outcome',
      volume: { $sum: { $toDouble: '$makerAmountFilled' } },
      count: { $sum: 1 }
    }
  },
  {
    $sort: { volume: -1 }
  }
])
```

**Returns**:
```javascript
{
  marketId,
  window: { start, end },
  volumeByOutcome: { YES: 125000, NO: 75000 },
  dominantOutcome: 'YES',
  dominantPercentage: 62.5,
  totalVolume: 200000,
  volumeSpike: { detected: true, percentage: 250 },
  sentimentShift: { detected: false }
}
```

#### `detectVolumeSpike(marketId)`
1. Get 15-min volume (current window)
2. Get 24h average volume
3. Calculate percentage: `(current / avg24h) * 100`
4. Return spike if >200%

#### `detectSentimentShift(marketId)`
1. Get current 15-min sentiment
2. Get previous 15-min sentiment (cache or query)
3. Compare dominant outcome percentages
4. Return shift if >10% change

### Caching Strategy

**Keys**:
- `polymarket:sentiment:{marketId}` - TTL: 60s
- `polymarket:baseline:{marketId}` - TTL: 300s (24h average)

**Cache Manager**: See `03-cache-manager.md`

### Performance Optimization
- **Indexes**: Compound index on `(marketId, timestamp)`
- **Aggregation**: Use `$match` first to reduce dataset
- **Cache hits**: 90%+ for frequently-queried markets
- **Stampede protection**: Single-flight pattern

### Integration
- **Called by**: AnalysisPipeline on transaction events
- **Dependencies**: CacheManager, PolymarketTransaction model
- **Alerts**: Triggers volume spike/sentiment shift alerts

### Configuration
```javascript
SENTIMENT_WINDOW_MINUTES=15
VOLUME_SPIKE_THRESHOLD=200 // percentage
SENTIMENT_SHIFT_THRESHOLD=10 // percentage
SENTIMENT_CACHE_TTL=60 // seconds
```
