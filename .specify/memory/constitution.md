<!--
SYNC IMPACT REPORT - Constitution v1.1.0
===========================================

VERSION CHANGE: 1.0.0 → 1.1.0 (MINOR)

RATIONALE FOR MINOR BUMP:
- Added new Principle VIII: Billing Provider Independence
- Expanded Quality Standards to include Payment Processing Standards
- No backward-incompatible changes to existing principles
- Existing code complies with new principle (Polar.sh migration already complete)

MODIFIED PRINCIPLES:
- None (all existing principles unchanged)

ADDED SECTIONS:
- Principle VIII: Billing Provider Independence (NEW)
  Establishes graceful degradation, provider abstraction, and migration protocols
  for payment processing systems following Stripe→Polar.sh migration

- Payment Processing Standards (NEW subsection under Quality Standards)
  Codifies billing provider configuration and testing requirements

REMOVED SECTIONS:
- None

TEMPLATES REQUIRING UPDATES:
✅ .specify/templates/plan-template.md - Reviewed, no changes needed (constitution gates already generic)
✅ .specify/templates/spec-template.md - Reviewed, no changes needed (requirements remain technology-agnostic)
✅ .specify/templates/tasks-template.md - Reviewed, no changes needed (task organization unchanged)

FOLLOW-UP TODOS:
- None (all placeholders filled, all templates validated for consistency)

DOCUMENT CHANGES:
- Updated LAST_AMENDED_DATE to 2025-10-20
- Incremented VERSION to 1.1.0
- Added Principle VIII with code examples and validation requirements
- Added Payment Processing Standards to Quality Standards section
-->

# Discord Trade Exec Constitution

## Core Principles

### I. Multi-Tenant Isolation (NON-NEGOTIABLE)

**All database queries MUST include tenant scoping.**

- Every MongoDB query MUST filter by `tenantId` (aliased as `communityId` in models)
- Cross-tenant data access is a **P0 security violation**
- User records MUST only access their own `tenantId` data
- API endpoints MUST validate `req.user.tenantId` matches requested resource

**Enforcement**:
```javascript
// CORRECT - Tenant-scoped query
const trades = await Trade.find({
  tenantId: req.user.tenantId,
  userId: req.user._id
});

// FORBIDDEN - Missing tenant scope
const trades = await Trade.find({ userId: req.user._id });
```

**Validation**: All pull requests MUST verify tenant scoping in database queries. Integration tests MUST verify cross-tenant access is blocked.

---

### II. Role-Based Access Control (RBAC)

**Middleware MUST enforce role validation before data access.**

- Community admin endpoints (`/api/community/*`) MUST use `requireCommunityAdmin` middleware
- Trader endpoints (`/api/trader/*`) MUST use `requireTrader` middleware
- Admin-only features MUST check `user.communityRole === 'admin' || user.communityRole === 'moderator'`
- Unauthorized access attempts MUST return 403 Forbidden with clear error messages

**Enforcement**:
```javascript
// Community routes
router.get('/api/community/overview', requireCommunityAdmin, handler);

// Trader routes
router.get('/api/trader/overview', requireTrader, handler);

// Consistent error responses
res.status(403).json({
  error: 'Forbidden',
  message: 'Community admin role required'
});
```

**Validation**: Access control tests MUST verify all role scenarios (admin, moderator, trader, viewer).

---

### III. Security Audit Logging

**All sensitive operations MUST log to SecurityAudit collection.**

Operations requiring audit logging:
- Member role changes (`security.role_change`)
- Signal provider configuration updates (`dashboard.signal_update`)
- Broker connection modifications (`dashboard.broker_update`)
- Risk profile changes (`dashboard.risk_profile_update`)
- Unauthorized access attempts (`security.unauthorized_access`)

**Required fields**:
- `userId`: User performing action
- `tenantId`: Community context
- `action`: Dot-notation action type
- `details`: Operation-specific metadata
- `ipAddress`: Request IP
- `userAgent`: Request user agent
- `riskLevel`: LOW | MEDIUM | HIGH | CRITICAL
- `timestamp`: Auto-generated

**Enforcement**:
```javascript
await SecurityAudit.create({
  userId: req.user._id,
  tenantId: req.user.tenantId,
  action: 'security.role_change',
  details: {
    targetUserId: targetUser._id,
    oldRole: targetUser.communityRole,
    newRole: 'admin'
  },
  ipAddress: req.ip,
  userAgent: req.get('user-agent'),
  riskLevel: 'HIGH'
});
```

**Validation**: Security audit logs MUST be queryable and retained per compliance requirements.

---

### IV. Feature Flag Deployment

**Production rollouts MUST use gradual percentage-based deployment.**

- New features MUST use environment variables: `ENABLE_[FEATURE_NAME]`, `[FEATURE_NAME]_ROLLOUT_PERCENTAGE`
- Rollout progression: 10% (monitor 48hrs) → 50% (monitor 24hrs) → 100%
- Feature flag logic MUST use consistent hashing (same user always gets same result)
- Emergency rollback MUST be <5 minutes via feature flag disable

**Enforcement**:
```javascript
// Feature flag implementation
function isFeatureEnabled(user, featureName, defaultPercentage = 100) {
  const enabled = process.env[`ENABLE_${featureName}`] === 'true';
  if (!enabled) return false;

  const percentage = parseInt(process.env[`${featureName}_ROLLOUT_PERCENTAGE`] || defaultPercentage, 10);
  if (percentage >= 100) return true;

  // Consistent hashing
  const hash = hashString(user._id.toString());
  return (hash % 100) < percentage;
}
```

**Validation**: Feature flags MUST be tested at 0%, 10%, 50%, 100% rollout levels.

---

### V. Performance Targets

**All user-facing operations MUST meet performance SLOs.**

| Operation Type | Target (p95) | Measurement |
|----------------|--------------|-------------|
| Page Load | <2s | Time to Interactive |
| API Response | <500ms | Server processing time |
| Database Query | <100ms | Query execution time |
| Analytics (cached) | <1s | Redis hit + DB fallback |
| Export Operations | <5s | Complete data generation |

**Enforcement**:
- Database queries MUST use compound indexes (ESR: Equality, Sort, Range)
- Analytics endpoints MUST use Redis caching (5-minute TTL)
- Heavy aggregations MUST run asynchronously with progress indicators
- Route decision overhead MUST be <500ms

**Validation**: Performance tests MUST verify targets before production deployment.

---

### VI. Test-Driven Development (TDD)

**Features MUST have comprehensive test coverage before deployment.**

- Unit tests for all business logic (target: 90%+ coverage)
- Integration tests for API endpoints (all scenarios)
- E2E tests for critical user journeys
- Performance tests for analytics and aggregations

**Test Requirements**:
```javascript
// Unit tests
describe('isDualDashboardEnabled', () => {
  it('should return true for users in rollout percentage', () => {
    // Test implementation
  });
});

// Integration tests
describe('GET /api/community/overview', () => {
  it('should return aggregated metrics for community admin', async () => {
    // Test implementation
  });

  it('should return 403 for non-admin users', async () => {
    // Test implementation
  });
});
```

**Validation**: All PRs MUST include tests. CI pipeline MUST enforce test passage.

---

### VII. Data Consistency & Caching

**Caching MUST NOT compromise data accuracy.**

- Redis cache TTL: 5 minutes for analytics, 1 minute for real-time data
- Cache invalidation MUST occur on data mutations
- Stale data tolerance documented per endpoint
- Cache misses MUST fall back to database gracefully

**Enforcement**:
```javascript
// Cache-aside pattern
const cacheKey = `analytics:community:${communityId}:${dateRange}`;
const cached = await RedisService.get(cacheKey);

if (cached) {
  return JSON.parse(cached);
}

const result = await Trade.aggregate([/* ... */]);
await RedisService.set(cacheKey, JSON.stringify(result), 300); // 5min TTL
return result;
```

---

### VIII. Billing Provider Independence

**Payment processing MUST support provider migration without service disruption.**

**Rationale**: Platform switched from Stripe to Polar.sh (October 2025) for Merchant of Record (MoR) tax compliance. This principle ensures future billing provider changes remain low-risk.

**Requirements**:
- Billing services MUST implement graceful degradation when unconfigured
- Customer/subscription IDs MUST use provider-agnostic field names (`polarCustomerId`, not `customerId`)
- Free tier users MUST function without any billing provider configured
- Provider API clients MUST return mock/default data when credentials missing
- Schema migrations MUST preserve data integrity during provider transitions

**Enforcement**:
```javascript
// CORRECT - Graceful degradation in polar.js service
getUserSubscription(customerId) {
  if (!this.polar || !process.env.POLAR_ACCESS_TOKEN) {
    console.warn('[Polar] Service not configured, returning mock subscription');
    return {
      tier: 'free',
      status: 'active',
      limits: { signalsPerDay: 5, maxBrokers: 1 }
    };
  }
  return this.polar.customers.get(customerId);
}

// CORRECT - Provider-specific field naming in User model
subscription: {
  polarCustomerId: { type: String }, // Provider-specific
  polarSubscriptionId: { type: String },
  tier: { type: String, enum: ['free', 'professional', 'elite'] }, // Provider-agnostic
  status: { type: String, enum: ['active', 'past_due', 'canceled'] }
}

// FORBIDDEN - Generic naming that creates migration conflicts
subscription: {
  customerId: { type: String }, // Too generic - which provider?
  subscriptionId: { type: String }
}
```

**Migration Protocol**:
1. Add new provider fields to schema (e.g., `polarCustomerId`) without removing old ones
2. Implement new billing service with graceful degradation
3. Update webhook handlers for new provider events
4. Deploy with feature flag to enable gradual rollout
5. Migrate customer data: old provider ID → new provider ID
6. Verify all subscription tiers and limits function correctly
7. Remove old provider code and fields after 30-day stability period

**Validation**:
- Billing service MUST return valid free tier data when provider unconfigured
- Tests MUST verify both configured and unconfigured billing provider scenarios
- Integration tests MUST verify webhook handling for all subscription lifecycle events
- Migration scripts MUST preserve all customer subscription data and history

---

## Quality Standards

### Code Quality

- **Linting**: ESLint with Airbnb style guide
- **Formatting**: Prettier with 2-space indentation
- **Complexity**: Cyclomatic complexity <10 per function
- **Documentation**: JSDoc for all public APIs

### Security Standards

- **Secrets**: Never commit secrets, use environment variables
- **Input Validation**: Joi schemas for all API inputs
- **SQL Injection**: Mongoose ORM prevents raw queries
- **XSS Protection**: Sanitize all user-generated content
- **Rate Limiting**: Enforce per-endpoint rate limits

### Database Standards

- **Indexes**: All frequently queried fields MUST have indexes
- **Compound Indexes**: Follow ESR rule (Equality, Sort, Range)
- **Query Optimization**: Use `.explain()` to verify index usage
- **Connections**: Connection pooling with max 10 connections per instance

### Payment Processing Standards

- **Provider Configuration**: All billing provider credentials via environment variables (`POLAR_ACCESS_TOKEN`, `POLAR_ORGANIZATION_ID`, etc.)
- **Webhook Security**: Verify webhook signatures using provider secret (`POLAR_WEBHOOK_SECRET`)
- **Graceful Degradation**: Billing services MUST function (free tier) without provider configuration
- **UUID Format**: Use RFC 4122 UUIDs for customer/subscription IDs when provider requires
- **Metadata Routing**: Store provider-agnostic subscription metadata (tier, limits, features) in application database
- **Testing**: Mock billing provider responses in tests using test environment variables

---

## Development Workflow

### Branch Strategy

- `main`: Production-ready code
- `develop`: Integration branch for features
- `feature/*`: Feature development branches
- `hotfix/*`: Emergency production fixes

### Commit Standards

```
type(scope): subject

feat(dashboard): Add community overview analytics
fix(api): Resolve tenant scoping in trade queries
docs(readme): Update deployment instructions
test(community): Add role change audit logging tests
```

### Pull Request Requirements

- [ ] All tests passing (unit + integration)
- [ ] Test coverage ≥90% for new code
- [ ] Performance targets met
- [ ] Security audit logging added (if applicable)
- [ ] Database queries tenant-scoped
- [ ] Documentation updated
- [ ] No hardcoded secrets or credentials

### Code Review Checklist

- [ ] Tenant isolation verified
- [ ] Role-based access control enforced
- [ ] Security audit logging present
- [ ] Database indexes utilized
- [ ] Error handling comprehensive
- [ ] Performance acceptable
- [ ] Tests comprehensive

---

## Deployment Standards

### Pre-Deployment Checklist

- [ ] All tests passing in staging
- [ ] Performance benchmarks validated
- [ ] Database migrations tested
- [ ] Feature flags configured
- [ ] Rollback plan documented
- [ ] Monitoring dashboards ready

### Gradual Rollout Process

1. **Stage 1 (10%)**: Deploy to 10% of users, monitor 48 hours
2. **Stage 2 (50%)**: Increase to 50%, monitor 24 hours
3. **Stage 3 (100%)**: Full rollout, monitor 7 days
4. **Cleanup (30 days)**: Remove feature flags

### Rollback Criteria

Immediate rollback if:
- Error rate increases >50%
- P0 security vulnerability discovered
- Performance degradation >2x targets
- Data corruption detected
- >10% user complaints

---

## Observability

### Logging Requirements

- **Structured Logging**: JSON format with consistent fields
- **Log Levels**: DEBUG, INFO, WARN, ERROR, CRITICAL
- **Context**: Include `userId`, `tenantId`, `requestId`, `timestamp`
- **Retention**: 30 days for DEBUG/INFO, 90 days for WARN/ERROR

### Monitoring Requirements

- **Uptime**: 99.9% SLA target
- **Error Tracking**: Sentry or equivalent for exception monitoring
- **Performance**: APM tool for request tracing
- **Database**: MongoDB Atlas monitoring for slow queries
- **Cache**: Redis monitoring for hit rates

### Alerting Thresholds

- Error rate >1% (5-minute window)
- Response time p95 >1s
- Database connection pool exhaustion
- Redis memory >80%
- Failed authentication attempts >100/min

---

## Governance

### Constitution Authority

This constitution supersedes all other development practices, guidelines, or conventions. When conflicts arise, constitution principles take precedence.

### Amendment Process

1. Propose amendment with justification
2. Team review and discussion
3. Approval by engineering lead + product manager
4. Migration plan for existing code (if applicable)
5. Update constitution version and ratification date

### Compliance Verification

All pull requests MUST include a compliance statement:
```markdown
## Constitution Compliance

- [x] Multi-tenant isolation verified
- [x] RBAC middleware applied
- [x] Security audit logging added
- [x] Performance targets met
- [x] Tests comprehensive (92% coverage)
```

### Principle Violations

- **Critical Violations** (tenant leak, missing RBAC): Block deployment immediately
- **High Violations** (missing audit logs, no tests): Require remediation before merge
- **Medium Violations** (performance miss, incomplete docs): Create follow-up task
- **Low Violations** (style guide deviation): Address in next sprint

---

**Version**: 1.1.0
**Ratified**: 2025-10-19
**Last Amended**: 2025-10-20
**Next Review**: 2026-01-19 (Quarterly)
