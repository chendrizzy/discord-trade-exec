// External dependencies
const mongoose = require('mongoose');

const { Schema } = mongoose;

/**
 * Admin Schema - Defines community administrators
 */
const AdminSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'moderator'],
      required: true
    },
    permissions: [
      {
        type: String,
        enum: [
          'manage_signals',
          'manage_users',
          'manage_settings',
          'view_analytics',
          'execute_trades',
          'manage_billing'
        ]
      }
    ],
    addedAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

/**
 * Webhook Configuration Schema
 */
const WebhookConfigSchema = new Schema(
  {
    signalChannelIds: [
      {
        type: String,
        trim: true
      }
    ],
    executionChannelId: {
      type: String,
      trim: true
    },
    alertChannelId: {
      type: String,
      trim: true
    }
  },
  { _id: false }
);

/**
 * Trading Hours Window Schema
 */
const TradingWindowSchema = new Schema(
  {
    start: {
      type: String,
      required: true,
      match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ // HH:MM format
    },
    end: {
      type: String,
      required: true,
      match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ // HH:MM format
    }
  },
  { _id: false }
);

/**
 * Community Settings Schema
 */
const CommunitySettingsSchema = new Schema(
  {
    autoExecute: {
      type: Boolean,
      default: false
    },
    defaultRiskProfile: {
      type: String,
      enum: ['conservative', 'moderate', 'aggressive'],
      default: 'moderate'
    },
    maxPositionSize: {
      type: Number,
      min: 0,
      max: 1000000 // $1M max position
    },
    allowedAssetClasses: [
      {
        type: String,
        enum: ['stocks', 'options', 'crypto', 'futures', 'forex']
      }
    ],
    tradingHours: {
      enabled: {
        type: Boolean,
        default: false
      },
      timezone: {
        type: String,
        default: 'America/New_York'
      },
      windows: [TradingWindowSchema]
    }
  },
  { _id: false }
);

/**
 * Subscription Schema
 */
const SubscriptionSchema = new Schema(
  {
    tier: {
      type: String,
      enum: ['free', 'professional', 'enterprise'],
      default: 'free'
    },
    status: {
      type: String,
      enum: ['trial', 'active', 'past_due', 'canceled'],
      default: 'trial'
    },
    // Polar.sh identifiers (UUID format)
    polarCustomerId: {
      type: String,
      match: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    },
    polarSubscriptionId: {
      type: String,
      match: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    },
    polarOrganizationId: {
      type: String,
      match: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    },
    currentPeriodEnd: Date,
    cancelAtPeriodEnd: Boolean,
    trialEndsAt: {
      type: Date,
      default: () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14-day trial
    }
  },
  { _id: false }
);

/**
 * Community Schema - Tenant entity for multi-tenant architecture
 */
const CommunitySchema = new Schema(
  {
    // Basic information
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
      index: true
    },

    // Discord server integration
    discordGuildId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    // Community administrators
    admins: {
      type: [AdminSchema],
      validate: [
        {
          validator: function (admins) {
            // Must have exactly one owner
            return admins.filter(a => a.role === 'owner').length === 1;
          },
          message: 'Community must have exactly one owner'
        }
      ]
    },

    // Discord webhook configuration
    webhookConfig: {
      type: WebhookConfigSchema,
      default: () => ({})
    },

    // Community-level trading settings
    settings: {
      type: CommunitySettingsSchema,
      default: () => ({})
    },

    // Subscription and billing
    subscription: {
      type: SubscriptionSchema,
      default: () => ({})
    },

    // Community tier limits (server-based)
    limits: {
      memberCount: {
        type: Number,
        default: 10 // Free tier default
      },
      signalProvidersCount: {
        type: Number,
        default: 2 // Free tier default
      },
      signalsPerDay: {
        type: Number,
        default: 50 // Free tier default
      }
    },

    // Security: Per-tenant encryption key ID
    encryptionKeyId: {
      type: String,
      required: false // Will be set when first credential is added
    },

    // Encrypted Data Encryption Key (encrypted by AWS KMS CMK)
    encryptedDEK: {
      type: String,
      required: false
    },

    // Key rotation tracking
    dekGeneratedAt: Date,
    lastDEKRotation: Date,

    // Security: Optional IP whitelist
    ipWhitelist: [
      {
        type: String,
        trim: true
      }
    ],

    // Soft delete support (GDPR compliance)
    deletedAt: {
      type: Date,
      default: null
      // Removed index: true - covered by sparse schema index below
    }
  },
  {
    timestamps: true, // createdAt, updatedAt
    collection: 'communities'
  }
);

// Indexes for performance
CommunitySchema.index({ 'subscription.status': 1 });
CommunitySchema.index({ 'subscription.tier': 1 });
CommunitySchema.index({ deletedAt: 1 }, { sparse: true });
CommunitySchema.index({ name: 'text' }); // Text search

// **Instance Methods**

/**
 * Soft delete community
 */
CommunitySchema.methods.softDelete = async function () {
  this.deletedAt = new Date();
  return await this.save();
};

/**
 * Check if subscription is active
 */
CommunitySchema.methods.isSubscriptionActive = function () {
  const now = new Date();

  // Check trial period
  if (this.subscription.status === 'trial' && this.subscription.trialEndsAt > now) {
    return true;
  }

  // Check active subscription
  if (this.subscription.status === 'active' && this.subscription.currentPeriodEnd > now) {
    return true;
  }

  return false;
};

/**
 * Check if user is admin in this community
 */
CommunitySchema.methods.isAdmin = function (userId) {
  return this.admins.some(
    admin => admin.userId.toString() === userId.toString() && ['owner', 'admin'].includes(admin.role)
  );
};

/**
 * Check if user is owner of this community
 */
CommunitySchema.methods.isOwner = function (userId) {
  return this.admins.some(admin => admin.userId.toString() === userId.toString() && admin.role === 'owner');
};

/**
 * Check if user has specific permission
 */
CommunitySchema.methods.hasPermission = function (userId, permission) {
  const admin = this.admins.find(admin => admin.userId.toString() === userId.toString());

  if (!admin) return false;

  // Owners have all permissions
  if (admin.role === 'owner') return true;

  // Check specific permission
  return admin.permissions.includes(permission);
};

/**
 * Add admin to community
 */
CommunitySchema.methods.addAdmin = async function (userId, role = 'admin', permissions = []) {
  // Check if user is already an admin
  const existingAdmin = this.admins.find(admin => admin.userId.toString() === userId.toString());

  if (existingAdmin) {
    throw new Error('User is already an admin');
  }

  // Cannot have multiple owners
  if (role === 'owner') {
    throw new Error('Community already has an owner');
  }

  this.admins.push({
    userId,
    role,
    permissions,
    addedAt: new Date()
  });

  return await this.save();
};

/**
 * Remove admin from community
 */
CommunitySchema.methods.removeAdmin = async function (userId) {
  const admin = this.admins.find(admin => admin.userId.toString() === userId.toString());

  if (!admin) {
    throw new Error('User is not an admin');
  }

  // Cannot remove owner
  if (admin.role === 'owner') {
    throw new Error('Cannot remove community owner');
  }

  this.admins = this.admins.filter(admin => admin.userId.toString() !== userId.toString());

  return await this.save();
};

/**
 * Update admin role or permissions
 */
CommunitySchema.methods.updateAdmin = async function (userId, updates) {
  const admin = this.admins.find(admin => admin.userId.toString() === userId.toString());

  if (!admin) {
    throw new Error('User is not an admin');
  }

  // Cannot change owner role
  if (admin.role === 'owner' && updates.role !== 'owner') {
    throw new Error('Cannot change owner role');
  }

  // Cannot set multiple owners
  if (updates.role === 'owner') {
    throw new Error('Community already has an owner');
  }

  if (updates.role) admin.role = updates.role;
  if (updates.permissions) admin.permissions = updates.permissions;

  return await this.save();
};

// **Static Methods**

/**
 * Find all active communities (not soft-deleted)
 */
CommunitySchema.statics.findActive = function (filter = {}) {
  return this.find({ ...filter, deletedAt: null });
};

/**
 * Find community by Discord Guild ID
 */
CommunitySchema.statics.findByDiscordGuild = function (discordGuildId) {
  return this.findOne({ discordGuildId, deletedAt: null });
};

/**
 * Get communities where user is admin
 */
CommunitySchema.statics.findByAdmin = function (userId) {
  return this.find({
    'admins.userId': userId,
    deletedAt: null
  });
};

/**
 * Get active subscribers (trial or active subscription)
 */
CommunitySchema.statics.getActiveSubscribers = function () {
  const now = new Date();
  return this.find({
    deletedAt: null,
    $or: [
      {
        'subscription.status': 'trial',
        'subscription.trialEndsAt': { $gt: now }
      },
      {
        'subscription.status': 'active',
        'subscription.currentPeriodEnd': { $gt: now }
      }
    ]
  });
};

/**
 * Search communities by name
 */
CommunitySchema.statics.searchByName = function (searchText) {
  return this.find({
    $text: { $search: searchText },
    deletedAt: null
  }).sort({ score: { $meta: 'textScore' } });
};

const Community = mongoose.model('Community', CommunitySchema);

module.exports = Community;
