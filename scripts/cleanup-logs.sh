#!/bin/bash
# Log Cleanup Script
# Rotates and compresses old log files to free disk space

set -e

LOGS_DIR="./logs"
MAX_AGE_DAYS=7
BACKUP_DIR="${LOGS_DIR}/archive"

echo "🧹 Starting log cleanup..."

# Create archive directory if it doesn't exist
mkdir -p "${BACKUP_DIR}"

# Find logs older than MAX_AGE_DAYS and compress them
echo "📦 Archiving logs older than ${MAX_AGE_DAYS} days..."
find "${LOGS_DIR}" -name "*.log" -type f -mtime +${MAX_AGE_DAYS} -not -path "${BACKUP_DIR}/*" | while read -r logfile; do
  filename=$(basename "${logfile}")
  timestamp=$(date -r "${logfile}" "+%Y%m%d_%H%M%S" 2>/dev/null || stat -f "%Sm" -t "%Y%m%d_%H%M%S" "${logfile}")

  echo "  Compressing: ${filename} -> ${BACKUP_DIR}/${filename%.log}_${timestamp}.log.gz"
  gzip -c "${logfile}" > "${BACKUP_DIR}/${filename%.log}_${timestamp}.log.gz"

  # Truncate the original log file (keep for active logging)
  > "${logfile}"
done

# Remove compressed archives older than 30 days
echo "🗑️  Removing compressed archives older than 30 days..."
find "${BACKUP_DIR}" -name "*.log.gz" -type f -mtime +30 -delete

# Show disk space saved
echo ""
echo "✅ Log cleanup complete!"
echo ""
echo "Current log sizes:"
du -sh "${LOGS_DIR}"/*.log 2>/dev/null || echo "  No active log files"
echo ""
echo "Archive sizes:"
du -sh "${BACKUP_DIR}" 2>/dev/null || echo "  No archived logs"

echo ""
echo "💾 Disk space:"
df -h . | tail -1 | awk '{print "  Used: " $3 " / " $2 " (" $5 ")"}'
