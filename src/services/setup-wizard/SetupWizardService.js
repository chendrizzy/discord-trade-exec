/**
 * SetupWizardService - Orchestrates Guild Setup Wizard Flow
 *
 * Feature: 004-subscription-gating
 * Phase: 3 (User Story 1 - Initial Bot Setup)
 * Task: T024 - Implement SetupWizardService
 *
 * Purpose: Coordinate setup wizard interactions between Discord UI and backend services
 *
 * This service provides:
 * - Permission verification (MANAGE_GUILD requirement)
 * - Auto-detection of subscription-related roles
 * - Configuration creation via ServerConfigurationService
 * - Configuration updates (reconfiguration flow)
 * - Validation of subscription system availability
 *
 * Dependencies:
 * - ServerConfigurationService (configuration persistence and cache)
 * - DiscordSubscriptionProvider (Discord API integration)
 *
 * Performance: <2s for full wizard flow
 *
 * @see specs/004-subscription-gating/tasks.md - Phase 3
 */

const { PermissionFlagsBits } = require('discord.js');

// Subscription role name patterns (case-insensitive)
const SUBSCRIPTION_ROLE_PATTERNS = [
  /subscriber/i,
  /patron/i,
  /supporter/i,
  /member/i,
  /premium/i,
  /vip/i,
  /tier/i,
  /donation/i,
  /contributor/i
];

class SetupWizardService {
  /**
   * Create a SetupWizardService
   *
   * @param {ServerConfigurationService} configService - Configuration management service
   * @param {DiscordSubscriptionProvider} subscriptionProvider - Discord API provider
   * @throws {Error} If required services are not provided
   */
  constructor(configService, subscriptionProvider) {
    if (!configService) {
      throw new Error('ServerConfigurationService is required');
    }

    if (!subscriptionProvider) {
      throw new Error('DiscordSubscriptionProvider is required');
    }

    this.configService = configService;
    this.subscriptionProvider = subscriptionProvider;
  }

  /**
   * Verify if user has permission to configure guild settings
   *
   * Checks for MANAGE_GUILD permission (Discord's "Manage Server" permission)
   *
   * @param {string} guildId - Discord guild ID (17-19 digits)
   * @param {string} userId - Discord user ID (17-19 digits)
   * @returns {Promise<boolean>} True if user has permission
   * @throws {Error} If guild/user fetch fails
   */
  async verifyPermissions(guildId, userId) {
    try {
      // Fetch guild from Discord
      const guild = await this.subscriptionProvider.client.guilds.fetch(guildId);

      // Check if user is server owner (always has permission)
      if (guild.ownerId === userId) {
        return true;
      }

      // Fetch guild member
      const member = await guild.members.fetch(userId);

      // Check for MANAGE_GUILD permission
      return member.permissions.has(PermissionFlagsBits.ManageGuild);
    } catch (error) {
      throw new Error(`Failed to verify permissions: ${error.message}`);
    }
  }

  /**
   * Detect roles that appear to be subscription-related
   *
   * Scans guild roles for names matching subscription patterns like:
   * - "Subscriber", "Patron", "Supporter", "Member", "Premium"
   * - "VIP", "Tier 1", "Donation", "Contributor"
   *
   * Performance: <2s per Discord API constraints
   *
   * @param {string} guildId - Discord guild ID (17-19 digits)
   * @returns {Promise<Array>} Array of detected roles { id, name }
   * @throws {Error} If guild fetch fails
   */
  async detectSubscriptionRoles(guildId) {
    try {
      // Fetch guild from Discord
      const guild = await this.subscriptionProvider.client.guilds.fetch(guildId);

      // Get all roles
      const roles = Array.from(guild.roles.cache.values());

      // Filter roles matching subscription patterns
      const subscriptionRoles = roles.filter(role => {
        // Skip @everyone role
        if (role.name === '@everyone') {
          return false;
        }

        // Check if role name matches any subscription pattern
        return SUBSCRIPTION_ROLE_PATTERNS.some(pattern => pattern.test(role.name));
      });

      // Return simplified role objects
      return subscriptionRoles.map(role => ({
        id: role.id,
        name: role.name
      }));
    } catch (error) {
      throw new Error(`Failed to detect subscription roles: ${error.message}`);
    }
  }

  /**
   * Create initial guild configuration
   *
   * @param {string} guildId - Discord guild ID (17-19 digits)
   * @param {'subscription_required' | 'open_access'} accessMode - Access control mode
   * @param {string[]} requiredRoleIds - Role IDs (required if subscription_required)
   * @param {string} modifiedBy - Discord user ID of configuration creator
   * @returns {Promise<Object>} Created configuration
   * @throws {Error} If configuration creation fails or validation fails
   */
  async createConfiguration(guildId, accessMode, requiredRoleIds, modifiedBy) {
    try {
      // Delegate to ServerConfigurationService for persistence
      const config = await this.configService.createConfig(
        guildId,
        accessMode,
        requiredRoleIds,
        modifiedBy
      );

      return config;
    } catch (error) {
      // Re-throw validation errors
      if (error.message.includes('Invalid')) {
        throw error;
      }

      // Re-throw duplicate errors
      if (error.message.includes('already exists')) {
        throw error;
      }

      // Wrap other errors with context
      throw new Error(`Failed to create configuration: ${error.message}`);
    }
  }

  /**
   * Update existing guild configuration
   *
   * @param {string} guildId - Discord guild ID (17-19 digits)
   * @param {Object} updates - Partial configuration updates
   * @param {string} modifiedBy - Discord user ID making the change
   * @returns {Promise<Object>} Updated configuration
   * @throws {Error} If update fails or guild not found
   */
  async updateConfiguration(guildId, updates, modifiedBy) {
    try {
      // Delegate to ServerConfigurationService for persistence
      const config = await this.configService.updateConfig(
        guildId,
        updates,
        modifiedBy
      );

      return config;
    } catch (error) {
      // Re-throw validation errors
      if (error.message.includes('Invalid')) {
        throw error;
      }

      // Re-throw not found errors
      if (error.message.includes('not found')) {
        throw error;
      }

      // Wrap other errors with context
      throw new Error(`Failed to update configuration: ${error.message}`);
    }
  }

  /**
   * Check if guild already has a configuration
   *
   * @param {string} guildId - Discord guild ID (17-19 digits)
   * @returns {Promise<boolean>} True if configuration exists
   * @throws {Error} If check fails
   */
  async hasConfiguration(guildId) {
    try {
      return await this.configService.configExists(guildId);
    } catch (error) {
      throw new Error(`Failed to check configuration existence: ${error.message}`);
    }
  }

  /**
   * Get existing guild configuration
   *
   * @param {string} guildId - Discord guild ID (17-19 digits)
   * @returns {Promise<Object | null>} Configuration or null if not found
   * @throws {Error} If fetch fails
   */
  async getConfiguration(guildId) {
    try {
      return await this.configService.getConfig(guildId);
    } catch (error) {
      throw new Error(`Failed to get configuration: ${error.message}`);
    }
  }

  /**
   * Validate if guild has a subscription system
   *
   * Checks if guild has any roles that appear to be subscription-related.
   * Used to warn users if subscription gating is enabled but no subscription roles exist.
   *
   * @param {string} guildId - Discord guild ID (17-19 digits)
   * @returns {Promise<Object>} Validation result { hasSubscriptionSystem, detectedRoleCount, warning }
   * @throws {Error} If validation fails
   */
  async validateSubscriptionSystem(guildId) {
    try {
      const detectedRoles = await this.detectSubscriptionRoles(guildId);

      const hasSubscriptionSystem = detectedRoles.length > 0;

      return {
        hasSubscriptionSystem,
        detectedRoleCount: detectedRoles.length,
        warning: hasSubscriptionSystem
          ? null
          : 'No subscription roles detected in this server. Bot commands will be restricted to members with manually specified roles.'
      };
    } catch (error) {
      throw new Error(`Failed to validate subscription system: ${error.message}`);
    }
  }
}

module.exports = { SetupWizardService };
