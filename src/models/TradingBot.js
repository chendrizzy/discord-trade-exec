/**
 * TradingBot Model
 *
 * Represents automated trading bots created by users.
 * Each bot executes trades based on configured strategy and risk parameters.
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const TradingBotSchema = new Schema(
  {
    // Multi-tenancy
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    tenantId: {
      type: String,
      required: true,
      index: true
    },

    // Bot identification
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50
    },
    description: {
      type: String,
      trim: true,
      maxlength: 200
    },

    // Trading configuration
    tradingPair: {
      type: String,
      required: true,
      uppercase: true,
      match: /^[A-Z]{3,6}\/[A-Z]{3,6}$/,
      // e.g., BTC/USDT, ETH/USD
    },
    exchange: {
      type: String,
      required: true,
      enum: ['binance', 'alpaca', 'coinbase', 'kraken'],
      default: 'binance'
    },

    // Strategy
    strategy: {
      type: String,
      required: true,
      enum: ['conservative', 'moderate', 'aggressive', 'custom'],
      default: 'moderate'
    },
    strategyType: {
      type: String,
      enum: ['dca', 'grid', 'trend', 'scalping', 'arbitrage', 'custom'],
      default: 'dca'
    },

    // Status
    status: {
      type: String,
      enum: ['running', 'paused', 'stopped', 'error'],
      default: 'paused'
    },
    isActive: {
      type: Boolean,
      default: false
    },

    // Risk management
    riskConfig: {
      positionSize: {
        type: Number,
        min: 0,
        max: 100000,
        default: 100
      },
      positionSizeType: {
        type: String,
        enum: ['fixed', 'percentage', 'risk-based'],
        default: 'fixed'
      },
      stopLossPercent: {
        type: Number,
        min: 0,
        max: 100,
        default: 2
      },
      takeProfitPercent: {
        type: Number,
        min: 0,
        max: 1000,
        default: 5
      },
      maxDailyLoss: {
        type: Number,
        min: 0,
        max: 100000,
        default: 500
      },
      maxOpenPositions: {
        type: Number,
        min: 1,
        max: 50,
        default: 3
      }
    },

    // Strategy-specific configuration
    strategyConfig: {
      // DCA specific
      dca: {
        interval: {
          type: String,
          enum: ['hourly', 'daily', 'weekly', 'monthly'],
          default: 'daily'
        },
        amount: Number
      },
      // Grid specific
      grid: {
        upperPrice: Number,
        lowerPrice: Number,
        gridLevels: {
          type: Number,
          min: 2,
          max: 100,
          default: 10
        }
      },
      // Trend specific
      trend: {
        indicators: {
          type: [String],
          default: ['ema', 'rsi', 'macd']
        },
        timeframe: {
          type: String,
          enum: ['1m', '5m', '15m', '1h', '4h', '1d'],
          default: '1h'
        }
      }
    },

    // Performance tracking
    performance: {
      totalTrades: {
        type: Number,
        default: 0
      },
      winningTrades: {
        type: Number,
        default: 0
      },
      losingTrades: {
        type: Number,
        default: 0
      },
      totalPnL: {
        type: Number,
        default: 0
      },
      pnl24h: {
        type: Number,
        default: 0
      },
      pnl7d: {
        type: Number,
        default: 0
      },
      pnl30d: {
        type: Number,
        default: 0
      },
      winRate: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
      },
      averageProfit: {
        type: Number,
        default: 0
      },
      averageLoss: {
        type: Number,
        default: 0
      }
    },

    // Execution details
    lastTradeAt: Date,
    lastStartedAt: Date,
    lastStoppedAt: Date,
    errorMessage: String,
    errorCount: {
      type: Number,
      default: 0
    },

    // Scheduling
    schedule: {
      enabled: {
        type: Boolean,
        default: false
      },
      startTime: String, // HH:MM format
      endTime: String,   // HH:MM format
      daysOfWeek: {
        type: [Number], // 0-6 (Sunday-Saturday)
        default: [1, 2, 3, 4, 5] // Monday-Friday
      },
      timezone: {
        type: String,
        default: 'UTC'
      }
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Indexes for efficient querying
TradingBotSchema.index({ userId: 1, status: 1 });
TradingBotSchema.index({ tenantId: 1, isActive: 1 });
TradingBotSchema.index({ createdAt: -1 });

// Virtual for display name with pair
TradingBotSchema.virtual('displayName').get(function () {
  return `${this.name} (${this.tradingPair})`;
});

// Methods
TradingBotSchema.methods.start = function () {
  this.status = 'running';
  this.isActive = true;
  this.lastStartedAt = new Date();
  this.errorMessage = null;
  return this.save();
};

TradingBotSchema.methods.pause = function () {
  this.status = 'paused';
  this.isActive = false;
  return this.save();
};

TradingBotSchema.methods.stop = function () {
  this.status = 'stopped';
  this.isActive = false;
  this.lastStoppedAt = new Date();
  return this.save();
};

TradingBotSchema.methods.recordTrade = function (pnl, isWin) {
  this.performance.totalTrades += 1;
  if (isWin) {
    this.performance.winningTrades += 1;
  } else {
    this.performance.losingTrades += 1;
  }
  this.performance.totalPnL += pnl;
  this.performance.winRate = (this.performance.winningTrades / this.performance.totalTrades) * 100;
  this.lastTradeAt = new Date();
  return this.save();
};

module.exports = mongoose.model('TradingBot', TradingBotSchema);
