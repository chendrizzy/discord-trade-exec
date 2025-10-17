# Pre-Deployment Checklist

## ✅ Verification Status

### Code Quality
- [x] **Unit Tests**: 175 passing
- [x] **E2E Tests**: 16+ passing on Chromium
- [x] **Build Process**: Production build successful (61.67 KB gzipped JS)
- [x] **Linting**: No critical errors
- [x] **Security**: Helmet configured with CSP, HSTS, XSS protection

### Frontend
- [x] **React Dashboard Built**: dist/dashboard/ (216KB total)
  - index.html: 0.47 kB
  - CSS: 5.78 kB (gzipped: 1.53 kB)
  - JS: 197.35 kB (gzipped: 61.67 kB)
- [x] **Static Serving Configured**: Express serves built frontend
- [x] **SPA Routing**: Catch-all route for client-side routing
- [x] **Authentication Flow**: Discord OAuth2 working

### Backend
- [x] **Database**: MongoDB Atlas connection configured
- [x] **Discord Bot**: Initialized and logged in successfully
- [x] **API Endpoints**: All routes configured
  - `/auth/*` - Authentication routes
  - `/api/risk/*` - Risk management API
  - `/api/providers/*` - Signal providers API
  - `/api/exchanges/*` - Exchange API
  - `/webhook/stripe` - Stripe webhooks
  - `/webhook/tradingview` - TradingView webhooks
- [x] **Session Management**: Express-session with MongoDB store
- [x] **Security Headers**: Helmet configured
- [x] **CORS**: Configured for production

### Configuration Files
- [x] **.env**: Configured with production values
- [x] **.env.example**: Template created for deployment
- [x] **package.json**: All dependencies listed
- [x] **Dockerfile**: Ready for containerization (if needed)

### Documentation
- [x] **README.md**: Complete project documentation
- [x] **DEPLOYMENT.md**: Comprehensive deployment guide
- [x] **E2E_TEST_STATUS.md**: Test results documented
- [x] **API Documentation**: Endpoints documented in code

## 📋 Pre-Deployment Actions Required

### 1. Environment Variables Setup
Before deploying, ensure these environment variables are set in your deployment platform:

```bash
# Required
DISCORD_BOT_TOKEN=<your_bot_token>
DISCORD_CLIENT_ID=<your_client_id>
DISCORD_CLIENT_SECRET=<your_client_secret>
DISCORD_CALLBACK_URL=https://yourdomain.com/auth/discord/callback
SESSION_SECRET=<generate_64_byte_hex>
ENCRYPTION_KEY=<generate_32_byte_hex>
MONGODB_URI=<your_mongodb_atlas_uri>
NODE_ENV=production
PORT=5000

# Optional but Recommended
TRADINGVIEW_WEBHOOK_SECRET=<your_secret>
BINANCE_API_KEY=<your_api_key>
BINANCE_SECRET=<your_secret>
DEMO_MODE=false

# Payment Processing (if using Stripe)
# STRIPE_SECRET_KEY=<your_stripe_secret>
# STRIPE_WEBHOOK_SECRET=<your_webhook_secret>
```

**Generate secrets:**
```bash
# SESSION_SECRET (64 bytes)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# ENCRYPTION_KEY (32 bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Discord Developer Portal Setup
1. Go to https://discord.com/developers/applications
2. Select your application
3. **Bot Tab**:
   - Enable "Server Members Intent"
   - Enable "Message Content Intent"
   - Copy bot token for `DISCORD_BOT_TOKEN`
4. **OAuth2 Tab**:
   - Add redirect URL: `https://yourdomain.com/auth/discord/callback`
   - Copy Client ID for `DISCORD_CLIENT_ID`
   - Copy Client Secret for `DISCORD_CLIENT_SECRET`

### 3. MongoDB Atlas Setup
1. Create MongoDB Atlas cluster at https://cloud.mongodb.com/
2. Create database user
3. Whitelist IP addresses (use `0.0.0.0/0` for all IPs or specific deployment IPs)
4. Get connection string for `MONGODB_URI`

### 4. Build Verification
```bash
# Verify production build exists
ls -lah dist/dashboard/

# Expected output:
# dist/dashboard/
#   ├── assets/
#   │   ├── index-<hash>.css (~6 KB)
#   │   └── index-<hash>.js (~197 KB)
#   └── index.html (~0.5 KB)
```

## 🚀 Deployment Options

### Option 1: Railway (Recommended)
**Pros**: Long-running processes (Discord bot stays online), easy database integration, auto scaling, persistent WebSocket connections, stateful sessions
**Cons**: Paid after free tier

**Why Railway?** This application requires:
- ✅ Always-on Discord bot (WebSocket connection)
- ✅ Stateful Express sessions (OAuth login)
- ✅ No serverless timeouts

See [`railway.toml`](../railway.toml) for build configuration.

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and initialize
railway login
railway init

# Add environment variables
railway variables set DISCORD_BOT_TOKEN=<token>
# ... add all other variables

# Deploy
railway up
```

### Option 2: Vercel (Legacy - Not Recommended)

> **⚠️ NOT RECOMMENDED** for this application
>
> **Why?** Serverless limitations cause:
> - Bot disconnections (10s function timeout)
> - OAuth session issues (stateless architecture)
> - Missed webhooks (cold starts)
>
> **Migration Guide:** [`openspec/archive/vercel/migration-guide.md`](../openspec/archive/vercel/migration-guide.md)

For historical reference only - use Railway instead.

### Option 3: Heroku
**Pros**: Established platform, many add-ons, easy scaling
**Cons**: Paid plans required for production apps

```bash
# Login
heroku login

# Create app
heroku create your-app-name

# Add MongoDB add-on
heroku addons:create mongodb:sandbox

# Set environment variables
heroku config:set DISCORD_BOT_TOKEN=<token>
# ... set all other variables

# Deploy
git push heroku master
```

### Option 4: Self-Hosted (DigitalOcean/AWS/GCP)
**Pros**: Full control, predictable pricing, no platform limits
**Cons**: More setup, requires server management

See `DEPLOYMENT.md` for detailed self-hosting instructions.

## 🔒 Security Checklist

- [ ] **Never commit `.env`** to version control (already in `.gitignore`)
- [ ] **Use strong secrets**: Generate SESSION_SECRET and ENCRYPTION_KEY properly
- [ ] **HTTPS only**: Enable in production (automatic on Vercel/Railway/Heroku)
- [ ] **API keys**: Use read-only exchange API keys (never withdrawal permissions)
- [ ] **2FA enabled**: On all third-party accounts (Discord, MongoDB, Stripe, etc.)
- [ ] **IP whitelist**: Configure MongoDB Atlas IP whitelist
- [ ] **Rate limiting**: Already configured in code
- [ ] **Security headers**: Helmet already configured

## 📊 Post-Deployment Verification

### 1. Health Check
```bash
curl https://yourdomain.com/health
```

**Expected response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-XX-XXTXX:XX:XX.XXXZ",
  "uptime": 123.456,
  "memory": { /* memory usage */ }
}
```

### 2. Discord Bot Status
- Check bot appears online in Discord
- Test slash commands
- Verify bot can respond to messages

### 3. OAuth Login
- Visit `https://yourdomain.com`
- Click "Login with Discord"
- Verify redirect to Discord OAuth
- Verify successful login and dashboard access

### 4. API Endpoints
```bash
# Test API info endpoint
curl https://yourdomain.com/api

# Test auth status (should be unauthenticated)
curl https://yourdomain.com/auth/status
```

### 5. Frontend
- Visit `https://yourdomain.com` in browser
- Verify dashboard loads correctly
- Test responsive design on mobile
- Check browser console for errors
- Verify all navigation works

### 6. Webhooks
**TradingView Webhook:**
```bash
curl -X POST https://yourdomain.com/webhook/tradingview \
  -H "Content-Type: application/json" \
  -d '{"action": "buy", "symbol": "BTCUSDT", "price": 50000}'
```

**Stripe Webhook:**
- Configure webhook URL in Stripe Dashboard
- Test with Stripe CLI: `stripe trigger payment_intent.succeeded`

## 🔄 Rollback Plan

If deployment fails or issues arise:

### Railway (Recommended)
```bash
# View recent deployments
railway status

# Rollback to previous deployment via dashboard
# Railway Dashboard → Deployments → Select previous → Redeploy
```

### Vercel (Legacy)
```bash
vercel rollback
```

### Heroku
Deploy previous commit:
```bash
git revert HEAD
git push
```

### Self-Hosted (PM2)
```bash
pm2 reload trade-executor --update-env
```

## 📱 Monitoring Setup

### Recommended Tools
- **Error Tracking**: Sentry, LogRocket, or Rollbar
- **Uptime Monitoring**: UptimeRobot, Pingdom, or StatusCake
- **Application Performance**: New Relic or Datadog
- **Log Management**: Papertrail, Loggly, or CloudWatch

### Health Check Monitoring
Set up monitoring to ping `/health` endpoint every 5 minutes:
```bash
# Add this URL to your monitoring service
https://yourdomain.com/health
```

## ✅ Final Pre-Launch Checklist

- [ ] All environment variables configured in deployment platform
- [ ] Discord OAuth redirect URL updated in Discord Developer Portal
- [ ] MongoDB Atlas IP whitelist configured
- [ ] Production build verified (`dist/dashboard/` exists)
- [ ] `.env.example` documented for team
- [ ] Deployment platform account created and billing configured
- [ ] Domain name configured (if using custom domain)
- [ ] SSL certificate configured (automatic on most platforms)
- [ ] Error monitoring service integrated
- [ ] Uptime monitoring configured
- [ ] Team members invited to deployment platform
- [ ] Backup strategy defined
- [ ] Incident response plan documented

## 🎯 Ready to Deploy

If all items above are checked, you're ready to deploy! Follow the deployment guide in `DEPLOYMENT.md` for your chosen platform.

**Recommended First Deployment:** Railway (reliable long-running processes)

```bash
railway up
```

After successful deployment:
1. Update Discord OAuth redirect URL
2. Test all functionality
3. Monitor logs for any issues
4. Set up error tracking and monitoring
5. Announce to team/users

---

**Last Updated**: 2025-10-07
**Version**: 1.0.0
**Production Status**: ✅ READY FOR DEPLOYMENT
