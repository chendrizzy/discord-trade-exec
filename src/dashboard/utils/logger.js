/**
 * Frontend Logger Utility
 * Provides consistent logging interface for browser console
 */

import { debugLog, debugInfo } from './debug-logger';

const logger = {
  info(...args) {
    debugLog('[INFO]', ...args);
  },

  warn(...args) {
    /* eslint-disable-next-line no-console */
    console.warn('[WARN]', ...args);
  },

  error(...args) {
    /* eslint-disable-next-line no-console */
    console.error('[ERROR]', ...args);
  },

  debug(...args) {
    debugInfo('[DEBUG]', ...args);
  }
};

export default logger;
