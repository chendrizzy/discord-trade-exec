/**
 * Exchanges Routes Validation Schemas
 *
 * US7-T02: Security Validation Completeness
 * Zod schemas for crypto exchange integration endpoints
 */

const { z } = require('zod');

/**
 * Create Exchange Connection
 * POST /api/exchanges
 */
const createExchangeBody = z.object({
  exchange: z.enum(['binance', 'coinbase', 'kraken', 'bybit', 'okx', 'bitfinex', 'huobi', 'kucoin', 'gate', 'gemini']),
  apiKey: z.string().min(10).max(512).regex(/^[a-zA-Z0-9\-_=+/]+$/, 'API key contains invalid characters'),
  apiSecret: z.string().min(10).max(512).regex(/^[a-zA-Z0-9\-_=+/]+$/, 'API secret contains invalid characters'),
  testnet: z.boolean().optional().default(false),
  nickname: z.string().min(1).max(100).optional()
});

/**
 * Delete Exchange Connection
 * DELETE /api/exchanges/:id
 */
const deleteExchangeParams = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid exchange ID format')
});

/**
 * Validate Exchange Connection
 * POST /api/exchanges/:id/validate
 */
const validateExchangeParams = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid exchange ID format')
});

/**
 * Toggle Exchange Active Status
 * PATCH /api/exchanges/:id/toggle
 */
const toggleExchangeParams = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid exchange ID format')
});

/**
 * Invalidate Exchange Cache
 * POST /api/exchanges/cache-invalidate
 */
const cacheInvalidateBody = z.object({
  exchange: z.enum(['binance', 'coinbase', 'kraken', 'bybit', 'okx', 'bitfinex', 'huobi', 'kucoin', 'gate', 'gemini']).optional(),
  symbol: z.string().regex(/^[A-Z0-9]{2,10}\/[A-Z0-9]{2,10}$/).optional()
});

/**
 * Compare Exchange Fees
 * GET /api/exchanges/compare-fees
 */
const compareFeesQuery = z.object({
  exchanges: z
    .string()
    .transform(str => str.split(','))
    .pipe(
      z
        .array(z.enum(['binance', 'coinbase', 'kraken', 'bybit', 'okx', 'bitfinex', 'huobi', 'kucoin', 'gate', 'gemini']))
        .min(2, 'Must compare at least 2 exchanges')
        .max(5, 'Cannot compare more than 5 exchanges')
    ),
  symbol: z.string().regex(/^[A-Z0-9]{2,10}\/[A-Z0-9]{2,10}$/, 'Invalid symbol format').optional()
});

module.exports = {
  createExchangeBody,
  deleteExchangeParams,
  validateExchangeParams,
  toggleExchangeParams,
  cacheInvalidateBody,
  compareFeesQuery
};
