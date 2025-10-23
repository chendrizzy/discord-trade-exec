'use strict';

/**
 * Winston Logger Configuration
 *
 * Provides structured JSON logging for:
 * - Application events
 * - API requests/responses
 * - Error tracking
 * - Audit trail
 *
 * Constitutional Principle II: Graceful Error Handling
 * FR-061-062: Comprehensive logging and monitoring
 */

const winston = require('winston');
const path = require('path');
const { getConfig } = require('../config/env');

const config = getConfig();

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// Define log colors for console output
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue'
};

winston.addColors(colors);

// Custom format for development (readable)
const devFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    info =>
      `${info.timestamp} [${info.level}]: ${info.message}${info.metadata ? ' ' + JSON.stringify(info.metadata) : ''}`
  )
);

// Custom format for production (JSON)
const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp', 'label'] }),
  winston.format.json()
);

// Create transports based on environment
const transports = [];

// Console transport (always enabled)
transports.push(
  new winston.transports.Console({
    format: config.isProduction ? prodFormat : devFormat
  })
);

// File transports (production only)
if (config.isProduction) {
  // Error log file
  transports.push(
    new winston.transports.File({
      filename: path.join('logs', 'error.log'),
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 10,
      format: prodFormat
    })
  );

  // Combined log file
  transports.push(
    new winston.transports.File({
      filename: path.join('logs', 'combined.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 10,
      format: prodFormat
    })
  );
}

// Create the logger instance
const logger = winston.createLogger({
  level: config.isProduction ? 'info' : 'debug',
  levels,
  transports,
  exitOnError: false // Don't exit on handled exceptions
});

/**
 * Log HTTP request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {number} responseTime - Response time in ms
 */
function logHttpRequest(req, res, responseTime) {
  const logData = {
    method: req.method,
    url: req.originalUrl || req.url,
    statusCode: res.statusCode,
    responseTime: `${responseTime}ms`,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent')
  };

  // Add user info if authenticated
  if (req.user) {
    logData.userId = req.user.userId || req.user._id;
    logData.username = req.user.username;
  }

  // Log level based on status code
  if (res.statusCode >= 500) {
    logger.error('HTTP Request', logData);
  } else if (res.statusCode >= 400) {
    logger.warn('HTTP Request', logData);
  } else {
    logger.http('HTTP Request', logData);
  }
}

/**
 * Log trade execution
 * @param {Object} trade - Trade data
 * @param {string} status - Trade status (pending, executed, failed)
 */
function logTrade(trade, status) {
  logger.info('Trade Execution', {
    tradeId: trade._id || trade.id,
    userId: trade.userId,
    broker: trade.broker,
    symbol: trade.symbol,
    action: trade.action,
    quantity: trade.quantity,
    status,
    timestamp: new Date().toISOString()
  });
}

/**
 * Log audit event
 * @param {Object} auditData - Audit log data
 */
function logAudit(auditData) {
  logger.info('Audit Event', {
    userId: auditData.userId,
    action: auditData.action,
    resource: auditData.resource,
    resourceId: auditData.resourceId,
    ipAddress: auditData.ipAddress,
    timestamp: new Date().toISOString()
  });
}

/**
 * Log broker API call
 * @param {string} broker - Broker name
 * @param {string} operation - API operation
 * @param {Object} metadata - Additional metadata
 */
function logBrokerAPI(broker, operation, metadata = {}) {
  logger.debug('Broker API Call', {
    broker,
    operation,
    ...metadata,
    timestamp: new Date().toISOString()
  });
}

/**
 * Log security event
 * @param {string} event - Security event type
 * @param {Object} metadata - Event metadata
 */
function logSecurityEvent(event, metadata = {}) {
  logger.warn('Security Event', {
    event,
    ...metadata,
    timestamp: new Date().toISOString()
  });
}

/**
 * Log database operation
 * @param {string} operation - Database operation
 * @param {string} collection - Collection name
 * @param {Object} metadata - Additional metadata
 */
function logDatabaseOperation(operation, collection, metadata = {}) {
  logger.debug('Database Operation', {
    operation,
    collection,
    ...metadata,
    timestamp: new Date().toISOString()
  });
}

/**
 * Log WebSocket event
 * @param {string} event - WebSocket event type
 * @param {Object} metadata - Event metadata
 */
function logWebSocketEvent(event, metadata = {}) {
  logger.debug('WebSocket Event', {
    event,
    ...metadata,
    timestamp: new Date().toISOString()
  });
}

/**
 * Log billing event
 * @param {string} event - Billing event type
 * @param {Object} metadata - Event metadata
 */
function logBillingEvent(event, metadata = {}) {
  logger.info('Billing Event', {
    event,
    ...metadata,
    timestamp: new Date().toISOString()
  });
}

/**
 * Express middleware for HTTP request logging
 */
function httpLoggerMiddleware(req, res, next) {
  const startTime = Date.now();

  // Log request
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    logHttpRequest(req, res, responseTime);
  });

  next();
}

/**
 * Log error with stack trace
 * @param {Error} error - Error object
 * @param {Object} metadata - Additional context
 */
function logError(error, metadata = {}) {
  logger.error(error.message, {
    stack: error.stack,
    ...metadata,
    timestamp: new Date().toISOString()
  });
}

/**
 * Create child logger with default metadata
 * @param {Object} defaultMetadata - Default metadata for all logs
 * @returns {Object} Child logger instance
 */
function createChildLogger(defaultMetadata) {
  return logger.child(defaultMetadata);
}

// Export logger and utility functions
module.exports = {
  logger,
  logHttpRequest,
  logTrade,
  logAudit,
  logBrokerAPI,
  logSecurityEvent,
  logDatabaseOperation,
  logWebSocketEvent,
  logBillingEvent,
  logError,
  httpLoggerMiddleware,
  createChildLogger
};
