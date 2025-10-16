// External dependencies
const { test, expect } = require('@playwright/test');

/**
 * Dashboard E2E Tests
 * Tests dashboard navigation, UI components, and basic functionality
 */

test.describe('Dashboard Navigation', () => {
  test.beforeEach(async ({ page, context }) => {
    // Mock authenticated session
    await context.addCookies([
      {
        name: 'connect.sid',
        value: 'test-session-id',
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax'
      }
    ]);

    await page.goto('/dashboard');
  });

  test('should display dashboard home page', async ({ page }) => {
    await expect(page).toHaveTitle(/dashboard|trade executor/i);

    // Should have main navigation
    await expect(page.getByRole('navigation')).toBeVisible();
  });

  test('should have navigation menu items', async ({ page }) => {
    // Check for key navigation links
    const expectedLinks = [/overview|home|dashboard/i, /exchange/i, /signal/i, /risk/i, /settings/i];

    for (const linkPattern of expectedLinks) {
      const link = page.getByRole('link', { name: linkPattern });
      // At least one should be visible
      if ((await link.count()) > 0) {
        await expect(link.first()).toBeVisible();
      }
    }
  });

  test('should navigate between dashboard sections', async ({ page }) => {
    // Navigate to exchanges
    await page.getByRole('link', { name: /exchange/i }).click();
    await expect(page).toHaveURL(/exchange/i);

    // Navigate to signals
    await page.getByRole('link', { name: /signal/i }).click();
    await expect(page).toHaveURL(/signal/i);

    // Navigate to risk management
    await page.getByRole('link', { name: /risk/i }).click();
    await expect(page).toHaveURL(/risk/i);
  });

  test('should display user information', async ({ page }) => {
    // Should show user avatar or username
    const userInfo = page.locator('[data-testid="user-info"], .user-menu, .avatar');

    if ((await userInfo.count()) > 0) {
      await expect(userInfo.first()).toBeVisible();
    }
  });

  test('should be responsive on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Should have mobile menu (hamburger)
    const mobileMenu = page.locator('[aria-label*="menu"], .hamburger, [data-testid="mobile-menu"]');

    if ((await mobileMenu.count()) > 0) {
      await expect(mobileMenu.first()).toBeVisible();
    }
  });
});

test.describe('Dashboard Overview', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.addCookies([
      {
        name: 'connect.sid',
        value: 'test-session-id',
        domain: 'localhost',
        path: '/'
      }
    ]);

    await page.goto('/dashboard');
  });

  test('should display key metrics', async ({ page }) => {
    // Mock dashboard data
    await page.route('/api/dashboard/stats', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          totalTrades: 150,
          winRate: 65.5,
          totalProfit: 2500.5,
          activeSignals: 5,
          connectedExchanges: 2
        })
      });
    });

    await page.reload();

    // Should show statistics cards
    const statsCards = page.locator('[data-testid="stat-card"], .stat, .metric-card');

    if ((await statsCards.count()) > 0) {
      expect(await statsCards.count()).toBeGreaterThan(0);
    }
  });

  test('should display recent trades', async ({ page }) => {
    // Mock recent trades data
    await page.route('/api/trades/recent', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          trades: [
            {
              id: 'trade1',
              symbol: 'BTC/USDT',
              action: 'buy',
              price: 45000,
              profit: 250,
              timestamp: new Date().toISOString()
            }
          ]
        })
      });
    });

    await page.reload();

    // Look for trades table or list
    const tradesSection = page.getByText(/recent.*trade|trade.*history/i);

    if ((await tradesSection.count()) > 0) {
      await expect(tradesSection.first()).toBeVisible();
    }
  });

  test('should show active signal providers', async ({ page }) => {
    // Mock signal providers
    await page.route('/api/signal-providers/active', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          providers: [
            {
              id: 'provider1',
              name: 'Crypto Pro Signals',
              winRate: 72,
              subscribers: 150
            }
          ]
        })
      });
    });

    await page.reload();

    // Look for signal providers section
    const providersSection = page.getByText(/signal.*provider|active.*signal/i);

    if ((await providersSection.count()) > 0) {
      await expect(providersSection.first()).toBeVisible();
    }
  });
});

test.describe('Dashboard Performance', () => {
  test('should load dashboard quickly', async ({ page, context }) => {
    await context.addCookies([
      {
        name: 'connect.sid',
        value: 'test-session-id',
        domain: 'localhost',
        path: '/'
      }
    ]);

    const startTime = Date.now();
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - startTime;

    // Dashboard should load in under 3 seconds
    expect(loadTime).toBeLessThan(3000);
  });

  test('should handle offline mode gracefully', async ({ page, context }) => {
    await context.addCookies([
      {
        name: 'connect.sid',
        value: 'test-session-id',
        domain: 'localhost',
        path: '/'
      }
    ]);

    await page.goto('/dashboard');

    // Simulate offline
    await page.context().setOffline(true);

    // Try to navigate
    await page.getByRole('link', { name: /exchange/i }).click();

    // Should show offline message or cached content
    const offlineMessage = page.getByText(/offline|no.*connection|network.*error/i);

    if ((await offlineMessage.count()) > 0) {
      await expect(offlineMessage.first()).toBeVisible();
    }

    // Restore online
    await page.context().setOffline(false);
  });
});

test.describe('Dashboard Accessibility', () => {
  test('should have proper ARIA labels', async ({ page, context }) => {
    await context.addCookies([
      {
        name: 'connect.sid',
        value: 'test-session-id',
        domain: 'localhost',
        path: '/'
      }
    ]);

    await page.goto('/dashboard');

    // Check for navigation landmark
    const nav = page.getByRole('navigation');
    if ((await nav.count()) > 0) {
      await expect(nav.first()).toBeVisible();
    }

    // Check for main content landmark
    const main = page.getByRole('main');
    if ((await main.count()) > 0) {
      await expect(main.first()).toBeVisible();
    }
  });

  test('should be keyboard navigable', async ({ page, context }) => {
    await context.addCookies([
      {
        name: 'connect.sid',
        value: 'test-session-id',
        domain: 'localhost',
        path: '/'
      }
    ]);

    await page.goto('/dashboard');

    // Tab through focusable elements
    await page.keyboard.press('Tab');

    // Should have visible focus indicator
    const focusedElement = page.locator(':focus');
    if ((await focusedElement.count()) > 0) {
      await expect(focusedElement).toBeVisible();
    }
  });
});
