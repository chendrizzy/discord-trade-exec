/**
 * Polymarket Transaction Model
 *
 * Stores blockchain transactions from Polymarket CTF Exchange
 * Optimized for time-series queries with compound indexes
 */

const mongoose = require('mongoose');

const polymarketTransactionSchema = new mongoose.Schema({
  // Transaction identifiers
  txHash: {
    type: String,
    required: true,
    unique: true,
    index: true,
    lowercase: true
  },

  // Event information
  eventName: {
    type: String,
    required: true,
    enum: ['OrderFilled', 'OrdersMatched', 'OrderCancelled', 'FeeCharged', 'TokenRegistered'],
    index: true
  },

  // Blockchain metadata
  blockNumber: {
    type: Number,
    required: true,
    index: true
  },

  logIndex: {
    type: Number,
    required: true
  },

  timestamp: {
    type: Date,
    required: true,
    index: true
  },

  // Wallet addresses (lowercase for case-insensitive matching)
  maker: {
    type: String,
    index: true,
    lowercase: true
  },

  taker: {
    type: String,
    index: true,
    lowercase: true
  },

  // Asset/Token IDs
  makerAssetId: String,
  takerAssetId: String,
  tokenId: String,
  conditionId: String,

  // Amounts (stored as strings to preserve precision)
  makerAmountFilled: {
    type: String,
    default: '0'
  },

  takerAmountFilled: {
    type: String,
    default: '0'
  },

  fee: {
    type: String,
    default: '0'
  },

  // Additional data
  orderHash: String,
  takerOrderHash: String,
  receiver: {
    type: String,
    lowercase: true
  },

  // Whale detection flag
  isWhaleTransaction: {
    type: Boolean,
    default: false,
    index: true
  },

  // Market metadata (populated later)
  marketId: String,
  marketTitle: String,

  // Processing metadata
  processed: {
    type: Boolean,
    default: false
  },

  processedAt: Date,

  error: String
}, {
  timestamps: true
});

// Compound indexes for common query patterns
polymarketTransactionSchema.index({ timestamp: -1, eventName: 1 });
polymarketTransactionSchema.index({ maker: 1, timestamp: -1 });
polymarketTransactionSchema.index({ taker: 1, timestamp: -1 });
polymarketTransactionSchema.index({ isWhaleTransaction: 1, timestamp: -1 });
polymarketTransactionSchema.index({ marketId: 1, timestamp: -1 });
polymarketTransactionSchema.index({ processed: 1, createdAt: 1 });

// Pre-save hook: Automatically set whale flag
polymarketTransactionSchema.pre('save', function(next) {
  const makerAmount = parseFloat(this.makerAmountFilled || 0);
  const takerAmount = parseFloat(this.takerAmountFilled || 0);
  const whaleThreshold = parseFloat(process.env.POLYMARKET_WHALE_BET_THRESHOLD || 100000);

  this.isWhaleTransaction = makerAmount >= whaleThreshold || takerAmount >= whaleThreshold;
  next();
});

// Instance methods
polymarketTransactionSchema.methods.getAmounts = function() {
  return {
    makerAmount: parseFloat(this.makerAmountFilled || 0),
    takerAmount: parseFloat(this.takerAmountFilled || 0),
    feeAmount: parseFloat(this.fee || 0),
    totalAmount: parseFloat(this.makerAmountFilled || 0) + parseFloat(this.takerAmountFilled || 0)
  };
};

polymarketTransactionSchema.methods.getWallets = function() {
  const wallets = [];
  if (this.maker) wallets.push(this.maker);
  if (this.taker) wallets.push(this.taker);
  if (this.receiver) wallets.push(this.receiver);
  return [...new Set(wallets)];
};

// Static methods
polymarketTransactionSchema.statics.findByWallet = function(walletAddress, limit = 100) {
  const address = walletAddress.toLowerCase();
  return this.find({
    $or: [
      { maker: address },
      { taker: address },
      { receiver: address }
    ]
  })
    .sort({ timestamp: -1 })
    .limit(limit);
};

polymarketTransactionSchema.statics.findWhaleTransactions = function(limit = 100, since = null) {
  const query = { isWhaleTransaction: true };
  if (since) {
    query.timestamp = { $gte: since };
  }
  return this.find(query).sort({ timestamp: -1 }).limit(limit);
};

polymarketTransactionSchema.statics.getVolumeStats = async function(timeRange = '24h') {
  const now = new Date();
  const since = new Date(now - this._parseTimeRange(timeRange));

  const stats = await this.aggregate([
    {
      $match: {
        timestamp: { $gte: since },
        eventName: { $in: ['OrderFilled', 'OrdersMatched'] }
      }
    },
    {
      $group: {
        _id: null,
        totalTransactions: { $sum: 1 },
        totalMakerVolume: { $sum: { $toDouble: { $ifNull: ['$makerAmountFilled', '0'] } } },
        totalTakerVolume: { $sum: { $toDouble: { $ifNull: ['$takerAmountFilled', '0'] } } },
        avgMakerAmount: { $avg: { $toDouble: { $ifNull: ['$makerAmountFilled', '0'] } } },
        avgTakerAmount: { $avg: { $toDouble: { $ifNull: ['$takerAmountFilled', '0'] } } },
        whaleTransactions: { $sum: { $cond: ['$isWhaleTransaction', 1, 0] } }
      }
    }
  ]);

  return stats[0] || {
    totalTransactions: 0,
    totalMakerVolume: 0,
    totalTakerVolume: 0,
    avgMakerAmount: 0,
    avgTakerAmount: 0,
    whaleTransactions: 0
  };
};

polymarketTransactionSchema.statics._parseTimeRange = function(range) {
  const value = parseInt(range);
  const unit = range.slice(-1);
  const multipliers = {
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000
  };
  return value * (multipliers[unit] || multipliers.h);
};

const PolymarketTransaction = mongoose.model('PolymarketTransaction', polymarketTransactionSchema);

module.exports = PolymarketTransaction;
