/**
 * DiscordSubscriptionProvider - Discord.js Integration
 *
 * Feature: 004-subscription-gating
 * Phase: 2 (Foundational)
 * Task: T014 - Implement DiscordSubscriptionProvider with Discord.js
 *
 * Purpose: Real Discord API integration for subscription verification
 *
 * This provider uses Discord.js to:
 * - Fetch guild members and their roles
 * - Verify subscription status by checking role membership
 * - Handle Discord API errors gracefully
 *
 * Performance: <500ms p95 for Discord API calls (per SLA)
 *
 * @see specs/004-subscription-gating/contracts/subscription-verification-api.md
 */

const { SubscriptionProvider } = require('./SubscriptionProvider');
const { SubscriptionVerificationError } = require('./SubscriptionVerificationError');
const logger = require('@utils/logger');

// Discord snowflake validation pattern (17-19 digits)
const DISCORD_SNOWFLAKE_PATTERN = /^\d{17,19}$/;

class DiscordSubscriptionProvider extends SubscriptionProvider {
  /**
   * Create a DiscordSubscriptionProvider
   *
   * @param {import('discord.js').Client} client - Discord.js client instance
   * @throws {Error} If client is not provided
   */
  constructor(client) {
    super();

    if (!client) {
      throw new Error('Discord client is required');
    }

    this.client = client;
    logger.info('DiscordSubscriptionProvider initialized');
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
   * Get guild from cache or fetch from API
   *
   * @param {string} guildId - Discord guild ID
   * @returns {Promise<import('discord.js').Guild>}
   * @throws {SubscriptionVerificationError} If guild not found
   * @private
   */
  async _getGuild(guildId) {
    try {
      // Try cache first
      let guild = this.client.guilds.cache.get(guildId);

      // Fetch if not in cache
      if (!guild) {
        logger.debug('Guild cache miss, fetching from Discord API', { guildId });
        const startTime = Date.now();
        guild = await this.client.guilds.fetch(guildId);
        const duration = Date.now() - startTime;
        logger.debug('Guild fetched from Discord API', { guildId, duration });
      } else {
        logger.debug('Guild cache hit', { guildId });
      }

      if (!guild) {
        logger.warn('Guild not found', { guildId });
        throw new SubscriptionVerificationError(
          'Guild not found',
          'GUILD_NOT_FOUND',
          false
        );
      }

      return guild;
    } catch (error) {
      if (error instanceof SubscriptionVerificationError) {
        throw error;
      }

      logger.error('Guild fetch error', {
        error: error.message,
        stack: error.stack,
        guildId
      });

      throw new SubscriptionVerificationError(
        'Guild not found',
        'GUILD_NOT_FOUND',
        false,
        error
      );
    }
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
    const startTime = Date.now();

    logger.debug('Starting subscription verification', {
      guildId,
      userId,
      requiredRoleCount: requiredRoleIds?.length
    });

    // Validate inputs
    this._validateSnowflake(guildId, 'guild');
    this._validateSnowflake(userId, 'user');

    if (!Array.isArray(requiredRoleIds) || requiredRoleIds.length === 0) {
      logger.warn('Invalid required role IDs', { guildId, userId });
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

    try {
      // Get guild
      const guild = await this._getGuild(guildId);

      // Fetch member
      logger.debug('Fetching guild member', { guildId, userId });
      const memberStartTime = Date.now();
      const member = await guild.members.fetch(userId);
      const memberFetchDuration = Date.now() - memberStartTime;
      logger.debug('Guild member fetched', { guildId, userId, duration: memberFetchDuration });

      // Get user's role IDs
      const userRoleIds = Array.from(member.roles.cache.keys());

      // Find matching roles
      const matchingRoles = requiredRoleIds.filter(roleId => userRoleIds.includes(roleId));

      const hasAccess = matchingRoles.length > 0;
      const apiLatency = Date.now() - startTime;

      logger.info('Subscription verification complete', {
        guildId,
        userId,
        hasAccess,
        matchingRoleCount: matchingRoles.length,
        apiLatency
      });

      return {
        hasAccess,
        verifiedAt: new Date(),
        userRoleIds,
        matchingRoles,
        reason: hasAccess ? undefined : 'no_subscription',
        cacheHit: false,
        apiLatency
      };

    } catch (error) {
      const apiLatency = Date.now() - startTime;

      // Handle Discord API errors
      if (error instanceof SubscriptionVerificationError) {
        logger.warn('Subscription verification error', {
          error: error.message,
          code: error.code,
          guildId,
          userId,
          apiLatency
        });
        throw error;
      }

      // Discord error codes
      if (error.code === 10007) {  // Unknown Member
        logger.warn('User not found in guild', {
          error: error.message,
          code: error.code,
          guildId,
          userId,
          apiLatency
        });
        throw new SubscriptionVerificationError(
          'User not found in guild',
          'USER_NOT_FOUND',
          false,
          error
        );
      }

      if (error.code === 50013) {  // Missing Permissions
        logger.error('Bot lacks permissions to fetch member', {
          error: error.message,
          code: error.code,
          guildId,
          userId,
          apiLatency
        });
        throw new SubscriptionVerificationError(
          'Bot lacks permissions to fetch member',
          'DISCORD_API_ERROR',
          false,
          error
        );
      }

      // Timeout errors
      if (error.message?.toLowerCase().includes('timeout')) {
        logger.warn('Discord API timeout', {
          error: error.message,
          guildId,
          userId,
          apiLatency
        });
        throw new SubscriptionVerificationError(
          'Discord API timeout',
          'TIMEOUT',
          true,  // Retryable
          error
        );
      }

      // Generic error
      logger.error('Discord API error', {
        error: error.message,
        stack: error.stack,
        code: error.code,
        guildId,
        userId,
        apiLatency
      });
      throw new SubscriptionVerificationError(
        'Subscription verification failed',
        'DISCORD_API_ERROR',
        true,  // Retryable for unknown errors
        error
      );
    }
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

    try {
      // Get guild
      const guild = await this._getGuild(guildId);

      // Fetch member
      const member = await guild.members.fetch(userId);

      // Return role IDs
      return Array.from(member.roles.cache.keys());

    } catch (error) {
      // Handle Discord API errors
      if (error instanceof SubscriptionVerificationError) {
        throw error;
      }

      if (error.code === 10007) {  // Unknown Member
        throw new SubscriptionVerificationError(
          'User not found in guild',
          'USER_NOT_FOUND',
          false,
          error
        );
      }

      throw new SubscriptionVerificationError(
        'Failed to fetch user roles',
        'DISCORD_API_ERROR',
        true,
        error
      );
    }
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

    try {
      // Get guild
      const guild = await this._getGuild(guildId);

      // Check if role exists in cache
      return guild.roles.cache.has(roleId);

    } catch (error) {
      // Handle errors
      if (error instanceof SubscriptionVerificationError) {
        throw error;
      }

      throw new SubscriptionVerificationError(
        'Failed to check role existence',
        'DISCORD_API_ERROR',
        true,
        error
      );
    }
  }
}

module.exports = { DiscordSubscriptionProvider };
