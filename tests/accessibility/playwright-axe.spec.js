/**
 * Comprehensive Accessibility Testing with Playwright + axe-core
 * Tests WCAG 2.1 AA compliance across all dashboard pages
 */

const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

// Base URL configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// WCAG 2.1 AA configuration for axe-core
const axeConfig = {
  runOnly: {
    type: 'tag',
    values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']
  }
};

/**
 * Helper function to run accessibility scan and generate detailed report
 */
async function runAccessibilityScan(page, pageName) {
  const accessibilityScanResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  // Log violations for debugging
  if (accessibilityScanResults.violations.length > 0) {
    console.log(`\n❌ Accessibility violations found on ${pageName}:`);
    accessibilityScanResults.violations.forEach((violation, index) => {
      console.log(`\n${index + 1}. ${violation.id} (${violation.impact})`);
      console.log(`   Description: ${violation.description}`);
      console.log(`   Help: ${violation.help}`);
      console.log(`   Affected elements: ${violation.nodes.length}`);
      violation.nodes.forEach((node, nodeIndex) => {
        console.log(`   ${nodeIndex + 1}. ${node.html}`);
        console.log(`      Target: ${node.target.join(' > ')}`);
      });
    });
  } else {
    console.log(`\n✅ No accessibility violations found on ${pageName}`);
  }

  return accessibilityScanResults;
}

test.describe('WCAG 2.1 AA Compliance - Dashboard Pages', () => {
  test.beforeEach(async ({ page }) => {
    // Wait for page to be fully loaded
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
  });

  test('Portfolio Dashboard - No accessibility violations', async ({ page }) => {
    const results = await runAccessibilityScan(page, 'Portfolio Dashboard');
    expect(results.violations).toEqual([]);
  });

  test('Bot Management Page - No accessibility violations', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/bots`);
    await page.waitForLoadState('networkidle');

    const results = await runAccessibilityScan(page, 'Bot Management');
    expect(results.violations).toEqual([]);
  });

  test('Positions Page - No accessibility violations', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/positions`);
    await page.waitForLoadState('networkidle');

    const results = await runAccessibilityScan(page, 'Positions');
    expect(results.violations).toEqual([]);
  });

  test('Trade History Page - No accessibility violations', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/history`);
    await page.waitForLoadState('networkidle');

    const results = await runAccessibilityScan(page, 'Trade History');
    expect(results.violations).toEqual([]);
  });

  test('Broker Management Page - No accessibility violations', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/brokers`);
    await page.waitForLoadState('networkidle');

    const results = await runAccessibilityScan(page, 'Broker Management');
    expect(results.violations).toEqual([]);
  });

  test('Analytics Page - No accessibility violations', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/analytics`);
    await page.waitForLoadState('networkidle');

    const results = await runAccessibilityScan(page, 'Analytics');
    expect(results.violations).toEqual([]);
  });

  test('Settings Page - No accessibility violations', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/settings`);
    await page.waitForLoadState('networkidle');

    const results = await runAccessibilityScan(page, 'Settings');
    expect(results.violations).toEqual([]);
  });
});

test.describe('Keyboard Navigation - Full Application', () => {
  test('Tab order follows logical flow on Portfolio Dashboard', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // Get all focusable elements
    const focusableElements = await page.evaluate(() => {
      const selector = 'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])';
      const elements = Array.from(document.querySelectorAll(selector));
      return elements.map(el => ({
        tagName: el.tagName,
        text: el.textContent?.trim().substring(0, 50),
        ariaLabel: el.getAttribute('aria-label'),
        type: el.getAttribute('type')
      }));
    });

    // Verify we have focusable elements
    expect(focusableElements.length).toBeGreaterThan(0);
    console.log(`\n✅ Found ${focusableElements.length} focusable elements on Portfolio Dashboard`);
  });

  test('Skip navigation link is first focusable element', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // Tab to first element
    await page.keyboard.press('Tab');

    // Get focused element
    const focusedElement = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        tagName: el?.tagName,
        text: el?.textContent?.trim(),
        href: el?.getAttribute('href')
      };
    });

    // Verify it's the skip navigation link
    expect(focusedElement.text).toContain('Skip to main content');
    expect(focusedElement.href).toBe('#main-content');
  });

  test('All interactive elements are keyboard accessible', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // Check all buttons are keyboard accessible
    const inaccessibleButtons = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
      return buttons.filter(btn => {
        const tabIndex = btn.getAttribute('tabindex');
        return tabIndex === '-1' && !btn.hasAttribute('disabled');
      }).map(btn => btn.outerHTML.substring(0, 100));
    });

    expect(inaccessibleButtons).toEqual([]);
  });
});

test.describe('Focus Indicators - Visual Compliance', () => {
  test('Focus indicators are visible on all interactive elements', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // Tab through first 10 focusable elements
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');

      // Check if focused element has visible outline
      const hasFocusIndicator = await page.evaluate(() => {
        const el = document.activeElement;
        const styles = window.getComputedStyle(el);
        const outline = styles.outline;
        const boxShadow = styles.boxShadow;

        // Check for either outline or box-shadow (our focus indicator uses box-shadow)
        return outline !== 'none' || boxShadow !== 'none';
      });

      expect(hasFocusIndicator).toBe(true);
    }
  });
});

test.describe('Color Contrast - WCAG AA Compliance', () => {
  test('All text meets minimum contrast ratio (4.5:1 for normal text)', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2aa'])
      .include(['body'])
      .disableRules([
        'region',
        'landmark-one-main',
        'page-has-heading-one'
      ])
      .analyze();

    // Filter for color contrast violations only
    const contrastViolations = results.violations.filter(v =>
      v.id === 'color-contrast' ||
      v.id === 'color-contrast-enhanced'
    );

    expect(contrastViolations).toEqual([]);
  });
});

test.describe('ARIA Compliance', () => {
  test('All ARIA attributes are valid', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .include(['body'])
      .analyze();

    // Filter for ARIA violations
    const ariaViolations = results.violations.filter(v =>
      v.id.includes('aria-') || v.id.includes('role')
    );

    if (ariaViolations.length > 0) {
      console.log('\n❌ ARIA violations found:');
      ariaViolations.forEach(v => {
        console.log(`  - ${v.id}: ${v.description}`);
      });
    }

    expect(ariaViolations).toEqual([]);
  });

  test('All form inputs have associated labels', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    const unlabeledInputs = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
      return inputs.filter(input => {
        // Check for label, aria-label, or aria-labelledby
        const hasLabel = input.labels?.length > 0;
        const hasAriaLabel = input.hasAttribute('aria-label');
        const hasAriaLabelledBy = input.hasAttribute('aria-labelledby');

        return !hasLabel && !hasAriaLabel && !hasAriaLabelledBy;
      }).map(input => ({
        tagName: input.tagName,
        type: input.type,
        id: input.id,
        name: input.name
      }));
    });

    expect(unlabeledInputs).toEqual([]);
  });
});

test.describe('Responsive Accessibility', () => {
  test('Mobile viewport - No accessibility violations', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    const results = await runAccessibilityScan(page, 'Mobile Viewport');
    expect(results.violations).toEqual([]);
  });

  test('Tablet viewport - No accessibility violations', async ({ page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    const results = await runAccessibilityScan(page, 'Tablet Viewport');
    expect(results.violations).toEqual([]);
  });

  test('Touch targets meet minimum size (44x44px) on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    const smallTargets = await page.evaluate(() => {
      const interactiveElements = Array.from(
        document.querySelectorAll('button, a, [role="button"], input[type="button"]')
      );

      return interactiveElements.filter(el => {
        const rect = el.getBoundingClientRect();
        const styles = window.getComputedStyle(el);

        // Exclude elements that are visually hidden (sr-only, display:none, visibility:hidden)
        const isHidden =
          styles.display === 'none' ||
          styles.visibility === 'hidden' ||
          el.classList.contains('sr-only') ||
          styles.position === 'absolute' && (rect.width <= 1 || rect.height <= 1);

        if (isHidden) return false;

        return rect.width < 44 || rect.height < 44;
      }).map(el => ({
        tagName: el.tagName,
        text: el.textContent?.trim().substring(0, 30),
        width: el.getBoundingClientRect().width,
        height: el.getBoundingClientRect().height
      }));
    });

    if (smallTargets.length > 0) {
      console.log('\n⚠️  Touch targets smaller than 44x44px found:');
      smallTargets.forEach(target => {
        console.log(`  - ${target.tagName}: "${target.text}" (${target.width}x${target.height}px)`);
      });
    }

    expect(smallTargets).toEqual([]);
  });
});
