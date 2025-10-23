'use strict';

/**
 * Broker Connection Model
 *
 * Manages broker API connections with encrypted credentials
 *
 * Constitutional Principle I: Security-First - AES-256-GCM credential encryption
 * FR-014: Store broker credentials encrypted at rest
 * US-002: Broker integration for trade execution
 */

const mongoose = require('mongoose');

const brokerConnectionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    broker: {
      type: String,
      enum: ['alpaca', 'moomoo', 'ibkr', 'tradier', 'robinhood'],
      required: true
    },

    accountType: {
      type: String,
      enum: ['live', 'paper'],
      default: 'paper'
    },

    // Encrypted credentials (AES-256-GCM)
    credentials: {
      apiKey: {
        encrypted: { type: String, required: true },
        iv: { type: String, required: true },
        authTag: { type: String, required: true }
      },
      apiSecret: {
        encrypted: { type: String, required: true },
        iv: { type: String, required: true },
        authTag: { type: String, required: true }
      },
      // Optional OAuth tokens (for brokers using OAuth2)
      accessToken: {
        encrypted: String,
        iv: String,
        authTag: String
      },
      refreshToken: {
        encrypted: String,
        iv: String,
        authTag: String
      },
      expiresAt: Date
    },

    // Connection status
    status: {
      type: String,
      enum: ['active', 'inactive', 'error', 'pending_verification'],
      default: 'pending_verification',
      index: true
    },

    // Last successful connection
    lastConnectedAt: Date,

    // Last connection attempt
    lastAttemptedAt: Date,

    // Last error message
    lastError: {
      message: String,
      code: String,
      timestamp: Date
    },

    // Account information
    accountInfo: {
      accountId: String,
      accountNumber: String,
      accountName: String,
      currency: {
        type: String,
        default: 'USD'
      },
      type: String // cash, margin, etc.
    },

    // Permissions (from broker API)
    permissions: {
      canRead: {
        type: Boolean,
        default: false
      },
      canTrade: {
        type: Boolean,
        default: false
      },
      canWithdraw: {
        type: Boolean,
        default: false
      }
    },

    // Rate limiting
    rateLimitInfo: {
      requestsPerMinute: Number,
      requestsUsed: {
        type: Number,
        default: 0
      },
      resetAt: Date
    },

    // Metadata
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },

    notes: String
  },
  {
    timestamps: true
  }
);

// Indexes
brokerConnectionSchema.index({ userId: 1, broker: 1 });
brokerConnectionSchema.index({ userId: 1, status: 1 });
brokerConnectionSchema.index({ userId: 1, isActive: 1 });

// Compound index for unique broker per user
brokerConnectionSchema.index({ userId: 1, broker: 1, accountType: 1 }, { unique: true });

// Methods
brokerConnectionSchema.methods.isConnected = function () {
  return this.status === 'active' && this.isActive;
};

brokerConnectionSchema.methods.markAsError = async function (errorMessage, errorCode) {
  this.status = 'error';
  this.lastError = {
    message: errorMessage,
    code: errorCode,
    timestamp: new Date()
  };
  this.lastAttemptedAt = new Date();
  await this.save();
};

brokerConnectionSchema.methods.markAsConnected = async function (accountInfo = {}) {
  this.status = 'active';
  this.lastConnectedAt = new Date();
  this.lastAttemptedAt = new Date();
  this.lastError = null;

  if (Object.keys(accountInfo).length > 0) {
    this.accountInfo = { ...this.accountInfo, ...accountInfo };
  }

  await this.save();
};

brokerConnectionSchema.methods.updatePermissions = async function (permissions) {
  this.permissions = { ...this.permissions, ...permissions };
  await this.save();
};

// Check if rate limit exceeded
brokerConnectionSchema.methods.isRateLimited = function () {
  if (!this.rateLimitInfo.requestsPerMinute) {
    return false;
  }

  const now = new Date();
  if (this.rateLimitInfo.resetAt && now > this.rateLimitInfo.resetAt) {
    // Reset counter
    this.rateLimitInfo.requestsUsed = 0;
    this.rateLimitInfo.resetAt = new Date(now.getTime() + 60000); // +1 minute
  }

  return this.rateLimitInfo.requestsUsed >= this.rateLimitInfo.requestsPerMinute;
};

// Increment rate limit counter
brokerConnectionSchema.methods.incrementRateLimit = async function () {
  if (!this.rateLimitInfo.resetAt) {
    this.rateLimitInfo.resetAt = new Date(Date.now() + 60000); // +1 minute
  }

  this.rateLimitInfo.requestsUsed += 1;
  await this.save();
};

// Static methods
brokerConnectionSchema.statics.findActiveByUser = function (userId) {
  return this.find({
    userId,
    isActive: true,
    status: 'active'
  });
};

brokerConnectionSchema.statics.findByUserAndBroker = function (userId, broker) {
  return this.findOne({ userId, broker, isActive: true });
};

const BrokerConnection = mongoose.model('BrokerConnection', brokerConnectionSchema);

module.exports = BrokerConnection;
