#!/bin/bash
#
# Infrastructure Health Check Script
# Monitors disk space, memory usage, and test execution health
# Usage: ./scripts/monitoring/health-check.sh [--alert-email EMAIL] [--slack-webhook URL]
#

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_DIR="$PROJECT_ROOT/logs/monitoring"
ALERT_LOG="$LOG_DIR/alerts.log"

# Thresholds
DISK_USAGE_THRESHOLD=90      # Alert if disk usage > 90%
MEMORY_USAGE_THRESHOLD=85    # Alert if memory usage > 85%
TEST_FAILURE_THRESHOLD=10    # Alert if test failures > 10%
LOG_SIZE_THRESHOLD=1024      # Alert if log directory > 1GB

# Alert channels
ALERT_EMAIL=""
SLACK_WEBHOOK=""

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --alert-email)
      ALERT_EMAIL="$2"
      shift 2
      ;;
    --slack-webhook)
      SLACK_WEBHOOK="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Create log directory if it doesn't exist
mkdir -p "$LOG_DIR"

# Logging functions
log_info() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] INFO: $1"
}

log_warning() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARNING: $1"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARNING: $1" >> "$ALERT_LOG"
}

log_error() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" >> "$ALERT_LOG"
}

# Alert functions
send_alert() {
  local severity="$1"
  local message="$2"

  # Log to alert file
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$severity] $message" >> "$ALERT_LOG"

  # Send email if configured
  if [[ -n "$ALERT_EMAIL" ]]; then
    echo "$message" | mail -s "[$severity] Infrastructure Alert" "$ALERT_EMAIL" 2>/dev/null || true
  fi

  # Send Slack notification if configured
  if [[ -n "$SLACK_WEBHOOK" ]]; then
    curl -X POST "$SLACK_WEBHOOK" \
      -H 'Content-Type: application/json' \
      -d "{\"text\":\"[$severity] $message\"}" \
      2>/dev/null || true
  fi
}

# Health check functions
check_disk_space() {
  log_info "Checking disk space..."

  # Get disk usage percentage (cross-platform)
  if [[ "$(uname)" == "Darwin" ]]; then
    # macOS
    DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
  else
    # Linux
    DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
  fi

  log_info "Disk usage: ${DISK_USAGE}%"

  if (( DISK_USAGE > DISK_USAGE_THRESHOLD )); then
    log_error "Disk usage ${DISK_USAGE}% exceeds threshold ${DISK_USAGE_THRESHOLD}%"
    send_alert "CRITICAL" "Disk usage ${DISK_USAGE}% exceeds threshold ${DISK_USAGE_THRESHOLD}%"
    return 1
  elif (( DISK_USAGE > DISK_USAGE_THRESHOLD - 10 )); then
    log_warning "Disk usage ${DISK_USAGE}% approaching threshold ${DISK_USAGE_THRESHOLD}%"
    send_alert "WARNING" "Disk usage ${DISK_USAGE}% approaching threshold ${DISK_USAGE_THRESHOLD}%"
  fi

  return 0
}

check_memory_usage() {
  log_info "Checking memory usage..."

  # Get memory usage percentage (cross-platform)
  if [[ "$(uname)" == "Darwin" ]]; then
    # macOS
    MEMORY_USAGE=$(ps -A -o %mem | awk '{s+=$1} END {print s}')
    MEMORY_USAGE=$(printf "%.0f" "$MEMORY_USAGE")
  else
    # Linux
    MEMORY_USAGE=$(free | grep Mem | awk '{print ($3/$2) * 100.0}')
    MEMORY_USAGE=$(printf "%.0f" "$MEMORY_USAGE")
  fi

  log_info "Memory usage: ${MEMORY_USAGE}%"

  if (( MEMORY_USAGE > MEMORY_USAGE_THRESHOLD )); then
    log_error "Memory usage ${MEMORY_USAGE}% exceeds threshold ${MEMORY_USAGE_THRESHOLD}%"
    send_alert "CRITICAL" "Memory usage ${MEMORY_USAGE}% exceeds threshold ${MEMORY_USAGE_THRESHOLD}%"
    return 1
  elif (( MEMORY_USAGE > MEMORY_USAGE_THRESHOLD - 10 )); then
    log_warning "Memory usage ${MEMORY_USAGE}% approaching threshold ${MEMORY_USAGE_THRESHOLD}%"
  fi

  return 0
}

check_log_directory_size() {
  log_info "Checking log directory size..."

  if [[ ! -d "$PROJECT_ROOT/logs" ]]; then
    log_info "Log directory does not exist"
    return 0
  fi

  # Get log directory size in MB (cross-platform)
  if [[ "$(uname)" == "Darwin" ]]; then
    # macOS
    LOG_SIZE=$(du -sm "$PROJECT_ROOT/logs" | awk '{print $1}')
  else
    # Linux
    LOG_SIZE=$(du -sm "$PROJECT_ROOT/logs" | awk '{print $1}')
  fi

  log_info "Log directory size: ${LOG_SIZE}MB"

  if (( LOG_SIZE > LOG_SIZE_THRESHOLD )); then
    log_warning "Log directory size ${LOG_SIZE}MB exceeds threshold ${LOG_SIZE_THRESHOLD}MB"
    send_alert "WARNING" "Log directory size ${LOG_SIZE}MB exceeds threshold ${LOG_SIZE_THRESHOLD}MB. Consider running cleanup script."

    # List largest log files
    log_info "Largest log files:"
    find "$PROJECT_ROOT/logs" -type f -exec du -sm {} + | sort -rn | head -5
  fi

  return 0
}

check_test_execution_health() {
  log_info "Checking recent test execution health..."

  # Check if we have a recent test results file
  if [[ ! -f "/tmp/test-results.txt" ]]; then
    log_info "No recent test results found"
    return 0
  fi

  # Parse test results
  if grep -q "Tests:.*failed" "/tmp/test-results.txt"; then
    FAILED_TESTS=$(grep -oP "Tests:.*\K\d+(?= failed)" "/tmp/test-results.txt" | head -1 || echo "0")
    TOTAL_TESTS=$(grep -oP "Tests:.*\K\d+(?= total)" "/tmp/test-results.txt" | head -1 || echo "0")

    log_info "Test results: ${FAILED_TESTS}/${TOTAL_TESTS} failed"

    if (( FAILED_TESTS > TEST_FAILURE_THRESHOLD )); then
      log_error "Test failures ${FAILED_TESTS} exceed threshold ${TEST_FAILURE_THRESHOLD}"
      send_alert "HIGH" "Test failures ${FAILED_TESTS}/${TOTAL_TESTS} exceed threshold ${TEST_FAILURE_THRESHOLD}"
      return 1
    elif (( FAILED_TESTS > 0 )); then
      log_warning "Test failures detected: ${FAILED_TESTS}/${TOTAL_TESTS}"
    fi
  fi

  return 0
}

check_node_processes() {
  log_info "Checking for zombie Node.js processes..."

  # Find long-running Node.js test processes
  if [[ "$(uname)" == "Darwin" ]]; then
    # macOS
    ZOMBIE_PROCESSES=$(ps aux | grep '[n]ode.*jest' | awk '$10 ~ /[0-9]+:[0-9]+/ {print $2}')
  else
    # Linux
    ZOMBIE_PROCESSES=$(ps aux | grep '[n]ode.*jest' | awk '$10 ~ /[0-9]+:[0-9]+/ {print $2}')
  fi

  if [[ -n "$ZOMBIE_PROCESSES" ]]; then
    log_warning "Found potential zombie Node.js processes:"
    echo "$ZOMBIE_PROCESSES" | while read -r pid; do
      log_warning "  PID $pid - $(ps -p $pid -o etime= 2>/dev/null || echo 'unknown')"
    done
    send_alert "WARNING" "Found zombie Node.js test processes. Consider manual cleanup."
  else
    log_info "No zombie processes detected"
  fi

  return 0
}

check_mongodb_connection() {
  log_info "Checking MongoDB connection..."

  # Check if MongoDB is accessible
  if command -v mongosh &> /dev/null; then
    if timeout 5s mongosh --eval "db.runCommand({ ping: 1 })" "$MONGODB_URI" &> /dev/null; then
      log_info "MongoDB connection: OK"
      return 0
    else
      log_error "MongoDB connection: FAILED"
      send_alert "HIGH" "MongoDB connection failed. Tests may fail."
      return 1
    fi
  else
    log_info "mongosh not available, skipping MongoDB check"
    return 0
  fi
}

# Generate summary report
generate_summary() {
  local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
  local report_file="$LOG_DIR/health-report-$(date '+%Y%m%d-%H%M%S').txt"

  cat > "$report_file" <<EOF
Infrastructure Health Check Report
Generated: $timestamp

System Information:
- OS: $(uname -s)
- Hostname: $(hostname)
- Uptime: $(uptime | awk -F'up ' '{print $2}' | awk -F',' '{print $1}')

Disk Space:
- Usage: ${DISK_USAGE}%
- Threshold: ${DISK_USAGE_THRESHOLD}%
- Status: $([ $DISK_USAGE -lt $DISK_USAGE_THRESHOLD ] && echo "OK" || echo "WARNING")

Memory:
- Usage: ${MEMORY_USAGE}%
- Threshold: ${MEMORY_USAGE_THRESHOLD}%
- Status: $([ $MEMORY_USAGE -lt $MEMORY_USAGE_THRESHOLD ] && echo "OK" || echo "WARNING")

Log Directory:
- Size: ${LOG_SIZE}MB
- Threshold: ${LOG_SIZE_THRESHOLD}MB
- Status: $([ $LOG_SIZE -lt $LOG_SIZE_THRESHOLD ] && echo "OK" || echo "WARNING")

Test Health:
- Recent failures: ${FAILED_TESTS:-0}/${TOTAL_TESTS:-0}
- Threshold: ${TEST_FAILURE_THRESHOLD}
- Status: $([ ${FAILED_TESTS:-0} -lt $TEST_FAILURE_THRESHOLD ] && echo "OK" || echo "WARNING")

Recent Alerts:
$(tail -10 "$ALERT_LOG" 2>/dev/null || echo "No alerts")

---
Report saved to: $report_file
EOF

  log_info "Summary report saved to: $report_file"
}

# Main execution
main() {
  log_info "=== Infrastructure Health Check Started ==="

  local exit_code=0

  check_disk_space || exit_code=1
  check_memory_usage || exit_code=1
  check_log_directory_size || exit_code=1
  check_test_execution_health || exit_code=1
  check_node_processes || exit_code=1
  check_mongodb_connection || exit_code=1

  generate_summary

  log_info "=== Infrastructure Health Check Completed ==="

  if (( exit_code == 0 )); then
    log_info "All health checks passed ✅"
  else
    log_error "Some health checks failed ❌"
  fi

  return $exit_code
}

# Run main function
main "$@"
