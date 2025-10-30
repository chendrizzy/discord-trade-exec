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

module.exports = {
  validateSnowflake,
  isValidSnowflake,
  DISCORD_SNOWFLAKE_PATTERN
};
