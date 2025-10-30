/**
 * ServerConfigurationService - Guild Configuration Management
 *
 * Feature: 004-subscription-gating
 * Phase: 2 (Foundational)
 * Task: T019 - Implement ServerConfigurationService with in-memory cache
 *
 * Purpose: Manage guild subscription configurations with efficient caching
 *
 * This service provides:
 * - Guild configuration CRUD operations
 * - In-memory caching for fast access
 * - Cache invalidation on updates
 * - Discord snowflake validation
 * - Mongoose integration
 *
 * Performance: <10ms for cache hits, <100ms for DB operations
 *
 * @see specs/004-subscription-gating/contracts/subscription-verification-api.md
 */

// Discord snowflake validation pattern (17-19 digits)
const DISCORD_SNOWFLAKE_PATTERN = /^\d{17,19}$/;

// Valid access modes
const ACCESS_MODES = ['subscription_required', 'open_access'];

class ServerConfigurationService {
  /**
   * Create a ServerConfigurationService
   *
   * @param {import('mongoose').Model} configModel - Mongoose ServerConfiguration model
   * @throws {Error} If model is not provided
   */
  constructor(configModel) {
    if (!configModel) {
      throw new Error('Mongoose model is required');
    }

    this.configModel = configModel;

    // In-memory cache: Map<guildId, config>
    this.cache = new Map();
  }

  /**
   * Validate Discord snowflake ID format
   *
   * @param {string} id - ID to validate
   * @param {string} type - Type of ID (for error message)
   * @throws {Error} If ID format is invalid
   * @private
   */
  _validateSnowflake(id, type) {
    if (!DISCORD_SNOWFLAKE_PATTERN.test(id)) {
      throw new Error(
        `Invalid ${type} ID format. Expected 17-19 digit Discord snowflake.`
      );
    }
  }

  /**
   * Validate access mode
   *
   * @param {string} mode - Access mode to validate
   * @throws {Error} If access mode is invalid
   * @private
   */
  _validateAccessMode(mode) {
    if (!ACCESS_MODES.includes(mode)) {
      throw new Error(
        `Invalid access mode: ${mode}. Expected one of: ${ACCESS_MODES.join(', ')}`
      );
    }
  }

  /**
   * Invalidate cache for a specific guild
   *
   * @param {string} guildId - Guild ID to invalidate
   * @private
   */
  _invalidateCache(guildId) {
    this.cache.delete(guildId);
  }

  /**
   * Get configuration for a guild (with in-memory cache)
   *
   * @param {string} guildId - Discord guild ID (17-19 digits)
   * @returns {Promise<Object | null>} Guild configuration or null if not found
   * @throws {Error} If database operation fails
   */
  async getConfig(guildId) {
    // Validate input
    this._validateSnowflake(guildId, 'guild');

    // Check cache first
    if (this.cache.has(guildId)) {
      const cached = this.cache.get(guildId);

      // Validate cache integrity - ensure it's an object with expected structure
      if (typeof cached === 'object' && cached !== null && cached.guildId) {
        return cached;
      }

      // Cache corrupted - clear it and fetch from DB
      this.cache.delete(guildId);
    }

    try {
      // Fetch from database
      const config = await this.configModel.findOne({ guildId });

      if (!config) {
        return null;
      }

      // Convert Mongoose document to plain object
      const plainConfig = config.toObject ? config.toObject() : config;

      // Cache the result
      this.cache.set(guildId, plainConfig);

      return plainConfig;
    } catch (error) {
      throw new Error(`Database error: ${error.message}`);
    }
  }

  /**
   * Create initial configuration for a new guild
   *
   * @param {string} guildId - Discord guild ID (17-19 digits)
   * @param {'subscription_required' | 'open_access'} accessMode - Access control mode
   * @param {string[]} requiredRoleIds - Role IDs (required if subscription_required)
   * @param {string} modifiedBy - Discord user ID of server owner
   * @returns {Promise<Object>} Created configuration
   * @throws {Error} If creation fails or validation fails
   */
  async createConfig(guildId, accessMode, requiredRoleIds, modifiedBy) {
    // Validate inputs
    this._validateSnowflake(guildId, 'guild');
    this._validateAccessMode(accessMode);
    this._validateSnowflake(modifiedBy, 'user');

    // Validate requiredRoleIds
    if (accessMode === 'subscription_required') {
      if (!Array.isArray(requiredRoleIds) || requiredRoleIds.length === 0) {
        throw new Error('Required role IDs array cannot be empty for subscription_required mode');
      }

      // Validate each role ID
      for (const roleId of requiredRoleIds) {
        this._validateSnowflake(roleId, 'role');
      }
    }

    try {
      // Create configuration
      const config = await this.configModel.create({
        guildId,
        accessMode,
        requiredRoleIds: requiredRoleIds || [],
        modifiedBy,
        modifiedAt: new Date()
      });

      // Invalidate cache (in case there was old data)
      this._invalidateCache(guildId);

      // Convert to plain object
      return config.toObject ? config.toObject() : config;
    } catch (error) {
      // Handle duplicate key error
      if (error.message.includes('E11000') || error.message.includes('duplicate key')) {
        throw new Error(`Configuration for guild ${guildId} already exists`);
      }

      throw new Error(`Database error: ${error.message}`);
    }
  }

  /**
   * Update existing configuration
   *
   * @param {string} guildId - Discord guild ID (17-19 digits)
   * @param {Object} updates - Partial configuration updates
   * @param {string} modifiedBy - Discord user ID making the change
   * @returns {Promise<Object>} Updated configuration
   * @throws {Error} If update fails or guild not found
   */
  async updateConfig(guildId, updates, modifiedBy) {
    // Validate inputs
    this._validateSnowflake(guildId, 'guild');
    this._validateSnowflake(modifiedBy, 'user');

    // Prevent updating guildId
    if (updates.guildId) {
      throw new Error('Cannot update guild ID');
    }

    // Validate access mode if being updated
    if (updates.accessMode) {
      this._validateAccessMode(updates.accessMode);
    }

    // Validate role IDs if being updated
    if (updates.requiredRoleIds) {
      if (!Array.isArray(updates.requiredRoleIds)) {
        throw new Error('Required role IDs must be an array');
      }

      for (const roleId of updates.requiredRoleIds) {
        this._validateSnowflake(roleId, 'role');
      }
    }

    try {
      // Update configuration
      const config = await this.configModel.findOneAndUpdate(
        { guildId },
        {
          ...updates,
          modifiedBy,
          modifiedAt: new Date()
        },
        { new: true }
      );

      if (!config) {
        throw new Error(`Guild ${guildId} not found`);
      }

      // Invalidate cache
      this._invalidateCache(guildId);

      // Convert to plain object
      return config.toObject ? config.toObject() : config;
    } catch (error) {
      // Re-throw "not found" errors
      if (error.message.includes('not found')) {
        throw error;
      }

      throw new Error(`Database error: ${error.message}`);
    }
  }

  /**
   * Check if guild has a configuration
   *
   * @param {string} guildId - Discord guild ID (17-19 digits)
   * @returns {Promise<boolean>} True if config exists
   * @throws {Error} If database operation fails
   */
  async configExists(guildId) {
    // Validate input
    this._validateSnowflake(guildId, 'guild');

    try {
      const result = await this.configModel.exists({ guildId });
      return result !== null;
    } catch (error) {
      throw new Error(`Database error: ${error.message}`);
    }
  }
}

module.exports = { ServerConfigurationService };
