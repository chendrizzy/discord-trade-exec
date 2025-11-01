const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const visualConfig = require('../visual-test.config');

/**
 * Visual Regression Tests - UI Components
 * Tests core UI components across responsive breakpoints with accessibility validation
 */

test.describe('UI Components - Visual Regression', () => {
  // Test each component across all breakpoints
  for (const [breakpointName, viewport] of Object.entries(visualConfig.breakpoints)) {
    test.describe(`${breakpointName} viewport (${viewport.width}x${viewport.height})`, () => {

      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto('/dashboard/components'); // Component showcase page

        // Wait for page to be fully loaded
        await page.waitForLoadState('networkidle');
        await page.waitForLoadState('domcontentloaded');
      });

      test('Button component - all variants', async ({ page }) => {
        const buttonSection = page.locator('[data-testid="button-showcase"]');
        await buttonSection.waitFor({ state: 'visible' });

        // Mask any dynamic content
        await expect(buttonSection).toHaveScreenshot(`button-variants-${breakpointName}.png`, {
          mask: visualConfig.dynamicElements.map(selector => page.locator(selector)),
          animations: 'disabled',
        });
      });

      test('Card component - all states', async ({ page }) => {
        const cardSection = page.locator('[data-testid="card-showcase"]');
        await cardSection.waitFor({ state: 'visible' });

        await expect(cardSection).toHaveScreenshot(`card-states-${breakpointName}.png`, {
          mask: visualConfig.dynamicElements.map(selector => page.locator(selector)),
          animations: 'disabled',
        });
      });

      test('Table component - data loaded', async ({ page }) => {
        const tableSection = page.locator('[data-testid="table-showcase"]');
        await tableSection.waitFor({ state: 'visible' });

        // Wait for table data to load
        await page.waitForSelector('.data-table-ready', { timeout: 5000 });

        await expect(tableSection).toHaveScreenshot(`table-loaded-${breakpointName}.png`, {
          mask: [
            ...visualConfig.dynamicElements.map(selector => page.locator(selector)),
            page.locator('[data-timestamp]'), // Mask timestamps
          ],
          animations: 'disabled',
        });
      });

      test('Badge component - all variants', async ({ page }) => {
        const badgeSection = page.locator('[data-testid="badge-showcase"]');
        await badgeSection.waitFor({ state: 'visible' });

        await expect(badgeSection).toHaveScreenshot(`badge-variants-${breakpointName}.png`);
      });

      test('Dialog component - open state', async ({ page }) => {
        // Open dialog
        await page.click('[data-testid="open-dialog-btn"]');
        const dialog = page.locator('[role="dialog"]');
        await dialog.waitFor({ state: 'visible' });

        // Screenshot full page with dialog overlay
        await expect(page).toHaveScreenshot(`dialog-open-${breakpointName}.png`, {
          fullPage: true,
          animations: 'disabled',
        });
      });

      test('Alert component - all severity levels', async ({ page }) => {
        const alertSection = page.locator('[data-testid="alert-showcase"]');
        await alertSection.waitFor({ state: 'visible' });

        await expect(alertSection).toHaveScreenshot(`alert-severities-${breakpointName}.png`);
      });
    });
  }
});

test.describe('UI Components - Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard/components');
    await page.waitForLoadState('networkidle');
  });

  test('Button components meet WCAG 2.1 AA', async ({ page }) => {
    const buttonSection = page.locator('[data-testid="button-showcase"]');
    await buttonSection.waitFor({ state: 'visible' });

    // Check accessibility with axe-core
    const accessibilityScanResults = await new AxeBuilder({ page })
      .include('[data-testid="button-showcase"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('Card components meet WCAG 2.1 AA', async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .include('[data-testid="card-showcase"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('Table components meet WCAG 2.1 AA', async ({ page }) => {
    await page.waitForSelector('.data-table-ready', { timeout: 5000 }).catch(() => {});

    const results = await new AxeBuilder({ page })
      .include('[data-testid="table-showcase"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('Dialog components meet WCAG 2.1 AA', async ({ page }) => {
    await page.click('[data-testid="open-dialog-btn"]').catch(() => {});
    await page.waitForSelector('[role="dialog"]', { state: 'visible' }).catch(() => {});

    const results = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('Full page accessibility scan', async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });
});

test.describe('UI Components - Interaction States', () => {
  test.use({ viewport: visualConfig.breakpoints.desktop });

  test('Button hover state', async ({ page }) => {
    await page.goto('/dashboard/components');
    const primaryButton = page.locator('[data-testid="primary-button"]').first();

    await primaryButton.hover();
    await expect(primaryButton).toHaveScreenshot('button-hover-state.png');
  });

  test('Button focus state', async ({ page }) => {
    await page.goto('/dashboard/components');
    const primaryButton = page.locator('[data-testid="primary-button"]').first();

    await primaryButton.focus();
    await expect(primaryButton).toHaveScreenshot('button-focus-state.png');
  });

  test('Input focus state', async ({ page }) => {
    await page.goto('/dashboard/components');
    const input = page.locator('input[type="text"]').first();

    await input.focus();
    await expect(input).toHaveScreenshot('input-focus-state.png');
  });

  test('Select dropdown open', async ({ page }) => {
    await page.goto('/dashboard/components');
    const select = page.locator('[data-testid="select-trigger"]').first();

    await select.click();
    await page.waitForSelector('[role="listbox"]', { state: 'visible' });

    await expect(page).toHaveScreenshot('select-dropdown-open.png', {
      fullPage: false,
    });
  });
});
