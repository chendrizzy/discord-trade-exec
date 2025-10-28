/**
 * Analytics Route Validators
 * US7-T02: Validation schemas for analytics API endpoints
 *
 * Endpoints covered:
 * - Revenue analytics (MRR, ARR, LTV)
 * - Churn analysis and risk prediction
 * - Cohort retention analysis
 * - Performance metrics and optimization
 * - Database slow query analysis
 */

const { z } = require('zod');

/**
 * Date Range Query Parameters
 * Used by multiple analytics endpoints
 *
 * Query params:
 * - startDate: ISO 8601 date string (optional)
 * - endDate: ISO 8601 date string (optional)
 */
const dateRangeQuery = z.object({
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)?$/, 'Invalid date format. Use ISO 8601 (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ)')
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)?$/, 'Invalid date format. Use ISO 8601 (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ)')
    .optional()
}).refine(
  data => {
    if (data.startDate && data.endDate) {
      return new Date(data.startDate) <= new Date(data.endDate);
    }
    return true;
  },
  { message: 'startDate must be before or equal to endDate' }
);

/**
 * Revenue Analytics Query Parameters
 * GET /api/analytics/revenue
 */
const revenueQuery = dateRangeQuery;

/**
 * Churn Analytics Query Parameters (REQUIRED dates)
 * GET /api/analytics/churn
 *
 * Query params:
 * - startDate: Start of analysis period (REQUIRED)
 * - endDate: End of analysis period (REQUIRED)
 */
const churnQuery = z.object({
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)?$/, 'Invalid date format. Use ISO 8601'),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)?$/, 'Invalid date format. Use ISO 8601')
}).refine(
  data => new Date(data.startDate) <= new Date(data.endDate),
  { message: 'startDate must be before or equal to endDate' }
);

/**
 * Churn Risk Listing Query Parameters
 * GET /api/analytics/churn-risks
 *
 * Query params:
 * - minRiskLevel: Minimum risk score (0-1)
 * - limit: Maximum results to return
 */
const churnRisksQuery = z.object({
  minRiskLevel: z
    .string()
    .regex(/^\d*\.?\d+$/, 'Risk level must be a number')
    .transform(Number)
    .refine(n => n >= 0 && n <= 1, 'Risk level must be between 0 and 1')
    .optional(),
  limit: z
    .string()
    .regex(/^\d+$/, 'Limit must be a positive integer')
    .transform(Number)
    .refine(n => n >= 1 && n <= 500, 'Limit must be between 1 and 500')
    .optional()
});

/**
 * Churn Risk Calculate Body
 * POST /api/analytics/churn-risk/calculate
 *
 * Body:
 * - userId: MongoDB ObjectId of user to analyze (REQUIRED)
 */
const churnRiskCalculateBody = z.object({
  userId: z
    .string()
    .length(24, 'User ID must be 24 characters')
    .regex(/^[0-9a-fA-F]{24}$/, 'Invalid MongoDB ObjectId format')
});

/**
 * Cohort Retention Query Parameters
 * GET /api/analytics/cohorts/retention
 *
 * Query params:
 * - startDate: Cohort analysis start date
 * - endDate: Cohort analysis end date
 * - period: Grouping period (day, week, month)
 * - metric: Metric to analyze (retention, revenue, engagement)
 */
const cohortRetentionQuery = z.object({
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)?$/, 'Invalid date format. Use ISO 8601')
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)?$/, 'Invalid date format. Use ISO 8601')
    .optional(),
  period: z
    .enum(['day', 'week', 'month'], {
      errorMap: () => ({ message: 'Invalid period. Must be: day, week, or month' })
    })
    .optional(),
  metric: z
    .enum(['retention', 'revenue', 'engagement'], {
      errorMap: () => ({ message: 'Invalid metric. Must be: retention, revenue, or engagement' })
    })
    .optional()
}).refine(
  data => {
    if (data.startDate && data.endDate) {
      return new Date(data.startDate) <= new Date(data.endDate);
    }
    return true;
  },
  { message: 'startDate must be before or equal to endDate' }
);

/**
 * Cohort Detail Path Parameters
 * GET /api/analytics/cohorts/:cohortId
 *
 * Path params:
 * - cohortId: MongoDB ObjectId
 */
const cohortDetailParams = z.object({
  cohortId: z
    .string()
    .length(24, 'Cohort ID must be 24 characters')
    .regex(/^[0-9a-fA-F]{24}$/, 'Invalid MongoDB ObjectId format')
});

/**
 * Cohort Compare Body
 * POST /api/analytics/cohorts/compare
 *
 * Body:
 * - cohortIds: Array of cohort IDs to compare (REQUIRED, 2-10 cohorts)
 */
const cohortCompareBody = z.object({
  cohortIds: z
    .array(
      z.string()
        .length(24, 'Each cohort ID must be 24 characters')
        .regex(/^[0-9a-fA-F]{24}$/, 'Invalid MongoDB ObjectId format')
    )
    .min(2, 'Must compare at least 2 cohorts')
    .max(10, 'Cannot compare more than 10 cohorts')
});

/**
 * Metrics Export Query Parameters
 * GET /api/analytics/metrics
 *
 * Query params:
 * - format: Export format (json, csv, prometheus)
 */
const metricsExportQuery = z.object({
  format: z
    .enum(['json', 'csv', 'prometheus'], {
      errorMap: () => ({ message: 'Invalid format. Must be: json, csv, or prometheus' })
    })
    .optional()
});

/**
 * Slow Queries Query Parameters
 * GET /api/analytics/metrics/slow-queries
 *
 * Query params:
 * - severity: Filter by severity level (low, medium, high, critical)
 */
const slowQueriesQuery = z.object({
  severity: z
    .enum(['low', 'medium', 'high', 'critical'], {
      errorMap: () => ({ message: 'Invalid severity. Must be: low, medium, high, or critical' })
    })
    .optional()
});

/**
 * Alerts Query Parameters
 * GET /api/analytics/alerts
 *
 * Query params:
 * - limit: Maximum alerts to return
 * - severity: Filter by severity level
 */
const alertsQuery = z.object({
  limit: z
    .string()
    .regex(/^\d+$/, 'Limit must be a positive integer')
    .transform(Number)
    .refine(n => n >= 1 && n <= 1000, 'Limit must be between 1 and 1000')
    .optional(),
  severity: z
    .enum(['low', 'medium', 'high', 'critical'], {
      errorMap: () => ({ message: 'Invalid severity. Must be: low, medium, high, or critical' })
    })
    .optional()
});

/**
 * Query Patterns Query Parameters
 * GET /api/analytics/query-patterns
 *
 * Query params:
 * - limit: Maximum patterns to return
 * - type: Pattern type filter (slow, frequent, complex)
 */
const queryPatternsQuery = z.object({
  limit: z
    .string()
    .regex(/^\d+$/, 'Limit must be a positive integer')
    .transform(Number)
    .refine(n => n >= 1 && n <= 500, 'Limit must be between 1 and 500')
    .optional(),
  type: z
    .enum(['slow', 'frequent', 'complex'], {
      errorMap: () => ({ message: 'Invalid type. Must be: slow, frequent, or complex' })
    })
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
  revenueQuery,
  churnQuery,
  churnRisksQuery,
  churnRiskCalculateBody,
  cohortRetentionQuery,
  cohortDetailParams,
  cohortCompareBody,
  metricsExportQuery,
  slowQueriesQuery,
  alertsQuery,
  queryPatternsQuery
};
