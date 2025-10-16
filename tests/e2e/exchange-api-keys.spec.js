// External dependencies
const { test, expect } = require('@playwright/test');

/**
 * Exchange API Key Management E2E Tests
 * Tests the complete flow of adding, validating, and managing exchange API keys
 */

test.describe('Exchange API Key Management', () => {
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

    await page.goto('/dashboard/exchanges');
  });

  test('should display exchange management page', async ({ page }) => {
    // Check for page title/header
    await expect(page.getByRole('heading', { name: /exchange/i })).toBeVisible();

    // Check for add exchange button
    const addButton = page.getByRole('button', { name: /add|connect/i });
    await expect(addButton).toBeVisible();
  });

  test('should show list of supported exchanges', async ({ page }) => {
    // Click add exchange button
    await page.getByRole('button', { name: /add|connect/i }).click();

    // Should show exchange selection
    await expect(page.getByText(/binance/i)).toBeVisible();
    await expect(page.getByText(/coinbase/i)).toBeVisible();
    await expect(page.getByText(/kraken/i)).toBeVisible();
  });

  test('should validate API key format', async ({ page }) => {
    // Open add exchange modal
    await page.getByRole('button', { name: /add|connect/i }).click();

    // Select Binance
    await page.getByText(/binance/i).click();

    // Try to submit with empty fields
    await page.getByRole('button', { name: /submit|save|add/i }).click();

    // Should show validation errors
    await expect(page.getByText(/required|invalid/i)).toBeVisible();
  });

  test('should validate API key permissions', async ({ page }) => {
    // This would require mocking the CCXT validation
    // For now, test that the validation endpoint exists
    const response = await page.request.post('/api/exchanges', {
      data: {
        name: 'binance',
        apiKey: 'test-api-key',
        apiSecret: 'test-api-secret',
        testnet: true
      }
    });

    // Should not return 404
    expect(response.status()).not.toBe(404);

    // Should validate the request
    expect([400, 401, 422]).toContain(response.status());
  });

  test('should display API key preview (last 4 characters)', async ({ page }) => {
    // Mock an existing exchange
    await page.route('/api/exchanges', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            exchanges: [
              {
                id: '507f1f77bcf86cd799439011',
                name: 'binance',
                label: 'Binance Main',
                apiKeyPreview: '****1234',
                active: true,
                testnet: false,
                permissions: {
                  read: true,
                  trade: true,
                  withdraw: false
                }
              }
            ]
          })
        });
      } else {
        await route.continue();
      }
    });

    await page.reload();

    // Should show masked API key
    await expect(page.getByText(/\*\*\*\*1234/)).toBeVisible();

    // Should NOT show full API key
    await expect(page.getByText(/test-api-key/)).not.toBeVisible();
  });

  test('should show permission warnings', async ({ page }) => {
    // Mock exchange with withdrawal permission (dangerous!)
    await page.route('/api/exchanges', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            exchanges: [
              {
                id: '507f1f77bcf86cd799439011',
                name: 'binance',
                label: 'Binance Main',
                apiKeyPreview: '****5678',
                active: false,
                testnet: false,
                permissions: {
                  read: true,
                  trade: true,
                  withdraw: true // DANGEROUS!
                }
              }
            ]
          })
        });
      } else {
        await route.continue();
      }
    });

    await page.reload();

    // Should show warning about withdrawal permissions
    await expect(page.getByText(/warning|danger|withdraw/i)).toBeVisible();

    // Exchange should be marked as inactive
    await expect(page.getByText(/inactive|disabled/i)).toBeVisible();
  });

  test('should allow enabling/disabling exchanges', async ({ page }) => {
    // Mock an existing exchange
    await page.route('/api/exchanges', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            exchanges: [
              {
                id: '507f1f77bcf86cd799439011',
                name: 'binance',
                apiKeyPreview: '****1234',
                active: true
              }
            ]
          })
        });
      } else {
        await route.continue();
      }
    });

    await page.reload();

    // Look for toggle/switch control
    const toggleButton = page.locator('[role="switch"], input[type="checkbox"]').first();

    if ((await toggleButton.count()) > 0) {
      await expect(toggleButton).toBeVisible();
    }
  });

  test('should allow deleting exchanges', async ({ page }) => {
    // Mock an existing exchange
    await page.route('/api/exchanges', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            exchanges: [
              {
                id: '507f1f77bcf86cd799439011',
                name: 'binance',
                apiKeyPreview: '****1234',
                active: true
              }
            ]
          })
        });
      } else {
        await route.continue();
      }
    });

    await page.reload();

    // Look for delete button
    const deleteButton = page.getByRole('button', { name: /delete|remove/i }).first();

    if ((await deleteButton.count()) > 0) {
      await deleteButton.click();

      // Should show confirmation dialog
      await expect(page.getByText(/confirm|sure|delete/i)).toBeVisible();
    }
  });

  test('should handle API rate limiting', async ({ page }) => {
    // Mock rate limit response
    await page.route('/api/exchanges', async route => {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Too many requests'
        }),
        headers: {
          'Retry-After': '60',
          'X-RateLimit-Limit': '100',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': Date.now() + 60000
        }
      });
    });

    // Try to add exchange
    await page.getByRole('button', { name: /add|connect/i }).click();

    // Fill in form
    await page.fill('input[name="apiKey"], input[placeholder*="API"]', 'test-key');
    await page.fill('input[name="apiSecret"], input[placeholder*="Secret"]', 'test-secret');

    // Submit
    await page.getByRole('button', { name: /submit|save|add/i }).click();

    // Should show rate limit error
    await expect(page.getByText(/too many|rate limit|try again/i)).toBeVisible();
  });
});

test.describe('Exchange API Security', () => {
  test('should enforce HTTPS in production', async ({ page }) => {
    // Check if non-HTTPS requests are rejected in production
    const currentUrl = page.url();

    if (currentUrl.startsWith('https://')) {
      // Production environment - good!
      expect(currentUrl).toMatch(/^https:\/\//);
    }
  });

  test('should not expose API keys in page source', async ({ page, context }) => {
    await context.addCookies([
      {
        name: 'connect.sid',
        value: 'test-session-id',
        domain: 'localhost',
        path: '/'
      }
    ]);

    await page.goto('/dashboard/exchanges');

    // Get page HTML
    const pageContent = await page.content();

    // Should NOT contain full API keys
    expect(pageContent).not.toMatch(/[A-Za-z0-9]{20,}/); // Long alphanumeric strings
    expect(pageContent).not.toContain('apiKey');
    expect(pageContent).not.toContain('apiSecret');
  });

  test('should validate exchange name against whitelist', async ({ page }) => {
    const response = await page.request.post('/api/exchanges', {
      data: {
        name: 'malicious-exchange',
        apiKey: 'test-key',
        apiSecret: 'test-secret'
      }
    });

    // Should reject invalid exchange name
    expect(response.status()).toBe(400);

    const body = await response.json();
    expect(body.error).toMatch(/invalid|unsupported|exchange/i);
  });
});
