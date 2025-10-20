// External dependencies
const mongoose = require('mongoose');

// Internal utilities and services
const { tenantScopingPlugin } = require('../plugins/tenantScoping');

const signalSchema = new mongoose.Schema(
  {
    // Multi-tenant: Community reference (TENANT ISOLATION)
    communityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Community',
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
    providerName: String,

    // Signal type
    signalType: {
      type: String,
      enum: ['entry', 'exit', 'update'],
      required: true,
      default: 'entry'
    },

    // Trading details
    symbol: {
      type: String,
      required: true,
      index: true
    },
    side: {
      type: String,
      required: true,
      enum: ['BUY', 'SELL', 'LONG', 'SHORT']
    },

    // Entry price (can be range)
    entryPrice: {
      type: Number,
      required: true
    },
    entryPriceRange: {
      min: Number,
      max: Number
    },

    // Risk management
    stopLoss: Number,
    takeProfit: Number,
    targets: [
      {
        price: Number,
        percentage: Number, // % of position to close
        label: String // e.g., "TP1", "TP2"
      }
    ],

    // Signal metadata
    timeframe: {
      type: String,
      enum: ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'],
      default: '1h'
    },
    confidence: {
      type: Number,
      min: 0,
      max: 100,
      default: 50
    },
    leverage: {
      type: Number,
      min: 1,
      max: 125,
      default: 1
    },

    // Signal status
    status: {
      type: String,
      enum: ['active', 'executed', 'cancelled', 'expired'],
      default: 'active',
      index: true
    },

    // Execution tracking
    executions: {
      type: Number,
      default: 0 // How many users executed this signal
    },
    successfulExecutions: {
      type: Number,
      default: 0
    },
    failedExecutions: {
      type: Number,
      default: 0
    },

    // Performance (updated after signal closes)
    performance: {
      avgPnL: Number,
      avgPnLPercentage: Number,
      winRate: Number,
      executionRate: Number,
      updatedAt: Date
    },

    // Discord source (if from Discord channel)
    discordMessage: {
      messageId: String,
      channelId: String,
      authorId: String,
      content: String
    },

    // Original raw signal data
    rawData: {
      type: mongoose.Schema.Types.Mixed
    },

    // Parsing metadata
    parsedAt: Date,
    parser: {
      type: String,
      enum: ['discord', 'webhook', 'manual', 'tradingview']
    },
    parseConfidence: {
      type: Number,
      min: 0,
      max: 100
    },

    // Expiration
    expiresAt: Date,

    // Metadata
    notes: String,
    tags: [String]
  },
  {
    timestamps: true
  }
);

// Indexes for performance
signalSchema.index({ communityId: 1, createdAt: -1 });
signalSchema.index({ communityId: 1, providerId: 1, createdAt: -1 });
signalSchema.index({ communityId: 1, status: 1, createdAt: -1 });
signalSchema.index({ communityId: 1, symbol: 1, createdAt: -1 });
signalSchema.index({ expiresAt: 1 }, { sparse: true });

// Text search for investigation
signalSchema.index({ symbol: 'text', notes: 'text' });

// Methods
signalSchema.methods.calculatePerformance = async function () {
  const Trade = mongoose.model('Trade');

  // Get all trades that executed this signal
  const trades = await Trade.find({
    'signalSource.signalId': this._id.toString(),
    status: 'FILLED',
    exitPrice: { $exists: true }
  });

  if (trades.length === 0) {
    return null;
  }

  const totalPnL = trades.reduce((sum, t) => sum + (t.profitLoss || 0), 0);
  const totalPnLPercentage = trades.reduce((sum, t) => sum + (t.profitLossPercentage || 0), 0);
  const winningTrades = trades.filter(t => (t.profitLoss || 0) > 0).length;

  this.performance = {
    avgPnL: totalPnL / trades.length,
    avgPnLPercentage: totalPnLPercentage / trades.length,
    winRate: (winningTrades / trades.length) * 100,
    executionRate: (this.executions / this.successfulExecutions) * 100,
    updatedAt: new Date()
  };

  await this.save();
  return this.performance;
};

signalSchema.methods.recordExecution = async function (success = true) {
  this.executions += 1;

  if (success) {
    this.successfulExecutions += 1;
  } else {
    this.failedExecutions += 1;
  }

  await this.save();
};

signalSchema.methods.isExpired = function () {
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt;
};

// Static methods
signalSchema.statics.getActiveSignals = function (communityId, providerId = null) {
  const query = {
    communityId,
    status: 'active',
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: { $gt: new Date() } }
    ]
  };

  if (providerId) {
    query.providerId = providerId;
  }

  return this.find(query)
    .sort({ createdAt: -1 })
    .populate('providerId', 'name performance');
};

signalSchema.statics.getTodaysSignals = function (communityId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return this.find({
    communityId,
    createdAt: { $gte: today }
  }).sort({ createdAt: -1 });
};

signalSchema.statics.getSignalsByProvider = function (communityId, providerId, limit = 50) {
  return this.find({
    communityId,
    providerId
  })
    .sort({ createdAt: -1 })
    .limit(limit);
};

signalSchema.statics.expireOldSignals = async function () {
  const now = new Date();

  const result = await this.updateMany(
    {
      status: 'active',
      expiresAt: { $lte: now }
    },
    {
      $set: { status: 'expired' }
    }
  );

  return result.modifiedCount;
};

// Apply tenant scoping plugin for automatic communityId filtering
signalSchema.plugin(tenantScopingPlugin);

const Signal = mongoose.model('Signal', signalSchema);

module.exports = Signal;
