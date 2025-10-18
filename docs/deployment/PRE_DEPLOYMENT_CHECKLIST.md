# Pre-Deployment Checklist

Complete validation checklist before deploying WebSocket server to Railway production.

## 1. Code Quality & Testing

### Unit Tests
- [ ] All unit tests passing (`npm test -- tests/unit/`)
- [ ] Test coverage ≥ 80% (when coverage tools compatible)
- [ ] No skipped tests without documentation
- [ ] Mock patterns follow Jest best practices

### Integration Tests
- [ ] All integration tests passing (`npm test -- tests/integration/`)
- [ ] WebSocket server initialization validated
- [ ] Authentication middleware validated
- [ ] Event handlers validated
- [ ] Emitters validated
- [ ] Graceful shutdown validated

### Load Tests
- [ ] 1000+ concurrent connections test passing
- [ ] Connection/disconnection cycle test passing
- [ ] Memory leak detection passing
- [ ] Mixed load stress test passing
- [ ] Performance metrics within acceptable ranges:
  - P50 latency < 50ms
  - P95 latency < 200ms
  - P99 latency < 500ms

### Code Quality
- [ ] ESLint passing with no errors
- [ ] No console.log statements in production code (use logger)
- [ ] No hardcoded credentials or secrets
- [ ] All TODOs documented with issue tracking

---

## 2. Security Validation

### Authentication & Authorization
- [ ] Session-based authentication tested
- [ ] Admin middleware blocking non-admin users
- [ ] Subscription tier middleware working correctly
- [ ] Session expiration handling validated
- [ ] User ID mismatch detection working

### Rate Limiting
- [ ] Redis-backed rate limiting configured
- [ ] In-memory fallback tested
- [ ] Rate limits appropriate for production load:
  - Global: 1000 req/min per user
  - Subscribe: 100 req/min per user
  - Unsubscribe: 100 req/min per user
- [ ] Graceful degradation on Redis failure validated

### Input Validation
- [ ] All event payloads validated
- [ ] Malicious input rejected
- [ ] XSS prevention in place
- [ ] SQL injection prevention (if applicable)

### Dependency Security
- [ ] `npm audit` shows no critical vulnerabilities
- [ ] All dependencies up to date
- [ ] No deprecated packages in use
- [ ] Lockfile (`package-lock.json`) committed

---

## 3. Infrastructure Configuration

### Railway Setup
- [ ] Railway project created
- [ ] Redis service provisioned
- [ ] `REDIS_URL` environment variable set
- [ ] Redis connection tested from local machine
- [ ] Redis pub/sub tested

### Environment Variables
- [ ] All required env vars documented in `.env.example`
- [ ] Production env vars set in Railway dashboard:
  - `NODE_ENV=production`
  - `REDIS_URL` (from Railway Redis)
  - `SESSION_SECRET` (strong random value)
  - `DATABASE_URL` (MongoDB connection)
  - `PORT` (Railway auto-assigns)
- [ ] No secrets committed to repository
- [ ] Secrets rotation procedure documented

### Database
- [ ] MongoDB connection string tested
- [ ] Database migrations applied (if any)
- [ ] Indexes created for performance
- [ ] Database backups configured
- [ ] Connection pooling configured

---

## 4. Performance Validation

### Benchmarks
- [ ] Load test results documented
- [ ] Baseline metrics established:
  - Connections/second capacity
  - Memory usage per connection
  - CPU usage under load
  - Network I/O throughput
- [ ] Performance regression tests passing
- [ ] Memory leaks checked with extended runs

### Optimization
- [ ] Redis adapter enabled for horizontal scaling
- [ ] Connection pooling configured
- [ ] Event handlers optimized
- [ ] Broadcast mechanisms tested at scale
- [ ] Graceful shutdown prevents data loss

---

## 5. Monitoring & Observability

### Health Checks
- [ ] `/health` endpoint implemented
- [ ] `/health/redis` endpoint implemented
- [ ] Health checks return proper status codes
- [ ] Railway health check configured

### Logging
- [ ] Structured logging in place
- [ ] Log levels appropriate (info/warn/error)
- [ ] No sensitive data in logs
- [ ] Log aggregation configured (Railway logs)

### Metrics
- [ ] WebSocket connection metrics tracked
- [ ] Redis adapter metrics available
- [ ] Error rate tracking in place
- [ ] Performance metrics logged

### Alerting
- [ ] Redis connection failure alerts configured
- [ ] High error rate alerts configured
- [ ] Memory usage alerts configured
- [ ] WebSocket connection threshold alerts set

---

## 6. Documentation

### Technical Documentation
- [ ] `docs/deployment/RAILWAY_REDIS_SETUP.md` complete
- [ ] `docs/deployment/PRE_DEPLOYMENT_CHECKLIST.md` complete
- [ ] `docs/deployment/POST_DEPLOYMENT_CHECKLIST.md` complete
- [ ] `WEBSOCKET_API.md` complete (Phase 3.5)
- [ ] `WEBSOCKET_ARCHITECTURE.md` complete (Phase 3.5)

### Operational Documentation
- [ ] Deployment procedure documented
- [ ] Rollback procedure documented
- [ ] Incident response runbook created
- [ ] Escalation contacts documented

### Code Documentation
- [ ] All public APIs documented
- [ ] Complex logic commented
- [ ] README updated with WebSocket setup
- [ ] CHANGELOG updated

---

## 7. Deployment Preparation

### Build Process
- [ ] Production build tested locally
- [ ] Build artifacts verified
- [ ] No build warnings in production mode
- [ ] Start command tested: `node src/index.js`

### CI/CD Pipeline
- [ ] GitHub Actions workflow configured
- [ ] Automated tests running on PR
- [ ] Automated deployment to Railway on merge to main
- [ ] Rollback automation tested

### Rollback Plan
- [ ] Previous version tagged in git
- [ ] Rollback procedure documented
- [ ] Database rollback plan (if schema changes)
- [ ] Redis data retention verified
- [ ] Rollback tested in staging

---

## 8. Team Readiness

### Knowledge Transfer
- [ ] Team trained on WebSocket architecture
- [ ] Deployment procedure reviewed with team
- [ ] Monitoring dashboards shared with team
- [ ] On-call rotation established

### Communication
- [ ] Deployment window communicated
- [ ] Stakeholders notified
- [ ] User communication prepared (if downtime)
- [ ] Support team briefed

---

## 9. Final Validation

### Staging Environment
- [ ] Deployed to staging environment
- [ ] Smoke tests passing in staging
- [ ] Performance validated in staging
- [ ] Security scan completed in staging
- [ ] User acceptance testing completed

### Production Readiness
- [ ] All checklist items completed
- [ ] Deployment approved by team lead
- [ ] Deployment window scheduled
- [ ] Monitoring team on standby
- [ ] Rollback plan reviewed

---

## Sign-Off

**Completed By**: ___________________________
**Date**: ___________________________
**Approved By**: ___________________________
**Deployment Scheduled**: ___________________________

---

## Quick Reference Commands

```bash
# Run all tests
npm test -- --no-coverage

# Run unit tests only
npm test -- tests/unit/ --no-coverage

# Run integration tests only
npm test -- tests/integration/ --no-coverage

# Run load tests only
npm test -- tests/load/ --no-coverage

# Check for vulnerabilities
npm audit

# Test Redis connection
railway run node scripts/test-redis-connection.js

# View Railway logs
railway logs

# Check Railway status
railway status

# Production build test
NODE_ENV=production node src/index.js
```
