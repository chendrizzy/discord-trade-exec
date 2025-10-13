# Signal Quality API Documentation

**Version**: 1.0
**Base URL**: `/api/signals`
**Authentication**: Required (session-based)
**Rate Limiting**: Applied to all endpoints

---

## Overview

The Signal Quality API provides sophisticated analysis of trading signals using prediction market concepts including:
- **Smart money detection** - 4 indicators tracking unusual timing, high conviction, pattern matching, and insider likelihood
- **Rare information scoring** - Detection of signals with potentially valuable insider information
- **3-tier quality classification** - ELITE (💎), VERIFIED (✓), and STANDARD (○) tiers
- **Provider performance tracking** - Comprehensive statistics and leaderboards
- **Confidence scoring** - Weighted analysis combining provider accuracy, smart money indicators, and timing

---

## Quality Tier System

### ELITE Tier 💎
**Minimum Requirements**:
- Confidence Score: ≥ 85%
- Provider Accuracy: ≥ 80%
- Provider Win Rate: ≥ 75%

**Description**: Exceptional signal quality with strong smart money indicators

### VERIFIED Tier ✓
**Minimum Requirements**:
- Confidence Score: ≥ 70%
- Provider Accuracy: ≥ 65%
- Provider Win Rate: ≥ 60%

**Description**: High-quality signals with proven track record

### STANDARD Tier ○
**Requirements**: Default tier for new signals awaiting verification

**Description**: Standard signals awaiting quality verification

---

## Smart Money Indicators

### 1. Unusual Timing (Weight: 25%)
Detects signals occurring at statistically significant times:
- **After Hours**: +30 points (signals outside 9am-4pm EST)
- **Pre-Market**: +25 points (signals 4am-9am EST)
- **Near News**: +40 points (signals near news releases)
- **Earnings Window**: +35 points (signals near earnings announcements)

### 2. High Conviction (Weight: 30%)
Analyzes position sizing and leverage:
- **Large Position**: +35 points (>150% of typical position size)
- **Leverage**: +30 points (leveraged positions)
- **Concentration**: +25 points (concentrated bets)

### 3. Pattern Matching (Weight: 25%)
Evaluates historical performance patterns:
- **Historical Success**: +30 points (matches past winning patterns)
- **Consistency**: +25 points (consistent signal patterns)
- **Unique Pattern**: +20 points (rare/unique patterns)

### 4. Insider Likelihood (Weight: 20%)
Detects potential insider information:
- **Corporate Action**: +40 points (before mergers, acquisitions, etc.)
- **Regulatory Filing**: +35 points (before SEC filings, etc.)
- **Market Moving**: +30 points (before major market moves)
- **Industry Event**: +25 points (before industry announcements)

---

## Endpoints

### 1. Get Signal Quality Analysis

**Endpoint**: `GET /api/signals/:signalId/quality`

**Description**: Retrieve comprehensive quality analysis for a specific trading signal.

**URL Parameters**:
- `signalId` (string, required) - MongoDB ObjectId of the trade/signal

**Query Parameters**:
- `includeProviderStats` (boolean, optional, default: true) - Include provider performance statistics
- `includePositionSizing` (boolean, optional, default: true) - Include position size recommendations

**Response**:
```json
{
  "success": true,
  "data": {
    "signalId": "507f1f77bcf86cd799439011",
    "symbol": "AAPL",
    "side": "BUY",
    "quality": {
      "tier": "ELITE",
      "symbol": "💎",
      "confidence": 87,
      "description": "Exceptional signal quality with strong smart money indicators"
    },
    "smartMoney": {
      "score": 78,
      "breakdown": {
        "unusualTiming": 30,
        "highConviction": 35,
        "patternMatching": 25,
        "insiderLikelihood": 40
      },
      "indicators": {
        "unusualTiming": true,
        "highConviction": true,
        "patternMatching": true,
        "insiderLikelihood": true
      }
    },
    "rareInformation": {
      "score": 85,
      "level": "HIGH",
      "factors": [
        "Very high smart money indicators",
        "Unusual market timing",
        "High conviction position",
        "Potential insider information"
      ]
    },
    "provider": {
      "id": "507f1f77bcf86cd799439012",
      "stats": {
        "totalSignals": 150,
        "completedSignals": 120,
        "winRate": 72.5,
        "accuracy": 78.33,
        "avgReturn": 450.75,
        "totalReturn": 54090.00,
        "consecutiveWins": 8,
        "consecutiveLosses": 3,
        "bestTrade": {
          "symbol": "TSLA",
          "profitLoss": 2500.00,
          "returnPercent": 15.5
        },
        "worstTrade": {
          "symbol": "META",
          "profitLoss": -850.00,
          "returnPercent": -5.2
        },
        "recentPerformance": [...]
      }
    },
    "positionSizing": {
      "recommendedSize": 15000,
      "maxRiskAmount": 2000,
      "sizeMultiplier": 1.5,
      "reasoning": [
        "Base allocation: 10%",
        "Confidence adjustment: 50%",
        "Max risk per trade: 2.0%"
      ]
    },
    "timestamp": "2025-10-13T08:00:00.000Z"
  }
}
```

**Error Responses**:
- `404` - Signal not found
- `403` - Unauthorized (not your signal)
- `500` - Server error

---

### 2. Update Signal Quality

**Endpoint**: `POST /api/signals/:signalId/quality/update`

**Description**: Recalculate and update quality analysis for a signal with custom context.

**URL Parameters**:
- `signalId` (string, required) - MongoDB ObjectId of the trade/signal

**Request Body**:
```json
{
  "context": {
    "nearNewsRelease": true,
    "nearEarnings": false,
    "beforeCorporateAction": true,
    "volatileMarket": false,
    "lowLiquidity": false,
    "optimalTiming": true
  },
  "riskParameters": {
    "accountBalance": 100000,
    "maxRiskPerTrade": 0.02,
    "basePositionSize": 0.10
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "signalId": "507f1f77bcf86cd799439011",
    "updated": true,
    "quality": {
      "tier": "ELITE",
      "confidence": 87,
      "description": "Exceptional signal quality with strong smart money indicators"
    },
    "smartMoney": {
      "score": 78,
      "breakdown": {...},
      "indicators": {...}
    },
    "rareInformation": {
      "score": 85,
      "level": "HIGH",
      "factors": [...]
    },
    "timestamp": "2025-10-13T08:00:00.000Z"
  },
  "message": "Signal quality updated successfully"
}
```

**Notes**:
- Updates are automatically saved to the Trade document
- Quality metrics stored: `qualityTier`, `confidenceScore`, `smartMoneyScore`, `rareInformationScore`
- Timestamp recorded in `qualityAnalyzedAt`

---

### 3. Get Provider Leaderboard

**Endpoint**: `GET /api/signals/providers/leaderboard`

**Description**: Retrieve ranked leaderboard of signal providers based on performance and quality.

**Query Parameters**:
- `timeRange` (string, optional, default: "30d") - Time range filter
  - Valid values: `7d`, `30d`, `90d`, `all`
- `minSignals` (integer, optional, default: 10) - Minimum signals required (1-100)
- `limit` (integer, optional, default: 50) - Maximum providers to return (1-100)

**Response**:
```json
{
  "success": true,
  "data": {
    "leaderboard": [
      {
        "_id": "507f1f77bcf86cd799439012",
        "providerId": "507f1f77bcf86cd799439012",
        "totalSignals": 150,
        "winRate": 72.5,
        "accuracy": 78.33,
        "totalReturn": 54090.00,
        "avgReturn": 450.75,
        "tier": "ELITE",
        "tierSymbol": "💎",
        "confidence": 87,
        "rank": 1
      },
      {
        "_id": "507f1f77bcf86cd799439013",
        "providerId": "507f1f77bcf86cd799439013",
        "totalSignals": 95,
        "winRate": 68.4,
        "accuracy": 72.63,
        "totalReturn": 28500.00,
        "avgReturn": 300.00,
        "tier": "VERIFIED",
        "tierSymbol": "✓",
        "confidence": 74,
        "rank": 2
      }
    ],
    "filters": {
      "timeRange": "30d",
      "minSignals": 10,
      "limit": 50
    },
    "count": 2,
    "timestamp": "2025-10-13T08:00:00.000Z"
  }
}
```

**Error Responses**:
- `400` - Invalid parameters
- `500` - Server error

---

### 4. Get Quality Statistics

**Endpoint**: `GET /api/signals/quality/stats`

**Description**: Get aggregate statistics about signal quality distribution.

**Query Parameters**:
- `timeRange` (string, optional, default: "30d") - Time range filter
  - Valid values: `7d`, `30d`, `90d`, `all`

**Response**:
```json
{
  "success": true,
  "data": {
    "byTier": [
      {
        "tier": "ELITE",
        "count": 45,
        "avgConfidence": 87.23,
        "avgSmartMoney": 78.50,
        "avgRareInfo": 82.15,
        "totalReturn": 35400.50,
        "percentage": 30.00
      },
      {
        "tier": "VERIFIED",
        "count": 68,
        "avgConfidence": 73.45,
        "avgSmartMoney": 58.20,
        "avgRareInfo": 55.80,
        "totalReturn": 28900.25,
        "percentage": 45.33
      },
      {
        "tier": "STANDARD",
        "count": 37,
        "avgConfidence": 52.10,
        "avgSmartMoney": 35.75,
        "avgRareInfo": 28.50,
        "totalReturn": 5200.00,
        "percentage": 24.67
      }
    ],
    "totals": {
      "totalSignals": 150,
      "totalReturn": 69500.75
    },
    "timeRange": "30d",
    "timestamp": "2025-10-13T08:00:00.000Z"
  }
}
```

---

### 5. Get Provider Quality Analysis

**Endpoint**: `GET /api/signals/providers/:providerId/quality`

**Description**: Get quality analysis for all signals from a specific provider.

**URL Parameters**:
- `providerId` (string, required) - MongoDB ObjectId of the provider/user

**Query Parameters**:
- `limit` (integer, optional, default: 20, max: 100) - Signals per page
- `offset` (integer, optional, default: 0) - Pagination offset

**Response**:
```json
{
  "success": true,
  "data": {
    "provider": {
      "id": "507f1f77bcf86cd799439012",
      "stats": {
        "totalSignals": 150,
        "completedSignals": 120,
        "winRate": 72.5,
        "accuracy": 78.33,
        ...
      }
    },
    "signals": [
      {
        "id": "507f1f77bcf86cd799439011",
        "symbol": "AAPL",
        "side": "BUY",
        "entryPrice": 175.50,
        "exitPrice": 182.30,
        "profitLoss": 680.00,
        "quality": {
          "tier": "ELITE",
          "confidence": 87,
          "smartMoney": 78
        },
        "entryTime": "2025-10-12T14:30:00.000Z"
      }
    ],
    "pagination": {
      "total": 150,
      "limit": 20,
      "offset": 0,
      "hasMore": true
    }
  }
}
```

---

## Confidence Score Calculation

The confidence score is a weighted average combining three factors:

```
Confidence = (Provider Accuracy × 0.50) +
             (Smart Money Score × 0.30) +
             (Timing Score × 0.20)
```

### Provider Accuracy (50% weight)
- Historical prediction accuracy rate
- Based on completed trades with predicted direction
- Range: 0-100%

### Smart Money Score (30% weight)
- Weighted combination of 4 smart money indicators
- Unusual Timing: 25%
- High Conviction: 30%
- Pattern Matching: 25%
- Insider Likelihood: 20%
- Range: 0-100

### Timing Score (20% weight)
- Baseline: 50
- Optimal timing: +30
- Volatile market: -20
- Low liquidity: -15
- Range: 0-100

---

## Position Sizing Recommendations

Position size recommendations are calculated based on:

1. **Base Allocation**: Default 10% of account balance
2. **Confidence Multiplier**:
   - Confidence ≥ 85%: 1.5x multiplier
   - Confidence ≥ 70%: 1.2x multiplier
   - Confidence < 50%: 0.5x multiplier
3. **Provider Track Record**:
   - Win Rate > 70%: +20% multiplier
   - Win Rate < 50%: -20% multiplier
4. **Max Risk**: 2% of account balance (default)

**Formula**:
```
recommendedSize = accountBalance × basePositionSize × sizeMultiplier
```

---

## Integration Examples

### Get Signal Quality
```javascript
const response = await fetch(
  `/api/signals/${signalId}/quality?includeProviderStats=true`,
  {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    }
  }
);
const data = await response.json();

console.log(`Signal Quality: ${data.data.quality.tier} ${data.data.quality.symbol}`);
console.log(`Confidence: ${data.data.quality.confidence}%`);
console.log(`Smart Money Score: ${data.data.smartMoney.score}`);
```

### Update Signal Quality with Context
```javascript
const response = await fetch(
  `/api/signals/${signalId}/quality/update`,
  {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      context: {
        nearNewsRelease: true,
        beforeCorporateAction: true,
        optimalTiming: true
      },
      riskParameters: {
        accountBalance: 100000,
        maxRiskPerTrade: 0.02,
        basePositionSize: 0.10
      }
    })
  }
);
```

### Get Provider Leaderboard
```javascript
const response = await fetch(
  `/api/signals/providers/leaderboard?timeRange=30d&minSignals=10&limit=50`,
  {
    method: 'GET',
    credentials: 'include'
  }
);
const data = await response.json();

data.data.leaderboard.forEach(provider => {
  console.log(`${provider.rank}. ${provider.tierSymbol} ${provider.providerId}`);
  console.log(`   Win Rate: ${provider.winRate.toFixed(2)}%`);
  console.log(`   Accuracy: ${provider.accuracy.toFixed(2)}%`);
  console.log(`   Total Return: $${provider.totalReturn.toFixed(2)}`);
});
```

---

## Trade Model Updates

The Trade model has been extended with the following fields:

```javascript
{
  // Signal Quality Tracking
  qualityTier: {
    type: String,
    enum: ['ELITE', 'VERIFIED', 'STANDARD'],
    index: true
  },
  confidenceScore: {
    type: Number,
    min: 0,
    max: 100
  },
  smartMoneyScore: {
    type: Number,
    min: 0,
    max: 100
  },
  rareInformationScore: {
    type: Number,
    min: 0,
    max: 100
  },
  qualityAnalyzedAt: Date,
  predictedDirection: {
    type: String,
    enum: ['up', 'down', 'neutral']
  }
}
```

---

## Rate Limiting

All signal quality endpoints are protected by the API rate limiter middleware:
- **Window**: 15 minutes
- **Max Requests**: 100 per window per IP

Exceed the limit and you'll receive:
```json
{
  "success": false,
  "error": "Too many requests",
  "message": "Rate limit exceeded. Try again later."
}
```

---

## Security

### Authentication
- All endpoints require valid session authentication
- User must be logged in via Discord OAuth2

### Authorization
- Users can only access their own signal quality data
- Admin users can access all signals
- Provider stats are publicly accessible via leaderboard

### Data Privacy
- Personal identification information is not exposed in leaderboards
- Only provider IDs and performance metrics are shared

---

## Performance Considerations

### Caching
- Provider statistics are cached for 5 minutes
- Leaderboard data is cached for 10 minutes
- Individual signal quality analysis is computed on-demand

### Database Indexes
The following indexes optimize query performance:
- `userId + entryTime` (compound)
- `userId + status` (compound)
- `userId + symbol` (compound)
- `qualityTier` (single field)

### Recommendations
- Use pagination for large result sets
- Cache signal quality data on the frontend
- Batch quality updates for multiple signals
- Use appropriate timeRange filters to limit data

---

**Last Updated**: October 13, 2025
**API Version**: 1.0
**Status**: Production Ready
