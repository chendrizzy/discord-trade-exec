'use strict';

/**
 * Request Logging Middleware
 * Logs all HTTP requests and responses with correlation IDs
 * Excludes sensitive headers and includes performance metrics
 *
 * Constitutional Compliance:
 * - Principle I (Security-First): Redacts sensitive headers
 * - Principle VI (Observability): Request/response tracking
 */

const logger = require('../utils/logger');

/**
 * Sensitive headers to exclude from logs
 * These headers may contain credentials or session tokens
 */
const SENSITIVE_HEADERS = ['authorization', 'cookie', 'x-api-key', 'x-auth-token', 'x-session-id', 'set-cookie'];

/**
 * Check if header should be excluded from logs
 * @param {string} headerName - Header name
 * @returns {boolean} True if header is sensitive
 */
function isSensitiveHeader(headerName) {
  const lowerName = headerName.toLowerCase();
  return SENSITIVE_HEADERS.some(sensitive => lowerName.includes(sensitive));
}

/**
 * Sanitize request headers (remove sensitive ones)
 * @param {Object} headers - Request headers object
 * @returns {Object} Sanitized headers
 */
function sanitizeHeaders(headers) {
  const sanitized = {};

  for (const [key, value] of Object.entries(headers || {})) {
    if (isSensitiveHeader(key)) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Express middleware to log HTTP requests and responses
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
function requestLoggingMiddleware(req, res, next) {
  const startTime = Date.now();

  // Log incoming request
  logger.info('HTTP Request', {
    method: req.method,
    path: req.path,
    query: req.query || {},
    headers: sanitizeHeaders(req.headers || {}),
    ip: req.ip,
    userAgent: req.get ? req.get('user-agent') : undefined
  });

  // Intercept res.json and res.send to log response
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  res.json = function (body) {
    logResponse(body);
    return originalJson(body);
  };

  res.send = function (body) {
    logResponse(body);
    return originalSend(body);
  };

  /**
   * Log HTTP response with duration
   * @param {*} body - Response body
   */
  function logResponse(body) {
    const duration = Date.now() - startTime;
    const contentLength = Buffer.byteLength(JSON.stringify(body || ''), 'utf8');

    logger.info('HTTP Response', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      contentLength
    });

    // Restore original methods to avoid double logging
    res.json = originalJson;
    res.send = originalSend;
  }

  // Handle cases where response ends without json/send
  res.on('finish', () => {
    // Only log if we haven't already (json/send not called)
    if (res.json === originalJson && res.send === originalSend) {
      return; // Already logged
    }

    const duration = Date.now() - startTime;

    logger.info('HTTP Response', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration
    });
  });

  next();
}

module.exports = requestLoggingMiddleware;
module.exports.sanitizeHeaders = sanitizeHeaders; // Export for testing
module.exports.isSensitiveHeader = isSensitiveHeader; // Export for testing
