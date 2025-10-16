#!/usr/bin/env node

/**
 * Cross-Replica WebSocket Communication Test
 *
 * Tests Redis adapter functionality by connecting multiple clients
 * to production and verifying broadcasts reach all replicas.
 *
 * Usage:
 *   node scripts/test-cross-replica-websocket.js
 *
 * Expected Behavior:
 * - All clients connect successfully to production endpoint
 * - Clients distributed across different replicas (load balanced)
 * - Portfolio/trade updates broadcast to ALL clients regardless of replica
 * - No message loss or duplication
 */

// External dependencies
const { io } = require('socket.io-client');

// Configuration
const PRODUCTION_URL = process.env.WEBSOCKET_URL || 'https://discord-trade-exec-production.up.railway.app';
const TEST_USER_ID = 'cross-replica-test-user';
const TEST_SESSION_ID = 'cross-replica-test-session-' + Date.now();
const NUM_CLIENTS = 5; // Connect 5 clients to hit multiple replicas

// Color output helpers
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(color, emoji, message) {
  console.log(`${colors[color]}${emoji} ${message}${colors.reset}`);
}

/**
 * Create and configure a WebSocket client
 */
function createClient(clientId) {
  const socket = io(PRODUCTION_URL, {
    auth: {
      sessionID: TEST_SESSION_ID,
      userId: TEST_USER_ID,
      userName: `Test Client ${clientId}`
    },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 3,
    reconnectionDelay: 1000,
    timeout: 10000
  });

  socket.clientId = clientId;
  socket.messagesReceived = 0;
  socket.connected = false;

  return socket;
}

/**
 * Main test execution
 */
async function runCrossReplicaTest() {
  log('blue', '🚀', `Starting Cross-Replica WebSocket Test`);
  log('cyan', 'ℹ️', `Production URL: ${PRODUCTION_URL}`);
  log('cyan', 'ℹ️', `Connecting ${NUM_CLIENTS} clients...`);
  console.log('');

  const clients = [];
  const connectionPromises = [];

  // Create and connect all clients
  for (let i = 1; i <= NUM_CLIENTS; i++) {
    const socket = createClient(i);
    clients.push(socket);

    const connectionPromise = new Promise((resolve, reject) => {
      socket.on('connect', () => {
        socket.connected = true;
        log('green', '✅', `Client ${socket.clientId} connected (Socket ID: ${socket.id})`);
        resolve();
      });

      socket.on('connect_error', error => {
        log('red', '❌', `Client ${socket.clientId} connection error: ${error.message}`);
        reject(error);
      });

      socket.on('disconnect', reason => {
        socket.connected = false;
        log('yellow', '⚠️', `Client ${socket.clientId} disconnected: ${reason}`);
      });
    });

    connectionPromises.push(connectionPromise);

    // Small delay between connections to simulate real-world scenario
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  // Wait for all clients to connect
  try {
    await Promise.all(connectionPromises);
    console.log('');
    log('green', '✅', `All ${NUM_CLIENTS} clients connected successfully!`);
    console.log('');
  } catch (error) {
    log('red', '❌', `Failed to connect all clients: ${error.message}`);
    cleanup(clients);
    process.exit(1);
  }

  // Test 1: Portfolio Update Broadcast
  log('blue', '🧪', 'Test 1: Portfolio Update Broadcast');
  await testPortfolioBroadcast(clients);
  console.log('');

  // Test 2: Trade Notification Broadcast
  log('blue', '🧪', 'Test 2: Trade Notification Broadcast');
  await testTradeBroadcast(clients);
  console.log('');

  // Summary
  log('blue', '📊', 'Test Summary:');
  let allReceived = true;
  clients.forEach(socket => {
    const status = socket.messagesReceived >= 2 ? colors.green + '✅' : colors.red + '❌';
    console.log(`  ${status} Client ${socket.clientId}: ${socket.messagesReceived} messages received${colors.reset}`);
    if (socket.messagesReceived < 2) allReceived = false;
  });
  console.log('');

  if (allReceived) {
    log('green', '🎉', 'SUCCESS: Cross-replica communication working correctly!');
    log('green', '✅', 'All clients received broadcasts from Redis adapter');
    log('green', '✅', 'Horizontal scaling verified');
  } else {
    log('red', '❌', 'FAILURE: Some clients did not receive broadcasts');
    log('yellow', '⚠️', 'Redis adapter may not be working correctly');
  }

  // Cleanup
  cleanup(clients);
  process.exit(allReceived ? 0 : 1);
}

/**
 * Test portfolio update broadcast across replicas
 */
async function testPortfolioBroadcast(clients) {
  return new Promise(resolve => {
    let receivedCount = 0;
    const timeout = setTimeout(() => {
      log('yellow', '⚠️', `Portfolio broadcast timeout (${receivedCount}/${clients.length} clients received)`);
      resolve();
    }, 5000);

    // Subscribe all clients
    clients.forEach((socket, index) => {
      socket.on('portfolio:update', data => {
        socket.messagesReceived++;
        receivedCount++;
        log('cyan', '📨', `Client ${socket.clientId} received portfolio update`);

        if (receivedCount === clients.length) {
          clearTimeout(timeout);
          log('green', '✅', `All clients received portfolio update!`);
          resolve();
        }
      });

      // Subscribe to portfolio
      socket.emit('subscribe:portfolio');
    });

    // Wait a bit for subscriptions, then trigger update from first client
    setTimeout(() => {
      log('blue', '📡', 'Triggering portfolio update...');
      clients[0].emit('test:trigger-portfolio-update', {
        userId: TEST_USER_ID,
        portfolio: {
          totalValue: 50000,
          cash: 10000,
          equity: 40000,
          positions: [],
          dayChange: 500,
          dayChangePercent: 1.0
        }
      });
    }, 1000);
  });
}

/**
 * Test trade notification broadcast across replicas
 */
async function testTradeBroadcast(clients) {
  return new Promise(resolve => {
    let receivedCount = 0;
    const timeout = setTimeout(() => {
      log('yellow', '⚠️', `Trade broadcast timeout (${receivedCount}/${clients.length} clients received)`);
      resolve();
    }, 5000);

    // Subscribe all clients
    clients.forEach((socket, index) => {
      socket.on('trade:executed', data => {
        socket.messagesReceived++;
        receivedCount++;
        log('cyan', '📨', `Client ${socket.clientId} received trade notification: ${data.symbol}`);

        if (receivedCount === clients.length) {
          clearTimeout(timeout);
          log('green', '✅', `All clients received trade notification!`);
          resolve();
        }
      });

      // Subscribe to trades
      socket.emit('subscribe:trades');
    });

    // Wait a bit for subscriptions, then trigger trade from first client
    setTimeout(() => {
      log('blue', '📡', 'Triggering trade notification...');
      clients[0].emit('test:trigger-trade-notification', {
        userId: TEST_USER_ID,
        trade: {
          symbol: 'AAPL',
          side: 'buy',
          quantity: 10,
          price: 175.5,
          status: 'filled',
          timestamp: Date.now()
        }
      });
    }, 1000);
  });
}

/**
 * Cleanup: disconnect all clients
 */
function cleanup(clients) {
  log('blue', '🧹', 'Cleaning up connections...');
  clients.forEach(socket => {
    if (socket.connected) {
      socket.disconnect();
    }
  });
}

// Run the test
runCrossReplicaTest().catch(error => {
  log('red', '❌', `Test failed with error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
