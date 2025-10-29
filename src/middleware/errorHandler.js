'use strict';

/**
 * Global Error Handler Middleware
 *
 * Provides centralized error handling with:
 * - Sanitized error messages for production
 * - Detailed error info for development
 * - Integration with Sentry
 * - Standardized error responses
 *
 * Constitutional Principle II: Graceful Error Handling
 * FR-063-064: Error handling and recovery
 */

const logger = require('../utils/logger');
const { getConfig, isProduction } = require('../config/env');
const errorNotificationService = require('../services/ErrorNotificationService');
const { ErrorCodes } = require('../constants/ErrorCodes');

/**
 * Custom application error class
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = ErrorCodes.INTERNAL_SERVER_ERROR, details = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true; // Distinguishes operational errors from programming errors

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Create standardized error response
 * @param {Error} error - Error object
 * @param {boolean} includeStack - Include stack trace
 * @returns {Object} Standardized error response
 */
function createErrorResponse(error, includeStack = false) {
  const response = {
    success: false,
    error: error.message,
    code: error.code || ErrorCodes.INTERNAL_SERVER_ERROR
  };

  // Add timestamp
  response.timestamp = new Date().toISOString();

  // Add details if available
  if (error.details) {
    response.details = error.details;
  }

  // Add stack trace in development
  if (includeStack && error.stack) {
    response.stack = error.stack;
  }

  return response;
}

/**
 * Sanitize error message for production
 * @param {Error} error - Error object
 * @returns {string} Sanitized message
 */
function sanitizeErrorMessage(error) {
  // Don't expose internal error details in production
  // Use isProduction() function for runtime check instead of cached config
  if (isProduction() && !error.isOperational) {
    return 'An unexpected error occurred. Please try again later.';
  }

  return error.message;
}

/**
 * Determine HTTP status code from error
 * @param {Error} error - Error object
 * @returns {number} HTTP status code
 */
function getStatusCode(error) {
  // Use statusCode if available
  if (error.statusCode) {
    return error.statusCode;
  }

  // Map common error names to status codes
  if (error.name === 'ValidationError') {
    return 400;
  } else if (error.name === 'UnauthorizedError' || error.name === 'JsonWebTokenError') {
    return 401;
  } else if (error.name === 'ForbiddenError') {
    return 403;
  } else if (error.name === 'NotFoundError') {
    return 404;
  } else if (error.name === 'ConflictError') {
    return 409;
  } else if (error.name === 'TooManyRequestsError') {
    return 429;
  }

  // Default to 500 for unknown errors
  return 500;
}

/**
 * Handle Mongoose validation errors
 * @param {Error} error - Mongoose validation error
 * @returns {AppError} Formatted application error
 */
function handleMongooseValidationError(error) {
  const errors = Object.values(error.errors).map(err => ({
    field: err.path,
    message: err.message
  }));

  return new AppError('Validation failed', 400, ErrorCodes.VALIDATION_ERROR, errors);
}

/**
 * Handle MongoDB duplicate key errors
 * @param {Error} error - MongoDB error
 * @returns {AppError} Formatted application error
 */
function handleMongoDuplicateKeyError(error) {
  const field = Object.keys(error.keyValue)[0];
  const value = error.keyValue[field];

  return new AppError(`Resource with ${field} '${value}' already exists`, 409, ErrorCodes.DUPLICATE_RESOURCE, {
    field,
    value
  });
}

/**
 * Handle MongoDB cast errors
 * @param {Error} error - MongoDB cast error
 * @returns {AppError} Formatted application error
 */
function handleMongoCastError(error) {
  return new AppError(`Invalid value for field '${error.path}'`, 400, ErrorCodes.INVALID_INPUT, {
    field: error.path,
    value: error.value
  });
}

/**
 * Handle JWT errors
 * @param {Error} error - JWT error
 * @returns {AppError} Formatted application error
 */
function handleJWTError(error) {
  if (error.name === 'TokenExpiredError') {
    return new AppError('Token has expired', 401, ErrorCodes.TOKEN_EXPIRED);
  } else if (error.name === 'JsonWebTokenError') {
    return new AppError('Invalid token', 401, ErrorCodes.INVALID_TOKEN);
  }

  return new AppError('Authentication failed', 401, ErrorCodes.UNAUTHORIZED);
}

/**
 * Convert error to AppError
 * @param {Error} error - Original error
 * @returns {AppError} Application error
 */
function normalizeError(error) {
  // Already an AppError
  if (error instanceof AppError) {
    return error;
  }

  // Mongoose validation error
  if (error.name === 'ValidationError' && error.errors) {
    return handleMongooseValidationError(error);
  }

  // MongoDB duplicate key error
  if (error.code === 11000) {
    return handleMongoDuplicateKeyError(error);
  }

  // MongoDB cast error
  if (error.name === 'CastError') {
    return handleMongoCastError(error);
  }

  // JWT errors
  if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
    return handleJWTError(error);
  }

  // Generic error - wrap in AppError
  // Mark as non-operational so production sanitizes the message
  const appError = new AppError(
    error.message || 'An error occurred',
    getStatusCode(error),
    error.code || ErrorCodes.INTERNAL_SERVER_ERROR
  );
  appError.isOperational = false; // Generic errors are not operational (programming errors)
  return appError;
}

/**
 * Global error handler middleware
 * @param {Error} err - Error object
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
function errorHandler(err, req, res, next) {
  // Normalize error
  const appError = normalizeError(err);

  // Sanitize message for production
  appError.message = sanitizeErrorMessage(appError);

  // Get correlation ID from AsyncLocalStorage or request
  const correlationId = logger.getCorrelationId() || req.correlationId;

  // Prepare error data for logging and notifications
  const errorData = {
    correlationId,
    error: err.message,
    errorCode: appError.code,
    statusCode: appError.statusCode,
    path: req.path,
    method: req.method,
    userId: req.user?.userId,
    communityId: req.user?.communityId,
    // NEVER log full stack traces to prevent information leakage
    // Stack is captured by Winston transport for file logs only
    stackPreview: err.stack ? err.stack.split('\n').slice(0, 3).join('\n') : undefined
  };

  // Log error with correlation ID and sanitized context
  logger.error('Request error', errorData);

  // Send Discord notification for critical errors (async, non-blocking)
  errorNotificationService.notify(errorData).catch(notifyError => {
    // Silently fail - don't let notification errors affect response
    logger.debug('Discord notification failed', { error: notifyError.message });
  });

  // Send error response (never include stack in response, even in dev)
  res.status(appError.statusCode).json(createErrorResponse(appError, false));
}

/**
 * Handle 404 Not Found errors
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
function notFoundHandler(req, res, next) {
  const error = new AppError(`Route ${req.method} ${req.path} not found`, 404, ErrorCodes.NOT_FOUND);

  next(error);
}

/**
 * Async error wrapper for route handlers
 * @param {Function} fn - Async route handler
 * @returns {Function} Wrapped handler
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Handle unhandled promise rejections
 */
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection detected', {
    error: reason?.message || String(reason),
    stack: reason?.stack,
    type: 'UnhandledRejection'
  });

  // Send Discord notification (async, non-blocking)
  errorNotificationService.notifyUnhandledRejection(reason, promise).catch(err => {
    logger.debug('Discord notification failed for unhandled rejection', { error: err.message });
  });

  // Send to Sentry if configured
  const config = getConfig();
  if (config.SENTRY_DSN) {
    // Sentry.captureException(reason);
  }
});

/**
 * Handle uncaught exceptions
 */
process.on('uncaughtException', error => {
  logger.error('Uncaught exception - process will exit', {
    error: error.message,
    stack: error.stack,
    type: 'UncaughtException'
  });

  // Send Discord notification (must complete before exit)
  errorNotificationService
    .notifyUncaughtException(error)
    .catch(err => {
      logger.debug('Discord notification failed for uncaught exception', { error: err.message });
    })
    .finally(() => {
      // Send to Sentry if configured
      const config = getConfig();
      if (config.SENTRY_DSN) {
        // Sentry.captureException(error);
      }

      // Exit process - let PM2/Docker restart
      setTimeout(() => process.exit(1), 100); // Small delay to ensure notification completes
    });
});

module.exports = {
  AppError,
  ErrorCodes,
  errorHandler,
  notFoundHandler,
  asyncHandler,
  createErrorResponse,
  normalizeError
};
