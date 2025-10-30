/**
 * Subscription Gate Middleware
 *
 * Feature: 004-subscription-gating
 * Phase: 4-5 (User Stories 2-3 - Subscriber Access & Non-Subscriber Attempts)
 * Tasks: T035 (middleware), T045 (ephemeral denial delivery)
 *
 * Purpose: Intercept all Discord bot commands and enforce subscription-based access control
 *
 * This middleware:
 * - Runs before every command execution
 * - Checks user access via AccessControlService
 * - Allows access for subscribers/open access guilds
 * - Sends rich embed denial messages to non-subscribers (T045)
 * - Logs all access attempts for analytics
 * - Implements fail-open on errors (availability over strict enforcement)
 *
 * Integration:
 * - Registered with Discord.js client command handler (T036)
 * - Integrates with AccessControlService for access decisions
 * - Uses Discord.js ephemeral embeds for denial messages (T045)
 * - Uses denial message builder utility for consistent formatting
 *
 * Error Handling:
 * - Fail-open: Allow access if verification service fails (availability)
 * - Log all errors for monitoring and debugging
 * - Never crash the bot due to middleware errors
 *
 * @see specs/004-subscription-gating/tasks.md - Phase 4-5, T035, T045
 */

const { MessageFlags } = require('discord.js');
const logger = require('@utils/logger');
const { buildDenialEmbed } = require('@utils/denial-message.builder');

/**
 * Create subscription gate middleware
 *
 * @param {AccessControlService} accessControlService - Service for access control decisions
 * @returns {Function} Middleware function for Discord.js command handler
 * @throws {Error} If accessControlService is not provided
 */
function subscriptionGateMiddleware(accessControlService) {
  if (!accessControlService) {
    throw new Error('subscriptionGateMiddleware requires accessControlService');
  }

  /**
   * Middleware function that enforces subscription-based access control
   *
   * @param {CommandInteraction} interaction - Discord.js command interaction
   * @param {Function} next - Next middleware/handler function
   * @returns {Promise<void>}
   */
  return async function (interaction, next) {
    const startTime = Date.now();

    try {
      const { guildId, user, commandName } = interaction;

      // Validate required interaction properties
      if (!guildId || !user || !user.id) {
        logger.warn('Invalid interaction properties', {
          hasGuildId: !!guildId,
          hasUser: !!user,
          hasUserId: !!user?.id,
          commandName
        });
        // Allow to proceed - might be DM or special case
        return next();
      }

      // Check access via AccessControlService
      const accessResult = await accessControlService.checkAccess(guildId, user.id);

      const duration = Date.now() - startTime;

      // Access granted - proceed to command
      if (accessResult.hasAccess) {
        logger.info('Access granted', {
          guildId,
          userId: user.id,
          username: user.username,
          commandName,
          reason: accessResult.reason,
          cacheHit: accessResult.cacheHit,
          degraded: accessResult.degraded,
          duration
        });

        return next();
      }

      // Access denied - send rich embed denial message (T045)
      logger.info('Access denied', {
        guildId,
        userId: user.id,
        username: user.username,
        commandName,
        reason: accessResult.reason,
        requiredRoles: accessResult.requiredRoles,
        duration
      });

      // Map access result reason to denial reason format
      const denialReason = mapReasonToDenialReason(accessResult.reason);

      // Build rich embed denial message
      const denialEmbed = buildDenialEmbed({
        denialReason,
        requiredRoleIds: accessResult.requiredRoles || [],
        commandAttempted: `/${commandName}`
      });

      // Send ephemeral embed (only visible to the user who triggered the command)
      await interaction.reply({
        embeds: [denialEmbed],
        flags: MessageFlags.Ephemeral // Discord.js v14 ephemeral flag
      });

      // Log denial event for analytics (T046)
      // Note: User roles not available in interaction, pass empty array
      // In production, fetch user roles from Discord API if needed
      await accessControlService.logDenialEvent({
        guildId,
        userId: user.id,
        commandAttempted: `/${commandName}`,
        denialReason,
        userRoleIds: [], // Would need to fetch from Discord API
        requiredRoleIds: accessResult.requiredRoles || [],
        wasInformed: true // User received the denial message
      }).catch(err => {
        // Log error but don't throw - denial logging shouldn't break the flow
        logger.warn('Failed to log denial event', {
          error: err.message,
          guildId,
          userId: user.id,
          commandName
        });
      });

      // Don't call next() - command execution stopped
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error('Subscription gate middleware error', {
        error: error.message,
        stack: error.stack,
        guildId: interaction.guildId,
        userId: interaction.user?.id,
        commandName: interaction.commandName,
        duration
      });

      // Fail-open: Allow access on error (availability over strict enforcement)
      logger.warn('Failing open due to middleware error - allowing access', {
        guildId: interaction.guildId,
        userId: interaction.user?.id,
        commandName: interaction.commandName
      });

      return next();
    }
  };
}

/**
 * Map AccessControlService reason codes to denial message builder reason format
 *
 * AccessControlService uses technical reason codes like 'verification_unavailable'.
 * Denial message builder expects user-facing reasons like 'no_subscription'.
 *
 * @param {string} accessReason - Reason code from AccessControlService
 * @returns {string} Denial reason for message builder
 * @private
 */
function mapReasonToDenialReason(accessReason) {
  switch (accessReason) {
    case 'no_subscription':
      return 'no_subscription';

    case 'subscription_expired':
      return 'subscription_expired';

    case 'verification_unavailable':
    case 'verification_error':
    case 'verification_failed':
      return 'verification_failed';

    // All other reasons map to no_subscription (generic denial)
    case 'configuration_not_found':
    case 'configuration_inactive':
    case 'invalid_guild_id':
    case 'invalid_user_id':
    case 'unknown_access_mode':
    default:
      return 'no_subscription';
  }
}

module.exports = { subscriptionGateMiddleware };
