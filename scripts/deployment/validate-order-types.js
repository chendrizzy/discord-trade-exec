#!/usr/bin/env node

/**
 * Order Type Validation Script
 * Validates all order types work correctly across all brokers
 * Phase 1.3: Validate All Order Types Work
 */

const axios = require('axios');
const chalk = require('chalk');

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || 'test-api-key';
const PAPER_TRADING = true;

// Test credentials (should be set in environment)
const BROKERS = {
  ibkr: {
    credentials: {
      clientId: process.env.IBKR_PAPER_CLIENT_ID,
      host: process.env.IBKR_PAPER_HOST || 'localhost',
      port: process.env.IBKR_PAPER_PORT || 7497
    }
  },
  alpaca: {
    credentials: {
      apiKey: process.env.ALPACA_PAPER_KEY_ID,
      apiSecret: process.env.ALPACA_PAPER_SECRET,
      endpoint: 'https://paper-api.alpaca.markets'
    }
  },
  schwab: {
    credentials: {
      // OAuth-based, requires manual connection
      note: 'Schwab requires manual OAuth connection via dashboard'
    }
  }
};

// Order type test cases
const ORDER_TESTS = {
  market: [
    { symbol: 'SPY', side: 'buy', quantity: 1, type: 'market' }
  ],
  limit: [
    { symbol: 'AAPL', side: 'buy', quantity: 1, type: 'limit', limitPrice: 150.00 }
  ],
  stop: [
    { symbol: 'TSLA', side: 'sell', quantity: 1, type: 'stop', stopPrice: 200.00 }
  ],
  stopLimit: [
    { symbol: 'GOOGL', side: 'buy', quantity: 1, type: 'stop_limit', stopPrice: 130.00, limitPrice: 131.00 }
  ],
  bracket: [
    {
      symbol: 'MSFT',
      side: 'buy',
      quantity: 1,
      type: 'bracket',
      limitPrice: 300.00,
      takeProfitPrice: 310.00,
      stopLossPrice: 295.00
    }
  ]
};

// Results tracker
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  errors: []
};

// HTTP client setup
const client = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json'
  }
});

// Test a single order
async function testOrder(broker, orderType, orderData) {
  const testName = `${broker.toUpperCase()} - ${orderType} - ${orderData.symbol}`;
  results.total++;

  try {
    console.log(chalk.blue(`\n⏳ Testing: ${testName}`));

    // Place order
    const response = await client.post('/api/brokers/orders', {
      broker,
      ...orderData,
      testMode: true // Prevents actual execution
    });

    if (response.status === 200 || response.status === 201) {
      console.log(chalk.green(`✓ ${testName} - PASSED`));
      console.log(chalk.gray(`  Order ID: ${response.data.orderId || 'N/A'}`));
      results.passed++;
      return { success: true, testName, response: response.data };
    } else {
      throw new Error(`Unexpected status: ${response.status}`);
    }
  } catch (error) {
    console.log(chalk.red(`✗ ${testName} - FAILED`));
    console.log(chalk.red(`  Error: ${error.message}`));
    if (error.response) {
      console.log(chalk.red(`  Status: ${error.response.status}`));
      console.log(chalk.red(`  Details: ${JSON.stringify(error.response.data)}`));
    }
    results.failed++;
    results.errors.push({
      testName,
      error: error.message,
      status: error.response?.status,
      details: error.response?.data
    });
    return { success: false, testName, error: error.message };
  }
}

// Test broker connection
async function testBrokerConnection(broker) {
  try {
    console.log(chalk.blue(`\n🔌 Testing ${broker.toUpperCase()} connection...`));

    const response = await client.get(`/api/brokers/${broker}/balance`);

    if (response.status === 200) {
      console.log(chalk.green(`✓ ${broker.toUpperCase()} connected`));
      console.log(chalk.gray(`  Balance: $${response.data.available || 'N/A'}`));
      return true;
    }
  } catch (error) {
    console.log(chalk.red(`✗ ${broker.toUpperCase()} connection failed`));
    console.log(chalk.red(`  Error: ${error.message}`));
    return false;
  }
}

// Test error handling
async function testErrorHandling(broker) {
  const errorTests = [
    {
      name: 'Invalid Symbol',
      data: { broker, symbol: 'INVALID999', side: 'buy', quantity: 1, type: 'market' },
      expectedError: true
    },
    {
      name: 'Insufficient Funds',
      data: { broker, symbol: 'BRK.A', side: 'buy', quantity: 1000, type: 'market' },
      expectedError: true
    },
    {
      name: 'Invalid Quantity',
      data: { broker, symbol: 'SPY', side: 'buy', quantity: -1, type: 'market' },
      expectedError: true
    }
  ];

  console.log(chalk.blue(`\n🛡️  Testing error handling for ${broker.toUpperCase()}...`));

  for (const test of errorTests) {
    try {
      await client.post('/api/brokers/orders', test.data);
      console.log(chalk.yellow(`⚠  ${test.name} - Expected error but got success`));
    } catch (error) {
      if (test.expectedError && error.response?.status >= 400) {
        console.log(chalk.green(`✓ ${test.name} - Correctly rejected`));
      } else {
        console.log(chalk.red(`✗ ${test.name} - Unexpected error: ${error.message}`));
      }
    }
  }
}

// Main execution
async function main() {
  console.log(chalk.bold.cyan('\n========================================'));
  console.log(chalk.bold.cyan('  Order Type Validation Test Suite'));
  console.log(chalk.bold.cyan('========================================\n'));

  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`API URL: ${API_BASE_URL}`);
  console.log(`Paper Trading: ${PAPER_TRADING}`);

  // Test each broker
  for (const broker of ['ibkr', 'alpaca', 'schwab']) {
    console.log(chalk.bold.yellow(`\n\n━━━ Testing ${broker.toUpperCase()} ━━━`));

    // Test connection
    const connected = await testBrokerConnection(broker);
    if (!connected) {
      console.log(chalk.yellow(`  Skipping ${broker.toUpperCase()} order tests (not connected)`));
      continue;
    }

    // Test each order type
    for (const [orderType, testCases] of Object.entries(ORDER_TESTS)) {
      // Check if broker supports this order type
      const unsupportedTypes = {
        ibkr: [],  // IBKR supports all types
        alpaca: ['bracket'],  // Alpaca doesn't support bracket orders in same way
        schwab: ['bracket', 'stopLimit']  // Schwab limited order types
      };

      if (unsupportedTypes[broker]?.includes(orderType)) {
        console.log(chalk.gray(`\n⏭️  Skipping ${orderType} (not supported by ${broker.toUpperCase()})`));
        continue;
      }

      for (const orderData of testCases) {
        await testOrder(broker, orderType, orderData);
        // Rate limiting delay
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Test error handling
    await testErrorHandling(broker);
  }

  // Print summary
  console.log(chalk.bold.cyan('\n\n========================================'));
  console.log(chalk.bold.cyan('  Test Summary'));
  console.log(chalk.bold.cyan('========================================\n'));

  console.log(`Total Tests: ${results.total}`);
  console.log(chalk.green(`Passed: ${results.passed}`));
  console.log(chalk.red(`Failed: ${results.failed}`));

  const passRate = ((results.passed / results.total) * 100).toFixed(1);
  console.log(`\nPass Rate: ${passRate}%`);

  if (results.errors.length > 0) {
    console.log(chalk.red('\n\nFailed Tests:'));
    results.errors.forEach((err, idx) => {
      console.log(chalk.red(`\n${idx + 1}. ${err.testName}`));
      console.log(chalk.red(`   Error: ${err.error}`));
      if (err.details) {
        console.log(chalk.red(`   Details: ${JSON.stringify(err.details, null, 2)}`));
      }
    });
  }

  console.log('\n');

  // Exit with error code if any tests failed
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run main
if (require.main === module) {
  main().catch(error => {
    console.error(chalk.red('\n\n❌ Fatal error:'), error);
    process.exit(1);
  });
}

module.exports = { testOrder, testBrokerConnection, testErrorHandling };
