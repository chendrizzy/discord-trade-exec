/**
 * AccessDenialEvent Mongoose Model
 *
 * Feature: 004-subscription-gating
 * Phase: 2 (Foundational)
 * Task: T010 - Implement AccessDenialEvent Mongoose model with TTL
 *
 * Purpose: Audit log for tracking when users are denied access to commands
 *
 * Schema Design:
 * - Stores all access denial events for analytics and debugging
 * - Tracks denial reasons (no_subscription, subscription_expired, verification_failed)
 * - Records user roles and required roles at time of denial
 * - TTL index (30 days) for automatic event expiry
 * - Compound indexes for analytics queries (by guild or user over time)
 *
 * Indexes:
 * - { guildId: 1, timestamp: -1 } - Guild analytics queries
 * - { userId: 1, timestamp: -1 } - User analytics queries
 * - { timestamp: -1 } (TTL: 2592000 seconds / 30 days) - Automatic cleanup
 *
 * TTL: 30 days (2592000 seconds)
 *
 * @see specs/004-subscription-gating/data-model.md for complete specification
 */

const mongoose = require('mongoose');

const AccessDenialEventSchema = new mongoose.Schema(
  {
    // Discord guild ID where denial occurred
    guildId: {
      type: String,
      required: true,
      match: /^\d{17,19}$/ // Discord snowflake pattern: 17-19 digits
    },

    // Discord user ID who was denied access
    userId: {
      type: String,
      required: true,
      match: /^\d{17,19}$/ // Discord user ID must be valid snowflake
    },

    // The command user attempted to use
    commandAttempted: {
      type: String,
      required: true
    },

    // Why access was denied
    denialReason: {
      type: String,
      required: true,
      enum: [
        'no_subscription',       // User doesn't have required subscription
        'subscription_expired',  // User's subscription has expired
        'verification_failed'    // Could not verify subscription status
      ]
    },

    // User's Discord role IDs at time of denial
    userRoleIds: [
      {
        type: String,
        match: [/^\d{17,19}$/, 'Each role ID must be a valid Discord snowflake (17-19 digits)']
      }
    ],

    // Required role IDs from server configuration at time of denial
    requiredRoleIds: [
      {
        type: String,
        match: [/^\d{17,19}$/, 'Each role ID must be a valid Discord snowflake (17-19 digits)']
      }
    ],

    // Whether user was informed of denial (for preventing spam)
    wasInformed: {
      type: Boolean,
      required: true,
      default: false
    },

    // When this denial event occurred
    timestamp: {
      type: Date,
      required: true,
      default: Date.now
    }
  },
  {
    // Mongoose schema options
    timestamps: false, // Using custom timestamp field
    collection: 'access_denial_events'
  }
);

// Compound index for guild analytics queries (sorted by timestamp descending)
AccessDenialEventSchema.index({ guildId: 1, timestamp: -1 });

// Compound index for user analytics queries (sorted by timestamp descending)
AccessDenialEventSchema.index({ userId: 1, timestamp: -1 });

// TTL index for automatic event cleanup after 30 days
// expireAfterSeconds: 2592000 (30 days in seconds)
AccessDenialEventSchema.index({ timestamp: -1 }, { expireAfterSeconds: 2592000 });

// Static methods
AccessDenialEventSchema.statics = {
  /**
   * Log an access denial event
   * @param {Object} eventData - Denial event details
   * @returns {Promise<AccessDenialEvent>}
   */
  async logDenial({ guildId, userId, commandAttempted, denialReason, userRoleIds = [], requiredRoleIds = [], wasInformed = false }) {
    return this.create({
      guildId,
      userId,
      commandAttempted,
      denialReason,
      userRoleIds,
      requiredRoleIds,
      wasInformed,
      timestamp: new Date()
    });
  },

  /**
   * Find denial events for a guild within a time range
   * @param {string} guildId - Discord guild ID
   * @param {Date} startDate - Start of time range
   * @param {Date} endDate - End of time range
   * @returns {Promise<AccessDenialEvent[]>}
   */
  async findByGuildAndTimeRange(guildId, startDate, endDate) {
    return this.find({
      guildId,
      timestamp: { $gte: startDate, $lte: endDate }
    }).sort({ timestamp: -1 });
  },

  /**
   * Find denial events for a user within a time range
   * @param {string} userId - Discord user ID
   * @param {Date} startDate - Start of time range
   * @param {Date} endDate - End of time range
   * @returns {Promise<AccessDenialEvent[]>}
   */
  async findByUserAndTimeRange(userId, startDate, endDate) {
    return this.find({
      userId,
      timestamp: { $gte: startDate, $lte: endDate }
    }).sort({ timestamp: -1 });
  },

  /**
   * Get denial statistics for a guild
   * @param {string} guildId - Discord guild ID
   * @param {Date} startDate - Start of analysis period
   * @returns {Promise<Object>} - Statistics object
   */
  async getGuildDenialStats(guildId, startDate = new Date(Date.now() - 86400000)) { // Default: last 24 hours
    return this.aggregate([
      {
        $match: {
          guildId,
          timestamp: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$denialReason',
          count: { $sum: 1 }
        }
      }
    ]);
  },

  /**
   * Get most denied users in a guild
   * @param {string} guildId - Discord guild ID
   * @param {number} limit - Number of users to return
   * @param {Date} startDate - Start of analysis period
   * @returns {Promise<Object[]>} - Array of {userId, denialCount}
   */
  async getMostDeniedUsers(guildId, limit = 10, startDate = new Date(Date.now() - 86400000)) {
    return this.aggregate([
      {
        $match: {
          guildId,
          timestamp: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$userId',
          denialCount: { $sum: 1 }
        }
      },
      {
        $sort: { denialCount: -1 }
      },
      {
        $limit: limit
      },
      {
        $project: {
          _id: 0,
          userId: '$_id',
          denialCount: 1
        }
      }
    ]);
  }
};

// Instance methods
AccessDenialEventSchema.methods = {
  /**
   * Check if this event is for a specific denial reason
   * @param {string} reason - Denial reason to check
   * @returns {boolean}
   */
  isDeniedFor(reason) {
    return this.denialReason === reason;
  },

  /**
   * Check if user was missing subscription
   * @returns {boolean}
   */
  isMissingSubscription() {
    return this.denialReason === 'no_subscription' || this.denialReason === 'subscription_expired';
  },

  /**
   * Check if verification failed
   * @returns {boolean}
   */
  isVerificationFailure() {
    return this.denialReason === 'verification_failed';
  }
};

// Export model
module.exports = mongoose.model('AccessDenialEvent', AccessDenialEventSchema);
