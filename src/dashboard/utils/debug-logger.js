/**
 * Centralized Debug Logger
 *
 * Provides conditional debug logging that only outputs in development mode.
 * In production builds, Vite tree-shaking removes all debug log calls.
 * Compatible with both Vite (browser) and Jest (Node.js) environments.
 *
 * Note: Vite replaces process.env.NODE_ENV at build time, so this works
 * in both browser and Node.js environments.
 */

// Use process.env which works in both Vite and Jest
const isDev = process.env.NODE_ENV !== 'production';

/* eslint-disable no-console */
export const debugLog = (...args) => isDev && console.log(...args);
export const debugWarn = (...args) => isDev && console.warn(...args);
export const debugInfo = (...args) => isDev && console.info(...args);
/* eslint-enable no-console */

// Production error logging (always enabled)
export const errorLog = (...args) => console.error(...args);
export const warnLog = (...args) => console.warn(...args);
