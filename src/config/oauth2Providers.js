/**
 * OAuth2 Provider Configurations
 *
 * Centralized OAuth2 configuration for all broker integrations.
 * Each provider defines authorization/token endpoints, scopes, and token lifecycle settings.
 */

// Validation helper
function validateProviderEnvVars(providerName, clientIdVar, clientSecretVar) {
  const clientId = process.env[clientIdVar];
  const clientSecret = process.env[clientSecretVar];

  if (!clientId || !clientSecret) {
    console.warn(
      `[OAuth2Config] Missing credentials for ${providerName}: ${clientIdVar}=${!!clientId}, ${clientSecretVar}=${!!clientSecret}`
    );
    return false;
  }

  return true;
}

// Base URL for OAuth2 callbacks
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const OAUTH2_CALLBACK_PATH = '/auth/broker/callback';

/**
 * OAuth2 Provider Registry
 *
 * Configuration structure:
 * - authorizationURL: Where users are redirected to authorize
 * - tokenURL: Endpoint to exchange authorization code for tokens
 * - renewURL: Token renewal endpoint (for OAuth 1.0a style like E*TRADE)
 * - clientId/clientSecret: OAuth2 app credentials
 * - redirectUri: Callback URL after authorization
 * - scopes: Requested OAuth2 scopes
 * - tokenExpiry: Token lifetime in milliseconds
 * - supportsRefreshTokenRotation: Whether broker rotates refresh tokens
 * - useOAuth1: Flag for OAuth 1.0a providers (E*TRADE)
 */
const OAUTH2_PROVIDERS = {
  // Alpaca Markets - Stock Trading
  alpaca: {
    authorizationURL: 'https://app.alpaca.markets/oauth/authorize',
    tokenURL: 'https://api.alpaca.markets/oauth/token',
    clientId: process.env.ALPACA_OAUTH_CLIENT_ID,
    clientSecret: process.env.ALPACA_OAUTH_CLIENT_SECRET,
    redirectUri: `${BASE_URL}${OAUTH2_CALLBACK_PATH}`,
    scopes: ['account:write', 'trading'],
    tokenExpiry: 7 * 24 * 60 * 60 * 1000, // 7 days
    supportsRefreshTokenRotation: true,
    enabled: validateProviderEnvVars('Alpaca', 'ALPACA_OAUTH_CLIENT_ID', 'ALPACA_OAUTH_CLIENT_SECRET')
  },

  // Interactive Brokers - Stock Trading
  ibkr: {
    authorizationURL: 'https://api.ibkr.com/v1/oauth/authorize',
    tokenURL: 'https://api.ibkr.com/v1/oauth/token',
    clientId: process.env.IBKR_OAUTH_CLIENT_ID,
    clientSecret: process.env.IBKR_OAUTH_CLIENT_SECRET,
    redirectUri: `${BASE_URL}${OAUTH2_CALLBACK_PATH}`,
    scopes: ['trading', 'account'],
    tokenExpiry: 24 * 60 * 60 * 1000, // 24 hours
    supportsRefreshTokenRotation: false,
    enabled: validateProviderEnvVars('IBKR', 'IBKR_OAUTH_CLIENT_ID', 'IBKR_OAUTH_CLIENT_SECRET')
  },

  // TD Ameritrade - Stock Trading
  tdameritrade: {
    authorizationURL: 'https://auth.tdameritrade.com/auth',
    tokenURL: 'https://api.tdameritrade.com/v1/oauth2/token',
    clientId: process.env.TDAMERITRADE_OAUTH_CLIENT_ID,
    clientSecret: process.env.TDAMERITRADE_OAUTH_CLIENT_SECRET,
    redirectUri: `${BASE_URL}${OAUTH2_CALLBACK_PATH}`,
    scopes: ['PlaceTrades', 'AccountAccess'],
    tokenExpiry: 30 * 60 * 1000, // 30 minutes - IMPORTANT: Short-lived, requires frequent refresh
    supportsRefreshTokenRotation: true,
    enabled: validateProviderEnvVars('TD Ameritrade', 'TDAMERITRADE_OAUTH_CLIENT_ID', 'TDAMERITRADE_OAUTH_CLIENT_SECRET')
  },

  // E*TRADE - Stock Trading (OAuth 1.0a)
  etrade: {
    authorizationURL: 'https://us.etrade.com/e/t/etws/authorize',
    tokenURL: 'https://api.etrade.com/oauth/access_token',
    renewURL: 'https://api.etrade.com/oauth/renew_access_token', // E*TRADE uses renewal instead of refresh
    clientId: process.env.ETRADE_OAUTH_CLIENT_ID,
    clientSecret: process.env.ETRADE_OAUTH_CLIENT_SECRET,
    redirectUri: `${BASE_URL}${OAUTH2_CALLBACK_PATH}`,
    scopes: ['trading', 'account'],
    tokenExpiry: 2 * 60 * 60 * 1000, // 2 hours
    useOAuth1: true, // E*TRADE uses OAuth 1.0a
    supportsRefreshTokenRotation: false,
    enabled: validateProviderEnvVars('E*TRADE', 'ETRADE_OAUTH_CLIENT_ID', 'ETRADE_OAUTH_CLIENT_SECRET')
  },

  // Charles Schwab - Stock Trading
  schwab: {
    authorizationURL: 'https://api.schwabapi.com/v1/oauth/authorize',
    tokenURL: 'https://api.schwabapi.com/v1/oauth/token',
    clientId: process.env.SCHWAB_OAUTH_CLIENT_ID,
    clientSecret: process.env.SCHWAB_OAUTH_CLIENT_SECRET,
    redirectUri: `${BASE_URL}${OAUTH2_CALLBACK_PATH}`,
    scopes: ['account', 'trading'],
    tokenExpiry: 7 * 24 * 60 * 60 * 1000, // 7 days (estimated)
    supportsRefreshTokenRotation: true,
    enabled: validateProviderEnvVars('Schwab', 'SCHWAB_OAUTH_CLIENT_ID', 'SCHWAB_OAUTH_CLIENT_SECRET')
  }
};

/**
 * Get enabled OAuth2 providers
 * @returns {Array<string>} List of enabled broker keys
 */
function getEnabledProviders() {
  return Object.entries(OAUTH2_PROVIDERS)
    .filter(([, config]) => config.enabled)
    .map(([broker]) => broker);
}

/**
 * Check if a broker supports OAuth2
 * @param {string} broker - Broker key (e.g., 'alpaca', 'ibkr')
 * @returns {boolean}
 */
function isOAuth2Broker(broker) {
  return !!OAUTH2_PROVIDERS[broker] && OAUTH2_PROVIDERS[broker].enabled;
}

/**
 * Get OAuth2 provider configuration
 * @param {string} broker - Broker key
 * @returns {Object|null} Provider config or null if not found
 */
function getProviderConfig(broker) {
  const config = OAUTH2_PROVIDERS[broker];
  if (!config || !config.enabled) {
    return null;
  }
  return config;
}

/**
 * Get brokers requiring frequent token refresh (<1 hour expiry)
 * @returns {Array<string>} List of broker keys
 */
function getShortLivedTokenBrokers() {
  return Object.entries(OAUTH2_PROVIDERS)
    .filter(([, config]) => config.enabled && config.tokenExpiry < 60 * 60 * 1000) // <1 hour
    .map(([broker]) => broker);
}

module.exports = {
  OAUTH2_PROVIDERS,
  OAUTH2_CALLBACK_PATH,
  getEnabledProviders,
  isOAuth2Broker,
  getProviderConfig,
  getShortLivedTokenBrokers
};
