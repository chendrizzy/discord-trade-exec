const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const visualConfig = require('../visual-test.config');

/**
 * Visual Regression Tests - Dashboard Pages
 * Tests full pages across responsive breakpoints
 */

test.describe('Dashboard Pages - Visual Regression', () => {
  // Mock authentication
  test.use({
    storageState: {
      cookies: [],
      origins: [
        {
          origin: 'http://localhost:5000',
          localStorage: [
            {
              name: 'authToken',
              value: 'mock-test-token',
            },
          ],
        },
      ],
    },
  });

  for (const [breakpointName, viewport] of Object.entries(visualConfig.breakpoints)) {
    test.describe(`${breakpointName} viewport`, () => {
      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
      });

      test('Dashboard home page', async ({ page }) => {
        await page.goto('/dashboard');
        await page.waitForLoadState('networkidle');

        // Wait for charts to load
        await page.waitForSelector('.chart-loaded', { timeout: 10000 }).catch(() => {
          console.log('Chart loading timeout - continuing with test');
        });

        await expect(page).toHaveScreenshot(`dashboard-home-${breakpointName}.png`, {
          fullPage: true,
          mask: visualConfig.dynamicElements.map(selector => page.locator(selector)),
          animations: 'disabled',
        });
      });

      test('Broker management page', async ({ page }) => {
        await page.goto('/dashboard/brokers');
        await page.waitForLoadState('networkidle');

        await expect(page).toHaveScreenshot(`broker-management-${breakpointName}.png`, {
          fullPage: true,
          mask: [
            ...visualConfig.dynamicElements.map(selector => page.locator(selector)),
            page.locator('[data-connection-status]'), // Mask live connection status
          ],
          animations: 'disabled',
        });
      });

      test('Portfolio overview page', async ({ page }) => {
        await page.goto('/dashboard/portfolio');
        await page.waitForLoadState('networkidle');

        // Wait for portfolio data
        await page.waitForSelector('.data-table-ready', { timeout: 5000 }).catch(() => {});

        await expect(page).toHaveScreenshot(`portfolio-overview-${breakpointName}.png`, {
          fullPage: true,
          mask: [
            ...visualConfig.dynamicElements.map(selector => page.locator(selector)),
            page.locator('[data-live-price]'), // Mask live prices
            page.locator('[data-market-value]'), // Mask market values
          ],
          animations: 'disabled',
        });
      });

      test('Risk settings page', async ({ page }) => {
        await page.goto('/dashboard/risk-settings');
        await page.waitForLoadState('networkidle');

        await expect(page).toHaveScreenshot(`risk-settings-${breakpointName}.png`, {
          fullPage: true,
          animations: 'disabled',
        });
      });

      test('Billing settings page', async ({ page }) => {
        await page.goto('/dashboard/billing');
        await page.waitForLoadState('networkidle');

        await expect(page).toHaveScreenshot(`billing-settings-${breakpointName}.png`, {
          fullPage: true,
          mask: [
            page.locator('[data-subscription-date]'),
            page.locator('[data-billing-amount]'),
          ],
          animations: 'disabled',
        });
      });
    });
  }
});

test.describe('Dashboard Pages - Accessibility', () => {
  test.use({ viewport: visualConfig.breakpoints.desktop });

  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
  });

  test('Dashboard home meets WCAG 2.1 AA', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('Broker management meets WCAG 2.1 AA', async ({ page }) => {
    await page.goto('/dashboard/brokers');
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('Portfolio page meets WCAG 2.1 AA', async ({ page }) => {
    await page.goto('/dashboard/portfolio');
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('Keyboard navigation works correctly', async ({ page }) => {
    await page.goto('/dashboard');

    // Tab through interactive elements
    await page.keyboard.press('Tab');
    let focusedElement = await page.evaluate(() => document.activeElement.tagName);

    // Verify focus is on an interactive element
    expect(['BUTTON', 'A', 'INPUT', 'SELECT']).toContain(focusedElement);

    // Screenshot focused state
    await expect(page).toHaveScreenshot('keyboard-navigation-focus.png');
  });
});

test.describe('Dashboard Pages - Loading States', () => {
  test.use({ viewport: visualConfig.breakpoints.desktop });

  test('Dashboard loading skeleton', async ({ page }) => {
    // Intercept API calls to delay response
    await page.route('**/api/dashboard/**', route => {
      setTimeout(() => route.continue(), 2000);
    });

    const responsePromise = page.waitForResponse('**/api/dashboard/**');
    await page.goto('/dashboard');

    // Screenshot loading state before API responds
    await expect(page).toHaveScreenshot('dashboard-loading-skeleton.png', {
      fullPage: true,
    });

    await responsePromise;
  });

  test('Portfolio loading state', async ({ page }) => {
    await page.route('**/api/portfolio/**', route => {
      setTimeout(() => route.continue(), 2000);
    });

    await page.goto('/dashboard/portfolio');

    await expect(page).toHaveScreenshot('portfolio-loading-state.png', {
      fullPage: true,
    });
  });
});

test.describe('Dashboard Pages - Error States', () => {
  test.use({ viewport: visualConfig.breakpoints.desktop });

  test('API error state', async ({ page }) => {
    // Intercept and fail API call
    await page.route('**/api/dashboard/**', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });

    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Wait for error message
    await page.waitForSelector('[data-error-state]', { timeout: 5000 }).catch(() => {});

    await expect(page).toHaveScreenshot('dashboard-api-error.png', {
      fullPage: true,
    });
  });

  test('Network offline state', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Simulate offline
    await page.context().setOffline(true);

    // Trigger action that requires network
    await page.click('[data-testid="refresh-btn"]').catch(() => {});

    await page.waitForSelector('[data-offline-indicator]', { timeout: 5000 }).catch(() => {});

    await expect(page).toHaveScreenshot('dashboard-offline-state.png', {
      fullPage: true,
    });
  });
});
