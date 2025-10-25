/**
 * Frontend Logger Utility
 * Provides consistent logging interface for browser console
 */

const isDevelopment = import.meta.env.DEV;

const logger = {
  info(...args) {
    if (isDevelopment) {
      console.log('[INFO]', ...args);
    }
  },

  warn(...args) {
    console.warn('[WARN]', ...args);
  },

  error(...args) {
    console.error('[ERROR]', ...args);
  },

  debug(...args) {
    if (isDevelopment) {
      console.debug('[DEBUG]', ...args);
    }
  }
};

export default logger;
