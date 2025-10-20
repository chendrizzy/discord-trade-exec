// External dependencies
const mongoose = require('mongoose');

// Internal utilities and services
const { tenantScopingPlugin } = require('../plugins/tenantScoping');

const userSignalSubscriptionSchema = new mongoose.Schema(
  {
    // Multi-tenant: Community reference (TENANT ISOLATION)
    communityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Community',
      required: true,
      index: true
    },

    // User reference
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // Signal provider reference
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SignalProvider',
      required: true,
      index: true
    },

    // Subscription status
    active: {
      type: Boolean,
      default: true,
      index: true
    },

    // Auto-execution settings (override user defaults for this provider)
    autoExecute: {
      type: Boolean,
      default: null // null = use user default, true/false = override
    },

    // Position sizing (override user defaults for this provider)
    positionSizing: {
      enabled: {
        type: Boolean,
        default: false
      },
      method: {
        type: String,
        enum: ['percentage', 'fixed_amount', 'kelly_criterion'],
        default: 'percentage'
      },
      percentagePerTrade: {
        type: Number,
        min: 0.1,
        max: 100,
        default: 2 // 2% of portfolio
      },
      fixedAmount: {
        type: Number,
        min: 0
      }
    },

    // Risk management overrides
    riskManagement: {
      enabled: {
        type: Boolean,
        default: false
      },
      stopLossOverride: {
        type: Number,
        min: 0,
        max: 100 // percentage
      },
      takeProfitOverride: {
        type: Number,
        min: 0,
        max: 100 // percentage
      },
      maxLeverageOverride: {
        type: Number,
        min: 1,
        max: 125
      }
    },

    // Notification preferences
    notifications: {
      enabled: {
        type: Boolean,
        default: true
      },
      channels: {
        discord: {
          type: Boolean,
          default: true
        },
        email: {
          type: Boolean,
          default: false
        },
        sms: {
          type: Boolean,
          default: false
        }
      },
      events: {
        onSignal: {
          type: Boolean,
          default: true
        },
        onExecution: {
          type: Boolean,
          default: true
        },
        onProfit: {
          type: Boolean,
          default: false
        },
        onLoss: {
          type: Boolean,
          default: true
        }
      }
    },

    // Subscription metadata
    subscribedAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    unsubscribedAt: Date,

    // Performance tracking
    stats: {
      signalsReceived: {
        type: Number,
        default: 0
      },
      signalsExecuted: {
        type: Number,
        default: 0
      },
      tradesSuccessful: {
        type: Number,
        default: 0
      },
      tradesFailed: {
        type: Number,
        default: 0
      },
      totalPnL: {
        type: Number,
        default: 0
      },
      lastSignalAt: Date,
      lastExecutionAt: Date
    },

    // User rating/feedback for this provider
    userRating: {
      rating: {
        type: Number,
        min: 1,
        max: 5
      },
      comment: String,
      ratedAt: Date
    },

    // Subscription tier (if provider offers tiered access)
    tier: {
      type: String,
      enum: ['free', 'basic', 'premium', 'elite'],
      default: 'free'
    }
  },
  {
    timestamps: true
  }
);

// Unique compound index - one subscription per user per provider
userSignalSubscriptionSchema.index(
  { userId: 1, providerId: 1 },
  { unique: true }
);

// Indexes for performance
userSignalSubscriptionSchema.index({ communityId: 1, userId: 1, active: 1 });
userSignalSubscriptionSchema.index({ communityId: 1, providerId: 1, active: 1 });
userSignalSubscriptionSchema.index({ userId: 1, active: 1, subscribedAt: -1 });

// Methods
userSignalSubscriptionSchema.methods.recordSignalReceived = async function () {
  this.stats.signalsReceived += 1;
  this.stats.lastSignalAt = new Date();
  await this.save();
};

userSignalSubscriptionSchema.methods.recordExecution = async function (success, pnl = 0) {
  this.stats.signalsExecuted += 1;
  this.stats.lastExecutionAt = new Date();

  if (success) {
    this.stats.tradesSuccessful += 1;
  } else {
    this.stats.tradesFailed += 1;
  }

  this.stats.totalPnL += pnl;
  await this.save();
};

userSignalSubscriptionSchema.methods.unsubscribe = async function () {
  this.active = false;
  this.unsubscribedAt = new Date();
  await this.save();
};

userSignalSubscriptionSchema.methods.resubscribe = async function () {
  this.active = true;
  this.unsubscribedAt = null;
  await this.save();
};

userSignalSubscriptionSchema.methods.rateProvider = async function (rating, comment = '') {
  this.userRating = {
    rating,
    comment,
    ratedAt: new Date()
  };
  await this.save();

  // Update provider's overall rating
  const SignalProvider = mongoose.model('SignalProvider');
  const provider = await SignalProvider.findById(this.providerId);

  if (provider) {
    await provider.addReview(this.userId, rating, comment);
  }
};

// Static methods
userSignalSubscriptionSchema.statics.getActiveSubscriptions = function (userId) {
  return this.find({ userId, active: true })
    .populate('providerId', 'name performance verificationStatus')
    .sort({ subscribedAt: -1 });
};

userSignalSubscriptionSchema.statics.getUserProviderSubscription = function (userId, providerId) {
  return this.findOne({ userId, providerId });
};

userSignalSubscriptionSchema.statics.getProviderSubscribers = function (providerId, activeOnly = true) {
  const query = { providerId };
  if (activeOnly) {
    query.active = true;
  }

  return this.find(query)
    .populate('userId', 'discordUsername subscription.tier')
    .sort({ subscribedAt: -1 });
};

userSignalSubscriptionSchema.statics.getTopSubscribedProviders = async function (communityId, limit = 10) {
  const result = await this.aggregate([
    {
      $match: {
        communityId,
        active: true
      }
    },
    {
      $group: {
        _id: '$providerId',
        subscriberCount: { $sum: 1 },
        avgPnL: { $avg: '$stats.totalPnL' },
        totalSignalsExecuted: { $sum: '$stats.signalsExecuted' }
      }
    },
    {
      $sort: { subscriberCount: -1 }
    },
    {
      $limit: limit
    }
  ]);

  // Populate provider details
  const SignalProvider = mongoose.model('SignalProvider');
  const providers = await SignalProvider.find({
    _id: { $in: result.map(r => r._id) }
  });

  return result.map(r => {
    const provider = providers.find(p => p._id.toString() === r._id.toString());
    return {
      provider,
      subscriberCount: r.subscriberCount,
      avgPnL: r.avgPnL,
      totalSignalsExecuted: r.totalSignalsExecuted
    };
  });
};

// Apply tenant scoping plugin for automatic communityId filtering
userSignalSubscriptionSchema.plugin(tenantScopingPlugin);

const UserSignalSubscription = mongoose.model('UserSignalSubscription', userSignalSubscriptionSchema);

module.exports = UserSignalSubscription;
