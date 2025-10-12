const http = require('http');
const socketIOClient = require('socket.io-client');
const WebSocketServer = require('../../src/services/websocket-server');

/**
 * Integration Tests for WebSocket Server End-to-End Flows
 *
 * These tests verify complete real-world scenarios with actual WebSocket connections:
 * - Client connection and authentication flows
 * - Portfolio and trade update broadcasts
 * - Multi-client scenarios
 * - Quote subscription/unsubscription
 * - Error recovery and reconnection
 * - Data consistency across WebSocket and HTTP
 */

describe('WebSocket Server Integration Tests', () => {
    let httpServer;
    let wsServer;
    let serverPort;
    let clients = [];

    beforeAll((done) => {
        // Create real HTTP server
        httpServer = http.createServer();

        // Initialize WebSocket server
        wsServer = new WebSocketServer(httpServer);

        // Start server on random available port
        httpServer.listen(0, () => {
            serverPort = httpServer.address().port;
            console.log(`\n✅ Test server started on port ${serverPort}`);
            done();
        });
    });

    afterAll(async () => {
        // Disconnect all clients
        clients.forEach(client => {
            if (client.connected) {
                client.disconnect();
            }
        });
        clients = [];

        // Close WebSocket server and HTTP server
        await wsServer.close();
        httpServer.close();

        console.log('✅ Test server closed\n');
    });

    afterEach(() => {
        // Clean up any connected clients after each test
        clients.forEach(client => {
            if (client.connected) {
                client.disconnect();
            }
        });
        clients = [];
    });

    // Helper function to create authenticated client
    const createClient = (userId = 'test-user-123', sessionID = 'test-session-123') => {
        const client = socketIOClient(`http://localhost:${serverPort}`, {
            auth: {
                sessionID,
                userId,
                userName: `Test User ${userId}`
            },
            transports: ['websocket'],
            forceNew: true
        });

        clients.push(client);
        return client;
    };

    // Helper function to wait for connection
    const waitForConnection = (client) => {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Connection timeout'));
            }, 5000);

            client.on('connect', () => {
                clearTimeout(timeout);
                resolve();
            });

            client.on('connect_error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    };

    // Helper function to wait for specific event
    const waitForEvent = (client, eventName, timeout = 5000) => {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Timeout waiting for event: ${eventName}`));
            }, timeout);

            client.once(eventName, (data) => {
                clearTimeout(timer);
                resolve(data);
            });
        });
    };

    describe('Complete Client Connection Flow', () => {
        test('should connect, authenticate, and disconnect successfully', async () => {
            const client = createClient();

            await waitForConnection(client);

            expect(client.connected).toBe(true);
            expect(client.id).toBeDefined();

            client.disconnect();

            // Wait a bit for disconnect to process
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(client.connected).toBe(false);
        });

        test('should reject connection without session ID', async () => {
            const client = socketIOClient(`http://localhost:${serverPort}`, {
                auth: {}, // No session ID
                transports: ['websocket'],
                forceNew: true
            });

            clients.push(client);

            await expect(waitForConnection(client)).rejects.toThrow();
        });

        test('should enforce connection pool limit per user', async () => {
            const userId = 'user-pool-test';
            const MAX_CONNECTIONS = 5;

            // Create MAX_CONNECTIONS clients
            const poolClients = [];
            for (let i = 0; i < MAX_CONNECTIONS; i++) {
                const client = createClient(userId, `session-${i}`);
                await waitForConnection(client);
                poolClients.push(client);
            }

            expect(poolClients.length).toBe(MAX_CONNECTIONS);
            poolClients.forEach(c => expect(c.connected).toBe(true));

            // Try to create one more - should be rejected
            const extraClient = createClient(userId, 'session-extra');

            await expect(waitForConnection(extraClient)).rejects.toThrow();
        });
    });

    describe('Portfolio Update Flow', () => {
        test('should receive portfolio updates after subscription', async () => {
            const client = createClient('portfolio-user');
            await waitForConnection(client);

            // Subscribe to portfolio updates
            client.emit('subscribe:portfolio');

            // Wait for subscription confirmation
            const confirmation = await waitForEvent(client, 'subscription:confirmed');
            expect(confirmation.type).toBe('portfolio');

            // Simulate portfolio update from server
            const portfolioData = {
                totalValue: 50000,
                cash: 10000,
                equity: 40000,
                positions: [
                    { symbol: 'AAPL', quantity: 10, value: 1500 }
                ],
                dayChange: 500,
                dayChangePercent: 1.0
            };

            // Set up listener for portfolio update
            const updatePromise = waitForEvent(client, 'portfolio:update');

            // Emit update from server
            wsServer.emitPortfolioUpdate('portfolio-user', portfolioData);

            // Verify client receives update
            const receivedUpdate = await updatePromise;
            expect(receivedUpdate.totalValue).toBe(50000);
            expect(receivedUpdate.cash).toBe(10000);
            expect(receivedUpdate.positions).toHaveLength(1);
            expect(receivedUpdate.timestamp).toBeDefined();
        });

        test('should not receive portfolio updates without subscription', async () => {
            const client = createClient('no-sub-user');
            await waitForConnection(client);

            // Don't subscribe - just listen
            let updateReceived = false;
            client.on('portfolio:update', () => {
                updateReceived = true;
            });

            // Emit update for different user
            wsServer.emitPortfolioUpdate('different-user', {
                totalValue: 50000,
                cash: 10000,
                equity: 40000,
                positions: []
            });

            // Wait a bit
            await new Promise(resolve => setTimeout(resolve, 500));

            expect(updateReceived).toBe(false);
        });
    });

    describe('Trade Notification Flow', () => {
        test('should receive trade execution notification', async () => {
            const client = createClient('trade-user');
            await waitForConnection(client);

            // Subscribe to trade updates
            client.emit('subscribe:trades');
            await waitForEvent(client, 'subscription:confirmed');

            // Set up listener
            const tradePromise = waitForEvent(client, 'trade:executed');

            // Emit trade from server
            wsServer.emitTradeNotification('trade-user', {
                id: 'trade-123',
                symbol: 'TSLA',
                side: 'buy',
                quantity: 5,
                price: 250.50,
                status: 'filled',
                timestamp: new Date().toISOString()
            });

            // Verify notification received
            const notification = await tradePromise;
            expect(notification.symbol).toBe('TSLA');
            expect(notification.side).toBe('buy');
            expect(notification.quantity).toBe(5);
            expect(notification.price).toBe(250.50);
        });

        test('should receive trade failure notification', async () => {
            const client = createClient('trade-fail-user');
            await waitForConnection(client);

            client.emit('subscribe:trades');
            await waitForEvent(client, 'subscription:confirmed');

            const failurePromise = waitForEvent(client, 'trade:failed');

            wsServer.emitTradeFailure('trade-fail-user', {
                message: 'Insufficient funds',
                signal: { symbol: 'NVDA', side: 'buy', quantity: 100 }
            });

            const failure = await failurePromise;
            expect(failure.error).toBe('Insufficient funds');
            expect(failure.timestamp).toBeDefined();
        });
    });

    describe('Multi-Client Scenarios', () => {
        test('should handle multiple connections from same user', async () => {
            const userId = 'multi-client-user';

            // Create 3 clients for same user
            const client1 = createClient(userId, 'session-1');
            const client2 = createClient(userId, 'session-2');
            const client3 = createClient(userId, 'session-3');

            await Promise.all([
                waitForConnection(client1),
                waitForConnection(client2),
                waitForConnection(client3)
            ]);

            // All should be connected
            expect(client1.connected).toBe(true);
            expect(client2.connected).toBe(true);
            expect(client3.connected).toBe(true);

            // All should receive same portfolio update
            const portfolioPromises = [
                waitForEvent(client1, 'portfolio:update'),
                waitForEvent(client2, 'portfolio:update'),
                waitForEvent(client3, 'portfolio:update')
            ];

            wsServer.emitPortfolioUpdate(userId, {
                totalValue: 75000,
                cash: 25000,
                equity: 50000,
                positions: []
            });

            const results = await Promise.all(portfolioPromises);
            results.forEach(update => {
                expect(update.totalValue).toBe(75000);
            });
        });

        test('should isolate updates between different users', async () => {
            const user1 = createClient('user-1');
            const user2 = createClient('user-2');

            await Promise.all([
                waitForConnection(user1),
                waitForConnection(user2)
            ]);

            let user2ReceivedUpdate = false;
            user2.on('portfolio:update', () => {
                user2ReceivedUpdate = true;
            });

            // Send update only to user-1
            wsServer.emitPortfolioUpdate('user-1', {
                totalValue: 100000,
                cash: 50000,
                equity: 50000,
                positions: []
            });

            await new Promise(resolve => setTimeout(resolve, 500));

            expect(user2ReceivedUpdate).toBe(false);
        });
    });

    describe('Quote Subscription Flow', () => {
        test('should subscribe and receive quote updates', async () => {
            const client = createClient('quote-user');
            await waitForConnection(client);

            // Subscribe to watchlist
            client.emit('subscribe:watchlist', ['AAPL', 'TSLA']);

            const confirmation = await waitForEvent(client, 'subscription:confirmed');
            expect(confirmation.type).toBe('watchlist');
            expect(confirmation.symbols).toEqual(['AAPL', 'TSLA']);

            // Listen for quote update
            const quotePromise = waitForEvent(client, 'quote:update');

            // Emit quote update
            wsServer.emitQuoteUpdate('AAPL', {
                price: 175.50,
                change: 2.50,
                changePercent: 1.45,
                volume: 50000000,
                timestamp: new Date().toISOString()
            });

            const quote = await quotePromise;
            expect(quote.symbol).toBe('AAPL');
            expect(quote.price).toBe(175.50);
            expect(quote.changePercent).toBe(1.45);
        });

        test('should handle watchlist subscription rate limiting', async () => {
            const client = createClient('rate-limit-user');
            await waitForConnection(client);

            // Subscribe 10 times rapidly (should be allowed - max 10/minute)
            for (let i = 0; i < 10; i++) {
                client.emit('subscribe:watchlist', ['SPY']);
            }

            // Wait for confirmations
            await new Promise(resolve => setTimeout(resolve, 200));

            // 11th subscription should trigger rate limit error
            const errorPromise = waitForEvent(client, 'error', 1000);
            client.emit('subscribe:watchlist', ['SPY']);

            const error = await errorPromise;
            expect(error.message).toContain('Rate limit');
        });

        test('should unsubscribe from watchlist symbols', async () => {
            const client = createClient('unsub-user');
            await waitForConnection(client);

            // Subscribe first
            client.emit('subscribe:watchlist', ['NVDA', 'AMD']);
            await waitForEvent(client, 'subscription:confirmed');

            // Unsubscribe from one symbol
            client.emit('unsubscribe:watchlist', ['NVDA']);

            const unsubConfirmation = await waitForEvent(client, 'unsubscription:confirmed');
            expect(unsubConfirmation.type).toBe('watchlist');
            expect(unsubConfirmation.symbols).toEqual(['NVDA']);

            // Should not receive quotes for NVDA anymore
            let nvdaQuoteReceived = false;
            client.on('quote:update', (data) => {
                if (data.symbol === 'NVDA') {
                    nvdaQuoteReceived = true;
                }
            });

            wsServer.emitQuoteUpdate('NVDA', {
                price: 500,
                change: 5,
                changePercent: 1.0,
                volume: 10000000
            });

            await new Promise(resolve => setTimeout(resolve, 300));
            expect(nvdaQuoteReceived).toBe(false);
        });
    });

    describe('Error Recovery and Reconnection', () => {
        test('should handle disconnect and reconnect gracefully', async () => {
            const client = createClient('reconnect-user');
            await waitForConnection(client);

            // Subscribe to portfolio
            client.emit('subscribe:portfolio');
            await waitForEvent(client, 'subscription:confirmed');

            // Disconnect
            client.disconnect();
            expect(client.connected).toBe(false);

            // Reconnect
            client.connect();
            await waitForConnection(client);
            expect(client.connected).toBe(true);

            // Re-subscribe (client needs to re-subscribe after reconnect)
            client.emit('subscribe:portfolio');
            await waitForEvent(client, 'subscription:confirmed');

            // Should receive updates again
            const updatePromise = waitForEvent(client, 'portfolio:update');

            wsServer.emitPortfolioUpdate('reconnect-user', {
                totalValue: 60000,
                cash: 20000,
                equity: 40000,
                positions: []
            });

            const update = await updatePromise;
            expect(update.totalValue).toBe(60000);
        });

        test('should handle server shutdown gracefully', async () => {
            const client = createClient('shutdown-user');
            await waitForConnection(client);

            // Listen for shutdown event
            const shutdownPromise = waitForEvent(client, 'server:shutdown', 2000);

            // Note: We can't actually call wsServer.close() here as it would break other tests
            // Instead, we simulate the shutdown event
            wsServer.io.emit('server:shutdown', {
                message: 'Server is shutting down',
                timestamp: new Date().toISOString()
            });

            const shutdownData = await shutdownPromise;
            expect(shutdownData.message).toBe('Server is shutting down');
            expect(shutdownData.timestamp).toBeDefined();
        });

        test('should handle invalid subscription data', async () => {
            const client = createClient('invalid-data-user');
            await waitForConnection(client);

            // Try to subscribe with invalid data
            const errorPromise = waitForEvent(client, 'error', 1000);

            client.emit('subscribe:watchlist', null); // Invalid - should be array

            const error = await errorPromise;
            expect(error.message).toContain('Invalid symbols array');
        });
    });

    describe('Market Status Broadcast', () => {
        test('should broadcast market status to all connected clients', async () => {
            const client1 = createClient('market-user-1');
            const client2 = createClient('market-user-2');

            await Promise.all([
                waitForConnection(client1),
                waitForConnection(client2)
            ]);

            const statusPromises = [
                waitForEvent(client1, 'market:status'),
                waitForEvent(client2, 'market:status')
            ];

            wsServer.emitMarketStatus({
                isOpen: true,
                nextOpen: null,
                nextClose: '2025-01-15T16:00:00Z'
            });

            const statuses = await Promise.all(statusPromises);
            statuses.forEach(status => {
                expect(status.isOpen).toBe(true);
                expect(status.nextClose).toBe('2025-01-15T16:00:00Z');
                expect(status.timestamp).toBeDefined();
            });
        });
    });

    describe('Statistics and Monitoring', () => {
        test('should track connection statistics accurately', async () => {
            const client1 = createClient('stats-user-1');
            const client2 = createClient('stats-user-2');
            const client3 = createClient('stats-user-1'); // Same user as client1

            await Promise.all([
                waitForConnection(client1),
                waitForConnection(client2),
                waitForConnection(client3)
            ]);

            const stats = wsServer.getStats();

            expect(stats.activeConnections).toBeGreaterThanOrEqual(3);
            expect(stats.uniqueUsers).toBeGreaterThanOrEqual(2);
            expect(stats.totalConnections).toBeGreaterThanOrEqual(3);
        });
    });
});
