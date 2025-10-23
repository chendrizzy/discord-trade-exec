#!/usr/bin/env node
/**
 * Replace Console Statements with Logger
 *
 * This script systematically replaces all console.log, console.error, and
 * console.warn statements with structured logger calls.
 */

const fs = require('fs');
const path = require('path');

// Files to process
const files = [
  'src/routes/api/trader.js',
  'src/routes/api/metrics.js',
  'src/routes/api/brokers.js',
  'src/routes/api/exchanges.js',
  'src/routes/api/community.js',
  'src/routes/api/trades.js',
  'src/routes/api/providers.js',
  'src/routes/api/signal-subscriptions.js',
  'src/routes/api/risk.js',
  'src/routes/api/portfolio.js',
  'src/routes/api/subscriptions.js',
  'src/routes/api/broker-oauth.js',
  'src/routes/api/signals.js',
  'src/routes/api/admin.js'
];

let totalReplaced = 0;

files.forEach(file => {
  const filePath = path.join(__dirname, '..', file);

  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  File not found: ${file}`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  let fileReplaced = 0;

  // Check if logger is already imported
  const hasLoggerImport =
    content.includes("require('../../utils/logger')") || content.includes('require("../../utils/logger")');

  // Add logger import if not present
  if (!hasLoggerImport) {
    // Find the last require statement in the imports section
    const requireRegex = /^const .+ = require\(.+\);$/gm;
    const matches = [...content.matchAll(requireRegex)];

    if (matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      const insertPosition = lastMatch.index + lastMatch[0].length;
      content =
        content.slice(0, insertPosition) +
        "\nconst logger = require('../../utils/logger');" +
        content.slice(insertPosition);
      console.log(`✅ Added logger import to ${file}`);
    }
  }

  // Replace console.error with logger.error
  content = content.replace(/console\.error\(['"]([^'"]+)['"],\s*error\);/g, (match, message) => {
    fileReplaced++;
    return `logger.error('${message}', { error: error.message, stack: error.stack });`;
  });

  // Replace console.error with object
  content = content.replace(/console\.error\(['"]([^'"]+)['"]\s*\+\s*(.+?),\s*error\);/g, (match, message, vars) => {
    fileReplaced++;
    return `logger.error('${message}', { ${vars.replace(/\s+/g, '')}, error: error.message, stack: error.stack });`;
  });

  // Replace console.log with logger.info
  content = content.replace(/console\.log\(['"]([^'"]+)['"],\s*(.+?)\);/g, (match, message, vars) => {
    fileReplaced++;
    // Try to extract variable names from the log message
    return `logger.info('${message}', { ${vars} });`;
  });

  // Replace simple console.log
  content = content.replace(/console\.log\(`\[.+?\]\s*(.+?)`\);/g, (match, message) => {
    fileReplaced++;
    return `logger.info('${message.replace(/\${(.+?)}/g, (m, v) => `' + ${v} + '`)}');`;
  });

  // Replace console.warn
  content = content.replace(/console\.warn\(['"]([^'"]+)['"],\s*(.+?)\);/g, (match, message, vars) => {
    fileReplaced++;
    return `logger.warn('${message}', { ${vars} });`;
  });

  // Replace console.warn with template literals
  content = content.replace(/console\.warn\(`([^`]+)`\);/g, (match, message) => {
    fileReplaced++;
    return `logger.warn('${message.replace(/\${(.+?)}/g, (m, v) => `' + ${v} + '`)}');`;
  });

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Replaced ${fileReplaced} console statements in ${file}`);
    totalReplaced += fileReplaced;
  } else {
    console.log(`⏭️  No changes needed in ${file}`);
  }
});

console.log(`\n🎉 Total: ${totalReplaced} console statements replaced across ${files.length} files`);
