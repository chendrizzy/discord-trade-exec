/**
 * Analytics Embed Builder
 *
 * Feature: 004-subscription-gating
 * Phase: 9 (Analytics)
 * Task: T070 - Create analytics embed template
 *
 * Purpose: Builds rich Discord embeds for access analytics display
 *
 * This builder creates:
 * - Guild analytics summary embeds
 * - User analytics embeds
 * - Trending denials embeds
 * - Formatted time-based metrics
 *
 * @see specs/004-subscription-gating/user-stories.md (US6)
 */

const { EmbedBuilder } = require('discord.js');

/**
 * Build guild analytics embed
 *
 * @param {Object} analytics - Guild analytics data from AccessAnalyticsService
 * @param {Object} guild - Discord guild object
 * @returns {EmbedBuilder} Discord embed
 */
function buildGuildAnalyticsEmbed(analytics, guild) {
  const embed = new EmbedBuilder()
    .setTitle(`📊 Access Analytics - ${guild.name}`)
    .setColor(0x5865F2) // Discord blurple
    .setTimestamp(analytics.generatedAt)
    .setFooter({ text: 'Access Analytics Report' });

  // Period info
  const startStr = analytics.period.start.toLocaleDateString();
  const endStr = analytics.period.end.toLocaleDateString();
  embed.setDescription(`**Period**: ${startStr} - ${endStr}`);

  // Summary stats
  embed.addFields({
    name: '📈 Summary',
    value: [
      `**Total Denials**: ${analytics.summary.totalDenials}`,
      `**Unique Users**: ${analytics.summary.uniqueUsers}`,
      `**Avg Per User**: ${analytics.summary.averageDenialsPerUser}`
    ].join('\n'),
    inline: true
  });

  // Denial reasons breakdown
  if (analytics.denialReasons) {
    const reasons = analytics.denialReasons;
    const reasonsText = [
      `❌ No Subscription: ${reasons.no_subscription || 0}`,
      `⏰ Expired: ${reasons.subscription_expired || 0}`,
      `⚠️ Verification Failed: ${reasons.verification_failed || 0}`
    ].join('\n');

    embed.addFields({
      name: '🔍 Denial Reasons',
      value: reasonsText,
      inline: true
    });
  }

  // Top denied users
  if (analytics.mostDeniedUsers && analytics.mostDeniedUsers.length > 0) {
    const topUsers = analytics.mostDeniedUsers
      .slice(0, 5)
      .map((user, idx) => `${idx + 1}. <@${user.userId}>: ${user.denialCount} denials`)
      .join('\n');

    embed.addFields({
      name: '👥 Most Denied Users (Top 5)',
      value: topUsers || 'None',
      inline: false
    });
  }

  // Top denied commands
  if (analytics.commandStats && analytics.commandStats.length > 0) {
    const topCommands = analytics.commandStats
      .slice(0, 5)
      .map((cmd, idx) => `${idx + 1}. \`${cmd.command}\`: ${cmd.count}`)
      .join('\n');

    embed.addFields({
      name: '⚡ Most Denied Commands (Top 5)',
      value: topCommands || 'None',
      inline: false
    });
  }

  return embed;
}

/**
 * Build user analytics embed
 *
 * @param {Object} analytics - User analytics data from AccessAnalyticsService
 * @param {Object} user - Discord user object
 * @returns {EmbedBuilder} Discord embed
 */
function buildUserAnalyticsEmbed(analytics, user) {
  const embed = new EmbedBuilder()
    .setTitle(`📊 User Access Analytics`)
    .setColor(0xED4245) // Discord red
    .setTimestamp(analytics.generatedAt)
    .setFooter({ text: 'User Analytics Report' })
    .setThumbnail(user.displayAvatarURL({ dynamic: true }));

  // Period info
  const startStr = analytics.period.start.toLocaleDateString();
  const endStr = analytics.period.end.toLocaleDateString();
  embed.setDescription([
    `**User**: ${user.tag}`,
    `**Period**: ${startStr} - ${endStr}`
  ].join('\n'));

  // Summary stats
  embed.addFields({
    name: '📈 Summary',
    value: [
      `**Total Denials**: ${analytics.summary.totalDenials}`,
      `**Servers Affected**: ${analytics.summary.guildsAffected}`
    ].join('\n'),
    inline: true
  });

  // Denial reasons
  if (analytics.denialReasons) {
    const reasons = analytics.denialReasons;
    const reasonsText = [
      `❌ No Subscription: ${reasons.no_subscription || 0}`,
      `⏰ Expired: ${reasons.subscription_expired || 0}`,
      `⚠️ Verification Failed: ${reasons.verification_failed || 0}`
    ].join('\n');

    embed.addFields({
      name: '🔍 Denial Reasons',
      value: reasonsText,
      inline: true
    });
  }

  // Servers breakdown
  if (analytics.byGuild && analytics.byGuild.length > 0) {
    const guildsText = analytics.byGuild
      .slice(0, 5)
      .map(g => `**Server**: ${g.guildId}\n**Denials**: ${g.denialCount}`)
      .join('\n\n');

    embed.addFields({
      name: '🏠 Top Servers (by Denials)',
      value: guildsText || 'None',
      inline: false
    });
  }

  return embed;
}

/**
 * Build trending denials embed
 *
 * @param {Object} trending - Trending data from AccessAnalyticsService
 * @param {Object} guild - Discord guild object
 * @returns {EmbedBuilder} Discord embed
 */
function buildTrendingDenialsEmbed(trending, guild) {
  const embed = new EmbedBuilder()
    .setTitle(`📈 Trending Denials - ${guild.name}`)
    .setColor(0xFEE75C) // Discord yellow
    .setTimestamp()
    .setFooter({ text: 'Trending Analysis' });

  embed.setDescription(`**Period**: ${trending.period}`);

  // Summary
  embed.addFields({
    name: '📊 Overview',
    value: [
      `**Total Denials**: ${trending.totalDenials}`,
      `**Average/Hour**: ${trending.averagePerHour}`,
      `**Peak Hour**: ${trending.peakActivity.hour}:00 (${trending.peakActivity.count} denials)`
    ].join('\n'),
    inline: false
  });

  // Hourly distribution (simple bar chart)
  if (trending.hourlyDistribution) {
    const hours = Object.entries(trending.hourlyDistribution)
      .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
      .map(([hour, count]) => {
        const bar = '█'.repeat(Math.ceil(count / 2)); // Scale bars
        return `\`${hour.padStart(2, '0')}:00\` ${bar} (${count})`;
      })
      .slice(0, 12); // Show max 12 hours

    embed.addFields({
      name: '⏰ Hourly Distribution',
      value: hours.join('\n') || 'No data',
      inline: false
    });
  }

  return embed;
}

/**
 * Build analytics period comparison embed
 *
 * @param {Object} currentPeriod - Current period analytics
 * @param {Object} previousPeriod - Previous period analytics
 * @param {Object} guild - Discord guild object
 * @returns {EmbedBuilder} Discord embed
 */
function buildPeriodComparisonEmbed(currentPeriod, previousPeriod, guild) {
  const embed = new EmbedBuilder()
    .setTitle(`📊 Period Comparison - ${guild.name}`)
    .setColor(0x57F287) // Discord green
    .setTimestamp()
    .setFooter({ text: 'Period Comparison Report' });

  // Calculate changes
  const denialChange = currentPeriod.summary.totalDenials - previousPeriod.summary.totalDenials;
  const userChange = currentPeriod.summary.uniqueUsers - previousPeriod.summary.uniqueUsers;

  const denialTrend = denialChange > 0 ? '📈' : denialChange < 0 ? '📉' : '➡️';
  const userTrend = userChange > 0 ? '📈' : userChange < 0 ? '📉' : '➡️';

  embed.addFields({
    name: '📅 Current Period',
    value: [
      `**Total Denials**: ${currentPeriod.summary.totalDenials}`,
      `**Unique Users**: ${currentPeriod.summary.uniqueUsers}`
    ].join('\n'),
    inline: true
  });

  embed.addFields({
    name: '📅 Previous Period',
    value: [
      `**Total Denials**: ${previousPeriod.summary.totalDenials}`,
      `**Unique Users**: ${previousPeriod.summary.uniqueUsers}`
    ].join('\n'),
    inline: true
  });

  embed.addFields({
    name: '📊 Changes',
    value: [
      `${denialTrend} **Denials**: ${denialChange >= 0 ? '+' : ''}${denialChange}`,
      `${userTrend} **Users**: ${userChange >= 0 ? '+' : ''}${userChange}`
    ].join('\n'),
    inline: false
  });

  return embed;
}

/**
 * Build error embed for analytics failures
 *
 * @param {Error} error - Error object
 * @param {string} type - Type of analytics that failed
 * @returns {EmbedBuilder} Error embed
 */
function buildAnalyticsErrorEmbed(error, type = 'analytics') {
  return new EmbedBuilder()
    .setTitle('❌ Analytics Error')
    .setDescription(`Failed to retrieve ${type}: ${error.message}`)
    .setColor(0xED4245) // Discord red
    .setTimestamp()
    .setFooter({ text: 'Analytics System' });
}

module.exports = {
  buildGuildAnalyticsEmbed,
  buildUserAnalyticsEmbed,
  buildTrendingDenialsEmbed,
  buildPeriodComparisonEmbed,
  buildAnalyticsErrorEmbed
};
