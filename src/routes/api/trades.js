const express = require('express');
const router = express.Router();
const Trade = require('../../models/Trade');
const { ensureAuthenticated } = require('../../middleware/auth');
const { apiLimiter } = require('../../middleware/rateLimiter');

// Apply rate limiting to all routes
router.use(apiLimiter);

/**
 * @route   GET /api/trades
 * @desc    Get user's trade history with pagination, filtering, and sorting
 * @access  Private
 * @query   {number} page - Page number (default: 1)
 * @query   {number} limit - Items per page (default: 20, max: 100)
 * @query   {string} sortBy - Field to sort by (entryTime, exitTime, profitLoss, symbol)
 * @query   {string} sortOrder - Sort order (asc, desc) default: desc
 * @query   {string} status - Filter by status (FILLED, OPEN, CANCELLED, etc.)
 * @query   {string} exchange - Filter by exchange
 * @query   {string} symbol - Filter by symbol
 * @query   {string} startDate - Filter trades from this date (ISO format)
 * @query   {string} endDate - Filter trades until this date (ISO format)
 * @query   {string} side - Filter by side (BUY, SELL, LONG, SHORT)
 */
router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user._id;

    // Pagination parameters
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    // Sorting parameters
    const sortBy = req.query.sortBy || 'entryTime';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    const validSortFields = ['entryTime', 'exitTime', 'profitLoss', 'symbol', 'quantity'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'entryTime';

    // Build query filter
    const query = { userId };

    // Status filter
    if (req.query.status) {
      const validStatuses = ['FILLED', 'PARTIAL', 'CANCELLED', 'FAILED', 'OPEN'];
      if (validStatuses.includes(req.query.status.toUpperCase())) {
        query.status = req.query.status.toUpperCase();
      }
    }

    // Exchange filter
    if (req.query.exchange) {
      query.exchange = req.query.exchange.toLowerCase();
    }

    // Symbol filter (case-insensitive partial match)
    if (req.query.symbol) {
      query.symbol = new RegExp(req.query.symbol, 'i');
    }

    // Side filter
    if (req.query.side) {
      const validSides = ['BUY', 'SELL', 'LONG', 'SHORT'];
      if (validSides.includes(req.query.side.toUpperCase())) {
        query.side = req.query.side.toUpperCase();
      }
    }

    // Date range filter
    if (req.query.startDate || req.query.endDate) {
      query.entryTime = {};
      if (req.query.startDate) {
        const startDate = new Date(req.query.startDate);
        if (!isNaN(startDate)) {
          query.entryTime.$gte = startDate;
        }
      }
      if (req.query.endDate) {
        const endDate = new Date(req.query.endDate);
        if (!isNaN(endDate)) {
          query.entryTime.$lte = endDate;
        }
      }
    }

    // Execute query with pagination and sorting
    const [trades, totalCount] = await Promise.all([
      Trade.find(query)
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      Trade.countDocuments(query)
    ]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    // Get summary statistics for the filtered results
    const summary = await Trade.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalProfitLoss: { $sum: '$profitLoss' },
          totalFees: { $sum: '$fees.total' },
          avgProfitLoss: { $avg: '$profitLoss' },
          totalTrades: { $sum: 1 },
          winningTrades: {
            $sum: { $cond: [{ $gt: ['$profitLoss', 0] }, 1, 0] }
          },
          losingTrades: {
            $sum: { $cond: [{ $lt: ['$profitLoss', 0] }, 1, 0] }
          }
        }
      }
    ]);

    const stats = summary.length > 0 ? {
      totalTrades: summary[0].totalTrades || 0,
      winningTrades: summary[0].winningTrades || 0,
      losingTrades: summary[0].losingTrades || 0,
      totalProfitLoss: summary[0].totalProfitLoss || 0,
      totalFees: summary[0].totalFees || 0,
      avgProfitLoss: summary[0].avgProfitLoss || 0,
      winRate: summary[0].totalTrades > 0
        ? (summary[0].winningTrades / summary[0].totalTrades * 100).toFixed(2)
        : '0.00'
    } : {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      totalProfitLoss: 0,
      totalFees: 0,
      avgProfitLoss: 0,
      winRate: '0.00'
    };

    res.json({
      success: true,
      data: {
        trades,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: totalCount,
          itemsPerPage: limit,
          hasNextPage,
          hasPrevPage
        },
        summary: stats,
        filters: {
          status: req.query.status || 'all',
          exchange: req.query.exchange || 'all',
          symbol: req.query.symbol || 'all',
          side: req.query.side || 'all',
          dateRange: {
            start: req.query.startDate || null,
            end: req.query.endDate || null
          }
        }
      }
    });
  } catch (error) {
    console.error('Trade history API error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch trade history',
      message: error.message
    });
  }
});

/**
 * @route   GET /api/trades/:tradeId
 * @desc    Get detailed information for a specific trade
 * @access  Private
 */
router.get('/:tradeId', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user._id;
    const { tradeId } = req.params;

    const trade = await Trade.findOne({
      $or: [
        { _id: tradeId, userId },
        { tradeId: tradeId, userId }
      ]
    });

    if (!trade) {
      return res.status(404).json({
        success: false,
        error: 'Trade not found'
      });
    }

    res.json({
      success: true,
      data: trade
    });
  } catch (error) {
    console.error('Trade detail API error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch trade details',
      message: error.message
    });
  }
});

/**
 * @route   GET /api/trades/stats/summary
 * @desc    Get comprehensive trade statistics across all time periods
 * @access  Private
 */
router.get('/stats/summary', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user._id;

    // Get stats for different time periods in parallel
    const [allTime, last30d, last7d, last24h] = await Promise.all([
      Trade.getUserSummary(userId, 'all'),
      Trade.getUserSummary(userId, '30d'),
      Trade.getUserSummary(userId, '7d'),
      Trade.getUserSummary(userId, '24h')
    ]);

    res.json({
      success: true,
      data: {
        allTime,
        last30Days: last30d,
        last7Days: last7d,
        last24Hours: last24h
      }
    });
  } catch (error) {
    console.error('Trade stats API error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch trade statistics',
      message: error.message
    });
  }
});

module.exports = router;
