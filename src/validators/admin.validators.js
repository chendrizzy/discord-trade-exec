/**
 * Admin Route Validators
 * US7-T02: Validation schemas for admin API endpoints
 *
 * Endpoints:
 * - GET /api/admin/users - User listing with pagination and filters
 * - PATCH /api/admin/users/:userId/role - User role management
 */

const { z } = require('zod');

/**
 * Admin Users List Query Parameters
 * GET /api/admin/users
 *
 * Query params:
 * - page: Page number (1-based, default: 1)
 * - limit: Results per page (1-100, default: 20)
 * - search: Search query for username/email
 * - tier: Filter by subscription tier
 * - status: Filter by subscription status
 */
const adminUsersQuery = z.object({
  page: z
    .string()
    .regex(/^\d+$/, 'Page must be a positive integer')
    .transform(Number)
    .refine(n => n >= 1, 'Page must be at least 1')
    .optional(),
  limit: z
    .string()
    .regex(/^\d+$/, 'Limit must be a positive integer')
    .transform(Number)
    .refine(n => n >= 1 && n <= 100, 'Limit must be between 1 and 100')
    .optional(),
  search: z
    .string()
    .max(255, 'Search query too long')
    .regex(/^[a-zA-Z0-9@._\-\s]+$/, 'Invalid characters in search query')
    .optional(),
  tier: z
    .enum(['free', 'basic', 'pro', 'premium'], {
      errorMap: () => ({ message: 'Invalid tier. Must be: free, basic, pro, or premium' })
    })
    .optional(),
  status: z
    .enum(['active', 'trial', 'cancelled', 'past_due'], {
      errorMap: () => ({ message: 'Invalid status. Must be: active, trial, cancelled, or past_due' })
    })
    .optional()
});

/**
 * User Role Update Path Parameters
 * PATCH /api/admin/users/:userId/role
 *
 * Path params:
 * - userId: MongoDB ObjectId (24 hex characters)
 */
const adminUserRoleParams = z.object({
  userId: z
    .string()
    .length(24, 'User ID must be 24 characters')
    .regex(/^[0-9a-fA-F]{24}$/, 'Invalid MongoDB ObjectId format')
});

/**
 * User Role Update Body
 * PATCH /api/admin/users/:userId/role
 *
 * Body:
 * - communityRole: New role for the user within the community
 *
 * Allowed roles:
 * - admin: Full administrative access
 * - trader: Can execute trades and manage signals
 * - viewer: Read-only access
 */
const adminUserRoleBody = z.object({
  communityRole: z
    .enum(['admin', 'trader', 'viewer'], {
      errorMap: () => ({ message: 'Invalid role. Must be: admin, trader, or viewer' })
    })
});

/**
 * Security: Prototype Pollution Prevention
 * All schemas reject dangerous property names that could lead to prototype pollution:
 * - __proto__
 * - constructor
 * - prototype
 *
 * Zod's default behavior prevents these keys from being added to objects.
 */

module.exports = {
  adminUsersQuery,
  adminUserRoleParams,
  adminUserRoleBody
};
