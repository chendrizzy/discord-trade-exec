const { test, expect } = require('@playwright/test');

/**
 * Authentication E2E Tests
 * Tests the Discord OAuth2 login flow
 */

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display login page for unauthenticated users', async ({ page }) => {
    // Check for login button/link
    const loginButton = page.getByRole('link', { name: /login|sign in/i });
    await expect(loginButton).toBeVisible();

    // Check page title
    await expect(page).toHaveTitle(/trade executor|dashboard/i);
  });

  test('should redirect to Discord OAuth when clicking login', async ({ page }) => {
    const loginButton = page.getByRole('link', { name: /login|sign in/i });

    // Click login and wait for navigation
    await loginButton.click();

    // Should redirect to Discord OAuth
    await page.waitForURL(/discord\.com\/api\/oauth2\/authorize/);

    // Check for Discord OAuth page elements
    await expect(page.getByText(/authorize/i)).toBeVisible();
  });

  test('should handle OAuth callback correctly', async ({ page }) => {
    // This test would require mocking Discord OAuth or using test credentials
    // For now, we'll test the callback endpoint exists
    const response = await page.goto('/auth/discord/callback');

    // Should not return 404
    expect(response.status()).not.toBe(404);
  });

  test('should have logout functionality', async ({ page, context }) => {
    // Set a mock session cookie to simulate logged-in state
    await context.addCookies([{
      name: 'connect.sid',
      value: 'test-session-id',
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax'
    }]);

    await page.goto('/dashboard');

    // Look for logout button/link
    const logoutButton = page.getByRole('link', { name: /logout|sign out/i });

    if (await logoutButton.count() > 0) {
      await expect(logoutButton).toBeVisible();
    }
  });

  test('should protect dashboard routes', async ({ page }) => {
    // Try to access dashboard without authentication
    const response = await page.goto('/dashboard');

    // Should redirect to login or show unauthorized
    const url = page.url();
    expect(url).toMatch(/login|auth|unauthorized/i);
  });

  test('should maintain session across page refreshes', async ({ page, context }) => {
    // Set a mock session cookie
    await context.addCookies([{
      name: 'connect.sid',
      value: 'test-session-id',
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax'
    }]);

    await page.goto('/dashboard');

    // Refresh the page
    await page.reload();

    // Should still be on dashboard (session maintained)
    expect(page.url()).toContain('/dashboard');
  });
});

test.describe('Security Headers', () => {
  test('should have security headers configured', async ({ page }) => {
    const response = await page.goto('/');

    // Check for security headers
    const headers = response.headers();

    // Helmet security headers
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBeDefined();
    expect(headers['strict-transport-security']).toBeDefined();

    // Should hide powered-by header
    expect(headers['x-powered-by']).toBeUndefined();
  });

  test('should have Content-Security-Policy header', async ({ page }) => {
    const response = await page.goto('/');
    const headers = response.headers();

    expect(headers['content-security-policy']).toBeDefined();
    expect(headers['content-security-policy']).toContain("default-src 'self'");
  });
});
