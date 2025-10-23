/**
 * Broker OAuth Routes
 * Handles OAuth 2.0 flows for brokers (Alpaca, Schwab, etc.)
 *
 * Flow:
 * 1. User clicks "Connect" in UI
 * 2. UI opens popup to /api/brokers/oauth/initiate/:brokerKey
 * 3. Route redirects to broker's OAuth authorization page
 * 4. User logs in and authorizes
 * 5. Broker redirects to /api/brokers/oauth/callback/:brokerKey
 * 6. Route exchanges code for tokens and saves to user account
 * 7. Route closes popup and notifies parent window
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const User = require('../../models/User');
const encryptionService = require('../../services/encryption');
const { sendSuccess, sendError, sendValidationError } = require('../../utils/api-response');
const { oauthCallbackLimiter } = require('../../middleware/rateLimiter');

// Import broker adapters
const AlpacaAdapter = require('../../brokers/adapters/AlpacaAdapter');
const SchwabAdapter = require('../../brokers/adapters/SchwabAdapter');
const logger = require('../../utils/logger');

// Store OAuth state temporarily (in production, use Redis)
const oauthStates = new Map();

/**
 * GET /api/brokers/oauth/initiate/:brokerKey
 * Initiates OAuth flow by redirecting to broker's authorization page
 */
router.get('/initiate/:brokerKey', async (req, res) => {
  try {
    const { brokerKey } = req.params;
    const { environment = 'testnet' } = req.query;

    // Check user is authenticated
    if (!req.user) {
      return sendError(res, 'Authentication required', 401);
    }

    // Check user has communityId
    if (!req.user.communityId) {
      return sendValidationError(res, 'User must be associated with a community to configure brokers');
    }

    // Generate state parameter for CSRF protection (512-bit for enhanced security)
    const state = crypto.randomBytes(64).toString('hex');

    // Store state with user info (expires in 10 minutes)
    oauthStates.set(state, {
      userId: req.user._id.toString(),
      communityId: req.user.communityId.toString(),
      brokerKey,
      environment,
      createdAt: Date.now()
    });

    // Clean up expired states
    setTimeout(() => oauthStates.delete(state), 10 * 60 * 1000);

    // Build redirect URI (same for all brokers)
    const redirectUri = `${req.protocol}://${req.get('host')}/api/brokers/oauth/callback/${brokerKey}`;

    let authUrl;

    switch (brokerKey) {
      case 'alpaca': {
        // Alpaca OAuth
        const clientId = process.env.ALPACA_CLIENT_ID || process.env.ALPACA_API_KEY;
        if (!clientId) {
          return sendError(res, 'Alpaca OAuth not configured (missing ALPACA_CLIENT_ID)', 500);
        }

        authUrl = AlpacaAdapter.getOAuthURL(
          clientId,
          redirectUri,
          state,
          'account:write trading' // Request trading permissions
        );
        break;
      }

      case 'schwab': {
        // Schwab OAuth
        const clientId = process.env.SCHWAB_CLIENT_ID || process.env.SCHWAB_APP_KEY;
        if (!clientId) {
          return sendError(res, 'Schwab OAuth not configured (missing SCHWAB_CLIENT_ID)', 500);
        }

        authUrl = SchwabAdapter.getOAuthURL(
          clientId,
          redirectUri,
          state
        );
        break;
      }

      default:
        return sendError(res, `OAuth not supported for broker: ${brokerKey}`, 400);
    }

    // Redirect to broker's OAuth page
    res.redirect(authUrl);
  } catch (error) {
    logger.error('[OAuth Initiate] Error:', { error: error.message, stack: error.stack });
    return sendError(res, `Failed to initiate OAuth: ${error.message}`, 500);
  }
});

/**
 * GET /api/brokers/oauth/callback/:brokerKey
 * Handles OAuth callback from broker
 * Rate limited to 10 requests per 15 minutes per IP
 */
router.get('/callback/:brokerKey', oauthCallbackLimiter, async (req, res) => {
  try {
    const { brokerKey } = req.params;
    const { code, state, error, error_description } = req.query;

    // Check for OAuth errors
    if (error) {
      console.error('[OAuth Callback] Error from broker:', error, error_description);
      return res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>OAuth Error</title>
            <style>
              body { font-family: system-ui; padding: 40px; text-align: center; }
              .error { color: #dc2626; margin: 20px 0; }
              button { padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; }
            </style>
          </head>
          <body>
            <h1>OAuth Authorization Failed</h1>
            <p class="error">${error_description || error}</p>
            <button onclick="window.close()">Close Window</button>
            <script>
              // Notify parent window of error
              if (window.opener) {
                window.opener.postMessage({
                  type: 'oauth-error',
                  broker: '${brokerKey}',
                  error: '${error}',
                  errorDescription: '${error_description || ''}'
                }, '*');
              }
            </script>
          </body>
        </html>
      `);
    }

    // Verify state parameter
    if (!state || !oauthStates.has(state)) {
      return res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>OAuth Error</title>
            <style>
              body { font-family: system-ui; padding: 40px; text-align: center; }
              .error { color: #dc2626; margin: 20px 0; }
            </style>
          </head>
          <body>
            <h1>Invalid OAuth State</h1>
            <p class="error">This OAuth session has expired or is invalid. Please try again.</p>
            <button onclick="window.close()">Close Window</button>
          </body>
        </html>
      `);
    }

    const stateData = oauthStates.get(state);
    oauthStates.delete(state); // Clean up

    // Verify broker matches
    if (stateData.brokerKey !== brokerKey) {
      return res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>OAuth Error</title></head>
          <body>
            <h1>Broker Mismatch</h1>
            <p>OAuth state does not match broker key</p>
          </body>
        </html>
      `);
    }

    // Exchange authorization code for tokens
    const redirectUri = `${req.protocol}://${req.get('host')}/api/brokers/oauth/callback/${brokerKey}`;
    let tokens;

    switch (brokerKey) {
      case 'alpaca': {
        const clientId = process.env.ALPACA_CLIENT_ID || process.env.ALPACA_API_KEY;
        const clientSecret = process.env.ALPACA_CLIENT_SECRET || process.env.ALPACA_SECRET;

        if (!clientId || !clientSecret) {
          throw new Error('Alpaca OAuth credentials not configured');
        }

        tokens = await AlpacaAdapter.exchangeCodeForToken(
          code,
          clientId,
          clientSecret,
          redirectUri
        );
        break;
      }

      case 'schwab': {
        const clientId = process.env.SCHWAB_CLIENT_ID || process.env.SCHWAB_APP_KEY;
        const clientSecret = process.env.SCHWAB_CLIENT_SECRET || process.env.SCHWAB_APP_SECRET;

        if (!clientId || !clientSecret) {
          throw new Error('Schwab OAuth credentials not configured');
        }

        tokens = await SchwabAdapter.exchangeCodeForToken(
          code,
          clientId,
          clientSecret,
          redirectUri
        );
        break;
      }

      default:
        throw new Error(`OAuth not supported for broker: ${brokerKey}`);
    }

    // Load user
    const user = await User.findById(stateData.userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Encrypt credentials
    const credentials = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenType: tokens.tokenType,
      expiresIn: tokens.expiresIn,
      scope: tokens.scope
    };

    const encryptedCredentials = await encryptionService.encryptCredential(
      stateData.communityId,
      credentials
    );

    // Save to user's broker configurations
    if (!user.brokerConfigs) {
      user.brokerConfigs = new Map();
    }

    user.brokerConfigs.set(brokerKey, {
      brokerKey,
      brokerType: brokerKey === 'alpaca' ? 'stock' : 'stock',
      authMethod: 'oauth',
      credentials: encryptedCredentials,
      environment: stateData.environment || 'testnet',
      configuredAt: new Date(),
      lastVerified: new Date()
    });

    await user.save();

    // Return success page that closes popup and notifies parent
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>OAuth Successful</title>
          <style>
            body {
              font-family: system-ui;
              padding: 40px;
              text-align: center;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
            }
            .success {
              background: white;
              color: #059669;
              padding: 40px;
              border-radius: 12px;
              box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
              max-width: 500px;
              margin: 0 auto;
            }
            .checkmark { font-size: 64px; margin-bottom: 20px; }
            h1 { color: #059669; margin: 0 0 10px 0; }
            p { color: #6b7280; margin: 10px 0; }
            .loader {
              margin: 20px auto;
              border: 4px solid #f3f4f6;
              border-top: 4px solid #059669;
              border-radius: 50%;
              width: 40px;
              height: 40px;
              animation: spin 1s linear infinite;
            }
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          </style>
        </head>
        <body>
          <div class="success">
            <div class="checkmark">✅</div>
            <h1>Connected Successfully!</h1>
            <p>Your ${brokerKey === 'alpaca' ? 'Alpaca' : 'Schwab'} account has been connected.</p>
            <div class="loader"></div>
            <p style="font-size: 14px; margin-top: 20px;">Closing window...</p>
          </div>
          <script>
            // Notify parent window of success
            if (window.opener) {
              window.opener.postMessage({
                type: 'oauth-success',
                broker: '${brokerKey}',
                success: true
              }, '*');

              // Close window after a brief moment
              setTimeout(() => {
                window.close();
              }, 2000);
            } else {
              // Fallback if no opener
              setTimeout(() => {
                window.location.href = '/dashboard';
              }, 2000);
            }
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    logger.error('[OAuth Callback] Error:', { error: error.message, stack: error.stack });
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>OAuth Error</title>
          <style>
            body { font-family: system-ui; padding: 40px; text-align: center; }
            .error { background: #fee; padding: 20px; border-radius: 8px; color: #c00; }
            button { margin-top: 20px; padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; }
          </style>
        </head>
        <body>
          <div class="error">
            <h1>OAuth Failed</h1>
            <p>${error.message}</p>
          </div>
          <button onclick="window.close()">Close Window</button>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'oauth-error',
                broker: '${req.params.brokerKey}',
                error: '${error.message}'
              }, '*');
            }
          </script>
        </body>
      </html>
    `);
  }
});

/**
 * POST /api/brokers/oauth/disconnect/:brokerKey
 * Disconnects OAuth broker (clears tokens)
 */
router.post('/disconnect/:brokerKey', async (req, res) => {
  try {
    if (!req.user) {
      return sendError(res, 'Authentication required', 401);
    }

    const { brokerKey } = req.params;

    // Remove broker config
    if (req.user.brokerConfigs && req.user.brokerConfigs.has(brokerKey)) {
      req.user.brokerConfigs.delete(brokerKey);
      await req.user.save();
    }

    return sendSuccess(res, { message: `${brokerKey} disconnected successfully` });
  } catch (error) {
    logger.error('[OAuth Disconnect] Error:', { error: error.message, stack: error.stack });
    return sendError(res, `Failed to disconnect: ${error.message}`, 500);
  }
});

module.exports = router;
