/**
 * Standardized API Response Utilities
 * Provides consistent response format across all API endpoints
 */

/**
 * Standard success response
 * @param {object} res - Express response object
 * @param {any} data - Response data
 * @param {string} message - Optional success message
 * @param {number} statusCode - HTTP status code (default: 200)
 */
function sendSuccess(res, data = null, message = null, statusCode = 200) {
  const response = {
    success: true
  };

  if (data !== null) {
    response.data = data;
  }

  if (message) {
    response.message = message;
  }

  return res.status(statusCode).json(response);
}

/**
 * Standard error response
 * @param {object} res - Express response object
 * @param {string} error - Error message
 * @param {number} statusCode - HTTP status code (default: 500)
 * @param {object} details - Optional error details
 */
function sendError(res, error, statusCode = 500, details = null) {
  const response = {
    success: false,
    error: error
  };

  if (details) {
    response.details = details;
  }

  // Log server errors (5xx)
  if (statusCode >= 500) {
    console.error(`[API Error ${statusCode}]:`, error, details || '');
  }

  return res.status(statusCode).json(response);
}

/**
 * Validation error response (400)
 * @param {object} res - Express response object
 * @param {string} error - Error message
 * @param {array|object} validationErrors - Validation error details
 */
function sendValidationError(res, error, validationErrors = null) {
  return sendError(res, error, 400, validationErrors ? { validationErrors } : null);
}

/**
 * Not found error response (404)
 * @param {object} res - Express response object
 * @param {string} resource - Resource that was not found
 */
function sendNotFound(res, resource = 'Resource') {
  return sendError(res, `${resource} not found`, 404);
}

/**
 * Unauthorized error response (401)
 * @param {object} res - Express response object
 * @param {string} message - Optional custom message
 */
function sendUnauthorized(res, message = 'Authentication required') {
  return sendError(res, message, 401);
}

/**
 * Forbidden error response (403)
 * @param {object} res - Express response object
 * @param {string} message - Optional custom message
 */
function sendForbidden(res, message = 'Access forbidden') {
  return sendError(res, message, 403);
}

module.exports = {
  sendSuccess,
  sendError,
  sendValidationError,
  sendNotFound,
  sendUnauthorized,
  sendForbidden
};
