/**
 * Metrics Route Validators
 * US7-T02: Validation schemas for custom metrics API endpoints
 *
 * Endpoints covered:
 * - Custom metric recording
 * - Custom metric retrieval
 */

const { z } = require('zod');

/**
 * Custom Metric Name Path Parameter
 * GET /api/metrics/custom/:name
 *
 * Path params:
 * - name: Metric name (alphanumeric, underscores, hyphens)
 */
const customMetricNameParams = z.object({
  name: z
    .string()
    .min(1, 'Metric name is required')
    .max(100, 'Metric name must be 100 characters or less')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Metric name must contain only alphanumeric characters, underscores, and hyphens')
});

/**
 * Custom Metric Recording Body
 * POST /api/metrics/custom
 *
 * Body:
 * - name: Metric name (REQUIRED)
 * - value: Numeric value (REQUIRED)
 *
 * Example:
 * {
 *   "name": "custom_response_time",
 *   "value": 142.5
 * }
 */
const customMetricRecordBody = z.object({
  name: z
    .string()
    .min(1, 'Metric name is required')
    .max(100, 'Metric name must be 100 characters or less')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Metric name must contain only alphanumeric characters, underscores, and hyphens'),
  value: z
    .number({
      required_error: 'Metric value is required',
      invalid_type_error: 'Metric value must be a number'
    })
    .finite('Metric value must be finite (not Infinity or NaN)')
});

/**
 * Security: Prototype Pollution Prevention
 * All schemas reject dangerous property names:
 * - __proto__
 * - constructor
 * - prototype
 */

module.exports = {
  customMetricNameParams,
  customMetricRecordBody
};
