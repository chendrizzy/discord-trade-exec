# Deployment Scripts

This directory contains deployment automation and validation scripts for the Discord Trade Executor SaaS platform.

---

## Scripts Overview

### Production Deployment

#### `validate-websocket-deployment.js`
**Purpose**: Validates WebSocket integration deployment to production (Week 3 Track B)

**Usage**:
```bash
# Quick validation (6 tests, ~30 seconds)
npm run deploy:validate

# Comprehensive validation (7 tests with performance metrics)
npm run deploy:validate:comprehensive

# Custom deployment URL
DEPLOYMENT_URL=https://your-custom-url.com npm run deploy:validate
```

**Tests**:
1. Health Check - Validates `/health` endpoint and WebSocket stats
2. Dashboard Accessibility - Confirms React app loads correctly
3. API Endpoint - Verifies `/api` endpoint with WebSocket info
4. WebSocket Connection - Tests WebSocket server connectivity
5. Bundle Size Check - Validates bundle structure
6. Security Headers - Confirms security headers (Helmet)
7. Performance Metrics (comprehensive mode only) - Lighthouse integration

**Exit Codes**:
- `0` - All tests passed
- `1` - One or more tests failed

**Example Output**:
```
============================================================
Week 3 Track B Deployment Validation
============================================================

Deployment URL: https://discord-trade-exec-production.up.railway.app
Validation Mode: quick
Timestamp: 2025-10-17T12:00:00.000Z

📋 Test 1: Health Check
✅ Health check passed (234ms)
  WebSocket connections: 0
  Total connections: 523

📋 Test 2: Dashboard Accessibility
✅ Dashboard accessible (156ms)
  React app HTML detected

...

============================================================
Validation Summary
============================================================

Total Tests: 6
✅ Passed: 6
⚠️  Warnings: 1

Total Duration: 2345ms

Detailed Results:
  ✅ Health Check: WebSocket stats present (234ms)
  ✅ Dashboard Accessibility: React app present (156ms)
  ✅ API Endpoint: WebSocket info present (189ms)
  ✅ WebSocket Connection: Server requires auth (expected) (567ms)
  ✅ Bundle Size: 10 JS, 1 CSS files (123ms)
  ✅ Security Headers: All headers present (98ms)

============================================================
🎉 DEPLOYMENT VALIDATION PASSED
============================================================
```

---

### Staging/Testing

#### `deploy-staging.sh`
**Purpose**: Deploy to staging environment with validation

**Usage**:
```bash
npm run deploy:staging
```

#### `validate-order-types.js`
**Purpose**: Validate order type support across brokers

**Usage**:
```bash
npm run test:order-types:staging
```

#### `stress-test-rate-limits.js`
**Purpose**: Stress test rate limiting for broker APIs

**Usage**:
```bash
# Test all brokers
npm run test:rate-limit:staging

# Test specific broker
npm run test:rate-limit:ibkr
npm run test:rate-limit:schwab
npm run test:rate-limit:alpaca
```

---

## Deployment Workflow

### Pre-Deployment
1. **Local Testing**
   ```bash
   npm run build:dashboard
   npm start
   npm test
   ```

2. **Code Review**
   - All tests passing
   - No console errors
   - Performance validated

### Deployment
3. **Deploy to Railway**
   ```bash
   git push origin main  # Automatic Railway deployment
   # OR
   npm run deploy  # Manual Railway CLI deployment
   ```

4. **Monitor Deployment**
   ```bash
   railway logs --tail
   ```

### Post-Deployment
5. **Validate Deployment**
   ```bash
   npm run deploy:validate
   ```

6. **Manual Verification**
   - Visit production URL
   - Test core functionality
   - Check browser DevTools for errors
   - Verify WebSocket connection

7. **Monitor Metrics**
   - Railway dashboard (CPU, memory, network)
   - WebSocket connection count
   - Error rates
   - User feedback

---

## Environment Variables

### Required for Validation Scripts

**DEPLOYMENT_URL** (optional)
- Default: `https://discord-trade-exec-production.up.railway.app`
- Description: Production deployment URL to validate
- Example: `DEPLOYMENT_URL=https://custom-url.com npm run deploy:validate`

**VALIDATION_MODE** (optional)
- Default: `quick`
- Options: `quick`, `comprehensive`
- Description: Validation thoroughness level
- Example: `VALIDATION_MODE=comprehensive npm run deploy:validate`

### Required for Production Deployment

See `.env.example` for complete list. Key variables:
- `NODE_ENV=production`
- `PORT=5000`
- `MONGODB_URI` - Database connection
- `DISCORD_BOT_TOKEN` - Discord bot authentication
- `SESSION_SECRET` - Session encryption
- `JWT_SECRET` - JWT signing

All configured in Railway environment variables.

---

## Troubleshooting

### Validation Script Fails

**Health check timeout**
```bash
# Check if server is running
curl https://discord-trade-exec-production.up.railway.app/health

# Check Railway logs
railway logs --tail
```

**WebSocket connection fails**
```bash
# Test WebSocket manually
wscat -c wss://discord-trade-exec-production.up.railway.app

# Check WebSocket server status
curl https://discord-trade-exec-production.up.railway.app/api | jq .endpoints.websocket
```

**Bundle size warnings**
- Rebuild dashboard: `npm run build:dashboard`
- Check dist/dashboard size: `du -sh dist/dashboard`
- Compare with baseline (1.1M)

### Deployment Issues

**Build fails on Railway**
```bash
# Verify local build works
npm run build:dashboard

# Check Railway build logs
railway logs --deployment <deployment-id>
```

**Health checks failing**
```bash
# Check server started successfully
railway logs --tail | grep "running on port"

# Verify health endpoint locally
npm start
curl http://localhost:5000/health
```

**WebSocket not working in production**
1. Check Railway logs for WebSocket initialization
2. Verify CORS configuration (DASHBOARD_URL, FRONTEND_URL)
3. Test WebSocket connection with browser DevTools
4. Check for proxy/load balancer issues (Railway handles this)

---

## Monitoring

### Real-Time Monitoring
```bash
# Railway logs
railway logs --tail

# Railway metrics (dashboard)
open https://railway.app/project/discord-trade-exec

# Health check (every 30s by Railway)
watch -n 30 'curl -s https://discord-trade-exec-production.up.railway.app/health | jq'
```

### Performance Monitoring
```bash
# Lighthouse audit
lighthouse https://discord-trade-exec-production.up.railway.app --view

# WebSocket stats
curl https://discord-trade-exec-production.up.railway.app/health | jq .websocket
```

### Error Monitoring
- Railway logs for server errors
- Browser DevTools console for client errors
- `/health` endpoint for WebSocket stats
- User feedback via support channels

---

## Best Practices

### Before Deployment
- ✅ Run all tests locally
- ✅ Build and test production bundle
- ✅ Review code changes
- ✅ Update documentation
- ✅ Notify team of deployment window

### During Deployment
- ✅ Monitor Railway deployment logs
- ✅ Watch for build/start errors
- ✅ Verify health checks pass
- ✅ Run validation script immediately

### After Deployment
- ✅ Validate functionality manually
- ✅ Monitor for 15 minutes actively
- ✅ Check error rates
- ✅ Collect user feedback
- ✅ Document any issues

### Rollback Plan
- ✅ Know how to rollback (Railway dashboard)
- ✅ Test rollback procedure in staging
- ✅ Document rollback decision criteria
- ✅ Communicate rollback to team

---

## Scripts Reference

| Script | Purpose | Duration | Exit Code |
|--------|---------|----------|-----------|
| `validate-websocket-deployment.js` | Validate WebSocket deployment | ~30s | 0 = pass, 1 = fail |
| `deploy-staging.sh` | Deploy to staging | ~5min | 0 = success |
| `validate-order-types.js` | Test order types | ~2min | 0 = pass, 1 = fail |
| `stress-test-rate-limits.js` | Test rate limits | ~5min | 0 = pass, 1 = fail |

---

## Documentation

### Deployment Guides
- [Week 3 Track B Deployment Strategy](../../docs/WEEK3_TRACKB_DEPLOYMENT_STRATEGY.md) - Comprehensive strategy
- [Week 3 Track B Deployment Checklist](../../docs/WEEK3_TRACKB_DEPLOYMENT_CHECKLIST.md) - Step-by-step checklist
- [Week 3 Track B Deployment Summary](../../docs/WEEK3_TRACKB_DEPLOYMENT_SUMMARY.md) - Quick reference
- [General Deployment Guide](../../docs/DEPLOYMENT.md) - Platform-agnostic guide
- [Pre-Deployment Checklist](../../docs/PRE-DEPLOYMENT-CHECKLIST.md) - General pre-deployment steps

### Related Docs
- [Railway Configuration](../../railway.toml) - Railway build/deploy config
- [Environment Variables](../../.env.example) - All environment variables
- [Package Scripts](../../package.json) - All npm scripts

---

## Support

For deployment issues:
1. Check Railway logs: `railway logs --tail`
2. Run validation script: `npm run deploy:validate`
3. Review deployment guide: `docs/WEEK3_TRACKB_DEPLOYMENT_STRATEGY.md`
4. Contact DevOps team

---

**Last Updated**: 2025-10-17
**Version**: 1.0.0
