/**
 * Setup Configure Access Command
 *
 * Feature: 004-subscription-gating
 * Phase: 3 (User Story 1 - Initial Bot Setup)
 * Task: T025 - Implement /setup configure-access command with button UI
 *
 * Purpose: Discord slash command for guild access control configuration
 *
 * This command provides:
 * - Interactive setup wizard via buttons and select menus
 * - Subscription Required vs Open Access mode selection
 * - Auto-detected subscription role suggestions
 * - Permission verification (MANAGE_GUILD required)
 * - Configuration persistence via SetupWizardService
 * - Reconfiguration support for existing guilds
 *
 * User Flow:
 * 1. User invokes /setup configure-access
 * 2. Bot verifies user has MANAGE_GUILD permission
 * 3. Bot displays mode selection buttons (Subscription Required / Open Access)
 * 4. If Subscription Required: Shows role selection dropdown
 * 5. Bot saves configuration and confirms success
 *
 * @see specs/004-subscription-gating/tasks.md - Phase 3, T025
 */

const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  PermissionFlagsBits
} = require('discord.js');

const { SetupWizardService } = require('@services/setup-wizard/SetupWizardService');
const { ServerConfigurationService } = require('@services/subscription/ServerConfigurationService');
const { DiscordSubscriptionProvider } = require('@services/subscription/DiscordSubscriptionProvider');
const ServerConfiguration = require('@models/ServerConfiguration');
const logger = require('@utils/logger');

class SetupConfigureAccessCommand {
  /**
   * Create a SetupConfigureAccessCommand
   *
   * @param {Client} client - Discord.js client instance
   */
  constructor(client) {
    this.client = client;

    // Initialize services
    this.subscriptionProvider = new DiscordSubscriptionProvider(client);
    this.configService = new ServerConfigurationService(ServerConfiguration);
    this.setupWizardService = new SetupWizardService(
      this.configService,
      this.subscriptionProvider
    );

    // Command definition
    this.data = new SlashCommandBuilder()
      .setName('setup')
      .setDescription('Configure bot settings for your server')
      .addSubcommand(subcommand =>
        subcommand
          .setName('configure-access')
          .setDescription('Configure access control for bot commands')
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
  }

  /**
   * Execute the setup command
   *
   * @param {CommandInteraction} interaction - Discord interaction object
   */
  async execute(interaction) {
    try {
      // Verify permissions
      const hasPermission = await this.setupWizardService.verifyPermissions(
        interaction.guildId,
        interaction.user.id
      );

      if (!hasPermission) {
        await interaction.reply({
          content: '❌ **Permission Denied**\n\nYou need the **Manage Server** permission to configure access control.',
          ephemeral: true
        });
        return;
      }

      // Check if configuration already exists
      const existingConfig = await this.setupWizardService.getConfiguration(interaction.guildId);

      // Build initial message
      let content = '## 🔧 Server Access Control Setup\n\n';

      if (existingConfig) {
        content += `**Current Configuration**: ${existingConfig.accessMode === 'subscription_required' ? '🔒 Subscription Required' : '🌐 Open Access'}\n\n`;
        content += 'You can reconfigure your access control settings below.';
      } else {
        content += 'Configure how users can access bot commands in this server.\n\n';
        content += '**🔒 Subscription Required**: Only users with specific roles can use bot commands\n';
        content += '**🌐 Open Access**: All server members can use bot commands';
      }

      // Create mode selection buttons
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('setup_subscription_required')
          .setLabel('🔒 Subscription Required')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('setup_open_access')
          .setLabel('🌐 Open Access')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({
        content,
        components: [row],
        ephemeral: true
      });

      logger.info('Setup wizard initiated', {
        guildId: interaction.guildId,
        userId: interaction.user.id,
        hasExistingConfig: !!existingConfig
      });
    } catch (error) {
      logger.error('Setup command execution error:', {
        error: error.message,
        stack: error.stack,
        guildId: interaction.guildId
      });

      const errorMessage = interaction.replied || interaction.deferred
        ? { content: '❌ An error occurred while starting the setup wizard. Please try again.', ephemeral: true }
        : { content: '❌ An error occurred. Please try again.', ephemeral: true };

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
      if (interaction.customId === 'setup_subscription_required') {
        await this.handleSubscriptionRequiredButton(interaction);
      } else if (interaction.customId === 'setup_open_access') {
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
    // Detect subscription roles
    const detectedRoles = await this.setupWizardService.detectSubscriptionRoles(
      interaction.guildId
    );

    // Validate subscription system
    const validation = await this.setupWizardService.validateSubscriptionSystem(
      interaction.guildId
    );

    let content = '## 🔒 Subscription Required Mode\n\n';
    content += 'Select which roles should have access to bot commands.\n\n';

    if (!validation.hasSubscriptionSystem) {
      content += '⚠️ **Warning**: ' + validation.warning + '\n\n';
    } else {
      content += `✅ Detected ${validation.detectedRoleCount} subscription-related role(s)\n\n`;
    }

    // Get all guild roles (excluding @everyone)
    const guild = await this.client.guilds.fetch(interaction.guildId);
    const allRoles = Array.from(guild.roles.cache.values())
      .filter(role => role.name !== '@everyone')
      .sort((a, b) => b.position - a.position); // Sort by position (higher roles first)

    // Create role select menu
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('setup_role_select')
      .setPlaceholder('Select roles that grant access...')
      .setMinValues(1)
      .setMaxValues(Math.min(allRoles.length, 25)); // Discord limit is 25 options

    // Add roles to select menu
    for (const role of allRoles.slice(0, 25)) {
      const isDetected = detectedRoles.some(dr => dr.id === role.id);
      const option = new StringSelectMenuOptionBuilder()
        .setLabel(role.name)
        .setValue(role.id);

      if (isDetected) {
        option.setDescription('✨ Auto-detected subscription role');
        option.setDefault(false);
      }

      selectMenu.addOptions(option);
    }

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.update({
      content,
      components: [row],
      ephemeral: true
    });

    logger.info('Subscription required mode selected', {
      guildId: interaction.guildId,
      userId: interaction.user.id,
      detectedRolesCount: detectedRoles.length
    });
  }

  /**
   * Handle "Open Access" button click
   *
   * @param {ButtonInteraction} interaction - Discord button interaction
   * @private
   */
  async handleOpenAccessButton(interaction) {
    // Save open access configuration
    const config = await this.setupWizardService.createConfiguration(
      interaction.guildId,
      'open_access',
      [],
      interaction.user.id
    );

    logger.info('Open access configuration saved', {
      guildId: interaction.guildId,
      userId: interaction.user.id
    });

    await interaction.update({
      content: '✅ **Setup Complete!**\n\n🌐 **Open Access** mode is now enabled.\n\nAll server members can use bot commands.',
      components: [],
      ephemeral: true
    });
  }

  /**
   * Handle select menu interactions
   *
   * @param {SelectMenuInteraction} interaction - Discord select menu interaction
   */
  async handleSelectMenu(interaction) {
    try {
      if (interaction.customId === 'setup_role_select') {
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
    const selectedRoleIds = interaction.values;

    // Save subscription required configuration
    const config = await this.setupWizardService.createConfiguration(
      interaction.guildId,
      'subscription_required',
      selectedRoleIds,
      interaction.user.id
    );

    // Get role names for confirmation message
    const guild = await this.client.guilds.fetch(interaction.guildId);
    const roleNames = selectedRoleIds.map(roleId => {
      const role = guild.roles.cache.get(roleId);
      return role ? role.name : roleId;
    });

    logger.info('Subscription required configuration saved', {
      guildId: interaction.guildId,
      userId: interaction.user.id,
      roleCount: selectedRoleIds.length
    });

    let content = '✅ **Setup Complete!**\n\n';
    content += '🔒 **Subscription Required** mode is now enabled.\n\n';
    content += '**Authorized Roles**:\n';
    content += roleNames.map(name => `• ${name}`).join('\n');
    content += '\n\nOnly users with these roles can use bot commands.';

    await interaction.update({
      content,
      components: [],
      ephemeral: true
    });
  }
}

module.exports = SetupConfigureAccessCommand;
