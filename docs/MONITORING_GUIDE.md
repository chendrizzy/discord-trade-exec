# Performance Monitoring Guide

**Version**: 1.0
**Last Updated**: 2025-10-28
**Status**: Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Metrics Endpoints](#metrics-endpoints)
3. [Alert Configuration](#alert-configuration)
4. [Query Pattern Analysis](#query-pattern-analysis)
5. [Authentication](#authentication)
6. [Troubleshooting](#troubleshooting)
7. [Best Practices](#best-practices)

---

## Overview

Discord Trade Executor includes comprehensive performance monitoring and alerting capabilities to ensure optimal system health and early detection of performance degradation.

### Key Features

- **HTTP Response Time Tracking**: p50/p95/p99 percentiles with 1-hour rolling window
- **Database Query Monitoring**: Slow query detection and pattern analysis
- **Automated Alerting**: Slack/Discord notifications for performance issues
- **Prometheus Export**: Metrics in industry-standard format
- **Admin-Only Access**: All metrics endpoints require admin authentication

### Monitoring Architecture

```
┌─────────────────┐
│  Application    │
│   Middleware    │
└────────┬────────┘
         │
         ├──► Response Time Tracker ──► /api/metrics/performance
         │
         ├──► Query Logger ──────────► /api/metrics/queries
         │
         └──► Alerts Service ────────► Slack/Discord Webhooks
```

---

## Metrics Endpoints

All metrics endpoints require admin authentication via JWT Bearer token. See [Authentication](#authentication) section for details.

### 1. HTTP Performance Metrics

**Endpoint**: `GET /api/metrics/performance`
**Auth**: Admin JWT required
**Description**: Returns HTTP response time statistics

**Response Format**:
```json
{
  "success": true,
  "metrics": {
    "p50": 45.2,
    "p95": 123.7,
    "p99": 287.3,
    "count": 1542,
    "window": "1h"
  },
  "timestamp": "2025-10-28T06:45:00.000Z"
}
```

**Fields**:
- `p50`: 50th percentile response time in milliseconds (median)
- `p95`: 95th percentile response time in milliseconds
- `p99`: 99th percentile response time in milliseconds
- `count`: Total number of requests in the time window
- `window`: Time window for statistics (1 hour rolling)

**Usage Example**:
```bash
curl -H "Authorization: Bearer YOUR_ADMIN_JWT" \
  https://your-domain.com/api/metrics/performance
```

---

### 2. Database Query Metrics

**Endpoint**: `GET /api/metrics/queries`
**Auth**: Admin JWT required
**Description**: Returns slow query patterns and optimization recommendations

**Response Format**:
```json
{
  "success": true,
  "data": {
    "slowest": [
      {
        "queryType": "aggregate",
        "paramStructure": "{pipeline:<array>}",
        "count": 45,
        "avgTime": 3542.7,
        "maxTime": 5823.1,
        "avgResultSize": 1200,
        "collection": "signals",
        "recommendation": "Consider adding compound index on (timestamp, signalProviderId). Result set averaging 1200 items - implement pagination with limit 100."
      }
    ],
    "frequent": [
      {
        "queryType": "find",
        "paramStructure": "{userId:<value>}",
        "count": 1823,
        "avgTime": 45.2,
        "cacheHitRate": 0.0,
        "collection": "users"
      }
    ],
    "summary": {
      "totalSlowPatterns": 12,
      "criticalPatterns": 3,
      "needsCaching": 8
    }
  },
  "timestamp": "2025-10-28T06:45:00.000Z"
}
```

**Fields**:

**Slowest Patterns** (top 20 by average execution time):
- `queryType`: Type of MongoDB operation (find, aggregate, update, etc.)
- `paramStructure`: Anonymized query parameter structure
- `count`: Number of times this pattern was executed
- `avgTime`: Average execution time in milliseconds
- `maxTime`: Maximum execution time observed
- `avgResultSize`: Average number of documents returned
- `collection`: MongoDB collection name
- `recommendation`: Optimization suggestions (indexing, caching, pagination)

**Frequent Patterns** (top 50 by execution count):
- `queryType`: Type of MongoDB operation
- `paramStructure`: Anonymized query parameter structure
- `count`: Number of times this pattern was executed
- `avgTime`: Average execution time in milliseconds
- `cacheHitRate`: Cache effectiveness (0.0 = no caching, 1.0 = always cached)
- `collection`: MongoDB collection name

**Summary Statistics**:
- `totalSlowPatterns`: Total number of slow patterns detected
- `criticalPatterns`: Patterns with avgTime > 5000ms (needs immediate attention)
- `needsCaching`: Patterns where Redis caching is recommended

**Usage Example**:
```bash
curl -H "Authorization: Bearer YOUR_ADMIN_JWT" \
  https://your-domain.com/api/metrics/queries
```

---

### 3. Prometheus Export

**Endpoint**: `GET /api/metrics/export`
**Auth**: Admin JWT required
**Description**: Exports all metrics in Prometheus format for scraping

**Response Format**:
```
# HELP Performance metrics for Discord Trade Executor
# TYPE discord_trade_executor metrics

discord_webhooks_total 1523
discord_webhooks_successful 1487
discord_webhooks_failed 36
discord_webhooks_success_rate 0.976
discord_webhooks_response_time_avg 142.3
discord_webhooks_response_time_p50 120.5
discord_webhooks_response_time_p95 287.2
discord_webhooks_response_time_p99 512.7

discord_trades_total 843
discord_trades_successful 819
discord_trades_failed 24
discord_trades_success_rate 0.972
discord_trades_execution_time_avg 234.5
discord_trades_execution_time_p95 487.3

discord_database_queries_total 15234
discord_database_queries_successful 15187
discord_database_queries_failed 47
discord_database_query_time_avg 45.7
discord_database_query_time_p95 142.3

discord_system_uptime_seconds 3456789
discord_system_memory_rss 245678912
discord_system_memory_heap_used 189234567
discord_system_cpu_user_percent 12.4
discord_system_cpu_system_percent 5.2
discord_system_active_requests 8
```

**Usage with Prometheus**:

Add to `prometheus.yml`:
```yaml
scrape_configs:
  - job_name: 'discord-trade-executor'
    scheme: https
    authorization:
      credentials: 'YOUR_ADMIN_JWT_HERE'
    static_configs:
      - targets: ['your-domain.com']
    metrics_path: '/api/metrics/export'
    scrape_interval: 30s
```

---

## Alert Configuration

The application automatically sends alerts to Slack/Discord when performance issues are detected.

### Alert Triggers

**1. Slow Query Alert**
- **Condition**: Query pattern avgTime > 2000ms AND executed >= 5 times
- **Frequency**: Maximum once per pattern per 5 minutes (deduplication)
- **Destination**: Slack #alerts channel or Discord webhook

**Alert Example** (Slack):
```
🐌 Slow Database Query Detected

Query Type: aggregate
Collection: signals
Executions: 45
Avg Time: 3542.7ms
Max Time: 5823.1ms

Recommendation:
Consider adding compound index on (timestamp, signalProviderId).
Result set averaging 1200 items - implement pagination with limit 100.

Time: 2025-10-28 06:45:23
Environment: production
```

**Alert Example** (Discord):
```json
{
  "embeds": [{
    "title": "🐌 Slow Database Query Detected",
    "color": 16744192,
    "fields": [
      {"name": "Query Type", "value": "aggregate", "inline": true},
      {"name": "Collection", "value": "signals", "inline": true},
      {"name": "Executions", "value": "45", "inline": true},
      {"name": "Avg Time", "value": "3542.7ms", "inline": true},
      {"name": "Max Time", "value": "5823.1ms", "inline": true},
      {"name": "Recommendation", "value": "Consider adding compound index..."}
    ],
    "timestamp": "2025-10-28T06:45:23.000Z"
  }]
}
```

**2. HTTP Performance Alert** (Grafana configured)
- **Condition**: p95 response time > 200ms for 5 consecutive minutes
- **Action**: Grafana alert to configured notification channels

### Environment Variables

Configure alert destinations in `.env`:

```bash
# Slack Alerts (Primary)
SLACK_ALERTS_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# Discord Alerts (Fallback)
DISCORD_ERROR_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR/WEBHOOK/URL

# Alert Configuration
ALERT_MIN_EXECUTIONS=5           # Minimum query executions before alerting
ALERT_SLOW_THRESHOLD_MS=2000     # Slow query threshold in milliseconds
ALERT_COOLDOWN_MINUTES=5         # Minimum time between duplicate alerts
```

### Testing Alerts

To test alert delivery:

```javascript
// In Node.js REPL or test file
const { getAlertsService } = require('./src/utils/alerts');

const alertsService = getAlertsService();

// Test slow query alert
alertsService.sendSlowQueryAlert({
  queryType: 'test',
  collection: 'test_collection',
  avgTime: 3000,
  maxTime: 5000,
  count: 10,
  paramStructure: '{test:<value>}',
  recommendation: 'This is a test alert'
}).then(() => {
  console.log('Test alert sent successfully');
}).catch(err => {
  console.error('Alert failed:', err);
});
```

---

## Query Pattern Analysis

The query logger automatically analyzes all database queries and provides actionable optimization recommendations.

### Optimization Recommendations

**1. Indexing Recommendations**
```javascript
"Consider adding index on (userId, status, timestamp) for better performance."
```
- **Trigger**: Query with multiple filter fields
- **Action**: Create compound index matching query pattern

**2. Caching Recommendations**
```javascript
"Frequent query (1823 executions) - consider Redis caching with 5-minute TTL."
```
- **Trigger**: Query executed > 1000 times with avgTime > 50ms
- **Action**: Implement Redis caching layer

**3. Pagination Recommendations**
```javascript
"Result set averaging 1200 items - implement pagination with limit 100."
```
- **Trigger**: avgResultSize > 1000 documents
- **Action**: Add pagination with cursor-based or offset-based approach

**4. Query Rewrite Recommendations**
```javascript
"N+1 query pattern detected - use aggregation with $lookup instead."
```
- **Trigger**: Similar queries with slight parameter variations
- **Action**: Consolidate into single aggregation pipeline

### Interpreting Query Patterns

**Parameter Structure Format**:
- `{userId:<value>}` - Filters by specific userId
- `{status:"active"}` - Filters by status field with value "active"
- `{pipeline:<array>}` - Aggregation pipeline (array parameter)
- `{$or:<array>}` - OR condition with multiple clauses

**Query Types**:
- `find`: Document retrieval
- `findOne`: Single document retrieval
- `aggregate`: Aggregation pipeline
- `updateOne`: Single document update
- `updateMany`: Bulk document update
- `deleteOne`: Single document deletion
- `countDocuments`: Count matching documents

---

## Authentication

All metrics endpoints require admin authentication using JWT Bearer tokens.

### Generating Admin JWT

**Prerequisites**:
- User account with `isAdmin: true` in database

**Generate Token** (via existing auth endpoint):
```bash
# 1. Login to get session token
curl -X POST https://your-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"your_password"}'

# Response includes JWT token
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {...}
}
```

**Using the Token**:
```bash
# Add Authorization header to all metrics requests
curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  https://your-domain.com/api/metrics/performance
```

### JWT Middleware (`ensureAdminJWT`)

Located in: `src/middleware/jwtAdmin.js`

**Features**:
- Validates JWT signature using `JWT_SECRET` environment variable
- Checks token expiration
- Verifies user exists in database
- Confirms `user.isAdmin === true`
- Returns detailed error messages for debugging

**Error Responses**:

**Missing Authorization Header** (401):
```json
{
  "success": false,
  "error": "Authentication required",
  "message": "Authorization header missing"
}
```

**Invalid Token Format** (401):
```json
{
  "success": false,
  "error": "Invalid authorization header format",
  "message": "Expected: Bearer <token>"
}
```

**Expired Token** (401):
```json
{
  "success": false,
  "error": "Token has expired",
  "expiredAt": "2025-10-28T06:00:00.000Z"
}
```

**Non-Admin User** (403):
```json
{
  "success": false,
  "error": "Forbidden",
  "message": "Admin privileges required"
}
```

---

## Troubleshooting

### Common Issues

#### 1. "Authorization header missing" (401)

**Problem**: Request doesn't include Bearer token

**Solution**:
```bash
# ❌ Missing header
curl https://your-domain.com/api/metrics/performance

# ✅ Include Authorization header
curl -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  https://your-domain.com/api/metrics/performance
```

---

#### 2. "Admin privileges required" (403)

**Problem**: User account doesn't have admin role

**Solution**: Update user in MongoDB:
```javascript
db.users.updateOne(
  { email: "admin@example.com" },
  { $set: { isAdmin: true } }
);
```

---

#### 3. Empty Metrics Response

**Problem**: No data collected yet

**Solution**: Wait for data collection (1-hour window)
- Performance metrics: Collected on every HTTP request
- Query metrics: Collected on every database operation >100ms

**Check if middleware is active**:
```bash
# Make some test requests
curl https://your-domain.com/api/health

# Check metrics (should see request count)
curl -H "Authorization: Bearer TOKEN" \
  https://your-domain.com/api/metrics/performance
```

---

#### 4. No Slow Query Alerts

**Problem**: Alerts not being sent despite slow queries

**Checklist**:
- [ ] `SLACK_ALERTS_WEBHOOK_URL` or `DISCORD_ERROR_WEBHOOK_URL` configured in `.env`
- [ ] Query pattern executed >= 5 times (minimum threshold)
- [ ] Query avgTime > 2000ms (slow threshold)
- [ ] Not in cooldown period (5 minutes since last alert for same pattern)
- [ ] Application in production mode (`NODE_ENV=production`)

**Debug logging**:
```bash
# Enable debug logging
DEBUG=alerts:* npm start

# Watch for alert processing
tail -f logs/combined.log | grep "alert"
```

---

#### 5. Prometheus Scrape Failures

**Problem**: Prometheus can't scrape metrics endpoint

**Common Causes**:
- Missing or invalid JWT token in Prometheus config
- Network connectivity issues
- Application not running or unhealthy

**Solution**:
```yaml
# Verify Prometheus config
scrape_configs:
  - job_name: 'discord-trade-executor'
    authorization:
      credentials: 'VALID_ADMIN_JWT_HERE'  # Must be valid JWT
    static_configs:
      - targets: ['correct-hostname:port']
    metrics_path: '/api/metrics/export'
```

**Test manually**:
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://your-domain.com/api/metrics/export
```

---

#### 6. High Memory Usage from Metrics

**Problem**: Performance tracking consuming too much memory

**Understanding Memory Usage**:
- Response time tracking: ~100KB per 10,000 requests (1-hour window)
- Query pattern tracking: ~50KB per 1,000 unique patterns
- Total expected: < 5MB for typical production load

**If memory is excessive**:
1. Check for memory leaks in application code (not metrics system)
2. Verify automatic cleanup is running (every 5 minutes)
3. Consider reducing retention window in `src/middleware/performance-tracker.js`

```javascript
// Default: 1 hour
this.RETENTION_WINDOW = 60 * 60 * 1000;

// Reduce to 30 minutes if needed
this.RETENTION_WINDOW = 30 * 60 * 1000;
```

---

## Best Practices

### For Developers

**1. Monitor During Development**
```bash
# Run with monitoring enabled
npm run dev

# In separate terminal, watch metrics
watch -n 5 'curl -H "Authorization: Bearer TOKEN" \
  http://localhost:3000/api/metrics/queries | jq ".data.summary"'
```

**2. Set Up Local Alerts**
```bash
# Create local webhook testing endpoint
npm install -g webhook-test

# Point alerts to local endpoint
SLACK_ALERTS_WEBHOOK_URL=http://localhost:8080/webhook npm run dev
```

**3. Performance Testing**
```bash
# Load test with monitoring
npm run test:performance

# Check metrics after test
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:3000/api/metrics/performance
```

---

### For Operations

**1. Regular Health Checks**

Create monitoring script (`scripts/monitor-health.sh`):
```bash
#!/bin/bash

TOKEN="your_admin_jwt_here"
API="https://your-domain.com"

# Check performance metrics
P95=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "$API/api/metrics/performance" | jq -r '.metrics.p95')

if (( $(echo "$P95 > 200" | bc -l) )); then
  echo "ALERT: p95 response time is ${P95}ms (threshold: 200ms)"
  # Send alert to PagerDuty/OpsGenie
fi

# Check for critical slow queries
CRITICAL=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "$API/api/metrics/queries" | jq -r '.data.summary.criticalPatterns')

if [ "$CRITICAL" -gt 0 ]; then
  echo "ALERT: $CRITICAL critical query patterns detected"
  # Send alert to PagerDuty/OpsGenie
fi
```

**2. Grafana Dashboard Setup**

See: `docs/monitoring/RAILWAY_MONITORING_SETUP.md`

**Key Panels**:
- HTTP Response Time (p50/p95/p99)
- Database Query Performance
- System Resources (CPU, Memory)
- Success/Failure Rates
- Alert History

**3. Alert Escalation**

Configure alert routing:
```
Slow Query (avgTime 2000-5000ms)
  └─► Slack #alerts (INFO)

Critical Query (avgTime >5000ms)
  └─► Slack #alerts + PagerDuty (WARNING)

HTTP Performance Degradation (p95 >200ms for 5 min)
  └─► PagerDuty (CRITICAL)
```

**4. Regular Metric Reviews**

**Daily**:
- Check Grafana dashboard
- Review critical alerts from previous 24h
- Verify no new slow query patterns

**Weekly**:
- Analyze top 20 slowest queries
- Implement optimizations for queries >1000ms
- Review cache hit rates

**Monthly**:
- Full performance audit
- Update alert thresholds based on trends
- Document optimization improvements

---

## Additional Resources

- **Grafana Dashboard**: `docs/monitoring/grafana-dashboard.json`
- **Railway Setup**: `docs/monitoring/RAILWAY_MONITORING_SETUP.md`
- **Query Optimization**: `docs/QUERY_OPTIMIZATION_GUIDE.md`
- **Security Validation**: `docs/SECURITY_VALIDATION.md`

---

## Support

For issues or questions:
- Check [Troubleshooting](#troubleshooting) section first
- Review application logs: `logs/combined.log`
- Open GitHub issue with:
  - Environment details (NODE_ENV, versions)
  - Error messages with correlation IDs
  - Steps to reproduce
  - Relevant log excerpts

---

**Document Version**: 1.0
**Covers**: US6-T12 (Excellence Remediation)
**Related Tasks**: US6-T01 through US6-T11
