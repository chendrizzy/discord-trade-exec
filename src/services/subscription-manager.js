// External dependencies
const User = require('../models/User');
const analyticsEventService = require('./analytics/AnalyticsEventService');

/**
 * SubscriptionManager Service
 * Handles trader subscription lifecycle events, billing updates, and integrates with analytics tracking
 *
 * NOTE: Subscription lifecycle is primarily managed by Polar.sh webhooks (src/routes/webhook/polar.js)
 * This service provides:
 * - Tier configuration and limits
 * - Manual admin operations
 * - Status queries
 * - Legacy methods for backward compatibility
 */
class SubscriptionManager {
  constructor() {
    // Trader tier pricing configuration (validated from pricing research)
    this.tierPricing = {
      free: 0,
      professional: 49,  // Monthly price
      elite: 149         // Monthly price
    };

    // Trader tier limits configuration (account-based, global across all communities)
    this.tierLimits = {
      free: {
        signalsPerDay: 5,
        maxBrokers: 1
      },
      professional: {
        signalsPerDay: 100,
        maxBrokers: 3
      },
      elite: {
        signalsPerDay: 999999,  // Unlimited (practical limit)
        maxBrokers: 999         // Unlimited (practical limit)
      }
    };
  }

  /**
   * Handle successful subscription creation
   * @deprecated Prefer using Polar.sh webhook handler (src/routes/webhook/polar.js)
   * @param {Object} session - Subscription session object
   * @param {Object} req - Express request object (optional, for metadata)
   */
  async handleSubscriptionCreated(session, req = null) {
    try {
      const { customer, subscription: subscriptionId, metadata, customer_email } = session;
      const tier = metadata?.plan || metadata?.tier || 'professional';
      const amount = this.tierPricing[tier] || 0;

      // Find user by Polar customer ID or email
      let user = await User.findOne({ 'subscription.polarCustomerId': customer });

      if (!user && customer_email) {
        user = await User.findOne({ 'notifications.email': customer_email });
      }

      if (!user) {
        console.error('[SubscriptionManager] User not found for subscription creation:', {
          customer,
          email: customer_email
        });
        return { success: false, error: 'User not found' };
      }

      // Update user subscription
      const currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      user.subscription = {
        tier,
        status: 'active',
        polarCustomerId: customer,
        polarSubscriptionId: subscriptionId,
        currentPeriodStart: new Date(),
        currentPeriodEnd
      };

      // Update usage limits based on tier (account-based, global)
      const limits = this.tierLimits[tier] || this.tierLimits.free;
      user.limits.signalsPerDay = limits.signalsPerDay;
      user.limits.maxBrokers = limits.maxBrokers;

      await user.save();

      // Track subscription_created event
      await analyticsEventService.trackSubscriptionCreated(
        user._id,
        {
          tier,
          amount,
          billingPeriod: 'monthly',
          trialDays: 0
        },
        req
      );

      console.log(`[SubscriptionManager] Subscription created: ${user.discordUsername} -> ${tier} ($${amount}/mo)`);

      return {
        success: true,
        user: {
          id: user._id,
          tier,
          status: 'active'
        }
      };
    } catch (error) {
      console.error('[SubscriptionManager] Error creating subscription:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle subscription renewal
   * @deprecated Prefer using Polar.sh webhook handler (src/routes/webhook/polar.js)
   * @param {Object} invoice - Subscription invoice object
   * @param {Object} req - Express request object (optional, for metadata)
   */
  async handleSubscriptionRenewed(invoice, req = null) {
    try {
      const { customer, subscription: subscriptionId, amount_paid, period_end } = invoice;

      // Find user by Polar customer ID
      const user = await User.findOne({ 'subscription.polarCustomerId': customer });

      if (!user) {
        console.error('[SubscriptionManager] User not found for renewal:', customer);
        return { success: false, error: 'User not found' };
      }

      // Update subscription status to active
      user.subscription.status = 'active';
      user.subscription.currentPeriodStart = new Date();
      user.subscription.currentPeriodEnd = new Date(period_end * 1000);

      // Increment renewal count for analytics
      if (!user.subscription.renewalCount) {
        user.subscription.renewalCount = 1;
      } else {
        user.subscription.renewalCount += 1;
      }

      await user.save();

      // Track subscription_renewed event
      await analyticsEventService.trackSubscriptionRenewed(
        user._id,
        {
          tier: user.subscription.tier,
          amount: amount_paid / 100, // Convert to dollars
          renewalCount: user.subscription.renewalCount
        },
        req
      );

      console.log(
        `[SubscriptionManager] Subscription renewed: ${user.discordUsername} -> ${user.subscription.tier} (renewal #${user.subscription.renewalCount})`
      );

      return {
        success: true,
        user: {
          id: user._id,
          tier: user.subscription.tier,
          renewalCount: user.subscription.renewalCount
        }
      };
    } catch (error) {
      console.error('[SubscriptionManager] Error renewing subscription:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle subscription cancellation
   * @deprecated Prefer using Polar.sh webhook handler (src/routes/webhook/polar.js)
   * @param {Object} subscription - Subscription object or user object
   * @param {String} reason - Cancellation reason
   * @param {String} feedback - User feedback (optional)
   * @param {Object} req - Express request object (optional, for metadata)
   */
  async handleSubscriptionCanceled(subscription, reason = 'user_requested', feedback = null, req = null) {
    try {
      const { customer, id: subscriptionId } = subscription;

      // Find user by Polar customer ID or subscription ID
      const user = await User.findOne({
        $or: [
          { 'subscription.polarCustomerId': customer },
          { 'subscription.polarSubscriptionId': subscriptionId }
        ]
      });

      if (!user) {
        console.error('[SubscriptionManager] User not found for cancellation:', { customer, subscriptionId });
        return { success: false, error: 'User not found' };
      }

      const previousTier = user.subscription.tier;

      // Update subscription status
      user.subscription.status = 'cancelled';
      user.subscription.cancelledAt = new Date();

      // Downgrade to free tier (account-based limits reset)
      user.subscription.tier = 'free';

      // Reset limits to free tier
      user.limits.signalsPerDay = this.tierLimits.free.signalsPerDay;
      user.limits.maxBrokers = this.tierLimits.free.maxBrokers;

      await user.save();

      // Track subscription_canceled event
      await analyticsEventService.trackSubscriptionCanceled(
        user._id,
        {
          tier: previousTier,
          reason,
          feedback
        },
        req
      );

      console.log(
        `[SubscriptionManager] Subscription cancelled: ${user.discordUsername} -> ${previousTier} -> free (reason: ${reason})`
      );

      return {
        success: true,
        user: {
          id: user._id,
          previousTier,
          newTier: 'free',
          reason
        }
      };
    } catch (error) {
      console.error('[SubscriptionManager] Error canceling subscription:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle payment failure
   * @deprecated Prefer using Polar.sh webhook handler (src/routes/webhook/polar.js)
   * @param {Object} invoice - Subscription invoice object
   */
  async handlePaymentFailed(invoice) {
    try {
      const { customer } = invoice;

      const user = await User.findOne({ 'subscription.polarCustomerId': customer });

      if (!user) {
        console.error('[SubscriptionManager] User not found for payment failure:', customer);
        return { success: false, error: 'User not found' };
      }

      // Update subscription status to past_due
      user.subscription.status = 'past_due';
      await user.save();

      console.log(`[SubscriptionManager] Payment failed: ${user.discordUsername} -> status: past_due`);

      // TODO: Send payment failure notification email
      // TODO: Implement retry logic or grace period

      return {
        success: true,
        user: {
          id: user._id,
          status: 'past_due'
        }
      };
    } catch (error) {
      console.error('[SubscriptionManager] Error handling payment failure:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Manually upgrade user subscription (admin operation)
   * @param {String} userId - User ID
   * @param {String} tier - New tier (free, professional, elite)
   * @param {Object} req - Express request object (optional, for metadata)
   */
  async upgradeSubscription(userId, tier, req = null) {
    try {
      const user = await User.findById(userId);

      if (!user) {
        return { success: false, error: 'User not found' };
      }

      const previousTier = user.subscription.tier;
      const amount = this.tierPricing[tier] || 0;

      // Update subscription
      user.subscription.tier = tier;
      user.subscription.status = 'active';
      user.subscription.currentPeriodStart = new Date();
      user.subscription.currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      // Update limits (account-based, global)
      const limits = this.tierLimits[tier] || this.tierLimits.free;
      user.limits.signalsPerDay = limits.signalsPerDay;
      user.limits.maxBrokers = limits.maxBrokers;

      await user.save();

      // Track as subscription created if upgrading from free, otherwise renewal
      if (previousTier === 'free') {
        await analyticsEventService.trackSubscriptionCreated(
          user._id,
          {
            tier,
            amount,
            billingPeriod: 'monthly',
            trialDays: 0
          },
          req
        );
      }

      console.log(`[SubscriptionManager] Manual upgrade: ${user.discordUsername} -> ${previousTier} -> ${tier}`);

      return {
        success: true,
        user: {
          id: user._id,
          previousTier,
          newTier: tier
        }
      };
    } catch (error) {
      console.error('[SubscriptionManager] Error upgrading subscription:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get subscription status for user
   * @param {String} userId - User ID
   */
  async getSubscriptionStatus(userId) {
    try {
      const user = await User.findById(userId);

      if (!user) {
        return { success: false, error: 'User not found' };
      }

      const isActive = user.isSubscriptionActive();
      const daysRemaining = user.subscription.currentPeriodEnd
        ? Math.ceil((user.subscription.currentPeriodEnd - new Date()) / (24 * 60 * 60 * 1000))
        : 0;

      return {
        success: true,
        subscription: {
          tier: user.subscription.tier,
          status: user.subscription.status,
          isActive,
          currentPeriodStart: user.subscription.currentPeriodStart,
          currentPeriodEnd: user.subscription.currentPeriodEnd,
          daysRemaining,
          trialEndsAt: user.subscription.trialEndsAt,
          limits: {
            signalsPerDay: user.limits.signalsPerDay,
            signalsUsedToday: user.limits.signalsUsedToday,
            maxBrokers: user.limits.maxBrokers
          }
        }
      };
    } catch (error) {
      console.error('[SubscriptionManager] Error getting subscription status:', error);
      return { success: false, error: error.message };
    }
  }
}

// Export singleton instance
module.exports = new SubscriptionManager();
