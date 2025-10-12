# Migrating from Vercel to Railway

This guide helps you migrate an existing Vercel deployment of Discord Trade Executor to Railway.

## Why Migrate?

Railway better aligns with this application's architecture:

- **WebSocket Support**: Discord bot maintains persistent WebSocket connections
- **Stateful Sessions**: Express sessions work better with long-running processes
- **Build Flexibility**: Nixpacks builder handles complex build pipelines
- **Cost Efficiency**: More predictable pricing for long-running services

## Migration Steps

### Step 1: Export Vercel Environment Variables

```bash
# Install Vercel CLI if needed
npm install -g vercel

# Login to Vercel
vercel login

# List your environment variables
vercel env ls

# Pull environment variables to local .env file
vercel env pull .env.vercel
```

### Step 2: Create Railway Project

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Initialize new Railway project
cd /path/to/discord-trade-exec
railway init
```

When prompted:
- Project name: `discord-trade-exec` (or your preferred name)
- Environment: `production`

### Step 3: Import Environment Variables

**Option A: Using Railway CLI (Recommended)**

```bash
# Read from your .env.vercel file and set each variable
railway variables set DISCORD_BOT_TOKEN="$(grep DISCORD_BOT_TOKEN .env.vercel | cut -d '=' -f2-)"
railway variables set DISCORD_CLIENT_ID="$(grep DISCORD_CLIENT_ID .env.vercel | cut -d '=' -f2-)"
railway variables set DISCORD_CLIENT_SECRET="$(grep DISCORD_CLIENT_SECRET .env.vercel | cut -d '=' -f2-)"
railway variables set SESSION_SECRET="$(grep SESSION_SECRET .env.vercel | cut -d '=' -f2-)"
railway variables set ENCRYPTION_KEY="$(grep ENCRYPTION_KEY .env.vercel | cut -d '=' -f2-)"
railway variables set MONGODB_URI="$(grep MONGODB_URI .env.vercel | cut -d '=' -f2-)"
railway variables set NODE_ENV="production"
railway variables set PORT="5000"
railway variables set DEMO_MODE="false"

# Optional variables (if you use them)
railway variables set TRADINGVIEW_WEBHOOK_SECRET="$(grep TRADINGVIEW_WEBHOOK_SECRET .env.vercel | cut -d '=' -f2-)"
railway variables set BINANCE_API_KEY="$(grep BINANCE_API_KEY .env.vercel | cut -d '=' -f2-)"
railway variables set BINANCE_SECRET="$(grep BINANCE_SECRET .env.vercel | cut -d '=' -f2-)"
```

**Option B: Using Railway Dashboard**

1. Go to https://railway.app
2. Select your project
3. Go to Variables tab
4. Click "Raw Editor"
5. Paste your environment variables (one per line, `KEY=value` format)
6. Click "Save"

### Step 4: Update Discord OAuth Callback URL

**Before deploying**, you need to update the callback URL:

1. Deploy to Railway first (see Step 5)
2. Get your Railway domain from the deployment (e.g., `your-app.up.railway.app`)
3. Update the `DISCORD_CALLBACK_URL` environment variable:

```bash
railway variables set DISCORD_CALLBACK_URL="https://your-app.up.railway.app/auth/discord/callback"
```

4. Update Discord Developer Portal:
   - Go to https://discord.com/developers/applications/YOUR_APP_ID
   - OAuth2 → General
   - Add redirect URL: `https://your-app.up.railway.app/auth/discord/callback`
   - Save changes

### Step 5: Deploy to Railway

```bash
# Trigger deployment
railway up

# Or link to GitHub for automatic deployments
railway link
```

Railway will:
1. Detect Node.js project via `package.json`
2. Use Nixpacks builder (configured in `railway.toml`)
3. Run build phases: setup → build → start
4. Deploy to production domain

### Step 6: Verify Deployment

```bash
# Check deployment status
railway status

# View logs
railway logs

# Test health endpoint
curl https://your-app.up.railway.app/health

# Open in browser
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

### Step 7: Decommission Vercel Deployment (Optional)

Once Railway is working correctly:

```bash
# Remove Vercel deployment
vercel remove discord-trade-exec --yes

# Or keep it as staging environment
# (Update DISCORD_CALLBACK_URL to separate OAuth app)
```

## Troubleshooting

### Build Fails on Railway

**Check build logs:**
```bash
railway logs --deployment
```

**Common issues:**
- Missing `npm run build:dashboard` in build phase → Fixed by `railway.toml`
- Node version mismatch → Railway auto-detects from `package.json` engines
- Missing dependencies → Ensure `package.json` is up to date

### Discord Bot Not Online

**Check Railway logs:**
```bash
railway logs
```

**Common issues:**
- `DISCORD_BOT_TOKEN` not set correctly
- Bot intents not enabled in Discord Developer Portal
- Railway service restarting frequently → Check restart policy in `railway.toml`

### OAuth Login Fails

**Check:**
1. `DISCORD_CALLBACK_URL` matches Railway domain exactly
2. Redirect URL added in Discord Developer Portal
3. `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` are correct
4. Railway deployment is using HTTPS (automatic)

### Database Connection Issues

**Check:**
1. `MONGODB_URI` copied correctly from Vercel
2. MongoDB Atlas IP whitelist includes Railway IPs (or use `0.0.0.0/0` for Railway)
3. Database user permissions are correct

### Performance Issues

Railway performs differently than Vercel (serverless vs. long-running):

- **Cold starts**: Railway has minimal cold start time (process stays warm)
- **WebSocket**: Better performance on Railway for Discord bot
- **Memory**: Check Railway plan limits if app restarts frequently

## Rollback Plan

If you need to rollback to Vercel:

1. **Keep Vercel deployment active** during migration testing
2. **Archived Vercel config** is in `openspec/archive/vercel/vercel.json`
3. **Restore Vercel deployment:**

```bash
# Restore vercel.json
cp openspec/archive/vercel/vercel.json ./

# Redeploy to Vercel
vercel --prod

# Update Discord OAuth callback back to Vercel domain
```

## Support

- **Railway Docs**: https://docs.railway.app
- **Discord Trade Executor Docs**: `docs/DEPLOY-NOW.md`
- **Railway Community**: https://discord.gg/railway

## Migration Checklist

- [ ] Export Vercel environment variables
- [ ] Create Railway project
- [ ] Import all environment variables to Railway
- [ ] Deploy to Railway
- [ ] Get Railway domain from deployment
- [ ] Update `DISCORD_CALLBACK_URL` in Railway variables
- [ ] Update Discord Developer Portal OAuth redirect URL
- [ ] Test health endpoint
- [ ] Test Discord bot connection
- [ ] Test OAuth login flow
- [ ] Test dashboard authentication
- [ ] Monitor Railway logs for 24 hours
- [ ] Decommission Vercel deployment (optional)

---

**Migration Completed**: ___/___/___
**Verified By**: _______________
**Railway Domain**: _________________________________
