// External dependencies
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;

// Models and types
const User = require('../models/User');

// Analytics
const analyticsEventService = require('../services/analytics/AnalyticsEventService');

// Configure passport Discord strategy
const discordStrategy = new DiscordStrategy(
  {
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.DISCORD_CALLBACK_URL || 'http://localhost:3000/auth/discord/callback',
    scope: ['identify', 'email']
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      // Find or create user
      let user = await User.findByDiscordId(profile.id);

      if (!user) {
        // Create new user if doesn't exist
        user = new User({
          discordId: profile.id,
          discordUsername: profile.username,
          discordTag: `${profile.username}#${profile.discriminator}`,
          email: profile.email,
          avatar: profile.avatar,
          subscription: {
            status: 'trial',
            tier: 'free',
            trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          }
        });
        await user.save();

        // Track signup event
        await analyticsEventService.trackSignup(user._id, {
          method: 'discord',
          email: profile.email,
          initialTier: 'free',
          trialDays: 7
        });
      } else {
        // Update user info
        user.discordUsername = profile.username;
        user.discordTag = `${profile.username}#${profile.discriminator}`;
        user.email = profile.email;
        user.avatar = profile.avatar;
        await user.save();

        // Track login event
        await analyticsEventService.trackLogin(user._id, {
          method: 'discord'
        });
      }

      // MFA Check: If user has MFA enabled, authentication is not complete yet
      // The session will be marked as 'mfaPending' by the Discord callback route
      // User must verify MFA before gaining full access
      // Note: MFA status is checked in the callback route handler, not here

      return done(null, user);
    } catch (error) {
      return done(error, null);
    }
  }
);

// Override parseErrorResponse to log raw Discord API response
const originalParseError = discordStrategy.parseErrorResponse;
discordStrategy.parseErrorResponse = function (body, status) {
  console.error('🔍 Raw Discord API Response:');
  console.error('Status Code:', status);
  console.error('Response Body (raw):', body);
  try {
    const parsed = JSON.parse(body);
    console.error('Response Body (parsed):', JSON.stringify(parsed, null, 2));
  } catch (e) {
    console.error('Failed to parse response as JSON');
  }

  // Call original implementation
  return originalParseError.call(this, body, status);
};

passport.use(discordStrategy);

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user.discordId);
});

// Deserialize user from session
passport.deserializeUser(async (discordId, done) => {
  try {
    const user = await User.findByDiscordId(discordId);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Middleware to ensure user is authenticated
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/auth/discord');
}

// Middleware to ensure user has active subscription
function ensureSubscription(req, res, next) {
  if (req.user && req.user.isSubscriptionActive()) {
    return next();
  }
  res.status(403).json({ error: 'Active subscription required' });
}

/**
 * Middleware to ensure MFA verification is complete
 *
 * Two-step authentication flow for users with MFA enabled:
 * 1. User authenticates with Discord (req.isAuthenticated() = true)
 * 2. If MFA enabled, session flag 'mfaPending' is set
 * 3. User must verify MFA (TOTP or backup code)
 * 4. After successful verification, 'mfaVerified' is set to true
 *
 * This middleware checks:
 * - User has active session (req.isAuthenticated())
 * - If MFA enabled, user has completed MFA verification in this session
 *
 * Usage:
 *   // Protect routes that require full authentication including MFA
 *   app.get('/api/sensitive', ensureAuthenticated, ensureMFAVerified, handler);
 *
 * MFA-exempt routes (setup, status endpoints) should NOT use this middleware.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
function ensureMFAVerified(req, res, next) {
  // Must be authenticated first
  if (!req.isAuthenticated()) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'NOT_AUTHENTICATED'
    });
  }

  // Check if user has MFA enabled
  if (!req.user.mfa || !req.user.mfa.enabled) {
    // MFA not enabled - allow access
    return next();
  }

  // MFA is enabled - check if verified in current session
  if (req.session.mfaVerified === true) {
    // MFA verified - allow access
    return next();
  }

  // MFA required but not verified yet
  return res.status(403).json({
    error: 'MFA verification required',
    code: 'MFA_REQUIRED',
    message: 'Please verify your multi-factor authentication to continue',
    requiresMFA: true
  });
}

/**
 * Middleware to check if MFA verification is pending
 *
 * Returns true if user is authenticated but MFA verification is pending.
 * Useful for conditional rendering in routes.
 *
 * This is NOT a blocking middleware - it just adds a flag to the request.
 *
 * Usage:
 *   app.get('/dashboard', ensureAuthenticated, checkMFAPending, (req, res) => {
 *     if (req.mfaPending) {
 *       // Redirect to MFA verification page
 *     }
 *   });
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
function checkMFAPending(req, res, next) {
  req.mfaPending = false;

  if (req.isAuthenticated() && req.user.mfa?.enabled) {
    // MFA is enabled but not verified in session
    if (req.session.mfaVerified !== true) {
      req.mfaPending = true;
    }
  }

  next();
}

module.exports = {
  passport,
  ensureAuthenticated,
  ensureSubscription,
  ensureMFAVerified,
  checkMFAPending
};
