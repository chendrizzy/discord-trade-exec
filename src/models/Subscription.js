'use strict';

/**
 * Subscription Model
 *
 * Manages Polar.sh billing subscriptions
 *
 * FR-051-055: Polar.sh integration for billing
 * US-012: Subscription management
 */

const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true
    },

    // Polar.sh identifiers (UUID format)
    polarCustomerId: {
      type: String,
      required: true,
      match: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      index: true
    },

    polarSubscriptionId: {
      type: String,
      match: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      index: true
    },

    polarProductId: {
      type: String,
      match: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    },

    // Subscription details
    tier: {
      type: String,
      enum: ['free', 'basic', 'pro', 'enterprise'],
      default: 'free',
      required: true,
      index: true
    },

    status: {
      type: String,
      enum: [
        'active',
        'inactive',
        'trial',
        'cancelled',
        'past_due',
        'incomplete',
        'incomplete_expired',
        'trialing',
        'paused'
      ],
      default: 'trial',
      required: true,
      index: true
    },

    // Pricing
    amount: {
      type: Number,
      default: 0
    },

    currency: {
      type: String,
      default: 'USD',
      uppercase: true
    },

    interval: {
      type: String,
      enum: ['month', 'year'],
      default: 'month'
    },

    // Billing cycle
    currentPeriodStart: {
      type: Date,
      index: true
    },

    currentPeriodEnd: {
      type: Date,
      index: true
    },

    // Trial period
    trialStart: Date,

    trialEnd: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      index: true
    },

    // Cancellation
    cancelledAt: Date,

    cancelAtPeriodEnd: {
      type: Boolean,
      default: false
    },

    cancellationReason: String,

    // Payment
    lastPaymentDate: Date,

    lastPaymentAmount: Number,

    nextPaymentDate: {
      type: Date,
      index: true
    },

    paymentMethod: {
      type: String,
      last4: String,
      brand: String
    },

    // Tier limits (cached from plan)
    limits: {
      signalsPerDay: {
        type: Number,
        default: 10
      },
      maxBrokers: {
        type: Number,
        default: 1
      },
      maxPositions: {
        type: Number,
        default: 3
      },
      prioritySupport: {
        type: Boolean,
        default: false
      },
      advancedAnalytics: {
        type: Boolean,
        default: false
      },
      apiAccess: {
        type: Boolean,
        default: false
      }
    },

    // Webhook events (last 10)
    webhookEvents: [
      {
        event: String,
        timestamp: Date,
        data: mongoose.Schema.Types.Mixed
      }
    ],

    // Metadata
    metadata: {
      referralCode: String,
      discountCode: String,
      source: String // e.g., 'discord', 'web', 'referral'
    }
  },
  {
    timestamps: true
  }
);

// Indexes
subscriptionSchema.index({ status: 1, currentPeriodEnd: 1 });
subscriptionSchema.index({ tier: 1, status: 1 });
subscriptionSchema.index({ status: 1, nextPaymentDate: 1 });

// Methods
subscriptionSchema.methods.isActive = function () {
  const now = new Date();

  // Check trial period
  if (this.status === 'trial' && this.trialEnd > now) {
    return true;
  }

  // Check active subscription
  if (this.status === 'active' && this.currentPeriodEnd > now) {
    return true;
  }

  return false;
};

subscriptionSchema.methods.isTrialing = function () {
  const now = new Date();
  return this.status === 'trial' && this.trialEnd > now;
};

subscriptionSchema.methods.daysUntilExpiry = function () {
  const now = new Date();
  let expiryDate;

  if (this.status === 'trial') {
    expiryDate = this.trialEnd;
  } else {
    expiryDate = this.currentPeriodEnd;
  }

  if (!expiryDate) {
    return null;
  }

  const daysRemaining = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
  return daysRemaining;
};

subscriptionSchema.methods.cancel = async function (reason = null, immediate = false) {
  this.cancelledAt = new Date();
  this.cancellationReason = reason;

  if (immediate) {
    this.status = 'cancelled';
    this.currentPeriodEnd = new Date();
  } else {
    this.cancelAtPeriodEnd = true;
  }

  await this.save();
};

subscriptionSchema.methods.reactivate = async function () {
  if (this.cancelledAt) {
    this.cancelledAt = null;
    this.cancelAtPeriodEnd = false;
    this.cancellationReason = null;
    this.status = 'active';
    await this.save();
  }
};

subscriptionSchema.methods.upgrade = async function (newTier, newAmount) {
  this.tier = newTier;
  this.amount = newAmount;
  this.status = 'active';

  // Update limits based on tier
  const tierLimits = this.getTierLimits(newTier);
  this.limits = tierLimits;

  await this.save();
};

subscriptionSchema.methods.downgrade = async function (newTier, newAmount) {
  this.tier = newTier;
  this.amount = newAmount;
  this.cancelAtPeriodEnd = true; // Downgrade at period end

  // Limits will update at period end
  await this.save();
};

subscriptionSchema.methods.updatePeriod = async function (periodStart, periodEnd) {
  this.currentPeriodStart = periodStart;
  this.currentPeriodEnd = periodEnd;
  this.nextPaymentDate = periodEnd;
  await this.save();
};

subscriptionSchema.methods.recordPayment = async function (amount, date = new Date()) {
  this.lastPaymentDate = date;
  this.lastPaymentAmount = amount;
  this.status = 'active';
  await this.save();
};

subscriptionSchema.methods.markPastDue = async function () {
  this.status = 'past_due';
  await this.save();
};

subscriptionSchema.methods.addWebhookEvent = async function (event, data) {
  this.webhookEvents.unshift({
    event,
    timestamp: new Date(),
    data
  });

  // Keep only last 10 events
  if (this.webhookEvents.length > 10) {
    this.webhookEvents = this.webhookEvents.slice(0, 10);
  }

  await this.save();
};

subscriptionSchema.methods.getTierLimits = function (tier = this.tier) {
  const limits = {
    free: {
      signalsPerDay: 10,
      maxBrokers: 1,
      maxPositions: 3,
      prioritySupport: false,
      advancedAnalytics: false,
      apiAccess: false
    },
    basic: {
      signalsPerDay: 100,
      maxBrokers: 2,
      maxPositions: 10,
      prioritySupport: false,
      advancedAnalytics: false,
      apiAccess: false
    },
    pro: {
      signalsPerDay: Infinity,
      maxBrokers: 5,
      maxPositions: 50,
      prioritySupport: true,
      advancedAnalytics: true,
      apiAccess: true
    },
    enterprise: {
      signalsPerDay: Infinity,
      maxBrokers: Infinity,
      maxPositions: Infinity,
      prioritySupport: true,
      advancedAnalytics: true,
      apiAccess: true
    }
  };

  return limits[tier] || limits.free;
};

// Static methods
subscriptionSchema.statics.findActiveSubscriptions = function () {
  return this.find({
    status: { $in: ['active', 'trial', 'trialing'] },
    $or: [{ currentPeriodEnd: { $gt: new Date() } }, { trialEnd: { $gt: new Date() } }]
  });
};

subscriptionSchema.statics.findExpiringSoon = function (days = 7) {
  const now = new Date();
  const futureDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  return this.find({
    status: { $in: ['active', 'trial'] },
    $or: [
      {
        currentPeriodEnd: {
          $gt: now,
          $lte: futureDate
        }
      },
      {
        trialEnd: {
          $gt: now,
          $lte: futureDate
        }
      }
    ]
  });
};

subscriptionSchema.statics.findPastDue = function () {
  return this.find({
    status: 'past_due'
  });
};

subscriptionSchema.statics.calculateMRR = async function () {
  const activeSubscriptions = await this.find({
    status: 'active',
    interval: 'month'
  });

  let mrr = 0;
  activeSubscriptions.forEach(sub => {
    mrr += sub.amount;
  });

  // Convert annual to monthly
  const annualSubscriptions = await this.find({
    status: 'active',
    interval: 'year'
  });

  annualSubscriptions.forEach(sub => {
    mrr += sub.amount / 12;
  });

  return mrr;
};

const Subscription = mongoose.model('Subscription', subscriptionSchema);

module.exports = Subscription;
