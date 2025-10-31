/**
 * UserAccessStatus Mongoose Model
 *
 * Feature: 004-subscription-gating
 * Phase: 2 (Foundational)
 * Task: T009 - Implement UserAccessStatus Mongoose model with TTL
 *
 * Purpose: Cache subscription verification results for users in guilds
 *
 * Schema Design:
 * - Stores per-user, per-guild access verification cache
 * - hasAccess boolean indicates subscription status
 * - TTL index (60 seconds) for automatic cache expiry
 * - Compound unique index (guildId + userId) prevents duplicates
 * - Optional Discord API response storage for debugging
 *
 * Indexes:
 * - { guildId: 1, userId: 1 } (unique) - Primary lookup
 * - { expiresAt: 1 } (TTL: 0 seconds) - Automatic cache cleanup
 *
 * TTL: 60 seconds (cache expiry)
 *
 * @see specs/004-subscription-gating/data-model.md for complete specification
 */

const mongoose = require('mongoose');

const UserAccessStatusSchema = new mongoose.Schema(
  {
    // Discord guild ID (part of composite primary key)
    guildId: {
      type: String,
      required: true,
      match: /^\d{17,19}$/ // Discord snowflake pattern: 17-19 digits
    },

    // Discord user ID (part of composite primary key)
    userId: {
      type: String,
      required: true,
      match: /^\d{17,19}$/ // Discord user ID must be valid snowflake
    },

    // Whether user has access to the command
    hasAccess: {
      type: Boolean,
      required: true
    },

    // When this verification was performed
    verifiedAt: {
      type: Date,
      required: true,
      default: Date.now
    },

    // When this cache entry expires (verifiedAt + 60 seconds)
    expiresAt: {
      type: Date,
      required: true
    },

    // User's Discord role IDs at time of verification
    roleIds: [
      {
        type: String,
        match: [/^\d{17,19}$/, 'Each role ID must be a valid Discord snowflake (17-19 digits)']
      }
    ],

    // Raw Discord API response for debugging (optional)
    discordApiResponse: {
      type: mongoose.Schema.Types.Mixed,
      required: false
    }
  },
  {
    // Mongoose schema options
    timestamps: false, // Using custom verifiedAt field
    collection: 'user_access_statuses'
  }
);

// Compound unique index for guildId + userId (prevents duplicate cache entries)
UserAccessStatusSchema.index({ guildId: 1, userId: 1 }, { unique: true });

// TTL index for automatic cache cleanup after expiration
// expireAfterSeconds: 0 means MongoDB will delete the document immediately after expiresAt timestamp
UserAccessStatusSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Static methods
UserAccessStatusSchema.statics = {
  /**
   * Find cached access status for a user in a guild
   * @param {string} guildId - Discord guild ID
   * @param {string} userId - Discord user ID
   * @returns {Promise<UserAccessStatus|null>}
   */
  async findByGuildAndUser(guildId, userId) {
    return this.findOne({ guildId, userId });
  },

  /**
   * Find cached access status that hasn't expired yet
   * @param {string} guildId - Discord guild ID
   * @param {string} userId - Discord user ID
   * @returns {Promise<UserAccessStatus|null>}
   */
  async findValidCache(guildId, userId) {
    return this.findOne({
      guildId,
      userId,
      expiresAt: { $gt: new Date() } // Not expired yet
    });
  },

  /**
   * Create or update cache entry for user access status
   * @param {string} guildId - Discord guild ID
   * @param {string} userId - Discord user ID
   * @param {boolean} hasAccess - Whether user has access
   * @param {string[]} roleIds - User's Discord role IDs
   * @param {Object} discordApiResponse - Optional raw API response
   * @returns {Promise<UserAccessStatus>}
   */
  async cacheAccessStatus(guildId, userId, hasAccess, roleIds = [], discordApiResponse = null) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60000); // 60 seconds from now

    return this.findOneAndUpdate(
      { guildId, userId },
      {
        hasAccess,
        verifiedAt: now,
        expiresAt,
        roleIds,
        discordApiResponse
      },
      { upsert: true, new: true }
    );
  },

  /**
   * Delete all cache entries for a guild
   * @param {string} guildId - Discord guild ID
   * @returns {Promise<number>} - Number of deleted documents
   */
  async clearGuildCache(guildId) {
    const result = await this.deleteMany({ guildId });
    return result.deletedCount;
  },

  /**
   * Delete cache entry for a specific user in a guild
   * @param {string} guildId - Discord guild ID
   * @param {string} userId - Discord user ID
   * @returns {Promise<boolean>} - Whether a document was deleted
   */
  async clearUserCache(guildId, userId) {
    const result = await this.deleteOne({ guildId, userId });
    return result.deletedCount > 0;
  }
};

// Instance methods
UserAccessStatusSchema.methods = {
  /**
   * Check if this cache entry has expired
   * @returns {boolean}
   */
  isExpired() {
    return this.expiresAt < new Date();
  },

  /**
   * Check if this cache entry is still valid (not expired)
   * @returns {boolean}
   */
  isValid() {
    return !this.isExpired();
  },

  /**
   * Get time remaining until expiry in milliseconds
   * @returns {number}
   */
  getTimeRemaining() {
    return Math.max(0, this.expiresAt.getTime() - Date.now());
  }
};

// Export model
module.exports = mongoose.model('UserAccessStatus', UserAccessStatusSchema);
