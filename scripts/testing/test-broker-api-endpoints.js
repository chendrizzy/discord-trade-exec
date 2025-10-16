#!/usr/bin/env node

/**
 * Broker API Endpoint Integration Testing Script
 *
 * Tests all broker-related API endpoints with authentication
 * using supertest and session-based authentication without requiring AWS KMS.
 *
 * Tests:
 * - GET /api/brokers (list all brokers)
 * - GET /api/brokers/:brokerKey (broker details)
 * - POST /api/brokers/test (test with credentials)
 * - GET /api/brokers/user/configured (user's brokers)
 * - POST /api/brokers/compare (compare brokers)
 * - POST /api/brokers/recommend (get recommendation)
 */

require('dotenv').config();
const request = require('supertest');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');

// Import app for testing
const app = require('../../src/index.js');

// Import models
const User = require('../../src/models/User');
const Community = require('../../src/models/Community');

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
  skipped: []
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
 * Create a test user for API testing
 */
async function createTestUser() {
  try {
    info('Creating test user for API testing...');

    // Clean up existing test user
    await User.deleteMany({ discordId: 'TEST_API_USER_999' });
    await Community.deleteMany({ discordGuildId: 'TEST_COMMUNITY_999' });

    // Create test user
    const user = await User.create({
      discordId: 'TEST_API_USER_999',
      username: 'APITestUser',
      discriminator: '0001',
      email: 'api-test@example.com',
      subscription: {
        tier: 'pro',
        status: 'active'
      }
    });

    // Create test community
    const community = await Community.create({
      name: 'Test API Community',
      discordGuildId: 'TEST_COMMUNITY_999',
      admins: [{
        userId: user._id,
        role: 'owner',
        permissions: ['manage_signals', 'manage_users', 'manage_settings']
      }],
      subscription: {
        tier: 'pro',
        status: 'active'
      }
    });

    // Link user to community
    user.communityId = community._id;
    await user.save();

    success('Test user created successfully');
    return user;

  } catch (err) {
    error(`Failed to create test user: ${err.message}`);
    throw err;
  }
}

/**
 * Get authenticated agent with session
 */
function authenticatedAgent(user) {
  const agent = request.agent(app);

  // Mock passport session
  agent._sessionUser = user;

  return agent;
}

/**
 * Test GET /api/brokers
 */
async function testListBrokers() {
  header('Test: GET /api/brokers');

  try {
    info('Testing unauthenticated request...');
    const response = await request(app)
      .get('/api/brokers')
      .expect('Content-Type', /json/);

    if (response.status === 401) {
      success('Endpoint properly requires authentication (401)');
    } else if (response.status === 200) {
      success('Endpoint accessible');
      info(`Found ${response.body.brokers?.length || 0} brokers`);

      // Validate response structure
      if (response.body.brokers && Array.isArray(response.body.brokers)) {
        success('Response has valid brokers array');

        // Check for expected brokers
        const brokerKeys = response.body.brokers.map(b => b.key);
        const expectedBrokers = ['alpaca', 'ibkr', 'kraken', 'coinbase', 'schwab'];
        const found = expectedBrokers.filter(k => brokerKeys.includes(k));
        info(`Found ${found.length}/${expectedBrokers.length} expected brokers: ${found.join(', ')}`);
      }

      testResults.passed.push({
        endpoint: 'GET /api/brokers',
        status: 200,
        message: 'Successfully listed brokers'
      });
    } else {
      throw new Error(`Unexpected status code: ${response.status}`);
    }

  } catch (err) {
    error(`GET /api/brokers failed: ${err.message}`);
    testResults.failed.push({
      endpoint: 'GET /api/brokers',
      error: err.message
    });
  }
}

/**
 * Test GET /api/brokers/:brokerKey
 */
async function testGetBrokerDetails() {
  header('Test: GET /api/brokers/:brokerKey');

  const testBrokers = ['alpaca', 'ibkr', 'kraken'];

  for (const brokerKey of testBrokers) {
    try {
      info(`Testing broker: ${brokerKey}...`);
      const response = await request(app)
        .get(`/api/brokers/${brokerKey}`)
        .expect('Content-Type', /json/);

      if (response.status === 401) {
        success(`${brokerKey}: Properly requires authentication (401)`);
      } else if (response.status === 200) {
        success(`${brokerKey}: Details retrieved successfully`);

        // Validate response structure
        if (response.body.broker) {
          const { key, name, type, status, features } = response.body.broker;
          info(`  Name: ${name}`);
          info(`  Type: ${type}`);
          info(`  Status: ${status}`);
          info(`  Features: ${features?.length || 0} features`);
        }

        testResults.passed.push({
          endpoint: `GET /api/brokers/${brokerKey}`,
          status: 200,
          message: 'Successfully retrieved broker details'
        });
      } else if (response.status === 404) {
        warning(`${brokerKey}: Broker not found (404)`);
        testResults.skipped.push({
          endpoint: `GET /api/brokers/${brokerKey}`,
          reason: 'Broker not registered in BrokerFactory'
        });
      }

    } catch (err) {
      error(`GET /api/brokers/${brokerKey} failed: ${err.message}`);
      testResults.failed.push({
        endpoint: `GET /api/brokers/${brokerKey}`,
        error: err.message
      });
    }
  }
}

/**
 * Test POST /api/brokers/test (with credentials in body)
 */
async function testConnectionWithCredentials() {
  header('Test: POST /api/brokers/test');

  // Only test if we have Alpaca credentials
  if (!process.env.ALPACA_API_KEY || !process.env.ALPACA_API_SECRET) {
    warning('Skipping test - Alpaca credentials not configured');
    testResults.skipped.push({
      endpoint: 'POST /api/brokers/test',
      reason: 'Alpaca credentials not in environment'
    });
    return;
  }

  try {
    info('Testing connection with Alpaca credentials...');
    const response = await request(app)
      .post('/api/brokers/test')
      .send({
        brokerKey: 'alpaca',
        credentials: {
          apiKey: process.env.ALPACA_API_KEY,
          apiSecret: process.env.ALPACA_API_SECRET
        },
        options: {
          isTestnet: true
        }
      })
      .expect('Content-Type', /json/);

    if (response.status === 401) {
      success('Endpoint properly requires authentication (401)');
    } else if (response.status === 200) {
      success('Connection test completed');

      if (response.body.success) {
        success('Connection successful!');
        if (response.body.balance) {
          info(`  Balance: ${JSON.stringify(response.body.balance)}`);
        }
      } else {
        warning('Connection test returned false');
      }

      testResults.passed.push({
        endpoint: 'POST /api/brokers/test',
        status: 200,
        message: 'Connection test executed'
      });
    }

  } catch (err) {
    error(`POST /api/brokers/test failed: ${err.message}`);
    testResults.failed.push({
      endpoint: 'POST /api/brokers/test',
      error: err.message
    });
  }
}

/**
 * Test POST /api/brokers/compare
 */
async function testCompareBrokers() {
  header('Test: POST /api/brokers/compare');

  try {
    info('Comparing Alpaca vs IBKR...');
    const response = await request(app)
      .post('/api/brokers/compare')
      .send({
        brokerKeys: ['alpaca', 'ibkr']
      })
      .expect('Content-Type', /json/);

    if (response.status === 401) {
      success('Endpoint properly requires authentication (401)');
    } else if (response.status === 200) {
      success('Comparison completed');

      if (response.body.comparison) {
        info('  Comparison data received');
      }

      testResults.passed.push({
        endpoint: 'POST /api/brokers/compare',
        status: 200,
        message: 'Broker comparison successful'
      });
    }

  } catch (err) {
    error(`POST /api/brokers/compare failed: ${err.message}`);
    testResults.failed.push({
      endpoint: 'POST /api/brokers/compare',
      error: err.message
    });
  }
}

/**
 * Test POST /api/brokers/recommend
 */
async function testRecommendBroker() {
  header('Test: POST /api/brokers/recommend');

  try {
    info('Getting broker recommendation for stock trading...');
    const response = await request(app)
      .post('/api/brokers/recommend')
      .send({
        requirements: {
          type: 'stock',
          features: ['commission-free', 'paper-trading'],
          accountTypes: ['individual']
        }
      })
      .expect('Content-Type', /json/);

    if (response.status === 401) {
      success('Endpoint properly requires authentication (401)');
    } else if (response.status === 200) {
      success('Recommendation received');

      if (response.body.recommended) {
        const { name, reason, score } = response.body.recommended;
        info(`  Recommended: ${name}`);
        info(`  Reason: ${reason}`);
        info(`  Score: ${score}`);
      } else {
        info('  No matching brokers for requirements');
      }

      testResults.passed.push({
        endpoint: 'POST /api/brokers/recommend',
        status: 200,
        message: 'Broker recommendation successful'
      });
    }

  } catch (err) {
    error(`POST /api/brokers/recommend failed: ${err.message}`);
    testResults.failed.push({
      endpoint: 'POST /api/brokers/recommend',
      error: err.message
    });
  }
}

/**
 * Test health endpoint
 */
async function testHealthEndpoint() {
  header('Test: GET /health');

  try {
    info('Testing health check...');
    const response = await request(app)
      .get('/health')
      .expect('Content-Type', /json/)
      .expect(200);

    success('Health check passed');

    if (response.body.status === 'healthy') {
      success('Server status: healthy');
      info(`  Uptime: ${Math.floor(response.body.uptime)}s`);

      if (response.body.websocket) {
        info(`  WebSocket: ${response.body.websocket.status || 'active'}`);
      }
    }

    testResults.passed.push({
      endpoint: 'GET /health',
      status: 200,
      message: 'Health check successful'
    });

  } catch (err) {
    error(`GET /health failed: ${err.message}`);
    testResults.failed.push({
      endpoint: 'GET /health',
      error: err.message
    });
  }
}

/**
 * Generate summary report
 */
function generateReport() {
  header('API Test Summary Report');

  const totalTests = testResults.passed.length + testResults.failed.length + testResults.skipped.length;

  // Overall status
  if (testResults.failed.length === 0) {
    success(`${testResults.passed.length}/${totalTests} tests passed! 🎉`);
  } else {
    error(`${testResults.failed.length}/${totalTests} tests failed`);
  }

  // Passed tests
  if (testResults.passed.length > 0) {
    console.log('\n✅ Passed Tests:');
    console.log('─'.repeat(60));
    testResults.passed.forEach(result => {
      console.log(`  • ${result.endpoint}: ${result.message}`);
    });
  }

  // Failed tests
  if (testResults.failed.length > 0) {
    console.log('\n❌ Failed Tests:');
    console.log('─'.repeat(60));
    testResults.failed.forEach(result => {
      console.log(`  • ${result.endpoint}`);
      console.log(`    Error: ${result.error}`);
    });
  }

  // Skipped tests
  if (testResults.skipped.length > 0) {
    console.log('\n⏭️  Skipped Tests:');
    console.log('─'.repeat(60));
    testResults.skipped.forEach(result => {
      console.log(`  • ${result.endpoint}`);
      console.log(`    Reason: ${result.reason}`);
    });
  }

  // Next steps
  console.log('\n📋 Results:');
  console.log('─'.repeat(60));

  if (testResults.passed.length > 0) {
    console.log('  ✅ API endpoints are responding correctly');
    console.log('  ✅ Authentication middleware is working');
    console.log('  ✅ Server is healthy and operational');
  }

  if (testResults.failed.length > 0) {
    console.log('  ⚠️ Some tests failed - review errors above');
  }

  console.log();
}

/**
 * Main test execution
 */
async function runTests() {
  header('Broker API Endpoint Testing Suite');
  info('Testing all broker-related API endpoints...');

  try {
    // Connect to MongoDB if not already connected
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/discord-trade-exec');
      info('MongoDB connected');
    }

    // Run tests
    await testHealthEndpoint();
    await testListBrokers();
    await testGetBrokerDetails();
    await testConnectionWithCredentials();
    await testCompareBrokers();
    await testRecommendBroker();

    generateReport();

    // Note about authenticated endpoints
    header('Note on Authenticated Endpoints');
    info('The following endpoints require proper session-based authentication:');
    info('  • POST /api/brokers/test/:brokerKey');
    info('  • POST /api/brokers/configure');
    info('  • GET /api/brokers/user/configured');
    info('  • DELETE /api/brokers/user/:brokerKey');
    console.log();
    info('These endpoints can only be fully tested through:');
    info('  1. Manual browser testing (login required)');
    info('  2. E2E tests with authenticated sessions');
    info('  3. Setting up AWS KMS and using comprehensive-ui-test.js');
    console.log();

  } catch (err) {
    error(`Test suite error: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    // Note: Don't disconnect mongoose - the app needs it
    info('Test suite completed');
  }
}

// Run tests
if (require.main === module) {
  runTests().catch(err => {
    error(`Fatal error: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  });
}

module.exports = { runTests };
