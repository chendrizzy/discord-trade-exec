# Visual Testing Suite

Comprehensive visual regression, accessibility, and responsive testing using Playwright.

## Quick Start

```bash
# Run all visual tests
npm run test:visual

# Update baselines (after intentional UI changes)
npm run test:visual:update

# View test report
npx playwright show-report
```

## Directory Structure

```
tests/visual/
├── README.md                    # This file
├── visual-test.config.js        # Visual testing configuration
├── components/                  # UI component tests
│   └── ui-components.visual.spec.js
├── pages/                       # Full page tests
│   └── dashboard-pages.visual.spec.js
├── responsive/                  # Responsive layout tests
│   └── responsive-layouts.visual.spec.js
├── helpers/                     # Shared testing utilities
│   └── accessibility-helpers.js
└── __screenshots__/             # Visual regression baselines (gitignored)
    ├── [test-file]/
    │   └── [test-name]/
    │       ├── baseline.png
    │       ├── actual.png       # (on failure)
    │       └── diff.png         # (on failure)
```

## Test Types

### 1. Component Visual Tests

**File**: `components/ui-components.visual.spec.js`

Tests individual UI components:
- Buttons (all variants, states)
- Cards
- Tables
- Badges
- Dialogs
- Alerts
- Interaction states (hover, focus, active)

**Coverage**: 4 breakpoints × 6 component types × 3 states = ~72 test cases

### 2. Page Visual Tests

**File**: `pages/dashboard-pages.visual.spec.js`

Tests full dashboard pages:
- Dashboard home
- Broker management
- Portfolio overview
- Risk settings
- Billing settings
- Loading states
- Error states

**Coverage**: 4 breakpoints × 5 pages + edge cases = ~30 test cases

### 3. Responsive Layout Tests

**File**: `responsive/responsive-layouts.visual.spec.js`

Tests responsive behavior:
- Breakpoint transitions
- Navigation (mobile hamburger ↔ desktop nav)
- Data tables (card view ↔ table view)
- Chart scaling
- Modal positioning
- Typography scaling
- Touch target sizes

**Coverage**: 4 pages × 3 transitions + component tests = ~20 test cases

### 4. Accessibility Tests

**All test files** - Integrated accessibility validation

- WCAG 2.1 Level AA compliance
- Color contrast (4.5:1 minimum)
- Keyboard navigation
- Screen reader compatibility
- ARIA attributes
- Semantic HTML

**Coverage**: Full page audits + component-specific tests

## Running Tests

### By Suite

```bash
npm run test:visual:components     # Component tests only
npm run test:visual:pages          # Page tests only
npm run test:visual:responsive     # Responsive tests only
npm run test:visual:accessibility  # Accessibility only
```

### By Browser

```bash
npx playwright test tests/visual --project=chromium
npx playwright test tests/visual --project=firefox
npx playwright test tests/visual --project=webkit
```

### Interactive Debugging

```bash
npm run test:visual:ui      # UI mode (interactive)
npm run test:visual:debug   # Debug mode (step through)
```

### Specific Test

```bash
npx playwright test --grep="Button component"
npx playwright test tests/visual/components/ui-components.visual.spec.js
```

## Configuration

### Visual Regression Settings

**File**: `visual-test.config.js`

```javascript
{
  breakpoints: {
    mobile: { width: 375, height: 667 },    // iPhone SE
    tablet: { width: 768, height: 1024 },   // iPad
    desktop: { width: 1920, height: 1080 }, // Full HD
    ultrawide: { width: 2560, height: 1440 } // 2K
  },
  thresholds: {
    strict: 0.001,   // 0.1% difference
    normal: 0.01,    // 1% difference
    relaxed: 0.05    // 5% difference
  },
  dynamicElements: [
    '[data-timestamp]',
    '[data-live-price]',
    '.loading-spinner'
  ]
}
```

### Playwright Settings

**File**: `playwright.config.js` (root)

```javascript
{
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,  // 1% tolerance
      threshold: 0.2,
      animations: 'disabled'
    }
  }
}
```

## Baseline Management

### Creating Baselines

```bash
# Create all baselines
npm run test:visual:update

# Create baselines for specific test
npx playwright test tests/visual/components/ui-components.visual.spec.js --update-snapshots
```

### Reviewing Changes

1. Run tests: `npm run test:visual`
2. Open report: `npx playwright show-report`
3. Review visual diffs
4. If intentional: `npm run test:visual:update`

### Baseline Storage

- **Location**: `tests/visual/__screenshots__/`
- **Git**: Included in repository (not gitignored)
- **Format**: PNG images
- **Naming**: `{test-name}-{breakpoint}.png`

## Accessibility Helpers

### Available Utilities

**File**: `helpers/accessibility-helpers.js`

```javascript
const {
  setupAccessibilityTesting,
  checkAccessibility,
  generateAccessibilityReport,
  checkKeyboardNavigation,
  checkColorContrast,
  checkAriaAttributes,
  comprehensiveAccessibilityAudit
} = require('./helpers/accessibility-helpers');
```

### Usage Example

```javascript
test('Comprehensive accessibility', async ({ page }) => {
  await page.goto('/dashboard');

  const results = await comprehensiveAccessibilityAudit(page);

  expect(results.passed).toBe(true);
  expect(results.tests.axeCore.passed).toBe(true);
  expect(results.tests.keyboardNavigation.passed).toBe(true);
  expect(results.tests.colorContrast.passed).toBe(true);
});
```

## CI/CD Integration

### GitHub Actions

**Workflow**: `.github/workflows/visual-regression.yml`

Runs on:
- ✅ Pull requests (all visual tests)
- ✅ Pushes to main (all visual tests)
- ✅ Manual dispatch (can update baselines)

**Parallel Execution**: 4 shards for faster CI

### Artifacts

Failed tests upload:
- HTML report
- Visual diff images
- Test traces

## Best Practices

### 1. Mask Dynamic Content

```javascript
await expect(page).toHaveScreenshot('dashboard.png', {
  mask: [
    page.locator('[data-timestamp]'),
    page.locator('[data-live-price]')
  ]
});
```

### 2. Wait for Stability

```javascript
await page.waitForLoadState('networkidle');
await page.waitForSelector('.chart-loaded');
await page.waitForTimeout(500); // Allow layout reflow
```

### 3. Test Specific Elements

```javascript
const component = page.locator('[data-testid="portfolio-chart"]');
await expect(component).toHaveScreenshot('chart.png');
```

### 4. Use Data Attributes

```html
<div data-testid="portfolio-table">
  <!-- Easier to target in tests -->
</div>
```

### 5. Consistent Test Data

```javascript
await page.route('**/api/**', route => {
  route.fulfill({
    body: JSON.stringify({ /* fixed test data */ })
  });
});
```

## Troubleshooting

### Flaky Tests

**Symptoms**: Tests pass/fail randomly

**Solutions**:
```javascript
// Increase wait time
await page.waitForLoadState('networkidle', { timeout: 10000 });

// Wait for fonts
await page.evaluate(() => document.fonts.ready);

// Increase threshold
maxDiffPixelRatio: 0.02
```

### Font Rendering Differences

**Symptoms**: Different rendering on macOS vs Linux

**Solution**: Use Docker for consistency
```bash
docker run --rm -v $(pwd):/work -w /work mcr.microsoft.com/playwright:latest npx playwright test
```

### Large Baseline Files

**Solution**: Enable compression (already configured)
```javascript
// Playwright automatically compresses PNGs
```

## Metrics

### Current Coverage

- ✅ **122 visual test cases** across all suites
- ✅ **4 breakpoints** tested
- ✅ **3 browsers** (Chrome, Firefox, Safari)
- ✅ **WCAG 2.1 Level AA** compliance checks

### Performance

- **Execution time**: ~10-15 minutes (full suite)
- **CI parallel shards**: 4 (reduces to ~4 minutes)
- **Baseline size**: ~50 MB (all screenshots)

## Contributing

### Adding New Tests

1. Create test file in appropriate directory
2. Follow naming convention: `*.visual.spec.js`
3. Use helpers from `visual-test.config.js`
4. Run `npm run test:visual:update` to create baselines
5. Verify tests pass: `npm run test:visual`
6. Commit test file + baselines

### Updating Baselines

1. Make UI changes
2. Run tests to see failures
3. Review diffs carefully
4. If intentional: `npm run test:visual:update`
5. Commit updated baselines

## Resources

- [Full Documentation](../../docs/guides/visual-testing-guide.md)
- [Playwright Docs](https://playwright.dev/docs/test-snapshots)
- [axe-core Rules](https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md)
- [WCAG Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
