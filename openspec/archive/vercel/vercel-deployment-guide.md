# Vercel Deployment Guide (ARCHIVED)

> **⚠️ ARCHIVED DOCUMENTATION**
>
> This deployment method is **no longer recommended** for this application.
>
> **Why?** This application requires:
> - WebSocket connections (Discord bot)
> - Long-running processes (no serverless timeouts)
> - Stateful Express sessions
>
> **Recommended Alternative:** Railway (see `../../docs/DEPLOY-NOW.md`)
>
> **Migration Guide:** See `migration-guide.md` in this directory

---

## Original Vercel Deployment Instructions

### Prerequisites
- Vercel CLI installed: `npm install -g vercel`
- Vercel account
- All environment variables configured

### Deployment Steps

#### 1. Install Vercel CLI
```bash
npm install -g vercel
```

#### 2. Login to Vercel
```bash
vercel login
```

#### 3. Deploy to Vercel
```bash
# From project root
vercel --prod
```

#### 4. Configure Environment Variables

Go to **Vercel Dashboard** → **Your Project** → **Settings** → **Environment Variables**

Add all required environment variables:

```bash
# Discord Bot Configuration
DISCORD_BOT_TOKEN=your_discord_bot_token

# Discord OAuth2 (Dashboard Authentication)
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
DISCORD_CALLBACK_URL=https://your-project.vercel.app/auth/discord/callback

# Session & Encryption
SESSION_SECRET=generate_strong_random_string_here
ENCRYPTION_KEY=generate_32_byte_hex_string_here

# Trading Exchange APIs
BINANCE_API_KEY=your_binance_api_key
BINANCE_SECRET=your_binance_secret

# Stripe Payment Processing
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret

# TradingView Integration
TRADINGVIEW_WEBHOOK_SECRET=your_tradingview_webhook_secret

# Database
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/database

# Environment
NODE_ENV=production
PORT=5000

# Demo Mode
DEMO_MODE=false
```

**Important**: Update `DISCORD_CALLBACK_URL` with your actual Vercel domain (e.g., `your-project.vercel.app` or custom domain)

#### 5. Update Discord OAuth2 Settings

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your application
3. Navigate to **OAuth2** → **General**
4. Add redirect URL: `https://your-project.vercel.app/auth/discord/callback`
5. Save changes

---

## Vercel Configuration File

The project included a `vercel.json` configuration file (now archived in this directory):

```json
{
  "version": 2,
  "builds": [
    {
      "src": "src/index.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "src/index.js"
    }
  ]
}
```

---

## Monitoring & Logs

### View Logs
```bash
vercel logs
```

### Check Deployment Status
```bash
vercel ls
```

### Inspect Specific Deployment
```bash
vercel inspect [deployment-url]
```

---

## Scaling

Vercel provides **automatic scaling** included with all plans:
- Scales automatically based on traffic
- No configuration required for basic scaling
- Upgrade plan for higher limits and more concurrent executions

---

## Rollback Procedure

To rollback to a previous deployment:

```bash
# List recent deployments
vercel ls

# Promote a specific deployment to production
vercel promote [deployment-url]

# Or use the rollback command
vercel rollback
```

---

## Known Limitations (Why We Migrated)

### 1. **Serverless Function Timeouts**
- **Issue**: Vercel enforces 10-second timeout for Hobby plan, 60 seconds for Pro
- **Impact**: Discord bot requires persistent WebSocket connection
- **Result**: Bot disconnects frequently, poor user experience

### 2. **Stateless Architecture**
- **Issue**: Serverless functions are stateless by design
- **Impact**: Express sessions don't persist between requests
- **Result**: OAuth login sessions unreliable, users logged out randomly

### 3. **WebSocket Support Limitations**
- **Issue**: Vercel's serverless functions have limited WebSocket support
- **Impact**: Discord bot can't maintain persistent connection
- **Result**: Bot appears offline or unreliable

### 4. **Cold Starts**
- **Issue**: Functions "sleep" when inactive, causing 1-3 second delays on first request
- **Impact**: Delayed webhook responses (TradingView, Stripe)
- **Result**: Missed trading signals, poor UX

### 5. **Cost Inefficiency**
- **Issue**: Billed per invocation + execution time
- **Impact**: Long-running bot process costs more on Vercel than dedicated hosting
- **Result**: Higher costs for same functionality

---

## Migration Path

**We migrated to Railway** because it provides:
- ✅ **Always-on processes** (no cold starts)
- ✅ **Persistent WebSocket connections** (Discord bot stays online)
- ✅ **Stateful sessions** (Express sessions work correctly)
- ✅ **Better cost efficiency** (flat monthly rate vs per-invocation)
- ✅ **Simpler architecture** (no serverless workarounds)

**Migration Guide**: See `migration-guide.md` for step-by-step instructions.

---

## Troubleshooting (Historical Reference)

### Discord Bot Not Online
**Cause**: Serverless timeout causing bot disconnection
**Solution**: Migrate to Railway/Heroku for persistent process

### OAuth Login Fails
**Cause**: Session state lost between serverless invocations
**Solution**: Use external session store (Redis) or migrate to stateful platform

### Webhooks Timeout
**Cause**: Function timeout exceeded during processing
**Solution**: Implement async job queue or migrate to platform with longer timeouts

---

## When Vercel IS Appropriate

Vercel works excellently for:
- ✅ Static sites and JAMstack apps
- ✅ Next.js applications
- ✅ Serverless APIs with <10s response times
- ✅ Stateless microservices
- ✅ Frontend deployments with separate backend

**Not suitable for:**
- ❌ Long-running processes (bots, workers)
- ❌ WebSocket servers
- ❌ Stateful applications
- ❌ Background job processing

---

## Archive Information

- **Archived Date**: 2025-10-16
- **Reason**: Application architecture incompatible with serverless platform
- **Replaced By**: Railway (see `../../docs/DEPLOY-NOW.md`)
- **Migration Guide**: `migration-guide.md`

---

## References

- **Vercel Documentation**: https://vercel.com/docs
- **Vercel CLI**: https://vercel.com/docs/cli
- **Vercel Limits**: https://vercel.com/docs/concepts/limits/overview
- **Railway Migration Guide**: `migration-guide.md`
