/**
 * Retry Utility for Transient Failures
 *
 * Implements exponential backoff retry logic for operations that may
 * experience transient network failures. Only retries on specific
 * network error codes, never on client errors (4xx).
 *
 * Features:
 * - Exponential backoff: 1s, 2s, 4s, 8s
 * - Maximum 3 retry attempts
 * - Selective retry on network errors only
 * - Detailed logging of retry attempts
 *
 * Usage:
 *   const { retryWithBackoff } = require('./utils/retry');
 *
 *   const result = await retryWithBackoff(
 *     () => fetch('https://api.example.com'),
 *     { maxRetries: 3 }
 *   );
 */

const logger = require('./logger');

/**
 * Network error codes that should trigger retries
 * These indicate transient failures that may succeed on retry
 */
const RETRYABLE_ERROR_CODES = new Set([
  'ECONNRESET',    // Connection reset by peer
  'ETIMEDOUT',     // Operation timed out
  'ECONNREFUSED',  // Connection refused (service temporarily unavailable)
  'ENETUNREACH',   // Network unreachable
  'EHOSTUNREACH',  // Host unreachable
  'EAI_AGAIN',     // DNS lookup timed out
  'ENOTFOUND',     // DNS lookup failed
  'EPIPE'          // Broken pipe (connection closed unexpectedly)
]);

/**
 * HTTP status codes that should never be retried
 * 4xx errors indicate client errors that won't be fixed by retrying
 */
const NON_RETRYABLE_STATUS_CODES = new Set([
  400, // Bad Request
  401, // Unauthorized
  403, // Forbidden
  404, // Not Found
  405, // Method Not Allowed
  406, // Not Acceptable
  409, // Conflict
  410, // Gone
  422, // Unprocessable Entity
  429  // Too Many Requests (should use rate limiting instead)
]);

/**
 * Check if an error is retryable based on error code or HTTP status
 * @param {Error} error - The error to check
 * @returns {boolean} True if the error should be retried
 */
function isRetryableError(error) {
  // Check for network error codes
  if (error.code && RETRYABLE_ERROR_CODES.has(error.code)) {
    return true;
  }

  // Check for HTTP status codes
  if (error.response?.status) {
    const status = error.response.status;

    // Never retry 4xx errors
    if (NON_RETRYABLE_STATUS_CODES.has(status)) {
      return false;
    }

    // Retry 5xx errors (server errors) and 503 (Service Unavailable)
    if (status >= 500 && status < 600) {
      return true;
    }
  }

  // Check for HTTP status in error object (different API clients structure differently)
  if (error.status) {
    const status = error.status;
    if (NON_RETRYABLE_STATUS_CODES.has(status)) {
      return false;
    }
    if (status >= 500 && status < 600) {
      return true;
    }
  }

  // Check for specific error messages indicating transient failures
  const message = error.message?.toLowerCase() || '';
  if (message.includes('timeout') ||
      message.includes('network') ||
      message.includes('econnreset') ||
      message.includes('socket hang up')) {
    return true;
  }

  // Default: don't retry unknown errors
  return false;
}

/**
 * Calculate exponential backoff delay
 * @param {number} attemptNumber - Current attempt number (0-indexed)
 * @param {number} baseDelay - Base delay in milliseconds (default: 1000ms)
 * @returns {number} Delay in milliseconds
 */
function calculateBackoff(attemptNumber, baseDelay = 1000) {
  // Exponential: 1s, 2s, 4s, 8s
  return baseDelay * Math.pow(2, attemptNumber);
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry an async operation with exponential backoff
 * @param {Function} operation - Async function to retry
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retry attempts (default: 3)
 * @param {number} options.baseDelay - Base delay in milliseconds (default: 1000)
 * @param {Function} options.shouldRetry - Custom function to determine if error is retryable
 * @param {Object} options.context - Additional context for logging
 * @returns {Promise<any>} Result of the operation
 * @throws {Error} Last error if all retries are exhausted
 */
async function retryWithBackoff(operation, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    shouldRetry = isRetryableError,
    context = {}
  } = options;

  let lastError;
  const startTime = Date.now();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();

      // Log successful retry if this wasn't the first attempt
      if (attempt > 0) {
        logger.info('[Retry] Operation succeeded after retries', {
          attempt,
          totalAttempts: attempt + 1,
          elapsedMs: Date.now() - startTime,
          ...context
        });
      }

      return result;
    } catch (error) {
      lastError = error;

      // Check if we should retry this error
      const canRetry = shouldRetry(error);
      const hasRetriesLeft = attempt < maxRetries;

      if (!canRetry) {
        logger.warn('[Retry] Error is not retryable, failing immediately', {
          error: error.message,
          errorCode: error.code,
          status: error.response?.status || error.status,
          attempt,
          ...context
        });
        throw error;
      }

      if (!hasRetriesLeft) {
        logger.error('[Retry] Max retries exhausted, operation failed', {
          error: error.message,
          errorCode: error.code,
          status: error.response?.status || error.status,
          totalAttempts: attempt + 1,
          elapsedMs: Date.now() - startTime,
          ...context
        });
        throw error;
      }

      // Calculate backoff delay
      const delay = calculateBackoff(attempt, baseDelay);

      logger.warn('[Retry] Operation failed, retrying with backoff', {
        error: error.message,
        errorCode: error.code,
        status: error.response?.status || error.status,
        attempt: attempt + 1,
        maxRetries,
        nextRetryInMs: delay,
        ...context
      });

      // Wait before next retry
      await sleep(delay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError;
}

/**
 * Retry an async operation with simple retry (no backoff)
 * Useful for operations that need immediate retry without delay
 * @param {Function} operation - Async function to retry
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retry attempts (default: 3)
 * @param {Function} options.shouldRetry - Custom function to determine if error is retryable
 * @param {Object} options.context - Additional context for logging
 * @returns {Promise<any>} Result of the operation
 * @throws {Error} Last error if all retries are exhausted
 */
async function retryImmediate(operation, options = {}) {
  return retryWithBackoff(operation, { ...options, baseDelay: 0 });
}

module.exports = {
  retryWithBackoff,
  retryImmediate,
  isRetryableError,
  calculateBackoff,
  RETRYABLE_ERROR_CODES,
  NON_RETRYABLE_STATUS_CODES
};
