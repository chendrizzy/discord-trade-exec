'use strict';

/**
 * JWT (JSON Web Token) Utilities
 *
 * Provides JWT generation and validation for:
 * - Session authentication
 * - WebSocket authentication
 * - API token authentication
 *
 * Constitutional Principle I: Security-First - Short TTL policy (15min access, 7d refresh)
 * FR-021-030: OAuth2 authentication with JWT tokens
 * FR-031-032: WebSocket JWT authentication
 */

const jwt = require('jsonwebtoken');
const { getConfig } = require('../config/env');

/**
 * Generate access token with short TTL
 * @param {Object} payload - Token payload (user data)
 * @param {Object} options - Optional JWT options
 * @returns {string} Signed JWT token
 */
function generateAccessToken(payload, options = {}) {
  const config = getConfig();

  const tokenPayload = {
    userId: payload.userId || payload._id,
    discordId: payload.discordId,
    username: payload.username,
    email: payload.email,
    roles: payload.roles || ['user'],
    subscriptionTier: payload.subscriptionTier || 'free',
    type: 'access'
  };

  const defaultOptions = {
    expiresIn: config.JWT_EXPIRES_IN || '15m',
    issuer: 'discord-trade-executor',
    audience: 'api'
  };

  return jwt.sign(tokenPayload, config.JWT_SECRET, {
    ...defaultOptions,
    ...options
  });
}

/**
 * Generate refresh token with long TTL
 * @param {Object} payload - Token payload (minimal user data)
 * @param {Object} options - Optional JWT options
 * @returns {string} Signed JWT refresh token
 */
function generateRefreshToken(payload, options = {}) {
  const config = getConfig();

  const tokenPayload = {
    userId: payload.userId || payload._id,
    discordId: payload.discordId,
    type: 'refresh'
  };

  const defaultOptions = {
    expiresIn: config.JWT_REFRESH_EXPIRES_IN || '7d',
    issuer: 'discord-trade-executor',
    audience: 'refresh'
  };

  return jwt.sign(tokenPayload, config.JWT_SECRET, {
    ...defaultOptions,
    ...options
  });
}

/**
 * Generate WebSocket token with medium TTL
 * Used for WebSocket connection authentication
 * @param {Object} payload - Token payload
 * @param {Object} options - Optional JWT options
 * @returns {string} Signed JWT token
 */
function generateWebSocketToken(payload, options = {}) {
  const config = getConfig();

  const tokenPayload = {
    userId: payload.userId || payload._id,
    discordId: payload.discordId,
    username: payload.username,
    type: 'websocket'
  };

  const defaultOptions = {
    expiresIn: '1h', // Longer for persistent WebSocket connections
    issuer: 'discord-trade-executor',
    audience: 'websocket'
  };

  return jwt.sign(tokenPayload, config.JWT_SECRET, {
    ...defaultOptions,
    ...options
  });
}

/**
 * Verify JWT token
 * @param {string} token - JWT token to verify
 * @param {Object} options - Optional verification options
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is invalid or expired
 */
function verifyToken(token, options = {}) {
  const config = getConfig();

  try {
    const defaultOptions = {
      issuer: 'discord-trade-executor'
      // audience can be specified in options
    };

    const decoded = jwt.verify(token, config.JWT_SECRET, {
      ...defaultOptions,
      ...options
    });

    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Token has expired');
    } else if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid token');
    } else if (error.name === 'NotBeforeError') {
      throw new Error('Token not yet valid');
    } else {
      throw new Error(`Token verification failed: ${error.message}`);
    }
  }
}

/**
 * Verify access token
 * @param {string} token - Access token
 * @returns {Object} Decoded payload
 */
function verifyAccessToken(token) {
  return verifyToken(token, { audience: 'api' });
}

/**
 * Verify refresh token
 * @param {string} token - Refresh token
 * @returns {Object} Decoded payload
 */
function verifyRefreshToken(token) {
  return verifyToken(token, { audience: 'refresh' });
}

/**
 * Verify WebSocket token
 * @param {string} token - WebSocket token
 * @returns {Object} Decoded payload
 */
function verifyWebSocketToken(token) {
  return verifyToken(token, { audience: 'websocket' });
}

/**
 * Decode token without verification (for inspection only)
 * @param {string} token - JWT token
 * @returns {Object|null} Decoded token or null if invalid
 */
function decodeToken(token) {
  try {
    return jwt.decode(token, { complete: true });
  } catch (error) {
    return null;
  }
}

/**
 * Check if token is expired without throwing
 * @param {string} token - JWT token
 * @returns {boolean} True if token is expired
 */
function isTokenExpired(token) {
  try {
    const decoded = decodeToken(token);
    if (!decoded || !decoded.payload.exp) {
      return true;
    }

    const currentTime = Math.floor(Date.now() / 1000);
    return decoded.payload.exp < currentTime;
  } catch (error) {
    return true;
  }
}

/**
 * Get token expiration time
 * @param {string} token - JWT token
 * @returns {Date|null} Expiration date or null if invalid
 */
function getTokenExpiration(token) {
  try {
    const decoded = decodeToken(token);
    if (!decoded || !decoded.payload.exp) {
      return null;
    }

    return new Date(decoded.payload.exp * 1000);
  } catch (error) {
    return null;
  }
}

/**
 * Get time until token expiration in seconds
 * @param {string} token - JWT token
 * @returns {number} Seconds until expiration (negative if expired)
 */
function getTimeUntilExpiration(token) {
  const expiration = getTokenExpiration(token);
  if (!expiration) {
    return -1;
  }

  return Math.floor((expiration.getTime() - Date.now()) / 1000);
}

/**
 * Check if token needs refresh (expires in < 5 minutes)
 * @param {string} token - Access token
 * @returns {boolean} True if token should be refreshed
 */
function shouldRefreshToken(token) {
  const timeUntilExpiration = getTimeUntilExpiration(token);
  return timeUntilExpiration > 0 && timeUntilExpiration < 300; // 5 minutes
}

/**
 * Generate token pair (access + refresh)
 * @param {Object} user - User data
 * @returns {Object} Object with accessToken and refreshToken
 */
function generateTokenPair(user) {
  return {
    accessToken: generateAccessToken(user),
    refreshToken: generateRefreshToken(user),
    expiresIn: getConfig().JWT_EXPIRES_IN || '15m'
  };
}

/**
 * Extract token from Authorization header
 * @param {string} authHeader - Authorization header value
 * @returns {string|null} Token or null if not found
 */
function extractTokenFromHeader(authHeader) {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Create token error response
 * @param {string} message - Error message
 * @param {string} code - Error code
 * @returns {Object} Standardized error response
 */
function createTokenError(message, code = 'TOKEN_ERROR') {
  return {
    error: {
      code,
      message,
      timestamp: new Date().toISOString()
    }
  };
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  generateWebSocketToken,
  generateTokenPair,
  verifyToken,
  verifyAccessToken,
  verifyRefreshToken,
  verifyWebSocketToken,
  decodeToken,
  isTokenExpired,
  getTokenExpiration,
  getTimeUntilExpiration,
  shouldRefreshToken,
  extractTokenFromHeader,
  createTokenError
};
