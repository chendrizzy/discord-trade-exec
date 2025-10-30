/**
 * Denial Message Builder
 *
 * Feature: 004-subscription-gating
 * Phase: 5 (User Story 3 - Non-Subscriber Attempts)
 * Task: T044 - Create denial message embed template
 *
 * Purpose: Build Discord embeds for access denial messages
 *
 * Creates professional, informative denial messages with:
 * - Clear denial reason explanation
 * - Required subscription roles
 * - Call-to-action for subscribing
 * - Consistent branding and formatting
 *
 * @module utils/denial-message.builder
 */

const { EmbedBuilder } = require('discord.js');

/**
 * Build a Discord embed for access denial
 *
 * Creates a professional, informative embed message shown to users
 * when their access is denied due to missing subscription.
 *
 * @param {Object} options - Embed configuration
 * @param {string} options.denialReason - Why access was denied ('no_subscription', 'subscription_expired', 'verification_failed')
 * @param {string[]} options.requiredRoleIds - Required Discord role IDs (snowflakes)
 * @param {string} options.commandAttempted - Command the user tried to execute
 * @returns {EmbedBuilder} Configured Discord embed ready for sending
 *
 * @example
 * const embed = buildDenialEmbed({
 *   denialReason: 'no_subscription',
 *   requiredRoleIds: ['1111111111111111111'],
 *   commandAttempted: '/trade'
 * });
 * await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
 */
function buildDenialEmbed({ denialReason, requiredRoleIds = [], commandAttempted }) {
  const embed = new EmbedBuilder()
    .setTitle('🔒 Access Denied')
    .setColor(0xED4245) // Discord red for errors
    .setDescription(getDenialReasonMessage(denialReason, commandAttempted))
    .setTimestamp()
    .setFooter({ text: 'Subscription Required • Contact server admin for access' });

  // Add required roles field if roles are specified
  if (requiredRoleIds && requiredRoleIds.length > 0) {
    embed.addFields({
      name: '📋 Required Roles',
      value: formatRolesList(requiredRoleIds),
      inline: false
    });
  }

  // Add call-to-action field
  embed.addFields({
    name: '💎 Get Access',
    value: 'Contact your server administrator to subscribe and gain access to premium commands.',
    inline: false
  });

  return embed;
}

/**
 * Get appropriate denial message based on reason
 *
 * Returns a user-friendly explanation of why access was denied,
 * customized for the specific denial reason.
 *
 * @param {string} denialReason - The denial reason code
 * @param {string} commandAttempted - The command user tried to execute
 * @returns {string} User-friendly denial message
 */
function getDenialReasonMessage(denialReason, commandAttempted) {
  const command = commandAttempted || 'this command';

  switch (denialReason) {
    case 'no_subscription':
      return `You don't have an active subscription to use ${command}.\n\nThis server requires a subscription to access premium bot commands. Please subscribe to continue.`;

    case 'subscription_expired':
      return `Your subscription has expired and you can no longer use ${command}.\n\nPlease renew your subscription to regain access to premium commands.`;

    case 'verification_failed':
      return `We couldn't verify your subscription status for ${command}.\n\nThis may be a temporary issue. Please try again in a few moments, or contact the server administrator if the problem persists.`;

    default:
      return `You don't have permission to use ${command}.\n\nThis server requires a subscription to access premium commands.`;
  }
}

/**
 * Format role IDs as Discord role mentions
 *
 * Converts an array of Discord role IDs into mention format
 * that will render as clickable role pills in Discord.
 *
 * @param {string[]} roleIds - Array of Discord role IDs (snowflakes)
 * @returns {string} Formatted role mentions or fallback message
 *
 * @example
 * formatRolesList(['1111111111111111111'])
 * // Returns: '<@&1111111111111111111>'
 *
 * formatRolesList(['111...', '222...'])
 * // Returns: '<@&111...>\n<@&222...>'
 */
function formatRolesList(roleIds) {
  if (!roleIds || roleIds.length === 0) {
    return 'Contact server administrator';
  }

  return roleIds.map(roleId => `<@&${roleId}>`).join('\n');
}

module.exports = {
  buildDenialEmbed,
  getDenialReasonMessage,
  formatRolesList
};
