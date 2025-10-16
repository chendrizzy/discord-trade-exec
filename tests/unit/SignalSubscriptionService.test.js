/**
 * Unit Tests for SignalSubscriptionService
 * Tests signal provider subscription management and analytics integration
 */

const mongoose = require('mongoose');
const User = require('../../src/models/User');
const SignalProvider = require('../../src/models/SignalProvider');
const signalSubscriptionService = require('../../src/services/SignalSubscriptionService');
const analyticsEventService = require('../../src/services/analytics/AnalyticsEventService');

// Mock dependencies
jest.mock('../../src/models/User');
jest.mock('../../src/models/SignalProvider');
jest.mock('../../src/services/analytics/AnalyticsEventService');

describe('SignalSubscriptionService', () => {
  let mockUserId;
  let mockUser;
  let mockProvider;
  let mockReq;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = new mongoose.Types.ObjectId();

    // Mock user object
    mockUser = {
      _id: mockUserId,
      discordUsername: 'trader#1234',
      tradingConfig: {
        signalProviders: []
      },
      save: jest.fn().mockResolvedValue(true)
    };

    // Mock signal provider object
    mockProvider = {
      _id: new mongoose.Types.ObjectId(),
      providerId: 'provider_123',
      name: 'Elite Trader Signals',
      description: 'High-quality trading signals with 85% win rate',
      source: {
        channelId: 'channel_123',
        channelName: 'elite-signals'
      },
      isActive: true,
      verificationStatus: 'verified',
      subscribers: 100,
      activeSubscribers: 80,
      rating: 4.5,
      performance: {
        winRate: 0.85,
        netProfit: 50000,
        totalSignals: 200,
        executedTrades: 150
      },
      preferences: {
        markets: ['stocks', 'crypto'],
        tradingStyle: 'day-trading'
      },
      save: jest.fn().mockResolvedValue(true)
    };

    // Mock request object
    mockReq = {
      ip: '127.0.0.1',
      headers: {
        'user-agent': 'test-agent'
      }
    };
  });

  describe('subscribeToProvider', () => {
    test('should subscribe user to provider successfully', async () => {
      User.findById = jest.fn().mockResolvedValue(mockUser);
      SignalProvider.findOne = jest.fn().mockResolvedValue(mockProvider);
      analyticsEventService.trackSignalSubscribed.mockResolvedValue({ success: true });

      const result = await signalSubscriptionService.subscribeToProvider(
        mockUserId.toString(),
        'provider_123',
        'standard',
        mockReq
      );

      expect(result.success).toBe(true);
      expect(result.subscription.providerName).toBe('Elite Trader Signals');
      expect(result.subscription.channelId).toBe('channel_123');
      expect(result.subscription.subscriptionType).toBe('standard');
      expect(result.subscription.enabled).toBe(true);
      expect(mockUser.tradingConfig.signalProviders.length).toBe(1);
      expect(mockUser.save).toHaveBeenCalled();
    });

    test('should return error if user not found', async () => {
      User.findById = jest.fn().mockResolvedValue(null);
      SignalProvider.findOne = jest.fn().mockResolvedValue(mockProvider);

      const result = await signalSubscriptionService.subscribeToProvider(
        mockUserId.toString(),
        'provider_123'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });

    test('should return error if provider not found', async () => {
      User.findById = jest.fn().mockResolvedValue(mockUser);
      SignalProvider.findOne = jest.fn().mockResolvedValue(null);

      const result = await signalSubscriptionService.subscribeToProvider(
        mockUserId.toString(),
        'provider_123'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Signal provider not found');
    });

    test('should return error if provider is inactive', async () => {
      mockProvider.isActive = false;
      User.findById = jest.fn().mockResolvedValue(mockUser);
      SignalProvider.findOne = jest.fn().mockResolvedValue(mockProvider);

      const result = await signalSubscriptionService.subscribeToProvider(
        mockUserId.toString(),
        'provider_123'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Signal provider is inactive');
    });

    test('should return error if provider is not verified', async () => {
      mockProvider.verificationStatus = 'pending';
      User.findById = jest.fn().mockResolvedValue(mockUser);
      SignalProvider.findOne = jest.fn().mockResolvedValue(mockProvider);

      const result = await signalSubscriptionService.subscribeToProvider(
        mockUserId.toString(),
        'provider_123'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Signal provider is not verified');
    });

    test('should return error if already subscribed', async () => {
      mockUser.tradingConfig.signalProviders = [
        {
          channelId: 'channel_123',
          channelName: 'elite-signals',
          enabled: true,
          minConfidence: 0.7
        }
      ];
      User.findById = jest.fn().mockResolvedValue(mockUser);
      SignalProvider.findOne = jest.fn().mockResolvedValue(mockProvider);

      const result = await signalSubscriptionService.subscribeToProvider(
        mockUserId.toString(),
        'provider_123'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Already subscribed to this provider');
    });

    test('should update provider subscriber counts', async () => {
      User.findById = jest.fn().mockResolvedValue(mockUser);
      SignalProvider.findOne = jest.fn().mockResolvedValue(mockProvider);
      analyticsEventService.trackSignalSubscribed.mockResolvedValue({ success: true });

      await signalSubscriptionService.subscribeToProvider(
        mockUserId.toString(),
        'provider_123',
        'standard'
      );

      expect(mockProvider.subscribers).toBe(101);
      expect(mockProvider.activeSubscribers).toBe(81);
      expect(mockProvider.save).toHaveBeenCalled();
    });

    test('should track signal_subscribed analytics event', async () => {
      User.findById = jest.fn().mockResolvedValue(mockUser);
      SignalProvider.findOne = jest.fn().mockResolvedValue(mockProvider);
      analyticsEventService.trackSignalSubscribed.mockResolvedValue({ success: true });

      await signalSubscriptionService.subscribeToProvider(
        mockUserId.toString(),
        'provider_123',
        'premium',
        mockReq
      );

      expect(analyticsEventService.trackSignalSubscribed).toHaveBeenCalledWith(
        mockUserId,
        {
          providerId: mockProvider._id,
          providerName: 'Elite Trader Signals',
          subscriptionType: 'premium'
        },
        mockReq
      );
    });

    test('should set default minConfidence to 0.7', async () => {
      User.findById = jest.fn().mockResolvedValue(mockUser);
      SignalProvider.findOne = jest.fn().mockResolvedValue(mockProvider);
      analyticsEventService.trackSignalSubscribed.mockResolvedValue({ success: true });

      await signalSubscriptionService.subscribeToProvider(
        mockUserId.toString(),
        'provider_123'
      );

      expect(mockUser.tradingConfig.signalProviders[0].minConfidence).toBe(0.7);
    });

    test('should handle errors gracefully', async () => {
      User.findById = jest.fn().mockRejectedValue(new Error('Database error'));

      const result = await signalSubscriptionService.subscribeToProvider(
        mockUserId.toString(),
        'provider_123'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });
  });

  describe('unsubscribeFromProvider', () => {
    beforeEach(() => {
      // Add existing subscription
      mockUser.tradingConfig.signalProviders = [
        {
          channelId: 'channel_123',
          channelName: 'elite-signals',
          enabled: true,
          minConfidence: 0.7
        }
      ];
    });

    test('should unsubscribe from provider successfully', async () => {
      User.findById = jest.fn().mockResolvedValue(mockUser);
      SignalProvider.findOne = jest.fn().mockResolvedValue(mockProvider);

      const result = await signalSubscriptionService.unsubscribeFromProvider(
        mockUserId.toString(),
        'provider_123'
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe('Unsubscribed from Elite Trader Signals');
      expect(mockUser.tradingConfig.signalProviders.length).toBe(0);
      expect(mockUser.save).toHaveBeenCalled();
    });

    test('should return error if user not found', async () => {
      User.findById = jest.fn().mockResolvedValue(null);
      SignalProvider.findOne = jest.fn().mockResolvedValue(mockProvider);

      const result = await signalSubscriptionService.unsubscribeFromProvider(
        mockUserId.toString(),
        'provider_123'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });

    test('should return error if provider not found', async () => {
      User.findById = jest.fn().mockResolvedValue(mockUser);
      SignalProvider.findOne = jest.fn().mockResolvedValue(null);

      const result = await signalSubscriptionService.unsubscribeFromProvider(
        mockUserId.toString(),
        'provider_123'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Signal provider not found');
    });

    test('should return error if not subscribed', async () => {
      mockUser.tradingConfig.signalProviders = []; // Empty subscriptions
      User.findById = jest.fn().mockResolvedValue(mockUser);
      SignalProvider.findOne = jest.fn().mockResolvedValue(mockProvider);

      const result = await signalSubscriptionService.unsubscribeFromProvider(
        mockUserId.toString(),
        'provider_123'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Not subscribed to this provider');
    });

    test('should decrement provider subscriber counts', async () => {
      User.findById = jest.fn().mockResolvedValue(mockUser);
      SignalProvider.findOne = jest.fn().mockResolvedValue(mockProvider);

      await signalSubscriptionService.unsubscribeFromProvider(
        mockUserId.toString(),
        'provider_123'
      );

      expect(mockProvider.subscribers).toBe(99);
      expect(mockProvider.activeSubscribers).toBe(79);
      expect(mockProvider.save).toHaveBeenCalled();
    });

    test('should not allow negative subscriber counts', async () => {
      mockProvider.subscribers = 0;
      mockProvider.activeSubscribers = 0;
      User.findById = jest.fn().mockResolvedValue(mockUser);
      SignalProvider.findOne = jest.fn().mockResolvedValue(mockProvider);

      await signalSubscriptionService.unsubscribeFromProvider(
        mockUserId.toString(),
        'provider_123'
      );

      expect(mockProvider.subscribers).toBe(0);
      expect(mockProvider.activeSubscribers).toBe(0);
    });

    test('should handle errors gracefully', async () => {
      User.findById = jest.fn().mockRejectedValue(new Error('Database error'));

      const result = await signalSubscriptionService.unsubscribeFromProvider(
        mockUserId.toString(),
        'provider_123'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });
  });

  describe('updateSubscriptionSettings', () => {
    beforeEach(() => {
      // Add existing subscription
      mockUser.tradingConfig.signalProviders = [
        {
          channelId: 'channel_123',
          channelName: 'elite-signals',
          enabled: true,
          minConfidence: 0.7
        }
      ];
    });

    test('should update enabled status', async () => {
      User.findById = jest.fn().mockResolvedValue(mockUser);

      const result = await signalSubscriptionService.updateSubscriptionSettings(
        mockUserId.toString(),
        'channel_123',
        { enabled: false }
      );

      expect(result.success).toBe(true);
      expect(result.subscription.enabled).toBe(false);
      expect(result.subscription.minConfidence).toBe(0.7);
      expect(mockUser.save).toHaveBeenCalled();
    });

    test('should update minConfidence threshold', async () => {
      User.findById = jest.fn().mockResolvedValue(mockUser);

      const result = await signalSubscriptionService.updateSubscriptionSettings(
        mockUserId.toString(),
        'channel_123',
        { minConfidence: 0.85 }
      );

      expect(result.success).toBe(true);
      expect(result.subscription.minConfidence).toBe(0.85);
      expect(result.subscription.enabled).toBe(true);
    });

    test('should update both enabled and minConfidence', async () => {
      User.findById = jest.fn().mockResolvedValue(mockUser);

      const result = await signalSubscriptionService.updateSubscriptionSettings(
        mockUserId.toString(),
        'channel_123',
        { enabled: false, minConfidence: 0.9 }
      );

      expect(result.success).toBe(true);
      expect(result.subscription.enabled).toBe(false);
      expect(result.subscription.minConfidence).toBe(0.9);
    });

    test('should clamp minConfidence to valid range [0, 1]', async () => {
      User.findById = jest.fn().mockResolvedValue(mockUser);

      // Test upper bound
      let result = await signalSubscriptionService.updateSubscriptionSettings(
        mockUserId.toString(),
        'channel_123',
        { minConfidence: 1.5 }
      );
      expect(result.subscription.minConfidence).toBe(1);

      // Test lower bound
      result = await signalSubscriptionService.updateSubscriptionSettings(
        mockUserId.toString(),
        'channel_123',
        { minConfidence: -0.5 }
      );
      expect(result.subscription.minConfidence).toBe(0);
    });

    test('should return error if user not found', async () => {
      User.findById = jest.fn().mockResolvedValue(null);

      const result = await signalSubscriptionService.updateSubscriptionSettings(
        mockUserId.toString(),
        'channel_123',
        { enabled: false }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });

    test('should return error if subscription not found', async () => {
      User.findById = jest.fn().mockResolvedValue(mockUser);

      const result = await signalSubscriptionService.updateSubscriptionSettings(
        mockUserId.toString(),
        'nonexistent_channel',
        { enabled: false }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Subscription not found');
    });

    test('should handle errors gracefully', async () => {
      User.findById = jest.fn().mockRejectedValue(new Error('Database error'));

      const result = await signalSubscriptionService.updateSubscriptionSettings(
        mockUserId.toString(),
        'channel_123',
        { enabled: false }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });
  });

  describe('getUserSubscriptions', () => {
    test('should return user subscriptions with provider details', async () => {
      mockUser.tradingConfig.signalProviders = [
        {
          channelId: 'channel_123',
          channelName: 'elite-signals',
          enabled: true,
          minConfidence: 0.7
        }
      ];
      User.findById = jest.fn().mockResolvedValue(mockUser);
      SignalProvider.findOne = jest.fn().mockResolvedValue(mockProvider);

      const result = await signalSubscriptionService.getUserSubscriptions(mockUserId.toString());

      expect(result.success).toBe(true);
      expect(result.subscriptions.length).toBe(1);
      expect(result.subscriptions[0].channelId).toBe('channel_123');
      expect(result.subscriptions[0].channelName).toBe('elite-signals');
      expect(result.subscriptions[0].enabled).toBe(true);
      expect(result.subscriptions[0].provider.name).toBe('Elite Trader Signals');
      expect(result.subscriptions[0].provider.winRate).toBe(0.85);
    });

    test('should return empty array if no subscriptions', async () => {
      User.findById = jest.fn().mockResolvedValue(mockUser);

      const result = await signalSubscriptionService.getUserSubscriptions(mockUserId.toString());

      expect(result.success).toBe(true);
      expect(result.subscriptions.length).toBe(0);
    });

    test('should return error if user not found', async () => {
      User.findById = jest.fn().mockResolvedValue(null);

      const result = await signalSubscriptionService.getUserSubscriptions(mockUserId.toString());

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });

    test('should handle missing provider gracefully', async () => {
      mockUser.tradingConfig.signalProviders = [
        {
          channelId: 'channel_123',
          channelName: 'elite-signals',
          enabled: true,
          minConfidence: 0.7
        }
      ];
      User.findById = jest.fn().mockResolvedValue(mockUser);
      SignalProvider.findOne = jest.fn().mockResolvedValue(null); // Provider not found

      const result = await signalSubscriptionService.getUserSubscriptions(mockUserId.toString());

      expect(result.success).toBe(true);
      expect(result.subscriptions[0].provider).toBe(null);
    });

    test('should handle errors gracefully', async () => {
      User.findById = jest.fn().mockRejectedValue(new Error('Database error'));

      const result = await signalSubscriptionService.getUserSubscriptions(mockUserId.toString());

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });
  });

  describe('getAvailableProviders', () => {
    const mockProviders = [
      {
        providerId: 'provider_1',
        name: 'Provider 1',
        description: 'Description 1',
        source: { channelId: 'channel_1' },
        performance: {
          winRate: 0.85,
          netProfit: 50000,
          totalSignals: 200,
          executedTrades: 150
        },
        rating: 4.5,
        subscribers: 100,
        preferences: {
          markets: ['stocks'],
          tradingStyle: 'day-trading'
        }
      },
      {
        providerId: 'provider_2',
        name: 'Provider 2',
        description: 'Description 2',
        source: { channelId: 'channel_2' },
        performance: {
          winRate: 0.75,
          netProfit: 30000,
          totalSignals: 150,
          executedTrades: 100
        },
        rating: 4.0,
        subscribers: 50,
        preferences: {
          markets: ['crypto'],
          tradingStyle: 'swing-trading'
        }
      }
    ];

    test('should return available providers excluding subscribed ones', async () => {
      mockUser.tradingConfig.signalProviders = [
        { channelId: 'channel_existing' } // Already subscribed to different channel
      ];
      User.findById = jest.fn().mockResolvedValue(mockUser);
      SignalProvider.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue(mockProviders)
        })
      });

      const result = await signalSubscriptionService.getAvailableProviders(mockUserId.toString());

      expect(result.success).toBe(true);
      expect(result.providers.length).toBe(2);
      expect(SignalProvider.find).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: true,
          verificationStatus: 'verified',
          'source.channelId': { $nin: ['channel_existing'] }
        })
      );
    });

    test('should filter by minWinRate', async () => {
      User.findById = jest.fn().mockResolvedValue(mockUser);
      SignalProvider.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([mockProviders[0]])
        })
      });

      const result = await signalSubscriptionService.getAvailableProviders(
        mockUserId.toString(),
        { minWinRate: 0.8 }
      );

      expect(result.success).toBe(true);
      expect(SignalProvider.find).toHaveBeenCalledWith(
        expect.objectContaining({
          'performance.winRate': { $gte: 0.8 }
        })
      );
    });

    test('should filter by minRating', async () => {
      User.findById = jest.fn().mockResolvedValue(mockUser);
      SignalProvider.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([mockProviders[0]])
        })
      });

      const result = await signalSubscriptionService.getAvailableProviders(
        mockUserId.toString(),
        { minRating: 4.5 }
      );

      expect(result.success).toBe(true);
      expect(SignalProvider.find).toHaveBeenCalledWith(
        expect.objectContaining({
          rating: { $gte: 4.5 }
        })
      );
    });

    test('should filter by market', async () => {
      User.findById = jest.fn().mockResolvedValue(mockUser);
      SignalProvider.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([mockProviders[0]])
        })
      });

      const result = await signalSubscriptionService.getAvailableProviders(
        mockUserId.toString(),
        { market: 'stocks' }
      );

      expect(result.success).toBe(true);
      expect(SignalProvider.find).toHaveBeenCalledWith(
        expect.objectContaining({
          'preferences.markets': 'stocks'
        })
      );
    });

    test('should apply multiple filters', async () => {
      User.findById = jest.fn().mockResolvedValue(mockUser);
      SignalProvider.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([mockProviders[0]])
        })
      });

      const result = await signalSubscriptionService.getAvailableProviders(
        mockUserId.toString(),
        { minWinRate: 0.8, minRating: 4.5, market: 'stocks' }
      );

      expect(result.success).toBe(true);
      expect(SignalProvider.find).toHaveBeenCalledWith(
        expect.objectContaining({
          'performance.winRate': { $gte: 0.8 },
          rating: { $gte: 4.5 },
          'preferences.markets': 'stocks'
        })
      );
    });

    test('should limit results', async () => {
      User.findById = jest.fn().mockResolvedValue(mockUser);
      const limitMock = jest.fn().mockResolvedValue(mockProviders);
      SignalProvider.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: limitMock
        })
      });

      await signalSubscriptionService.getAvailableProviders(
        mockUserId.toString(),
        { limit: 10 }
      );

      expect(limitMock).toHaveBeenCalledWith(10);
    });

    test('should use default limit of 20', async () => {
      User.findById = jest.fn().mockResolvedValue(mockUser);
      const limitMock = jest.fn().mockResolvedValue(mockProviders);
      SignalProvider.find = jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: limitMock
        })
      });

      await signalSubscriptionService.getAvailableProviders(mockUserId.toString());

      expect(limitMock).toHaveBeenCalledWith(20);
    });

    test('should return error if user not found', async () => {
      User.findById = jest.fn().mockResolvedValue(null);

      const result = await signalSubscriptionService.getAvailableProviders(mockUserId.toString());

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });

    test('should handle errors gracefully', async () => {
      User.findById = jest.fn().mockRejectedValue(new Error('Database error'));

      const result = await signalSubscriptionService.getAvailableProviders(mockUserId.toString());

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });
  });
});
