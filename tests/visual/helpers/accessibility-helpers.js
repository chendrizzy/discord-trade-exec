const { injectAxe, checkA11y, getViolations } = require('axe-playwright');

/**
 * Accessibility Testing Helpers
 * Utilities for WCAG 2.1 compliance testing
 */

/**
 * Setup accessibility testing on a page
 */
async function setupAccessibilityTesting(page) {
  await injectAxe(page);
}

/**
 * Check accessibility with custom configuration
 */
async function checkAccessibility(page, options = {}) {
  const defaultOptions = {
    detailedReport: true,
    detailedReportOptions: {
      html: true,
    },
    rules: {
      // WCAG 2.1 Level AA rules
      'color-contrast': { enabled: true },
      'image-alt': { enabled: true },
      'label': { enabled: true },
      'link-name': { enabled: true },
      'button-name': { enabled: true },
      'aria-valid-attr': { enabled: true },
      'aria-required-attr': { enabled: true },
      'landmark-one-main': { enabled: true },
      'page-has-heading-one': { enabled: true },
      'region': { enabled: true },
    },
    includedImpacts: ['critical', 'serious', 'moderate'],
  };

  const mergedOptions = { ...defaultOptions, ...options };

  try {
    await checkA11y(page, options.selector || null, mergedOptions);
    return { passed: true, violations: [] };
  } catch (error) {
    const violations = await getViolations(page, options.selector || null, mergedOptions);
    return { passed: false, violations };
  }
}

/**
 * Generate accessibility report
 */
async function generateAccessibilityReport(page, reportName) {
  const violations = await getViolations(page);

  const report = {
    timestamp: new Date().toISOString(),
    url: page.url(),
    reportName,
    summary: {
      totalViolations: violations.length,
      critical: violations.filter(v => v.impact === 'critical').length,
      serious: violations.filter(v => v.impact === 'serious').length,
      moderate: violations.filter(v => v.impact === 'moderate').length,
      minor: violations.filter(v => v.impact === 'minor').length,
    },
    violations: violations.map(v => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      help: v.help,
      helpUrl: v.helpUrl,
      nodes: v.nodes.length,
      tags: v.tags,
    })),
  };

  return report;
}

/**
 * Check keyboard navigation
 */
async function checkKeyboardNavigation(page) {
  const results = {
    passed: true,
    issues: [],
  };

  // Check tab order
  const focusableElements = await page.$$('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])');

  for (let i = 0; i < Math.min(focusableElements.length, 10); i++) {
    await page.keyboard.press('Tab');
    const activeElement = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        tagName: el.tagName,
        visible: el.offsetWidth > 0 && el.offsetHeight > 0,
        ariaLabel: el.getAttribute('aria-label'),
        role: el.getAttribute('role'),
      };
    });

    // Verify focus is visible
    if (!activeElement.visible) {
      results.passed = false;
      results.issues.push({
        type: 'hidden-focus',
        element: activeElement.tagName,
        description: 'Focused element is not visible',
      });
    }

    // Verify interactive elements have accessible names
    if (['BUTTON', 'A', 'INPUT'].includes(activeElement.tagName)) {
      const hasAccessibleName = activeElement.ariaLabel || activeElement.role;
      if (!hasAccessibleName) {
        results.issues.push({
          type: 'missing-label',
          element: activeElement.tagName,
          description: 'Interactive element missing accessible name',
        });
      }
    }
  }

  return results;
}

/**
 * Check color contrast
 */
async function checkColorContrast(page) {
  const contrastIssues = await page.evaluate(() => {
    const issues = [];
    const textElements = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, a, button, label');

    textElements.forEach(el => {
      const styles = window.getComputedStyle(el);
      const color = styles.color;
      const backgroundColor = styles.backgroundColor;
      const fontSize = parseFloat(styles.fontSize);

      // Parse RGB values
      const parseRgb = (rgb) => {
        const match = rgb.match(/\d+/g);
        return match ? match.map(Number) : [0, 0, 0];
      };

      const textRgb = parseRgb(color);
      const bgRgb = parseRgb(backgroundColor);

      // Calculate relative luminance
      const getLuminance = ([r, g, b]) => {
        const [rs, gs, bs] = [r, g, b].map(c => {
          c = c / 255;
          return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
      };

      const textLum = getLuminance(textRgb);
      const bgLum = getLuminance(bgRgb);

      const ratio = (Math.max(textLum, bgLum) + 0.05) / (Math.min(textLum, bgLum) + 0.05);

      // WCAG AA: 4.5:1 for normal text, 3:1 for large text (18pt+)
      const requiredRatio = fontSize >= 18 ? 3 : 4.5;

      if (ratio < requiredRatio) {
        issues.push({
          element: el.tagName,
          text: el.textContent.substring(0, 50),
          contrast: ratio.toFixed(2),
          required: requiredRatio,
          fontSize: `${fontSize}px`,
        });
      }
    });

    return issues.slice(0, 10); // Limit to first 10 issues
  });

  return {
    passed: contrastIssues.length === 0,
    issues: contrastIssues,
  };
}

/**
 * Check ARIA attributes
 */
async function checkAriaAttributes(page) {
  const ariaIssues = await page.evaluate(() => {
    const issues = [];
    const elementsWithAria = document.querySelectorAll('[role], [aria-label], [aria-labelledby], [aria-describedby]');

    elementsWithAria.forEach(el => {
      const role = el.getAttribute('role');
      const ariaLabel = el.getAttribute('aria-label');
      const ariaLabelledby = el.getAttribute('aria-labelledby');

      // Check if role is valid
      const validRoles = ['button', 'checkbox', 'dialog', 'link', 'tab', 'tabpanel', 'navigation', 'main', 'complementary', 'banner', 'contentinfo'];
      if (role && !validRoles.includes(role)) {
        issues.push({
          type: 'invalid-role',
          role,
          element: el.tagName,
        });
      }

      // Check if aria-labelledby references exist
      if (ariaLabelledby) {
        const referencedElement = document.getElementById(ariaLabelledby);
        if (!referencedElement) {
          issues.push({
            type: 'invalid-labelledby',
            ariaLabelledby,
            element: el.tagName,
          });
        }
      }
    });

    return issues;
  });

  return {
    passed: ariaIssues.length === 0,
    issues: ariaIssues,
  };
}

/**
 * Comprehensive accessibility audit
 */
async function comprehensiveAccessibilityAudit(page, options = {}) {
  await setupAccessibilityTesting(page);

  const results = {
    timestamp: new Date().toISOString(),
    url: page.url(),
    passed: true,
    tests: {},
  };

  // Axe-core automated tests
  const axeResults = await checkAccessibility(page, options);
  results.tests.axeCore = axeResults;
  if (!axeResults.passed) results.passed = false;

  // Keyboard navigation
  const keyboardResults = await checkKeyboardNavigation(page);
  results.tests.keyboardNavigation = keyboardResults;
  if (!keyboardResults.passed) results.passed = false;

  // Color contrast
  const contrastResults = await checkColorContrast(page);
  results.tests.colorContrast = contrastResults;
  if (!contrastResults.passed) results.passed = false;

  // ARIA attributes
  const ariaResults = await checkAriaAttributes(page);
  results.tests.ariaAttributes = ariaResults;
  if (!ariaResults.passed) results.passed = false;

  return results;
}

module.exports = {
  setupAccessibilityTesting,
  checkAccessibility,
  generateAccessibilityReport,
  checkKeyboardNavigation,
  checkColorContrast,
  checkAriaAttributes,
  comprehensiveAccessibilityAudit,
};
