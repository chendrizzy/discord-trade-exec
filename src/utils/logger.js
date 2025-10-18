/**
 * Simple logger utility
 * Wraps console methods for centralized logging
 * Future enhancements: Winston, log levels, file output, etc.
 */

const logger = {
  /**
   * Log info message
   * @param {string} message - Log message
   * @param {Object} meta - Optional metadata
   */
  info: (message, meta) => {
    if (meta) {
      console.log(`[INFO] ${message}`, meta);
    } else {
      console.log(`[INFO] ${message}`);
    }
  },

  /**
   * Log warning message
   * @param {string} message - Log message
   * @param {Object} meta - Optional metadata
   */
  warn: (message, meta) => {
    if (meta) {
      console.warn(`[WARN] ${message}`, meta);
    } else {
      console.warn(`[WARN] ${message}`);
    }
  },

  /**
   * Log error message
   * @param {string} message - Log message
   * @param {Error|Object} error - Error object or metadata
   */
  error: (message, error) => {
    if (error) {
      console.error(`[ERROR] ${message}`, error);
    } else {
      console.error(`[ERROR] ${message}`);
    }
  },

  /**
   * Log debug message (only in development)
   * @param {string} message - Log message
   * @param {Object} meta - Optional metadata
   */
  debug: (message, meta) => {
    if (process.env.NODE_ENV !== 'production') {
      if (meta) {
        console.debug(`[DEBUG] ${message}`, meta);
      } else {
        console.debug(`[DEBUG] ${message}`);
      }
    }
  }
};

module.exports = logger;
