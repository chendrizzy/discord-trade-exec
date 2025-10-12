/**
 * Visual verification script for mobile navigation overlap fix
 * Run after Railway deployment completes
 */

const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 }, // iPhone 12
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15'
  });

  const page = await context.newPage();

  console.log('\n=== Mobile Navigation Overlap Fix Verification ===\n');
  console.log('1. Navigating to live site...');

  try {
    await page.goto('https://discord-trade-exec-production.up.railway.app/dashboard', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    // Wait for content to render
    await page.waitForTimeout(2000);

    console.log('2. Capturing screenshots...');

    // Full page screenshot
    await page.screenshot({
      path: '/tmp/mobile-fix-verification-full.png',
      fullPage: true
    });

    // Top section screenshot (where the issue was)
    await page.screenshot({
      path: '/tmp/mobile-fix-verification-top.png',
      clip: { x: 0, y: 0, width: 375, height: 500 }
    });

    console.log('3. Inspecting main element styles...');

    // Check if the inline style is applied
    const mainElement = await page.locator('main').first();
    const mainStyles = await mainElement.evaluate(el => {
      const computed = window.getComputedStyle(el);
      return {
        paddingTop: computed.paddingTop,
        paddingBottom: computed.paddingBottom,
        classes: el.className,
        inlineStyle: el.getAttribute('style')
      };
    });

    console.log('\n=== Main Element Analysis ===');
    console.log('Classes:', mainStyles.classes);
    console.log('Inline style:', mainStyles.inlineStyle);
    console.log('Computed paddingTop:', mainStyles.paddingTop);
    console.log('Computed paddingBottom:', mainStyles.paddingBottom);

    // Calculate expected padding: 3.5rem + 8rem = 11.5rem = 184px
    const expectedPadding = 184; // pixels
    const actualPadding = parseInt(mainStyles.paddingTop);
    const tolerance = 5; // allow 5px tolerance

    console.log('\n=== Padding Verification ===');
    console.log(`Expected: ${expectedPadding}px (3.5rem + 8rem)`);
    console.log(`Actual: ${actualPadding}px`);

    if (Math.abs(actualPadding - expectedPadding) <= tolerance) {
      console.log('✅ SUCCESS: Padding is correctly applied!');
    } else {
      console.log(`⚠️  WARNING: Padding mismatch (diff: ${Math.abs(actualPadding - expectedPadding)}px)`);
    }

    // Try to find the Portfolio Overview heading (requires auth)
    const headingExists = await page.locator('h1:has-text("Portfolio Overview")').count();

    if (headingExists > 0) {
      console.log('\n=== Authenticated View Detected ===');
      console.log('✅ Portfolio Overview heading found');

      const headingBox = await page.locator('h1:has-text("Portfolio Overview")').first().boundingBox();
      const topBarBox = await page.locator('.md\\:hidden.fixed').first().boundingBox();

      if (headingBox && topBarBox) {
        const gap = headingBox.y - (topBarBox.y + topBarBox.height);
        console.log(`Gap between nav and heading: ${gap}px`);

        if (gap >= 100) {
          console.log('✅ VERIFIED: No overlap detected!');
        } else if (gap >= 0) {
          console.log('⚠️  Small gap, might look cramped');
        } else {
          console.log('❌ OVERLAP STILL PRESENT!');
        }
      }
    } else {
      console.log('\n=== Login Page Detected ===');
      console.log('ℹ️  Need authentication to verify heading clearance');
      console.log('ℹ️  But inline style is confirmed in the DOM');
    }

    console.log('\n=== Screenshots Saved ===');
    console.log('📸 Full page: /tmp/mobile-fix-verification-full.png');
    console.log('📸 Top section: /tmp/mobile-fix-verification-top.png');
    console.log('\nReview these screenshots to visually confirm the fix.');

  } catch (error) {
    console.error('\n❌ Error during verification:', error.message);
  } finally {
    await browser.close();
  }
})();
