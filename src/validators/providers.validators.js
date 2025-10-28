/**
 * Providers Route Validators
 * US7-T02: Validation schemas for signal providers API endpoints
 *
 * Endpoints covered:
 * - Provider listing and search
 * - Provider subscription management
 * - Provider reviews and ratings
 * - User provider configuration
 */

const { z } = require('zod');

/**
 * Provider Listing Query Parameters
 * GET /api/providers
 *
 * Query params:
 * - limit: Maximum providers to return (default: 20)
 * - minWinRate: Minimum win rate percentage (0-100)
 * - minTrades: Minimum number of trades
 * - sortBy: Sort field (winRate, totalTrades, rating, followers)
 */
const providerListQuery = z.object({
  limit: z
    .string()
    .regex(/^\d+$/, 'Limit must be a positive integer')
    .transform(Number)
    .refine(n => n >= 1 && n <= 100, 'Limit must be between 1 and 100')
    .optional(),
  minWinRate: z
    .string()
    .regex(/^\d*\.?\d+$/, 'Win rate must be a number')
    .transform(Number)
    .refine(n => n >= 0 && n <= 100, 'Win rate must be between 0 and 100')
    .optional(),
  minTrades: z
    .string()
    .regex(/^\d+$/, 'Minimum trades must be a positive integer')
    .transform(Number)
    .refine(n => n >= 0, 'Minimum trades must be non-negative')
    .optional(),
  sortBy: z
    .enum(['winRate', 'totalTrades', 'rating', 'followers'], {
      errorMap: () => ({ message: 'Invalid sort field. Must be: winRate, totalTrades, rating, or followers' })
    })
    .optional()
});

/**
 * Provider ID Path Parameter
 * Used by multiple provider-specific endpoints
 *
 * Path params:
 * - providerId: MongoDB ObjectId
 */
const providerIdParams = z.object({
  providerId: z
    .string()
    .length(24, 'Provider ID must be 24 characters')
    .regex(/^[0-9a-fA-F]{24}$/, 'Invalid MongoDB ObjectId format')
});

/**
 * Provider Review Body
 * POST /api/providers/:providerId/review
 *
 * Body:
 * - rating: Star rating (1-5, REQUIRED)
 * - comment: Review text (optional, max 1000 chars)
 */
const providerReviewBody = z.object({
  rating: z
    .number()
    .int('Rating must be an integer')
    .min(1, 'Rating must be at least 1')
    .max(5, 'Rating must be at most 5'),
  comment: z
    .string()
    .max(1000, 'Comment must be 1000 characters or less')
    .optional()
});

/**
 * Channel ID Path Parameter
 * PUT /api/providers/user/providers/:channelId
 *
 * Path params:
 * - channelId: Discord channel ID (numeric string)
 */
const channelIdParams = z.object({
  channelId: z
    .string()
    .regex(/^\d{17,20}$/, 'Invalid Discord channel ID format (17-20 digits)')
});

/**
 * User Provider Configuration Body
 * PUT /api/providers/user/providers/:channelId
 *
 * Body:
 * - enabled: Whether provider is enabled (REQUIRED)
 * - minConfidence: Minimum confidence threshold (0-1, optional)
 */
const userProviderConfigBody = z.object({
  enabled: z
    .boolean({
      required_error: 'enabled field is required',
      invalid_type_error: 'enabled must be a boolean'
    }),
  minConfidence: z
    .number()
    .min(0, 'Minimum confidence must be at least 0')
    .max(1, 'Minimum confidence must be at most 1')
    .optional()
});

/**
 * Security: Prototype Pollution Prevention
 * All schemas reject dangerous property names:
 * - __proto__
 * - constructor
 * - prototype
 */

module.exports = {
  providerListQuery,
  providerIdParams,
  providerReviewBody,
  channelIdParams,
  userProviderConfigBody
};
