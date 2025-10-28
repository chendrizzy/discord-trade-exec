# Security Validation Documentation

**US7-T09: Security Validation Completeness**

This document comprehensively details all validated routes, validation rules, security protections, and examples for the Discord Trade Executor application.

## Table of Contents

1. [Overview](#overview)
2. [Validation Architecture](#validation-architecture)
3. [Security Protections](#security-protections)
4. [Validated Routes by Domain](#validated-routes-by-domain)
5. [Common Validation Patterns](#common-validation-patterns)
6. [Testing Security Validation](#testing-security-validation)

---

## Overview

All API endpoints in the Discord Trade Executor use **Zod schema validation** with custom middleware to ensure:

- **Type safety**: All inputs match expected types
- **Format validation**: Strings, numbers, dates match required patterns
- **Range validation**: Numeric values within acceptable bounds
- **Security filtering**: Dangerous keys rejected (prototype pollution prevention)
- **Clear error messages**: Validation failures return structured error responses

**Validation Implementation**: `src/middleware/validation.js` exports `validate(schema, source)` middleware that:
1. Checks for prototype pollution keys BEFORE schema validation
2. Validates input against Zod schema
3. Returns 400 with structured error details on failure
4. Replaces request data with validated/sanitized values on success

---

## Validation Architecture

### Middleware Integration

Routes integrate validation using the `validate()` middleware:

```javascript
const { validate } = require('../../middleware/validation');
const { customMetricRecordBody } = require('../../validators/metrics.validators');

router.post('/custom',
  validate(customMetricRecordBody, 'body'),  // Validate request body
  ensureAuthenticated,                        // Then authenticate
  (req, res) => {
    // Handler receives validated data
  }
);
```

### Validation Sources

The `validate(schema, source)` middleware supports three data sources:
- `'body'` - Request body (POST/PUT/PATCH)
- `'query'` - Query parameters (GET)
- `'params'` - URL path parameters

### Error Response Format

Validation failures return standardized error responses:

```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    {
      "field": "rating",
      "message": "Rating must be at least 1"
    }
  ]
}
```

Prototype pollution detection returns:

```json
{
  "success": false,
  "error": "Security validation failed",
  "code": "PROTOTYPE_POLLUTION_DETECTED",
  "details": [
    {
      "field": "__proto__",
      "message": "Dangerous key '__proto__' detected. This key is not allowed for security reasons."
    }
  ]
}
```

---

## Security Protections

### 1. Prototype Pollution Prevention

**Implementation**: `src/middleware/validation.js:368-390` (checkPrototypePollution function)

**Protected Keys**:
- `__proto__`
- `constructor`
- `prototype`

**Detection Method**: Recursive traversal of all request data (body, query, params) checking object keys at all nesting levels, including arrays.

**Response**: 400 Bad Request with `PROTOTYPE_POLLUTION_DETECTED` error code.

**Test Coverage**: `tests/integration/security/prototype-pollution.test.js` - 50 test cases covering:
- Top-level dangerous keys
- Nested dangerous keys (multiple levels deep)
- Dangerous keys in array elements
- Dangerous keys in route params
- Multiple pollution vectors in single request
- Safe properties that should pass through

### 2. Input Sanitization

**String Sanitization** (`sanitizeString` function):
- Removes HTML tags and script content
- Removes null bytes (`\0`)
- Trims whitespace

**Recursive Object Sanitization** (`sanitizeObject` function):
- Traverses objects up to 5 levels deep
- Skips dangerous keys (`__proto__`, `constructor`, `prototype`, keys starting with `__` or `$`)
- Sanitizes all string values
- Prevents MongoDB injection via `$` operator filtering

### 3. Type Safety

All validators use Zod schemas ensuring:
- Correct data types (string, number, boolean)
- Format constraints (regex patterns)
- Range constraints (min/max values)
- Required vs optional fields
- Enum validation for fixed value sets

### 4. Length Constraints

String inputs have maximum lengths to prevent:
- Buffer overflow attacks
- Denial of service via large payloads
- Database field overflow

Examples:
- Email: 255 characters max
- API keys: 10-512 characters
- Search queries: 255 characters max
- Comments/reviews: 1000 characters max

---

## Validated Routes by Domain

### 1. Admin Routes (`/api/admin/*`)

**Validator**: `src/validators/admin.validators.js`

#### GET `/api/admin/users` - List Users

**Validation**: `adminUsersQuery` (query parameters)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `page` | number | ≥1 | Page number (1-based) |
| `limit` | number | 1-100 | Results per page |
| `search` | string | max 255, alphanumeric + `@._-` and spaces | Search username/email |
| `tier` | enum | `free`, `basic`, `pro`, `premium` | Filter by subscription tier |
| `status` | enum | `active`, `trial`, `cancelled`, `past_due` | Filter by subscription status |

**Example**:
```http
GET /api/admin/users?page=1&limit=20&tier=premium&status=active
```

#### PATCH `/api/admin/users/:userId/role` - Update User Role

**Validation**:
- `adminUserRoleParams` (path params)
- `adminUserRoleBody` (body)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `userId` | string | 24 hex chars (MongoDB ObjectId) | User to update |
| `communityRole` | enum | `admin`, `trader`, `viewer` | New role |

**Example**:
```http
PATCH /api/admin/users/507f1f77bcf86cd799439011/role
Content-Type: application/json

{
  "communityRole": "trader"
}
```

---

### 2. Analytics Routes (`/api/analytics/*`)

**Validator**: `src/validators/analytics.validators.js`

#### GET `/api/analytics/revenue` - Revenue Analytics

**Validation**: `revenueQuery` (query parameters)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `startDate` | string | ISO 8601 date | Start of analysis period |
| `endDate` | string | ISO 8601 date | End of analysis period |

**Date Format**: `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm:ss.sssZ`

**Cross-field Validation**: `startDate` must be ≤ `endDate`

**Example**:
```http
GET /api/analytics/revenue?startDate=2024-01-01&endDate=2024-12-31
```

#### GET `/api/analytics/churn` - Churn Analysis

**Validation**: `churnQuery` (query parameters)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `startDate` | string | ISO 8601 date (REQUIRED) | Start of analysis period |
| `endDate` | string | ISO 8601 date (REQUIRED) | End of analysis period |

**Example**:
```http
GET /api/analytics/churn?startDate=2024-01-01&endDate=2024-03-31
```

#### GET `/api/analytics/churn-risks` - List Churn Risks

**Validation**: `churnRisksQuery` (query parameters)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `minRiskLevel` | number | 0-1 | Minimum risk score threshold |
| `limit` | number | 1-500 | Maximum results |

**Example**:
```http
GET /api/analytics/churn-risks?minRiskLevel=0.7&limit=100
```

#### POST `/api/analytics/churn-risk/calculate` - Calculate Churn Risk

**Validation**: `churnRiskCalculateBody` (body)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `userId` | string | 24 hex chars (MongoDB ObjectId) | User to analyze |

**Example**:
```http
POST /api/analytics/churn-risk/calculate
Content-Type: application/json

{
  "userId": "507f1f77bcf86cd799439011"
}
```

#### GET `/api/analytics/cohorts/retention` - Cohort Retention

**Validation**: `cohortRetentionQuery` (query parameters)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `startDate` | string | ISO 8601 date | Cohort analysis start |
| `endDate` | string | ISO 8601 date | Cohort analysis end |
| `period` | enum | `day`, `week`, `month` | Grouping period |
| `metric` | enum | `retention`, `revenue`, `engagement` | Metric to analyze |

**Example**:
```http
GET /api/analytics/cohorts/retention?startDate=2024-01-01&period=month&metric=retention
```

#### GET `/api/analytics/cohorts/:cohortId` - Cohort Details

**Validation**: `cohortDetailParams` (path params)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `cohortId` | string | 24 hex chars (MongoDB ObjectId) | Cohort to retrieve |

**Example**:
```http
GET /api/analytics/cohorts/507f1f77bcf86cd799439011
```

#### POST `/api/analytics/cohorts/compare` - Compare Cohorts

**Validation**: `cohortCompareBody` (body)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `cohortIds` | array | 2-10 MongoDB ObjectIds | Cohorts to compare |

**Example**:
```http
POST /api/analytics/cohorts/compare
Content-Type: application/json

{
  "cohortIds": [
    "507f1f77bcf86cd799439011",
    "507f191e810c19729de860ea"
  ]
}
```

#### GET `/api/analytics/metrics` - Metrics Export

**Validation**: `metricsExportQuery` (query parameters)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `format` | enum | `json`, `csv`, `prometheus` | Export format |

**Example**:
```http
GET /api/analytics/metrics?format=prometheus
```

#### GET `/api/analytics/metrics/slow-queries` - Slow Queries

**Validation**: `slowQueriesQuery` (query parameters)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `severity` | enum | `low`, `medium`, `high`, `critical` | Filter by severity |

**Example**:
```http
GET /api/analytics/metrics/slow-queries?severity=high
```

#### GET `/api/analytics/alerts` - System Alerts

**Validation**: `alertsQuery` (query parameters)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `limit` | number | 1-1000 | Maximum alerts |
| `severity` | enum | `low`, `medium`, `high`, `critical` | Filter by severity |

**Example**:
```http
GET /api/analytics/alerts?limit=50&severity=critical
```

#### GET `/api/analytics/query-patterns` - Query Patterns

**Validation**: `queryPatternsQuery` (query parameters)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `limit` | number | 1-500 | Maximum patterns |
| `type` | enum | `slow`, `frequent`, `complex` | Pattern type |

**Example**:
```http
GET /api/analytics/query-patterns?limit=20&type=slow
```

---

### 3. Auth Routes (`/api/auth/*`)

**Validator**: `src/validators/auth.validators.js`

#### GET `/api/auth/broker/:broker/authorize` - Broker OAuth Authorization

**Validation**: `brokerAuthorizeParams` (path params)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `broker` | enum | `alpaca`, `ibkr`, `tdameritrade`, `etrade`, `schwab`, `moomoo` | Broker to authorize |

**Example**:
```http
GET /api/auth/broker/alpaca/authorize
```

#### GET `/api/auth/callback` - OAuth Callback (GET)

**Validation**: `oauthCallbackQuery` (query parameters)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `code` | string | 10-512 chars, base64-safe | Authorization code |
| `state` | string | 16-256 chars, alphanumeric + `-_` | CSRF state token |
| `error` | string | optional | OAuth error code |
| `error_description` | string | optional | OAuth error description |

**Example**:
```http
GET /api/auth/callback?code=ABC123DEF456&state=randomstate123456
```

#### POST `/api/auth/callback` - OAuth Callback (POST)

**Validation**: `oauthCallbackBody` (body)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `code` | string | optional | Authorization code |
| `state` | string | optional | CSRF state token |
| `broker` | enum | optional | Broker identifier |

**Example**:
```http
POST /api/auth/callback
Content-Type: application/json

{
  "code": "ABC123DEF456",
  "state": "randomstate123456",
  "broker": "alpaca"
}
```

#### DELETE `/api/auth/brokers/:broker/oauth` - Delete Broker OAuth

**Validation**: `deleteBrokerOAuthParams` (path params)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `broker` | enum | `alpaca`, `ibkr`, `tdameritrade`, `etrade`, `schwab`, `moomoo` | Broker to disconnect |

**Example**:
```http
DELETE /api/auth/brokers/alpaca/oauth
```

#### POST `/api/auth/brokers/:broker/oauth/refresh` - Refresh OAuth Token

**Validation**: `refreshBrokerOAuthParams` (path params)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `broker` | enum | `alpaca`, `ibkr`, `tdameritrade`, `etrade`, `schwab`, `moomoo` | Broker to refresh |

**Example**:
```http
POST /api/auth/brokers/alpaca/oauth/refresh
```

#### POST `/api/auth/mfa/enable` - Enable MFA

**Validation**: `mfaEnableBody` (body)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `token` | string | 6 numeric digits | TOTP verification code |

**Example**:
```http
POST /api/auth/mfa/enable
Content-Type: application/json

{
  "token": "123456"
}
```

#### POST `/api/auth/mfa/disable` - Disable MFA

**Validation**: `mfaDisableBody` (body)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `token` | string | 6 numeric digits | TOTP verification code |

**Example**:
```http
POST /api/auth/mfa/disable
Content-Type: application/json

{
  "token": "123456"
}
```

#### POST `/api/auth/mfa/verify` - Verify MFA Token

**Validation**: `mfaVerifyBody` (body)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `token` | string | 6-digit TOTP OR 24-char hex backup code | Verification token |

**Example (TOTP)**:
```http
POST /api/auth/mfa/verify
Content-Type: application/json

{
  "token": "123456"
}
```

**Example (Backup Code)**:
```http
POST /api/auth/mfa/verify
Content-Type: application/json

{
  "token": "a1b2c3d4e5f67890abcdef12"
}
```

#### POST `/api/auth/mfa/backup-codes/regenerate` - Regenerate Backup Codes

**Validation**: `mfaRegenerateBackupCodesBody` (body)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `token` | string | 6 numeric digits | TOTP verification code |

**Example**:
```http
POST /api/auth/mfa/backup-codes/regenerate
Content-Type: application/json

{
  "token": "123456"
}
```

---

### 4. Broker OAuth Routes (`/api/broker-oauth/*`)

**Validator**: `src/validators/broker-oauth.validators.js`

#### GET `/api/broker-oauth/initiate/:brokerKey` - Initiate OAuth Flow

**Validation**: `initiateOAuthParams` (path params)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `brokerKey` | enum | `alpaca`, `ibkr`, `tdameritrade`, `etrade`, `schwab`, `moomoo` | Broker to initiate |

**Example**:
```http
GET /api/broker-oauth/initiate/alpaca
```

#### GET `/api/broker-oauth/callback/:brokerKey` - OAuth Callback Handler

**Validation**:
- `oauthCallbackParams` (path params)
- `oauthCallbackQuery` (query parameters)

| Parameter | Location | Type | Validation | Description |
|-----------|----------|------|------------|-------------|
| `brokerKey` | path | enum | `alpaca`, `ibkr`, `tdameritrade`, `etrade`, `schwab`, `moomoo` | Broker identifier |
| `code` | query | string | 10-512 chars, base64-safe | Authorization code |
| `state` | query | string | 16-256 chars, alphanumeric + `-_` | CSRF state token |
| `error` | query | string | optional | OAuth error code |
| `error_description` | query | string | optional | OAuth error description |

**Example**:
```http
GET /api/broker-oauth/callback/alpaca?code=ABC123&state=randomstate123456
```

#### POST `/api/broker-oauth/disconnect/:brokerKey` - Disconnect Broker OAuth

**Validation**: `disconnectOAuthParams` (path params)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `brokerKey` | enum | `alpaca`, `ibkr`, `tdameritrade`, `etrade`, `schwab`, `moomoo` | Broker to disconnect |

**Example**:
```http
POST /api/broker-oauth/disconnect/alpaca
```

---

### 5. Brokers Routes (`/api/brokers/*`)

**Validator**: `src/validators/brokers.validators.js`

#### GET `/api/brokers/:brokerKey` - Get Broker Details

**Validation**: `getBrokerParams` (path params)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `brokerKey` | enum | `alpaca`, `ibkr`, `tdameritrade`, `etrade`, `schwab`, `moomoo`, `binance`, `coinbase`, `kraken` | Broker to retrieve |

**Example**:
```http
GET /api/brokers/alpaca
```

#### POST `/api/brokers/test` - Test Broker Connection

**Validation**: `testBrokerBody` (body)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `brokerKey` | enum | See GET endpoint above | Broker to test |
| `credentials.apiKey` | string | 10-512 chars, base64-safe | API key |
| `credentials.apiSecret` | string | 10-512 chars, base64-safe | API secret |
| `credentials.sandbox` | boolean | optional, default false | Use sandbox mode |

**Example**:
```http
POST /api/brokers/test
Content-Type: application/json

{
  "brokerKey": "alpaca",
  "credentials": {
    "apiKey": "AKTEST123456789",
    "apiSecret": "secretkey123456789",
    "sandbox": true
  }
}
```

#### POST `/api/brokers/test/:brokerKey` - Test Specific Broker

**Validation**:
- `testSpecificBrokerParams` (path params)
- `testSpecificBrokerBody` (body)

| Parameter | Location | Type | Validation | Description |
|-----------|----------|------|------------|-------------|
| `brokerKey` | path | enum | See GET endpoint above | Broker to test |
| `credentials.apiKey` | body | string | 10-512 chars, base64-safe | API key |
| `credentials.apiSecret` | body | string | 10-512 chars, base64-safe | API secret |
| `credentials.sandbox` | body | boolean | optional, default false | Use sandbox mode |

**Example**:
```http
POST /api/brokers/test/alpaca
Content-Type: application/json

{
  "credentials": {
    "apiKey": "AKTEST123456789",
    "apiSecret": "secretkey123456789",
    "sandbox": true
  }
}
```

#### POST `/api/brokers/configure` - Configure Broker

**Validation**: `configureBrokerBody` (body)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `brokerKey` | enum | See GET endpoint above | Broker to configure |
| `credentials.apiKey` | string | 10-512 chars, base64-safe | API key |
| `credentials.apiSecret` | string | 10-512 chars, base64-safe | API secret |
| `credentials.sandbox` | boolean | optional, default false | Use sandbox mode |
| `credentials.accountId` | string | optional | Account ID (if required) |
| `nickname` | string | 1-100 chars, optional | Display name |
| `isDefault` | boolean | optional, default false | Set as default broker |

**Example**:
```http
POST /api/brokers/configure
Content-Type: application/json

{
  "brokerKey": "alpaca",
  "credentials": {
    "apiKey": "AKTEST123456789",
    "apiSecret": "secretkey123456789",
    "sandbox": false
  },
  "nickname": "My Alpaca Account",
  "isDefault": true
}
```

#### DELETE `/api/brokers/user/:brokerKey` - Delete User Broker

**Validation**: `deleteUserBrokerParams` (path params)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `brokerKey` | enum | See GET endpoint above | Broker to delete |

**Example**:
```http
DELETE /api/brokers/user/alpaca
```

#### POST `/api/brokers/compare` - Compare Brokers

**Validation**: `compareBrokersBody` (body)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `brokers` | array | 2-5 broker enum values | Brokers to compare |

**Example**:
```http
POST /api/brokers/compare
Content-Type: application/json

{
  "brokers": ["alpaca", "ibkr", "schwab"]
}
```

#### POST `/api/brokers/recommend` - Recommend Broker

**Validation**: `recommendBrokerBody` (body)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `tradingStyle` | enum | `day_trading`, `swing_trading`, `long_term`, `algorithmic` | Trading style |
| `assetTypes` | array | `stocks`, `options`, `crypto`, `forex`, `futures` | Asset types |
| `budget` | number | 0-10,000,000 | Initial budget |
| `experience` | enum | `beginner`, `intermediate`, `advanced` | Experience level |

**Example**:
```http
POST /api/brokers/recommend
Content-Type: application/json

{
  "tradingStyle": "swing_trading",
  "assetTypes": ["stocks", "options"],
  "budget": 10000,
  "experience": "intermediate"
}
```

---

### 6. Exchanges Routes (`/api/exchanges/*`)

**Validator**: `src/validators/exchanges.validators.js`

#### POST `/api/exchanges` - Create Exchange Connection

**Validation**: `createExchangeBody` (body)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `exchange` | enum | `binance`, `coinbase`, `kraken`, `bybit`, `okx`, `bitfinex`, `huobi`, `kucoin`, `gate`, `gemini` | Exchange name |
| `apiKey` | string | 10-512 chars, base64-safe | API key |
| `apiSecret` | string | 10-512 chars, base64-safe | API secret |
| `testnet` | boolean | optional, default false | Use testnet |
| `nickname` | string | 1-100 chars, optional | Display name |

**Example**:
```http
POST /api/exchanges
Content-Type: application/json

{
  "exchange": "binance",
  "apiKey": "BINANCE_API_KEY",
  "apiSecret": "BINANCE_API_SECRET",
  "testnet": false,
  "nickname": "My Binance Account"
}
```

#### DELETE `/api/exchanges/:id` - Delete Exchange Connection

**Validation**: `deleteExchangeParams` (path params)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `id` | string | 24 hex chars (MongoDB ObjectId) | Exchange connection to delete |

**Example**:
```http
DELETE /api/exchanges/507f1f77bcf86cd799439011
```

#### POST `/api/exchanges/:id/validate` - Validate Exchange Connection

**Validation**: `validateExchangeParams` (path params)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `id` | string | 24 hex chars (MongoDB ObjectId) | Exchange connection to validate |

**Example**:
```http
POST /api/exchanges/507f1f77bcf86cd799439011/validate
```

#### PATCH `/api/exchanges/:id/toggle` - Toggle Exchange Active Status

**Validation**: `toggleExchangeParams` (path params)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `id` | string | 24 hex chars (MongoDB ObjectId) | Exchange connection to toggle |

**Example**:
```http
PATCH /api/exchanges/507f1f77bcf86cd799439011/toggle
```

#### POST `/api/exchanges/cache-invalidate` - Invalidate Exchange Cache

**Validation**: `cacheInvalidateBody` (body)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `exchange` | enum | optional, see POST /exchanges | Specific exchange to invalidate |
| `symbol` | string | optional, `BASE/QUOTE` format | Specific symbol to invalidate |

**Example (invalidate all)**:
```http
POST /api/exchanges/cache-invalidate
Content-Type: application/json

{}
```

**Example (specific exchange)**:
```http
POST /api/exchanges/cache-invalidate
Content-Type: application/json

{
  "exchange": "binance",
  "symbol": "BTC/USDT"
}
```

#### GET `/api/exchanges/compare-fees` - Compare Exchange Fees

**Validation**: `compareFeesQuery` (query parameters)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `exchanges` | string | CSV of 2-5 exchange names | Exchanges to compare |
| `symbol` | string | optional, `BASE/QUOTE` format | Trading pair |

**Example**:
```http
GET /api/exchanges/compare-fees?exchanges=binance,coinbase,kraken&symbol=BTC/USDT
```

---

### 7. Metrics Routes (`/api/metrics/*`)

**Validator**: `src/validators/metrics.validators.js`

#### GET `/api/metrics/custom/:name` - Get Custom Metric

**Validation**: `customMetricNameParams` (path params)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `name` | string | 1-100 chars, alphanumeric + `_-` | Metric name |

**Example**:
```http
GET /api/metrics/custom/api_latency_p99
```

#### POST `/api/metrics/custom` - Record Custom Metric

**Validation**: `customMetricRecordBody` (body)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `name` | string | 1-100 chars, alphanumeric + `_-` | Metric name |
| `value` | number | finite (not Infinity/NaN) | Metric value |

**Example**:
```http
POST /api/metrics/custom
Content-Type: application/json

{
  "name": "api_latency_p99",
  "value": 125.5
}
```

---

### 8. Providers Routes (`/api/providers/*`)

**Validator**: `src/validators/providers.validators.js`

#### GET `/api/providers` - List Signal Providers

**Validation**: `providerListQuery` (query parameters)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `limit` | number | 1-100 | Maximum providers to return |
| `minWinRate` | number | 0-100 | Minimum win rate percentage |
| `minTrades` | number | ≥0 | Minimum number of trades |
| `sortBy` | enum | `winRate`, `totalTrades`, `rating`, `followers` | Sort field |

**Example**:
```http
GET /api/providers?limit=20&minWinRate=65&sortBy=winRate
```

#### POST `/api/providers/:providerId/review` - Review Provider

**Validation**:
- `providerIdParams` (path params)
- `providerReviewBody` (body)

| Parameter | Location | Type | Validation | Description |
|-----------|----------|------|------------|-------------|
| `providerId` | path | string | 24 hex chars (MongoDB ObjectId) | Provider to review |
| `rating` | body | number | 1-5 integer | Star rating |
| `comment` | body | string | max 1000 chars, optional | Review text |

**Example**:
```http
POST /api/providers/507f1f77bcf86cd799439011/review
Content-Type: application/json

{
  "rating": 5,
  "comment": "Excellent provider with consistent profits!"
}
```

#### PUT `/api/providers/user/providers/:channelId` - Configure User Provider

**Validation**:
- `channelIdParams` (path params)
- `userProviderConfigBody` (body)

| Parameter | Location | Type | Validation | Description |
|-----------|----------|------|------------|-------------|
| `channelId` | path | string | 17-20 digit Discord channel ID | Channel to configure |
| `enabled` | body | boolean | required | Enable/disable provider |
| `minConfidence` | body | number | 0-1, optional | Minimum confidence threshold |

**Example**:
```http
PUT /api/providers/user/providers/1234567890123456789
Content-Type: application/json

{
  "enabled": true,
  "minConfidence": 0.8
}
```

---

### 9. Risk Management Routes (`/api/risk/*`)

**Validator**: `src/validators/risk.validators.js`

#### PUT `/api/risk/settings` - Update Risk Settings

**Validation**: `updateRiskSettingsBody` (body)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `maxPositionSize` | number | 1-1,000,000 | Maximum position size ($) |
| `maxDailyLoss` | number | 1-1,000,000 | Maximum daily loss ($) |
| `maxDrawdown` | number | 0.1-100 | Maximum drawdown (%) |
| `riskPerTrade` | number | 0.1-100 | Risk per trade (%) |
| `maxOpenPositions` | number | 1-100 integer | Max concurrent positions |
| `stopLossPercent` | number | 0.1-100 | Stop loss (%) |
| `takeProfitPercent` | number | 0.1-1000 | Take profit (%) |
| `useTrailingStop` | boolean | optional | Enable trailing stop |
| `trailingStopPercent` | number | 0.1-100 | Trailing stop (%) |
| `riskRewardRatio` | number | 0.1-10 | Risk/reward ratio |

**Example**:
```http
PUT /api/risk/settings
Content-Type: application/json

{
  "maxPositionSize": 10000,
  "maxDailyLoss": 500,
  "riskPerTrade": 2,
  "maxOpenPositions": 5,
  "stopLossPercent": 2,
  "takeProfitPercent": 6,
  "useTrailingStop": true,
  "trailingStopPercent": 1.5,
  "riskRewardRatio": 3
}
```

#### POST `/api/risk/calculate-position` - Calculate Position Size

**Validation**: `calculatePositionBody` (body)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `symbol` | string | `BASE/QUOTE` format | Trading pair |
| `entryPrice` | number | positive | Entry price |
| `stopLoss` | number | positive | Stop loss price |
| `accountBalance` | number | positive, optional | Account balance |
| `riskPercent` | number | 0.1-100, optional | Risk percentage |

**Example**:
```http
POST /api/risk/calculate-position
Content-Type: application/json

{
  "symbol": "BTC/USDT",
  "entryPrice": 50000,
  "stopLoss": 49000,
  "accountBalance": 10000,
  "riskPercent": 2
}
```

---

### 10. Trader Routes (`/api/trader/*`)

**Validator**: `src/validators/trader.validators.js`

#### POST `/api/trader/signals/:id/follow` - Follow Signal

**Validation**:
- `followSignalParams` (path params)
- `followSignalBody` (body)

| Parameter | Location | Type | Validation | Description |
|-----------|----------|------|------------|-------------|
| `id` | path | string | 24 hex chars (MongoDB ObjectId) | Signal to follow |
| `autoTrade` | body | boolean | optional, default false | Enable auto-trading |
| `positionSizePercent` | body | number | 0.1-100, default 5 | Position size (%) |
| `maxRiskPercent` | body | number | 0.1-100, default 2 | Max risk (%) |
| `stopLossPercent` | body | number | 0.1-100, optional | Stop loss (%) |
| `takeProfitPercent` | body | number | 0.1-1000, optional | Take profit (%) |

**Example**:
```http
POST /api/trader/signals/507f1f77bcf86cd799439011/follow
Content-Type: application/json

{
  "autoTrade": true,
  "positionSizePercent": 10,
  "maxRiskPercent": 2,
  "stopLossPercent": 2,
  "takeProfitPercent": 6
}
```

#### GET `/api/trader/overview` - Trader Overview

**Validation**: `overviewQuery` (query parameters)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `timeframe` | enum | `24h`, `7d`, `30d`, `90d`, `ytd`, `all` (default `30d`) | Analysis timeframe |

**Example**:
```http
GET /api/trader/overview?timeframe=7d
```

#### GET `/api/trader/signals` - Get Signals

**Validation**: `signalsQuery` (query parameters)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `status` | enum | `active`, `closed`, `pending`, `all` (default `active`) | Signal status |
| `provider` | string | optional | Filter by provider |
| `limit` | number | 1-100, default 50 | Max results |
| `offset` | number | ≥0, default 0 | Pagination offset |
| `sortBy` | enum | `createdAt`, `profitLoss`, `winRate` (default `createdAt`) | Sort field |
| `sortOrder` | enum | `asc`, `desc` (default `desc`) | Sort order |

**Example**:
```http
GET /api/trader/signals?status=active&limit=20&sortBy=profitLoss&sortOrder=desc
```

#### GET `/api/trader/trades` - Get Trades

**Validation**: `tradesQuery` (query parameters)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `status` | enum | `open`, `closed`, `pending`, `cancelled`, `all` (default `all`) | Trade status |
| `symbol` | string | optional | Filter by symbol |
| `broker` | string | optional | Filter by broker |
| `startDate` | date | optional | Start date filter |
| `endDate` | date | optional | End date filter |
| `limit` | number | 1-100, default 50 | Max results |
| `offset` | number | ≥0, default 0 | Pagination offset |

**Example**:
```http
GET /api/trader/trades?status=closed&startDate=2024-01-01&endDate=2024-12-31&limit=100
```

#### GET `/api/trader/analytics/performance` - Performance Analytics

**Validation**: `analyticsPerformanceQuery` (query parameters)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `timeframe` | enum | `24h`, `7d`, `30d`, `90d`, `ytd`, `all` (default `30d`) | Analysis timeframe |
| `groupBy` | enum | `day`, `week`, `month` (default `day`) | Group results by |
| `broker` | string | optional | Filter by broker |
| `symbol` | string | optional | Filter by symbol |

**Example**:
```http
GET /api/trader/analytics/performance?timeframe=90d&groupBy=week
```

#### PUT `/api/trader/risk-profile` - Update Risk Profile

**Validation**: `updateRiskProfileBody` (body)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `maxPositionSize` | number | 1-1,000,000 | Max position size ($) |
| `maxDailyLoss` | number | 1-1,000,000 | Max daily loss ($) |
| `maxDrawdown` | number | 0.1-100 | Max drawdown (%) |
| `riskPerTrade` | number | 0.1-100 | Risk per trade (%) |
| `maxOpenPositions` | number | 1-100 integer | Max concurrent positions |
| `stopLossPercent` | number | 0.1-100 | Stop loss (%) |
| `takeProfitPercent` | number | 0.1-1000 | Take profit (%) |
| `useTrailingStop` | boolean | optional | Enable trailing stop |
| `trailingStopPercent` | number | 0.1-100 | Trailing stop (%) |

**Example**:
```http
PUT /api/trader/risk-profile
Content-Type: application/json

{
  "maxPositionSize": 5000,
  "riskPerTrade": 1.5,
  "maxOpenPositions": 3,
  "stopLossPercent": 2,
  "takeProfitPercent": 4,
  "useTrailingStop": true,
  "trailingStopPercent": 1
}
```

#### PUT `/api/trader/notifications` - Update Notification Settings

**Validation**: `updateNotificationsBody` (body)

| Parameter | Type | Validation | Description |
|-----------|------|------------|-------------|
| `email.enabled` | boolean | required | Enable email notifications |
| `email.tradeExecuted` | boolean | optional | Trade execution emails |
| `email.riskAlert` | boolean | optional | Risk alert emails |
| `email.dailySummary` | boolean | optional | Daily summary emails |
| `discord.enabled` | boolean | required | Enable Discord notifications |
| `discord.webhookUrl` | string | URL format, optional | Discord webhook URL |
| `discord.tradeExecuted` | boolean | optional | Trade execution notifications |
| `discord.riskAlert` | boolean | optional | Risk alert notifications |
| `push.enabled` | boolean | required | Enable push notifications |
| `push.tradeExecuted` | boolean | optional | Trade execution push |
| `push.riskAlert` | boolean | optional | Risk alert push |

**Example**:
```http
PUT /api/trader/notifications
Content-Type: application/json

{
  "email": {
    "enabled": true,
    "tradeExecuted": true,
    "riskAlert": true,
    "dailySummary": true
  },
  "discord": {
    "enabled": true,
    "webhookUrl": "https://discord.com/api/webhooks/...",
    "tradeExecuted": true,
    "riskAlert": true
  },
  "push": {
    "enabled": false
  }
}
```

---

## Common Validation Patterns

### 1. MongoDB ObjectId Format

**Pattern**: 24 hexadecimal characters

**Zod Schema**:
```javascript
z.string()
  .length(24, 'ID must be 24 characters')
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid MongoDB ObjectId format')
```

**Valid**: `507f1f77bcf86cd799439011`
**Invalid**: `123`, `invalid-id`, `507f1f77bcf86cd79943901g`

### 2. Trading Symbol Format

**Pattern**: `BASE/QUOTE` (2-10 alphanumeric characters each side)

**Zod Schema**:
```javascript
z.string()
  .regex(/^[A-Z0-9]{2,10}\/[A-Z0-9]{2,10}$/, 'Invalid symbol format. Expected: BASE/QUOTE')
```

**Valid**: `BTC/USDT`, `ETH/USD`, `AAPL/USD`
**Invalid**: `BTCUSDT`, `BTC-USDT`, `btc/usdt`, `B/U`

### 3. ISO 8601 Date Format

**Pattern**: `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm:ss.sssZ`

**Zod Schema**:
```javascript
z.string()
  .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)?$/, 'Invalid date format. Use ISO 8601')
```

**Valid**: `2024-01-01`, `2024-01-01T12:30:00.000Z`
**Invalid**: `01/01/2024`, `2024-1-1`, `2024-01-01 12:30:00`

### 4. API Key/Secret Format

**Pattern**: Base64-safe characters (alphanumeric + `-_=+/`)

**Zod Schema**:
```javascript
z.string()
  .min(10, 'API key must be at least 10 characters')
  .max(512, 'API key too long')
  .regex(/^[a-zA-Z0-9\-_=+/]+$/, 'API key contains invalid characters')
```

**Valid**: `AKTEST123456789`, `abc123-XYZ_456+789/==`
**Invalid**: `key with spaces`, `key@special!chars`, `short`

### 5. Discord ID Format

**Pattern**: 17-20 digit numeric string (Snowflake ID)

**Zod Schema**:
```javascript
// For channel IDs
z.string()
  .regex(/^\d{17,20}$/, 'Invalid Discord channel ID format (17-20 digits)')

// For user IDs (in middleware)
z.string()
  .regex(/^\d{17,19}$/, 'Invalid Discord ID format')
```

**Valid**: `1234567890123456789`, `123456789012345678`
**Invalid**: `123`, `abc123`, `12345678901234567890123`

### 6. Percentage Values

**Pattern**: Decimal number 0-100 (or 0-1 for decimal representation)

**Zod Schema (0-100%)**:
```javascript
z.number()
  .min(0.1, 'Percentage must be at least 0.1%')
  .max(100, 'Percentage cannot exceed 100%')
```

**Zod Schema (0-1 decimal)**:
```javascript
z.number()
  .min(0, 'Value must be at least 0')
  .max(1, 'Value must be at most 1')
```

**Valid**: `2.5`, `50`, `0.1`, `100`
**Invalid**: `-5`, `150`, `0`

### 7. Pagination Parameters

**Pattern**: Positive integers with upper bounds

**Zod Schema**:
```javascript
z.string()
  .regex(/^\d+$/, 'Must be a positive integer')
  .transform(Number)
  .refine(n => n >= 1 && n <= 100, 'Must be between 1 and 100')
  .optional()
```

**Valid**: `"1"`, `"20"`, `"100"`
**Invalid**: `"0"`, `"-1"`, `"101"`, `"abc"`

### 8. Enum Values

**Pattern**: Fixed set of allowed string values

**Zod Schema**:
```javascript
z.enum(['value1', 'value2', 'value3'], {
  errorMap: () => ({ message: 'Invalid value. Must be: value1, value2, or value3' })
})
```

**Valid**: `"value1"`, `"value2"`, `"value3"`
**Invalid**: `"value4"`, `"VALUE1"`, `""`

---

## Testing Security Validation

### Test File

**Location**: `tests/integration/security/prototype-pollution.test.js`

### Test Coverage

**50 test cases** covering:

1. **`__proto__` Pollution Attempts** (13 tests)
   - Top-level `__proto__` in request body
   - Nested `__proto__` in request body
   - `__proto__` in query parameters
   - Deeply nested `__proto__` (3+ levels)

2. **`constructor` Pollution Attempts** (10 tests)
   - Top-level `constructor` in request body
   - Nested `constructor` in request body
   - `constructor` in route params
   - `constructor.prototype` chains

3. **`prototype` Pollution Attempts** (10 tests)
   - Top-level `prototype` in request body
   - Nested `prototype` in request body
   - `prototype` in route params

4. **Combined Attack Vectors** (5 tests)
   - Multiple pollution keys in single request
   - All three dangerous keys in nested structure

5. **Admin Routes Protection** (3 tests)
   - Admin user query params
   - Admin role update body

6. **Analytics Routes Protection** (2 tests)
   - Revenue query parameters
   - Cohort comparison body

7. **Safe Properties Pass Through** (7 tests)
   - Legitimate property names allowed
   - Nested safe properties allowed
   - Similar-named properties allowed (`proto`, `construct`, `prototypical`)
   - Properties are NOT rejected if safe

### Running Tests

```bash
# Run prototype pollution tests
npm test -- tests/integration/security/prototype-pollution.test.js

# Expected output: Tests: 0 skipped, 50 passed, 50 total
```

### Example Test Case

```javascript
it('should reject __proto__ in request body with PROTOTYPE_POLLUTION_DETECTED', async () => {
  const res = await request(app)
    .post('/api/providers/test-provider/review')
    .set('Cookie', authCookie)
    .send({
      rating: 5,
      comment: 'Great provider!',
      __proto__: {
        isAdmin: true
      }
    })
    .expect(400);

  expect(res.body.success).toBe(false);
  expect(res.body.error).toBe('Security validation failed');
  expect(res.body.code).toBe('PROTOTYPE_POLLUTION_DETECTED');
  expect(res.body.details[0].field).toBe('__proto__');
  expect(res.body.details[0].message).toContain('Dangerous key');
});
```

### Routes Tested

The prototype pollution tests validate protection on:
- `/api/analytics/revenue` (query params)
- `/api/analytics/churn` (query params)
- `/api/analytics/cohorts/compare` (body)
- `/api/providers/:providerId/review` (body)
- `/api/metrics/custom` (body)
- `/api/metrics/custom/:name` (path params)
- `/api/admin/users` (query params)
- `/api/admin/users/:userId/role` (body)

---

## Summary

**Total Validated Route Domains**: 10
- Admin (2 endpoints)
- Analytics (11 endpoints)
- Auth (9 endpoints)
- Broker OAuth (3 endpoints)
- Brokers (8 endpoints)
- Exchanges (6 endpoints)
- Metrics (2 endpoints)
- Providers (3 endpoints)
- Risk Management (2 endpoints)
- Trader (8 endpoints)

**Total Validated Endpoints**: 54+

**Security Features**:
- ✅ Prototype pollution prevention (recursive detection)
- ✅ Input sanitization (XSS, SQL injection, null bytes)
- ✅ Type safety (Zod schemas)
- ✅ Format validation (regex patterns)
- ✅ Range constraints (min/max values)
- ✅ Length limits (DoS prevention)
- ✅ MongoDB injection prevention (`$` operator filtering)
- ✅ Cross-field validation (date ranges, etc.)
- ✅ Comprehensive test coverage (50+ security tests)

**Validation Middleware**: `src/middleware/validation.js`
**Validator Files**: `src/validators/*.validators.js` (10 files)
**Test Coverage**: `tests/integration/security/prototype-pollution.test.js`

---

**Document Version**: 1.0
**Last Updated**: 2025-10-27
**Completion**: US7-T09 ✅
