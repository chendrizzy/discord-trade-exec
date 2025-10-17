# Analytics API Documentation

## Overview

The Analytics API provides business intelligence endpoints for tracking revenue metrics, customer retention, and churn prediction. All endpoints require **admin authentication**.

**Base URL**: `/api/analytics`

**Authentication**: Admin role required (middleware: `ensureAdmin`)

---

## Revenue Metrics

### GET /api/analytics/revenue

Get comprehensive revenue metrics including MRR, ARR, LTV, and churn rate.

**Query Parameters:**
- `startDate` (optional): ISO date string (default: 30 days ago)
- `endDate` (optional): ISO date string (default: today)
- `lifetimeMonths` (optional): LTV calculation period in months (default: 24)

**Response:**
```json
{
  "mrr": 14500.00,
  "arr": 174000.00,
  "ltv": 2320.00,
  "churnRate": 0.12,
  "period": {
    "start": "2024-10-01T00:00:00.000Z",
    "end": "2024-10-31T23:59:59.999Z"
  },
  "subscriberCount": 150,
  "arpu": 96.67
}
```

---

### GET /api/analytics/mrr

Get Monthly Recurring Revenue.

**Query Parameters:** None

**Response:**
```json
{
  "mrr": 14500.00,
  "byTier": {
    "basic": 2450.00,
    "pro": 4950.00,
    "premium": 7100.00
  },
  "subscriberCount": 150,
  "arpu": 96.67
}
```

---

### GET /api/analytics/arr

Get Annual Recurring Revenue (MRR × 12).

**Query Parameters:** None

**Response:**
```json
{
  "arr": 174000.00,
  "mrr": 14500.00
}
```

---

### GET /api/analytics/ltv

Get Customer Lifetime Value.

**Query Parameters:**
- `lifetimeMonths` (optional): Average customer lifetime in months (default: 24)

**Response:**
```json
{
  "ltv": 2320.00,
  "arpu": 96.67,
  "lifetimeMonths": 24,
  "churnRate": 0.12
}
```

---

### GET /api/analytics/churn

Get churn rate for a specific period.

**Query Parameters:**
- `startDate` (required): ISO date string
- `endDate` (required): ISO date string

**Response:**
```json
{
  "churnRate": 0.12,
  "canceledCount": 18,
  "totalSubscribers": 150,
  "period": {
    "start": "2024-10-01T00:00:00.000Z",
    "end": "2024-10-31T23:59:59.999Z"
  }
}
```

**Example Request:**
```bash
curl -X GET "https://your-app.up.railway.app/api/analytics/churn?startDate=2024-10-01&endDate=2024-10-31" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Churn Prediction

### GET /api/analytics/churn-risks

Get list of at-risk users with churn prediction scores.

**Query Parameters:**
- `minRiskLevel` (optional): Filter by risk level (`low`, `medium`, `high`, `critical`)
- `limit` (optional): Max results (default: 100)

**Response:**
```json
{
  "atRiskUsers": [
    {
      "userId": "64a1f2b3c8e7d9001a234567",
      "username": "trader_mike",
      "email": "mike@example.com",
      "riskScore": 78.5,
      "riskLevel": "high",
      "riskFactors": ["inactive_14_days", "low_win_rate", "no_recent_login"],
      "subscription": {
        "tier": "basic",
        "status": "active",
        "mrr": 49.00
      },
      "recommendations": [
        "Send personalized retention email with win rate improvement tips",
        "Offer free strategy consultation call",
        "Provide educational content on risk management"
      ]
    }
  ],
  "summary": {
    "totalAtRisk": 45,
    "byLevel": {
      "critical": 8,
      "high": 15,
      "medium": 22,
      "low": 0
    },
    "totalMrrAtRisk": 4350.00
  }
}
```

---

### POST /api/analytics/churn-risk/calculate

Calculate churn risk for a specific user.

**Request Body:**
```json
{
  "userId": "64a1f2b3c8e7d9001a234567"
}
```

**Response:**
```json
{
  "userId": "64a1f2b3c8e7d9001a234567",
  "riskScore": 78.5,
  "riskLevel": "high",
  "riskFactors": ["inactive_14_days", "low_win_rate", "no_recent_login"],
  "recommendations": [
    "Send personalized retention email with win rate improvement tips",
    "Offer free strategy consultation call"
  ],
  "calculation": {
    "inactivityScore": 27.3,
    "winRateScore": 19.6,
    "loginFrequencyScore": 15.7,
    "issueScore": 8.2,
    "profitScore": 7.7,
    "totalScore": 78.5
  }
}
```

**Risk Score Calculation:**
- Inactivity (35%): Days since last trade
- Win Rate (25%): Trading success percentage
- Login Frequency (20%): Days since last login
- Support Issues (10%): Number of support tickets
- Profitability (10%): Total P&L performance

**Risk Levels:**
- **Critical**: Score ≥ 80 (immediate intervention required)
- **High**: Score 60-79 (proactive outreach needed)
- **Medium**: Score 40-59 (monitor closely)
- **Low**: Score < 40 (healthy customer)

---

## Cohort Analysis

### GET /api/analytics/cohorts/retention

Get cohort retention table (heat map data).

**Query Parameters:**
- `period` (optional): `monthly` or `weekly` (default: `monthly`)
- `metric` (optional): `login`, `trade`, or `active` (default: `active`)
- `months` (optional): Number of months to analyze (default: 12)

**Response:**
```json
{
  "cohorts": [
    {
      "cohortId": "2024-10",
      "cohortStart": "2024-10-01T00:00:00.000Z",
      "totalUsers": 45,
      "retention": {
        "month0": 100.0,
        "month1": 88.9,
        "month2": 75.6,
        "month3": 68.9
      }
    }
  ],
  "summary": {
    "totalCohorts": 12,
    "totalUsers": 540,
    "avgRetention": {
      "month1": 82.3,
      "month3": 65.7,
      "month6": 52.1,
      "month12": 38.4
    }
  }
}
```

**Metrics Explained:**
- **login**: % of users who logged in during period
- **trade**: % of users who executed at least one trade
- **active**: % of users with any platform activity (login OR trade)

---

### GET /api/analytics/cohorts/:cohortId

Get detailed analysis for a specific cohort.

**Path Parameters:**
- `cohortId`: Cohort identifier (e.g., `2024-10` for October 2024 cohort)

**Response:**
```json
{
  "cohortId": "2024-10",
  "cohortStart": "2024-10-01T00:00:00.000Z",
  "totalUsers": 45,
  "retention": {
    "month0": 100.0,
    "month1": 88.9,
    "month2": 75.6,
    "month3": 68.9
  },
  "behaviorMetrics": {
    "avgTradesPerUser": 12.5,
    "avgLoginFrequency": 18.2,
    "avgWinRate": 0.58
  },
  "revenueMetrics": {
    "totalMrr": 2205.00,
    "avgArpu": 49.00,
    "churnedMrr": 294.00
  }
}
```

---

### POST /api/analytics/cohorts/compare

Compare multiple cohorts to identify trends.

**Request Body:**
```json
{
  "cohortIds": ["2024-08", "2024-09", "2024-10"],
  "metric": "active"
}
```

**Response:**
```json
{
  "cohorts": [
    {
      "cohortId": "2024-08",
      "totalUsers": 38,
      "retention": { "month0": 100.0, "month1": 84.2, "month2": 71.1 }
    },
    {
      "cohortId": "2024-09",
      "totalUsers": 42,
      "retention": { "month0": 100.0, "month1": 88.1, "month2": 76.2 }
    },
    {
      "cohortId": "2024-10",
      "totalUsers": 45,
      "retention": { "month0": 100.0, "month1": 88.9, "month2": 75.6 }
    }
  ],
  "comparison": {
    "trend": "improving",
    "avgRetentionDelta": {
      "month1": +4.7,
      "month2": +4.5
    }
  }
}
```

**Trend Values:**
- `improving`: Newer cohorts showing better retention
- `declining`: Newer cohorts showing worse retention
- `stable`: No significant change between cohorts

---

## Dashboard Endpoint

### GET /api/analytics/dashboard

Get comprehensive dashboard metrics (single aggregated call).

**Query Parameters:** None

**Response:**
```json
{
  "revenue": {
    "mrr": 14500.00,
    "arr": 174000.00,
    "growth": {
      "mrrGrowth": 8.5,
      "subscriberGrowth": 12.3
    }
  },
  "subscribers": {
    "total": 150,
    "byTier": {
      "basic": 50,
      "pro": 50,
      "premium": 50
    },
    "new": 18,
    "churned": 6
  },
  "churn": {
    "rate": 0.04,
    "atRiskCount": 45,
    "criticalCount": 8,
    "mrrAtRisk": 4350.00
  },
  "engagement": {
    "avgTradesPerUser": 15.2,
    "avgLoginFrequency": 22.1,
    "activeUserRate": 0.78
  }
}
```

**Use Case:** Single API call for admin dashboard overview page.

---

## Error Responses

All endpoints return standard error format:

**401 Unauthorized:**
```json
{
  "error": "Unauthorized access",
  "message": "Admin authentication required"
}
```

**400 Bad Request:**
```json
{
  "error": "Invalid parameters",
  "message": "startDate must be a valid ISO date string"
}
```

**500 Internal Server Error:**
```json
{
  "error": "Server error",
  "message": "Failed to calculate MRR"
}
```

---

## Rate Limits

- **Standard**: 100 requests/minute per admin user
- **Dashboard endpoint**: 20 requests/minute (due to aggregation complexity)

---

## Performance Notes

- **Caching**: Revenue metrics cached for 5 minutes
- **Cohort Analysis**: Expensive queries; use pagination for large datasets
- **Real-time Updates**: Metrics update every 30 seconds via event batching

---

## Security

- All endpoints require authenticated admin session
- Role verification via `ensureAdmin` middleware
- API keys encrypted at rest
- Audit logging for all analytics queries

---

## Example Integration

**React Dashboard Component:**
```javascript
import { useEffect, useState } from 'react';

function AnalyticsDashboard() {
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    fetch('/api/analytics/dashboard', {
      credentials: 'include' // Include session cookie
    })
      .then(res => res.json())
      .then(data => setMetrics(data));
  }, []);

  if (!metrics) return <div>Loading...</div>;

  return (
    <div>
      <h1>MRR: ${metrics.revenue.mrr.toLocaleString()}</h1>
      <p>Churn Rate: {(metrics.churn.rate * 100).toFixed(2)}%</p>
      <p>At-Risk Users: {metrics.churn.atRiskCount}</p>
    </div>
  );
}
```

---

## Support

For API issues or feature requests, contact the development team or file an issue in the project repository.
