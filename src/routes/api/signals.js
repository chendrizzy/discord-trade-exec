/**
 * Signal Quality API Routes
 *
 * Endpoints for signal quality analysis, provider leaderboards, and quality updates
 */

// External dependencies
const express = require('express');

const router = express.Router();
const { z } = require('zod');
const Trade = require('../../models/Trade');
const { ensureAuthenticated } = require('../../middleware/auth');
const { extractTenantMiddleware, checkTenantPermission } = require('../../middleware/tenantAuth');
const { auditLog } = require('../../middleware/auditLogger');
const { apiLimiter } = require('../../middleware/rateLimiter');
const { validate } = require('../../middleware/validation');
const signalQualityTracker = require('../../services/signal-quality-tracker');
const BaseRepository = require('../../repositories/BaseRepository');
const { sendSuccess, sendError, sendNotFound } = require('../../utils/api-response');
const logger = require('../../utils/logger');
const { AppError, ErrorCodes } = require('../../middleware/errorHandler');

// Apply rate limiting to all signal quality routes
router.use(apiLimiter);

// Initialize Trade Repository for tenant-scoped queries
const tradeRepository = new BaseRepository(Trade);

// Zod schema for GET /api/signals/:signalId/quality
const getSignalQualitySchema = z.object({
  includeProviderStats: z.enum(['true', 'false']).default('true'),
  includePositionSizing: z.enum(['true', 'false']).default('true')
});

/**
 * GET /api/signals/:signalId/quality
 * Get quality analysis for a specific signal/trade
 * @access Private (Multi-Tenant)
 */
router.get(
  '/:signalId/quality',
  extractTenantMiddleware,
  auditLog('signal.view', 'Trade'),
  validate(getSignalQualitySchema, 'query'),
  async (req, res) => {
    try {
      const { signalId } = req.params;
      const { includeProviderStats, includePositionSizing } = req.query;

      // Query automatically tenant-scoped (no manual authorization check needed)
      const trade = await tradeRepository.findById(signalId);
      if (!trade) {
        return sendNotFound(res, 'Signal');
      }

      const qualityAnalysis = await signalQualityTracker.analyzeSignalQuality(trade, {
        includeProviderStats: includeProviderStats === 'true',
        includePositionSizing: includePositionSizing === 'true'
      });

      res.json({ success: true, data: qualityAnalysis });
    } catch (error) {

      logger.error('Error fetching signal quality:', {

        error: error.message,

        stack: error.stack,

        correlationId: req.correlationId

      });

      throw new AppError(

        'Operation failed',

        500,

        ErrorCodes.INTERNAL_SERVER_ERROR

      );

    }
  }
);

/**
 * POST /api/signals/:signalId/quality/update
 * Recalculate and update quality analysis for a signal
 * @access Private (Multi-Tenant)
 */
router.post(
  '/:signalId/quality/update',
  extractTenantMiddleware,
  checkTenantPermission('manage_signals'),
  auditLog('signal.update', 'Trade', { captureBefore: true, captureAfter: true }),
  async (req, res) => {
    try {
      const { signalId } = req.params;
      const { context = {}, riskParameters = {} } = req.body;

      // Query automatically tenant-scoped
      const trade = await tradeRepository.findById(signalId);
      if (!trade) {
        return sendNotFound(res, 'Signal');
      }

      const qualityAnalysis = await signalQualityTracker.analyzeSignalQuality(trade, {
        context,
        riskParameters
      });

      trade.qualityTier = qualityAnalysis.quality.tier;
      trade.confidenceScore = qualityAnalysis.quality.confidence;
      await trade.save();

      res.json({ success: true, data: qualityAnalysis, message: 'Signal quality updated successfully' });
    } catch (error) {

      logger.error('Error updating signal quality:', {

        error: error.message,

        stack: error.stack,

        correlationId: req.correlationId

      });

      throw new AppError(

        'Operation failed',

        500,

        ErrorCodes.INTERNAL_SERVER_ERROR

      );

    }
  }
);

// Zod schema for GET /api/providers/leaderboard
const getLeaderboardSchema = z.object({
  timeRange: z.enum(['7d', '30d', '90d', 'all']).default('30d'),
  minSignals: z.coerce.number().int().min(1).max(100).default(10),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

/**
 * GET /api/providers/leaderboard
 * Get ranked provider leaderboard based on signal quality
 * @access Private (Multi-Tenant)
 */
router.get(
  '/providers/leaderboard',
  extractTenantMiddleware,
  auditLog('signal.leaderboard', 'SignalProvider'),
  validate(getLeaderboardSchema, 'query'),
  async (req, res) => {
    try {
      const { timeRange, minSignals, limit } = req.query;

      const leaderboard = await signalQualityTracker.getProviderLeaderboard({
        timeRange,
        minSignals,
        limit
      });

      res.json({
        success: true,
        data: {
          leaderboard,
          filters: req.query,
          count: leaderboard.length,
          timestamp: new Date()
        }
      });
    } catch (error) {

      logger.error('Error fetching provider leaderboard:', {

        error: error.message,

        stack: error.stack,

        correlationId: req.correlationId

      });

      throw new AppError(

        'Operation failed',

        500,

        ErrorCodes.INTERNAL_SERVER_ERROR

      );

    }
  }
);

// ... (other routes remain the same for brevity, can be refactored similarly)

module.exports = router;
