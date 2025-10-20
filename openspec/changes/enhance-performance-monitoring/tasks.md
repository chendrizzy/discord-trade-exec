# Tasks: Enhance Performance Monitoring

## Phase 1: APM Platform Setup (1 day)

### 1.1 Choose APM Platform
- [ ] **Task 1.1.1**: Evaluate APM options
  - **New Relic**: Free tier (100GB/month), excellent Node.js support
  - **Datadog**: Comprehensive but expensive
  - **Recommendation**: Start with New Relic free tier
- [ ] **Task 1.1.2**: Document decision
  - Rationale for chosen platform
  - Pricing tier selected
  - Data retention policy
- [ ] **Validation**: Platform selected and documented

### 1.2 Create APM Account
- [ ] **Task 1.2.1**: Sign up for New Relic account
  - URL: https://newrelic.com/signup
  - Select "APM" product
  - Choose appropriate plan (free tier initially)
- [ ] **Task 1.2.2**: Obtain license key
  - Navigate to Account Settings → API Keys
  - Create new license key
  - Copy key securely (will be environment variable)
- [ ] **Task 1.2.3**: Document account details
  - Account ID
  - License key (stored securely, not in code)
  - Region (US or EU)
- [ ] **Validation**: New Relic account active, license key obtained

### 1.3 Install New Relic SDK
- [ ] **Task 1.3.1**: Install npm package
  ```bash
  npm install newrelic @newrelic/winston-enricher
  ```
- [ ] **Task 1.3.2**: Verify installation in `package.json`
  - `newrelic: ^11.x.x`
  - `@newrelic/winston-enricher: ^4.x.x`
- [ ] **Task 1.3.3**: Update `package-lock.json`
- [ ] **Validation**: Dependencies installed, no conflicts

### 1.4 Configure New Relic
- [ ] **Task 1.4.1**: Create `newrelic.js` configuration file
  - Path: Project root (`/newrelic.js`)
  - Template:
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
        transaction_threshold: 'apdex_f',
        record_sql: 'obfuscated'
      },
      error_collector: {
        enabled: true,
        capture_events: true,
        ignore_status_codes: [404]
      },
      attributes: {
        include: ['request.headers.x-correlation-id'],
        exclude: ['request.headers.authorization']
      }
    };
    ```
- [ ] **Task 1.4.2**: Add environment variables
  - Update `.env.example`: `NEW_RELIC_LICENSE_KEY=your-license-key`
  - Update `.env.staging`: Add actual license key
  - Update `.env.production`: Add actual license key (when deploying)
- [ ] **Task 1.4.3**: Initialize New Relic in application
  - Update `server.js` (MUST be first require):
    ```javascript
    // MUST be first require (before any other modules)
    if (process.env.NODE_ENV === 'production' || process.env.APM_ENABLED === 'true') {
      require('newrelic');
    }

    const express = require('express');
    // ... rest of app
    ```
- [ ] **Validation**: New Relic configuration complete

### 1.5 Deploy to Staging
- [ ] **Task 1.5.1**: Set environment variables in staging
  - `NEW_RELIC_LICENSE_KEY`: actual key
  - `APM_ENABLED=true`: enable in staging for testing
- [ ] **Task 1.5.2**: Deploy code to staging environment
- [ ] **Task 1.5.3**: Restart application
- [ ] **Task 1.5.4**: Verify New Relic connection
  - Check application logs for "New Relic connected" message
  - Check New Relic dashboard for data (wait 5 minutes)
  - Verify application name appears in APM dashboard
- [ ] **Validation**: Data flowing to New Relic, no errors

### 1.6 Verify Automatic Instrumentation
- [ ] **Task 1.6.1**: Generate test traffic in staging
  - Make API requests to various endpoints
  - Execute test trades (demo mode)
  - Connect WebSocket clients
- [ ] **Task 1.6.2**: Verify data in New Relic APM
  - Transactions: Check "Transactions" tab for Express routes
  - Databases: Check "Databases" tab for MongoDB queries
  - External Services: Check "External services" for HTTP calls (axios)
  - Errors: Trigger test error, verify captured
- [ ] **Task 1.6.3**: Document automatic instrumentation coverage
  - List instrumented frameworks (Express, Mongoose, axios)
  - Note any gaps (custom code not instrumented)
- [ ] **Validation**: Automatic instrumentation working

## Phase 2: Custom Metrics (2 days)

### 2.1 Implement Trade Execution Metrics
- [ ] **Task 2.1.1**: Locate TradeExecutor service
  - Path: `src/services/TradeExecutor.js` or equivalent
- [ ] **Task 2.1.2**: Add latency tracking
  ```javascript
  const newrelic = require('newrelic');

  async executeTrade(trade) {
    const startTime = Date.now();

    try {
      const result = await this.broker.executeTrade(trade);
      const latency = Date.now() - startTime;

      // Record custom metrics
      newrelic.recordMetric('Custom/Trade/ExecutionLatency', latency);
      newrelic.recordMetric('Custom/Trade/Success', 1);

      // Add custom attributes to transaction
      newrelic.addCustomAttribute('tradeSymbol', trade.symbol);
      newrelic.addCustomAttribute('tradeSide', trade.side);
      newrelic.addCustomAttribute('broker', this.broker.name);

      return result;
    } catch (error) {
      newrelic.recordMetric('Custom/Trade/Failure', 1);
      newrelic.noticeError(error, {
        tradeId: trade.id,
        symbol: trade.symbol,
        broker: this.broker.name
      });
      throw error;
    }
  }
  ```
- [ ] **Task 2.1.3**: Add broker-specific metrics
  - `Custom/Trade/Alpaca/Success`
  - `Custom/Trade/Binance/Success`
  - Track latency per broker
- [ ] **Task 2.1.4**: Test trade execution metrics
  - Execute test trade in staging
  - Verify metrics appear in New Relic (Insights → Query your data)
  - Query: `SELECT average(newrelic.timeslice.value) FROM Metric WHERE metricTimesliceName = 'Custom/Trade/ExecutionLatency' TIMESERIES`
- [ ] **Validation**: Trade execution metrics working

### 2.2 Implement Signal Parsing Metrics
- [ ] **Task 2.2.1**: Locate SignalParser service
  - Path: `src/services/SignalParser.js` or equivalent
- [ ] **Task 2.2.2**: Add parsing success/failure tracking
  ```javascript
  const newrelic = require('newrelic');

  async parseSignal(message) {
    try {
      const signal = await this.nlpParser.parse(message);

      if (signal) {
        newrelic.recordMetric('Custom/Signal/ParseSuccess', 1);
        newrelic.addCustomAttribute('signalSymbol', signal.symbol);
        newrelic.addCustomAttribute('signalAction', signal.action);
      } else {
        newrelic.recordMetric('Custom/Signal/ParseFailure', 1);
      }

      return signal;
    } catch (error) {
      newrelic.recordMetric('Custom/Signal/ParseError', 1);
      newrelic.noticeError(error, {
        message: message.substring(0, 100)  // First 100 chars for context
      });
      throw error;
    }
  }
  ```
- [ ] **Task 2.2.3**: Add signal provider metrics
  - Track success rate per signal provider
  - `Custom/Signal/Provider/${providerId}/Success`
- [ ] **Task 2.2.4**: Test signal parsing metrics
  - Send test Discord messages
  - Verify metrics in New Relic
  - Calculate success rate: `(ParseSuccess / (ParseSuccess + ParseFailure)) * 100`
- [ ] **Validation**: Signal parsing metrics working

### 2.3 Implement WebSocket Connection Metrics
- [ ] **Task 2.3.1**: Locate Socket.io setup
  - Path: `server.js` or `src/websocket/index.js`
- [ ] **Task 2.3.2**: Track active connection count
  ```javascript
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
- [ ] **Task 2.3.3**: Track connection events
  - `Custom/WebSocket/ConnectionsPerMinute`: Rate of new connections
  - `Custom/WebSocket/DisconnectionsPerMinute`: Rate of disconnections
  - `Custom/WebSocket/ReconnectionsPerMinute`: Rate of reconnections
- [ ] **Task 2.3.4**: Track room subscriptions
  - `Custom/WebSocket/Room/${roomName}/Subscribers`
  - Track when users join/leave rooms
- [ ] **Task 2.3.5**: Test WebSocket metrics
  - Connect/disconnect multiple clients
  - Verify metrics in New Relic
  - Chart connection count over time
- [ ] **Validation**: WebSocket metrics working

### 2.4 Implement API Response Time Middleware
- [ ] **Task 2.4.1**: Create performance middleware
  - Path: `src/middleware/performance.js`
  ```javascript
  const newrelic = require('newrelic');

  function performanceMiddleware(req, res, next) {
    const startTime = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const route = req.route ? req.route.path : 'unknown';
      const method = req.method;

      // Record response time
      newrelic.recordMetric(`Custom/API/${method}/${route}/ResponseTime`, duration);

      // Alert on slow responses
      if (duration > 2000) {
        newrelic.noticeError(
          new Error('Slow API Response'),
          {
            route,
            method,
            duration,
            statusCode: res.statusCode,
            userId: req.user?.id
          }
        );
      }
    });

    next();
  }

  module.exports = performanceMiddleware;
  ```
- [ ] **Task 2.4.2**: Register middleware globally
  - Add to `server.js` after authentication middleware:
    ```javascript
    app.use(performanceMiddleware);
    ```
- [ ] **Task 2.4.3**: Test response time tracking
  - Make API requests
  - Verify metrics in New Relic
  - Intentionally slow down endpoint (sleep 3 seconds)
  - Verify alert captured
- [ ] **Validation**: API response time middleware working

### 2.5 Implement Database Query Metrics
- [ ] **Task 2.5.1**: Verify Mongoose auto-instrumentation
  - New Relic automatically tracks Mongoose queries
  - Check "Databases" tab in APM for query counts
- [ ] **Task 2.5.2**: Add custom slow query tracking
  ```javascript
  // src/models/User.js or database config
  const mongoose = require('mongoose');
  const newrelic = require('newrelic');

  mongoose.set('debug', (collectionName, method, query, doc) => {
    // Log slow queries (>1 second)
    if (this.queryExecutionTime > 1000) {
      newrelic.recordMetric(`Custom/Database/${collectionName}/SlowQuery`, 1);
      newrelic.noticeError(
        new Error('Slow Database Query'),
        {
          collection: collectionName,
          method,
          query: JSON.stringify(query),
          duration: this.queryExecutionTime
        }
      );
    }
  });
  ```
- [ ] **Task 2.5.3**: Track connection pool usage
  - `Custom/Database/ConnectionPool/Active`
  - `Custom/Database/ConnectionPool/Available`
- [ ] **Task 2.5.4**: Test database metrics
  - Execute slow query intentionally
  - Verify metrics in New Relic
  - Check for slow query alerts
- [ ] **Validation**: Database query metrics working

### 2.6 Document Custom Metrics
- [ ] **Task 2.6.1**: Create metrics documentation
  - Path: `docs/monitoring/custom-metrics.md`
  - List all custom metrics with descriptions
  - Example queries for each metric
  - Baseline values (expected ranges)
- [ ] **Task 2.6.2**: Create metrics glossary
  | Metric Name | Description | Unit | Expected Range |
  |-------------|-------------|------|----------------|
  | Custom/Trade/ExecutionLatency | Time to execute trade with broker | ms | 200-800ms |
  | Custom/Signal/ParseSuccess | Successful signal parses | count | 80-95% success rate |
  | Custom/WebSocket/Connections | Active WebSocket connections | count | 10-1000 |
- [ ] **Validation**: Metrics documented

## Phase 3: Error Tracking & Alerting (1 day)

### 3.1 Configure Error Handler Middleware
- [ ] **Task 3.1.1**: Locate or create error handler
  - Path: `src/middleware/errorHandler.js`
- [ ] **Task 3.1.2**: Integrate New Relic error tracking
  ```javascript
  const newrelic = require('newrelic');
  const logger = require('../config/logger');

  function errorHandler(err, req, res, next) {
    // Sanitize request body (remove sensitive data)
    const sanitizedBody = { ...req.body };
    delete sanitizedBody.password;
    delete sanitizedBody.apiKey;

    // Capture error in New Relic
    newrelic.noticeError(err, {
      userId: req.user?.id,
      route: req.path,
      method: req.method,
      query: req.query,
      body: sanitizedBody,
      correlationId: req.correlationId
    });

    // Log with Winston
    logger.error('Request error', {
      error: err.message,
      stack: err.stack,
      userId: req.user?.id,
      route: req.path,
      correlationId: req.correlationId
    });

    res.status(err.status || 500).json({ error: err.message });
  }

  module.exports = errorHandler;
  ```
- [ ] **Task 3.1.3**: Register error handler (must be last middleware)
  - Add to `server.js`:
    ```javascript
    app.use(errorHandler);
    ```
- [ ] **Validation**: Error handler captures errors to New Relic

### 3.2 Capture Unhandled Errors
- [ ] **Task 3.2.1**: Handle unhandled promise rejections
  - Add to `server.js`:
    ```javascript
    process.on('unhandledRejection', (reason, promise) => {
      newrelic.noticeError(reason, { type: 'unhandledRejection' });
      logger.error('Unhandled promise rejection', { reason, promise });
    });
    ```
- [ ] **Task 3.2.2**: Handle uncaught exceptions
  - Add to `server.js`:
    ```javascript
    process.on('uncaughtException', (error) => {
      newrelic.noticeError(error, { type: 'uncaughtException' });
      logger.error('Uncaught exception', {
        error: error.message,
        stack: error.stack
      });
      process.exit(1);  // Exit on uncaught exception
    });
    ```
- [ ] **Task 3.2.3**: Test error capture
  - Trigger test error in staging
  - Trigger unhandled promise rejection
  - Verify both captured in New Relic
- [ ] **Validation**: All error types captured

### 3.3 Create Alert Policies
- [ ] **Task 3.3.1**: Create alert policy via New Relic UI
  - Navigate to Alerts & AI → Alert conditions → New alert policy
  - Name: "Discord Trade Executor - Production"
  - Incident preference: "By condition" (separate incident per condition)
- [ ] **Task 3.3.2**: Create "High Error Rate" alert
  - Condition type: APM metric
  - Metric: Error percentage
  - Threshold: >1% for 5 minutes
  - Severity: Critical
  - Notification channel: Email + Slack
- [ ] **Task 3.3.3**: Create "Slow Response Time" alert
  - Condition type: APM metric
  - Metric: Web transaction time
  - Threshold: >2 seconds for 10 minutes
  - Severity: Warning
  - Notification channel: Email
- [ ] **Task 3.3.4**: Create "Trade Execution Failures" alert
  - Condition type: NRQL query
  - Query: `SELECT sum(newrelic.timeslice.value) FROM Metric WHERE metricTimesliceName = 'Custom/Trade/Failure'`
  - Threshold: >5 failures in 5 minutes
  - Severity: Critical
  - Notification channel: Email + PagerDuty (if configured)
- [ ] **Task 3.3.5**: Create "High WebSocket Disconnection Rate" alert
  - Condition type: NRQL query
  - Query: `SELECT rate(sum(newrelic.timeslice.value), 1 minute) FROM Metric WHERE metricTimesliceName = 'Custom/WebSocket/DisconnectionsPerMinute'`
  - Threshold: >10 disconnections/minute for 5 minutes
  - Severity: Warning
  - Notification channel: Slack
- [ ] **Task 3.3.6**: Create "Database Query Latency" alert
  - Condition type: APM metric
  - Metric: Database query time
  - Threshold: >1 second for 5 minutes
  - Severity: Warning
  - Notification channel: Email
- [ ] **Validation**: Alert policies created and active

### 3.4 Configure Notification Channels
- [ ] **Task 3.4.1**: Add email notification channel
  - Navigate to Alerts & AI → Notification channels → New channel
  - Type: Email
  - Recipients: team@example.com
  - Link to alert policies
- [ ] **Task 3.4.2**: Add Slack notification channel (if available)
  - Type: Slack
  - Webhook URL: (obtain from Slack app configuration)
  - Channel: #alerts
  - Link to alert policies
- [ ] **Task 3.4.3**: Test notifications
  - Trigger test alert (manually or via synthetic error)
  - Verify email received
  - Verify Slack message received (if configured)
- [ ] **Validation**: Notifications working

### 3.5 Document Alert Response Procedures
- [ ] **Task 3.5.1**: Create alert runbook
  - Path: `docs/monitoring/alert-runbook.md`
  - For each alert:
    - Description
    - Severity
    - Possible causes
    - Debugging steps
    - Resolution actions
  - Example:
    ```markdown
    ## High Error Rate Alert

    **Severity**: Critical
    **Threshold**: Error rate >1% for 5 minutes

    **Possible Causes**:
    - Recent deployment with bugs
    - External service downtime (Discord API, broker API)
    - Database connection issues

    **Debugging Steps**:
    1. Check New Relic Errors tab for error types
    2. Identify most common error message
    3. Check recent deployments (git log)
    4. Check external service status pages

    **Resolution**:
    - If deployment issue: Rollback to previous version
    - If external service: Wait for recovery, implement fallback
    - If database: Check connection pool, restart if needed
    ```
- [ ] **Task 3.5.2**: Document escalation procedures
  - On-call rotation (if applicable)
  - Escalation matrix (who to contact for critical issues)
  - PagerDuty integration (if configured)
- [ ] **Validation**: Alert runbook complete and reviewed

## Phase 4: Dashboards & Documentation (1 day)

### 4.1 Create System Health Dashboard
- [ ] **Task 4.1.1**: Create dashboard in New Relic
  - Navigate to Dashboards → New dashboard
  - Name: "Discord Trade Executor - System Health"
- [ ] **Task 4.1.2**: Add "Request Throughput" widget
  - Visualization: Line chart
  - NRQL query:
    ```sql
    SELECT rate(count(*), 1 minute) AS 'Requests/min'
    FROM Transaction
    WHERE appName = 'Discord Trade Executor'
    TIMESERIES
    ```
- [ ] **Task 4.1.3**: Add "Average Response Time" widget
  - Visualization: Line chart
  - NRQL query:
    ```sql
    SELECT average(duration) AS 'Avg Response Time (s)'
    FROM Transaction
    WHERE appName = 'Discord Trade Executor'
    TIMESERIES
    ```
- [ ] **Task 4.1.4**: Add "Error Rate" widget
  - Visualization: Billboard
  - NRQL query:
    ```sql
    SELECT percentage(count(*), WHERE error IS true) AS 'Error Rate (%)'
    FROM Transaction
    WHERE appName = 'Discord Trade Executor'
    ```
- [ ] **Task 4.1.5**: Add "Apdex Score" widget
  - Visualization: Billboard
  - NRQL query:
    ```sql
    SELECT apdex(duration, 0.5) AS 'Apdex Score'
    FROM Transaction
    WHERE appName = 'Discord Trade Executor'
    ```
  - Note: Apdex threshold = 0.5s (satisfactory), 2.0s (tolerable)
- [ ] **Task 4.1.6**: Add "Memory Usage" widget
  - Visualization: Line chart
  - NRQL query:
    ```sql
    SELECT average(memoryUsed) AS 'Memory (MB)'
    FROM SystemSample
    WHERE appName = 'Discord Trade Executor'
    TIMESERIES
    ```
- [ ] **Task 4.1.7**: Add "CPU Usage" widget
  - Visualization: Line chart
  - NRQL query:
    ```sql
    SELECT average(cpuPercent) AS 'CPU (%)'
    FROM SystemSample
    WHERE appName = 'Discord Trade Executor'
    TIMESERIES
    ```
- [ ] **Validation**: System health dashboard complete

### 4.2 Create Trading Operations Dashboard
- [ ] **Task 4.2.1**: Create dashboard in New Relic
  - Name: "Discord Trade Executor - Trading Operations"
- [ ] **Task 4.2.2**: Add "Trade Execution Latency" widget
  - Visualization: Line chart (multi-series)
  - NRQL query:
    ```sql
    SELECT percentile(newrelic.timeslice.value, 50, 95, 99) AS 'Latency (ms)'
    FROM Metric
    WHERE metricTimesliceName = 'Custom/Trade/ExecutionLatency'
    TIMESERIES
    ```
  - Series: p50 (green), p95 (yellow), p99 (red)
- [ ] **Task 4.2.3**: Add "Trade Success Rate" widget
  - Visualization: Billboard
  - NRQL query:
    ```sql
    SELECT (sum(newrelic.timeslice.value) FILTER (WHERE metricTimesliceName = 'Custom/Trade/Success')) /
           (sum(newrelic.timeslice.value) FILTER (WHERE metricTimesliceName IN ('Custom/Trade/Success', 'Custom/Trade/Failure'))) * 100
    AS 'Success Rate (%)'
    FROM Metric
    ```
- [ ] **Task 4.2.4**: Add "Signal Parsing Success Rate" widget
  - Visualization: Billboard
  - NRQL query: Similar to trade success rate, using `Custom/Signal/ParseSuccess`
- [ ] **Task 4.2.5**: Add "Broker API Call Durations" widget
  - Visualization: Bar chart
  - NRQL query:
    ```sql
    SELECT average(duration) AS 'Avg Duration (s)'
    FROM Transaction
    WHERE appName = 'Discord Trade Executor' AND name LIKE '%broker%'
    FACET name
    ```
- [ ] **Task 4.2.6**: Add "Active WebSocket Connections" widget
  - Visualization: Line chart
  - NRQL query:
    ```sql
    SELECT latest(newrelic.timeslice.value) AS 'Active Connections'
    FROM Metric
    WHERE metricTimesliceName = 'Custom/WebSocket/Connections'
    TIMESERIES
    ```
- [ ] **Validation**: Trading operations dashboard complete

### 4.3 Create Database Performance Dashboard
- [ ] **Task 4.3.1**: Create dashboard in New Relic
  - Name: "Discord Trade Executor - Database Performance"
- [ ] **Task 4.3.2**: Add "MongoDB Query Time" widget
  - Visualization: Line chart
  - NRQL query:
    ```sql
    SELECT percentile(duration, 50, 95, 99) AS 'Query Time (s)'
    FROM DatastoreTransaction
    WHERE appName = 'Discord Trade Executor'
    TIMESERIES
    ```
- [ ] **Task 4.3.3**: Add "Slow Query Count" widget
  - Visualization: Billboard
  - NRQL query:
    ```sql
    SELECT count(*) AS 'Slow Queries (>1s)'
    FROM DatastoreTransaction
    WHERE appName = 'Discord Trade Executor' AND duration > 1
    ```
- [ ] **Task 4.3.4**: Add "Database Connection Pool Usage" widget
  - Visualization: Line chart
  - NRQL query:
    ```sql
    SELECT latest(newrelic.timeslice.value) AS 'Active Connections'
    FROM Metric
    WHERE metricTimesliceName = 'Custom/Database/ConnectionPool/Active'
    TIMESERIES
    ```
- [ ] **Task 4.3.5**: Add "Query Throughput" widget
  - Visualization: Line chart
  - NRQL query:
    ```sql
    SELECT rate(count(*), 1 minute) AS 'Queries/min'
    FROM DatastoreTransaction
    WHERE appName = 'Discord Trade Executor'
    TIMESERIES
    ```
- [ ] **Task 4.3.6**: Add "Top 5 Slowest Queries" widget
  - Visualization: Table
  - NRQL query:
    ```sql
    SELECT average(duration) AS 'Avg Duration (s)', count(*) AS 'Count'
    FROM DatastoreTransaction
    WHERE appName = 'Discord Trade Executor'
    FACET databaseStatement
    LIMIT 5
    ```
- [ ] **Validation**: Database performance dashboard complete

### 4.4 Document Metrics and Thresholds
- [ ] **Task 4.4.1**: Create monitoring documentation
  - Path: `docs/monitoring/metrics-and-thresholds.md`
  - Document each metric:
    - Name
    - Description
    - Query (NRQL)
    - Expected baseline value
    - Alert threshold
    - Why it matters
- [ ] **Task 4.4.2**: Document dashboard links
  - System Health Dashboard: URL
  - Trading Operations Dashboard: URL
  - Database Performance Dashboard: URL
  - Include screenshots
- [ ] **Task 4.4.3**: Document NRQL query examples
  - Common queries for debugging
  - How to filter by user, time range, error type
  - How to create custom queries
- [ ] **Validation**: Monitoring documentation complete

### 4.5 Team Training
- [ ] **Task 4.5.1**: Schedule team training session (1 hour)
  - Demo New Relic dashboards
  - Walkthrough alert response procedures
  - Show how to create custom queries
  - Practice investigating sample issue
- [ ] **Task 4.5.2**: Create quick reference guide
  - Path: `docs/monitoring/quick-reference.md`
  - Dashboard links
  - Common queries
  - Alert runbook link
  - Who to contact for help
- [ ] **Task 4.5.3**: Grant team access to New Relic
  - Add team members to New Relic account
  - Assign appropriate roles (viewer, editor, admin)
- [ ] **Validation**: Team trained and has access

### 4.6 Performance Impact Testing
- [ ] **Task 4.6.1**: Benchmark application without APM
  - Load test with 100 concurrent requests
  - Measure average response time
  - Measure memory usage
- [ ] **Task 4.6.2**: Enable APM and benchmark again
  - Same load test (100 concurrent requests)
  - Measure average response time
  - Measure memory usage
  - Calculate overhead: `(APM response time - baseline response time) / baseline response time * 100`
- [ ] **Task 4.6.3**: Document performance impact
  - Expected: <5ms latency added per request
  - Expected: <10MB memory increase
  - If overhead >5%: Optimize instrumentation (reduce sampling rate)
- [ ] **Validation**: APM overhead acceptable (<5% latency increase)

## Success Criteria Checklist

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

## Effort Estimate

**Total**: 3-5 days (24-40 hours)

- APM platform setup: 1 day (8 hours)
- Custom metrics: 2 days (16 hours)
- Error tracking & alerting: 1 day (8 hours)
- Dashboards & documentation: 1 day (8 hours)
