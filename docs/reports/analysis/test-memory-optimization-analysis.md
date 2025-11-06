# Test Memory Optimization Analysis

**Date:** 2025-11-06
**Status:** 🔄 **IN PROGRESS**
**Priority:** Short-Term Sprint Task #1

---

## Executive Summary

Analyzed the 20 largest test files to identify memory optimization opportunities. Primary focus on `auth.test.js` (3026 lines) which shows patterns of heavy initialization, large test suite in single file, and repeated database cleanup operations.

**Key Findings:**
- **Largest Test File**: `auth.test.js` with 3026 lines, 107 test cases, 21 describe blocks
- **Memory-Heavy Pattern**: Full Express app + MongoDB session store + Passport initialization in `beforeAll()`
- **Repeated Operations**: Database clearing + session store clearing in `beforeEach()` (executed 107 times)
- **Optimization Potential**: Split into focused test suites, implement lazy loading, optimize cleanup

---

## Largest Test Files Analysis

### Top 10 Memory-Heavy Candidates

| File | Lines | Estimated Impact |
|------|-------|------------------|
| `tests/integration/routes/auth.test.js` | 3026 | **CRITICAL** |
| `tests/integration/middleware/auth.test.js` | 1659 | **HIGH** |
| `tests/integration/services/PolarBillingProvider.test.js` | 1587 | **HIGH** |
| `tests/integration/services/RiskManagementService.test.js` | 1174 | **MEDIUM** |
| `src/brokers/adapters/__tests__/TDAmeritradeAdapter.integration.test.js` | 1108 | **MEDIUM** |
| `src/brokers/adapters/__tests__/TDAmeritradeAdapter.test.js` | 1095 | **MEDIUM** |
| `tests/integration/routes/auth-broker-management.test.js` | 1048 | **MEDIUM** |
| `src/brokers/adapters/__tests__/WeBullAdapter.test.js` | 1026 | **MEDIUM** |
| `tests/integration/validation/coverage.test.js` | 1007 | **MEDIUM** |
| `tests/integration/subscription-verification/subscription-verification.integration.test.js` | 960 | **MEDIUM** |

---

## Detailed Analysis: auth.test.js

### File Statistics

```
Total Lines: 3026
Test Cases (it): 107
Describe Blocks: 21
Average Lines per Test: ~28
```

### Memory-Heavy Patterns Identified

#### 1. Heavy Initialization in `beforeAll()`

**Current Implementation:**
```javascript
beforeAll(async () => {
  // Create full Express app
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // MongoDB session store (persists for entire test suite)
  sessionStore = MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    ttl: 24 * 60 * 60
  });

  // Session middleware
  app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000
    }
  }));

  // Passport initialization and strategies
  app.use(passport.initialize());
  app.use(passport.session());

  // Mount routes
  const authRouter = require('../../../src/routes/api/auth');
  app.use('/api/v1/auth', authRouter);
});
```

**Memory Impact:**
- **Express App**: Loaded once, persists for all 107 tests
- **MongoDB Session Store**: Active connection throughout suite
- **Passport Middleware**: Serialization/deserialization overhead
- **Route Mounting**: Full auth router with all dependencies

**Estimated Memory**: ~200-300MB for initialization

#### 2. Repeated Database Cleanup in `beforeEach()`

**Current Implementation:**
```javascript
beforeEach(async () => {
  jest.clearAllMocks();

  // Database cleanup (executed 107 times)
  await User.deleteMany({});

  // Session store cleanup (executed 107 times)
  if (sessionStore && sessionStore.clear) {
    await new Promise((resolve, reject) => {
      sessionStore.clear((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // MFA service cache clear (executed 107 times)
  const mfaService = getMFAService();
  if (mfaService && mfaService.attemptCache) {
    mfaService.attemptCache.clear();
  }
});
```

**Memory Impact:**
- **User.deleteMany()**: Database operation overhead × 107
- **sessionStore.clear()**: Session store iteration × 107
- **MFA cache clear**: Cache iteration × 107

**Estimated Overhead**: ~50-100MB cumulative

#### 3. Large Test Suite in Single File

**Current Structure:**
```
auth.test.js (3026 lines)
├── OAuth2 Authorization Flow (3 tests)
├── OAuth2 Callback Handling (8 tests)
├── Token Refresh Mechanism (4 tests)
├── Session Management (4 tests)
├── Security & Edge Cases (5 tests)
├── Performance (1 test)
└── Broker Status & Management (82+ tests)
```

**Memory Impact:**
- All 107 tests loaded into memory simultaneously
- Test context accumulates throughout execution
- Mock data persists across test suites
- Garbage collection struggles with large context

**Estimated Memory**: ~300-500MB during execution

---

## Optimization Recommendations

### Priority 1: Split Large Test File (IMMEDIATE)

**Action:** Split `auth.test.js` into focused test suites

**Proposed Structure:**
```
tests/integration/routes/auth/
├── auth-oauth-flow.test.js          (OAuth2 authorization + callback)
├── auth-token-refresh.test.js        (Token refresh mechanism)
├── auth-session-management.test.js   (Session creation + persistence)
├── auth-security.test.js             (Security & edge cases)
├── auth-broker-status.test.js        (Broker status queries)
└── auth-broker-management.test.js    (Broker connect/disconnect)
```

**Benefits:**
- Reduce per-file memory footprint by ~80%
- Enable parallel test execution
- Isolate failures to specific functionality
- Improve garbage collection efficiency

**Estimated Memory Savings**: 300-400MB per batch

**Implementation Complexity**: **MEDIUM** (requires careful test refactoring)

### Priority 2: Optimize beforeEach() Cleanup (IMMEDIATE)

**Action:** Implement targeted cleanup instead of full database wipes

**Current (Inefficient):**
```javascript
beforeEach(async () => {
  await User.deleteMany({});  // Deletes ALL users every test
  await sessionStore.clear(); // Clears ALL sessions every test
});
```

**Optimized (Targeted):**
```javascript
let testUsers = [];
let testSessions = [];

beforeEach(async () => {
  // Track only test-created entities
  testUsers = [];
  testSessions = [];
});

afterEach(async () => {
  // Clean up only what this test created
  if (testUsers.length > 0) {
    await User.deleteMany({ _id: { $in: testUsers } });
  }
  if (testSessions.length > 0) {
    for (const sessionId of testSessions) {
      await sessionStore.destroy(sessionId);
    }
  }

  // Clear test-specific cache only
  const mfaService = getMFAService();
  if (mfaService?.attemptCache && testUsers.length > 0) {
    testUsers.forEach(userId => mfaService.attemptCache.delete(userId));
  }
});
```

**Benefits:**
- Reduce database operations by ~70%
- Faster test execution (less I/O)
- More precise cleanup (no side effects)
- Better test isolation

**Estimated Memory Savings**: 50-100MB cumulative

**Implementation Complexity**: **LOW** (straightforward refactoring)

### Priority 3: Lazy Load Heavy Dependencies (SHORT-TERM)

**Action:** Defer loading of Express app and middleware until needed

**Current (Eager Loading):**
```javascript
beforeAll(async () => {
  app = express();
  // Full initialization even if not all tests need it
  sessionStore = MongoStore.create({ ... });
  app.use(session({ ... }));
  app.use(passport.initialize());
});
```

**Optimized (Lazy Loading):**
```javascript
let app;
let sessionStore;

function getTestApp() {
  if (!app) {
    app = express();
    // Initialize only when first accessed
    sessionStore = MongoStore.create({ ... });
    app.use(session({ ... }));
    app.use(passport.initialize());
  }
  return app;
}

// Tests call getTestApp() only when needed
it('should authenticate user', async () => {
  const testApp = getTestApp();
  await request(testApp).post('/api/v1/auth/login') ...
});
```

**Benefits:**
- Initialize only when tests actually need Express app
- Reduce memory for tests that mock entire service
- Faster test suite initialization

**Estimated Memory Savings**: 100-200MB for suites with many unit tests

**Implementation Complexity**: **MEDIUM** (requires test refactoring)

### Priority 4: Implement Explicit Garbage Collection (SHORT-TERM)

**Action:** Add manual GC triggers in test lifecycle hooks

**Implementation:**
```javascript
afterEach(() => {
  // Clear all mocks
  jest.clearAllMocks();

  // Clear test fixtures
  testUsers = [];
  testSessions = [];

  // Explicit garbage collection (when --expose-gc flag present)
  if (global.gc) {
    global.gc();
  }
});

afterAll(async () => {
  // Final cleanup
  if (sessionStore?.close) {
    await sessionStore.close();
  }

  // Force GC before moving to next file
  if (global.gc) {
    global.gc();
  }
});
```

**Benefits:**
- Reduce memory accumulation between tests
- Prevent memory leaks from persisting
- More reliable heap management

**Estimated Memory Savings**: 100-150MB per test file

**Implementation Complexity**: **LOW** (add to existing hooks)

### Priority 5: Optimize Mock Data Generation (SHORT-TERM)

**Action:** Replace large mock objects with minimal test fixtures

**Current (Verbose Mocks):**
```javascript
const mockUser = {
  _id: new mongoose.Types.ObjectId(),
  discordId: '123456789',
  username: 'testuser',
  email: 'test@example.com',
  avatar: 'https://cdn.discordapp.com/avatars/...',
  discriminator: '1234',
  verified: true,
  mfaEnabled: false,
  brokerConnections: [],
  subscription: {
    tier: 'free',
    status: 'active',
    startDate: new Date(),
    endDate: null
  },
  settings: {
    notifications: { ... },
    trading: { ... },
    security: { ... }
  },
  createdAt: new Date(),
  updatedAt: new Date()
};
```

**Optimized (Minimal Fixtures):**
```javascript
// Factory function with minimal required fields
function createTestUser(overrides = {}) {
  return {
    _id: new mongoose.Types.ObjectId(),
    discordId: `test-${Date.now()}`,
    username: 'testuser',
    email: 'test@example.com',
    ...overrides  // Only override what test needs
  };
}

// Use in tests with only necessary fields
const mockUser = createTestUser({ mfaEnabled: true });
```

**Benefits:**
- Reduce mock object size by ~60%
- Faster test execution (less data copying)
- More focused test assertions

**Estimated Memory Savings**: 30-50MB cumulative

**Implementation Complexity**: **LOW** (create factory functions)

---

## Implementation Roadmap

### Phase 1: Immediate Actions (This Sprint)

1. **Split auth.test.js into focused suites** ✓ Highest impact
   - Expected savings: 300-400MB per batch
   - Estimated effort: 4-6 hours
   - Risk: LOW (careful test refactoring)

2. **Optimize beforeEach() cleanup** ✓ Quick win
   - Expected savings: 50-100MB
   - Estimated effort: 2-3 hours
   - Risk: LOW (straightforward refactoring)

3. **Add explicit garbage collection** ✓ Easy implementation
   - Expected savings: 100-150MB per file
   - Estimated effort: 1 hour
   - Risk: VERY LOW (add to existing hooks)

**Total Expected Savings**: 450-650MB for auth.test.js

### Phase 2: Short-Term Actions (Next Sprint)

4. **Implement lazy loading for heavy dependencies**
   - Expected savings: 100-200MB
   - Estimated effort: 3-4 hours
   - Risk: MEDIUM (requires test refactoring)

5. **Optimize mock data generation**
   - Expected savings: 30-50MB cumulative
   - Estimated effort: 2-3 hours
   - Risk: LOW (create factory functions)

6. **Apply patterns to other large test files**
   - Target: auth middleware (1659 lines)
   - Target: PolarBillingProvider (1587 lines)
   - Expected savings: 200-300MB each
   - Estimated effort: 6-8 hours total

**Total Expected Savings**: 330-550MB for additional files

### Phase 3: Long-Term Improvements (Roadmap)

7. **Create shared test fixtures library**
   - Centralize mock data generation
   - Implement fixture caching
   - Reduce duplication across test files

8. **Implement test data lazy loading**
   - Load fixtures only when needed
   - Use async generators for large datasets
   - Implement fixture cleanup tracking

9. **Add memory profiling to CI/CD**
   - Track memory usage trends
   - Alert on memory regressions
   - Enforce memory budgets per test file

---

## Validation Metrics

### Success Criteria

**Memory Footprint:**
- ✅ Target: < 6GB heap usage for full test suite
- ✅ Target: < 2GB heap usage per batched test run
- ✅ Target: < 500MB per individual test file

**Test Execution:**
- ✅ Target: Full suite completes without heap exhaustion
- ✅ Target: Batched testing runs successfully
- ✅ Target: Individual test files execute in < 30 seconds

**Code Quality:**
- ✅ Target: Maintain 95%+ test pass rate
- ✅ Target: No test functionality regressions
- ✅ Target: Improved test isolation and clarity

### Monitoring

**Continuous Tracking:**
```bash
# Run with heap profiling
node --expose-gc --max-old-space-size=8192 \
     --logfile=memory.log --logHeapUsage \
     node_modules/.bin/jest tests/integration/routes/auth.test.js

# Analyze heap snapshots
node --inspect node_modules/.bin/jest tests/integration/routes/auth.test.js
```

**Key Metrics to Track:**
- Peak heap usage per test file
- GC frequency and duration
- Test execution time
- Memory leaks (retained objects)

---

## Risk Assessment

### Low Risk Optimizations
✅ **Explicit Garbage Collection**: No functional changes, only memory management
✅ **Targeted Cleanup**: More precise than current approach
✅ **Mock Data Optimization**: Reduces verbosity without changing behavior

### Medium Risk Optimizations
⚠️ **File Splitting**: Requires careful test organization
⚠️ **Lazy Loading**: May introduce timing issues if not handled properly

### Mitigation Strategies
- ✅ Run full test suite after each optimization
- ✅ Compare test pass rates before/after
- ✅ Validate test isolation (no cross-test dependencies)
- ✅ Use git branches for experimental optimizations

---

## Next Steps

1. **Immediate (This Session):**
   - ✅ Complete this analysis document
   - ⏳ Create refactoring plan for auth.test.js split
   - ⏳ Implement Priority 1: Split auth.test.js
   - ⏳ Validate split files pass all tests

2. **Short-Term (Next Session):**
   - Implement Priority 2: Optimize beforeEach() cleanup
   - Implement Priority 3: Add explicit GC triggers
   - Apply patterns to auth middleware test (1659 lines)
   - Measure memory savings

3. **Long-Term (Future Sprints):**
   - Apply patterns to remaining large test files
   - Create shared test fixtures library
   - Implement CI/CD memory monitoring
   - Document test optimization best practices

---

## Related Documentation

- [Test Infrastructure Improvements](../deployment/test-infrastructure-improvements.md)
- [Priority 2.4-2.6 Final Status](../reports/summaries/refactoring-priorities-2.4-2.6-final-status.md)
- [Test Batching Script](../../scripts/test-batched.js)

---

**Last Updated:** 2025-11-06
**Author:** Test Infrastructure Optimization Task
**Status:** In Progress - Phase 1 Planning Complete
