# Monitoring & Observability Setup

Comprehensive monitoring configuration for WebSocket server production deployment.

## Table of Contents

- [Overview](#overview)
- [Railway Built-in Monitoring](#railway-built-in-monitoring)
- [Application Metrics](#application-metrics)
- [Health Check Endpoints](#health-check-endpoints)
- [Log Aggregation](#log-aggregation)
- [Error Tracking](#error-tracking)
- [Performance Monitoring](#performance-monitoring)
- [Alerting](#alerting)
- [Dashboards](#dashboards)
- [Troubleshooting](#troubleshooting)

---

## Overview

### Monitoring Stack

```yaml
Platform Monitoring: Railway Dashboard (built-in)
Application Metrics: Custom endpoints + logs
Health Checks: /health, /health/redis
Log Aggregation: Railway Logs
Error Tracking: Sentry (optional)
Alerting: Railway Webhooks + Slack/Email
Dashboards: Railway + Custom
```

### Key Metrics

- **WebSocket Metrics**: Active connections, events/sec, latency
- **Redis Metrics**: Memory usage, connections, operations/sec
- **Application Metrics**: CPU, memory, response time, error rate
- **Business Metrics**: Active users, subscription events, trades

---

## Railway Built-in Monitoring

### Access Monitoring

1. **Railway Dashboard**: https://railway.app/project/{project-id}
2. **Select your service** (web service)
3. **View Metrics tab**

### Available Metrics

#### CPU Usage
- Current CPU %
- Historical trends (1h, 24h, 7d, 30d)
- Alert threshold: > 80% sustained

#### Memory Usage
- Current memory usage (MB)
- Memory limit
- Historical trends
- Alert threshold: > 90% of limit

#### Network I/O
- Bytes in/out
- Network bandwidth
- Request rate
- Alert threshold: Unusual spikes

#### Disk Usage
- Current disk usage
- Disk I/O operations
- Historical trends

#### Deployments
- Deployment history
- Build times
- Deployment status
- Rollback history

---

## Application Metrics

### WebSocket Server Metrics

Add to `src/services/websocket/WebSocketServer.js`:

```javascript
/**
 * Get server statistics
 */
getStats() {
  return {
    initialized: this.initialized,
    totalConnections: this.getTotalConnectionCount(),
    uniqueUsers: this.activeConnections.size,
    redisAdapter: !!this.redisPubClient,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  };
}

/**
 * Get detailed metrics
 */
getMetrics() {
  const memoryUsage = process.memoryUsage();

  return {
    websocket: {
      totalConnections: this.getTotalConnectionCount(),
      uniqueUsers: this.activeConnections.size,
      redisEnabled: !!this.redisPubClient
    },
    system: {
      uptime: process.uptime(),
      memory: {
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + ' MB',
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + ' MB',
        rss: Math.round(memoryUsage.rss / 1024 / 1024) + ' MB',
        external: Math.round(memoryUsage.external / 1024 / 1024) + ' MB'
      },
      cpu: process.cpuUsage()
    },
    timestamp: new Date().toISOString()
  };
}
```

### Metrics Endpoint

Add to `src/routes/health.js`:

```javascript
router.get('/metrics', (req, res) => {
  const wsServer = req.app.get('wsServer');

  if (!wsServer) {
    return res.status(503).json({
      error: 'WebSocket server not initialized'
    });
  }

  const metrics = wsServer.getMetrics();

  res.json(metrics);
});
```

---

## Health Check Endpoints

### Primary Health Check

**Endpoint**: `GET /health`

**Response**:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-17T12:00:00.000Z",
  "uptime": 3600,
  "version": "1.0.0"
}
```

**Status Codes**:
- `200`: Healthy
- `503`: Unhealthy

### Redis Health Check

**Endpoint**: `GET /health/redis`

**Response**:
```json
{
  "status": "healthy",
  "latency": "5ms",
  "connections": 2,
  "timestamp": "2025-01-17T12:00:00.000Z"
}
```

**Status Codes**:
- `200`: Redis healthy
- `503`: Redis unhealthy or not configured

### Database Health Check

**Endpoint**: `GET /health/database`

**Implementation**:
```javascript
router.get('/health/database', async (req, res) => {
  try {
    const mongoose = require('mongoose');

    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        status: 'unhealthy',
        message: 'Database not connected',
        timestamp: new Date().toISOString()
      });
    }

    // Test query
    const start = Date.now();
    await mongoose.connection.db.admin().ping();
    const latency = Date.now() - start;

    res.json({
      status: 'healthy',
      latency: `${latency}ms`,
      readyState: mongoose.connection.readyState,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});
```

---

## Log Aggregation

### Railway Logs

**Access**:
```bash
# View live logs
railway logs --tail

# View logs for specific service
railway logs --service=web

# Filter logs
railway logs --tail | grep ERROR
railway logs --tail | grep WebSocket
```

### Structured Logging

Update `src/utils/logger.js`:

```javascript
const logger = {
  info: (message, meta = {}) => {
    console.log(JSON.stringify({
      level: 'info',
      message,
      ...meta,
      timestamp: new Date().toISOString()
    }));
  },

  warn: (message, meta = {}) => {
    console.warn(JSON.stringify({
      level: 'warn',
      message,
      ...meta,
      timestamp: new Date().toISOString()
    }));
  },

  error: (message, error = {}) => {
    console.error(JSON.stringify({
      level: 'error',
      message,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    }));
  },

  debug: (message, meta = {}) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(JSON.stringify({
        level: 'debug',
        message,
        ...meta,
        timestamp: new Date().toISOString()
      }));
    }
  }
};

module.exports = logger;
```

### Log Levels

- **ERROR**: Critical errors requiring immediate attention
- **WARN**: Warnings that should be investigated
- **INFO**: General informational messages
- **DEBUG**: Detailed debugging information (dev only)

---

## Error Tracking

### Sentry Integration (Optional)

**Install**:
```bash
npm install @sentry/node @sentry/profiling-node
```

**Initialize** (`src/index.js`):
```javascript
const Sentry = require('@sentry/node');
const { ProfilingIntegration } = require('@sentry/profiling-node');

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    integrations: [
      new ProfilingIntegration()
    ],
    tracesSampleRate: 1.0,
    profilesSampleRate: 1.0
  });

  logger.info('Sentry error tracking initialized');
}
```

**Error Handler Middleware**:
```javascript
// Add BEFORE other error handlers
app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());

// Add AFTER routes
app.use(Sentry.Handlers.errorHandler());
```

**Environment Variable**:
```bash
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
```

---

## Performance Monitoring

### Response Time Tracking

Add middleware to track API response times:

```javascript
// src/middleware/responseTime.js
const logger = require('../utils/logger');

module.exports = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;

    // Log slow requests
    if (duration > 1000) {
      logger.warn('Slow request detected', {
        method: req.method,
        url: req.url,
        duration: `${duration}ms`,
        statusCode: res.statusCode
      });
    }

    // Log all requests in dev
    if (process.env.NODE_ENV !== 'production') {
      logger.debug('Request completed', {
        method: req.method,
        url: req.url,
        duration: `${duration}ms`,
        statusCode: res.statusCode
      });
    }
  });

  next();
};
```

### WebSocket Performance Metrics

Track WebSocket event latency:

```javascript
// In event handlers
const handleEvent = async (socket, data) => {
  const start = Date.now();

  try {
    // Handle event
    await processEvent(data);

    const duration = Date.now() - start;

    if (duration > 500) {
      logger.warn('Slow WebSocket event', {
        event: 'portfolio:subscribe',
        userId: socket.handshake.auth.userId,
        duration: `${duration}ms`
      });
    }
  } catch (error) {
    logger.error('WebSocket event error', error);
  }
};
```

---

## Alerting

### Railway Webhooks

Configure webhooks in Railway dashboard:

1. **Project Settings** → **Webhooks**
2. **Add Webhook**:
   - URL: Your Slack/Discord webhook URL
   - Events: Deployment failures, service crashes

### Slack Notifications

**Setup**:
1. Create Slack incoming webhook: https://api.slack.com/messaging/webhooks
2. Add to Railway environment: `SLACK_WEBHOOK=https://hooks.slack.com/...`

**Implementation** (`src/utils/alerts.js`):
```javascript
const axios = require('axios');

const sendSlackAlert = async (message, severity = 'warning') => {
  if (!process.env.SLACK_WEBHOOK) {
    return;
  }

  const color = {
    critical: '#FF0000',
    warning: '#FFA500',
    info: '#0000FF'
  }[severity] || '#808080';

  try {
    await axios.post(process.env.SLACK_WEBHOOK, {
      attachments: [{
        color,
        text: message,
        footer: 'Discord Trade Exec',
        ts: Math.floor(Date.now() / 1000)
      }]
    });
  } catch (error) {
    console.error('Failed to send Slack alert:', error);
  }
};

module.exports = { sendSlackAlert };
```

### Alert Conditions

```javascript
// src/utils/monitoring.js
const { sendSlackAlert } = require('./alerts');

// Monitor Redis connection
setInterval(async () => {
  try {
    const redis = new Redis(process.env.REDIS_URL);
    await redis.ping();
    await redis.quit();
  } catch (error) {
    await sendSlackAlert(
      '🚨 Redis connection failed: ' + error.message,
      'critical'
    );
  }
}, 60000); // Check every minute

// Monitor memory usage
setInterval(() => {
  const memoryUsage = process.memoryUsage();
  const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
  const heapTotalMB = memoryUsage.heapTotal / 1024 / 1024;
  const usagePercent = (heapUsedMB / heapTotalMB) * 100;

  if (usagePercent > 90) {
    sendSlackAlert(
      `⚠️ High memory usage: ${usagePercent.toFixed(1)}% (${heapUsedMB.toFixed(0)}MB / ${heapTotalMB.toFixed(0)}MB)`,
      'warning'
    );
  }
}, 300000); // Check every 5 minutes
```

---

## Dashboards

### Railway Dashboard

**Default Views**:
- **Metrics**: CPU, Memory, Network, Deployments
- **Logs**: Real-time log streaming
- **Deployments**: Deployment history and status
- **Settings**: Environment variables, domains

### Custom Metrics Dashboard

Create `public/dashboard/metrics.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <title>WebSocket Metrics</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
  <h1>WebSocket Server Metrics</h1>

  <div>
    <h2>Active Connections</h2>
    <canvas id="connectionsChart"></canvas>
  </div>

  <div>
    <h2>Memory Usage</h2>
    <canvas id="memoryChart"></canvas>
  </div>

  <script>
    // Fetch metrics every 5 seconds
    setInterval(async () => {
      const response = await fetch('/metrics');
      const metrics = await response.json();

      // Update charts with metrics
      updateCharts(metrics);
    }, 5000);
  </script>
</body>
</html>
```

---

## Troubleshooting

### High Memory Usage

**Check**:
```bash
railway logs --tail | grep "memory"
curl https://your-app.railway.app/metrics
```

**Solutions**:
- Restart service: `railway restart`
- Check for memory leaks in code
- Increase Railway memory limit
- Optimize WebSocket connection pooling

### Redis Connection Issues

**Check**:
```bash
curl https://your-app.railway.app/health/redis
railway run redis-cli -u $REDIS_URL ping
```

**Solutions**:
- Verify REDIS_URL is set correctly
- Check Redis service status in Railway
- Verify network connectivity
- Check Redis connection pool settings

### High CPU Usage

**Check**:
- Railway dashboard CPU metrics
- Application logs for performance warnings

**Solutions**:
- Optimize event handlers
- Reduce polling frequency
- Use Redis adapter for horizontal scaling
- Add more Railway instances

### Deployment Failures

**Check**:
```bash
railway logs
railway deployments
```

**Solutions**:
- Review build logs
- Check environment variables
- Verify dependencies installed
- Run tests locally first

---

## Quick Reference

### Monitoring Commands

```bash
# View live logs
railway logs --tail

# View metrics
curl https://your-app.railway.app/metrics

# Check health
curl https://your-app.railway.app/health
curl https://your-app.railway.app/health/redis

# View Railway status
railway status

# Check Redis
railway run redis-cli -u $REDIS_URL info

# View recent deployments
railway deployments
```

### Alert Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| CPU Usage | > 70% | > 90% |
| Memory Usage | > 80% | > 95% |
| Error Rate | > 1% | > 5% |
| Response Time P95 | > 500ms | > 2000ms |
| Redis Latency | > 100ms | > 500ms |
| Active Connections | > 5000 | > 10000 |

---

## Additional Resources

- **Railway Monitoring**: https://docs.railway.app/develop/observability
- **Sentry Documentation**: https://docs.sentry.io/platforms/node/
- **Slack Webhooks**: https://api.slack.com/messaging/webhooks
- **WebSocket Monitoring**: https://socket.io/docs/v4/monitoring/
