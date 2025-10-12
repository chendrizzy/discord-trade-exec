# Vercel Deployment Instructions (Archived)

> **⚠️ NOTICE**: This deployment method is archived. Railway is now the recommended deployment platform.
> See `migration-guide.md` for migration instructions or `docs/DEPLOY-NOW.md` for current deployment guide.

---

## 🎯 Vercel Deployment

### Step 1: Install Vercel CLI
```bash
npm install -g vercel
```

### Step 2: Login to Vercel
```bash
vercel login
```

### Step 3: Deploy to Production
```bash
cd /Volumes/CHENDRIX/GitHub/0projects.util/discord-trade-exec
vercel --prod
```

### Step 4: Configure Environment Variables

After deployment, go to Vercel Dashboard and add these environment variables:

**Required Variables:**
```bash
DISCORD_BOT_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_client_id_here
DISCORD_CLIENT_SECRET=your_discord_client_secret_here
SESSION_SECRET=generate_a_long_random_string_here
ENCRYPTION_KEY=generate_a_32_byte_hex_string_here
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/dbname?retryWrites=true&w=majority
NODE_ENV=production
PORT=5000
DEMO_MODE=false

# Optional - TradingView
TRADINGVIEW_WEBHOOK_SECRET=your_tradingview_webhook_secret

# Optional - Exchange APIs
BINANCE_API_KEY=your_binance_api_key
BINANCE_SECRET=your_binance_secret
```

**IMPORTANT:** Replace `DISCORD_CALLBACK_URL` with your Vercel domain:
```bash
DISCORD_CALLBACK_URL=https://your-app-name.vercel.app/auth/discord/callback
```

### Step 5: Update Discord Developer Portal

1. Go to https://discord.com/developers/applications/YOUR_APP_ID
2. OAuth2 → General
3. Add redirect URL: `https://your-app-name.vercel.app/auth/discord/callback`
4. Save changes

### Step 6: Verify Deployment

```bash
# Test health endpoint
curl https://your-app-name.vercel.app/health

# Visit dashboard
open https://your-app-name.vercel.app
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

## 🔧 Troubleshooting

### Discord Bot Not Online

```bash
# Check deployment logs
vercel logs
```

**Common Issues:**
- Missing `DISCORD_BOT_TOKEN`
- Bot intents not enabled in Discord Developer Portal
- Invalid token
- **WebSocket limitations**: Vercel's serverless architecture may disconnect long-running WebSocket connections

### OAuth Login Fails

**Check:**
1. `DISCORD_CALLBACK_URL` matches deployment domain
2. Redirect URL added in Discord Developer Portal
3. `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` are correct

### Build Fails

**Solution:**
```bash
# Rebuild locally first
npm run build:dashboard

# Verify dist/ exists
ls -la dist/dashboard/

# Then redeploy
vercel --prod
```

### Serverless Function Timeout

**Issue**: Vercel has execution time limits for serverless functions (10s for Hobby, 60s for Pro)

**Solution**:
- Upgrade to Vercel Pro for longer execution time
- **Or migrate to Railway** for unlimited execution time (recommended for this application)

---

## 📊 Vercel-Specific Considerations

### Serverless Architecture

Vercel uses serverless functions which have implications for this application:

**Limitations:**
- **WebSocket Support**: Limited or requires workarounds
- **Stateful Sessions**: Challenging with serverless architecture
- **Execution Time**: Functions have maximum execution time (10-60s)
- **Cold Starts**: May affect Discord bot connection stability

**Workarounds:**
- Use Vercel Cron Jobs for periodic tasks
- External WebSocket service for Discord bot (not ideal)
- Session storage in MongoDB (adds latency)

### Cost Considerations

**Vercel Pricing (as of 2025):**
- **Hobby**: Free, 100 GB bandwidth, 10s execution limit
- **Pro**: $20/month per member, 1 TB bandwidth, 60s execution limit
- **Enterprise**: Custom pricing

**For this application:**
- Discord bot connection may trigger frequent function invocations
- WebSocket connections may hit limits quickly
- Consider Railway for better cost-effectiveness for always-on services

---

## 🚀 Quick Start Commands

```bash
# Execute these commands for Vercel deployment:
npm install -g vercel
vercel login
vercel --prod
```

---

## 💡 Migration Recommendation

If you're experiencing issues with:
- Discord bot disconnections
- Session management problems
- WebSocket connection drops
- Exceeding serverless function limits

**Consider migrating to Railway**: See `migration-guide.md` for step-by-step instructions.

Railway provides:
- Always-on processes (no cold starts)
- Native WebSocket support
- Unlimited execution time
- Better suited for Discord bots and long-running processes

---

**Archived**: 2025-10-12
**Reason**: Platform architecture better suited for Railway
**Migration Guide**: `migration-guide.md`
**Current Deployment Guide**: `docs/DEPLOY-NOW.md`
