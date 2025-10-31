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

// ============================================================================
// CONSTANTS
// ============================================================================

// HTTP Status Codes
const HTTP_STATUS = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500
};

// Error name to status code mappings
const ERROR_NAME_TO_STATUS = {
  'ValidationError': HTTP_STATUS.BAD_REQUEST,
  'UnauthorizedError': HTTP_STATUS.UNAUTHORIZED,
  'JsonWebTokenError': HTTP_STATUS.UNAUTHORIZED,
  'ForbiddenError': HTTP_STATUS.FORBIDDEN,
  'NotFoundError': HTTP_STATUS.NOT_FOUND,
  'ConflictError': HTTP_STATUS.CONFLICT,
  'TooManyRequestsError': HTTP_STATUS.TOO_MANY_REQUESTS
};

// MongoDB error codes
const MONGO_DUPLICATE_KEY_ERROR = 11000;

// Stack trace configuration
const STACK_TRACE_PREVIEW_LINES = 3;

// Process exit delay (ms) to ensure notifications complete
const PROCESS_EXIT_DELAY_MS = 100;

/**
 * Custom application error class
 */
class AppError extends Error {
  constructor(
    message,
    statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR,
    code = ErrorCodes.INTERNAL_SERVER_ERROR,
    details = null
  ) {
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
    errorCode: error.code || ErrorCodes.INTERNAL_SERVER_ERROR
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
  return ERROR_NAME_TO_STATUS[error.name] || HTTP_STATUS.INTERNAL_SERVER_ERROR;
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

  return new AppError('Validation failed', HTTP_STATUS.BAD_REQUEST, ErrorCodes.VALIDATION_ERROR, errors);
}

/**
 * Handle MongoDB duplicate key errors
 * @param {Error} error - MongoDB error
 * @returns {AppError} Formatted application error
 */
function handleMongoDuplicateKeyError(error) {
  const field = Object.keys(error.keyValue)[0];
  const value = error.keyValue[field];

  return new AppError(`Resource with ${field} '${value}' already exists`, HTTP_STATUS.CONFLICT, ErrorCodes.DUPLICATE_RESOURCE, {
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
  return new AppError(`Invalid value for field '${error.path}'`, HTTP_STATUS.BAD_REQUEST, ErrorCodes.INVALID_INPUT, {
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
    return new AppError('Token has expired', HTTP_STATUS.UNAUTHORIZED, ErrorCodes.TOKEN_EXPIRED);
  } else if (error.name === 'JsonWebTokenError') {
    return new AppError('Invalid token', HTTP_STATUS.UNAUTHORIZED, ErrorCodes.INVALID_TOKEN);
  }

  return new AppError('Authentication failed', HTTP_STATUS.UNAUTHORIZED, ErrorCodes.UNAUTHORIZED);
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
  if (error.code === MONGO_DUPLICATE_KEY_ERROR) {
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
    stackPreview: err.stack ? err.stack.split('\n').slice(0, STACK_TRACE_PREVIEW_LINES).join('\n') : undefined
  };

  // Log error with correlation ID and sanitized context
  logger.error('Request error', errorData);

  // Send Discord notification for critical errors (async, non-blocking)
  errorNotificationService.notify(errorData).catch(notifyError => {
    // Log notification failures at error level - critical errors not being reported
    logger.error('Discord notification failed - critical errors not being reported', {
      error: notifyError.message,
      stack: notifyError.stack,
      originalError: errorData.errorCode,
      correlationId: errorData.correlationId,
      errorId: 'NOTIFICATION_DELIVERY_FAILED'
    });
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
  const error = new AppError(`Route ${req.method} ${req.path} not found`, HTTP_STATUS.NOT_FOUND, ErrorCodes.NOT_FOUND);

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
    logger.error('Discord notification failed for unhandled rejection - critical errors not being reported', {
      error: err.message,
      stack: err.stack,
      errorId: 'NOTIFICATION_DELIVERY_FAILED_UNHANDLED_REJECTION'
    });
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
      logger.error('Discord notification failed for uncaught exception - critical errors not being reported', {
        error: err.message,
        stack: err.stack,
        errorId: 'NOTIFICATION_DELIVERY_FAILED_UNCAUGHT_EXCEPTION'
      });
    })
    .finally(() => {
      // Send to Sentry if configured
      const config = getConfig();
      if (config.SENTRY_DSN) {
        // Sentry.captureException(error);
      }

      // Exit process - let PM2/Docker restart
      setTimeout(() => process.exit(1), PROCESS_EXIT_DELAY_MS); // Small delay to ensure notification completes
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
