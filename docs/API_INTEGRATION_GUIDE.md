# API Integration Guide

**Discord Trade Executor - Frontend Integration**

This guide provides comprehensive documentation for integrating with the Discord Trade Executor API. The platform is a **multi-tenant B2B SaaS** system serving Discord trading communities with enterprise-grade security.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Authentication](#authentication)
3. [Multi-Tenant Context](#multi-tenant-context)
4. [API Endpoints Reference](#api-endpoints-reference)
5. [Request/Response Examples](#requestresponse-examples)
6. [Error Handling](#error-handling)
7. [Security Best Practices](#security-best-practices)
8. [Rate Limiting](#rate-limiting)
9. [WebSocket Integration](#websocket-integration)
10. [Testing & Development](#testing--development)

---

## Architecture Overview

### Multi-Tenant B2B SaaS Platform

The platform serves multiple Discord communities (tenants) with complete data isolation:

```
┌─────────────────────────────────────────────────────┐
│                   Discord Community                  │
│                     (Tenant A)                       │
├─────────────────────────────────────────────────────┤
│  Users  │  Trades  │  Signals  │  Brokers  │  Audit │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                   Discord Community                  │
│                     (Tenant B)                       │
├─────────────────────────────────────────────────────┤
│  Users  │  Trades  │  Signals  │  Brokers  │  Audit │
└─────────────────────────────────────────────────────┘
```

**Key Concepts**:
- **Community**: A Discord server (tenant) with isolated data
- **User**: A Discord user within a specific community
- **Tenant Context**: Automatic scoping of all operations to the authenticated user's community
- **Row-Level Security**: Every data record is scoped to a communityId

### 7-Layer Security Architecture

1. **JWT Authentication + Tenant Context** - Token-based auth with community scoping
2. **Automatic Tenant Scoping** - Database queries auto-filtered by communityId
3. **AWS KMS Encryption** - Per-tenant data encryption keys
4. **BaseRepository Pattern** - Standardized tenant-scoped data access
5. **API Route Security** - Middleware enforcement of permissions
6. **Audit Logging** - Comprehensive logging of all operations
7. **SecurityMonitor** - Real-time threat detection and response

---

## Authentication

### JWT Token Authentication

All API requests require a valid JWT token in the `Authorization` header.

#### Obtaining a Token

**Endpoint**: `POST /api/auth/login`

**Request**:
```javascript
const response = await fetch('https://api.yourdomain.com/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    discordId: '123456789',
    discordUsername: 'TraderJoe#1234',
    communityId: '507f1f77bcf86cd799439011'
  })
});

const data = await response.json();
console.log(data);
```

**Response**:
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": "7d",
  "user": {
    "id": "507f1f77bcf86cd799439012",
    "discordUsername": "TraderJoe#1234",
    "communityRole": "trader",
    "subscription": {
      "tier": "pro",
      "status": "active"
    }
  }
}
```

#### Token Storage

Store the token securely in your application:

```javascript
// React example with localStorage
localStorage.setItem('auth_token', data.token);

// Or use a secure HTTP-only cookie (recommended for production)
// Set via server response: Set-Cookie: auth_token=...; HttpOnly; Secure; SameSite=Strict
```

#### Making Authenticated Requests

Include the token in the `Authorization` header:

```javascript
const token = localStorage.getItem('auth_token');

const response = await fetch('https://api.yourdomain.com/api/trades', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

#### Token Expiration

Tokens expire after 7 days. Implement token refresh logic:

```javascript
async function refreshToken() {
  const token = localStorage.getItem('auth_token');

  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (response.ok) {
    const data = await response.json();
    localStorage.setItem('auth_token', data.token);
    return data.token;
  } else {
    // Token expired - redirect to login
    window.location.href = '/login';
  }
}
```

#### Axios Interceptor Example

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'https://api.yourdomain.com'
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const newToken = await refreshToken();
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed - redirect to login
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
```

---

## Multi-Tenant Context

### Understanding Tenant Isolation

Every API request is automatically scoped to the authenticated user's community. You **never** need to manually specify `communityId` in API requests.

#### How Tenant Context Works

```javascript
// ❌ WRONG - Don't pass communityId
await api.get('/api/trades', {
  params: { communityId: '...' }  // Not needed!
});

// ✅ CORRECT - Automatic tenant scoping
await api.get('/api/trades');  // Only returns trades for your community
```

The backend automatically:
1. Extracts `communityId` from the JWT token
2. Validates community subscription status
3. Filters all database queries by `communityId`
4. Prevents cross-tenant data access

#### Tenant Context Flow

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│   Client    │────▶│  extractTenant   │────▶│   Database   │
│  (Frontend) │     │   Middleware     │     │   (Scoped)   │
└─────────────┘     └──────────────────┘     └──────────────┘
    JWT Token         Validates & Sets          communityId
                      AsyncLocalStorage         auto-applied
```

### Community Roles

Users have different permission levels within their community:

- **owner**: Full administrative access (only 1 per community)
- **admin**: Can manage users, settings, and view all data
- **trader**: Can execute trades and view their own data
- **viewer**: Read-only access to community data

#### Checking User Permissions

The current user's role is included in the JWT token payload and can be accessed client-side:

```javascript
import { jwtDecode } from 'jwt-decode';

const token = localStorage.getItem('auth_token');
const decoded = jwtDecode(token);

console.log(decoded);
// {
//   userId: '507f1f77bcf86cd799439012',
//   communityId: '507f1f77bcf86cd799439011',
//   communityRole: 'admin',
//   iat: 1699564800,
//   exp: 1700169600
// }

// Check permissions
const canManageUsers = ['owner', 'admin'].includes(decoded.communityRole);
const canTrade = ['owner', 'admin', 'trader'].includes(decoded.communityRole);
```

#### Role-Based UI Rendering

```javascript
// React example
function AdminPanel() {
  const token = localStorage.getItem('auth_token');
  const { communityRole } = jwtDecode(token);

  if (!['owner', 'admin'].includes(communityRole)) {
    return <AccessDenied />;
  }

  return (
    <div>
      <h1>Admin Dashboard</h1>
      {communityRole === 'owner' && <BillingSettings />}
      <UserManagement />
      <CommunitySettings />
    </div>
  );
}
```

---

## API Endpoints Reference

### Base URL

```
Production: https://api.yourdomain.com
Development: http://localhost:3000
```

### Trades API

#### Get All Trades

**Endpoint**: `GET /api/trades`

**Query Parameters**:
- `status` (optional): Filter by status (`PENDING`, `FILLED`, `CANCELLED`, `FAILED`)
- `symbol` (optional): Filter by trading symbol (e.g., `AAPL`, `TSLA`)
- `startDate` (optional): ISO date string (e.g., `2024-01-01T00:00:00Z`)
- `endDate` (optional): ISO date string
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 50, max: 100)

**Response**:
```json
{
  "success": true,
  "data": {
    "trades": [
      {
        "_id": "507f1f77bcf86cd799439013",
        "communityId": "507f1f77bcf86cd799439011",
        "userId": "507f1f77bcf86cd799439012",
        "symbol": "AAPL",
        "action": "BUY",
        "quantity": 10,
        "entryPrice": 150.25,
        "currentPrice": 152.80,
        "stopLoss": 147.50,
        "takeProfit": 155.00,
        "status": "FILLED",
        "profitLoss": 25.50,
        "profitLossPercent": 1.70,
        "broker": "alpaca",
        "signalProviderId": "507f1f77bcf86cd799439014",
        "entryTime": "2024-01-15T10:30:00Z",
        "exitTime": null,
        "fees": {
          "commission": 0.50,
          "total": 0.50
        },
        "metadata": {
          "signalSource": "Discord #trading-signals",
          "confidence": 0.85
        },
        "createdAt": "2024-01-15T10:30:00Z",
        "updatedAt": "2024-01-15T10:30:05Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalItems": 237,
      "itemsPerPage": 50
    }
  }
}
```

#### Get Single Trade

**Endpoint**: `GET /api/trades/:tradeId`

**Response**:
```json
{
  "success": true,
  "data": {
    "trade": { /* Same structure as above */ }
  }
}
```

#### Create Trade (Manual Entry)

**Endpoint**: `POST /api/trades`

**Request Body**:
```json
{
  "symbol": "AAPL",
  "action": "BUY",
  "quantity": 10,
  "entryPrice": 150.25,
  "stopLoss": 147.50,
  "takeProfit": 155.00,
  "broker": "alpaca"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "trade": { /* Trade object */ },
    "message": "Trade executed successfully"
  }
}
```

#### Update Trade

**Endpoint**: `PATCH /api/trades/:tradeId`

**Request Body**:
```json
{
  "stopLoss": 148.00,
  "takeProfit": 156.00
}
```

#### Cancel Trade

**Endpoint**: `DELETE /api/trades/:tradeId`

**Response**:
```json
{
  "success": true,
  "message": "Trade cancelled successfully"
}
```

#### Get Trade Statistics

**Endpoint**: `GET /api/trades/stats`

**Query Parameters**:
- `period` (optional): `day`, `week`, `month`, `year`, `all` (default: `month`)

**Response**:
```json
{
  "success": true,
  "data": {
    "totalTrades": 237,
    "activeTrades": 8,
    "closedTrades": 229,
    "winRate": 68.5,
    "totalProfit": 12450.75,
    "totalLoss": 3280.50,
    "netProfitLoss": 9170.25,
    "avgProfit": 185.30,
    "avgLoss": 45.60,
    "profitFactor": 3.79,
    "largestWin": 850.00,
    "largestLoss": 320.00,
    "avgHoldingTime": "4h 35m",
    "bySymbol": {
      "AAPL": { "trades": 45, "winRate": 71.1, "netPL": 2340.50 },
      "TSLA": { "trades": 38, "winRate": 65.8, "netPL": 1890.25 }
    },
    "byBroker": {
      "alpaca": { "trades": 150, "winRate": 69.3, "netPL": 7230.00 },
      "webull": { "trades": 87, "winRate": 67.8, "netPL": 1940.25 }
    },
    "period": {
      "start": "2024-01-01T00:00:00Z",
      "end": "2024-01-31T23:59:59Z"
    }
  }
}
```

### Signals API

#### Get All Signal Providers (Leaderboard)

**Endpoint**: `GET /api/signals/leaderboard`

**Query Parameters**:
- `limit` (optional): Number of providers (default: 20)
- `minWinRate` (optional): Minimum win rate percentage (0-100)
- `minTrades` (optional): Minimum executed trades
- `sortBy` (optional): `winRate`, `netProfit`, `rating`, `subscribers` (default: `winRate`)

**Response**:
```json
{
  "success": true,
  "data": {
    "providers": [
      {
        "id": "507f1f77bcf86cd799439014",
        "providerId": "discord-whale-signals",
        "name": "Whale Signals",
        "description": "Professional crypto whale tracking",
        "type": "discord",
        "performance": {
          "totalSignals": 450,
          "executedTrades": 380,
          "winRate": "72.50%",
          "netProfit": "15430.80",
          "profitFactor": "3.45",
          "sharpeRatio": "2.15"
        },
        "signalQuality": {
          "hasStopLoss": "95.0%",
          "hasTakeProfit": "98.0%",
          "averageRiskReward": "2.80"
        },
        "subscribers": 1247,
        "rating": 4.7,
        "priority": 1
      }
    ]
  }
}
```

#### Get Signal Provider Details

**Endpoint**: `GET /api/signals/:signalId`

#### Get User's Active Signals

**Endpoint**: `GET /api/signals/active`

**Response**:
```json
{
  "success": true,
  "data": {
    "signals": [
      {
        "_id": "507f1f77bcf86cd799439015",
        "providerId": "507f1f77bcf86cd799439014",
        "providerName": "Whale Signals",
        "symbol": "BTC",
        "action": "BUY",
        "entryPrice": 45000,
        "stopLoss": 44000,
        "takeProfit": 48000,
        "confidence": 0.85,
        "reasoning": "Strong support at $44K, bullish divergence on RSI",
        "status": "active",
        "receivedAt": "2024-01-15T14:30:00Z",
        "expiresAt": "2024-01-15T20:30:00Z"
      }
    ]
  }
}
```

### Signal Providers API

#### Get All Providers (Public)

**Endpoint**: `GET /api/providers`

**Query Parameters**:
- `limit`: Number of providers (default: 20)
- `minWinRate`: Minimum win rate (0-100)
- `minTrades`: Minimum trades executed
- `sortBy`: `winRate`, `netProfit`, `rating`, `subscribers`

#### Get Provider Details

**Endpoint**: `GET /api/providers/:providerId`

#### Subscribe to Provider

**Endpoint**: `POST /api/providers/:providerId/subscribe`

**Response**:
```json
{
  "success": true,
  "message": "Subscribed to Whale Signals successfully"
}
```

#### Unsubscribe from Provider

**Endpoint**: `POST /api/providers/:providerId/unsubscribe`

#### Add Provider Review

**Endpoint**: `POST /api/providers/:providerId/review`

**Request Body**:
```json
{
  "rating": 5,
  "comment": "Excellent signals with great risk/reward ratio!"
}
```

#### Get User Subscriptions

**Endpoint**: `GET /api/providers/user/subscriptions`

**Response**:
```json
{
  "success": true,
  "count": 3,
  "subscriptions": [
    {
      "id": "507f1f77bcf86cd799439014",
      "name": "Whale Signals",
      "performance": { /* ... */ },
      "userSettings": {
        "enabled": true,
        "minConfidence": 0.7
      }
    }
  ]
}
```

#### Update Provider Settings

**Endpoint**: `PUT /api/providers/user/providers/:channelId`

**Request Body**:
```json
{
  "enabled": true,
  "minConfidence": 0.8
}
```

### Crypto Exchange Fee Comparison API

The Fee Comparison API allows users to compare trading fees across their connected cryptocurrency exchanges in real-time, helping them execute trades on the most cost-effective platform.

#### Compare Exchange Fees

**Endpoint**: `GET /api/exchanges/compare-fees`

**Authentication**: Required

**Description**: Compares trading fees across all user's connected crypto exchanges for a given trading pair and quantity. Returns sorted comparisons, recommendations, and potential savings.

**Query Parameters**:
- `symbol` (required): Trading symbol (e.g., `BTC/USD`, `ETH/USD`, `SOL/USD`)
- `quantity` (required): Trade quantity (must be > 0)

**Request Example**:
```javascript
const response = await api.get('/api/exchanges/compare-fees', {
  params: {
    symbol: 'BTC/USD',
    quantity: 0.5
  }
});
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "symbol": "BTC/USD",
    "quantity": 0.5,
    "comparisons": [
      {
        "exchange": "kraken",
        "displayName": "Kraken",
        "symbol": "BTC/USD",
        "quantity": 0.5,
        "currentPrice": 49995.00,
        "tradeValue": 24997.50,
        "fees": {
          "maker": 0.0016,
          "taker": 0.0026,
          "makerPercent": "0.160",
          "takerPercent": "0.260"
        },
        "estimatedFee": 64.99,
        "estimatedFeePercent": "0.260",
        "savingsVsMostExpensive": 60.00,
        "isCheapest": true,
        "isMostExpensive": false,
        "website": "https://www.kraken.com"
      },
      {
        "exchange": "coinbasepro",
        "displayName": "Coinbase Pro",
        "symbol": "BTC/USD",
        "quantity": 0.5,
        "currentPrice": 50005.00,
        "tradeValue": 25002.50,
        "fees": {
          "maker": 0.005,
          "taker": 0.005,
          "makerPercent": "0.500",
          "takerPercent": "0.500"
        },
        "estimatedFee": 125.01,
        "estimatedFeePercent": "0.500",
        "savingsVsMostExpensive": 0.00,
        "isCheapest": false,
        "isMostExpensive": true,
        "website": "https://pro.coinbase.com"
      }
    ],
    "recommendation": {
      "exchange": "Kraken",
      "reason": "Lowest fee at 0.260% (0.260% taker fee)",
      "estimatedFee": 64.99,
      "savings": 60.02,
      "savingsPercent": "48.01"
    },
    "summary": {
      "totalExchangesCompared": 2,
      "cheapestExchange": "Kraken",
      "cheapestFee": 64.99,
      "mostExpensiveExchange": "Coinbase Pro",
      "mostExpensiveFee": 125.01,
      "maxSavings": 60.02
    }
  },
  "errors": []
}
```

**Response Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `comparisons` | Array | Array of fee comparisons sorted by lowest fee (ascending) |
| `comparisons[].exchange` | String | Exchange key (e.g., `kraken`, `coinbasepro`) |
| `comparisons[].displayName` | String | Exchange display name |
| `comparisons[].currentPrice` | Number | Current market price on this exchange |
| `comparisons[].tradeValue` | Number | Total trade value (quantity × price) |
| `comparisons[].fees.maker` | Number | Maker fee as decimal (e.g., 0.0016 = 0.16%) |
| `comparisons[].fees.taker` | Number | Taker fee as decimal (e.g., 0.0026 = 0.26%) |
| `comparisons[].estimatedFee` | Number | Estimated fee in USD for this trade |
| `comparisons[].savingsVsMostExpensive` | Number | Savings vs most expensive option |
| `comparisons[].isCheapest` | Boolean | True if this is the lowest fee exchange |
| `comparisons[].isMostExpensive` | Boolean | True if this is the highest fee exchange |
| `recommendation` | Object | Recommended exchange with best rate |
| `recommendation.savings` | Number | Total savings vs most expensive |
| `recommendation.savingsPercent` | String | Savings as percentage |
| `summary` | Object | Summary statistics across all exchanges |
| `errors` | Array | Errors from individual exchanges (if any) |

**Error Response** (400 Bad Request):
```json
{
  "success": false,
  "message": "Symbol is required (e.g., BTC/USD, ETH/USD)"
}
```

**Error Response** (400 Bad Request - No Exchanges):
```json
{
  "success": false,
  "message": "No exchanges connected. Please connect at least one crypto exchange."
}
```

**Error Response** (400 Bad Request - Symbol Not Supported):
```json
{
  "success": true,
  "data": {
    "comparisons": [
      {
        "exchange": "kraken",
        "estimatedFee": 64.99,
        // ... other successful comparison data
      }
    ],
    // ... recommendation and summary
  },
  "errors": [
    {
      "exchange": "coinbasepro",
      "error": "Symbol EXOTIC/USD not supported"
    }
  ]
}
```

**Rate Limiting**: 10 requests per minute per user

**Notes**:
- Automatically uses taker fees (market order fees) for calculations
- Decrypts user's exchange credentials securely
- Fetches real-time prices and fees from each exchange
- Gracefully handles exchange-specific errors
- Only compares active crypto exchanges
- Supports both testnet and live exchange connections

**Usage Example** (React):
```javascript
import { useState, useEffect } from 'react';
import api from '../api';

function FeeComparisonWidget({ symbol, quantity }) {
  const [comparison, setComparison] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!symbol || !quantity || quantity <= 0) return;

    const fetchComparison = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await api.get('/api/exchanges/compare-fees', {
          params: { symbol, quantity }
        });

        setComparison(response.data.data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    // Debounce to avoid excessive API calls
    const timeoutId = setTimeout(fetchComparison, 500);
    return () => clearTimeout(timeoutId);
  }, [symbol, quantity]);

  if (loading) return <div>Loading comparison...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!comparison) return null;

  return (
    <div className="fee-comparison">
      <div className="recommendation">
        <h3>Best Rate: {comparison.recommendation.exchange}</h3>
        <p className="savings">
          Save ${comparison.recommendation.savings.toFixed(2)}
          ({comparison.recommendation.savingsPercent}%)
        </p>
        <p className="fee">
          Estimated Fee: ${comparison.recommendation.estimatedFee.toFixed(2)}
        </p>
      </div>

      <table className="comparisons">
        <thead>
          <tr>
            <th>Exchange</th>
            <th>Fee %</th>
            <th>Estimated Cost</th>
            <th>Savings</th>
          </tr>
        </thead>
        <tbody>
          {comparison.comparisons.map(comp => (
            <tr key={comp.exchange} className={comp.isCheapest ? 'best-rate' : ''}>
              <td>
                {comp.displayName}
                {comp.isCheapest && <span className="badge">Best</span>}
              </td>
              <td>{comp.fees.takerPercent}%</td>
              <td>${comp.estimatedFee.toFixed(2)}</td>
              <td>
                {comp.savingsVsMostExpensive > 0
                  ? `$${comp.savingsVsMostExpensive.toFixed(2)}`
                  : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {comparison.errors.length > 0 && (
        <div className="errors">
          <h4>Some exchanges could not be compared:</h4>
          <ul>
            {comparison.errors.map((err, idx) => (
              <li key={idx}>
                <strong>{err.exchange}:</strong> {err.error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

**Supported Exchanges**:
- **Coinbase Pro**: 0.5% maker/taker fees
- **Kraken**: 0.16% maker / 0.26% taker fees
- **Additional exchanges** (Binance, Bybit, OKX) coming soon

**Supported Assets** (Launch):
BTC, ETH, SOL, ADA, DOT, MATIC, LINK, UNI, AVAX, ATOM (10 major cryptocurrencies, expanding to 50+ based on user demand)

**Fee Calculation**:
- Uses **taker fees** (market order fees) for all calculations
- Real-time price data from each exchange
- Trade value = quantity × current market price
- Estimated fee = trade value × taker fee percentage

**Best Practices**:
1. **Debounce requests**: Wait 500ms after user input before making API calls
2. **Cache results**: Cache comparison results for 10-30 seconds
3. **Handle errors gracefully**: Some exchanges may not support certain symbols
4. **Show savings prominently**: Highlight potential savings to users
5. **Refresh strategically**: Update prices every 30-60 seconds for active comparisons

### Admin API (Owner/Admin Only)

#### Get Admin Dashboard Statistics

**Endpoint**: `GET /api/admin/stats`

**Permission**: Owner only

**Response**:
```json
{
  "success": true,
  "data": {
    "users": {
      "total": 45,
      "activeSubscribers": 38,
      "byTier": {
        "free": 12,
        "basic": 15,
        "pro": 13,
        "premium": 5
      }
    },
    "activity": {
      "activeUsers30Days": 42,
      "activeUsers7Days": 38,
      "activeUsers24Hours": 24
    },
    "platform": {
      "totalTrades": 1247,
      "totalVolume": "2340580.50",
      "totalProfitLoss": "45320.80",
      "winRate": "68.50%"
    }
  }
}
```

#### Get All Users

**Endpoint**: `GET /api/admin/users`

**Permission**: Owner only

**Query Parameters**:
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20, max: 100)
- `search`: Search by username
- `tier`: Filter by subscription tier
- `status`: Filter by subscription status

**Response**:
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "_id": "507f1f77bcf86cd799439012",
        "discordUsername": "TraderJoe#1234",
        "discordId": "123456789",
        "communityRole": "trader",
        "subscription": {
          "tier": "pro",
          "status": "active"
        },
        "stats": {
          "totalTradesExecuted": 47,
          "successfulTrades": 32
        },
        "createdAt": "2024-01-01T00:00:00Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 3,
      "totalItems": 45
    }
  }
}
```

#### Update User Role

**Endpoint**: `PATCH /api/admin/users/:userId/role`

**Permission**: Owner only

**Request Body**:
```json
{
  "communityRole": "admin"
}
```

**Valid Roles**: `admin`, `trader`, `viewer`

**Response**:
```json
{
  "success": true,
  "data": {
    "userId": "507f1f77bcf86cd799439012",
    "username": "TraderJoe#1234",
    "communityRole": "admin"
  },
  "message": "User TraderJoe#1234 role updated to admin"
}
```

---

## Request/Response Examples

### Complete Trade Execution Flow

```javascript
import api from './api'; // Axios instance with auth interceptor

// 1. Fetch active signals
async function fetchActiveSignals() {
  try {
    const response = await api.get('/api/signals/active');
    return response.data.data.signals;
  } catch (error) {
    console.error('Failed to fetch signals:', error);
    throw error;
  }
}

// 2. Execute trade from signal
async function executeTradeFromSignal(signal) {
  try {
    const response = await api.post('/api/trades', {
      symbol: signal.symbol,
      action: signal.action,
      quantity: calculatePositionSize(signal),
      entryPrice: signal.entryPrice,
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
      broker: 'alpaca',
      signalId: signal._id
    });

    return response.data.data.trade;
  } catch (error) {
    console.error('Trade execution failed:', error);
    throw error;
  }
}

// 3. Calculate position size based on risk management
function calculatePositionSize(signal) {
  const accountBalance = 10000; // From user settings
  const riskPerTrade = 0.02; // 2%
  const riskAmount = accountBalance * riskPerTrade;

  const stopLossDistance = Math.abs(signal.entryPrice - signal.stopLoss);
  const stopLossPercent = stopLossDistance / signal.entryPrice;

  const positionSize = riskAmount / (stopLossPercent * signal.entryPrice);

  return Math.floor(positionSize);
}

// 4. Monitor trade status
async function monitorTrade(tradeId) {
  try {
    const response = await api.get(`/api/trades/${tradeId}`);
    const trade = response.data.data.trade;

    console.log(`Trade ${tradeId}:`, {
      status: trade.status,
      profitLoss: trade.profitLoss,
      profitLossPercent: trade.profitLossPercent
    });

    return trade;
  } catch (error) {
    console.error('Failed to monitor trade:', error);
    throw error;
  }
}

// 5. Complete flow
async function completeTradeFlow() {
  // Fetch signals
  const signals = await fetchActiveSignals();
  console.log(`Found ${signals.length} active signals`);

  // Execute first high-confidence signal
  const highConfidenceSignal = signals.find(s => s.confidence >= 0.8);
  if (highConfidenceSignal) {
    const trade = await executeTradeFromSignal(highConfidenceSignal);
    console.log('Trade executed:', trade);

    // Monitor trade every 30 seconds
    const interval = setInterval(async () => {
      const updatedTrade = await monitorTrade(trade._id);

      if (['FILLED', 'CANCELLED', 'FAILED'].includes(updatedTrade.status)) {
        clearInterval(interval);
        console.log('Trade complete:', updatedTrade);
      }
    }, 30000);
  }
}
```

### React Hooks Example

```javascript
// useTradeData.js
import { useState, useEffect } from 'react';
import api from '../api';

export function useTradeData(filters = {}) {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState(null);

  useEffect(() => {
    fetchTrades();
  }, [JSON.stringify(filters)]);

  async function fetchTrades() {
    try {
      setLoading(true);
      const response = await api.get('/api/trades', { params: filters });
      setTrades(response.data.data.trades);
      setPagination(response.data.data.pagination);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return { trades, loading, error, pagination, refetch: fetchTrades };
}

// Component usage
function TradesTable() {
  const { trades, loading, error, pagination } = useTradeData({
    status: 'FILLED',
    limit: 20
  });

  if (loading) return <div>Loading trades...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <table>
      <thead>
        <tr>
          <th>Symbol</th>
          <th>Action</th>
          <th>Quantity</th>
          <th>P&L</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {trades.map(trade => (
          <tr key={trade._id}>
            <td>{trade.symbol}</td>
            <td>{trade.action}</td>
            <td>{trade.quantity}</td>
            <td className={trade.profitLoss >= 0 ? 'profit' : 'loss'}>
              ${trade.profitLoss.toFixed(2)} ({trade.profitLossPercent.toFixed(2)}%)
            </td>
            <td>{trade.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

### Vue.js Composition API Example

```javascript
// composables/useTradeStats.js
import { ref, onMounted } from 'vue';
import api from '../api';

export function useTradeStats(period = 'month') {
  const stats = ref(null);
  const loading = ref(true);
  const error = ref(null);

  async function fetchStats() {
    try {
      loading.value = true;
      const response = await api.get('/api/trades/stats', {
        params: { period }
      });
      stats.value = response.data.data;
      error.value = null;
    } catch (err) {
      error.value = err.message;
    } finally {
      loading.value = false;
    }
  }

  onMounted(fetchStats);

  return { stats, loading, error, refetch: fetchStats };
}

// Component usage
<template>
  <div v-if="loading">Loading statistics...</div>
  <div v-else-if="error">Error: {{ error }}</div>
  <div v-else class="stats-grid">
    <div class="stat-card">
      <h3>Total Trades</h3>
      <p>{{ stats.totalTrades }}</p>
    </div>
    <div class="stat-card">
      <h3>Win Rate</h3>
      <p>{{ stats.winRate }}%</p>
    </div>
    <div class="stat-card">
      <h3>Net P&L</h3>
      <p>${{ stats.netProfitLoss.toFixed(2) }}</p>
    </div>
    <div class="stat-card">
      <h3>Profit Factor</h3>
      <p>{{ stats.profitFactor.toFixed(2) }}</p>
    </div>
  </div>
</template>

<script setup>
import { useTradeStats } from '@/composables/useTradeStats';

const { stats, loading, error } = useTradeStats('month');
</script>
```

---

## Error Handling

### Standard Error Response Format

All errors follow a consistent structure:

```json
{
  "success": false,
  "error": "User-friendly error message",
  "message": "Detailed technical error description",
  "code": "ERROR_CODE",
  "statusCode": 400
}
```

### HTTP Status Codes

- `200 OK` - Request succeeded
- `201 Created` - Resource created successfully
- `400 Bad Request` - Invalid request data
- `401 Unauthorized` - Missing or invalid JWT token
- `403 Forbidden` - Valid token but insufficient permissions
- `404 Not Found` - Resource not found
- `409 Conflict` - Resource conflict (e.g., duplicate entry)
- `422 Unprocessable Entity` - Validation failed
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server-side error

### Common Error Codes

| Error Code | Description | Solution |
|-----------|-------------|----------|
| `AUTH_REQUIRED` | No authentication token provided | Include `Authorization` header |
| `AUTH_INVALID` | Invalid or expired token | Refresh token or re-authenticate |
| `AUTH_EXPIRED` | Token has expired | Use refresh token endpoint |
| `PERMISSION_DENIED` | Insufficient permissions | Check user role requirements |
| `TENANT_INVALID` | Community not found or inactive | Verify community status |
| `SUBSCRIPTION_INACTIVE` | User subscription expired | Upgrade subscription |
| `RATE_LIMIT_EXCEEDED` | Too many requests | Implement exponential backoff |
| `VALIDATION_ERROR` | Request validation failed | Check request body schema |
| `RESOURCE_NOT_FOUND` | Requested resource doesn't exist | Verify resource ID |
| `DAILY_LIMIT_REACHED` | User exceeded daily trade limit | Wait for limit reset or upgrade tier |
| `RISK_LIMIT_EXCEEDED` | Trade violates risk management rules | Adjust trade parameters |

### Error Handling Best Practices

```javascript
// Centralized error handler
function handleApiError(error) {
  if (error.response) {
    // Server responded with error status
    const { status, data } = error.response;

    switch (status) {
      case 401:
        // Unauthorized - redirect to login
        localStorage.removeItem('auth_token');
        window.location.href = '/login';
        break;

      case 403:
        // Forbidden - show permission error
        showNotification('error', 'You do not have permission to perform this action');
        break;

      case 404:
        // Not found
        showNotification('error', data.error || 'Resource not found');
        break;

      case 422:
        // Validation error
        showValidationErrors(data.errors);
        break;

      case 429:
        // Rate limit exceeded
        const retryAfter = error.response.headers['retry-after'];
        showNotification('warning', `Rate limit exceeded. Try again in ${retryAfter} seconds`);
        break;

      case 500:
        // Server error
        showNotification('error', 'Server error. Please try again later');
        logErrorToService(error); // Log to error tracking service
        break;

      default:
        showNotification('error', data.error || 'An error occurred');
    }
  } else if (error.request) {
    // Request made but no response
    showNotification('error', 'Network error. Please check your connection');
  } else {
    // Error in request setup
    showNotification('error', 'An unexpected error occurred');
    console.error('Error:', error.message);
  }
}

// Usage in API calls
async function createTrade(tradeData) {
  try {
    const response = await api.post('/api/trades', tradeData);
    return response.data.data.trade;
  } catch (error) {
    handleApiError(error);
    throw error;
  }
}
```

### Validation Error Handling

```javascript
// Server returns validation errors in this format:
{
  "success": false,
  "error": "Validation failed",
  "errors": {
    "symbol": "Symbol is required",
    "quantity": "Quantity must be greater than 0",
    "entryPrice": "Entry price must be a positive number"
  }
}

// Display validation errors in form
function showValidationErrors(errors) {
  Object.keys(errors).forEach(field => {
    const errorElement = document.querySelector(`[data-error-for="${field}"]`);
    if (errorElement) {
      errorElement.textContent = errors[field];
      errorElement.style.display = 'block';
    }
  });
}

// React example with form validation
function TradeForm() {
  const [errors, setErrors] = useState({});

  async function handleSubmit(e) {
    e.preventDefault();
    setErrors({});

    try {
      await api.post('/api/trades', formData);
      showNotification('success', 'Trade executed successfully');
    } catch (error) {
      if (error.response?.status === 422) {
        setErrors(error.response.data.errors);
      } else {
        handleApiError(error);
      }
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <input name="symbol" />
        {errors.symbol && <span className="error">{errors.symbol}</span>}
      </div>
      {/* Other form fields */}
    </form>
  );
}
```

---

## Security Best Practices

### 1. Token Storage

**❌ Don't Store Tokens in localStorage (if possible)**:
```javascript
// Vulnerable to XSS attacks
localStorage.setItem('auth_token', token);
```

**✅ Use HTTP-Only Cookies (Recommended)**:
```javascript
// Server sets cookie:
res.cookie('auth_token', token, {
  httpOnly: true,  // Not accessible via JavaScript
  secure: true,    // HTTPS only
  sameSite: 'strict', // CSRF protection
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
});

// Client automatically sends cookie with requests
// No manual token management needed
```

**🔶 If Using localStorage**:
- Sanitize all user inputs to prevent XSS
- Implement Content Security Policy (CSP)
- Use short-lived tokens with refresh mechanism

### 2. API Key Security

**❌ Never Expose API Keys in Frontend**:
```javascript
// WRONG - API keys visible in client code
const API_KEY = 'sk_live_abc123';
```

**✅ Proxy Through Backend**:
```javascript
// Frontend calls your backend
await api.post('/api/broker/connect', { broker: 'alpaca' });

// Backend handles API keys securely
// Server-side code only
const alpacaApi = new Alpaca({
  keyId: process.env.ALPACA_KEY_ID,
  secretKey: process.env.ALPACA_SECRET_KEY
});
```

### 3. Input Validation

**✅ Always Validate User Input**:
```javascript
function validateTradeData(trade) {
  const errors = {};

  if (!trade.symbol || !/^[A-Z]{1,5}$/.test(trade.symbol)) {
    errors.symbol = 'Invalid symbol format';
  }

  if (!trade.quantity || trade.quantity <= 0) {
    errors.quantity = 'Quantity must be positive';
  }

  if (!trade.entryPrice || trade.entryPrice <= 0) {
    errors.entryPrice = 'Entry price must be positive';
  }

  if (trade.stopLoss && trade.action === 'BUY' && trade.stopLoss >= trade.entryPrice) {
    errors.stopLoss = 'Stop loss must be below entry price for BUY orders';
  }

  return Object.keys(errors).length > 0 ? errors : null;
}
```

### 4. XSS Prevention

**✅ Escape User-Generated Content**:
```javascript
// Use a library like escape-html or DOMPurify
import escapeHtml from 'escape-html';

// Display user comments or signal descriptions
function displaySignalReasoning(reasoning) {
  // Escape HTML to prevent XSS
  const escaped = escapeHtml(reasoning);
  return <div>{escaped}</div>;
}

// Or use React's built-in escaping
function SignalCard({ signal }) {
  return (
    <div>
      <h3>{signal.symbol}</h3>
      <p>{signal.reasoning}</p> {/* React automatically escapes text content */}
    </div>
  );
}
```

### 5. CSRF Protection

**✅ Implement CSRF Tokens** (if not using HTTP-only cookies):
```javascript
// Server sends CSRF token
res.json({
  csrfToken: generateCsrfToken(),
  // ... other data
});

// Client includes CSRF token in requests
api.defaults.headers.common['X-CSRF-Token'] = csrfToken;
```

### 6. Rate Limiting Client-Side

**✅ Implement Request Throttling**:
```javascript
import { throttle } from 'lodash';

// Limit API calls to once per 500ms
const throttledFetchTrades = throttle(
  async () => {
    const response = await api.get('/api/trades');
    setTrades(response.data.data.trades);
  },
  500,
  { leading: true, trailing: false }
);

// Prevent spam clicking
button.addEventListener('click', throttledFetchTrades);
```

### 7. Secure WebSocket Connections

**✅ Use WSS Protocol**:
```javascript
// Production - secure WebSocket
const ws = new WebSocket('wss://api.yourdomain.com/ws');

// Include authentication
ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'auth',
    token: localStorage.getItem('auth_token')
  }));
};
```

### 8. Content Security Policy

**✅ Implement CSP Headers** (server-side):
```javascript
// Express.js example
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "font-src 'self' data:; " +
    "connect-src 'self' wss://api.yourdomain.com;"
  );
  next();
});
```

### 9. Logging Sensitive Actions

**✅ Log Security-Relevant Events**:
```javascript
// Log authentication events
function trackAuthEvent(event, success) {
  analytics.track(event, {
    success,
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    // Don't log sensitive data like passwords
  });
}

trackAuthEvent('login_attempt', true);
trackAuthEvent('token_refresh', true);
trackAuthEvent('logout', true);
```

### 10. Secure Error Messages

**❌ Don't Expose Internal Details**:
```javascript
// WRONG - reveals internal structure
throw new Error('Database connection to mongo-primary-1 failed');
```

**✅ Use Generic Messages for Users**:
```javascript
// User-facing
res.status(500).json({
  success: false,
  error: 'An error occurred. Please try again later',
  requestId: 'req_abc123' // For support debugging
});

// Log detailed error server-side
logger.error('Database connection failed', {
  host: 'mongo-primary-1',
  error: err.message,
  stack: err.stack
});
```

---

## Rate Limiting

### Default Rate Limits

| Endpoint Type | Rate Limit | Window |
|--------------|-----------|--------|
| Authentication | 5 requests | 15 minutes |
| API (authenticated) | 100 requests | 15 minutes |
| API (unauthenticated) | 20 requests | 15 minutes |
| Trade execution | 10 trades | 1 minute |
| Signal fetching | 30 requests | 1 minute |

### Rate Limit Headers

The API returns rate limit information in response headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1699564800
Retry-After: 300 (only when rate limited)
```

### Handling Rate Limits

```javascript
// Automatic retry with exponential backoff
async function apiCallWithRetry(url, options = {}, maxRetries = 3) {
  let retries = 0;

  while (retries < maxRetries) {
    try {
      const response = await api.get(url, options);
      return response.data;
    } catch (error) {
      if (error.response?.status === 429) {
        const retryAfter = parseInt(error.response.headers['retry-after']) || 60;
        const delay = Math.min(retryAfter * 1000, 2 ** retries * 1000);

        console.log(`Rate limited. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        retries++;
      } else {
        throw error;
      }
    }
  }

  throw new Error('Max retries exceeded');
}

// Usage
const trades = await apiCallWithRetry('/api/trades');
```

### Rate Limit Monitoring

```javascript
// Track rate limit status
class RateLimitMonitor {
  constructor() {
    this.limits = {};
  }

  updateFromHeaders(headers) {
    this.limits = {
      limit: parseInt(headers['x-ratelimit-limit']),
      remaining: parseInt(headers['x-ratelimit-remaining']),
      reset: parseInt(headers['x-ratelimit-reset'])
    };
  }

  getRemainingRequests() {
    return this.limits.remaining || 0;
  }

  getResetTime() {
    return new Date(this.limits.reset * 1000);
  }

  shouldThrottle() {
    return this.limits.remaining < 10; // Throttle when less than 10 requests remaining
  }
}

// Axios interceptor to track rate limits
const rateLimitMonitor = new RateLimitMonitor();

api.interceptors.response.use(
  (response) => {
    rateLimitMonitor.updateFromHeaders(response.headers);
    return response;
  },
  (error) => {
    if (error.response) {
      rateLimitMonitor.updateFromHeaders(error.response.headers);
    }
    return Promise.reject(error);
  }
);

// Check before making requests
async function fetchTradesWithThrottling() {
  if (rateLimitMonitor.shouldThrottle()) {
    console.log('Approaching rate limit, throttling requests...');
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return await api.get('/api/trades');
}
```

---

## WebSocket Integration

### Connecting to WebSocket Server

```javascript
class TradeWebSocket {
  constructor(token) {
    this.token = token;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
  }

  connect() {
    // Use secure WebSocket (wss://)
    this.ws = new WebSocket('wss://api.yourdomain.com/ws');

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;

      // Authenticate
      this.send({
        type: 'auth',
        token: this.token
      });
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.handleMessage(message);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.reconnect();
    };
  }

  reconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

      console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

      setTimeout(() => {
        this.connect();
      }, delay);
    } else {
      console.error('Max reconnection attempts reached');
    }
  }

  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.error('WebSocket not connected');
    }
  }

  handleMessage(message) {
    switch (message.type) {
      case 'auth_success':
        console.log('WebSocket authenticated');
        this.subscribeToChannels();
        break;

      case 'auth_error':
        console.error('WebSocket authentication failed:', message.error);
        break;

      case 'trade_update':
        this.onTradeUpdate(message.data);
        break;

      case 'signal_received':
        this.onSignalReceived(message.data);
        break;

      case 'position_update':
        this.onPositionUpdate(message.data);
        break;

      default:
        console.log('Unknown message type:', message.type);
    }
  }

  subscribeToChannels() {
    // Subscribe to trade updates
    this.send({
      type: 'subscribe',
      channel: 'trades'
    });

    // Subscribe to signals
    this.send({
      type: 'subscribe',
      channel: 'signals'
    });
  }

  onTradeUpdate(trade) {
    console.log('Trade update:', trade);
    // Dispatch event or update state
    window.dispatchEvent(new CustomEvent('trade-update', { detail: trade }));
  }

  onSignalReceived(signal) {
    console.log('New signal:', signal);
    window.dispatchEvent(new CustomEvent('signal-received', { detail: signal }));
  }

  onPositionUpdate(position) {
    console.log('Position update:', position);
    window.dispatchEvent(new CustomEvent('position-update', { detail: position }));
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// Usage
const token = localStorage.getItem('auth_token');
const ws = new TradeWebSocket(token);
ws.connect();

// Listen for events
window.addEventListener('trade-update', (event) => {
  const trade = event.detail;
  updateTradeUI(trade);
});

window.addEventListener('signal-received', (event) => {
  const signal = event.detail;
  showSignalNotification(signal);
});
```

### React Integration

```javascript
// useWebSocket.js
import { useEffect, useRef, useState } from 'react';

export function useWebSocket(token) {
  const ws = useRef(null);
  const [connected, setConnected] = useState(false);
  const [trades, setTrades] = useState([]);
  const [signals, setSignals] = useState([]);

  useEffect(() => {
    if (!token) return;

    ws.current = new WebSocket('wss://api.yourdomain.com/ws');

    ws.current.onopen = () => {
      setConnected(true);
      ws.current.send(JSON.stringify({ type: 'auth', token }));
    };

    ws.current.onmessage = (event) => {
      const message = JSON.parse(event.data);

      if (message.type === 'trade_update') {
        setTrades(prev => {
          const index = prev.findIndex(t => t._id === message.data._id);
          if (index >= 0) {
            const updated = [...prev];
            updated[index] = message.data;
            return updated;
          }
          return [...prev, message.data];
        });
      }

      if (message.type === 'signal_received') {
        setSignals(prev => [message.data, ...prev].slice(0, 10)); // Keep last 10
      }
    };

    ws.current.onclose = () => {
      setConnected(false);
    };

    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [token]);

  const subscribe = (channel) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'subscribe', channel }));
    }
  };

  return { connected, trades, signals, subscribe };
}

// Component usage
function TradesDashboard() {
  const token = localStorage.getItem('auth_token');
  const { connected, trades, signals } = useWebSocket(token);

  return (
    <div>
      <div className={`status ${connected ? 'connected' : 'disconnected'}`}>
        {connected ? 'Connected' : 'Disconnected'}
      </div>

      <h2>Live Trades ({trades.length})</h2>
      <TradesList trades={trades} />

      <h2>Recent Signals ({signals.length})</h2>
      <SignalsList signals={signals} />
    </div>
  );
}
```

---

## Testing & Development

### Development Environment Setup

```bash
# Clone repository
git clone https://github.com/yourusername/discord-trade-exec.git
cd discord-trade-exec

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Edit .env with your settings
# Required variables:
# - MONGODB_URI
# - JWT_SECRET
# - AWS_KMS_KEY_ID (for encryption)
```

### Test API Endpoints

```bash
# Start development server
npm run dev

# Server runs on http://localhost:3000

# Test authentication
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "discordId": "123456789",
    "discordUsername": "TestUser#1234",
    "communityId": "507f1f77bcf86cd799439011"
  }'

# Save the token
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Test trades endpoint
curl -X GET http://localhost:3000/api/trades \
  -H "Authorization: Bearer $TOKEN"

# Create a test trade
curl -X POST http://localhost:3000/api/trades \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "AAPL",
    "action": "BUY",
    "quantity": 10,
    "entryPrice": 150.25,
    "stopLoss": 147.50,
    "takeProfit": 155.00,
    "broker": "alpaca"
  }'
```

### Postman Collection

Import this collection into Postman for easy testing:

```json
{
  "info": {
    "name": "Discord Trade Executor API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "auth": {
    "type": "bearer",
    "bearer": [
      {
        "key": "token",
        "value": "{{auth_token}}",
        "type": "string"
      }
    ]
  },
  "variable": [
    {
      "key": "base_url",
      "value": "http://localhost:3000",
      "type": "string"
    },
    {
      "key": "auth_token",
      "value": "",
      "type": "string"
    }
  ],
  "item": [
    {
      "name": "Authentication",
      "item": [
        {
          "name": "Login",
          "request": {
            "method": "POST",
            "url": "{{base_url}}/api/auth/login",
            "body": {
              "mode": "raw",
              "raw": "{\n  \"discordId\": \"123456789\",\n  \"discordUsername\": \"TestUser#1234\",\n  \"communityId\": \"507f1f77bcf86cd799439011\"\n}",
              "options": {
                "raw": {
                  "language": "json"
                }
              }
            }
          }
        }
      ]
    },
    {
      "name": "Trades",
      "item": [
        {
          "name": "Get All Trades",
          "request": {
            "method": "GET",
            "url": "{{base_url}}/api/trades"
          }
        },
        {
          "name": "Create Trade",
          "request": {
            "method": "POST",
            "url": "{{base_url}}/api/trades",
            "body": {
              "mode": "raw",
              "raw": "{\n  \"symbol\": \"AAPL\",\n  \"action\": \"BUY\",\n  \"quantity\": 10,\n  \"entryPrice\": 150.25,\n  \"stopLoss\": 147.50,\n  \"takeProfit\": 155.00,\n  \"broker\": \"alpaca\"\n}",
              "options": {
                "raw": {
                  "language": "json"
                }
              }
            }
          }
        }
      ]
    }
  ]
}
```

### Frontend Testing Utilities

```javascript
// mockApi.js - For testing without backend
export const mockApi = {
  async get(url) {
    await delay(500); // Simulate network delay

    if (url === '/api/trades') {
      return {
        data: {
          success: true,
          data: {
            trades: generateMockTrades(10),
            pagination: {
              currentPage: 1,
              totalPages: 5,
              totalItems: 50
            }
          }
        }
      };
    }

    throw new Error('Mock endpoint not implemented');
  },

  async post(url, data) {
    await delay(500);

    if (url === '/api/trades') {
      return {
        data: {
          success: true,
          data: {
            trade: {
              _id: generateId(),
              ...data,
              status: 'PENDING',
              createdAt: new Date().toISOString()
            }
          }
        }
      };
    }

    throw new Error('Mock endpoint not implemented');
  }
};

function generateMockTrades(count) {
  const symbols = ['AAPL', 'TSLA', 'GOOGL', 'AMZN', 'MSFT'];
  const actions = ['BUY', 'SELL'];
  const statuses = ['PENDING', 'FILLED', 'CANCELLED'];

  return Array.from({ length: count }, (_, i) => ({
    _id: generateId(),
    symbol: symbols[Math.floor(Math.random() * symbols.length)],
    action: actions[Math.floor(Math.random() * actions.length)],
    quantity: Math.floor(Math.random() * 100) + 1,
    entryPrice: Math.random() * 500 + 50,
    status: statuses[Math.floor(Math.random() * statuses.length)],
    profitLoss: (Math.random() - 0.5) * 1000,
    createdAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString()
  }));
}

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

---

## Support & Resources

### Documentation
- **API Reference**: This document
- **Security Architecture**: `/docs/SECURITY_ARCHITECTURE.md`
- **Multi-Tenant Guide**: `/docs/MULTI_TENANT_GUIDE.md`

### Contact
- **Email**: support@yourdomain.com
- **Discord**: [Your Discord Server]
- **GitHub Issues**: https://github.com/yourusername/discord-trade-exec/issues

### Rate Limit Increases
For higher rate limits, contact support with:
- Community ID
- Expected request volume
- Use case description

### Security Issues
Report security vulnerabilities to: security@yourdomain.com

**Do not** create public GitHub issues for security concerns.

---

## Changelog

### v2.0.0 (2024-01-15)
- **Multi-Tenant Architecture**: Implemented community-based tenant isolation
- **7-Layer Security**: Complete security defense system
- **SecurityMonitor**: Real-time threat detection and response
- **Audit Logging**: Comprehensive operation tracking
- **AWS KMS Encryption**: Per-tenant data encryption

### v1.0.0 (2023-12-01)
- Initial release
- Single-tenant architecture
- Basic trade execution
- Discord signal integration

---

## License

Copyright © 2024 Your Company Name. All rights reserved.

This API and documentation are proprietary and confidential.
