# WebSocket Performance Metrics & Monitoring

## Overview

This document defines baseline performance metrics, monitoring standards, and alert thresholds for the WebSocket real-time update system implemented in Phase 3.7.

**Related Documentation:**
- [WebSocket Implementation Guide](WEBSOCKET-GUIDE.md)
- [Manual Testing Checklist](WEBSOCKET-MANUAL-TESTING.md)
- Implementation: `src/services/websocket-server.js`
- Tests: `tests/e2e/websocket-performance.spec.js`

---

## Performance Baselines

### Connection Performance

| Metric | Baseline | Threshold | Alert Level |
|--------|----------|-----------|-------------|
| Connection Establishment | < 100ms | < 500ms | ⚠️ Warning |
| Reconnection Time | < 2s | < 5s | ⚠️ Warning |
| Concurrent Connections | 1000+ | 5000+ | ✅ Target |
| Connections per User | 1-5 | 5 (max) | 🚨 Hard Limit |

**Notes:**
- Connection establishment measured from client initiation to `connect` event
- Reconnection includes authentication and room joining
- Per-user connection limit prevents resource exhaustion

### Message Throughput

| Metric | Baseline | Threshold | Alert Level |
|--------|----------|-----------|-------------|
| Messages per Second (Out) | 100-500 | 1000+ | ✅ Excellent |
| Messages per Second (In) | 10-50 | 100+ | ✅ Excellent |
| Average Message Size | 0.5-2 KB | < 10 KB | ⚠️ Large |
| Burst Capacity | 100 msg/s | 500 msg/s | ⚠️ Stress |

**Notes:**
- Outbound messages include portfolio updates, trade notifications, quotes
- Inbound messages primarily subscriptions and heartbeats
- Burst capacity tested with rapid trade execution scenarios

### Latency Metrics

| Metric | Baseline | Threshold | Alert Level |
|--------|----------|-----------|-------------|
| Portfolio Update Latency | < 100ms | < 500ms | 🚨 **ALERT** |
| Trade Notification Latency | < 50ms | < 200ms | ⚠️ Warning |
| Quote Update Latency | < 200ms | < 1000ms | ⚠️ Warning |
| Average Operation Latency | < 150ms | < 500ms | 🚨 **ALERT** |

**Notes:**
- Latency measured from emit call to acknowledgment/completion
- Includes network round-trip and processing time
- **500ms average latency triggers alert** (see Alert System section)

### Resource Utilization

| Metric | Baseline | Threshold | Alert Level |
|--------|----------|-----------|-------------|
| CPU Usage (Idle) | < 5% | < 15% | ⚠️ Warning |
| CPU Usage (Active) | < 20% | < 50% | ⚠️ Warning |
| Memory per Connection | 5-10 MB | < 50 MB | ⚠️ Warning |
| Memory Growth Rate | < 1 MB/hr | < 10 MB/hr | 🚨 **LEAK** |

**Notes:**
- Idle = connected with no active subscriptions
- Active = full subscriptions with regular updates
- Memory growth monitored for leaks

---

## Alert System

### Alert Thresholds (Production)

Configured in `src/services/websocket-server.js`:

```javascript
this.ALERT_THRESHOLDS = {
    HIGH_LATENCY: 500,         // Alert if avg latency > 500ms
    CONNECTION_DROP_RATE: 5,   // Alert if >5 drops per minute
    MIN_ALERT_INTERVAL: 300000 // 5 minutes between alerts
};
```

### Alert Types

#### 1. High Latency Alert

**Trigger:** Average operation latency exceeds 500ms over 1-minute window

**Alert Message:**
```
🚨 ALERT: High WebSocket latency detected: XXXms (threshold: 500ms)
```

**Response Actions:**
1. Check server CPU/memory usage
2. Verify network connectivity
3. Review active connection count
4. Check Redis adapter health (production)
5. Investigate slow database queries

**Production Integration:**
- DataDog: Send metric to `websocket.latency.high`
- New Relic: Trigger incident workflow
- PagerDuty: Page on-call engineer (P2 severity)

#### 2. Connection Drop Alert

**Trigger:** More than 5 unexpected disconnections per minute

**Alert Message:**
```
🚨 ALERT: High connection drop rate: X drops in last minute (threshold: 5)
```

**Response Actions:**
1. Check server stability (restarts, crashes)
2. Verify network infrastructure
3. Review connection timeout settings
4. Check for DDoS or abuse patterns
5. Verify load balancer health

**Production Integration:**
- DataDog: Send metric to `websocket.connection.drops`
- New Relic: Trigger stability alert
- PagerDuty: Page on-call engineer (P2 severity)

### Alert Throttling

**Minimum Alert Interval:** 5 minutes (300,000ms)

**Rationale:**
- Prevents alert spam during transient issues
- Allows time for automatic recovery
- Reduces alert fatigue

**Behavior:**
- First alert sent immediately when threshold exceeded
- Subsequent alerts suppressed for 5 minutes
- Each alert type tracked independently

---

## Monitoring Metrics API

### Real-Time Metrics

Access via `WebSocketServer.getPerformanceMetrics()`:

```javascript
{
  connections: {
    total: 1523,              // Total connections since server start
    active: 847,              // Currently connected clients
    uniqueUsers: 321,         // Distinct users connected
    avgPerUser: 2.64          // Average connections per user
  },
  throughput: {
    messagesOut: 1247,        // Messages sent in last minute
    messagesIn: 93,           // Messages received in last minute
    rateOut: 20.78,          // Outbound messages per second
    rateIn: 1.55             // Inbound messages per second
  },
  latency: {
    current: 87,              // Most recent operation latency (ms)
    average: 124,             // Average latency over 1-minute window (ms)
    total: 15234             // Total latency measurements
  },
  health: {
    connectionDrops: 2,       // Unexpected disconnects in last minute
    lastAlert: 1697234567000  // Timestamp of last alert (null if none)
  }
}
```

### Periodic Logging

**Interval:** Every 60 seconds (when active connections exist)

**Log Format:**
```
📊 WebSocket Stats: 847 active | 20.8 msg/s out | 124ms latency
```

**Silence Conditions:**
- No active connections (0 clients)
- Server in maintenance mode

---

## Performance Testing

### E2E Test Suite

**Location:** `tests/e2e/websocket-performance.spec.js`

**Test Coverage:**
1. Message throughput tracking
2. Latency measurement accuracy
3. Connection drop detection
4. High volume handling (50+ messages)
5. Network stress resilience
6. Rapid connect/disconnect cycles
7. Memory leak detection

**Run Tests:**
```bash
npm test -- websocket-performance.spec.js
```

### Load Testing (Manual)

**Recommended Tools:**
- [Artillery.io](https://artillery.io) - Load testing framework
- [k6](https://k6.io) - Performance testing tool
- WebSocket load test scripts (create in `tests/load/`)

**Target Scenarios:**
1. **Baseline:** 100 concurrent connections, 10 msg/s each
2. **Scale:** 1000 concurrent connections, 5 msg/s each
3. **Burst:** 500 connections, 50 msg/s for 1 minute
4. **Stress:** 2000 connections, sustained load

**Success Criteria:**
- Latency < 500ms at all scales
- No connection drops under normal load
- Memory growth < 10 MB/hour
- CPU usage < 50% during burst

---

## Production Monitoring Setup

### Required Components

1. **Metrics Collection:**
   - DataDog Agent or New Relic APM
   - Custom StatsD metrics for WebSocket-specific data
   - Log aggregation (CloudWatch, Splunk, ELK)

2. **Dashboards:**
   - Real-time connection count graph
   - Message throughput (in/out) chart
   - Latency percentile distribution (p50, p95, p99)
   - Connection drop rate timeline

3. **Alerts:**
   - High latency threshold breach
   - Connection drop rate spike
   - Memory growth anomaly
   - CPU sustained high usage

### Monitoring Endpoints

**Health Check:**
```bash
GET /health/websocket
```

**Response:**
```json
{
  "status": "healthy",
  "connections": {
    "active": 847,
    "healthy": true
  },
  "latency": {
    "average": 124,
    "healthy": true
  },
  "uptime": 864321
}
```

**Metrics Endpoint:**
```bash
GET /metrics/websocket
```

**Response:**
```json
{
  "connections": {...},
  "throughput": {...},
  "latency": {...},
  "health": {...}
}
```

### Log Analysis Queries

**Find High Latency Events:**
```
source="websocket-server" "ALERT: High WebSocket latency"
```

**Connection Drop Patterns:**
```
source="websocket-server" "connection drop" | stats count by reason
```

**Performance Stats:**
```
source="websocket-server" "WebSocket Stats" | timechart avg(latency)
```

---

## Optimization Strategies

### When Latency is High (>500ms)

**Diagnosis:**
1. Check `getPerformanceMetrics()` latency breakdown
2. Review CPU/memory usage on server
3. Verify Redis adapter performance (production)
4. Check database query performance
5. Analyze network conditions

**Solutions:**
- **Scale Horizontally:** Add more server instances (Redis adapter enables this)
- **Optimize Emits:** Batch updates, reduce message size
- **Cache Aggressively:** Reduce database queries
- **Network Upgrade:** Improve connection quality
- **Load Balance:** Distribute connections evenly

### When Connection Drops are High (>5/min)

**Diagnosis:**
1. Review disconnect reasons in logs
2. Check server stability (restarts, OOM)
3. Verify network infrastructure
4. Monitor client-side errors
5. Check firewall/proxy timeouts

**Solutions:**
- **Increase Timeouts:** Adjust Socket.io `pingTimeout`/`pingInterval`
- **Improve Reconnection:** Enhance client reconnection logic
- **Fix Server Issues:** Resolve crashes, memory leaks
- **Network Stability:** Work with infrastructure team
- **Rate Limit Protection:** Block abusive clients

### When Memory Growth is Detected

**Diagnosis:**
1. Heap dump analysis (Chrome DevTools, Node.js profiler)
2. Check `lastMinuteLatencies` array size
3. Review event listener cleanup
4. Monitor connection map size

**Solutions:**
- **Limit Array Sizes:** Enforce `lastMinuteLatencies` max 1000 items
- **Clean Up Listeners:** Remove listeners on disconnect
- **Garbage Collection:** Tune Node.js GC parameters
- **Connection Pooling:** Limit max connections per user

---

## Benchmarking Guidelines

### Initial Baseline (Post-Deployment)

1. **Run for 24 hours** with production traffic
2. **Record metrics** every 5 minutes:
   - Active connections (min, max, avg)
   - Message throughput (peak, average)
   - Latency (p50, p95, p99)
   - Resource usage (CPU, memory)

3. **Document normal patterns:**
   - Peak hours (e.g., market open: 9:30-10:00 AM EST)
   - Off-peak minimums (e.g., overnight)
   - Typical user behavior (connections per user, message frequency)

### Ongoing Monitoring

- **Daily:** Review latency trends, connection drops
- **Weekly:** Analyze throughput patterns, optimize bottlenecks
- **Monthly:** Capacity planning, scale projections
- **Quarterly:** Load testing, performance regression checks

### Performance Regression Detection

**Indicators:**
- Latency increase >20% month-over-month
- Connection drop rate increase >50%
- Memory growth trend > 5 MB/hour
- CPU usage sustained >40% at same load

**Actions:**
- Review recent code changes (git blame)
- Run profiler to identify bottlenecks
- Rollback if critical regression
- Create optimization task with priority

---

## Success Metrics (Phase 3.7 Acceptance Criteria)

✅ **Metrics visible in monitoring dashboard**
- All 4 metric categories tracked (connections, throughput, latency, health)
- Real-time updates via `getPerformanceMetrics()` API
- Periodic logging every 60 seconds

✅ **Alerts configured and tested**
- High latency alert (>500ms) implemented
- Connection drop alert (>5/min) implemented
- Alert throttling (5-minute minimum) functional
- Production integration points documented

✅ **Baseline performance documented**
- Expected baselines defined for all metrics
- Alert thresholds justified
- Optimization strategies provided
- Monitoring setup guide complete

---

## Next Steps (Phase 3.8 - Production Deployment)

1. **Pre-Deployment:**
   - Merge performance monitoring to main ✅
   - Run full E2E test suite
   - Verify Railway Redis configuration
   - Update environment variables

2. **Deployment:**
   - Deploy to Railway production
   - Monitor initial connection metrics
   - Verify alerts trigger correctly (staging test)
   - Load test with realistic traffic

3. **Post-Deployment:**
   - Monitor for 24 hours
   - Document actual baselines
   - Tune alert thresholds if needed
   - Create performance dashboard

---

**Last Updated:** October 12, 2025
**Version:** 1.0 (Phase 3.7 Complete)
**Next Review:** After 7 days production monitoring
