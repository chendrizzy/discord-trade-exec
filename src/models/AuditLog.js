'use strict';

const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * AuditLog Schema - Immutable append-only logging with cryptographic integrity
 *
 * Constitutional Requirements:
 * - Principle I: Security-First (OWASP A09:2021 - Security Logging Failures)
 * - Principle VI: Observability & Operational Transparency
 *
 * Features:
 * - Append-only (no updates/deletes allowed via RBAC)
 * - Cryptographic hash chaining (blockchain-style integrity)
 * - 7-year retention (SEC/FinCEN compliance)
 * - Indexed for fast queries by userId, action, timestamp
 */

const auditLogSchema = new mongoose.Schema(
  {
    // Timestamp (indexed for time-range queries)
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
      index: true
    },

    // User who performed the action (indexed for per-user queries)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // Action type (indexed for filtering by operation)
    action: {
      type: String,
      required: true,
      enum: [
        // Trading operations
        'TRADE_EXECUTED',
        'ORDER_CANCELLED',
        'POSITION_OPENED',
        'POSITION_CLOSED',
        'STOP_LOSS_TRIGGERED',

        // Financial operations
        'FUNDS_DEPOSITED',
        'FUNDS_WITHDRAWN',
        'SUBSCRIPTION_CHARGED',
        'SUBSCRIPTION_REFUNDED',
        'PAYMENT_FAILED',

        // Authentication/Security
        'LOGIN_SUCCESS',
        'LOGIN_FAILED',
        'LOGOUT',
        'PASSWORD_CHANGED',
        'CREDENTIALS_UPDATED',
        'SESSION_HIJACK_DETECTED',
        'UNAUTHORIZED_ACCESS_ATTEMPT',
        'TOKEN_REFRESH',

        // Broker operations
        'BROKER_CONNECTED',
        'BROKER_DISCONNECTED',
        'BROKER_AUTH_FAILED',
        'BROKER_RATE_LIMIT_EXCEEDED',

        // Risk management
        'DAILY_LOSS_LIMIT_REACHED',
        'POSITION_SIZE_REDUCED',
        'CIRCUIT_BREAKER_TRIGGERED',

        // System operations
        'DATA_EXPORT',
        'SETTINGS_UPDATED',
        'WEBHOOK_RECEIVED'
      ],
      index: true
    },

    // Resource type that was affected
    resourceType: {
      type: String,
      required: true,
      enum: ['User', 'Trade', 'Position', 'BrokerConnection', 'Subscription', 'AuditLog', 'Session', 'Webhook']
    },

    // Resource ID that was affected
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: false // Some actions (LOGIN_FAILED) may not have a resource
    },

    // IP address of the actor
    ipAddress: {
      type: String,
      required: true,
      validate: {
        validator: function (v) {
          // Basic IPv4/IPv6 validation
          const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
          const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
          return ipv4Regex.test(v) || ipv6Regex.test(v);
        },
        message: 'Invalid IP address format'
      }
    },

    // User agent (browser/app identifier)
    userAgent: {
      type: String,
      required: false,
      maxlength: 500
    },

    // Status of the operation
    status: {
      type: String,
      required: true,
      enum: ['success', 'failure'],
      index: true
    },

    // Error message (only populated on failure)
    errorMessage: {
      type: String,
      required: false,
      maxlength: 1000
    },

    // Additional context (JSON object for flexibility)
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      required: false
      // Example metadata:
      // - Trade: { symbol, quantity, price, orderType }
      // - Login: { failureReason, attemptCount }
      // - Broker: { brokerType, errorCode }
    },

    // Cryptographic integrity fields (blockchain-style chaining)
    previousHash: {
      type: String,
      required: false, // First entry has no previous hash
      length: 64 // SHA-256 produces 64-character hex string
    },

    currentHash: {
      type: String,
      required: true,
      length: 64,
      unique: true // Ensures no duplicate entries
    }
  },
  {
    timestamps: false, // We manage timestamp manually
    collection: 'auditLogs'
    // Prevent updates/deletes via Mongoose (enforced at DB level via RBAC)
    // See scripts/db/enforce_audit_rbac.js for MongoDB role configuration
  }
);

// Indexes for performance
auditLogSchema.index({ timestamp: -1 }); // Most recent first
auditLogSchema.index({ userId: 1, timestamp: -1 }); // User activity timeline
auditLogSchema.index({ action: 1, timestamp: -1 }); // Action type queries
auditLogSchema.index({ status: 1, timestamp: -1 }); // Filter by success/failure
auditLogSchema.index({ currentHash: 1 }, { unique: true }); // Hash integrity lookup

// TTL index for automatic archival after 7 years (2,557 days = 7 years + 30-day grace)
auditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 2557 * 24 * 60 * 60 });

/**
 * Compute SHA-256 hash for integrity verification
 * Hash formula: SHA256(previousHash + timestamp + userId + action + resourceId)
 *
 * @param {Object} data - Log entry data
 * @returns {string} - 64-character hex hash
 */
auditLogSchema.statics.computeHash = function (data) {
  const hashInput = [
    data.previousHash || 'GENESIS', // First entry uses 'GENESIS' as previous
    data.timestamp.toISOString(),
    data.userId.toString(),
    data.action,
    data.resourceId ? data.resourceId.toString() : 'NULL'
  ].join('|');

  return crypto.createHash('sha256').update(hashInput).digest('hex');
};

/**
 * Verify hash chain integrity for a sequence of logs
 *
 * @param {Array} logs - Array of AuditLog documents (sorted by timestamp)
 * @returns {Object} - { valid: boolean, brokenAt: index | null }
 */
auditLogSchema.statics.verifyHashChain = async function (logs) {
  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    const expectedHash = this.computeHash({
      previousHash: log.previousHash,
      timestamp: log.timestamp,
      userId: log.userId,
      action: log.action,
      resourceId: log.resourceId
    });

    if (log.currentHash !== expectedHash) {
      return {
        valid: false,
        brokenAt: i,
        logId: log._id,
        message: `Hash mismatch at index ${i}: expected ${expectedHash}, got ${log.currentHash}`
      };
    }

    // Verify chain linkage (next log's previousHash should match current log's currentHash)
    if (i < logs.length - 1) {
      const nextLog = logs[i + 1];
      if (nextLog.previousHash !== log.currentHash) {
        return {
          valid: false,
          brokenAt: i + 1,
          logId: nextLog._id,
          message: `Chain broken at index ${i + 1}: previous hash mismatch`
        };
      }
    }
  }

  return { valid: true, brokenAt: null };
};

/**
 * Prevent updates and deletes (append-only enforcement)
 * Note: This is a Mongoose-level protection. Database-level RBAC provides additional security.
 */
auditLogSchema.pre('findOneAndUpdate', function (next) {
  next(new Error('AuditLog entries are immutable and cannot be updated'));
});

auditLogSchema.pre('updateOne', function (next) {
  next(new Error('AuditLog entries are immutable and cannot be updated'));
});

auditLogSchema.pre('updateMany', function (next) {
  next(new Error('AuditLog entries are immutable and cannot be updated'));
});

auditLogSchema.pre('findOneAndDelete', function (next) {
  next(new Error('AuditLog entries are immutable and cannot be deleted'));
});

auditLogSchema.pre('deleteOne', function (next) {
  next(new Error('AuditLog entries are immutable and cannot be deleted'));
});

auditLogSchema.pre('deleteMany', function (next) {
  next(new Error('AuditLog entries are immutable and cannot be deleted'));
});

/**
 * Virtual for age calculation (time since log entry)
 */
auditLogSchema.virtual('age').get(function () {
  return Date.now() - this.timestamp.getTime();
});

/**
 * Transform toJSON to include virtuals and exclude internal fields
 */
auditLogSchema.set('toJSON', {
  virtuals: true,
  transform: function (doc, ret) {
    delete ret.__v;
    return ret;
  }
});

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;
