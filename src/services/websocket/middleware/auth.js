const mongoose = require('mongoose');
const logger = require('../../../utils/logger');

/**
 * WebSocket Authentication Middleware
 *
 * Validates WebSocket connections using session-based authentication
 * Checks sessionID against MongoDB sessions collection
 * Attaches user data to socket for downstream handlers
 *
 * Authentication Flow:
 * 1. Client connects with auth: { sessionID, userId }
 * 2. Middleware queries MongoDB sessions collection
 * 3. Validates session exists and is not expired
 * 4. Extracts user data from session
 * 5. Attaches userId to socket.handshake.auth
 * 6. Allows/denies connection
 *
 * Usage:
 *   const authMiddleware = createAuthMiddleware();
 *   io.use(authMiddleware);
 */

/**
 * Create authentication middleware for WebSocket
 * @param {Object} options - Configuration options
 * @param {boolean} options.required - Require authentication (default: true)
 * @param {string} options.sessionCollectionName - MongoDB collection name for sessions (default: 'sessions')
 * @returns {Function} Middleware function
 */
function createAuthMiddleware(options = {}) {
  const {
    required = true,
    sessionCollectionName = 'sessions' // MongoStore default collection name
  } = options;

  return async (socket, next) => {
    try {
      const { sessionID, userId } = socket.handshake.auth || {};

      // If authentication not required, allow anonymous connections
      if (!required && !sessionID) {
        logger.debug('Anonymous WebSocket connection allowed');
        socket.handshake.auth.anonymous = true;
        return next();
      }

      // Check if sessionID provided
      if (!sessionID) {
        const error = new Error('Authentication required: No session ID provided');
        error.data = { code: 'NO_SESSION_ID' };
        logger.warn('WebSocket connection rejected: No session ID');
        return next(error);
      }

      // Get sessions collection from MongoDB
      const db = mongoose.connection.db;
      if (!db) {
        const error = new Error('Database connection not available');
        error.data = { code: 'DATABASE_ERROR' };
        logger.error('WebSocket auth failed: Database not connected');
        return next(error);
      }

      const sessionsCollection = db.collection(sessionCollectionName);

      // Query session from MongoDB
      // MongoStore stores sessions with _id = sessionID
      const session = await sessionsCollection.findOne({ _id: sessionID });

      if (!session) {
        const error = new Error('Invalid or expired session');
        error.data = { code: 'INVALID_SESSION' };
        logger.warn(`WebSocket connection rejected: Session not found (${sessionID})`);
        return next(error);
      }

      // Check if session expired
      if (session.expires && new Date(session.expires) < new Date()) {
        const error = new Error('Session expired');
        error.data = { code: 'SESSION_EXPIRED' };
        logger.warn(`WebSocket connection rejected: Session expired (${sessionID})`);
        return next(error);
      }

      // Extract session data
      // MongoStore stores serialized session in 'session' field
      let sessionData;
      try {
        sessionData = typeof session.session === 'string'
          ? JSON.parse(session.session)
          : session.session;
      } catch (error) {
        const err = new Error('Failed to parse session data');
        err.data = { code: 'PARSE_ERROR' };
        logger.error('WebSocket auth failed: Session parse error', error);
        return next(err);
      }

      // Extract user data from session
      // Passport stores user in session.passport.user
      const user = sessionData?.passport?.user;

      if (!user) {
        const error = new Error('No user data in session');
        error.data = { code: 'NO_USER_DATA' };
        logger.warn(`WebSocket connection rejected: No user in session (${sessionID})`);
        return next(error);
      }

      // Validate userId matches (if provided)
      const sessionUserId = user._id || user.id;
      if (userId && sessionUserId !== userId) {
        const error = new Error('User ID mismatch');
        error.data = { code: 'USER_MISMATCH' };
        logger.warn(
          `WebSocket connection rejected: User ID mismatch (session: ${sessionUserId}, provided: ${userId})`
        );
        return next(error);
      }

      // Attach authenticated user data to socket
      socket.handshake.auth.userId = sessionUserId;
      socket.handshake.auth.userName = user.username || user.name || 'User';
      socket.handshake.auth.userEmail = user.email;
      socket.handshake.auth.isAdmin = user.isAdmin || false;
      socket.handshake.auth.authenticated = true;

      // Store session data for potential future use
      socket.handshake.session = sessionData;

      logger.info(
        `✅ WebSocket authenticated: ${socket.id} (User: ${socket.handshake.auth.userName}, ID: ${sessionUserId})`
      );

      next(); // Allow connection
    } catch (error) {
      logger.error('WebSocket authentication error:', error);
      const err = new Error('Authentication failed');
      err.data = { code: 'AUTH_ERROR', originalError: error.message };
      next(err);
    }
  };
}

/**
 * Middleware to require admin role
 * Must be used AFTER authentication middleware
 * @returns {Function} Middleware function
 */
function requireAdmin() {
  return (socket, next) => {
    const { isAdmin, authenticated } = socket.handshake.auth || {};

    if (!authenticated) {
      const error = new Error('Not authenticated');
      error.data = { code: 'NOT_AUTHENTICATED' };
      return next(error);
    }

    if (!isAdmin) {
      const error = new Error('Admin access required');
      error.data = { code: 'FORBIDDEN' };
      logger.warn(
        `WebSocket connection rejected: Admin access required (User: ${socket.handshake.auth.userId})`
      );
      return next(error);
    }

    next();
  };
}

/**
 * Middleware to check subscription tier
 * Must be used AFTER authentication middleware
 * @param {string[]} allowedTiers - Array of allowed subscription tiers (e.g., ['premium', 'enterprise'])
 * @returns {Function} Middleware function
 */
function requireSubscriptionTier(allowedTiers = []) {
  return async (socket, next) => {
    try {
      const { userId, authenticated } = socket.handshake.auth || {};

      if (!authenticated) {
        const error = new Error('Not authenticated');
        error.data = { code: 'NOT_AUTHENTICATED' };
        return next(error);
      }

      // Get user's subscription tier from database
      const User = mongoose.model('User');
      const user = await User.findById(userId).select('subscription');

      if (!user) {
        const error = new Error('User not found');
        error.data = { code: 'USER_NOT_FOUND' };
        return next(error);
      }

      const userTier = user.subscription?.tier || 'free';

      if (!allowedTiers.includes(userTier)) {
        const error = new Error(`Access restricted to ${allowedTiers.join(', ')} subscribers`);
        error.data = {
          code: 'SUBSCRIPTION_REQUIRED',
          userTier,
          requiredTiers: allowedTiers
        };
        logger.warn(
          `WebSocket connection rejected: Insufficient subscription tier (User: ${userId}, Tier: ${userTier})`
        );
        return next(error);
      }

      // Attach subscription data to socket
      socket.handshake.auth.subscriptionTier = userTier;

      next();
    } catch (error) {
      logger.error('Subscription tier check error:', error);
      const err = new Error('Subscription validation failed');
      err.data = { code: 'SUBSCRIPTION_ERROR' };
      next(err);
    }
  };
}

module.exports = {
  createAuthMiddleware,
  requireAdmin,
  requireSubscriptionTier
};
