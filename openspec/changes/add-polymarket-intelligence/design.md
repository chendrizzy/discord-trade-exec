# Design Document: Polymarket Blockchain Intelligence System

**Component**: Public Blockchain Data Intelligence Engine
**Version**: 1.0.0
**Last Updated**: 2025-10-17

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Data Flow](#data-flow)
3. [Component Design](#component-design)
4. [Database Schema](#database-schema)
5. [API Endpoints](#api-endpoints)
6. [Alert System](#alert-system)
7. [Security & Compliance](#security--compliance)
8. [Performance Optimization](#performance-optimization)

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Polygon Blockchain                        │
│                  (Polymarket Smart Contracts)                    │
└────────────────┬────────────────────────────────────────────────┘
                 │ Event Subscriptions (WebSocket)
                 ↓
┌─────────────────────────────────────────────────────────────────┐
│           Blockchain Data Ingestion Layer                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ RPC Provider │→│Event Listener│→│TX Parser      │          │
│  │ (Infura)     │  │ (WebSocket)  │  │ (ABI Decoder) │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└────────────────┬────────────────────────────────────────────────┘
                 │ Parsed Transaction Data
                 ↓
┌─────────────────────────────────────────────────────────────────┐
│                  PostgreSQL Database                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Transactions │  │ Wallets      │  │ Markets      │          │
│  │ (Time-Series)│  │ (Whale Data) │  │ (Metadata)   │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└────────────────┬────────────────────────────────────────────────┘
                 │ Historical Data
                 ↓
┌─────────────────────────────────────────────────────────────────┐
│              Intelligence Analysis Engine                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Whale Tracker│  │ Sentiment    │  │ Anomaly      │          │
│  │ (Scoring)    │  │ Analyzer     │  │ Detector     │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└────────────────┬────────────────────────────────────────────────┘
                 │ Alert Triggers
                 ↓
┌─────────────────────────────────────────────────────────────────┐
│                   Alert Distribution System                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Discord      │  │ Dashboard    │  │ Email (opt)  │          │
│  │ Webhooks     │  │ WebSocket    │  │ Notifications│          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────────────────────────────┐
│            Discord Trade Execution System (Existing)             │
│                  User Decision → Trade Execution                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### Real-Time Transaction Processing Flow

```
1. BLOCKCHAIN EVENT DETECTION
   Polygon Block N → Smart Contract Event Emitted
   ↓
   Event: BetPlaced(marketId, user, outcome, amount, timestamp)

2. DATA INGESTION
   WebSocket Listener → Receives Event
   ↓
   ABI Decoder → Parses Event Parameters
   {
     marketId: "0x7a3b2f...",
     user: "0x9c4d1e...",
     outcome: 0 (Trump Win),
     amount: "500000000000000000000000" (500K USDC),
     timestamp: 1697500000
   }

3. DATABASE WRITE
   PostgreSQL INSERT → polymarket_transactions table
   ↓
   TimescaleDB Hypertable (time-series optimized)

4. WHALE DETECTION
   Wallet Score Calculation:
   - Total volume: $2.5M (all-time)
   - Win rate: 78% (historical accuracy)
   - Position size: $500K (current bet)
   ↓
   Whale Status: TRUE (threshold: $100K+ bets OR $1M+ volume)

5. SENTIMENT ANALYSIS
   Market Aggregate:
   - Trump volume: +$720K (last 15 min)
   - Harris volume: +$180K (last 15 min)
   - Net sentiment: +$540K Trump (75% bullish)
   - Volume spike: 320% above average
   ↓
   Sentiment Score: BULLISH (+15 shift)

6. ALERT GENERATION
   Trigger Conditions Met:
   ✅ Whale bet detected ($500K > $100K threshold)
   ✅ Volume spike (320% > 200% threshold)
   ✅ Sentiment shift (+15 > +10 threshold)
   ↓
   Alert Created with Context

7. DISTRIBUTION
   Discord Webhook → #polymarket-signals channel
   Dashboard WebSocket → Live update to connected clients
   Database → Alert history for user review
```

---

## Component Design

### 1. Blockchain Data Ingestion Layer

**Purpose**: Connect to Polygon blockchain, subscribe to Polymarket contract events, parse transactions

#### Components

**RPC Provider Connection**
```javascript
// src/services/polymarket/BlockchainProvider.js
class BlockchainProvider {
  constructor(config) {
    this.providers = [
      new ethers.providers.JsonRpcProvider(config.infuraUrl),
      new ethers.providers.JsonRpcProvider(config.alchemyUrl), // Fallback
      new ethers.providers.JsonRpcProvider(config.quicknodeUrl) // Fallback
    ];
    this.activeProvider = this.providers[0];
  }

  async getProvider() {
    // Health check current provider
    try {
      await this.activeProvider.getBlockNumber();
      return this.activeProvider;
    } catch (error) {
      // Failover to backup provider
      this.activeProvider = this.providers[1];
      return this.activeProvider;
    }
  }
}
```

**Event Listener Service**
```javascript
// src/services/polymarket/EventListener.js
class EventListener {
  constructor(provider, contractAddress, abi) {
    this.contract = new ethers.Contract(contractAddress, abi, provider);
  }

  async startListening() {
    // Subscribe to BetPlaced events
    this.contract.on('BetPlaced', async (marketId, user, outcome, amount, timestamp, event) => {
      const transaction = {
        txHash: event.transactionHash,
        blockNumber: event.blockNumber,
        marketId,
        walletAddress: user,
        outcome,
        amount: ethers.utils.formatUnits(amount, 6), // USDC has 6 decimals
        timestamp: new Date(timestamp * 1000)
      };

      await this.processTransaction(transaction);
    });

    // Subscribe to BetSettled events
    this.contract.on('BetSettled', async (marketId, user, won, payout, event) => {
      await this.processSettlement({
        txHash: event.transactionHash,
        marketId,
        walletAddress: user,
        won,
        payout: ethers.utils.formatUnits(payout, 6)
      });
    });
  }

  async processTransaction(tx) {
    // Save to database
    await PolymarketTransaction.create(tx);

    // Trigger analysis pipeline
    await this.analysisPipeline.process(tx);
  }
}
```

---

### 2. Whale Wallet Detection Engine

**Purpose**: Identify high-value wallets, track activity, calculate historical performance

#### Whale Scoring Algorithm

```javascript
// src/services/polymarket/WhaleDetector.js
class WhaleDetector {
  async scoreWallet(walletAddress) {
    const metrics = await this.calculateMetrics(walletAddress);

    const score = {
      totalVolume: metrics.totalVolume, // All-time betting volume
      avgBetSize: metrics.totalVolume / metrics.betCount,
      winRate: metrics.wins / metrics.totalBets,
      recentActivity: metrics.last30DaysVolume,
      largestBet: metrics.maxSingleBet,
      isWhale: this.determineWhaleStatus(metrics)
    };

    return score;
  }

  determineWhaleStatus(metrics) {
    // Whale criteria (ANY condition triggers):
    return (
      metrics.totalVolume >= 1000000 || // $1M+ total volume
      metrics.maxSingleBet >= 100000 || // $100K+ single bet
      (metrics.avgBetSize >= 50000 && metrics.betCount >= 10) || // Consistent large bets
      metrics.last30DaysVolume >= 500000 // $500K+ recent activity
    );
  }

  async calculateMetrics(walletAddress) {
    const transactions = await PolymarketTransaction.findAll({
      where: { walletAddress },
      order: [['timestamp', 'DESC']]
    });

    const settlements = await PolymarketSettlement.findAll({
      where: { walletAddress }
    });

    return {
      totalVolume: transactions.reduce((sum, tx) => sum + parseFloat(tx.amount), 0),
      betCount: transactions.length,
      wins: settlements.filter(s => s.won).length,
      totalBets: settlements.length,
      maxSingleBet: Math.max(...transactions.map(tx => parseFloat(tx.amount))),
      last30DaysVolume: transactions
        .filter(tx => tx.timestamp > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
        .reduce((sum, tx) => sum + parseFloat(tx.amount), 0)
    };
  }
}
```

---

### 3. Market Sentiment Analysis Engine

**Purpose**: Aggregate betting volume, detect trends, identify anomalies

#### Sentiment Calculation

```javascript
// src/services/polymarket/SentimentAnalyzer.js
class SentimentAnalyzer {
  async analyzeMarket(marketId, timeWindow = 15 * 60 * 1000) { // 15 minutes default
    const since = new Date(Date.now() - timeWindow);

    const recentTx = await PolymarketTransaction.findAll({
      where: {
        marketId,
        timestamp: { [Op.gte]: since }
      }
    });

    // Group by outcome
    const volumeByOutcome = {};
    recentTx.forEach(tx => {
      const outcome = tx.outcome;
      if (!volumeByOutcome[outcome]) {
        volumeByOutcome[outcome] = 0;
      }
      volumeByOutcome[outcome] += parseFloat(tx.amount);
    });

    // Calculate sentiment
    const outcomes = Object.keys(volumeByOutcome);
    const totalVolume = Object.values(volumeByOutcome).reduce((sum, v) => sum + v, 0);

    const sentiment = {
      marketId,
      timeWindow: `${timeWindow / 60000} minutes`,
      totalVolume,
      volumeByOutcome,
      dominantOutcome: this.findDominantOutcome(volumeByOutcome),
      volumeSpike: await this.detectVolumeSpike(marketId, totalVolume),
      sentimentShift: await this.calculateSentimentShift(marketId, volumeByOutcome)
    };

    return sentiment;
  }

  findDominantOutcome(volumeByOutcome) {
    let maxOutcome = null;
    let maxVolume = 0;

    for (const [outcome, volume] of Object.entries(volumeByOutcome)) {
      if (volume > maxVolume) {
        maxVolume = volume;
        maxOutcome = outcome;
      }
    }

    return {
      outcome: maxOutcome,
      volume: maxVolume,
      percentage: (maxVolume / Object.values(volumeByOutcome).reduce((sum, v) => sum + v, 0)) * 100
    };
  }

  async detectVolumeSpike(marketId, currentVolume) {
    // Compare to 24-hour average
    const avgVolume = await this.get24HourAverage(marketId);
    const spikeMultiplier = currentVolume / avgVolume;

    return {
      currentVolume,
      avgVolume,
      spikeMultiplier,
      isSpike: spikeMultiplier >= 2.0 // 200% of average = spike
    };
  }

  async calculateSentimentShift(marketId, currentVolumeByOutcome) {
    // Compare to previous time window
    const previousSentiment = await this.getPreviousSentiment(marketId);

    const shifts = {};
    for (const [outcome, volume] of Object.entries(currentVolumeByOutcome)) {
      const previousVolume = previousSentiment.volumeByOutcome[outcome] || 0;
      shifts[outcome] = volume - previousVolume;
    }

    return shifts;
  }
}
```

---

### 4. Anomaly Detection System

**Purpose**: Identify unusual patterns, potential manipulation, coordinated betting

#### Pattern Detection

```javascript
// src/services/polymarket/AnomalyDetector.js
class AnomalyDetector {
  async detectAnomalies(marketId) {
    const anomalies = [];

    // 1. Coordinated Betting Pattern
    const coordinatedBetting = await this.detectCoordinatedBetting(marketId);
    if (coordinatedBetting.detected) {
      anomalies.push({
        type: 'COORDINATED_BETTING',
        severity: 'HIGH',
        details: coordinatedBetting
      });
    }

    // 2. Sudden Reversal Pattern
    const reversal = await this.detectSuddenReversal(marketId);
    if (reversal.detected) {
      anomalies.push({
        type: 'SUDDEN_REVERSAL',
        severity: 'MEDIUM',
        details: reversal
      });
    }

    // 3. Flash Whale Pattern (large bet → immediate opposite bets)
    const flashWhale = await this.detectFlashWhale(marketId);
    if (flashWhale.detected) {
      anomalies.push({
        type: 'FLASH_WHALE',
        severity: 'HIGH',
        details: flashWhale
      });
    }

    return anomalies;
  }

  async detectCoordinatedBetting(marketId) {
    // Find multiple wallets betting same outcome within tight time window
    const timeWindow = 60 * 1000; // 1 minute
    const recentTx = await PolymarketTransaction.findAll({
      where: {
        marketId,
        timestamp: { [Op.gte]: new Date(Date.now() - timeWindow) }
      },
      order: [['timestamp', 'ASC']]
    });

    // Group by outcome and check for clustering
    const outcomeGroups = {};
    recentTx.forEach(tx => {
      if (!outcomeGroups[tx.outcome]) {
        outcomeGroups[tx.outcome] = [];
      }
      outcomeGroups[tx.outcome].push(tx);
    });

    // Detect if 5+ wallets bet same outcome within 1 minute
    for (const [outcome, txs] of Object.entries(outcomeGroups)) {
      if (txs.length >= 5) {
        const uniqueWallets = [...new Set(txs.map(tx => tx.walletAddress))];
        if (uniqueWallets.length >= 5) {
          return {
            detected: true,
            outcome,
            walletCount: uniqueWallets.length,
            totalVolume: txs.reduce((sum, tx) => sum + parseFloat(tx.amount), 0),
            timeWindow: '1 minute'
          };
        }
      }
    }

    return { detected: false };
  }
}
```

---

## Database Schema

### PostgreSQL Tables

#### polymarket_transactions (TimescaleDB Hypertable)
```sql
CREATE TABLE polymarket_transactions (
  id SERIAL PRIMARY KEY,
  tx_hash VARCHAR(66) UNIQUE NOT NULL,
  block_number BIGINT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  market_id VARCHAR(66) NOT NULL,
  wallet_address VARCHAR(42) NOT NULL,
  outcome INTEGER NOT NULL,
  amount DECIMAL(20, 6) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_market_timestamp (market_id, timestamp DESC),
  INDEX idx_wallet_timestamp (wallet_address, timestamp DESC),
  INDEX idx_timestamp (timestamp DESC)
);

-- Convert to TimescaleDB hypertable for time-series optimization
SELECT create_hypertable('polymarket_transactions', 'timestamp');
```

#### polymarket_markets
```sql
CREATE TABLE polymarket_markets (
  market_id VARCHAR(66) PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category VARCHAR(100),
  outcomes JSONB NOT NULL, -- Array of possible outcomes
  created_at TIMESTAMPTZ NOT NULL,
  settlement_date TIMESTAMPTZ,
  resolved BOOLEAN DEFAULT FALSE,
  winning_outcome INTEGER,

  INDEX idx_category (category),
  INDEX idx_settlement_date (settlement_date)
);
```

#### polymarket_wallets
```sql
CREATE TABLE polymarket_wallets (
  wallet_address VARCHAR(42) PRIMARY KEY,
  is_whale BOOLEAN DEFAULT FALSE,
  total_volume DECIMAL(20, 6) DEFAULT 0,
  bet_count INTEGER DEFAULT 0,
  win_count INTEGER DEFAULT 0,
  loss_count INTEGER DEFAULT 0,
  win_rate DECIMAL(5, 2) DEFAULT 0, -- Percentage
  avg_bet_size DECIMAL(20, 6) DEFAULT 0,
  largest_bet DECIMAL(20, 6) DEFAULT 0,
  last_activity TIMESTAMPTZ,
  whale_score DECIMAL(10, 2) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_is_whale (is_whale),
  INDEX idx_total_volume (total_volume DESC),
  INDEX idx_last_activity (last_activity DESC)
);
```

#### polymarket_alerts
```sql
CREATE TABLE polymarket_alerts (
  id SERIAL PRIMARY KEY,
  alert_type VARCHAR(50) NOT NULL, -- 'WHALE_BET', 'VOLUME_SPIKE', 'SENTIMENT_SHIFT', 'ANOMALY'
  severity VARCHAR(20) NOT NULL, -- 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
  market_id VARCHAR(66) NOT NULL,
  wallet_address VARCHAR(42),
  amount DECIMAL(20, 6),
  metadata JSONB, -- Flexible field for alert-specific data
  sent_to_discord BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  INDEX idx_alert_type (alert_type),
  INDEX idx_created_at (created_at DESC),
  INDEX idx_market_id (market_id)
);
```

---

## API Endpoints

### REST API Routes

#### GET /api/polymarket/markets
**Purpose**: List active Polymarket markets

**Response**:
```json
{
  "success": true,
  "markets": [
    {
      "marketId": "0x7a3b2f9e...",
      "title": "Presidential Election 2024: Winner",
      "category": "Politics",
      "outcomes": ["Trump Win", "Harris Win"],
      "totalVolume": "45000000",
      "sentiment": {
        "dominant": "Trump Win",
        "percentage": 52
      }
    }
  ]
}
```

#### GET /api/polymarket/whales
**Purpose**: List current whale wallets

**Response**:
```json
{
  "success": true,
  "whales": [
    {
      "walletAddress": "0x9c4d1e...",
      "totalVolume": "2500000",
      "winRate": 78.5,
      "avgBetSize": "125000",
      "lastActivity": "2025-10-17T00:45:00Z",
      "recentBets": [
        {
          "marketId": "0x7a3b2f...",
          "outcome": "Trump Win",
          "amount": "500000",
          "timestamp": "2025-10-17T00:45:00Z"
        }
      ]
    }
  ]
}
```

#### GET /api/polymarket/sentiment/:marketId
**Purpose**: Get current market sentiment

**Response**:
```json
{
  "success": true,
  "marketId": "0x7a3b2f...",
  "sentiment": {
    "volumeByOutcome": {
      "0": "720000", // Trump Win
      "1": "180000"  // Harris Win
    },
    "dominantOutcome": {
      "outcome": 0,
      "percentage": 80
    },
    "volumeSpike": {
      "current": "900000",
      "average": "280000",
      "spikeMultiplier": 3.2,
      "isSpike": true
    },
    "sentimentShift": {
      "0": "+540000", // Trump Win gained $540K
      "1": "-180000"  // Harris Win lost $180K
    }
  }
}
```

#### GET /api/polymarket/alerts
**Purpose**: List recent alerts

**Query Parameters**:
- `type` - Filter by alert type
- `severity` - Filter by severity
- `since` - Timestamp (ISO 8601)

**Response**:
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
      "timestamp": "2025-10-17T00:45:00Z",
      "metadata": {
        "whaleScore": 85,
        "winRate": 78.5,
        "volumeSpike": 320
      }
    }
  ]
}
```

---

## Alert System

### Discord Integration

#### Webhook Configuration
```javascript
// src/config/discord.js
module.exports = {
  polymarket: {
    webhooks: {
      alerts: process.env.DISCORD_POLYMARKET_ALERTS_WEBHOOK,
      whales: process.env.DISCORD_POLYMARKET_WHALES_WEBHOOK,
      anomalies: process.env.DISCORD_POLYMARKET_ANOMALIES_WEBHOOK
    },
    channels: {
      alerts: '#polymarket-signals',
      whales: '#whale-tracking',
      anomalies: '#market-anomalies'
    }
  }
};
```

#### Alert Formatter
```javascript
// src/services/polymarket/AlertFormatter.js
class AlertFormatter {
  formatWhaleAlert(alert) {
    const { market, wallet, amount, outcome, metadata } = alert;

    return {
      embeds: [{
        title: '🐋 WHALE ALERT',
        description: market.title,
        color: 0xFF6B00, // Orange
        fields: [
          {
            name: 'Wallet',
            value: `\`${wallet.substring(0, 10)}...\``,
            inline: true
          },
          {
            name: 'Historical Accuracy',
            value: `${metadata.winRate}%`,
            inline: true
          },
          {
            name: 'Action',
            value: `BUY $${(amount / 1000).toFixed(0)}K → ${outcome}`,
            inline: false
          },
          {
            name: 'Current Odds',
            value: market.currentOdds,
            inline: true
          },
          {
            name: 'Volume Spike',
            value: `+${metadata.volumeSpike}% (last 15 min)`,
            inline: true
          },
          {
            name: 'Sentiment',
            value: `${metadata.sentiment > 0 ? 'BULLISH' : 'BEARISH'} (${metadata.sentiment > 0 ? '+' : ''}${metadata.sentiment}% shift)`,
            inline: false
          }
        ],
        timestamp: new Date().toISOString()
      }]
    };
  }
}
```

---

## Security & Compliance

### Data Privacy
- **No PII Collection**: Only public wallet addresses (pseudonymous)
- **No User Tracking**: No cookies, no session tracking beyond Discord integration
- **Transparent Sources**: All data publicly verifiable on Polygon blockchain

### Rate Limiting
```javascript
// src/middleware/rateLimiter.js
const rateLimit = require('express-rate-limit');

const polymarketLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  message: 'Too many requests from this IP, please try again later'
});

module.exports = { polymarketLimiter };
```

### Legal Disclaimers
```javascript
// All alert messages include:
const disclaimer = {
  footer: {
    text: '⚠️ This is informational only, not investment advice. Trade at your own risk.'
  }
};
```

---

## Performance Optimization

### Caching Strategy
```javascript
// src/services/polymarket/CacheManager.js
const redis = require('redis');

class CacheManager {
  constructor() {
    this.client = redis.createClient({
      url: process.env.REDIS_URL
    });
  }

  // Cache whale wallet data (5 minute TTL)
  async cacheWhaleData(walletAddress, data) {
    await this.client.setEx(
      `whale:${walletAddress}`,
      300, // 5 minutes
      JSON.stringify(data)
    );
  }

  // Cache market sentiment (1 minute TTL for real-time feel)
  async cacheSentiment(marketId, sentiment) {
    await this.client.setEx(
      `sentiment:${marketId}`,
      60, // 1 minute
      JSON.stringify(sentiment)
    );
  }
}
```

### Database Indexing
- Time-series indexes on timestamp fields
- Composite indexes for common queries (market_id + timestamp)
- Partial indexes for whale wallets (`WHERE is_whale = true`)

### Query Optimization
```sql
-- Optimized whale activity query
SELECT
  w.wallet_address,
  w.total_volume,
  w.win_rate,
  COUNT(t.id) as recent_bets,
  SUM(t.amount) as recent_volume
FROM polymarket_wallets w
LEFT JOIN polymarket_transactions t
  ON w.wallet_address = t.wallet_address
  AND t.timestamp > NOW() - INTERVAL '30 days'
WHERE w.is_whale = true
GROUP BY w.wallet_address, w.total_volume, w.win_rate
ORDER BY recent_volume DESC
LIMIT 50;
```

---

## Conclusion

This design provides a scalable, compliant, and performant system for Polymarket blockchain intelligence. All components focus on **public data analysis** while maintaining strict legal compliance and transparent methodologies.

**Next Steps**: Implement Phase 1 (Blockchain Data Ingestion) with RPC provider integration and event listening infrastructure.
