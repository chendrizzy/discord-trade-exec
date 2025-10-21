# OAuth2 Broker Integration Configuration Guide

## Overview

This application supports OAuth2 authentication for multiple stock brokers, enabling users to connect their trading accounts securely without sharing API keys directly. However, **these integrations are completely optional** and the application is designed to work perfectly without them.

## Graceful Degradation Strategy

The application implements a **graceful bypass** for missing OAuth2 credentials:

### What Happens Without OAuth2 Credentials

1. **Application Starts Successfully** ✅
   - Missing OAuth2 credentials will NOT block application startup
   - You'll see warning logs like: `[OAuth2Config] Missing credentials for Alpaca`
   - These warnings are **informational only** and safe to ignore

2. **Core Features Work Normally** ✅
   - Discord bot commands function normally
   - Manual API key broker connections still work
   - Trade execution continues as expected
   - Dashboard and analytics remain functional

3. **OAuth2 Brokers Are Hidden** ✅
   - Brokers without credentials won't appear in the UI
   - Users won't see "Connect with OAuth2" buttons for those brokers
   - Only enabled brokers (with credentials) are shown

4. **No User-Facing Errors** ✅
   - No error messages shown to end users
   - No broken UI elements or 500 errors
   - Seamless user experience

### Implementation Details

The bypass is implemented in `src/config/oauth2Providers.js`:

```javascript
function validateProviderEnvVars(providerName, clientIdVar, clientSecretVar) {
  const clientId = process.env[clientIdVar];
  const clientSecret = process.env[clientSecretVar];

  if (!clientId || !clientSecret) {
    console.warn(
      `[OAuth2Config] Missing credentials for ${providerName}: ${clientIdVar}=${!!clientId}, ${clientSecretVar}=${!!clientSecret}`
    );
    return false; // Disables the provider
  }

  return true;
}
```

Each provider has an `enabled` flag that's automatically set based on credential availability:

```javascript
alpaca: {
  // ... configuration ...
  enabled: validateProviderEnvVars('Alpaca', 'ALPACA_OAUTH_CLIENT_ID', 'ALPACA_OAUTH_CLIENT_SECRET')
}
```

## Supported Brokers

### 1. Alpaca Markets
- **Type**: Stock Trading (US Markets)
- **OAuth Type**: OAuth 2.0
- **Developer Portal**: https://app.alpaca.markets/oauth/applications
- **Documentation**: https://alpaca.markets/docs/oauth/overview/
- **Token Lifetime**: 7 days
- **Environment Variables**:
  ```bash
  ALPACA_OAUTH_CLIENT_ID=your_client_id
  ALPACA_OAUTH_CLIENT_SECRET=your_client_secret
  ```

### 2. Interactive Brokers (IBKR)
- **Type**: Stock Trading (Global Markets)
- **OAuth Type**: OAuth 2.0
- **Developer Portal**: https://www.interactivebrokers.com/webtradingapi/
- **Documentation**: https://interactivebrokers.github.io/cpwebapi/
- **Token Lifetime**: 24 hours
- **Environment Variables**:
  ```bash
  IBKR_OAUTH_CLIENT_ID=your_client_id
  IBKR_OAUTH_CLIENT_SECRET=your_client_secret
  ```

### 3. TD Ameritrade
- **Type**: Stock Trading (US Markets)
- **OAuth Type**: OAuth 2.0
- **Developer Portal**: https://developer.tdameritrade.com/user/me/apps
- **Documentation**: https://developer.tdameritrade.com/authentication/apis
- **Token Lifetime**: 30 minutes (requires frequent refresh)
- **Environment Variables**:
  ```bash
  TDAMERITRADE_OAUTH_CLIENT_ID=your_client_id
  TDAMERITRADE_OAUTH_CLIENT_SECRET=your_client_secret
  ```

### 4. E*TRADE
- **Type**: Stock Trading (US Markets)
- **OAuth Type**: OAuth 1.0a (legacy)
- **Developer Portal**: https://us.etrade.com/etx/ris/apikey
- **Documentation**: https://apisb.etrade.com/docs/api/authorization/
- **Token Lifetime**: 2 hours
- **Environment Variables**:
  ```bash
  ETRADE_OAUTH_CLIENT_ID=your_consumer_key
  ETRADE_OAUTH_CLIENT_SECRET=your_consumer_secret
  ```

### 5. Charles Schwab
- **Type**: Stock Trading (US Markets)
- **OAuth Type**: OAuth 2.0
- **Developer Portal**: https://developer.schwab.com/
- **Documentation**: https://developer.schwab.com/products/trader-api--individual
- **Token Lifetime**: 7 days (estimated)
- **Environment Variables**:
  ```bash
  SCHWAB_OAUTH_CLIENT_ID=your_client_id
  SCHWAB_OAUTH_CLIENT_SECRET=your_client_secret
  ```

## Configuration Steps (When Ready)

### Step 1: Register Developer Application

For each broker you want to enable:

1. Visit the broker's developer portal (links above)
2. Create a new application/integration
3. Configure the OAuth2 redirect URI:
   ```
   https://yourdomain.com/auth/broker/callback
   ```
   For local development:
   ```
   http://localhost:3000/auth/broker/callback
   ```

### Step 2: Set Environment Variables

Add the credentials to your Railway deployment:

```bash
# Using Railway CLI
railway variables --set "ALPACA_OAUTH_CLIENT_ID=your_client_id"
railway variables --set "ALPACA_OAUTH_CLIENT_SECRET=your_client_secret"

# Repeat for other brokers as needed
```

Or add them via Railway Dashboard:
1. Go to your project settings
2. Click "Variables" tab
3. Add each credential pair
4. Save changes (automatic redeploy)

### Step 3: Verify Configuration

After setting credentials:

1. Check application logs for successful initialization:
   ```
   railway logs
   ```
   You should no longer see warnings for configured brokers

2. Test OAuth2 flow:
   - Visit dashboard: `https://yourdomain.com/dashboard`
   - Click "Connect Broker" → Select configured broker
   - Complete OAuth2 authorization flow
   - Verify successful connection

### Step 4: Monitor Token Health

Check broker connection status via API:

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  https://yourdomain.com/api/auth/brokers/status
```

Response shows each broker's status:
```json
{
  "success": true,
  "brokers": [
    {
      "key": "alpaca",
      "status": "connected",
      "expiresAt": "2025-10-28T19:43:49Z",
      "expiresInSeconds": 604800
    }
  ]
}
```

## Deployment Checklist

- [x] **MFA_ENCRYPTION_KEY** set (REQUIRED for production)
- [ ] **ALPACA_OAUTH_CLIENT_ID** and **ALPACA_OAUTH_CLIENT_SECRET** (optional)
- [ ] **IBKR_OAUTH_CLIENT_ID** and **IBKR_OAUTH_CLIENT_SECRET** (optional)
- [ ] **TDAMERITRADE_OAUTH_CLIENT_ID** and **TDAMERITRADE_OAUTH_CLIENT_SECRET** (optional)
- [ ] **ETRADE_OAUTH_CLIENT_ID** and **ETRADE_OAUTH_CLIENT_SECRET** (optional)
- [ ] **SCHWAB_OAUTH_CLIENT_ID** and **SCHWAB_OAUTH_CLIENT_SECRET** (optional)

## FAQ

### Q: Why am I seeing OAuth2 warnings in logs?

**A:** These warnings are expected when OAuth2 credentials are not configured. They're informational only and don't affect application functionality. The application will automatically disable those broker OAuth2 features.

### Q: Can users still connect brokers without OAuth2?

**A:** Yes! Users can manually enter their broker API keys through the dashboard. OAuth2 is just a convenience feature for easier authentication.

### Q: Do I need all broker credentials to deploy?

**A:** No. You can deploy with zero OAuth2 credentials configured. Enable brokers individually as you receive developer approval from each broker.

### Q: How do I test OAuth2 locally?

**A:** 
1. Add credentials to `.env` file
2. Set `BASE_URL=http://localhost:3000`
3. Configure OAuth redirect URI in broker developer portal: `http://localhost:3000/auth/broker/callback`
4. Start application: `npm start`
5. Test flow at http://localhost:3000/dashboard

### Q: What happens if a token expires?

**A:** The application automatically attempts to refresh tokens using refresh tokens (if supported by the broker). Users will be prompted to re-authenticate if refresh fails.

### Q: Is there a rate limit for OAuth2 requests?

**A:** Each broker has different rate limits. The application implements proper retry logic and exponential backoff to handle rate limiting gracefully.

## Security Best Practices

1. **Never commit credentials to Git**
   - Always use environment variables
   - Keep `.env` file in `.gitignore`

2. **Use separate credentials per environment**
   - Development credentials
   - Staging credentials  
   - Production credentials

3. **Rotate credentials regularly**
   - Quarterly rotation recommended
   - Immediate rotation if credentials are compromised

4. **Monitor OAuth2 logs**
   - Watch for unusual authorization patterns
   - Set up alerts for failed authentications

5. **Validate redirect URIs**
   - Only whitelist your actual domain(s)
   - Never use wildcard redirect URIs

## Troubleshooting

### Application won't start
- **Check**: Is `MFA_ENCRYPTION_KEY` set? (REQUIRED)
- **Check**: Are other required env vars set? (see `.env.example`)
- **Check**: MongoDB connection working?

### OAuth2 broker not appearing in UI
- **Check**: Are both CLIENT_ID and CLIENT_SECRET set?
- **Check**: Application logs for validation errors
- **Check**: Restart application after setting credentials

### OAuth2 flow returns error
- **Check**: Redirect URI matches exactly (including protocol)
- **Check**: Credentials are correct (no typos)
- **Check**: Application has internet access to broker API
- **Check**: Broker developer application is active/approved

### Token refresh fails
- **Check**: Broker supports refresh tokens
- **Check**: Refresh token hasn't been revoked
- **Check**: Token hasn't exceeded maximum lifetime
- **Check**: Network connectivity to broker API

## Support

For issues with:
- **Application configuration**: Check this guide and `.env.example`
- **Broker API setup**: Consult broker's developer documentation
- **OAuth2 flow errors**: Enable debug logging and check application logs
- **General questions**: Contact development team

## Related Documentation

- [.env.example](../../.env.example) - All environment variables
- [BROKER_INTEGRATION.md](./BROKER_INTEGRATION.md) - Technical OAuth2 implementation details
- [OAuth2Service Documentation](../services/OAuth2Service.md) - Service API reference
