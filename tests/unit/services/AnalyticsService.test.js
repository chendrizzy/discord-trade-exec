'use strict';

/**
 * Analytics Service Unit Tests
 *
 * Task: T051 [P] [US5] - Unit tests for analytics calculations
 * Story: US-005 (Analytics Platform & Business Intelligence)
 *
 * Tests MRR/ARR calculations, churn prediction, growth metrics, and LTV.
 *
 * Constitutional Requirements:
 * - Principle II: Test-First (>95% coverage for analytics calculations)
 * - Principle VI: Observability (analytics accuracy validation)
 */

const AnalyticsService = require('../../../src/services/AnalyticsService');
const Subscription = require('../../../src/models/Subscription');
const User = require('../../../src/models/User');
const { createTestUser } = require('../../fixtures/user.fixtures');
const { setupTestDB, teardownTestDB, clearCollections } = require('../../helpers/db');
const redis = require('../../../src/config/redis');

describe('AnalyticsService - Unit Tests', () => {
  beforeAll(async () => {
    await setupTestDB();
  });

  afterAll(async () => {
    await teardownTestDB();
    if (redis && redis.quit) {
      await redis.quit();
    }
  });

  beforeEach(async () => {
    await clearCollections(['users', 'subscriptions']);
    // Clear Redis cache
    if (redis && redis.flushdb) {
      await redis.flushdb();
    }
  });

  describe('calculateMRR', () => {
    it('should calculate MRR for monthly subscriptions', async () => {
      // Create monthly subscriptions
      await Subscription.create([
        {
          userId: (await createTestUser()).id,
          plan: 'basic',
          interval: 'monthly',
          amount: 29.99,
          status: 'active',
          currentPeriodStart: new Date('2025-10-01'),
          currentPeriodEnd: new Date('2025-11-01')
        },
        {
          userId: (await createTestUser()).id,
          plan: 'pro',
          interval: 'monthly',
          amount: 49.99,
          status: 'active',
          currentPeriodStart: new Date('2025-10-01'),
          currentPeriodEnd: new Date('2025-11-01')
        },
        {
          userId: (await createTestUser()).id,
          plan: 'premium',
          interval: 'monthly',
          amount: 99.99,
          status: 'active',
          currentPeriodStart: new Date('2025-10-01'),
          currentPeriodEnd: new Date('2025-11-01')
        }
      ]);

      const mrr = await AnalyticsService.calculateMRR();

      // MRR = sum of monthly recurring revenue
      expect(mrr).toBeCloseTo(29.99 + 49.99 + 99.99, 2);
    });

    it('should convert yearly subscriptions to MRR', async () => {
      // Create yearly subscription
      await Subscription.create({
        userId: (await createTestUser()).id,
        plan: 'pro',
        interval: 'yearly',
        amount: 479.99, // $479.99/year
        status: 'active',
        currentPeriodStart: new Date('2025-01-01'),
        currentPeriodEnd: new Date('2026-01-01')
      });

      const mrr = await AnalyticsService.calculateMRR();

      // MRR = yearly amount / 12
      expect(mrr).toBeCloseTo(479.99 / 12, 2);
    });

    it('should exclude inactive subscriptions from MRR', async () => {
      await Subscription.create([
        {
          userId: (await createTestUser()).id,
          plan: 'basic',
          interval: 'monthly',
          amount: 29.99,
          status: 'active',
          currentPeriodStart: new Date('2025-10-01'),
          currentPeriodEnd: new Date('2025-11-01')
        },
        {
          userId: (await createTestUser()).id,
          plan: 'pro',
          interval: 'monthly',
          amount: 49.99,
          status: 'cancelled', // Should be excluded
          currentPeriodStart: new Date('2025-09-01'),
          currentPeriodEnd: new Date('2025-10-01')
        }
      ]);

      const mrr = await AnalyticsService.calculateMRR();

      // Only active subscription counted
      expect(mrr).toBeCloseTo(29.99, 2);
    });

    it('should cache MRR calculation for 1 hour', async () => {
      await Subscription.create({
        userId: (await createTestUser()).id,
        plan: 'basic',
        interval: 'monthly',
        amount: 29.99,
        status: 'active',
        currentPeriodStart: new Date('2025-10-01'),
        currentPeriodEnd: new Date('2025-11-01')
      });

      // First call - should calculate and cache
      const mrr1 = await AnalyticsService.calculateMRR();
      expect(mrr1).toBeCloseTo(29.99, 2);

      // Add new subscription
      await Subscription.create({
        userId: (await createTestUser()).id,
        plan: 'pro',
        interval: 'monthly',
        amount: 49.99,
        status: 'active',
        currentPeriodStart: new Date('2025-10-01'),
        currentPeriodEnd: new Date('2025-11-01')
      });

      // Second call - should return cached value (NOT recalculated)
      const mrr2 = await AnalyticsService.calculateMRR();
      expect(mrr2).toBeCloseTo(29.99, 2); // Still old value from cache
    });
  });

  describe('calculateARR', () => {
    it('should calculate ARR from MRR', async () => {
      await Subscription.create({
        userId: (await createTestUser()).id,
        plan: 'pro',
        interval: 'monthly',
        amount: 49.99,
        status: 'active',
        currentPeriodStart: new Date('2025-10-01'),
        currentPeriodEnd: new Date('2025-11-01')
      });

      const arr = await AnalyticsService.calculateARR();

      // ARR = MRR × 12
      expect(arr).toBeCloseTo(49.99 * 12, 2);
    });

    it('should include yearly subscriptions directly in ARR', async () => {
      await Subscription.create({
        userId: (await createTestUser()).id,
        plan: 'premium',
        interval: 'yearly',
        amount: 999.99,
        status: 'active',
        currentPeriodStart: new Date('2025-01-01'),
        currentPeriodEnd: new Date('2026-01-01')
      });

      const arr = await AnalyticsService.calculateARR();

      // ARR = yearly amount (already annualized)
      expect(arr).toBeCloseTo(999.99, 2);
    });
  });

  describe('calculateChurnRate', () => {
    it('should calculate churn rate for a period', async () => {
      const startDate = new Date('2025-10-01');
      const endDate = new Date('2025-10-31');

      // Create 100 active subscriptions at start of period
      for (let i = 0; i < 100; i++) {
        await Subscription.create({
          userId: (await createTestUser()).id,
          plan: 'basic',
          interval: 'monthly',
          amount: 29.99,
          status: i < 10 ? 'cancelled' : 'active', // 10 cancelled during period
          currentPeriodStart: new Date('2025-09-15'),
          currentPeriodEnd: new Date('2025-10-15'),
          cancellationDate: i < 10 ? new Date('2025-10-15') : null,
          previousStatus: 'active'
        });
      }

      const churnRate = await AnalyticsService.calculateChurnRate({
        startDate,
        endDate
      });

      // Churn rate = (churned / active at start) × 100
      expect(churnRate.rate).toBeCloseTo(10, 1); // 10% churn (10/100)
      expect(churnRate.churned).toBe(10);
      expect(churnRate.activeAtStart).toBe(100);
    });

    it('should handle zero active subscriptions gracefully', async () => {
      const startDate = new Date('2025-10-01');
      const endDate = new Date('2025-10-31');

      const churnRate = await AnalyticsService.calculateChurnRate({
        startDate,
        endDate
      });

      expect(churnRate.rate).toBe(0);
      expect(churnRate.churned).toBe(0);
      expect(churnRate.activeAtStart).toBe(0);
    });
  });

  describe('calculateGrowthRate', () => {
    it('should calculate monthly growth rate', async () => {
      const currentMonth = new Date('2025-10-01');
      const previousMonth = new Date('2025-09-01');

      // Previous month: 80 active subscriptions
      for (let i = 0; i < 80; i++) {
        await Subscription.create({
          userId: (await createTestUser()).id,
          plan: 'basic',
          interval: 'monthly',
          amount: 29.99,
          status: 'active',
          currentPeriodStart: previousMonth,
          currentPeriodEnd: new Date('2025-10-01')
        });
      }

      // Current month: 100 active subscriptions (20 new)
      for (let i = 0; i < 20; i++) {
        await Subscription.create({
          userId: (await createTestUser()).id,
          plan: 'basic',
          interval: 'monthly',
          amount: 29.99,
          status: 'active',
          currentPeriodStart: currentMonth,
          currentPeriodEnd: new Date('2025-11-01')
        });
      }

      const growthRate = await AnalyticsService.calculateGrowthRate({
        period: 'month'
      });

      // Growth = ((current - previous) / previous) × 100
      // (100 - 80) / 80 = 25%
      expect(growthRate).toBeCloseTo(25, 1);
    });

    it('should handle negative growth (decline)', async () => {
      const currentMonth = new Date('2025-10-01');
      const previousMonth = new Date('2025-09-01');

      // Previous month: 100 subscriptions
      for (let i = 0; i < 100; i++) {
        await Subscription.create({
          userId: (await createTestUser()).id,
          plan: 'basic',
          interval: 'monthly',
          amount: 29.99,
          status: i < 20 ? 'cancelled' : 'active', // 20 cancelled
          currentPeriodStart: previousMonth,
          currentPeriodEnd: currentMonth,
          cancellationDate: i < 20 ? currentMonth : null
        });
      }

      const growthRate = await AnalyticsService.calculateGrowthRate({
        period: 'month'
      });

      // Decline = ((80 - 100) / 100) × 100 = -20%
      expect(growthRate).toBeCloseTo(-20, 1);
    });
  });

  describe('calculateLTV', () => {
    it('should calculate customer lifetime value', async () => {
      const avgMonthlyRevenue = 49.99;
      const avgCustomerLifespanMonths = 24; // 2 years
      const churnRate = 5; // 5% monthly churn

      const ltv = await AnalyticsService.calculateLTV({
        avgMonthlyRevenue,
        avgCustomerLifespanMonths,
        churnRate
      });

      // LTV = ARPU × avg lifespan / (1 + discount rate)
      // Simplified: ARPU × lifespan
      expect(ltv).toBeGreaterThan(0);
      expect(ltv).toBeCloseTo(avgMonthlyRevenue * avgCustomerLifespanMonths, -1);
    });

    it('should handle high churn rate (short lifespan)', async () => {
      const avgMonthlyRevenue = 29.99;
      const avgCustomerLifespanMonths = 3; // Only 3 months (high churn)
      const churnRate = 33; // 33% monthly churn

      const ltv = await AnalyticsService.calculateLTV({
        avgMonthlyRevenue,
        avgCustomerLifespanMonths,
        churnRate
      });

      // High churn = low LTV
      expect(ltv).toBeCloseTo(29.99 * 3, -1);
      expect(ltv).toBeLessThan(200);
    });
  });

  describe('getCohortRetention', () => {
    it('should calculate retention rates for user cohorts', async () => {
      const cohortDate = new Date('2025-09-01');

      // Create cohort of 100 users who subscribed in September
      const cohortUsers = [];
      for (let i = 0; i < 100; i++) {
        const user = await createTestUser();
        cohortUsers.push(user);

        await Subscription.create({
          userId: user.id,
          plan: 'basic',
          interval: 'monthly',
          amount: 29.99,
          status: i < 70 ? 'active' : 'cancelled', // 70% retained after 1 month
          currentPeriodStart: cohortDate,
          currentPeriodEnd: new Date('2025-10-01'),
          cancellationDate: i >= 70 ? new Date('2025-09-15') : null
        });
      }

      const retention = await AnalyticsService.getCohortRetention({
        cohortDate,
        period: 'month'
      });

      // Retention = (active / total) × 100
      expect(retention.retentionRate).toBeCloseTo(70, 1); // 70% retained
      expect(retention.cohortSize).toBe(100);
      expect(retention.activeCount).toBe(70);
    });

    it('should track retention across multiple months', async () => {
      const cohortDate = new Date('2025-01-01');

      // Create cohort with varying retention over time
      for (let i = 0; i < 100; i++) {
        const user = await createTestUser();

        // Month 1: 100 active
        // Month 2: 80 active (20 churned)
        // Month 3: 65 active (15 more churned)
        const status = i < 65 ? 'active' : 'cancelled';
        const cancellationDate = i >= 65 ? (i < 80 ? new Date('2025-02-15') : new Date('2025-03-15')) : null;

        await Subscription.create({
          userId: user.id,
          plan: 'basic',
          interval: 'monthly',
          amount: 29.99,
          status,
          currentPeriodStart: cohortDate,
          currentPeriodEnd: new Date('2025-02-01'),
          cancellationDate
        });
      }

      // Check retention for month 3
      const retention = await AnalyticsService.getCohortRetention({
        cohortDate,
        period: 'month',
        monthsElapsed: 3
      });

      expect(retention.retentionRate).toBeCloseTo(65, 1); // 65% retained after 3 months
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty database gracefully', async () => {
      const mrr = await AnalyticsService.calculateMRR();
      const arr = await AnalyticsService.calculateARR();

      expect(mrr).toBe(0);
      expect(arr).toBe(0);
    });

    it('should handle mixed intervals correctly', async () => {
      await Subscription.create([
        {
          userId: (await createTestUser()).id,
          plan: 'basic',
          interval: 'monthly',
          amount: 29.99,
          status: 'active',
          currentPeriodStart: new Date('2025-10-01'),
          currentPeriodEnd: new Date('2025-11-01')
        },
        {
          userId: (await createTestUser()).id,
          plan: 'pro',
          interval: 'yearly',
          amount: 479.99,
          status: 'active',
          currentPeriodStart: new Date('2025-01-01'),
          currentPeriodEnd: new Date('2026-01-01')
        },
        {
          userId: (await createTestUser()).id,
          plan: 'premium',
          interval: 'monthly',
          amount: 99.99,
          status: 'active',
          currentPeriodStart: new Date('2025-10-01'),
          currentPeriodEnd: new Date('2025-11-01')
        }
      ]);

      const mrr = await AnalyticsService.calculateMRR();

      // MRR = 29.99 + (479.99/12) + 99.99
      expect(mrr).toBeCloseTo(29.99 + 479.99 / 12 + 99.99, 2);
    });

    it('should handle large volumes efficiently', async () => {
      // Create 1000 subscriptions
      const subscriptions = [];
      for (let i = 0; i < 1000; i++) {
        subscriptions.push({
          userId: (await createTestUser()).id,
          plan: i % 3 === 0 ? 'basic' : i % 3 === 1 ? 'pro' : 'premium',
          interval: 'monthly',
          amount: i % 3 === 0 ? 29.99 : i % 3 === 1 ? 49.99 : 99.99,
          status: 'active',
          currentPeriodStart: new Date('2025-10-01'),
          currentPeriodEnd: new Date('2025-11-01')
        });
      }

      await Subscription.insertMany(subscriptions);

      const startTime = Date.now();
      const mrr = await AnalyticsService.calculateMRR();
      const duration = Date.now() - startTime;

      // Should complete in reasonable time (<1 second for 1000 records)
      expect(duration).toBeLessThan(1000);
      expect(mrr).toBeGreaterThan(0);
    });
  });
});
