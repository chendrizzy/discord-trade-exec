/**
 * Admin Middleware
 * Ensures only admin users can access protected admin routes
 */

const { ensureAuthenticated } = require('./auth');

/**
 * Middleware to check if authenticated user is an admin
 * Must be used after ensureAuthenticated middleware
 */
const ensureAdmin = (req, res, next) => {
    // Check if user is authenticated (should be handled by ensureAuthenticated)
    if (!req.user) {
        return res.status(401).json({
            success: false,
            error: 'Authentication required',
            message: 'You must be logged in to access this resource'
        });
    }

    // Check if user has admin privileges
    if (!req.user.isAdmin) {
        return res.status(403).json({
            success: false,
            error: 'Forbidden',
            message: 'You do not have permission to access this resource. Admin privileges required.'
        });
    }

    // User is admin, proceed to next middleware/route handler
    next();
};

/**
 * Combined middleware: authentication + admin check
 * Convenience function to apply both checks in one
 */
const adminOnly = [
    ensureAuthenticated,
    ensureAdmin
];

module.exports = {
    ensureAdmin,
    adminOnly
};
