'use strict';

/**
 * Correlation ID Middleware
 * Generates and stores unique correlation IDs for each HTTP request
 * Enables request tracking across distributed systems and log aggregation
 *
 * Constitutional Compliance:
 * - Principle VI (Observability): Request tracking for debugging
 * - Principle VII (Error Handling): Error context preservation
 */

const logger = require('../utils/logger');

/**
 * Express middleware to generate correlation IDs
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
function correlationMiddleware(req, res, next) {
  // Check if correlation ID provided by client (X-Correlation-ID header)
  // Otherwise generate new UUID
  let correlationId = req.headers?.['x-correlation-id'];

  if (!correlationId || typeof correlationId !== 'string' || correlationId.length === 0) {
    correlationId = logger.getCorrelationId(); // Generates UUID v4
  }

  // Store correlation ID in async local storage for this request context
  logger.asyncLocalStorage.run({ correlationId }, () => {
    // Add correlation ID to request object for easy access
    req.correlationId = correlationId;

    // Include correlation ID in response headers
    res.setHeader('X-Correlation-ID', correlationId);

    // Continue to next middleware
    next();
  });
}

module.exports = correlationMiddleware;
