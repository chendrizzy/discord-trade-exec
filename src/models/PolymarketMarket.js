/**
 * Polymarket Market Model
 *
 * Stores market metadata and aggregated metrics
 */

const mongoose = require('mongoose');

const polymarketMarketSchema = new mongoose.Schema({
  // Market identifier
  marketId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },

  conditionId: {
    type: String,
    index: true
  },

  // Market details
  title: {
    type: String,
    required: true
  },

  description: String,

  category: {
    type: String,
    index: true
  },

  // Outcomes
  outcomes: [{
    id: String,
    title: String,
    tokenId: String
  }],

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

  // Current market state
  currentOdds: {
    type: Map,
    of: Number,
    default: {}
  },

  sentimentScore: {
    type: Number,
    default: 0,
    min: -1,
    max: 1
  },

  dominantOutcome: String,

  // Activity metrics
  totalBets: {
    type: Number,
    default: 0
  },

  uniqueWallets: {
    type: Number,
    default: 0
  },

  whaleBets: {
    type: Number,
    default: 0
  },

  // Time tracking
  firstSeenAt: Date,
  lastActivityAt: Date,

  // Market status
  status: {
    type: String,
    enum: ['active', 'closed', 'resolved', 'cancelled'],
    default: 'active',
    index: true
  },

  resolvedAt: Date,
  resolutionOutcome: String,

  // Metadata
  tags: [String],
  externalLinks: {
    polymarket: String,
    twitter: String,
    news: [String]
  }
}, {
  timestamps: true
});

// Indexes
polymarketMarketSchema.index({ status: 1, totalVolume: -1 });
polymarketMarketSchema.index({ category: 1, lastActivityAt: -1 });
polymarketMarketSchema.index({ lastActivityAt: -1 });

// Instance methods

/**
 * Update volume statistics
 */
polymarketMarketSchema.methods.updateVolume = function(amount, timestamp) {
  this.totalVolume += amount;
  this.totalBets++;

  const now = new Date();
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

  if (timestamp >= oneDayAgo) {
    this.last24HVolume += amount;
  }

  if (timestamp >= sevenDaysAgo) {
    this.last7DVolume += amount;
  }

  this.lastActivityAt = timestamp;
};

/**
 * Calculate sentiment from recent bets
 */
polymarketMarketSchema.methods.calculateSentiment = function(recentBets) {
  if (!recentBets || recentBets.length === 0) {
    return;
  }

  const outcomeVolumes = {};
  let totalVolume = 0;

  recentBets.forEach(bet => {
    const outcome = bet.makerAssetId || bet.takerAssetId;
    const amount = parseFloat(bet.makerAmountFilled || 0) + parseFloat(bet.takerAmountFilled || 0);

    outcomeVolumes[outcome] = (outcomeVolumes[outcome] || 0) + amount;
    totalVolume += amount;
  });

  // Find dominant outcome
  let maxVolume = 0;
  let dominant = null;

  Object.entries(outcomeVolumes).forEach(([outcome, volume]) => {
    if (volume > maxVolume) {
      maxVolume = volume;
      dominant = outcome;
    }
  });

  this.dominantOutcome = dominant;

  // Sentiment score: how lopsided is the betting?
  // -1 = perfectly balanced, 1 = completely one-sided
  if (totalVolume > 0) {
    const dominantPercentage = maxVolume / totalVolume;
    this.sentimentScore = (dominantPercentage - 0.5) * 2; // Map [0.5, 1] to [0, 1]
  }
};

// Static methods

/**
 * Find most active markets
 */
polymarketMarketSchema.statics.findMostActive = function(limit = 50, timeRange = '24h') {
  const volumeField = timeRange === '24h' ? 'last24HVolume' : 'last7DVolume';
  const sort = {};
  sort[volumeField] = -1;

  return this.find({ status: 'active' })
    .sort(sort)
    .limit(limit);
};

/**
 * Find trending markets (volume spike)
 */
polymarketMarketSchema.statics.findTrending = async function(limit = 20) {
  const markets = await this.find({ status: 'active' });

  const trending = markets
    .filter(m => m.last24HVolume > 0 && m.last7DVolume > 0)
    .map(m => ({
      market: m,
      spike: m.last24HVolume / (m.last7DVolume / 7) // Compare to daily average
    }))
    .filter(t => t.spike > 1.5) // 50% above average
    .sort((a, b) => b.spike - a.spike)
    .slice(0, limit)
    .map(t => t.market);

  return trending;
};

/**
 * Get or create market
 */
polymarketMarketSchema.statics.getOrCreate = async function(marketId, data = {}) {
  const market = await this.findOne({ marketId });
  if (market) {
    return market;
  }

  return this.create({
    marketId,
    title: data.title || `Market ${marketId}`,
    description: data.description,
    category: data.category,
    outcomes: data.outcomes || [],
    conditionId: data.conditionId,
    firstSeenAt: new Date(),
    lastActivityAt: new Date()
  });
};

const PolymarketMarket = mongoose.model('PolymarketMarket', polymarketMarketSchema);

module.exports = PolymarketMarket;
