# Prioritized Implementation Plan
**Generated**: 2025-10-23
**Execution Strategy**: Maximum Value, Minimum Risk
**Total Remaining**: 83 tasks, ~110 hours

---

## Prioritization Criteria

### Scoring Matrix
```
Priority = (Constitutional Impact × 3) + (Risk Mitigation × 2) + (Effort:Value Ratio)

Where:
- Constitutional Impact: 0-5 (blocks production = 5)
- Risk Mitigation: 0-5 (prevents critical failure = 5)
- Effort:Value Ratio: 0-5 (high value, low effort = 5)
```

### Priority Levels
- **P0 (CRITICAL)**: Blocks production deployment
- **P1 (HIGH)**: Major risk mitigation or constitutional requirement
- **P2 (MEDIUM)**: Important but not blocking
- **P3 (LOW)**: Nice-to-have improvements

---

## PRIORITY 1: Database Performance (P0 - CRITICAL)
**Rationale**: Highest value, lowest risk, constitutional requirement (<200ms p95)

### Task 1.1: US2-T01 - Create Database Indexes
**Effort**: 2 hours
**Value**: 10x+ query performance improvement
**Risk**: MEDIUM (mitigated with background indexes)
**Constitutional Impact**: HIGH (enables <200ms p95 requirement)

**Why First?**
1. ✅ Independent task (no dependencies on console.log replacement)
2. ✅ Immediate performance impact
3. ✅ Enables US2-T02 to succeed
4. ✅ Low risk with `{ background: true }` flag
5. ✅ Quick win (2h effort, massive impact)

**Implementation:**
```javascript
// File: migrations/add-performance-indexes.js

const indexes = [
  // Users collection
  { collection: 'users', index: { 'subscription.status': 1, 'subscription.tier': 1, 'createdAt': 1 }, options: { background: true, name: 'subscription_status_tier_created' } },
  { collection: 'users', index: { lastLogin: -1, 'subscription.status': 1 }, options: { background: true, name: 'last_login_subscription' } },

  // Trades collection
  { collection: 'trades', index: { userId: 1, status: 1, timestamp: -1 }, options: { background: true, name: 'user_status_timestamp' } },
  { collection: 'trades', index: { userId: 1, symbol: 1, status: 1 }, options: { background: true, name: 'user_symbol_status' } },
  { collection: 'trades', index: { tenantId: 1, status: 1, timestamp: -1 }, options: { background: true, name: 'tenant_status_timestamp' } },

  // SignalProviders collection
  { collection: 'signalproviders', index: { communityId: 1, isActive: 1, 'stats.winRate': -1 }, options: { background: true, name: 'community_active_winrate' } },
  { collection: 'signalproviders', index: { communityId: 1, 'stats.totalFollowers': -1 }, options: { background: true, name: 'community_followers' } },
  { collection: 'signalproviders', index: { communityId: 1, isActive: 1, 'stats.totalFollowers': -1 }, options: { background: true, name: 'community_active_followers' } },
  { collection: 'signalproviders', index: { communityId: 1, createdAt: -1 }, options: { background: true, name: 'community_created' } }
];
```

**Validation**:
- [ ] Run `db.collection.getIndexes()` to verify creation
- [ ] Monitor replica lag during creation
- [ ] Run performance tests to measure improvement
- [ ] Update tasks.md with [X] completion marker

---

### Task 1.2: US2-T02 - Optimize Top Providers Query
**Effort**: 2 hours
**Value**: 6x performance improvement (300ms → <50ms)
**Risk**: LOW (pattern already proven in US2-T03)
**Depends**: US2-T01 (indexes must exist first)

**Why Second?**
1. ✅ Builds on US2-T01 indexes
2. ✅ Pattern already validated in US2-T03 (community overview)
3. ✅ Quick implementation (copy aggregation pattern)
4. ✅ Completes US2 entirely (5/7 → 7/7 = 100%)

**Implementation:**
```javascript
// File: src/routes/api/community.js (lines 74-96)
// Before: N+1 pattern with Promise.all
// After: Single aggregation pipeline with $lookup

const topProvidersWithFollowers = await SignalProvider.aggregate([
  { $match: { communityId: ObjectId(communityId), isActive: true } },
  { $sort: { 'stats.winRate': -1 } },
  { $limit: 10 },
  {
    $lookup: {
      from: 'usersignalsubscriptions',
      localField: '_id',
      foreignField: 'signalProviderId',
      as: 'subscriptions'
    }
  },
  {
    $lookup: {
      from: 'signals',
      let: { providerId: '$_id' },
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                { $eq: ['$signalProviderId', '$$providerId'] },
                { $gte: ['$timestamp', dayStart] }
              ]
            }
          }
        },
        { $count: 'count' }
      ],
      as: 'todaySignals'
    }
  },
  {
    $project: {
      name: 1,
      stats: 1,
      followers: { $size: '$subscriptions' },
      signalsToday: { $arrayElemAt: ['$todaySignals.count', 0] }
    }
  }
]);
```

**Validation**:
- [ ] Performance test: <50ms p95 for 100 providers
- [ ] Functional test: Same data as N+1 query
- [ ] Verify only 1 database query executed
- [ ] Update tasks.md with [X] completion marker

**Milestone**: US2 COMPLETE (7/7 tasks) ✅

---

## PRIORITY 2: Logging Infrastructure Completion (P0 - CRITICAL)
**Rationale**: Constitutional requirement (Principle VI - Observability), production blocker

### Task 2.1: US1-T05-T15 - Replace Console.log Calls
**Effort**: 12-15 hours
**Volume**: 519 occurrences
**Risk**: HIGH (potential breaking changes)
**Constitutional Impact**: HIGH (Principle VI - structured logging requirement)

**Why Third?**
1. ⚠️ Large effort, but MUST be done before production
2. ⚠️ Constitutional violation (console.log is not observability-compliant)
3. ✅ Infrastructure already in place (logger, sanitizer, middleware)
4. ✅ Can be partially automated with careful scripting

**Strategy: Incremental File-by-File Approach**

**Phase 1: Services (264 calls, highest concentration)**
```bash
# Priority order:
1. src/services/TradeExecutionService.js (8 console.error → logger.error)
2. src/services/RiskManagementService.js (risk event logging)
3. src/services/PolarBillingProvider.js (billing critical path)
4. src/services/OAuth2Service.js (authentication critical path)
5. Remaining services/ files (batch process)
```

**Phase 2: Routes (38 calls)**
```bash
# Priority order:
1. src/routes/api/auth.js (authentication critical)
2. src/routes/api/community.js (8 calls)
3. src/routes/api/analytics.js (13 calls)
4. src/routes/api/trader.js (recently modified, 4 calls)
5. Remaining routes/ files
```

**Phase 3: Middleware & Utils (23 calls)**
```bash
1. src/middleware/errorHandler.js (10 calls)
2. src/utils/ files (13 calls)
3. src/middleware/ remaining (3 calls)
```

**Phase 4: Other (194 calls)**
```bash
# Batch process remaining files
```

**Replacement Pattern**:
```javascript
// BEFORE
console.log('User login successful:', { userId, email });
console.error('Payment failed:', error);

// AFTER
logger.info('User login successful', { userId, email });
logger.error('Payment failed', { error: error.message, stack: error.stack, userId });
```

**Automation Script**:
```bash
# Semi-automated replacement (requires manual review)
find src/ -name "*.js" -exec sed -i '' 's/console\.log(/logger.info(/g' {} \;
find src/ -name "*.js" -exec sed -i '' 's/console\.error(/logger.error(/g' {} \;
find src/ -name "*.js" -exec sed -i '' 's/console\.warn(/logger.warn(/g' {} \;

# Then: Manual review each file for:
# 1. Add logger import: const logger = require('../utils/logger');
# 2. Verify metadata objects are correct
# 3. Ensure error objects are destructured properly
```

**Validation per File**:
- [ ] Import logger at top of file
- [ ] All console.* replaced with logger.*
- [ ] Metadata objects include relevant context
- [ ] Error objects include stack traces
- [ ] File lints without errors
- [ ] Relevant tests still pass

---

### Task 2.2: US1-T16 - Update Error Handler Middleware
**Effort**: 30 minutes
**Depends**: US1-T05-T15 completion
**Risk**: LOW

**Implementation**:
```javascript
// File: src/middleware/errorHandler.js

// Ensure all error logging uses logger.error with correlation ID
function errorHandler(err, req, res, next) {
  const correlationId = logger.getCorrelationId();

  // Log full error with context
  logger.error('Request error', {
    error: err.message,
    stack: err.stack,
    correlationId,
    method: req.method,
    path: req.path,
    body: req.body,
    query: req.query,
    user: req.user?.id
  });

  // Return sanitized error to client (no stack trace)
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal server error',
      code: err.code || 'INTERNAL_ERROR',
      correlationId
    }
  });
}
```

---

### Task 2.3: US1-T19 - Verify Zero Console.log
**Effort**: 5 minutes
**Depends**: US1-T05-T15 + US1-T16 completion

**Validation**:
```bash
# Must return 0 results
grep -r "console\.log\|console\.error\|console\.warn" src/ --include="*.js" | wc -l

# Expected output: 0
```

---

### Task 2.4: US1-T20 - CI/CD Enforcement
**Effort**: 30 minutes
**Depends**: US1-T19 verification

**Implementation**:
```json
// File: .eslintrc.json
{
  "rules": {
    "no-console": ["error", {
      "allow": [] // No console methods allowed in src/
    }]
  },
  "overrides": [
    {
      "files": ["tests/**/*.js", "scripts/**/*.js"],
      "rules": {
        "no-console": "off" // Allow console in tests and scripts
      }
    }
  ]
}
```

**Milestone**: US1 COMPLETE (20/20 tasks) ✅

---

## PRIORITY 3: Mock Elimination & Error Handling (P0/P1)
**Rationale**: Production safety requirements

### Task 3.1: US5-T03 - Environment Validation
**Effort**: 1 hour
**Risk**: LOW
**Impact**: CRITICAL (prevents misconfiguration)

**Implementation**:
```javascript
// File: src/utils/env-validator.js (enhance existing)

function validateProductionEnvironment() {
  if (process.env.NODE_ENV !== 'production') return;

  const requiredVars = [
    'NODE_ENV',
    'MONGODB_URI',
    'SESSION_SECRET',
    'JWT_SECRET',
    'BILLING_PROVIDER', // Must NOT be 'mock'
    'DISCORD_BOT_TOKEN',
    'POLAR_ACCESS_TOKEN'
  ];

  const missing = requiredVars.filter(v => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Validate BILLING_PROVIDER is not 'mock' in production
  if (process.env.BILLING_PROVIDER === 'mock') {
    throw new Error('CRITICAL: BILLING_PROVIDER=mock is not allowed in production');
  }

  logger.info('Environment validation passed', {
    env: process.env.NODE_ENV,
    billingProvider: process.env.BILLING_PROVIDER
  });
}
```

---

### Task 3.2: US5-T01-T02 - Guard Mock Methods
**Effort**: 1 hour each (2h total)
**Risk**: LOW
**Impact**: CRITICAL

**Implementation**:
```javascript
// File: src/services/PolarBillingProvider.js

_getMockSubscription() {
  // Guard: Only allow in non-production with BILLING_PROVIDER=mock
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CRITICAL: Mock billing method called in production');
  }

  if (process.env.BILLING_PROVIDER !== 'mock') {
    throw new Error('Mock billing method called but BILLING_PROVIDER is not "mock"');
  }

  logger.warn('Using mock billing subscription (development only)', {
    env: process.env.NODE_ENV,
    billingProvider: process.env.BILLING_PROVIDER
  });

  return { /* mock data */ };
}
```

---

### Task 3.3: US5-T04 - Health Check for Mock Detection
**Effort**: 30 minutes
**Depends**: US5-T01-T03

**Implementation**:
```javascript
// File: src/routes/health.js

app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    checks: {
      database: mongoose.connection.readyState === 1,
      mockDetection: {
        status: 'pass',
        billingProvider: process.env.BILLING_PROVIDER
      }
    }
  };

  // CRITICAL: Fail health check if mocks detected in production
  if (process.env.NODE_ENV === 'production') {
    if (process.env.BILLING_PROVIDER === 'mock') {
      health.status = 'unhealthy';
      health.checks.mockDetection.status = 'CRITICAL_FAILURE';
      health.checks.mockDetection.error = 'Mock billing provider active in production';
      return res.status(500).json(health);
    }
  }

  res.status(200).json(health);
});
```

**Milestone**: US5 COMPLETE (6/6 tasks) ✅

---

### Task 3.4: US4-T01-T02 - Error Handling Core
**Effort**: 2 hours
**Risk**: LOW
**Impact**: HIGH (security - no stack traces to clients)

**Implementation**:
```javascript
// File: src/constants/ErrorCodes.js (NEW)

module.exports = {
  // Authentication errors (1xxx)
  AUTH_INVALID_TOKEN: { code: 1001, status: 401, message: 'Invalid authentication token' },
  AUTH_TOKEN_EXPIRED: { code: 1002, status: 401, message: 'Authentication token expired' },
  AUTH_MFA_REQUIRED: { code: 1003, status: 401, message: 'Multi-factor authentication required' },

  // Billing errors (2xxx)
  BILLING_PAYMENT_FAILED: { code: 2001, status: 402, message: 'Payment processing failed' },
  BILLING_SUBSCRIPTION_INACTIVE: { code: 2002, status: 403, message: 'Subscription inactive or expired' },

  // Validation errors (4xxx)
  VALIDATION_ERROR: { code: 4001, status: 400, message: 'Request validation failed' },

  // Database errors (5xxx)
  DATABASE_ERROR: { code: 5001, status: 500, message: 'Database operation failed' },

  // General errors
  INTERNAL_ERROR: { code: 9999, status: 500, message: 'An unexpected error occurred' }
};
```

**Update errorHandler**:
```javascript
// File: src/middleware/errorHandler.js

const ErrorCodes = require('../constants/ErrorCodes');

function errorHandler(err, req, res, next) {
  const correlationId = logger.getCorrelationId();

  // Log full error internally (with stack trace)
  logger.error('Request error', {
    error: err.message,
    stack: err.stack, // Only in logs, never in response
    correlationId,
    method: req.method,
    path: req.path,
    code: err.code
  });

  // Determine error code
  const errorCode = ErrorCodes[err.code] || ErrorCodes.INTERNAL_ERROR;

  // Return sanitized error (NO STACK TRACE)
  res.status(errorCode.status).json({
    error: {
      code: errorCode.code,
      message: errorCode.message,
      correlationId,
      // Never include: stack, internal paths, database queries
    }
  });
}
```

**Milestone**: US4 Core Complete (3/10 tasks)

---

## PRIORITY 4: Test Coverage Foundation (P0)
**Rationale**: Critical path quality assurance

### Task 4.1: US3-T01 - Fix MFA Encryption Tests (CRITICAL BLOCKER)
**Effort**: 3 hours
**Risk**: MEDIUM (48 existing tests affected)
**Impact**: BLOCKS all other auth testing

**Why Critical?**
- 48 existing tests use plaintext MFA secrets
- Tests pass but test WRONG behavior (security violation)
- Must fix before adding more tests (technical debt compounding)

**Implementation**:
```javascript
// File: tests/integration/routes/auth.test.js

// BEFORE (WRONG - 48 occurrences)
const user = await User.create({
  email: 'test@example.com',
  mfaSecret: 'plaintext-secret' // ❌ SECURITY VIOLATION
});

// AFTER (CORRECT)
const MFAService = require('../../../src/services/MFAService');
const user = await User.create({
  email: 'test@example.com',
  mfaSecret: await MFAService.encryptSecret('plaintext-secret') // ✅ ENCRYPTED
});

// Then verify decryption works
const decrypted = await MFAService.decryptSecret(user.mfaSecret);
expect(decrypted).toBe('plaintext-secret');
```

**Validation**:
- [ ] All 48 tests updated
- [ ] All tests still pass
- [ ] Grep search: 0 plaintext mfaSecret in tests
- [ ] Coverage remains at current level (21.43%)

**Milestone**: US3 Foundation Ready (1/30 tasks, but unblocks rest)

---

## Execution Timeline Estimate

### Session 1 (Current Session - 4 hours)
- ✅ Status report complete
- ✅ Prioritization plan complete
- [ ] **US2-T01**: Database indexes (2h)
- [ ] **US2-T02**: Top providers query (2h)
- **Milestone**: US2 Complete (100%)

### Session 2 (8 hours)
- [ ] **US1-T05-T15**: Console.log replacement Phase 1 (services - 6h)
- [ ] **US5-T01-T04**: Mock elimination (2h)
- **Milestone**: Services logging complete, mocks guarded

### Session 3 (8 hours)
- [ ] **US1-T05-T15**: Console.log replacement Phase 2-4 (routes, middleware, other - 6h)
- [ ] **US1-T16-T20**: Complete logging infrastructure (1h)
- [ ] **US4-T01-T02**: Error codes + handler (1h)
- **Milestone**: US1 Complete (100%), US4 Core (30%), US5 Complete (100%)

### Session 4 (8 hours)
- [ ] **US3-T01**: Fix MFA encryption (3h)
- [ ] **US3-T02-T05**: Auth routes edge cases (5h)
- **Milestone**: US3 Foundation (15%)

### Sessions 5-8 (32 hours)
- [ ] **US3-T06-T30**: Complete test coverage (24h)
- [ ] **US4-T03-T10**: Complete error handling (8h)
- **Milestone**: US3 Complete (100%), US4 Complete (100%)

### Sessions 9-10 (16 hours)
- [ ] **US6**: Performance monitoring (10h)
- [ ] **US7**: Security validation (6h)
- **Milestone**: US6 Complete (100%), US7 Complete (50%)

### Session 11 (6 hours)
- [ ] **US7**: Complete security validation (6h)
- **Milestone**: ALL COMPLETE (100%)

**Total Estimated**: ~82 hours (vs original 110h estimate, optimized with prioritization)

---

## Success Criteria

### Definition of Done (Per Task)
- [ ] Code implemented and linted
- [ ] Relevant tests added/passing
- [ ] Documentation updated
- [ ] tasks.md marked with [X]
- [ ] Git commit with descriptive message
- [ ] No regressions in existing tests

### Definition of Done (Per User Story)
- [ ] All tasks marked [X] in tasks.md
- [ ] Coverage meets threshold (if applicable)
- [ ] Performance benchmarks pass (if applicable)
- [ ] Integration tests pass
- [ ] Code review ready (clean git diff)

### Definition of Done (Overall Project)
- [ ] All 92 tasks complete
- [ ] `grep -r "console\." src/` returns 0
- [ ] Test coverage ≥100% for auth/middleware/billing/risk
- [ ] API response time <200ms p95
- [ ] Zero mock code reachable in production
- [ ] CI/CD enforces quality gates
- [ ] Production deployment unblocked

---

## Risk Mitigation Strategies

### Console.log Replacement (Highest Risk)
**Strategy**: File-by-file + test-driven
1. Pick one file
2. Replace console.* with logger.*
3. Run file's tests
4. If tests pass → commit
5. If tests fail → revert, investigate, retry
6. Never batch-commit (incremental safety)

### Database Index Creation
**Strategy**: Background + monitoring
1. Use `{ background: true }` flag
2. Monitor replica lag during creation
3. Test on staging with production-sized dataset first
4. Schedule during low-traffic window
5. Have rollback plan (drop indexes if issues)

### Mock Elimination
**Strategy**: Defense in depth
1. Environment validation (startup crash if misconfigured)
2. Method guards (throw errors if called incorrectly)
3. Health check failures (monitoring catches issues)
4. CI/CD smoke tests (catch before production)
5. Manual verification checklist

---

## Next Steps

### IMMEDIATE (This Session)
1. ✅ Begin US2-T01 (database indexes)
2. ✅ Execute US2-T02 (top providers query)
3. ✅ Update tasks.md with completions
4. ✅ Commit changes with clear messages

### SHORT-TERM (Next Session)
1. Begin US1-T05-T15 (console.log replacement Phase 1)
2. Execute US5 (mock elimination)
3. Implement US4-T01-T02 (error handling core)

### MEDIUM-TERM (Future Sessions)
1. Complete US1 (logging infrastructure)
2. Fix US3-T01 (MFA encryption - critical blocker)
3. Expand US3 (test coverage to 100%)
4. Implement US6-US7 (monitoring + security)

---

**Status**: READY FOR EXECUTION - Starting with US2-T01 (Database Indexes)
