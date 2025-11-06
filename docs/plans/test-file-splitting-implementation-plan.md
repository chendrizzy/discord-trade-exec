# Test File Splitting Implementation Plan

**Date:** 2025-11-06
**Status:** 📋 **READY FOR EXECUTION**
**Priority:** Short-Term Sprint Task #2

---

## Objective

Split `tests/integration/routes/auth.test.js` (3026 lines, 107 tests) into 6 focused test files to reduce memory footprint by ~80% per file.

---

## File Structure Analysis

### Original File Structure
```
auth.test.js (3026 lines, 107 tests)
├── Lines 1-34: Header comments + imports
├── Lines 35-155: Main describe block setup (beforeAll, afterAll, beforeEach)
├── Lines 157-407: OAuth2 Authorization & Callback
├── Lines 408-538: Token Refresh Mechanism
├── Lines 539-616: Session Management
├── Lines 617-798: Security & Edge Cases (part 1)
├── Lines 799-1111: Broker Status & Management
├── Lines 1112-1271: Token Refresh Edge Cases
├── Lines 1273-1426: Broker Connection State Transitions
├── Lines 1427-1567: OAuth2 Rate Limiting
├── Lines 1568-2698: MFA Management (8 describe blocks)
├── Lines 2727-3026: Security Tests (part 2 - 3 describe blocks)
└── Line 3026: Closing brace
```

---

## Split File Specifications

### File 1: `auth-oauth-flow.test.js`

**Location**: `tests/integration/routes/auth/auth-oauth-flow.test.js`
**Lines**: 157-407
**Tests**: ~15
**Estimated Size**: ~260 lines

**Content Structure**:
```javascript
/**
 * Integration Test: OAuth2 Authorization & Callback Flow
 * Extracted from auth.test.js lines 157-407
 */

'use strict';

// [Copy imports from lines 20-33, adjust paths ../../../ → ../../../../]

describe('OAuth2 Authorization & Callback Flow', () => {
  let app;
  let sessionStore;

  // [Copy beforeAll from lines 39-109, adjust import paths]
  // [Copy afterAll from lines 111-126, adjust import paths]
  // [Copy beforeEach from lines 128-154]

  describe('Broker OAuth2 Authorization Flow', () => {
    // [Copy tests from lines 157-217]
  });

  describe('OAuth2 Callback Handling', () => {
    // [Copy tests from lines 219-406]
  });
});
```

**Import Path Changes**:
- `require('../../../src/...') ` → `require('../../../../src/...')`
- `require('../../../src/routes/api/auth')` → `require('../../../../src/routes/api/auth')`
- `require('../../../src/middleware/errorHandler')` → `require('../../../../src/middleware/errorHandler')`
- `require('../../../src/middleware/rateLimiter')` → `require('../../../../src/middleware/rateLimiter')`

---

### File 2: `auth-token-refresh.test.js`

**Location**: `tests/integration/routes/auth/auth-token-refresh.test.js`
**Lines**: 408-538 + 1112-1271
**Tests**: ~12
**Estimated Size**: ~290 lines

**Content Structure**:
```javascript
/**
 * Integration Test: OAuth2 Token Refresh Mechanisms
 * Extracted from auth.test.js lines 408-538, 1112-1271
 */

'use strict';

// [Same imports as File 1]

describe('OAuth2 Token Refresh', () => {
  let app;
  let sessionStore;

  // [Same setup as File 1]

  describe('Token Refresh Mechanism', () => {
    // [Copy tests from lines 408-537]
  });

  describe('OAuth2 Token Refresh Edge Cases - US3-T13', () => {
    // [Copy tests from lines 1112-1271]
  });
});
```

---

### File 3: `auth-session-management.test.js`

**Location**: `tests/integration/routes/auth/auth-session-management.test.js`
**Lines**: 539-616
**Tests**: ~5
**Estimated Size**: ~90 lines

**Content Structure**:
```javascript
/**
 * Integration Test: Session Management
 * Extracted from auth.test.js lines 539-616
 */

'use strict';

// [Same imports]

describe('Session Management', () => {
  let app;
  let sessionStore;

  // [Same setup]

  describe('Session Lifecycle', () => {
    // [Copy tests from lines 539-615]
  });
});
```

---

### File 4: `auth-security.test.js`

**Location**: `tests/integration/routes/auth/auth-security.test.js`
**Lines**: 617-798 + 1427-1567 + 2727-3026
**Tests**: ~21
**Estimated Size**: ~530 lines

**Content Structure**:
```javascript
/**
 * Integration Test: Security, Performance & Edge Cases
 * Extracted from auth.test.js lines 617-798, 1427-1567, 2727-3026
 */

'use strict';

// [Same imports]

describe('OAuth2 Security & Performance', () => {
  let app;
  let sessionStore;

  // [Same setup]

  describe('Security & Edge Cases', () => {
    // [Copy tests from lines 617-755]
  });

  describe('Performance', () => {
    // [Copy tests from lines 757-797]
  });

  describe('OAuth2 Rate Limiting & Error Recovery - US3-T15', () => {
    // [Copy tests from lines 1427-1566]
  });

  describe('Priority Test Gap 1: Token Expiry During Operation', () => {
    // [Copy tests from lines 2727-2810]
  });

  describe('Priority Test Gap 2: Provider Outage Graceful Degradation', () => {
    // [Copy tests from lines 2812-2905]
  });

  describe('Priority Test Gap 3: Rate Limiting Multi-Device Scenarios', () => {
    // [Copy tests from lines 2907-3025]
  });
});
```

---

### File 5: `auth-broker-status.test.js`

**Location**: `tests/integration/routes/auth/auth-broker-status.test.js`
**Lines**: 799-1111
**Tests**: ~15
**Estimated Size**: ~330 lines

**Content Structure**:
```javascript
/**
 * Integration Test: Broker Status Queries
 * Extracted from auth.test.js lines 799-1111
 */

'use strict';

// [Same imports]

describe('Broker Status & Management', () => {
  let app;
  let sessionStore;

  // [Same setup]

  describe('Broker Status Queries', () => {
    // [Copy tests from lines 799-1110]
  });
});
```

---

### File 6: `auth-broker-management.test.js`

**Location**: `tests/integration/routes/auth/auth-broker-management.test.js`
**Lines**: 1273-1426 + 1568-2698
**Tests**: ~39
**Estimated Size**: ~1060 lines

**Content Structure**:
```javascript
/**
 * Integration Test: Broker Connection & MFA Management
 * Extracted from auth.test.js lines 1273-1426, 1568-2698
 */

'use strict';

// [Same imports]

describe('Broker Connection & MFA Management', () => {
  let app;
  let sessionStore;

  // [Same setup]

  describe('Broker Connection State Transitions - US3-T14', () => {
    // [Copy tests from lines 1273-1425]
  });

  describe('MFA Session Management - US3-T16', () => {
    // [Copy tests from lines 1568-1747]
  });

  describe('MFA Routes - Setup & Enable', () => {
    // [Copy tests from lines 1749-1913]
  });

  describe('MFA Routes - Disable', () => {
    // [Copy tests from lines 1915-2058]
  });

  describe('MFA Routes - Backup Codes', () => {
    // [Copy tests from lines 2060-2156]
  });

  describe('MFA Routes - Status & Verify', () => {
    // [Copy tests from lines 2158-2330]
  });

  describe('MFA Routes - Edge Cases', () => {
    // [Copy tests from lines 2332-2442]
  });

  describe('MFA Routes - Additional Verify Edge Cases', () => {
    // [Copy tests from lines 2444-2697]
  });
});
```

---

## Implementation Steps

### Step 1: Backup Original File
```bash
cp tests/integration/routes/auth.test.js tests/integration/routes/auth.test.js.SPLITTING_BACKUP
```

### Step 2: Create Directory Structure
```bash
mkdir -p tests/integration/routes/auth
```

### Step 3: Extract Common Header Template

Create a template file for reuse:
```bash
# Extract lines 1-34 (header) + 39-154 (setup)
head -154 tests/integration/routes/auth.test.js | tail -116 > /tmp/auth-test-header-template.txt
```

### Step 4: Create Each Split File

For each file, use this pattern:
```bash
# Example for auth-oauth-flow.test.js
{
  # Header + imports
  head -33 tests/integration/routes/auth.test.js
  echo ""
  echo "describe('OAuth2 Authorization & Callback Flow', () => {"
  echo "  let app;"
  echo "  let sessionStore;"
  echo ""
  # Setup (lines 39-154)
  sed -n '39,154p' tests/integration/routes/auth.test.js | sed 's|../../../|../../../../|g'
  echo ""
  # Test content (lines 157-406)
  sed -n '157,406p' tests/integration/routes/auth.test.js
  echo "});"
} > tests/integration/routes/auth/auth-oauth-flow.test.js
```

**Repeat for all 6 files with appropriate line ranges.**

### Step 5: Adjust Import Paths

For all new files:
```bash
cd tests/integration/routes/auth/
for file in *.test.js; do
  sed -i '' 's|../../../src/|../../../../src/|g' "$file"
  sed -i '' 's|../../../src/|../../../../src/|g' "$file"
done
```

### Step 6: Validate Each File

Run each file individually:
```bash
npm test tests/integration/routes/auth/auth-oauth-flow.test.js
npm test tests/integration/routes/auth/auth-token-refresh.test.js
npm test tests/integration/routes/auth/auth-session-management.test.js
npm test tests/integration/routes/auth/auth-security.test.js
npm test tests/integration/routes/auth/auth-broker-status.test.js
npm test tests/integration/routes/auth/auth-broker-management.test.js
```

### Step 7: Validate Combined Test Count

```bash
# Count total tests in original file
grep -c "^\s*it(" tests/integration/routes/auth.test.js
# Expected: 107

# Count tests across all split files
grep -c "^\s*it(" tests/integration/routes/auth/*.test.js | awk -F: '{sum+=$2} END {print sum}'
# Expected: 107 (same as original)
```

### Step 8: Update Test Scripts (Optional)

Add convenience scripts to package.json:
```json
{
  "scripts": {
    "test:auth-oauth": "jest tests/integration/routes/auth/auth-oauth-flow.test.js",
    "test:auth-token": "jest tests/integration/routes/auth/auth-token-refresh.test.js",
    "test:auth-session": "jest tests/integration/routes/auth/auth-session-management.test.js",
    "test:auth-security": "jest tests/integration/routes/auth/auth-security.test.js",
    "test:auth-broker-status": "jest tests/integration/routes/auth/auth-broker-status.test.js",
    "test:auth-broker-mgmt": "jest tests/integration/routes/auth/auth-broker-management.test.js",
    "test:auth-all": "jest tests/integration/routes/auth/"
  }
}
```

### Step 9: Archive Original File

Only after all validations pass:
```bash
mv tests/integration/routes/auth.test.js tests/integration/routes/auth.test.js.ARCHIVED
```

### Step 10: Update Test Infrastructure

Update batched testing script to use new structure:
```javascript
// In scripts/test-batched.js
// Ensure it discovers the new auth/ subdirectory
const testFiles = findTestFiles('tests');  // Already recursive
```

---

## Validation Checklist

- [ ] All 6 files created in `tests/integration/routes/auth/`
- [ ] Import paths adjusted (`../../../` → `../../../../`)
- [ ] Each file runs individually without errors
- [ ] Test count preserved: 107 tests total across all files
- [ ] No test failures introduced by splitting
- [ ] Memory usage reduced (< 600 lines per file)
- [ ] Batched testing includes new files
- [ ] Original file backed up as `.ARCHIVED`

---

## Expected Memory Impact

### Before
- **Single File**: 3026 lines, ~300-500MB memory during execution
- **Jest Context**: All 107 tests loaded simultaneously
- **GC Pressure**: High - large context accumulation

### After
- **6 Smaller Files**: ~260-1060 lines each, ~50-150MB per file
- **Jest Context**: Isolated - each file independent
- **GC Pressure**: Low - clean context between files

**Total Savings**: ~300-400MB per batched test run

---

## Rollback Plan

If issues arise:
```bash
# Restore original file
cp tests/integration/routes/auth.test.js.SPLITTING_BACKUP tests/integration/routes/auth.test.js

# Remove split files
rm -rf tests/integration/routes/auth/

# Rerun tests to verify
npm test tests/integration/routes/auth.test.js
```

---

## Success Criteria

✅ All 107 tests pass when run individually
✅ All 107 tests pass when run collectively (`npm test tests/integration/routes/auth/`)
✅ Memory usage reduced in batched testing
✅ No test behavior changes
✅ Test execution time improved

---

## Next Steps After Splitting

1. Apply same pattern to `auth middleware.test.js` (1659 lines)
2. Apply same pattern to `PolarBillingProvider.test.js` (1587 lines)
3. Implement Priority 2: Optimize beforeEach() cleanup
4. Implement Priority 3: Add explicit GC triggers

---

**Last Updated:** 2025-11-06
**Status:** Ready for Execution
**Estimated Time**: 2-3 hours
**Risk Level**: LOW (with proper backup and validation)
