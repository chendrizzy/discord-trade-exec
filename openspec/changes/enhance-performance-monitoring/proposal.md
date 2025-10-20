# Proposal: Enhance Performance Monitoring

## Summary

Implement comprehensive Application Performance Monitoring (APM) and observability stack to proactively monitor system health, detect performance bottlenecks, and alert on issues before users are affected. Integrate APM platform (New Relic/Datadog), custom metrics, alerting thresholds, and performance dashboards.

## Motivation

### Current State: Reactive Monitoring
- Basic logging with Winston (console logs)
- No centralized performance metrics
- No proactive alerting on slowdowns or errors
- Manual log inspection required for debugging
- **No visibility into production performance until users complain**

### Problems with Current Approach
1. **Reactive Problem Discovery**: Issues found by users, not monitoring systems
2. **No Performance Baselines**: Cannot measure if code changes improve/degrade performance
3. **Limited Debugging Context**: Logs lack request tracing, correlation IDs
4. **No Anomaly Detection**: Cannot detect gradual performance degradation
5. **Compliance Gap**: SLA monitoring requires metrics (e.g., "99.9% uptime")

### Desired State: Proactive Observability
- **APM Platform**: New Relic or Datadog integrated
- **Custom Metrics**: Trade execution latency, signal parsing success rate, API call durations
- **Alerting**: Automated alerts on error rate spikes, slow responses, downtime
- **Dashboards**: Real-time visibility into system health, request throughput, error rates
- **Distributed Tracing**: Follow requests across microservices (Discord bot → backend → broker)

### Benefits
1. **Proactive Issue Detection**: Alerts fire before users experience problems
2. **Faster Debugging**: Distributed tracing shows exactly where bottlenecks occur
3. **Performance Optimization**: Baseline metrics enable data-driven optimization
4. **SLA Compliance**: Measure and enforce uptime/performance SLAs
5. **Business Insights**: Trade execution metrics inform product decisions

## Scope

### In Scope
- ✅ APM platform integration (New Relic or Datadog)
- ✅ Automatic instrumentation (Express routes, database queries, external APIs)
- ✅ Custom metrics (trade execution latency, signal parsing rate, WebSocket connections)
- ✅ Error tracking (exception capture, stack traces, context)
- ✅ Alerting rules (error rate >1%, response time >2s, downtime)
- ✅ Performance dashboards (system health, request throughput, database query performance)
- ✅ Distributed tracing (request correlation across services)
- ✅ Log aggregation (centralize Winston logs in APM platform)

### Out of Scope
- ❌ Custom APM solution (use established platform, not build from scratch)
- ❌ Real User Monitoring (RUM) for frontend (backend focus initially)
- ❌ Synthetic monitoring (uptime checks from external locations, separate tool)
- ❌ Cost optimization (focus on implementation, optimize pricing later)

## Technical Approach

### 1. APM Platform Selection

**Option A: New Relic (Recommended)**
- **Pros**: Free tier (100GB/month data ingestion), excellent Node.js support, auto-instrumentation
- **Cons**: Pricing scales with data volume
- **Use Case**: Startups, scalable pricing

**Option B: Datadog**
- **Pros**: Comprehensive monitoring (APM + infrastructure + logs), strong integrations
- **Cons**: More expensive than New Relic
- **Use Case**: Enterprises, unified monitoring platform

**Recommendation**: Start with **New Relic** for free tier, migrate to Datadog if needed.

### 2. New Relic Integration

**Installation**:
```bash
npm install newrelic
```

**Configuration** (`newrelic.js`):
```javascript
exports.config = {
  app_name: ['Discord Trade Executor'],
  license_key: process.env.NEW_RELIC_LICENSE_KEY,
  logging: {
    level: 'info',
    filepath: 'stdout'
  },
  distributed_tracing: {
    enabled: true
  },
  transaction_tracer: {
    enabled: true,
    transaction_threshold: 'apdex_f',  // Trace slow transactions
    record_sql: 'obfuscated'
  },
  error_collector: {
    enabled: true,
    capture_events: true,
    ignore_status_codes: [404]
  }
};
```

**Initialization** (add to top of `server.js`):
```javascript
// MUST be first require
require('newrelic');

const express = require('express');
// ... rest of app
```

### 3. Automatic Instrumentation

New Relic automatically instruments:
- Express routes (response times, throughput)
- MongoDB queries (via Mongoose)
- HTTP/HTTPS requests (axios, fetch)
- Redis operations
- WebSocket connections

No code changes required for basic instrumentation.

### 4. Custom Metrics

**Trade Execution Latency**:
```javascript
// src/services/TradeExecutor.js
const newrelic = require('newrelic');

async executeTrade(trade) {
  const startTime = Date.now();

  try {
    const result = await this.broker.executeTrade(trade);
    const latency = Date.now() - startTime;

    // Record custom metric
    newrelic.recordMetric('Custom/Trade/ExecutionLatency', latency);
    newrelic.recordMetric('Custom/Trade/Success', 1);

    return result;
  } catch (error) {
    newrelic.recordMetric('Custom/Trade/Failure', 1);
    newrelic.noticeError(error, { tradeId: trade.id, symbol: trade.symbol });
    throw error;
  }
}
```

**Signal Parsing Success Rate**:
```javascript
// src/services/SignalParser.js
const newrelic = require('newrelic');

async parseSignal(message) {
  try {
    const signal = await this.nlpParser.parse(message);

    if (signal) {
      newrelic.recordMetric('Custom/Signal/ParseSuccess', 1);
    } else {
      newrelic.recordMetric('Custom/Signal/ParseFailure', 1);
    }

    return signal;
  } catch (error) {
    newrelic.recordMetric('Custom/Signal/ParseError', 1);
    newrelic.noticeError(error, { message: message.substring(0, 100) });
    throw error;
  }
}
```

**Active WebSocket Connections**:
```javascript
// server.js (Socket.io setup)
const newrelic = require('newrelic');

io.on('connection', (socket) => {
  const connectionCount = io.engine.clientsCount;
  newrelic.recordMetric('Custom/WebSocket/Connections', connectionCount);

  socket.on('disconnect', () => {
    const connectionCount = io.engine.clientsCount;
    newrelic.recordMetric('Custom/WebSocket/Connections', connectionCount);
  });
});
```

**API Response Time Tracking**:
```javascript
// src/middleware/performance.js
const newrelic = require('newrelic');

function performanceMiddleware(req, res, next) {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const route = req.route ? req.route.path : 'unknown';

    newrelic.recordMetric(`Custom/API/${route}/ResponseTime`, duration);

    if (duration > 2000) {
      newrelic.noticeError(
        new Error('Slow API Response'),
        { route, duration, statusCode: res.statusCode }
      );
    }
  });

  next();
}

module.exports = performanceMiddleware;
```

### 5. Error Tracking

**Automatic Error Capture**:
```javascript
// Express error handler middleware (src/middleware/errorHandler.js)
const newrelic = require('newrelic');

function errorHandler(err, req, res, next) {
  // Capture error in New Relic
  newrelic.noticeError(err, {
    userId: req.user?.id,
    route: req.path,
    method: req.method,
    query: req.query,
    body: sanitizeBody(req.body)  // Remove sensitive data
  });

  // Log with Winston
  logger.error('Request error', {
    error: err.message,
    stack: err.stack,
    userId: req.user?.id,
    route: req.path
  });

  res.status(err.status || 500).json({ error: err.message });
}
```

**Unhandled Promise Rejections**:
```javascript
// server.js
process.on('unhandledRejection', (reason, promise) => {
  newrelic.noticeError(reason, { type: 'unhandledRejection' });
  logger.error('Unhandled promise rejection', { reason });
});

process.on('uncaughtException', (error) => {
  newrelic.noticeError(error, { type: 'uncaughtException' });
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  process.exit(1);  // Exit on uncaught exception
});
```

### 6. Alerting Rules

**New Relic Alert Policies**:

1. **High Error Rate**:
   - Condition: Error rate >1% for 5 minutes
   - Action: Email + Slack notification
   - Severity: Critical

2. **Slow Response Times**:
   - Condition: Average response time >2 seconds for 10 minutes
   - Action: Email notification
   - Severity: Warning

3. **Trade Execution Failures**:
   - Condition: `Custom/Trade/Failure` >5 failures in 5 minutes
   - Action: Email + PagerDuty
   - Severity: Critical

4. **High WebSocket Disconnection Rate**:
   - Condition: Disconnection rate >10/minute for 5 minutes
   - Action: Slack notification
   - Severity: Warning

5. **Database Query Latency**:
   - Condition: MongoDB query time >1 second for 5 minutes
   - Action: Email notification
   - Severity: Warning

**Alert Configuration** (via New Relic UI or API):
```javascript
// Example alert policy creation (New Relic API)
const newRelicApi = require('newrelic-api-client');

await newRelicApi.alerts.createPolicy({
  name: 'Discord Trade Executor - Production',
  incident_preference: 'PER_CONDITION'
});

await newRelicApi.alerts.createCondition({
  policy_id: policyId,
  type: 'apm_app_metric',
  name: 'High Error Rate',
  metric: 'error_percentage',
  threshold: {
    duration: 5,  // minutes
    value: 1,     // percent
    operator: 'above'
  }
});
```

### 7. Performance Dashboards

**System Health Dashboard**:
- Request throughput (requests/minute)
- Average response time
- Error rate
- Apdex score (application performance index)
- Memory usage
- CPU usage

**Trading Operations Dashboard**:
- Trade execution latency (p50, p95, p99)
- Trade success rate
- Signal parsing success rate
- Broker API call durations
- Active WebSocket connections

**Database Performance Dashboard**:
- MongoDB query time (p50, p95, p99)
- Slow query count (>1 second)
- Database connection pool usage
- Query throughput

**Example New Relic Dashboard (JSON)**:
```json
{
  "name": "Discord Trade Executor - System Health",
  "pages": [{
    "name": "Overview",
    "widgets": [
      {
        "title": "Request Throughput",
        "visualization": { "id": "viz.line" },
        "nrql": "SELECT rate(count(*), 1 minute) FROM Transaction WHERE appName = 'Discord Trade Executor'"
      },
      {
        "title": "Average Response Time",
        "visualization": { "id": "viz.line" },
        "nrql": "SELECT average(duration) FROM Transaction WHERE appName = 'Discord Trade Executor' TIMESERIES"
      },
      {
        "title": "Error Rate",
        "visualization": { "id": "viz.billboard" },
        "nrql": "SELECT percentage(count(*), WHERE error IS true) FROM Transaction WHERE appName = 'Discord Trade Executor'"
      }
    ]
  }]
}
```

### 8. Distributed Tracing

**Correlation IDs**:
```javascript
// src/middleware/correlationId.js
const { v4: uuidv4 } = require('uuid');
const newrelic = require('newrelic');

function correlationIdMiddleware(req, res, next) {
  const correlationId = req.headers['x-correlation-id'] || uuidv4();
  req.correlationId = correlationId;

  // Add to New Relic transaction
  newrelic.addCustomAttribute('correlationId', correlationId);

  // Add to response headers
  res.setHeader('X-Correlation-ID', correlationId);

  // Add to Winston logger context
  req.logger = logger.child({ correlationId });

  next();
}
```

**Trace Propagation** (Discord Bot → Backend):
```javascript
// Discord bot service
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

async function notifyBackend(signal) {
  const correlationId = uuidv4();

  await axios.post('https://api.example.com/signals', signal, {
    headers: {
      'X-Correlation-ID': correlationId,
      'X-Trace-ID': newrelic.getTraceMetadata().traceId
    }
  });
}
```

### 9. Log Aggregation

**Winston → New Relic Integration**:
```javascript
// src/config/logger.js
const winston = require('winston');
const newrelicFormatter = require('@newrelic/winston-enricher')(winston);

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    newrelicFormatter(),  // Add New Relic trace context
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

module.exports = logger;
```

## Implementation Plan

### Phase 1: APM Platform Setup (1 day)
1. Choose APM platform (New Relic recommended)
2. Create account and obtain license key
3. Install APM SDK (`newrelic` npm package)
4. Configure `newrelic.js` with environment variables
5. Deploy to staging and verify data flowing

### Phase 2: Custom Metrics (2 days)
1. Implement trade execution latency tracking
2. Implement signal parsing success rate tracking
3. Implement WebSocket connection count tracking
4. Implement API response time middleware
5. Test custom metrics in staging

### Phase 3: Error Tracking & Alerting (1 day)
1. Configure error handler middleware
2. Capture unhandled rejections and exceptions
3. Create alert policies in New Relic
4. Configure notification channels (email, Slack)
5. Test alerts with synthetic errors

### Phase 4: Dashboards & Documentation (1 day)
1. Create system health dashboard
2. Create trading operations dashboard
3. Create database performance dashboard
4. Document metrics and thresholds
5. Train team on using dashboards

## Success Criteria

- [ ] APM platform (New Relic) integrated and data flowing
- [ ] Automatic instrumentation capturing Express routes, database queries, HTTP requests
- [ ] Custom metrics implemented (trade execution latency, signal parsing, WebSocket connections)
- [ ] Error tracking capturing exceptions with full context
- [ ] Alerting rules configured (error rate, response time, trade failures)
- [ ] Performance dashboards created (system health, trading ops, database)
- [ ] Distributed tracing working (correlation IDs propagated)
- [ ] Log aggregation sending Winston logs to APM platform
- [ ] Team trained on using dashboards and responding to alerts
- [ ] Zero performance degradation from APM overhead (<5ms latency added)

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| APM overhead degrades performance | MEDIUM | Profile instrumentation, disable detailed tracing in production if needed |
| High data ingestion costs | LOW | Start with free tier, monitor usage, optimize sampling rate |
| Alert fatigue (too many alerts) | MEDIUM | Tune thresholds based on baseline metrics, use severity levels |
| Sensitive data exposed in logs | HIGH | Sanitize request bodies, never log API keys or passwords |
| APM platform downtime | LOW | Graceful degradation, continue logging to files |

## Dependencies

**Blocking**:
- None (can implement immediately)

**Blocked By**:
- None

**Optional Enhancements** (Future):
- Real User Monitoring (RUM) for frontend performance
- Synthetic monitoring (uptime checks from external locations)
- Custom APM dashboard (embed in admin dashboard)

## Effort Estimate

**Total**: 3-5 days (24-40 hours focused work)

**Breakdown**:
- APM platform setup: 1 day (8 hours)
- Custom metrics: 2 days (16 hours)
- Error tracking & alerting: 1 day (8 hours)
- Dashboards & documentation: 1 day (8 hours)

**Complexity Factors**:
- Learning APM platform (New Relic/Datadog)
- Identifying critical metrics to track
- Tuning alert thresholds (requires baseline data)
- Dashboard design and visualization

## Rollback Plan

If APM causes performance issues:
1. Feature flag: `APM_ENABLED=false` to disable instrumentation
2. Remove `require('newrelic')` from `server.js`
3. Revert to Winston-only logging
4. No data loss (APM is observability layer, not data store)
5. Re-enable after optimizing instrumentation (reduce sampling rate)
