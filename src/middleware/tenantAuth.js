// External dependencies
const { AsyncLocalStorage } = require('async_hooks');
const jwt = require('jsonwebtoken');

// Models and types
const Community = require('../models/Community');
const logger = require('../utils/logger');


// AsyncLocalStorage for request-scoped tenant context
const tenantContext = new AsyncLocalStorage();

/**
 * Tenant Authentication Middleware
 *
 * Layer 1 of 7-Layer Security Defense
 *
 * Responsibilities:
 * 1. Extract and validate JWT from Authorization header
 * 2. Verify communityId claim exists in token
 * 3. Validate community exists and subscription is active
 * 4. Store tenant context in AsyncLocalStorage for request lifecycle
 * 5. Provide getTenantContext() helper for downstream access
 *
 * Security Features:
 * - JWT signature verification (RS256 or HS256)
 * - Token expiration validation
 * - Community soft-delete check
 * - Subscription status validation
 * - Request-scoped context isolation
 *
 * Usage:
 *   app.use('/api', extractTenantMiddleware);
 */
const extractTenantMiddleware = async (req, res, next) => {
  try {
    // 1. Extract JWT from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_MISSING'
      });
    }

    // Validate Bearer token format
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({
        success: false,
        error: 'Invalid authorization header format. Expected: Bearer <token>',
        code: 'AUTH_FORMAT_INVALID'
      });
    }

    const token = parts[1];

    // 2. Verify JWT and extract claims
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      logger.error('[TenantAuth] CRITICAL: JWT_SECRET not configured');
      return res.status(500).json({
        success: false,
        error: 'Authentication service misconfigured',
        code: 'AUTH_CONFIG_ERROR'
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, jwtSecret, {
        algorithms: ['HS256', 'RS256'], // Support both symmetric and asymmetric
        maxAge: '7d' // Maximum token lifetime
      });
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'Token has expired',
          code: 'TOKEN_EXPIRED',
          expiredAt: jwtError.expiredAt
        });
      } else if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          error: 'Invalid token',
          code: 'TOKEN_INVALID',
          details: jwtError.message
        });
      } else {
        throw jwtError; // Unknown error, let outer catch handle
      }
    }

    // 3. Extract and validate communityId claim
    const { communityId, userId, role } = decoded;

    if (!communityId) {
      return res.status(403).json({
        success: false,
        error: 'Token missing communityId claim',
        code: 'TENANT_CLAIM_MISSING'
      });
    }

    if (!userId) {
      return res.status(403).json({
        success: false,
        error: 'Token missing userId claim',
        code: 'USER_CLAIM_MISSING'
      });
    }

    // 4. Verify community exists and is active
    const community = await Community.findById(communityId);

    if (!community) {
      return res.status(404).json({
        success: false,
        error: 'Community not found',
        code: 'TENANT_NOT_FOUND'
      });
    }

    // Check for soft delete
    if (community.deletedAt) {
      return res.status(403).json({
        success: false,
        error: 'Community has been deactivated',
        code: 'TENANT_DELETED',
        deletedAt: community.deletedAt
      });
    }

    // 5. Verify subscription is active
    if (!community.isSubscriptionActive()) {
      return res.status(403).json({
        success: false,
        error: 'Community subscription is inactive',
        code: 'SUBSCRIPTION_INACTIVE',
        subscriptionStatus: community.subscription.status,
        tier: community.subscription.tier
      });
    }

    // 6. Store tenant context in AsyncLocalStorage
    const context = {
      communityId: community._id.toString(),
      communityName: community.name,
      userId: userId.toString(),
      userRole: role,
      subscriptionTier: community.subscription.tier,
      discordGuildId: community.discordGuildId,
      // Attach timestamp for audit logging
      requestTime: new Date(),
      requestId: req.id || generateRequestId()
    };

    // 7. Run request handler with tenant context
    tenantContext.run(context, () => {
      // Attach context to req object for convenience
      req.tenant = context;
      next();
    });
  } catch (error) {
    logger.error('[TenantAuth] Unexpected error:', { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      error: 'Internal authentication error',
      code: 'AUTH_ERROR'
    });
  }
};

/**
 * Get Tenant Context
 *
 * Retrieves the current request's tenant context from AsyncLocalStorage.
 * Can be called from anywhere in the request call stack (controllers, services, repositories).
 *
 * @throws {Error} If called outside of tenant context
 * @returns {Object} Tenant context with communityId, userId, role, etc.
 *
 * Usage:
 *   const { communityId, userId } = getTenantContext();
 */
const getTenantContext = () => {
  const context = tenantContext.getStore();

  if (!context) {
    throw new Error(
      'getTenantContext() called outside of tenant context. ' +
        'Ensure extractTenantMiddleware is applied to the route.'
    );
  }

  return context;
};

/**
 * Optional Tenant Middleware
 *
 * For routes that can work with OR without a tenant (e.g., public endpoints).
 * Attempts to extract tenant context but doesn't fail if missing.
 *
 * Usage:
 *   app.use('/api/public', optionalTenantMiddleware);
 */
const optionalTenantMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  // No auth header = public access
  if (!authHeader) {
    req.tenant = null;
    return next();
  }

  // Has auth header = validate it
  // Use extractTenantMiddleware but catch errors
  try {
    await extractTenantMiddleware(req, res, next);
  } catch (error) {
    // On auth error, continue as public (don't block)
    req.tenant = null;
    next();
  }
};

/**
 * Check Tenant Permission
 *
 * Middleware to verify user has specific permission in their community.
 * Must be used AFTER extractTenantMiddleware.
 *
 * @param {string} permission - Required permission (e.g., 'manage_signals', 'execute_trades')
 *
 * Usage:
 *   router.post('/execute-trade',
 *     extractTenantMiddleware,
 *     checkTenantPermission('execute_trades'),
 *     executeTradeController
 *   );
 */
const checkTenantPermission = permission => {
  return async (req, res, next) => {
    try {
      const { communityId, userId } = getTenantContext();

      const community = await Community.findById(communityId);

      if (!community) {
        return res.status(404).json({
          success: false,
          error: 'Community not found',
          code: 'TENANT_NOT_FOUND'
        });
      }

      // Check if user has permission
      if (!community.hasPermission(userId, permission)) {
        return res.status(403).json({
          success: false,
          error: `Missing required permission: ${permission}`,
          code: 'PERMISSION_DENIED',
          requiredPermission: permission
        });
      }

      next();
    } catch (error) {
      logger.error('[TenantAuth] Permission check error:', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Permission validation failed',
        code: 'PERMISSION_CHECK_ERROR'
      });
    }
  };
};

/**
 * Admin Only Middleware
 *
 * Restricts route to community admins/owners only.
 * Must be used AFTER extractTenantMiddleware.
 *
 * Usage:
 *   router.post('/community/settings',
 *     extractTenantMiddleware,
 *     adminOnly,
 *     updateCommunitySettingsController
 *   );
 */
const adminOnly = async (req, res, next) => {
  try {
    const { communityId, userId } = getTenantContext();

    const community = await Community.findById(communityId);

    if (!community) {
      return res.status(404).json({
        success: false,
        error: 'Community not found',
        code: 'TENANT_NOT_FOUND'
      });
    }

    if (!community.isAdmin(userId)) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
        code: 'ADMIN_REQUIRED'
      });
    }

    next();
  } catch (error) {
    logger.error('[TenantAuth] Admin check error:', { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      error: 'Admin validation failed',
      code: 'ADMIN_CHECK_ERROR'
    });
  }
};

/**
 * Owner Only Middleware
 *
 * Restricts route to community owner only.
 * Must be used AFTER extractTenantMiddleware.
 *
 * Usage:
 *   router.delete('/community',
 *     extractTenantMiddleware,
 *     ownerOnly,
 *     deleteCommunityController
 *   );
 */
const ownerOnly = async (req, res, next) => {
  try {
    const { communityId, userId } = getTenantContext();

    const community = await Community.findById(communityId);

    if (!community) {
      return res.status(404).json({
        success: false,
        error: 'Community not found',
        code: 'TENANT_NOT_FOUND'
      });
    }

    if (!community.isOwner(userId)) {
      return res.status(403).json({
        success: false,
        error: 'Owner access required',
        code: 'OWNER_REQUIRED'
      });
    }

    next();
  } catch (error) {
    logger.error('[TenantAuth] Owner check error:', { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      error: 'Owner validation failed',
      code: 'OWNER_CHECK_ERROR'
    });
  }
};

/**
 * Generate Request ID
 *
 * Generates unique ID for request tracking and audit logging.
 * Format: timestamp-random (e.g., 1634567890123-a3b4c5)
 */
const generateRequestId = () => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
};

module.exports = {
  extractTenantMiddleware,
  getTenantContext,
  optionalTenantMiddleware,
  checkTenantPermission,
  adminOnly,
  ownerOnly
};
