// External dependencies
const express = require('express');

const router = express.Router();
const { passport, ensureAuthenticated } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const { sendUnauthorized, sendError } = require('../utils/api-response');
const logger = require('../utils/logger');

// Initiate Discord OAuth2 login
router.get('/discord', authLimiter, passport.authenticate('discord'));

// Discord OAuth2 callback with detailed error logging
router.get('/discord/callback', authLimiter, (req, res, next) => {
  passport.authenticate('discord', (err, user, info) => {
    // Log detailed error information for debugging
    if (err) {
      const errorDetails = {
        errorType: err.constructor.name,
        error: err.message,
        stack: err.stack
      };

      if (err.oauthError) {
        errorDetails.oauthError = err.oauthError;
      }

      if (err.data) {
        try {
          errorDetails.discordApiResponse = JSON.parse(err.data);
        } catch (e) {
          errorDetails.discordApiResponseRaw = err.data;
        }
      }

      logger.error('[Auth] Discord OAuth error', errorDetails);
      return res.redirect('/login-failed?error=oauth_error');
    }

    if (!user) {
      logger.warn('[Auth] Discord OAuth no user returned', { info });
      return res.redirect('/login-failed?error=no_user');
    }

    req.logIn(user, loginErr => {
      if (loginErr) {
        logger.error('[Auth] Session login error', {
          error: loginErr.message,
          stack: loginErr.stack,
          discordId: user.discordId
        });
        return res.redirect('/login-failed?error=session_error');
      }

      logger.info('[Auth] Discord OAuth successful', {
        discordId: user.discordId,
        userId: user._id
      });
      return res.redirect('/dashboard');
    });
  })(req, res, next);
});

// Login failed page
router.get('/login-failed', (req, res) => {
  return sendUnauthorized(res, 'Failed to authenticate with Discord. Please try again.');
});

// Logout
router.get('/logout', (req, res) => {
  req.logout(err => {
    if (err) {
      return sendError(res, 'Logout failed');
    }
    res.redirect('/');
  });
});

// Check authentication status (for React app)
router.get('/status', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({
      authenticated: true,
      user: {
        id: req.user._id,
        discordId: req.user.discordId,
        username: req.user.username || req.user.discordUsername,
        discriminator: req.user.discriminator,
        tag: req.user.discordTag,
        avatar: req.user.avatar,
        email: req.user.email
      }
    });
  } else {
    res.json({
      authenticated: false,
      user: null
    });
  }
});

// Get current user info
router.get('/me', ensureAuthenticated, (req, res) => {
  res.json({
    user: {
      discordId: req.user.discordId,
      username: req.user.discordUsername,
      tag: req.user.discordTag,
      avatar: req.user.avatar,
      email: req.user.email,
      subscription: {
        tier: req.user.subscription.tier,
        status: req.user.subscription.status,
        isActive: req.user.isSubscriptionActive()
      },
      stats: {
        totalTrades: req.user.stats.totalTradesExecuted,
        winRate:
          req.user.stats.totalTradesExecuted > 0
            ? ((req.user.stats.successfulTrades / req.user.stats.totalTradesExecuted) * 100).toFixed(1)
            : '0.0',
        totalProfit: req.user.stats.totalProfit - req.user.stats.totalLoss
      }
    }
  });
});

module.exports = router;
