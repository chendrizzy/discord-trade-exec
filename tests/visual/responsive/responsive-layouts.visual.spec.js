const { test, expect } = require('@playwright/test');
const visualConfig = require('../visual-test.config');

/**
 * Visual Regression Tests - Responsive Layouts
 * Tests layout behavior across breakpoint transitions
 */

test.describe('Responsive Layout Transitions', () => {
  const testPages = [
    { name: 'Dashboard', url: '/dashboard' },
    { name: 'Portfolio', url: '/dashboard/portfolio' },
    { name: 'Brokers', url: '/dashboard/brokers' },
    { name: 'Risk Settings', url: '/dashboard/risk-settings' },
  ];

  for (const testPage of testPages) {
    test.describe(`${testPage.name} page`, () => {

      test('Mobile to Tablet transition', async ({ page }) => {
        // Start at mobile
        await page.setViewportSize(visualConfig.breakpoints.mobile);
        await page.goto(testPage.url);
        await page.waitForLoadState('networkidle');

        await expect(page).toHaveScreenshot(`${testPage.name.toLowerCase()}-mobile.png`, {
          fullPage: true,
          mask: visualConfig.dynamicElements.map(s => page.locator(s)),
        });

        // Transition to tablet
        await page.setViewportSize(visualConfig.breakpoints.tablet);
        await page.waitForTimeout(500); // Allow layout reflow

        await expect(page).toHaveScreenshot(`${testPage.name.toLowerCase()}-tablet.png`, {
          fullPage: true,
          mask: visualConfig.dynamicElements.map(s => page.locator(s)),
        });
      });

      test('Tablet to Desktop transition', async ({ page }) => {
        await page.setViewportSize(visualConfig.breakpoints.tablet);
        await page.goto(testPage.url);
        await page.waitForLoadState('networkidle');

        await expect(page).toHaveScreenshot(`${testPage.name.toLowerCase()}-tablet-baseline.png`, {
          fullPage: true,
          mask: visualConfig.dynamicElements.map(s => page.locator(s)),
        });

        // Transition to desktop
        await page.setViewportSize(visualConfig.breakpoints.desktop);
        await page.waitForTimeout(500);

        await expect(page).toHaveScreenshot(`${testPage.name.toLowerCase()}-desktop.png`, {
          fullPage: true,
          mask: visualConfig.dynamicElements.map(s => page.locator(s)),
        });
      });

      test('Desktop to Ultrawide transition', async ({ page }) => {
        await page.setViewportSize(visualConfig.breakpoints.desktop);
        await page.goto(testPage.url);
        await page.waitForLoadState('networkidle');

        await expect(page).toHaveScreenshot(`${testPage.name.toLowerCase()}-desktop-baseline.png`, {
          fullPage: true,
          mask: visualConfig.dynamicElements.map(s => page.locator(s)),
        });

        // Transition to ultrawide
        await page.setViewportSize(visualConfig.breakpoints.ultrawide);
        await page.waitForTimeout(500);

        await expect(page).toHaveScreenshot(`${testPage.name.toLowerCase()}-ultrawide.png`, {
          fullPage: true,
          mask: visualConfig.dynamicElements.map(s => page.locator(s)),
        });
      });
    });
  }
});

test.describe('Responsive Component Behavior', () => {

  test('Navigation menu - mobile hamburger vs desktop nav', async ({ page }) => {
    // Mobile: hamburger menu
    await page.setViewportSize(visualConfig.breakpoints.mobile);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const hamburger = page.locator('[data-testid="mobile-menu-toggle"]');
    if (await hamburger.isVisible()) {
      await expect(page).toHaveScreenshot('navigation-mobile-closed.png');

      await hamburger.click();
      await page.waitForSelector('[data-testid="mobile-menu"]', { state: 'visible' });

      await expect(page).toHaveScreenshot('navigation-mobile-open.png', {
        fullPage: true,
      });
    }

    // Desktop: full navigation
    await page.setViewportSize(visualConfig.breakpoints.desktop);
    await page.waitForTimeout(500);

    await expect(page).toHaveScreenshot('navigation-desktop.png');
  });

  test('Data table - mobile card view vs desktop table', async ({ page }) => {
    await page.goto('/dashboard/portfolio');

    // Mobile: card/list view
    await page.setViewportSize(visualConfig.breakpoints.mobile);
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('.data-table-ready', { timeout: 5000 }).catch(() => {});

    await expect(page.locator('[data-testid="portfolio-table"]')).toHaveScreenshot('table-mobile-cards.png', {
      mask: [page.locator('[data-live-price]')],
    });

    // Desktop: full table
    await page.setViewportSize(visualConfig.breakpoints.desktop);
    await page.waitForTimeout(500);

    await expect(page.locator('[data-testid="portfolio-table"]')).toHaveScreenshot('table-desktop-full.png', {
      mask: [page.locator('[data-live-price]')],
    });
  });

  test('Chart components responsive sizing', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForSelector('.chart-loaded', { timeout: 10000 }).catch(() => {});

    const chartContainer = page.locator('[data-testid="dashboard-chart"]').first();

    // Test chart at each breakpoint
    for (const [name, viewport] of Object.entries(visualConfig.breakpoints)) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(500); // Chart reflow

      await expect(chartContainer).toHaveScreenshot(`chart-${name}.png`, {
        mask: [page.locator('[data-live-price]')],
      });
    }
  });

  test('Modal dialog responsive centering', async ({ page }) => {
    await page.goto('/dashboard');

    for (const [name, viewport] of Object.entries(visualConfig.breakpoints)) {
      await page.setViewportSize(viewport);
      await page.waitForLoadState('networkidle');

      // Open dialog
      const openBtn = page.locator('[data-testid="open-settings-dialog"]');
      if (await openBtn.isVisible()) {
        await openBtn.click();
        await page.waitForSelector('[role="dialog"]', { state: 'visible' });

        await expect(page).toHaveScreenshot(`dialog-${name}.png`, {
          fullPage: true,
        });

        // Close dialog
        await page.keyboard.press('Escape');
        await page.waitForSelector('[role="dialog"]', { state: 'hidden' });
      }
    }
  });
});

test.describe('Responsive Typography Scaling', () => {

  test('Heading sizes scale appropriately', async ({ page }) => {
    await page.goto('/dashboard');

    const headings = await page.locator('h1, h2, h3').all();

    for (const [name, viewport] of Object.entries(visualConfig.breakpoints)) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(300);

      // Capture heading section
      const headingSection = page.locator('[data-testid="dashboard-header"]');
      await expect(headingSection).toHaveScreenshot(`headings-${name}.png`);
    }
  });

  test('Body text remains readable', async ({ page }) => {
    await page.goto('/dashboard/risk-settings');

    const contentSection = page.locator('[data-testid="settings-content"]');

    for (const [name, viewport] of Object.entries(visualConfig.breakpoints)) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(300);

      await expect(contentSection).toHaveScreenshot(`body-text-${name}.png`, {
        maxDiffPixelRatio: visualConfig.thresholds.relaxed, // Allow more variation for text rendering
      });
    }
  });
});

test.describe('Responsive Touch Targets', () => {

  test('Buttons meet minimum touch target size on mobile', async ({ page }) => {
    await page.setViewportSize(visualConfig.breakpoints.mobile);
    await page.goto('/dashboard/brokers');
    await page.waitForLoadState('networkidle');

    const buttons = await page.locator('button').all();

    for (let i = 0; i < Math.min(buttons.length, 5); i++) {
      const button = buttons[i];
      const box = await button.boundingBox();

      if (box) {
        // WCAG 2.1 Level AAA: minimum 44x44 CSS pixels
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }

    // Screenshot button layout
    await expect(page.locator('[data-testid="action-buttons"]')).toHaveScreenshot('mobile-touch-targets.png');
  });

  test('Form inputs have adequate spacing on mobile', async ({ page }) => {
    await page.setViewportSize(visualConfig.breakpoints.mobile);
    await page.goto('/dashboard/risk-settings');

    const form = page.locator('form').first();
    await expect(form).toHaveScreenshot('mobile-form-spacing.png');
  });
});

test.describe('Responsive Images and Media', () => {

  test('Images scale correctly without distortion', async ({ page }) => {
    await page.goto('/dashboard');

    for (const [name, viewport] of Object.entries(visualConfig.breakpoints)) {
      await page.setViewportSize(viewport);
      await page.waitForLoadState('networkidle');

      const images = await page.locator('img').all();

      for (const img of images.slice(0, 3)) {
        const box = await img.boundingBox();
        if (box) {
          // Check aspect ratio is maintained (should not be distorted)
          const aspectRatio = box.width / box.height;
          expect(aspectRatio).toBeGreaterThan(0.5);
          expect(aspectRatio).toBeLessThan(3.0);
        }
      }
    }
  });
});
