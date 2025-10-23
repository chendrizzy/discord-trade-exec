// External dependencies
const mongoose = require('mongoose');
const logger = require('../utils/logger');

const securityAuditSchema = new mongoose.Schema(
  {
    // Tenant isolation
    communityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Community',
      required: true,
      index: true
    },

    // Actor (who performed the action)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    userRole: {
      type: String,
      enum: ['owner', 'admin', 'moderator', 'trader', 'viewer', 'system'],
      required: true
    },
    username: String,

    // Action details (what was done)
    action: {
      type: String,
      required: true,
      enum: [
        // Authentication & Authorization
        'auth.login',
        'auth.logout',
        'auth.token_refresh',
        'auth.failed_login',
        'auth.password_change',
        'auth.mfa_enable',
        'auth.mfa_disable',

        // OAuth2 Authentication (Broker Connections)
        'auth.oauth2_token_exchange',
        'auth.oauth2_refresh_token',
        'auth.oauth2_revoke_token',
        'auth.oauth2_connection_failed',
        'auth.oauth2_csrf_validation_failed',

        // User Management
        'user.create',
        'user.update',
        'user.delete',
        'user.view',
        'user.role_change',
        'user.permission_grant',
        'user.permission_revoke',

        // Community Management
        'community.create',
        'community.update',
        'community.delete',
        'community.settings_change',
        'community.subscription_change',

        // Credential Management (HIGH RISK)
        'credential.create',
        'credential.view',
        'credential.update',
        'credential.delete',
        'credential.encrypt',
        'credential.decrypt',

        // Trading Operations
        'trade.create',
        'trade.view',
        'trade.update',
        'trade.delete',
        'trade.cancel',
        'trade.stats',
        'signal.create',
        'signal.view',
        'signal.update',
        'signal.delete',
        'signal.leaderboard',
        'signal.provider_subscribe',
        'signal.provider_unsubscribe',
        'signal.provider_review',
        'signal.provider_list',
        'signal.provider_settings',

        // Security Events
        'security.cross_tenant_attempt',
        'security.unauthorized_access',
        'security.suspicious_activity',
        'security.rate_limit_exceeded',
        'security.encryption_key_rotation',
        'security.data_export',
        'security.alert_generated',
        'security.cooldown_applied',

        // Admin Operations
        'admin.user_suspend',
        'admin.user_restore',
        'admin.data_access',
        'admin.audit_view',
        'admin.settings_override',
        'admin.dashboard_view',
        'admin.user_list'
      ],
      index: true
    },

    // Resource details (what was affected)
    resourceType: {
      type: String,
      required: true,
      enum: ['User', 'Community', 'Trade', 'SignalProvider', 'Credential', 'Settings', 'System'],
      index: true
    },
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true
    },

    // Operation details
    operation: {
      type: String,
      enum: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'EXECUTE'],
      required: true
    },

    // Result
    status: {
      type: String,
      enum: ['success', 'failure', 'blocked'],
      required: true,
      index: true
    },
    statusCode: Number,

    // Error details (if failed)
    errorMessage: String,
    errorCode: String,
    errorStack: String,

    // Request context
    requestId: {
      type: String,
      index: true
    },
    ipAddress: {
      type: String,
      required: true,
      index: true
    },
    userAgent: String,
    endpoint: String,
    httpMethod: String,

    // Data snapshots (for forensics)
    dataBefore: mongoose.Schema.Types.Mixed,
    dataAfter: mongoose.Schema.Types.Mixed,
    changes: [String],

    // Security metadata
    riskLevel: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'low',
      index: true
    },
    requiresReview: {
      type: Boolean,
      default: false,
      index: true
    },
    reviewedAt: Date,
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },

    // Performance metrics
    duration: Number,
    timestamp: {
      type: Date,
      default: Date.now,
      required: true
      // Removed index: true - covered by 8 compound indexes + TTL index below
    }
  },
  {
    timestamps: false,
    collection: 'security_audits'
  }
);

// Compound indexes for common queries
securityAuditSchema.index({ communityId: 1, timestamp: -1 });
securityAuditSchema.index({ communityId: 1, userId: 1, timestamp: -1 });
securityAuditSchema.index({ communityId: 1, action: 1, timestamp: -1 });
securityAuditSchema.index({ communityId: 1, status: 1, timestamp: -1 });
securityAuditSchema.index({ communityId: 1, riskLevel: 1, timestamp: -1 });
securityAuditSchema.index({ communityId: 1, requiresReview: 1, timestamp: -1 });
securityAuditSchema.index({ resourceType: 1, resourceId: 1, timestamp: -1 });

// Text search for investigation
securityAuditSchema.index({ action: 'text', errorMessage: 'text', endpoint: 'text' });

// TTL index for automatic deletion after 7 years (SOC 2 compliance)
securityAuditSchema.index(
  { timestamp: 1 },
  {
    expireAfterSeconds: 7 * 365 * 24 * 60 * 60 // 7 years
  }
);

// Static method: Log security event
securityAuditSchema.statics.log = async function (data) {
  try {
    const audit = new this(data);
    await audit.save();
    return audit;
  } catch (error) {
    logger.error('[SecurityAudit] Failed to log event:', { error: error.message, stack: error.stack });
    // Don't throw - audit logging failure shouldn't break application
    return null;
  }
};

// Static method: Get user activity
securityAuditSchema.statics.getUserActivity = async function (communityId, userId, limit = 100) {
  return await this.find({ communityId, userId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .select('-dataBefore -dataAfter -errorStack');
};

// Static method: Get suspicious activity
securityAuditSchema.statics.getSuspiciousActivity = async function (communityId, hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  return await this.find({
    communityId,
    timestamp: { $gte: since },
    $or: [{ status: 'blocked' }, { riskLevel: { $in: ['high', 'critical'] } }, { action: { $regex: /^security\./ } }]
  })
    .sort({ timestamp: -1 })
    .populate('userId', 'discordUsername discordId');
};

// Static method: Get failed access attempts
securityAuditSchema.statics.getFailedAttempts = async function (communityId, userId, hours = 1) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  return await this.countDocuments({
    communityId,
    userId,
    timestamp: { $gte: since },
    status: 'failure',
    action: { $regex: /^auth\./ }
  });
};

// Static method: Get audit trail for resource
securityAuditSchema.statics.getResourceAuditTrail = async function (resourceType, resourceId, limit = 50) {
  return await this.find({ resourceType, resourceId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .populate('userId', 'discordUsername');
};

const SecurityAudit = mongoose.model('SecurityAudit', securityAuditSchema);

module.exports = SecurityAudit;
