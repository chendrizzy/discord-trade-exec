/**
 * Feature Flag Middleware
 *
 * Implements gradual rollout for the dual dashboard system using feature flags.
 * Allows percentage-based rollout to control which users see the new dashboards.
 */

/**
 * Check if dual dashboard feature is enabled for a user
 *
 * @param {Object} user - User object with _id
 * @returns {boolean} - True if feature is enabled for this user
 */
function isDualDashboardEnabled(user) {
  // Check if feature is globally enabled
  const featureEnabled = process.env.ENABLE_DUAL_DASHBOARDS === 'true';

  if (!featureEnabled) {
    return false;
  }

  // Get rollout percentage (default: 100% if not specified)
  const rolloutPercentage = parseInt(process.env.DUAL_DASHBOARD_ROLLOUT_PERCENTAGE || '100', 10);

  if (rolloutPercentage >= 100) {
    return true; // Full rollout
  }

  if (rolloutPercentage <= 0) {
    return false; // Disabled
  }

  // Gradual rollout: Use consistent hashing based on user ID
  // This ensures same user always gets same result
  const userId = user._id.toString();
  const hash = hashString(userId);
  const userPercentile = hash % 100; // 0-99

  return userPercentile < rolloutPercentage;
}

/**
 * Simple hash function for consistent user bucketing
 *
 * @param {string} str - String to hash
 * @returns {number} - Hash value
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Middleware: Require dual dashboard feature to be enabled
 *
 * Use this middleware on new dashboard routes to enforce feature flag.
 * Returns 404 if feature is not enabled for the user.
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
function requireDualDashboard(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required'
    });
  }

  if (!isDualDashboardEnabled(req.user)) {
    // Feature not enabled for this user - redirect to legacy dashboard
    return res.redirect('/legacy-dashboard');
  }

  next();
}

/**
 * Middleware: Add feature flag status to request
 *
 * Adds `req.features` object with feature flag status for use in templates/API responses
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
function attachFeatureFlags(req, res, next) {
  req.features = {
    dualDashboard: false
  };

  if (req.user) {
    req.features.dualDashboard = isDualDashboardEnabled(req.user);
  }

  // Add helper to response locals for templates
  res.locals.features = req.features;

  next();
}

/**
 * Get feature flag statistics
 *
 * Returns rollout configuration and current status.
 * Useful for admin dashboards and monitoring.
 *
 * @returns {Object} - Feature flag statistics
 */
function getFeatureFlagStats() {
  return {
    dualDashboard: {
      enabled: process.env.ENABLE_DUAL_DASHBOARDS === 'true',
      rolloutPercentage: parseInt(process.env.DUAL_DASHBOARD_ROLLOUT_PERCENTAGE || '100', 10),
      strategy: 'consistent-hash',
      lastUpdated: process.env.FEATURE_FLAGS_UPDATED_AT || new Date().toISOString()
    }
  };
}

module.exports = {
  isDualDashboardEnabled,
  requireDualDashboard,
  attachFeatureFlags,
  getFeatureFlagStats
};
