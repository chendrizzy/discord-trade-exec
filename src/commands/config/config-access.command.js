/**
 * Config Access Command
 *
 * Feature: 004-subscription-gating
 * Phase: 7 (User Story 4 - Server Owner Reconfigures Access Control)
 * Task: T056 - Implement /config access command
 *
 * Purpose: Allow server owners to reconfigure access control settings
 *
 * This command provides:
 * - Reconfiguration of subscription-gated vs open access mode
 * - Modification of required roles
 * - Configuration change confirmation messages with impact details (T058)
 * - Permission verification (MANAGE_GUILD required) (T057)
 * - Cache invalidation on changes (T059)
 * - <60 second propagation SLA (T060)
 *
 * User Flow:
 * 1. User invokes /config access
 * 2. Bot verifies user has MANAGE_GUILD permission (T057)
 * 3. Bot displays current configuration
 * 4. Bot displays mode selection buttons (Subscription Required / Open Access)
 * 5. If Subscription Required: Shows role selection dropdown
 * 6. Bot saves configuration and shows confirmation message (T058)
 * 7. Cache is invalidated for instant propagation (T059)
 *
 * @see specs/004-subscription-gating/tasks.md - Phase 7, T056-T060
 */

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  PermissionFlagsBits,
  EmbedBuilder
} = require('discord.js');

const { ServerConfigurationService } = require('@services/subscription/ServerConfigurationService');
const { DiscordSubscriptionProvider } = require('@services/subscription/DiscordSubscriptionProvider');
const ServerConfiguration = require('@models/ServerConfiguration');
const logger = require('@utils/logger');

class ConfigAccessCommand {
  /**
   * Create a ConfigAccessCommand
   *
   * @param {Client} client - Discord.js client instance
   */
  constructor(client) {
    this.client = client;

    // Initialize services
    this.subscriptionProvider = new DiscordSubscriptionProvider(client);
    this.configService = new ServerConfigurationService(ServerConfiguration);

    // Command definition
    this.data = new SlashCommandBuilder()
      .setName('config')
      .setDescription('Manage bot configuration for your server')
      .addSubcommand(subcommand =>
        subcommand
          .setName('access')
          .setDescription('Reconfigure access control settings')
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
  }

  /**
   * Execute the config command
   *
   * @param {CommandInteraction} interaction - Discord interaction object
   */
  async execute(interaction) {
    try {
      // Verify permissions (T057)
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({
          content: '❌ **Permission Denied**\n\nYou need the **Manage Server** permission to configure access control.',
          ephemeral: true
        });
        return;
      }

      // Get existing configuration
      const existingConfig = await this.configService.getConfig(interaction.guildId);

      if (!existingConfig) {
        await interaction.reply({
          content: '❌ **No Configuration Found**\n\nPlease use `/setup configure-access` to set up access control first.',
          ephemeral: true
        });
        return;
      }

      // Build configuration status message
      const currentMode = existingConfig.accessMode === 'subscription_required'
        ? '🔒 Subscription Required'
        : '🌐 Open Access';

      let content = '## 🔧 Reconfigure Access Control\n\n';
      content += `**Current Configuration**: ${currentMode}\n\n`;

      if (existingConfig.accessMode === 'subscription_required') {
        content += '**Required Roles**:\n';
        const guild = await this.client.guilds.fetch(interaction.guildId);
        const roleNames = existingConfig.requiredRoleIds
          .map(roleId => {
            const role = guild.roles.cache.get(roleId);
            return role ? `• ${role.name}` : `• Unknown Role (${roleId})`;
          })
          .join('\n');
        content += roleNames || '• No roles configured';
        content += '\n\n';
      }

      content += 'Choose a new configuration below:';

      // Create mode selection buttons
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('config_subscription_required')
          .setLabel('🔒 Subscription Required')
          .setStyle(
            existingConfig.accessMode === 'subscription_required'
              ? ButtonStyle.Primary
              : ButtonStyle.Secondary
          ),
        new ButtonBuilder()
          .setCustomId('config_open_access')
          .setLabel('🌐 Open Access')
          .setStyle(
            existingConfig.accessMode === 'open_access'
              ? ButtonStyle.Primary
              : ButtonStyle.Secondary
          )
      );

      await interaction.reply({
        content,
        components: [row],
        ephemeral: true
      });

      logger.info('Config access command initiated', {
        guildId: interaction.guildId,
        userId: interaction.user.id,
        currentMode: existingConfig.accessMode
      });
    } catch (error) {
      logger.error('Config command execution error:', {
        error: error.message,
        stack: error.stack,
        guildId: interaction.guildId
      });

      const errorMessage = {
        content: '❌ An error occurred while loading configuration. Please try again.',
        ephemeral: true
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.editReply(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    }
  }

  /**
   * Handle button interactions
   *
   * @param {ButtonInteraction} interaction - Discord button interaction
   */
  async handleButton(interaction) {
    try {
      if (interaction.customId === 'config_subscription_required') {
        await this.handleSubscriptionRequiredButton(interaction);
      } else if (interaction.customId === 'config_open_access') {
        await this.handleOpenAccessButton(interaction);
      }
    } catch (error) {
      logger.error('Button interaction error:', {
        error: error.message,
        stack: error.stack,
        customId: interaction.customId
      });

      await interaction.update({
        content: '❌ An error occurred. Please try again later.',
        components: [],
        ephemeral: true
      });
    }
  }

  /**
   * Handle "Subscription Required" button click
   *
   * @param {ButtonInteraction} interaction - Discord button interaction
   * @private
   */
  async handleSubscriptionRequiredButton(interaction) {
    // Get current configuration to check if it's changing
    const existingConfig = await this.configService.getConfig(interaction.guildId);

    let content = '## 🔒 Subscription Required Mode\n\n';
    content += 'Select which roles should have access to bot commands.\n\n';

    // Get all guild roles (excluding @everyone)
    const guild = await this.client.guilds.fetch(interaction.guildId);
    const allRoles = Array.from(guild.roles.cache.values())
      .filter(role => role.name !== '@everyone')
      .sort((a, b) => b.position - a.position); // Sort by position

    // Create role select menu
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('config_role_select')
      .setPlaceholder('Select roles that grant access...')
      .setMinValues(1)
      .setMaxValues(Math.min(allRoles.length, 25));

    // Add roles to select menu
    for (const role of allRoles.slice(0, 25)) {
      const isCurrentlyRequired = existingConfig.requiredRoleIds?.includes(role.id);
      const option = new StringSelectMenuOptionBuilder()
        .setLabel(role.name)
        .setValue(role.id);

      if (isCurrentlyRequired) {
        option.setDescription('✅ Currently required');
        option.setDefault(true);
      }

      selectMenu.addOptions(option);
    }

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.update({
      content,
      components: [row],
      ephemeral: true
    });

    logger.info('Subscription required mode selected for reconfiguration', {
      guildId: interaction.guildId,
      userId: interaction.user.id
    });
  }

  /**
   * Handle "Open Access" button click
   *
   * @param {ButtonInteraction} interaction - Discord button interaction
   * @private
   */
  async handleOpenAccessButton(interaction) {
    const startTime = Date.now();

    try {
      // Get existing configuration
      const existingConfig = await this.configService.getConfig(interaction.guildId);

      // Update to open access configuration (T056, T059)
      await this.configService.updateConfig(
        interaction.guildId,
        {
          accessMode: 'open_access',
          requiredRoleIds: []
        },
        interaction.user.id
      );

      const duration = Date.now() - startTime;

      logger.info('Configuration updated to open access', {
        guildId: interaction.guildId,
        userId: interaction.user.id,
        previousMode: existingConfig.accessMode,
        duration
      });

      // Build confirmation embed (T058)
      const embed = this.buildConfirmationEmbed(
        existingConfig.accessMode,
        'open_access',
        existingConfig.requiredRoleIds,
        [],
        interaction.guild
      );

      await interaction.update({
        content: null,
        embeds: [embed],
        components: [],
        ephemeral: true
      });
    } catch (error) {
      logger.error('Error updating to open access:', {
        error: error.message,
        stack: error.stack,
        guildId: interaction.guildId
      });

      await interaction.update({
        content: '❌ An error occurred while updating configuration. Please try again.',
        components: [],
        ephemeral: true
      });
    }
  }

  /**
   * Handle select menu interactions
   *
   * @param {SelectMenuInteraction} interaction - Discord select menu interaction
   */
  async handleSelectMenu(interaction) {
    try {
      if (interaction.customId === 'config_role_select') {
        await this.handleRoleSelection(interaction);
      }
    } catch (error) {
      logger.error('Select menu interaction error:', {
        error: error.message,
        stack: error.stack,
        customId: interaction.customId
      });

      await interaction.update({
        content: '❌ An error occurred while saving configuration. Please try again.',
        components: [],
        ephemeral: true
      });
    }
  }

  /**
   * Handle role selection from dropdown
   *
   * @param {SelectMenuInteraction} interaction - Discord select menu interaction
   * @private
   */
  async handleRoleSelection(interaction) {
    const startTime = Date.now();
    const selectedRoleIds = interaction.values;

    try {
      // Get existing configuration
      const existingConfig = await this.configService.getConfig(interaction.guildId);

      // Update subscription required configuration (T056, T059)
      await this.configService.updateConfig(
        interaction.guildId,
        {
          accessMode: 'subscription_required',
          requiredRoleIds: selectedRoleIds
        },
        interaction.user.id
      );

      const duration = Date.now() - startTime;

      logger.info('Configuration updated to subscription required', {
        guildId: interaction.guildId,
        userId: interaction.user.id,
        previousMode: existingConfig.accessMode,
        roleCount: selectedRoleIds.length,
        duration
      });

      // Build confirmation embed (T058)
      const embed = this.buildConfirmationEmbed(
        existingConfig.accessMode,
        'subscription_required',
        existingConfig.requiredRoleIds || [],
        selectedRoleIds,
        interaction.guild
      );

      await interaction.update({
        content: null,
        embeds: [embed],
        components: [],
        ephemeral: true
      });
    } catch (error) {
      logger.error('Error updating to subscription required:', {
        error: error.message,
        stack: error.stack,
        guildId: interaction.guildId
      });

      await interaction.update({
        content: '❌ An error occurred while saving configuration. Please try again.',
        components: [],
        ephemeral: true
      });
    }
  }

  /**
   * Build confirmation embed with impact details (T058)
   *
   * @param {string} previousMode - Previous access mode
   * @param {string} newMode - New access mode
   * @param {string[]} previousRoles - Previous required role IDs
   * @param {string[]} newRoles - New required role IDs
   * @param {Guild} guild - Discord guild object
   * @returns {EmbedBuilder} Confirmation embed
   * @private
   */
  buildConfirmationEmbed(previousMode, newMode, previousRoles, newRoles, guild) {
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('✅ Configuration Updated Successfully')
      .setTimestamp();

    // Mode change description
    const modeChanged = previousMode !== newMode;
    if (modeChanged) {
      const previousModeLabel = previousMode === 'subscription_required'
        ? '🔒 Subscription Required'
        : '🌐 Open Access';
      const newModeLabel = newMode === 'subscription_required'
        ? '🔒 Subscription Required'
        : '🌐 Open Access';

      embed.addFields({
        name: '📋 Access Mode Changed',
        value: `${previousModeLabel} → ${newModeLabel}`,
        inline: false
      });
    }

    // New configuration details
    if (newMode === 'open_access') {
      embed.addFields({
        name: '🌐 Open Access',
        value: 'All server members can now use bot commands.',
        inline: false
      });
    } else if (newMode === 'subscription_required') {
      const roleNames = newRoles.map(roleId => {
        const role = guild.roles.cache.get(roleId);
        return role ? role.name : `Unknown (${roleId})`;
      });

      embed.addFields({
        name: '🔒 Required Roles',
        value: roleNames.map(name => `• ${name}`).join('\n') || 'No roles configured',
        inline: false
      });
    }

    // Impact statement
    let impact = '';
    if (modeChanged) {
      if (newMode === 'open_access') {
        impact = '⚠️ Users who previously needed roles will now have immediate access.';
      } else if (newMode === 'subscription_required') {
        impact = '⚠️ Users without the required roles will lose access immediately.';
      }
    } else {
      // Roles changed within subscription_required mode
      impact = '⚠️ Access permissions have been updated. Changes take effect immediately.';
    }

    embed.addFields({
      name: '📢 Impact',
      value: impact,
      inline: false
    });

    // Propagation information (T060)
    embed.setFooter({
      text: 'Changes propagate instantly via cache invalidation (<60s SLA)'
    });

    return embed;
  }
}

module.exports = ConfigAccessCommand;
