/**
 * Broker OAuth Routes Validation Schemas
 *
 * US7-T02: Security Validation Completeness
 * Zod schemas for broker OAuth callback handling endpoints
 */

const { z } = require('zod');

/**
 * Initiate OAuth Flow
 * GET /api/broker-oauth/initiate/:brokerKey
 */
const initiateOAuthParams = z.object({
  brokerKey: z.enum(['alpaca', 'ibkr', 'tdameritrade', 'etrade', 'schwab', 'moomoo'], {
    errorMap: () => ({ message: 'Invalid broker. Supported: alpaca, ibkr, tdameritrade, etrade, schwab, moomoo' })
  })
});

/**
 * OAuth Callback Handler
 * GET /api/broker-oauth/callback/:brokerKey
 */
const oauthCallbackParams = z.object({
  brokerKey: z.enum(['alpaca', 'ibkr', 'tdameritrade', 'etrade', 'schwab', 'moomoo'])
});

const oauthCallbackQuery = z.object({
  code: z
    .string()
    .min(10, 'Authorization code required')
    .max(512, 'Authorization code too long')
    .regex(/^[a-zA-Z0-9\-_=+/]+$/, 'Authorization code contains invalid characters'),
  state: z
    .string()
    .min(16, 'State parameter required')
    .max(256, 'State parameter too long')
    .regex(/^[a-zA-Z0-9\-_]+$/, 'State contains invalid characters'),
  error: z.string().optional(),
  error_description: z.string().optional()
});

/**
 * Disconnect Broker OAuth
 * POST /api/broker-oauth/disconnect/:brokerKey
 */
const disconnectOAuthParams = z.object({
  brokerKey: z.enum(['alpaca', 'ibkr', 'tdameritrade', 'etrade', 'schwab', 'moomoo'])
});

module.exports = {
  initiateOAuthParams,
  oauthCallbackParams,
  oauthCallbackQuery,
  disconnectOAuthParams
};
