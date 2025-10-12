# 🚀 Ready to Deploy - Execute These Commands

## ✅ Pre-Flight Verification

All systems are **GO FOR DEPLOYMENT**:
- ✅ **175 unit tests** passing
- ✅ **16+ E2E tests** passing
- ✅ **Production build** complete (61.67 KB gzipped)
- ✅ **Frontend integrated** with backend
- ✅ **Security configured** (Helmet, CSP, HSTS)
- ✅ **Documentation** complete

---

## 🎯 Recommended: Railway Deployment (Fastest)

Railway is the recommended platform for this application because it:
- ✅ Supports WebSocket connections (Discord bot)
- ✅ Runs long-running processes (no serverless timeouts)
- ✅ Handles stateful sessions seamlessly
- ✅ Provides excellent build flexibility with Nixpacks

### Step 1: Install Railway CLI
```bash
npm install -g @railway/cli
```

### Step 2: Login and Initialize
```bash
cd /Volumes/CHENDRIX/GitHub/0projects.util/discord-trade-exec
railway login
railway init
```

When prompted:
- **Project name**: `discord-trade-exec` (or your preferred name)
- **Environment**: `production`

### Step 3: Add Environment Variables

**Required Variables (Platform-agnostic):**
```bash
# Discord Configuration
railway variables set DISCORD_BOT_TOKEN="your_discord_bot_token_here"
railway variables set DISCORD_CLIENT_ID="your_discord_client_id_here"
railway variables set DISCORD_CLIENT_SECRET="your_discord_client_secret_here"

# Security
railway variables set SESSION_SECRET="generate_a_long_random_string_here"
railway variables set ENCRYPTION_KEY="generate_a_32_byte_hex_string_here"

# Database
railway variables set MONGODB_URI="mongodb+srv://username:password@cluster.mongodb.net/dbname?retryWrites=true&w=majority"

# Application
railway variables set NODE_ENV="production"
railway variables set PORT="5000"
railway variables set DEMO_MODE="false"

# Optional - TradingView
railway variables set TRADINGVIEW_WEBHOOK_SECRET="your_tradingview_webhook_secret"

# Optional - Exchange APIs
railway variables set BINANCE_API_KEY="your_binance_api_key"
railway variables set BINANCE_SECRET="your_binance_secret"
```

> **💡 Tip**: Copy variable values from your local `.env` file or see `RAILWAY-ENV-VARS.txt` for a template.

### Step 4: Deploy to Railway
```bash
railway up
```

Railway will:
1. Detect Node.js project via `package.json`
2. Use Nixpacks builder (configured in `railway.toml`)
3. Run build phases: setup → build → start
4. Deploy to production domain (e.g., `your-app.up.railway.app`)

### Step 5: Update Discord OAuth Callback

After deployment, get your Railway domain:
```bash
railway status
# Or visit Railway Dashboard → your project → Settings
```

Then update the callback URL:
```bash
# Replace with your actual Railway domain
railway variables set DISCORD_CALLBACK_URL="https://your-app.up.railway.app/auth/discord/callback"
```

**Update Discord Developer Portal:**
1. Go to https://discord.com/developers/applications/YOUR_APP_ID
2. OAuth2 → General
3. Add redirect URL: `https://your-app.up.railway.app/auth/discord/callback`
4. Save changes

### Step 6: Verify Deployment
```bash
# Check deployment status
railway status

# View logs
railway logs

# Test health endpoint
curl https://your-app.up.railway.app/health

# Open dashboard in browser
railway open
```

**Expected Health Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-XX-XXTXX:XX:XX.XXXZ",
  "uptime": 123.456,
  "memory": { ... }
}
```

---

## 📦 Alternative: Heroku Deployment

Heroku is another excellent option for long-running Node.js applications.

### Step 1: Login and Create App
```bash
heroku login
heroku create your-app-name
```

### Step 2: Set Environment Variables
```bash
# Discord Configuration
heroku config:set DISCORD_BOT_TOKEN="your_discord_bot_token_here"
heroku config:set DISCORD_CLIENT_ID="your_discord_client_id_here"
heroku config:set DISCORD_CLIENT_SECRET="your_discord_client_secret_here"
heroku config:set DISCORD_CALLBACK_URL="https://your-app-name.herokuapp.com/auth/discord/callback"

# Security
heroku config:set SESSION_SECRET="generate_a_long_random_string_here"
heroku config:set ENCRYPTION_KEY="generate_a_32_byte_hex_string_here"

# Database
heroku config:set MONGODB_URI="mongodb+srv://username:password@cluster.mongodb.net/dbname?retryWrites=true&w=majority"

# Application
heroku config:set NODE_ENV="production"
heroku config:set PORT="5000"
heroku config:set DEMO_MODE="false"
```

### Step 3: Deploy
```bash
git push heroku main
```

### Step 4: Update Discord OAuth
Update redirect URL in Discord Developer Portal with your Heroku domain.

---

## 💡 Migrating from Vercel?

If you have an existing Vercel deployment, see the comprehensive migration guide:

**📖 Migration Guide**: `openspec/archive/vercel/migration-guide.md`

The guide includes:
- Step-by-step migration instructions
- Environment variable export/import
- Discord OAuth callback updates
- Rollback procedures
- Troubleshooting tips

**Why migrate from Vercel?**
- Railway/Heroku better support WebSocket (Discord bot)
- No serverless function timeouts
- Better for stateful Express sessions
- More cost-effective for always-on services

---

## 📊 Post-Deployment Checklist

After deployment, verify these:

### 1. Health Check
```bash
curl https://your-domain.com/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-XX-XXTXX:XX:XX.XXXZ",
  "uptime": 123.456,
  "memory": { ... }
}
```

### 2. Dashboard Access
```bash
# Open in browser
open https://your-domain.com
```

**Expected Behavior:**
- ✅ Dashboard loads
- ✅ "Login with Discord" button visible
- ✅ No console errors
- ✅ Responsive on mobile

### 3. Discord Bot Online
Check Discord server:
- ✅ Bot shows as "Online"
- ✅ Slash commands available
- ✅ Bot responds to commands

### 4. OAuth Flow
Test complete authentication:
1. Click "Login with Discord"
2. Authorize on Discord
3. Redirect back to dashboard
4. See authenticated dashboard with username

### 5. API Endpoints
```bash
# Test API info
curl https://your-domain.com/api

# Test auth status (should show not authenticated)
curl https://your-domain.com/auth/status
```

---

## 🔧 Troubleshooting

### Discord Bot Not Online

```bash
# Check deployment logs
railway logs    # or
heroku logs --tail
```

**Common Issues:**
- Missing `DISCORD_BOT_TOKEN`
- Bot intents not enabled in Discord Developer Portal
- Invalid token
- Railway/Heroku service restarting → Check restart policy in `railway.toml`

### OAuth Login Fails

**Check:**
1. `DISCORD_CALLBACK_URL` matches deployment domain exactly
2. Redirect URL added in Discord Developer Portal
3. `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` are correct
4. Deployment uses HTTPS (automatic on Railway/Heroku)

### Database Connection Error

**Check:**
1. `MONGODB_URI` is correct
2. MongoDB Atlas IP whitelist includes platform IPs:
   - Railway: Use `0.0.0.0/0` or Railway's IP range
   - Heroku: Add Heroku IPs to whitelist
3. Database user has correct permissions

### Build Fails

**Solution:**
```bash
# Rebuild locally first
npm run build:dashboard

# Verify dist/ exists
ls -la dist/dashboard/

# Then redeploy
railway up    # or
git push heroku main
```

**Railway-specific**: Check `railway.toml` build configuration
**Heroku-specific**: Ensure `package.json` has correct build script

---

## 🎉 Success Criteria

Your deployment is successful when ALL these work:

- ✅ `/health` endpoint returns `{"status": "healthy"}`
- ✅ Dashboard loads at root URL
- ✅ Discord bot shows online
- ✅ OAuth login redirects correctly
- ✅ After login, dashboard shows username
- ✅ No errors in browser console
- ✅ No errors in deployment logs

---

## 📝 Final Notes

### Environment Variables Security
- Never commit `.env` to git
- Rotate secrets regularly
- Use different secrets for staging/production
- Store production secrets only in deployment platform (Railway/Heroku)

### Monitoring
Set up monitoring after deployment:
- **Uptime**: UptimeRobot, Pingdom
- **Errors**: Sentry, LogRocket
- **Performance**: New Relic, Datadog
- **Railway**: Built-in metrics dashboard
- **Heroku**: Heroku Metrics (paid plans)

### Scaling
Both platforms support auto-scaling:
- **Railway**: Configure in dashboard → Settings → Autoscaling
- **Heroku**: `heroku ps:scale web=2`

### Database
- **MongoDB Atlas** (recommended): Managed MongoDB with free tier
- **Railway PostgreSQL**: Available as Railway plugin
- **Heroku Postgres**: Available as Heroku add-on

---

## 🚀 Ready to Launch!

Choose your platform and execute the commands above. The application is production-ready and tested.

**Recommended First Deployment:** Railway (WebSocket support, long-running processes)

```bash
# Execute these commands now:
npm install -g @railway/cli
railway login
railway init
railway up
```

Good luck! 🎉

---

**Last Updated**: 2025-10-12
**Build Status**: ✅ PRODUCTION READY
**Test Status**: ✅ 175 unit + 16 E2E passing
**Deployment Status**: 🚀 READY TO DEPLOY
**Recommended Platform**: ⚡ Railway
