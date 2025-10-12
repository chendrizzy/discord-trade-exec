---
name: ui:design-review
description: Conduct comprehensive design review using browser-mcp accessibility tools
allowed-tools: Task, mcp__browser-mcp__browser_snapshot, mcp__browser-mcp__browser_screenshot, mcp__browser-mcp__browser_get_console_logs, mcp__browser-mcp__browser_navigate, mcp__browser-mcp__browser_resize, Read, Write
---

# UI Design Review Command

## Purpose
Trigger comprehensive design review of the current web application using the design-review agent with browser-mcp tools for superior accessibility analysis.

## Usage
```bash
/ui:design-review [url]
```

**Arguments:**
- `[url]` (optional): Specific URL to review. If not provided, reviews current page or asks user for URL.

## Examples
```bash
# Review current page (if browser-mcp already connected)
/ui:design-review

# Review specific URL
/ui:design-review https://discord-trade-exec-production.up.railway.app

# Review specific route
/ui:design-review https://discord-trade-exec-production.up.railway.app/dashboard
```

## What This Command Does

### 1. Initial Setup
- Checks if browser-mcp is connected
- Navigates to target URL if provided
- Verifies page loaded successfully

### 2. Desktop Analysis (1440px)
- Captures accessibility snapshot
- Takes full-page screenshot
- Checks console for errors
- Analyzes visual hierarchy
- Reviews component elevation
- Validates spacing and typography

### 3. Responsive Testing
- Resizes to tablet viewport (768px width)
- Captures tablet screenshot
- Resizes to mobile viewport (375px width)
- Captures mobile screenshot
- Validates navigation patterns

### 4. Accessibility Audit
- Reviews semantic HTML structure
- Checks ARIA implementation
- Validates heading hierarchy
- Assesses keyboard navigation
- Reviews focus states

### 5. Design System Compliance
- Loads design principles from `/context/design-principles.md` (if exists)
- Loads style guide from `/context/style-guide.md` (if exists)
- Compares actual implementation against standards
- Identifies deviations and inconsistencies

### 6. Report Generation
- Creates comprehensive markdown report
- Includes screenshots as evidence
- Provides specific line numbers for issues
- Suggests actionable fixes with code examples
- Prioritizes issues by severity

## Output

Generates a detailed report saved to:
```
.claude/reports/design-review-[timestamp].md
```

Report includes:
- Executive summary
- Visual design assessment with screenshots
- Accessibility analysis with semantic structure
- Responsive design evaluation
- Technical health check (console errors, performance)
- Design system compliance check
- Prioritized recommendations with code examples
- Acceptance criteria checklist

## Integration with Workflow

### When to Use
- After implementing new UI features
- Before creating pull requests with visual changes
- When user reports design or accessibility issues
- During regular design audits
- When modernizing existing interfaces

### Complementary Commands
- `/build` - Build and deploy before review
- `/test` - Run tests before review
- `/improve` - Apply recommendations from review

## Implementation

The command delegates to the `design-review` agent, which:
1. Uses `mcp__browser-mcp__browser_snapshot` for semantic analysis
2. Uses `mcp__browser-mcp__browser_screenshot` for visual evidence
3. Uses `mcp__browser-mcp__browser_get_console_logs` for error checking
4. Uses `mcp__browser-mcp__browser_navigate` for page navigation
5. Uses `mcp__browser-mcp__browser_resize` for responsive testing

## Success Criteria

A successful design review includes:
- ✅ Screenshots captured at all viewports (desktop, tablet, mobile)
- ✅ Accessibility snapshot analyzed
- ✅ Console logs checked (no critical errors)
- ✅ Design system compliance verified
- ✅ Specific recommendations provided with code
- ✅ Issues prioritized by severity
- ✅ Report saved with timestamp

## Common Issues Detected

### Visual Design
- Poor contrast ratios (WCAG failures)
- Inconsistent typography scale
- Inadequate spacing and breathing room
- Flat, outdated appearance
- Weak elevation on cards
- Poor hover state feedback

### Accessibility
- Missing ARIA labels
- Improper heading hierarchy
- Non-semantic HTML structure
- Poor keyboard navigation
- Missing focus indicators

### Responsive Design
- Mobile navigation overlapping content
- Text too small on mobile
- Buttons too close together
- Horizontal scrolling issues
- Viewport breakpoint problems

### Technical
- Console errors or warnings
- Hard-coded values instead of CSS variables
- Unused or duplicate CSS
- Performance issues
- Layout shifts

## Browser-MCP Advantages

Unlike Playwright, browser-mcp provides:
- **Better Accessibility Analysis**: Direct access to accessibility tree
- **Semantic Structure**: Full HTML structure with ARIA annotations
- **Live Console Access**: Real-time error and warning capture
- **Simpler API**: More intuitive for design reviews
- **Better Screenshots**: Higher quality visual captures

## Example Output

```markdown
# Design Review Report
Generated: 2025-10-10 14:30:00
Page: https://discord-trade-exec-production.up.railway.app

## Executive Summary
Overall assessment: GOOD with improvements needed
- ✅ Modern CSS design system implemented
- ✅ High contrast text (95% lightness)
- ✅ Proper card elevation
- ⚠️  Minor spacing inconsistencies
- ⚠️  Some ARIA labels missing

## Visual Design Assessment

### Strengths
- Near-white text (95% lightness) on dark slate background provides excellent contrast
- Shadow-xl elevation on cards creates proper depth perception
- Text-4xl font-extrabold headings establish clear hierarchy
- Generous spacing (space-y-8) improves readability

### Issues Found

1. **Inconsistent Icon Button Sizes**
   - **Severity**: Medium
   - **Location**: src/dashboard/components/Navigation.jsx:66
   - **Evidence**: [Screenshot: navigation-desktop.png]
   - **Description**: Logout button using h-4 w-4 while menu icons use h-5 w-5
   - **Fix**: Standardize to h-5 w-5 for all navigation icons
   ```jsx
   // Change line 66 from:
   <X className="h-4 w-4" />
   // To:
   <X className="h-5 w-5" />
   ```

[... additional issues ...]

## Recommendations

### Priority 1 (Critical)
✅ All resolved

### Priority 2 (High)
1. Standardize icon sizes across navigation components

### Priority 3 (Medium)
1. Add ARIA labels to mobile menu button
2. Improve focus indicators on card hover states
```

---

**This command provides modern, accessibility-focused design reviews using browser-mcp's superior tooling.**
