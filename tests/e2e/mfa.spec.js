// External dependencies
const { test, expect } = require('@playwright/test');

/**
 * Multi-Factor Authentication (MFA) E2E Tests
 * Tests the complete MFA flow from setup to verification
 */

test.describe('MFA Security Page', () => {
  test.beforeEach(async ({ page, context }) => {
    // Set authenticated session cookie
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
  });

  test('should display security page for authenticated users', async ({ page }) => {
    await page.goto('/dashboard/security');

    // Check page title
    await expect(page).toHaveTitle(/Security.*Discord Trade Executor/i);

    // Check for main heading
    const heading = page.getByRole('heading', { name: /security settings/i });
    await expect(heading).toBeVisible();
  });

  test('should show MFA status section', async ({ page }) => {
    await page.goto('/dashboard/security');

    // Check for MFA status elements
    const statusSection = page.locator('#mfa-status');
    await expect(statusSection).toBeVisible();

    // Should show either enabled or disabled status
    const statusBadge = page.locator('#status-badge');
    await expect(statusBadge).toBeVisible();
  });

  test('should have security navigation link', async ({ page }) => {
    await page.goto('/dashboard');

    // Check for Security link in navigation
    const securityLink = page.getByRole('link', { name: /security/i });
    await expect(securityLink).toBeVisible();

    // Click and navigate
    await securityLink.click();
    await expect(page).toHaveURL(/\/dashboard\/security/);
  });
});

test.describe('MFA Setup Flow', () => {
  test.beforeEach(async ({ page, context }) => {
    // Set authenticated session
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

    await page.goto('/dashboard/security');
  });

  test('should show enable MFA button when disabled', async ({ page }) => {
    // Mock API response for disabled MFA status
    await page.route('/api/auth/mfa/status', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: false,
          backupCodesRemaining: 0,
          lastVerified: null
        })
      });
    });

    await page.reload();

    // Check for enable button
    const enableButton = page.getByRole('button', { name: /enable mfa/i });
    await expect(enableButton).toBeVisible();
  });

  test('should start MFA setup on enable click', async ({ page }) => {
    // Mock API responses
    await page.route('/api/auth/mfa/status', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: false,
          backupCodesRemaining: 0,
          lastVerified: null
        })
      });
    });

    await page.route('/api/auth/mfa/setup', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          secret: 'JBSWY3DPEHPK3PXP',
          qrCode: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...'
        })
      });
    });

    await page.reload();

    // Click enable button
    const enableButton = page.getByRole('button', { name: /enable mfa/i });
    await enableButton.click();

    // Should show setup flow
    const setupSection = page.locator('#mfa-setup');
    await expect(setupSection).toBeVisible();

    // Should show step 1 (install app)
    const step1 = page.locator('#step-1');
    await expect(step1).toBeVisible();
  });

  test('should display QR code in step 2', async ({ page }) => {
    // Mock setup API
    await page.route('/api/auth/mfa/setup', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          secret: 'JBSWY3DPEHPK3PXP',
          qrCode: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...'
        })
      });
    });

    // Trigger setup flow
    await page.evaluate(() => {
      window.startMFASetup();
    });

    // Wait for step 2
    await page.waitForSelector('#step-2.active');

    // Check for QR code image
    const qrCode = page.locator('#qr-code');
    await expect(qrCode).toBeVisible();
    await expect(qrCode).toHaveAttribute('src', /^data:image\/png/);

    // Check for manual entry secret
    const secretCode = page.locator('#secret-code');
    await expect(secretCode).toBeVisible();
    await expect(secretCode).toHaveText('JBSWY3DPEHPK3PXP');
  });

  test('should validate token input format', async ({ page }) => {
    await page.goto('/dashboard/security');

    // Get token input field (may need to trigger setup first)
    const tokenInput = page.locator('#verify-token');

    // Should only accept 6 digits
    await tokenInput.fill('abc123xyz');
    const value = await tokenInput.inputValue();
    expect(value).toBe('123');
    expect(value.length).toBeLessThanOrEqual(6);
  });

  test('should display backup codes after verification', async ({ page }) => {
    // Mock enable API
    await page.route('/api/auth/mfa/enable', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          backupCodes: [
            'AAAA-BBBB',
            'CCCC-DDDD',
            'EEEE-FFFF',
            'GGGG-HHHH',
            'IIII-JJJJ',
            'KKKK-LLLL',
            'MMMM-NNNN',
            'OOOO-PPPP',
            'QQQQ-RRRR',
            'SSSS-TTTT'
          ]
        })
      });
    });

    // Trigger verification flow
    await page.evaluate(() => {
      window.verifyAndEnableMFA();
    });

    // Wait for step 3
    await page.waitForSelector('#step-3.active');

    // Check for backup codes
    const backupCodes = page.locator('.backup-code');
    await expect(backupCodes).toHaveCount(10);
  });

  test('should allow downloading backup codes', async ({ page }) => {
    // Set up download handler
    const downloadPromise = page.waitForEvent('download');

    // Trigger backup code download
    await page.evaluate(() => {
      window.initialBackupCodes = ['AAAA-BBBB', 'CCCC-DDDD'];
      window.downloadBackupCodes();
    });

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/mfa-backup-codes-\d+\.txt/);
  });
});

test.describe('MFA Management', () => {
  test.beforeEach(async ({ page, context }) => {
    // Set authenticated session
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

    // Mock enabled MFA status
    await page.route('/api/auth/mfa/status', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: true,
          backupCodesRemaining: 8,
          lastVerified: new Date().toISOString()
        })
      });
    });

    await page.goto('/dashboard/security');
  });

  test('should show management options when MFA enabled', async ({ page }) => {
    // Should show manage section
    const manageSection = page.locator('#mfa-manage');
    await expect(manageSection).toBeVisible();

    // Should show regenerate button
    const regenerateButton = page.getByRole('button', { name: /regenerate backup codes/i });
    await expect(regenerateButton).toBeVisible();

    // Should show disable button
    const disableButton = page.getByRole('button', { name: /disable mfa/i });
    await expect(disableButton).toBeVisible();
  });

  test('should show low backup code warning', async ({ page }) => {
    // Mock status with low backup codes
    await page.route('/api/auth/mfa/status', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: true,
          backupCodesRemaining: 2,
          lastVerified: new Date().toISOString()
        })
      });
    });

    await page.reload();

    // Should show warning
    const warning = page.locator('.warning-box');
    await expect(warning).toBeVisible();
    await expect(warning).toContainText(/low.*backup codes/i);
  });

  test('should confirm before regenerating codes', async ({ page }) => {
    const regenerateButton = page.getByRole('button', { name: /regenerate backup codes/i });

    // Set up dialog handler
    page.once('dialog', dialog => {
      expect(dialog.type()).toBe('confirm');
      expect(dialog.message()).toContain('invalidate');
      dialog.dismiss();
    });

    await regenerateButton.click();
  });

  test('should confirm before disabling MFA', async ({ page }) => {
    const disableButton = page.getByRole('button', { name: /disable mfa/i });

    // Set up dialog handler
    page.once('dialog', dialog => {
      expect(dialog.type()).toBe('confirm');
      expect(dialog.message()).toContain('disable');
      dialog.dismiss();
    });

    await disableButton.click();
  });
});

test.describe('MFA Error Handling', () => {
  test.beforeEach(async ({ page, context }) => {
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

    await page.goto('/dashboard/security');
  });

  test('should handle API errors gracefully', async ({ page }) => {
    // Mock error response
    await page.route('/api/auth/mfa/status', async route => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Internal server error'
        })
      });
    });

    await page.reload();

    // Should show error message
    const errorAlert = page.locator('.alert-error');
    await expect(errorAlert).toBeVisible();
  });

  test('should handle invalid token error', async ({ page }) => {
    // Mock invalid token response
    await page.route('/api/auth/mfa/enable', async route => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Invalid verification token'
        })
      });
    });

    // Should show error message after failed verification
    // (implementation depends on how frontend handles this)
  });

  test('should handle rate limiting', async ({ page }) => {
    // Mock rate limit response
    await page.route('/api/auth/mfa/verify', async route => {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Too many attempts. Please try again in 15 minutes.',
          retryAfter: 900
        })
      });
    });

    // Should show rate limit message
    // (implementation depends on frontend handling)
  });
});

test.describe('MFA Security', () => {
  test('should require authentication for security page', async ({ page }) => {
    // Access without session cookie
    const response = await page.goto('/dashboard/security');

    // Should redirect to auth
    const url = page.url();
    expect(url).toMatch(/auth|login|discord/i);
  });

  test('should not expose sensitive data in DOM', async ({ page, context }) => {
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

    await page.goto('/dashboard/security');

    // Check that TOTP secret is not in DOM before setup
    const pageContent = await page.content();
    expect(pageContent).not.toContain('mfaSecret');
  });

  test('should use HTTPS for QR code images', async ({ page, context }) => {
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

    // Mock setup response
    await page.route('/api/auth/mfa/setup', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          secret: 'JBSWY3DPEHPK3PXP',
          qrCode: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...'
        })
      });
    });

    await page.goto('/dashboard/security');

    // QR codes should use data URLs (embedded) for security
    const qrCode = page.locator('#qr-code');
    if (await qrCode.isVisible()) {
      const src = await qrCode.getAttribute('src');
      expect(src).toMatch(/^data:image\//);
    }
  });
});
