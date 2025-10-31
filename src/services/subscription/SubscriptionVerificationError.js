/**
 * SubscriptionVerificationError - Custom Error Class
 *
 * Feature: 004-subscription-gating
 * Phase: 2 (Foundational)
 * Task: T020 - Implement SubscriptionVerificationError (moved up for T014 dependency)
 *
 * Purpose: Custom error type for subscription verification failures
 *
 * Error Codes:
 * - DISCORD_API_ERROR: General Discord API failure
 * - GUILD_NOT_FOUND: Guild doesn't exist or bot not in guild
 * - USER_NOT_FOUND: User not in guild
 * - TIMEOUT: Discord API request timeout
 * - RATE_LIMITED: Discord rate limit exceeded
 * - INVALID_INPUT: Input validation failure
 *
 * @see specs/004-subscription-gating/contracts/subscription-verification-api.md
 */

class SubscriptionVerificationError extends Error {
  /**
   * Create a subscription verification error
   *
   * @param {string} message - Human-readable error message
   * @param {string} code - Error code (DISCORD_API_ERROR, GUILD_NOT_FOUND, etc.)
   * @param {boolean} isRetryable - Whether error is retryable (default: false)
   * @param {Error} [discordError] - Original Discord.js error
   */
  constructor(message, code, isRetryable = false, discordError = null) {
    super(message);

    this.name = 'SubscriptionVerificationError';
    this.code = code;
    this.isRetryable = isRetryable;
    this.discordError = discordError;

    // Maintain proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SubscriptionVerificationError);
    }
  }
}

module.exports = { SubscriptionVerificationError };
