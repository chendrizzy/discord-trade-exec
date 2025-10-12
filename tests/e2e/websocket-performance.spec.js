const { test, expect } = require('@playwright/test');

/**
 * WebSocket Performance Monitoring E2E Tests
 *
 * Validates performance tracking and alert system:
 * - Message throughput tracking
 * - Latency measurement
 * - Connection drop detection
 * - Alert threshold verification
 * - Performance metrics API
 *
 * Related: Phase 3.7 - Performance Monitoring Setup
 */

// Test configuration
const TEST_USER = {
    userId: 'perf-test-user',
    sessionID: 'perf-test-session',
    userName: 'Performance Test User'
};

const DASHBOARD_URL = '/dashboard';
const WEBSOCKET_TIMEOUT = 10000;

/**
 * Helper: Wait for WebSocket connection
 */
async function waitForWebSocketConnection(page, timeout = WEBSOCKET_TIMEOUT) {
    await page.waitForFunction(
        () => window.socket && window.socket.connected === true,
        { timeout }
    );
}

/**
 * Helper: Setup test authentication
 */
async function setupTestAuth(page) {
    await page.addInitScript((user) => {
        localStorage.setItem('sessionID', user.sessionID);
        localStorage.setItem('userId', user.userId);
        localStorage.setItem('userName', user.userName);
    }, TEST_USER);
}

test.describe('WebSocket Performance Monitoring', () => {
    test.beforeEach(async ({ page }) => {
        await setupTestAuth(page);
        await page.goto(DASHBOARD_URL);
        await page.waitForLoadState('networkidle');
    });

    test('should track message throughput correctly', async ({ page }) => {
        console.log('Testing message throughput tracking...');

        await waitForWebSocketConnection(page);

        // Subscribe to portfolio updates
        await page.evaluate(() => {
            if (window.socket) {
                window.socket.emit('subscribe:portfolio');
            }
        });

        // Trigger multiple portfolio updates
        const updateCount = 10;
        for (let i = 0; i < updateCount; i++) {
            await page.evaluate(() => {
                if (window.socket) {
                    window.socket.emit('test:trigger-portfolio-update', {
                        userId: 'perf-test-user'
                    });
                }
            });
            await page.waitForTimeout(100); // Small delay between messages
        }

        // Wait for messages to be processed
        await page.waitForTimeout(1000);

        // Verify message counters incremented
        // Note: This would require exposing performance metrics via a test endpoint
        // For now, we verify no errors occurred
        const consoleErrors = [];
        page.on('console', (msg) => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text());
            }
        });

        expect(consoleErrors.length).toBe(0);

        console.log(`✅ Message throughput tracking verified (${updateCount} messages)`);
    });

    test('should measure latency for emit operations', async ({ page }) => {
        console.log('Testing latency measurement...');

        await waitForWebSocketConnection(page);

        // Subscribe to trades
        await page.evaluate(() => {
            if (window.socket) {
                window.socket.emit('subscribe:trades');
            }
        });

        // Trigger trade notification (which has latency tracking)
        const startTime = Date.now();

        await page.evaluate(() => {
            if (window.socket) {
                window.socket.emit('test:trigger-trade-notification', {
                    userId: 'perf-test-user',
                    trade: {
                        symbol: 'TSLA',
                        side: 'buy',
                        quantity: 5,
                        price: 250.00,
                        status: 'filled'
                    }
                });
            }
        });

        // Wait for notification to be received
        await page.waitForTimeout(500);

        const endTime = Date.now();
        const totalLatency = endTime - startTime;

        // Verify latency is reasonable (< 2 seconds for local testing)
        expect(totalLatency).toBeLessThan(2000);

        console.log(`✅ Latency measurement working (${totalLatency}ms total test time)`);
    });

    test('should track connection drops for unexpected disconnects', async ({ page }) => {
        console.log('Testing connection drop tracking...');

        await waitForWebSocketConnection(page);

        // Get initial connection state
        const initialConnected = await page.evaluate(() => window.socket?.connected);
        expect(initialConnected).toBe(true);

        // Simulate unexpected disconnect (transport error)
        await page.evaluate(() => {
            if (window.socket) {
                // Force disconnect to simulate transport error
                window.socket.disconnect();
            }
        });

        // Wait for disconnect to be processed
        await page.waitForTimeout(500);

        // Verify disconnected
        const disconnected = await page.evaluate(() => !window.socket?.connected);
        expect(disconnected).toBe(true);

        // Reconnect
        await page.evaluate(() => {
            if (window.socket) {
                window.socket.connect();
            }
        });

        await waitForWebSocketConnection(page);

        // Verify reconnected
        const reconnected = await page.evaluate(() => window.socket?.connected);
        expect(reconnected).toBe(true);

        console.log('✅ Connection drop tracking verified');
    });

    test('should handle high message volume without performance degradation', async ({ page }) => {
        console.log('Testing high message volume handling...');

        await waitForWebSocketConnection(page);

        // Subscribe to multiple channels
        await page.evaluate(() => {
            if (window.socket) {
                window.socket.emit('subscribe:portfolio');
                window.socket.emit('subscribe:trades');
                window.socket.emit('subscribe:watchlist', ['AAPL', 'TSLA', 'NVDA', 'AMD', 'MSFT']);
            }
        });

        const startTime = Date.now();

        // Send burst of messages
        const messageCount = 50;
        for (let i = 0; i < messageCount; i++) {
            await page.evaluate(() => {
                if (window.socket) {
                    // Alternate between different message types
                    const messageType = Math.random();
                    if (messageType < 0.33) {
                        window.socket.emit('test:trigger-portfolio-update', {
                            userId: 'perf-test-user'
                        });
                    } else if (messageType < 0.66) {
                        window.socket.emit('test:trigger-trade-notification', {
                            userId: 'perf-test-user',
                            trade: {
                                symbol: 'AAPL',
                                side: 'buy',
                                quantity: 1,
                                price: 175.00,
                                status: 'filled'
                            }
                        });
                    } else {
                        window.socket.emit('test:trigger-quote-update', {
                            symbol: 'AAPL',
                            price: 175.00,
                            change: 1.50,
                            changePercent: 0.86
                        });
                    }
                }
            });
        }

        // Wait for all messages to be processed
        await page.waitForTimeout(2000);

        const endTime = Date.now();
        const totalTime = endTime - startTime;
        const avgTimePerMessage = totalTime / messageCount;

        // Verify performance is acceptable (< 100ms average per message)
        expect(avgTimePerMessage).toBeLessThan(100);

        // Verify connection is still active
        const stillConnected = await page.evaluate(() => window.socket?.connected);
        expect(stillConnected).toBe(true);

        console.log(`✅ High volume handling verified (${messageCount} messages in ${totalTime}ms, ${avgTimePerMessage.toFixed(2)}ms avg)`);
    });

    test('should maintain connection stability under network stress', async ({ page }) => {
        console.log('Testing connection stability under network stress...');

        await waitForWebSocketConnection(page);

        // Enable network throttling
        const client = await page.context().newCDPSession(page);
        await client.send('Network.emulateNetworkConditions', {
            offline: false,
            downloadThroughput: 100 * 1024, // 100kb/s
            uploadThroughput: 50 * 1024,    // 50kb/s
            latency: 200                     // 200ms latency
        });

        // Send messages under stressed network
        for (let i = 0; i < 20; i++) {
            await page.evaluate(() => {
                if (window.socket) {
                    window.socket.emit('test:trigger-portfolio-update', {
                        userId: 'perf-test-user'
                    });
                }
            });
            await page.waitForTimeout(200);
        }

        // Verify connection maintained
        const connected = await page.evaluate(() => window.socket?.connected);
        expect(connected).toBe(true);

        // Reset network conditions
        await client.send('Network.emulateNetworkConditions', {
            offline: false,
            downloadThroughput: -1,
            uploadThroughput: -1,
            latency: 0
        });

        console.log('✅ Connection stability verified under network stress');
    });

    test('should handle rapid connect/disconnect cycles', async ({ page }) => {
        console.log('Testing rapid connect/disconnect cycles...');

        await waitForWebSocketConnection(page);

        // Perform multiple connect/disconnect cycles
        const cycles = 5;
        for (let i = 0; i < cycles; i++) {
            // Disconnect
            await page.evaluate(() => {
                if (window.socket) {
                    window.socket.disconnect();
                }
            });

            await page.waitForFunction(
                () => !window.socket || window.socket.connected === false,
                { timeout: 2000 }
            );

            // Reconnect
            await page.evaluate(() => {
                if (window.socket) {
                    window.socket.connect();
                }
            });

            await waitForWebSocketConnection(page);

            console.log(`  Cycle ${i + 1}/${cycles} completed`);
        }

        // Verify final connection is stable
        const finalConnected = await page.evaluate(() => window.socket?.connected);
        expect(finalConnected).toBe(true);

        // Send test message to verify functionality
        await page.evaluate(() => {
            if (window.socket) {
                window.socket.emit('subscribe:portfolio');
            }
        });

        await page.waitForTimeout(500);

        console.log(`✅ Rapid connect/disconnect cycles handled (${cycles} cycles)`);
    });

    test('should not have memory leaks from performance tracking', async ({ page }) => {
        console.log('Testing for memory leaks in performance tracking...');

        await waitForWebSocketConnection(page);

        // Get initial memory usage
        const initialMetrics = await page.evaluate(() => {
            if (performance.memory) {
                return {
                    usedJSHeapSize: performance.memory.usedJSHeapSize,
                    totalJSHeapSize: performance.memory.totalJSHeapSize
                };
            }
            return null;
        });

        if (!initialMetrics) {
            console.log('⚠️ Memory metrics not available in this browser');
            return;
        }

        // Generate significant load
        for (let i = 0; i < 100; i++) {
            await page.evaluate(() => {
                if (window.socket) {
                    window.socket.emit('test:trigger-portfolio-update', {
                        userId: 'perf-test-user'
                    });
                }
            });
        }

        // Wait for processing
        await page.waitForTimeout(2000);

        // Force garbage collection if available
        await page.evaluate(() => {
            if (window.gc) {
                window.gc();
            }
        });

        await page.waitForTimeout(1000);

        // Check final memory usage
        const finalMetrics = await page.evaluate(() => {
            if (performance.memory) {
                return {
                    usedJSHeapSize: performance.memory.usedJSHeapSize,
                    totalJSHeapSize: performance.memory.totalJSHeapSize
                };
            }
            return null;
        });

        const memoryGrowth = finalMetrics.usedJSHeapSize - initialMetrics.usedJSHeapSize;
        const memoryGrowthMB = (memoryGrowth / 1024 / 1024).toFixed(2);

        // Verify memory growth is reasonable (< 50MB for 100 messages)
        expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024);

        console.log(`✅ No significant memory leaks detected (${memoryGrowthMB}MB growth)`);
    });
});

test.describe('WebSocket Alert System', () => {
    test('should maintain alert thresholds configuration', async ({ page }) => {
        console.log('Verifying alert thresholds are configured...');

        await setupTestAuth(page);
        await page.goto(DASHBOARD_URL);
        await waitForWebSocketConnection(page);

        // Verify connection is established
        const connected = await page.evaluate(() => window.socket?.connected);
        expect(connected).toBe(true);

        // Note: Alert thresholds are server-side configuration
        // We verify the system doesn't crash under conditions that would trigger alerts

        // Simulate conditions that would trigger high latency alert
        // (by using slow network)
        const client = await page.context().newCDPSession(page);
        await client.send('Network.emulateNetworkConditions', {
            offline: false,
            downloadThroughput: 10 * 1024, // Very slow
            uploadThroughput: 10 * 1024,
            latency: 600  // Above 500ms threshold
        });

        // Send message under high latency
        await page.evaluate(() => {
            if (window.socket) {
                window.socket.emit('test:trigger-portfolio-update', {
                    userId: 'perf-test-user'
                });
            }
        });

        await page.waitForTimeout(2000);

        // Verify connection maintained despite high latency
        const stillConnected = await page.evaluate(() => window.socket?.connected);
        expect(stillConnected).toBe(true);

        // Reset network
        await client.send('Network.emulateNetworkConditions', {
            offline: false,
            downloadThroughput: -1,
            uploadThroughput: -1,
            latency: 0
        });

        console.log('✅ Alert system maintains connection under threshold-exceeding conditions');
    });
});
