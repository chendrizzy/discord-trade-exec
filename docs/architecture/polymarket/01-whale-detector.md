# WhaleDetector Service Architecture

## Design Decision: Option B - Service Orchestrates Model Methods

**Rationale**: Follows existing DDD pattern in codebase (TransactionProcessor → wallet.updateMetrics())

## File: `src/services/polymarket/WhaleDetector.js`

### Class Design
```javascript
class WhaleDetector {
  constructor() {
    if (WhaleDetector.instance) return WhaleDetector.instance;
    this.stats = { updated: 0, errors: 0 };
    WhaleDetector.instance = this;
  }

  async updateAllWhales(options = {}) {
    // Batch process all wallets needing updates
    // Calls existing wallet.updateWhaleStatus() method
  }

  async updateWhaleWinRates() {
    // Integrate with Polymarket API for settlement data
  }

  async getTopWhales(limit = 100) {
    // Query top whales by score
  }

  getStats() {
    return this.stats;
  }
}
```

### Key Methods

#### `updateAllWhales({ batchSize = 1000, onProgress })`
- Query wallets needing updates (hourly or triggered)
- Process in batches to manage memory
- Call existing `wallet.updateWhaleStatus()` for each
- Track progress and errors
- Target: <500ms per wallet

#### `updateWhaleWinRates()`
- Fetch settlement data from Polymarket API
- Update wallet win rates
- Cache results to minimize API calls

#### `getTopWhales(limit)`
- Query: `PolymarketWallet.find({ isWhale: true }).sort({ whaleScore: -1 }).limit(limit)`
- Return top whales for API endpoints

### BullMQ Integration

**Job**: `polymarket-whale-updates`
**Schedule**: Hourly (`0 * * * *`)
**Payload**: `{ batchSize: 1000 }`
**Worker**: `src/jobs/workers/whaleUpdates.js`

```javascript
// Worker implementation
module.exports = async (job) => {
  const whaleDetector = require('../../services/polymarket/WhaleDetector');
  const result = await whaleDetector.updateAllWhales({
    batchSize: job.data.batchSize,
    onProgress: (progress) => job.updateProgress(progress)
  });
  return result;
};
```

### Performance Optimization
- Batch size: 1000 wallets per iteration
- Use lean queries (select only needed fields)
- Async processing (don't block event pipeline)
- Progress tracking for long-running jobs

### Integration Points
- **Existing**: `PolymarketWallet.updateWhaleStatus()` (already implemented)
- **New**: BullMQ hourly cron job
- **API**: Polymarket settlement data (for win rates)

### Configuration
```javascript
POLYMARKET_API_URL=https://clob.polymarket.com
WHALE_UPDATE_BATCH_SIZE=1000
WHALE_UPDATE_INTERVAL=3600000 // 1 hour
```
