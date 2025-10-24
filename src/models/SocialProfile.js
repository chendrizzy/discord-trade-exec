'use strict';

/**
 * Social Profile Model
 *
 * Task: T053 [US11] - Add data structures for social trading (followers/leaderboard) schema
 * Story: US-011 (Social Trading & Copy Trading)
 *
 * Tracks social trading profiles, follower relationships, and leaderboard rankings.
 * This is a P3 priority feature for social/copy trading functionality.
 *
 * Constitutional Requirements:
 * - Principle VI: Observability (track social interactions and performance)
 * - Principle VII: Privacy & Security (hide sensitive trade details from followers)
 *
 * Features:
 * - Trader profiles with bio/avatar
 * - Follower/following relationships
 * - Performance metrics for leaderboards
 * - Copy trading settings (auto-copy, allocation %)
 * - Privacy controls (public/private/followers-only)
 *
 * @module models/SocialProfile
 */

const mongoose = require('mongoose');

const socialProfileSchema = new mongoose.Schema(
  {
    // User reference
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true
    },

    // Profile information
    displayName: {
      type: String,
      required: true,
      maxlength: 50,
      trim: true
    },

    bio: {
      type: String,
      maxlength: 500,
      trim: true
    },

    avatarUrl: {
      type: String,
      validate: {
        validator: function (v) {
          return !v || /^https?:\/\/.+/.test(v);
        },
        message: 'Avatar URL must be a valid HTTP/HTTPS URL'
      }
    },

    // Social stats
    followerCount: {
      type: Number,
      default: 0,
      min: 0,
      index: true
    },

    followingCount: {
      type: Number,
      default: 0,
      min: 0
    },

    // Performance metrics (for leaderboards)
    metrics: {
      totalTrades: {
        type: Number,
        default: 0,
        min: 0
      },

      winRate: {
        type: Number,
        default: 0,
        min: 0,
        max: 100 // Percentage
      },

      totalPnL: {
        type: Number,
        default: 0
      },

      totalPnLPercent: {
        type: Number,
        default: 0
      },

      avgHoldTime: {
        type: Number, // In seconds
        default: 0
      },

      sharpeRatio: {
        type: Number,
        default: 0,
        min: -10,
        max: 10
      },

      maxDrawdown: {
        type: Number,
        default: 0,
        min: 0,
        max: 100 // Percentage
      },

      // Time-based performance
      last7DaysPnLPercent: {
        type: Number,
        default: 0
      },

      last30DaysPnLPercent: {
        type: Number,
        default: 0
      },

      last90DaysPnLPercent: {
        type: Number,
        default: 0
      },

      ytdPnLPercent: {
        type: Number,
        default: 0
      },

      allTimePnLPercent: {
        type: Number,
        default: 0
      },

      // Consistency metrics
      profitableDaysPercent: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
      },

      consecutiveWins: {
        type: Number,
        default: 0,
        min: 0
      },

      consecutiveLosses: {
        type: Number,
        default: 0,
        min: 0
      },

      lastUpdated: {
        type: Date,
        default: Date.now
      }
    },

    // Leaderboard rankings
    rankings: {
      overall: {
        type: Number,
        default: 0,
        index: true
      },

      winRate: {
        type: Number,
        default: 0
      },

      totalReturn: {
        type: Number,
        default: 0
      },

      sharpeRatio: {
        type: Number,
        default: 0
      },

      consistency: {
        type: Number,
        default: 0
      }
    },

    // Copy trading settings
    copyTrading: {
      enabled: {
        type: Boolean,
        default: false,
        index: true
      },

      autoApproveFollowers: {
        type: Boolean,
        default: false
      },

      maxFollowers: {
        type: Number,
        default: 100,
        min: 0,
        max: 10000
      },

      minFollowerSubscriptionTier: {
        type: String,
        enum: ['free', 'basic', 'pro', 'premium'],
        default: 'free'
      },

      // Fee structure for copy trading
      performanceFee: {
        type: Number,
        default: 0,
        min: 0,
        max: 50 // Max 50% performance fee
      },

      subscriptionFee: {
        type: Number, // Monthly fee
        default: 0,
        min: 0
      }
    },

    // Privacy settings
    visibility: {
      type: String,
      enum: ['public', 'followers', 'private'],
      default: 'public',
      index: true
    },

    showTrades: {
      type: Boolean,
      default: true
    },

    showPortfolio: {
      type: Boolean,
      default: true
    },

    showPnL: {
      type: Boolean,
      default: true
    },

    // Verification status
    verified: {
      type: Boolean,
      default: false,
      index: true
    },

    verifiedAt: Date,

    // Featured/promoted profiles
    featured: {
      type: Boolean,
      default: false,
      index: true
    },

    featuredUntil: Date,

    // Social links
    socialLinks: {
      twitter: {
        type: String,
        validate: {
          validator: function (v) {
            return !v || /^https?:\/\/(www\.)?twitter\.com\//.test(v);
          },
          message: 'Twitter URL must be a valid Twitter profile link'
        }
      },

      discord: String,

      telegram: String,

      website: {
        type: String,
        validate: {
          validator: function (v) {
            return !v || /^https?:\/\/.+/.test(v);
          },
          message: 'Website must be a valid HTTP/HTTPS URL'
        }
      }
    },

    // Activity tracking
    lastTradeAt: Date,

    lastActiveAt: {
      type: Date,
      default: Date.now,
      index: true
    },

    // Moderation
    suspended: {
      type: Boolean,
      default: false,
      index: true
    },

    suspendedUntil: Date,

    suspensionReason: String
  },
  {
    timestamps: true
  }
);

// Indexes for leaderboard queries
socialProfileSchema.index({ 'metrics.last30DaysPnLPercent': -1 });
socialProfileSchema.index({ 'metrics.winRate': -1 });
socialProfileSchema.index({ 'metrics.sharpeRatio': -1 });
socialProfileSchema.index({ 'rankings.overall': 1 });
socialProfileSchema.index({ verified: 1, 'rankings.overall': 1 });

// Compound index for copy trading discovery
socialProfileSchema.index({
  'copyTrading.enabled': 1,
  visibility: 1,
  'rankings.overall': 1
});

// Instance methods
socialProfileSchema.methods.follow = async function (followerProfile) {
  // Increment follower count
  this.followerCount++;
  await this.save();

  // Increment following count on follower's profile
  followerProfile.followingCount++;
  await followerProfile.save();
};

socialProfileSchema.methods.unfollow = async function (followerProfile) {
  // Decrement counts
  if (this.followerCount > 0) this.followerCount--;
  if (followerProfile.followingCount > 0) followerProfile.followingCount--;

  await this.save();
  await followerProfile.save();
};

socialProfileSchema.methods.updateMetrics = async function (tradeData) {
  // Update performance metrics based on new trade data
  // This would be called after each trade execution

  this.metrics.totalTrades++;
  this.metrics.totalPnL += tradeData.pnl || 0;
  this.metrics.lastUpdated = new Date();
  this.lastTradeAt = new Date();

  // Recalculate win rate
  if (tradeData.pnl > 0) {
    // Win: Increase consecutive wins, reset losses
    this.metrics.consecutiveWins++;
    this.metrics.consecutiveLosses = 0;
  } else if (tradeData.pnl < 0) {
    // Loss: Increase consecutive losses, reset wins
    this.metrics.consecutiveLosses++;
    this.metrics.consecutiveWins = 0;
  }

  // TODO: Calculate Sharpe ratio, max drawdown, etc.
  // These require historical trade data analysis

  await this.save();
};

socialProfileSchema.methods.canAcceptFollower = function () {
  return (
    this.copyTrading.enabled &&
    this.followerCount < this.copyTrading.maxFollowers &&
    !this.suspended
  );
};

// Static methods
socialProfileSchema.statics.getLeaderboard = function (options = {}) {
  const {
    sortBy = 'totalReturn', // 'totalReturn', 'winRate', 'sharpeRatio', 'consistency'
    timeframe = 'last30Days', // 'last7Days', 'last30Days', 'ytd', 'allTime'
    limit = 100,
    verified = false
  } = options;

  const query = {
    visibility: 'public',
    suspended: false
  };

  if (verified) {
    query.verified = true;
  }

  // Determine sort field based on options
  let sortField = 'rankings.overall';
  if (sortBy === 'winRate') {
    sortField = 'metrics.winRate';
  } else if (sortBy === 'sharpeRatio') {
    sortField = 'metrics.sharpeRatio';
  } else if (sortBy === 'consistency') {
    sortField = 'metrics.profitableDaysPercent';
  } else if (sortBy === 'totalReturn') {
    // Use timeframe-specific PnL
    if (timeframe === 'last7Days') {
      sortField = 'metrics.last7DaysPnLPercent';
    } else if (timeframe === 'last30Days') {
      sortField = 'metrics.last30DaysPnLPercent';
    } else if (timeframe === 'ytd') {
      sortField = 'metrics.ytdPnLPercent';
    } else {
      sortField = 'metrics.allTimePnLPercent';
    }
  }

  return this.find(query)
    .sort({ [sortField]: -1 })
    .limit(limit)
    .populate('userId', 'username email subscriptionTier');
};

socialProfileSchema.statics.searchTraders = function (searchQuery, options = {}) {
  const { limit = 20 } = options;

  const query = {
    visibility: 'public',
    suspended: false,
    $or: [
      { displayName: { $regex: searchQuery, $options: 'i' } },
      { bio: { $regex: searchQuery, $options: 'i' } }
    ]
  };

  return this.find(query).limit(limit).populate('userId', 'username');
};

const SocialProfile = mongoose.model('SocialProfile', socialProfileSchema);

module.exports = SocialProfile;
