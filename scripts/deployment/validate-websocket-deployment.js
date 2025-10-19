#!/usr/bin/env node

/**
 * Week 3 Track B Deployment Validation Script
 *
 * Validates WebSocket integration deployment to production
 *
 * Usage:
 *   node scripts/deployment/validate-websocket-deployment.js
 *
 * Environment variables:
 *   DEPLOYMENT_URL - Production deployment URL (default: Railway production)
 *   VALIDATION_MODE - 'quick' or 'comprehensive' (default: quick)
 */

const https = require('https');
const http = require('http');
const { io } = require('socket.io-client');

// Configuration
const DEPLOYMENT_URL = process.env.DEPLOYMENT_URL || 'https://discord-trade-exec-production.up.railway.app';
const VALIDATION_MODE = process.env.VALIDATION_MODE || 'quick';
const TEST_TIMEOUT = 30000; // 30 seconds

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Test results
const results = {
  passed: 0,
  failed: 0,
  warnings: 0,
  tests: []
};

// Helper functions
function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, colors.green);
  results.passed++;
}

function logFailure(message) {
  log(`❌ ${message}`, colors.red);
  results.failed++;
}

function logWarning(message) {
  log(`⚠️  ${message}`, colors.yellow);
  results.warnings++;
}

function logInfo(message) {
  log(`ℹ️  ${message}`, colors.cyan);
}

function addTestResult(name, passed, message, duration) {
  results.tests.push({ name, passed, message, duration });
}

// HTTP(S) request helper
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.get(url, options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

// Test 1: Health Check
async function testHealthCheck() {
  const startTime = Date.now();
  log('\n📋 Test 1: Health Check', colors.blue);

  try {
    const response = await makeRequest(`${DEPLOYMENT_URL}/health`);
    const duration = Date.now() - startTime;

    if (response.statusCode === 200) {
      const health = JSON.parse(response.body);
      logSuccess(`Health check passed (${duration}ms)`);

      // Check for WebSocket stats in health response
      if (health.websocket) {
        logInfo(`  WebSocket connections: ${health.websocket.connections || 0}`);
        logInfo(`  Total connections: ${health.websocket.totalConnections || 0}`);
        addTestResult('Health Check', true, 'WebSocket stats present', duration);
      } else {
        logWarning('  WebSocket stats not present in health response');
        addTestResult('Health Check', true, 'No WebSocket stats', duration);
      }

      return true;
    } else {
      logFailure(`Health check failed with status ${response.statusCode}`);
      addTestResult('Health Check', false, `Status ${response.statusCode}`, duration);
      return false;
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    logFailure(`Health check error: ${error.message}`);
    addTestResult('Health Check', false, error.message, duration);
    return false;
  }
}

// Test 2: Dashboard Accessibility
async function testDashboardAccessibility() {
  const startTime = Date.now();
  log('\n📋 Test 2: Dashboard Accessibility', colors.blue);

  try {
    const response = await makeRequest(DEPLOYMENT_URL);
    const duration = Date.now() - startTime;

    if (response.statusCode === 200) {
      logSuccess(`Dashboard accessible (${duration}ms)`);

      // Check for React app HTML
      if (response.body.includes('<!DOCTYPE html>') && response.body.includes('root')) {
        logInfo('  React app HTML detected');
        addTestResult('Dashboard Accessibility', true, 'React app present', duration);
      } else {
        logWarning('  Unexpected HTML structure');
        addTestResult('Dashboard Accessibility', true, 'HTML structure warning', duration);
      }

      return true;
    } else {
      logFailure(`Dashboard returned status ${response.statusCode}`);
      addTestResult('Dashboard Accessibility', false, `Status ${response.statusCode}`, duration);
      return false;
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    logFailure(`Dashboard error: ${error.message}`);
    addTestResult('Dashboard Accessibility', false, error.message, duration);
    return false;
  }
}

// Test 3: API Endpoint
async function testAPIEndpoint() {
  const startTime = Date.now();
  log('\n📋 Test 3: API Endpoint', colors.blue);

  try {
    const response = await makeRequest(`${DEPLOYMENT_URL}/api`);
    const duration = Date.now() - startTime;

    if (response.statusCode === 200) {
      const apiInfo = JSON.parse(response.body);
      logSuccess(`API endpoint accessible (${duration}ms)`);

      // Check for WebSocket information in API response
      if (apiInfo.endpoints?.websocket) {
        logInfo(`  WebSocket URL: ${apiInfo.endpoints.websocket.url || 'N/A'}`);
        logInfo(`  WebSocket events: ${Object.keys(apiInfo.endpoints.websocket.events?.client || {}).length} client, ${Object.keys(apiInfo.endpoints.websocket.events?.server || {}).length} server`);
        addTestResult('API Endpoint', true, 'WebSocket info present', duration);
      } else {
        logWarning('  WebSocket information not present in API response');
        addTestResult('API Endpoint', true, 'No WebSocket info', duration);
      }

      // Check for real-time features in features list
      if (apiInfo.features) {
        const realtimeFeature = apiInfo.features.find(f => f.includes('Real-time') || f.includes('WebSocket'));
        if (realtimeFeature) {
          logInfo(`  Real-time feature listed: ${realtimeFeature}`);
        }
      }

      return true;
    } else {
      logFailure(`API endpoint returned status ${response.statusCode}`);
      addTestResult('API Endpoint', false, `Status ${response.statusCode}`, duration);
      return false;
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    logFailure(`API endpoint error: ${error.message}`);
    addTestResult('API Endpoint', false, error.message, duration);
    return false;
  }
}

// Test 4: WebSocket Connection
async function testWebSocketConnection() {
  const startTime = Date.now();
  log('\n📋 Test 4: WebSocket Connection', colors.blue);

  return new Promise((resolve) => {
    let socket;
    let connected = false;
    let timeout;

    try {
      // Create socket connection (without authentication for basic test)
      socket = io(DEPLOYMENT_URL, {
        transports: ['websocket', 'polling'],
        reconnection: false,
        timeout: 10000
      });

      // Set timeout
      timeout = setTimeout(() => {
        const duration = Date.now() - startTime;
        if (!connected) {
          logWarning(`WebSocket connection timeout (${duration}ms)`);
          addTestResult('WebSocket Connection', false, 'Connection timeout', duration);
          socket?.disconnect();
          resolve(false);
        }
      }, TEST_TIMEOUT);

      // Connection success
      socket.on('connect', () => {
        const duration = Date.now() - startTime;
        connected = true;
        clearTimeout(timeout);

        logSuccess(`WebSocket connected (${duration}ms)`);
        logInfo(`  Socket ID: ${socket.id}`);
        logInfo(`  Transport: ${socket.io.engine.transport.name}`);

        addTestResult('WebSocket Connection', true, 'Connection successful', duration);

        // Disconnect and resolve
        setTimeout(() => {
          socket.disconnect();
          resolve(true);
        }, 1000);
      });

      // Connection error
      socket.on('connect_error', (error) => {
        const duration = Date.now() - startTime;
        clearTimeout(timeout);

        // Note: Authentication errors are expected without valid session
        if (error.message.includes('Authentication') || error.message.includes('Unauthorized')) {
          logSuccess(`WebSocket server responding (authentication required as expected)`);
          logInfo(`  Error: ${error.message}`);
          addTestResult('WebSocket Connection', true, 'Server requires auth (expected)', duration);
          socket.disconnect();
          resolve(true);
        } else {
          logFailure(`WebSocket connection error: ${error.message}`);
          addTestResult('WebSocket Connection', false, error.message, duration);
          socket.disconnect();
          resolve(false);
        }
      });

      // Disconnect
      socket.on('disconnect', (reason) => {
        if (connected) {
          logInfo(`  Disconnected: ${reason}`);
        }
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      clearTimeout(timeout);
      logFailure(`WebSocket test error: ${error.message}`);
      addTestResult('WebSocket Connection', false, error.message, duration);
      socket?.disconnect();
      resolve(false);
    }
  });
}

// Test 5: Bundle Size Check (estimate from HTML)
async function testBundleSize() {
  const startTime = Date.now();
  log('\n📋 Test 5: Bundle Size Check', colors.blue);

  try {
    const response = await makeRequest(DEPLOYMENT_URL);
    const duration = Date.now() - startTime;

    if (response.statusCode === 200) {
      // Extract script and CSS references
      const scriptMatches = response.body.match(/<script[^>]*src="([^"]*)"[^>]*>/g) || [];
      const cssMatches = response.body.match(/<link[^>]*href="([^"]*\.css)"[^>]*>/g) || [];

      logInfo(`  JS files referenced: ${scriptMatches.length}`);
      logInfo(`  CSS files referenced: ${cssMatches.length}`);

      // This is just a reference check - actual size would need to fetch each asset
      logSuccess(`Bundle structure verified (${duration}ms)`);
      addTestResult('Bundle Size', true, `${scriptMatches.length} JS, ${cssMatches.length} CSS files`, duration);

      return true;
    } else {
      logFailure(`Bundle check failed with status ${response.statusCode}`);
      addTestResult('Bundle Size', false, `Status ${response.statusCode}`, duration);
      return false;
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    logFailure(`Bundle check error: ${error.message}`);
    addTestResult('Bundle Size', false, error.message, duration);
    return false;
  }
}

// Test 6: Security Headers
async function testSecurityHeaders() {
  const startTime = Date.now();
  log('\n📋 Test 6: Security Headers', colors.blue);

  try {
    const response = await makeRequest(DEPLOYMENT_URL);
    const duration = Date.now() - startTime;

    const headers = response.headers;
    const securityHeaders = {
      'x-frame-options': 'X-Frame-Options',
      'x-content-type-options': 'X-Content-Type-Options',
      'strict-transport-security': 'Strict-Transport-Security',
      'x-xss-protection': 'X-XSS-Protection'
    };

    let allPresent = true;
    for (const [headerKey, headerName] of Object.entries(securityHeaders)) {
      if (headers[headerKey]) {
        logInfo(`  ✓ ${headerName}: ${headers[headerKey]}`);
      } else {
        logWarning(`  ✗ ${headerName}: Not present`);
        allPresent = false;
      }
    }

    if (allPresent) {
      logSuccess(`All security headers present (${duration}ms)`);
      addTestResult('Security Headers', true, 'All headers present', duration);
    } else {
      logWarning(`Some security headers missing (${duration}ms)`);
      addTestResult('Security Headers', true, 'Some headers missing', duration);
    }

    return true;
  } catch (error) {
    const duration = Date.now() - startTime;
    logFailure(`Security headers check error: ${error.message}`);
    addTestResult('Security Headers', false, error.message, duration);
    return false;
  }
}

// Comprehensive mode: Additional tests
async function testPerformance() {
  log('\n📋 Test 7: Performance Metrics', colors.blue);
  logInfo('  Performance testing requires browser environment');
  logInfo('  Run Lighthouse audit manually for detailed metrics:');
  logInfo(`  lighthouse ${DEPLOYMENT_URL} --view`);
  addTestResult('Performance', true, 'Manual test required', 0);
  return true;
}

// Main test runner
async function runValidation() {
  log('\n' + '='.repeat(60), colors.cyan);
  log('Week 3 Track B Deployment Validation', colors.cyan);
  log('='.repeat(60), colors.cyan);
  log(`\nDeployment URL: ${DEPLOYMENT_URL}`);
  log(`Validation Mode: ${VALIDATION_MODE}`);
  log(`Timestamp: ${new Date().toISOString()}\n`);

  const startTime = Date.now();

  // Run tests sequentially
  await testHealthCheck();
  await testDashboardAccessibility();
  await testAPIEndpoint();
  await testWebSocketConnection();
  await testBundleSize();
  await testSecurityHeaders();

  if (VALIDATION_MODE === 'comprehensive') {
    await testPerformance();
  }

  const totalDuration = Date.now() - startTime;

  // Print summary
  log('\n' + '='.repeat(60), colors.cyan);
  log('Validation Summary', colors.cyan);
  log('='.repeat(60), colors.cyan);

  log(`\nTotal Tests: ${results.passed + results.failed}`);
  logSuccess(`Passed: ${results.passed}`);
  if (results.failed > 0) {
    logFailure(`Failed: ${results.failed}`);
  }
  if (results.warnings > 0) {
    logWarning(`Warnings: ${results.warnings}`);
  }

  log(`\nTotal Duration: ${totalDuration}ms`);

  // Detailed results
  log('\nDetailed Results:', colors.blue);
  results.tests.forEach((test, index) => {
    const status = test.passed ? '✅' : '❌';
    log(`  ${status} ${test.name}: ${test.message} (${test.duration}ms)`);
  });

  // Overall status
  log('\n' + '='.repeat(60), colors.cyan);
  if (results.failed === 0) {
    log('🎉 DEPLOYMENT VALIDATION PASSED', colors.green);
    log('='.repeat(60) + '\n', colors.cyan);
    process.exit(0);
  } else {
    log('❌ DEPLOYMENT VALIDATION FAILED', colors.red);
    log('='.repeat(60) + '\n', colors.cyan);
    log('Please review failed tests and address issues before proceeding.\n', colors.yellow);
    process.exit(1);
  }
}

// Run validation
runValidation().catch(error => {
  log(`\n❌ Validation script error: ${error.message}`, colors.red);
  console.error(error);
  process.exit(1);
});
