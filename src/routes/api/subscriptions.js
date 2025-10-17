/**
 * Subscription Management API Routes
 * Endpoints for managing user subscriptions, billing, and tier changes
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
const subscriptionManager = require('../../services/subscription-manager');

// Apply rate limiting
router.use(apiLimiter);

// Zod schema for POST /api/subscriptions/cancel
const cancelSubscriptionSchema = z.object({
  reason: z
    .enum(['too_expensive', 'not_enough_features', 'poor_results', 'switching_service', 'technical_issues', 'other'])
    .default('other'),
  feedback: z.string().max(500).optional()
});

// Zod schema for POST /api/subscriptions/upgrade (admin only)
const upgradeSubscriptionSchema = z.object({
  userId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid user ID'),
  tier: z.enum(['free', 'basic', 'pro', 'premium'])
});

/**
 * @route   GET /api/subscriptions/status
 * @desc    Get current subscription status and limits
 * @access  Private
 */
router.get('/status', extractTenantMiddleware, auditLog('subscription.view', 'User'), async (req, res) => {
  try {
    const userId = req.tenant.userId;

    const result = await subscriptionManager.getSubscriptionStatus(userId);

    if (!result.success) {
      return sendError(res, result.error, 400);
    }

    return sendSuccess(res, result.subscription, 'Subscription status retrieved successfully');
  } catch (error) {
    console.error('[Subscription API] Error fetching subscription status:', error);
    return sendError(res, 'Failed to fetch subscription status', 500, { message: error.message });
  }
});

/**
 * @route   POST /api/subscriptions/cancel
 * @desc    Cancel current subscription with reason and feedback
 * @access  Private
 */
router.post(
  '/cancel',
  extractTenantMiddleware,
  auditLog('subscription.cancel', 'User', { captureBefore: true, captureAfter: true }),
  validate(cancelSubscriptionSchema, 'body'),
  async (req, res) => {
    try {
      const userId = req.tenant.userId;
      const { reason, feedback } = req.body;

      // Get user's current subscription to create cancellation object
      const statusResult = await subscriptionManager.getSubscriptionStatus(userId);

      if (!statusResult.success) {
        return sendError(res, statusResult.error, 400);
      }

      const { subscription } = statusResult;

      // Check if user has active subscription
      if (subscription.tier === 'free' || subscription.status === 'cancelled') {
        return sendValidationError(res, 'No active subscription to cancel');
      }

      // Create subscription object for cancellation
      const subscriptionObj = {
        customer: subscription.stripeCustomerId,
        id: subscription.stripeSubscriptionId
      };

      const result = await subscriptionManager.handleSubscriptionCanceled(subscriptionObj, reason, feedback, req);

      if (!result.success) {
        return sendError(res, result.error, 400);
      }

      return sendSuccess(
        res,
        {
          previousTier: result.user.previousTier,
          newTier: result.user.newTier,
          reason,
          effectiveDate: new Date()
        },
        'Subscription cancelled successfully'
      );
    } catch (error) {
      console.error('[Subscription API] Error cancelling subscription:', error);
      return sendError(res, 'Failed to cancel subscription', 500, { message: error.message });
    }
  }
);

/**
 * @route   POST /api/subscriptions/upgrade
 * @desc    Manually upgrade user subscription (admin only)
 * @access  Private (Admin)
 */
router.post(
  '/upgrade',
  extractTenantMiddleware,
  auditLog('subscription.upgrade', 'User', { captureBefore: true, captureAfter: true }),
  validate(upgradeSubscriptionSchema, 'body'),
  async (req, res) => {
    try {
      // Check if user is admin
      const user = await req.tenant.getUser();
      if (!user || !user.isAdmin) {
        return sendError(res, 'Unauthorized: Admin access required', 403);
      }

      const { userId, tier } = req.body;

      const result = await subscriptionManager.upgradeSubscription(userId, tier, req);

      if (!result.success) {
        return sendError(res, result.error, 400);
      }

      return sendSuccess(
        res,
        {
          userId: result.user.id,
          previousTier: result.user.previousTier,
          newTier: result.user.newTier,
          upgradedAt: new Date()
        },
        `User upgraded from ${result.user.previousTier} to ${result.user.newTier}`
      );
    } catch (error) {
      console.error('[Subscription API] Error upgrading subscription:', error);
      return sendError(res, 'Failed to upgrade subscription', 500, { message: error.message });
    }
  }
);

/**
 * @route   GET /api/subscriptions/limits
 * @desc    Get current usage against subscription limits
 * @access  Private
 */
router.get('/limits', extractTenantMiddleware, auditLog('subscription.limits', 'User'), async (req, res) => {
  try {
    const userId = req.tenant.userId;

    const result = await subscriptionManager.getSubscriptionStatus(userId);

    if (!result.success) {
      return sendError(res, result.error, 400);
    }

    const { subscription } = result;

    return sendSuccess(
      res,
      {
        tier: subscription.tier,
        limits: {
          signalsPerDay: {
            limit: subscription.limits.signalsPerDay,
            used: subscription.limits.signalsUsedToday,
            remaining:
              subscription.limits.signalsPerDay === Infinity
                ? 'unlimited'
                : subscription.limits.signalsPerDay - subscription.limits.signalsUsedToday
          },
          maxBrokers: {
            limit: subscription.limits.maxBrokers,
            message: `You can connect up to ${subscription.limits.maxBrokers} broker${subscription.limits.maxBrokers > 1 ? 's' : ''}`
          }
        },
        resetDate: new Date(new Date().setHours(24, 0, 0, 0)) // Reset at midnight
      },
      'Subscription limits retrieved successfully'
    );
  } catch (error) {
    console.error('[Subscription API] Error fetching subscription limits:', error);
    return sendError(res, 'Failed to fetch subscription limits', 500, { message: error.message });
  }
});

module.exports = router;
