# OAuth2 Troubleshooting Guide
## Common Errors, Diagnostics, and Solutions

**Version:** 1.0.0
**Last Updated:** 2025-10-20
**Status:** ✅ PRODUCTION

---

## Table of Contents

1. [Quick Diagnostic Commands](#quick-diagnostic-commands)
2. [Discord OAuth2 Errors](#discord-oauth2-errors)
3. [Broker OAuth2 Errors](#broker-oauth2-errors)
4. [Session & Cookie Issues](#session--cookie-issues)
5. [Token Management Issues](#token-management-issues)
6. [Security & CORS Errors](#security--cors-errors)
7. [Production Deployment Issues](#production-deployment-issues)
8. [Emergency Procedures](#emergency-procedures)

---

## Quick Diagnostic Commands

### Check Application Status

```bash
# 1. Verify environment variables loaded
node -e "console.log({
  discord: !!process.env.DISCORD_CLIENT_ID,
  session: !!process.env.SESSION_SECRET,
  encryption: !!process.env.ENCRYPTION_MASTER_SECRET,
  mongodb: !!process.env.MONGODB_URI
})"

# 2. Test MongoDB connection
mongosh "$MONGODB_URI" --eval "db.adminCommand('ping')"

# 3. Check session store
mongosh "$MONGODB_URI" --eval "db.sessions.countDocuments()"

# 4. Verify user accounts exist
mongosh "$MONGODB_URI" --eval "db.users.countDocuments()"

# 5. Check for active OAuth states (in-memory, use debugging)
curl -H "Cookie: connect.sid=$SESSION_ID" http://localhost:5000/auth/status
```

---

### Logs to Check

```bash
# Application logs (recent errors)
pm2 logs --lines 100 --err

# Filter for OAuth errors
pm2 logs | grep -i "oauth\|discord\|authentication"

# Check session errors
pm2 logs | grep -i "session\|cookie"

# MongoDB connection issues
pm2 logs | grep -i "mongodb\|connection"
```

---

## Discord OAuth2 Errors

### Error 1: "Invalid OAuth State"

**Symptom:**
```
⚠️ Discord OAuth: No user returned. Info: undefined
Redirect to: /login-failed?error=no_user
```

**Root Cause:** Session not persisted between authorization request and callback.

**Diagnostics:**
```bash
# 1. Check if sessions collection exists
mongosh "$MONGODB_URI" --eval "db.sessions.find().limit(1).pretty()"

# 2. Verify express-session configuration
grep -A 10 "session({" src/index.js

# 3. Check for cookie being set
# In browser DevTools → Application → Cookies
# Should see: connect.sid cookie
```

**Solutions:**

1. **Verify MongoDB session store is configured:**
```javascript
// src/index.js
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      touchAfter: 24 * 3600
    }),
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    }
  })
);
```

2. **Check SESSION_SECRET is set:**
```bash
echo $SESSION_SECRET
# If empty, generate new secret:
export SESSION_SECRET=$(openssl rand -base64 64)
```

3. **Verify cookie domain matches:**
```javascript
// If using custom domain, set cookie domain
cookie: {
  domain: process.env.COOKIE_DOMAIN || undefined,
  // ... other settings
}
```

4. **Check browser cookie settings:**
- Ensure cookies enabled in browser
- Clear cookies for `localhost` or your domain
- Disable strict tracking protection (Firefox)
- Try in incognito mode

---

### Error 2: "Discord API Error: Invalid Client"

**Symptom:**
```
❌ Discord OAuth Error Details:
Error message: invalid_request
Discord API Response: { error: "invalid_client", error_description: "Invalid client credentials" }
```

**Root Cause:** Incorrect `DISCORD_CLIENT_ID` or `DISCORD_CLIENT_SECRET`.

**Diagnostics:**
```bash
# 1. Check environment variables
echo "Client ID: ${DISCORD_CLIENT_ID:0:10}..."
echo "Client Secret: ${DISCORD_CLIENT_SECRET:0:10}..."

# 2. Verify credentials match Discord Developer Portal
# https://discord.com/developers/applications
# Application → OAuth2 → General
```

**Solutions:**

1. **Copy credentials from Discord Developer Portal:**
```bash
# In Discord Developer Portal:
# Application → OAuth2 → General
# Client ID: 1234567890123456789
# Client Secret: (click "Reset Secret" to reveal)

# Update .env
DISCORD_CLIENT_ID=1234567890123456789
DISCORD_CLIENT_SECRET=your_actual_client_secret_here
```

2. **Verify callback URL registered:**
```
Discord Developer Portal → OAuth2 → Redirects
Must include: http://localhost:5000/auth/discord/callback (dev)
Must include: https://yourdomain.com/auth/discord/callback (prod)
```

3. **Restart application after updating .env:**
```bash
pm2 restart all
# or
npm run dev
```

---

### Error 3: "Redirect URI Mismatch"

**Symptom:**
```
Discord redirects to error page:
"redirect_uri_mismatch: The redirect URI provided does not match a registered redirect URI."
```

**Root Cause:** `DISCORD_CALLBACK_URL` doesn't match registered redirect in Discord portal.

**Diagnostics:**
```bash
# 1. Check callback URL environment variable
echo $DISCORD_CALLBACK_URL

# 2. Check Passport.js config
grep "callbackURL" src/config/passport.js

# 3. Verify registered redirects in Discord portal
# https://discord.com/developers/applications → OAuth2 → Redirects
```

**Solutions:**

1. **Match exact URL (including protocol, domain, port, path):**
```bash
# Development
DISCORD_CALLBACK_URL=http://localhost:5000/auth/discord/callback

# Production
DISCORD_CALLBACK_URL=https://api.yourdomain.com/auth/discord/callback
```

2. **Register URL in Discord Developer Portal:**
```
Discord Developer Portal → OAuth2 → Redirects → Add Redirect
http://localhost:5000/auth/discord/callback (development)
https://api.yourdomain.com/auth/discord/callback (production)
```

3. **No trailing slash:**
```
✅ Correct: http://localhost:5000/auth/discord/callback
❌ Wrong: http://localhost:5000/auth/discord/callback/
```

---

### Error 4: "Session Not Found After Login"

**Symptom:**
User successfully authenticates with Discord, but immediately logged out on next request.

**Root Cause:** Session not deserializing properly or user document not found.

**Diagnostics:**
```bash
# 1. Check sessions collection
mongosh "$MONGODB_URI" --eval "db.sessions.find({}, {session: 1, expires: 1}).pretty()"

# 2. Verify user exists
mongosh "$MONGODB_URI" --eval "db.users.findOne({discordId: 'user_discord_id'})"

# 3. Check deserialization logs
# Add console.log in passport.deserializeUser
```

**Solutions:**

1. **Verify serialization uses correct field:**
```javascript
// src/middleware/auth.js OR src/config/passport.js
passport.serializeUser((user, done) => {
  done(null, user.discordId); // Use discordId (NOT user.id if using MongoDB _id)
});

passport.deserializeUser(async (discordId, done) => {
  try {
    const user = await User.findByDiscordId(discordId); // Custom static method
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});
```

2. **Add User.findByDiscordId static method:**
```javascript
// src/models/User.js
userSchema.statics.findByDiscordId = function(discordId) {
  return this.findOne({ discordId });
};
```

3. **Check session expiry:**
```javascript
// Sessions expire after 7 days by default
// Verify expires field in MongoDB is in the future
db.sessions.find({}, {expires: 1})
```

---

## Broker OAuth2 Errors

### Error 5: "OAuth State Expired"

**Symptom:**
```html
<h1>Invalid OAuth State</h1>
<p>This OAuth session has expired or is invalid. Please try again.</p>
```

**Root Cause:** User took >10 minutes to authorize broker, state parameter expired.

**Solutions:**

1. **Increase state expiry time:**
```javascript
// src/routes/api/broker-oauth.js
setTimeout(() => oauthStates.delete(state), 15 * 60 * 1000); // 15 minutes instead of 10
```

2. **User action:** Close popup and click "Connect" again.

3. **Production: Use Redis for state storage (persistent across server restarts):**
```javascript
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL);

// Store state
await redis.setex(`oauth:state:${state}`, 600, JSON.stringify(stateData)); // 10 min TTL

// Retrieve state
const stateData = JSON.parse(await redis.get(`oauth:state:${state}`));

// Delete state
await redis.del(`oauth:state:${state}`);
```

---

### Error 6: "Broker Connection Failed" (Encrypted Credentials)

**Symptom:**
```
[AlpacaAdapter] Authentication failed: Failed to decrypt credentials
```

**Root Cause:** `ENCRYPTION_MASTER_SECRET` changed or not set.

**Diagnostics:**
```bash
# 1. Check encryption secret
echo ${ENCRYPTION_MASTER_SECRET:0:20}... # Should show first 20 chars

# 2. Verify length (should be 64 hex characters)
echo $ENCRYPTION_MASTER_SECRET | wc -c # Should output 65 (64 + newline)

# 3. Check MongoDB for encrypted credentials
mongosh "$MONGODB_URI" --eval "db.users.findOne({'brokerConfigs.alpaca': {\$exists: true}}, {'brokerConfigs.alpaca': 1})"
```

**Solutions:**

1. **Set ENCRYPTION_MASTER_SECRET if missing:**
```bash
export ENCRYPTION_MASTER_SECRET=$(openssl rand -hex 32)
echo "ENCRYPTION_MASTER_SECRET=$ENCRYPTION_MASTER_SECRET" >> .env
```

2. **If secret changed, users must reconnect brokers:**
   - Old credentials can't be decrypted with new secret
   - Display message: "Please reconnect your broker accounts"
   - Users click "Disconnect" → "Connect" to re-authorize

3. **Production: Store secret in secrets manager:**
```bash
# AWS Secrets Manager
aws secretsmanager create-secret \
  --name trade-executor/encryption-master-secret \
  --secret-string "$(openssl rand -hex 32)"

# Retrieve in application
ENCRYPTION_MASTER_SECRET=$(aws secretsmanager get-secret-value \
  --secret-id trade-executor/encryption-master-secret \
  --query SecretString --output text)
```

---

### Error 7: "Token Refresh Failed"

**Symptom:**
```
[AlpacaAdapter] Token refresh failed: invalid_grant
```

**Root Cause:** Refresh token expired, revoked, or broker credentials changed.

**Diagnostics:**
```bash
# 1. Check broker config in MongoDB
mongosh "$MONGODB_URI" --eval "
  db.users.findOne(
    {'brokerConfigs.alpaca': {\$exists: true}},
    {'brokerConfigs.alpaca.configuredAt': 1, 'brokerConfigs.alpaca.lastVerified': 1}
  )
"

# 2. Check token age
# If configuredAt is >7 days ago (Alpaca token lifetime), refresh token may be expired

# 3. Verify broker OAuth app credentials still valid
# Check Alpaca dashboard for app status
```

**Solutions:**

1. **User must reconnect broker:**
```javascript
// Frontend: Display reconnect button
{broker.needsReconnect && (
  <button onClick={() => handleConnect(brokerKey)}>
    Reconnect {brokerKey.toUpperCase()}
  </button>
)}
```

2. **Implement refresh token rotation:**
```javascript
// When refreshing, save new refresh token
const newTokens = await AlpacaAdapter.refreshAccessToken(...);

// Alpaca rotates refresh tokens, so save the new one
const encrypted = await encryptionService.encryptCredential(communityId, {
  accessToken: newTokens.accessToken,
  refreshToken: newTokens.refreshToken, // NEW refresh token
  ...
});
```

3. **Monitor token expiry proactively:**
```javascript
// Cron job to notify users of expiring tokens
cron.schedule('0 0 * * *', async () => { // Daily at midnight
  const users = await User.find({'brokerConfigs': {$exists: true}});

  for (const user of users) {
    for (const [broker, config] of user.brokerConfigs) {
      const daysOld = (Date.now() - config.configuredAt.getTime()) / (1000 * 60 * 60 * 24);

      if (daysOld > 6) { // Token expires in <1 day
        // Send email or in-app notification
        await sendNotification(user, {
          type: 'broker_token_expiring',
          broker,
          expiresIn: '< 24 hours'
        });
      }
    }
  }
});
```

---

## Session & Cookie Issues

### Error 8: "Cookie Not Set in Browser"

**Symptom:**
- User redirected to dashboard after login
- But `GET /auth/status` returns `{ authenticated: false }`
- No `connect.sid` cookie in browser DevTools

**Root Cause:** Cookie security settings incompatible with development environment.

**Diagnostics:**
```javascript
// Check cookie settings
app.use(
  session({
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // ❌ Must be false in dev
      sameSite: 'lax'
    }
  })
);
```

**Solutions:**

1. **Development: Disable secure flag:**
```javascript
cookie: {
  httpOnly: true,
  secure: false, // Allow cookies over HTTP in development
  sameSite: 'lax'
}
```

2. **Production: Use HTTPS only:**
```javascript
cookie: {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production', // true in production
  sameSite: 'lax'
}
```

3. **Check browser settings:**
- Ensure cookies enabled
- Disable strict tracking protection (Firefox)
- Clear site data and retry

---

### Error 9: "Session Expires Immediately"

**Symptom:**
User logged in successfully but session expires within minutes.

**Root Cause:** MongoDB TTL index deleting sessions prematurely.

**Diagnostics:**
```bash
# Check sessions TTL index
mongosh "$MONGODB_URI" --eval "db.sessions.getIndexes()"

# Expected output:
# {
#   v: 2,
#   key: { expires: 1 },
#   name: 'expires_1',
#   expireAfterSeconds: 0
# }

# Check session expires field
mongosh "$MONGODB_URI" --eval "db.sessions.find({}, {expires: 1, _id: 1}).pretty()"
```

**Solutions:**

1. **Verify maxAge in session config:**
```javascript
cookie: {
  maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days (604800000 ms)
  // ...
}
```

2. **Check system clock synchronization:**
```bash
# macOS/Linux
date

# If time is incorrect, sync with NTP server
sudo ntpdate -u time.apple.com
```

3. **Re-create TTL index if corrupted:**
```bash
mongosh "$MONGODB_URI" --eval "
  db.sessions.dropIndex('expires_1');
  db.sessions.createIndex({ expires: 1 }, { expireAfterSeconds: 0 });
"
```

---

## Token Management Issues

### Error 10: "Access Token Expired"

**Symptom:**
```
[AlpacaAdapter] getBalance error: Unauthorized (401)
```

**Root Cause:** Access token expired, but automatic refresh not triggered.

**Diagnostics:**
```bash
# Check last token refresh time
mongosh "$MONGODB_URI" --eval "
  db.users.findOne(
    {'brokerConfigs.alpaca': {\$exists: true}},
    {'brokerConfigs.alpaca.lastVerified': 1}
  )
"

# Check if token refresh cron job is running
pm2 list | grep "token-refresh"
```

**Solutions:**

1. **Enable automatic token refresh cron job:**
```javascript
// src/jobs/refreshBrokerTokens.js
const cron = require('node-cron');

// Run every hour
cron.schedule('0 * * * *', async () => {
  // Refresh tokens at 80% of lifetime
  // ... (see BROKER_INTEGRATION.md)
});

// Start job in src/index.js
require('./jobs/refreshBrokerTokens');
```

2. **Manual refresh before API call:**
```javascript
async authenticate() {
  // Check token age before using
  const tokenAge = Date.now() - config.lastVerified.getTime();
  const expiresInMs = decryptedCreds.expiresIn * 1000;

  if (tokenAge > expiresInMs * 0.8) { // Refresh at 80% lifetime
    console.log('[Adapter] Proactively refreshing token...');
    const newTokens = await this.constructor.refreshAccessToken(...);
    // Save new tokens...
  }
}
```

3. **User action: Reconnect broker** if refresh fails.

---

## Security & CORS Errors

### Error 11: "CORS Policy Blocking Request"

**Symptom:**
```
Access to fetch at 'http://localhost:5000/api/trader/subscription' from origin 'http://localhost:3000' has been blocked by CORS policy: The value of the 'Access-Control-Allow-Credentials' header in the response is '' which must be 'true' when the request's credentials mode is 'include'.
```

**Root Cause:** Frontend and backend on different origins, credentials not allowed.

**Diagnostics:**
```bash
# Check CORS configuration
grep -A 5 "cors({" src/index.js

# Verify DASHBOARD_URL environment variable
echo $DASHBOARD_URL
```

**Solutions:**

1. **Configure CORS to allow credentials:**
```javascript
// src/index.js
app.use(
  cors({
    origin: process.env.DASHBOARD_URL || 'http://localhost:3000',
    credentials: true, // ✅ MUST be true for cookies
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);
```

2. **Frontend: Include credentials in fetch:**
```javascript
fetch('/api/trader/subscription', {
  credentials: 'include' // ✅ Send cookies with request
})
```

3. **Production: Set DASHBOARD_URL:**
```bash
# .env
DASHBOARD_URL=https://dashboard.yourdomain.com
```

---

### Error 12: "Content Security Policy Violation"

**Symptom:**
```
Refused to connect to 'https://discord.com' because it violates the following Content Security Policy directive: "connect-src 'self'".
```

**Root Cause:** Helmet CSP blocking external API calls.

**Diagnostics:**
```bash
# Check Helmet CSP configuration
grep -A 15 "helmet({" src/index.js
```

**Solutions:**

1. **Add Discord to CSP whitelist:**
```javascript
helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", 'https://discord.com'], // ✅ Allow Discord API
      imgSrc: ["'self'", 'data:', 'https://cdn.discordapp.com'], // Discord avatars
      // ...
    }
  }
})
```

2. **Add broker APIs if needed:**
```javascript
connectSrc: [
  "'self'",
  'https://discord.com',
  'https://api.alpaca.markets', // Alpaca API
  'https://app.alpaca.markets', // Alpaca OAuth
  'ws:', 'wss:' // WebSocket connections
]
```

---

## Production Deployment Issues

### Error 13: "Session Store Connection Failed"

**Symptom:**
```
MongoServerSelectionError: Could not connect to any servers in your MongoDB Atlas cluster.
```

**Root Cause:** MongoDB Atlas IP whitelist doesn't include production server IP.

**Solutions:**

1. **Whitelist production IP in MongoDB Atlas:**
```
MongoDB Atlas → Network Access → Add IP Address
- Current IP Address (auto-detect)
- OR: 0.0.0.0/0 (allow all - use cautiously)
```

2. **Use VPC peering for secure connection** (AWS/GCP).

3. **Verify connection string:**
```bash
# Test connection from production server
mongosh "$MONGODB_URI" --eval "db.adminCommand('ping')"
```

---

### Error 14: "HTTPS Required for Secure Cookies"

**Symptom:**
Cookies not set in production (HTTPS environment).

**Root Cause:** `secure: true` requires HTTPS, but server behind proxy not detected.

**Solutions:**

1. **Trust proxy (for Railway, Heroku, AWS ALB):**
```javascript
// src/index.js
app.set('trust proxy', 1); // ✅ Trust first proxy
```

2. **Verify HTTPS in logs:**
```bash
# Should log "https" in production
pm2 logs | grep "protocol:"
```

3. **Force HTTPS redirect:**
```javascript
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && !req.secure) {
    return res.redirect(`https://${req.get('host')}${req.url}`);
  }
  next();
});
```

---

## Emergency Procedures

### Emergency 1: Mass Session Invalidation

**Scenario:** Security breach, need to log out all users immediately.

**Solution:**
```bash
# 1. Delete all sessions from MongoDB
mongosh "$MONGODB_URI" --eval "db.sessions.deleteMany({})"

# 2. Rotate SESSION_SECRET
export SESSION_SECRET=$(openssl rand -base64 64)
echo "SESSION_SECRET=$SESSION_SECRET" >> .env

# 3. Restart application
pm2 restart all

# Result: All users logged out, must re-authenticate
```

---

### Emergency 2: Broker Token Compromise

**Scenario:** Broker API key leaked, need to revoke all tokens.

**Solution:**
```bash
# 1. Remove all broker configs from users
mongosh "$MONGODB_URI" --eval "
  db.users.updateMany(
    {},
    { \$unset: { 'brokerConfigs.alpaca': '' } }
  )
"

# 2. Revoke tokens in broker portal (if supported)
# Alpaca: Dashboard → OAuth Apps → Revoke All Tokens

# 3. Rotate OAuth credentials
# Generate new client secret in broker portal
# Update .env with new credentials

# 4. Notify users via email/in-app
# "For security reasons, please reconnect your Alpaca account"
```

---

### Emergency 3: Encryption Key Rotation

**Scenario:** Need to rotate `ENCRYPTION_MASTER_SECRET` without losing data.

**Solution:**
```bash
# 1. Generate new encryption key
NEW_SECRET=$(openssl rand -hex 32)

# 2. Decrypt all credentials with old key, re-encrypt with new key
# (Run this script)
node scripts/rotate-encryption-key.js \
  --old-secret "$ENCRYPTION_MASTER_SECRET" \
  --new-secret "$NEW_SECRET"

# 3. Update environment variable
export ENCRYPTION_MASTER_SECRET=$NEW_SECRET
echo "ENCRYPTION_MASTER_SECRET=$NEW_SECRET" >> .env

# 4. Restart application
pm2 restart all
```

**Migration Script:** `scripts/rotate-encryption-key.js`
```javascript
const User = require('./src/models/User');
const encryptionService = require('./src/services/encryption');

async function rotateKeys(oldSecret, newSecret) {
  const users = await User.find({'brokerConfigs': {$exists: true}});

  for (const user of users) {
    for (const [broker, config] of user.brokerConfigs) {
      if (config.authMethod !== 'oauth') continue;

      // Decrypt with old key
      const decrypted = await encryptionService.decryptCredential(
        user.communityId,
        config.credentials,
        oldSecret // Use old secret
      );

      // Re-encrypt with new key
      const encrypted = await encryptionService.encryptCredential(
        user.communityId,
        decrypted,
        newSecret // Use new secret
      );

      config.credentials = encrypted;
      await user.save();

      console.log(`✅ Rotated ${broker} for user ${user._id}`);
    }
  }

  console.log('🎉 Key rotation complete');
}

// Run
rotateKeys(process.argv[3], process.argv[5]);
```

---

## Related Documentation

- [OAuth2 Architecture](./OAUTH2_ARCHITECTURE.md) - Discord authentication flow
- [Broker Integration](./BROKER_INTEGRATION.md) - Trading platform OAuth2
- [Security Hardening](./SECURITY_HARDENING.md) - Production security checklist

---

**Last Updated:** 2025-10-20
**Maintainer:** Development Team
**Review Cycle:** Quarterly (Next Review: 2026-01-20)
