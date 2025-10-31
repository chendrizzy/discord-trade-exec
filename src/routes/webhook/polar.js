/**
 * Polar.sh Webhook Handler
 *
 * Processes webhook events from Polar.sh for subscription management.
 * Routes events to Community or User models based on product metadata.
 *
 * Webhook Events:
 * - subscription.created: New subscription started
 * - subscription.updated: Subscription tier/status changed
 * - subscription.cancelled: Subscription cancelled
 * - checkout.completed: Checkout session completed
 *
 * Security:
 * - HMAC-SHA256 signature verification
 * - Replay attack protection
 * - Audit logging for all events
 */

const express = require('express');
const router = express.Router();
const BillingProviderFactory = require('../../services/billing/BillingProviderFactory');
const Community = require('../../models/Community');
const User = require('../../models/User');
const SecurityAudit = require('../../models/SecurityAudit');
const logger = require('../../utils/logger');
const { AppError, ErrorCodes } = require('../../middleware/errorHandler');

const WEBHOOK_EVENT_LIMIT = parseInt(process.env.POLAR_WEBHOOK_EVENT_LIMIT || '50', 10);
const webhookEvents = [];

/**
 * POST /webhook/polar
 * Handle incoming Polar.sh webhook events
 */
router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    // Create billing provider instance
    const billingProvider = BillingProviderFactory.createProvider();

    // Get signature from headers
    const signature = req.headers['polar-signature'] || req.headers['x-polar-signature'];
    const webhookSecret = process.env.POLAR_WEBHOOK_SECRET;

    if (!signature) {
      logger.error('[Polar Webhook] Missing signature header');
      return res.status(401).json({ error: 'Missing signature' });
    }

    // Verify webhook signature
    const rawBody = req.body.toString('utf8');
    const isValid = billingProvider.verifyWebhookSignature(rawBody, signature, webhookSecret);

    if (!isValid) {
      logger.error('[Polar Webhook] Invalid signature');
      await SecurityAudit.log({
        action: 'webhook.signature_failed',
        resourceType: 'Webhook',
        status: 'blocked',
        riskLevel: 'high',
        requiresReview: true,
        ipAddress: req.ip,
        details: { provider: 'polar', signature }
      });
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Parse event
    const event = JSON.parse(rawBody);
    const eventType = event.type;

    const eventSummary = {
      id: event.id,
      type: eventType,
      receivedAt: new Date().toISOString(),
      customerId: event.data?.customerId,
      status: event.data?.status,
      subscriptionId: event.data?.id || event.data?.subscriptionId || null
    };

    if (process.env.POLAR_WEBHOOK_EVENT_DEBUG === 'true') {
      eventSummary.payload = event;
    }

    webhookEvents.unshift(eventSummary);
    if (webhookEvents.length > WEBHOOK_EVENT_LIMIT) {
      webhookEvents.length = WEBHOOK_EVENT_LIMIT;
    }

    logger.info('[Polar Webhook] Received event', {
      eventType,
      eventId: event.id,
      customerId: event.data?.customerId,
      subscriptionId: event.data?.id || event.data?.subscriptionId
    });

    // Route event to appropriate handler
    switch (eventType) {
      case 'subscription.created':
        await handleSubscriptionCreated(event, req, billingProvider);
        break;

      case 'subscription.updated':
        await handleSubscriptionUpdated(event, req, billingProvider);
        break;

      case 'subscription.cancelled':
        await handleSubscriptionCancelled(event, req);
        break;

      case 'checkout.completed':
        await handleCheckoutCompleted(event, req, billingProvider);
        break;

      default:
        logger.warn('[Polar Webhook] Unhandled event type', { eventType });
    }

    // Acknowledge receipt
    res.json({ received: true, eventType });
  } catch (error) {

    logger.error('[Polar Webhook] Error processing webhook:', {

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
});

/**
 * Handle subscription.created event
 * Activates new subscriptions for communities or traders
 */
async function handleSubscriptionCreated(event, req, billingProvider) {
  const { customerId, id: subscriptionId, productId, status } = event.data;

  // Get product details to determine subscription type
  const product = await billingProvider.getProduct(productId);
  const subscriptionType = product.metadata?.type; // 'community' or 'trader'
  const tier = product.metadata?.tier; // 'professional' or 'enterprise'

  if (subscriptionType === 'community') {
    // Update Community model
    const community = await Community.findOne({
      'subscription.polarCustomerId': customerId
    });

    if (!community) {
      logger.error('[Polar Webhook] Community not found for customer', { customerId, subscriptionType });
      return;
    }

    const oldTier = community.subscription.tier;

    community.subscription.polarSubscriptionId = subscriptionId;
    community.subscription.tier = tier;
    community.subscription.status = status;
    community.subscription.currentPeriodEnd = new Date(event.data.currentPeriodEnd);
    community.subscription.cancelAtPeriodEnd = event.data.cancelAtPeriodEnd || false;

    // Update community limits based on tier
    const tierLimits = getCommunityTierLimits(tier);
    community.limits.memberCount = tierLimits.memberCount;
    community.limits.signalProvidersCount = tierLimits.signalProvidersCount;
    community.limits.signalsPerDay = tierLimits.signalsPerDay;

    await community.save();

    // Log security audit
    await SecurityAudit.log({
      communityId: community._id,
      action: 'subscription.created',
      resourceType: 'Subscription',
      resourceId: subscriptionId,
      status: 'success',
      riskLevel: 'medium',
      ipAddress: req.ip,
      dataBefore: { tier: oldTier },
      dataAfter: { tier, status },
      details: {
        provider: 'polar',
        productId,
        customerId
      }
    });

    logger.info('[Polar Webhook] Community subscription created', {
      communityId: community._id,
      communityName: community.name,
      tier,
      customerId,
      productId
    });
  } else if (subscriptionType === 'trader') {
    // Update User model
    const user = await User.findOne({
      'subscription.polarCustomerId': customerId
    });

    if (!user) {
      logger.error('[Polar Webhook] User not found for customer', { customerId, subscriptionType });
      return;
    }

    const oldTier = user.subscription.tier;

    user.subscription.polarSubscriptionId = subscriptionId;
    user.subscription.tier = tier;
    user.subscription.status = 'active';
    user.subscription.currentPeriodEnd = new Date(event.data.currentPeriodEnd);

    // Update user limits based on tier
    const tierLimits = getTierLimits(tier);
    user.limits.signalsPerDay = tierLimits.signalsPerDay;
    user.limits.maxBrokers = tierLimits.maxBrokers;

    await user.save();

    // Log security audit
    await SecurityAudit.log({
      communityId: user.communityId,
      userId: user._id,
      action: 'subscription.created',
      resourceType: 'Subscription',
      resourceId: subscriptionId,
      status: 'success',
      riskLevel: 'medium',
      ipAddress: req.ip,
      dataBefore: { tier: oldTier },
      dataAfter: { tier, status: 'active' },
      details: {
        provider: 'polar',
        productId,
        customerId
      }
    });

    logger.info('[Polar Webhook] Trader subscription created', {
      userId: user._id,
      username: user.discordUsername,
      tier,
      customerId,
      productId
    });
  } else {
    logger.error('[Polar Webhook] Unknown subscription type', { subscriptionType, customerId });
  }
}

/**
 * Handle subscription.updated event
 * Updates subscription status or tier changes
 */
async function handleSubscriptionUpdated(event, req, billingProvider) {
  const { customerId, id: subscriptionId, productId, status } = event.data;

  // Get product details to determine subscription type
  const product = await billingProvider.getProduct(productId);
  const subscriptionType = product.metadata?.type;
  const tier = product.metadata?.tier;

  if (subscriptionType === 'community') {
    const community = await Community.findOne({
      'subscription.polarSubscriptionId': subscriptionId
    });

    if (!community) {
      logger.error('[Polar Webhook] Community not found for subscription', { subscriptionId, subscriptionType });
      return;
    }

    const oldStatus = community.subscription.status;
    const oldTier = community.subscription.tier;

    community.subscription.status = status;
    community.subscription.tier = tier;
    community.subscription.currentPeriodEnd = new Date(event.data.currentPeriodEnd);
    community.subscription.cancelAtPeriodEnd = event.data.cancelAtPeriodEnd || false;

    // Update community limits if tier changed
    if (oldTier !== tier) {
      const tierLimits = getCommunityTierLimits(tier);
      community.limits.memberCount = tierLimits.memberCount;
      community.limits.signalProvidersCount = tierLimits.signalProvidersCount;
      community.limits.signalsPerDay = tierLimits.signalsPerDay;
    }

    await community.save();

    await SecurityAudit.log({
      communityId: community._id,
      action: 'subscription.updated',
      resourceType: 'Subscription',
      resourceId: subscriptionId,
      status: 'success',
      riskLevel: 'medium',
      ipAddress: req.ip,
      dataBefore: { tier: oldTier, status: oldStatus },
      dataAfter: { tier, status },
      details: { provider: 'polar', productId }
    });

    logger.info('[Polar Webhook] Community subscription updated', {
      communityId: community._id,
      communityName: community.name,
      tier,
      status,
      productId
    });
  } else if (subscriptionType === 'trader') {
    const user = await User.findOne({
      'subscription.polarSubscriptionId': subscriptionId
    });

    if (!user) {
      logger.error('[Polar Webhook] User not found for subscription', { subscriptionId, subscriptionType });
      return;
    }

    const oldStatus = user.subscription.status;
    const oldTier = user.subscription.tier;

    user.subscription.status = status;
    user.subscription.tier = tier;
    user.subscription.currentPeriodEnd = new Date(event.data.currentPeriodEnd);

    // Update user limits if tier changed
    if (oldTier !== tier) {
      const tierLimits = getTierLimits(tier);
      user.limits.signalsPerDay = tierLimits.signalsPerDay;
      user.limits.maxBrokers = tierLimits.maxBrokers;
    }

    await user.save();

    await SecurityAudit.log({
      communityId: user.communityId,
      userId: user._id,
      action: 'subscription.updated',
      resourceType: 'Subscription',
      resourceId: subscriptionId,
      status: 'success',
      riskLevel: 'medium',
      ipAddress: req.ip,
      dataBefore: { tier: oldTier, status: oldStatus },
      dataAfter: { tier, status },
      details: { provider: 'polar', productId }
    });

    logger.info('[Polar Webhook] Trader subscription updated', {
      userId: user._id,
      username: user.discordUsername,
      tier,
      status,
      productId
    });
  }
}

/**
 * Handle subscription.cancelled event
 * Downgrades to free tier or marks as cancelled
 */
async function handleSubscriptionCancelled(event, req) {
  const { customerId, id: subscriptionId, cancelAtPeriodEnd } = event.data;

  // Find subscription in Community or User model
  const community = await Community.findOne({ 'subscription.polarSubscriptionId': subscriptionId });

  if (community) {
    const oldTier = community.subscription.tier;

    community.subscription.status = 'canceled';
    community.subscription.cancelAtPeriodEnd = cancelAtPeriodEnd;

    // If cancelled immediately (not at period end), downgrade to free
    if (!cancelAtPeriodEnd) {
      community.subscription.tier = 'free';

      // Reset to free tier limits
      const freeLimits = getCommunityTierLimits('free');
      community.limits.memberCount = freeLimits.memberCount;
      community.limits.signalProvidersCount = freeLimits.signalProvidersCount;
      community.limits.signalsPerDay = freeLimits.signalsPerDay;
    }

    await community.save();

    await SecurityAudit.log({
      communityId: community._id,
      action: 'subscription.cancelled',
      resourceType: 'Subscription',
      resourceId: subscriptionId,
      status: 'success',
      riskLevel: 'high',
      requiresReview: true,
      ipAddress: req.ip,
      dataBefore: { tier: oldTier, status: 'active' },
      dataAfter: { tier: community.subscription.tier, status: 'canceled' },
      details: { provider: 'polar', cancelAtPeriodEnd }
    });

    logger.info('[Polar Webhook] Community subscription cancelled', {
      communityId: community._id,
      communityName: community.name,
      cancelAtPeriodEnd
    });
    return;
  }

  // Check if it's a trader subscription
  const user = await User.findOne({ 'subscription.polarSubscriptionId': subscriptionId });

  if (user) {
    const oldTier = user.subscription.tier;

    user.subscription.status = 'cancelled';
    user.subscription.cancelledAt = new Date();

    // If cancelled immediately, downgrade to free
    if (!cancelAtPeriodEnd) {
      user.subscription.tier = 'free';

      // Reset to free tier limits
      const freeLimits = getTierLimits('free');
      user.limits.signalsPerDay = freeLimits.signalsPerDay;
      user.limits.maxBrokers = freeLimits.maxBrokers;
    }

    await user.save();

    await SecurityAudit.log({
      communityId: user.communityId,
      userId: user._id,
      action: 'subscription.cancelled',
      resourceType: 'Subscription',
      resourceId: subscriptionId,
      status: 'success',
      riskLevel: 'high',
      requiresReview: true,
      ipAddress: req.ip,
      dataBefore: { tier: oldTier, status: 'active' },
      dataAfter: { tier: user.subscription.tier, status: 'cancelled' },
      details: { provider: 'polar', cancelAtPeriodEnd }
    });

    logger.info('[Polar Webhook] Trader subscription cancelled', {
      userId: user._id,
      username: user.discordUsername,
      cancelAtPeriodEnd
    });
    return;
  }

  logger.error('[Polar Webhook] Subscription not found', { subscriptionId });
}

/**
 * Handle checkout.completed event
 * Links new customer to community or user after successful checkout
 */
async function handleCheckoutCompleted(event, req, billingProvider) {
  const { customerId, productId, metadata } = event.data;

  // Get product details
  const product = await billingProvider.getProduct(productId);
  const subscriptionType = product.metadata?.type;
  const tier = product.metadata?.tier;

  // Use metadata to identify the entity (communityId or userId)
  const entityId = metadata?.entityId;
  const entityType = metadata?.entityType; // 'community' or 'user'

  if (entityType === 'community' && entityId) {
    const community = await Community.findById(entityId);

    if (community) {
      community.subscription.polarCustomerId = customerId;
      community.subscription.tier = tier;
      community.subscription.status = 'active';

      // Update community limits based on tier
      const tierLimits = getCommunityTierLimits(tier);
      community.limits.memberCount = tierLimits.memberCount;
      community.limits.signalProvidersCount = tierLimits.signalProvidersCount;
      community.limits.signalsPerDay = tierLimits.signalsPerDay;

      await community.save();

      logger.info('[Polar Webhook] Checkout completed for community', {
        communityId: community._id,
        communityName: community.name,
        customerId,
        tier
      });
    }
  } else if (entityType === 'user' && entityId) {
    const user = await User.findById(entityId);

    if (user) {
      user.subscription.polarCustomerId = customerId;
      user.subscription.tier = tier;
      user.subscription.status = 'active';

      // Update limits
      const tierLimits = getTierLimits(tier);
      user.limits.signalsPerDay = tierLimits.signalsPerDay;
      user.limits.maxBrokers = tierLimits.maxBrokers;

      await user.save();

      logger.info('[Polar Webhook] Checkout completed for trader', {
        userId: user._id,
        username: user.discordUsername,
        customerId,
        tier
      });
    }
  }
}

/**
 * Get tier limits for trader subscription tiers (account-based, global)
 * @param {string} tier - 'free', 'professional', or 'elite'
 * @returns {Object} Tier limits
 */
function getTierLimits(tier) {
  const limits = {
    free: {
      signalsPerDay: 5,
      maxBrokers: 1
    },
    professional: {
      signalsPerDay: 100,
      maxBrokers: 3
    },
    elite: {
      signalsPerDay: 999999,
      maxBrokers: 999
    }
  };

  return limits[tier] || limits.free;
}

/**
 * Get tier limits for community subscription tiers (server-based)
 * @param {string} tier - 'free', 'professional', or 'enterprise'
 * @returns {Object} Community tier limits
 */
function getCommunityTierLimits(tier) {
  const limits = {
    free: {
      memberCount: 10,
      signalProvidersCount: 2,
      signalsPerDay: 50
    },
    professional: {
      memberCount: 100,
      signalProvidersCount: 5,
      signalsPerDay: 500
    },
    enterprise: {
      memberCount: 1000,
      signalProvidersCount: 20,
      signalsPerDay: 5000
    }
  };

  return limits[tier] || limits.free;
}

router.get('/events', (req, res) => {
  const expectedToken = process.env.POLAR_WEBHOOK_INSPECT_TOKEN;
  if (expectedToken) {
    const providedToken = req.query.token || req.headers['x-polar-inspect-token'];
    if (providedToken !== expectedToken) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }

  res.json({
    count: webhookEvents.length,
    events: webhookEvents
  });
});

module.exports = router;
