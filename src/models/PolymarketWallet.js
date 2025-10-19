/**
 * Polymarket Wallet Model
 *
 * Tracks wallet performance, statistics, and whale status
 */

const mongoose = require('mongoose');

const polymarketWalletSchema = new mongoose.Schema({
  // Wallet identifier
  address: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    index: true
  },

  // Whale status
  isWhale: {
    type: Boolean,
    default: false,
    index: true
  },

  whaleScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },

  // Volume statistics
  totalVolume: {
    type: Number,
    default: 0
  },

  last24HVolume: {
    type: Number,
    default: 0
  },

  last7DVolume: {
    type: Number,
    default: 0
  },

  last30DaysVolume: {
    type: Number,
    default: 0
  },

  // Bet statistics
  betCount: {
    type: Number,
    default: 0
  },

  avgBetSize: {
    type: Number,
    default: 0
  },

  largestBet: {
    type: Number,
    default: 0
  },

  smallestBet: {
    type: Number,
    default: 0
  },

  // Win/Loss tracking
  winCount: {
    type: Number,
    default: 0
  },

  lossCount: {
    type: Number,
    default: 0
  },

  winRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 1
  },

  // Activity tracking
  firstSeenAt: Date,
  lastActivityAt: Date,
  daysSinceFirstSeen: Number,
  daysSinceLastActivity: Number,

  // Market participation
  marketsTraded: {
    type: [String],
    default: []
  },

  favoriteMarkets: {
    type: Map,
    of: Number,
    default: {}
  },

  // Metadata
  label: String,
  notes: String,
  tags: [String]
}, {
  timestamps: true
});

// Indexes
polymarketWalletSchema.index({ isWhale: 1, whaleScore: -1 });
polymarketWalletSchema.index({ totalVolume: -1 });
polymarketWalletSchema.index({ lastActivityAt: -1 });
polymarketWalletSchema.index({ whaleScore: -1 });

// Instance methods

/**
 * Update whale status based on criteria
 */
polymarketWalletSchema.methods.updateWhaleStatus = function() {
  const isWhale =
    this.totalVolume >= 1000000 ||
    this.largestBet >= 100000 ||
    (this.avgBetSize >= 50000 && this.betCount >= 10) ||
    this.last30DaysVolume >= 500000;

  // Calculate whale score (0-100)
  let score = 0;
  score += Math.min(40, (this.totalVolume / 5000000) * 40);
  score += Math.min(30, this.winRate * 30);
  score += Math.min(15, (this.betCount / 100) * 15);
  score += Math.min(15, (this.last30DaysVolume / 1000000) * 15);

  this.isWhale = isWhale;
  this.whaleScore = Math.round(score);
};

/**
 * Update metrics from transactions
 */
polymarketWalletSchema.methods.updateMetrics = async function(transactions) {
  if (!transactions || transactions.length === 0) {
    return;
  }

  const now = new Date();
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

  // Calculate volumes
  const betSizes = [];
  const markets = new Set();
  let last24H = 0;
  let last7D = 0;
  let last30D = 0;
  let total = 0;

  transactions.forEach(tx => {
    const amount = parseFloat(tx.makerAmountFilled || 0) + parseFloat(tx.takerAmountFilled || 0);
    total += amount;
    betSizes.push(amount);

    if (tx.marketId) {
      markets.add(tx.marketId);
    }

    if (tx.timestamp >= oneDayAgo) last24H += amount;
    if (tx.timestamp >= sevenDaysAgo) last7D += amount;
    if (tx.timestamp >= thirtyDaysAgo) last30D += amount;
  });

  this.totalVolume = total;
  this.last24HVolume = last24H;
  this.last7DVolume = last7D;
  this.last30DaysVolume = last30D;
  this.betCount = betSizes.length;
  this.avgBetSize = betSizes.length > 0 ? total / betSizes.length : 0;
  this.largestBet = betSizes.length > 0 ? Math.max(...betSizes) : 0;
  this.smallestBet = betSizes.length > 0 ? Math.min(...betSizes.filter(b => b > 0)) : 0;
  this.marketsTraded = Array.from(markets);

  // Update activity dates
  const timestamps = transactions.map(tx => new Date(tx.timestamp)).sort((a, b) => a - b);
  this.firstSeenAt = timestamps[0];
  this.lastActivityAt = timestamps[timestamps.length - 1];
  this.daysSinceFirstSeen = Math.floor((now - this.firstSeenAt) / (24 * 60 * 60 * 1000));
  this.daysSinceLastActivity = Math.floor((now - this.lastActivityAt) / (24 * 60 * 60 * 1000));

  // Update whale status
  this.updateWhaleStatus();
};

/**
 * Add a win or loss
 */
polymarketWalletSchema.methods.recordOutcome = function(won) {
  if (won) {
    this.winCount++;
  } else {
    this.lossCount++;
  }

  const totalBets = this.winCount + this.lossCount;
  this.winRate = totalBets > 0 ? this.winCount / totalBets : 0;
};

// Static methods

/**
 * Find top whales
 */
polymarketWalletSchema.statics.findTopWhales = function(limit = 100) {
  return this.find({ isWhale: true })
    .sort({ whaleScore: -1, totalVolume: -1 })
    .limit(limit);
};

/**
 * Find active wallets
 */
polymarketWalletSchema.statics.findActiveWallets = function(sinceDays = 7, limit = 100) {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  return this.find({ lastActivityAt: { $gte: since } })
    .sort({ lastActivityAt: -1 })
    .limit(limit);
};

/**
 * Get or create wallet
 */
polymarketWalletSchema.statics.getOrCreate = async function(address) {
  const wallet = await this.findOne({ address: address.toLowerCase() });
  if (wallet) {
    return wallet;
  }

  return this.create({
    address: address.toLowerCase(),
    firstSeenAt: new Date(),
    lastActivityAt: new Date()
  });
};

const PolymarketWallet = mongoose.model('PolymarketWallet', polymarketWalletSchema);

module.exports = PolymarketWallet;
