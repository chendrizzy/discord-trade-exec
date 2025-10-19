# Spec: Broker OAuth2 Integrations

## ADDED Requirements

### Requirement: Interactive Brokers (IBKR) OAuth2 Authentication

The system SHALL implement OAuth2 authentication for Interactive Brokers using the OAuth2Service. IBKR OAuth2 flow MUST request `trading` and `account` scopes with 24-hour token expiration.

**Rationale**: IBKR requires OAuth2 for API access. Centralized OAuth2Service ensures consistent implementation while handling IBKR-specific token expiration (24 hours vs. Alpaca's 7 days).

#### Scenario: Connect IBKR account via OAuth2

**Given** user navigates to broker connection page
**And** clicks "Connect Interactive Brokers"
**When** IBKRAdapter.authenticate() is called
**Then** OAuth2Service.generateAuthorizationURL('ibkr', userId) generates URL:
```
https://api.ibkr.com/v1/oauth/authorize?
  response_type=code&
  client_id=IBKR_CLIENT_ID&
  redirect_uri=https://example.com/auth/broker/callback&
  state=b8f4d0e3...&
  scope=trading+account
```
**And** user redirected to IBKR authorization page
**And** state stored in session with createdAt timestamp

---

#### Scenario: Complete IBKR OAuth2 callback and token storage

**Given** user approves authorization at IBKR
**And** IBKR redirects to callback: `/auth/broker/callback?code=IBKR_CODE_123&state=b8f4d0e3...`
**When** OAuth2Service.exchangeCodeForToken('ibkr', 'IBKR_CODE_123', 'b8f4d0e3...') is called
**Then** system validates state parameter
**And** sends token request to IBKR:
```javascript
POST https://api.ibkr.com/v1/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&
code=IBKR_CODE_123&
redirect_uri=https://example.com/auth/broker/callback&
client_id=IBKR_CLIENT_ID&
client_secret=IBKR_CLIENT_SECRET
```
**And** receives IBKR tokens (24-hour expiration):
```json
{
  "access_token": "ibkr_access_xyz...",
  "refresh_token": "ibkr_refresh_abc...",
  "token_type": "Bearer",
  "expires_in": 86400,
  "scope": "trading account"
}
```
**And** encrypts tokens and stores in user.oauthTokens.set('ibkr', encryptedTokens)
**And** IBKRAdapter.client.setAccessToken(decryptedAccessToken)
**And** user redirected to dashboard with "IBKR Connected" success message

---

#### Scenario: Handle IBKR token refresh (24-hour expiration)

**Given** user has IBKR OAuth2 tokens expiring in 1 hour
**And** token refresh cron job runs
**When** OAuth2Service.refreshAccessToken('ibkr', userId) is called
**Then** system retrieves encrypted refresh token from user.oauthTokens.get('ibkr')
**And** decrypts refresh token
**And** sends refresh request to IBKR:
```javascript
POST https://api.ibkr.com/v1/oauth/token

grant_type=refresh_token&
refresh_token=ibkr_refresh_abc...&
client_id=IBKR_CLIENT_ID&
client_secret=IBKR_CLIENT_SECRET
```
**And** receives new 24-hour tokens
**And** updates user.oauthTokens with new encrypted tokens
**And** logs: "[OAuth2Service] Refreshed ibkr tokens for user {userId}"

---

### Requirement: TD Ameritrade OAuth2 Authentication

The system SHALL implement OAuth2 authentication for TD Ameritrade with `PlaceTrades` and `AccountAccess` scopes. TD Ameritrade tokens expire every 30 minutes, requiring more frequent refresh.

**Rationale**: TD Ameritrade's short token expiration (30 min) requires proactive refresh strategy to prevent mid-trade authentication failures.

#### Scenario: Connect TD Ameritrade account via OAuth2

**Given** user clicks "Connect TD Ameritrade"
**When** TDAmeritradeAdapter.authenticate() is called
**Then** OAuth2Service.generateAuthorizationURL('tdameritrade', userId) generates URL:
```
https://auth.tdameritrade.com/auth?
  response_type=code&
  client_id=TDAMERITRADE_CLIENT_ID&
  redirect_uri=https://example.com/auth/broker/callback&
  state=c9g5e1f4...
```
**And** user redirected to TD Ameritrade login page
**And** state parameter stored in session

---

#### Scenario: Exchange TD Ameritrade authorization code for tokens

**Given** TD Ameritrade redirects with code and state
**When** OAuth2Service.exchangeCodeForToken('tdameritrade', 'TD_CODE_456', state) is called
**Then** system sends token request to TD Ameritrade:
```javascript
POST https://api.tdameritrade.com/v1/oauth2/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&
code=TD_CODE_456&
redirect_uri=https://example.com/auth/broker/callback&
client_id=TDAMERITRADE_CLIENT_ID&
client_secret=TDAMERITRADE_CLIENT_SECRET
```
**And** receives tokens with 30-minute expiration:
```json
{
  "access_token": "td_access_def...",
  "refresh_token": "td_refresh_ghi...",
  "token_type": "Bearer",
  "expires_in": 1800,
  "scope": "PlaceTrades AccountAccess",
  "refresh_token_expires_in": 7776000
}
```
**And** stores encrypted tokens with expiresAt = now + 1800 seconds
**And** TDAmeritradeAdapter configured with access token

---

#### Scenario: Proactive token refresh for TD Ameritrade (30-minute expiration)

**Given** TD Ameritrade tokens expire in 10 minutes
**And** token refresh job runs every 15 minutes (more frequent than default)
**When** OAuth2Service.refreshAccessToken('tdameritrade', userId) is called
**Then** system refreshes tokens before expiration
**And** prevents mid-trade authentication failures
**And** TD Ameritrade adapter always has valid access token

---

### Requirement: E*TRADE OAuth2 Authentication

The system SHALL implement OAuth2 authentication for E*TRADE with `trading` and `account` scopes. E*TRADE tokens expire every 2 hours.

**Rationale**: E*TRADE uses OAuth 1.0a-style authorization flow but with OAuth2 token endpoint, requiring special handling in OAuth2Service.

#### Scenario: Connect E*TRADE account via OAuth2

**Given** user clicks "Connect E*TRADE"
**When** EtradeAdapter.authenticate() is called
**Then** OAuth2Service.generateAuthorizationURL('etrade', userId) generates URL:
```
https://us.etrade.com/e/t/etws/authorize?
  key=ETRADE_CLIENT_ID&
  token=REQUEST_TOKEN
```
**And** user redirected to E*TRADE authorization page (OAuth 1.0a style)

---

#### Scenario: Exchange E*TRADE authorization verifier for access token

**Given** E*TRADE redirects with oauth_token and oauth_verifier
**When** OAuth2Service.exchangeCodeForToken('etrade', verifier, state) is called
**Then** system sends access token request to E*TRADE:
```javascript
POST https://api.etrade.com/oauth/access_token

oauth_verifier=ETRADE_VERIFIER_789&
oauth_token=REQUEST_TOKEN&
oauth_consumer_key=ETRADE_CLIENT_ID&
oauth_signature_method=HMAC-SHA1&
oauth_signature=...
```
**And** receives E*TRADE access tokens (2-hour expiration):
```json
{
  "oauth_token": "etrade_access_jkl...",
  "oauth_token_secret": "etrade_secret_mno...",
  "oauth_expires_in": "7200"
}
```
**And** stores encrypted tokens with 2-hour expiration
**And** EtradeAdapter configured with OAuth1 credentials

---

#### Scenario: Handle E*TRADE token renewal (2-hour expiration)

**Given** E*TRADE tokens expire in 30 minutes
**When** OAuth2Service.refreshAccessToken('etrade', userId) is called
**Then** system sends E*TRADE-specific renew request:
```javascript
POST https://api.etrade.com/oauth/renew_access_token

oauth_token=etrade_access_jkl...
```
**And** receives renewed 2-hour tokens
**And** updates encrypted tokens in user.oauthTokens.get('etrade')

---

### Requirement: Broker-Specific OAuth2 Configuration

The system SHALL maintain broker-specific OAuth2 configurations including authorization URLs, token URLs, scopes, and token expiration periods. Configuration MUST be easily extendable for additional brokers.

**Rationale**: Centralized broker configuration allows adding new OAuth2 brokers without modifying core OAuth2Service logic.

#### Scenario: Retrieve IBKR OAuth2 configuration

**Given** OAuth2Service needs IBKR connection parameters
**When** OAuth2Service.getBrokerConfig('ibkr') is called
**Then** system returns IBKR configuration:
```javascript
{
  authorizationURL: 'https://api.ibkr.com/v1/oauth/authorize',
  tokenURL: 'https://api.ibkr.com/v1/oauth/token',
  clientId: process.env.IBKR_OAUTH_CLIENT_ID,
  clientSecret: process.env.IBKR_OAUTH_CLIENT_SECRET,
  redirectUri: 'https://example.com/auth/broker/callback',
  scopes: ['trading', 'account'],
  tokenExpiry: 86400000, // 24 hours in milliseconds
  supportsRefreshTokenRotation: false
}
```

---

#### Scenario: Add new broker OAuth2 configuration

**Given** developer wants to add Robinhood OAuth2 support
**When** developer adds configuration to OAUTH2_PROVIDERS:
```javascript
robinhood: {
  authorizationURL: 'https://api.robinhood.com/oauth2/authorize',
  tokenURL: 'https://api.robinhood.com/oauth2/token',
  clientId: process.env.ROBINHOOD_OAUTH_CLIENT_ID,
  clientSecret: process.env.ROBINHOOD_OAUTH_CLIENT_SECRET,
  redirectUri: process.env.BASE_URL + '/auth/broker/callback',
  scopes: ['trading', 'account', 'read'],
  tokenExpiry: 3600000, // 1 hour
  supportsRefreshTokenRotation: true
}
```
**Then** OAuth2Service automatically supports Robinhood
**And** no changes to core OAuth2Service methods required
**And** RobinhoodAdapter can use OAuth2Service.generateAuthorizationURL('robinhood', userId)

---

## MODIFIED Requirements

### Requirement: Broker Authentication Method Detection

BrokerFactory SHALL detect whether broker uses OAuth2 or API key authentication. If broker is in OAUTH2_PROVIDERS config, BrokerFactory MUST retrieve OAuth2 tokens from user.oauthTokens instead of credentials.apiKey.

**Previously**: BrokerFactory selected adapters based on broker key (e.g., 'alpaca', 'ibkr') without distinguishing authentication methods.

**Rationale**: Unified broker factory logic needs to support both OAuth2 and API key authentication methods seamlessly.

#### Scenario: Detect OAuth2 broker and retrieve tokens (Modified)

**Given** user has connected IBKR via OAuth2
**And** user.oauthTokens.get('ibkr') contains encrypted tokens
**When** BrokerFactory.createAdapter('ibkr', userId) is called
**Then** BrokerFactory checks if 'ibkr' exists in OAUTH2_PROVIDERS config
**And** determines authentication method = OAuth2
**And** retrieves encrypted tokens from user.oauthTokens.get('ibkr')
**And** passes decrypted tokens to IBKRAdapter constructor:
```javascript
const tokens = OAuth2Service.decryptTokens(user.oauthTokens.get('ibkr'));
const ibkrAdapter = new IBKRAdapter({
  accessToken: tokens.accessToken,
  userId: userId,
  isTestnet: false
});
```
**And** IBKRAdapter authenticates using OAuth2 access token

---

#### Scenario: Detect API key broker and use credentials (Modified)

**Given** user has configured Binance via API keys
**And** user.brokerConfigs.get('binance') contains:
```javascript
{
  apiKey: "encrypted_binance_api_key",
  apiSecret: "encrypted_binance_secret"
}
```
**When** BrokerFactory.createAdapter('binance', userId) is called
**Then** BrokerFactory checks if 'binance' exists in OAUTH2_PROVIDERS
**And** determines 'binance' NOT in OAuth2 providers
**And** authentication method = API Key
**And** retrieves credentials from user.brokerConfigs.get('binance')
**And** creates BinanceAdapter with API key/secret

---

## REMOVED Requirements

None.

---

## Cross-References

- **Related Spec**: `oauth2-service` - Core OAuth2Service used by all broker integrations
- **Related Spec**: `oauth2-ui-components` - UI components for broker OAuth2 connections
- **Related Spec**: `token-refresh-automation` - Background job handles broker token refresh
- **Dependency**: BrokerFactory must detect authentication method (OAuth2 vs API key)
- **Dependency**: User model oauthTokens field stores broker OAuth2 tokens
- **Environment Variables**:
  - IBKR_OAUTH_CLIENT_ID
  - IBKR_OAUTH_CLIENT_SECRET
  - TDAMERITRADE_OAUTH_CLIENT_ID
  - TDAMERITRADE_OAUTH_CLIENT_SECRET
  - ETRADE_OAUTH_CLIENT_ID
  - ETRADE_OAUTH_CLIENT_SECRET

---

## Technical Notes

### Broker OAuth2 Configuration Implementation

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

  tdameritrade: {
    authorizationURL: 'https://auth.tdameritrade.com/auth',
    tokenURL: 'https://api.tdameritrade.com/v1/oauth2/token',
    clientId: process.env.TDAMERITRADE_OAUTH_CLIENT_ID,
    clientSecret: process.env.TDAMERITRADE_OAUTH_CLIENT_SECRET,
    redirectUri: process.env.BASE_URL + '/auth/broker/callback',
    scopes: ['PlaceTrades', 'AccountAccess'],
    tokenExpiry: 30 * 60 * 1000, // 30 minutes
    supportsRefreshTokenRotation: true,
    refreshTokenExpiry: 90 * 24 * 60 * 60 * 1000 // 90 days
  },

  etrade: {
    authorizationURL: 'https://us.etrade.com/e/t/etws/authorize',
    tokenURL: 'https://api.etrade.com/oauth/access_token',
    renewURL: 'https://api.etrade.com/oauth/renew_access_token',
    clientId: process.env.ETRADE_OAUTH_CLIENT_ID,
    clientSecret: process.env.ETRADE_OAUTH_CLIENT_SECRET,
    redirectUri: process.env.BASE_URL + '/auth/broker/callback',
    scopes: ['trading', 'account'],
    tokenExpiry: 2 * 60 * 60 * 1000, // 2 hours
    supportsRefreshTokenRotation: false,
    useOAuth1: true // E*TRADE uses OAuth 1.0a style
  }
};

module.exports = OAUTH2_PROVIDERS;
```

### BrokerFactory OAuth2 Detection

```javascript
// src/brokers/BrokerFactory.js
const OAUTH2_PROVIDERS = require('../config/oauth2Providers');
const OAuth2Service = require('../services/OAuth2Service');

class BrokerFactory {
  static async createAdapter(brokerKey, userId, credentials = {}) {
    const user = await User.findById(userId);

    // Detect authentication method
    const isOAuth2Broker = !!OAUTH2_PROVIDERS[brokerKey];

    if (isOAuth2Broker) {
      // OAuth2 authentication flow
      const encryptedTokens = user.oauthTokens.get(brokerKey);
      if (!encryptedTokens) {
        throw new Error(`OAuth2 tokens not found for broker: ${brokerKey}`);
      }

      const tokens = OAuth2Service.decryptTokens(encryptedTokens);

      // Pass OAuth2 access token to adapter
      credentials = {
        accessToken: tokens.accessToken,
        userId: userId,
        isTestnet: credentials.isTestnet || false
      };
    } else {
      // API key authentication flow
      const brokerConfig = user.brokerConfigs.get(brokerKey);
      if (!brokerConfig) {
        throw new Error(`Broker configuration not found: ${brokerKey}`);
      }

      credentials = {
        apiKey: decrypt(brokerConfig.apiKey),
        apiSecret: decrypt(brokerConfig.apiSecret),
        ...credentials
      };
    }

    // Create adapter with appropriate credentials
    switch (brokerKey) {
      case 'ibkr':
        return new IBKRAdapter(credentials);
      case 'tdameritrade':
        return new TDAmeritradeAdapter(credentials);
      case 'etrade':
        return new EtradeAdapter(credentials);
      case 'alpaca':
        return new AlpacaAdapter(credentials);
      // ... other brokers
      default:
        throw new Error(`Unknown broker: ${brokerKey}`);
    }
  }
}
```

### Broker Adapter OAuth2 Integration

```javascript
// src/brokers/adapters/IBKRAdapter.js
class IBKRAdapter extends BaseBrokerAdapter {
  constructor(credentials) {
    super('ibkr');

    if (credentials.accessToken) {
      // OAuth2 authentication
      this.authMethod = 'oauth2';
      this.accessToken = credentials.accessToken;
      this.client = new IBKRClient({
        accessToken: this.accessToken,
        isTestnet: credentials.isTestnet
      });
    } else {
      // Fallback to API key (if supported)
      this.authMethod = 'apikey';
      this.apiKey = credentials.apiKey;
      // ... API key setup
    }
  }

  async authenticate() {
    if (this.authMethod === 'oauth2') {
      // OAuth2 token is already set in constructor
      // Verify token validity
      const isValid = await this.client.verifyToken();
      if (!isValid) {
        throw new Error('OAuth2 token invalid or expired');
      }
      return true;
    } else {
      // API key authentication
      return await this.client.authenticate(this.apiKey, this.apiSecret);
    }
  }
}
```

---

**Spec Status**: Complete
**Scenarios**: 12 scenarios defined (9 ADDED, 2 MODIFIED)
**Coverage**: IBKR OAuth2, TD Ameritrade OAuth2, E*TRADE OAuth2, broker configuration, authentication method detection
