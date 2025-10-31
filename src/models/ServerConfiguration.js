/**
 * ServerConfiguration Mongoose Model
 *
 * Feature: 004-subscription-gating
 * Phase: 2 (Foundational)
 * Task: T008 - Implement ServerConfiguration Mongoose model
 *
 * Purpose: Stores access control configuration for each Discord server (guild)
 *
 * Schema Design:
 * - Stores per-guild subscription gating configuration
 * - Two modes: 'subscription_required' (monetization) or 'open_access' (community)
 * - Required role IDs define which Discord roles grant access
 * - Soft delete support via isActive flag
 * - Audit trail via lastModified and modifiedBy fields
 *
 * Indexes:
 * - { guildId: 1 } (unique) - Primary lookup
 * - { isActive: 1, guildId: 1 } - Active configurations query
 *
 * TTL: None (indefinite retention with soft delete)
 *
 * @see specs/004-subscription-gating/data-model.md for complete specification
 */

const mongoose = require('mongoose');

const ServerConfigurationSchema = new mongoose.Schema(
  {
    // Discord guild ID (primary key)
    guildId: {
      type: String,
      required: true,
      unique: true, // Creates unique index automatically
      match: /^\d{17,19}$/ // Discord snowflake pattern: 17-19 digits
    },

    // Access control mode
    accessControlMode: {
      type: String,
      required: true,
      enum: ['subscription_required', 'open_access']
    },

    // Discord role IDs that grant access (empty array if open_access mode)
    requiredRoleIds: [
      {
        type: String,
        match: [/^\d{17,19}$/, 'Each role ID must be a valid Discord snowflake (17-19 digits)']
      }
    ],

    // Timestamp of last configuration change
    lastModified: {
      type: Date,
      required: true,
      default: Date.now
    },

    // Discord user ID who made last change
    modifiedBy: {
      type: String,
      required: true,
      match: /^\d{17,19}$/ // Discord user ID must be valid snowflake
    },

    // When configuration was first created
    createdAt: {
      type: Date,
      required: true,
      default: Date.now
    },

    // Soft delete flag (false = deleted, true = active)
    isActive: {
      type: Boolean,
      required: true,
      default: true
    }
  },
  {
    // Mongoose schema options
    timestamps: false, // Using custom createdAt/lastModified fields
    collection: 'server_configurations'
  }
);

// Compound index for querying active configurations
ServerConfigurationSchema.index({ isActive: 1, guildId: 1 });

// Ensure indexes are built (called in tests)
ServerConfigurationSchema.statics.ensureIndexes = async function() {
  await this.init(); // Wait for indexes to be built
  return this.listIndexes();
};

// Pre-save hook to update lastModified timestamp
ServerConfigurationSchema.pre('save', function (next) {
  if (!this.isNew) {
    this.lastModified = new Date();
  }
  next();
});

// Static methods
ServerConfigurationSchema.statics = {
  /**
   * Find active configuration for a guild
   * @param {string} guildId - Discord guild ID
   * @returns {Promise<ServerConfiguration|null>}
   */
  async findActiveByGuildId(guildId) {
    return this.findOne({ guildId, isActive: true });
  },

  /**
   * Soft delete a configuration
   * @param {string} guildId - Discord guild ID
   * @param {string} modifiedBy - Discord user ID performing deletion
   * @returns {Promise<ServerConfiguration|null>}
   */
  async softDelete(guildId, modifiedBy) {
    return this.findOneAndUpdate(
      { guildId },
      { isActive: false, modifiedBy, lastModified: new Date() },
      { new: true }
    );
  },

  /**
   * Restore a soft-deleted configuration
   * @param {string} guildId - Discord guild ID
   * @param {string} modifiedBy - Discord user ID performing restoration
   * @returns {Promise<ServerConfiguration|null>}
   */
  async restore(guildId, modifiedBy) {
    return this.findOneAndUpdate(
      { guildId },
      { isActive: true, modifiedBy, lastModified: new Date() },
      { new: true }
    );
  }
};

// Instance methods
ServerConfigurationSchema.methods = {
  /**
   * Check if server requires subscriptions
   * @returns {boolean}
   */
  requiresSubscription() {
    return this.accessControlMode === 'subscription_required';
  },

  /**
   * Check if server allows open access
   * @returns {boolean}
   */
  allowsOpenAccess() {
    return this.accessControlMode === 'open_access';
  },

  /**
   * Check if a role ID grants access
   * @param {string} roleId - Discord role ID to check
   * @returns {boolean}
   */
  roleGrantsAccess(roleId) {
    return this.requiredRoleIds.includes(roleId);
  },

  /**
   * Check if any of the user's roles grant access
   * @param {string[]} userRoleIds - Array of user's Discord role IDs
   * @returns {boolean}
   */
  userHasRequiredRole(userRoleIds) {
    if (this.allowsOpenAccess()) {
      return true; // Open access - no role required
    }
    return userRoleIds.some(roleId => this.roleGrantsAccess(roleId));
  }
};

// Export model
module.exports = mongoose.model('ServerConfiguration', ServerConfigurationSchema);
