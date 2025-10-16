// External dependencies
const { test, expect } = require('@playwright/test');

/**
 * Broker Connection E2E Tests
 * Tests the complete user flow for connecting and managing broker accounts
 *
 * Flow:
 * 1. Navigate to Settings
 * 2. Open BrokerConfigWizard
 * 3. Select broker type and broker
 * 4. Enter credentials
 * 5. Test connection
 * 6. Save configuration
 * 7. Verify broker appears in BrokerManagement
 * 8. Test connection from management view
 * 9. Disconnect broker
 */

test.describe('Broker Connection Workflow', () => {
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

    // Mock auth status
    await page.route('/auth/status', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            _id: 'test-user-id',
            discordId: '123456789',
            username: 'TestUser',
            discriminator: '1234',
            isAdmin: false,
            subscription: {
              tier: 'pro',
              status: 'active'
            }
          }
        })
      });
    });

    // Mock available brokers API
    await page.route('/api/brokers', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          brokers: [
            {
              key: 'alpaca',
              name: 'Alpaca',
              type: 'stock',
              authMethod: 'api-key',
              features: ['paper-trading', 'stocks', 'options'],
              website: 'https://alpaca.markets'
            },
            {
              key: 'coinbasepro',
              name: 'Coinbase Pro',
              type: 'crypto',
              authMethod: 'api-key',
              features: ['spot-trading', 'crypto'],
              website: 'https://pro.coinbase.com'
            }
          ]
        })
      });
    });

    await page.goto('/dashboard');
  });

  test('should complete full broker connection flow - stock broker', async ({ page }) => {
    // Step 1: Navigate to Settings tab
    await page.getByRole('button', { name: /settings/i }).click();
    await page.waitForTimeout(500);

    // Step 2: Verify BrokerConfigWizard button is visible
    const configureButton = page.getByRole('button', { name: /configure.*broker|add.*broker/i }).first();
    await expect(configureButton).toBeVisible();

    // Step 3: Click to open wizard
    await configureButton.click();
    await page.waitForTimeout(300);

    // Step 4: Select broker type (Stock)
    await page.getByRole('button', { name: /stock/i }).click();
    await page.waitForTimeout(300);

    // Step 5: Select broker (Alpaca)
    await page.getByText('Alpaca').click();
    await page.waitForTimeout(300);

    // Step 6: Select auth method (API Key)
    await page.getByRole('button', { name: /api.*key/i }).click();
    await page.waitForTimeout(300);

    // Step 7: Enter credentials
    const apiKeyInput = page.getByLabel(/api.*key|key/i).first();
    const apiSecretInput = page.getByLabel(/api.*secret|secret/i).first();

    await apiKeyInput.fill('test-api-key-123');
    await apiSecretInput.fill('test-api-secret-456');

    // Select paper trading environment
    await page.getByRole('button', { name: /paper.*trading|testnet/i }).click();
    await page.waitForTimeout(300);

    // Step 8: Mock test connection endpoint
    await page.route('/api/brokers/test', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Connection successful',
          balance: {
            available: 100000.00,
            total: 100000.00,
            currency: 'USD'
          }
        })
      });
    });

    // Click test connection
    const testButton = page.getByRole('button', { name: /test.*connection/i }).first();
    await testButton.click();

    // Wait for test result
    await page.waitForTimeout(1000);

    // Verify success message
    await expect(page.getByText(/connection.*successful/i)).toBeVisible();
    await expect(page.getByText(/balance.*100,000/i)).toBeVisible();

    // Step 9: Save configuration
    await page.route('/api/brokers/configure', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Broker configured successfully',
          broker: {
            key: 'alpaca',
            name: 'Alpaca',
            type: 'stock',
            authMethod: 'api-key',
            environment: 'testnet',
            configuredAt: new Date().toISOString()
          }
        })
      });
    });

    const saveButton = page.getByRole('button', { name: /save|finish/i });
    await saveButton.click();
    await page.waitForTimeout(1000);

    // Step 10: Mock configured brokers endpoint to show new broker
    await page.route('/api/brokers/user/configured', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          brokers: [
            {
              key: 'alpaca',
              name: 'Alpaca',
              type: 'stock',
              authMethod: 'api-key',
              environment: 'testnet',
              configuredAt: new Date().toISOString(),
              lastVerified: new Date().toISOString()
            }
          ]
        })
      });
    });

    await page.reload();
    await page.waitForTimeout(1000);

    // Step 11: Navigate back to Settings
    await page.getByRole('button', { name: /settings/i }).click();
    await page.waitForTimeout(500);

    // Step 12: Verify broker appears in BrokerManagement
    await expect(page.getByText('Alpaca').first()).toBeVisible();
    await expect(page.getByText('Paper Trading')).toBeVisible();
    await expect(page.getByText('Stocks')).toBeVisible();

    // Step 13: Test connection from management view
    await page.route('/api/brokers/test/alpaca', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Connection successful',
          balance: {
            available: 100000.00
          }
        })
      });
    });

    const managementTestButton = page.getByRole('button', { name: /test.*connection/i }).first();
    await managementTestButton.click();
    await page.waitForTimeout(1000);

    await expect(page.getByText(/connection.*successful/i)).toBeVisible();
  });

  test('should complete full broker connection flow - crypto broker', async ({ page }) => {
    // Navigate to Settings
    await page.getByRole('button', { name: /settings/i }).click();
    await page.waitForTimeout(500);

    // Open wizard
    const configureButton = page.getByRole('button', { name: /configure.*broker|add.*broker/i }).first();
    await configureButton.click();
    await page.waitForTimeout(300);

    // Select crypto broker type
    await page.getByRole('button', { name: /crypto/i }).click();
    await page.waitForTimeout(300);

    // Select Coinbase Pro
    await page.getByText('Coinbase Pro').click();
    await page.waitForTimeout(300);

    // Select API Key auth
    await page.getByRole('button', { name: /api.*key/i }).click();
    await page.waitForTimeout(300);

    // Enter credentials
    await page.getByLabel(/api.*key|key/i).first().fill('coinbase-api-key');
    await page.getByLabel(/api.*secret|secret/i).first().fill('coinbase-api-secret');

    // Mock test connection
    await page.route('/api/brokers/test', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Coinbase Pro connection successful',
          balance: {
            available: 50000.00,
            total: 52000.00,
            currency: 'USD'
          }
        })
      });
    });

    // Test and save
    await page.getByRole('button', { name: /test.*connection/i }).first().click();
    await page.waitForTimeout(1000);

    await page.route('/api/brokers/configure', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Coinbase Pro configured successfully'
        })
      });
    });

    await page.getByRole('button', { name: /save|finish/i }).click();
    await page.waitForTimeout(1000);

    // Verify in BrokerManagement
    await page.route('/api/brokers/user/configured', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          brokers: [
            {
              key: 'coinbasepro',
              name: 'Coinbase Pro',
              type: 'crypto',
              authMethod: 'api-key',
              environment: 'live',
              configuredAt: new Date().toISOString()
            }
          ]
        })
      });
    });

    await page.reload();
    await page.waitForTimeout(1000);

    await page.getByRole('button', { name: /settings/i }).click();
    await page.waitForTimeout(500);

    await expect(page.getByText('Coinbase Pro').first()).toBeVisible();
    await expect(page.getByText('Crypto')).toBeVisible();
  });

  test('should handle broker disconnection', async ({ page }) => {
    // Mock configured broker
    await page.route('/api/brokers/user/configured', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          brokers: [
            {
              key: 'alpaca',
              name: 'Alpaca',
              type: 'stock',
              authMethod: 'api-key',
              environment: 'testnet',
              configuredAt: new Date().toISOString()
            }
          ]
        })
      });
    });

    // Navigate to Settings
    await page.getByRole('button', { name: /settings/i }).click();
    await page.waitForTimeout(1000);

    // Verify broker is visible
    await expect(page.getByText('Alpaca').first()).toBeVisible();

    // Mock disconnect endpoint
    await page.route('/api/brokers/user/alpaca', async route => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            message: 'Broker disconnected successfully'
          })
        });
      }
    });

    // Mock dialog confirmation
    page.on('dialog', dialog => dialog.accept());

    // Click disconnect button (trash icon)
    const deleteButton = page.locator('button:has(svg.lucide-trash-2)').first();
    await deleteButton.click();
    await page.waitForTimeout(500);

    // Update mock to return empty brokers list
    await page.route('/api/brokers/user/configured', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          brokers: []
        })
      });
    });

    await page.waitForTimeout(500);

    // Verify empty state appears
    await expect(page.getByText(/no.*brokers.*connected/i)).toBeVisible();
  });

  test('should handle connection test failure', async ({ page }) => {
    // Navigate to Settings and open wizard
    await page.getByRole('button', { name: /settings/i }).click();
    await page.waitForTimeout(500);

    const configureButton = page.getByRole('button', { name: /configure.*broker|add.*broker/i }).first();
    await configureButton.click();
    await page.waitForTimeout(300);

    // Select stock broker
    await page.getByRole('button', { name: /stock/i }).click();
    await page.waitForTimeout(300);

    await page.getByText('Alpaca').click();
    await page.waitForTimeout(300);

    await page.getByRole('button', { name: /api.*key/i }).click();
    await page.waitForTimeout(300);

    // Enter invalid credentials
    await page.getByLabel(/api.*key|key/i).first().fill('invalid-key');
    await page.getByLabel(/api.*secret|secret/i).first().fill('invalid-secret');

    // Mock failed test connection
    await page.route('/api/brokers/test', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          message: 'Invalid API credentials'
        })
      });
    });

    // Test connection
    await page.getByRole('button', { name: /test.*connection/i }).first().click();
    await page.waitForTimeout(1000);

    // Verify error message
    await expect(page.getByText(/invalid.*api.*credentials/i)).toBeVisible();
  });

  test('should display security alert when brokers configured', async ({ page }) => {
    // Mock configured broker
    await page.route('/api/brokers/user/configured', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          brokers: [
            {
              key: 'alpaca',
              name: 'Alpaca',
              type: 'stock',
              authMethod: 'api-key',
              environment: 'testnet',
              configuredAt: new Date().toISOString()
            }
          ]
        })
      });
    });

    // Navigate to Settings
    await page.getByRole('button', { name: /settings/i }).click();
    await page.waitForTimeout(1000);

    // Verify security alert
    await expect(page.getByText(/credentials.*encrypted/i)).toBeVisible();
    await expect(page.getByText(/AES-256-GCM/i)).toBeVisible();
    await expect(page.getByText(/paper.*trading.*testnet/i)).toBeVisible();
  });

  test('should show empty state when no brokers configured', async ({ page }) => {
    // Mock empty brokers list
    await page.route('/api/brokers/user/configured', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          brokers: []
        })
      });
    });

    // Navigate to Settings
    await page.getByRole('button', { name: /settings/i }).click();
    await page.waitForTimeout(1000);

    // Verify empty state
    await expect(page.getByText(/no.*brokers.*connected/i)).toBeVisible();
    await expect(page.getByText(/connect.*first.*broker/i)).toBeVisible();
  });
});

test.describe('Broker Management UI', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.addCookies([
      {
        name: 'connect.sid',
        value: 'test-session-id',
        domain: 'localhost',
        path: '/'
      }
    ]);

    await page.route('/auth/status', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            _id: 'test-user-id',
            discordId: '123456789',
            username: 'TestUser',
            discriminator: '1234',
            isAdmin: false
          }
        })
      });
    });

    await page.goto('/dashboard');
  });

  test('should display broker cards with correct information', async ({ page }) => {
    // Mock multiple configured brokers
    await page.route('/api/brokers/user/configured', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          brokers: [
            {
              key: 'alpaca',
              name: 'Alpaca',
              type: 'stock',
              authMethod: 'api-key',
              environment: 'testnet',
              configuredAt: new Date('2025-01-15').toISOString(),
              lastVerified: new Date('2025-01-16').toISOString()
            },
            {
              key: 'coinbasepro',
              name: 'Coinbase Pro',
              type: 'crypto',
              authMethod: 'api-key',
              environment: 'live',
              configuredAt: new Date('2025-01-14').toISOString(),
              lastVerified: new Date('2025-01-16').toISOString()
            }
          ]
        })
      });
    });

    await page.getByRole('button', { name: /settings/i }).click();
    await page.waitForTimeout(1000);

    // Verify both brokers are displayed
    await expect(page.getByText('Alpaca').first()).toBeVisible();
    await expect(page.getByText('Coinbase Pro').first()).toBeVisible();

    // Verify broker types
    await expect(page.getByText('Stocks')).toBeVisible();
    await expect(page.getByText('Crypto')).toBeVisible();

    // Verify environments
    await expect(page.getByText('Paper Trading')).toBeVisible();
    await expect(page.getByText('Live Trading')).toBeVisible();

    // Verify auth methods
    const apiKeyBadges = page.getByText('API Key');
    expect(await apiKeyBadges.count()).toBe(2);
  });

  test('should show spinning icon during connection test', async ({ page }) => {
    await page.route('/api/brokers/user/configured', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          brokers: [
            {
              key: 'alpaca',
              name: 'Alpaca',
              type: 'stock',
              authMethod: 'api-key',
              environment: 'testnet',
              configuredAt: new Date().toISOString()
            }
          ]
        })
      });
    });

    await page.getByRole('button', { name: /settings/i }).click();
    await page.waitForTimeout(1000);

    // Mock slow test connection
    await page.route('/api/brokers/test/alpaca', async route => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Connection successful'
        })
      });
    });

    const testButton = page.getByRole('button', { name: /test.*connection/i }).first();
    await testButton.click();

    // Verify loading state
    await expect(page.getByText('Testing...')).toBeVisible();

    // Verify button is disabled during test
    await expect(testButton).toBeDisabled();
  });
});
