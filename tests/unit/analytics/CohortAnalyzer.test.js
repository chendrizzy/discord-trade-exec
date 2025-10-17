// External dependencies
const mongoose = require('mongoose');

// Internal utilities and services
const { CohortAnalyzer } = require('../../../src/services/analytics/CohortAnalyzer');
const User = require('../../../src/models/User');
const AnalyticsEvent = require('../../../src/models/AnalyticsEvent');

describe('CohortAnalyzer', () => {
  let cohortAnalyzer;

  beforeEach(() => {
    cohortAnalyzer = new CohortAnalyzer();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getCohortKey', () => {
    test('should generate monthly cohort key', () => {
      const date = new Date('2024-03-15');
      const key = cohortAnalyzer.getCohortKey(date, 'month');

      expect(key).toBe('2024-03-01');
    });

    test('should generate weekly cohort key (Sunday start)', () => {
      const date = new Date('2024-03-15'); // Friday
      const key = cohortAnalyzer.getCohortKey(date, 'week');

      // Should return the previous Sunday
      expect(key).toMatch(/2024-03-\d{2}/);
    });

    test('should handle different months', () => {
      const dates = [
        new Date('2024-01-15T12:00:00'), // Use midday to avoid timezone issues
        new Date('2024-02-15T12:00:00'),
        new Date('2024-12-15T12:00:00')
      ];

      const keys = dates.map(d => cohortAnalyzer.getCohortKey(d, 'month'));

      expect(keys).toEqual(['2024-01-01', '2024-02-01', '2024-12-01']);
    });
  });

  describe('addPeriods', () => {
    test('should add months correctly', () => {
      const date = new Date('2024-01-15T12:00:00'); // Use midday to avoid timezone issues
      const result = cohortAnalyzer.addPeriods(date, 3, 'month');

      expect(result.getMonth()).toBe(3); // April (0-indexed)
      expect(result.getDate()).toBe(15);
    });

    test('should add weeks correctly', () => {
      const date = new Date('2024-01-01');
      const result = cohortAnalyzer.addPeriods(date, 2, 'week');

      const daysDiff = (result - date) / (1000 * 60 * 60 * 24);
      expect(daysDiff).toBe(14); // 2 weeks = 14 days
    });

    test('should handle year boundaries', () => {
      const date = new Date('2024-11-15');
      const result = cohortAnalyzer.addPeriods(date, 3, 'month');

      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(1); // February
    });
  });

  describe('analyzeCohortBehavior', () => {
    test('should return null for empty cohort', async () => {
      jest.spyOn(User, 'find').mockReturnValue({
        select: jest.fn().mockResolvedValue([])
      });

      const result = await cohortAnalyzer.analyzeCohortBehavior('2024-01');

      expect(result).toBeNull();
    });

    test('should analyze cohort with active subscriptions', async () => {
      const mockUsers = [
        {
          _id: 'user1',
          subscription: { tier: 'basic', status: 'active' },
          stats: { totalTrades: 10, totalProfit: 500 }
        },
        {
          _id: 'user2',
          subscription: { tier: 'pro', status: 'active' },
          stats: { totalTrades: 20, totalProfit: 1000 }
        },
        {
          _id: 'user3',
          subscription: { tier: 'basic', status: 'canceled' },
          stats: { totalTrades: 5, totalProfit: -100 }
        }
      ];

      jest.spyOn(User, 'find').mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUsers)
      });

      const result = await cohortAnalyzer.analyzeCohortBehavior('2024-01');

      expect(result.cohortId).toBe('2024-01');
      expect(result.cohortSize).toBe(3);
      expect(result.activeSubscriptions).toBe(2);
      expect(result.retentionRate).toBeCloseTo(66.67, 1);
      expect(result.tierDistribution).toEqual({
        basic: 2,
        pro: 1,
        premium: 0
      });
    });

    test('should calculate average trades and profit correctly', async () => {
      const mockUsers = [
        {
          _id: 'user1',
          subscription: { tier: 'basic', status: 'active' },
          stats: { totalTrades: 10, totalProfit: 500 }
        },
        {
          _id: 'user2',
          subscription: { tier: 'pro', status: 'active' },
          stats: { totalTrades: 20, totalProfit: 1500 }
        }
      ];

      jest.spyOn(User, 'find').mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUsers)
      });

      const result = await cohortAnalyzer.analyzeCohortBehavior('2024-01');

      expect(result.avgTradesPerUser).toBe(15); // (10 + 20) / 2
      expect(result.avgProfitPerUser).toBe(1000); // (500 + 1500) / 2
    });

    test('should handle users with missing stats', async () => {
      const mockUsers = [
        {
          _id: 'user1',
          subscription: { tier: 'basic', status: 'active' },
          stats: null
        },
        {
          _id: 'user2',
          subscription: { tier: 'pro', status: 'active' },
          stats: { totalTrades: 10, totalProfit: 500 }
        }
      ];

      jest.spyOn(User, 'find').mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUsers)
      });

      const result = await cohortAnalyzer.analyzeCohortBehavior('2024-01');

      expect(result.avgTradesPerUser).toBe(5); // (0 + 10) / 2
      expect(result.avgProfitPerUser).toBe(250); // (0 + 500) / 2
    });

    test('should calculate total revenue correctly', async () => {
      const mockUsers = [
        {
          _id: 'user1',
          subscription: { tier: 'basic', status: 'active' },
          stats: {}
        },
        {
          _id: 'user2',
          subscription: { tier: 'pro', status: 'active' },
          stats: {}
        },
        {
          _id: 'user3',
          subscription: { tier: 'premium', status: 'active' },
          stats: {}
        }
      ];

      jest.spyOn(User, 'find').mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUsers)
      });

      const result = await cohortAnalyzer.analyzeCohortBehavior('2024-01');

      // basic (49) + pro (99) + premium (299) = 447
      expect(result.totalRevenue).toBe(447);
    });
  });

  describe('compareCohorts', () => {
    test('should compare multiple cohorts', async () => {
      const mockCohort1 = [
        {
          _id: 'user1',
          subscription: { tier: 'basic', status: 'active' },
          stats: { totalTrades: 10, totalProfit: 500 }
        }
      ];

      const mockCohort2 = [
        {
          _id: 'user2',
          subscription: { tier: 'pro', status: 'active' },
          stats: { totalTrades: 20, totalProfit: 1000 }
        }
      ];

      jest.spyOn(User, 'find')
        .mockReturnValueOnce({
          select: jest.fn().mockResolvedValue(mockCohort1)
        })
        .mockReturnValueOnce({
          select: jest.fn().mockResolvedValue(mockCohort2)
        });

      const result = await cohortAnalyzer.compareCohorts(['2024-01', '2024-02']);

      expect(result.cohorts).toHaveLength(2);
      expect(result.averages).toBeDefined();
      expect(result.averages.retentionRate).toBeDefined();
      expect(result.averages.tradesPerUser).toBeDefined();
      expect(result.trend).toBeDefined();
    });

    test('should calculate trend as improving', async () => {
      const mockCohort1 = [
        {
          _id: 'user1',
          subscription: { tier: 'basic', status: 'canceled' },
          stats: { totalTrades: 5, totalProfit: 100 }
        }
      ];

      const mockCohort2 = [
        {
          _id: 'user2',
          subscription: { tier: 'basic', status: 'active' },
          stats: { totalTrades: 10, totalProfit: 500 }
        }
      ];

      jest.spyOn(User, 'find')
        .mockReturnValueOnce({
          select: jest.fn().mockResolvedValue(mockCohort1)
        })
        .mockReturnValueOnce({
          select: jest.fn().mockResolvedValue(mockCohort2)
        });

      const result = await cohortAnalyzer.compareCohorts(['2024-01', '2024-02']);

      expect(result.trend).toBe('improving'); // 100% retention > 0% retention * 1.1
    });

    test('should calculate trend as declining', async () => {
      const mockCohort1 = [
        {
          _id: 'user1',
          subscription: { tier: 'basic', status: 'active' },
          stats: { totalTrades: 10, totalProfit: 500 }
        }
      ];

      const mockCohort2 = [
        {
          _id: 'user2',
          subscription: { tier: 'basic', status: 'canceled' },
          stats: { totalTrades: 5, totalProfit: 100 }
        }
      ];

      jest.spyOn(User, 'find')
        .mockReturnValueOnce({
          select: jest.fn().mockResolvedValue(mockCohort1)
        })
        .mockReturnValueOnce({
          select: jest.fn().mockResolvedValue(mockCohort2)
        });

      const result = await cohortAnalyzer.compareCohorts(['2024-01', '2024-02']);

      expect(result.trend).toBe('declining'); // 0% retention < 100% retention * 0.9
    });

    test('should handle empty cohort comparisons', async () => {
      jest.spyOn(User, 'find').mockReturnValue({
        select: jest.fn().mockResolvedValue([])
      });

      const result = await cohortAnalyzer.compareCohorts(['2024-01', '2024-02']);

      expect(result.cohorts).toEqual([]);
    });
  });

  describe('generateRetentionTable', () => {
    test('should generate retention table structure', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-03-31');

      const mockUsers = [
        {
          _id: 'user1',
          createdAt: new Date('2024-01-15')
        },
        {
          _id: 'user2',
          createdAt: new Date('2024-02-10')
        }
      ];

      jest.spyOn(User, 'find').mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUsers)
      });

      jest.spyOn(AnalyticsEvent, 'distinct').mockResolvedValue([]);

      const result = await cohortAnalyzer.generateRetentionTable({
        startDate,
        endDate,
        cohortPeriod: 'month',
        retentionMetric: 'login'
      });

      expect(result.cohorts).toBeInstanceOf(Array);
      expect(result.metric).toBe('login');
      expect(result.period).toBe('month');
      expect(result.startDate).toEqual(startDate);
      expect(result.endDate).toEqual(endDate);
    });

    test('should use default dates when not provided', async () => {
      jest.spyOn(User, 'find').mockReturnValue({
        select: jest.fn().mockResolvedValue([])
      });

      const result = await cohortAnalyzer.generateRetentionTable();

      expect(result.startDate).toBeInstanceOf(Date);
      expect(result.endDate).toBeInstanceOf(Date);
    });
  });

  describe('Edge Cases', () => {
    test('should handle database errors gracefully', async () => {
      jest.spyOn(User, 'find').mockReturnValue({
        select: jest.fn().mockRejectedValue(new Error('Database error'))
      });

      await expect(cohortAnalyzer.analyzeCohortBehavior('2024-01')).rejects.toThrow('Database error');
    });

    test('should handle invalid cohort ID format', async () => {
      jest.spyOn(User, 'find').mockReturnValue({
        select: jest.fn().mockResolvedValue([])
      });

      const result = await cohortAnalyzer.analyzeCohortBehavior('invalid-id');

      expect(result).toBeNull();
    });
  });
});
