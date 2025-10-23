'use strict';

/**
 * Input Validation Middleware
 *
 * Provides Joi-based validation for:
 * - Request body
 * - Query parameters
 * - URL parameters
 *
 * Constitutional Principle I: Security-First - Input validation prevents injection attacks
 * FR-065-066: Input validation and sanitization
 */

const Joi = require('joi');
const { AppError, ErrorCodes } = require('./errorHandler');

/**
 * Custom Joi validators
 */
const customValidators = {
  // MongoDB ObjectId validator
  objectId: () =>
    Joi.string()
      .regex(/^[0-9a-fA-F]{24}$/)
      .message('Invalid ObjectId format'),

  // Discord snowflake ID validator (17-19 digits)
  discordId: () =>
    Joi.string()
      .regex(/^\d{17,19}$/)
      .message('Invalid Discord ID format'),

  // Stock symbol validator (1-5 uppercase letters)
  symbol: () =>
    Joi.string()
      .regex(/^[A-Z]{1,5}$/)
      .message('Invalid stock symbol format'),

  // Broker name validator
  broker: () => Joi.string().valid('alpaca', 'moomoo', 'ibkr', 'tradier', 'robinhood').message('Invalid broker'),

  // Trade action validator
  tradeAction: () => Joi.string().valid('BUY', 'SELL', 'SHORT', 'COVER').message('Invalid trade action'),

  // Order type validator
  orderType: () => Joi.string().valid('MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT').message('Invalid order type'),

  // Subscription tier validator
  subscriptionTier: () => Joi.string().valid('free', 'basic', 'pro', 'enterprise').message('Invalid subscription tier'),

  // Asset class validator
  assetClass: () => Joi.string().valid('US_EQUITY', 'CRYPTO', 'OPTION', 'FOREX').message('Invalid asset class'),

  // Time in force validator
  timeInForce: () => Joi.string().valid('DAY', 'GTC', 'IOC', 'FOK').message('Invalid time in force')
};

/**
 * Common validation schemas
 */
const schemas = {
  // User schemas
  userId: customValidators.objectId(),
  discordId: customValidators.discordId(),
  username: Joi.string()
    .min(2)
    .max(32)
    .pattern(/^[a-zA-Z0-9_]+$/),
  email: Joi.string().email(),

  // Trade schemas
  tradeId: customValidators.objectId(),
  symbol: customValidators.symbol(),
  broker: customValidators.broker(),
  action: customValidators.tradeAction(),
  orderType: customValidators.orderType(),
  quantity: Joi.number().positive().integer(),
  price: Joi.number().positive(),
  stopPrice: Joi.number().positive(),
  limitPrice: Joi.number().positive(),
  timeInForce: customValidators.timeInForce(),

  // Broker connection schemas
  brokerConnectionId: customValidators.objectId(),
  apiKey: Joi.string().min(10).max(256),
  apiSecret: Joi.string().min(10).max(256),
  accessToken: Joi.string().min(10).max(512),
  refreshToken: Joi.string().min(10).max(512),

  // Pagination schemas
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sortBy: Joi.string(),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),

  // Date range schemas
  startDate: Joi.date().iso(),
  endDate: Joi.date().iso().greater(Joi.ref('startDate')),

  // Subscription schemas
  subscriptionTier: customValidators.subscriptionTier(),

  // Risk management schemas
  maxPositionSize: Joi.number().positive(),
  maxDailyLoss: Joi.number().positive(),
  riskPerTrade: Joi.number().positive().max(100)
};

/**
 * Validate request data against Joi schema
 * @param {Object} schema - Joi schema
 * @param {string} property - Request property to validate (body, query, params)
 * @returns {Function} Express middleware
 */
function validate(schema, property = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false, // Return all errors, not just the first
      stripUnknown: true, // Remove unknown keys
      convert: true // Convert types (e.g., string to number)
    });

    if (error) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type
      }));

      throw new AppError('Validation failed', 400, ErrorCodes.VALIDATION_ERROR, details);
    }

    // Replace request data with validated and sanitized data
    req[property] = value;
    next();
  };
}

/**
 * Validation schemas for routes
 */
const validationSchemas = {
  // User routes
  createUser: Joi.object({
    discordId: schemas.discordId.required(),
    username: schemas.username.required(),
    email: schemas.email.required(),
    avatar: Joi.string().uri()
  }),

  updateUser: Joi.object({
    username: schemas.username,
    email: schemas.email,
    avatar: Joi.string().uri(),
    subscriptionTier: schemas.subscriptionTier
  }),

  // Trade routes
  executeTrade: Joi.object({
    symbol: schemas.symbol.required(),
    action: schemas.action.required(),
    quantity: schemas.quantity.required(),
    orderType: schemas.orderType.required(),
    price: Joi.when('orderType', {
      is: Joi.valid('LIMIT', 'STOP_LIMIT'),
      then: schemas.price.required(),
      otherwise: schemas.price
    }),
    stopPrice: Joi.when('orderType', {
      is: Joi.valid('STOP', 'STOP_LIMIT'),
      then: schemas.stopPrice.required(),
      otherwise: schemas.stopPrice
    }),
    timeInForce: schemas.timeInForce.default('DAY'),
    broker: schemas.broker.required()
  }),

  getTrades: Joi.object({
    page: schemas.page,
    limit: schemas.limit,
    symbol: schemas.symbol,
    broker: schemas.broker,
    status: Joi.string().valid('pending', 'executed', 'failed', 'cancelled'),
    startDate: schemas.startDate,
    endDate: schemas.endDate,
    sortBy: Joi.string().valid('createdAt', 'executedAt', 'symbol'),
    sortOrder: schemas.sortOrder
  }),

  // Broker connection routes
  connectBroker: Joi.object({
    broker: schemas.broker.required(),
    apiKey: schemas.apiKey.required(),
    apiSecret: schemas.apiSecret.required(),
    accountType: Joi.string().valid('live', 'paper').default('paper')
  }),

  updateBrokerConnection: Joi.object({
    apiKey: schemas.apiKey,
    apiSecret: schemas.apiSecret,
    isActive: Joi.boolean()
  }),

  // Position routes
  getPositions: Joi.object({
    page: schemas.page,
    limit: schemas.limit,
    broker: schemas.broker,
    symbol: schemas.symbol,
    assetClass: customValidators.assetClass()
  }),

  // Risk management routes
  updateRiskSettings: Joi.object({
    maxPositionSize: schemas.maxPositionSize,
    maxDailyLoss: schemas.maxDailyLoss,
    riskPerTrade: schemas.riskPerTrade,
    enableRiskChecks: Joi.boolean()
  }),

  // Analytics routes
  getAnalytics: Joi.object({
    startDate: schemas.startDate.required(),
    endDate: schemas.endDate.required(),
    broker: schemas.broker,
    groupBy: Joi.string().valid('day', 'week', 'month')
  }),

  // OAuth routes
  oauthCallback: Joi.object({
    code: Joi.string().required(),
    state: Joi.string().required()
  }),

  // Webhook routes (Discord)
  discordWebhook: Joi.object({
    content: Joi.string().max(2000),
    embeds: Joi.array().items(Joi.object()),
    allowed_mentions: Joi.object()
  }),

  // Subscription routes
  updateSubscription: Joi.object({
    tier: schemas.subscriptionTier.required()
  })
};

/**
 * Validate ObjectId parameter
 * @param {string} paramName - Parameter name
 * @returns {Function} Express middleware
 */
function validateObjectId(paramName = 'id') {
  return (req, res, next) => {
    const id = req.params[paramName];

    if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
      throw new AppError(`Invalid ${paramName} format`, 400, ErrorCodes.INVALID_INPUT, { field: paramName, value: id });
    }

    next();
  };
}

/**
 * Validate pagination parameters
 * @returns {Function} Express middleware
 */
function validatePagination() {
  return validate(
    Joi.object({
      page: schemas.page,
      limit: schemas.limit,
      sortBy: schemas.sortBy,
      sortOrder: schemas.sortOrder
    }),
    'query'
  );
}

/**
 * Validate date range parameters
 * @returns {Function} Express middleware
 */
function validateDateRange() {
  return validate(
    Joi.object({
      startDate: schemas.startDate.required(),
      endDate: schemas.endDate.required()
    }),
    'query'
  );
}

/**
 * Sanitize string input to prevent XSS
 * @param {string} input - User input
 * @returns {string} Sanitized input
 */
function sanitizeString(input) {
  if (typeof input !== 'string') {
    return input;
  }

  return input
    .replace(/[<>]/g, '') // Remove angle brackets
    .trim(); // Remove leading/trailing whitespace
}

/**
 * Sanitize all string fields in an object
 * @param {Object} obj - Object to sanitize
 * @returns {Object} Sanitized object
 */
function sanitizeObject(obj) {
  const sanitized = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

module.exports = {
  validate,
  validateObjectId,
  validatePagination,
  validateDateRange,
  schemas,
  validationSchemas,
  customValidators,
  sanitizeString,
  sanitizeObject
};
