#!/usr/bin/env node
/**
 * Moomoo Whitelist Activation Monitor
 *
 * Periodically tests Moomoo OpenD Gateway connection to detect
 * when account is added to API whitelist (FreqLimitMooMoo.json).
 *
 * Logs all attempts to monitor-moomoo.log
 * Creates .moomoo-monitor-status.json with latest status
 */

// Node.js built-in modules
const fs = require('fs');
const path = require('path');

// External dependencies
const MoomooAPI = require('moomoo-api').default;

// Configuration
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const LOG_FILE = path.join(__dirname, 'monitor-moomoo.log');
const STATUS_FILE = path.join(__dirname, '.moomoo-monitor-status.json');

// Load environment variables
require('dotenv').config();

const config = {
  host: process.env.MOOMOO_HOST || '127.0.0.1',
  port: parseInt(process.env.MOOMOO_PORT || '33333'),
  accountId: process.env.MOOMOO_ID,
  password: process.env.MOOMOO_PASSWORD,
  websocketKey: process.env.MOOMOO_WEBSOCKET_KEY
};

// Validate configuration
if (!config.accountId || !config.password || !config.websocketKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   MOOMOO_ID, MOOMOO_PASSWORD, MOOMOO_WEBSOCKET_KEY');
  process.exit(1);
}

/**
 * Log message to both console and file
 */
function log(message) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}\n`;

  console.log(message);
  fs.appendFileSync(LOG_FILE, logLine);
}

/**
 * Update status file with latest check info
 */
function updateStatus(status, details = {}) {
  const statusData = {
    status,
    lastCheck: new Date().toISOString(),
    checkCount: getCheckCount() + 1,
    ...details
  };

  fs.writeFileSync(STATUS_FILE, JSON.stringify(statusData, null, 2));
}

/**
 * Get current check count
 */
function getCheckCount() {
  try {
    if (fs.existsSync(STATUS_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
      return data.checkCount || 0;
    }
  } catch (error) {
    // Ignore errors
  }
  return 0;
}

/**
 * Test Moomoo connection
 */
async function testConnection() {
  return new Promise(resolve => {
    const client = new MoomooAPI();
    let timeoutId;

    // Set 10 second timeout
    timeoutId = setTimeout(() => {
      client.disconnect();
      resolve({ success: false, error: 'Connection timeout' });
    }, 10000);

    // Use onlogin callback instead of 'connect' event
    client.onlogin = (ret, msg) => {
      clearTimeout(timeoutId);

      if (ret === 0) {
        const connID = client.getConnID();
        client.stop();
        resolve({
          success: true,
          connId: connID
        });
      } else {
        client.stop();
        resolve({
          success: false,
          error: `Login failed - ret: ${ret}, msg: ${msg || 'none'}`
        });
      }
    };

    // Start connection
    try {
      client.start(config.host, config.port, false, config.websocketKey);
    } catch (error) {
      clearTimeout(timeoutId);
      resolve({
        success: false,
        error: error.message
      });
    }
  });
}

/**
 * Perform connection check
 */
async function performCheck() {
  const checkNum = getCheckCount() + 1;
  log(`\n🔍 Check #${checkNum}: Testing Moomoo connection...`);

  const result = await testConnection();

  if (result.success) {
    log(`✅ SUCCESS! Moomoo whitelist activated!`);
    log(`   Connection ID: ${result.connId}`);

    updateStatus('ACTIVATED', {
      connId: result.connId,
      activatedAt: new Date().toISOString()
    });

    log(`\n🎉 ============================================`);
    log(`🎉 MOOMOO API WHITELIST ACTIVATION DETECTED!`);
    log(`🎉 ============================================`);
    log(`✅ Account ${config.accountId} successfully connected`);
    log(`📧 Next step: Run 'node test-moomoo-raw.js' to verify`);
    log(`🎉 ============================================\n`);

    return true; // Stop monitoring
  } else {
    log(`❌ Still blocked: ${result.error}`);

    updateStatus('WAITING', {
      lastError: result.error
    });

    return false; // Continue monitoring
  }
}

/**
 * Main monitoring loop
 */
async function startMonitoring() {
  log('🚀 Moomoo Whitelist Activation Monitor Started');
  log(`   Account: ${config.accountId}`);
  log(`   Gateway: ${config.host}:${config.port}`);
  log(`   Check Interval: ${CHECK_INTERVAL_MS / 60000} minutes`);
  log(`   Log File: ${LOG_FILE}`);
  log(`   Status File: ${STATUS_FILE}`);
  log('');
  log('💡 Tip: Run "tail -f monitor-moomoo.log" in another terminal to watch live');
  log('💡 Tip: Press Ctrl+C to stop monitoring\n');

  // Initial status
  updateStatus('MONITORING', {
    startedAt: new Date().toISOString(),
    config: {
      host: config.host,
      port: config.port,
      accountId: config.accountId
    }
  });

  // Perform initial check
  const activated = await performCheck();

  if (activated) {
    process.exit(0);
  }

  // Schedule periodic checks
  const intervalId = setInterval(async () => {
    const activated = await performCheck();

    if (activated) {
      clearInterval(intervalId);
      process.exit(0);
    }
  }, CHECK_INTERVAL_MS);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    log('\n⚠️  Monitor stopped by user');
    updateStatus('STOPPED', {
      stoppedAt: new Date().toISOString()
    });
    clearInterval(intervalId);
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    log('\n⚠️  Monitor stopped by system');
    updateStatus('STOPPED', {
      stoppedAt: new Date().toISOString()
    });
    clearInterval(intervalId);
    process.exit(0);
  });
}

// Start monitoring
startMonitoring().catch(error => {
  log(`❌ Fatal error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
