/**
 * OAuth2 Authentication Routes & MFA Endpoints
 *
 * Handles:
 * - OAuth2 authorization and callback flows for broker integrations
 * - Multi-Factor Authentication (MFA) setup and verification
 */

const express = require('express');
const router = express.Router();
const oauth2Service = require('../../services/OAuth2Service');
const { isOAuth2Broker, getEnabledProviders, getProviderConfig } = require('../../config/oauth2Providers');
const { ensureAuthenticated } = require('../../middleware/auth');
const { getMFAService } = require('../../services/MFAService');
const User = require('../../models/User');
const { BrokerFactory } = require('../../brokers');
const logger = require('../../utils/logger');
const { validate } = require('../../middleware/validation');
const {
  brokerAuthorizeParams,
  oauthCallbackQuery,
  oauthCallbackBody,
  deleteBrokerOAuthParams,
  refreshBrokerOAuthParams,
  mfaEnableBody,
  mfaDisableBody,
  mfaVerifyBody
} = require('../../validators/auth.validators');

// Initialize MFA service
const mfaService = getMFAService();

/**
 * GET /api/auth/broker/:broker/authorize
 *
 * Generate OAuth2 authorization URL for broker connection.
 * Redirects user to broker's authorization page.
 *
 * @requires Authentication
 * @param {string} broker - Broker key (alpaca, ibkr, tdameritrade, etrade)
 * @returns {Object} { authorizationURL }
 */
router.get('/broker/:broker/authorize', ensureAuthenticated, validate(brokerAuthorizeParams, 'params'), (req, res) => {
  try {
    const { broker} = req.params;

    // Validate broker supports OAuth2
    if (!isOAuth2Broker(broker)) {
      return res.status(400).json({
        success: false,
        error: `Broker '${broker}' does not support OAuth2 or is not enabled`
      });
    }

    // Generate authorization URL
    const authorizationURL = oauth2Service.generateAuthorizationURL(broker, req.user.id, req.session, {
      communityId: req.user.communityId ? req.user.communityId.toString() : null,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    logger.info('OAuth2 authorization URL generated', {
      broker,
      userId: req.user.id,
      communityId: req.user.communityId
    });

    res.json({
      success: true,
      authorizationURL
    });
  } catch (error) {
    logger.error('Authorization URL generation failed', {
      broker: req.params.broker,
      userId: req.user.id,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/auth/brokers/status
 *
 * Retrieve OAuth2 connection status for all enabled brokers.
 *
 * @requires Authentication
 * @returns {Object} { success, brokers: [...] }
 */
router.get('/brokers/status', ensureAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const enabledBrokers = getEnabledProviders();
    const now = Date.now();

    const brokers = enabledBrokers
      .map(brokerKey => {
        const config = getProviderConfig(brokerKey);
        if (!config) {
          return null;
        }

        const brokerInfo = BrokerFactory.getBrokerInfo(brokerKey) || {};

        let storedTokens;
        if (user.tradingConfig?.oauthTokens?.get) {
          storedTokens = user.tradingConfig.oauthTokens.get(brokerKey);
        } else if (user.tradingConfig?.oauthTokens) {
          storedTokens = user.tradingConfig.oauthTokens[brokerKey];
        }

        let expiresAt = storedTokens?.expiresAt ? new Date(storedTokens.expiresAt) : null;
        const connectedAt = storedTokens?.connectedAt ? new Date(storedTokens.connectedAt) : null;
        const lastRefreshAttempt = storedTokens?.lastRefreshAttempt ? new Date(storedTokens.lastRefreshAttempt) : null;

        let status = 'disconnected';
        if (storedTokens) {
          if (storedTokens.isValid === false) {
            status = 'revoked';
          } else if (expiresAt && expiresAt.getTime() <= now) {
            status = 'expired';
          } else if (expiresAt && expiresAt.getTime() - now <= 60 * 60 * 1000) {
            status = 'expiring';
          } else {
            status = 'connected';
          }
        }

        const expiresInSeconds = expiresAt ? Math.max(0, Math.floor((expiresAt.getTime() - now) / 1000)) : null;

        return {
          key: brokerKey,
          name: brokerInfo.name || brokerKey,
          type: brokerInfo.type || 'stock',
          authMethods: brokerInfo.authMethods || ['oauth'],
          websiteUrl: brokerInfo.websiteUrl,
          docsUrl: brokerInfo.docsUrl,
          features: brokerInfo.features || [],
          status,
          isValid: storedTokens?.isValid !== false,
          connectedAt: connectedAt ? connectedAt.toISOString() : null,
          expiresAt: expiresAt ? expiresAt.toISOString() : null,
          expiresInSeconds,
          tokenType: storedTokens?.tokenType || config?.tokenType || 'Bearer',
          scopes: storedTokens?.scopes || config?.scopes || [],
          lastRefreshAttempt: lastRefreshAttempt ? lastRefreshAttempt.toISOString() : null,
          lastRefreshError: storedTokens?.lastRefreshError || null,
          supportsManualRefresh: !!config?.tokenURL,
          supportsRefreshTokenRotation: !!config?.supportsRefreshTokenRotation,
          tokenExpiryMs: config?.tokenExpiry || null
        };
      })
      .filter(Boolean);

    res.json({
      success: true,
      brokers
    });
  } catch (error) {
    logger.error('Failed to fetch OAuth2 broker status', {
      userId: req.user.id,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /auth/broker/callback
 *
 * Handle OAuth2 callback from broker.
 * Exchanges authorization code for tokens and stores encrypted tokens in user profile.
 *
 * @param {string} code - Authorization code
 * @param {string} state - CSRF protection state parameter
 * @param {string} error - Error code if authorization failed
 * @param {string} error_description - Error description
 * @returns {Redirect} Redirects to dashboard with success/error message
 */
router.get('/callback', validate(oauthCallbackQuery, 'query'), async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;

    // Handle authorization denial or error
    if (error) {
      logger.warn('OAuth2 authorization error', {
        error,
        error_description,
        state,
        ip: req.ip
      });

      const errorMessages = {
        access_denied: 'Authorization cancelled. You can try connecting again anytime.',
        invalid_request: 'Invalid request. Please try connecting again.',
        server_error: 'Broker server error. Please try again later.'
      };

      const message = errorMessages[error] || `Connection failed: ${error_description || error}`;

      return res.redirect(`/dashboard?oauth_error=${encodeURIComponent(message)}`);
    }

    // Validate required parameters
    if (!code || !state) {
      return res.redirect('/dashboard?oauth_error=' + encodeURIComponent('Invalid callback: missing code or state'));
    }

    // Validate state and exchange code for tokens
    const validation = oauth2Service.validateState(state, req.session);

    if (!validation.valid) {
      logger.error('State validation failed', {
        error: validation.error,
        state,
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
      return res.redirect(
        `/dashboard?oauth_error=${encodeURIComponent('Authorization session invalid. Please try connecting again.')}`
      );
    }
    const { broker, userId } = validation;

    // Exchange code for tokens
    const tokens = await oauth2Service.exchangeCodeForToken(broker, code, state, req.session);

    // Encrypt tokens
    const encryptedTokens = oauth2Service.encryptTokens(tokens);

    // Store encrypted tokens in user profile
    const user = await User.findById(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    let existingTokens;
    if (user.tradingConfig?.oauthTokens?.get) {
      existingTokens = user.tradingConfig.oauthTokens.get(broker);
    } else if (user.tradingConfig?.oauthTokens) {
      existingTokens = user.tradingConfig.oauthTokens[broker];
    }

    user.tradingConfig.oauthTokens.set(broker, {
      ...encryptedTokens,
      connectedAt: existingTokens?.connectedAt || new Date(),
      isValid: true,
      lastRefreshError: null,
      lastRefreshAttempt: new Date()
    });

    await user.save();

    logger.info('OAuth2 connection successful', {
      broker,
      userId,
      communityId: user.communityId
    });

    // Redirect to dashboard with success message
    res.redirect(`/dashboard?connection=success&broker=${broker}`);
  } catch (error) {
    logger.error('OAuth2 callback failed', {
      error: error.message,
      stack: error.stack,
      state: req.query.state,
      ip: req.ip
    });
    res.redirect(`/dashboard?oauth_error=${encodeURIComponent(error.message)}`);
  }
});

/**
 * POST /api/auth/broker/callback
 *
 * Alternative POST endpoint for OAuth2 callback (used by some brokers like E*TRADE).
 * Same functionality as GET callback but returns JSON instead of redirect.
 *
 * @body {string} code - Authorization code
 * @body {string} state - CSRF protection state parameter
 * @returns {Object} { success, broker, message } or { success: false, error }
 */
router.post('/callback', validate(oauthCallbackBody, 'body'), async (req, res) => {
  try {
    const { code, state } = req.body;

    // Validate required parameters
    if (!code || !state) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: code and state'
      });
    }

    // Validate state and exchange code for tokens
    const validation = oauth2Service.validateState(state, req.session);

    if (!validation.valid) {
      logger.error('State validation failed (POST)', {
        error: validation.error,
        state,
        ip: req.ip,
        userAgent: req.get('user-agent')
      });

      // Security event: possible CSRF attack
      if (validation.error.includes('CSRF')) {
        logger.error('SECURITY: Possible CSRF attack detected', {
          ip: req.ip,
          userAgent: req.get('user-agent'),
          state
        });
      }

      return res.status(403).json({
        success: false,
        error: validation.error,
        securityEvent: validation.error.includes('CSRF')
      });
    }

    const { broker, userId } = validation;

    // Exchange code for tokens
    const tokens = await oauth2Service.exchangeCodeForToken(broker, code, state, req.session);

    // Encrypt tokens
    const encryptedTokens = oauth2Service.encryptTokens(tokens);

    // Store encrypted tokens in user profile
    const user = await User.findById(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    let existingTokens;
    if (user.tradingConfig?.oauthTokens?.get) {
      existingTokens = user.tradingConfig.oauthTokens.get(broker);
    } else if (user.tradingConfig?.oauthTokens) {
      existingTokens = user.tradingConfig.oauthTokens[broker];
    }

    user.tradingConfig.oauthTokens.set(broker, {
      ...encryptedTokens,
      connectedAt: existingTokens?.connectedAt || new Date(),
      isValid: true,
      lastRefreshError: null,
      lastRefreshAttempt: new Date()
    });

    await user.save();

    logger.info('OAuth2 connection successful (POST)', {
      broker,
      userId,
      communityId: user.communityId
    });

    res.json({
      success: true,
      broker,
      message: `${broker.toUpperCase()} connected successfully`
    });
  } catch (error) {
    logger.error('OAuth2 callback failed (POST)', {
      error: error.message,
      stack: error.stack,
      code: req.body.code ? 'present' : 'missing',
      state: req.body.state,
      ip: req.ip
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/brokers/:broker/oauth
 *
 * Revoke OAuth2 tokens and disconnect broker.
 *
 * @requires Authentication
 * @param {string} broker - Broker key
 * @returns {Object} { success, message }
 */
router.delete('/brokers/:broker/oauth', ensureAuthenticated, validate(deleteBrokerOAuthParams, 'params'), async (req, res) => {
  try {
    const { broker } = req.params;
    const userId = req.user.id;

    // Validate broker exists in user's OAuth2 tokens
    const user = await User.findById(userId);
    if (!user || !user.tradingConfig.oauthTokens.has(broker)) {
      return res.status(404).json({
        success: false,
        error: `No OAuth2 connection found for broker '${broker}'`
      });
    }

    // TODO: Optionally revoke tokens at broker (if broker supports token revocation endpoint)
    // This would require broker-specific revocation URL and logic

    // Remove tokens from user profile
    user.tradingConfig.oauthTokens.delete(broker);
    await user.save();

    logger.info('OAuth2 tokens revoked', {
      broker,
      userId
    });

    res.json({
      success: true,
      message: `${broker.toUpperCase()} OAuth2 connection removed successfully`
    });
  } catch (error) {
    logger.error('OAuth2 token revocation failed', {
      broker: req.params.broker,
      userId: req.user.id,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/brokers/:broker/oauth/refresh
 *
 * Manually trigger OAuth2 token refresh.
 * Normally handled automatically by cron job, but this endpoint allows manual refresh.
 *
 * @requires Authentication
 * @param {string} broker - Broker key
 * @returns {Object} { success, expiresAt }
 */
router.post('/brokers/:broker/oauth/refresh', ensureAuthenticated, validate(refreshBrokerOAuthParams, 'params'), async (req, res) => {
  try {
    const { broker } = req.params;
    const userId = req.user.id;

    // Validate broker supports OAuth2
    if (!isOAuth2Broker(broker)) {
      return res.status(400).json({
        success: false,
        error: `Broker '${broker}' does not support OAuth2`
      });
    }

    // Refresh tokens
    const tokens = await oauth2Service.refreshAccessToken(broker, userId);

    logger.info('Manual OAuth2 token refresh successful', {
      broker,
      userId,
      expiresAt: tokens.expiresAt
    });

    res.json({
      success: true,
      message: `${broker.toUpperCase()} tokens refreshed successfully`,
      expiresAt: tokens.expiresAt
    });
  } catch (error) {
    logger.error('Manual OAuth2 token refresh failed', {
      broker: req.params.broker,
      userId: req.user.id,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// MULTI-FACTOR AUTHENTICATION (MFA) ENDPOINTS
// ============================================================================

/**
 * POST /api/auth/mfa/setup
 *
 * Generate TOTP secret and QR code for MFA setup.
 * First step in enabling MFA - user must scan QR code with authenticator app.
 *
 * @requires Authentication
 * @returns {Object} { secret, qrCode, manualEntry, message }
 * @throws {400} MFA already enabled
 */
router.post('/mfa/setup', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user._id;

    const setup = await mfaService.generateSecret(userId);

    logger.info('MFA setup initiated', {
      userId,
      username: req.user.discordUsername
    });

    res.json({
      success: true,
      ...setup
    });
  } catch (error) {
    logger.error('MFA setup failed', {
      userId: req.user._id,
      username: req.user.discordUsername,
      error: error.message,
      stack: error.stack
    });

    if (error.message.includes('already enabled')) {
      return res.status(400).json({
        success: false,
        error: error.message,
        code: 'MFA_ALREADY_ENABLED'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to initiate MFA setup',
      message: error.message
    });
  }
});

/**
 * POST /api/auth/mfa/enable
 *
 * Enable MFA after user has scanned QR code and verified initial TOTP token.
 * Generates and returns 10 backup codes (shown only once).
 *
 * @requires Authentication
 * @body {string} token - 6-digit TOTP token from authenticator app
 * @returns {Object} { enabled, backupCodes, message }
 * @throws {400} Invalid token
 * @throws {400} MFA already enabled
 */
router.post('/mfa/enable', ensureAuthenticated, validate(mfaEnableBody, 'body'), async (req, res) => {
  try {
    const userId = req.user._id;
    const { token } = req.body;

    // Validate token provided
    if (!token || !/^\d{6}$/.test(token)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid token format. Must be 6 digits.',
        code: 'INVALID_TOKEN_FORMAT'
      });
    }

    const result = await mfaService.enableMFA(userId, token);

    logger.info('MFA enabled successfully', {
      userId,
      username: req.user.discordUsername,
      backupCodesGenerated: result.backupCodes?.length || 0
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('MFA enable failed', {
      userId: req.user._id,
      username: req.user.discordUsername,
      error: error.message,
      stack: error.stack
    });

    if (error.message.includes('Invalid TOTP token')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid verification code. Please try again.',
        code: 'INVALID_TOKEN'
      });
    }

    if (error.message.includes('already enabled')) {
      return res.status(400).json({
        success: false,
        error: error.message,
        code: 'MFA_ALREADY_ENABLED'
      });
    }

    if (error.message.includes('Rate limit exceeded')) {
      return res.status(429).json({
        success: false,
        error: error.message,
        code: 'RATE_LIMIT_EXCEEDED'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to enable MFA',
      message: error.message
    });
  }
});

/**
 * POST /api/auth/mfa/disable
 *
 * Disable MFA for the user.
 * Requires TOTP verification to prevent unauthorized MFA removal.
 *
 * @requires Authentication
 * @body {string} token - 6-digit TOTP token from authenticator app
 * @returns {Object} { disabled, message }
 * @throws {400} Invalid token
 * @throws {400} MFA not enabled
 */
router.post('/mfa/disable', ensureAuthenticated, validate(mfaDisableBody, 'body'), async (req, res) => {
  try {
    const userId = req.user._id;
    const { token } = req.body;

    // Validate token provided
    if (!token || !/^\d{6}$/.test(token)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid token format. Must be 6 digits.',
        code: 'INVALID_TOKEN_FORMAT'
      });
    }

    const result = await mfaService.disableMFA(userId, token);

    // Clear MFA session flag
    if (req.session) {
      req.session.mfaVerified = false;
    }

    logger.info('MFA disabled', {
      userId,
      username: req.user.discordUsername
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('MFA disable failed', {
      userId: req.user._id,
      username: req.user.discordUsername,
      error: error.message,
      stack: error.stack
    });

    if (error.message.includes('Invalid TOTP token')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid verification code. Cannot disable MFA without verification.',
        code: 'INVALID_TOKEN'
      });
    }

    if (error.message.includes('not enabled')) {
      return res.status(400).json({
        success: false,
        error: error.message,
        code: 'MFA_NOT_ENABLED'
      });
    }

    if (error.message.includes('Rate limit exceeded')) {
      return res.status(429).json({
        success: false,
        error: error.message,
        code: 'RATE_LIMIT_EXCEEDED'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to disable MFA',
      message: error.message
    });
  }
});

/**
 * POST /api/auth/mfa/backup-codes/regenerate
 *
 * Regenerate backup codes, invalidating all existing codes.
 * Requires TOTP verification to prevent unauthorized regeneration.
 *
 * @requires Authentication
 * @body {string} token - 6-digit TOTP token from authenticator app
 * @returns {Object} { backupCodes, message }
 * @throws {400} Invalid token
 * @throws {400} MFA not enabled
 */
router.post('/mfa/backup-codes/regenerate', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user._id;
    const { token } = req.body;

    // Validate token provided
    if (!token || !/^\d{6}$/.test(token)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid token format. Must be 6 digits.',
        code: 'INVALID_TOKEN_FORMAT'
      });
    }

    const result = await mfaService.regenerateBackupCodes(userId, token);

    logger.info('Backup codes regenerated', {
      userId,
      username: req.user.discordUsername,
      newCodesCount: result.backupCodes?.length || 0
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('Backup code regeneration failed', {
      userId: req.user._id,
      username: req.user.discordUsername,
      error: error.message,
      stack: error.stack
    });

    if (error.message.includes('Invalid TOTP token')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid verification code. Cannot regenerate backup codes without verification.',
        code: 'INVALID_TOKEN'
      });
    }

    if (error.message.includes('not enabled')) {
      return res.status(400).json({
        success: false,
        error: error.message,
        code: 'MFA_NOT_ENABLED'
      });
    }

    if (error.message.includes('Rate limit exceeded')) {
      return res.status(429).json({
        success: false,
        error: error.message,
        code: 'RATE_LIMIT_EXCEEDED'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to regenerate backup codes',
      message: error.message
    });
  }
});

/**
 * GET /api/auth/mfa/status
 *
 * Get current MFA status for the authenticated user.
 *
 * @requires Authentication
 * @returns {Object} { enabled, verifiedAt, lastVerified, backupCodesRemaining, warning }
 */
router.get('/mfa/status', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user._id;

    const status = await mfaService.getMFAStatus(userId);

    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    logger.error('MFA status check failed', {
      userId: req.user._id,
      username: req.user.discordUsername,
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get MFA status',
      message: error.message
    });
  }
});

/**
 * POST /api/auth/mfa/verify
 *
 * Verify MFA during login (two-step authentication).
 * Accepts either TOTP token or backup code.
 *
 * This endpoint is called AFTER successful Discord OAuth authentication
 * when user has MFA enabled. Sets session.mfaVerified = true on success.
 *
 * @requires Authentication (Discord OAuth completed, MFA pending)
 * @body {string} token - 6-digit TOTP token OR 8-character backup code (format: XXXX-XXXX)
 * @body {string} type - 'totp' or 'backup' (optional, auto-detected)
 * @returns {Object} { verified, message }
 * @throws {400} Invalid token
 * @throws {401} Not authenticated
 * @throws {403} MFA not required
 * @throws {429} Rate limit exceeded
 */
router.post('/mfa/verify', ensureAuthenticated, validate(mfaVerifyBody, 'body'), async (req, res) => {
  try {
    const userId = req.user._id;
    const { token, type } = req.body;

    // Validate token provided
    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Verification code required',
        code: 'TOKEN_REQUIRED'
      });
    }

    // Check if MFA is enabled for this user
    if (!req.user.mfa || !req.user.mfa.enabled) {
      return res.status(403).json({
        success: false,
        error: 'MFA is not enabled for this account',
        code: 'MFA_NOT_ENABLED'
      });
    }

    // Auto-detect token type if not specified
    const tokenType = type || (token.length === 6 && /^\d{6}$/.test(token) ? 'totp' : 'backup');

    let isValid = false;

    if (tokenType === 'totp') {
      // Verify TOTP token
      isValid = await mfaService.verifyTOTP(userId, token);
    } else if (tokenType === 'backup') {
      // Verify backup code
      isValid = await mfaService.verifyBackupCode(userId, token);
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid token type. Must be "totp" or "backup"',
        code: 'INVALID_TYPE'
      });
    }

    if (!isValid) {
      logger.warn('MFA verification failed', {
        userId,
        username: req.user.discordUsername,
        tokenType,
        ip: req.ip
      });

      return res.status(400).json({
        success: false,
        error: 'Invalid verification code',
        code: 'INVALID_TOKEN'
      });
    }

    // Mark MFA as verified in session
    req.session.mfaVerified = true;

    logger.info('MFA verification successful', {
      userId,
      username: req.user.discordUsername,
      tokenType,
      ip: req.ip
    });

    res.json({
      success: true,
      verified: true,
      message: 'MFA verification successful',
      type: tokenType
    });
  } catch (error) {
    logger.error('MFA verification failed', {
      userId: req.user._id,
      username: req.user.discordUsername,
      error: error.message,
      stack: error.stack
    });

    if (error.message.includes('Rate limit exceeded')) {
      return res.status(429).json({
        success: false,
        error: error.message,
        code: 'RATE_LIMIT_EXCEEDED'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to verify MFA',
      message: error.message
    });
  }
});

module.exports = router;
