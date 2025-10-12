const express = require('express');
const router = express.Router();
const User = require('../../models/User');
const Trade = require('../../models/Trade');
const { adminOnly } = require('../../middleware/admin');
const { apiLimiter } = require('../../middleware/rateLimiter');

// Apply rate limiting and admin authentication to all routes
router.use(apiLimiter);
router.use(adminOnly);

/**
 * @route   GET /api/admin/stats
 * @desc    Get comprehensive platform statistics for admin dashboard
 * @access  Admin only
 */
router.get('/stats', async (req, res) => {
    try {
        const now = new Date();
        const last30Days = new Date(now - 30 * 24 * 60 * 60 * 1000);
        const last7Days = new Date(now - 7 * 24 * 60 * 60 * 1000);
        const last24Hours = new Date(now - 24 * 60 * 60 * 1000);

        // Execute all queries in parallel for performance
        const [
            totalUsers,
            activeSubscribers,
            usersByTier,
            recentSignups,
            userGrowth,
            topTraders,
            platformStats,
            revenueByTier
        ] = await Promise.all([
            // Total users count
            User.countDocuments(),

            // Active subscribers (trial or active status)
            User.countDocuments({
                'subscription.status': { $in: ['active', 'trial'] }
            }),

            // Users by subscription tier
            User.aggregate([
                {
                    $group: {
                        _id: '$subscription.tier',
                        count: { $sum: 1 }
                    }
                }
            ]),

            // Recent signups (last 7 days)
            User.find({
                createdAt: { $gte: last7Days }
            })
            .select('discordUsername subscription.tier createdAt')
            .sort({ createdAt: -1 })
            .limit(20)
            .lean(),

            // User growth trend (last 30 days, daily breakdown)
            User.aggregate([
                {
                    $match: {
                        createdAt: { $gte: last30Days }
                    }
                },
                {
                    $group: {
                        _id: {
                            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
                        },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { _id: 1 } }
            ]),

            // Top traders by total trades
            User.find()
                .select('discordUsername stats.totalTradesExecuted stats.successfulTrades stats.totalProfit stats.totalLoss subscription.tier')
                .sort({ 'stats.totalTradesExecuted': -1 })
                .limit(10)
                .lean(),

            // Platform-wide trading statistics
            Trade.aggregate([
                {
                    $group: {
                        _id: null,
                        totalTrades: { $sum: 1 },
                        totalVolume: { $sum: { $multiply: ['$quantity', '$entryPrice'] } },
                        totalProfitLoss: { $sum: '$profitLoss' },
                        totalFees: { $sum: '$fees.total' },
                        avgProfitLoss: { $avg: '$profitLoss' },
                        winningTrades: {
                            $sum: { $cond: [{ $gt: ['$profitLoss', 0] }, 1, 0] }
                        },
                        losingTrades: {
                            $sum: { $cond: [{ $lt: ['$profitLoss', 0] }, 1, 0] }
                        }
                    }
                }
            ]),

            // Revenue potential by tier (based on subscriber counts)
            User.aggregate([
                {
                    $match: {
                        'subscription.status': 'active'
                    }
                },
                {
                    $group: {
                        _id: '$subscription.tier',
                        count: { $sum: 1 }
                    }
                }
            ])
        ]);

        // Calculate tier pricing (monthly)
        const tierPricing = {
            free: 0,
            basic: 29.99,
            pro: 79.99,
            premium: 199.99
        };

        // Calculate estimated monthly recurring revenue (MRR)
        let estimatedMRR = 0;
        const revenueBreakdown = {};

        revenueByTier.forEach(tier => {
            const tierName = tier._id;
            const price = tierPricing[tierName] || 0;
            const revenue = tier.count * price;
            estimatedMRR += revenue;
            revenueBreakdown[tierName] = {
                subscribers: tier.count,
                pricePerMonth: price,
                monthlyRevenue: revenue
            };
        });

        // Format users by tier for easier consumption
        const tierDistribution = {};
        usersByTier.forEach(tier => {
            tierDistribution[tier._id] = tier.count;
        });

        // Calculate platform-wide statistics
        const platformMetrics = platformStats[0] || {
            totalTrades: 0,
            totalVolume: 0,
            totalProfitLoss: 0,
            totalFees: 0,
            avgProfitLoss: 0,
            winningTrades: 0,
            losingTrades: 0
        };

        const winRate = platformMetrics.totalTrades > 0
            ? ((platformMetrics.winningTrades / platformMetrics.totalTrades) * 100).toFixed(2)
            : '0.00';

        // Activity metrics
        const [activeUsers30d, activeUsers7d, activeUsers24h] = await Promise.all([
            User.countDocuments({ 'metadata.lastActiveAt': { $gte: last30Days } }),
            User.countDocuments({ 'metadata.lastActiveAt': { $gte: last7Days } }),
            User.countDocuments({ 'metadata.lastActiveAt': { $gte: last24Hours } })
        ]);

        res.json({
            success: true,
            data: {
                // User metrics
                users: {
                    total: totalUsers,
                    activeSubscribers,
                    byTier: tierDistribution,
                    recentSignups: recentSignups.length,
                    recentSignupsList: recentSignups
                },

                // Activity metrics
                activity: {
                    activeUsers30Days: activeUsers30d,
                    activeUsers7Days: activeUsers7d,
                    activeUsers24Hours: activeUsers24h,
                    activityRate30d: totalUsers > 0 ? ((activeUsers30d / totalUsers) * 100).toFixed(2) : '0.00',
                    activityRate7d: totalUsers > 0 ? ((activeUsers7d / totalUsers) * 100).toFixed(2) : '0.00'
                },

                // Growth trends
                growth: {
                    dailySignups: userGrowth,
                    totalSignups30d: userGrowth.reduce((sum, day) => sum + day.count, 0)
                },

                // Revenue metrics
                revenue: {
                    estimatedMRR,
                    breakdown: revenueBreakdown,
                    averageRevenuePerUser: totalUsers > 0 ? (estimatedMRR / totalUsers).toFixed(2) : '0.00'
                },

                // Trading platform metrics
                platform: {
                    totalTrades: platformMetrics.totalTrades,
                    totalVolume: platformMetrics.totalVolume.toFixed(2),
                    totalProfitLoss: platformMetrics.totalProfitLoss.toFixed(2),
                    totalFees: platformMetrics.totalFees.toFixed(2),
                    avgProfitLoss: platformMetrics.avgProfitLoss.toFixed(2),
                    winRate: `${winRate}%`,
                    winningTrades: platformMetrics.winningTrades,
                    losingTrades: platformMetrics.losingTrades
                },

                // Top performers
                topTraders: topTraders.map(user => ({
                    username: user.discordUsername,
                    tier: user.subscription.tier,
                    totalTrades: user.stats.totalTradesExecuted,
                    successfulTrades: user.stats.successfulTrades,
                    totalProfit: user.stats.totalProfit.toFixed(2),
                    totalLoss: user.stats.totalLoss.toFixed(2),
                    netPL: (user.stats.totalProfit - user.stats.totalLoss).toFixed(2),
                    winRate: user.stats.totalTradesExecuted > 0
                        ? ((user.stats.successfulTrades / user.stats.totalTradesExecuted) * 100).toFixed(2)
                        : '0.00'
                }))
            },
            timestamp: now.toISOString()
        });

    } catch (error) {
        console.error('Admin stats API error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch admin statistics',
            message: error.message
        });
    }
});

/**
 * @route   GET /api/admin/users
 * @desc    Get paginated list of all users with search and filtering
 * @access  Admin only
 * @query   {number} page - Page number
 * @query   {number} limit - Items per page
 * @query   {string} search - Search by username
 * @query   {string} tier - Filter by subscription tier
 * @query   {string} status - Filter by subscription status
 */
router.get('/users', async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
        const skip = (page - 1) * limit;

        // Build query
        const query = {};

        // Search by username
        if (req.query.search) {
            query.discordUsername = new RegExp(req.query.search, 'i');
        }

        // Filter by tier
        if (req.query.tier) {
            query['subscription.tier'] = req.query.tier;
        }

        // Filter by status
        if (req.query.status) {
            query['subscription.status'] = req.query.status;
        }

        // Execute query with pagination
        const [users, totalCount] = await Promise.all([
            User.find(query)
                .select('discordUsername discordId subscription stats metadata isAdmin createdAt')
                .sort({ 'metadata.lastActiveAt': -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            User.countDocuments(query)
        ]);

        const totalPages = Math.ceil(totalCount / limit);

        res.json({
            success: true,
            data: {
                users,
                pagination: {
                    currentPage: page,
                    totalPages,
                    totalItems: totalCount,
                    itemsPerPage: limit,
                    hasNextPage: page < totalPages,
                    hasPrevPage: page > 1
                }
            }
        });

    } catch (error) {
        console.error('Admin users list API error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch users',
            message: error.message
        });
    }
});

/**
 * @route   PATCH /api/admin/users/:userId/admin
 * @desc    Toggle admin status for a user
 * @access  Admin only
 */
router.patch('/users/:userId/admin', async (req, res) => {
    try {
        const { userId } = req.params;
        const { isAdmin } = req.body;

        if (typeof isAdmin !== 'boolean') {
            return res.status(400).json({
                success: false,
                error: 'Invalid request',
                message: 'isAdmin must be a boolean value'
            });
        }

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Prevent users from removing their own admin status
        if (userId === req.user._id.toString() && !isAdmin) {
            return res.status(400).json({
                success: false,
                error: 'Cannot remove your own admin privileges',
                message: 'You cannot remove your own admin status. Have another admin do this.'
            });
        }

        user.isAdmin = isAdmin;
        await user.save();

        res.json({
            success: true,
            data: {
                userId: user._id,
                username: user.discordUsername,
                isAdmin: user.isAdmin
            },
            message: `User ${user.discordUsername} ${isAdmin ? 'granted' : 'revoked'} admin privileges`
        });

    } catch (error) {
        console.error('Admin toggle API error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update admin status',
            message: error.message
        });
    }
});

module.exports = router;
