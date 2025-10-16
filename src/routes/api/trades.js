// External dependencies
const express = require('express');

const router = express.Router();
const { z } = require('zod');
const Trade = require('../../models/Trade');
const { ensureAuthenticated } = require('../../middleware/auth');
const { extractTenantMiddleware } = require('../../middleware/tenantAuth');
const { auditLog } = require('../../middleware/auditLogger');
const { apiLimiter } = require('../../middleware/rateLimiter');
const { validate, Schemas } = require('../../middleware/validation');
const BaseRepository = require('../../repositories/BaseRepository');
const { sendSuccess, sendError, sendValidationError, sendNotFound } = require('../../utils/api-response');
const tradeExecutionService = require('../../services/TradeExecutionService');

// Apply rate limiting to all routes
router.use(apiLimiter);

// Initialize Trade Repository for tenant-scoped queries
const tradeRepository = new BaseRepository(Trade);

// Zod schema for the GET /api/trades query parameters
const getTradesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['entryTime', 'exitTime', 'profitLoss', 'symbol', 'quantity']).default('entryTime'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  status: z.enum(['FILLED', 'PARTIAL', 'CANCELLED', 'FAILED', 'OPEN']).optional(),
  exchange: Schemas.exchangeName.optional(),
  symbol: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  side: z.enum(['BUY', 'SELL', 'LONG', 'SHORT']).optional()
});

/**
 * @route   GET /api/trades
 * @desc    Get user's trade history with pagination, filtering, and sorting
 * @access  Private (Multi-Tenant)
 */
router.get(
  '/',
  extractTenantMiddleware,
  auditLog('trade.view', 'Trade'),
  validate(getTradesSchema, 'query'),
  async (req, res) => {
    try {
      const userId = req.tenant.userId; // Use tenant context
      const { page, limit, sortBy, sortOrder, status, exchange, symbol, startDate, endDate, side } = req.query;

      const skip = (page - 1) * limit;
      const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

      // Build query filter (communityId automatically scoped by plugin)
      const query = { userId };
      if (status) query.status = status;
      if (exchange) query.exchange = exchange;
      if (symbol) query.symbol = new RegExp(symbol, 'i');
      if (side) query.side = side;
      if (startDate || endDate) {
        query.entryTime = {};
        if (startDate) query.entryTime.$gte = startDate;
        if (endDate) query.entryTime.$lte = endDate;
      }

      // Execute query with pagination using repository (tenant-scoped)
      const [trades, totalCount] = await Promise.all([
        tradeRepository.findAll(query, { sort, skip, limit }),
        tradeRepository.count(query)
      ]);

      // Calculate pagination metadata
      const totalPages = Math.ceil(totalCount / limit);

      // Get summary statistics (tenant-scoped by plugin pre-aggregate hook)
      const summary = await tradeRepository.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalProfitLoss: { $sum: '$profitLoss' },
            totalFees: { $sum: '$fees.total' },
            avgProfitLoss: { $avg: '$profitLoss' },
            totalTrades: { $sum: 1 },
            winningTrades: { $sum: { $cond: [{ $gt: ['$profitLoss', 0] }, 1, 0] } },
            losingTrades: { $sum: { $cond: [{ $lt: ['$profitLoss', 0] }, 1, 0] } }
          }
        }
      ]);

      const stats =
        summary.length > 0
          ? {
              totalTrades: summary[0].totalTrades || 0,
              winningTrades: summary[0].winningTrades || 0,
              losingTrades: summary[0].losingTrades || 0,
              totalProfitLoss: summary[0].totalProfitLoss || 0,
              totalFees: summary[0].totalFees || 0,
              avgProfitLoss: summary[0].avgProfitLoss || 0,
              winRate:
                summary[0].totalTrades > 0
                  ? ((summary[0].winningTrades / summary[0].totalTrades) * 100).toFixed(2)
                  : '0.00'
            }
          : {
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
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1
          },
          summary: stats,
          filters: req.query
        }
      });
    } catch (error) {
      console.error('Trade history API error:', error);
      return sendError(res, 'Failed to fetch trade history', 500, { message: error.message });
    }
  }
);

/**
 * @route   GET /api/trades/:tradeId
 * @desc    Get detailed information for a specific trade
 * @access  Private (Multi-Tenant)
 */
router.get('/:tradeId', extractTenantMiddleware, auditLog('trade.view', 'Trade'), async (req, res) => {
  try {
    const userId = req.tenant.userId; // Use tenant context
    const { tradeId } = req.params;

    // Basic validation for tradeId
    if (!tradeId.match(/^[a-f\d]{24}$/i)) {
      return sendValidationError(res, 'Invalid trade ID format');
    }

    // Query automatically tenant-scoped
    const trade = await tradeRepository.findOne({ _id: tradeId, userId });

    if (!trade) {
      return sendNotFound(res, 'Trade');
    }

    res.json({
      success: true,
      data: trade
    });
  } catch (error) {
    console.error('Trade detail API error:', error);
    return sendError(res, 'Failed to fetch trade details', 500, { message: error.message });
  }
});

/**
 * @route   GET /api/trades/stats/summary
 * @desc    Get comprehensive trade statistics across all time periods
 * @access  Private (Multi-Tenant)
 */
router.get('/stats/summary', extractTenantMiddleware, auditLog('trade.stats', 'Trade'), async (req, res) => {
  try {
    const userId = req.tenant.userId; // Use tenant context

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
    return sendError(res, 'Failed to fetch trade statistics', 500, { message: error.message });
  }
});

// Zod schema for POST /api/trades/execute
const executeTradeSchema = z.object({
  broker: z.string().min(1, 'Broker is required'),
  symbol: z.string().min(1, 'Symbol is required'),
  side: z.enum(['BUY', 'SELL', 'LONG', 'SHORT']).default('BUY'),
  quantity: z.number().positive('Quantity must be positive'),
  entryPrice: z.number().positive('Entry price must be positive'),
  stopLoss: z.number().positive('Stop loss must be positive').optional(),
  takeProfit: z.number().positive('Take profit must be positive').optional(),
  // Signal source information
  providerId: z.string().optional(),
  providerName: z.string().optional(),
  signalId: z.string().optional(),
  // Quality metrics
  qualityTier: z.enum(['GOLD', 'SILVER', 'BRONZE', 'STANDARD']).optional(),
  confidenceScore: z.number().min(0).max(1).optional(),
  smartMoneyScore: z.number().min(0).max(1).optional(),
  rareInformationScore: z.number().min(0).max(1).optional(),
  predictedDirection: z.enum(['UP', 'DOWN', 'NEUTRAL']).optional()
});

// Zod schema for POST /api/trades/:tradeId/close
const closeTradeSchema = z.object({
  exitPrice: z.number().positive('Exit price must be positive')
});

/**
 * @route   POST /api/trades/execute
 * @desc    Execute a new trade based on signal or manual entry
 * @access  Private (Multi-Tenant)
 */
router.post(
  '/execute',
  extractTenantMiddleware,
  auditLog('trade.execute', 'Trade', { captureAfter: true }),
  validate(executeTradeSchema, 'body'),
  async (req, res) => {
    try {
      const userId = req.tenant.userId;
      const signalData = req.body;

      const result = await tradeExecutionService.executeTrade(signalData, userId, signalData.broker, req);

      if (!result.success) {
        return sendError(res, result.error, 400);
      }

      return sendSuccess(res, result.trade, 'Trade executed successfully');
    } catch (error) {
      console.error('[Trade Execution API] Error executing trade:', error);
      return sendError(res, 'Failed to execute trade', 500, { message: error.message });
    }
  }
);

/**
 * @route   POST /api/trades/:tradeId/close
 * @desc    Close an open trade with exit price
 * @access  Private (Multi-Tenant)
 */
router.post(
  '/:tradeId/close',
  extractTenantMiddleware,
  auditLog('trade.close', 'Trade', { captureBefore: true, captureAfter: true }),
  validate(closeTradeSchema, 'body'),
  async (req, res) => {
    try {
      const { tradeId } = req.params;
      const { exitPrice } = req.body;

      const result = await tradeExecutionService.closeTrade(tradeId, exitPrice, req);

      if (!result.success) {
        return sendError(res, result.error, 400);
      }

      return sendSuccess(
        res,
        result.trade,
        `Trade closed with ${result.trade.profitLoss >= 0 ? 'profit' : 'loss'}: $${Math.abs(result.trade.profitLoss).toFixed(2)}`
      );
    } catch (error) {
      console.error('[Trade Execution API] Error closing trade:', error);
      return sendError(res, 'Failed to close trade', 500, { message: error.message });
    }
  }
);

/**
 * @route   DELETE /api/trades/:tradeId
 * @desc    Cancel an open trade
 * @access  Private (Multi-Tenant)
 */
router.delete(
  '/:tradeId',
  extractTenantMiddleware,
  auditLog('trade.cancel', 'Trade', { captureBefore: true, captureAfter: true }),
  async (req, res) => {
    try {
      const { tradeId } = req.params;

      const result = await tradeExecutionService.cancelTrade(tradeId);

      if (!result.success) {
        return sendError(res, result.error, 400);
      }

      return sendSuccess(res, result.trade, 'Trade cancelled successfully');
    } catch (error) {
      console.error('[Trade Execution API] Error cancelling trade:', error);
      return sendError(res, 'Failed to cancel trade', 500, { message: error.message });
    }
  }
);

/**
 * @route   GET /api/trades/active
 * @desc    Get all active (open) trades for the user
 * @access  Private (Multi-Tenant)
 */
router.get(
  '/active',
  extractTenantMiddleware,
  auditLog('trade.view_active', 'Trade'),
  async (req, res) => {
    try {
      const userId = req.tenant.userId;

      const result = await tradeExecutionService.getActiveTrades(userId);

      if (!result.success) {
        return sendError(res, result.error, 400);
      }

      return sendSuccess(res, result.trades, `${result.trades.length} active trade(s) found`);
    } catch (error) {
      console.error('[Trade Execution API] Error fetching active trades:', error);
      return sendError(res, 'Failed to fetch active trades', 500, { message: error.message });
    }
  }
);

/**
 * @route   GET /api/trades/history
 * @desc    Get trade history for user with timeframe filter
 * @access  Private (Multi-Tenant)
 */
router.get(
  '/history',
  extractTenantMiddleware,
  auditLog('trade.view_history', 'Trade'),
  async (req, res) => {
    try {
      const userId = req.tenant.userId;
      const { timeframe = '30d' } = req.query;

      // Validate timeframe
      if (!['24h', '7d', '30d', 'all'].includes(timeframe)) {
        return sendValidationError(res, 'Invalid timeframe. Must be one of: 24h, 7d, 30d, all');
      }

      const result = await tradeExecutionService.getTradeHistory(userId, timeframe);

      if (!result.success) {
        return sendError(res, result.error, 400);
      }

      return sendSuccess(
        res,
        {
          trades: result.trades,
          summary: result.summary,
          timeframe
        },
        `Trade history retrieved (${result.trades.length} trades)`
      );
    } catch (error) {
      console.error('[Trade Execution API] Error fetching trade history:', error);
      return sendError(res, 'Failed to fetch trade history', 500, { message: error.message });
    }
  }
);

module.exports = router;
