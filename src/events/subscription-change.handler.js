/**
 * Subscription Change Event Handler
 *
 * Feature: 004-subscription-gating
 * Phase: 6 (Real-Time Updates)
 * Task: T049 - Implement guildMemberUpdate event handler
 *
 * Purpose: Listen for Discord role changes and invalidate access cache
 *
 * This handler:
 * - Listens to guildMemberUpdate events from Discord.js
 * - Detects when user roles change (added/removed)
 * - Invalidates access cache to force fresh verification
 * - Ensures subscription changes propagate within <60s SLA (FR-009)
 *
 * Real-Time Requirements:
 * - Cache invalidation: <100ms (instant)
 * - Next access check: Fetches fresh status from provider
 * - Total propagation: <60 seconds SLA per FR-009
 *
 * Integration:
 * - Registered with Discord.js client via registerEventHandlers()
 * - Calls AccessControlService.invalidateUserAccess()
 * - Logs all role changes for monitoring
 *
 * @see specs/004-subscription-gating/tasks.md - Phase 6, T049
 */

const logger = require('@utils/logger');

/**
 * Handle Discord guild member update events
 *
 * Called by Discord.js when a guild member is updated (roles changed, nickname changed, etc.)
 * We specifically watch for role changes to invalidate the access cache.
 *
 * @param {GuildMember} oldMember - Member before the update
 * @param {GuildMember} newMember - Member after the update
 * @param {AccessControlService} accessControlService - Service for cache invalidation
 * @returns {Promise<void>}
 */
async function handleGuildMemberUpdate(oldMember, newMember, accessControlService) {
  try {
    // Check if roles changed
    const oldRoles = oldMember.roles.cache;
    const newRoles = newMember.roles.cache;

    // Quick check: If role counts are the same, roles might not have changed
    // But we still need to check if the actual roles are different (role swap scenario)
    const rolesChanged = oldRoles.size !== newRoles.size ||
                         !oldRoles.equals(newRoles);

    if (!rolesChanged) {
      // No role changes detected - could be nickname change, timeout, etc.
      logger.debug('Guild member updated but roles unchanged', {
        guildId: newMember.guild.id,
        userId: newMember.user.id,
        username: newMember.user.username
      });
      return;
    }

    // Roles changed - invalidate cache
    const guildId = newMember.guild.id;
    const userId = newMember.user.id;

    logger.info('Role change detected - invalidating cache', {
      guildId,
      userId,
      username: newMember.user.username,
      oldRoleCount: oldRoles.size,
      newRoleCount: newRoles.size,
      rolesAdded: newRoles.difference(oldRoles).size,
      rolesRemoved: oldRoles.difference(newRoles).size
    });

    // Invalidate access cache for this user
    const wasInvalidated = await accessControlService.invalidateUserAccess(guildId, userId);

    if (wasInvalidated) {
      logger.info('Access cache invalidated for role change', {
        guildId,
        userId,
        username: newMember.user.username,
        timestamp: new Date().toISOString()
      });
    } else {
      logger.warn('Cache invalidation returned false (no cache to invalidate)', {
        guildId,
        userId,
        username: newMember.user.username
      });
    }
  } catch (error) {
    // Log error but don't throw - event handler failures shouldn't crash the bot
    logger.error('Error handling guild member update', {
      error: error.message,
      stack: error.stack,
      guildId: newMember.guild.id,
      userId: newMember.user.id,
      username: newMember.user.username
    });
  }
}

/**
 * Register subscription change event handlers with Discord.js client
 *
 * @param {Client} client - Discord.js client instance
 * @param {AccessControlService} accessControlService - Service for cache invalidation
 * @returns {void}
 * @throws {Error} If client or accessControlService is missing
 *
 * @example
 * const client = new Discord.Client({ intents: [...] });
 * const accessControlService = new AccessControlService(...);
 * registerSubscriptionChangeHandlers(client, accessControlService);
 * await client.login(process.env.DISCORD_BOT_TOKEN);
 */
function registerSubscriptionChangeHandlers(client, accessControlService) {
  if (!client) {
    throw new Error('Discord client is required');
  }

  if (!accessControlService) {
    throw new Error('AccessControlService is required');
  }

  // Register guildMemberUpdate event handler
  client.on('guildMemberUpdate', async (oldMember, newMember) => {
    await handleGuildMemberUpdate(oldMember, newMember, accessControlService);
  });

  logger.info('Subscription change event handlers registered', {
    events: ['guildMemberUpdate'],
    timestamp: new Date().toISOString()
  });
}

module.exports = {
  handleGuildMemberUpdate,
  registerSubscriptionChangeHandlers
};
