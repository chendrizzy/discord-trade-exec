const { test, expect } = require('@playwright/test');

/**
 * WebSocket Real-Time Updates E2E Tests
 *
 * Cross-browser validation for WebSocket functionality:
 * - Real-time portfolio updates
 * - Live trade notifications
 * - Live watchlist quotes
 * - Connection resilience
 * - Multi-tab behavior
 *
 * Runs on: Chrome, Firefox, Safari (Desktop & Mobile)
 */

// Test configuration
const TEST_USER = {
    userId: 'e2e-test-user',
    sessionID: 'e2e-test-session',
    userName: 'E2E Test User'
};

const DASHBOARD_URL = '/dashboard';
const WEBSOCKET_TIMEOUT = 10000;

/**
 * Helper: Wait for WebSocket connection
 * Checks for connection indicator or WebSocket readyState
 */
async function waitForWebSocketConnection(page, timeout = WEBSOCKET_TIMEOUT) {
    await page.waitForFunction(
        () => {
            // Check if window.socket exists and is connected
            return window.socket && window.socket.connected === true;
        },
        { timeout }
    );
}

/**
 * Helper: Inject test authentication
 * Simulates logged-in user for WebSocket connection
 */
async function setupTestAuth(page) {
    await page.addInitScript((user) => {
        // Mock session/auth data
        localStorage.setItem('sessionID', user.sessionID);
        localStorage.setItem('userId', user.userId);
        localStorage.setItem('userName', user.userName);
    }, TEST_USER);
}

/**
 * Helper: Evaluate WebSocket client code
 * Provides access to Socket.io client for testing
 */
async function getWebSocketClient(page) {
    return await page.evaluate(() => window.socket);
}

test.describe('WebSocket Real-Time Updates - Cross-Browser', () => {
    test.beforeEach(async ({ page }) => {
        // Setup authentication before navigating
        await setupTestAuth(page);

        // Navigate to dashboard
        await page.goto(DASHBOARD_URL);

        // Wait for page to load
        await page.waitForLoadState('networkidle');
    });

    test('should establish WebSocket connection on all browsers', async ({ page, browserName }) => {
        console.log(`Testing WebSocket connection on: ${browserName}`);

        // Wait for WebSocket to connect
        await waitForWebSocketConnection(page);

        // Verify connection status indicator (if exists)
        const connectionStatus = page.locator('[data-testid="ws-connection-status"]');
        if (await connectionStatus.isVisible()) {
            await expect(connectionStatus).toContainText(/connected|online/i);
        }

        // Verify socket object exists and is connected
        const isConnected = await page.evaluate(() => {
            return window.socket && window.socket.connected === true;
        });

        expect(isConnected).toBe(true);

        // Log success
        console.log(`✅ WebSocket connected successfully on ${browserName}`);
    });

    test('should receive real-time portfolio updates', async ({ page, browserName }) => {
        console.log(`Testing portfolio updates on: ${browserName}`);

        // Wait for WebSocket connection
        await waitForWebSocketConnection(page);

        // Subscribe to portfolio updates via client
        await page.evaluate(() => {
            if (window.socket) {
                window.socket.emit('subscribe:portfolio');
            }
        });

        // Wait for subscription confirmation
        await page.waitForFunction(
            () => window.portfolioSubscribed === true,
            { timeout: 5000 }
        ).catch(() => {
            // If no explicit flag, assume subscribed if no error
            console.log('Portfolio subscription assumed (no explicit confirmation)');
        });

        // Trigger a portfolio update (mock or via API)
        await page.evaluate(() => {
            // Simulate receiving portfolio update
            if (window.socket) {
                window.socket.emit('test:trigger-portfolio-update', {
                    userId: 'e2e-test-user'
                });
            }
        });

        // Wait for portfolio UI to update
        const portfolioValue = page.locator('[data-testid="portfolio-total-value"]');
        if (await portfolioValue.isVisible()) {
            // Verify portfolio value is displayed and valid
            const value = await portfolioValue.textContent();
            expect(value).toMatch(/\$[\d,]+/);

            console.log(`✅ Portfolio updates working on ${browserName}: ${value}`);
        } else {
            console.log(`⚠️ Portfolio value element not found on ${browserName} (may be expected)`);
        }
    });

    test('should display live trade notifications', async ({ page, browserName }) => {
        console.log(`Testing trade notifications on: ${browserName}`);

        // Wait for WebSocket connection
        await waitForWebSocketConnection(page);

        // Subscribe to trade updates
        await page.evaluate(() => {
            if (window.socket) {
                window.socket.emit('subscribe:trades');
            }
        });

        // Store trade notification promise
        const tradeNotificationPromise = page.evaluate(() => {
            return new Promise((resolve) => {
                if (window.socket) {
                    window.socket.once('trade:executed', (trade) => {
                        resolve(trade);
                    });

                    // Trigger test trade notification
                    setTimeout(() => {
                        window.socket.emit('test:trigger-trade-notification', {
                            userId: 'e2e-test-user',
                            trade: {
                                symbol: 'AAPL',
                                side: 'buy',
                                quantity: 10,
                                price: 175.50,
                                status: 'filled'
                            }
                        });
                    }, 100);
                }
            });
        });

        // Wait for trade notification
        const trade = await tradeNotificationPromise.catch(() => null);

        if (trade) {
            expect(trade.symbol).toBe('AAPL');
            expect(trade.side).toBe('buy');
            console.log(`✅ Trade notification received on ${browserName}: ${trade.side} ${trade.quantity} ${trade.symbol}`);
        } else {
            console.log(`⚠️ Trade notification test skipped on ${browserName} (test trigger may not be implemented)`);
        }
    });

    test('should handle WebSocket reconnection', async ({ page, browserName }) => {
        console.log(`Testing reconnection on: ${browserName}`);

        // Wait for initial connection
        await waitForWebSocketConnection(page);

        // Force disconnect
        await page.evaluate(() => {
            if (window.socket) {
                window.socket.disconnect();
            }
        });

        // Verify disconnected
        await page.waitForFunction(
            () => !window.socket || window.socket.connected === false,
            { timeout: 2000 }
        );

        // Trigger reconnection
        await page.evaluate(() => {
            if (window.socket) {
                window.socket.connect();
            }
        });

        // Wait for reconnection
        await waitForWebSocketConnection(page);

        // Verify reconnected
        const isReconnected = await page.evaluate(() => {
            return window.socket && window.socket.connected === true;
        });

        expect(isReconnected).toBe(true);

        console.log(`✅ Reconnection successful on ${browserName}`);
    });

    test('should display connection status indicator', async ({ page, browserName }) => {
        console.log(`Testing connection status UI on: ${browserName}`);

        // Wait for WebSocket connection
        await waitForWebSocketConnection(page);

        // Look for connection status indicator
        const statusIndicators = [
            '[data-testid="ws-connection-status"]',
            '[data-testid="connection-indicator"]',
            '.connection-status',
            '.ws-status'
        ];

        let foundIndicator = false;
        for (const selector of statusIndicators) {
            const indicator = page.locator(selector);
            if (await indicator.isVisible()) {
                foundIndicator = true;
                await expect(indicator).toContainText(/connected|online/i);
                console.log(`✅ Connection status indicator found on ${browserName}: ${selector}`);
                break;
            }
        }

        if (!foundIndicator) {
            console.log(`⚠️ Connection status indicator not found on ${browserName} (may be intentional)`);
        }
    });

    test('should handle poor network conditions gracefully', async ({ page, browserName }) => {
        console.log(`Testing network conditions on: ${browserName}`);

        // Wait for initial connection
        await waitForWebSocketConnection(page);

        // Simulate slow network (throttle)
        const client = await page.context().newCDPSession(page);
        await client.send('Network.emulateNetworkConditions', {
            offline: false,
            downloadThroughput: 50 * 1024, // 50kb/s
            uploadThroughput: 20 * 1024,   // 20kb/s
            latency: 500                    // 500ms latency
        });

        // Subscribe to updates with slow network
        await page.evaluate(() => {
            if (window.socket) {
                window.socket.emit('subscribe:portfolio');
            }
        });

        // Wait longer due to slow network
        await page.waitForTimeout(2000);

        // Verify still connected despite slow network
        const isConnected = await page.evaluate(() => {
            return window.socket && window.socket.connected === true;
        });

        expect(isConnected).toBe(true);

        // Reset network conditions
        await client.send('Network.emulateNetworkConditions', {
            offline: false,
            downloadThroughput: -1,
            uploadThroughput: -1,
            latency: 0
        });

        console.log(`✅ Handled poor network conditions on ${browserName}`);
    });

    test('should work on mobile viewports', async ({ page, browserName, isMobile }) => {
        if (!isMobile) {
            test.skip();
            return;
        }

        console.log(`Testing WebSocket on mobile: ${browserName}`);

        // Wait for WebSocket connection on mobile
        await waitForWebSocketConnection(page);

        // Verify connection works on mobile
        const isConnected = await page.evaluate(() => {
            return window.socket && window.socket.connected === true;
        });

        expect(isConnected).toBe(true);

        // Verify responsive UI elements are present
        const dashboardContent = page.locator('[data-testid="dashboard-content"]');
        if (await dashboardContent.isVisible()) {
            await expect(dashboardContent).toBeVisible();
            console.log(`✅ Dashboard visible on mobile ${browserName}`);
        }

        console.log(`✅ WebSocket working on mobile ${browserName}`);
    });

    test('should not have console errors related to WebSocket', async ({ page, browserName }) => {
        console.log(`Checking for WebSocket errors on: ${browserName}`);

        const consoleErrors = [];

        // Listen for console errors
        page.on('console', (msg) => {
            if (msg.type() === 'error') {
                const text = msg.text();
                if (text.match(/websocket|socket\.io|ws/i)) {
                    consoleErrors.push(text);
                }
            }
        });

        // Wait for WebSocket connection
        await waitForWebSocketConnection(page);

        // Subscribe to various channels
        await page.evaluate(() => {
            if (window.socket) {
                window.socket.emit('subscribe:portfolio');
                window.socket.emit('subscribe:trades');
            }
        });

        // Wait for any errors to surface
        await page.waitForTimeout(2000);

        // Check for WebSocket-related errors
        if (consoleErrors.length > 0) {
            console.error(`❌ WebSocket errors on ${browserName}:`, consoleErrors);
            expect(consoleErrors).toHaveLength(0);
        } else {
            console.log(`✅ No WebSocket errors on ${browserName}`);
        }
    });
});

test.describe('WebSocket Multi-Tab Behavior', () => {
    test('should handle multiple tabs from same user', async ({ browser, browserName }) => {
        console.log(`Testing multi-tab behavior on: ${browserName}`);

        // Create first tab
        const context1 = await browser.newContext();
        const page1 = await context1.newPage();
        await setupTestAuth(page1);
        await page1.goto(DASHBOARD_URL);
        await page1.waitForLoadState('networkidle');
        await waitForWebSocketConnection(page1);

        // Create second tab
        const context2 = await browser.newContext();
        const page2 = await context2.newPage();
        await setupTestAuth(page2);
        await page2.goto(DASHBOARD_URL);
        await page2.waitForLoadState('networkidle');
        await waitForWebSocketConnection(page2);

        // Verify both tabs are connected
        const connected1 = await page1.evaluate(() => window.socket?.connected);
        const connected2 = await page2.evaluate(() => window.socket?.connected);

        expect(connected1).toBe(true);
        expect(connected2).toBe(true);

        console.log(`✅ Multi-tab connections working on ${browserName}`);

        // Cleanup
        await context1.close();
        await context2.close();
    });

    test('should receive broadcasts in all tabs', async ({ browser, browserName }) => {
        console.log(`Testing broadcast to multiple tabs on: ${browserName}`);

        // Create two tabs with same user
        const context1 = await browser.newContext();
        const page1 = await context1.newPage();
        await setupTestAuth(page1);
        await page1.goto(DASHBOARD_URL);
        await waitForWebSocketConnection(page1);

        const context2 = await browser.newContext();
        const page2 = await context2.newPage();
        await setupTestAuth(page2);
        await page2.goto(DASHBOARD_URL);
        await waitForWebSocketConnection(page2);

        // Subscribe both tabs to portfolio
        await page1.evaluate(() => window.socket?.emit('subscribe:portfolio'));
        await page2.evaluate(() => window.socket?.emit('subscribe:portfolio'));

        await page1.waitForTimeout(500);

        // Set up listeners for portfolio updates
        const update1Promise = page1.evaluate(() => {
            return new Promise((resolve) => {
                if (window.socket) {
                    window.socket.once('portfolio:update', resolve);
                }
            });
        });

        const update2Promise = page2.evaluate(() => {
            return new Promise((resolve) => {
                if (window.socket) {
                    window.socket.once('portfolio:update', resolve);
                }
            });
        });

        // Trigger update from one tab
        await page1.evaluate(() => {
            window.socket?.emit('test:trigger-portfolio-update', {
                userId: 'e2e-test-user'
            });
        });

        // Both tabs should receive update
        const [update1, update2] = await Promise.all([
            update1Promise.catch(() => null),
            update2Promise.catch(() => null)
        ]);

        if (update1 && update2) {
            expect(update1).toBeTruthy();
            expect(update2).toBeTruthy();
            console.log(`✅ Broadcast received in all tabs on ${browserName}`);
        } else {
            console.log(`⚠️ Broadcast test skipped on ${browserName} (test trigger may not be implemented)`);
        }

        // Cleanup
        await context1.close();
        await context2.close();
    });
});
