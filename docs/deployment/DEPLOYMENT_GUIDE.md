# Railway Deployment Guide

Complete guide for deploying the Discord Trade Exec WebSocket server to Railway.

## Quick Start

```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login to Railway
railway login

# 3. Initialize project
railway init

# 4. Add Redis
railway add --plugin redis

# 5. Set environment variables
railway variables set NODE_ENV=production
railway variables set SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")

# 6. Deploy
railway up
```

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Initial Setup](#initial-setup)
- [Environment Configuration](#environment-configuration)
- [Redis Setup](#redis-setup)
- [Database Setup](#database-setup)
- [Deployment](#deployment)
- [Post-Deployment](#post-deployment)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Accounts
- ✅ Railway account (https://railway.app)
- ✅ GitHub account (for GitHub integration)
- ✅ MongoDB Atlas account (for database)

### Required Tools
- ✅ Node.js 18+ installed
- ✅ Git installed
- ✅ Railway CLI installed

### Required Files
Before deployment, ensure you have:
- [ ] All tests passing locally
- [ ] `.env.example` updated with all required variables
- [ ] `package.json` has correct start script
- [ ] Health check endpoints implemented

---

## Initial Setup

### 1. Create Railway Project

**Via Railway Dashboard**:
1. Go to https://railway.app
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Authorize GitHub access
5. Select `discord-trade-exec` repository
6. Click "Deploy Now"

**Via Railway CLI**:
```bash
# Login
railway login

# Initialize in project directory
cd discord-trade-exec
railway init

# Link to GitHub repo
railway link
```

### 2. Configure Railway Project

```bash
# Set project name
railway project set-name discord-trade-exec

# View project details
railway status
```

---

## Environment Configuration

### 1. Copy Environment Template

```bash
cp scripts/deployment/.env.template .env.railway
```

### 2. Set Core Variables

**Via Railway CLI**:
```bash
# Application
railway variables set NODE_ENV=production

# Session secret (generate strong random value)
railway variables set SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")

# Database (from MongoDB Atlas)
railway variables set DATABASE_URL="mongodb+srv://username:password@cluster.mongodb.net/database"

# Discord OAuth (from Discord Developer Portal)
railway variables set DISCORD_CLIENT_ID="your-client-id"
railway variables set DISCORD_CLIENT_SECRET="your-client-secret"
railway variables set DISCORD_CALLBACK_URL="https://your-app.railway.app/auth/discord/callback"
```

**Via Railway Dashboard**:
1. Go to project → "Variables" tab
2. Click "Raw Editor"
3. Paste environment variables
4. Click "Save"

### 3. Verify Environment Variables

```bash
# List all variables
railway variables

# Check specific variable
railway variables | grep REDIS_URL
railway variables | grep DATABASE_URL
```

---

## Redis Setup

### 1. Add Redis Service

```bash
# Add Redis plugin
railway add --plugin redis

# Verify Redis was added
railway status
```

Railway automatically:
- ✅ Provisions Redis instance
- ✅ Sets `REDIS_URL` environment variable
- ✅ Configures Redis with:
  - Memory: 512MB (upgradeable)
  - Persistence: RDB + AOF
  - Eviction: allkeys-lru
  - TLS: Enabled

### 2. Test Redis Connection Locally

```bash
# Pull Railway environment variables
railway run node scripts/test-redis-connection.js

# Expected output:
# ✅ Redis PING successful
# ✅ Redis SET/GET successful
# ✅ Redis PUB/SUB successful
```

### 3. Configure Redis Options (Optional)

```bash
# Increase memory limit
railway variables set REDIS_MAX_MEMORY=1gb

# Change eviction policy
railway variables set REDIS_EVICTION_POLICY=volatile-lru
```

**See**: `docs/deployment/RAILWAY_REDIS_SETUP.md` for complete Redis setup guide.

---

## Database Setup

### 1. Create MongoDB Atlas Cluster

1. Go to https://cloud.mongodb.com
2. Create new cluster (M0 free tier or higher)
3. Create database user
4. Add IP whitelist: `0.0.0.0/0` (Railway IPs change)
5. Get connection string

### 2. Set Database URL

```bash
# Format: mongodb+srv://username:password@cluster.mongodb.net/database
railway variables set DATABASE_URL="mongodb+srv://user:pass@cluster.mongodb.net/discord-trade-exec?retryWrites=true&w=majority"
```

### 3. Test Database Connection

```bash
# Test locally with Railway env
railway run node -e "const mongoose = require('mongoose'); mongoose.connect(process.env.DATABASE_URL).then(() => console.log('✅ Connected')).catch(err => console.error('❌ Error:', err))"
```

---

## Deployment

### Pre-Deployment Checklist

**Run through**: `docs/deployment/PRE_DEPLOYMENT_CHECKLIST.md`

Key items:
- [ ] All tests passing
- [ ] No security vulnerabilities (`npm audit`)
- [ ] Environment variables set
- [ ] Database migrations applied
- [ ] Redis connection tested

### Deploy to Railway

**Option 1: Automatic (GitHub Integration)**
```bash
# Push to main branch
git add .
git commit -m "Deploy to Railway"
git push origin main

# Railway auto-deploys on push to main
```

**Option 2: Manual (Railway CLI)**
```bash
# Deploy current directory
railway up

# Deploy specific service
railway up --service=web

# Watch deployment logs
railway logs --tail
```

### Monitor Deployment

```bash
# View deployment status
railway status

# View live logs
railway logs --tail

# View deployments history
railway deployments
```

---

## Post-Deployment

### 1. Run Post-Deployment Checklist

**Follow**: `docs/deployment/POST_DEPLOYMENT_CHECKLIST.md`

### 2. Verify Health Checks

```bash
# Get your Railway URL
RAILWAY_URL=$(railway variables | grep RAILWAY_PUBLIC_DOMAIN | cut -d'=' -f2)

# Test health endpoints
curl https://$RAILWAY_URL/health
curl https://$RAILWAY_URL/health/redis
curl https://$RAILWAY_URL/health/database
curl https://$RAILWAY_URL/metrics
```

**Expected**:
```json
{"status":"healthy","timestamp":"2025-01-17T12:00:00.000Z"}
{"status":"healthy","latency":"5ms","connections":2}
{"status":"healthy","latency":"15ms","readyState":1}
```

### 3. Test WebSocket Connection

```bash
# Install wscat
npm install -g wscat

# Test WebSocket (will require authentication)
wscat -c wss://$RAILWAY_URL
```

### 4. Smoke Tests

Run production smoke tests:
```bash
# Test API endpoints
npm run test:smoke:prod

# Test WebSocket flows (if implemented)
npm run test:integration:prod
```

---

## Monitoring

### Railway Dashboard

**Access**: https://railway.app/project/{project-id}

**Monitor**:
- **Metrics**: CPU, Memory, Network, Deployments
- **Logs**: Real-time streaming
- **Deployments**: History and rollback
- **Services**: Redis, Web server status

### Application Monitoring

```bash
# View metrics
curl https://$RAILWAY_URL/metrics | jq

# View logs
railway logs --tail

# Filter logs
railway logs --tail | grep ERROR
railway logs --tail | grep WebSocket
```

### Set Up Alerts

**See**: `docs/deployment/MONITORING_SETUP.md`

**Configure**:
1. Railway webhooks for deployment failures
2. Slack notifications for errors
3. Memory/CPU threshold alerts
4. Redis connection failure alerts

---

## Scaling

### Horizontal Scaling

```bash
# Add more instances (Redis adapter required)
railway scale --replicas=3

# Verify scaling
railway status
```

**Requirements**:
- ✅ Redis adapter enabled (`REDIS_URL` set)
- ✅ Load tests passing
- ✅ Health checks implemented
- ✅ Stateless application design

### Vertical Scaling

**Via Dashboard**:
1. Project → Service → Settings
2. Increase CPU/Memory limits
3. Click "Save"
4. Service will restart

**Cost**: Railway charges based on resource usage.

---

## Rollback

### Automatic Rollback (CI/CD)

If deployment fails, GitHub Actions will automatically rollback (see `.github/workflows/deploy-railway.yml`).

### Manual Rollback

```bash
# View deployment history
railway deployments

# Rollback to previous deployment
railway rollback

# Rollback to specific deployment
railway rollback --to=deployment-id
```

### Verify Rollback

```bash
# Check current deployment
railway status

# View logs
railway logs --tail

# Test health
curl https://$RAILWAY_URL/health
```

---

## Troubleshooting

### Deployment Fails

**Check**:
```bash
railway logs
railway status
```

**Common Issues**:
- Missing environment variables
- Failed npm install
- Port binding issues
- Database connection failures

**Fix**:
```bash
# Verify env vars
railway variables

# Rebuild
railway up --force

# Check start command
railway run npm start
```

### Application Crashes

**Check**:
```bash
# View crash logs
railway logs | grep ERROR

# Check memory usage
railway status

# View metrics
curl https://$RAILWAY_URL/metrics
```

**Common Causes**:
- Out of memory
- Uncaught exceptions
- Database disconnections
- Redis failures

**Fix**:
- Increase memory limit
- Fix error handling in code
- Add health checks
- Enable graceful shutdown

### Redis Connection Issues

**Check**:
```bash
# Test Redis
curl https://$RAILWAY_URL/health/redis

# Check Redis service
railway status | grep redis

# Test connection manually
railway run redis-cli -u $REDIS_URL ping
```

**Fix**:
- Verify `REDIS_URL` is set
- Check Redis service status
- Restart Redis service
- Check connection pool settings

**See**: `docs/deployment/RAILWAY_REDIS_SETUP.md` troubleshooting section.

### Database Connection Issues

**Check**:
```bash
# Test database
curl https://$RAILWAY_URL/health/database

# Check DATABASE_URL
railway variables | grep DATABASE_URL
```

**Fix**:
- Verify MongoDB Atlas cluster is running
- Check IP whitelist (allow Railway IPs: 0.0.0.0/0)
- Verify credentials
- Check connection string format

---

## CI/CD Pipeline

### GitHub Actions Workflow

**File**: `.github/workflows/deploy-railway.yml`

**Workflow**:
1. **Quality Gates** (parallel):
   - Lint code
   - Security scan
   - Unit tests
   - Integration tests
   - Load tests

2. **Build**:
   - Build application
   - Verify artifacts

3. **Deploy**:
   - Deploy to Railway
   - Wait for deployment
   - Run health checks

4. **Smoke Tests**:
   - Test WebSocket
   - Test API endpoints

5. **Rollback** (on failure):
   - Automatic rollback
   - Notify team

### Required Secrets

**Add to GitHub** (Settings → Secrets):
```
RAILWAY_TOKEN - Railway API token
SLACK_WEBHOOK - Slack webhook URL (optional)
```

### Trigger Deployment

```bash
# Automatic deployment on push to main
git push origin main

# Manual deployment via GitHub Actions
# Go to Actions → Deploy to Railway → Run workflow
```

---

## Best Practices

### Security
- ✅ Never commit `.env` files
- ✅ Use strong random SESSION_SECRET
- ✅ Rotate credentials regularly
- ✅ Enable rate limiting
- ✅ Use HTTPS/WSS only
- ✅ Keep dependencies updated

### Performance
- ✅ Enable Redis adapter for horizontal scaling
- ✅ Optimize database queries
- ✅ Implement connection pooling
- ✅ Monitor resource usage
- ✅ Use CDN for static assets

### Reliability
- ✅ Implement health checks
- ✅ Add error handling
- ✅ Enable graceful shutdown
- ✅ Set up monitoring
- ✅ Configure alerts
- ✅ Test rollback procedures

### Development
- ✅ Test in staging first
- ✅ Use feature flags
- ✅ Document changes
- ✅ Review before merge
- ✅ Run tests locally

---

## Quick Reference

### Essential Commands

```bash
# Deploy
railway up

# View logs
railway logs --tail

# Check status
railway status

# View variables
railway variables

# Rollback
railway rollback

# Scale
railway scale --replicas=3

# Restart
railway restart

# Test health
curl https://your-app.railway.app/health
```

### Important URLs

- **Railway Dashboard**: https://railway.app
- **Project URL**: https://your-app.railway.app
- **Health Check**: https://your-app.railway.app/health
- **Metrics**: https://your-app.railway.app/metrics
- **Docs**: https://docs.railway.app

---

## Support

### Resources
- **Railway Docs**: https://docs.railway.app
- **Railway Discord**: https://discord.gg/railway
- **Railway Status**: https://status.railway.app
- **Project Docs**: `docs/deployment/`

### Escalation
1. Check Railway status page
2. Review application logs
3. Check monitoring dashboards
4. Contact team lead
5. Open Railway support ticket

---

## Next Steps

After successful deployment:

1. ✅ Monitor metrics for 24 hours
2. ✅ Run load tests against production
3. ✅ Set up alerting
4. ✅ Document any issues encountered
5. ✅ Train team on deployment process
6. ✅ Schedule regular health checks
7. ✅ Plan scaling strategy
