// Node.js built-in modules
const http = require('http');

// External dependencies
const socketIOClient = require('socket.io-client');

// Internal utilities and services
const { analyzeSignalQuality } = require('../src/services/signal-quality-tracker');
const WebSocketServer = require('../src/services/WebSocketServer');

/**
 * Real-Time Signal Quality Update Tests
 *
 * Validates the complete flow:
 * 1. Trade execution triggers signal quality analysis
 * 2. Quality data is emitted via WebSocket
 * 3. Frontend clients receive updates in real-time
 * 4. Multiple clients can receive simultaneous updates
 */

describe('Real-Time Signal Quality Updates', () => {
  let httpServer;
  let wsServer;
  let serverPort;

  beforeAll(done => {
    httpServer = http.createServer();
    wsServer = new WebSocketServer(httpServer);

    httpServer.listen(0, () => {
      serverPort = httpServer.address().port;
      console.log(`\n✅ Signal quality test server started on port ${serverPort}\n`);
      done();
    });
  });

  afterAll(async () => {
    await wsServer.close();
    httpServer.close();
    console.log('\n✅ Signal quality test server closed\n');
  });

  // Helper to create authenticated client
  const createClient = (userId, sessionId) => {
    return socketIOClient(`http://localhost:${serverPort}`, {
      auth: {
        sessionID: sessionId,
        userId: userId,
        userName: `Test User ${userId}`
      },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false
    });
  };

  // Helper to wait for connection
  const waitForConnection = (client, timeout = 5000) => {
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

  describe('Signal Quality Emission', () => {
    test('should emit signal quality update to specific user', async () => {
      console.log('\n📊 Testing signal quality emission to user...');

      const userId = 'test-user-001';
      const tradeId = 'test-trade-001';
      const client = createClient(userId, 'session-001');

      try {
        // Connect client
        await waitForConnection(client);
        expect(client.connected).toBe(true);

        // Set up listener for signal:quality event
        const qualityReceived = new Promise(resolve => {
          client.once('signal:quality', data => {
            resolve(data);
          });
        });

        // Emit signal quality update
        const qualityData = {
          quality: {
            tier: 'ELITE',
            symbol: '⭐',
            confidence: 92,
            description: 'Exceptional signal quality'
          },
          smartMoney: {
            score: 85,
            indicators: {
              unusualTiming: true,
              highConviction: true,
              patternMatching: false,
              insiderLikelihood: true
            },
            breakdown: {
              unusualTiming: 25,
              highConviction: 30,
              patternMatching: 0,
              insiderLikelihood: 30
            }
          },
          rareInformation: {
            score: 78,
            level: 'HIGH',
            factors: [
              'After-hours trading detected',
              'Large position size relative to history',
              'Correlation with regulatory filing'
            ]
          }
        };

        wsServer.emitSignalQuality(userId, tradeId, qualityData);

        // Wait for client to receive
        const receivedData = await qualityReceived;

        // Verify data structure
        expect(receivedData).toBeDefined();
        expect(receivedData.tradeId).toBe(tradeId);
        expect(receivedData.quality).toBeDefined();
        expect(receivedData.quality.tier).toBe('ELITE');
        expect(receivedData.quality.confidence).toBe(92);
        expect(receivedData.smartMoney).toBeDefined();
        expect(receivedData.smartMoney.score).toBe(85);
        expect(receivedData.rareInformation).toBeDefined();
        expect(receivedData.rareInformation.level).toBe('HIGH');
        expect(receivedData.timestamp).toBeDefined();

        console.log('✅ Signal quality received and validated');
      } finally {
        client.disconnect();
      }
    }, 10000);

    test('should handle multiple simultaneous quality updates', async () => {
      console.log('\n📊 Testing multiple simultaneous quality updates...');

      const NUM_CLIENTS = 50;
      const clients = [];
      const receivePromises = [];

      try {
        // Create and connect clients
        for (let i = 0; i < NUM_CLIENTS; i++) {
          const userId = `bulk-user-${i}`;
          const client = createClient(userId, `bulk-session-${i}`);
          clients.push(client);

          const receivePromise = new Promise(resolve => {
            client.once('signal:quality', data => {
              resolve({ userId, data });
            });
          });
          receivePromises.push(receivePromise);

          await waitForConnection(client);
        }

        console.log(`✅ Connected ${NUM_CLIENTS} clients`);

        // Emit quality updates to all clients simultaneously
        const startTime = Date.now();

        for (let i = 0; i < NUM_CLIENTS; i++) {
          const userId = `bulk-user-${i}`;
          const tradeId = `bulk-trade-${i}`;

          wsServer.emitSignalQuality(userId, tradeId, {
            quality: {
              tier: i % 3 === 0 ? 'ELITE' : i % 3 === 1 ? 'VERIFIED' : 'STANDARD',
              confidence: 70 + (i % 30),
              symbol: i % 3 === 0 ? '⭐' : i % 3 === 1 ? '✓' : '○',
              description: 'Test quality data'
            },
            smartMoney: {
              score: 60 + (i % 40),
              indicators: {
                unusualTiming: i % 2 === 0,
                highConviction: i % 3 === 0,
                patternMatching: i % 5 === 0,
                insiderLikelihood: i % 7 === 0
              }
            },
            rareInformation: {
              score: 50 + (i % 50),
              level: i % 3 === 0 ? 'HIGH' : i % 3 === 1 ? 'MODERATE' : 'LOW',
              factors: []
            }
          });
        }

        // Wait for all clients to receive
        const results = await Promise.all(receivePromises);
        const totalTime = Date.now() - startTime;

        console.log(`\n📊 Broadcast Performance:`);
        console.log(`   Total time: ${totalTime}ms`);
        console.log(`   Average per client: ${(totalTime / NUM_CLIENTS).toFixed(2)}ms`);
        console.log(`   Updates/second: ${Math.round((NUM_CLIENTS / totalTime) * 1000)}`);

        // Verify all received
        expect(results.length).toBe(NUM_CLIENTS);
        results.forEach((result, index) => {
          expect(result.data).toBeDefined();
          expect(result.data.tradeId).toBe(`bulk-trade-${index}`);
          expect(result.data.quality).toBeDefined();
        });

        console.log('✅ All clients received quality updates');
      } finally {
        clients.forEach(client => {
          if (client.connected) client.disconnect();
        });
      }
    }, 30000);

    test('should not emit quality to wrong user', async () => {
      console.log('\n📊 Testing user isolation...');

      const user1 = createClient('isolated-user-1', 'isolated-session-1');
      const user2 = createClient('isolated-user-2', 'isolated-session-2');

      try {
        await Promise.all([waitForConnection(user1), waitForConnection(user2)]);

        let user1Received = false;
        let user2Received = false;

        user1.on('signal:quality', () => {
          user1Received = true;
        });

        user2.on('signal:quality', () => {
          user2Received = true;
        });

        // Emit only to user1
        wsServer.emitSignalQuality('isolated-user-1', 'trade-001', {
          quality: { tier: 'ELITE', confidence: 90, symbol: '⭐', description: 'Test' },
          smartMoney: { score: 80, indicators: {} },
          rareInformation: { score: 70, level: 'HIGH', factors: [] }
        });

        // Wait a bit
        await new Promise(resolve => setTimeout(resolve, 500));

        // Only user1 should have received
        expect(user1Received).toBe(true);
        expect(user2Received).toBe(false);

        console.log('✅ User isolation verified');
      } finally {
        user1.disconnect();
        user2.disconnect();
      }
    }, 10000);
  });

  describe('Signal Analysis Integration', () => {
    test('should analyze and emit quality for realistic trade', async () => {
      console.log('\n📊 Testing complete analysis + emission flow...');

      const userId = 'analysis-user-001';
      const client = createClient(userId, 'analysis-session-001');

      try {
        await waitForConnection(client);

        const qualityReceived = new Promise(resolve => {
          client.once('signal:quality', data => {
            resolve(data);
          });
        });

        // Simulate a realistic trade
        const trade = {
          tradeId: 'realistic-trade-001',
          symbol: 'AAPL',
          side: 'long',
          entryPrice: 175.5,
          quantity: 100,
          providerId: 'premium-signals-discord'
        };

        // Analyze quality (this would normally happen in TradeExecutor)
        // Skip provider stats database query for test
        const quality = await analyzeSignalQuality(trade, {
          includeProviderStats: false,
          includePositionSizing: false
        });

        expect(quality).toBeDefined();
        expect(quality.quality).toBeDefined();
        expect(quality.smartMoney).toBeDefined();

        // Emit via WebSocket
        wsServer.emitSignalQuality(userId, trade.tradeId, quality);

        // Verify client receives
        const received = await qualityReceived;

        expect(received.tradeId).toBe(trade.tradeId);
        expect(received.quality.tier).toBeDefined();
        expect(['ELITE', 'VERIFIED', 'STANDARD']).toContain(received.quality.tier);

        console.log(
          `✅ Quality analysis complete: ${received.quality.tier} (${received.quality.confidence}% confidence)`
        );
      } finally {
        client.disconnect();
      }
    }, 10000);
  });

  describe('Performance and Reliability', () => {
    test('should handle rapid quality updates for same user', async () => {
      console.log('\n📊 Testing rapid updates...');

      const userId = 'rapid-user-001';
      const client = createClient(userId, 'rapid-session-001');
      const NUM_UPDATES = 100;
      let receivedCount = 0;

      try {
        await waitForConnection(client);

        const receivePromise = new Promise(resolve => {
          client.on('signal:quality', () => {
            receivedCount++;
            if (receivedCount === NUM_UPDATES) {
              resolve();
            }
          });
        });

        // Send rapid updates
        const startTime = Date.now();

        for (let i = 0; i < NUM_UPDATES; i++) {
          wsServer.emitSignalQuality(userId, `rapid-trade-${i}`, {
            quality: { tier: 'STANDARD', confidence: 70, symbol: '○', description: 'Test' },
            smartMoney: { score: 60, indicators: {} },
            rareInformation: { score: 50, level: 'LOW', factors: [] }
          });
        }

        await receivePromise;

        const totalTime = Date.now() - startTime;

        console.log(`\n📊 Rapid Update Performance:`);
        console.log(`   Total updates: ${NUM_UPDATES}`);
        console.log(`   Total time: ${totalTime}ms`);
        console.log(`   Updates/second: ${Math.round((NUM_UPDATES / totalTime) * 1000)}`);

        expect(receivedCount).toBe(NUM_UPDATES);

        console.log('✅ All rapid updates received');
      } finally {
        client.disconnect();
      }
    }, 15000);

    test('should maintain data integrity under load', async () => {
      console.log('\n📊 Testing data integrity...');

      const userId = 'integrity-user-001';
      const client = createClient(userId, 'integrity-session-001');
      const testData = [];

      try {
        await waitForConnection(client);

        // Create unique test data
        for (let i = 0; i < 50; i++) {
          testData.push({
            tradeId: `integrity-trade-${i}`,
            expectedTier: i % 3 === 0 ? 'ELITE' : i % 3 === 1 ? 'VERIFIED' : 'STANDARD',
            expectedConfidence: 70 + i
          });
        }

        const receivePromises = testData.map(td => {
          return new Promise(resolve => {
            const handler = data => {
              if (data.tradeId === td.tradeId) {
                resolve(data);
                client.off('signal:quality', handler);
              }
            };
            client.on('signal:quality', handler);
          });
        });

        // Emit all
        testData.forEach(td => {
          wsServer.emitSignalQuality(userId, td.tradeId, {
            quality: {
              tier: td.expectedTier,
              confidence: td.expectedConfidence,
              symbol: '○',
              description: 'Test'
            },
            smartMoney: { score: 60, indicators: {} },
            rareInformation: { score: 50, level: 'LOW', factors: [] }
          });
        });

        // Verify all received with correct data
        const results = await Promise.all(receivePromises);

        results.forEach((received, index) => {
          const expected = testData[index];
          expect(received.tradeId).toBe(expected.tradeId);
          expect(received.quality.tier).toBe(expected.expectedTier);
          expect(received.quality.confidence).toBe(expected.expectedConfidence);
        });

        console.log('✅ Data integrity maintained under load');
      } finally {
        client.disconnect();
      }
    }, 20000);
  });

  describe('Error Handling', () => {
    test('should handle invalid quality data gracefully', () => {
      console.log('\n📊 Testing error handling...');

      // Should not crash when given invalid data
      expect(() => {
        wsServer.emitSignalQuality(null, 'trade-001', {});
      }).not.toThrow();

      expect(() => {
        wsServer.emitSignalQuality('user-001', null, {});
      }).not.toThrow();

      expect(() => {
        wsServer.emitSignalQuality('user-001', 'trade-001', null);
      }).not.toThrow();

      console.log('✅ Error handling verified');
    });

    test('should continue working after client disconnect', async () => {
      console.log('\n📊 Testing resilience after disconnect...');

      const userId = 'resilience-user-001';
      const client1 = createClient(userId, 'resilience-session-001');

      await waitForConnection(client1);
      client1.disconnect();

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 500));

      // Emit should not crash even if user disconnected
      expect(() => {
        wsServer.emitSignalQuality(userId, 'trade-001', {
          quality: { tier: 'STANDARD', confidence: 70, symbol: '○', description: 'Test' },
          smartMoney: { score: 60, indicators: {} },
          rareInformation: { score: 50, level: 'LOW', factors: [] }
        });
      }).not.toThrow();

      // New client should still work
      const client2 = createClient(userId, 'resilience-session-002');
      await waitForConnection(client2);

      const received = new Promise(resolve => {
        client2.once('signal:quality', resolve);
      });

      wsServer.emitSignalQuality(userId, 'trade-002', {
        quality: { tier: 'ELITE', confidence: 90, symbol: '⭐', description: 'Test' },
        smartMoney: { score: 80, indicators: {} },
        rareInformation: { score: 70, level: 'HIGH', factors: [] }
      });

      const data = await received;
      expect(data.tradeId).toBe('trade-002');

      client2.disconnect();

      console.log('✅ Resilience verified');
    }, 10000);
  });
});
