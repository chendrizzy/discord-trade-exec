'use strict';

/**
 * Comprehensive Error Codes Enum
 *
 * Constitutional Principle II: Graceful Error Handling
 * FR-063-064: Error handling and recovery
 *
 * Maps error codes to HTTP status codes and user-friendly messages
 */

/**
 * Error code structure:
 * {
 *   code: 'ERROR_CODE_NAME',
 *   statusCode: 400,
 *   message: 'User-friendly error message'
 * }
 */

const ErrorCodeDefinitions = {
  // ============================================================================
  // AUTHENTICATION & AUTHORIZATION ERRORS (40x)
  // ============================================================================

  UNAUTHORIZED: {
    code: 'UNAUTHORIZED',
    statusCode: 401,
    message: 'Authentication required. Please log in to continue.'
  },

  INVALID_CREDENTIALS: {
    code: 'INVALID_CREDENTIALS',
    statusCode: 401,
    message: 'Invalid username or password. Please try again.'
  },

  INVALID_TOKEN: {
    code: 'INVALID_TOKEN',
    statusCode: 401,
    message: 'Invalid authentication token. Please log in again.'
  },

  TOKEN_EXPIRED: {
    code: 'TOKEN_EXPIRED',
    statusCode: 401,
    message: 'Your session has expired. Please log in again.'
  },

  TOKEN_REVOKED: {
    code: 'TOKEN_REVOKED',
    statusCode: 401,
    message: 'Your authentication token has been revoked. Please log in again.'
  },

  FORBIDDEN: {
    code: 'FORBIDDEN',
    statusCode: 403,
    message: 'You do not have permission to access this resource.'
  },

  INSUFFICIENT_PERMISSIONS: {
    code: 'INSUFFICIENT_PERMISSIONS',
    statusCode: 403,
    message: 'You do not have sufficient permissions for this action.'
  },

  ACCOUNT_SUSPENDED: {
    code: 'ACCOUNT_SUSPENDED',
    statusCode: 403,
    message: 'Your account has been suspended. Please contact support.'
  },

  ACCOUNT_LOCKED: {
    code: 'ACCOUNT_LOCKED',
    statusCode: 403,
    message: 'Your account has been locked due to multiple failed login attempts.'
  },

  MFA_REQUIRED: {
    code: 'MFA_REQUIRED',
    statusCode: 401,
    message: 'Multi-factor authentication is required to continue.'
  },

  MFA_INVALID: {
    code: 'MFA_INVALID',
    statusCode: 401,
    message: 'Invalid MFA code. Please try again.'
  },

  SESSION_EXPIRED: {
    code: 'SESSION_EXPIRED',
    statusCode: 401,
    message: 'Your session has expired. Please log in again.'
  },

  // ============================================================================
  // VALIDATION ERRORS (40x)
  // ============================================================================

  VALIDATION_ERROR: {
    code: 'VALIDATION_ERROR',
    statusCode: 400,
    message: 'Validation failed. Please check your input and try again.'
  },

  INVALID_INPUT: {
    code: 'INVALID_INPUT',
    statusCode: 400,
    message: 'Invalid input provided. Please check your data and try again.'
  },

  MISSING_REQUIRED_FIELD: {
    code: 'MISSING_REQUIRED_FIELD',
    statusCode: 400,
    message: 'Required field is missing. Please provide all required information.'
  },

  INVALID_FORMAT: {
    code: 'INVALID_FORMAT',
    statusCode: 400,
    message: 'Invalid data format. Please check your input format.'
  },

  INVALID_EMAIL: {
    code: 'INVALID_EMAIL',
    statusCode: 400,
    message: 'Invalid email address format.'
  },

  INVALID_PHONE: {
    code: 'INVALID_PHONE',
    statusCode: 400,
    message: 'Invalid phone number format.'
  },

  INVALID_DATE: {
    code: 'INVALID_DATE',
    statusCode: 400,
    message: 'Invalid date format or value.'
  },

  INVALID_AMOUNT: {
    code: 'INVALID_AMOUNT',
    statusCode: 400,
    message: 'Invalid amount. Please provide a valid numeric value.'
  },

  AMOUNT_TOO_LOW: {
    code: 'AMOUNT_TOO_LOW',
    statusCode: 400,
    message: 'Amount is below the minimum required value.'
  },

  AMOUNT_TOO_HIGH: {
    code: 'AMOUNT_TOO_HIGH',
    statusCode: 400,
    message: 'Amount exceeds the maximum allowed value.'
  },

  INVALID_SYMBOL: {
    code: 'INVALID_SYMBOL',
    statusCode: 400,
    message: 'Invalid trading symbol format. Expected format: BASE/QUOTE (e.g., BTC/USDT).'
  },

  PROTOTYPE_POLLUTION_DETECTED: {
    code: 'PROTOTYPE_POLLUTION_DETECTED',
    statusCode: 400,
    message: 'Security validation failed. Dangerous properties detected in request.'
  },

  // ============================================================================
  // RESOURCE ERRORS (40x)
  // ============================================================================

  NOT_FOUND: {
    code: 'NOT_FOUND',
    statusCode: 404,
    message: 'The requested resource was not found.'
  },

  RESOURCE_NOT_FOUND: {
    code: 'RESOURCE_NOT_FOUND',
    statusCode: 404,
    message: 'The requested resource does not exist.'
  },

  USER_NOT_FOUND: {
    code: 'USER_NOT_FOUND',
    statusCode: 404,
    message: 'User not found.'
  },

  TRADE_NOT_FOUND: {
    code: 'TRADE_NOT_FOUND',
    statusCode: 404,
    message: 'Trade not found.'
  },

  ORDER_NOT_FOUND: {
    code: 'ORDER_NOT_FOUND',
    statusCode: 404,
    message: 'Order not found.'
  },

  DUPLICATE_RESOURCE: {
    code: 'DUPLICATE_RESOURCE',
    statusCode: 409,
    message: 'A resource with this identifier already exists.'
  },

  DUPLICATE_EMAIL: {
    code: 'DUPLICATE_EMAIL',
    statusCode: 409,
    message: 'An account with this email address already exists.'
  },

  DUPLICATE_USERNAME: {
    code: 'DUPLICATE_USERNAME',
    statusCode: 409,
    message: 'This username is already taken.'
  },

  RESOURCE_CONFLICT: {
    code: 'RESOURCE_CONFLICT',
    statusCode: 409,
    message: 'The request conflicts with the current state of the resource.'
  },

  RESOURCE_LOCKED: {
    code: 'RESOURCE_LOCKED',
    statusCode: 423,
    message: 'The resource is currently locked and cannot be modified.'
  },

  // ============================================================================
  // RATE LIMITING (429)
  // ============================================================================

  RATE_LIMIT_EXCEEDED: {
    code: 'RATE_LIMIT_EXCEEDED',
    statusCode: 429,
    message: 'Too many requests. Please slow down and try again later.'
  },

  API_RATE_LIMIT_EXCEEDED: {
    code: 'API_RATE_LIMIT_EXCEEDED',
    statusCode: 429,
    message: 'API rate limit exceeded. Please wait before making more requests.'
  },

  TRADE_RATE_LIMIT_EXCEEDED: {
    code: 'TRADE_RATE_LIMIT_EXCEEDED',
    statusCode: 429,
    message: 'Trade execution rate limit exceeded. Please wait before placing more orders.'
  },

  // ============================================================================
  // BROKER & TRADING ERRORS (50x, 40x)
  // ============================================================================

  BROKER_ERROR: {
    code: 'BROKER_ERROR',
    statusCode: 502,
    message: 'Broker service error. Please try again later.'
  },

  BROKER_CONNECTION_FAILED: {
    code: 'BROKER_CONNECTION_FAILED',
    statusCode: 503,
    message: 'Unable to connect to broker. Please try again later.'
  },

  BROKER_AUTH_FAILED: {
    code: 'BROKER_AUTH_FAILED',
    statusCode: 401,
    message: 'Broker authentication failed. Please check your API credentials.'
  },

  BROKER_TIMEOUT: {
    code: 'BROKER_TIMEOUT',
    statusCode: 504,
    message: 'Broker request timed out. Please try again.'
  },

  INSUFFICIENT_FUNDS: {
    code: 'INSUFFICIENT_FUNDS',
    statusCode: 400,
    message: 'Insufficient funds to complete this trade.'
  },

  INSUFFICIENT_BALANCE: {
    code: 'INSUFFICIENT_BALANCE',
    statusCode: 400,
    message: 'Account balance is insufficient for this transaction.'
  },

  MARKET_CLOSED: {
    code: 'MARKET_CLOSED',
    statusCode: 400,
    message: 'The market is currently closed. Trading is not available.'
  },

  SYMBOL_NOT_SUPPORTED: {
    code: 'SYMBOL_NOT_SUPPORTED',
    statusCode: 400,
    message: 'This trading symbol is not supported on the selected broker.'
  },

  ORDER_REJECTED: {
    code: 'ORDER_REJECTED',
    statusCode: 400,
    message: 'Your order was rejected by the broker. Please check order details.'
  },

  POSITION_SIZE_EXCEEDED: {
    code: 'POSITION_SIZE_EXCEEDED',
    statusCode: 400,
    message: 'Order size exceeds maximum allowed position size.'
  },

  RISK_LIMIT_EXCEEDED: {
    code: 'RISK_LIMIT_EXCEEDED',
    statusCode: 400,
    message: 'This trade would exceed your risk management limits.'
  },

  INVALID_ORDER_TYPE: {
    code: 'INVALID_ORDER_TYPE',
    statusCode: 400,
    message: 'Invalid order type for this broker or symbol.'
  },

  // ============================================================================
  // DATABASE ERRORS (50x)
  // ============================================================================

  DATABASE_ERROR: {
    code: 'DATABASE_ERROR',
    statusCode: 500,
    message: 'A database error occurred. Please try again later.'
  },

  DATABASE_CONNECTION_FAILED: {
    code: 'DATABASE_CONNECTION_FAILED',
    statusCode: 503,
    message: 'Unable to connect to database. Please try again later.'
  },

  DATABASE_TIMEOUT: {
    code: 'DATABASE_TIMEOUT',
    statusCode: 504,
    message: 'Database operation timed out. Please try again.'
  },

  DATABASE_CONSTRAINT_VIOLATION: {
    code: 'DATABASE_CONSTRAINT_VIOLATION',
    statusCode: 400,
    message: 'Data constraint violation. Please check your input.'
  },

  // ============================================================================
  // EXTERNAL SERVICE ERRORS (50x)
  // ============================================================================

  EXTERNAL_SERVICE_ERROR: {
    code: 'EXTERNAL_SERVICE_ERROR',
    statusCode: 502,
    message: 'External service error. Please try again later.'
  },

  DISCORD_API_ERROR: {
    code: 'DISCORD_API_ERROR',
    statusCode: 502,
    message: 'Discord API error. Please try again later.'
  },

  DISCORD_WEBHOOK_FAILED: {
    code: 'DISCORD_WEBHOOK_FAILED',
    statusCode: 502,
    message: 'Failed to send Discord notification. Please check webhook configuration.'
  },

  POLAR_API_ERROR: {
    code: 'POLAR_API_ERROR',
    statusCode: 502,
    message: 'Polar API error. Please try again later.'
  },

  WEBHOOK_DELIVERY_FAILED: {
    code: 'WEBHOOK_DELIVERY_FAILED',
    statusCode: 502,
    message: 'Failed to deliver webhook. The destination server may be unavailable.'
  },

  PAYMENT_GATEWAY_ERROR: {
    code: 'PAYMENT_GATEWAY_ERROR',
    statusCode: 502,
    message: 'Payment gateway error. Please try again or use a different payment method.'
  },

  // ============================================================================
  // BILLING & SUBSCRIPTION ERRORS (40x, 50x)
  // ============================================================================

  BILLING_PAYMENT_FAILED: {
    code: 'BILLING_PAYMENT_FAILED',
    statusCode: 402,
    message: 'Payment failed. Please check your payment method and try again.'
  },

  SUBSCRIPTION_REQUIRED: {
    code: 'SUBSCRIPTION_REQUIRED',
    statusCode: 402,
    message: 'An active subscription is required to access this feature.'
  },

  SUBSCRIPTION_EXPIRED: {
    code: 'SUBSCRIPTION_EXPIRED',
    statusCode: 402,
    message: 'Your subscription has expired. Please renew to continue.'
  },

  SUBSCRIPTION_CANCELLED: {
    code: 'SUBSCRIPTION_CANCELLED',
    statusCode: 403,
    message: 'Your subscription has been cancelled.'
  },

  PLAN_LIMIT_EXCEEDED: {
    code: 'PLAN_LIMIT_EXCEEDED',
    statusCode: 403,
    message: 'You have exceeded your plan limits. Please upgrade to continue.'
  },

  INVOICE_NOT_FOUND: {
    code: 'INVOICE_NOT_FOUND',
    statusCode: 404,
    message: 'Invoice not found.'
  },

  // ============================================================================
  // SERVER ERRORS (50x)
  // ============================================================================

  INTERNAL_SERVER_ERROR: {
    code: 'INTERNAL_SERVER_ERROR',
    statusCode: 500,
    message: 'An unexpected error occurred. Please try again later.'
  },

  SERVICE_UNAVAILABLE: {
    code: 'SERVICE_UNAVAILABLE',
    statusCode: 503,
    message: 'Service temporarily unavailable. Please try again later.'
  },

  GATEWAY_TIMEOUT: {
    code: 'GATEWAY_TIMEOUT',
    statusCode: 504,
    message: 'Gateway timeout. The server took too long to respond.'
  },

  CONFIGURATION_ERROR: {
    code: 'CONFIGURATION_ERROR',
    statusCode: 500,
    message: 'Server configuration error. Please contact support.'
  },

  FEATURE_NOT_IMPLEMENTED: {
    code: 'FEATURE_NOT_IMPLEMENTED',
    statusCode: 501,
    message: 'This feature is not yet implemented.'
  },

  MAINTENANCE_MODE: {
    code: 'MAINTENANCE_MODE',
    statusCode: 503,
    message: 'Service is currently under maintenance. Please check back later.'
  }
};

/**
 * Error code constants for easy access
 * Use these constants throughout the application instead of magic strings
 */
const ErrorCodes = Object.keys(ErrorCodeDefinitions).reduce((acc, key) => {
  acc[key] = key;
  return acc;
}, {});

/**
 * Get error definition by code
 * @param {string} code - Error code
 * @returns {Object|null} Error definition with statusCode and message
 */
function getErrorDefinition(code) {
  return ErrorCodeDefinitions[code] || null;
}

/**
 * Get HTTP status code for error code
 * @param {string} code - Error code
 * @returns {number} HTTP status code (defaults to 500 if not found)
 */
function getStatusCode(code) {
  const definition = ErrorCodeDefinitions[code];
  return definition ? definition.statusCode : 500;
}

/**
 * Get user-friendly message for error code
 * @param {string} code - Error code
 * @returns {string} User-friendly error message
 */
function getMessage(code) {
  const definition = ErrorCodeDefinitions[code];
  return definition ? definition.message : 'An unexpected error occurred.';
}

/**
 * Check if error code exists
 * @param {string} code - Error code to check
 * @returns {boolean} True if error code exists
 */
function isValidErrorCode(code) {
  return ErrorCodeDefinitions.hasOwnProperty(code);
}

/**
 * Get all error codes grouped by category
 * @returns {Object} Error codes grouped by category
 */
function getErrorCodesByCategory() {
  return {
    authentication: [
      'UNAUTHORIZED',
      'INVALID_CREDENTIALS',
      'INVALID_TOKEN',
      'TOKEN_EXPIRED',
      'TOKEN_REVOKED',
      'MFA_REQUIRED',
      'MFA_INVALID',
      'SESSION_EXPIRED'
    ],
    authorization: [
      'FORBIDDEN',
      'INSUFFICIENT_PERMISSIONS',
      'ACCOUNT_SUSPENDED',
      'ACCOUNT_LOCKED'
    ],
    validation: [
      'VALIDATION_ERROR',
      'INVALID_INPUT',
      'MISSING_REQUIRED_FIELD',
      'INVALID_FORMAT',
      'INVALID_EMAIL',
      'INVALID_PHONE',
      'INVALID_DATE',
      'INVALID_AMOUNT',
      'AMOUNT_TOO_LOW',
      'AMOUNT_TOO_HIGH',
      'INVALID_SYMBOL',
      'PROTOTYPE_POLLUTION_DETECTED'
    ],
    resources: [
      'NOT_FOUND',
      'RESOURCE_NOT_FOUND',
      'USER_NOT_FOUND',
      'TRADE_NOT_FOUND',
      'ORDER_NOT_FOUND',
      'DUPLICATE_RESOURCE',
      'DUPLICATE_EMAIL',
      'DUPLICATE_USERNAME',
      'RESOURCE_CONFLICT',
      'RESOURCE_LOCKED'
    ],
    rateLimiting: [
      'RATE_LIMIT_EXCEEDED',
      'API_RATE_LIMIT_EXCEEDED',
      'TRADE_RATE_LIMIT_EXCEEDED'
    ],
    broker: [
      'BROKER_ERROR',
      'BROKER_CONNECTION_FAILED',
      'BROKER_AUTH_FAILED',
      'BROKER_TIMEOUT',
      'INSUFFICIENT_FUNDS',
      'INSUFFICIENT_BALANCE',
      'MARKET_CLOSED',
      'SYMBOL_NOT_SUPPORTED',
      'ORDER_REJECTED',
      'POSITION_SIZE_EXCEEDED',
      'RISK_LIMIT_EXCEEDED',
      'INVALID_ORDER_TYPE'
    ],
    database: [
      'DATABASE_ERROR',
      'DATABASE_CONNECTION_FAILED',
      'DATABASE_TIMEOUT',
      'DATABASE_CONSTRAINT_VIOLATION'
    ],
    externalServices: [
      'EXTERNAL_SERVICE_ERROR',
      'DISCORD_API_ERROR',
      'DISCORD_WEBHOOK_FAILED',
      'POLAR_API_ERROR',
      'WEBHOOK_DELIVERY_FAILED',
      'PAYMENT_GATEWAY_ERROR'
    ],
    billing: [
      'BILLING_PAYMENT_FAILED',
      'SUBSCRIPTION_REQUIRED',
      'SUBSCRIPTION_EXPIRED',
      'SUBSCRIPTION_CANCELLED',
      'PLAN_LIMIT_EXCEEDED',
      'INVOICE_NOT_FOUND'
    ],
    server: [
      'INTERNAL_SERVER_ERROR',
      'SERVICE_UNAVAILABLE',
      'GATEWAY_TIMEOUT',
      'CONFIGURATION_ERROR',
      'FEATURE_NOT_IMPLEMENTED',
      'MAINTENANCE_MODE'
    ]
  };
}

module.exports = {
  ErrorCodes,
  ErrorCodeDefinitions,
  getErrorDefinition,
  getStatusCode,
  getMessage,
  isValidErrorCode,
  getErrorCodesByCategory
};
