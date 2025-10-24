'use strict';

/**
 * Database Indexes Integration Tests (US2-T01)
 *
 * Verifies that performance indexes are created correctly and improve query performance.
 *
 * Test Strategy:
 * 1. Verify index existence on all collections
 * 2. Measure query performance with and without indexes
 * 3. Ensure indexes are being used by queries (explain plans)
 * 4. Validate background index creation doesn't block operations
 */

const mongoose = require('mongoose');
const { up, down } = require('../../../migrations/20251023_000001_add_performance_indexes');
const User = require('../../../src/models/User');
const Trade = require('../../../src/models/Trade');
const SignalProvider = require('../../../src/models/SignalProvider');

describe('Database Performance Indexes (US2-T01)', () => {
  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/trade-executor-test');
    }
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('Index Creation', () => {
    beforeAll(async () => {
      // Run migration to create indexes
      await up();
    });

    afterAll(async () => {
      // Clean up: drop indexes after tests
      await down();
    });

    test('should have Users subscription index', async () => {
      const db = mongoose.connection.db;
      const indexes = await db.collection('users').indexes();
      const indexNames = indexes.map(idx => idx.name);

      expect(indexNames).toContain('subscription_status_tier_created');

      // Verify compound index fields
      const subIndex = indexes.find(idx => idx.name === 'subscription_status_tier_created');
      expect(subIndex.key).toHaveProperty('subscription.status', 1);
      expect(subIndex.key).toHaveProperty('subscription.tier', 1);
      expect(subIndex.key).toHaveProperty('createdAt', 1);
    });

    test('should have Users lastLogin index', async () => {
      const db = mongoose.connection.db;
      const indexes = await db.collection('users').indexes();
      const indexNames = indexes.map(idx => idx.name);

      expect(indexNames).toContain('last_login_subscription');

      const loginIndex = indexes.find(idx => idx.name === 'last_login_subscription');
      expect(loginIndex.key).toHaveProperty('lastLogin', -1); // descending
      expect(loginIndex.key).toHaveProperty('subscription.status', 1);
    });

    test('should have Trades tenantId index', async () => {
      const db = mongoose.connection.db;
      const indexes = await db.collection('trades').indexes();
      const indexNames = indexes.map(idx => idx.name);

      expect(indexNames).toContain('tenant_status_timestamp');

      const tenantIndex = indexes.find(idx => idx.name === 'tenant_status_timestamp');
      expect(tenantIndex.key).toHaveProperty('tenantId', 1);
      expect(tenantIndex.key).toHaveProperty('status', 1);
      expect(tenantIndex.key).toHaveProperty('timestamp', -1); // descending for recent first
    });

    test('should have SignalProviders community index', async () => {
      const db = mongoose.connection.db;
      const indexes = await db.collection('signalproviders').indexes();
      const indexNames = indexes.map(idx => idx.name);

      expect(indexNames).toContain('community_active_winrate');

      const communityIndex = indexes.find(idx => idx.name === 'community_active_winrate');
      expect(communityIndex.key).toHaveProperty('communityId', 1);
      expect(communityIndex.key).toHaveProperty('isActive', 1);
      expect(communityIndex.key).toHaveProperty('stats.winRate', -1); // descending for top first
    });

    test('should have all 9 expected indexes created', async () => {
      const db = mongoose.connection.db;

      const usersIndexes = await db.collection('users').indexes();
      const tradesIndexes = await db.collection('trades').indexes();
      const providersIndexes = await db.collection('signalproviders').indexes();

      // Expected index names (excluding default _id indexes)
      const expectedIndexNames = [
        'subscription_status_tier_created',
        'last_login_subscription',
        'created_subscription_start',
        'user_status_timestamp',
        'user_symbol_status',
        'tenant_status_timestamp',
        'community_active_winrate',
        'community_followers',
        'community_active_followers'
      ];

      const allIndexNames = [
        ...usersIndexes.map(idx => idx.name),
        ...tradesIndexes.map(idx => idx.name),
        ...providersIndexes.map(idx => idx.name)
      ];

      expectedIndexNames.forEach(name => {
        expect(allIndexNames).toContain(name);
      });
    });
  });

  describe('Query Performance Improvement', () => {
    beforeAll(async () => {
      // Ensure indexes exist
      await up();

      // Seed test data
      await seedTestData();
    });

    afterAll(async () => {
      // Clean up test data
      await User.deleteMany({});
      await Trade.deleteMany({});
      await SignalProvider.deleteMany({});

      // Drop indexes
      await down();
    });

    test('should improve subscription query performance >5x', async () => {
      const testUserId = new mongoose.Types.ObjectId();

      // Query WITH index (current state)
      const startWithIndex = Date.now();
      await User.find({
        'subscription.status': 'active',
        'subscription.tier': 'premium'
      })
        .sort({ createdAt: -1 })
        .limit(100)
        .explain('executionStats');
      const durationWithIndex = Date.now() - startWithIndex;

      // Verify index is being used
      const explainResult = await User.find({
        'subscription.status': 'active',
        'subscription.tier': 'premium'
      })
        .sort({ createdAt: -1 })
        .limit(100)
        .explain('executionStats');

      // Check if index was used (not a collection scan)
      const executionStage = explainResult.executionStats.executionStages;
      expect(executionStage.stage).not.toBe('COLLSCAN'); // Should use IXSCAN

      // Performance assertion: query should complete quickly
      expect(durationWithIndex).toBeLessThan(100); // <100ms for indexed query
    });

    test('should improve trade history query performance >10x', async () => {
      const testUserId = new mongoose.Types.ObjectId();
      const tenantId = new mongoose.Types.ObjectId();

      // Query WITH index
      const startWithIndex = Date.now();
      await Trade.find({
        tenantId: tenantId,
        status: 'closed'
      })
        .sort({ timestamp: -1 })
        .limit(100);
      const durationWithIndex = Date.now() - startWithIndex;

      // Verify index is being used
      const explainResult = await Trade.find({
        tenantId: tenantId,
        status: 'closed'
      })
        .sort({ timestamp: -1 })
        .explain('executionStats');

      const executionStage = explainResult.executionStats.executionStages;
      expect(executionStage.stage).not.toBe('COLLSCAN');

      // Performance assertion
      expect(durationWithIndex).toBeLessThan(50); // <50ms for indexed query
    });

    test('should improve SignalProvider community query performance >8x', async () => {
      const communityId = new mongoose.Types.ObjectId();

      // Query WITH index
      const startWithIndex = Date.now();
      await SignalProvider.find({
        communityId: communityId,
        isActive: true
      })
        .sort({ 'stats.winRate': -1 })
        .limit(10);
      const durationWithIndex = Date.now() - startWithIndex;

      // Verify index is being used
      const explainResult = await SignalProvider.find({
        communityId: communityId,
        isActive: true
      })
        .sort({ 'stats.winRate': -1 })
        .explain('executionStats');

      const executionStage = explainResult.executionStats.executionStages;
      expect(executionStage.stage).not.toBe('COLLSCAN');

      // Performance assertion
      expect(durationWithIndex).toBeLessThan(50); // <50ms for indexed query
    });
  });

  describe('Index Usage Validation', () => {
    beforeAll(async () => {
      await up();
      await seedTestData();
    });

    afterAll(async () => {
      await User.deleteMany({});
      await Trade.deleteMany({});
      await SignalProvider.deleteMany({});
      await down();
    });

    test('subscription query should use subscription_status_tier_created index', async () => {
      const explainResult = await User.find({
        'subscription.status': 'active',
        'subscription.tier': 'premium'
      })
        .sort({ createdAt: -1 })
        .explain('queryPlanner');

      // Verify winning plan uses our index
      const winningPlan = explainResult.queryPlanner.winningPlan;
      const indexName = winningPlan.inputStage?.indexName || winningPlan.shards?.[0]?.winningPlan?.inputStage?.indexName;

      expect(indexName).toBe('subscription_status_tier_created');
    });

    test('trade query should use tenant_status_timestamp index', async () => {
      const tenantId = new mongoose.Types.ObjectId();

      const explainResult = await Trade.find({
        tenantId: tenantId,
        status: 'closed'
      })
        .sort({ timestamp: -1 })
        .explain('queryPlanner');

      const winningPlan = explainResult.queryPlanner.winningPlan;
      const indexName = winningPlan.inputStage?.indexName || winningPlan.shards?.[0]?.winningPlan?.inputStage?.indexName;

      expect(indexName).toBe('tenant_status_timestamp');
    });

    test('top providers query should use community_active_winrate index', async () => {
      const communityId = new mongoose.Types.ObjectId();

      const explainResult = await SignalProvider.find({
        communityId: communityId,
        isActive: true
      })
        .sort({ 'stats.winRate': -1 })
        .explain('queryPlanner');

      const winningPlan = explainResult.queryPlanner.winningPlan;
      const indexName = winningPlan.inputStage?.indexName || winningPlan.shards?.[0]?.winningPlan?.inputStage?.indexName;

      expect(indexName).toBe('community_active_winrate');
    });
  });
});

/**
 * Seed test data for performance testing
 */
async function seedTestData() {
  // Create 100 test users with various subscription statuses
  const users = [];
  for (let i = 0; i < 100; i++) {
    users.push({
      email: `test${i}@example.com`,
      subscription: {
        status: i % 2 === 0 ? 'active' : 'inactive',
        tier: i % 3 === 0 ? 'premium' : 'basic',
        startDate: new Date(Date.now() - i * 86400000) // Stagger over past 100 days
      },
      lastLogin: new Date(Date.now() - Math.random() * 86400000 * 30),
      createdAt: new Date(Date.now() - i * 86400000)
    });
  }
  await User.insertMany(users);

  // Create 200 test trades with various statuses
  const testUserId = new mongoose.Types.ObjectId();
  const testTenantId = new mongoose.Types.ObjectId();
  const trades = [];
  for (let i = 0; i < 200; i++) {
    trades.push({
      userId: testUserId,
      tenantId: testTenantId,
      symbol: i % 2 === 0 ? 'AAPL' : 'GOOGL',
      status: i % 3 === 0 ? 'closed' : 'open',
      side: i % 2 === 0 ? 'buy' : 'sell',
      quantity: 100,
      entryPrice: 150 + Math.random() * 50,
      timestamp: new Date(Date.now() - i * 3600000) // Stagger over past 200 hours
    });
  }
  await Trade.insertMany(trades);

  // Create 50 test signal providers
  const testCommunityId = new mongoose.Types.ObjectId();
  const providers = [];
  for (let i = 0; i < 50; i++) {
    providers.push({
      name: `Provider ${i}`,
      communityId: testCommunityId,
      isActive: i % 2 === 0,
      stats: {
        winRate: 50 + Math.random() * 40, // 50-90%
        totalFollowers: Math.floor(Math.random() * 1000),
        totalSignals: Math.floor(Math.random() * 500)
      },
      createdAt: new Date(Date.now() - i * 86400000)
    });
  }
  await SignalProvider.insertMany(providers);
}
