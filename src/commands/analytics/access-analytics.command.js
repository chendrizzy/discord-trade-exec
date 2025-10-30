/**
 * Access Analytics Command
 *
 * Feature: 004-subscription-gating
 * Phase: 9 (User Story 6 - Server Owner Views Access Analytics)
 * Task: T068 - Implement /analytics command
 *
 * Purpose: Display access denial statistics and subscriber usage metrics
 *
 * This command provides:
 * - Guild-wide denial statistics
 * - Trending analysis
 * - User-specific analytics
 * - Period comparisons
 * - Per-server data isolation (T069)
 *
 * User Flow:
 * 1. User invokes /analytics [subcommand]
 * 2. Bot verifies user has MANAGE_GUILD permission
 * 3. Bot retrieves analytics from AccessAnalyticsService
 * 4. Bot displays formatted analytics embed
 *
 * Subcommands:
 * - guild: Show guild-wide analytics
 * - user: Show analytics for specific user
 * - trending: Show trending denial patterns
 *
 * @see specs/004-subscription-gating/tasks.md - Phase 9, T068-T070
 */

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder
} = require('discord.js');

const { AccessAnalyticsService } = require('@services/analytics/AccessAnalyticsService');
const {
  buildGuildAnalyticsEmbed,
  buildUserAnalyticsEmbed,
  buildTrendingDenialsEmbed,
  buildAnalyticsErrorEmbed
} = require('@utils/analytics-embed.builder');
const logger = require('@utils/logger');

class AccessAnalyticsCommand {
  /**
   * Create an AccessAnalyticsCommand
   *
   * @param {Client} client - Discord.js client instance
   */
  constructor(client) {
    this.client = client;
    this.analyticsService = new AccessAnalyticsService();

    // Command definition with subcommands
    this.data = new SlashCommandBuilder()
      .setName('analytics')
      .setDescription('View access denial statistics and subscriber usage metrics')
      .addSubcommand(subcommand =>
        subcommand
          .setName('guild')
          .setDescription('Show guild-wide access analytics')
          .addIntegerOption(option =>
            option
              .setName('days')
              .setDescription('Number of days to analyze (default: 7)')
              .setMinValue(1)
              .setMaxValue(30)
              .setRequired(false)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('user')
          .setDescription('Show analytics for a specific user')
          .addUserOption(option =>
            option
              .setName('target')
              .setDescription('User to analyze')
              .setRequired(true)
          )
          .addIntegerOption(option =>
            option
              .setName('days')
              .setDescription('Number of days to analyze (default: 7)')
              .setMinValue(1)
              .setMaxValue(30)
              .setRequired(false)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('trending')
          .setDescription('Show trending denial patterns')
          .addIntegerOption(option =>
            option
              .setName('hours')
              .setDescription('Number of hours to analyze (default: 24)')
              .setMinValue(1)
              .setMaxValue(168) // 7 days
              .setRequired(false)
          )
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
  }

  /**
   * Execute the analytics command
   *
   * @param {CommandInteraction} interaction - Discord interaction object
   */
  async execute(interaction) {
    try {
      // Defer reply since analytics queries may take time
      await interaction.deferReply();

      // Verify permissions
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.editReply({
          content: '❌ You need **Manage Server** permission to view analytics.',
          ephemeral: true
        });
        return;
      }

      const subcommand = interaction.options.getSubcommand();

      // Route to appropriate handler
      switch (subcommand) {
        case 'guild':
          await this._handleGuildAnalytics(interaction);
          break;
        case 'user':
          await this._handleUserAnalytics(interaction);
          break;
        case 'trending':
          await this._handleTrendingAnalytics(interaction);
          break;
        default:
          await interaction.editReply({
            content: '❌ Unknown subcommand.',
            ephemeral: true
          });
      }

      logger.info('Analytics command executed', {
        guildId: interaction.guildId,
        userId: interaction.user.id,
        subcommand
      });

    } catch (error) {
      logger.error('Analytics command error', {
        error: error.message,
        stack: error.stack,
        guildId: interaction.guildId,
        userId: interaction.user.id
      });

      const errorEmbed = buildAnalyticsErrorEmbed(error, 'analytics');
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }

  /**
   * Handle guild analytics subcommand
   * @private
   */
  async _handleGuildAnalytics(interaction) {
    const days = interaction.options.getInteger('days') || 7;
    const endDate = new Date();
    const startDate = new Date(Date.now() - days * 86400000);

    logger.debug('Fetching guild analytics', {
      guildId: interaction.guildId,
      days,
      startDate,
      endDate
    });

    // T069: Per-server data isolation - only query this guild's data
    const analytics = await this.analyticsService.getGuildAnalytics(
      interaction.guildId,
      { startDate, endDate }
    );

    const embed = buildGuildAnalyticsEmbed(analytics, interaction.guild);
    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * Handle user analytics subcommand
   * @private
   */
  async _handleUserAnalytics(interaction) {
    const targetUser = interaction.options.getUser('target');
    const days = interaction.options.getInteger('days') || 7;
    const endDate = new Date();
    const startDate = new Date(Date.now() - days * 86400000);

    logger.debug('Fetching user analytics', {
      guildId: interaction.guildId,
      userId: targetUser.id,
      days,
      startDate,
      endDate
    });

    const analytics = await this.analyticsService.getUserAnalytics(
      targetUser.id,
      startDate,
      endDate
    );

    const embed = buildUserAnalyticsEmbed(analytics, targetUser);
    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * Handle trending analytics subcommand
   * @private
   */
  async _handleTrendingAnalytics(interaction) {
    const hours = interaction.options.getInteger('hours') || 24;

    logger.debug('Fetching trending denials', {
      guildId: interaction.guildId,
      hours
    });

    // T069: Per-server data isolation - only query this guild's data
    const trending = await this.analyticsService.getTrendingDenials(
      interaction.guildId,
      hours
    );

    const embed = buildTrendingDenialsEmbed(trending, interaction.guild);
    await interaction.editReply({ embeds: [embed] });
  }
}

module.exports = { AccessAnalyticsCommand };
