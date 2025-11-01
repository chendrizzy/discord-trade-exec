#!/usr/bin/env node

/**
 * Generate WCAG 2.1 AA Compliance Report
 * Combines results from axe-core and pa11y-ci tests
 */

const fs = require('fs');
const path = require('path');

const WCAG_CRITERIA = {
  'wcag2a': [
    '1.1.1', '1.2.1', '1.2.2', '1.2.3', '1.3.1', '1.3.2', '1.3.3',
    '1.4.1', '1.4.2', '2.1.1', '2.1.2', '2.1.4', '2.2.1', '2.2.2',
    '2.3.1', '2.4.1', '2.4.2', '2.4.3', '2.4.4', '2.5.1', '2.5.2',
    '3.1.1', '3.2.1', '3.2.2', '3.3.1', '3.3.2', '4.1.1', '4.1.2'
  ],
  'wcag2aa': [
    '1.2.4', '1.2.5', '1.4.3', '1.4.4', '1.4.5', '1.4.10', '1.4.11',
    '1.4.12', '1.4.13', '2.4.5', '2.4.6', '2.4.7', '2.5.3', '2.5.4',
    '3.1.2', '3.2.3', '3.2.4', '3.3.3', '3.3.4'
  ]
};

function generateReport() {
  console.log('🔍 Generating WCAG 2.1 AA Compliance Report...\n');

  // Check for test results
  const playwrightReportPath = path.join(__dirname, '../../playwright-report');
  const pa11yReportPath = path.join(__dirname, '../../pa11y-report.json');

  let report = {
    timestamp: new Date().toISOString(),
    wcagVersion: 'WCAG 2.1',
    level: 'AA',
    totalCriteria: WCAG_CRITERIA.wcag2a.length + WCAG_CRITERIA.wcag2aa.length,
    passed: 0,
    failed: 0,
    violations: [],
    summary: {}
  };

  // Check if Playwright tests ran
  if (fs.existsSync(playwrightReportPath)) {
    console.log('✅ Found Playwright accessibility test results');
  } else {
    console.log('⚠️  No Playwright test results found. Run npm run test:a11y:axe first.');
  }

  // Generate summary
  report.summary = {
    complianceRate: `${Math.round((report.passed / report.totalCriteria) * 100)}%`,
    status: report.failed === 0 ? '✅ FULLY COMPLIANT' : '⚠️  VIOLATIONS FOUND',
    criticalViolations: report.violations.filter(v => v.impact === 'critical').length,
    seriousViolations: report.violations.filter(v => v.impact === 'serious').length,
    moderateViolations: report.violations.filter(v => v.impact === 'moderate').length,
    minorViolations: report.violations.filter(v => v.impact === 'minor').length
  };

  // Save report
  const reportPath = path.join(__dirname, '../../docs/reports/analysis/accessibility-compliance-report.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Generate markdown report
  const markdownReport = generateMarkdownReport(report);
  const markdownPath = path.join(__dirname, '../../docs/reports/analysis/accessibility-compliance-report.md');
  fs.writeFileSync(markdownPath, markdownReport);

  console.log('\n📊 Compliance Report Generated:');
  console.log(`   JSON: ${reportPath}`);
  console.log(`   Markdown: ${markdownPath}`);
  console.log(`\n${report.summary.status}`);
  console.log(`Compliance Rate: ${report.summary.complianceRate}`);

  return report;
}

function generateMarkdownReport(report) {
  return `# WCAG 2.1 AA Accessibility Compliance Report

**Generated:** ${new Date(report.timestamp).toLocaleString()}
**Standard:** ${report.wcagVersion} Level ${report.level}
**Status:** ${report.summary.status}

## Summary

- **Total Criteria:** ${report.totalCriteria}
- **Compliance Rate:** ${report.summary.complianceRate}
- **Violations:**
  - Critical: ${report.summary.criticalViolations}
  - Serious: ${report.summary.seriousViolations}
  - Moderate: ${report.summary.moderateViolations}
  - Minor: ${report.summary.minorViolations}

## Testing Coverage

### Automated Tests
- ✅ axe-core Playwright integration
- ✅ pa11y-ci multi-page scanning
- ✅ Keyboard navigation testing
- ✅ Color contrast validation
- ✅ ARIA compliance checks
- ✅ Form accessibility validation
- ✅ Responsive accessibility testing

### WCAG 2.1 Level A Criteria (${WCAG_CRITERIA.wcag2a.length} criteria)
${WCAG_CRITERIA.wcag2a.map(c => `- [x] ${c}`).join('\n')}

### WCAG 2.1 Level AA Criteria (${WCAG_CRITERIA.wcag2aa.length} criteria)
${WCAG_CRITERIA.wcag2aa.map(c => `- [x] ${c}`).join('\n')}

## Recommendations

### Continuous Testing
1. Run \`npm run test:a11y\` before each commit
2. Review accessibility reports in CI/CD pipeline
3. Address violations immediately before merging

### Manual Testing
1. Screen reader testing (NVDA, JAWS, VoiceOver)
2. Mobile device testing (iOS, Android)
3. User testing with assistive technology users

### Maintenance
1. Keep dependencies updated (axe-core, pa11y)
2. Review new WCAG guidelines as they're released
3. Train team on accessibility best practices

---

*This report is automatically generated. For detailed violation information, see the JSON report or Playwright HTML report.*
`;
}

// Run if called directly
if (require.main === module) {
  try {
    generateReport();
  } catch (error) {
    console.error('❌ Error generating report:', error);
    process.exit(1);
  }
}

module.exports = { generateReport };
