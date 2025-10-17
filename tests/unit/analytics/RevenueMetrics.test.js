// External dependencies
const mongoose = require('mongoose');

// Internal utilities and services
const { RevenueMetrics } = require('../../../src/services/analytics/RevenueMetrics');
const User = require('../../../src/models/User');

describe('RevenueMetrics', () => {
  let revenueMetrics;

  beforeEach(() => {
    revenueMetrics = new RevenueMetrics();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateMRR', () => {
    test('should calculate MRR with mixed subscription tiers', async () => {
      const mockUsers = [
        { subscription: { tier: 'basic', status: 'active' } },
        { subscription: { tier: 'basic', status: 'active' } },
        { subscription: { tier: 'pro', status: 'active' } },
        { subscription: { tier: 'premium', status: 'active' } }
      ];

      jest.spyOn(User, 'find').mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUsers)
      });

      const result = await revenueMetrics.calculateMRR();

      expect(result.current).toBe(49 + 49 + 99 + 299); // 496
      expect(result.subscriberCount).toBe(4);
      expect(result.byTier.basic.count).toBe(2);
      expect(result.byTier.pro.count).toBe(1);
      expect(result.byTier.premium.count).toBe(1);
    });

    test('should handle users with no subscription tier (default to basic)', async () => {
      const mockUsers = [
        { subscription: { status: 'active' } }, // No tier specified
        { subscription: { tier: 'pro', status: 'active' } }
      ];

      jest.spyOn(User, 'find').mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUsers)
      });

      const result = await revenueMetrics.calculateMRR();

      expect(result.current).toBe(49 + 99); // 148
      expect(result.byTier.basic.count).toBe(1);
      expect(result.byTier.basic.revenue).toBe(49);
    });

    test('should return zero MRR when no active subscriptions', async () => {
      jest.spyOn(User, 'find').mockReturnValue({
        select: jest.fn().mockResolvedValue([])
      });

      const result = await revenueMetrics.calculateMRR();

      expect(result.current).toBe(0);
      expect(result.subscriberCount).toBe(0);
    });

    test('should calculate correct tier breakdown', async () => {
      const mockUsers = [
        { subscription: { tier: 'basic', status: 'active' } },
        { subscription: { tier: 'basic', status: 'active' } },
        { subscription: { tier: 'basic', status: 'active' } }
      ];

      jest.spyOn(User, 'find').mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUsers)
      });

      const result = await revenueMetrics.calculateMRR();

      expect(result.byTier.basic).toEqual({
        count: 3,
        revenue: 49 * 3
      });
      expect(result.byTier.pro).toEqual({ count: 0, revenue: 0 });
      expect(result.byTier.premium).toEqual({ count: 0, revenue: 0 });
    });
  });

  describe('calculateARR', () => {
    test('should calculate ARR as MRR * 12', async () => {
      const mockUsers = [
        { subscription: { tier: 'premium', status: 'active' } }
      ];

      jest.spyOn(User, 'find').mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUsers)
      });

      const result = await revenueMetrics.calculateARR();

      expect(result.current).toBe(299 * 12); // 3588
      expect(result.mrr).toBe(299);
    });

    test('should return zero ARR when no subscriptions', async () => {
      jest.spyOn(User, 'find').mockReturnValue({
        select: jest.fn().mockResolvedValue([])
      });

      const result = await revenueMetrics.calculateARR();

      expect(result.current).toBe(0);
      expect(result.mrr).toBe(0);
    });
  });

  describe('calculateLTV', () => {
    test('should calculate LTV correctly', async () => {
      // Mock active users for average monthly revenue
      const mockActiveUsers = [
        { subscription: { tier: 'basic', status: 'active' } },
        { subscription: { tier: 'pro', status: 'active' } }
      ];

      // Mock canceled users for lifetime calculation
      const mockCanceledUsers = [
        {
          createdAt: new Date('2023-01-01'),
          subscription: {
            status: 'canceled',
            canceledAt: new Date('2023-07-01') // 6 months
          }
        },
        {
          createdAt: new Date('2023-01-01'),
          subscription: {
            status: 'canceled',
            canceledAt: new Date('2024-01-01') // 12 months
          }
        }
      ];

      // Mock User.find for MRR calculation
      jest.spyOn(User, 'find')
        .mockReturnValueOnce({
          select: jest.fn().mockResolvedValue(mockActiveUsers)
        })
        .mockReturnValueOnce({
          select: jest.fn().mockResolvedValue(mockCanceledUsers)
        });

      // Mock User.countDocuments for active users count
      jest.spyOn(User, 'countDocuments').mockResolvedValue(2);

      const result = await revenueMetrics.calculateLTV();

      const avgMonthlyRevenue = (49 + 99) / 2; // 74

      // Lifetime calculation uses 30-day months
      // Jan 1 to Jul 1 = 181 days / 30 = ~6.03 months
      // Jan 1 to Jan 1 next year = 365 days / 30 = ~12.17 months
      // Average = (6.03 + 12.17) / 2 = ~9.1 months

      expect(result.avgMonthlyRevenue).toBe(74);
      expect(result.avgLifetimeMonths).toBeCloseTo(9.1, 1);
      expect(result.perUser).toBeCloseTo(673.4, 1);
    });

    test('should use default 12 months when no canceled users', async () => {
      // Mock active users
      const mockActiveUsers = [
        { subscription: { tier: 'basic', status: 'active' } }
      ];

      jest.spyOn(User, 'find')
        .mockReturnValueOnce({
          select: jest.fn().mockResolvedValue(mockActiveUsers)
        })
        .mockReturnValueOnce({
          select: jest.fn().mockResolvedValue([]) // No canceled users
        });

      jest.spyOn(User, 'countDocuments').mockResolvedValue(1);

      const result = await revenueMetrics.calculateLTV();

      expect(result.avgLifetimeMonths).toBe(12); // Default
      expect(result.perUser).toBe(49 * 12); // 588
    });

    test('should return zero LTV when no active users', async () => {
      jest.spyOn(User, 'find').mockReturnValue({
        select: jest.fn().mockResolvedValue([])
      });
      jest.spyOn(User, 'countDocuments').mockResolvedValue(0);

      const result = await revenueMetrics.calculateLTV();

      expect(result.perUser).toBe(0);
      expect(result.avgMonthlyRevenue).toBe(0);
    });
  });

  describe('calculateChurnRate', () => {
    test('should calculate churn rate correctly', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      // Mock starting subscriber count
      jest.spyOn(User, 'countDocuments')
        .mockResolvedValueOnce(100) // Start of period
        .mockResolvedValueOnce(5);  // Churned during period

      const result = await revenueMetrics.calculateChurnRate(startDate, endDate);

      expect(result.churnRate).toBe(5.00); // 5 out of 100 = 5%
      expect(result.churned).toBe(5);
      expect(result.startSubscribers).toBe(100);
      expect(result.period.start).toEqual(startDate);
      expect(result.period.end).toEqual(endDate);
    });

    test('should return zero churn rate when no subscribers at start', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      jest.spyOn(User, 'countDocuments')
        .mockResolvedValueOnce(0) // No subscribers
        .mockResolvedValueOnce(0);

      const result = await revenueMetrics.calculateChurnRate(startDate, endDate);

      expect(result.churnRate).toBe(0);
      expect(result.churned).toBe(0);
      expect(result.startSubscribers).toBe(0);
    });

    test('should handle 100% churn rate', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      jest.spyOn(User, 'countDocuments')
        .mockResolvedValueOnce(10)  // Start with 10
        .mockResolvedValueOnce(10); // All churned

      const result = await revenueMetrics.calculateChurnRate(startDate, endDate);

      expect(result.churnRate).toBe(100.00);
      expect(result.churned).toBe(10);
    });

    test('should round churn rate to 2 decimal places', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      jest.spyOn(User, 'countDocuments')
        .mockResolvedValueOnce(300) // Start
        .mockResolvedValueOnce(7);  // Churned (7/300 = 2.333...)

      const result = await revenueMetrics.calculateChurnRate(startDate, endDate);

      expect(result.churnRate).toBe(2.33);
    });
  });

  describe('getAllMetrics', () => {
    test('should return all metrics including churn when dates provided', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      // Mock active users
      const mockUsers = [
        { subscription: { tier: 'basic', status: 'active' } }
      ];

      jest.spyOn(User, 'find').mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUsers)
      });
      jest.spyOn(User, 'countDocuments')
        .mockResolvedValueOnce(1)   // Active users for LTV
        .mockResolvedValueOnce(100) // Start of period for churn
        .mockResolvedValueOnce(5);  // Churned

      const result = await revenueMetrics.getAllMetrics(startDate, endDate);

      expect(result.mrr).toBeDefined();
      expect(result.arr).toBeDefined();
      expect(result.ltv).toBeDefined();
      expect(result.churn).toBeDefined();
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.churn.churnRate).toBe(5.00);
    });

    test('should return metrics without churn when dates not provided', async () => {
      const mockUsers = [
        { subscription: { tier: 'basic', status: 'active' } }
      ];

      jest.spyOn(User, 'find').mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUsers)
      });
      jest.spyOn(User, 'countDocuments').mockResolvedValue(1);

      const result = await revenueMetrics.getAllMetrics();

      expect(result.mrr).toBeDefined();
      expect(result.arr).toBeDefined();
      expect(result.ltv).toBeDefined();
      expect(result.churn).toBeNull();
      expect(result.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('Edge Cases', () => {
    test('should handle users without tier (defaults to basic)', async () => {
      const mockUsers = [
        { subscription: { tier: null, status: 'active' } }, // No tier, should default to basic
        { subscription: { tier: 'basic', status: 'active' } }
      ];

      jest.spyOn(User, 'find').mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUsers)
      });

      const result = await revenueMetrics.calculateMRR();

      // Both users should count as basic (49 each)
      expect(result.current).toBe(98);
      expect(result.byTier.basic.count).toBe(2);
    });

    test('should handle database errors gracefully', async () => {
      jest.spyOn(User, 'find').mockReturnValue({
        select: jest.fn().mockRejectedValue(new Error('Database error'))
      });

      await expect(revenueMetrics.calculateMRR()).rejects.toThrow('Database error');
    });

    test('should handle very large numbers correctly', async () => {
      const mockUsers = Array(10000).fill({
        subscription: { tier: 'premium', status: 'active' }
      });

      jest.spyOn(User, 'find').mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUsers)
      });

      const result = await revenueMetrics.calculateMRR();

      expect(result.current).toBe(299 * 10000); // 2,990,000
      expect(result.subscriberCount).toBe(10000);
    });
  });

  describe('Tier Pricing Configuration', () => {
    test('should use correct default tier pricing', () => {
      expect(revenueMetrics.tierPricing).toEqual({
        basic: 49,
        pro: 99,
        premium: 299
      });
    });

    test('should allow custom tier pricing', () => {
      const customMetrics = new RevenueMetrics();
      customMetrics.tierPricing = {
        basic: 29,
        pro: 79,
        premium: 199
      };

      expect(customMetrics.tierPricing.basic).toBe(29);
    });
  });
});
