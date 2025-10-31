/**
 * Shared validation utilities
 *
 * Feature: 004-subscription-gating
 * Phase: 10 (Code Quality)
 * Task: T079 - Code cleanup and refactoring
 *
 * Purpose: Centralized validation functions to eliminate code duplication
 *
 * This module provides:
 * - Discord snowflake ID validation (17-19 digits)
 * - Consistent error messages across all services
 * - Single source of truth for validation logic
 */

const { SubscriptionVerificationError } = require('../services/subscription/SubscriptionVerificationError');

// Discord snowflake validation pattern (17-19 digits)
const DISCORD_SNOWFLAKE_PATTERN = /^\d{17,19}$/;

/**
 * Validate Discord snowflake ID format
 *
 * @param {string} id - ID to validate
 * @param {string} type - Type of ID (for error message: 'guild', 'user', 'role')
 * @throws {SubscriptionVerificationError} If ID format is invalid
 */
function validateSnowflake(id, type) {
  // H2 FIX: Strict type checking to prevent object coercion attacks
  if (typeof id !== 'string') {
    throw new SubscriptionVerificationError(
      `Invalid ${type} ID format. Expected string, got ${typeof id}.`,
      'INVALID_INPUT',
      false
    );
  }

  // Prevent objects masquerading as strings via toString()
  if (Object.prototype.toString.call(id) !== '[object String]') {
    throw new SubscriptionVerificationError(
      `Invalid ${type} ID format. Expected primitive string.`,
      'INVALID_INPUT',
      false
    );
  }

  if (!DISCORD_SNOWFLAKE_PATTERN.test(id)) {
    throw new SubscriptionVerificationError(
      `Invalid ${type} ID format. Expected 17-19 digit Discord snowflake.`,
      'INVALID_INPUT',
      false
    );
  }
}

/**
 * Check if a Discord snowflake ID is valid (boolean version)
 *
 * @param {string} id - ID to validate
 * @returns {boolean} True if valid snowflake ID
 */
function isValidSnowflake(id) {
  // H2 FIX: Strict type checking
  if (typeof id !== 'string') {
    return false;
  }

  // Prevent objects masquerading as strings
  if (Object.prototype.toString.call(id) !== '[object String]') {
    return false;
  }

  return DISCORD_SNOWFLAKE_PATTERN.test(id);
}

/**
 * Escape special characters in a string for safe use in RegExp
 * Prevents ReDoS (Regular Expression Denial of Service) attacks
 *
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for RegExp constructor
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validate and sanitize search query for safe RegExp usage
 * Enforces length limit to prevent memory exhaustion attacks
 *
 * @param {string} search - Search query to validate
 * @param {Object} options - Validation options
 * @param {number} options.maxLength - Maximum allowed length (default: 100)
 * @returns {string} Escaped search query safe for RegExp
 * @throws {Error} If search query exceeds maximum length
 */
function validateSearchQuery(search, options = {}) {
  const maxLength = options.maxLength || 100;

  // Type validation
  if (typeof search !== 'string') {
    throw new Error('Search query must be a string');
  }

  // Length validation to prevent memory exhaustion
  if (search.length > maxLength) {
    throw new Error(`Search query too long (max ${maxLength} characters)`);
  }

  // Empty string check
  if (search.trim().length === 0) {
    throw new Error('Search query cannot be empty');
  }

  // Return escaped query safe for RegExp
  return escapeRegex(search);
}

module.exports = {
  validateSnowflake,
  isValidSnowflake,
  escapeRegex,
  validateSearchQuery,
  DISCORD_SNOWFLAKE_PATTERN
};
