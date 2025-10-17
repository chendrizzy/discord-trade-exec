// External dependencies
const User = require('../models/User');
const analyticsEventService = require('./analytics/AnalyticsEventService');

/**
 * SubscriptionManager Service
 * Handles subscription lifecycle events, billing updates, and integrates with analytics tracking
 */
class SubscriptionManager {
  constructor() {
    // Tier pricing configuration (must match RevenueMetrics service)
    this.tierPricing = {
      free: 0,
      basic: 49,
      pro: 99,
      premium: 299
    };

    // Tier limits configuration
    this.tierLimits = {
      free: {
        signalsPerDay: 10,
        maxBrokers: 1
      },
      basic: {
        signalsPerDay: 100,
        maxBrokers: 2
      },
      pro: {
        signalsPerDay: Infinity,
        maxBrokers: 5
      },
      premium: {
        signalsPerDay: Infinity,
        maxBrokers: 10
      }
    };
  }

  /**
   * Handle successful subscription creation (from Stripe checkout.session.completed)
   * @param {Object} session - Stripe checkout session object
   * @param {Object} req - Express request object (optional, for metadata)
   */
  async handleSubscriptionCreated(session, req = null) {
    try {
      const { customer, subscription: stripeSubscriptionId, metadata, customer_email } = session;
      const tier = metadata?.plan || 'basic';
      const amount = this.tierPricing[tier] || 0;

      // Find user by Stripe customer ID or email
      let user = await User.findOne({ 'subscription.stripeCustomerId': customer });

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
      const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      user.subscription = {
        tier,
        status: 'trial', // Stripe gives 7-day trial
        stripeCustomerId: customer,
        stripeSubscriptionId,
        currentPeriodStart: new Date(),
        currentPeriodEnd,
        trialEndsAt
      };

      // Update usage limits based on tier
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
          trialDays: 7
        },
        req
      );

      console.log(`[SubscriptionManager] Subscription created: ${user.discordUsername} -> ${tier} ($${amount}/mo)`);

      return {
        success: true,
        user: {
          id: user._id,
          tier,
          status: 'trial'
        }
      };
    } catch (error) {
      console.error('[SubscriptionManager] Error creating subscription:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle subscription renewal (from Stripe invoice.payment_succeeded)
   * @param {Object} invoice - Stripe invoice object
   * @param {Object} req - Express request object (optional, for metadata)
   */
  async handleSubscriptionRenewed(invoice, req = null) {
    try {
      const { customer, subscription: stripeSubscriptionId, amount_paid, period_end } = invoice;

      // Find user by Stripe customer ID
      const user = await User.findOne({ 'subscription.stripeCustomerId': customer });

      if (!user) {
        console.error('[SubscriptionManager] User not found for renewal:', customer);
        return { success: false, error: 'User not found' };
      }

      // Update subscription status to active (trial ended, payment succeeded)
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
          amount: amount_paid / 100, // Stripe uses cents
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
   * Handle subscription cancellation (from Stripe customer.subscription.deleted or manual cancellation)
   * @param {Object} subscription - Stripe subscription object or user object
   * @param {String} reason - Cancellation reason
   * @param {String} feedback - User feedback (optional)
   * @param {Object} req - Express request object (optional, for metadata)
   */
  async handleSubscriptionCanceled(subscription, reason = 'user_requested', feedback = null, req = null) {
    try {
      const { customer, id: stripeSubscriptionId } = subscription;

      // Find user by Stripe customer ID or subscription ID
      const user = await User.findOne({
        $or: [
          { 'subscription.stripeCustomerId': customer },
          { 'subscription.stripeSubscriptionId': stripeSubscriptionId }
        ]
      });

      if (!user) {
        console.error('[SubscriptionManager] User not found for cancellation:', { customer, stripeSubscriptionId });
        return { success: false, error: 'User not found' };
      }

      const previousTier = user.subscription.tier;

      // Update subscription status
      user.subscription.status = 'cancelled';
      user.subscription.cancelledAt = new Date();

      // Downgrade to free tier
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
   * Handle payment failure (from Stripe invoice.payment_failed)
   * @param {Object} invoice - Stripe invoice object
   */
  async handlePaymentFailed(invoice) {
    try {
      const { customer } = invoice;

      const user = await User.findOne({ 'subscription.stripeCustomerId': customer });

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
   * @param {String} tier - New tier (basic, pro, premium)
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

      // Update limits
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
