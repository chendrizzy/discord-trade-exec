/**
 * Centralized Debug Logger
 *
 * Provides conditional debug logging that only outputs in development mode.
 * In production builds, Vite tree-shaking removes all debug log calls.
 */

const isDev = import.meta.env.DEV;

/* eslint-disable no-console */
export const debugLog = (...args) => isDev && console.log(...args);
export const debugWarn = (...args) => isDev && console.warn(...args);
export const debugInfo = (...args) => isDev && console.info(...args);
/* eslint-enable no-console */

// Production error logging (always enabled)
export const errorLog = (...args) => console.error(...args);
export const warnLog = (...args) => console.warn(...args);
