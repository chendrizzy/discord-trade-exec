# Churn Prediction Algorithm

## Overview

The ChurnPredictor service uses a **weighted scoring algorithm** to calculate the probability of a user canceling their subscription. The algorithm analyzes behavioral signals across 5 key dimensions to generate a **risk score (0-100)** and corresponding **risk level (Low, Medium, High, Critical)**.

**Service Location**: `src/services/ChurnPredictor.js`

**Primary Function**: `calculateChurnRisk(userId)`

**Use Cases**:
- Proactive retention campaigns
- Identifying at-risk customers before billing cycles
- Prioritizing customer success outreach
- Automated re-engagement triggers

---

## Algorithm Components

### Risk Score Formula

```javascript
Risk_Score = (Inactivity_Score × 0.35) +
             (Win_Rate_Score × 0.25) +
             (Login_Score × 0.20) +
             (Issue_Score × 0.10) +
             (Profit_Score × 0.10)
```

**Score Range**: 0-100
- **0**: No churn risk (ideal customer)
- **100**: Maximum churn risk (cancellation imminent)

---

## Risk Factor Breakdown

### 1. Inactivity Score (35% weight)

**What It Measures**: Days since last trade execution

**Why It's Important**: Trading platforms are only valuable if users actively trade. Prolonged inactivity indicates disengagement.

#### Calculation Logic

```javascript
const daysSinceLastTrade = Math.floor(
  (Date.now() - user.analytics.lastTradeTimestamp) / (1000 * 60 * 60 * 24)
)

let inactivityScore = 0

if (daysSinceLastTrade >= 30) {
  inactivityScore = 35 // Maximum penalty
} else if (daysSinceLastTrade >= 21) {
  inactivityScore = 28 // High penalty (3 weeks)
} else if (daysSinceLastTrade >= 14) {
  inactivityScore = 21 // Medium penalty (2 weeks)
} else if (daysSinceLastTrade >= 7) {
  inactivityScore = 14 // Low penalty (1 week)
} else {
  // Linear scale for <7 days
  inactivityScore = (daysSinceLastTrade / 7) * 7
}
```

#### Thresholds

| Days Since Trade | Score | Risk Level | Interpretation |
|------------------|-------|------------|----------------|
| 0-6 days | 0-7 | Low | Active trader |
| 7-13 days | 14 | Low | Occasional trader |
| 14-20 days | 21 | Medium | **Inactivity warning** |
| 21-29 days | 28 | High | **Critical inactivity** |
| 30+ days | 35 | Critical | **Disengaged user** |

#### Example Scenarios

**Scenario 1: Active Trader**
```javascript
Last Trade: 3 days ago
Calculation: (3 / 7) × 7 = 3.0 points
Risk Contribution: 3.0 / 100 = 3%
```

**Scenario 2: Infrequent Trader**
```javascript
Last Trade: 18 days ago
Calculation: 21 points (14-20 day threshold)
Risk Contribution: 21 / 100 = 21%
```

**Scenario 3: Abandoned Account**
```javascript
Last Trade: 45 days ago
Calculation: 35 points (maximum penalty)
Risk Contribution: 35 / 100 = 35%
```

---

### 2. Win Rate Score (25% weight)

**What It Measures**: Percentage of profitable trades

**Why It's Important**: Users who lose money consistently are more likely to churn. Trading success is the primary value proposition.

#### Calculation Logic

```javascript
const totalTrades = user.analytics.totalTrades
const successfulTrades = user.analytics.successfulTrades
const winRate = totalTrades > 0 ? successfulTrades / totalTrades : 0.5 // Default 50%

let winRateScore = 0

if (winRate < 0.30) {
  winRateScore = 25 // Maximum penalty (<30% win rate)
} else if (winRate < 0.40) {
  winRateScore = 20 // High penalty
} else if (winRate < 0.50) {
  winRateScore = 15 // Medium penalty
} else if (winRate < 0.60) {
  winRateScore = 10 // Low penalty
} else {
  // Linear reduction for high win rates
  winRateScore = Math.max(0, (1 - winRate) * 25)
}
```

#### Thresholds

| Win Rate | Score | Risk Level | Interpretation |
|----------|-------|------------|----------------|
| 60%+ | 0-10 | Low | Profitable trader |
| 50-59% | 10-15 | Low | Break-even trader |
| 40-49% | 15-20 | Medium | **Losing trader** |
| 30-39% | 20-25 | High | **Consistently losing** |
| <30% | 25 | Critical | **Heavy losses** |

#### Example Scenarios

**Scenario 1: Successful Trader**
```javascript
Trades: 50 total, 35 successful
Win Rate: 35 / 50 = 70%
Calculation: (1 - 0.70) × 25 = 7.5 points
Risk Contribution: 7.5 / 100 = 7.5%
```

**Scenario 2: Struggling Trader**
```javascript
Trades: 30 total, 12 successful
Win Rate: 12 / 30 = 40%
Calculation: 20 points (40-49% threshold)
Risk Contribution: 20 / 100 = 20%
```

**Scenario 3: New User (No Trades)**
```javascript
Trades: 0 total
Default Win Rate: 50% (neutral assumption)
Calculation: 15 points (50% threshold)
Risk Contribution: 15 / 100 = 15%
```

---

### 3. Login Frequency Score (20% weight)

**What It Measures**: Days since last login

**Why It's Important**: Platform engagement precedes trading activity. Users who stop logging in will eventually cancel.

#### Calculation Logic

```javascript
const daysSinceLogin = Math.floor(
  (Date.now() - user.lastLoginTimestamp) / (1000 * 60 * 60 * 24)
)

let loginScore = 0

if (daysSinceLogin >= 14) {
  loginScore = 20 // Maximum penalty
} else if (daysSinceLogin >= 10) {
  loginScore = 16 // High penalty
} else if (daysSinceLogin >= 7) {
  loginScore = 12 // Medium penalty
} else if (daysSinceLogin >= 3) {
  loginScore = 8 // Low penalty
} else {
  // Linear scale for <3 days
  loginScore = (daysSinceLogin / 3) * 4
}
```

#### Thresholds

| Days Since Login | Score | Risk Level | Interpretation |
|------------------|-------|------------|----------------|
| 0-2 days | 0-4 | Low | Active user |
| 3-6 days | 8 | Low | Regular user |
| 7-9 days | 12 | Medium | **Decreased engagement** |
| 10-13 days | 16 | High | **Rarely logging in** |
| 14+ days | 20 | Critical | **Inactive account** |

#### Example Scenarios

**Scenario 1: Daily User**
```javascript
Last Login: Yesterday
Calculation: (1 / 3) × 4 = 1.3 points
Risk Contribution: 1.3 / 100 = 1.3%
```

**Scenario 2: Weekly User**
```javascript
Last Login: 8 days ago
Calculation: 12 points (7-9 day threshold)
Risk Contribution: 12 / 100 = 12%
```

**Scenario 3: Disengaged User**
```javascript
Last Login: 20 days ago
Calculation: 20 points (maximum penalty)
Risk Contribution: 20 / 100 = 20%
```

---

### 4. Support Issues Score (10% weight)

**What It Measures**: Number of support tickets filed

**Why It's Important**: Repeated issues indicate frustration. Users with unresolved problems are more likely to churn.

#### Calculation Logic

```javascript
const supportTickets = user.supportTickets.length

let issueScore = 0

if (supportTickets === 0) {
  issueScore = 0 // No issues (ideal)
} else if (supportTickets === 1) {
  issueScore = 2 // Minor issue
} else if (supportTickets === 2) {
  issueScore = 5 // Some frustration
} else if (supportTickets >= 3) {
  issueScore = 10 // Maximum penalty (multiple issues)
}
```

#### Thresholds

| Tickets | Score | Risk Level | Interpretation |
|---------|-------|------------|----------------|
| 0 | 0 | Low | No problems |
| 1 | 2 | Low | Minor issue (normal) |
| 2 | 5 | Medium | **Recurring problems** |
| 3+ | 10 | High | **Persistent frustration** |

#### Example Scenarios

**Scenario 1: Happy User**
```javascript
Support Tickets: 0
Calculation: 0 points
Risk Contribution: 0 / 100 = 0%
```

**Scenario 2: Frustrated User**
```javascript
Support Tickets: 2
Calculation: 5 points
Risk Contribution: 5 / 100 = 5%
```

**Scenario 3: Problematic Account**
```javascript
Support Tickets: 5
Calculation: 10 points (maximum penalty)
Risk Contribution: 10 / 100 = 10%
```

**Special Case: Resolved Tickets**
```javascript
// Future enhancement: Reduce score if tickets are resolved
if (ticket.status === 'resolved' && ticket.resolvedAt < Date.now() - 7_DAYS) {
  issueScore -= 1 // Penalty reduction for resolved issues
}
```

---

### 5. Profitability Score (10% weight)

**What It Measures**: Total profit/loss (P&L) over account lifetime

**Why It's Important**: Users losing money are more likely to cancel. Profitability indicates product value delivery.

#### Calculation Logic

```javascript
const totalProfitLoss = user.analytics.totalProfitLoss

let profitScore = 0

if (totalProfitLoss >= 1000) {
  profitScore = 0 // Highly profitable (no penalty)
} else if (totalProfitLoss >= 0) {
  profitScore = 3 // Break-even or slight profit
} else if (totalProfitLoss >= -500) {
  profitScore = 6 // Moderate losses
} else if (totalProfitLoss >= -1000) {
  profitScore = 8 // Significant losses
} else {
  profitScore = 10 // Heavy losses (maximum penalty)
}
```

#### Thresholds

| Total P&L | Score | Risk Level | Interpretation |
|-----------|-------|------------|----------------|
| +$1000+ | 0 | Low | Profitable trader |
| $0 to +$999 | 3 | Low | Break-even |
| -$1 to -$499 | 6 | Medium | **Moderate losses** |
| -$500 to -$999 | 8 | High | **Significant losses** |
| -$1000+ | 10 | Critical | **Heavy losses** |

#### Example Scenarios

**Scenario 1: Profitable Trader**
```javascript
Total P&L: +$2,450
Calculation: 0 points (no penalty)
Risk Contribution: 0 / 100 = 0%
```

**Scenario 2: Break-Even Trader**
```javascript
Total P&L: +$120
Calculation: 3 points
Risk Contribution: 3 / 100 = 3%
```

**Scenario 3: Losing Trader**
```javascript
Total P&L: -$1,850
Calculation: 10 points (maximum penalty)
Risk Contribution: 10 / 100 = 10%
```

---

## Risk Level Classification

### Threshold Mapping

```javascript
function getRiskLevel(riskScore) {
  if (riskScore >= 80) return 'critical'
  if (riskScore >= 60) return 'high'
  if (riskScore >= 40) return 'medium'
  return 'low'
}
```

| Risk Level | Score Range | Color | Action Required |
|------------|-------------|-------|-----------------|
| **Low** | 0-39 | 🟢 Green | Monitor quarterly |
| **Medium** | 40-59 | 🟡 Yellow | Weekly check-in |
| **High** | 60-79 | 🔴 Red | Contact within 3 days |
| **Critical** | 80-100 | 🚨 Purple | **Immediate intervention** |

---

## Complete Example: High-Risk User

### User Profile

```javascript
{
  username: 'trader_mike',
  email: 'mike@example.com',
  discordId: '64a1f2b3c8e7d9001a234567',
  subscription: {
    tier: 'basic',
    status: 'active',
    price: 49.00
  },
  analytics: {
    totalTrades: 42,
    successfulTrades: 15,
    totalProfitLoss: -680.00,
    lastTradeTimestamp: Date.now() - (18 * 24 * 60 * 60 * 1000) // 18 days ago
  },
  lastLoginTimestamp: Date.now() - (9 * 24 * 60 * 60 * 1000), // 9 days ago
  supportTickets: [
    { subject: 'Trade not executing', status: 'resolved' },
    { subject: 'API key errors', status: 'resolved' },
    { subject: 'Stop loss not working', status: 'open' }
  ]
}
```

### Risk Calculation

**1. Inactivity Score (35% weight)**
```javascript
Days Since Trade: 18 days
Threshold: 14-20 days → 21 points
Contribution: 21% of total risk
```

**2. Win Rate Score (25% weight)**
```javascript
Win Rate: 15 / 42 = 35.7%
Threshold: 30-39% → 20 points
Contribution: 20% of total risk
```

**3. Login Frequency Score (20% weight)**
```javascript
Days Since Login: 9 days
Threshold: 7-9 days → 12 points
Contribution: 12% of total risk
```

**4. Support Issues Score (10% weight)**
```javascript
Support Tickets: 3 tickets
Threshold: 3+ tickets → 10 points
Contribution: 10% of total risk
```

**5. Profitability Score (10% weight)**
```javascript
Total P&L: -$680
Threshold: -$500 to -$999 → 8 points
Contribution: 8% of total risk
```

### Total Risk Score

```javascript
Total = 21 + 20 + 12 + 10 + 8 = 71 points
Risk Level: HIGH (60-79 range)
```

### Risk Factors Identified

```javascript
riskFactors: [
  'inactive_14_days',     // 18 days since last trade
  'low_win_rate',         // 35.7% win rate
  'infrequent_login',     // 9 days since login
  'multiple_issues',      // 3 support tickets
  'negative_pnl'          // -$680 losses
]
```

### Automated Recommendations

```javascript
recommendations: [
  'Send personalized retention email with win rate improvement tips',
  'Offer free 1-on-1 strategy consultation call',
  'Provide educational content on risk management',
  'Address open support ticket urgently (stop loss issue)',
  'Offer 20% discount on next billing cycle to retain'
]
```

---

## Retention Recommendation Logic

### Recommendation Matrix

| Risk Level | Primary Action | Secondary Action | Offer |
|------------|----------------|------------------|-------|
| **Critical** | Phone call within 24h | Urgent email | 50% discount or free month |
| **High** | Personalized email | Educational content | 20% discount or premium trial |
| **Medium** | Re-engagement email | Feature highlights | Free consultation |
| **Low** | NPS survey | Success stories | Upsell opportunity |

### Context-Specific Recommendations

**If `inactive_14_days` in riskFactors**:
- "Send re-engagement email with latest market opportunities"
- "Highlight new features or signal providers"
- "Offer limited-time promotion to encourage trading"

**If `low_win_rate` in riskFactors**:
- "Provide educational content on strategy optimization"
- "Offer free 1-on-1 consultation with trading expert"
- "Share success stories from similar traders"

**If `multiple_issues` in riskFactors**:
- "Prioritize resolving open support tickets immediately"
- "Schedule call with customer success team"
- "Offer compensation (credit, discount, upgrade)"

**If `negative_pnl` in riskFactors**:
- "Send risk management best practices guide"
- "Suggest reducing position sizes or adding stop losses"
- "Offer demo account to test strategies risk-free"

---

## Implementation Details

### Service Class Structure

```javascript
class ChurnPredictor {
  /**
   * Calculate churn risk for a user
   * @param {string} userId - MongoDB user ID
   * @returns {Promise<Object>} Risk assessment object
   */
  async calculateChurnRisk(userId) {
    const user = await User.findById(userId)

    const inactivityScore = this.calculateInactivityScore(user)
    const winRateScore = this.calculateWinRateScore(user)
    const loginScore = this.calculateLoginScore(user)
    const issueScore = this.calculateIssueScore(user)
    const profitScore = this.calculateProfitScore(user)

    const totalScore = inactivityScore + winRateScore + loginScore + issueScore + profitScore
    const riskLevel = this.getRiskLevel(totalScore)
    const riskFactors = this.identifyRiskFactors(user, {
      inactivityScore,
      winRateScore,
      loginScore,
      issueScore,
      profitScore
    })
    const recommendations = this.generateRecommendations(riskFactors, riskLevel)

    return {
      userId: user._id,
      username: user.username,
      email: user.email,
      riskScore: totalScore,
      riskLevel,
      riskFactors,
      recommendations,
      calculation: {
        inactivityScore,
        winRateScore,
        loginScore,
        issueScore,
        profitScore
      },
      subscription: {
        tier: user.subscription.tier,
        status: user.subscription.status,
        mrr: user.subscription.price
      }
    }
  }

  /**
   * Get all at-risk users
   * @param {string} minRiskLevel - Filter by risk level ('low', 'medium', 'high', 'critical')
   * @param {number} limit - Max results to return
   * @returns {Promise<Array>} Array of at-risk user objects
   */
  async getAtRiskUsers(minRiskLevel = 'medium', limit = 100) {
    const users = await User.find({ 'subscription.status': 'active' })
    const riskAssessments = []

    for (const user of users) {
      const risk = await this.calculateChurnRisk(user._id)

      if (this.meetsRiskThreshold(risk.riskLevel, minRiskLevel)) {
        riskAssessments.push(risk)
      }
    }

    // Sort by risk score descending (highest risk first)
    riskAssessments.sort((a, b) => b.riskScore - a.riskScore)

    return riskAssessments.slice(0, limit)
  }
}
```

### API Integration

**Endpoint**: `POST /api/analytics/churn-risk/calculate`

**Request**:
```json
{
  "userId": "64a1f2b3c8e7d9001a234567"
}
```

**Response**:
```json
{
  "userId": "64a1f2b3c8e7d9001a234567",
  "username": "trader_mike",
  "riskScore": 71,
  "riskLevel": "high",
  "riskFactors": [
    "inactive_14_days",
    "low_win_rate",
    "infrequent_login",
    "multiple_issues",
    "negative_pnl"
  ],
  "recommendations": [
    "Send personalized retention email with win rate improvement tips",
    "Offer free 1-on-1 strategy consultation call",
    "Provide educational content on risk management"
  ],
  "calculation": {
    "inactivityScore": 21,
    "winRateScore": 20,
    "loginScore": 12,
    "issueScore": 10,
    "profitScore": 8
  }
}
```

---

## Algorithm Tuning

### Weight Adjustments

**Current Weights**:
```javascript
const WEIGHTS = {
  inactivity: 0.35,  // Most important
  winRate: 0.25,     // Second most important
  login: 0.20,       // Engagement indicator
  issues: 0.10,      // Frustration signal
  profit: 0.10       // Value realization
}
```

**Tuning Considerations**:
- **Increase `inactivity` weight** (→ 0.40) if inactivity is the strongest churn predictor
- **Increase `winRate` weight** (→ 0.30) for trading platforms where profitability is critical
- **Decrease `issues` weight** (→ 0.05) if support tickets don't correlate with churn
- **Add new factors**: `subscription_age`, `payment_failures`, `referral_activity`

### Threshold Calibration

**Current Thresholds**:
- Critical: 80+
- High: 60-79
- Medium: 40-59
- Low: 0-39

**Calibration Process**:
1. Calculate churn risk for all users monthly
2. Track actual churn vs predicted risk over 90 days
3. Adjust thresholds to achieve:
   - **95% of churned users** had risk score ≥60 (sensitivity)
   - **80% of non-churned users** had risk score <60 (specificity)

**Example Adjustment**:
```javascript
// If too many false positives (non-churners flagged as high-risk)
if (specificity < 0.75) {
  THRESHOLDS.high = 70 // Increase from 60 to 70
}

// If too many false negatives (churners not flagged)
if (sensitivity < 0.90) {
  THRESHOLDS.high = 55 // Decrease from 60 to 55
}
```

---

## Performance Optimization

### Caching Strategy

**Risk Score Caching** (10-minute TTL):
```javascript
const cacheKey = `churn_risk:${userId}`
const cachedRisk = await redis.get(cacheKey)

if (cachedRisk) {
  return JSON.parse(cachedRisk)
}

const risk = await this.calculateChurnRisk(userId)
await redis.set(cacheKey, JSON.stringify(risk), 'EX', 600) // 10 minutes
return risk
```

**Batch Processing** (daily calculation):
```javascript
// Calculate risk for all active users at 2 AM daily
cron.schedule('0 2 * * *', async () => {
  const users = await User.find({ 'subscription.status': 'active' })

  for (const user of users) {
    const risk = await churnPredictor.calculateChurnRisk(user._id)
    await RiskCache.upsert({ userId: user._id, ...risk })
  }
})
```

### Database Optimization

**Required Indexes**:
```javascript
db.users.createIndex({ 'analytics.lastTradeTimestamp': -1 })
db.users.createIndex({ 'lastLoginTimestamp': -1 })
db.users.createIndex({ 'subscription.status': 1 })
```

---

## Testing

### Unit Test Examples

**Test: Inactivity Score Calculation**
```javascript
describe('ChurnPredictor.calculateInactivityScore', () => {
  it('should return 0 for active trader (3 days)', () => {
    const user = { analytics: { lastTradeTimestamp: Date.now() - (3 * DAY_MS) } }
    const score = churnPredictor.calculateInactivityScore(user)
    expect(score).toBeCloseTo(3.0, 1)
  })

  it('should return 21 for inactive trader (18 days)', () => {
    const user = { analytics: { lastTradeTimestamp: Date.now() - (18 * DAY_MS) } }
    const score = churnPredictor.calculateInactivityScore(user)
    expect(score).toBe(21)
  })

  it('should return 35 for abandoned account (45 days)', () => {
    const user = { analytics: { lastTradeTimestamp: Date.now() - (45 * DAY_MS) } }
    const score = churnPredictor.calculateInactivityScore(user)
    expect(score).toBe(35)
  })
})
```

**Test: Total Risk Score**
```javascript
describe('ChurnPredictor.calculateChurnRisk', () => {
  it('should classify high-risk user correctly', async () => {
    const userId = 'test-user-high-risk'

    // Mock user with high-risk profile
    const mockUser = {
      _id: userId,
      analytics: {
        totalTrades: 42,
        successfulTrades: 15, // 35.7% win rate
        totalProfitLoss: -680,
        lastTradeTimestamp: Date.now() - (18 * DAY_MS)
      },
      lastLoginTimestamp: Date.now() - (9 * DAY_MS),
      supportTickets: [{ status: 'open' }, { status: 'resolved' }, { status: 'resolved' }]
    }

    jest.spyOn(User, 'findById').mockResolvedValue(mockUser)

    const risk = await churnPredictor.calculateChurnRisk(userId)

    expect(risk.riskScore).toBeGreaterThanOrEqual(60)
    expect(risk.riskLevel).toBe('high')
    expect(risk.riskFactors).toContain('inactive_14_days')
    expect(risk.riskFactors).toContain('low_win_rate')
  })
})
```

---

## Validation & Accuracy

### Historical Validation

**Process**:
1. Calculate risk scores for all users on Month 1
2. Track actual churn over next 30 days
3. Compare predicted vs actual churn

**Metrics**:
- **True Positive Rate (Sensitivity)**: % of churned users who had high/critical risk
- **True Negative Rate (Specificity)**: % of retained users who had low/medium risk
- **Precision**: % of high-risk users who actually churned
- **Recall**: % of churned users who were flagged as high-risk

**Target Accuracy**:
```javascript
{
  sensitivity: 0.85,  // 85% of churners were flagged
  specificity: 0.75,  // 75% of retainers were not flagged
  precision: 0.60,    // 60% of flagged users churned
  recall: 0.85        // Same as sensitivity
}
```

---

## Future Enhancements

### 1. Machine Learning Model

**Current**: Rule-based weighted scoring
**Future**: Train ML model on historical churn data

**Features to Add**:
- `subscription_age` (months since signup)
- `payment_failures` (count of failed payments)
- `feature_usage` (which features are used most)
- `referral_activity` (did user refer others?)
- `time_to_first_trade` (onboarding success)

**Algorithm**: Logistic Regression or Random Forest

---

### 2. Real-Time Risk Updates

**Current**: Batch processing (daily)
**Future**: Event-driven updates

**Triggers**:
- Trade executed → Recalculate win rate & inactivity
- User logs in → Update login frequency
- Support ticket created → Increment issue score
- Payment fails → Add payment_failures factor

---

### 3. Personalized Retention Campaigns

**Current**: Generic recommendations
**Future**: Automated campaign triggers

**Example**:
```javascript
if (risk.riskLevel === 'high' && risk.riskFactors.includes('low_win_rate')) {
  await sendEmail(user.email, 'win-rate-improvement-tips')
  await scheduleFollowUp(user._id, 7) // Follow up in 7 days
}
```

---

## References

- Service Implementation: `src/services/ChurnPredictor.js`
- API Documentation: `docs/ANALYTICS_API.md`
- Admin Dashboard: `docs/ANALYTICS_DASHBOARD_GUIDE.md`
- User Model: `src/models/User.js` (analytics fields)

---

**Last Updated**: 2025-10-16
**Version**: 1.0
**Algorithm Version**: v1.0 (rule-based weighted scoring)
**Next Review**: After collecting 90 days of validation data
