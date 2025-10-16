// External dependencies
const mongoose = require('mongoose');

// Internal utilities and services
const { tenantScopingPlugin } = require('../plugins/tenantScoping');

const tradeSchema = new mongoose.Schema(
  {
    // Multi-tenant: Community reference (TENANT ISOLATION)
    communityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Community',
      required: false, // Optional for migration - will be required later
      index: true
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // Trade identification
    tradeId: {
      type: String,
      unique: true,
      required: true
    },

    // Exchange information
    exchange: {
      type: String,
      required: true,
      enum: ['binance', 'coinbase', 'kraken', 'ftx', 'bybit']
    },

    // Symbol and side
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

    // Prices and quantities
    entryPrice: {
      type: Number,
      required: true
    },
    exitPrice: {
      type: Number
    },
    quantity: {
      type: Number,
      required: true
    },

    // P&L calculation
    profitLoss: {
      type: Number,
      default: 0
    },
    profitLossPercentage: {
      type: Number,
      default: 0
    },

    // Fees
    fees: {
      entry: { type: Number, default: 0 },
      exit: { type: Number, default: 0 },
      total: { type: Number, default: 0 }
    },

    // Risk management
    stopLoss: Number,
    takeProfit: Number,

    // Trade status
    status: {
      type: String,
      required: true,
      enum: ['FILLED', 'PARTIAL', 'CANCELLED', 'FAILED', 'OPEN'],
      default: 'OPEN'
    },

    // Signal source
    signalSource: {
      providerId: mongoose.Schema.Types.ObjectId,
      providerName: String,
      signalId: String
    },

    // Order IDs from exchange
    orderIds: {
      entry: String,
      exit: String
    },

    // Timestamps
    entryTime: {
      type: Date,
      default: Date.now,
      index: true
    },
    exitTime: Date,

    // Error handling
    error: {
      occurred: { type: Boolean, default: false },
      message: String,
      timestamp: Date
    },

    // Signal Quality Tracking
    qualityTier: {
      type: String,
      enum: ['ELITE', 'VERIFIED', 'STANDARD'],
      index: true
    },
    confidenceScore: {
      type: Number,
      min: 0,
      max: 100
    },
    smartMoneyScore: {
      type: Number,
      min: 0,
      max: 100
    },
    rareInformationScore: {
      type: Number,
      min: 0,
      max: 100
    },
    qualityAnalyzedAt: Date,
    predictedDirection: {
      type: String,
      enum: ['up', 'down', 'neutral']
    },

    // Metadata
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    }
  },
  {
    timestamps: true
  }
);

// Indexes for efficient queries
tradeSchema.index({ userId: 1, entryTime: -1 });
tradeSchema.index({ userId: 1, status: 1 });
tradeSchema.index({ userId: 1, symbol: 1 });

// **TENANT ISOLATION INDEXES** (Critical for multi-tenant security)
tradeSchema.index({ communityId: 1, userId: 1, entryTime: -1 }); // Tenant-scoped user trades
tradeSchema.index({ communityId: 1, status: 1, entryTime: -1 }); // Tenant-scoped status queries
tradeSchema.index({ communityId: 1, symbol: 1 }); // Tenant-scoped symbol queries
tradeSchema.index({ communityId: 1, 'signalSource.providerId': 1 }); // Tenant-scoped provider trades

// Calculate P&L when exit price is set
tradeSchema.methods.calculatePnL = function () {
  if (!this.exitPrice) return null;

  const multiplier = this.side === 'BUY' || this.side === 'LONG' ? 1 : -1;
  const priceDiff = (this.exitPrice - this.entryPrice) * multiplier;
  const grossPnL = priceDiff * this.quantity;
  const netPnL = grossPnL - this.fees.total;
  const pnlPercentage = (priceDiff / this.entryPrice) * 100;

  this.profitLoss = netPnL;
  this.profitLossPercentage = pnlPercentage;

  return {
    gross: grossPnL,
    net: netPnL,
    percentage: pnlPercentage
  };
};

// Static method to get user's trade summary
tradeSchema.statics.getUserSummary = async function (userId, timeframe = 'all') {
  const query = { userId };

  // Apply timeframe filter
  if (timeframe === '24h') {
    query.entryTime = { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) };
  } else if (timeframe === '7d') {
    query.entryTime = { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
  } else if (timeframe === '30d') {
    query.entryTime = { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
  }

  const trades = await this.find(query);

  const summary = {
    totalTrades: trades.length,
    winningTrades: trades.filter(t => t.profitLoss > 0).length,
    losingTrades: trades.filter(t => t.profitLoss < 0).length,
    totalProfitLoss: trades.reduce((sum, t) => sum + t.profitLoss, 0),
    totalFees: trades.reduce((sum, t) => sum + t.fees.total, 0),
    averagePnL: trades.length > 0 ? trades.reduce((sum, t) => sum + t.profitLoss, 0) / trades.length : 0,
    winRate: trades.length > 0 ? (trades.filter(t => t.profitLoss > 0).length / trades.length) * 100 : 0
  };

  return summary;
};

// Apply tenant scoping plugin for automatic communityId filtering
tradeSchema.plugin(tenantScopingPlugin);

const Trade = mongoose.model('Trade', tradeSchema);

module.exports = Trade;
