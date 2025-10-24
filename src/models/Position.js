'use strict';

/**
 * Position Model
 *
 * Tracks open and closed trading positions
 *
 * FR-033-035: Position tracking and management
 * US-001: Trade execution and position tracking
 */

const mongoose = require('mongoose');

const positionSchema = new mongoose.Schema(
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
      required: true,
      index: true
    },

    brokerConnectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BrokerConnection',
      required: true
    },

    // Position details
    symbol: {
      type: String,
      required: true,
      index: true,
      uppercase: true
    },

    assetClass: {
      type: String,
      enum: ['US_EQUITY', 'CRYPTO', 'OPTION', 'FOREX'],
      default: 'US_EQUITY'
    },

    side: {
      type: String,
      enum: ['LONG', 'SHORT'],
      required: true
    },

    quantity: {
      type: Number,
      required: true,
      min: 0
    },

    // Entry information
    entryPrice: {
      type: Number,
      required: true
    },

    entryDate: {
      type: Date,
      default: Date.now,
      index: true
    },

    entryTradeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Trade'
    },

    // Exit information
    exitPrice: Number,

    exitDate: {
      type: Date,
      index: true
    },

    exitTradeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Trade'
    },

    // Current market data
    currentPrice: Number,

    lastUpdatedAt: Date,

    // P&L tracking
    unrealizedPnL: {
      type: Number,
      default: 0
    },

    unrealizedPnLPercent: {
      type: Number,
      default: 0
    },

    realizedPnL: Number,

    realizedPnLPercent: Number,

    // Risk management
    stopLoss: {
      price: Number,
      percent: Number
    },

    takeProfit: {
      price: Number,
      percent: Number
    },

    trailingStop: {
      enabled: {
        type: Boolean,
        default: false
      },
      percent: Number,
      highWaterMark: Number // Highest price reached (for LONG) or lowest (for SHORT)
    },

    // Position status
    status: {
      type: String,
      enum: ['OPEN', 'CLOSED', 'PARTIALLY_CLOSED', 'PENDING_CLOSE'],
      default: 'OPEN',
      index: true
    },

    // Cost basis
    costBasis: {
      type: Number,
      required: true
    },

    // Market value
    marketValue: Number,

    // Average entry price (for positions built over multiple trades)
    avgEntryPrice: {
      type: Number,
      required: true
    },

    // Hold duration
    holdDuration: Number, // in seconds

    // Related signal
    signalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Signal'
    },

    // Notes
    notes: String,

    // Automatic closure tracking (for circuit breaker / daily loss limit)
    closeReason: {
      type: String,
      enum: ['CIRCUIT_BREAKER', 'DAILY_LOSS_LIMIT', 'MANUAL']
    },

    closeInitiatedAt: Date
  },
  {
    timestamps: true
  }
);

// Indexes
positionSchema.index({ userId: 1, symbol: 1, status: 1 });
positionSchema.index({ userId: 1, broker: 1, status: 1 });
positionSchema.index({ userId: 1, status: 1, entryDate: -1 });
positionSchema.index({ brokerConnectionId: 1, status: 1 });

// Compound index for querying open positions by user and broker
positionSchema.index({ userId: 1, broker: 1, status: 1, symbol: 1 });

// Methods
positionSchema.methods.calculateUnrealizedPnL = function (currentPrice) {
  this.currentPrice = currentPrice;
  this.lastUpdatedAt = new Date();

  if (this.side === 'LONG') {
    this.unrealizedPnL = (currentPrice - this.avgEntryPrice) * this.quantity;
  } else {
    // SHORT position
    this.unrealizedPnL = (this.avgEntryPrice - currentPrice) * this.quantity;
  }

  this.unrealizedPnLPercent = (this.unrealizedPnL / this.costBasis) * 100;
  this.marketValue = currentPrice * this.quantity;

  return this.unrealizedPnL;
};

positionSchema.methods.calculateRealizedPnL = function () {
  if (!this.exitPrice) {
    return 0;
  }

  if (this.side === 'LONG') {
    this.realizedPnL = (this.exitPrice - this.avgEntryPrice) * this.quantity;
  } else {
    // SHORT position
    this.realizedPnL = (this.avgEntryPrice - this.exitPrice) * this.quantity;
  }

  this.realizedPnLPercent = (this.realizedPnL / this.costBasis) * 100;
  this.holdDuration = Math.floor((this.exitDate - this.entryDate) / 1000);

  return this.realizedPnL;
};

positionSchema.methods.close = async function (exitPrice, exitTradeId) {
  this.exitPrice = exitPrice;
  this.exitDate = new Date();
  this.exitTradeId = exitTradeId;
  this.status = 'CLOSED';
  this.calculateRealizedPnL();
  await this.save();
};

positionSchema.methods.updateTrailingStop = function (currentPrice) {
  if (!this.trailingStop.enabled) {
    return;
  }

  if (this.side === 'LONG') {
    // Update high water mark
    if (!this.trailingStop.highWaterMark || currentPrice > this.trailingStop.highWaterMark) {
      this.trailingStop.highWaterMark = currentPrice;

      // Update stop loss
      const trailingStopPrice = currentPrice * (1 - this.trailingStop.percent / 100);
      if (!this.stopLoss.price || trailingStopPrice > this.stopLoss.price) {
        this.stopLoss.price = trailingStopPrice;
      }
    }
  } else {
    // SHORT position
    if (!this.trailingStop.highWaterMark || currentPrice < this.trailingStop.highWaterMark) {
      this.trailingStop.highWaterMark = currentPrice;

      // Update stop loss
      const trailingStopPrice = currentPrice * (1 + this.trailingStop.percent / 100);
      if (!this.stopLoss.price || trailingStopPrice < this.stopLoss.price) {
        this.stopLoss.price = trailingStopPrice;
      }
    }
  }
};

positionSchema.methods.shouldTriggerStopLoss = function (currentPrice) {
  if (!this.stopLoss.price) {
    return false;
  }

  if (this.side === 'LONG') {
    return currentPrice <= this.stopLoss.price;
  } else {
    // SHORT position
    return currentPrice >= this.stopLoss.price;
  }
};

positionSchema.methods.shouldTriggerTakeProfit = function (currentPrice) {
  if (!this.takeProfit.price) {
    return false;
  }

  if (this.side === 'LONG') {
    return currentPrice >= this.takeProfit.price;
  } else {
    // SHORT position
    return currentPrice <= this.takeProfit.price;
  }
};

// Static methods
positionSchema.statics.findOpenByUser = function (userId) {
  return this.find({
    userId,
    status: 'OPEN'
  }).sort({ entryDate: -1 });
};

positionSchema.statics.findOpenByUserAndBroker = function (userId, broker) {
  return this.find({
    userId,
    broker,
    status: 'OPEN'
  });
};

positionSchema.statics.findOpenBySymbol = function (userId, symbol) {
  return this.find({
    userId,
    symbol,
    status: 'OPEN'
  });
};

positionSchema.statics.calculateTotalExposure = async function (userId) {
  const positions = await this.findOpenByUser(userId);

  let totalExposure = 0;
  positions.forEach(position => {
    totalExposure += position.marketValue || position.costBasis;
  });

  return totalExposure;
};

const Position = mongoose.model('Position', positionSchema);

module.exports = Position;
