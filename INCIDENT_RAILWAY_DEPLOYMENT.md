# Railway Production Deployment Incident Report

**Date**: 2025-10-24
**Incident**: Railway production deployment failures
**Status**: INVESTIGATING
**Severity**: HIGH (Production service unavailable)

---

## Executive Summary

Railway production deployment is experiencing runtime crashes after successful builds. All required environment variables are properly configured, but the application fails to start, returning 502 errors on health checks.

---

## Timeline

### Initial Issue Detection
- **18:46:01** - First deployment attempt with original script
- **Error**: Missing required environment variables (false positive - validation syntax issue)

### Root Cause Analysis - Phase 1
- **Finding**: Railway CLI syntax changed - `railway variables get KEY` command no longer supported
- **Impact**: Deployment script incorrectly reported missing env vars despite all being configured
- **Resolution**: Updated validation logic to use `railway variables --json` with jq parsing

### Root Cause Analysis - Phase 2
- **Finding**: Deployment URL detection logic incompatible with Railway CLI JSON structure
- **Impact**: Health check step failed due to inability to extract service domain
- **Resolution**: Enhanced URL extraction with environment ID filtering and fallback logic

### Current Status
- **18:47:35** - Fixed deployment script successfully validates all env vars
- **18:47:40** - Deployment triggered successfully
- **18:48:20** - Build completed, application starting
- **18:49:15** - Application CRASHED during startup
- **18:50:10** - Redeployed to gather additional diagnostic information
- **Status**: Build in progress (deployment ID: 77d07c16-675e-408d-b533-4450fdb6b504)

---

## Environment Variable Validation

### Required Production Variables (16/16 Configured ✓)

#### Core Application
- ✅ NODE_ENV = "production"
- ✅ PORT = 5000

#### Database
- ✅ MONGODB_URI = mongodb+srv://justinscchen_db_user:***@cluster0.avzflev.mongodb.net/...

#### Session & Authentication
- ✅ SESSION_SECRET = (64 bytes hex)
- ✅ JWT_SECRET = (128 bytes hex)

#### Discord OAuth
- ✅ DISCORD_CLIENT_ID = 1419752876128866457
- ✅ DISCORD_CLIENT_SECRET = ***
- ✅ DISCORD_CALLBACK_URL = https://discord-trade-exec-production.up.railway.app/auth/discord/callback

#### Discord Bot
- ✅ DISCORD_BOT_TOKEN = ***

#### Encryption & Security
- ✅ ENCRYPTION_KEY = (64 bytes hex)

#### AWS KMS (Credential Encryption)
- ✅ AWS_REGION = us-east-2
- ✅ AWS_ACCESS_KEY_ID = AKIA4EO3TNZUKMROK2FS
- ✅ AWS_SECRET_ACCESS_KEY = ***
- ✅ AWS_KMS_CMK_ID = 23ced76e-1b37-4263-8fb7-a24e00ff44c5

#### URLs
- ✅ DASHBOARD_URL = https://discord-trade-exec-production.up.railway.app
- ✅ FRONTEND_URL = https://discord-trade-exec-production.up.railway.app

### Optional Variables Also Configured
- ✅ REDIS_URL = redis://default:***@switchyard.proxy.rlwy.net:26205
- ✅ ALPACA_API_KEY, ALPACA_SECRET, ALPACA_IS_TESTNET
- ✅ KRAKEN_API_KEY, KRAKEN_PRIVATE_KEY
- ✅ IBKR_CLIENT_ID, IBKR_HOST, IBKR_PORT
- ✅ MOOMOO_WEBSOCKET_KEY
- ✅ MFA_ENCRYPTION_KEY
- ✅ BROKER_INTEGRATIONS_ENABLED, ALLOWED_BROKERS

---

## Diagnostic Information

### Deployment Configuration

**Railway Project**: be693797-c61a-4090-ad30-174e893001c4
**Service**: discord-trade-exec (76d57a2f-3b8b-49cf-b877-23bb32d137f9)
**Environment**: production (134de673-37e5-4c79-85ee-3a0ca1dffafb)
**Domain**: discord-trade-exec-production.up.railway.app

### Build Configuration

**File**: `railway.toml`
```toml
[build]
builder = "NIXPACKS"

[build.nixpacksPlan.phases.setup]
cmds = ["npm install"]

[build.nixpacksPlan.phases.build]
cmds = ["npm run build:dashboard"]

[deploy]
startCommand = "npm start"
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 10

[deploy.healthcheck]
path = "/health"
interval = 30
timeout = 10
```

**File**: `nixpacks.toml`
```toml
[variables]
NODE_VERSION = "20.19.0"

[phases.install]
cmds = ["npm install"]

[phases.build]
cmds = ["npm run build:dashboard"]

[start]
cmd = "npm start"
```

### Application Startup Sequence

1. **Entry Point**: `src/index.js`
   - Loads environment variables via dotenv
   - Validates config using Joi schemas (`config/validator.js`)
   - Runs legacy environment validation (`utils/env-validation.js`)
   - Connects to MongoDB
   - Creates Express app
   - Starts WebSocket server
   - Initializes Discord bot
   - Starts marketing automation (if configured)

2. **Health Endpoint**: `GET /health`
   - Checks Redis connection
   - Returns MongoDB status
   - Reports WebSocket state
   - Returns Discord bot status

### Crash Analysis

**Symptom**: Application crashes immediately after startup
**Health Check Response**: 502 Bad Gateway - "Application failed to respond"
**Deployment Status**: CRASHED (stopped: true)

**Possible Root Causes**:
1. ❓ MongoDB connection timeout/failure
2. ❓ Redis connection issues
3. ❓ Discord bot initialization failure
4. ❓ AWS KMS credential validation issue
5. ❓ Missing/incorrect npm dependencies
6. ❓ Runtime error in environment validation
7. ❓ Port binding conflict (unlikely - Railway handles this)

---

## Fixes Implemented

### Fix #1: Environment Variable Validation Syntax
**Commit**: 1f73ef6
**File**: `scripts/deploy/railway-deploy.sh`

```bash
# OLD (broken):
if ! railway variables get "$var" &> /dev/null; then
  MISSING_VARS+=("$var")
fi

# NEW (working):
VARIABLES_JSON=$(railway variables --json 2>/dev/null || echo "{}")
for var in "${REQUIRED_VARS[@]}"; do
  if ! echo "$VARIABLES_JSON" | jq -e "has(\"$var\")" &> /dev/null; then
    MISSING_VARS+=("$var")
  fi
done
```

### Fix #2: Deployment URL Detection
**Commit**: 8c4c403
**File**: `scripts/deploy/railway-deploy.sh`

```bash
# OLD (broken):
DEPLOY_URL=$(railway status --json | jq -r '.deployments[0].url')

# NEW (working):
# Get Railway environment ID early
RAILWAY_ENVIRONMENT_ID=$(railway variables --json | jq -r '.RAILWAY_ENVIRONMENT_ID // empty')

# Extract domain from service instances for current environment
DEPLOY_URL=$(railway status --json | jq -r '.services.edges[0].node.serviceInstances.edges[] | select(.node.environmentId == "'$RAILWAY_ENVIRONMENT_ID'") | .node.domains.serviceDomains[0].domain' | head -1)

# Fallback to environment variables
if [[ -z "$DEPLOY_URL" || "$DEPLOY_URL" == "null" ]]; then
  DEPLOY_URL=$(railway variables --json | jq -r '.RAILWAY_PUBLIC_DOMAIN // .DASHBOARD_URL // empty' | sed 's|https://||' | sed 's|http://||')
fi

# Ensure URL has https:// prefix
if [[ ! "$DEPLOY_URL" =~ ^https?:// ]]; then
  DEPLOY_URL="https://$DEPLOY_URL"
fi
```

---

## Next Steps

### Immediate Actions (Priority 1)
1. ✅ Verify all required env vars configured
2. ✅ Fix deployment script validation logic
3. ✅ Fix URL detection for health checks
4. 🔄 Monitor current deployment (77d07c16-675e-408d-b533-4450fdb6b504)
5. ⏳ Access Railway dashboard logs for crash details
6. ⏳ Identify specific startup failure point
7. ⏳ Implement fix for runtime crash
8. ⏳ Redeploy with fix
9. ⏳ Verify health check passes

### Investigation Actions
- [ ] Review Railway deployment logs via dashboard
- [ ] Check MongoDB connection from Railway environment
- [ ] Verify Redis connectivity
- [ ] Test AWS KMS credential validation
- [ ] Check Discord bot token validity
- [ ] Review application startup error logs
- [ ] Verify npm dependency installation

### Preventive Actions (Post-Resolution)
- [ ] Add pre-deployment connection tests (MongoDB, Redis, AWS KMS)
- [ ] Enhance deployment script with better error logging
- [ ] Add deployment smoke tests
- [ ] Create deployment monitoring dashboard
- [ ] Document common deployment issues
- [ ] Add Railway deployment to CI/CD pipeline with automated validation

---

## Resources

### Railway Dashboard Links
- **Project**: https://railway.com/project/be693797-c61a-4090-ad30-174e893001c4
- **Service**: https://railway.com/project/be693797-c61a-4090-ad30-174e893001c4/service/76d57a2f-3b8b-49cf-b877-23bb32d137f9
- **Current Deployment**: https://railway.com/project/be693797-c61a-4090-ad30-174e893001c4/service/76d57a2f-3b8b-49cf-b877-23bb32d137f9?id=77d07c16-675e-408d-b533-4450fdb6b504
- **Previous Failed Deployment**: https://railway.com/project/be693797-c61a-4090-ad30-174e893001c4/service/76d57a2f-3b8b-49cf-b877-23bb32d137f9?id=8b2dbfdd-f174-4376-a20e-56154ce3567a

### Application Endpoints
- **Domain**: https://discord-trade-exec-production.up.railway.app
- **Health**: https://discord-trade-exec-production.up.railway.app/health
- **Dashboard**: https://discord-trade-exec-production.up.railway.app/dashboard

### Key Files
- Deployment script: `/scripts/deploy/railway-deploy.sh`
- Railway config: `/railway.toml`
- Nixpacks config: `/nixpacks.toml`
- Entry point: `/src/index.js`
- App config: `/src/app.js`
- Env validation: `/src/utils/env-validation.js`

---

## Communication

### Status Updates
- **Internal**: Update team via Slack/Discord when crash root cause identified
- **External**: No customer impact notification needed (pre-production service)

### Escalation
- **Level 1**: DevOps Engineer (current incident handler)
- **Level 2**: Backend Lead (if MongoDB/Redis/AWS issues)
- **Level 3**: CTO (if critical infrastructure issue)

---

## Lessons Learned (Post-Mortem)

### What Went Well
- ✅ Rapid identification of Railway CLI syntax changes
- ✅ Comprehensive environment variable validation
- ✅ Automated deployment script with proper validation
- ✅ All required secrets properly configured in Railway

### What Could Be Improved
- ⚠️ Deployment script should have been tested with current Railway CLI version
- ⚠️ No pre-deployment smoke tests for critical dependencies
- ⚠️ Limited visibility into Railway deployment logs via CLI
- ⚠️ No automated health check after deployment

### Action Items
- [ ] Update deployment script documentation with Railway CLI version requirements
- [ ] Add pre-deployment connection validation
- [ ] Implement post-deployment automated health checks
- [ ] Create Railway deployment runbook
- [ ] Add deployment success/failure notifications

---

**Last Updated**: 2025-10-24 18:52:00
**Next Review**: After current deployment completes
**Incident Handler**: Claude (DevOps AI)
