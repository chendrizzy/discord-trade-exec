# Alpaca OAuth2 Setup Guide

## Problem: Alpaca Not Appearing in Broker Connections

If Alpaca doesn't appear in your broker connections UI, it's because **OAuth2 credentials are missing** from your environment variables.

### Root Cause

The system has **two types** of Alpaca credentials:

1. **API Keys** (ALPACA_PAPER_KEY, ALPACA_LIVE_KEY) - For direct API access
2. **OAuth2 Credentials** (ALPACA_OAUTH_CLIENT_ID, ALPACA_OAUTH_CLIENT_SECRET) - For user authorization flow

The OAuth2 broker connection system requires **separate OAuth2 app credentials**. Without these, Alpaca is automatically filtered from the enabled providers list and won't appear in the UI.

## Solution: Register OAuth2 Application with Alpaca

### Step 1: Create OAuth2 Application at Alpaca

1. **Login to Alpaca**: Go to [https://app.alpaca.markets](https://app.alpaca.markets)

2. **Navigate to OAuth Apps**:
   - Paper Trading: `https://app.alpaca.markets/paper/dashboard/apps`
   - Live Trading: `https://app.alpaca.markets/live/dashboard/apps`

3. **Create New OAuth Application**:
   - Click "Create New App" or "New OAuth App"
   - Fill in application details:
     - **App Name**: "Discord Trade Executor" (or your app name)
     - **Redirect URI**: `https://yourdomain.com/auth/broker/callback` (production)
       - For local dev: `http://localhost:3000/auth/broker/callback`
     - **Description**: Your app description
     - **Scopes**: Select all required scopes:
       - `account:read` - Read account information
       - `account:write` - Manage account settings
       - `trading` - Place and manage trades
       - `data` - Access market data

4. **Get Credentials**:
   - After creating the app, you'll receive:
     - **Client ID** (public identifier)
     - **Client Secret** (keep this secret!)
   - **IMPORTANT**: Save the Client Secret immediately - you won't be able to see it again

### Step 2: Add Credentials to Environment Variables

Add these lines to your `.env` file:

```bash
# Alpaca OAuth2 (required for broker connection UI)
ALPACA_OAUTH_CLIENT_ID=your_alpaca_oauth_client_id_here
ALPACA_OAUTH_CLIENT_SECRET=your_alpaca_oauth_client_secret_here
```

**Example:**
```bash
ALPACA_OAUTH_CLIENT_ID=abc123def456ghi789
ALPACA_OAUTH_CLIENT_SECRET=xyz987uvw654rst321mnop
```

### Step 3: Restart Application

```bash
# Stop the server
# Then restart to load new environment variables
npm run dev  # or however you start the server
```

### Step 4: Verify OAuth2 Broker is Enabled

After restarting, check the server logs. You should see:

```
🚀 Discord Trade Executor SaaS running on port 5000
🔐 OAuth2 Brokers Enabled: alpaca
```

**If you see this instead:**
```
⚠️  No OAuth2 brokers configured - add credentials to enable
   Missing: ALPACA_OAUTH_CLIENT_ID, IBKR_OAUTH_CLIENT_ID, etc.
```

Then your credentials weren't loaded. Double-check:
- `.env` file is in the project root
- Variable names are exactly: `ALPACA_OAUTH_CLIENT_ID` and `ALPACA_OAUTH_CLIENT_SECRET`
- No extra spaces or quotes around values
- Server was restarted after adding variables

## Health Check Endpoint

You can check OAuth2 provider status programmatically:

```bash
curl http://localhost:5000/health/oauth2
```

**Expected response when Alpaca is configured:**
```json
{
  "status": "ok",
  "enabled": ["alpaca"],
  "totalConfigured": 1,
  "totalAvailable": 5,
  "missing": ["ibkr", "tdameritrade", "etrade", "schwab"],
  "missingDetails": [
    {
      "provider": "ibkr",
      "requiredEnvVars": ["IBKR_OAUTH_CLIENT_ID", "IBKR_OAUTH_CLIENT_SECRET"]
    },
    ...
  ]
}
```

## Testing the Connection

1. **Navigate to Dashboard**: Go to `http://localhost:3000/dashboard/brokers`

2. **Find OAuth2 Brokers Section**: Look for "OAuth2 Broker Connections"

3. **Connect Alpaca**:
   - Find the Alpaca card
   - Click "Connect Alpaca"
   - You'll be redirected to Alpaca's login page
   - Log in and authorize the application
   - You'll be redirected back with success message

4. **Verify Token Storage**:
   - Check your user document in MongoDB
   - Look for `tradingConfig.oauthTokens.alpaca`
   - Tokens should be encrypted (contains `encrypted`, `iv`, `authTag` fields)

## Troubleshooting

### Alpaca Still Doesn't Appear

**Check environment variables are loaded:**
```bash
node -e "console.log({
  clientId: process.env.ALPACA_OAUTH_CLIENT_ID ? 'SET' : 'MISSING',
  clientSecret: process.env.ALPACA_OAUTH_CLIENT_SECRET ? 'SET' : 'MISSING'
})"
```

**Expected output:**
```
{ clientId: 'SET', clientSecret: 'SET' }
```

### OAuth Flow Fails

**Common issues:**

1. **Redirect URI Mismatch**:
   - Ensure redirect URI in Alpaca app matches your server exactly
   - Include protocol: `https://` or `http://`
   - Include full path: `/auth/broker/callback`

2. **Invalid Credentials**:
   - Double-check Client ID and Secret were copied correctly
   - No extra spaces, newlines, or quotes

3. **Scope Issues**:
   - Ensure all required scopes are enabled in Alpaca OAuth app:
     - `account:read`, `account:write`, `trading`, `data`

### Token Refresh Fails

The system automatically refreshes OAuth2 tokens before they expire. If refresh fails:

1. **Check logs** for refresh job errors:
   ```bash
   grep "OAuth2 token refresh" logs/combined.log
   ```

2. **Manually trigger refresh**:
   ```bash
   curl -X POST http://localhost:5000/api/brokers/alpaca/oauth/refresh
   ```

3. **Reconnect if needed**:
   - Disconnect Alpaca in UI
   - Reconnect to get fresh tokens

## Security Best Practices

### Protecting OAuth2 Credentials

1. **Never commit credentials to git**:
   - `.env` is in `.gitignore`
   - Use `.env.example` for documentation

2. **Rotate credentials periodically**:
   - Generate new Client Secret in Alpaca dashboard
   - Update `.env` file
   - Restart server

3. **Use environment-specific credentials**:
   - Development: Use paper trading OAuth app
   - Production: Use live trading OAuth app with proper security review

### Token Security

- Tokens are encrypted with **AES-256-GCM** before storage
- Encryption keys managed by **AWS KMS**
- Tokens automatically refreshed before expiration
- Tokens deleted when user disconnects broker

## API Key vs OAuth2

Your Alpaca setup should have **both**:

```bash
# API Keys - for direct API calls (optional, for advanced use)
ALPACA_PAPER_KEY=your_paper_api_key
ALPACA_PAPER_SECRET=your_paper_secret
ALPACA_LIVE_KEY=your_live_api_key
ALPACA_LIVE_SECRET=your_live_secret

# OAuth2 - for broker connection UI (required for OAuth2 flow)
ALPACA_OAUTH_CLIENT_ID=your_oauth_client_id
ALPACA_OAUTH_CLIENT_SECRET=your_oauth_client_secret
```

**Why both?**

- **API Keys**: Used for server-to-server communication
- **OAuth2**: Used for user authorization flow where users connect their own Alpaca accounts

## Related Documentation

- [Alpaca OAuth Documentation](https://alpaca.markets/docs/oauth/overview/)
- [Alpaca API Scopes](https://alpaca.markets/docs/oauth/reference/#scopes)
- [OAuth2 Provider Configuration](../src/config/oauth2Providers.js)
- [OAuth2 Service](../src/services/OAuth2Service.js)

## Support

If you're still experiencing issues:

1. Check server logs: `tail -f logs/combined.log`
2. Check health endpoint: `curl http://localhost:5000/health/oauth2`
3. Verify Alpaca OAuth app configuration
4. Check firewall/network settings for redirects

---

**Last Updated**: January 2025
