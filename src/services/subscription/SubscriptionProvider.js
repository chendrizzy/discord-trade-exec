/**
 * Subscription Provider Interface
 *
 * Feature: 004-subscription-gating
 * Phase: 2 (Foundational)
 * Task: T011 - Define SubscriptionProvider interface
 *
 * Purpose: Abstract interface for subscription verification
 *
 * This file defines the contract that all subscription providers must implement.
 * Enables multiple implementations (Discord, Mock) while maintaining consistent interface.
 *
 * Implementations:
 * - DiscordSubscriptionProvider: Real Discord API integration (production)
 * - MockSubscriptionProvider: Configurable mock for testing
 *
 * @see specs/004-subscription-gating/contracts/subscription-verification-api.md
 */

/**
 * @typedef {Object} SubscriptionVerificationResult
 * @property {boolean} hasAccess - Whether user has required subscription
 * @property {Date} verifiedAt - Timestamp of verification
 * @property {string[]} userRoleIds - User's current role IDs
 * @property {string[]} matchingRoles - Which required roles user has (if any)
 * @property {string} [reason] - Denial reason if hasAccess = false
 * @property {boolean} cacheHit - Whether result came from cache
 * @property {number} [apiLatency] - Discord API latency in ms (if cache miss)
 */

/**
 * SubscriptionProvider Interface
 *
 * Abstract interface defining subscription verification operations.
 * All providers must implement these methods.
 *
 * @interface
 */
class SubscriptionProvider {
  /**
   * Verify if a user has the required subscription/role in a guild
   *
   * @param {string} guildId - Discord guild ID (17-19 digits)
   * @param {string} userId - Discord user ID (17-19 digits)
   * @param {string[]} requiredRoleIds - Array of role IDs, user needs ANY of these
   * @returns {Promise<SubscriptionVerificationResult>} Verification result
   * @throws {SubscriptionVerificationError} If verification fails
   *
   * @example
   * const result = await provider.verifySubscription(
   *   '1234567890123456789',
   *   '9876543210987654321',
   *   ['role1', 'role2']
   * );
   * if (result.hasAccess) {
   *   console.log('User has subscription:', result.matchingRoles);
   * }
   */
  async verifySubscription(guildId, userId, requiredRoleIds) {
    throw new Error('Method not implemented: verifySubscription');
  }

  /**
   * Get all roles for a user in a guild
   *
   * @param {string} guildId - Discord guild ID (17-19 digits)
   * @param {string} userId - Discord user ID (17-19 digits)
   * @returns {Promise<string[]>} Array of role IDs
   * @throws {SubscriptionVerificationError} If fetching roles fails
   *
   * @example
   * const roles = await provider.getUserRoles(
   *   '1234567890123456789',
   *   '9876543210987654321'
   * );
   * console.log('User has roles:', roles);
   */
  async getUserRoles(guildId, userId) {
    throw new Error('Method not implemented: getUserRoles');
  }

  /**
   * Check if a specific role exists in a guild
   *
   * @param {string} guildId - Discord guild ID (17-19 digits)
   * @param {string} roleId - Role ID to check (17-19 digits)
   * @returns {Promise<boolean>} True if role exists
   * @throws {SubscriptionVerificationError} If checking role fails
   *
   * @example
   * const exists = await provider.roleExists(
   *   '1234567890123456789',
   *   '1111111111111111111'
   * );
   * if (!exists) {
   *   console.warn('Configured role no longer exists');
   * }
   */
  async roleExists(guildId, roleId) {
    throw new Error('Method not implemented: roleExists');
  }
}

// Export the interface class and types
module.exports = {
  SubscriptionProvider
};
