const express = require('express');
const router = express.Router();
const { ensureAuthenticated } = require('../../middleware/auth');
const { apiLimiter } = require('../../middleware/rateLimiter');
const SignalProvider = require('../../models/SignalProvider');

// Apply rate limiting
router.use(apiLimiter);

// Get all signal providers (public leaderboard)
router.get('/', async (req, res) => {
    try {
        const {
            limit = 20,
            minWinRate = 0,
            minTrades = 0,
            sortBy = 'winRate' // winRate, netProfit, rating, subscribers
        } = req.query;

        let sortCriteria = {};
        switch (sortBy) {
            case 'netProfit':
                sortCriteria = { 'performance.netProfit': -1 };
                break;
            case 'rating':
                sortCriteria = { rating: -1 };
                break;
            case 'subscribers':
                sortCriteria = { subscribers: -1 };
                break;
            case 'winRate':
            default:
                sortCriteria = { 'performance.winRate': -1, 'performance.netProfit': -1 };
        }

        const providers = await SignalProvider.find({
            isActive: true,
            verificationStatus: 'verified',
            'performance.winRate': { $gte: parseFloat(minWinRate) },
            'performance.executedTrades': { $gte: parseInt(minTrades) }
        })
        .sort(sortCriteria)
        .limit(parseInt(limit))
        .select('-source.authToken -source.botToken'); // Hide sensitive data

        res.json({
            success: true,
            count: providers.length,
            providers: providers.map(p => ({
                id: p._id,
                providerId: p.providerId,
                name: p.name,
                description: p.description,
                type: p.type,
                performance: {
                    totalSignals: p.performance.totalSignals,
                    executedTrades: p.performance.executedTrades,
                    winRate: p.performance.winRate.toFixed(2) + '%',
                    netProfit: p.performance.netProfit.toFixed(2),
                    profitFactor: p.performance.profitFactor.toFixed(2),
                    sharpeRatio: p.performance.sharpeRatio.toFixed(2)
                },
                signalQuality: {
                    hasStopLoss: p.signalQuality.hasStopLoss.toFixed(1) + '%',
                    hasTakeProfit: p.signalQuality.hasTakeProfit.toFixed(1) + '%',
                    averageRiskReward: p.signalQuality.averageRiskReward.toFixed(2)
                },
                subscribers: p.subscribers,
                rating: p.rating.toFixed(1),
                priority: p.priority,
                preferences: p.preferences
            }))
        });
    } catch (error) {
        console.error('Error fetching providers:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch signal providers'
        });
    }
});

// Get single provider details
router.get('/:providerId', async (req, res) => {
    try {
        const provider = await SignalProvider.findOne({
            providerId: req.params.providerId
        }).select('-source.authToken -source.botToken');

        if (!provider) {
            return res.status(404).json({
                success: false,
                error: 'Provider not found'
            });
        }

        res.json({
            success: true,
            provider: {
                id: provider._id,
                providerId: provider.providerId,
                name: provider.name,
                description: provider.description,
                type: provider.type,
                isActive: provider.isActive,
                verificationStatus: provider.verificationStatus,
                performance: provider.performance,
                signalQuality: provider.signalQuality,
                subscribers: provider.subscribers,
                rating: provider.rating,
                reviews: provider.reviews.slice(-10), // Last 10 reviews
                preferences: provider.preferences,
                priority: provider.priority
            }
        });
    } catch (error) {
        console.error('Error fetching provider:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch provider details'
        });
    }
});

// Subscribe to a provider
router.post('/:providerId/subscribe', ensureAuthenticated, async (req, res) => {
    try {
        const provider = await SignalProvider.findOne({
            providerId: req.params.providerId
        });

        if (!provider) {
            return res.status(404).json({
                success: false,
                error: 'Provider not found'
            });
        }

        // Check if already subscribed
        const isSubscribed = req.user.tradingConfig.signalProviders.some(
            p => p.channelId === provider.source.channelId || p.channelName === provider.name
        );

        if (isSubscribed) {
            return res.status(400).json({
                success: false,
                error: 'Already subscribed to this provider'
            });
        }

        // Add provider to user's subscription list
        req.user.tradingConfig.signalProviders.push({
            channelId: provider.source.channelId || provider.providerId,
            channelName: provider.name,
            enabled: true,
            minConfidence: 0.7
        });

        await req.user.save();

        // Increment subscriber count
        provider.subscribers += 1;
        provider.activeSubscribers += 1;
        await provider.save();

        res.json({
            success: true,
            message: `Subscribed to ${provider.name} successfully`
        });
    } catch (error) {
        console.error('Error subscribing to provider:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to subscribe to provider'
        });
    }
});

// Unsubscribe from a provider
router.post('/:providerId/unsubscribe', ensureAuthenticated, async (req, res) => {
    try {
        const provider = await SignalProvider.findOne({
            providerId: req.params.providerId
        });

        if (!provider) {
            return res.status(404).json({
                success: false,
                error: 'Provider not found'
            });
        }

        // Remove provider from user's subscription list
        req.user.tradingConfig.signalProviders = req.user.tradingConfig.signalProviders.filter(
            p => p.channelId !== provider.source.channelId && p.channelName !== provider.name
        );

        await req.user.save();

        // Decrement subscriber count
        provider.subscribers = Math.max(0, provider.subscribers - 1);
        provider.activeSubscribers = Math.max(0, provider.activeSubscribers - 1);
        await provider.save();

        res.json({
            success: true,
            message: `Unsubscribed from ${provider.name} successfully`
        });
    } catch (error) {
        console.error('Error unsubscribing from provider:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to unsubscribe from provider'
        });
    }
});

// Add review/rating
router.post('/:providerId/review', ensureAuthenticated, async (req, res) => {
    try {
        const { rating, comment } = req.body;

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({
                success: false,
                error: 'Rating must be between 1 and 5'
            });
        }

        const provider = await SignalProvider.findOne({
            providerId: req.params.providerId
        });

        if (!provider) {
            return res.status(404).json({
                success: false,
                error: 'Provider not found'
            });
        }

        // Check if user already reviewed
        const existingReview = provider.reviews.find(
            r => r.userId.toString() === req.user._id.toString()
        );

        if (existingReview) {
            return res.status(400).json({
                success: false,
                error: 'You have already reviewed this provider'
            });
        }

        await provider.addReview(req.user._id, parseInt(rating), comment || '');

        res.json({
            success: true,
            message: 'Review added successfully',
            rating: provider.rating.toFixed(1)
        });
    } catch (error) {
        console.error('Error adding review:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to add review'
        });
    }
});

// Get user's subscribed providers
router.get('/user/subscriptions', ensureAuthenticated, async (req, res) => {
    try {
        const subscribedProviders = req.user.tradingConfig.signalProviders;

        // Fetch full provider details
        const providerIds = subscribedProviders.map(p => p.channelId);
        const providers = await SignalProvider.find({
            $or: [
                { providerId: { $in: providerIds } },
                { 'source.channelId': { $in: providerIds } }
            ]
        }).select('-source.authToken -source.botToken');

        res.json({
            success: true,
            count: providers.length,
            subscriptions: providers.map(p => {
                const userPref = subscribedProviders.find(
                    sp => sp.channelId === p.providerId || sp.channelId === p.source.channelId
                );
                return {
                    ...p.toObject(),
                    userSettings: {
                        enabled: userPref?.enabled || true,
                        minConfidence: userPref?.minConfidence || 0.7
                    }
                };
            })
        });
    } catch (error) {
        console.error('Error fetching subscriptions:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch subscriptions'
        });
    }
});

// Update provider settings for user
router.put('/user/providers/:channelId', ensureAuthenticated, async (req, res) => {
    try {
        const { enabled, minConfidence } = req.body;
        const { channelId } = req.params;

        const providerIndex = req.user.tradingConfig.signalProviders.findIndex(
            p => p.channelId === channelId
        );

        if (providerIndex === -1) {
            return res.status(404).json({
                success: false,
                error: 'Provider not found in your subscriptions'
            });
        }

        if (enabled !== undefined) {
            req.user.tradingConfig.signalProviders[providerIndex].enabled = Boolean(enabled);
        }

        if (minConfidence !== undefined) {
            const confidence = parseFloat(minConfidence);
            if (confidence >= 0 && confidence <= 1) {
                req.user.tradingConfig.signalProviders[providerIndex].minConfidence = confidence;
            }
        }

        await req.user.save();

        res.json({
            success: true,
            message: 'Provider settings updated successfully',
            provider: req.user.tradingConfig.signalProviders[providerIndex]
        });
    } catch (error) {
        console.error('Error updating provider settings:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update provider settings'
        });
    }
});

module.exports = router;
