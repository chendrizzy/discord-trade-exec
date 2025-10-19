# Design: Unified OAuth2 Authentication System

## Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Dashboard UI Layer                       │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │ OAuth2Button │  │ CallbackPage │  │ TokenStatusBadge│   │
│  └──────────────┘  └──────────────┘  └─────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    API Routes Layer                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ /auth/broker/:broker/authorize                         │ │
│  │ /auth/broker/callback                                  │ │
│  │ /api/brokers/:broker/oauth/refresh                    │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   OAuth2 Service Layer                       │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ OAuth2Service (Centralized OAuth2 Logic)              │ │
│  │                                                        │ │
│  │ • generateAuthorizationURL(broker, userId, state)     │ │
│  │ • exchangeCodeForToken(broker, code, state)           │ │
│  │ • refreshAccessToken(broker, userId)                  │ │
│  │ • validateState(state)                                │ │
│  │ • encryptTokens(tokens)                               │ │
│  │ • decryptTokens(encryptedTokens)                      │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Broker Adapter Layer                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  Alpaca  │  │   IBKR   │  │ TDAmer..│  │ E*TRADE  │   │
│  │ Adapter  │  │ Adapter  │  │ Adapter  │  │ Adapter  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│                                                              │
│  Each implements: authenticate() using OAuth2Service        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Data Persistence Layer                      │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ User Model (MongoDB)                                   │ │
│  │                                                        │ │
│  │ oauthTokens: Map {                                     │ │
│  │   'alpaca': {                                          │ │
│  │     accessToken: 'encrypted...',                       │ │
│  │     refreshToken: 'encrypted...',                      │ │
│  │     expiresAt: Date,                                   │ │
│  │     scopes: ['account:write', 'trading'],             │ │
│  │     tokenType: 'Bearer'                                │ │
│  │   }                                                    │ │
│  │ }                                                      │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│               Background Jobs Layer                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ TokenRefreshJob (Cron: every 1 hour)                  │ │
│  │                                                        │ │
│  │ • Query users with tokens expiring in <24 hours       │ │
│  │ • Call OAuth2Service.refreshAccessToken()             │ │
│  │ • Update User.oauthTokens with new tokens             │ │
│  │ • Send notification if refresh fails                  │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Design Decisions

### Decision 1: Centralized OAuth2Service vs. Per-Broker Implementation

**Options Considered:**
1. **Centralized OAuth2Service** (CHOSEN)
   - Single service handles OAuth2 for all brokers
   - Broker-specific config passed as parameters

2. **Per-Broker OAuth2 Classes**
   - `AlpacaOAuth2.js`, `IBKROAuth2.js`, etc.
   - Each broker implements own OAuth2 logic

**Decision:** Centralized OAuth2Service

**Rationale:**
- **DRY Principle**: 80% of OAuth2 logic is identical (authorization URL, token exchange, refresh)
- **Maintainability**: Single place to fix bugs or add features (e.g., PKCE support)
- **Consistency**: Guaranteed identical behavior across all brokers
- **Testing**: Easier to write comprehensive tests for single service

**Trade-offs:**
- ✅ Less code duplication
- ✅ Easier maintenance
- ❌ Slightly less flexible for broker-specific OAuth2 quirks
- **Mitigation**: Use broker config object for customizations

---

### Decision 2: Token Storage Schema

**Options Considered:**
1. **Embedded in User Model** (CHOSEN)
   ```javascript
   oauthTokens: Map<String, Object>
   ```

2. **Separate OAuth2Tokens Collection**
   ```javascript
   {
     userId: ObjectId,
     broker: String,
     accessToken: String,
     ...
   }
   ```

**Decision:** Embedded in User Model

**Rationale:**
- **Consistency**: Matches existing `brokerConfigs` and `apiKeys` pattern
- **Performance**: No JOIN operations needed for user + tokens
- **Simplicity**: Single query to get user profile with OAuth2 tokens
- **Atomic Updates**: Can update user + tokens in single transaction

**Trade-offs:**
- ✅ Faster reads (single query)
- ✅ Simpler code
- ❌ Larger User documents (acceptable for <10 broker tokens per user)
- **Mitigation**: Encrypt tokens to reduce storage size

---

### Decision 3: OAuth2 Flow Pattern

**Options Considered:**
1. **Authorization Code Flow** (CHOSEN)
   - User → Authorization URL → Broker → Callback → Token Exchange

2. **Implicit Flow**
   - User → Authorization URL → Broker → Redirect with token in URL

3. **Client Credentials Flow**
   - Server → Token request → Broker

**Decision:** Authorization Code Flow

**Rationale:**
- **Security**: Tokens never exposed in browser URL (safer than Implicit)
- **Standard**: OAuth2.1 deprecates Implicit flow
- **Refresh Tokens**: Only Authorization Code flow provides refresh tokens
- **Broker Support**: All target brokers (IBKR, TD Ameritrade, E*TRADE) support it

**Implementation:**
```javascript
// Step 1: Generate authorization URL
const authUrl = OAuth2Service.generateAuthorizationURL('alpaca', user.id, state);
// User clicks "Connect Alpaca" → redirects to authUrl

// Step 2: Broker redirects to callback
// GET /auth/broker/callback?code=ABC&state=XYZ

// Step 3: Exchange code for tokens
const tokens = await OAuth2Service.exchangeCodeForToken('alpaca', code, state);

// Step 4: Store encrypted tokens
user.oauthTokens.set('alpaca', encryptedTokens);
await user.save();
```

---

### Decision 4: State Parameter Generation & Validation

**Options Considered:**
1. **Cryptographically Random State** (CHOSEN)
   - Generate: `crypto.randomBytes(32).toString('hex')`
   - Store in session with 5-minute TTL

2. **JWT-Based State**
   - Encode `{userId, broker, timestamp}` as signed JWT

**Decision:** Cryptographically Random State

**Rationale:**
- **Simplicity**: No JWT library needed
- **Security**: Crypto-random provides excellent CSRF protection
- **Stateful**: Session storage allows server-side validation
- **Expiration**: Redis/MongoDB TTL handles automatic cleanup

**Implementation:**
```javascript
// Generate state
const state = crypto.randomBytes(32).toString('hex');
req.session.oauthState = {
  state,
  broker,
  userId: req.user.id,
  createdAt: Date.now()
};

// Validate state (in callback)
if (!req.session.oauthState || req.session.oauthState.state !== query.state) {
  throw new Error('Invalid state parameter');
}
if (Date.now() - req.session.oauthState.createdAt > 5 * 60 * 1000) {
  throw new Error('State expired');
}
```

---

### Decision 5: Token Refresh Strategy

**Options Considered:**
1. **Proactive Refresh (Cron Job)** (CHOSEN)
   - Background job refreshes tokens before expiration

2. **Reactive Refresh (On API Call)**
   - Refresh token when API call fails with 401

3. **Lazy Refresh (On User Action)**
   - Refresh only when user explicitly re-authenticates

**Decision:** Proactive Refresh with Reactive Fallback

**Rationale:**
- **User Experience**: No authentication errors during trading (critical)
- **Reliability**: Cron job ensures tokens always fresh
- **Fallback**: If cron fails, reactive refresh prevents hard failures

**Implementation:**
```javascript
// Cron Job (every 1 hour)
async function refreshExpiringTokens() {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const users = await User.find({
    'oauthTokens': { $exists: true }
  });

  for (const user of users) {
    for (const [broker, tokenData] of user.oauthTokens) {
      if (tokenData.expiresAt < tomorrow) {
        try {
          await OAuth2Service.refreshAccessToken(broker, user.id);
        } catch (error) {
          // Send email notification
          await notifyUserTokenRefreshFailed(user, broker);
        }
      }
    }
  }
}

// Reactive Fallback (in BrokerAdapter)
async authenticate() {
  try {
    return await this.apiClient.authenticate();
  } catch (error) {
    if (error.statusCode === 401) {
      // Token expired, try refresh
      await OAuth2Service.refreshAccessToken(this.brokerName, this.userId);
      return await this.apiClient.authenticate(); // Retry
    }
    throw error;
  }
}
```

---

## Security Considerations

### Token Encryption
- **At Rest**: All tokens encrypted using `ENCRYPTION_KEY` (AES-256-GCM)
- **In Transit**: HTTPS enforced for all OAuth2 flows
- **In Memory**: Tokens decrypted only when needed, cleared after use

### CSRF Protection
- **State Parameter**: Cryptographically random, session-stored, 5-minute expiration
- **Origin Validation**: Callback URL must match registered redirect URI

### Refresh Token Rotation
- **Rotation**: Request new refresh token on each use (if broker supports)
- **Revocation**: Old refresh token invalidated after rotation

### Scope Minimization
- **Principle**: Request only necessary scopes
- **Default Scopes**: `account:read`, `trading` (broker-specific)
- **User Visibility**: Display scopes in UI before authorization

---

## Broker-Specific Configurations

### OAuth2 Provider Configs

```javascript
const OAUTH2_PROVIDERS = {
  alpaca: {
    authorizationURL: 'https://app.alpaca.markets/oauth/authorize',
    tokenURL: 'https://api.alpaca.markets/oauth/token',
    clientId: process.env.ALPACA_OAUTH_CLIENT_ID,
    clientSecret: process.env.ALPACA_OAUTH_CLIENT_SECRET,
    redirectUri: process.env.BASE_URL + '/auth/broker/callback',
    scopes: ['account:write', 'trading'],
    tokenExpiry: 7 * 24 * 60 * 60 * 1000, // 7 days
  },

  ibkr: {
    authorizationURL: 'https://api.ibkr.com/v1/oauth/authorize',
    tokenURL: 'https://api.ibkr.com/v1/oauth/token',
    clientId: process.env.IBKR_OAUTH_CLIENT_ID,
    clientSecret: process.env.IBKR_OAUTH_CLIENT_SECRET,
    redirectUri: process.env.BASE_URL + '/auth/broker/callback',
    scopes: ['trading', 'account'],
    tokenExpiry: 24 * 60 * 60 * 1000, // 24 hours
  },

  tdameritrade: {
    authorizationURL: 'https://auth.tdameritrade.com/auth',
    tokenURL: 'https://api.tdameritrade.com/v1/oauth2/token',
    clientId: process.env.TDAMERITRADE_OAUTH_CLIENT_ID,
    clientSecret: process.env.TDAMERITRADE_OAUTH_CLIENT_SECRET,
    redirectUri: process.env.BASE_URL + '/auth/broker/callback',
    scopes: ['PlaceTrades', 'AccountAccess'],
    tokenExpiry: 30 * 60 * 1000, // 30 minutes
  },

  etrade: {
    authorizationURL: 'https://us.etrade.com/e/t/etws/authorize',
    tokenURL: 'https://api.etrade.com/oauth/access_token',
    clientId: process.env.ETRADE_OAUTH_CLIENT_ID,
    clientSecret: process.env.ETRADE_OAUTH_CLIENT_SECRET,
    redirectUri: process.env.BASE_URL + '/auth/broker/callback',
    scopes: ['trading', 'account'],
    tokenExpiry: 2 * 60 * 60 * 1000, // 2 hours
  }
};
```

---

## Error Handling

### OAuth2 Error Scenarios

| Error | Cause | User Message | Recovery |
|-------|-------|--------------|----------|
| `invalid_state` | CSRF attack or expired session | "Authorization session expired. Please try again." | Restart OAuth2 flow |
| `access_denied` | User denied authorization | "Authorization cancelled. You can try again anytime." | Show "Try Again" button |
| `invalid_grant` | Authorization code expired | "Authorization expired. Please try connecting again." | Restart OAuth2 flow |
| `refresh_failed` | Refresh token invalid | "Re-authentication required. Please reconnect your broker." | Email + dashboard alert |
| `token_expired` | Access token expired (no refresh) | "Your session expired. Please reconnect your broker." | Show reconnect button |

---

## Performance Considerations

### Token Refresh Optimization
- **Batch Refresh**: Group token refreshes by broker to leverage rate limits
- **Caching**: Cache access tokens in memory for 5 minutes to reduce DB queries
- **Lazy Loading**: Only decrypt tokens when adapter needs them

### Database Queries
- **Index**: Add index on `oauthTokens.<broker>.expiresAt` for cron job
- **Projection**: Only query users with expiring tokens (filter on expiresAt)

---

## Testing Strategy

### Unit Tests
- `OAuth2Service.generateAuthorizationURL()` - URL construction
- `OAuth2Service.exchangeCodeForToken()` - Token exchange logic
- `OAuth2Service.refreshAccessToken()` - Token refresh logic
- `OAuth2Service.validateState()` - State validation

### Integration Tests
- Full OAuth2 flow with mocked broker responses
- Token refresh cron job execution
- Error handling for all OAuth2 error codes

### E2E Tests (Manual)
- Complete OAuth2 flow for each broker (Alpaca, IBKR, TD Ameritrade, E*TRADE)
- Token refresh automation
- UI components (OAuth2Button, CallbackPage, TokenStatusBadge)

---

## Migration Plan

### Phase 1: Infrastructure (Week 1)
1. Create `OAuth2Service` with core methods
2. Add `oauthTokens` field to User model
3. Implement OAuth2 routes (`/auth/broker/:broker/authorize`, `/auth/broker/callback`)
4. Unit tests for OAuth2Service

### Phase 2: Alpaca/Schwab Standardization (Week 2)
1. Migrate Alpaca OAuth2 to use OAuth2Service
2. Migrate Schwab OAuth2 to use OAuth2Service
3. Remove duplicated OAuth2 code from adapters
4. Integration tests

### Phase 3: New Broker Integrations (Week 3-4)
1. IBKR OAuth2 adapter
2. TD Ameritrade OAuth2 adapter
3. E*TRADE OAuth2 adapter
4. Broker-specific integration tests

### Phase 4: Token Refresh Automation (Week 5)
1. Implement `TokenRefreshJob` cron
2. Add email notifications for refresh failures
3. Reactive refresh fallback in adapters
4. E2E tests for token lifecycle

### Phase 5: UI Components (Week 6)
1. `OAuth2Button` component
2. `OAuth2CallbackPage` component
3. `TokenStatusBadge` component
4. Dashboard integration
5. E2E UI tests

---

## Open Questions for Review

1. **PKCE Support**: Should we implement PKCE (Proof Key for Code Exchange) for enhanced security?
   - **Recommendation**: Yes for mobile/SPA, optional for server-side flow

2. **Multi-Environment Support**: How to handle OAuth2 for paper trading vs. live accounts?
   - **Recommendation**: Separate OAuth2 apps per environment, selected via `isTestnet` flag

3. **Token Storage Duration**: How long to keep expired/revoked tokens?
   - **Recommendation**: Keep for 30 days for audit trail, then purge

4. **Concurrent Token Refresh**: What if multiple requests trigger token refresh simultaneously?
   - **Recommendation**: Use distributed lock (Redis) to prevent race conditions
