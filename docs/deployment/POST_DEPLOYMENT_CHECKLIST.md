# Post-Deployment Checklist

Validation checklist immediately after deploying WebSocket server to Railway production.

## 1. Immediate Health Checks (First 5 Minutes)

### Service Availability
- [ ] Application deployed successfully (Railway dashboard shows "Active")
- [ ] No deployment errors in Railway logs
- [ ] Health endpoint responding: `GET https://your-app.railway.app/health`
- [ ] Redis health endpoint responding: `GET https://your-app.railway.app/health/redis`

### WebSocket Server
- [ ] WebSocket server started successfully (check logs for "✅ WebSocket server initialized")
- [ ] Redis adapter initialized (check logs for "✅ Redis adapter initialized")
- [ ] No initialization errors in logs
- [ ] Server listening on correct port

### Database & Redis
- [ ] MongoDB connection established
- [ ] Redis connection established
- [ ] Redis pub/sub clients created
- [ ] No connection errors in logs

---

## 2. Smoke Tests (First 15 Minutes)

### Basic Connectivity
- [ ] WebSocket connection succeeds from test client
- [ ] Authentication middleware working
- [ ] Session validation working
- [ ] Rate limiting active

### Event Flow
- [ ] Subscribe to portfolio updates works
- [ ] Subscribe to trades works
- [ ] Subscribe to watchlist works
- [ ] Unsubscribe events work
- [ ] Broadcast messages delivered

### Error Handling
- [ ] Unauthenticated connections rejected
- [ ] Rate limit exceeded returns proper error
- [ ] Invalid events handled gracefully
- [ ] Disconnect handling works

---

## 3. Performance Validation (First 30 Minutes)

### Load Testing
- [ ] Run load test against production: `npm run test:load:prod`
- [ ] 100+ concurrent connections successful
- [ ] Connection latency acceptable (P95 < 200ms)
- [ ] No memory leaks detected
- [ ] CPU usage normal

### Resource Utilization
- [ ] Memory usage within expected range (check Railway metrics)
- [ ] CPU usage normal (< 50% average)
- [ ] Network I/O healthy
- [ ] Redis memory usage normal
- [ ] No resource exhaustion warnings

---

## 4. Monitoring Setup (First Hour)

### Railway Dashboard
- [ ] Application metrics visible
- [ ] Redis metrics visible
- [ ] No error spikes
- [ ] Response time acceptable
- [ ] Deployment marked as healthy

### Log Aggregation
- [ ] Logs flowing to Railway logs
- [ ] Log levels appropriate
- [ ] No excessive error logs
- [ ] Structured logging working
- [ ] No sensitive data in logs

### Alerting
- [ ] Redis connection failure alert tested
- [ ] High error rate alert tested
- [ ] Memory usage alert configured
- [ ] Alert channels verified (email/Slack/PagerDuty)

### Custom Metrics
- [ ] WebSocket connection count tracked
- [ ] Active users count tracked
- [ ] Event throughput measured
- [ ] Error rate calculated
- [ ] Baseline metrics documented

---

## 5. Security Validation (First Hour)

### Authentication
- [ ] Session-based auth working
- [ ] Expired sessions rejected
- [ ] Invalid sessions rejected
- [ ] User ID mismatch detected

### Authorization
- [ ] Admin-only events blocked for non-admins
- [ ] Subscription tier restrictions working
- [ ] User isolation verified (no cross-user data leaks)

### Rate Limiting
- [ ] Redis-backed rate limiting active
- [ ] Rate limit headers present
- [ ] Limit exceeded returns 429
- [ ] Graceful degradation on Redis failure tested

### SSL/TLS
- [ ] HTTPS enforced
- [ ] WebSocket using WSS (secure)
- [ ] Certificate valid
- [ ] No mixed content warnings

---

## 6. Integration Testing (First 2 Hours)

### Frontend Integration
- [ ] Dashboard connects to WebSocket server
- [ ] Real-time updates displaying
- [ ] Portfolio updates working
- [ ] Trade notifications working
- [ ] Watchlist quotes updating

### Backend Integration
- [ ] Trade execution service emitting events
- [ ] User service integration working
- [ ] Broker adapters emitting events
- [ ] Analytics service receiving events

### Third-Party Services
- [ ] MongoDB queries working
- [ ] Redis pub/sub working
- [ ] External API calls working (if any)

---

## 7. User Acceptance (First 4 Hours)

### Internal Testing
- [ ] Team members test production deployment
- [ ] Real user scenarios tested
- [ ] Edge cases validated
- [ ] No critical issues reported

### Gradual Rollout (if applicable)
- [ ] Feature flag enabled for 10% users
- [ ] Monitor metrics for 10% cohort
- [ ] No performance degradation
- [ ] No error rate increase
- [ ] Expand to 50% if healthy
- [ ] Monitor 50% cohort
- [ ] Enable for 100% when validated

---

## 8. Documentation Updates

### Deployment Log
- [ ] Deployment timestamp recorded
- [ ] Deployed version/commit recorded
- [ ] Deployment duration documented
- [ ] Any issues encountered documented
- [ ] Post-deployment changes documented

### Runbooks
- [ ] Incident response runbook verified
- [ ] Escalation procedure confirmed
- [ ] Rollback procedure accessible
- [ ] On-call contacts updated

---

## 9. Team Communication

### Status Updates
- [ ] Deployment success communicated to team
- [ ] Stakeholders notified
- [ ] Support team updated
- [ ] User communication sent (if applicable)

### Handoff
- [ ] On-call engineer briefed
- [ ] Monitoring dashboards shared
- [ ] Known issues documented
- [ ] Next steps communicated

---

## 10. Baseline & Metrics (First 24 Hours)

### Performance Baselines
- [ ] Establish baseline connection count
- [ ] Establish baseline latency (P50, P95, P99)
- [ ] Establish baseline error rate
- [ ] Establish baseline resource usage
- [ ] Document baselines for future comparison

### Business Metrics
- [ ] Active WebSocket users count
- [ ] Average session duration
- [ ] Peak concurrent connections
- [ ] Events per second throughput

### Error Analysis
- [ ] Review error logs for patterns
- [ ] Categorize errors (client/server/network)
- [ ] No critical errors unaddressed
- [ ] Minor errors documented for future fix

---

## 11. Continuous Monitoring (First Week)

### Daily Checks
- [ ] Day 1: Review metrics, no degradation
- [ ] Day 2: Review metrics, no degradation
- [ ] Day 3: Review metrics, no degradation
- [ ] Day 7: Week 1 review meeting scheduled

### Weekly Review
- [ ] Performance trends analyzed
- [ ] Error trends analyzed
- [ ] User feedback collected
- [ ] Optimization opportunities identified
- [ ] Action items for improvements documented

---

## 12. Rollback Decision

### Rollback Criteria
If ANY of these occur, initiate rollback:
- [ ] Critical security vulnerability discovered
- [ ] > 5% error rate sustained for > 15 minutes
- [ ] WebSocket server crashes repeatedly
- [ ] Redis connection failures causing service degradation
- [ ] Data integrity issues detected
- [ ] Performance degradation > 50% from baseline

### Rollback Execution
- [ ] Rollback initiated: Yes / No
- [ ] Rollback completed successfully: Yes / No / N/A
- [ ] Rollback duration: _____ minutes
- [ ] Root cause analysis scheduled
- [ ] Fix planned for re-deployment

---

## Sign-Off

**Deployment Completed**: ___________________________
**Post-Deployment Validation Completed**: ___________________________
**Validated By**: ___________________________
**Date**: ___________________________
**Status**: ✅ Successful / ⚠️ Successful with Issues / ❌ Rollback Required

---

## Quick Reference Commands

```bash
# Check Railway deployment status
railway status

# View live logs
railway logs --tail

# Test WebSocket connection
wscat -c wss://your-app.railway.app

# Test health endpoints
curl https://your-app.railway.app/health
curl https://your-app.railway.app/health/redis

# Run smoke tests
npm run test:smoke:prod

# Run load tests against production
npm run test:load:prod

# Check Redis connection
railway run redis-cli -u $REDIS_URL ping

# View Redis info
railway run redis-cli -u $REDIS_URL info stats

# Emergency rollback
railway rollback

# View deployment history
railway deployments
```

---

## Incident Response

### If Issues Detected:

1. **Assess Severity**:
   - Critical: Rollback immediately
   - High: Investigate and fix within 1 hour
   - Medium: Document and schedule fix
   - Low: Add to backlog

2. **Communicate**:
   - Notify team in #incidents Slack channel
   - Update status page (if applicable)
   - Keep stakeholders informed

3. **Debug**:
   - Check Railway logs: `railway logs`
   - Check Redis status: `railway run redis-cli info`
   - Check database connection
   - Review recent code changes

4. **Resolve**:
   - Apply hotfix if possible
   - Rollback if necessary
   - Document incident and resolution

5. **Post-Mortem**:
   - Schedule post-mortem meeting
   - Document root cause
   - Create action items to prevent recurrence
   - Update runbooks
