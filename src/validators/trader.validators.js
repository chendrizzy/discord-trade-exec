/**
 * Trader Routes Validation Schemas
 *
 * US7-T02: Security Validation Completeness
 * Zod schemas for trader dashboard and operations endpoints
 */

const { z } = require('zod');

/**
 * Follow Signal
 * POST /api/trader/signals/:id/follow
 */
const followSignalParams = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid signal ID format')
});

const followSignalBody = z.object({
  autoTrade: z.boolean().optional().default(false),
  positionSizePercent: z.number().min(0.1).max(100).optional().default(5),
  maxRiskPercent: z.number().min(0.1).max(100).optional().default(2),
  stopLossPercent: z.number().min(0.1).max(100).optional(),
  takeProfitPercent: z.number().min(0.1).max(1000).optional()
});

/**
 * Get Trader Overview
 * GET /api/trader/overview
 */
const overviewQuery = z.object({
  timeframe: z.enum(['24h', '7d', '30d', '90d', 'ytd', 'all']).optional().default('30d')
});

/**
 * Get Signals
 * GET /api/trader/signals
 */
const signalsQuery = z.object({
  status: z.enum(['active', 'closed', 'pending', 'all']).optional().default('active'),
  provider: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  sortBy: z.enum(['createdAt', 'profitLoss', 'winRate']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc')
});

/**
 * Get Trades
 * GET /api/trader/trades
 */
const tradesQuery = z.object({
  status: z.enum(['open', 'closed', 'pending', 'cancelled', 'all']).optional().default('all'),
  symbol: z.string().optional(),
  broker: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0)
});

/**
 * Get Analytics Performance
 * GET /api/trader/analytics/performance
 */
const analyticsPerformanceQuery = z.object({
  timeframe: z.enum(['24h', '7d', '30d', '90d', 'ytd', 'all']).optional().default('30d'),
  groupBy: z.enum(['day', 'week', 'month']).optional().default('day'),
  broker: z.string().optional(),
  symbol: z.string().optional()
});

/**
 * Update Risk Profile
 * PUT /api/trader/risk-profile
 */
const updateRiskProfileBody = z.object({
  maxPositionSize: z.number().min(1).max(1000000).optional(),
  maxDailyLoss: z.number().min(1).max(1000000).optional(),
  maxDrawdown: z.number().min(0.1).max(100).optional(),
  riskPerTrade: z.number().min(0.1).max(100).optional(),
  maxOpenPositions: z.coerce.number().int().min(1).max(100).optional(),
  stopLossPercent: z.number().min(0.1).max(100).optional(),
  takeProfitPercent: z.number().min(0.1).max(1000).optional(),
  useTrailingStop: z.boolean().optional(),
  trailingStopPercent: z.number().min(0.1).max(100).optional()
});

/**
 * Update Notification Settings
 * PUT /api/trader/notifications
 */
const updateNotificationsBody = z.object({
  email: z
    .object({
      enabled: z.boolean(),
      tradeExecuted: z.boolean().optional(),
      riskAlert: z.boolean().optional(),
      dailySummary: z.boolean().optional()
    })
    .optional(),
  discord: z
    .object({
      enabled: z.boolean(),
      webhookUrl: z.string().url().optional(),
      tradeExecuted: z.boolean().optional(),
      riskAlert: z.boolean().optional()
    })
    .optional(),
  push: z
    .object({
      enabled: z.boolean(),
      tradeExecuted: z.boolean().optional(),
      riskAlert: z.boolean().optional()
    })
    .optional()
});

module.exports = {
  followSignalParams,
  followSignalBody,
  overviewQuery,
  signalsQuery,
  tradesQuery,
  analyticsPerformanceQuery,
  updateRiskProfileBody,
  updateNotificationsBody
};
