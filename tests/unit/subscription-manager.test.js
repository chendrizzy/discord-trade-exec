/**
 * Unit Tests for SubscriptionManager
 * Tests subscription lifecycle, tier management, and analytics integration
 */

const mongoose = require('mongoose');
const User = require('../../src/models/User');
const subscriptionManager = require('../../src/services/subscription-manager');
const analyticsEventService = require('../../src/services/analytics/AnalyticsEventService');

// Mock dependencies
jest.mock('../../src/models/User');
jest.mock('../../src/services/analytics/AnalyticsEventService');

describe('SubscriptionManager', () => {
  let mockUserId;
  let mockUser;
  let mockSession;
  let mockInvoice;
  let mockSubscription;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = new mongoose.Types.ObjectId();

    // Mock user object
    mockUser = {
      _id: mockUserId,
      discordUsername: 'testuser#1234',
      subscription: {
        tier: 'free',
        status: 'none',
        stripeCustomerId: 'cus_test123',
        stripeSubscriptionId: 'sub_test123'
      },
      limits: {
        signalsPerDay: 10,
        maxBrokers: 1
      },
      save: jest.fn().mockResolvedValue(true)
    };

    // Mock Stripe session
    mockSession = {
      customer: 'cus_test123',
      subscription: 'sub_test456',
      metadata: { plan: 'pro' },
      customer_email: 'test@example.com'
    };

    // Mock Stripe invoice
    mockInvoice = {
      customer: 'cus_test123',
      subscription: 'sub_test123',
      amount_paid: 9900, // $99 in cents
      period_end: Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000)
    };

    // Mock Stripe subscription
    mockSubscription = {
      customer: 'cus_test123',
      id: 'sub_test123'
    };
  });

  describe('Tier Configuration', () => {
    test('should have correct tier pricing', () => {
      expect(subscriptionManager.tierPricing).toEqual({
        free: 0,
        basic: 49,
        pro: 99,
        premium: 299
      });
    });

    test('should have correct tier limits', () => {
      expect(subscriptionManager.tierLimits.free).toEqual({
        signalsPerDay: 10,
        maxBrokers: 1
      });
      expect(subscriptionManager.tierLimits.basic).toEqual({
        signalsPerDay: 100,
        maxBrokers: 2
      });
      expect(subscriptionManager.tierLimits.pro).toEqual({
        signalsPerDay: Infinity,
        maxBrokers: 5
      });
      expect(subscriptionManager.tierLimits.premium).toEqual({
        signalsPerDay: Infinity,
        maxBrokers: 10
      });
    });
  });

  describe('handleSubscriptionCreated', () => {
    test('should create subscription for new user', async () => {
      User.findOne = jest.fn()
        .mockResolvedValueOnce(mockUser) // First call finds by customer ID
        .mockResolvedValueOnce(null); // Second call for email lookup

      analyticsEventService.trackSubscriptionCreated.mockResolvedValue({ success: true });

      const result = await subscriptionManager.handleSubscriptionCreated(mockSession);

      expect(result.success).toBe(true);
      expect(result.user.tier).toBe('pro');
      expect(result.user.status).toBe('trial');
      expect(mockUser.save).toHaveBeenCalled();
      expect(mockUser.subscription.tier).toBe('pro');
      expect(mockUser.subscription.status).toBe('trial');
      expect(mockUser.subscription.stripeCustomerId).toBe('cus_test123');
      expect(mockUser.subscription.stripeSubscriptionId).toBe('sub_test456');
      expect(mockUser.limits.signalsPerDay).toBe(Infinity);
      expect(mockUser.limits.maxBrokers).toBe(5);
    });

    test('should find user by email if customer ID not found', async () => {
      User.findOne = jest.fn()
        .mockResolvedValueOnce(null) // First call for customer ID
        .mockResolvedValueOnce(mockUser); // Second call for email

      analyticsEventService.trackSubscriptionCreated.mockResolvedValue({ success: true });

      const result = await subscriptionManager.handleSubscriptionCreated(mockSession);

      expect(result.success).toBe(true);
      expect(User.findOne).toHaveBeenCalledTimes(2);
      expect(User.findOne).toHaveBeenCalledWith({ 'subscription.stripeCustomerId': 'cus_test123' });
      expect(User.findOne).toHaveBeenCalledWith({ 'notifications.email': 'test@example.com' });
    });

    test('should return error if user not found', async () => {
      User.findOne = jest.fn().mockResolvedValue(null);

      const result = await subscriptionManager.handleSubscriptionCreated(mockSession);

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });

    test('should set up 7-day trial period', async () => {
      User.findOne = jest.fn().mockResolvedValueOnce(mockUser);
      analyticsEventService.trackSubscriptionCreated.mockResolvedValue({ success: true });

      await subscriptionManager.handleSubscriptionCreated(mockSession);

      expect(mockUser.subscription.status).toBe('trial');
      expect(mockUser.subscription.trialEndsAt).toBeDefined();
    });

    test('should track subscription_created analytics event', async () => {
      User.findOne = jest.fn().mockResolvedValueOnce(mockUser);
      analyticsEventService.trackSubscriptionCreated.mockResolvedValue({ success: true });

      await subscriptionManager.handleSubscriptionCreated(mockSession);

      expect(analyticsEventService.trackSubscriptionCreated).toHaveBeenCalledWith(
        mockUserId,
        {
          tier: 'pro',
          amount: 99,
          billingPeriod: 'monthly',
          trialDays: 7
        },
        null
      );
    });

    test('should handle basic tier subscription', async () => {
      User.findOne = jest.fn().mockResolvedValueOnce(mockUser);
      analyticsEventService.trackSubscriptionCreated.mockResolvedValue({ success: true });
      mockSession.metadata.plan = 'basic';

      await subscriptionManager.handleSubscriptionCreated(mockSession);

      expect(mockUser.subscription.tier).toBe('basic');
      expect(mockUser.limits.signalsPerDay).toBe(100);
      expect(mockUser.limits.maxBrokers).toBe(2);
    });
  });

  describe('handleSubscriptionRenewed', () => {
    test('should renew subscription and track analytics', async () => {
      mockUser.subscription.tier = 'pro';
      mockUser.subscription.renewalCount = 2;
      User.findOne = jest.fn().mockResolvedValue(mockUser);
      analyticsEventService.trackSubscriptionRenewed.mockResolvedValue({ success: true });

      const result = await subscriptionManager.handleSubscriptionRenewed(mockInvoice);

      expect(result.success).toBe(true);
      expect(result.user.renewalCount).toBe(3);
      expect(mockUser.subscription.status).toBe('active');
      expect(mockUser.save).toHaveBeenCalled();
    });

    test('should initialize renewalCount if not present', async () => {
      mockUser.subscription.tier = 'pro';
      delete mockUser.subscription.renewalCount;
      User.findOne = jest.fn().mockResolvedValue(mockUser);
      analyticsEventService.trackSubscriptionRenewed.mockResolvedValue({ success: true });

      const result = await subscriptionManager.handleSubscriptionRenewed(mockInvoice);

      expect(result.success).toBe(true);
      expect(mockUser.subscription.renewalCount).toBe(1);
    });

    test('should track subscription_renewed analytics event', async () => {
      mockUser.subscription.tier = 'pro';
      mockUser.subscription.renewalCount = 1;
      User.findOne = jest.fn().mockResolvedValue(mockUser);
      analyticsEventService.trackSubscriptionRenewed.mockResolvedValue({ success: true });

      await subscriptionManager.handleSubscriptionRenewed(mockInvoice);

      expect(analyticsEventService.trackSubscriptionRenewed).toHaveBeenCalledWith(
        mockUserId,
        {
          tier: 'pro',
          amount: 99, // amount_paid / 100
          renewalCount: 2
        },
        null
      );
    });

    test('should return error if user not found', async () => {
      User.findOne = jest.fn().mockResolvedValue(null);

      const result = await subscriptionManager.handleSubscriptionRenewed(mockInvoice);

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });
  });

  describe('handleSubscriptionCanceled', () => {
    test('should cancel subscription and downgrade to free tier', async () => {
      mockUser.subscription.tier = 'pro';
      mockUser.subscription.status = 'active';
      User.findOne = jest.fn().mockResolvedValue(mockUser);
      analyticsEventService.trackSubscriptionCanceled.mockResolvedValue({ success: true });

      const result = await subscriptionManager.handleSubscriptionCanceled(
        mockSubscription,
        'too_expensive',
        'Found cheaper alternative'
      );

      expect(result.success).toBe(true);
      expect(result.user.previousTier).toBe('pro');
      expect(result.user.newTier).toBe('free');
      expect(mockUser.subscription.status).toBe('cancelled');
      expect(mockUser.subscription.tier).toBe('free');
      expect(mockUser.subscription.cancelledAt).toBeDefined();
      expect(mockUser.limits.signalsPerDay).toBe(10);
      expect(mockUser.limits.maxBrokers).toBe(1);
    });

    test('should track subscription_canceled analytics event with reason and feedback', async () => {
      mockUser.subscription.tier = 'premium';
      User.findOne = jest.fn().mockResolvedValue(mockUser);
      analyticsEventService.trackSubscriptionCanceled.mockResolvedValue({ success: true });

      await subscriptionManager.handleSubscriptionCanceled(
        mockSubscription,
        'switching_service',
        'Moving to competitor'
      );

      expect(analyticsEventService.trackSubscriptionCanceled).toHaveBeenCalledWith(
        mockUserId,
        {
          tier: 'premium',
          reason: 'switching_service',
          feedback: 'Moving to competitor'
        },
        null
      );
    });

    test('should find user by either customer ID or subscription ID', async () => {
      User.findOne = jest.fn().mockResolvedValue(mockUser);

      await subscriptionManager.handleSubscriptionCanceled(mockSubscription);

      expect(User.findOne).toHaveBeenCalledWith({
        $or: [
          { 'subscription.stripeCustomerId': 'cus_test123' },
          { 'subscription.stripeSubscriptionId': 'sub_test123' }
        ]
      });
    });

    test('should return error if user not found', async () => {
      User.findOne = jest.fn().mockResolvedValue(null);

      const result = await subscriptionManager.handleSubscriptionCanceled(mockSubscription);

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });
  });

  describe('handlePaymentFailed', () => {
    test('should set subscription status to past_due', async () => {
      mockUser.subscription.status = 'active';
      User.findOne = jest.fn().mockResolvedValue(mockUser);

      const result = await subscriptionManager.handlePaymentFailed(mockInvoice);

      expect(result.success).toBe(true);
      expect(result.user.status).toBe('past_due');
      expect(mockUser.subscription.status).toBe('past_due');
      expect(mockUser.save).toHaveBeenCalled();
    });

    test('should return error if user not found', async () => {
      User.findOne = jest.fn().mockResolvedValue(null);

      const result = await subscriptionManager.handlePaymentFailed(mockInvoice);

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });
  });

  describe('upgradeSubscription', () => {
    test('should upgrade user from free to paid tier', async () => {
      mockUser.subscription.tier = 'free';
      User.findById = jest.fn().mockResolvedValue(mockUser);
      analyticsEventService.trackSubscriptionCreated.mockResolvedValue({ success: true });

      const result = await subscriptionManager.upgradeSubscription(mockUserId.toString(), 'pro');

      expect(result.success).toBe(true);
      expect(result.user.previousTier).toBe('free');
      expect(result.user.newTier).toBe('pro');
      expect(mockUser.subscription.tier).toBe('pro');
      expect(mockUser.subscription.status).toBe('active');
      expect(mockUser.limits.signalsPerDay).toBe(Infinity);
      expect(mockUser.limits.maxBrokers).toBe(5);
    });

    test('should track subscription_created when upgrading from free', async () => {
      mockUser.subscription.tier = 'free';
      User.findById = jest.fn().mockResolvedValue(mockUser);
      analyticsEventService.trackSubscriptionCreated.mockResolvedValue({ success: true });

      await subscriptionManager.upgradeSubscription(mockUserId.toString(), 'premium');

      expect(analyticsEventService.trackSubscriptionCreated).toHaveBeenCalledWith(
        mockUserId,
        {
          tier: 'premium',
          amount: 299,
          billingPeriod: 'monthly',
          trialDays: 0
        },
        null
      );
    });

    test('should not track event when upgrading between paid tiers', async () => {
      mockUser.subscription.tier = 'basic';
      User.findById = jest.fn().mockResolvedValue(mockUser);

      await subscriptionManager.upgradeSubscription(mockUserId.toString(), 'pro');

      expect(analyticsEventService.trackSubscriptionCreated).not.toHaveBeenCalled();
    });

    test('should return error if user not found', async () => {
      User.findById = jest.fn().mockResolvedValue(null);

      const result = await subscriptionManager.upgradeSubscription(mockUserId.toString(), 'pro');

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });
  });

  describe('getSubscriptionStatus', () => {
    test('should return subscription status and limits', async () => {
      mockUser.subscription.tier = 'pro';
      mockUser.subscription.status = 'active';
      mockUser.subscription.currentPeriodEnd = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
      mockUser.limits.signalsPerDay = Infinity;
      mockUser.limits.signalsUsedToday = 25;
      mockUser.limits.maxBrokers = 5;
      mockUser.isSubscriptionActive = jest.fn().mockReturnValue(true);

      User.findById = jest.fn().mockResolvedValue(mockUser);

      const result = await subscriptionManager.getSubscriptionStatus(mockUserId.toString());

      expect(result.success).toBe(true);
      expect(result.subscription.tier).toBe('pro');
      expect(result.subscription.status).toBe('active');
      expect(result.subscription.isActive).toBe(true);
      expect(result.subscription.daysRemaining).toBeGreaterThan(14);
      expect(result.subscription.limits.signalsPerDay).toBe(Infinity);
      expect(result.subscription.limits.signalsUsedToday).toBe(25);
      expect(result.subscription.limits.maxBrokers).toBe(5);
    });

    test('should return error if user not found', async () => {
      User.findById = jest.fn().mockResolvedValue(null);

      const result = await subscriptionManager.getSubscriptionStatus(mockUserId.toString());

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });
  });

  describe('Error Handling', () => {
    test('should handle errors gracefully in handleSubscriptionCreated', async () => {
      User.findOne = jest.fn().mockRejectedValue(new Error('Database error'));

      const result = await subscriptionManager.handleSubscriptionCreated(mockSession);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });

    test('should handle errors gracefully in handleSubscriptionRenewed', async () => {
      User.findOne = jest.fn().mockRejectedValue(new Error('Network error'));

      const result = await subscriptionManager.handleSubscriptionRenewed(mockInvoice);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    test('should handle errors gracefully in handleSubscriptionCanceled', async () => {
      User.findOne = jest.fn().mockRejectedValue(new Error('Connection timeout'));

      const result = await subscriptionManager.handleSubscriptionCanceled(mockSubscription);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection timeout');
    });
  });
});
