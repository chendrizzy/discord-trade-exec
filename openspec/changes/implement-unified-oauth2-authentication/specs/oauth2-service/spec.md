# Spec: OAuth2 Service

## ADDED Requirements

### Requirement: OAuth2 Authorization URL Generation

The system SHALL generate broker-specific OAuth2 authorization URLs with state parameter for CSRF protection. The state parameter MUST be cryptographically random (32 bytes) and stored in session with 5-minute TTL.

**Rationale**: Centralized authorization URL generation ensures consistent OAuth2 flow across all brokers while preventing CSRF attacks via state parameter validation.

#### Scenario: Generate authorization URL for Alpaca OAuth2

**Given** user is authenticated with userId "user_12345"
**And** user clicks "Connect Alpaca Broker" button
**When** OAuth2Service.generateAuthorizationURL('alpaca', 'user_12345') is called
**Then** system generates cryptographically random state = "a7f3c9e2...64-char-hex"
**And** stores state in session:
```javascript
req.session.oauthState = {
  state: "a7f3c9e2...",
  broker: "alpaca",
  userId: "user_12345",
  createdAt: 1729260000000
}
```
**And** returns authorization URL:
```
https://app.alpaca.markets/oauth/authorize?
  response_type=code&
  client_id=ALPACA_CLIENT_ID&
  redirect_uri=https://example.com/auth/broker/callback&
  state=a7f3c9e2...&
  scope=account:write+trading
```
**And** user is redirected to broker authorization page

---

#### Scenario: Reject authorization URL generation without authenticated user

**Given** no user session exists (req.user is undefined)
**When** OAuth2Service.generateAuthorizationURL('alpaca', null) is called
**Then** system throws error "User authentication required for OAuth2 flow"
**And** HTTP 401 Unauthorized response returned
**And** no state parameter generated or stored

---

### Requirement: OAuth2 Token Exchange

The system SHALL exchange authorization codes for access/refresh tokens via broker token endpoints. Token exchange MUST validate state parameter against session storage before proceeding.

**Rationale**: Secure token exchange with state validation prevents authorization code interception attacks and ensures only authorized users can complete OAuth2 flow.

#### Scenario: Exchange authorization code for access token (Alpaca)

**Given** user completed authorization at broker
**And** broker redirects to callback URL with code and state:
```
GET /auth/broker/callback?code=ABC123&state=a7f3c9e2...
```
**And** session contains matching state:
```javascript
req.session.oauthState = {
  state: "a7f3c9e2...",
  broker: "alpaca",
  userId: "user_12345",
  createdAt: 1729260000000
}
```
**When** OAuth2Service.exchangeCodeForToken('alpaca', 'ABC123', 'a7f3c9e2...') is called
**Then** system validates state matches session state
**And** calculates state age: Date.now() - createdAt = 120 seconds
**And** confirms state age < 300 seconds (5 minutes)
**And** sends POST request to Alpaca token endpoint:
```javascript
POST https://api.alpaca.markets/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&
code=ABC123&
redirect_uri=https://example.com/auth/broker/callback&
client_id=ALPACA_CLIENT_ID&
client_secret=ALPACA_CLIENT_SECRET
```
**And** receives token response:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "def502001a2b3c4d5e6f...",
  "token_type": "Bearer",
  "expires_in": 604800,
  "scope": "account:write trading"
}
```
**And** returns decrypted tokens object with expiresAt calculated
**And** clears req.session.oauthState

---

#### Scenario: Reject token exchange with invalid state

**Given** broker callback received with state "INVALID_STATE"
**And** session oauthState.state = "a7f3c9e2..."
**When** OAuth2Service.exchangeCodeForToken('alpaca', 'ABC123', 'INVALID_STATE') is called
**Then** system compares 'INVALID_STATE' !== 'a7f3c9e2...'
**And** throws error "Invalid state parameter - possible CSRF attack"
**And** HTTP 403 Forbidden response returned
**And** NO token exchange request sent to broker
**And** security audit log created with severity: HIGH

---

#### Scenario: Reject token exchange with expired state

**Given** broker callback received with valid state
**And** session oauthState.createdAt = 1729259700000
**And** current time = 1729260100000 (6 minutes later)
**When** OAuth2Service.exchangeCodeForToken('alpaca', 'ABC123', state) is called
**Then** system calculates age: 400 seconds
**And** confirms age > 300 seconds (5-minute TTL)
**And** throws error "State parameter expired - please restart OAuth2 flow"
**And** HTTP 403 Forbidden response returned
**And** user redirected to connection page with error message

---

### Requirement: OAuth2 Token Refresh

The system SHALL refresh expired access tokens using valid refresh tokens. Refresh token rotation MUST be implemented when broker supports it, invalidating old refresh tokens after use.

**Rationale**: Automatic token refresh prevents authentication errors during trading and improves user experience by maintaining persistent connections.

#### Scenario: Refresh access token before expiration (proactive)

**Given** user has stored OAuth2 tokens for Alpaca:
```javascript
user.oauthTokens.get('alpaca') = {
  accessToken: "encrypted_old_access_token",
  refreshToken: "encrypted_refresh_token",
  expiresAt: new Date('2025-10-25T12:00:00Z'), // Expires in 12 hours
  scopes: ['account:write', 'trading'],
  tokenType: 'Bearer'
}
```
**And** current time = 2025-10-25T11:00:00Z (1 hour before expiration)
**And** token refresh cron job runs hourly
**When** OAuth2Service.refreshAccessToken('alpaca', 'user_12345') is called
**Then** system decrypts refresh token
**And** sends POST request to Alpaca token endpoint:
```javascript
POST https://api.alpaca.markets/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&
refresh_token=def502001a2b3c4d5e6f...&
client_id=ALPACA_CLIENT_ID&
client_secret=ALPACA_CLIENT_SECRET
```
**And** receives new tokens:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs_NEW...",
  "refresh_token": "def502001a2b3c4d5e6f_NEW...",
  "token_type": "Bearer",
  "expires_in": 604800
}
```
**And** encrypts new tokens using ENCRYPTION_KEY
**And** updates user.oauthTokens.set('alpaca', newEncryptedTokens)
**And** saves user document to MongoDB
**And** logs successful refresh: "[OAuth2Service] Refreshed alpaca tokens for user_12345"

---

#### Scenario: Handle refresh token failure with user notification

**Given** user has OAuth2 tokens with invalid/revoked refresh token
**When** OAuth2Service.refreshAccessToken('alpaca', 'user_12345') is called
**And** Alpaca token endpoint returns 400 Bad Request:
```json
{
  "error": "invalid_grant",
  "error_description": "The provided refresh token is invalid or expired"
}
```
**Then** system catches error and logs: "[OAuth2Service] Token refresh failed for user_12345: invalid_grant"
**And** marks tokens as invalid in user.oauthTokens:
```javascript
user.oauthTokens.set('alpaca', {
  ...existingTokens,
  isValid: false,
  lastRefreshError: 'invalid_grant',
  lastRefreshAttempt: new Date()
})
```
**And** sends email notification to user:
```
Subject: Reconnect Your Alpaca Broker Account
Body: Your Alpaca broker connection has expired. Please reconnect your account in the dashboard to resume trading.
```
**And** creates dashboard alert notification
**And** does NOT throw error (graceful degradation)

---

### Requirement: OAuth2 Token Encryption

The system SHALL encrypt all OAuth2 tokens (access, refresh) at rest using AES-256-GCM encryption. Tokens MUST only be decrypted when needed by broker adapters and cleared from memory immediately after use.

**Rationale**: Encrypted token storage protects sensitive credentials even if database is compromised, meeting SOC 2 compliance requirements.

#### Scenario: Encrypt tokens before storing in MongoDB

**Given** OAuth2Service receives new tokens from token exchange:
```javascript
const tokens = {
  accessToken: "eyJhbGciOiJIUzI1NiIs...",
  refreshToken: "def502001a2b3c4d5e6f...",
  expiresAt: new Date(Date.now() + 604800000),
  scopes: ['account:write', 'trading'],
  tokenType: 'Bearer'
}
```
**When** OAuth2Service.encryptTokens(tokens) is called
**Then** system retrieves ENCRYPTION_KEY from environment
**And** generates random 12-byte IV (initialization vector)
**And** encrypts accessToken using crypto.createCipheriv('aes-256-gcm', key, iv)
**And** encrypts refreshToken with separate IV
**And** returns encrypted tokens object:
```javascript
{
  accessToken: {
    encrypted: "a7f3c9e2b8d4...",
    iv: "1a2b3c4d5e6f...",
    authTag: "7g8h9i0j..."
  },
  refreshToken: {
    encrypted: "f6e5d4c3b2a1...",
    iv: "9h8g7f6e5d4c...",
    authTag: "3b2a1z9y..."
  },
  expiresAt: Date,
  scopes: Array,
  tokenType: String
}
```
**And** encrypted tokens stored in user.oauthTokens MongoDB field
**And** plaintext tokens cleared from memory

---

#### Scenario: Decrypt tokens for broker adapter authentication

**Given** user.oauthTokens.get('alpaca') contains encrypted tokens
**And** AlpacaAdapter needs to authenticate API request
**When** OAuth2Service.decryptTokens(encryptedTokens) is called
**Then** system retrieves encrypted accessToken, IV, and authTag
**And** creates decipher using crypto.createDecipheriv('aes-256-gcm', key, iv)
**And** sets authTag for authentication: decipher.setAuthTag(authTag)
**And** decrypts token to plaintext
**And** returns plaintext token to adapter for API request
**And** plaintext token used once and NOT stored in memory
**And** adapter clears token reference after API call

---

### Requirement: OAuth2 State Parameter Validation

The system SHALL validate all OAuth2 state parameters for equality, expiration, and session association before proceeding with token exchange.

**Rationale**: Multi-layer state validation prevents CSRF, session hijacking, and replay attacks against OAuth2 flows.

#### Scenario: Validate state parameter matches all criteria

**Given** callback request with state "a7f3c9e2..."
**And** session contains:
```javascript
req.session.oauthState = {
  state: "a7f3c9e2...",
  broker: "alpaca",
  userId: "user_12345",
  createdAt: 1729260000000
}
```
**And** current time = 1729260180000 (3 minutes after creation)
**When** OAuth2Service.validateState('a7f3c9e2...', req.session) is called
**Then** system validates:
- State equality: callback state === session state ✅
- State exists in session: ✅
- State age: (current - createdAt) = 180s < 300s ✅
- Session has userId: "user_12345" exists ✅
**And** returns validation result: { valid: true, userId: "user_12345", broker: "alpaca" }
**And** token exchange proceeds

---

#### Scenario: Reject state validation with missing session

**Given** callback request with state "a7f3c9e2..."
**And** req.session.oauthState is undefined (session expired/cleared)
**When** OAuth2Service.validateState('a7f3c9e2...', req.session) is called
**Then** system checks req.session.oauthState exists
**And** validation fails: session state not found
**And** returns validation result: { valid: false, error: "Session state not found" }
**And** HTTP 403 Forbidden response
**And** user shown error: "Your session expired. Please try connecting again."

---

## MODIFIED Requirements

None. All OAuth2 service requirements are new additions.

---

## REMOVED Requirements

None.

---

## Cross-References

- **Related Spec**: `broker-oauth2-integrations` - Uses OAuth2Service for IBKR/TD Ameritrade/E*TRADE authentication
- **Related Spec**: `oauth2-ui-components` - UI layer calls OAuth2Service methods
- **Related Spec**: `token-refresh-automation` - Background job uses OAuth2Service.refreshAccessToken()
- **Dependency**: User model must have `oauthTokens` Map field (MongoDB schema update)
- **Dependency**: Express session middleware with Redis/MongoDB store for state persistence
- **Dependency**: ENCRYPTION_KEY environment variable for AES-256-GCM token encryption

---

## Technical Notes

### OAuth2 Provider Configuration Schema

```javascript
// src/config/oauth2Providers.js
const OAUTH2_PROVIDERS = {
  alpaca: {
    authorizationURL: 'https://app.alpaca.markets/oauth/authorize',
    tokenURL: 'https://api.alpaca.markets/oauth/token',
    clientId: process.env.ALPACA_OAUTH_CLIENT_ID,
    clientSecret: process.env.ALPACA_OAUTH_CLIENT_SECRET,
    redirectUri: process.env.BASE_URL + '/auth/broker/callback',
    scopes: ['account:write', 'trading'],
    tokenExpiry: 7 * 24 * 60 * 60 * 1000, // 7 days
    supportsRefreshTokenRotation: true
  },
  ibkr: {
    authorizationURL: 'https://api.ibkr.com/v1/oauth/authorize',
    tokenURL: 'https://api.ibkr.com/v1/oauth/token',
    clientId: process.env.IBKR_OAUTH_CLIENT_ID,
    clientSecret: process.env.IBKR_OAUTH_CLIENT_SECRET,
    redirectUri: process.env.BASE_URL + '/auth/broker/callback',
    scopes: ['trading', 'account'],
    tokenExpiry: 24 * 60 * 60 * 1000, // 24 hours
    supportsRefreshTokenRotation: false
  },
  // ... additional brokers
};
```

### Token Encryption Implementation

```javascript
const crypto = require('crypto');
const ALGORITHM = 'aes-256-gcm';

class OAuth2Service {
  encryptTokens(tokens) {
    const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');

    const encryptToken = (token) => {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
      let encrypted = cipher.update(token, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const authTag = cipher.getAuthTag();

      return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex')
      };
    };

    return {
      accessToken: encryptToken(tokens.accessToken),
      refreshToken: encryptToken(tokens.refreshToken),
      expiresAt: tokens.expiresAt,
      scopes: tokens.scopes,
      tokenType: tokens.tokenType
    };
  }

  decryptTokens(encryptedTokens) {
    const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');

    const decryptToken = (tokenData) => {
      const decipher = crypto.createDecipheriv(
        ALGORITHM,
        key,
        Buffer.from(tokenData.iv, 'hex')
      );
      decipher.setAuthTag(Buffer.from(tokenData.authTag, 'hex'));
      let decrypted = decipher.update(tokenData.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    };

    return {
      accessToken: decryptToken(encryptedTokens.accessToken),
      refreshToken: decryptToken(encryptedTokens.refreshToken),
      expiresAt: encryptedTokens.expiresAt,
      scopes: encryptedTokens.scopes,
      tokenType: encryptedTokens.tokenType
    };
  }
}
```

### State Parameter Generation

```javascript
const crypto = require('crypto');

function generateState() {
  return crypto.randomBytes(32).toString('hex');
}

function storeState(req, state, broker, userId) {
  req.session.oauthState = {
    state,
    broker,
    userId,
    createdAt: Date.now()
  };
}

function validateState(state, session) {
  if (!session.oauthState) {
    return { valid: false, error: 'Session state not found' };
  }

  if (session.oauthState.state !== state) {
    return { valid: false, error: 'State mismatch - possible CSRF attack' };
  }

  const age = Date.now() - session.oauthState.createdAt;
  if (age > 5 * 60 * 1000) { // 5 minutes
    return { valid: false, error: 'State expired' };
  }

  return {
    valid: true,
    userId: session.oauthState.userId,
    broker: session.oauthState.broker
  };
}
```

---

**Spec Status**: Complete
**Scenarios**: 11 scenarios defined
**Coverage**: Authorization URL generation, token exchange, token refresh, token encryption, state validation
