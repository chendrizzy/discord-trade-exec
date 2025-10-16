#!/usr/bin/env node

/**
 * Comprehensive Broker Connection Testing Script
 *
 * Tests all configured brokers:
 * - Alpaca (Stock - Paper Trading)
 * - IBKR (Stock - Paper Trading)
 * - Kraken (Crypto - Live with small amounts)
 *
 * Reports:
 * - Connection status
 * - Balance information
 * - Any errors encountered
 * - Recommendations for fixes
 */

require('dotenv').config();
const BrokerFactory = require('../../src/brokers/BrokerFactory');

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Test results tracker
const testResults = {
  passed: [],
  failed: [],
  warnings: []
};

/**
 * Format output with colors
 */
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function header(message) {
  console.log('\n' + '='.repeat(60));
  log(message, 'cyan');
  console.log('='.repeat(60) + '\n');
}

function success(message) {
  log(`✅ ${message}`, 'green');
}

function error(message) {
  log(`❌ ${message}`, 'red');
}

function warning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function info(message) {
  log(`ℹ️  ${message}`, 'blue');
}

/**
 * Test Alpaca connection
 */
async function testAlpaca() {
  header('Testing Alpaca (Stock Broker - Paper Trading)');

  try {
    // Check if credentials are configured
    if (!process.env.ALPACA_API_KEY || !process.env.ALPACA_API_SECRET) {
      warning('Alpaca credentials not configured in .env');
      testResults.warnings.push({
        broker: 'Alpaca',
        issue: 'Credentials not configured',
        fix: 'Add ALPACA_API_KEY and ALPACA_API_SECRET to .env'
      });
      return;
    }

    info('Creating Alpaca adapter...');
    const credentials = {
      apiKey: process.env.ALPACA_API_KEY,
      apiSecret: process.env.ALPACA_API_SECRET
    };

    const options = {
      isTestnet: true
    };

    const adapter = BrokerFactory.createBroker('alpaca', credentials, options);
    info('Adapter created successfully');

    info('Testing connection...');
    const isConnected = await adapter.testConnection();

    if (isConnected) {
      success('Connection successful!');

      info('Fetching account balance...');
      const balance = await adapter.getBalance();
      success(`Account Balance: $${balance.available.toFixed(2)}`);

      testResults.passed.push({
        broker: 'Alpaca',
        status: 'Connected',
        balance: `$${balance.available.toFixed(2)}`,
        environment: 'Paper Trading'
      });
    } else {
      throw new Error('Connection test returned false');
    }

  } catch (err) {
    error(`Alpaca test failed: ${err.message}`);
    testResults.failed.push({
      broker: 'Alpaca',
      error: err.message,
      stack: err.stack,
      recommendations: [
        'Verify API keys are correct (PK prefix for paper trading)',
        'Check if Alpaca API is accessible',
        'Ensure ALPACA_BASE_URL is set to https://paper-api.alpaca.markets'
      ]
    });
  }
}

/**
 * Test IBKR connection
 */
async function testIBKR() {
  header('Testing Interactive Brokers (IBKR - Paper Trading)');

  try {
    // Check if credentials are configured
    if (!process.env.IBKR_HOST || !process.env.IBKR_PORT) {
      warning('IBKR credentials not configured in .env');
      testResults.warnings.push({
        broker: 'IBKR',
        issue: 'Credentials not configured',
        fix: 'Add IBKR_HOST, IBKR_PORT, and IBKR_CLIENT_ID to .env'
      });
      return;
    }

    info('Creating IBKR adapter...');
    const credentials = {
      host: process.env.IBKR_HOST,
      port: parseInt(process.env.IBKR_PORT),
      clientId: parseInt(process.env.IBKR_CLIENT_ID || '1')
    };

    const options = {
      isTestnet: true
    };

    const adapter = BrokerFactory.createBroker('ibkr', credentials, options);
    info('Adapter created successfully');

    info('Testing connection...');
    warning('NOTE: IB Gateway must be running and logged in');

    const isConnected = await adapter.testConnection();

    if (isConnected) {
      success('Connection successful!');

      info('Fetching account balance...');
      const balance = await adapter.getBalance();
      success(`Account Balance: $${balance.available.toFixed(2)}`);

      testResults.passed.push({
        broker: 'IBKR',
        status: 'Connected',
        balance: `$${balance.available.toFixed(2)}`,
        environment: 'Paper Trading'
      });
    } else {
      throw new Error('Connection test returned false');
    }

  } catch (err) {
    error(`IBKR test failed: ${err.message}`);
    testResults.failed.push({
      broker: 'IBKR',
      error: err.message,
      stack: err.stack,
      recommendations: [
        'Ensure IB Gateway is running and logged in',
        'Verify API access is enabled in Gateway settings',
        'Check port 4001 (live) or 4002 (paper) is correct',
        'Confirm firewall is not blocking connection',
        'Try restarting IB Gateway'
      ]
    });
  }
}

/**
 * Test Kraken connection
 */
async function testKraken() {
  header('Testing Kraken (Crypto Exchange - Live)');

  try {
    // Check if credentials are configured
    if (!process.env.KRAKEN_API_KEY || !process.env.KRAKEN_PRIVATE_KEY) {
      warning('Kraken credentials not configured in .env');
      testResults.warnings.push({
        broker: 'Kraken',
        issue: 'Credentials not configured',
        fix: 'Add KRAKEN_API_KEY and KRAKEN_PRIVATE_KEY to .env'
      });
      return;
    }

    info('Creating Kraken adapter...');
    const credentials = {
      apiKey: process.env.KRAKEN_API_KEY,
      apiSecret: process.env.KRAKEN_PRIVATE_KEY // KrakenAdapter expects apiSecret
    };

    const options = {
      isTestnet: false // Kraken doesn't have a testnet
    };

    const adapter = BrokerFactory.createBroker('kraken', credentials, options);
    info('Adapter created successfully');

    info('Testing connection...');
    warning('NOTE: This uses live Kraken API - no testnet available');

    const isConnected = await adapter.testConnection();

    if (isConnected) {
      success('Connection successful!');

      info('Fetching account balance...');
      const balance = await adapter.getBalance();
      success(`Account Balance: ${balance.available} (crypto)`);

      testResults.passed.push({
        broker: 'Kraken',
        status: 'Connected',
        balance: balance.available,
        environment: 'Live'
      });
    } else {
      throw new Error('Connection test returned false');
    }

  } catch (err) {
    error(`Kraken test failed: ${err.message}`);
    testResults.failed.push({
      broker: 'Kraken',
      error: err.message,
      stack: err.stack,
      recommendations: [
        'Verify API key and private key are correct',
        'Check API key permissions include "Query Funds" and "Query Orders"',
        'Ensure API key is not IP-restricted (or add your IP)',
        'Confirm Kraken API is accessible',
        'Try regenerating API keys if issue persists'
      ]
    });
  }
}

/**
 * Generate summary report
 */
function generateReport() {
  header('Test Summary Report');

  const totalTests = testResults.passed.length + testResults.failed.length + testResults.warnings.length;

  // Overall status
  if (testResults.failed.length === 0 && testResults.warnings.length === 0) {
    success(`All ${totalTests} broker tests passed! 🎉`);
  } else if (testResults.failed.length === 0) {
    warning(`${testResults.passed.length}/${totalTests} tests passed (${testResults.warnings.length} skipped)`);
  } else {
    error(`${testResults.failed.length}/${totalTests} tests failed`);
  }

  // Passed tests
  if (testResults.passed.length > 0) {
    console.log('\n✅ Passed Tests:');
    console.log('─'.repeat(60));
    testResults.passed.forEach(result => {
      console.log(`  • ${result.broker}: ${result.status}`);
      console.log(`    Balance: ${result.balance}`);
      console.log(`    Environment: ${result.environment}`);
      console.log();
    });
  }

  // Failed tests
  if (testResults.failed.length > 0) {
    console.log('\n❌ Failed Tests:');
    console.log('─'.repeat(60));
    testResults.failed.forEach(result => {
      console.log(`  • ${result.broker}:`);
      console.log(`    Error: ${result.error}`);
      console.log(`    Recommendations:`);
      result.recommendations.forEach(rec => {
        console.log(`      - ${rec}`);
      });
      console.log();
    });
  }

  // Warnings
  if (testResults.warnings.length > 0) {
    console.log('\n⚠️  Skipped Tests:');
    console.log('─'.repeat(60));
    testResults.warnings.forEach(result => {
      console.log(`  • ${result.broker}: ${result.issue}`);
      console.log(`    Fix: ${result.fix}`);
      console.log();
    });
  }

  // Next steps
  console.log('\n📋 Next Steps:');
  console.log('─'.repeat(60));
  if (testResults.failed.length > 0) {
    console.log('  1. Review failed test recommendations above');
    console.log('  2. Fix the identified issues');
    console.log('  3. Re-run this test script');
  }
  if (testResults.warnings.length > 0) {
    console.log('  • Set up credentials for skipped brokers (see fixes above)');
  }
  if (testResults.passed.length === totalTests) {
    console.log('  ✅ Ready to test broker connections in the dashboard!');
    console.log('  • Open http://localhost:5001');
    console.log('  • Navigate to Settings');
    console.log('  • Click "Configure Broker" to add brokers to your account');
  }
  console.log();
}

/**
 * Main test execution
 */
async function runTests() {
  header('Broker Connection Testing Suite');
  info('Testing all configured broker connections...');

  await testAlpaca();
  await testIBKR();
  await testKraken();

  generateReport();

  // Exit with appropriate code
  process.exit(testResults.failed.length > 0 ? 1 : 0);
}

// Run tests
runTests().catch(err => {
  error(`Fatal error: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
