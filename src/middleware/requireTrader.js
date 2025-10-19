/**
 * Require Trader Middleware
 *
 * Authorization middleware for trader-specific endpoints.
 * Ensures user has valid authenticated session.
 *
 * Used for:
 * - /api/trader/* endpoints
 * - Personal trade history
 * - Broker management
 * - Risk settings
 * - Personal analytics
 *
 * Note: Does not restrict by role - all authenticated users can access trader endpoints
 * (including community admins who may also trade)
 */

/**
 * Require authenticated trader user
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
const requireTrader = (req, res, next) => {
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

  // Check account status
  if (user.accountStatus && user.accountStatus !== 'active') {
    return res.status(403).json({
      error: 'Account restricted',
      message: `Account is ${user.accountStatus}`,
      accountStatus: user.accountStatus
    });
  }

  // All authenticated active users can access trader endpoints
  next();
};

module.exports = requireTrader;
