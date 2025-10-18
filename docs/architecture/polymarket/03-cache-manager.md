# CacheManager Architecture

## Design Decision: Exact Match to `analytics-cache.js` Pattern

**Rationale**: Proven pattern already used in 4 services, graceful fallback, dev-friendly

## File: `src/services/polymarket/CacheManager.js`

### Class Design
```javascript
class CacheManager {
  constructor(options = {}) {
    this.enabled = process.env.REDIS_URL || process.env.REDIS_ENABLED === 'true';

    this.ttls = {
      SENTIMENT: 60,        // 1 minute
      MARKET_STATS: 300,    // 5 minutes
      WHALE_LIST: 600,      // 10 minutes
      ALERT_DEDUP: 3600     // 1 hour (varies by type)
    };

    if (!this.enabled) {
      console.warn('[CacheManager] Redis disabled - using in-memory fallback');
      this.memoryCache = new Map();
      return;
    }

    this.client = redis.createClient({
      url: process.env.REDIS_URL,
      socket: {
        reconnectStrategy: retries => Math.min(retries * 100, 3000)
      }
    });

    this.client.on('error', err => {
      console.error('[CacheManager] Redis error:', err);
      this.enabled = false; // Fallback to memory
    });
  }

  async get(key) { /* Redis or Map */ }
  async set(key, value, ttl) { /* Redis or Map with timeout */ }
  async del(key) { /* Delete from Redis or Map */ }
  async flush(pattern) { /* Bulk delete */ }
  async exists(key) { /* Check existence */ }
}
```

### Key Methods

#### `get(key)` - Retrieve Cached Value
```javascript
async get(key) {
  if (!this.enabled) {
    return this.memoryCache.get(key);
  }

  try {
    const value = await this.client.get(key);
    return value ? JSON.parse(value) : null;
  } catch (err) {
    console.error('[CacheManager] Get error:', err);
    return this.memoryCache.get(key); // Fallback
  }
}
```

#### `set(key, value, ttl)` - Store with TTL
```javascript
async set(key, value, ttl = this.ttls.SENTIMENT) {
  if (!this.enabled) {
    this.memoryCache.set(key, value);
    setTimeout(() => this.memoryCache.delete(key), ttl * 1000);
    return;
  }

  try {
    await this.client.setEx(key, ttl, JSON.stringify(value));
    // Also store in memory for double-fallback
    this.memoryCache.set(key, value);
  } catch (err) {
    console.error('[CacheManager] Set error:', err);
    this.memoryCache.set(key, value); // Fallback
  }
}
```

### TTL Configuration

```javascript
// Sentiment data - high volatility
SENTIMENT: 60s

// Market statistics - moderate volatility
MARKET_STATS: 300s

// Whale list - low volatility
WHALE_LIST: 600s

// Alert deduplication - varies by type
WHALE_BET: 3600s (1 hour)
VOLUME_SPIKE: 900s (15 minutes)
SENTIMENT_SHIFT: 900s (15 minutes)
ANOMALY: 1800s (30 minutes)
```

### Stampede Protection

```javascript
async getOrCompute(key, computeFn, ttl) {
  // Check cache
  let value = await this.get(key);
  if (value) return value;

  // Single-flight: Use lock to prevent duplicate computation
  const lockKey = `lock:${key}`;
  const acquired = await this.client.set(lockKey, '1', 'NX', 'EX', 5);

  if (!acquired) {
    // Wait and retry
    await new Promise(resolve => setTimeout(resolve, 100));
    return this.getOrCompute(key, computeFn, ttl);
  }

  // Compute and cache
  value = await computeFn();
  await this.set(key, value, ttl);
  await this.del(lockKey);

  return value;
}
```

### Memory Management (In-Memory Fallback)

```javascript
// Limit memory cache size
const MAX_MEMORY_CACHE_SIZE = 1000;

if (this.memoryCache.size > MAX_MEMORY_CACHE_SIZE) {
  // Delete oldest entries (FIFO)
  const firstKey = this.memoryCache.keys().next().value;
  this.memoryCache.delete(firstKey);
}
```

### Integration
- **Used by**: SentimentAnalyzer, DiscordAlertService, AnalysisPipeline
- **Shared with**: BullMQ (same Redis instance)
- **Fallback**: Graceful degradation to in-memory Map

### Configuration
```javascript
REDIS_URL=redis://localhost:6379
REDIS_ENABLED=true
POLYMARKET_CACHE_MAX_MEMORY=1000
```
