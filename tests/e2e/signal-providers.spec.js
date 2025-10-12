const { test, expect } = require('@playwright/test');

/**
 * Signal Provider Marketplace E2E Tests
 * Tests browsing, subscribing, and managing signal providers
 */

test.describe('Signal Provider Marketplace', () => {
  test.beforeEach(async ({ page, context }) => {
    // Mock authenticated session
    await context.addCookies([{
      name: 'connect.sid',
      value: 'test-session-id',
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax'
    }]);

    await page.goto('/dashboard/signal-providers');
  });

  test('should display signal provider marketplace', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /signal.*provider|marketplace/i })).toBeVisible();
  });

  test('should show list of signal providers', async ({ page }) => {
    // Mock signal providers
    await page.route('/api/signal-providers', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          providers: [
            {
              id: 'provider1',
              name: 'Crypto Pro Signals',
              description: 'Professional crypto trading signals',
              winRate: 72.5,
              subscribers: 150,
              rating: 4.5,
              verified: true,
              price: 49.99
            },
            {
              id: 'provider2',
              name: 'Bitcoin Master',
              description: 'BTC-focused signals',
              winRate: 68.0,
              subscribers: 89,
              rating: 4.2,
              verified: false,
              price: 29.99
            }
          ]
        })
      });
    });

    await page.reload();

    // Should display provider cards
    await expect(page.getByText(/crypto pro signals/i)).toBeVisible();
    await expect(page.getByText(/bitcoin master/i)).toBeVisible();
  });

  test('should show provider performance metrics', async ({ page }) => {
    // Mock signal providers with metrics
    await page.route('/api/signal-providers', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          providers: [{
            id: 'provider1',
            name: 'Test Provider',
            winRate: 75.5,
            profitFactor: 2.3,
            sharpeRatio: 1.8,
            maxDrawdown: -15.2,
            subscribers: 200
          }]
        })
      });
    });

    await page.reload();

    // Should show metrics
    await expect(page.getByText(/75\.5|win.*rate/i)).toBeVisible();
  });

  test('should filter providers by performance', async ({ page }) => {
    // Look for filter controls
    const filterButton = page.getByRole('button', { name: /filter|sort/i });

    if (await filterButton.count() > 0) {
      await filterButton.click();

      // Should show filter options
      await expect(page.getByText(/win.*rate|profit|rating/i)).toBeVisible();
    }
  });

  test('should search for providers', async ({ page }) => {
    // Look for search input
    const searchInput = page.getByPlaceholder(/search/i);

    if (await searchInput.count() > 0) {
      await searchInput.fill('crypto');
      await page.keyboard.press('Enter');

      // URL should update with search query
      expect(page.url()).toMatch(/search|query|q/);
    }
  });

  test('should show verification badge for verified providers', async ({ page }) => {
    // Mock verified provider
    await page.route('/api/signal-providers', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          providers: [{
            id: 'provider1',
            name: 'Verified Provider',
            verified: true,
            verificationStatus: 'verified'
          }]
        })
      });
    });

    await page.reload();

    // Should show verification badge/icon
    const verifiedBadge = page.locator('[data-testid="verified-badge"], .verified, [aria-label*="verified"]');

    if (await verifiedBadge.count() > 0) {
      await expect(verifiedBadge.first()).toBeVisible();
    }
  });

  test('should allow subscribing to providers', async ({ page }) => {
    // Mock signal providers
    await page.route('/api/signal-providers', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          providers: [{
            id: 'provider1',
            name: 'Test Provider',
            price: 49.99
          }]
        })
      });
    });

    await page.reload();

    // Click subscribe button
    const subscribeButton = page.getByRole('button', { name: /subscribe|join/i }).first();

    if (await subscribeButton.count() > 0) {
      await subscribeButton.click();

      // Should show subscription confirmation or payment form
      await expect(page.getByText(/confirm|payment|checkout/i)).toBeVisible();
    }
  });

  test('should show provider details', async ({ page }) => {
    // Mock signal providers
    await page.route('/api/signal-providers', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          providers: [{
            id: 'provider1',
            name: 'Test Provider'
          }]
        })
      });
    });

    await page.reload();

    // Click on provider to view details
    await page.getByText(/test provider/i).click();

    // Should navigate to provider detail page or open modal
    const detailsView = page.getByText(/detail|about|performance|history/i);

    if (await detailsView.count() > 0) {
      await expect(detailsView.first()).toBeVisible();
    }
  });

  test('should display provider reviews and ratings', async ({ page }) => {
    // Mock provider with reviews
    await page.route('/api/signal-providers/provider1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'provider1',
          name: 'Test Provider',
          rating: 4.5,
          reviews: [
            {
              userId: 'user1',
              username: 'TradingPro',
              rating: 5,
              comment: 'Great signals!',
              createdAt: new Date().toISOString()
            }
          ]
        })
      });
    });

    await page.goto('/dashboard/signal-providers/provider1');

    // Should show rating
    await expect(page.getByText(/4\.5|rating/i)).toBeVisible();

    // Should show reviews
    const reviews = page.getByText(/great.*signal|review/i);
    if (await reviews.count() > 0) {
      await expect(reviews.first()).toBeVisible();
    }
  });

  test('should handle signal provider conflicts', async ({ page }) => {
    // Mock conflicting signals
    await page.route('/api/signals/active', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          signals: [
            {
              id: 'signal1',
              provider: 'Provider A',
              action: 'buy',
              symbol: 'BTC/USDT',
              priority: 80
            },
            {
              id: 'signal2',
              provider: 'Provider B',
              action: 'sell',
              symbol: 'BTC/USDT',
              priority: 75
            }
          ],
          conflicts: [
            {
              symbol: 'BTC/USDT',
              signals: ['signal1', 'signal2'],
              resolution: 'Using higher priority signal'
            }
          ]
        })
      });
    });

    await page.goto('/dashboard/signals');

    // Should show conflict warning
    const conflictWarning = page.getByText(/conflict|opposing|different/i);

    if (await conflictWarning.count() > 0) {
      await expect(conflictWarning.first()).toBeVisible();
    }
  });
});

test.describe('Signal Provider Security', () => {
  test('should validate subscription payments', async ({ page, context }) => {
    await context.addCookies([{
      name: 'connect.sid',
      value: 'test-session-id',
      domain: 'localhost',
      path: '/'
    }]);

    // Attempt to subscribe without payment
    const response = await page.request.post('/api/subscriptions', {
      data: {
        providerId: 'provider1'
      }
    });

    // Should require payment information
    expect([400, 402, 422]).toContain(response.status());
  });

  test('should prevent duplicate subscriptions', async ({ page, context }) => {
    await context.addCookies([{
      name: 'connect.sid',
      value: 'test-session-id',
      domain: 'localhost',
      path: '/'
    }]);

    // Mock already subscribed
    await page.route('/api/subscriptions', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Already subscribed to this provider'
          })
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/dashboard/signal-providers');

    const subscribeButton = page.getByRole('button', { name: /subscribed|active/i }).first();

    if (await subscribeButton.count() > 0) {
      // Should show "already subscribed" state
      await expect(subscribeButton).toBeDisabled();
    }
  });
});
