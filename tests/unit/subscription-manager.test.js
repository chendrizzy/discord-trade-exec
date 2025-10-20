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
        polarCustomerId: '550e8400-test-41d4-a716-446655440001',
        polarSubscriptionId: '550e8400-test-41d4-a716-446655440002'
      },
      limits: {
        signalsPerDay: 5,
        maxBrokers: 1
      },
      save: jest.fn().mockResolvedValue(true)
    };

    // Mock Polar.sh session
    mockSession = {
      customer: '550e8400-test-41d4-a716-446655440001',
      subscription: '550e8400-test-41d4-a716-446655440003',
      metadata: { tier: 'professional' },
      customer_email: 'test@example.com'
    };

    // Mock Polar.sh invoice
    mockInvoice = {
      customer: '550e8400-test-41d4-a716-446655440001',
      subscription: '550e8400-test-41d4-a716-446655440002',
      amount_paid: 4900, // $49 in cents
      period_end: Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000)
    };

    // Mock Polar.sh subscription
    mockSubscription = {
      customer: '550e8400-test-41d4-a716-446655440001',
      id: '550e8400-test-41d4-a716-446655440002'
    };
  });

  describe('Tier Configuration', () => {
    test('should have correct tier pricing', () => {
      expect(subscriptionManager.tierPricing).toEqual({
        free: 0,
        professional: 49,
        elite: 149
      });
    });

    test('should have correct tier limits', () => {
      expect(subscriptionManager.tierLimits.free).toEqual({
        signalsPerDay: 5,
        maxBrokers: 1
      });
      expect(subscriptionManager.tierLimits.professional).toEqual({
        signalsPerDay: 100,
        maxBrokers: 3
      });
      expect(subscriptionManager.tierLimits.elite).toEqual({
        signalsPerDay: 999999,
        maxBrokers: 999
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
      expect(result.user.tier).toBe('professional');
      expect(result.user.status).toBe('active');
      expect(mockUser.save).toHaveBeenCalled();
      expect(mockUser.subscription.tier).toBe('professional');
      expect(mockUser.subscription.status).toBe('active');
      expect(mockUser.subscription.polarCustomerId).toBe('550e8400-test-41d4-a716-446655440001');
      expect(mockUser.subscription.polarSubscriptionId).toBe('550e8400-test-41d4-a716-446655440003');
      expect(mockUser.limits.signalsPerDay).toBe(100);
      expect(mockUser.limits.maxBrokers).toBe(3);
    });

    test('should find user by email if customer ID not found', async () => {
      User.findOne = jest.fn()
        .mockResolvedValueOnce(null) // First call for customer ID
        .mockResolvedValueOnce(mockUser); // Second call for email

      analyticsEventService.trackSubscriptionCreated.mockResolvedValue({ success: true });

      const result = await subscriptionManager.handleSubscriptionCreated(mockSession);

      expect(result.success).toBe(true);
      expect(User.findOne).toHaveBeenCalledTimes(2);
      expect(User.findOne).toHaveBeenCalledWith({ 'subscription.polarCustomerId': '550e8400-test-41d4-a716-446655440001' });
      expect(User.findOne).toHaveBeenCalledWith({ 'notifications.email': 'test@example.com' });
    });

    test('should return error if user not found', async () => {
      User.findOne = jest.fn().mockResolvedValue(null);

      const result = await subscriptionManager.handleSubscriptionCreated(mockSession);

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });

    test('should track subscription_created analytics event', async () => {
      User.findOne = jest.fn().mockResolvedValueOnce(mockUser);
      analyticsEventService.trackSubscriptionCreated.mockResolvedValue({ success: true });

      await subscriptionManager.handleSubscriptionCreated(mockSession);

      expect(analyticsEventService.trackSubscriptionCreated).toHaveBeenCalledWith(
        mockUserId,
        {
          tier: 'professional',
          amount: 49,
          billingPeriod: 'monthly',
          trialDays: 0
        },
        null
      );
    });

    test('should handle elite tier subscription', async () => {
      User.findOne = jest.fn().mockResolvedValueOnce(mockUser);
      analyticsEventService.trackSubscriptionCreated.mockResolvedValue({ success: true });
      mockSession.metadata.tier = 'elite';

      await subscriptionManager.handleSubscriptionCreated(mockSession);

      expect(mockUser.subscription.tier).toBe('elite');
      expect(mockUser.limits.signalsPerDay).toBe(999999);
      expect(mockUser.limits.maxBrokers).toBe(999);
    });
  });

  describe('handleSubscriptionRenewed', () => {
    test('should renew subscription and track analytics', async () => {
      mockUser.subscription.tier = 'professional';
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
      mockUser.subscription.tier = 'professional';
      delete mockUser.subscription.renewalCount;
      User.findOne = jest.fn().mockResolvedValue(mockUser);
      analyticsEventService.trackSubscriptionRenewed.mockResolvedValue({ success: true });

      const result = await subscriptionManager.handleSubscriptionRenewed(mockInvoice);

      expect(result.success).toBe(true);
      expect(mockUser.subscription.renewalCount).toBe(1);
    });

    test('should track subscription_renewed analytics event', async () => {
      mockUser.subscription.tier = 'professional';
      mockUser.subscription.renewalCount = 1;
      User.findOne = jest.fn().mockResolvedValue(mockUser);
      analyticsEventService.trackSubscriptionRenewed.mockResolvedValue({ success: true });

      await subscriptionManager.handleSubscriptionRenewed(mockInvoice);

      expect(analyticsEventService.trackSubscriptionRenewed).toHaveBeenCalledWith(
        mockUserId,
        {
          tier: 'professional',
          amount: 49, // amount_paid / 100
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
      mockUser.subscription.tier = 'professional';
      mockUser.subscription.status = 'active';
      User.findOne = jest.fn().mockResolvedValue(mockUser);
      analyticsEventService.trackSubscriptionCanceled.mockResolvedValue({ success: true });

      const result = await subscriptionManager.handleSubscriptionCanceled(
        mockSubscription,
        'too_expensive',
        'Found cheaper alternative'
      );

      expect(result.success).toBe(true);
      expect(result.user.previousTier).toBe('professional');
      expect(result.user.newTier).toBe('free');
      expect(mockUser.subscription.status).toBe('cancelled');
      expect(mockUser.subscription.tier).toBe('free');
      expect(mockUser.subscription.cancelledAt).toBeDefined();
      expect(mockUser.limits.signalsPerDay).toBe(5);
      expect(mockUser.limits.maxBrokers).toBe(1);
    });

    test('should track subscription_canceled analytics event with reason and feedback', async () => {
      mockUser.subscription.tier = 'elite';
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
          tier: 'elite',
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
          { 'subscription.polarCustomerId': '550e8400-test-41d4-a716-446655440001' },
          { 'subscription.polarSubscriptionId': '550e8400-test-41d4-a716-446655440002' }
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

      const result = await subscriptionManager.upgradeSubscription(mockUserId.toString(), 'professional');

      expect(result.success).toBe(true);
      expect(result.user.previousTier).toBe('free');
      expect(result.user.newTier).toBe('professional');
      expect(mockUser.subscription.tier).toBe('professional');
      expect(mockUser.subscription.status).toBe('active');
      expect(mockUser.limits.signalsPerDay).toBe(100);
      expect(mockUser.limits.maxBrokers).toBe(3);
    });

    test('should track subscription_created when upgrading from free', async () => {
      mockUser.subscription.tier = 'free';
      User.findById = jest.fn().mockResolvedValue(mockUser);
      analyticsEventService.trackSubscriptionCreated.mockResolvedValue({ success: true });

      await subscriptionManager.upgradeSubscription(mockUserId.toString(), 'elite');

      expect(analyticsEventService.trackSubscriptionCreated).toHaveBeenCalledWith(
        mockUserId,
        {
          tier: 'elite',
          amount: 149,
          billingPeriod: 'monthly',
          trialDays: 0
        },
        null
      );
    });

    test('should not track event when upgrading between paid tiers', async () => {
      mockUser.subscription.tier = 'professional';
      User.findById = jest.fn().mockResolvedValue(mockUser);

      await subscriptionManager.upgradeSubscription(mockUserId.toString(), 'elite');

      expect(analyticsEventService.trackSubscriptionCreated).not.toHaveBeenCalled();
    });

    test('should return error if user not found', async () => {
      User.findById = jest.fn().mockResolvedValue(null);

      const result = await subscriptionManager.upgradeSubscription(mockUserId.toString(), 'professional');

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });
  });

  describe('getSubscriptionStatus', () => {
    test('should return subscription status and limits', async () => {
      mockUser.subscription.tier = 'professional';
      mockUser.subscription.status = 'active';
      mockUser.subscription.currentPeriodEnd = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
      mockUser.limits.signalsPerDay = 100;
      mockUser.limits.signalsUsedToday = 25;
      mockUser.limits.maxBrokers = 3;
      mockUser.isSubscriptionActive = jest.fn().mockReturnValue(true);

      User.findById = jest.fn().mockResolvedValue(mockUser);

      const result = await subscriptionManager.getSubscriptionStatus(mockUserId.toString());

      expect(result.success).toBe(true);
      expect(result.subscription.tier).toBe('professional');
      expect(result.subscription.status).toBe('active');
      expect(result.subscription.isActive).toBe(true);
      expect(result.subscription.daysRemaining).toBeGreaterThan(14);
      expect(result.subscription.limits.signalsPerDay).toBe(100);
      expect(result.subscription.limits.signalsUsedToday).toBe(25);
      expect(result.subscription.limits.maxBrokers).toBe(3);
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
