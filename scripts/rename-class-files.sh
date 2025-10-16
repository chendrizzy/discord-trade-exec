#!/bin/bash

# Class File Renaming Script
# Renames class files from kebab-case to PascalCase and updates all imports

set -e  # Exit on error

echo "🔄 Renaming class files to PascalCase..."
echo ""

# Function to rename file and update imports
rename_file() {
  local old_path="$1"
  local new_path="$2"
  local old_filename=$(basename "$old_path")
  local new_filename=$(basename "$new_path")

  echo "📝 Renaming: $old_path → $new_path"

  # Use git mv to preserve history
  git mv "$old_path" "$new_path"

  # Update all require/import statements
  echo "   Updating imports..."

  # Find all .js files and update require statements
  # Handle various import patterns:
  # - require('./services/discord-bot')
  # - require('../services/discord-bot.js')
  # - require('../../services/discord-bot')

  local old_name_no_ext="${old_filename%.js}"
  local new_name_no_ext="${new_filename%.js}"

  # Build the path pattern for sed (escape dots and slashes)
  local old_require_pattern=$(echo "$old_path" | sed 's/src\///' | sed 's/.js$//')
  local new_require_pattern=$(echo "$new_path" | sed 's/src\///' | sed 's/.js$//')

  # Update all JS files
  find src tests scripts -name "*.js" -type f -exec sed -i '' \
    -e "s|require('\./${old_require_pattern}')|require('./${new_require_pattern}')|g" \
    -e "s|require('\.\/${old_require_pattern}\.js')|require('./${new_require_pattern}.js')|g" \
    -e "s|require('\.\.\/${old_require_pattern}')|require('../${new_require_pattern}')|g" \
    -e "s|require('\.\.\/${old_require_pattern}\.js')|require('../${new_require_pattern}.js')|g" \
    -e "s|require('\.\.\/\.\./${old_require_pattern}')|require('../../${new_require_pattern}')|g" \
    -e "s|require('\.\.\/\.\./${old_require_pattern}\.js')|require('../../${new_require_pattern}.js')|g" \
    {} \;

  echo "   ✅ Done"
  echo ""
}

# Rename files (order doesn't matter since we're updating all imports)
rename_file "src/rate-limiter.js" "src/RateLimiter.js"
rename_file "src/signal-parser.js" "src/SignalParser.js"
rename_file "src/performance-tracker.js" "src/PerformanceTracker.js"
rename_file "src/analytics-dashboard.js" "src/AnalyticsDashboard.js"
rename_file "src/services/websocket-server.js" "src/services/WebSocketServer.js"
rename_file "src/services/marketing-automation.js" "src/services/MarketingAutomation.js"
rename_file "src/services/trade-executor.js" "src/services/TradeExecutor.js"
rename_file "src/services/tradingview-parser.js" "src/services/TradingViewParser.js"
rename_file "src/services/discord-bot.js" "src/services/DiscordBot.js"
rename_file "src/services/payment-processor.js" "src/services/PaymentProcessor.js"

echo "✨ All class files renamed to PascalCase!"
echo ""
echo "📊 Summary:"
echo "   Renamed: 10 files"
echo "   Updated: All import statements across src/, tests/, scripts/"
echo ""
echo "💡 Next steps:"
echo "   1. Run tests to verify nothing broke: npm test"
echo "   2. Format with Prettier: npx prettier --write \"src/**/*.js\" \"tests/**/*.js\" \"scripts/**/*.js\""
echo "   3. Commit changes: git commit -m \"Rename class files to PascalCase for consistency\""
