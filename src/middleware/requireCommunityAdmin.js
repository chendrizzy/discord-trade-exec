/**
 * Require Community Admin Middleware
 *
 * Authorization middleware for community management endpoints.
 * Ensures user has admin or moderator role.
 *
 * Used for:
 * - /api/community/* endpoints
 * - Member management
 * - Signal provider configuration
 * - Community analytics
 * - Billing settings
 */

/**
 * Require community admin role (admin or moderator)
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
const requireCommunityAdmin = (req, res, next) => {
  // Check authentication
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Please login to access this resource'
    });
  }

  // Check user exists in session
  const user = req.user;
  if (!user) {
    return res.status(401).json({
      error: 'User not found',
      message: 'Session invalid or expired'
    });
  }

  // Check community role
  const role = user.communityRole;
  const isAdmin = ['admin', 'moderator'].includes(role);

  if (!isAdmin) {
    return res.status(403).json({
      error: 'Insufficient permissions',
      message: 'Community admin or moderator role required to access this resource',
      requiredRoles: ['admin', 'moderator'],
      currentRole: role || 'none'
    });
  }

  // User has sufficient permissions
  next();
};

module.exports = requireCommunityAdmin;
