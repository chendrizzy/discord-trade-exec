'use strict';

/**
 * Production-Grade Winston Logger
 * Replaces placeholder console.log-based logger with structured logging
 * Features:
 * - JSON formatted logs with timestamps
 * - Correlation IDs for request tracking
 * - Sensitive data sanitization
 * - Async logging (non-blocking)
 * - File rotation (100MB max, 30 days retention)
 * - Environment-based log levels
 */

const winston = require('winston');
const { AsyncLocalStorage } = require('async_hooks');
const crypto = require('crypto');
const path = require('path');
const sanitizer = require('./log-sanitizer');

/**
 * Generate UUID v4 using crypto module (no external dependency)
 * @returns {string} UUID v4
 */
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = crypto.randomBytes(1)[0] % 16;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Async local storage for correlation IDs
const asyncLocalStorage = new AsyncLocalStorage();

// Determine log level based on environment
const logLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';

// Create logs directory if it doesn't exist
const fs = require('fs');
const logger = require('../utils/logger');
const logger = require('../utils/logger');
const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Custom format to include correlation ID and sanitize data
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(info => {
    // Get correlation ID from async context or generate new one
    const store = asyncLocalStorage.getStore();
    const correlationId = store?.correlationId || uuidv4();

    // Separate winston metadata from user metadata
    const { timestamp, level, message, stack, ...metadata } = info;

    // Sanitize sensitive data in metadata
    const sanitized = sanitizer.sanitize(metadata);

    // Build log entry
    const logEntry = {
      timestamp,
      level,
      message,
      correlationId,
      ...sanitized
    };

    // Include stack trace for errors
    if (stack) {
      logEntry.stack = stack;
    }

    return JSON.stringify(logEntry);
  })
);

// Create Winston logger instance
const logger = winston.createLogger({
  level: logLevel,
  format: customFormat,
  transports: [
    // Console transport (for development)
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
      silent: process.env.NODE_ENV === 'test' && !process.env.DEBUG_LOGS
    }),

    // File transport (all logs)
    new winston.transports.File({
      filename: path.join(logDir, 'app.log'),
      maxsize: 100 * 1024 * 1024, // 100MB
      maxFiles: 30, // Keep 30 days
      tailable: true
    }),

    // File transport (errors only)
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 100 * 1024 * 1024,
      maxFiles: 30,
      tailable: true
    })
  ],

  // Exit on error: false to prevent process exit on logging errors
  exitOnError: false
});

/**
 * Run code with correlation context
 * @param {string} correlationId - Correlation ID for request tracking
 * @param {Function} fn - Function to execute within correlation context
 * @returns {*} Result of fn()
 */
logger.withCorrelation = (correlationId, fn) => {
  return asyncLocalStorage.run({ correlationId }, fn);
};

/**
 * Get current correlation ID from async context
 * @returns {string} Correlation ID (generates new UUID if not in context)
 */
logger.getCorrelationId = () => {
  const store = asyncLocalStorage.getStore();
  return store?.correlationId || uuidv4();
};

/**
 * Set correlation ID in current async context
 * @param {string} correlationId - Correlation ID to set
 */
logger.setCorrelationId = correlationId => {
  const store = asyncLocalStorage.getStore();
  if (store) {
    store.correlationId = correlationId;
  }
};

// Export AsyncLocalStorage for middleware usage
logger.asyncLocalStorage = asyncLocalStorage;

module.exports = logger;
