#!/bin/bash
#
# Setup Automated Monitoring
# Configures cron jobs for infrastructure health monitoring
# Usage: ./scripts/monitoring/setup-monitoring.sh [--enable|--disable|--status]
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
HEALTH_CHECK_SCRIPT="$SCRIPT_DIR/health-check.sh"
CLEANUP_SCRIPT="$PROJECT_ROOT/scripts/cleanup-logs.sh"

# Default: enable monitoring
ACTION="enable"

# Parse command line arguments
if [[ $# -gt 0 ]]; then
  case $1 in
    --enable)
      ACTION="enable"
      ;;
    --disable)
      ACTION="disable"
      ;;
    --status)
      ACTION="status"
      ;;
    *)
      echo "Usage: $0 [--enable|--disable|--status]"
      exit 1
      ;;
  esac
fi

# Cron job definitions
HEALTH_CHECK_CRON="0 */6 * * * cd $PROJECT_ROOT && $HEALTH_CHECK_SCRIPT >> $PROJECT_ROOT/logs/monitoring/health-check.log 2>&1"
CLEANUP_CRON="0 2 * * 0 cd $PROJECT_ROOT && $CLEANUP_SCRIPT >> $PROJECT_ROOT/logs/monitoring/cleanup.log 2>&1"

enable_monitoring() {
  echo "📊 Enabling infrastructure monitoring..."

  # Create log directory
  mkdir -p "$PROJECT_ROOT/logs/monitoring"

  # Check if cron jobs already exist
  if crontab -l 2>/dev/null | grep -q "$HEALTH_CHECK_SCRIPT"; then
    echo "⚠️  Health check cron job already exists"
  else
    # Add health check cron job (every 6 hours)
    (crontab -l 2>/dev/null; echo "$HEALTH_CHECK_CRON") | crontab -
    echo "✅ Added health check cron job (runs every 6 hours)"
  fi

  if crontab -l 2>/dev/null | grep -q "$CLEANUP_SCRIPT"; then
    echo "⚠️  Cleanup cron job already exists"
  else
    # Add cleanup cron job (weekly on Sunday at 2am)
    (crontab -l 2>/dev/null; echo "$CLEANUP_CRON") | crontab -
    echo "✅ Added cleanup cron job (runs weekly on Sunday at 2am)"
  fi

  echo ""
  echo "🎯 Monitoring enabled! Health checks will run every 6 hours."
  echo "📁 Logs: $PROJECT_ROOT/logs/monitoring/"
  echo ""
  echo "Manual commands:"
  echo "  npm run monitoring:health  # Run health check now"
  echo "  npm run monitoring:status  # View cron job status"
  echo "  npm run monitoring:disable # Disable monitoring"
}

disable_monitoring() {
  echo "🛑 Disabling infrastructure monitoring..."

  # Remove health check cron job
  if crontab -l 2>/dev/null | grep -q "$HEALTH_CHECK_SCRIPT"; then
    crontab -l 2>/dev/null | grep -v "$HEALTH_CHECK_SCRIPT" | crontab -
    echo "✅ Removed health check cron job"
  else
    echo "⚠️  Health check cron job not found"
  fi

  # Remove cleanup cron job
  if crontab -l 2>/dev/null | grep -q "$CLEANUP_SCRIPT"; then
    crontab -l 2>/dev/null | grep -v "$CLEANUP_SCRIPT" | crontab -
    echo "✅ Removed cleanup cron job"
  else
    echo "⚠️  Cleanup cron job not found"
  fi

  echo ""
  echo "Monitoring disabled. Health checks and automated cleanup stopped."
}

show_status() {
  echo "📊 Infrastructure Monitoring Status"
  echo "===================================="
  echo ""

  # Check health check cron job
  if crontab -l 2>/dev/null | grep -q "$HEALTH_CHECK_SCRIPT"; then
    echo "✅ Health Check: ENABLED (every 6 hours)"
    echo "   Schedule: $(crontab -l 2>/dev/null | grep "$HEALTH_CHECK_SCRIPT" | awk '{print $1,$2,$3,$4,$5}')"
  else
    echo "❌ Health Check: DISABLED"
  fi

  # Check cleanup cron job
  if crontab -l 2>/dev/null | grep -q "$CLEANUP_SCRIPT"; then
    echo "✅ Log Cleanup: ENABLED (weekly Sunday 2am)"
    echo "   Schedule: $(crontab -l 2>/dev/null | grep "$CLEANUP_SCRIPT" | awk '{print $1,$2,$3,$4,$5}')"
  else
    echo "❌ Log Cleanup: DISABLED"
  fi

  echo ""
  echo "Recent Health Reports:"
  if [[ -d "$PROJECT_ROOT/logs/monitoring" ]]; then
    ls -lt "$PROJECT_ROOT/logs/monitoring/health-report-"* 2>/dev/null | head -5 | while read -r line; do
      echo "  $line"
    done
  else
    echo "  (none)"
  fi

  echo ""
  echo "Recent Alerts:"
  if [[ -f "$PROJECT_ROOT/logs/monitoring/alerts.log" ]]; then
    tail -5 "$PROJECT_ROOT/logs/monitoring/alerts.log"
  else
    echo "  (none)"
  fi
}

# Main execution
case $ACTION in
  enable)
    enable_monitoring
    ;;
  disable)
    disable_monitoring
    ;;
  status)
    show_status
    ;;
esac
