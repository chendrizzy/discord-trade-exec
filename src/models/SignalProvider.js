const mongoose = require('mongoose');

const signalProviderSchema = new mongoose.Schema({
    // Provider identification
    providerId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    type: {
        type: String,
        enum: ['discord_channel', 'tradingview', 'telegram', 'webhook', 'manual'],
        required: true
    },
    name: {
        type: String,
        required: true
    },
    description: String,

    // Source details
    source: {
        // For Discord channels
        channelId: String,
        serverId: String,
        channelName: String,

        // For TradingView
        strategyName: String,
        webhookUrl: String,

        // For Telegram
        chatId: String,
        botToken: String,

        // Generic webhook
        endpoint: String,
        authToken: String
    },

    // Status
    isActive: {
        type: Boolean,
        default: true
    },
    verificationStatus: {
        type: String,
        enum: ['pending', 'verified', 'suspended', 'banned'],
        default: 'pending'
    },

    // Performance metrics
    performance: {
        // Trade statistics
        totalSignals: {
            type: Number,
            default: 0
        },
        executedTrades: {
            type: Number,
            default: 0
        },
        successfulTrades: {
            type: Number,
            default: 0
        },
        failedTrades: {
            type: Number,
            default: 0
        },

        // Win rate
        winRate: {
            type: Number,
            default: 0, // percentage
            min: 0,
            max: 100
        },

        // P&L
        totalProfit: {
            type: Number,
            default: 0
        },
        totalLoss: {
            type: Number,
            default: 0
        },
        netProfit: {
            type: Number,
            default: 0
        },
        averageProfitPerTrade: {
            type: Number,
            default: 0
        },

        // Risk metrics
        sharpeRatio: {
            type: Number,
            default: 0
        },
        maxDrawdown: {
            type: Number,
            default: 0
        },
        profitFactor: {
            type: Number,
            default: 0
        },

        // Timing
        averageHoldTime: {
            type: Number,
            default: 0 // in minutes
        },
        lastSignalAt: Date,
        lastUpdateAt: {
            type: Date,
            default: Date.now
        }
    },

    // Signal quality
    signalQuality: {
        // Accuracy metrics
        stopLossHitRate: {
            type: Number,
            default: 0 // percentage of trades that hit SL
        },
        takeProfitHitRate: {
            type: Number,
            default: 0 // percentage of trades that hit TP
        },
        averageRiskReward: {
            type: Number,
            default: 0
        },

        // Signal completeness
        hasStopLoss: {
            type: Number,
            default: 0 // percentage of signals with SL
        },
        hasTakeProfit: {
            type: Number,
            default: 0 // percentage of signals with TP
        },
        hasTargets: {
            type: Number,
            default: 0 // percentage of signals with multiple targets
        }
    },

    // User engagement
    subscribers: {
        type: Number,
        default: 0
    },
    activeSubscribers: {
        type: Number,
        default: 0
    },
    rating: {
        type: Number,
        default: 0,
        min: 0,
        max: 5
    },
    reviews: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        rating: Number,
        comment: String,
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],

    // Trading preferences
    preferences: {
        // Markets
        markets: [{
            type: String,
            enum: ['crypto', 'forex', 'stocks', 'commodities', 'indices']
        }],
        symbols: [String], // Specific symbols traded

        // Timeframes
        timeframes: [{
            type: String,
            enum: ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w']
        }],

        // Trading style
        tradingStyle: {
            type: String,
            enum: ['scalping', 'day_trading', 'swing_trading', 'position_trading']
        },

        // Average signals per day
        signalsPerDay: {
            type: Number,
            default: 0
        }
    },

    // Conflict resolution priority
    priority: {
        type: Number,
        default: 50, // 0-100, higher = more trusted
        min: 0,
        max: 100
    },

    // Metadata
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    metadata: {
        tags: [String],
        category: String,
        isFeatured: {
            type: Boolean,
            default: false
        },
        isPremium: {
            type: Boolean,
            default: false
        }
    }
}, {
    timestamps: true
});

// Indexes
signalProviderSchema.index({ 'performance.winRate': -1 });
signalProviderSchema.index({ 'performance.netProfit': -1 });
signalProviderSchema.index({ priority: -1 });
signalProviderSchema.index({ rating: -1 });
signalProviderSchema.index({ subscribers: -1 });

// Methods
signalProviderSchema.methods.updatePerformanceMetrics = async function() {
    const perf = this.performance;

    // Calculate win rate
    if (perf.executedTrades > 0) {
        perf.winRate = (perf.successfulTrades / perf.executedTrades) * 100;
    }

    // Calculate net profit
    perf.netProfit = perf.totalProfit - perf.totalLoss;

    // Calculate average profit per trade
    if (perf.executedTrades > 0) {
        perf.averageProfitPerTrade = perf.netProfit / perf.executedTrades;
    }

    // Calculate profit factor
    if (perf.totalLoss > 0) {
        perf.profitFactor = perf.totalProfit / perf.totalLoss;
    }

    perf.lastUpdateAt = new Date();
    await this.save();
};

signalProviderSchema.methods.recordSignal = async function(signal) {
    this.performance.totalSignals += 1;
    this.performance.lastSignalAt = new Date();

    // Update signal quality metrics
    if (signal.stopLoss) {
        const total = this.performance.totalSignals;
        const current = this.signalQuality.hasStopLoss;
        this.signalQuality.hasStopLoss = ((current * (total - 1)) + 100) / total;
    }

    if (signal.takeProfit || signal.targets) {
        const total = this.performance.totalSignals;
        const current = this.signalQuality.hasTakeProfit;
        this.signalQuality.hasTakeProfit = ((current * (total - 1)) + 100) / total;
    }

    await this.save();
};

signalProviderSchema.methods.recordTradeResult = async function(success, profitLoss = 0, hitStopLoss = false, hitTakeProfit = false) {
    this.performance.executedTrades += 1;

    if (success) {
        this.performance.successfulTrades += 1;
        this.performance.totalProfit += Math.max(0, profitLoss);
    } else {
        this.performance.failedTrades += 1;
        this.performance.totalLoss += Math.abs(profitLoss);
    }

    // Track stop loss and take profit hit rates
    const total = this.performance.executedTrades;
    if (hitStopLoss) {
        const current = this.signalQuality.stopLossHitRate;
        this.signalQuality.stopLossHitRate = ((current * (total - 1)) + 100) / total;
    }
    if (hitTakeProfit) {
        const current = this.signalQuality.takeProfitHitRate;
        this.signalQuality.takeProfitHitRate = ((current * (total - 1)) + 100) / total;
    }

    await this.updatePerformanceMetrics();
};

signalProviderSchema.methods.addReview = async function(userId, rating, comment) {
    // Check if user has already reviewed
    const existingReview = this.reviews.find(review =>
        review.userId && review.userId.toString() === userId.toString()
    );

    if (existingReview) {
        // Update existing review instead of adding duplicate
        existingReview.rating = rating;
        existingReview.comment = comment;
        existingReview.createdAt = new Date();
    } else {
        // Add new review
        this.reviews.push({
            userId,
            rating,
            comment,
            createdAt: new Date()
        });
    }

    // Recalculate average rating
    const totalRating = this.reviews.reduce((sum, review) => sum + review.rating, 0);
    this.rating = totalRating / this.reviews.length;

    await this.save();
};

// Static methods
signalProviderSchema.statics.getTopProviders = function(limit = 10) {
    return this.find({ isActive: true, verificationStatus: 'verified' })
        .sort({ 'performance.winRate': -1, 'performance.netProfit': -1 })
        .limit(limit);
};

signalProviderSchema.statics.getProvidersByPerformance = function(minWinRate = 50, minTrades = 10) {
    return this.find({
        isActive: true,
        verificationStatus: 'verified',
        'performance.winRate': { $gte: minWinRate },
        'performance.executedTrades': { $gte: minTrades }
    }).sort({ 'performance.netProfit': -1 });
};

signalProviderSchema.statics.findByProviderId = function(providerId) {
    return this.findOne({ providerId });
};

signalProviderSchema.statics.resolveConflict = async function(signals) {
    // If multiple providers send conflicting signals for the same symbol
    // Return the provider with highest priority and best performance

    if (!signals || signals.length === 0) return null;
    if (signals.length === 1) return signals[0];

    // Sort by priority (higher first), then win rate, then net profit
    const sortedSignals = signals.sort((a, b) => {
        if (b.provider.priority !== a.provider.priority) {
            return b.provider.priority - a.provider.priority;
        }
        if (b.provider.performance.winRate !== a.provider.performance.winRate) {
            return b.provider.performance.winRate - a.provider.performance.winRate;
        }
        return b.provider.performance.netProfit - a.provider.performance.netProfit;
    });

    return sortedSignals[0];
};

const SignalProvider = mongoose.model('SignalProvider', signalProviderSchema);

module.exports = SignalProvider;
