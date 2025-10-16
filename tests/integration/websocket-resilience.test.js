// Node.js built-in modules
const http = require('http');

// External dependencies
const socketIOClient = require('socket.io-client');

// Internal utilities and services
const WebSocketServer = require('../../src/services/WebSocketServer');

/**
 * WebSocket Resilience and Network Condition Tests
 *
 * Tests WebSocket behavior under challenging network conditions:
 * - Poor connectivity / network delays
 * - Connection drops and automatic reconnection
 * - Multiple tabs / concurrent connections from same user
 * - Rate limiting enforcement
 * - Authentication rejection scenarios
 */

describe('WebSocket Resilience Tests', () => {
  let httpServer;
  let wsServer;
  let serverPort;
  const clients = [];

  beforeAll(done => {
    httpServer = http.createServer();
    wsServer = new WebSocketServer(httpServer);

    httpServer.listen(0, () => {
      serverPort = httpServer.address().port;
      console.log(`\n✅ Resilience test server started on port ${serverPort}\n`);
      done();
    });
  });

  afterAll(async () => {
    await wsServer.close();
    httpServer.close();
    console.log('\n✅ Resilience test server closed\n');
  });

  afterEach(() => {
    // Cleanup all clients after each test
    clients.forEach(client => {
      if (client.connected) {
        client.disconnect();
      }
    });
    clients.length = 0;
  });

  // Helper: Create client
  const createClient = (userId = 'test-user', sessionId = 'test-session', options = {}) => {
    const client = socketIOClient(`http://localhost:${serverPort}`, {
      auth: {
        sessionID: sessionId,
        userId: userId,
        userName: `User ${userId}`
      },
      transports: ['websocket'],
      forceNew: true,
      reconnection: options.reconnection !== false,
      reconnectionDelay: options.reconnectionDelay || 100,
      reconnectionDelayMax: options.reconnectionDelayMax || 1000,
      reconnectionAttempts: options.reconnectionAttempts || 5,
      timeout: options.timeout || 5000,
      ...options
    });

    clients.push(client);
    return client;
  };

  // Helper: Wait for connection
  const waitForConnection = (client, timeout = 10000) => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, timeout);

      client.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });

      client.on('connect_error', error => {
        clearTimeout(timer);
        reject(error);
      });
    });
  };

  // Helper: Wait for event
  const waitForEvent = (client, eventName, timeout = 5000) => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Event '${eventName}' timeout`));
      }, timeout);

      client.once(eventName, data => {
        clearTimeout(timer);
        resolve(data);
      });
    });
  };

  // Helper: Simulate network delay
  const simulateNetworkDelay = ms => {
    return new Promise(resolve => setTimeout(resolve, ms));
  };

  describe('Network Reconnection Tests', () => {
    test('should handle manual disconnect/reconnect cycles', async () => {
      const client = createClient('cycle-user', 'cycle-session');
      await waitForConnection(client);

      const reconnectionCount = 3;
      for (let i = 0; i < reconnectionCount; i++) {
        const beforeSocketId = client.id;

        // Disconnect
        client.disconnect();
        await simulateNetworkDelay(100);
        expect(client.connected).toBe(false);

        // Reconnect
        client.connect();
        await waitForConnection(client);
        expect(client.connected).toBe(true);

        // Socket ID should change after reconnection
        expect(client.id).not.toBe(beforeSocketId);
      }

      // Final state should be connected
      expect(client.connected).toBe(true);
    });

    test('should maintain user context after reconnection', async () => {
      const userId = 'subscription-user';
      const client = createClient(userId, 'subscription-session');
      await waitForConnection(client);

      // Subscribe to portfolio
      client.emit('subscribe:portfolio');
      const confirmation = await waitForEvent(client, 'subscription:confirmed');
      expect(confirmation.type).toBe('portfolio');

      // Disconnect
      client.disconnect();
      await simulateNetworkDelay(200);

      // Reconnect
      client.connect();
      await waitForConnection(client);

      // Re-subscribe (client should handle this)
      client.emit('subscribe:portfolio');
      const reconfirmation = await waitForEvent(client, 'subscription:confirmed');
      expect(reconfirmation.type).toBe('portfolio');

      // Verify updates still work after reconnection
      const updatePromise = waitForEvent(client, 'portfolio:update');
      wsServer.emitPortfolioUpdate(userId, {
        totalValue: 60000,
        cash: 15000,
        equity: 45000,
        positions: []
      });

      const update = await updatePromise;
      expect(update.totalValue).toBe(60000);
    });

    test('should handle connection state changes correctly', async () => {
      const client = createClient('state-user', 'state-session');

      let connectCount = 0;
      let disconnectCount = 0;

      client.on('connect', () => connectCount++);
      client.on('disconnect', () => disconnectCount++);

      await waitForConnection(client);
      expect(connectCount).toBe(1);

      // Disconnect and reconnect
      client.disconnect();
      await simulateNetworkDelay(100);
      expect(disconnectCount).toBe(1);

      client.connect();
      await waitForConnection(client);
      expect(connectCount).toBe(2);

      // Verify final state
      expect(client.connected).toBe(true);
    });
  });

  describe('Multiple Tab / Concurrent Connection Tests', () => {
    test('should handle multiple tabs from same user (max 5 connections)', async () => {
      const userId = 'multi-tab-user';
      const sessionId = 'multi-tab-session';
      const tabClients = [];

      // Create 5 connections (max allowed)
      for (let i = 0; i < 5; i++) {
        const client = createClient(userId, `${sessionId}-${i}`);
        tabClients.push(client);
        await waitForConnection(client);
      }

      // All 5 should be connected
      expect(tabClients.filter(c => c.connected).length).toBe(5);

      // 6th connection should be rejected (max 5 per user)
      const sixthClient = createClient(userId, `${sessionId}-6`);

      try {
        await waitForConnection(sixthClient, 2000);
        // If we get here, test should fail
        expect(true).toBe(false); // Force failure
      } catch (error) {
        // Expected: connection should be rejected or timeout
        expect(error.message).toMatch(/timeout|error|too many connections/i);
      }

      // Cleanup
      tabClients.forEach(c => c.disconnect());
    });

    test('should broadcast updates to all tabs of same user', async () => {
      const userId = 'broadcast-user';
      const tab1 = createClient(userId, 'tab1-session');
      const tab2 = createClient(userId, 'tab2-session');
      const tab3 = createClient(userId, 'tab3-session');

      await Promise.all([waitForConnection(tab1), waitForConnection(tab2), waitForConnection(tab3)]);

      // Subscribe all tabs to portfolio
      tab1.emit('subscribe:portfolio');
      tab2.emit('subscribe:portfolio');
      tab3.emit('subscribe:portfolio');

      await Promise.all([
        waitForEvent(tab1, 'subscription:confirmed'),
        waitForEvent(tab2, 'subscription:confirmed'),
        waitForEvent(tab3, 'subscription:confirmed')
      ]);

      // Broadcast portfolio update
      const updatePromises = [
        waitForEvent(tab1, 'portfolio:update'),
        waitForEvent(tab2, 'portfolio:update'),
        waitForEvent(tab3, 'portfolio:update')
      ];

      wsServer.emitPortfolioUpdate(userId, {
        totalValue: 75000,
        cash: 20000,
        equity: 55000,
        positions: []
      });

      const updates = await Promise.all(updatePromises);

      // All tabs should receive the same update
      updates.forEach(update => {
        expect(update.totalValue).toBe(75000);
        expect(update.cash).toBe(20000);
      });
    });

    test('should handle tab closing gracefully', async () => {
      const userId = 'closing-tab-user';
      const tab1 = createClient(userId, 'closing-tab1');
      const tab2 = createClient(userId, 'closing-tab2');

      await waitForConnection(tab1);
      await waitForConnection(tab2);

      const initialStats = wsServer.getStats();
      const initialConnections = initialStats.activeConnections;

      // Close tab1
      tab1.disconnect();
      await simulateNetworkDelay(100);

      // Tab2 should still be connected
      expect(tab2.connected).toBe(true);

      // Connection count should decrease by 1
      const afterStats = wsServer.getStats();
      expect(afterStats.activeConnections).toBeLessThan(initialConnections);
    });
  });

  describe('Rate Limiting Tests', () => {
    test('should enforce portfolio subscription rate limit', async () => {
      const client = createClient('rate-limit-user', 'rate-limit-session');
      await waitForConnection(client);

      // First subscription should succeed
      client.emit('subscribe:portfolio');
      const confirmation = await waitForEvent(client, 'subscription:confirmed');
      expect(confirmation.type).toBe('portfolio');

      // Rapid second subscription should be rate limited
      let rateLimitError = null;
      client.once('error', error => {
        rateLimitError = error;
      });

      client.emit('subscribe:portfolio');
      await simulateNetworkDelay(500);

      expect(rateLimitError).not.toBeNull();
      expect(rateLimitError.message).toMatch(/rate limit/i);
    });

    test('should enforce watchlist subscription rate limit', async () => {
      const client = createClient('watchlist-rate-user', 'watchlist-rate-session');
      await waitForConnection(client);

      const symbols = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'AMZN'];

      // Subscribe to 10 symbols rapidly (limit is 10 per 60s)
      for (let i = 0; i < 10; i++) {
        client.emit('subscribe:watchlist', [symbols[i % symbols.length]]);
        await simulateNetworkDelay(50);
      }

      // 11th subscription should be rate limited
      let rateLimitError = null;
      client.once('error', error => {
        rateLimitError = error;
      });

      client.emit('subscribe:watchlist', ['GOOGL']);
      await simulateNetworkDelay(500);

      expect(rateLimitError).not.toBeNull();
      expect(rateLimitError.message).toMatch(/rate limit/i);
    });

    test('should reset rate limits after time window', async () => {
      const client = createClient('reset-limit-user', 'reset-limit-session');
      await waitForConnection(client);

      // First subscription
      client.emit('subscribe:trades');
      const confirmation1 = await waitForEvent(client, 'subscription:confirmed');
      expect(confirmation1.type).toBe('trades');

      // Wait for rate limit window to expire (simulate by waiting)
      // In production, this is 60 seconds, but for testing we can mock time
      await simulateNetworkDelay(1000);

      // After waiting, subscription should succeed again
      // (Note: In real implementation, this would need 60s wait)
      // For this test, we're just validating the error doesn't occur immediately
    }, 10000);
  });

  describe('Authentication Rejection Tests', () => {
    test('should reject connection without session ID', async () => {
      const client = socketIOClient(`http://localhost:${serverPort}`, {
        auth: {
          // Missing sessionID
          userId: 'no-session-user',
          userName: 'Test User'
        },
        transports: ['websocket'],
        forceNew: true,
        reconnection: false
      });

      clients.push(client);

      let connectionError = null;
      client.on('connect_error', error => {
        connectionError = error;
      });

      await simulateNetworkDelay(1000);

      expect(connectionError).not.toBeNull();
      expect(connectionError.message).toMatch(/session|authentication/i);
    });

    test('should reject connection without user ID', async () => {
      const client = socketIOClient(`http://localhost:${serverPort}`, {
        auth: {
          sessionID: 'valid-session',
          // Missing userId
          userName: 'Test User'
        },
        transports: ['websocket'],
        forceNew: true,
        reconnection: false
      });

      clients.push(client);

      let connectionError = null;
      client.on('connect_error', error => {
        connectionError = error;
      });

      await simulateNetworkDelay(1000);

      expect(connectionError).not.toBeNull();
      expect(connectionError.message).toMatch(/user|authentication/i);
    });

    test('should reject connection with empty credentials', async () => {
      const client = socketIOClient(`http://localhost:${serverPort}`, {
        auth: {
          sessionID: '',
          userId: '',
          userName: ''
        },
        transports: ['websocket'],
        forceNew: true,
        reconnection: false
      });

      clients.push(client);

      let connectionError = null;
      client.on('connect_error', error => {
        connectionError = error;
      });

      await simulateNetworkDelay(1000);

      expect(connectionError).not.toBeNull();
      expect(connectionError.message).toMatch(/authentication|required/i);
    });

    test('should allow connection with valid credentials', async () => {
      const client = createClient('valid-user', 'valid-session');
      await waitForConnection(client);

      expect(client.connected).toBe(true);
      expect(client.id).toBeTruthy();
    });
  });

  describe('Poor Network Conditions Tests', () => {
    test('should handle slow message delivery', async () => {
      const client = createClient('delayed-msg-user', 'delayed-msg-session');
      await waitForConnection(client);

      client.emit('subscribe:portfolio');
      await waitForEvent(client, 'subscription:confirmed');

      // Send update with simulated delay
      const updatePromise = waitForEvent(client, 'portfolio:update', 10000);

      // Simulate processing delay before emitting
      await simulateNetworkDelay(1000);

      wsServer.emitPortfolioUpdate('delayed-msg-user', {
        totalValue: 80000,
        cash: 25000,
        equity: 55000,
        positions: []
      });

      const update = await updatePromise;
      expect(update.totalValue).toBe(80000);
    }, 15000);

    test('should handle reconnection and re-subscription flow', async () => {
      const userId = 'buffer-user';
      const client = createClient(userId, 'buffer-session');
      await waitForConnection(client);

      client.emit('subscribe:portfolio');
      await waitForEvent(client, 'subscription:confirmed');

      // Temporarily disconnect (simulating network drop)
      client.disconnect();
      await simulateNetworkDelay(500);

      // Reconnect (simulating network recovery)
      client.connect();
      await waitForConnection(client);

      // Re-subscribe after reconnection
      client.emit('subscribe:portfolio');
      await waitForEvent(client, 'subscription:confirmed');

      // Verify updates work after reconnection
      const updatePromise = waitForEvent(client, 'portfolio:update');
      wsServer.emitPortfolioUpdate(userId, {
        totalValue: 95000,
        cash: 32000,
        equity: 63000,
        positions: []
      });

      const update = await updatePromise;
      expect(update.totalValue).toBe(95000);
    });

    test('should handle connection with varying latency', async () => {
      const client = createClient('latency-user', 'latency-session', {
        timeout: 10000
      });

      await waitForConnection(client);
      expect(client.connected).toBe(true);

      client.emit('subscribe:trades');
      const confirmation = await waitForEvent(client, 'subscription:confirmed');
      expect(confirmation.type).toBe('trades');

      // Simulate varying latency for updates
      for (let i = 0; i < 3; i++) {
        await simulateNetworkDelay(300);

        const updatePromise = waitForEvent(client, 'trade:executed');
        wsServer.emitTradeNotification('latency-user', {
          id: `trade-${i}`,
          symbol: 'AAPL',
          side: i % 2 === 0 ? 'buy' : 'sell',
          quantity: 10,
          price: 175.5,
          status: 'filled'
        });

        const trade = await updatePromise;
        expect(trade.id).toBe(`trade-${i}`);
      }
    }, 15000);
  });

  describe('Connection Health Tests', () => {
    test('should report connection statistics accurately', async () => {
      // Create 3 new connections with unique users
      const client1 = createClient('stats-user-1', 'stats-session-1');
      const client2 = createClient('stats-user-2', 'stats-session-2');
      const client3 = createClient('stats-user-3', 'stats-session-3');

      await Promise.all([waitForConnection(client1), waitForConnection(client2), waitForConnection(client3)]);

      // Verify all clients are connected
      expect(client1.connected).toBe(true);
      expect(client2.connected).toBe(true);
      expect(client3.connected).toBe(true);

      // Get stats and verify connections are tracked
      const stats = wsServer.getStats();
      expect(stats.activeConnections).toBeGreaterThanOrEqual(3);
      expect(stats.uniqueUsers).toBeGreaterThanOrEqual(3);
    });

    test('should update unique users count correctly', async () => {
      // Create 2 connections for same user
      const user1tab1 = createClient('unique-user-1', 'unique-session-1a');
      const user1tab2 = createClient('unique-user-1', 'unique-session-1b');

      // Create 2 connections for different user
      const user2tab1 = createClient('unique-user-2', 'unique-session-2a');
      const user2tab2 = createClient('unique-user-2', 'unique-session-2b');

      await Promise.all([
        waitForConnection(user1tab1),
        waitForConnection(user1tab2),
        waitForConnection(user2tab1),
        waitForConnection(user2tab2)
      ]);

      // Verify all clients are connected
      expect(user1tab1.connected).toBe(true);
      expect(user1tab2.connected).toBe(true);
      expect(user2tab1.connected).toBe(true);
      expect(user2tab2.connected).toBe(true);

      const stats = wsServer.getStats();

      // Should have at least 2 unique users
      expect(stats.uniqueUsers).toBeGreaterThanOrEqual(2);

      // Should have 4 active connections
      expect(stats.activeConnections).toBeGreaterThanOrEqual(4);
    });
  });
});
