// External dependencies
const User = require('../models/User');
const SignalProvider = require('../models/SignalProvider');
const analyticsEventService = require('./analytics/AnalyticsEventService');

/**
 * SignalSubscriptionService
 * Manages user subscriptions to signal providers and tracks subscription analytics
 */
class SignalSubscriptionService {
  /**
   * Subscribe user to a signal provider
   * @param {String} userId - User ID
   * @param {String} providerId - Signal provider ID
   * @param {String} subscriptionType - Subscription type ('free', 'standard', 'premium')
   * @param {Object} req - Express request object (optional, for metadata)
   */
  async subscribeToProvider(userId, providerId, subscriptionType = 'standard', req = null) {
    try {
      // Find user and provider
      const user = await User.findById(userId);
      const provider = await SignalProvider.findOne({ providerId });

      if (!user) {
        return { success: false, error: 'User not found' };
      }

      if (!provider) {
        return { success: false, error: 'Signal provider not found' };
      }

      // Check if provider is active and verified
      if (!provider.isActive) {
        return { success: false, error: 'Signal provider is inactive' };
      }

      if (provider.verificationStatus !== 'verified') {
        return { success: false, error: 'Signal provider is not verified' };
      }

      // Check if already subscribed
      const existingSubscription = user.tradingConfig.signalProviders.find(
        sp => sp.channelId === provider.source.channelId
      );

      if (existingSubscription) {
        return { success: false, error: 'Already subscribed to this provider' };
      }

      // Add subscription to user
      user.tradingConfig.signalProviders.push({
        channelId: provider.source.channelId,
        channelName: provider.name,
        enabled: true,
        minConfidence: 0.7 // Default confidence threshold
      });

      await user.save();

      // Update provider subscriber count
      provider.subscribers += 1;
      provider.activeSubscribers += 1;
      await provider.save();

      // Track signal_subscribed event
      await analyticsEventService.trackSignalSubscribed(
        user._id,
        {
          providerId: provider._id,
          providerName: provider.name,
          subscriptionType
        },
        req
      );

      console.log(`[SignalSubscriptionService] User subscribed: ${user.discordUsername} -> ${provider.name} (${subscriptionType})`);

      return {
        success: true,
        subscription: {
          providerId: provider._id,
          providerName: provider.name,
          channelId: provider.source.channelId,
          subscriptionType,
          enabled: true
        }
      };
    } catch (error) {
      console.error('[SignalSubscriptionService] Error subscribing to provider:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Unsubscribe user from a signal provider
   * @param {String} userId - User ID
   * @param {String} providerId - Signal provider ID
   */
  async unsubscribeFromProvider(userId, providerId) {
    try {
      const user = await User.findById(userId);
      const provider = await SignalProvider.findOne({ providerId });

      if (!user) {
        return { success: false, error: 'User not found' };
      }

      if (!provider) {
        return { success: false, error: 'Signal provider not found' };
      }

      // Find and remove subscription
      const subscriptionIndex = user.tradingConfig.signalProviders.findIndex(
        sp => sp.channelId === provider.source.channelId
      );

      if (subscriptionIndex === -1) {
        return { success: false, error: 'Not subscribed to this provider' };
      }

      user.tradingConfig.signalProviders.splice(subscriptionIndex, 1);
      await user.save();

      // Update provider subscriber count
      provider.subscribers = Math.max(0, provider.subscribers - 1);
      provider.activeSubscribers = Math.max(0, provider.activeSubscribers - 1);
      await provider.save();

      console.log(`[SignalSubscriptionService] User unsubscribed: ${user.discordUsername} -> ${provider.name}`);

      return {
        success: true,
        message: `Unsubscribed from ${provider.name}`
      };
    } catch (error) {
      console.error('[SignalSubscriptionService] Error unsubscribing from provider:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update subscription settings (confidence threshold, enabled status)
   * @param {String} userId - User ID
   * @param {String} channelId - Channel ID
   * @param {Object} settings - Settings to update
   */
  async updateSubscriptionSettings(userId, channelId, settings) {
    try {
      const user = await User.findById(userId);

      if (!user) {
        return { success: false, error: 'User not found' };
      }

      const subscription = user.tradingConfig.signalProviders.find(sp => sp.channelId === channelId);

      if (!subscription) {
        return { success: false, error: 'Subscription not found' };
      }

      // Update settings
      if (settings.enabled !== undefined) {
        subscription.enabled = settings.enabled;
      }
      if (settings.minConfidence !== undefined) {
        subscription.minConfidence = Math.max(0, Math.min(1, settings.minConfidence));
      }

      await user.save();

      console.log(`[SignalSubscriptionService] Subscription settings updated: ${user.discordUsername} -> ${subscription.channelName}`);

      return {
        success: true,
        subscription: {
          channelId: subscription.channelId,
          channelName: subscription.channelName,
          enabled: subscription.enabled,
          minConfidence: subscription.minConfidence
        }
      };
    } catch (error) {
      console.error('[SignalSubscriptionService] Error updating subscription settings:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get user's active subscriptions
   * @param {String} userId - User ID
   */
  async getUserSubscriptions(userId) {
    try {
      const user = await User.findById(userId);

      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // Get provider details for each subscription
      const subscriptionsWithDetails = await Promise.all(
        user.tradingConfig.signalProviders.map(async subscription => {
          const provider = await SignalProvider.findOne({
            'source.channelId': subscription.channelId
          });

          return {
            channelId: subscription.channelId,
            channelName: subscription.channelName,
            enabled: subscription.enabled,
            minConfidence: subscription.minConfidence,
            provider: provider
              ? {
                  providerId: provider.providerId,
                  name: provider.name,
                  winRate: provider.performance.winRate,
                  netProfit: provider.performance.netProfit,
                  totalSignals: provider.performance.totalSignals,
                  rating: provider.rating,
                  verificationStatus: provider.verificationStatus
                }
              : null
          };
        })
      );

      return {
        success: true,
        subscriptions: subscriptionsWithDetails
      };
    } catch (error) {
      console.error('[SignalSubscriptionService] Error getting user subscriptions:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get available signal providers (not yet subscribed)
   * @param {String} userId - User ID
   * @param {Object} filters - Filters (minWinRate, minRating, market, etc.)
   */
  async getAvailableProviders(userId, filters = {}) {
    try {
      const user = await User.findById(userId);

      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // Get user's current subscriptions
      const subscribedChannelIds = user.tradingConfig.signalProviders.map(sp => sp.channelId);

      // Build query
      const query = {
        isActive: true,
        verificationStatus: 'verified',
        'source.channelId': { $nin: subscribedChannelIds } // Exclude already subscribed
      };

      if (filters.minWinRate) {
        query['performance.winRate'] = { $gte: filters.minWinRate };
      }
      if (filters.minRating) {
        query.rating = { $gte: filters.minRating };
      }
      if (filters.market) {
        query['preferences.markets'] = filters.market;
      }

      // Get available providers
      const providers = await SignalProvider.find(query)
        .sort({ 'performance.winRate': -1, 'performance.netProfit': -1 })
        .limit(filters.limit || 20);

      return {
        success: true,
        providers: providers.map(p => ({
          providerId: p.providerId,
          name: p.name,
          description: p.description,
          channelId: p.source.channelId,
          performance: {
            winRate: p.performance.winRate,
            netProfit: p.performance.netProfit,
            totalSignals: p.performance.totalSignals,
            executedTrades: p.performance.executedTrades
          },
          rating: p.rating,
          subscribers: p.subscribers,
          markets: p.preferences.markets,
          tradingStyle: p.preferences.tradingStyle
        }))
      };
    } catch (error) {
      console.error('[SignalSubscriptionService] Error getting available providers:', error);
      return { success: false, error: error.message };
    }
  }
}

// Export singleton instance
module.exports = new SignalSubscriptionService();
