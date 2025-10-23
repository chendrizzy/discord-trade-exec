/**
 * Session Refresh Middleware
 *
 * Automatically refreshes OAuth2 access tokens before they expire
 * to ensure seamless user experience and prevent authentication disruptions.
 *
 * Features:
 * - Proactive token refresh when <5 minutes remaining
 * - Automatic session update with new tokens
 * - Error handling with graceful degradation
 * - Audit logging for security compliance
 *
 * Usage:
 * app.use(sessionRefreshMiddleware);
 *
 * Dependencies: OAuth2Service, User model
 */

'use strict';

const OAuth2Service = require('../services/OAuth2Service');
const { logger } = require('./logger');

// Refresh threshold: 5 minutes before expiry (300,000ms)
const REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Session refresh middleware
 * Checks OAuth2 token expiration and refreshes if needed
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function sessionRefreshMiddleware(req, res, next) {
  // Skip if user not authenticated
  if (!req.user || !req.user._id) {
    return next();
  }

  // Skip if user has no broker connections
  if (!req.user.tradingConfig || !req.user.tradingConfig.oauthTokens) {
    return next();
  }

  const userId = req.user._id.toString();
  const oauthService = new OAuth2Service();
  const now = Date.now();

  try {
    // Iterate through all connected brokers
    const brokers = Array.from(req.user.tradingConfig.oauthTokens.keys());

    for (const broker of brokers) {
      const tokenData = req.user.tradingConfig.oauthTokens.get(broker);

      // Skip if no token data or already invalid
      if (!tokenData || !tokenData.expiresAt || tokenData.isValid === false) {
        continue;
      }

      // Check if token is expiring soon
      const expiresAt = new Date(tokenData.expiresAt).getTime();
      const timeUntilExpiry = expiresAt - now;

      // Refresh if less than 5 minutes remaining
      if (timeUntilExpiry > 0 && timeUntilExpiry < REFRESH_THRESHOLD_MS) {
        logger.info('[SessionRefresh] Token expiring soon, refreshing...', {
          userId,
          broker,
          expiresIn: Math.floor(timeUntilExpiry / 1000) + 's',
          expiresAt: new Date(expiresAt).toISOString()
        });

        try {
          // Refresh access token
          const newTokens = await oauthService.refreshAccessToken(broker, userId);

          logger.info('[SessionRefresh] Token refresh successful', {
            userId,
            broker,
            newExpiresAt: newTokens.expiresAt.toISOString()
          });

          // Update session with new token data (for immediate use)
          // Note: OAuth2Service.refreshAccessToken() already updates the database
          // This ensures req.user has fresh data for this request
          if (req.user.tradingConfig.oauthTokens.has(broker)) {
            const currentTokenData = req.user.tradingConfig.oauthTokens.get(broker);
            req.user.tradingConfig.oauthTokens.set(broker, {
              ...currentTokenData,
              accessToken: newTokens.accessToken,
              refreshToken: newTokens.refreshToken,
              expiresAt: newTokens.expiresAt,
              isValid: true,
              lastRefreshError: null,
              lastRefreshAttempt: new Date()
            });
          }
        } catch (refreshError) {
          // Log refresh failure but don't block request
          logger.error('[SessionRefresh] Token refresh failed', {
            userId,
            broker,
            error: refreshError.message,
            stack: refreshError.stack
          });

          // Mark token as potentially invalid
          if (req.user.tradingConfig.oauthTokens.has(broker)) {
            const tokenData = req.user.tradingConfig.oauthTokens.get(broker);
            req.user.tradingConfig.oauthTokens.set(broker, {
              ...tokenData,
              lastRefreshError: refreshError.message,
              lastRefreshAttempt: new Date()
            });
          }

          // Continue processing request - user may need to re-authenticate
          // but we don't want to block them from viewing dashboard/settings
        }
      }
    }

    // Continue to next middleware
    next();
  } catch (error) {
    // Log unexpected errors but don't block request
    logger.error('[SessionRefresh] Middleware error', {
      userId,
      error: error.message,
      stack: error.stack
    });

    next(); // Continue processing - this is non-critical middleware
  }
}

/**
 * Check if OAuth2 token is expiring soon
 *
 * @param {Date|string|number} expiresAt - Token expiration timestamp
 * @param {number} thresholdMs - Threshold in milliseconds (default: 5 minutes)
 * @returns {boolean} True if token is expiring within threshold
 */
function isTokenExpiringSoon(expiresAt, thresholdMs = REFRESH_THRESHOLD_MS) {
  if (!expiresAt) return false;

  const expiryTime = new Date(expiresAt).getTime();
  const now = Date.now();
  const timeUntilExpiry = expiryTime - now;

  return timeUntilExpiry > 0 && timeUntilExpiry < thresholdMs;
}

/**
 * Get time remaining until token expiry
 *
 * @param {Date|string|number} expiresAt - Token expiration timestamp
 * @returns {number} Milliseconds until expiry (0 if already expired, -1 if invalid)
 */
function getTimeUntilExpiry(expiresAt) {
  if (!expiresAt) return -1;

  const expiryTime = new Date(expiresAt).getTime();
  const now = Date.now();
  const timeUntilExpiry = expiryTime - now;

  return Math.max(0, timeUntilExpiry);
}

module.exports = sessionRefreshMiddleware;
module.exports.isTokenExpiringSoon = isTokenExpiringSoon;
module.exports.getTimeUntilExpiry = getTimeUntilExpiry;
module.exports.REFRESH_THRESHOLD_MS = REFRESH_THRESHOLD_MS;
