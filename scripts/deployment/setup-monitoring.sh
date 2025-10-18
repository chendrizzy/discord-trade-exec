#!/bin/bash

# DataDog Monitoring Setup Script
# Automates Phase 4.1: Set Up DataDog Monitoring

set -e

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=================================${NC}"
echo -e "${BLUE}DataDog Monitoring Setup${NC}"
echo -e "${BLUE}=================================${NC}"
echo ""

# Check for required environment variables
if [ -z "$DD_API_KEY" ]; then
    echo -e "${RED}✗ DD_API_KEY not set${NC}"
    echo "Please set your DataDog API key:"
    echo "  export DD_API_KEY=<your-api-key>"
    exit 1
fi

if [ -z "$DD_SITE" ]; then
    echo -e "${YELLOW}⚠ DD_SITE not set, using default: datadoghq.com${NC}"
    export DD_SITE="datadoghq.com"
fi

echo -e "${GREEN}✓ Environment variables configured${NC}"
echo ""

# Install DataDog Agent
echo -e "${BLUE}⏳ Installing DataDog Agent...${NC}"
if command -v datadog-agent &> /dev/null; then
    echo -e "${YELLOW}  DataDog Agent already installed${NC}"
else
    DD_API_KEY=$DD_API_KEY DD_SITE=$DD_SITE bash -c "$(curl -L https://s3.amazonaws.com/dd-agent/scripts/install_script.sh)"
    echo -e "${GREEN}✓ DataDog Agent installed${NC}"
fi
echo ""

# Configure broker integrations monitoring
echo -e "${BLUE}⏳ Configuring broker integrations monitoring...${NC}"
cat > /etc/datadog-agent/conf.d/broker_integrations.yaml << EOF
init_config:

instances:
  - host: localhost
    port: 3000
    tags:
      - env:${DD_ENV:-production}
      - service:broker-integrations
      - team:trading-platform
    timeout: 5

logs:
  - type: file
    path: /var/log/broker-integrations/*.log
    service: broker-integrations
    source: nodejs
    tags:
      - env:${DD_ENV:-production}
EOF

echo -e "${GREEN}✓ Broker integrations configuration created${NC}"
echo ""

# Create custom dashboard
echo -e "${BLUE}⏳ Creating DataDog dashboard...${NC}"

DASHBOARD_JSON=$(cat <<'EOF_DASH'
{
  "title": "Broker Integrations - Production Monitoring",
  "description": "Monitor broker connections, order execution, and system health",
  "widgets": [
    {
      "definition": {
        "type": "timeseries",
        "title": "Broker Connection Success Rate (%)",
        "requests": [{
          "q": "sum:broker.connection.success{*}.as_count() / sum:broker.connection.attempt{*}.as_count() * 100",
          "display_type": "line",
          "style": {
            "palette": "dog_classic",
            "line_type": "solid",
            "line_width": "normal"
          }
        }],
        "yaxis": { "min": "0", "max": "100", "label": "Success Rate (%)" },
        "show_legend": true
      },
      "layout": { "x": 0, "y": 0, "width": 6, "height": 3 }
    },
    {
      "definition": {
        "type": "query_value",
        "title": "Active Broker Connections",
        "requests": [{
          "q": "sum:broker.connection.active{*}",
          "aggregator": "last"
        }],
        "autoscale": true,
        "precision": 0
      },
      "layout": { "x": 6, "y": 0, "width": 2, "height": 3 }
    },
    {
      "definition": {
        "type": "query_value",
        "title": "Error Rate (Last Hour)",
        "requests": [{
          "q": "(sum:broker.error{*}.as_count().rollup(sum, 3600) / sum:broker.request{*}.as_count().rollup(sum, 3600)) * 100",
          "aggregator": "last"
        }],
        "autoscale": true,
        "precision": 2,
        "custom_unit": "%"
      },
      "layout": { "x": 8, "y": 0, "width": 2, "height": 3 }
    },
    {
      "definition": {
        "type": "toplist",
        "title": "Order Execution by Broker",
        "requests": [{
          "q": "top(sum:broker.order.executed{*} by {broker}, 10, 'sum', 'desc')"
        }]
      },
      "layout": { "x": 0, "y": 3, "width": 5, "height": 3 }
    },
    {
      "definition": {
        "type": "timeseries",
        "title": "Order Execution Latency P95 (ms)",
        "requests": [{
          "q": "p95:broker.order.latency{*} by {broker}",
          "display_type": "line"
        }],
        "yaxis": { "min": "0", "label": "Latency (ms)" },
        "markers": [{
          "value": "y = 3000",
          "display_type": "error dashed",
          "label": "SLA Threshold (3s)"
        }]
      },
      "layout": { "x": 5, "y": 3, "width": 5, "height": 3 }
    },
    {
      "definition": {
        "type": "heatmap",
        "title": "Error Distribution",
        "requests": [{
          "q": "sum:broker.error{*} by {broker,error_type}"
        }]
      },
      "layout": { "x": 0, "y": 6, "width": 5, "height": 3 }
    },
    {
      "definition": {
        "type": "timeseries",
        "title": "Premium Tier Conversions (Attributed to Broker Integrations)",
        "requests": [{
          "q": "sum:subscription.created{tier:premium,attributed_feature:broker_integrations}.as_count()"
        }]
      },
      "layout": { "x": 5, "y": 6, "width": 5, "height": 3 }
    }
  ],
  "layout_type": "ordered"
}
EOF_DASH
)

# Create dashboard via API
DASHBOARD_RESPONSE=$(curl -X POST "https://api.${DD_SITE}/api/v1/dashboard" \
  -H "Content-Type: application/json" \
  -H "DD-API-KEY: ${DD_API_KEY}" \
  -d "$DASHBOARD_JSON" 2>/dev/null)

DASHBOARD_ID=$(echo $DASHBOARD_RESPONSE | grep -o '"id":"[^"]*' | cut -d'"' -f4)

if [ -n "$DASHBOARD_ID" ]; then
    echo -e "${GREEN}✓ Dashboard created: https://app.${DD_SITE}/dashboard/${DASHBOARD_ID}${NC}"
else
    echo -e "${YELLOW}⚠ Dashboard creation failed - may already exist or API error${NC}"
    echo "  Response: $DASHBOARD_RESPONSE"
fi
echo ""

# Create monitors/alerts
echo -e "${BLUE}⏳ Creating DataDog monitors...${NC}"

# Monitor 1: High connection failure rate
MONITOR_1=$(curl -X POST "https://api.${DD_SITE}/api/v1/monitor" \
  -H "Content-Type: application/json" \
  -H "DD-API-KEY: ${DD_API_KEY}" \
  -d '{
    "name": "Broker Connection Failure Rate High",
    "type": "metric alert",
    "query": "avg(last_5m):(sum:broker.connection.failure{*}.as_count() / sum:broker.connection.attempt{*}.as_count()) * 100 > 10",
    "message": "🚨 Broker connection failure rate above 10%\n\nCurrent: {{value}}%\n\nCheck broker API status and OAuth tokens.\n\n@slack-alerts-critical",
    "tags": ["env:production", "service:broker-integrations"],
    "options": {
      "thresholds": {
        "critical": 10,
        "warning": 5
      },
      "notify_no_data": false,
      "renotify_interval": 60
    }
  }' 2>/dev/null)

echo -e "${GREEN}✓ Monitor created: Broker Connection Failure Rate${NC}"

# Monitor 2: Order execution failures
MONITOR_2=$(curl -X POST "https://api.${DD_SITE}/api/v1/monitor" \
  -H "Content-Type: application/json" \
  -H "DD-API-KEY: ${DD_API_KEY}" \
  -d '{
    "name": "Order Execution Failures Spiking",
    "type": "metric alert",
    "query": "sum(last_5m):sum:broker.order.failed{*}.as_count() > 10",
    "message": "⚠️ Order execution failures detected\n\nFailed orders: {{value}}\n\nCheck broker API status and rate limiting.\n\n@slack-alerts-high @email-oncall",
    "tags": ["env:production", "service:broker-integrations"],
    "options": {
      "thresholds": {
        "critical": 10,
        "warning": 5
      },
      "notify_no_data": false,
      "renotify_interval": 30
    }
  }' 2>/dev/null)

echo -e "${GREEN}✓ Monitor created: Order Execution Failures${NC}"

# Monitor 3: High latency
MONITOR_3=$(curl -X POST "https://api.${DD_SITE}/api/v1/monitor" \
  -H "Content-Type: application/json" \
  -H "DD-API-KEY: ${DD_API_KEY}" \
  -d '{
    "name": "High Order Execution Latency",
    "type": "metric alert",
    "query": "avg(last_5m):p95:broker.order.latency{*} > 5000",
    "message": "📊 Order execution latency elevated\n\nP95 Latency: {{value}}ms (SLA: 3000ms)\n\n@slack-alerts-medium",
    "tags": ["env:production", "service:broker-integrations"],
    "options": {
      "thresholds": {
        "critical": 5000,
        "warning": 3000
      },
      "notify_no_data": false,
      "renotify_interval": 60
    }
  }' 2>/dev/null)

echo -e "${GREEN}✓ Monitor created: High Latency${NC}"

# Monitor 4: No broker activity
MONITOR_4=$(curl -X POST "https://api.${DD_SITE}/api/v1/monitor" \
  -H "Content-Type: application/json" \
  -H "DD-API-KEY: ${DD_API_KEY}" \
  -d '{
    "name": "No Broker Activity Detected",
    "type": "metric alert",
    "query": "sum(last_5m):sum:broker.request{*}.as_count().rollup(sum, 300) < 1",
    "message": "⏸️ No broker activity in last 5 minutes\n\nPossible service outage or all connections failed.\n\n@pagerduty-oncall @slack-alerts-critical",
    "tags": ["env:production", "service:broker-integrations"],
    "options": {
      "thresholds": {
        "critical": 0
      },
      "notify_no_data": true,
      "no_data_timeframe": 10,
      "renotify_interval": 15
    }
  }' 2>/dev/null)

echo -e "${GREEN}✓ Monitor created: No Activity${NC}"

echo ""

# Restart DataDog Agent
echo -e "${BLUE}⏳ Restarting DataDog Agent...${NC}"
sudo systemctl restart datadog-agent || sudo service datadog-agent restart
echo -e "${GREEN}✓ DataDog Agent restarted${NC}"
echo ""

# Verify agent status
echo -e "${BLUE}⏳ Verifying agent status...${NC}"
sudo datadog-agent status | head -20
echo ""

# Summary
echo -e "${GREEN}=================================${NC}"
echo -e "${GREEN}✓ Monitoring Setup Complete${NC}"
echo -e "${GREEN}=================================${NC}"
echo ""
echo "Dashboard: https://app.${DD_SITE}/dashboard/list"
echo "Monitors: https://app.${DD_SITE}/monitors/manage"
echo ""
echo "Next steps:"
echo "1. Configure Slack webhook for alerts"
echo "2. Configure PagerDuty integration"
echo "3. Verify metrics are flowing: sudo datadog-agent status"
echo "4. View dashboard in DataDog UI"
echo ""
echo "Logs location: /var/log/datadog/"
echo "Config location: /etc/datadog-agent/"
