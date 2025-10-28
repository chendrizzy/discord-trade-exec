# Railway Monitoring Setup Guide

## Overview

This guide documents the setup of performance monitoring for the Discord Trade Executor application deployed on Railway, using:
- **Prometheus**: Metrics collection and storage
- **Grafana**: Metrics visualization and alerting
- **Railway Metrics**: Built-in platform monitoring

## Architecture

```
┌─────────────────┐
│ Railway App     │
│ (Node.js)       │
│                 │
│ /api/metrics/   │◄─────┐
│ export          │      │
└─────────────────┘      │
                         │ Scrape
┌─────────────────┐      │ (every 30s)
│ Prometheus      │──────┘
│ (Railway        │
│  Service)       │
└────────┬────────┘
         │ Query
         ▼
┌─────────────────┐
│ Grafana         │
│ (Railway        │
│  Service)       │
└─────────────────┘
```

## Prerequisites

1. Application deployed on Railway
2. Admin credentials for accessing metrics endpoints
3. Railway project with deployment access

## Part 1: Railway Built-in Monitoring

### 1.1 View Railway Metrics

Railway provides built-in metrics accessible through the dashboard:

1. Navigate to your project on Railway: https://railway.app/project/[your-project-id]
2. Click on your service deployment
3. Go to the **Metrics** tab

**Available Metrics:**
- CPU usage (%)
- Memory usage (MB)
- Network I/O (bytes/s)
- Request count
- Response times (p50/p95/p99)

**Setting Alerts:**
1. Navigate to **Settings** → **Alerts**
2. Configure thresholds:
   - CPU > 80% for 5 minutes
   - Memory > 90% for 5 minutes
   - High error rate (>5% for 5 minutes)

### 1.2 Configure Health Checks

Railway automatically monitors your application's health endpoint:

1. In `railway.toml`, ensure health check is configured:
   ```toml
   [deploy]
   healthcheckPath = "/health"
   healthcheckTimeout = 30
   ```

2. Application provides `/health` endpoint that returns:
   ```json
   {
     "status": "healthy",
     "timestamp": "2024-10-27T22:00:00.000Z",
     "uptime": 3600
   }
   ```

## Part 2: Prometheus Setup on Railway

### 2.1 Deploy Prometheus as Railway Service

1. **Create new service in Railway:**
   ```bash
   railway add
   # Select "Empty Service"
   ```

2. **Configure Prometheus using Railway Template:**
   - Use the official Prometheus Docker image
   - Set deployment configuration in Railway dashboard:
     - **Image**: `prom/prometheus:latest`
     - **Port**: 9090
     - **Volume**: `/prometheus` (for data persistence)

3. **Create Prometheus configuration:**

   Create `prometheus.yml` in your repository:

   ```yaml
   global:
     scrape_interval: 30s
     evaluation_interval: 30s
     external_labels:
       monitor: 'discord-trade-executor'
       environment: 'production'

   scrape_configs:
     - job_name: 'discord-trade-executor'
       scheme: https
       metrics_path: '/api/metrics/export'
       basic_auth:
         username: 'admin'
         password: '$ADMIN_PASSWORD'
       static_configs:
         - targets:
           - '$APP_URL'  # e.g., 'your-app.up.railway.app'

       scrape_interval: 30s
       scrape_timeout: 10s

   # Alert rules
   rule_files:
     - '/etc/prometheus/alert.rules.yml'

   # Alertmanager configuration (optional)
   alerting:
     alertmanagers:
       - static_configs:
           - targets:
             - 'alertmanager:9093'
   ```

4. **Create alert rules** (`alert.rules.yml`):

   ```yaml
   groups:
     - name: performance_alerts
       interval: 1m
       rules:
         - alert: HighResponseTime
           expr: discord_webhooks_response_time_p95 > 200
           for: 5m
           labels:
             severity: warning
           annotations:
             summary: "High p95 response time detected"
             description: "p95 response time is {{ $value }}ms"

         - alert: SlowDatabaseQueries
           expr: discord_database_query_time_p95 > 2000
           for: 5m
           labels:
             severity: critical
           annotations:
             summary: "Slow database queries detected"
             description: "p95 query time is {{ $value }}ms"

         - alert: LowSuccessRate
           expr: discord_trades_success_rate < 0.95
           for: 5m
           labels:
             severity: critical
           annotations:
             summary: "Trade success rate below 95%"
             description: "Success rate is {{ $value | humanizePercentage }}"
   ```

5. **Set Railway environment variables for Prometheus:**
   ```
   APP_URL=your-app.up.railway.app
   ADMIN_PASSWORD=[your-admin-password]
   ```

### 2.2 Verify Prometheus Data Collection

1. Access Prometheus UI: `https://[prometheus-service].up.railway.app:9090`
2. Check targets status: **Status** → **Targets**
3. Verify metrics are being scraped (should show "UP" status)
4. Query sample metrics:
   ```promql
   discord_webhooks_response_time_p95
   discord_trades_success_rate
   discord_system_uptime_seconds
   ```

## Part 3: Grafana Setup on Railway

### 3.1 Deploy Grafana as Railway Service

1. **Create new service:**
   ```bash
   railway add
   # Select "Grafana" from templates or use Docker image
   ```

2. **Configure Grafana deployment:**
   - **Image**: `grafana/grafana:latest`
   - **Port**: 3000
   - **Volume**: `/var/lib/grafana` (for persistence)

3. **Set Railway environment variables:**
   ```
   GF_SECURITY_ADMIN_USER=admin
   GF_SECURITY_ADMIN_PASSWORD=[strong-password]
   GF_SERVER_ROOT_URL=https://[grafana-service].up.railway.app
   GF_INSTALL_PLUGINS=grafana-piechart-panel
   ```

### 3.2 Configure Prometheus Data Source

1. Access Grafana: `https://[grafana-service].up.railway.app`
2. Log in with admin credentials
3. Navigate to **Configuration** → **Data Sources**
4. Click **Add data source** → Select **Prometheus**
5. Configure:
   - **Name**: `Discord Trade Executor Metrics`
   - **URL**: `http://[prometheus-service]:9090` (internal Railway URL)
   - **Access**: `Server (default)`
   - Click **Save & Test**

### 3.3 Import Dashboard

1. Navigate to **Dashboards** → **Import**
2. Upload `docs/monitoring/grafana-dashboard.json`
3. Select Prometheus data source
4. Click **Import**

The dashboard includes:
- **HTTP Response Times** (p50/p95/p99 with p95>200ms alert)
- **System Resource Usage** (memory, CPU)
- **Success Rate Stats** (webhooks, trades, database)
- **Trade Execution Performance**
- **Database Query Performance** (with p95>2000ms alert)
- **API Call Performance**
- **Request Failures Over Time**
- **Current Metrics Summary**

### 3.4 Configure Grafana Alerts

Grafana dashboards include pre-configured alerts:

1. **High p95 Response Time**
   - Condition: p95 > 200ms for 5 minutes
   - Action: Send notification

2. **Slow Database Queries**
   - Condition: p95 query time > 2000ms for 5 minutes
   - Action: Send critical alert

**To enable notifications:**
1. Navigate to **Alerting** → **Contact points**
2. Add contact point (Slack, Email, PagerDuty, etc.)
3. Link contact points to alert rules

## Part 4: Application Metrics Endpoint

The application exposes Prometheus-formatted metrics at:

```
GET /api/metrics/export
Authorization: Bearer [admin-token]
```

**Exported Metrics:**

| Metric | Type | Description |
|--------|------|-------------|
| `discord_webhooks_total` | Counter | Total webhook requests |
| `discord_webhooks_successful` | Counter | Successful webhooks |
| `discord_webhooks_failed` | Counter | Failed webhooks |
| `discord_webhooks_success_rate` | Gauge | Webhook success rate (0-1) |
| `discord_webhooks_response_time_avg` | Gauge | Average response time (ms) |
| `discord_webhooks_response_time_p50` | Gauge | p50 response time (ms) |
| `discord_webhooks_response_time_p95` | Gauge | p95 response time (ms) |
| `discord_webhooks_response_time_p99` | Gauge | p99 response time (ms) |
| `discord_trades_*` | Various | Trade execution metrics |
| `discord_database_*` | Various | Database performance metrics |
| `discord_api_*` | Various | External API call metrics |
| `discord_system_uptime_seconds` | Counter | Application uptime |
| `discord_system_memory_*` | Gauge | Memory usage metrics |
| `discord_system_cpu_*` | Gauge | CPU usage metrics |
| `discord_system_active_requests` | Gauge | Active HTTP requests |

## Part 5: Troubleshooting

### Issue: Prometheus Cannot Scrape Metrics

**Symptoms:**
- Target shows "DOWN" status in Prometheus
- No data appearing in Grafana

**Solutions:**
1. Verify application health: `curl https://[app-url]/health`
2. Check admin authentication:
   ```bash
   curl -H "Authorization: Bearer [token]" \
     https://[app-url]/api/metrics/export
   ```
3. Verify Railway network connectivity between services
4. Check Prometheus logs: `railway logs --service prometheus`

### Issue: Grafana Shows "No Data"

**Symptoms:**
- Dashboard panels display "No data"
- Queries return empty results

**Solutions:**
1. Verify Prometheus data source is connected
2. Check metric names in queries match exported metrics
3. Adjust time range (try "Last 1 hour")
4. Verify Prometheus is successfully scraping:
   ```promql
   up{job="discord-trade-executor"}
   ```

### Issue: High Memory Usage in Prometheus

**Symptoms:**
- Prometheus service crashes or restarts
- Railway shows memory limit exceeded

**Solutions:**
1. Reduce `scrape_interval` in `prometheus.yml` (e.g., 1m → 5m)
2. Limit retention period:
   ```yaml
   storage:
     tsdb:
       retention.time: 7d
   ```
3. Increase Railway memory allocation for Prometheus service

### Issue: Alerts Not Firing

**Symptoms:**
- Metrics show issues but no alerts received
- Alert rules show "Pending" but never "Firing"

**Solutions:**
1. Check alert evaluation interval in `prometheus.yml`
2. Verify `for` duration in alert rules (reduce from 5m to 1m for testing)
3. Test alert expression in Prometheus query browser
4. Check Alertmanager configuration and connectivity

## Part 6: Best Practices

### 6.1 Security

1. **Protect metrics endpoints:**
   - Use admin-only authentication (implemented with `ensureAdmin`)
   - Rotate admin tokens regularly
   - Use Railway's built-in HTTPS

2. **Prometheus access control:**
   - Configure basic auth for Prometheus UI
   - Restrict Railway service access to authorized users
   - Use strong passwords stored in Railway secrets

### 6.2 Performance

1. **Optimize scrape frequency:**
   - Use 30s intervals for production
   - Use 5m intervals for low-traffic applications
   - Adjust based on data volume and costs

2. **Data retention:**
   - Keep 7-14 days for production
   - Archive older data to external storage if needed
   - Monitor Prometheus storage usage

### 6.3 Monitoring Coverage

Ensure monitoring covers:
- ✅ HTTP response times (p50/p95/p99)
- ✅ Trade execution performance
- ✅ Database query performance
- ✅ External API call latency
- ✅ System resource usage (CPU, memory)
- ✅ Error rates and success rates
- ✅ Active requests and request throughput

## Part 7: Cost Optimization

**Railway Resource Allocation:**

| Service | vCPU | Memory | Storage | Est. Monthly Cost |
|---------|------|--------|---------|-------------------|
| Application | 2 | 2GB | 1GB | Included in plan |
| Prometheus | 1 | 1GB | 5GB | $5-10 |
| Grafana | 1 | 512MB | 2GB | $5 |
| **Total** | | | | **$10-15/month** |

**Cost-Saving Tips:**
1. Use Railway's free tier for development/staging
2. Reduce scrape frequency for non-critical metrics
3. Limit Prometheus retention period
4. Consider managed alternatives (Grafana Cloud free tier)
5. Share Grafana/Prometheus across multiple projects

## Part 8: Additional Monitoring Endpoints

The application provides additional monitoring endpoints:

```
GET /api/metrics/performance  # p50/p95/p99 response times
GET /api/metrics/queries      # Slow query patterns
GET /api/metrics/health       # System health status
GET /api/metrics/webhooks     # Webhook-specific metrics
GET /api/metrics/trades       # Trade execution metrics
GET /api/metrics/database     # Database metrics
GET /api/metrics/api          # External API metrics
GET /api/metrics/system       # System resource metrics
```

All endpoints require admin authentication.

## Support

For issues or questions:
1. Check Railway documentation: https://docs.railway.app
2. Review application logs: `railway logs`
3. Check Prometheus/Grafana logs
4. Consult Grafana documentation: https://grafana.com/docs
5. Open issue in project repository

---

**Last Updated**: October 2024
**Task**: US6-T06-T10 (Excellence Remediation Spec)
**Version**: 1.0
