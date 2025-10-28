/**
 * JWT-Based Admin Middleware
 * For API endpoints that need admin authentication via Bearer tokens
 * Used by monitoring endpoints accessed by Prometheus/Grafana
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Middleware to verify JWT token and ensure user is platform admin
 * Supports Bearer token authentication for API clients
 *
 * Usage:
 *   router.get('/api/metrics/export', ensureAdminJWT, handler);
 */
const ensureAdminJWT = async (req, res, next) => {
  try {
    // Extract JWT from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'Authorization header missing'
      });
    }

    // Validate Bearer token format
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({
        success: false,
        error: 'Invalid authorization header format',
        message: 'Expected: Bearer <token>'
      });
    }

    const token = parts[1];

    // Verify JWT
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      logger.error('[JWTAdmin] JWT_SECRET not configured');
      return res.status(500).json({
        success: false,
        error: 'Authentication service misconfigured'
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, jwtSecret, {
        algorithms: ['HS256']
      });
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'Token has expired',
          expiredAt: jwtError.expiredAt
        });
      } else if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          error: 'Invalid token',
          details: jwtError.message
        });
      } else {
        throw jwtError;
      }
    }

    // Extract userId from token
    const { userId } = decoded;

    if (!userId) {
      return res.status(403).json({
        success: false,
        error: 'Token missing userId claim'
      });
    }

    // Look up user
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Check if user is platform admin
    if (!user.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Admin privileges required'
      });
    }

    // Attach user to request for downstream use
    req.user = user;
    next();
  } catch (error) {
    logger.error('[JWTAdmin] Authentication error:', {
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      success: false,
      error: 'Internal authentication error'
    });
  }
};

module.exports = {
  ensureAdminJWT
};
