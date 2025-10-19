/**
 * Dashboard Router Middleware
 *
 * Role-based routing middleware for dual dashboard system.
 * Automatically redirects users to appropriate dashboard based on communityRole.
 *
 * Routes:
 * - Community Hosts (admin, moderator) → /dashboard/community
 * - Traders, Viewers → /dashboard/trader
 *
 * Features:
 * - Deep link preservation through auth flow (returnTo parameter)
 * - Unauthenticated user redirects to Discord OAuth
 * - Session validation
 */

/**
 * Dashboard router middleware
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
const dashboardRouter = (req, res, next) => {
  // 1. Check authentication
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    // Preserve requested path for redirect after auth
    const returnTo = encodeURIComponent(req.originalUrl);
    return res.redirect(`/auth/discord?returnTo=${returnTo}`);
  }

  // 2. Detect user role from session/database
  const user = req.user;

  if (!user) {
    return res.status(401).json({ error: 'User not found in session' });
  }

  const role = user.communityRole || 'trader'; // Default to trader if not set

  // 3. Route based on role
  const isCommunityHost = ['admin', 'moderator'].includes(role);
  const requestPath = req.path;

  if (isCommunityHost) {
    // Community hosts should access community dashboard
    if (!requestPath.startsWith('/dashboard/community')) {
      // Redirect to community dashboard, preserve query params
      const queryString = req.url.split('?')[1] || '';
      const redirectUrl = `/dashboard/community${queryString ? `?${queryString}` : ''}`;
      return res.redirect(redirectUrl);
    }
  } else {
    // Traders and viewers should access trader dashboard
    if (!requestPath.startsWith('/dashboard/trader')) {
      // Redirect to trader dashboard, preserve query params
      const queryString = req.url.split('?')[1] || '';
      const redirectUrl = `/dashboard/trader${queryString ? `?${queryString}` : ''}`;
      return res.redirect(redirectUrl);
    }
  }

  // User is already on correct dashboard
  next();
};

/**
 * Simple dashboard router for /dashboard base path
 * Redirects to appropriate role-specific dashboard
 */
const baseDashboardRouter = (req, res) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    const returnTo = encodeURIComponent(req.originalUrl);
    return res.redirect(`/auth/discord?returnTo=${returnTo}`);
  }

  const user = req.user;
  if (!user) {
    return res.status(401).json({ error: 'User not found in session' });
  }

  const role = user.communityRole || 'trader';
  const isCommunityHost = ['admin', 'moderator'].includes(role);

  // Preserve query params during redirect
  const queryString = req.url.split('?')[1] || '';
  const redirectUrl = isCommunityHost
    ? `/dashboard/community${queryString ? `?${queryString}` : ''}`
    : `/dashboard/trader${queryString ? `?${queryString}` : ''}`;

  return res.redirect(redirectUrl);
};

module.exports = {
  dashboardRouter,
  baseDashboardRouter
};
