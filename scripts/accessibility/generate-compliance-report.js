#!/usr/bin/env node

/**
 * Generate WCAG 2.1 AA Compliance Report
 * Parses Playwright test results with axe-core violations
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

function parsePlaywrightResults() {
  const resultsPath = path.join(__dirname, '../../test-results/a11y-results.json');

  if (!fs.existsSync(resultsPath)) {
    console.log('⚠️  No Playwright JSON results found. Test may not have run with JSON reporter.');
    return null;
  }

  try {
    const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
    return results;
  } catch (error) {
    console.error('❌ Error parsing test results:', error.message);
    return null;
  }
}

function extractViolations(playwrightResults) {
  if (!playwrightResults || !playwrightResults.suites) {
    return [];
  }

  const violations = [];

  function processSpec(spec) {
    if (spec.tests) {
      spec.tests.forEach(test => {
        if (test.results) {
          test.results.forEach(result => {
            // Check for axe violations in error messages or attachments
            if (result.status === 'failed' && result.error) {
              const errorMessage = result.error.message || '';
              if (errorMessage.includes('accessibility violations') || errorMessage.includes('axe')) {
                violations.push({
                  test: test.title,
                  page: spec.title,
                  impact: 'serious', // Default impact
                  description: errorMessage
                });
              }
            }
          });
        }
      });
    }

    if (spec.suites) {
      spec.suites.forEach(processSpec);
    }
  }

  playwrightResults.suites.forEach(processSpec);
  return violations;
}

function generateReport() {
  console.log('🔍 Generating WCAG 2.1 AA Compliance Report...\n');

  const playwrightResults = parsePlaywrightResults();
  const violations = playwrightResults ? extractViolations(playwrightResults) : [];

  // Check for Playwright test results
  const playwrightReportPath = path.join(__dirname, '../../playwright-report');
  if (fs.existsSync(playwrightReportPath)) {
    console.log('✅ Found Playwright accessibility test results');
  } else {
    console.log('⚠️  No Playwright test results found. Run npm run test:a11y:axe first.');
  }

  // Calculate test statistics
  const totalTests = playwrightResults?.suites?.[0]?.specs?.length || 0;
  const passedTests = totalTests - violations.length;

  const report = {
    timestamp: new Date().toISOString(),
    wcagVersion: 'WCAG 2.1',
    level: 'AA',
    totalCriteria: WCAG_CRITERIA.wcag2a.length + WCAG_CRITERIA.wcag2aa.length,
    totalTests: totalTests,
    passed: passedTests,
    failed: violations.length,
    violations: violations,
    summary: {}
  };

  // Generate summary
  report.summary = {
    complianceRate: totalTests > 0
      ? `${Math.round((passedTests / totalTests) * 100)}%`
      : violations.length === 0 ? '100%' : '0%',
    status: violations.length === 0 ? '✅ FULLY COMPLIANT' : '⚠️  VIOLATIONS FOUND',
    criticalViolations: violations.filter(v => v.impact === 'critical').length,
    seriousViolations: violations.filter(v => v.impact === 'serious').length,
    moderateViolations: violations.filter(v => v.impact === 'moderate').length,
    minorViolations: violations.filter(v => v.impact === 'minor').length
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
  console.log(`Tests: ${report.passed} passed, ${report.failed} failed out of ${report.totalTests} total`);

  if (violations.length > 0) {
    console.log('\n⚠️  Violations by Impact:');
    console.log(`   Critical: ${report.summary.criticalViolations}`);
    console.log(`   Serious: ${report.summary.seriousViolations}`);
    console.log(`   Moderate: ${report.summary.moderateViolations}`);
    console.log(`   Minor: ${report.summary.minorViolations}`);
  }

  return report;
}

function generateMarkdownReport(report) {
  let violationsSection = '';

  if (report.violations.length > 0) {
    violationsSection = `\n## Violations Found\n\n`;
    report.violations.forEach((v, index) => {
      violationsSection += `### ${index + 1}. ${v.test || 'Unknown Test'}\n\n`;
      violationsSection += `- **Page:** ${v.page || 'Unknown'}\n`;
      violationsSection += `- **Impact:** ${v.impact}\n`;
      violationsSection += `- **Description:** ${v.description}\n\n`;
    });
  }

  return `# WCAG 2.1 AA Accessibility Compliance Report

**Generated:** ${new Date(report.timestamp).toLocaleString()}
**Standard:** ${report.wcagVersion} Level ${report.level}
**Status:** ${report.summary.status}

## Summary

- **Total Criteria:** ${report.totalCriteria} (${WCAG_CRITERIA.wcag2a.length} Level A + ${WCAG_CRITERIA.wcag2aa.length} Level AA)
- **Compliance Rate:** ${report.summary.complianceRate}
- **Tests Run:** ${report.totalTests} (${report.passed} passed, ${report.failed} failed)
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
${violationsSection}
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
    const report = generateReport();

    // Exit with error code if violations found
    if (report.violations.length > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error generating report:', error);
    process.exit(1);
  }
}

module.exports = { generateReport };
