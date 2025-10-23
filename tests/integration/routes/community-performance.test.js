'use strict';

/**
 * Performance Tests for Community Top Providers Query
 * 
 * Tests the N+1 query fix in community.js (lines 75-96)
 * Before: Promise.all loop with 2 queries per provider (3 providers = 6 extra queries)
 * After: Single aggregation with $lookup (1 query total)
 * 
 * Target: <50ms p95 (from ~300ms)
 */

const request = require('supertest');
const mongoose = require('mongoose');
const createApp = require('../../../src/app');
const User = require('../../../src/models/User');
const SignalProvider = require('../../../src/models/SignalProvider');
const UserSignalSubscription = require('../../../src/models/UserSignalSubscription');
const Signal = require('../../../src/models/Signal');

// Create app with test-friendly options (skip payment processor, tradingview)
const app = createApp({
  skipPaymentProcessor: true,
  skipTradingView: true
});

describe('Community Top Providers Performance', () => {
  let testUser;
  let testCommunity;
  let providers;

  beforeAll(async () => {
    // Create test community and user
    testCommunity = new mongoose.Types.ObjectId();

    testUser = await User.create({
      discordId: 'test-user-' + Date.now(),
      discordUsername: 'PerformanceTestUser',
      communityId: testCommunity,
      communityRole: 'admin',
      discriminator: '0001'
    });

    // Create 10 signal providers
    providers = await Promise.all(
      Array.from({ length: 10 }, async (_, i) => {
        return await SignalProvider.create({
          communityId: testCommunity,
          providerId: `provider-${i + 1}-${Date.now()}`,
          type: 'discord_channel',
          name: `Provider ${i + 1}`,
          description: `Test provider ${i + 1}`,
          isActive: true,
          verificationStatus: 'verified',
          performance: {
            winRate: 50 + i * 5, // 50%, 55%, 60%, ..., 95%
            totalTrades: 100 + i * 10,
            profitLoss: 1000 + i * 100,
            avgReturn: 2 + i * 0.5,
            netProfit: 5000 + i * 500
          }
        });
      })
    );

    // Create followers for each provider (varying counts)
    for (let i = 0; i < providers.length; i++) {
      const followerCount = (i + 1) * 5; // 5, 10, 15, ..., 50 followers
      await Promise.all(
        Array.from({ length: followerCount }, async (_, j) => {
          const follower = await User.create({
            discordId: `follower-${i}-${j}-${Date.now()}`,
            discordUsername: `Follower${i}_${j}`,
            communityId: testCommunity,
            discriminator: `000${j}`.slice(-4)
          });

          return await UserSignalSubscription.create({
            communityId: testCommunity,
            userId: follower._id,
            providerId: providers[i]._id,
            active: true
          });
        })
      );
    }

    // Create signals for today (varying counts per provider)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    for (let i = 0; i < providers.length; i++) {
      const signalCount = (i + 1) * 2; // 2, 4, 6, ..., 20 signals today
      await Promise.all(
        Array.from({ length: signalCount }, async (_, j) => {
          return await Signal.create({
            communityId: testCommunity,
            providerId: providers[i]._id,
            symbol: 'AAPL',
            side: 'BUY',
            action: 'BUY',
            entryPrice: 150 + j,
            price: 150 + j,
            timestamp: new Date(),
            createdAt: new Date()
          });
        })
      );
    }
  });

  afterAll(async () => {
    // Cleanup test data
    await User.deleteMany({ communityId: testCommunity });
    await SignalProvider.deleteMany({ communityId: testCommunity });
    await UserSignalSubscription.deleteMany({ communityId: testCommunity });
    await Signal.deleteMany({ communityId: testCommunity });
  });

  describe('Query Performance', () => {
    it('should complete in <50ms p95 with 10 providers', async () => {
      const iterations = 20; // Run 20 times to get p95
      const durations = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();

        const response = await request(app)
          .get('/api/community/overview')
          .set('Cookie', [`connect.sid=${testUser.sessionId}`])
          .expect(200);

        const duration = Date.now() - startTime;
        durations.push(duration);

        // Verify response structure
        expect(response.body).toHaveProperty('topProviders');
        expect(Array.isArray(response.body.topProviders)).toBe(true);
        expect(response.body.topProviders.length).toBeLessThanOrEqual(3);
      }

      // Calculate p95 (95th percentile)
      durations.sort((a, b) => a - b);
      const p95Index = Math.floor(iterations * 0.95);
      const p95Duration = durations[p95Index];

      expect(p95Duration).toBeLessThan(50); // Target: <50ms p95
    });

    it('should execute only 1 database query for top providers', async () => {
      // Enable MongoDB profiling
      const db = mongoose.connection.db;
      await db.command({ profile: 2 }); // Profile all operations

      // Clear profile collection
      await db
        .collection('system.profile')
        .drop()
        .catch(() => {});

      // Execute the query
      await request(app)
        .get('/api/community/overview')
        .set('Cookie', [`connect.sid=${testUser.sessionId}`])
        .expect(200);

      // Count queries to SignalProvider, UserSignalSubscription, and Signal collections
      const profile = await db
        .collection('system.profile')
        .find({
          ns: {
            $in: [
              `${db.databaseName}.signalproviders`,
              `${db.databaseName}.usersignalsubscriptions`,
              `${db.databaseName}.signals`
            ]
          },
          op: { $in: ['query', 'count', 'aggregate'] }
        })
        .toArray();

      // Should be 1 aggregation query with $lookup, not N+1 separate queries
      expect(profile.length).toBeLessThanOrEqual(1);

      // Disable profiling
      await db.command({ profile: 0 });
    });

    it('should return same data as N+1 query implementation', async () => {
      const response = await request(app)
        .get('/api/community/overview')
        .set('Cookie', [`connect.sid=${testUser.sessionId}`])
        .expect(200);

      const { topProviders } = response.body;

      // Verify top 3 providers (highest win rates)
      expect(topProviders).toHaveLength(3);

      // Should be sorted by win rate descending
      expect(topProviders[0].winRate).toBeGreaterThanOrEqual(topProviders[1].winRate);
      expect(topProviders[1].winRate).toBeGreaterThanOrEqual(topProviders[2].winRate);

      // Verify each provider has required fields
      topProviders.forEach(provider => {
        expect(provider).toHaveProperty('id');
        expect(provider).toHaveProperty('name');
        expect(provider).toHaveProperty('signalsToday');
        expect(provider).toHaveProperty('winRate');
        expect(provider).toHaveProperty('followers');

        expect(typeof provider.signalsToday).toBe('number');
        expect(typeof provider.winRate).toBe('number');
        expect(typeof provider.followers).toBe('number');
      });

      // Verify follower counts match (top provider should have most followers)
      const topProvider = providers.find(p => p._id.toString() === topProviders[0].id);
      const expectedFollowers = (providers.indexOf(topProvider) + 1) * 5;

      expect(topProviders[0].followers).toBe(expectedFollowers);
    });
  });

  describe('Scalability', () => {
    it('should handle 100 providers efficiently', async () => {
      // Create additional 90 providers (already have 10)
      const additionalProviders = await Promise.all(
        Array.from({ length: 90 }, async (_, i) => {
          return await SignalProvider.create({
            communityId: testCommunity,
            name: `Provider ${i + 11}`,
            description: `Test provider ${i + 11}`,
            isActive: true,
            performance: {
              winRate: 30 + (i % 70), // Varying win rates
              totalTrades: 100,
              profitLoss: 1000,
              avgReturn: 2,
              netProfit: 5000
            }
          });
        })
      );

      const startTime = Date.now();

      const response = await request(app)
        .get('/api/community/overview')
        .set('Cookie', [`connect.sid=${testUser.sessionId}`])
        .expect(200);

      const duration = Date.now() - startTime;

      // Should still be fast even with 100 providers
      expect(duration).toBeLessThan(100); // <100ms even with 10x data
      expect(response.body.topProviders).toHaveLength(3); // Still returns top 3

      // Cleanup additional providers
      await SignalProvider.deleteMany({ _id: { $in: additionalProviders.map(p => p._id) } });
    });
  });
});
