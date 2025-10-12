const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    // Discord identity
    discordId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    discordUsername: {
        type: String,
        required: true
    },
    discordTag: String,

    // Subscription details
    subscription: {
        tier: {
            type: String,
            enum: ['free', 'basic', 'pro', 'premium'],
            default: 'free'
        },
        status: {
            type: String,
            enum: ['active', 'inactive', 'trial', 'cancelled', 'past_due'],
            default: 'trial'
        },
        stripeCustomerId: String,
        stripeSubscriptionId: String,
        currentPeriodStart: Date,
        currentPeriodEnd: Date,
        trialEndsAt: {
            type: Date,
            default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
        },
        cancelledAt: Date
    },

    // Usage limits based on tier
    limits: {
        signalsPerDay: {
            type: Number,
            default: 10 // Free tier limit
        },
        signalsUsedToday: {
            type: Number,
            default: 0
        },
        lastResetDate: {
            type: Date,
            default: Date.now
        },
        maxBrokers: {
            type: Number,
            default: 1
        }
    },

    // Trading configuration
    tradingConfig: {
        // Exchange API keys (encrypted in production)
        exchanges: [{
            name: {
                type: String,
                enum: ['binance', 'coinbase', 'kraken', 'ftx', 'bybit']
            },
            apiKey: String,
            apiSecret: String,
            isTestnet: {
                type: Boolean,
                default: true
            },
            isActive: {
                type: Boolean,
                default: true
            }
        }],

        // Multi-broker configurations (new abstraction layer)
        brokerConfigs: {
            type: Map,
            of: {
                brokerKey: String,
                brokerType: {
                    type: String,
                    enum: ['stock', 'crypto']
                },
                authMethod: {
                    type: String,
                    enum: ['oauth', 'api-key']
                },
                environment: {
                    type: String,
                    enum: ['testnet', 'live'],
                    default: 'testnet'
                },
                credentials: mongoose.Schema.Types.Mixed, // Encrypted in production
                configuredAt: {
                    type: Date,
                    default: Date.now
                },
                lastVerified: Date,
                isActive: {
                    type: Boolean,
                    default: true
                }
            },
            default: {}
        },

        // Risk management settings
        riskManagement: {
            // Position sizing
            maxPositionSize: {
                type: Number,
                default: 0.02, // 2% of portfolio per trade
                min: 0.005,
                max: 0.10
            },
            positionSizingMethod: {
                type: String,
                enum: ['fixed', 'risk_based', 'kelly'],
                default: 'risk_based'
            },

            // Stop loss & take profit
            defaultStopLoss: {
                type: Number,
                default: 0.02, // 2%
                min: 0.01,
                max: 0.10
            },
            defaultTakeProfit: {
                type: Number,
                default: 0.04, // 4% (2:1 risk/reward)
                min: 0.02,
                max: 0.20
            },
            useTrailingStop: {
                type: Boolean,
                default: false
            },
            trailingStopPercent: {
                type: Number,
                default: 0.015 // 1.5%
            },

            // Daily limits
            maxDailyLoss: {
                type: Number,
                default: 0.05, // 5%
                min: 0.02,
                max: 0.20
            },
            dailyLossAmount: {
                type: Number,
                default: 0
            },
            dailyLossResetDate: {
                type: Date,
                default: Date.now
            },

            // Position limits
            maxOpenPositions: {
                type: Number,
                default: 3,
                min: 1,
                max: 10
            },
            maxPositionsPerSymbol: {
                type: Number,
                default: 1,
                min: 1,
                max: 3
            },

            // Portfolio allocation
            maxPortfolioRisk: {
                type: Number,
                default: 0.10, // 10% total portfolio at risk
                min: 0.05,
                max: 0.30
            },

            // Trading hours
            tradingHoursEnabled: {
                type: Boolean,
                default: false
            },
            tradingHoursStart: {
                type: String,
                default: '09:00' // UTC
            },
            tradingHoursEnd: {
                type: String,
                default: '17:00' // UTC
            }
        },

        // Signal provider preferences
        signalProviders: [{
            channelId: String,
            channelName: String,
            enabled: {
                type: Boolean,
                default: true
            },
            minConfidence: {
                type: Number,
                default: 0.7
            }
        }],

        // Auto-trading settings
        autoTradingEnabled: {
            type: Boolean,
            default: false
        },
        confirmationRequired: {
            type: Boolean,
            default: true
        }
    },

    // Analytics & tracking
    stats: {
        totalSignalsProcessed: {
            type: Number,
            default: 0
        },
        totalTradesExecuted: {
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
        totalProfit: {
            type: Number,
            default: 0
        },
        totalLoss: {
            type: Number,
            default: 0
        },
        lastTradeAt: Date,
        accountCreatedAt: {
            type: Date,
            default: Date.now
        }
    },

    // Notifications & preferences
    notifications: {
        email: String,
        emailVerified: {
            type: Boolean,
            default: false
        },
        notifyOnTrade: {
            type: Boolean,
            default: true
        },
        notifyOnSignal: {
            type: Boolean,
            default: false
        },
        dailyReport: {
            type: Boolean,
            default: true
        }
    },

    // Metadata
    metadata: {
        referralCode: {
            type: String,
            unique: true,
            sparse: true
        },
        referredBy: String,
        lastActiveAt: {
            type: Date,
            default: Date.now
        },
        ipAddress: String,
        userAgent: String
    },

    // Admin permissions
    isAdmin: {
        type: Boolean,
        default: false,
        index: true
    }
}, {
    timestamps: true
});

// Indexes for performance
userSchema.index({ 'subscription.status': 1 });
userSchema.index({ 'subscription.tier': 1 });
userSchema.index({ 'metadata.lastActiveAt': -1 });

// Methods
userSchema.methods.isSubscriptionActive = function() {
    const now = new Date();

    // Check trial period
    if (this.subscription.status === 'trial' && this.subscription.trialEndsAt > now) {
        return true;
    }

    // Check active subscription
    if (this.subscription.status === 'active' && this.subscription.currentPeriodEnd > now) {
        return true;
    }

    return false;
};

userSchema.methods.canExecuteTrade = function() {
    if (!this.isSubscriptionActive()) {
        return { allowed: false, reason: 'Subscription inactive' };
    }

    // Reset daily counter if needed
    const today = new Date().toDateString();
    const lastReset = new Date(this.limits.lastResetDate).toDateString();

    if (today !== lastReset) {
        this.limits.signalsUsedToday = 0;
        this.limits.lastResetDate = new Date();
    }

    // Check daily limits
    const tierLimits = {
        free: 10,
        basic: 100,
        pro: Infinity,
        premium: Infinity
    };

    const maxSignals = tierLimits[this.subscription.tier] || 10;

    if (this.limits.signalsUsedToday >= maxSignals) {
        return {
            allowed: false,
            reason: `Daily limit reached (${maxSignals} signals/day)`
        };
    }

    return { allowed: true };
};

userSchema.methods.incrementSignalUsage = async function() {
    this.limits.signalsUsedToday += 1;
    this.stats.totalSignalsProcessed += 1;
    this.metadata.lastActiveAt = new Date();
    await this.save();
};

userSchema.methods.recordTrade = async function(success, profitLoss = 0) {
    this.stats.totalTradesExecuted += 1;

    if (success) {
        this.stats.successfulTrades += 1;
        if (profitLoss > 0) {
            this.stats.totalProfit += profitLoss;
        } else {
            this.stats.totalLoss += Math.abs(profitLoss);
            // Track daily loss
            if (profitLoss < 0) {
                this.recordDailyLoss(Math.abs(profitLoss));
            }
        }
    } else {
        this.stats.failedTrades += 1;
    }

    this.stats.lastTradeAt = new Date();
    await this.save();
};

// Daily loss tracking
userSchema.methods.checkDailyLossLimit = function() {
    const today = new Date().toDateString();
    const lastReset = new Date(this.tradingConfig.riskManagement.dailyLossResetDate).toDateString();

    // Reset if new day
    if (today !== lastReset) {
        this.tradingConfig.riskManagement.dailyLossAmount = 0;
        this.tradingConfig.riskManagement.dailyLossResetDate = new Date();
    }

    const currentLoss = this.tradingConfig.riskManagement.dailyLossAmount;
    const maxLoss = this.tradingConfig.riskManagement.maxDailyLoss;

    if (currentLoss >= maxLoss) {
        return {
            allowed: false,
            reason: `Daily loss limit reached (${(currentLoss * 100).toFixed(2)}% / ${(maxLoss * 100).toFixed(2)}%)`
        };
    }

    return { allowed: true, currentLoss, maxLoss };
};

userSchema.methods.recordDailyLoss = function(lossAmount) {
    const today = new Date().toDateString();
    const lastReset = new Date(this.tradingConfig.riskManagement.dailyLossResetDate).toDateString();

    // Reset if new day
    if (today !== lastReset) {
        this.tradingConfig.riskManagement.dailyLossAmount = 0;
        this.tradingConfig.riskManagement.dailyLossResetDate = new Date();
    }

    this.tradingConfig.riskManagement.dailyLossAmount += lossAmount;
};

// Risk calculations
userSchema.methods.calculatePositionSize = function(accountBalance, entryPrice, stopLossPrice) {
    const riskSettings = this.tradingConfig.riskManagement;
    const riskPerTrade = riskSettings.maxPositionSize;
    const riskAmount = accountBalance * riskPerTrade;

    // Calculate position size based on stop loss distance
    const stopLossDistance = Math.abs(entryPrice - stopLossPrice) / entryPrice;
    const positionSize = riskAmount / (stopLossDistance * entryPrice);

    return {
        positionSize,
        riskAmount,
        stopLossDistance: stopLossDistance * 100 // as percentage
    };
};

userSchema.methods.checkTradingHours = function() {
    if (!this.tradingConfig.riskManagement.tradingHoursEnabled) {
        return { allowed: true };
    }

    const now = new Date();
    const currentHour = now.getUTCHours();
    const currentMinute = now.getUTCMinutes();
    const currentTime = currentHour * 60 + currentMinute; // minutes since midnight

    const [startHour, startMinute] = this.tradingConfig.riskManagement.tradingHoursStart.split(':').map(Number);
    const [endHour, endMinute] = this.tradingConfig.riskManagement.tradingHoursEnd.split(':').map(Number);

    const startTime = startHour * 60 + startMinute;
    const endTime = endHour * 60 + endMinute;

    if (currentTime >= startTime && currentTime <= endTime) {
        return { allowed: true };
    }

    return {
        allowed: false,
        reason: `Trading outside allowed hours (${this.tradingConfig.riskManagement.tradingHoursStart} - ${this.tradingConfig.riskManagement.tradingHoursEnd} UTC)`
    };
};

// Static methods
userSchema.statics.findByDiscordId = function(discordId) {
    return this.findOne({ discordId });
};

userSchema.statics.getActiveSubscribers = function() {
    return this.find({
        'subscription.status': { $in: ['active', 'trial'] },
        $or: [
            { 'subscription.currentPeriodEnd': { $gt: new Date() } },
            { 'subscription.trialEndsAt': { $gt: new Date() } }
        ]
    });
};

const User = mongoose.model('User', userSchema);

module.exports = User;
