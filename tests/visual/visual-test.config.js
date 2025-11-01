/**
 * Visual Testing Configuration
 * Defines responsive breakpoints, accessibility rules, and test patterns
 */

module.exports = {
  // Responsive breakpoints for visual testing
  breakpoints: {
    mobile: { width: 375, height: 667, deviceScaleFactor: 2 }, // iPhone SE
    tablet: { width: 768, height: 1024, deviceScaleFactor: 2 }, // iPad
    desktop: { width: 1920, height: 1080, deviceScaleFactor: 1 }, // Full HD
    ultrawide: { width: 2560, height: 1440, deviceScaleFactor: 1 }, // 2K
  },

  // Visual regression thresholds
  thresholds: {
    strict: 0.001, // 0.1% difference
    normal: 0.01, // 1% difference
    relaxed: 0.05, // 5% difference
  },

  // Elements to mask in screenshots (dynamic content)
  dynamicElements: [
    '[data-timestamp]',
    '[data-live-price]',
    '[data-market-status]',
    '.loading-spinner',
    '.skeleton-loader',
  ],

  // Accessibility testing configuration
  accessibility: {
    // Rules to check (WCAG 2.1 Level AA)
    rules: {
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

    // Elements to exclude from accessibility testing
    exclude: [
      '#third-party-widget',
      '.external-embed',
    ],

    // Impact levels to report
    impactLevels: ['critical', 'serious', 'moderate'],
  },

  // Animation settings for consistent screenshots
  animations: {
    disabled: true,
    reducedMotion: 'reduce',
  },

  // Wait conditions before screenshots
  waitConditions: {
    networkIdle: true,
    domContentLoaded: true,
    customSelectors: [
      '.chart-loaded',
      '.data-table-ready',
    ],
  },

  // Cross-browser testing priorities
  browsers: {
    critical: ['chromium', 'firefox', 'webkit'],
    optional: ['Mobile Chrome', 'Mobile Safari'],
  },
};
