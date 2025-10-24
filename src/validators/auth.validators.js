/**
 * Auth Routes Validation Schemas
 *
 * US7-T02: Security Validation Completeness
 * Zod schemas for all authentication and MFA endpoints
 */

const { z } = require('zod');

/**
 * Broker OAuth Authorization
 * GET /api/auth/broker/:broker/authorize
 */
const brokerAuthorizeParams = z.object({
  broker: z.enum(['alpaca', 'ibkr', 'tdameritrade', 'etrade', 'schwab', 'moomoo'], {
    errorMap: () => ({ message: 'Invalid broker. Supported: alpaca, ibkr, tdameritrade, etrade, schwab, moomoo' })
  })
});

/**
 * OAuth Callback (GET)
 * GET /api/auth/callback
 */
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
 * OAuth Callback (POST)
 * POST /api/auth/callback
 */
const oauthCallbackBody = z.object({
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
  broker: z.enum(['alpaca', 'ibkr', 'tdameritrade', 'etrade', 'schwab', 'moomoo']).optional()
});

/**
 * Delete Broker OAuth
 * DELETE /api/auth/brokers/:broker/oauth
 */
const deleteBrokerOAuthParams = z.object({
  broker: z.enum(['alpaca', 'ibkr', 'tdameritrade', 'etrade', 'schwab', 'moomoo'], {
    errorMap: () => ({ message: 'Invalid broker name' })
  })
});

/**
 * Refresh Broker OAuth Token
 * POST /api/auth/brokers/:broker/oauth/refresh
 */
const refreshBrokerOAuthParams = z.object({
  broker: z.enum(['alpaca', 'ibkr', 'tdameritrade', 'etrade', 'schwab', 'moomoo'], {
    errorMap: () => ({ message: 'Invalid broker name' })
  })
});

/**
 * MFA Enable
 * POST /api/auth/mfa/enable
 */
const mfaEnableBody = z.object({
  token: z
    .string()
    .length(6, 'TOTP token must be 6 digits')
    .regex(/^\d{6}$/, 'TOTP token must be numeric')
});

/**
 * MFA Disable
 * POST /api/auth/mfa/disable
 */
const mfaDisableBody = z.object({
  token: z
    .string()
    .length(6, 'TOTP token must be 6 digits')
    .regex(/^\d{6}$/, 'TOTP token must be numeric')
});

/**
 * MFA Verify
 * POST /api/auth/mfa/verify
 */
const mfaVerifyBody = z.object({
  token: z
    .string()
    .min(6, 'Token required')
    .max(100, 'Token too long')
    .refine(
      val => {
        // Accept either 6-digit TOTP or backup code (24 chars hex)
        return /^\d{6}$/.test(val) || /^[a-f0-9]{24}$/i.test(val);
      },
      {
        message: 'Token must be 6-digit TOTP or 24-character backup code'
      }
    )
});

/**
 * Security: Prototype Pollution Prevention
 *
 * Automatically applied by sanitizeObject in validation middleware,
 * but explicitly documented here for security audit purposes.
 *
 * Rejected keys:
 * - __proto__
 * - constructor
 * - prototype
 * - Any key starting with '__' or '$'
 */

module.exports = {
  brokerAuthorizeParams,
  oauthCallbackQuery,
  oauthCallbackBody,
  deleteBrokerOAuthParams,
  refreshBrokerOAuthParams,
  mfaEnableBody,
  mfaDisableBody,
  mfaVerifyBody
};
