#!/usr/bin/env node

/**
 * Rate Limit Stress Test Script
 * Tests rate limiting across all brokers to ensure proper throttling
 * Phase 1.4: Stress Test Rate Limiting
 */

const axios = require('axios');
const chalk = require('chalk');

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || 'test-api-key';

// Broker rate limits (from proposal.md)
const RATE_LIMITS = {
  ibkr: {
    maxRequestsPerSecond: 50,
    testDuration: 10, // seconds
    expectedTotal: 500, // 50 req/s * 10s
    tolerance: 0.95 // Accept 95% of expected
  },
  schwab: {
    maxRequestsPerMinute: 120,
    testDuration: 60, // seconds
    expectedTotal: 120,
    tolerance: 0.95
  },
  alpaca: {
    maxRequestsPerMinute: 200,
    testDuration: 60, // seconds
    expectedTotal: 200,
    tolerance: 0.95
  }
};

// Results tracker
const results = {
  ibkr: { successful: 0, rateLimited: 0, errors: 0, latencies: [] },
  schwab: { successful: 0, rateLimited: 0, errors: 0, latencies: [] },
  alpaca: { successful: 0, rateLimited: 0, errors: 0, latencies: [] }
};

// HTTP client setup
const client = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json'
  },
  timeout: 10000
});

// Make a single test request
async function makeRequest(broker) {
  const startTime = Date.now();

  try {
    const response = await client.get(`/api/brokers/${broker}/balance`);
    const latency = Date.now() - startTime;

    results[broker].latencies.push(latency);

    if (response.status === 200) {
      results[broker].successful++;
      return { success: true, latency, status: 200 };
    }
  } catch (error) {
    const latency = Date.now() - startTime;

    if (error.response?.status === 429) {
      // Rate limited - this is expected behavior
      results[broker].rateLimited++;
      return { success: false, ratency: latency, status: 429, rateLimited: true };
    } else {
      // Other error
      results[broker].errors++;
      return {
        success: false,
        latency,
        status: error.response?.status || 'ERR',
        error: error.message
      };
    }
  }
}

// Test IBKR rate limiting (50 req/s)
async function testIBKR() {
  console.log(chalk.bold.yellow('\n━━━ Testing IBKR Rate Limiting (50 req/s) ━━━\n'));

  const config = RATE_LIMITS.ibkr;
  const requestsPerSecond = config.maxRequestsPerSecond;
  const testDuration = config.testDuration;
  const delayBetweenRequests = 1000 / requestsPerSecond; // ms

  console.log(`Rate Limit: ${requestsPerSecond} req/s`);
  console.log(`Test Duration: ${testDuration}s`);
  console.log(`Expected Requests: ~${config.expectedTotal}`);
  console.log(`Delay Between Requests: ${delayBetweenRequests.toFixed(2)}ms`);

  const startTime = Date.now();
  let requestCount = 0;

  while ((Date.now() - startTime) < (testDuration * 1000)) {
    await makeRequest('ibkr');
    requestCount++;

    // Progress indicator
    if (requestCount % 50 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const rate = (requestCount / (elapsed || 1)).toFixed(1);
      process.stdout.write(`\r  ${requestCount} requests in ${elapsed}s (${rate} req/s)`);
    }

    // Delay to maintain rate
    await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
  const actualRate = (requestCount / totalTime).toFixed(1);

  console.log(`\n\n✓ Test Complete`);
  console.log(`  Total Requests: ${requestCount}`);
  console.log(`  Successful: ${results.ibkr.successful}`);
  console.log(`  Rate Limited (429): ${results.ibkr.rateLimited}`);
  console.log(`  Errors: ${results.ibkr.errors}`);
  console.log(`  Actual Rate: ${actualRate} req/s`);
  console.log(`  Target Rate: ${requestsPerSecond} req/s`);

  // Calculate metrics
  const passThreshold = config.expectedTotal * config.tolerance;
  const passed = results.ibkr.successful >= passThreshold;

  if (passed) {
    console.log(chalk.green(`\n✓ IBKR rate limiting PASSED`));
  } else {
    console.log(chalk.red(`\n✗ IBKR rate limiting FAILED`));
    console.log(chalk.red(`  Expected: ≥${passThreshold} successful requests`));
    console.log(chalk.red(`  Actual: ${results.ibkr.successful}`));
  }

  return passed;
}

// Test Schwab rate limiting (120 req/m)
async function testSchwab() {
  console.log(chalk.bold.yellow('\n━━━ Testing Schwab Rate Limiting (120 req/m) ━━━\n'));

  const config = RATE_LIMITS.schwab;
  const requestsPerMinute = config.maxRequestsPerMinute;
  const testDuration = config.testDuration;
  const delayBetweenRequests = 60000 / requestsPerMinute; // ms

  console.log(`Rate Limit: ${requestsPerMinute} req/m`);
  console.log(`Test Duration: ${testDuration}s`);
  console.log(`Expected Requests: ~${config.expectedTotal}`);
  console.log(`Delay Between Requests: ${delayBetweenRequests.toFixed(2)}ms`);

  const startTime = Date.now();
  let requestCount = 0;

  while ((Date.now() - startTime) < (testDuration * 1000)) {
    await makeRequest('schwab');
    requestCount++;

    // Progress indicator
    if (requestCount % 10 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      process.stdout.write(`\r  ${requestCount} requests in ${elapsed}s`);
    }

    // Delay to maintain rate
    await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`\n\n✓ Test Complete`);
  console.log(`  Total Requests: ${requestCount}`);
  console.log(`  Successful: ${results.schwab.successful}`);
  console.log(`  Rate Limited (429): ${results.schwab.rateLimited}`);
  console.log(`  Errors: ${results.schwab.errors}`);

  // Calculate metrics
  const passThreshold = config.expectedTotal * config.tolerance;
  const passed = results.schwab.successful >= passThreshold;

  if (passed) {
    console.log(chalk.green(`\n✓ Schwab rate limiting PASSED`));
  } else {
    console.log(chalk.red(`\n✗ Schwab rate limiting FAILED`));
    console.log(chalk.red(`  Expected: ≥${passThreshold} successful requests`));
    console.log(chalk.red(`  Actual: ${results.schwab.successful}`));
  }

  return passed;
}

// Test Alpaca rate limiting (200 req/m)
async function testAlpaca() {
  console.log(chalk.bold.yellow('\n━━━ Testing Alpaca Rate Limiting (200 req/m) ━━━\n'));

  const config = RATE_LIMITS.alpaca;
  const requestsPerMinute = config.maxRequestsPerMinute;
  const testDuration = config.testDuration;
  const delayBetweenRequests = 60000 / requestsPerMinute; // ms

  console.log(`Rate Limit: ${requestsPerMinute} req/m`);
  console.log(`Test Duration: ${testDuration}s`);
  console.log(`Expected Requests: ~${config.expectedTotal}`);
  console.log(`Delay Between Requests: ${delayBetweenRequests.toFixed(2)}ms`);

  const startTime = Date.now();
  let requestCount = 0;

  while ((Date.now() - startTime) < (testDuration * 1000)) {
    await makeRequest('alpaca');
    requestCount++;

    // Progress indicator
    if (requestCount % 20 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      process.stdout.write(`\r  ${requestCount} requests in ${elapsed}s`);
    }

    // Delay to maintain rate
    await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`\n\n✓ Test Complete`);
  console.log(`  Total Requests: ${requestCount}`);
  console.log(`  Successful: ${results.alpaca.successful}`);
  console.log(`  Rate Limited (429): ${results.alpaca.rateLimited}`);
  console.log(`  Errors: ${results.alpaca.errors}`);

  // Calculate metrics
  const passThreshold = config.expectedTotal * config.tolerance;
  const passed = results.alpaca.successful >= passThreshold;

  if (passed) {
    console.log(chalk.green(`\n✓ Alpaca rate limiting PASSED`));
  } else {
    console.log(chalk.red(`\n✗ Alpaca rate limiting FAILED`));
    console.log(chalk.red(`  Expected: ≥${passThreshold} successful requests`));
    console.log(chalk.red(`  Actual: ${results.alpaca.successful}`));
  }

  return passed;
}

// Calculate latency percentiles
function calculatePercentile(latencies, percentile) {
  if (latencies.length === 0) return 0;
  const sorted = latencies.slice().sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[index];
}

// Print latency statistics
function printLatencyStats(broker) {
  const latencies = results[broker].latencies;
  if (latencies.length === 0) {
    console.log(`  No latency data available`);
    return;
  }

  const p50 = calculatePercentile(latencies, 50);
  const p95 = calculatePercentile(latencies, 95);
  const p99 = calculatePercentile(latencies, 99);
  const avg = (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2);

  console.log(`\n  Latency Statistics:`);
  console.log(`    Average: ${avg}ms`);
  console.log(`    P50: ${p50}ms`);
  console.log(`    P95: ${p95}ms`);
  console.log(`    P99: ${p99}ms`);

  // Check SLA (from deployment guide: p95 <3000ms)
  if (p95 < 3000) {
    console.log(chalk.green(`    ✓ P95 latency within SLA (<3000ms)`));
  } else {
    console.log(chalk.yellow(`    ⚠ P95 latency above SLA (${p95}ms > 3000ms)`));
  }
}

// Main execution
async function main() {
  console.log(chalk.bold.cyan('\n========================================'));
  console.log(chalk.bold.cyan('  Rate Limit Stress Test Suite'));
  console.log(chalk.bold.cyan('========================================\n'));

  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`API URL: ${API_BASE_URL}`);

  const testResults = {
    ibkr: false,
    schwab: false,
    alpaca: false
  };

  // Test IBKR
  testResults.ibkr = await testIBKR();
  printLatencyStats('ibkr');

  console.log('\n' + '─'.repeat(60));

  // Test Schwab
  testResults.schwab = await testSchwab();
  printLatencyStats('schwab');

  console.log('\n' + '─'.repeat(60));

  // Test Alpaca
  testResults.alpaca = await testAlpaca();
  printLatencyStats('alpaca');

  // Print summary
  console.log(chalk.bold.cyan('\n\n========================================'));
  console.log(chalk.bold.cyan('  Test Summary'));
  console.log(chalk.bold.cyan('========================================\n'));

  const allPassed = Object.values(testResults).every(result => result);

  console.log(`IBKR:   ${testResults.ibkr ? chalk.green('PASSED') : chalk.red('FAILED')}`);
  console.log(`Schwab: ${testResults.schwab ? chalk.green('PASSED') : chalk.red('FAILED')}`);
  console.log(`Alpaca: ${testResults.alpaca ? chalk.green('PASSED') : chalk.red('FAILED')}`);

  if (allPassed) {
    console.log(chalk.bold.green('\n✓ All rate limit tests PASSED\n'));
  } else {
    console.log(chalk.bold.red('\n✗ Some rate limit tests FAILED\n'));
  }

  // Exit with error code if any tests failed
  process.exit(allPassed ? 0 : 1);
}

// Run main
if (require.main === module) {
  main().catch(error => {
    console.error(chalk.red('\n\n❌ Fatal error:'), error);
    process.exit(1);
  });
}

module.exports = { testIBKR, testSchwab, testAlpaca };
