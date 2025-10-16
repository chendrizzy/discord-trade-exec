// External dependencies
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 }, // iPhone 12
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });

  const page = await context.newPage();

  console.log('Navigating to live site...');
  await page.goto('https://discord-trade-exec-production.up.railway.app/dashboard', {
    waitUntil: 'networkidle',
    timeout: 30000
  });

  // Wait a bit for any animations
  await page.waitForTimeout(2000);

  // Capture full page screenshot
  console.log('Capturing full page screenshot...');
  await page.screenshot({
    path: '/tmp/mobile-current-state.png',
    fullPage: true
  });

  // Capture just the top portion to see the overlap clearly
  console.log('Capturing top section screenshot...');
  await page.screenshot({
    path: '/tmp/mobile-top-section.png',
    clip: { x: 0, y: 0, width: 375, height: 400 }
  });

  // Get computed styles of key elements
  console.log('\nAnalyzing element positions...');

  const mobileTopBar = await page.locator('.md\\:hidden.fixed.top-0').first();
  const mainContent = await page.locator('main').first();
  const portfolioHeading = await page.locator('h1:has-text("Portfolio Overview")').first();

  // Get bounding boxes and styles
  const topBarBox = await mobileTopBar.boundingBox();
  const mainBox = await mainContent.boundingBox();
  const headingBox = await portfolioHeading.boundingBox();

  const mainStyles = await mainContent.evaluate(el => {
    const styles = window.getComputedStyle(el);
    return {
      paddingTop: styles.paddingTop,
      paddingBottom: styles.paddingBottom,
      position: styles.position,
      top: styles.top,
      zIndex: styles.zIndex
    };
  });

  const topBarStyles = await mobileTopBar.evaluate(el => {
    const styles = window.getComputedStyle(el);
    return {
      height: styles.height,
      position: styles.position,
      zIndex: styles.zIndex,
      top: styles.top
    };
  });

  const headingStyles = await portfolioHeading.evaluate(el => {
    const styles = window.getComputedStyle(el);
    return {
      marginTop: styles.marginTop,
      marginBottom: styles.marginBottom,
      fontSize: styles.fontSize,
      position: styles.position
    };
  });

  console.log('\n=== MOBILE TOP BAR ===');
  console.log('Position:', topBarBox);
  console.log('Styles:', topBarStyles);

  console.log('\n=== MAIN CONTENT ===');
  console.log('Position:', mainBox);
  console.log('Styles:', mainStyles);

  console.log('\n=== PORTFOLIO HEADING ===');
  console.log('Position:', headingBox);
  console.log('Styles:', headingStyles);

  // Calculate if there's overlap
  if (topBarBox && headingBox) {
    const topBarBottom = topBarBox.y + topBarBox.height;
    const headingTop = headingBox.y;
    const gap = headingTop - topBarBottom;

    console.log('\n=== OVERLAP ANALYSIS ===');
    console.log(`Top bar bottom: ${topBarBottom}px`);
    console.log(`Heading top: ${headingTop}px`);
    console.log(`Gap between: ${gap}px`);

    if (gap < 0) {
      console.log('❌ OVERLAP DETECTED! Heading is overlapping by', Math.abs(gap), 'px');
    } else if (gap < 20) {
      console.log('⚠️  WARNING: Very small gap, might look cramped');
    } else {
      console.log('✅ No overlap, gap looks good');
    }
  }

  // Check if the pt-48 class is actually applied
  const mainClasses = await mainContent.getAttribute('class');
  console.log('\n=== MAIN ELEMENT CLASSES ===');
  console.log(mainClasses);
  console.log('Has pt-48:', mainClasses.includes('pt-48'));

  await browser.close();

  console.log('\n✅ Screenshots saved to:');
  console.log('   - /tmp/mobile-current-state.png (full page)');
  console.log('   - /tmp/mobile-top-section.png (top 400px)');
})();
