'use strict';

/**
 * JWT Authentication Middleware for Socket.IO
 *
 * Constitutional Requirements:
 * - Principle I: Security-First (JWT validation on WebSocket upgrade)
 * - Principle IV: Real-Time Standards (secure WebSocket authentication)
 *
 * Features:
 * - Validates JWT token from query parameter or auth header
 * - Rejects expired, invalid, or missing tokens
 * - Attaches user ID to socket.data for downstream handlers
 * - Logs authentication attempts for security monitoring
 * - Graceful error handling with user-friendly messages
 */

const jwt = require('jsonwebtoken');
const logger = require('../../utils/logger');

// JWT secret from environment variable
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';
const JWT_ALGORITHM = 'HS256';

/**
 * Socket.IO middleware for JWT authentication
 *
 * Validates JWT token provided via:
 * 1. Query parameter: ?token=<jwt>
 * 2. Auth header: Authorization: Bearer <jwt>
 *
 * On success:
 * - Attaches userId to socket.data.userId
 * - Attaches token expiry to socket.data.tokenExpiresAt
 * - Calls next() to proceed with connection
 *
 * On failure:
 * - Calls next(error) to reject connection
 * - Logs authentication failure for security monitoring
 *
 * @param {Socket} socket - Socket.IO socket instance
 * @param {Function} next - Callback to proceed or reject connection
 */
async function JWTAuthMiddleware(socket, next) {
  try {
    // Extract token from query parameter or auth header
    const token =
      socket.handshake.query.token ||
      socket.handshake.auth.token ||
      extractTokenFromHeader(socket.handshake.headers.authorization);

    if (!token) {
      const error = new Error('Missing JWT token');
      error.data = {
        code: 'MISSING_TOKEN',
        message:
          'Authentication required. Please provide a JWT token via query parameter (?token=...) or Authorization header.'
      };

      logAuthFailure(socket, 'Missing JWT token');
      return next(error);
    }

    // Validate token
    const decoded = await validateToken(token);

    // Attach user ID to socket data (available in connection handler)
    socket.data.userId = decoded.userId;
    socket.data.tokenExpiresAt = decoded.exp * 1000; // Convert to milliseconds
    socket.data.tokenIssuedAt = decoded.iat * 1000;

    logAuthSuccess(socket, decoded.userId);

    // Proceed with connection
    next();
  } catch (error) {
    // Handle specific JWT errors
    if (error.name === 'TokenExpiredError') {
      const authError = new Error('JWT token expired');
      authError.data = {
        code: 'TOKEN_EXPIRED',
        message: 'Your session has expired. Please refresh your token and reconnect.',
        expiredAt: error.expiredAt
      };

      logAuthFailure(socket, 'Token expired', error);
      return next(authError);
    }

    if (error.name === 'JsonWebTokenError') {
      const authError = new Error('Invalid JWT token');
      authError.data = {
        code: 'INVALID_TOKEN',
        message: 'Authentication failed. Invalid token signature or format.'
      };

      logAuthFailure(socket, 'Invalid JWT token', error);
      return next(authError);
    }

    if (error.name === 'NotBeforeError') {
      const authError = new Error('JWT token not yet valid');
      authError.data = {
        code: 'TOKEN_NOT_BEFORE',
        message: 'Token is not yet valid. Check system time synchronization.'
      };

      logAuthFailure(socket, 'Token not yet valid', error);
      return next(authError);
    }

    // Generic authentication error
    const authError = new Error('Authentication failed');
    authError.data = {
      code: 'AUTH_FAILED',
      message: 'Unable to authenticate WebSocket connection. Please try again.'
    };

    logAuthFailure(socket, 'Authentication failed', error);
    next(authError);
  }
}

/**
 * Validate JWT token
 *
 * @param {string} token - JWT token string
 * @returns {Promise<Object>} - Decoded token payload
 * @throws {Error} - If token is invalid, expired, or malformed
 */
async function validateToken(token) {
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      JWT_SECRET,
      {
        algorithms: [JWT_ALGORITHM],
        clockTolerance: 10 // Allow 10 seconds clock skew
      },
      (error, decoded) => {
        if (error) {
          return reject(error);
        }

        // Validate required fields
        if (!decoded.userId) {
          return reject(new Error('Token missing userId claim'));
        }

        // Additional validation: Check token type (if present)
        if (decoded.type && decoded.type !== 'access') {
          return reject(new Error('Invalid token type. Expected access token.'));
        }

        resolve(decoded);
      }
    );
  });
}

/**
 * Extract token from Authorization header
 *
 * @param {string} authHeader - Authorization header value
 * @returns {string|null} - Extracted token or null
 */
function extractTokenFromHeader(authHeader) {
  if (!authHeader) {
    return null;
  }

  // Handle "Bearer <token>" format
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

/**
 * Log successful authentication (security monitoring)
 *
 * @param {Socket} socket - Socket.IO socket instance
 * @param {string} userId - Authenticated user ID
 */
function logAuthSuccess(socket, userId) {
  logger.info('WebSocket authentication successful', {
    userId,
    sessionId: socket.id,
    ipAddress: socket.handshake.address,
    userAgent: socket.handshake.headers['user-agent'],
    transport: socket.conn.transport.name
  });
}

/**
 * Log failed authentication (security monitoring)
 *
 * @param {Socket} socket - Socket.IO socket instance
 * @param {string} reason - Failure reason
 * @param {Error} [error] - Optional error object
 */
function logAuthFailure(socket, reason, error = null) {
  logger.warn('WebSocket authentication failed', {
    reason,
    sessionId: socket.id,
    ipAddress: socket.handshake.address,
    userAgent: socket.handshake.headers['user-agent'],
    error: error ? error.message : null,
    transport: socket.conn.transport.name
  });

  // Increment security metric for failed auth attempts
  // In production, trigger alert after N failures from same IP
  incrementFailedAuthCounter(socket.handshake.address);
}

/**
 * Track failed authentication attempts per IP (rate limiting/security)
 *
 * Simple in-memory counter. In production, use Redis for distributed tracking.
 *
 * @param {string} ipAddress - Client IP address
 */
const failedAuthCounters = new Map();
const MAX_FAILED_ATTEMPTS = 5;
const COUNTER_RESET_TIME = 15 * 60 * 1000; // 15 minutes

function incrementFailedAuthCounter(ipAddress) {
  const now = Date.now();
  const counter = failedAuthCounters.get(ipAddress) || { count: 0, resetAt: now + COUNTER_RESET_TIME };

  if (now > counter.resetAt) {
    // Reset counter after time window
    counter.count = 0;
    counter.resetAt = now + COUNTER_RESET_TIME;
  }

  counter.count++;
  failedAuthCounters.set(ipAddress, counter);

  if (counter.count >= MAX_FAILED_ATTEMPTS) {
    logger.error('Multiple failed WebSocket authentication attempts detected', {
      ipAddress,
      attemptCount: counter.count,
      timeWindow: '15 minutes',
      action: 'Consider IP blocking or CAPTCHA challenge'
    });

    // In production: Trigger security alert, potentially block IP temporarily
  }
}

/**
 * Clear failed authentication counter for IP (after successful auth)
 *
 * @param {string} ipAddress - Client IP address
 */
function clearFailedAuthCounter(ipAddress) {
  failedAuthCounters.delete(ipAddress);
}

// Export middleware and helper functions
JWTAuthMiddleware.validateToken = validateToken;
JWTAuthMiddleware.clearFailedAuthCounter = clearFailedAuthCounter;

module.exports = JWTAuthMiddleware;
