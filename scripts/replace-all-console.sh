#!/bin/bash
#
# Comprehensive Console to Logger Replacement Script
# 
# This script replaces all console.log, console.error, and console.warn
# statements with structured logger calls across the entire codebase.
#

set -e

echo "🔍 Finding all files with console statements..."
FILES=$(find src -name "*.js" -type f -exec grep -l "console\.\(log\|error\|warn\)" {} \;)

if [ -z "$FILES" ]; then
  echo "✅ No console statements found!"
  exit 0
fi

TOTAL_FILES=$(echo "$FILES" | wc -l | tr -d ' ')
echo "📝 Found $TOTAL_FILES files with console statements"
echo ""

PROCESSED=0
TOTAL_REPLACEMENTS=0

for file in $FILES; do
  PROCESSED=$((PROCESSED + 1))
  echo "[$PROCESSED/$TOTAL_FILES] Processing: $file"
  
  # Check if logger is imported
  if ! grep -q "require('.*utils/logger')" "$file"; then
    # Find appropriate place to add import (after other requires)
    # Count the directory depth to determine the correct path
    DEPTH=$(echo "$file" | awk -F'/' '{print NF-2}')
    LOGGER_PATH=$(printf '../%.0s' $(seq 1 $DEPTH))utils/logger
    
    # Add logger import after the last require statement
    if grep -q "^const .* = require(" "$file"; then
      # Find the line number of the last require
      LAST_REQUIRE=$(grep -n "^const .* = require(" "$file" | tail -1 | cut -d: -f1)
      sed -i '' "${LAST_REQUIRE}a\\
const logger = require('${LOGGER_PATH}');\\
" "$file"
      echo "  ✅ Added logger import"
    fi
  fi
  
  # Count console statements before
  BEFORE=$(grep -c "console\.\(log\|error\|warn\)" "$file" || echo 0)
  
  # Replace console.error with full error object
  sed -i '' -E "s/console\.error\('([^']+)', error\);/logger.error('\1', { error: error.message, stack: error.stack });/g" "$file"
  sed -i '' -E 's/console\.error\("([^"]+)", error\);/logger.error("\1", { error: error.message, stack: error.stack });/g' "$file"
  
  # Replace console.error with string
  sed -i '' -E "s/console\.error\('([^']+)'\);/logger.error('\1');/g" "$file"
  sed -i '' -E 's/console\.error\("([^"]+)"\);/logger.error("\1");/g' "$file"
  
  # Replace console.log
  sed -i '' -E "s/console\.log\('([^']+)'\);/logger.info('\1');/g" "$file"
  sed -i '' -E 's/console\.log\("([^"]+)"\);/logger.info("\1");/g' "$file"
  
  # Replace console.warn
  sed -i '' -E "s/console\.warn\('([^']+)'\);/logger.warn('\1');/g" "$file"
  sed -i '' -E 's/console\.warn\("([^"]+)"\);/logger.warn("\1");/g' "$file"
  
  # Count remaining console statements
  AFTER=$(grep -c "console\.\(log\|error\|warn\)" "$file" || echo 0)
  REPLACED=$((BEFORE - AFTER))
  TOTAL_REPLACEMENTS=$((TOTAL_REPLACEMENTS + REPLACED))
  
  if [ $REPLACED -gt 0 ]; then
    echo "  ✅ Replaced $REPLACED console statements ($AFTER remaining)"
  fi
  
  if [ $AFTER -gt 0 ]; then
    echo "  ⚠️  Manual review needed for remaining $AFTER statements"
  fi
done

echo ""
echo "🎉 Complete!"
echo "   Files processed: $PROCESSED"
echo "   Total replacements: $TOTAL_REPLACEMENTS"
echo ""
echo "📊 Remaining console statements:"
find src -name "*.js" -exec grep -l "console\.\(log\|error\|warn\)" {} \; | wc -l | xargs echo "   Files:"
find src -name "*.js" -exec grep -c "console\.\(log\|error\|warn\)" {} \; 2>/dev/null | awk '{sum+=$1} END {print "   Total:", sum}'
