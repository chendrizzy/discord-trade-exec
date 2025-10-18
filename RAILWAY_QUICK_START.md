# Railway Deployment - Quick Start Guide

## Railway Environment Variables

### Required Variables
```bash
# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/discord-trade-exec

# Discord OAuth
DISCORD_CLIENT_ID=123456789012345678
DISCORD_CLIENT_SECRET=your-discord-oauth-client-secret
DISCORD_BOT_TOKEN=MTIzNDU2Nzg5MDEyMzQ1Njc4OTA.ABCDEF.your-discord-bot-token
DISCORD_CALLBACK_URL=https://your-app.railway.app/auth/discord/callback

# Application URLs
DASHBOARD_URL=https://your-app.railway.app
FRONTEND_URL=https://your-app.railway.app

# Security
SESSION_SECRET=your-random-32-character-secret-key-here
JWT_SECRET=your-random-jwt-secret-key
ENCRYPTION_KEY=your-random-32-byte-encryption-key

# Environment
NODE_ENV=production
PORT=5000
```

### Optional Variables (Configure Later)
```bash
# Brokers - configure via OAuth dashboard after deployment
# No need to set these in Railway

# Redis (for WebSocket scaling across multiple instances)
REDIS_URL=redis://default:password@redis-host:6379

# AWS KMS (for enterprise credential encryption)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_KMS_CMK_ID=your-kms-key-id
```

## Deployment Steps

### 1. Create Railway Project
```bash
# Install Railway CLI (if not already installed)
npm install -g @railway/cli

# Login to Railway
railway login

# Initialize project
railway init
```

### 2. Link GitHub Repository
- Go to Railway dashboard
- Click "New Project"
- Select "Deploy from GitHub repo"
- Choose `discord-trade-exec` repository
- Railway will auto-detect Node.js

### 3. Configure Environment Variables
1. Go to project settings in Railway
2. Click "Variables" tab
3. Add all **Required Variables** from above
4. Click "Deploy"

### 4. Verify Deployment
```bash
# Check deployment logs
railway logs

# Should see:
# ✅ Configuration validated successfully
# ⚠️  No brokers configured via environment variables
# ⚠️  Users will need to configure brokers via OAuth dashboard
# ✅ MongoDB connected
# ✅ Discord bot initialized successfully
# 🚀 Discord Trade Executor SaaS running on port 5000

# Test health endpoint
curl https://your-app.railway.app/health
```

### 5. Configure Brokers via Dashboard
1. Visit `https://your-app.railway.app/dashboard/brokers`
2. Click "Connect Broker"
3. Complete OAuth flow for your broker (Alpaca, Schwab, etc.)
4. Credentials are stored encrypted in MongoDB

## Troubleshooting

### Deployment Fails with SIGTERM
**Cause**: Missing required environment variables

**Solution**:
1. Check Railway logs for validation errors
2. Verify all **Required Variables** are set
3. Ensure `MONGODB_URI` is accessible from Railway
4. Confirm Discord credentials are valid

### MongoDB Connection Fails
**Cause**: Network access or invalid connection string

**Solution**:
1. Whitelist Railway's IP addresses in MongoDB Atlas (or use `0.0.0.0/0` for all)
2. Verify connection string format: `mongodb+srv://user:pass@cluster.mongodb.net/db`
3. Test connection locally with same URI

### Discord Bot Doesn't Connect
**Cause**: Invalid Discord bot token

**Solution**:
1. Go to Discord Developer Portal
2. Copy bot token (not OAuth2 client ID)
3. Update `DISCORD_BOT_TOKEN` in Railway
4. Redeploy

### No Brokers Available
**Cause**: This is expected!

**Solution**:
- Brokers are configured via the UI dashboard, not environment variables
- Follow step 5 above to configure brokers via OAuth

## Railway Configuration Files

### railway.toml
```toml
[build]
builder = "NIXPACKS"

[deploy]
startCommand = "npm start"
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 10

[build.nixpacksPlan.phases.setup]
cmds = ["npm install"]

[build.nixpacksPlan.phases.build]
cmds = ["npm run build:dashboard"]

[deploy.healthcheck]
path = "/health"
interval = 30
timeout = 10
```

This configuration is already in the repository and Railway will use it automatically.

## Post-Deployment Checklist

- [ ] Health check endpoint returns 200 OK
- [ ] MongoDB connection successful (check logs)
- [ ] Discord bot online in Discord server
- [ ] Dashboard accessible at `https://your-app.railway.app`
- [ ] OAuth login flow works
- [ ] Broker configuration page accessible
- [ ] WebSocket connection established (check browser console)

## Monitoring

### Railway Dashboard
- CPU usage: Should stay under 50%
- Memory usage: Should stay under 512MB
- Response time: Should be under 500ms

### Application Logs
```bash
# Watch live logs
railway logs --follow

# Check for errors
railway logs | grep "❌"

# Check configuration validation
railway logs | grep "Configuration validated"
```

### Health Endpoint
```bash
# Monitor health
watch -n 10 "curl -s https://your-app.railway.app/health | jq ."
```

## Scaling

### Horizontal Scaling
If you need multiple instances:
1. Set up Redis for WebSocket adapter
2. Add `REDIS_URL` environment variable
3. Increase Railway instance count
4. WebSocket connections will sync across instances

### Vertical Scaling
If single instance needs more resources:
1. Go to Railway project settings
2. Increase RAM allocation (512MB → 1GB)
3. Increase CPU allocation (1 core → 2 cores)

## Cost Optimization

### Free Tier
- Railway offers $5 free credits per month
- Covers ~100 hours of runtime
- Perfect for development/testing

### Production Tier
- $0.000231/GB-sec for RAM
- $0.000463/vCPU-sec for CPU
- Estimate: $10-20/month for single instance

### Cost Reduction Tips
- Use MongoDB Atlas free tier (512MB)
- Optimize WebSocket connections
- Enable Redis only when needed for multi-instance
- Use Railway's sleep feature for non-production environments

## Support

**Railway Issues**: https://help.railway.app
**Application Issues**: See `RAILWAY_DEPLOYMENT_FIX.md`
**Discord Bot Issues**: https://discord.com/developers/docs
