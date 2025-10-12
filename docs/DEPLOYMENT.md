# Deployment Guide

## Prerequisites
- Node.js 22.18.0
- MongoDB Atlas account or MongoDB instance
- Discord Developer Application
- Stripe Account (for payments)
- Domain name (optional)

## Environment Setup

### 1. Configure Environment Variables

Create a `.env` file in the project root with the following variables:

```bash
# Discord Bot Configuration
DISCORD_BOT_TOKEN=your_discord_bot_token

# Discord OAuth2 (Dashboard Authentication)
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
DISCORD_CALLBACK_URL=https://yourdomain.com/auth/discord/callback

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

# Demo Mode (set to false in production)
DEMO_MODE=false
```

### 2. Discord Developer Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application or select existing
3. **Bot Setup**:
   - Go to "Bot" section
   - Create bot and copy the token
   - Enable necessary intents (Server Members Intent, Message Content Intent)
4. **OAuth2 Setup**:
   - Go to "OAuth2" → "General"
   - Add redirect URL: `https://yourdomain.com/auth/discord/callback`
   - Copy Client ID and Client Secret

### 3. Build the Application

```bash
# Install dependencies
npm install

# Build the frontend dashboard
npm run build:dashboard

# Test the build locally
npm start
```

Visit `http://localhost:5000` to verify everything works.

## Deployment Options

### Option 1: Vercel (Recommended)

1. **Install Vercel CLI**:
```bash
npm install -g vercel
```

2. **Login to Vercel**:
```bash
vercel login
```

3. **Deploy**:
```bash
vercel --prod
```

4. **Configure Environment Variables**:
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - Add all variables from `.env`
   - Make sure to update `DISCORD_CALLBACK_URL` with your Vercel domain

5. **Update Discord OAuth2**:
   - Update redirect URL in Discord Developer Portal to match your Vercel domain

### Option 2: Railway

1. **Install Railway CLI**:
```bash
npm install -g @railway/cli
```

2. **Login and Initialize**:
```bash
railway login
railway init
```

3. **Add Environment Variables**:
```bash
railway variables set DISCORD_BOT_TOKEN=your_token
# ... add all other variables
```

4. **Deploy**:
```bash
railway up
```

### Option 3: Heroku

1. **Install Heroku CLI** and login:
```bash
heroku login
```

2. **Create Heroku App**:
```bash
heroku create your-app-name
```

3. **Add MongoDB Add-on**:
```bash
heroku addons:create mongodb:sandbox
```

4. **Configure Environment Variables**:
```bash
heroku config:set DISCORD_BOT_TOKEN=your_token
# ... set all other variables
```

5. **Deploy**:
```bash
git push heroku master
```

### Option 4: DigitalOcean/AWS/GCP

1. **Set up a server** (Ubuntu 22.04 recommended)

2. **Install Node.js 22.18.0**:
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

3. **Install PM2**:
```bash
sudo npm install -g pm2
```

4. **Clone and setup**:
```bash
git clone https://github.com/yourusername/discord-trade-exec.git
cd discord-trade-exec
npm install
npm run build:dashboard
```

5. **Create `.env` file** with production variables

6. **Start with PM2**:
```bash
pm2 start src/index.js --name trade-executor
pm2 save
pm2 startup
```

7. **Setup Nginx reverse proxy** (optional):
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

8. **Setup SSL with Let's Encrypt**:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

## Post-Deployment Checklist

- [ ] Verify Discord Bot is online
- [ ] Test Discord OAuth login
- [ ] Verify MongoDB connection
- [ ] Test webhook endpoints (/webhook/tradingview, /webhook/stripe)
- [ ] Check application logs for errors
- [ ] Test API endpoints (/api/risk, /api/exchanges, /api/providers)
- [ ] Verify frontend loads correctly
- [ ] Test mobile responsiveness
- [ ] Check security headers (run: `curl -I https://yourdomain.com`)
- [ ] Monitor application performance
- [ ] Set up error monitoring (Sentry, LogRocket, etc.)

## Monitoring

### Health Check
```bash
curl https://yourdomain.com/health
```

### Logs
```bash
# Vercel
vercel logs

# Heroku
heroku logs --tail

# PM2
pm2 logs trade-executor
```

## Scaling

### Vercel
- Automatic scaling included
- Upgrade plan for higher limits

### Self-hosted
```bash
# PM2 Cluster Mode
pm2 start src/index.js -i max --name trade-executor
```

## Troubleshooting

### Common Issues

1. **Discord Bot Not Online**
   - Check `DISCORD_BOT_TOKEN` is correct
   - Verify bot has required intents enabled
   - Check application logs

2. **OAuth Login Fails**
   - Verify `DISCORD_CALLBACK_URL` matches redirect URL in Discord Developer Portal
   - Check `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`

3. **Database Connection Error**
   - Verify `MONGODB_URI` is correct
   - Check IP whitelist in MongoDB Atlas
   - Ensure network access is configured

4. **Webhooks Not Working**
   - Verify webhook URLs are publicly accessible
   - Check webhook secrets are correct
   - Review application logs for errors

## Security Considerations

- ✅ Never commit `.env` to version control
- ✅ Use strong random strings for `SESSION_SECRET` and `ENCRYPTION_KEY`
- ✅ Enable HTTPS in production
- ✅ Keep dependencies updated (`npm audit`)
- ✅ Use read-only API keys for exchanges (never withdrawal permissions)
- ✅ Enable 2FA on all third-party accounts
- ✅ Regularly rotate API keys and secrets
- ✅ Monitor for unusual activity
- ✅ Set up rate limiting (already configured in code)
- ✅ Review security headers configuration

## Rollback Procedure

### Vercel
```bash
vercel rollback
```

### PM2
```bash
pm2 reload trade-executor --update-env
```

### Git
```bash
git revert HEAD
git push
```

## Support

For issues or questions:
- Check logs first
- Review this deployment guide
- Check GitHub Issues
- Contact support

---

**Last Updated**: $(date +%Y-%m-%d)
**Version**: 1.0.0
