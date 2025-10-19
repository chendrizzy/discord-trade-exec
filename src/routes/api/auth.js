/**
 * OAuth2 Authentication Routes
 *
 * Handles OAuth2 authorization and callback flows for broker integrations.
 */

const express = require('express');
const router = express.Router();
const oauth2Service = require('../../services/OAuth2Service');
const { isOAuth2Broker } = require('../../config/oauth2Providers');
const { ensureAuthenticated } = require('../../middleware/auth');
const User = require('../../models/User');

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
router.get('/broker/:broker/authorize', ensureAuthenticated, (req, res) => {
  try {
    const { broker } = req.params;

    // Validate broker supports OAuth2
    if (!isOAuth2Broker(broker)) {
      return res.status(400).json({
        success: false,
        error: `Broker '${broker}' does not support OAuth2 or is not enabled`
      });
    }

    // Generate authorization URL
    const authorizationURL = oauth2Service.generateAuthorizationURL(
      broker,
      req.user.id,
      req.session
    );

    console.log(`[AuthRoutes] Authorization URL generated | broker: ${broker} | userId: ${req.user.id}`);

    res.json({
      success: true,
      authorizationURL
    });
  } catch (error) {
    console.error('[AuthRoutes] Authorization URL generation failed:', error);
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
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;

    // Handle authorization denial or error
    if (error) {
      console.warn(`[AuthRoutes] OAuth2 authorization error: ${error} - ${error_description}`);

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
      console.error(`[AuthRoutes] State validation failed: ${validation.error}`);
      return res.redirect(`/dashboard?oauth_error=${encodeURIComponent('Authorization session invalid. Please try connecting again.')}`);
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

    user.tradingConfig.oauthTokens.set(broker, {
      ...encryptedTokens,
      isValid: true,
      lastRefreshError: null,
      lastRefreshAttempt: new Date()
    });

    await user.save();

    console.log(`[AuthRoutes] OAuth2 connection successful | broker: ${broker} | userId: ${userId}`);

    // Redirect to dashboard with success message
    res.redirect(`/dashboard?connection=success&broker=${broker}`);
  } catch (error) {
    console.error('[AuthRoutes] OAuth2 callback failed:', error);
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
router.post('/callback', async (req, res) => {
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
      console.error(`[AuthRoutes] State validation failed: ${validation.error}`);

      // Security event: possible CSRF attack
      if (validation.error.includes('CSRF')) {
        console.error(`[AuthRoutes] SECURITY: Possible CSRF attack detected | IP: ${req.ip}`);
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

    user.tradingConfig.oauthTokens.set(broker, {
      ...encryptedTokens,
      isValid: true,
      lastRefreshError: null,
      lastRefreshAttempt: new Date()
    });

    await user.save();

    console.log(`[AuthRoutes] OAuth2 connection successful (POST) | broker: ${broker} | userId: ${userId}`);

    res.json({
      success: true,
      broker,
      message: `${broker.toUpperCase()} connected successfully`
    });
  } catch (error) {
    console.error('[AuthRoutes] OAuth2 callback failed (POST):', error);
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
router.delete('/brokers/:broker/oauth', ensureAuthenticated, async (req, res) => {
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

    console.log(`[AuthRoutes] OAuth2 tokens revoked | broker: ${broker} | userId: ${userId}`);

    res.json({
      success: true,
      message: `${broker.toUpperCase()} OAuth2 connection removed successfully`
    });
  } catch (error) {
    console.error('[AuthRoutes] OAuth2 token revocation failed:', error);
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
router.post('/brokers/:broker/oauth/refresh', ensureAuthenticated, async (req, res) => {
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

    console.log(`[AuthRoutes] Manual OAuth2 token refresh successful | broker: ${broker} | userId: ${userId}`);

    res.json({
      success: true,
      message: `${broker.toUpperCase()} tokens refreshed successfully`,
      expiresAt: tokens.expiresAt
    });
  } catch (error) {
    console.error('[AuthRoutes] Manual OAuth2 token refresh failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
