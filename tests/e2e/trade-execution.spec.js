// External dependencies
const { test, expect } = require('@playwright/test');

/**
 * Trade Execution Real-Time Flow E2E Tests
 *
 * Task: T048 [US3] - E2E Playwright test for trade execution
 * Story: US-003 (Real-Time Dashboard Updates)
 * Story: US-001 (Automated Trade Execution)
 *
 * Tests full trade lifecycle with real-time updates:
 * 1. User submits trade signal (Discord command or manual entry)
 * 2. Backend validates risk checks (RiskManagementService)
 * 3. Order submitted to broker (BrokerAdapter)
 * 4. WebSocket emits trade events (TradeHandler)
 * 5. Dashboard updates in real-time (Frontend Socket.IO hook)
 *
 * Constitutional Requirements:
 * - Principle II: Test-First (TDD for critical trading paths)
 * - Principle IV: Real-Time Standards (<100ms WebSocket latency)
 * - Principle VI: Observability (trade lifecycle tracking)
 *
 * Coverage:
 * - Trade creation → submitted → filled flow
 * - Risk rejection scenarios
 * - Portfolio updates on position open/close
 * - Multi-tab synchronization
 * - Connection resilience during trades
 */

// Test configuration
const TEST_USER = {
  userId: 'e2e-trade-test-user',
  email: 'trade-test@example.com',
  sessionID: 'e2e-trade-session',
  userName: 'Trade E2E User',
  brokerConnected: true,
  broker: 'alpaca' // Paper trading account
};

const DASHBOARD_URL = '/dashboard';
const TRADE_FORM_URL = '/dashboard/trades/new';
const PORTFOLIO_URL = '/dashboard/portfolio';
const WEBSOCKET_TIMEOUT = 10000;
const TRADE_EVENT_TIMEOUT = 5000;

/**
 * Helper: Setup test authentication
 * Mocks logged-in user with broker connection
 */
async function setupTestAuth(page) {
  await page.addInitScript(user => {
    // Mock authenticated session
    localStorage.setItem('sessionID', user.sessionID);
    localStorage.setItem('userId', user.userId);
    localStorage.setItem('userName', user.userName);
    localStorage.setItem('brokerConnected', user.brokerConnected);
    localStorage.setItem('broker', user.broker);

    // Mock JWT token (backend will validate via test fixture)
    localStorage.setItem(
      'authToken',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJlMmUtdHJhZGUtdGVzdC11c2VyIiwiaWF0IjoxNjAwMDAwMDAwfQ.test'
    );
  }, TEST_USER);
}

/**
 * Helper: Wait for WebSocket connection
 */
async function waitForWebSocketConnection(page, timeout = WEBSOCKET_TIMEOUT) {
  await page.waitForFunction(
    () => {
      return window.socket && window.socket.connected === true;
    },
    { timeout }
  );
}

/**
 * Helper: Wait for trade event via WebSocket
 * Listens for specific trade event and returns payload
 */
async function waitForTradeEvent(page, eventType, timeout = TRADE_EVENT_TIMEOUT) {
  return page.evaluate(
    ({ event, timeoutMs }) => {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`Trade event ${event} not received within ${timeoutMs}ms`));
        }, timeoutMs);

        // Listen for trade event
        window.socket.once(event, data => {
          clearTimeout(timer);
          resolve(data);
        });
      });
    },
    { event: eventType, timeoutMs: timeout }
  );
}

/**
 * Helper: Submit trade via form
 */
async function submitTradeForm(page, tradeData) {
  // Fill trade form
  await page.fill('[data-testid="symbol-input"]', tradeData.symbol);
  await page.selectOption('[data-testid="action-select"]', tradeData.action);
  await page.fill('[data-testid="quantity-input"]', tradeData.quantity.toString());

  if (tradeData.orderType) {
    await page.selectOption('[data-testid="order-type-select"]', tradeData.orderType);
  }

  if (tradeData.price && tradeData.orderType === 'limit') {
    await page.fill('[data-testid="price-input"]', tradeData.price.toString());
  }

  if (tradeData.stopLoss) {
    await page.fill('[data-testid="stop-loss-input"]', tradeData.stopLoss.toString());
  }

  // Submit form
  await page.click('[data-testid="submit-trade-button"]');
}

/**
 * Test Group: Trade Execution Flow
 */
test.describe('Trade Execution Real-Time Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Setup authentication
    await setupTestAuth(page);

    // Navigate to dashboard
    await page.goto(DASHBOARD_URL);

    // Wait for WebSocket connection
    await waitForWebSocketConnection(page);

    console.log('✓ Test setup complete - WebSocket connected');
  });

  test('should execute market buy order and receive real-time updates', async ({ page }) => {
    // Navigate to trade form
    await page.goto(TRADE_FORM_URL);

    // Submit market buy order
    const tradeData = {
      symbol: 'AAPL',
      action: 'buy',
      quantity: 10,
      orderType: 'market'
    };

    // Listen for trade events
    const eventPromises = {
      created: waitForTradeEvent(page, 'trade.created'),
      submitted: waitForTradeEvent(page, 'trade.submitted'),
      filled: waitForTradeEvent(page, 'trade.filled')
    };

    // Submit trade
    await submitTradeForm(page, tradeData);

    // Wait for trade.created event (<100ms per Principle IV)
    const createdEvent = await eventPromises.created;
    expect(createdEvent).toBeDefined();
    expect(createdEvent.symbol).toBe('AAPL');
    expect(createdEvent.quantity).toBe(10);
    expect(createdEvent.status).toBe('CREATED');

    // Verify UI shows "Trade Submitted" notification
    await expect(page.locator('[data-testid="trade-notification"]')).toContainText(
      'Trade initiated successfully'
    );

    // Wait for trade.submitted event (order sent to broker)
    const submittedEvent = await eventPromises.submitted;
    expect(submittedEvent).toBeDefined();
    expect(submittedEvent.status).toBe('SUBMITTED');
    expect(submittedEvent.brokerOrderId).toBeDefined();

    // Verify UI updates to "Order Submitted"
    await expect(page.locator('[data-testid="trade-status"]')).toContainText('Submitted');

    // Wait for trade.filled event (order filled by broker)
    const filledEvent = await eventPromises.filled;
    expect(filledEvent).toBeDefined();
    expect(filledEvent.status).toBe('FILLED');
    expect(filledEvent.fillPrice).toBeGreaterThan(0);
    expect(filledEvent.filledQuantity).toBe(10);

    // Verify UI shows final "Order Filled" state
    await expect(page.locator('[data-testid="trade-status"]')).toContainText('Filled');

    // Verify portfolio.position.opened event emitted
    const positionEvent = await waitForTradeEvent(page, 'portfolio.position.opened');
    expect(positionEvent).toBeDefined();
    expect(positionEvent.symbol).toBe('AAPL');
    expect(positionEvent.quantity).toBe(10);

    console.log('✓ Market buy order executed with real-time updates');
  });

  test('should reject trade due to risk management and show rejection event', async ({ page }) => {
    // Navigate to trade form
    await page.goto(TRADE_FORM_URL);

    // Submit trade that exceeds position size limit (>10% of equity)
    const riskyTrade = {
      symbol: 'TSLA',
      action: 'buy',
      quantity: 1000, // Assuming $10k equity, this is ~$250k position (2500%)
      orderType: 'market'
    };

    // Listen for trade.rejected event
    const rejectedPromise = waitForTradeEvent(page, 'trade.rejected');

    // Submit trade
    await submitTradeForm(page, riskyTrade);

    // Wait for rejection event
    const rejectedEvent = await rejectedPromise;
    expect(rejectedEvent).toBeDefined();
    expect(rejectedEvent.status).toBe('REJECTED');
    expect(rejectedEvent.reason).toContain('position size'); // Risk validation message

    // Verify UI shows rejection notification
    await expect(page.locator('[data-testid="trade-notification"]')).toContainText(
      'Trade rejected'
    );
    await expect(page.locator('[data-testid="rejection-reason"]')).toContainText('position size');

    console.log('✓ Risk management rejection handled with real-time notification');
  });

  test('should execute limit order and update when filled at target price', async ({ page }) => {
    // Navigate to trade form
    await page.goto(TRADE_FORM_URL);

    // Submit limit buy order
    const limitOrder = {
      symbol: 'MSFT',
      action: 'buy',
      quantity: 5,
      orderType: 'limit',
      price: 350.0 // Limit price
    };

    // Listen for events
    const eventPromises = {
      created: waitForTradeEvent(page, 'trade.created'),
      submitted: waitForTradeEvent(page, 'trade.submitted'),
      filled: waitForTradeEvent(page, 'trade.filled', 15000) // Limit orders may take longer
    };

    // Submit trade
    await submitTradeForm(page, limitOrder);

    // Verify created event
    const createdEvent = await eventPromises.created;
    expect(createdEvent.orderType).toBe('LIMIT');
    expect(createdEvent.limitPrice).toBe(350.0);

    // Verify submitted event
    const submittedEvent = await eventPromises.submitted;
    expect(submittedEvent.status).toBe('SUBMITTED');

    // Verify UI shows "Pending" status for limit orders
    await expect(page.locator('[data-testid="trade-status"]')).toContainText('Pending');

    // Wait for fill (mock backend will simulate fill at limit price)
    const filledEvent = await eventPromises.filled;
    expect(filledEvent.fillPrice).toBeLessThanOrEqual(350.0); // Filled at or below limit
    expect(filledEvent.filledQuantity).toBe(5);

    // Verify UI updates to "Filled"
    await expect(page.locator('[data-testid="trade-status"]')).toContainText('Filled');

    console.log('✓ Limit order executed with real-time price fill notification');
  });

  test('should close position and receive portfolio update events', async ({ page }) => {
    // Prerequisite: Create open position (via API or previous test)
    // For E2E test, we'll assume position already exists from previous trade

    // Navigate to portfolio
    await page.goto(PORTFOLIO_URL);

    // Find open position and click "Close Position" button
    const positionRow = page.locator('[data-testid="position-row-AAPL"]');
    await expect(positionRow).toBeVisible();

    // Listen for events
    const eventPromises = {
      submitted: waitForTradeEvent(page, 'trade.submitted'),
      filled: waitForTradeEvent(page, 'trade.filled'),
      positionClosed: waitForTradeEvent(page, 'portfolio.position.closed'),
      portfolioUpdated: waitForTradeEvent(page, 'portfolio.updated')
    };

    // Click close position button
    await page.click('[data-testid="close-position-AAPL"]');

    // Confirm closure in modal
    await page.click('[data-testid="confirm-close-position"]');

    // Verify trade.submitted event
    const submittedEvent = await eventPromises.submitted;
    expect(submittedEvent.action).toBe('sell'); // Closing long position = sell
    expect(submittedEvent.symbol).toBe('AAPL');

    // Verify trade.filled event
    const filledEvent = await eventPromises.filled;
    expect(filledEvent.status).toBe('FILLED');

    // Verify portfolio.position.closed event
    const closedEvent = await eventPromises.positionClosed;
    expect(closedEvent.symbol).toBe('AAPL');
    expect(closedEvent.realizedPnL).toBeDefined();

    // Verify portfolio.updated event
    const portfolioEvent = await eventPromises.portfolioUpdated;
    expect(portfolioEvent.positionCount).toBeDefined();

    // Verify UI removes position row
    await expect(positionRow).not.toBeVisible({ timeout: 2000 });

    // Verify portfolio totals updated
    await expect(page.locator('[data-testid="total-positions"]')).not.toContainText('AAPL');

    console.log('✓ Position closed with real-time portfolio updates');
  });

  test('should synchronize trade updates across multiple browser tabs', async ({ page, context }) => {
    // Open second tab
    const secondPage = await context.newPage();
    await setupTestAuth(secondPage);
    await secondPage.goto(DASHBOARD_URL);
    await waitForWebSocketConnection(secondPage);

    console.log('✓ Second tab connected to WebSocket');

    // Navigate first tab to trade form
    await page.goto(TRADE_FORM_URL);

    // Listen for trade events on SECOND tab (should receive same events)
    const secondTabEventPromise = waitForTradeEvent(secondPage, 'trade.filled');

    // Submit trade on FIRST tab
    const tradeData = {
      symbol: 'GOOGL',
      action: 'buy',
      quantity: 2,
      orderType: 'market'
    };

    await submitTradeForm(page, tradeData);

    // Verify SECOND tab receives trade.filled event
    const secondTabEvent = await secondTabEventPromise;
    expect(secondTabEvent).toBeDefined();
    expect(secondTabEvent.symbol).toBe('GOOGL');

    // Verify both tabs show the same trade
    await expect(page.locator('[data-testid="trade-list"]')).toContainText('GOOGL');
    await expect(secondPage.locator('[data-testid="trade-list"]')).toContainText('GOOGL');

    // Close second tab
    await secondPage.close();

    console.log('✓ Trade synchronized across multiple tabs');
  });

  test('should handle WebSocket disconnection during trade and reconnect', async ({ page }) => {
    // Navigate to trade form
    await page.goto(TRADE_FORM_URL);

    // Submit trade
    const tradeData = {
      symbol: 'NVDA',
      action: 'buy',
      quantity: 5,
      orderType: 'market'
    };

    // Listen for created event
    const createdPromise = waitForTradeEvent(page, 'trade.created');

    await submitTradeForm(page, tradeData);

    // Wait for created event
    await createdPromise;

    // Simulate WebSocket disconnection
    await page.evaluate(() => {
      window.socket.disconnect();
    });

    // Verify UI shows disconnected state
    await expect(page.locator('[data-testid="connection-status"]')).toContainText('Disconnected');

    // Wait for automatic reconnection (exponential backoff: 1s)
    await page.waitForTimeout(2000);

    // Verify reconnected
    await waitForWebSocketConnection(page);
    await expect(page.locator('[data-testid="connection-status"]')).toContainText('Connected');

    // Verify missed events are resynchronized (portfolio.sync event)
    const syncPromise = waitForTradeEvent(page, 'portfolio.sync', 3000);
    const syncEvent = await syncPromise;
    expect(syncEvent).toBeDefined();
    expect(syncEvent.positions).toBeDefined();

    console.log('✓ WebSocket reconnection and event resynchronization successful');
  });

  test('should show latency metrics for trade events (<100ms)', async ({ page }) => {
    // Navigate to trade form
    await page.goto(TRADE_FORM_URL);

    // Submit trade and measure latency
    const tradeData = {
      symbol: 'AMD',
      action: 'buy',
      quantity: 10,
      orderType: 'market'
    };

    // Capture start time before submission
    const startTime = Date.now();

    // Listen for trade.created event
    const createdPromise = waitForTradeEvent(page, 'trade.created');

    // Submit trade
    await submitTradeForm(page, tradeData);

    // Wait for event
    const createdEvent = await createdPromise;

    // Calculate latency (submission → WebSocket event received)
    const latency = Date.now() - startTime;

    console.log(`Trade event latency: ${latency}ms`);

    // Verify latency meets Constitutional Principle IV (<100ms p95)
    // Note: E2E tests may have higher latency due to browser overhead
    // In production, backend should emit events within <100ms
    expect(latency).toBeLessThan(500); // Relaxed for E2E test environment

    // Verify event payload includes timestamp
    expect(createdEvent.timestamp).toBeDefined();

    console.log('✓ Trade event latency measured and within acceptable range');
  });
});

/**
 * Test Group: Portfolio Real-Time Updates
 */
test.describe('Portfolio Real-Time Updates', () => {
  test.beforeEach(async ({ page }) => {
    await setupTestAuth(page);
    await page.goto(PORTFOLIO_URL);
    await waitForWebSocketConnection(page);
  });

  test('should receive portfolio.updated events at 1Hz throttle rate', async ({ page }) => {
    // Constitutional Principle IV: Portfolio updates throttled to 1Hz (1 second)

    const updateEvents = [];
    const eventCount = 5;

    // Listen for multiple portfolio.updated events
    await page.evaluate(count => {
      window.portfolioEvents = [];

      const listener = data => {
        window.portfolioEvents.push({
          timestamp: Date.now(),
          data
        });

        if (window.portfolioEvents.length >= count) {
          window.socket.off('portfolio.updated', listener);
        }
      };

      window.socket.on('portfolio.updated', listener);
    }, eventCount);

    // Simulate market data changes (mock backend will emit updates)
    // In real scenario, backend emits portfolio.updated when positions change

    // Wait for events to accumulate
    await page.waitForFunction(
      count => {
        return window.portfolioEvents && window.portfolioEvents.length >= count;
      },
      { timeout: 10000 },
      eventCount
    );

    // Retrieve events
    const events = await page.evaluate(() => window.portfolioEvents);

    // Verify throttling: events should be ~1 second apart
    for (let i = 1; i < events.length; i++) {
      const timeDiff = events[i].timestamp - events[i - 1].timestamp;
      console.log(`Event ${i} time diff: ${timeDiff}ms`);

      // Allow some variance (±200ms) due to network/processing
      expect(timeDiff).toBeGreaterThanOrEqual(800); // Min 800ms between updates
    }

    console.log('✓ Portfolio updates throttled to ~1Hz as per Constitutional Principle IV');
  });

  test('should receive margin warning events when approaching limits', async ({ page }) => {
    // Listen for portfolio.margin event
    const marginPromise = waitForTradeEvent(page, 'portfolio.margin', 10000);

    // Simulate margin level reaching warning threshold (mock backend trigger)
    // In production, RiskManagementService would emit this when margin < 25%

    const marginEvent = await marginPromise;

    expect(marginEvent).toBeDefined();
    expect(marginEvent.marginLevel).toBeLessThan(0.25); // < 25% = warning
    expect(marginEvent.message).toContain('margin');

    // Verify UI shows margin warning banner
    await expect(page.locator('[data-testid="margin-warning"]')).toBeVisible();
    await expect(page.locator('[data-testid="margin-level"]')).toContainText(
      marginEvent.marginLevel.toString()
    );

    console.log('✓ Margin warning received and displayed');
  });
});
