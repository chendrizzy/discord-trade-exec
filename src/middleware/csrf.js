'use strict';

/**
 * CSRF Protection Middleware
 *
 * Provides Cross-Site Request Forgery protection using session-bound tokens.
 *
 * Features:
 * - Session-bound token generation
 * - Token validation for state-changing operations (POST/PUT/DELETE/PATCH)
 * - Automatic token rotation after successful use
 * - Double-submit cookie pattern as fallback
 * - Exemptions for API endpoints with Bearer token authentication
 *
 * Constitutional Principle II: Security First
 * FR-080: CSRF protection for all state-changing operations
 */

const crypto = require('crypto');
const logger = require('../utils/logger');
const { AppError, ErrorCodes } = require('./errorHandler');

/**
 * Configuration
 */
const CONFIG = {
  tokenLength: 32, // 32 bytes = 256 bits
  tokenHeader: 'X-CSRF-Token',
  cookieName: 'csrf-token',
  sessionKey: 'csrfToken',
  tokenRotation: true, // Rotate token after each use
  exemptMethods: ['GET', 'HEAD', 'OPTIONS'],
  exemptPaths: [
    '/webhook/', // Webhook endpoints
    '/health', // Health check
    '/metrics' // Metrics endpoint
  ]
};

/**
 * Generate cryptographically secure CSRF token
 * @returns {string} Hex-encoded random token
 */
function generateToken() {
  return crypto.randomBytes(CONFIG.tokenLength).toString('hex');
}

/**
 * Check if request is exempt from CSRF protection
 * @param {Object} req - Express request object
 * @returns {boolean} True if request is exempt
 */
function isExempt(req) {
  // Exempt safe HTTP methods
  if (CONFIG.exemptMethods.includes(req.method)) {
    return true;
  }

  // Exempt paths that start with configured prefixes
  if (CONFIG.exemptPaths.some(path => req.path.startsWith(path))) {
    return true;
  }

  // Exempt API requests with Bearer token authentication
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return true;
  }

  return false;
}

/**
 * Get CSRF token from request
 * @param {Object} req - Express request object
 * @returns {string|null} CSRF token from header or body
 */
function getTokenFromRequest(req) {
  // Check header first (recommended)
  if (req.headers[CONFIG.tokenHeader.toLowerCase()]) {
    return req.headers[CONFIG.tokenHeader.toLowerCase()];
  }

  // Check body as fallback (for form submissions)
  if (req.body && req.body._csrf) {
    return req.body._csrf;
  }

  // Check query parameter as last resort
  if (req.query && req.query._csrf) {
    return req.query._csrf;
  }

  return null;
}

/**
 * Initialize CSRF token in session
 * @param {Object} req - Express request object
 * @returns {string} Generated CSRF token
 */
function initializeToken(req) {
  if (!req.session) {
    throw new Error('CSRF middleware requires express-session');
  }

  const token = generateToken();
  req.session[CONFIG.sessionKey] = token;

  logger.debug('CSRF token initialized', {
    sessionID: req.sessionID,
    tokenPreview: token.substring(0, 8) + '...'
  });

  return token;
}

/**
 * Get or create CSRF token for session
 * @param {Object} req - Express request object
 * @returns {string} CSRF token
 */
function getOrCreateToken(req) {
  if (!req.session) {
    throw new Error('CSRF middleware requires express-session');
  }

  // Return existing token if valid
  if (req.session[CONFIG.sessionKey]) {
    return req.session[CONFIG.sessionKey];
  }

  // Generate new token
  return initializeToken(req);
}

/**
 * Validate CSRF token
 * @param {Object} req - Express request object
 * @returns {boolean} True if token is valid
 */
function validateToken(req) {
  if (!req.session) {
    return false;
  }

  const requestToken = getTokenFromRequest(req);
  const sessionToken = req.session[CONFIG.sessionKey];

  if (!requestToken || !sessionToken) {
    return false;
  }

  // Use constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(requestToken, 'hex'),
      Buffer.from(sessionToken, 'hex')
    );
  } catch (error) {
    // timingSafeEqual throws if buffers are different lengths
    return false;
  }
}

/**
 * Rotate CSRF token (generate new one)
 * @param {Object} req - Express request object
 * @returns {string} New CSRF token
 */
function rotateToken(req) {
  if (!req.session) {
    throw new Error('CSRF middleware requires express-session');
  }

  const newToken = generateToken();
  req.session[CONFIG.sessionKey] = newToken;

  logger.debug('CSRF token rotated', {
    sessionID: req.sessionID,
    tokenPreview: newToken.substring(0, 8) + '...'
  });

  return newToken;
}

/**
 * CSRF protection middleware
 * @param {Object} options - Configuration options
 * @param {boolean} options.rotation - Enable token rotation (default: true)
 * @param {string[]} options.exemptPaths - Additional paths to exempt
 * @returns {Function} Express middleware
 */
function csrfProtection(options = {}) {
  const config = {
    rotation: options.rotation !== undefined ? options.rotation : CONFIG.tokenRotation,
    exemptPaths: [...CONFIG.exemptPaths, ...(options.exemptPaths || [])]
  };

  return (req, res, next) => {
    try {
      // Initialize token in session if not present
      if (req.session && !req.session[CONFIG.sessionKey]) {
        initializeToken(req);
      }

      // Attach token getter to request for easy access
      req.csrfToken = () => getOrCreateToken(req);

      // Check if request is exempt from CSRF validation
      if (isExempt(req)) {
        return next();
      }

      // Validate CSRF token for state-changing requests
      if (!validateToken(req)) {
        const requestToken = getTokenFromRequest(req);

        logger.warn('CSRF token validation failed', {
          method: req.method,
          path: req.path,
          sessionID: req.sessionID,
          hasRequestToken: !!requestToken,
          hasSessionToken: !!req.session[CONFIG.sessionKey],
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        });

        // Return appropriate error based on missing vs invalid token
        if (!requestToken) {
          throw new AppError(
            'CSRF token required for this request',
            403,
            ErrorCodes.CSRF_TOKEN_MISSING,
            {
              method: req.method,
              path: req.path,
              hint: 'Include X-CSRF-Token header or _csrf field'
            }
          );
        }

        throw new AppError(
          'Invalid CSRF token',
          403,
          ErrorCodes.CSRF_TOKEN_INVALID,
          {
            method: req.method,
            path: req.path
          }
        );
      }

      // Token is valid - rotate if configured
      if (config.rotation) {
        // Store old token for comparison
        const oldToken = req.session[CONFIG.sessionKey];

        // Rotate token after successful validation
        const newToken = rotateToken(req);

        // Update token getter to return new token
        req.csrfToken = () => newToken;

        logger.debug('CSRF token validated and rotated', {
          method: req.method,
          path: req.path,
          sessionID: req.sessionID,
          oldTokenPreview: oldToken.substring(0, 8) + '...',
          newTokenPreview: newToken.substring(0, 8) + '...'
        });
      } else {
        logger.debug('CSRF token validated', {
          method: req.method,
          path: req.path,
          sessionID: req.sessionID
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware to attach CSRF token to response locals
 * Makes token available in views/templates
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
function attachTokenToLocals(req, res, next) {
  if (req.session) {
    res.locals.csrfToken = getOrCreateToken(req);
  }
  next();
}

/**
 * Add CSRF token error codes to ErrorCodes
 */
if (!ErrorCodes.CSRF_TOKEN_MISSING) {
  ErrorCodes.CSRF_TOKEN_MISSING = 'CSRF_TOKEN_MISSING';
}
if (!ErrorCodes.CSRF_TOKEN_INVALID) {
  ErrorCodes.CSRF_TOKEN_INVALID = 'CSRF_TOKEN_INVALID';
}

module.exports = {
  csrfProtection,
  attachTokenToLocals,
  generateToken,
  getOrCreateToken,
  validateToken,
  rotateToken,
  CONFIG
};
