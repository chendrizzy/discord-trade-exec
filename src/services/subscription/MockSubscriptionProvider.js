/**
 * MockSubscriptionProvider - Configurable Mock for Testing
 *
 * Feature: 004-subscription-gating
 * Phase: 2 (Foundational)
 * Task: T015 - Implement MockSubscriptionProvider
 *
 * Purpose: In-memory mock provider for unit/integration testing
 *
 * This provider allows tests to:
 * - Configure mock role data via helper methods
 * - Simulate various subscription scenarios
 * - Simulate error conditions
 * - Test without external dependencies (no Discord API)
 *
 * Performance: All operations <10ms (in-memory)
 *
 * @see specs/004-subscription-gating/contracts/subscription-verification-api.md
 */

const { SubscriptionProvider } = require('./SubscriptionProvider');
const { SubscriptionVerificationError } = require('./SubscriptionVerificationError');

// Discord snowflake validation pattern (17-19 digits)
const DISCORD_SNOWFLAKE_PATTERN = /^\d{17,19}$/;

class MockSubscriptionProvider extends SubscriptionProvider {
  /**
   * Create a MockSubscriptionProvider
   *
   * @param {Object} [initialState] - Optional initial state
   * @param {Object} [initialState.guilds] - Guild configurations
   */
  constructor(initialState = {}) {
    super();

    // Map<guildId, Map<userId, roleIds[]>>
    this.mockRoles = new Map();

    // Map<guildId, roleIds[]>
    this.mockGuilds = new Map();

    // Map<guildId, errorCode>
    this.simulatedErrors = new Map();

    // Initialize with provided state
    if (initialState.guilds) {
      for (const [guildId, guildData] of Object.entries(initialState.guilds)) {
        if (guildData.users) {
          for (const [userId, roleIds] of Object.entries(guildData.users)) {
            this.setUserRoles(guildId, userId, roleIds);
          }
        }
        if (guildData.roles) {
          this.setGuildRoles(guildId, guildData.roles);
        }
      }
    }
  }

  /**
   * Validate Discord snowflake ID format
   *
   * @param {string} id - ID to validate
   * @param {string} type - Type of ID (for error message)
   * @throws {SubscriptionVerificationError} If ID format is invalid
   * @private
   */
  _validateSnowflake(id, type) {
    if (!DISCORD_SNOWFLAKE_PATTERN.test(id)) {
      throw new SubscriptionVerificationError(
        `Invalid ${type} ID format. Expected 17-19 digit Discord snowflake.`,
        'INVALID_INPUT',
        false
      );
    }
  }

  /**
   * Check if error should be simulated for this guild
   *
   * @param {string} guildId - Guild ID to check
   * @throws {SubscriptionVerificationError} If error is simulated
   * @private
   */
  _checkSimulatedError(guildId) {
    const errorCode = this.simulatedErrors.get(guildId);
    if (!errorCode) return;

    switch (errorCode) {
      case 'GUILD_NOT_FOUND':
        throw new SubscriptionVerificationError(
          'Guild not found',
          'GUILD_NOT_FOUND',
          false
        );
      case 'USER_NOT_FOUND':
        throw new SubscriptionVerificationError(
          'User not found',
          'USER_NOT_FOUND',
          false
        );
      case 'TIMEOUT':
        throw new SubscriptionVerificationError(
          'Request timeout',
          'TIMEOUT',
          true
        );
      case 'DISCORD_API_ERROR':
        throw new SubscriptionVerificationError(
          'Discord API error',
          'DISCORD_API_ERROR',
          true
        );
      default:
        throw new SubscriptionVerificationError(
          'Unknown error',
          errorCode,
          false
        );
    }
  }

  /**
   * Set user roles for testing
   *
   * @param {string} guildId - Guild ID
   * @param {string} userId - User ID
   * @param {string[]} roleIds - Array of role IDs
   */
  setUserRoles(guildId, userId, roleIds) {
    if (!this.mockRoles.has(guildId)) {
      this.mockRoles.set(guildId, new Map());
    }
    this.mockRoles.get(guildId).set(userId, roleIds);
  }

  /**
   * Set guild roles for testing
   *
   * @param {string} guildId - Guild ID
   * @param {string[]} roleIds - Array of role IDs
   */
  setGuildRoles(guildId, roleIds) {
    this.mockGuilds.set(guildId, roleIds);
  }

  /**
   * Simulate error for testing
   *
   * @param {string} guildId - Guild ID to simulate error for
   * @param {string} errorCode - Error code to simulate
   */
  setSimulateError(guildId, errorCode) {
    this.simulatedErrors.set(guildId, errorCode);
  }

  /**
   * Clear all simulated errors
   */
  clearSimulatedErrors() {
    this.simulatedErrors.clear();
  }

  /**
   * Verify if a user has the required subscription/role in a guild
   *
   * @param {string} guildId - Discord guild ID (17-19 digits)
   * @param {string} userId - Discord user ID (17-19 digits)
   * @param {string[]} requiredRoleIds - Array of role IDs, user needs ANY of these
   * @returns {Promise<SubscriptionVerificationResult>} Verification result
   * @throws {SubscriptionVerificationError} If verification fails
   */
  async verifySubscription(guildId, userId, requiredRoleIds) {
    // Validate inputs
    this._validateSnowflake(guildId, 'guild');
    this._validateSnowflake(userId, 'user');

    if (!Array.isArray(requiredRoleIds) || requiredRoleIds.length === 0) {
      throw new SubscriptionVerificationError(
        'Required role IDs array cannot be empty',
        'INVALID_INPUT',
        false
      );
    }

    // Validate each role ID
    for (const roleId of requiredRoleIds) {
      this._validateSnowflake(roleId, 'role');
    }

    // Check for simulated errors
    this._checkSimulatedError(guildId);

    // Get user's roles from mock data
    const userRoleIds = this.mockRoles.get(guildId)?.get(userId) || [];

    // Find matching roles
    const matchingRoles = requiredRoleIds.filter(roleId => userRoleIds.includes(roleId));

    const hasAccess = matchingRoles.length > 0;

    return {
      hasAccess,
      verifiedAt: new Date(),
      userRoleIds,
      matchingRoles,
      reason: hasAccess ? undefined : 'no_subscription',
      cacheHit: false
      // No apiLatency for mock (in-memory operation)
    };
  }

  /**
   * Get all roles for a user in a guild
   *
   * @param {string} guildId - Discord guild ID (17-19 digits)
   * @param {string} userId - Discord user ID (17-19 digits)
   * @returns {Promise<string[]>} Array of role IDs
   * @throws {SubscriptionVerificationError} If fetching roles fails
   */
  async getUserRoles(guildId, userId) {
    // Validate inputs
    this._validateSnowflake(guildId, 'guild');
    this._validateSnowflake(userId, 'user');

    // Check for simulated errors
    this._checkSimulatedError(guildId);

    // Return user's roles from mock data (empty array if not found)
    return this.mockRoles.get(guildId)?.get(userId) || [];
  }

  /**
   * Check if a specific role exists in a guild
   *
   * @param {string} guildId - Discord guild ID (17-19 digits)
   * @param {string} roleId - Role ID to check (17-19 digits)
   * @returns {Promise<boolean>} True if role exists
   * @throws {SubscriptionVerificationError} If checking role fails
   */
  async roleExists(guildId, roleId) {
    // Validate inputs
    this._validateSnowflake(guildId, 'guild');
    this._validateSnowflake(roleId, 'role');

    // Check for simulated errors
    this._checkSimulatedError(guildId);

    // Check if role exists in guild's role list
    const guildRoles = this.mockGuilds.get(guildId) || [];
    return guildRoles.includes(roleId);
  }
}

module.exports = { MockSubscriptionProvider };
