#!/usr/bin/env node
/**
 * Polymarket Intelligence Setup Validator
 *
 * Validates that all intelligence services can initialize properly
 */

const path = require('path');

// Load environment
require('dotenv').config();

console.log('🔍 Polymarket Intelligence Setup Validator\n');
console.log('=' .repeat(60));

// Test 1: Check dependencies
console.log('\n📦 Checking dependencies...');
try {
  require('bullmq');
  console.log('✅ BullMQ installed');
} catch (err) {
  console.log('❌ BullMQ not installed - run: npm install');
  process.exit(1);
}

try {
  require('ioredis');
  console.log('✅ ioredis installed');
} catch (err) {
  console.log('❌ ioredis not installed');
  process.exit(1);
}

// Test 2: Check environment variables
console.log('\n🔧 Checking configuration...');

const requiredVars = {
  'MONGODB_URI': process.env.MONGODB_URI
};

const optionalVars = {
  'REDIS_URL': process.env.REDIS_URL,
  'DISCORD_POLYMARKET_ALERTS_WEBHOOK': process.env.DISCORD_POLYMARKET_ALERTS_WEBHOOK
};

let hasErrors = false;
for (const [key, value] of Object.entries(requiredVars)) {
  if (!value) {
    console.log(`❌ ${key} - REQUIRED but not set`);
    hasErrors = true;
  } else {
    console.log(`✅ ${key} - configured`);
  }
}

for (const [key, value] of Object.entries(optionalVars)) {
  if (!value) {
    console.log(`⚠️  ${key} - optional, not set (some features disabled)`);
  } else {
    console.log(`✅ ${key} - configured`);
  }
}

if (hasErrors) {
  console.log('\n❌ Missing required configuration');
  process.exit(1);
}

// Test 3: Initialize services
console.log('\n🚀 Initializing intelligence services...');

try {
  const cacheManager = require('./src/services/polymarket/CacheManager');
  console.log('✅ CacheManager initialized');
  console.log('   Status:', cacheManager.getStats());
} catch (err) {
  console.log('❌ CacheManager failed:', err.message);
  hasErrors = true;
}

try {
  const whaleDetector = require('./src/services/polymarket/WhaleDetector');
  console.log('✅ WhaleDetector initialized');
} catch (err) {
  console.log('❌ WhaleDetector failed:', err.message);
  hasErrors = true;
}

try {
  const sentimentAnalyzer = require('./src/services/polymarket/SentimentAnalyzer');
  console.log('✅ SentimentAnalyzer initialized');
} catch (err) {
  console.log('❌ SentimentAnalyzer failed:', err.message);
  hasErrors = true;
}

try {
  const anomalyDetector = require('./src/services/polymarket/AnomalyDetector');
  console.log('✅ AnomalyDetector initialized');
} catch (err) {
  console.log('❌ AnomalyDetector failed:', err.message);
  hasErrors = true;
}

try {
  const analysisPipeline = require('./src/services/polymarket/AnalysisPipeline');
  console.log('✅ AnalysisPipeline initialized');
} catch (err) {
  console.log('❌ AnalysisPipeline failed:', err.message);
  hasErrors = true;
}

try {
  const alertFormatter = require('./src/services/polymarket/AlertFormatter');
  console.log('✅ AlertFormatter initialized');
} catch (err) {
  console.log('❌ AlertFormatter failed:', err.message);
  hasErrors = true;
}

try {
  const discordAlertService = require('./src/services/polymarket/DiscordAlertService');
  console.log('✅ DiscordAlertService initialized');
  console.log('   Status:', discordAlertService.getStats());
} catch (err) {
  console.log('❌ DiscordAlertService failed:', err.message);
  hasErrors = true;
}

try {
  const bullmqConfig = require('./src/config/bullmq');
  console.log('✅ BullMQ Config initialized');
  console.log('   Status:', bullmqConfig.getStatus());
} catch (err) {
  console.log('❌ BullMQ Config failed:', err.message);
  hasErrors = true;
}

try {
  const jobOrchestrator = require('./src/jobs');
  console.log('✅ JobOrchestrator initialized');
} catch (err) {
  console.log('❌ JobOrchestrator failed:', err.message);
  hasErrors = true;
}

// Test 4: Test webhook (if configured)
if (process.env.DISCORD_POLYMARKET_ALERTS_WEBHOOK) {
  console.log('\n📡 Testing Discord webhook...');

  (async () => {
    try {
      const discordAlertService = require('./src/services/polymarket/DiscordAlertService');
      const result = await discordAlertService.testWebhook();

      if (result) {
        console.log('✅ Webhook test successful!');
      } else {
        console.log('❌ Webhook test failed');
      }
    } catch (err) {
      console.log('❌ Webhook test error:', err.message);
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    if (hasErrors) {
      console.log('❌ Setup validation FAILED - see errors above');
      process.exit(1);
    } else {
      console.log('✅ Setup validation PASSED - all services initialized');
      console.log('\n📋 Next steps:');
      console.log('  1. Configure Discord webhook (if not already set)');
      console.log('  2. Start the Polymarket service');
      console.log('  3. Monitor logs for intelligence analysis');
      console.log('\nReady for deployment! 🚀');
    }

    process.exit(0);
  })();
} else {
  console.log('\n⚠️  Discord webhook not configured - skipping webhook test');
  console.log('   Set DISCORD_POLYMARKET_ALERTS_WEBHOOK to enable alerts');

  // Summary
  console.log('\n' + '='.repeat(60));
  if (hasErrors) {
    console.log('❌ Setup validation FAILED - see errors above');
    process.exit(1);
  } else {
    console.log('✅ Setup validation PASSED - all services initialized');
    console.log('\n⚠️  Running in development mode:');
    console.log('  - Alerts will be logged but not sent');
    console.log('  - Background jobs disabled (no Redis)');
    console.log('  - Real-time analysis will work normally');
    console.log('\n📋 To enable full features:');
    console.log('  1. Set DISCORD_POLYMARKET_ALERTS_WEBHOOK in .env');
    console.log('  2. Set REDIS_URL in .env (optional but recommended)');
    console.log('  3. Restart the service');
  }

  process.exit(0);
}
