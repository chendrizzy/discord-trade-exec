/**
 * Access Analytics Integration Tests
 *
 * Feature: 004-subscription-gating
 * Phase: 9 (Analytics)
 * Task: T071 - Write integration tests for analytics
 *
 * Purpose: Validate analytics service with real MongoDB
 *
 * Test Coverage:
 * - Guild analytics retrieval
 * - User analytics retrieval
 * - Trending analysis
 * - Per-server data isolation (T069)
 * - Time-based metrics
 * - Analytics accuracy
 */

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const AccessDenialEvent = require('@models/AccessDenialEvent');
const { AccessAnalyticsService } = require('@services/analytics/AccessAnalyticsService');

// Test constants
const TEST_GUILD_ID = '1111111111111111111';
const TEST_GUILD_ID_2 = '2222222222222222222';
const TEST_USER_ID = '3333333333333333333';
const TEST_USER_ID_2 = '4444444444444444444';

describe('Access Analytics Integration Tests (Phase 9 - T071)', () => {
  let mongoServer;
  let analyticsService;
  let wasConnected = false;

  // Setup MongoDB Memory Server
  beforeAll(async () => {
    // Check if mongoose is already connected
    wasConnected = mongoose.connection.readyState === 1;

    if (!wasConnected) {
      mongoServer = await MongoMemoryServer.create();
      const mongoUri = mongoServer.getUri();
      await mongoose.connect(mongoUri);
    }

    analyticsService = new AccessAnalyticsService();
  });

  // Cleanup after all tests
  afterAll(async () => {
    // Only disconnect if we created the connection
    if (!wasConnected && mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  // Clear database before each test
  beforeEach(async () => {
    await AccessDenialEvent.deleteMany({});
  });

  /**
   * Guild Analytics Tests
   */
  describe('Guild Analytics (T068, T069)', () => {
    it('should retrieve guild analytics with accurate statistics', async () => {
      // ARRANGE: Create denial events
      const events = [
        {
          guildId: TEST_GUILD_ID,
          userId: TEST_USER_ID,
          commandAttempted: 'trade',
          denialReason: 'no_subscription',
          timestamp: new Date()
        },
        {
          guildId: TEST_GUILD_ID,
          userId: TEST_USER_ID_2,
          commandAttempted: 'trade',
          denialReason: 'subscription_expired',
          timestamp: new Date()
        },
        {
          guildId: TEST_GUILD_ID,
          userId: TEST_USER_ID,
          commandAttempted: 'signal',
          denialReason: 'no_subscription',
          timestamp: new Date()
        }
      ];

      await AccessDenialEvent.insertMany(events);

      // ACT: Get guild analytics
      const startDate = new Date(Date.now() - 86400000); // 24 hours ago
      const analytics = await analyticsService.getGuildAnalytics(TEST_GUILD_ID, { startDate });

      // ASSERT: Verify analytics accuracy
      expect(analytics).toBeDefined();
      expect(analytics.guildId).toBe(TEST_GUILD_ID);
      expect(analytics.summary.totalDenials).toBe(3);
      expect(analytics.summary.uniqueUsers).toBe(2);

      // Verify denial reasons breakdown
      expect(analytics.denialReasons.no_subscription).toBe(2);
      expect(analytics.denialReasons.subscription_expired).toBe(1);
      expect(analytics.denialReasons.verification_failed).toBe(0);

      // Verify most denied users
      expect(analytics.mostDeniedUsers).toBeDefined();
      expect(analytics.mostDeniedUsers.length).toBeGreaterThan(0);
      expect(analytics.mostDeniedUsers[0].userId).toBe(TEST_USER_ID);
      expect(analytics.mostDeniedUsers[0].denialCount).toBe(2);

      // Verify command stats
      expect(analytics.commandStats).toBeDefined();
      expect(analytics.commandStats.length).toBe(2);
      expect(analytics.commandStats[0].command).toBe('trade');
      expect(analytics.commandStats[0].count).toBe(2);
    });

    it('should enforce per-server data isolation (T069)', async () => {
      // ARRANGE: Create events for two different guilds
      const guild1Events = [
        {
          guildId: TEST_GUILD_ID,
          userId: TEST_USER_ID,
          commandAttempted: 'trade',
          denialReason: 'no_subscription',
          timestamp: new Date()
        },
        {
          guildId: TEST_GUILD_ID,
          userId: TEST_USER_ID,
          commandAttempted: 'signal',
          denialReason: 'no_subscription',
          timestamp: new Date()
        }
      ];

      const guild2Events = [
        {
          guildId: TEST_GUILD_ID_2,
          userId: TEST_USER_ID,
          commandAttempted: 'trade',
          denialReason: 'subscription_expired',
          timestamp: new Date()
        }
      ];

      await AccessDenialEvent.insertMany([...guild1Events, ...guild2Events]);

      // ACT: Get analytics for guild 1
      const startDate = new Date(Date.now() - 86400000);
      const analytics = await analyticsService.getGuildAnalytics(TEST_GUILD_ID, { startDate });

      // ASSERT: Should only see guild 1 data
      expect(analytics.summary.totalDenials).toBe(2);
      expect(analytics.denialReasons.no_subscription).toBe(2);
      expect(analytics.denialReasons.subscription_expired).toBe(0);
    });

    it('should handle empty analytics gracefully', async () => {
      // ACT: Get analytics for guild with no events
      const startDate = new Date(Date.now() - 86400000);
      const analytics = await analyticsService.getGuildAnalytics(TEST_GUILD_ID, { startDate });

      // ASSERT: Should return zero values
      expect(analytics.summary.totalDenials).toBe(0);
      expect(analytics.summary.uniqueUsers).toBe(0);
      expect(analytics.mostDeniedUsers.length).toBe(0);
      expect(analytics.commandStats.length).toBe(0);
    });

    it('should filter analytics by date range', async () => {
      // ARRANGE: Create events at different times
      const oldEvent = {
        guildId: TEST_GUILD_ID,
        userId: TEST_USER_ID,
        commandAttempted: 'trade',
        denialReason: 'no_subscription',
        timestamp: new Date(Date.now() - 10 * 86400000) // 10 days ago
      };

      const recentEvent = {
        guildId: TEST_GUILD_ID,
        userId: TEST_USER_ID,
        commandAttempted: 'trade',
        denialReason: 'no_subscription',
        timestamp: new Date() // Now
      };

      await AccessDenialEvent.insertMany([oldEvent, recentEvent]);

      // ACT: Get analytics for last 7 days only
      const startDate = new Date(Date.now() - 7 * 86400000);
      const analytics = await analyticsService.getGuildAnalytics(TEST_GUILD_ID, { startDate });

      // ASSERT: Should only include recent event
      expect(analytics.summary.totalDenials).toBe(1);
    });
  });

  /**
   * User Analytics Tests
   */
  describe('User Analytics (T068)', () => {
    it('should retrieve user analytics across multiple guilds', async () => {
      // ARRANGE: Create events for same user in different guilds
      const events = [
        {
          guildId: TEST_GUILD_ID,
          userId: TEST_USER_ID,
          commandAttempted: 'trade',
          denialReason: 'no_subscription',
          timestamp: new Date()
        },
        {
          guildId: TEST_GUILD_ID_2,
          userId: TEST_USER_ID,
          commandAttempted: 'signal',
          denialReason: 'no_subscription',
          timestamp: new Date()
        }
      ];

      await AccessDenialEvent.insertMany(events);

      // ACT: Get user analytics
      const startDate = new Date(Date.now() - 86400000);
      const analytics = await analyticsService.getUserAnalytics(TEST_USER_ID, startDate);

      // ASSERT: Should aggregate across guilds
      expect(analytics.userId).toBe(TEST_USER_ID);
      expect(analytics.summary.totalDenials).toBe(2);
      expect(analytics.summary.guildsAffected).toBe(2);

      // Verify guild breakdown
      expect(analytics.byGuild).toBeDefined();
      expect(analytics.byGuild.length).toBe(2);
    });

    it('should handle user with no denial events', async () => {
      // ACT: Get analytics for user with no events
      const startDate = new Date(Date.now() - 86400000);
      const analytics = await analyticsService.getUserAnalytics(TEST_USER_ID, startDate);

      // ASSERT: Should return zero values
      expect(analytics.summary.totalDenials).toBe(0);
      expect(analytics.summary.guildsAffected).toBe(0);
      expect(analytics.byGuild.length).toBe(0);
    });
  });

  /**
   * Trending Analysis Tests
   */
  describe('Trending Analysis (T068)', () => {
    it('should calculate hourly trending denials', async () => {
      // ARRANGE: Create events spread across hours
      const now = new Date();
      const events = [
        {
          guildId: TEST_GUILD_ID,
          userId: TEST_USER_ID,
          commandAttempted: 'trade',
          denialReason: 'no_subscription',
          timestamp: new Date(now.getTime() - 3600000) // 1 hour ago
        },
        {
          guildId: TEST_GUILD_ID,
          userId: TEST_USER_ID,
          commandAttempted: 'trade',
          denialReason: 'no_subscription',
          timestamp: new Date(now.getTime() - 3600000) // 1 hour ago
        },
        {
          guildId: TEST_GUILD_ID,
          userId: TEST_USER_ID,
          commandAttempted: 'trade',
          denialReason: 'no_subscription',
          timestamp: new Date() // Now
        }
      ];

      await AccessDenialEvent.insertMany(events);

      // ACT: Get trending analysis
      const trending = await analyticsService.getTrendingDenials(TEST_GUILD_ID, 24);

      // ASSERT: Verify trending data
      expect(trending.guildId).toBe(TEST_GUILD_ID);
      expect(trending.totalDenials).toBe(3);
      expect(trending.averagePerHour).toBeDefined();
      expect(trending.peakActivity).toBeDefined();
      expect(trending.hourlyDistribution).toBeDefined();
    });

    it('should identify peak activity hours', async () => {
      // ARRANGE: Create many events in one hour
      const now = new Date();
      const peakHour = new Date(now.getTime() - 3600000); // 1 hour ago

      const events = Array(5).fill(null).map(() => ({
        guildId: TEST_GUILD_ID,
        userId: TEST_USER_ID,
        commandAttempted: 'trade',
        denialReason: 'no_subscription',
        timestamp: peakHour
      }));

      await AccessDenialEvent.insertMany(events);

      // ACT: Get trending analysis
      const trending = await analyticsService.getTrendingDenials(TEST_GUILD_ID, 24);

      // ASSERT: Should identify peak hour
      expect(trending.peakActivity.count).toBe(5);
      expect(trending.peakActivity.hour).toBe(peakHour.getHours());
    });
  });

  /**
   * Input Validation Tests
   */
  describe('Input Validation', () => {
    it('should validate Discord snowflake IDs', async () => {
      // ACT & ASSERT: Invalid guild ID
      await expect(
        analyticsService.getGuildAnalytics('invalid-id')
      ).rejects.toThrow(/Invalid guild ID/);

      // ACT & ASSERT: Invalid user ID
      await expect(
        analyticsService.getUserAnalytics('invalid-id')
      ).rejects.toThrow(/Invalid user ID/);
    });

    it('should use default date ranges when not specified', async () => {
      // ACT: Get analytics without explicit dates
      const analytics = await analyticsService.getGuildAnalytics(TEST_GUILD_ID);

      // ASSERT: Should use defaults (last 7 days)
      expect(analytics.period.start).toBeDefined();
      expect(analytics.period.end).toBeDefined();

      const daysDiff = (analytics.period.end - analytics.period.start) / 86400000;
      expect(Math.round(daysDiff)).toBe(7);
    });
  });

  /**
   * Performance Tests
   */
  describe('Performance', () => {
    it('should complete analytics query in <1 second', async () => {
      // ARRANGE: Create moderate dataset
      const events = Array(100).fill(null).map((_, idx) => ({
        guildId: TEST_GUILD_ID,
        userId: TEST_USER_ID,
        commandAttempted: 'trade',
        denialReason: 'no_subscription',
        timestamp: new Date(Date.now() - idx * 60000) // Spread over 100 minutes
      }));

      await AccessDenialEvent.insertMany(events);

      // ACT & ASSERT: Measure performance
      const startTime = Date.now();
      await analyticsService.getGuildAnalytics(TEST_GUILD_ID);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(1000); // <1 second
    });
  });
});
