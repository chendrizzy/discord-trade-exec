/**
 * Signal Subscription Management API Routes
 * Endpoints for subscribing to signal providers, managing subscriptions, and discovering providers
 */

// External dependencies
const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { ensureAuthenticated } = require('../../middleware/auth');
const { extractTenantMiddleware } = require('../../middleware/tenantAuth');
const { auditLog } = require('../../middleware/auditLogger');
const { apiLimiter } = require('../../middleware/rateLimiter');
const { validate } = require('../../middleware/validation');
const { sendSuccess, sendError, sendValidationError, sendNotFound } = require('../../utils/api-response');
const signalSubscriptionService = require('../../services/SignalSubscriptionService');
const logger = require('../../utils/logger');
const { AppError, ErrorCodes } = require('../../middleware/errorHandler');

// Apply rate limiting
router.use(apiLimiter);

// Zod schema for POST /api/signal-subscriptions
const subscribeSchema = z.object({
  providerId: z.string().min(1, 'Provider ID is required'),
  subscriptionType: z.enum(['free', 'standard', 'premium']).default('standard')
});

// Zod schema for PUT /api/signal-subscriptions/:channelId/settings
const updateSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  minConfidence: z.number().min(0).max(1).optional()
});

// Zod schema for GET /api/signal-subscriptions/available
const getAvailableProvidersSchema = z.object({
  minWinRate: z.coerce.number().min(0).max(1).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  market: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

/**
 * @route   POST /api/signal-subscriptions
 * @desc    Subscribe to a signal provider
 * @access  Private
 */
router.post(
  '/',
  extractTenantMiddleware,
  auditLog('signal_subscription.create', 'User', { captureAfter: true }),
  validate(subscribeSchema, 'body'),
  async (req, res) => {
    try {
      const userId = req.tenant.userId;
      const { providerId, subscriptionType } = req.body;

      const result = await signalSubscriptionService.subscribeToProvider(userId, providerId, subscriptionType, req);

      if (!result.success) {
        return sendError(res, result.error, 400);
      }

      return sendSuccess(res, result.subscription, `Successfully subscribed to ${result.subscription.providerName}`);
    } catch (error) {

      logger.error('[Signal Subscription API] Error subscribing to provider:', {

        error: error.message,


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
 * @route   DELETE /api/signal-subscriptions/:providerId
 * @desc    Unsubscribe from a signal provider
 * @access  Private
 */
router.delete(
  '/:providerId',
  extractTenantMiddleware,
  auditLog('signal_subscription.delete', 'User', { captureBefore: true }),
  async (req, res) => {
    try {
      const userId = req.tenant.userId;
      const { providerId } = req.params;

      const result = await signalSubscriptionService.unsubscribeFromProvider(userId, providerId);

      if (!result.success) {
        return sendError(res, result.error, 400);
      }

      return sendSuccess(res, null, result.message);
    } catch (error) {

      logger.error('[Signal Subscription API] Error unsubscribing from provider:', {

        error: error.message,


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
 * @route   PUT /api/signal-subscriptions/:channelId/settings
 * @desc    Update subscription settings (enabled status, confidence threshold)
 * @access  Private
 */
router.put(
  '/:channelId/settings',
  extractTenantMiddleware,
  auditLog('signal_subscription.update', 'User', { captureBefore: true, captureAfter: true }),
  validate(updateSettingsSchema, 'body'),
  async (req, res) => {
    try {
      const userId = req.tenant.userId;
      const { channelId } = req.params;
      const settings = req.body;

      const result = await signalSubscriptionService.updateSubscriptionSettings(userId, channelId, settings);

      if (!result.success) {
        return sendError(res, result.error, 400);
      }

      return sendSuccess(
        res,
        result.subscription,
        `Subscription settings updated for ${result.subscription.channelName}`
      );
    } catch (error) {

      logger.error('[Signal Subscription API] Error updating subscription settings:', {

        error: error.message,


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
 * @route   GET /api/signal-subscriptions
 * @desc    Get user's current signal provider subscriptions
 * @access  Private
 */
router.get('/', extractTenantMiddleware, auditLog('signal_subscription.view', 'User'), async (req, res) => {
  try {
    const userId = req.tenant.userId;

    const result = await signalSubscriptionService.getUserSubscriptions(userId);

    if (!result.success) {
      return sendError(res, result.error, 400);
    }

    return sendSuccess(res, result.subscriptions, `${result.subscriptions.length} active subscription(s) found`);
  } catch (error) {

    logger.error('[Signal Subscription API] Error fetching subscriptions:', {

      error: error.message,


      correlationId: req.correlationId

    });

    throw new AppError(

      'Operation failed',

      500,

      ErrorCodes.INTERNAL_SERVER_ERROR

    );

  }
});

/**
 * @route   GET /api/signal-subscriptions/available
 * @desc    Get available signal providers (not yet subscribed)
 * @access  Private
 */
router.get(
  '/available',
  extractTenantMiddleware,
  auditLog('signal_subscription.browse', 'SignalProvider'),
  validate(getAvailableProvidersSchema, 'query'),
  async (req, res) => {
    try {
      const userId = req.tenant.userId;
      const filters = req.query;

      const result = await signalSubscriptionService.getAvailableProviders(userId, filters);

      if (!result.success) {
        return sendError(res, result.error, 400);
      }

      return sendSuccess(
        res,
        {
          providers: result.providers,
          filters,
          count: result.providers.length
        },
        `${result.providers.length} available provider(s) found`
      );
    } catch (error) {

      logger.error('[Signal Subscription API] Error fetching available providers:', {

        error: error.message,


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
 * @route   GET /api/signal-subscriptions/providers/:providerId
 * @desc    Get detailed information about a specific signal provider
 * @access  Private
 */
router.get(
  '/providers/:providerId',
  extractTenantMiddleware,
  auditLog('signal_subscription.view_provider', 'SignalProvider'),
  async (req, res) => {
    try {
      const { providerId } = req.params;
      const SignalProvider = require('../../models/SignalProvider');

      const provider = await SignalProvider.findOne({ providerId });

      if (!provider) {
        return sendNotFound(res, 'Signal Provider');
      }

      return sendSuccess(
        res,
        {
          providerId: provider.providerId,
          name: provider.name,
          description: provider.description,
          channelId: provider.source.channelId,
          performance: {
            winRate: provider.performance.winRate,
            netProfit: provider.performance.netProfit,
            totalSignals: provider.performance.totalSignals,
            executedTrades: provider.performance.executedTrades,
            avgProfitPerTrade: provider.performance.avgProfitPerTrade
          },
          rating: provider.rating,
          subscribers: provider.subscribers,
          activeSubscribers: provider.activeSubscribers,
          verificationStatus: provider.verificationStatus,
          markets: provider.preferences.markets,
          tradingStyle: provider.preferences.tradingStyle,
          isActive: provider.isActive
        },
        'Provider details retrieved successfully'
      );
    } catch (error) {

      logger.error('[Signal Subscription API] Error fetching provider details:', {

        error: error.message,


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

module.exports = router;
