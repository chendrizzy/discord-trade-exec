/**
 * Promise timeout utility to prevent unhandled promise rejections
 * and ensure operations complete within reasonable timeframes
 */

/**
 * Wraps a promise with a timeout
 * @param {Promise} promise - Promise to wrap
 * @param {number} timeoutMs - Timeout in milliseconds (default: 30000)
 * @param {string} operationName - Name of operation for error messages
 * @returns {Promise} - Promise that rejects if timeout is exceeded
 */
function withTimeout(promise, timeoutMs = 30000, operationName = 'Operation') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${operationName} timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

/**
 * Wraps a promise with timeout and provides a fallback on error
 * @param {Promise} promise - Promise to wrap
 * @param {any} fallbackValue - Value to return on timeout or error
 * @param {number} timeoutMs - Timeout in milliseconds (default: 30000)
 * @param {string} operationName - Name of operation for error messages
 * @returns {Promise} - Promise that resolves to result or fallback value
 */
async function withTimeoutAndFallback(promise, fallbackValue, timeoutMs = 30000, operationName = 'Operation') {
  try {
    return await withTimeout(promise, timeoutMs, operationName);
  } catch (error) {
    console.error(`[PromiseTimeout] ${operationName} failed:`, error.message);
    return fallbackValue;
  }
}

module.exports = {
  withTimeout,
  withTimeoutAndFallback
};
