# Spec: Whale Wallet Tracking System

## ADDED Requirements

### Requirement: Automatic Whale Wallet Detection

The system SHALL automatically identify wallets as "whales" based on betting volume, bet size, and activity patterns. Whale status MUST be recalculated hourly to reflect changing activity levels.

**Rationale**: High-value wallets indicate institutional or informed traders whose activity provides valuable market signals.

#### Scenario: Detect new whale wallet from large single bet

**Given** wallet 0x9c4d1e has NO previous transaction history
**When** wallet places $150,000 bet on "Trump Win" in Presidential Election market
**Then** system processes transaction via EventListener
**And** WhaleDetector.scoreWallet() calculates:
- totalVolume: $150,000
- avgBetSize: $150,000
- betCount: 1
- maxSingleBet: $150,000
**And** system determines isWhale = TRUE (meets $100K+ single bet threshold)
**And** polymarket_wallets table updated with whale status
**And** whale_score set to 75 (high single-bet score)

---

#### Scenario: Promote existing wallet to whale status after cumulative volume

**Given** wallet 0x7a3b2f has 15 transactions totaling $950,000
**And** wallet is NOT currently marked as whale
**When** wallet places another $100,000 bet
**Then** WhaleDetector recalculates metrics:
- totalVolume: $1,050,000 (previous $950K + new $100K)
- avgBetSize: $65,625 ($1,050,000 / 16 bets)
- betCount: 16
**And** system determines isWhale = TRUE (meets $1M+ total volume threshold)
**And** polymarket_wallets.is_whale updated to TRUE
**And** WHALE_PROMOTION alert generated
**And** Discord notification sent: "🐋 New whale detected: 0x7a3b2f... ($1.05M total volume)"

---

### Requirement: Whale Activity Monitoring

The system SHALL track all transactions from identified whale wallets in real-time and generate alerts when whales place bets above configurable thresholds.

**Rationale**: Real-time whale activity provides actionable trading signals for retail traders.

#### Scenario: Alert on whale bet placement

**Given** wallet 0x9c4d1e is identified as whale (total volume: $2.5M, win rate: 78%)
**And** whale monitoring service is running
**When** whale places $500,000 bet on outcome 0 ("Trump Win") in market 0x7a3b2f
**Then** system captures transaction via EventListener
**And** AnalysisPipeline recognizes wallet as whale
**And** Alert generated with type: WHALE_BET, severity: HIGH
**And** Alert metadata includes:
```json
{
  "walletAddress": "0x9c4d1e...",
  "totalVolume": "2500000",
  "winRate": 78.5,
  "avgBetSize": "125000",
  "currentBet": {
    "marketId": "0x7a3b2f...",
    "outcome": 0,
    "amount": "500000",
    "outcomeName": "Trump Win"
  }
}
```
**And** Discord webhook called with formatted embed
**And** Alert saved to polymarket_alerts table with sent_to_discord = TRUE

---

#### Scenario: Suppress alerts for whale bets below user threshold

**Given** user has configured minimum whale bet alert threshold: $250,000
**And** whale wallet 0x9c4d1e places $150,000 bet
**When** AnalysisPipeline processes transaction
**Then** system recognizes wallet as whale
**And** system checks user preferences: minimum threshold = $250,000
**And** current bet amount ($150,000) < threshold ($250,000)
**And** NO alert generated for this user
**And** Alert still saved to database for historical tracking
**But** sent_to_discord = FALSE

---

### Requirement: Whale Performance Tracking

The system SHALL calculate win rate for whale wallets by tracking bet outcomes (wins/losses) from settlement events. Historical accuracy MUST be displayed in whale alerts to indicate reliability.

**Rationale**: Whale accuracy rates help users evaluate signal quality—high win-rate whales provide stronger signals.

#### Scenario: Calculate win rate from settlement events

**Given** whale wallet 0x9c4d1e has placed 50 bets total
**And** 40 bets have settled (resolved markets)
**When** BetSettled event received with:
- walletAddress: "0x9c4d1e..."
- won: true
- payout: "250000" (USDC)
**Then** system updates polymarket_wallets record:
- win_count incremented from 31 to 32
- total settled bets = 41 (40 + 1)
- win_rate = (32 / 41) * 100 = 78.05%
**And** whale_score recalculated: baseScore + (winRate * 0.2) = 75 + (78.05 * 0.2) = 90.6

---

#### Scenario: Display win rate in whale alert

**Given** whale wallet 0x9c4d1e has win_rate = 78.5%
**When** whale places $500,000 bet
**And** alert generated for Discord
**Then** Discord embed includes field:
```
Historical Accuracy: 78.5%
```
**And** users can evaluate signal strength based on past performance

---

### Requirement: Top Whales Leaderboard

The system SHALL provide GET /api/polymarket/whales endpoint returning top 100 whale wallets sorted by total volume, including recent activity summary.

**Rationale**: Users need to discover and monitor the most active and successful whales.

#### Scenario: Retrieve top 100 whales via API

**Given** database contains 250 whale wallets
**When** client sends GET /api/polymarket/whales
**Then** system queries polymarket_wallets WHERE is_whale = TRUE
**And** orders by total_volume DESC
**And** LIMIT 100
**And** response includes:
```json
{
  "success": true,
  "whales": [
    {
      "walletAddress": "0x9c4d1e...",
      "totalVolume": "2500000",
      "winRate": 78.5,
      "avgBetSize": "125000",
      "betCount": 20,
      "lastActivity": "2025-10-17T00:45:00Z",
      "whaleScore": 90.6,
      "recentBets": [
        {
          "marketId": "0x7a3b2f...",
          "marketTitle": "Presidential Election 2024",
          "outcome": "Trump Win",
          "amount": "500000",
          "timestamp": "2025-10-17T00:45:00Z"
        }
      ]
    },
    // ... 99 more whales
  ]
}
```
**And** response status is 200 OK

---

#### Scenario: Filter whales by minimum volume

**Given** user wants to see only $5M+ whales
**When** client sends GET /api/polymarket/whales?minVolume=5000000
**Then** system queries WHERE is_whale = TRUE AND total_volume >= 5000000
**And** response includes only whales meeting volume threshold
**And** whales sorted by total_volume DESC

---

## MODIFIED Requirements

None. All whale tracking requirements are new additions.

---

## REMOVED Requirements

None.

---

## Cross-References

- **Related Spec**: `market-sentiment` - Whale activity contributes to overall market sentiment
- **Related Spec**: `discord-integration` - Whale alerts delivered via Discord webhooks
- **Dependency**: Polygon blockchain event listener must capture BetPlaced and BetSettled events
- **Dependency**: PostgreSQL polymarket_wallets table stores whale metadata

---

## Technical Notes

### Whale Scoring Algorithm

```javascript
function calculateWhaleScore(metrics) {
  let baseScore = 0;

  // Volume component (max 40 points)
  if (metrics.totalVolume >= 10000000) baseScore += 40;
  else if (metrics.totalVolume >= 5000000) baseScore += 35;
  else if (metrics.totalVolume >= 1000000) baseScore += 30;
  else if (metrics.totalVolume >= 500000) baseScore += 20;
  else baseScore += 10;

  // Bet size component (max 30 points)
  if (metrics.avgBetSize >= 500000) baseScore += 30;
  else if (metrics.avgBetSize >= 250000) baseScore += 25;
  else if (metrics.avgBetSize >= 100000) baseScore += 20;
  else if (metrics.avgBetSize >= 50000) baseScore += 15;
  else baseScore += 10;

  // Activity component (max 10 points)
  if (metrics.last30DaysVolume >= 1000000) baseScore += 10;
  else if (metrics.last30DaysVolume >= 500000) baseScore += 8;
  else if (metrics.last30DaysVolume >= 250000) baseScore += 5;
  else baseScore += 2;

  // Win rate multiplier (up to +20 points)
  const winRateBonus = metrics.winRate * 0.2;

  return baseScore + winRateBonus; // Max theoretical score: 100
}
```

### Whale Detection Thresholds

```javascript
const WHALE_CRITERIA = {
  minTotalVolume: 1000000, // $1M+
  minSingleBet: 100000, // $100K+
  minConsistentBetting: {
    avgBetSize: 50000, // $50K+ average
    minBetCount: 10 // At least 10 bets
  },
  minRecentActivity: 500000 // $500K in last 30 days
};

function isWhale(metrics) {
  return (
    metrics.totalVolume >= WHALE_CRITERIA.minTotalVolume ||
    metrics.maxSingleBet >= WHALE_CRITERIA.minSingleBet ||
    (
      metrics.avgBetSize >= WHALE_CRITERIA.minConsistentBetting.avgBetSize &&
      metrics.betCount >= WHALE_CRITERIA.minConsistentBetting.minBetCount
    ) ||
    metrics.last30DaysVolume >= WHALE_CRITERIA.minRecentActivity
  );
}
```

### Hourly Whale Score Update Job

```javascript
// src/jobs/updateWhaleScores.js
const cron = require('node-cron');

// Run every hour at :00
cron.schedule('0 * * * *', async () => {
  console.log('Starting hourly whale score update...');

  const whaleDetector = new WhaleDetector();
  const wallets = await PolymarketWallet.findAll({
    where: { is_whale: true }
  });

  for (const wallet of wallets) {
    const updatedScore = await whaleDetector.scoreWallet(wallet.wallet_address);
    await wallet.update({
      whale_score: updatedScore.score,
      total_volume: updatedScore.totalVolume,
      win_rate: updatedScore.winRate,
      updated_at: new Date()
    });
  }

  console.log(`Updated ${wallets.length} whale scores`);
});
```

---

**Spec Status**: Complete
**Scenarios**: 8 scenarios defined
**Coverage**: Whale detection, activity monitoring, performance tracking, leaderboard API
