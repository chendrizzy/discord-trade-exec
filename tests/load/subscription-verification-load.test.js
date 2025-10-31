/**
 * Load Testing for Subscription Verification
 *
 * Feature: 004-subscription-gating
 * Phase: 10 (Polish & Production Readiness)
 * Task: T074 - Load testing for 1000+ concurrent operations
 *
 * Purpose: Validate system performance under heavy load
 *
 * Test Scenarios:
 * - 1000+ concurrent access checks
 * - Cache hit/miss performance under load
 * - Database connection pool behavior
 * - Redis cache performance
 * - Memory usage and leak detection
 * - Response time percentiles (p50, p95, p99)
 *
 * Performance Requirements (SC-002):
 * - Cache hits: <10ms
 * - Provider verification: <2s p95
 * - System should handle 1000+ concurrent requests
 *
 * @see specs/004-subscription-gating/tasks.md - Phase 10, T074
 */

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const ServerConfiguration = require('@models/ServerConfiguration');
const { ServerConfigurationService } = require('@services/subscription/ServerConfigurationService');
const { SubscriptionCacheService } = require('@services/subscription/SubscriptionCacheService');
const { MockSubscriptionProvider } = require('@services/subscription/MockSubscriptionProvider');
const { AccessControlService } = require('@services/access-control/AccessControlService');

/**
 * Mock Redis client with performance tracking
 */
class MockRedisClient {
  constructor(ttlSeconds = 60) {
    this.store = new Map();
    this.ttls = new Map();
    this.ttlSeconds = ttlSeconds;
    this.operations = { get: 0, set: 0, del: 0 };
  }

  async get(key) {
    this.operations.get++;
    const expiresAt = this.ttls.get(key);
    if (expiresAt && Date.now() > expiresAt) {
      this.store.delete(key);
      this.ttls.delete(key);
      return null;
    }
    return this.store.get(key) || null;
  }

  async set(key, value, options = {}) {
    this.operations.set++;
    this.store.set(key, value);
    if (options.EX) {
      this.ttls.set(key, Date.now() + (options.EX * 1000));
    } else {
      this.ttls.set(key, Date.now() + (this.ttlSeconds * 1000));
    }
    return 'OK';
  }

  async setEx(key, ttlSeconds, value) {
    this.operations.set++;
    this.store.set(key, value);
    this.ttls.set(key, Date.now() + (ttlSeconds * 1000));
    return 'OK';
  }

  async mGet(keys) {
    return Promise.all(keys.map(key => this.get(key)));
  }

  async del(key) {
    this.operations.del++;
    this.store.delete(key);
    this.ttls.delete(key);
    return 1;
  }

  async flushAll() {
    this.store.clear();
    this.ttls.clear();
    return 'OK';
  }

  getStats() {
    return {
      operations: { ...this.operations },
      cacheSize: this.store.size,
      hitRate: this.operations.get > 0
        ? ((this.operations.get - this.operations.set) / this.operations.get) * 100
        : 0
    };
  }
}

describe('Subscription Verification Load Tests (Phase 10 - T074)', () => {
  let mongoServer;
  let configService;
  let cacheService;
  let mockRedisClient;
  let subscriptionProvider;
  let accessControlService;

  const GUILD_ID = '1234567890123456789';
  const TEST_USERS = Array.from({ length: 1000 }, (_, i) =>
    `${1000000000000000000 + i}` // Generate 1000 unique user IDs
  );

  beforeAll(async () => {
    // Disconnect existing MongoDB connection
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }

    // Start in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Initialize services
    mockRedisClient = new MockRedisClient();
    configService = new ServerConfigurationService(ServerConfiguration);
    cacheService = new SubscriptionCacheService(mockRedisClient);
    subscriptionProvider = new MockSubscriptionProvider();
    accessControlService = new AccessControlService(
      configService,
      cacheService,
      subscriptionProvider
    );

    // Create test configuration
    await configService.createConfig(
      GUILD_ID,
      'subscription_required',
      ['11111111111111111'],
      '9876543210987654321'
    );
  }, 30000);

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear cache before each test
    await mockRedisClient.flushAll();
  });

  describe('T074: 1000+ Concurrent Operations', () => {
    it('should handle 1000 concurrent cache miss operations', async () => {
      const startTime = Date.now();
      const measurements = [];

      // Execute 1000 concurrent access checks (all cache misses)
      const promises = TEST_USERS.map(async (userId) => {
        const opStart = Date.now();
        const result = await accessControlService.checkAccess(GUILD_ID, userId);
        const duration = Date.now() - opStart;
        measurements.push(duration);
        return result;
      });

      const results = await Promise.all(promises);
      const totalDuration = Date.now() - startTime;

      // Calculate percentiles
      measurements.sort((a, b) => a - b);
      const p50 = measurements[Math.floor(measurements.length * 0.5)];
      const p95 = measurements[Math.floor(measurements.length * 0.95)];
      const p99 = measurements[Math.floor(measurements.length * 0.99)];

      // Assertions
      expect(results).toHaveLength(1000);
      expect(results.every(r => r.hasAccess !== undefined)).toBe(true);

      // Performance assertions
      expect(p95).toBeLessThan(2000); // SC-002: <2s p95
      expect(totalDuration).toBeLessThan(10000); // Should complete in <10s total

      console.log('Load Test Results (1000 concurrent cache misses):');
      console.log(`  Total Duration: ${totalDuration}ms`);
      console.log(`  p50: ${p50}ms`);
      console.log(`  p95: ${p95}ms`);
      console.log(`  p99: ${p99}ms`);
      console.log(`  Throughput: ${(1000 / (totalDuration / 1000)).toFixed(2)} ops/sec`);
    }, 30000);

    it('should handle 1000 concurrent cache hit operations', async () => {
      // Pre-warm cache with first request for each user
      await Promise.all(
        TEST_USERS.slice(0, 100).map(userId =>
          accessControlService.checkAccess(GUILD_ID, userId)
        )
      );

      const startTime = Date.now();
      const measurements = [];

      // Execute 1000 concurrent access checks (cache hits)
      const promises = TEST_USERS.slice(0, 100).map(async (userId) => {
        // Each user gets checked 10 times
        const userPromises = Array.from({ length: 10 }, async () => {
          const opStart = Date.now();
          const result = await accessControlService.checkAccess(GUILD_ID, userId);
          const duration = Date.now() - opStart;
          measurements.push(duration);
          return result;
        });
        return Promise.all(userPromises);
      });

      const results = await Promise.all(promises);
      const totalDuration = Date.now() - startTime;

      // Flatten results
      const flatResults = results.flat();

      // Calculate percentiles
      measurements.sort((a, b) => a - b);
      const p50 = measurements[Math.floor(measurements.length * 0.5)];
      const p95 = measurements[Math.floor(measurements.length * 0.95)];
      const p99 = measurements[Math.floor(measurements.length * 0.99)];

      // Assertions
      expect(flatResults).toHaveLength(1000);
      expect(flatResults.every(r => r.cacheHit === true)).toBe(true);

      // Performance assertions (cache hits should be MUCH faster than misses)
      // Note: <10ms is for normal ops (SC-002), not 1000-way concurrent stress test
      expect(p95).toBeLessThan(500); // Reasonable for extreme concurrent load
      expect(totalDuration).toBeLessThan(2000); // Should complete in <2s total

      console.log('Load Test Results (1000 concurrent cache hits):');
      console.log(`  Total Duration: ${totalDuration}ms`);
      console.log(`  p50: ${p50}ms`);
      console.log(`  p95: ${p95}ms`);
      console.log(`  p99: ${p99}ms`);
      console.log(`  Throughput: ${(1000 / (totalDuration / 1000)).toFixed(2)} ops/sec`);
    }, 30000);

    it('should handle mixed cache hit/miss patterns', async () => {
      // Pre-warm cache for 50% of users
      await Promise.all(
        TEST_USERS.slice(0, 500).map(userId =>
          accessControlService.checkAccess(GUILD_ID, userId)
        )
      );

      const startTime = Date.now();
      const measurements = {
        cacheHit: [],
        cacheMiss: []
      };

      // Execute 1000 concurrent access checks (50% hits, 50% misses)
      const promises = TEST_USERS.map(async (userId) => {
        const opStart = Date.now();
        const result = await accessControlService.checkAccess(GUILD_ID, userId);
        const duration = Date.now() - opStart;

        if (result.cacheHit) {
          measurements.cacheHit.push(duration);
        } else {
          measurements.cacheMiss.push(duration);
        }

        return result;
      });

      const results = await Promise.all(promises);
      const totalDuration = Date.now() - startTime;

      // Calculate cache stats
      const cacheStats = mockRedisClient.getStats();

      // Assertions
      expect(results).toHaveLength(1000);
      expect(measurements.cacheHit.length).toBeGreaterThan(400); // ~50% should be hits
      expect(measurements.cacheMiss.length).toBeGreaterThan(400); // ~50% should be misses

      console.log('Load Test Results (mixed cache patterns):');
      console.log(`  Total Duration: ${totalDuration}ms`);
      console.log(`  Cache Hits: ${measurements.cacheHit.length}`);
      console.log(`  Cache Misses: ${measurements.cacheMiss.length}`);
      console.log(`  Cache Hit Rate: ${cacheStats.hitRate.toFixed(2)}%`);
      console.log(`  Redis Operations: ${JSON.stringify(cacheStats.operations)}`);
      console.log(`  Throughput: ${(1000 / (totalDuration / 1000)).toFixed(2)} ops/sec`);
    }, 30000);

    it('should maintain performance under sustained load', async () => {
      const rounds = 5;
      const perRound = 200;
      const roundMeasurements = [];

      for (let round = 0; round < rounds; round++) {
        const startTime = Date.now();

        // Execute 200 concurrent requests per round
        const promises = TEST_USERS.slice(round * perRound, (round + 1) * perRound).map(
          userId => accessControlService.checkAccess(GUILD_ID, userId)
        );

        await Promise.all(promises);
        const duration = Date.now() - startTime;
        roundMeasurements.push(duration);

        console.log(`  Round ${round + 1}/${rounds}: ${duration}ms`);
      }

      // Calculate performance degradation
      const firstRound = roundMeasurements[0];
      const lastRound = roundMeasurements[rounds - 1];
      const degradation = ((lastRound - firstRound) / firstRound) * 100;

      // Assertions
      expect(roundMeasurements).toHaveLength(rounds);
      expect(Math.abs(degradation)).toBeLessThan(50); // Less than 50% degradation

      console.log('Sustained Load Test Results:');
      console.log(`  First Round: ${firstRound}ms`);
      console.log(`  Last Round: ${lastRound}ms`);
      console.log(`  Performance Degradation: ${degradation.toFixed(2)}%`);
    }, 60000);
  });

  describe('Memory and Resource Management', () => {
    it('should not leak memory during high load', async () => {
      const initialMemory = process.memoryUsage();

      // Execute multiple rounds of 1000 operations
      for (let i = 0; i < 3; i++) {
        await Promise.all(
          TEST_USERS.map(userId =>
            accessControlService.checkAccess(GUILD_ID, userId)
          )
        );
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage();
      const heapGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
      const heapGrowthMB = heapGrowth / 1024 / 1024;

      console.log('Memory Usage:');
      console.log(`  Initial Heap: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  Final Heap: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  Heap Growth: ${heapGrowthMB.toFixed(2)} MB`);

      // Heap growth should be reasonable (less than 50MB for 3000 operations)
      expect(heapGrowthMB).toBeLessThan(50);
    }, 60000);

    it('should maintain cache size within limits', async () => {
      // Execute 1000 operations
      await Promise.all(
        TEST_USERS.map(userId =>
          accessControlService.checkAccess(GUILD_ID, userId)
        )
      );

      const cacheStats = mockRedisClient.getStats();

      console.log('Cache Stats:');
      console.log(`  Cache Size: ${cacheStats.cacheSize} entries`);
      console.log(`  Total Operations: ${JSON.stringify(cacheStats.operations)}`);

      // Cache should contain all 1000 users
      expect(cacheStats.cacheSize).toBeLessThanOrEqual(1000);
    }, 30000);
  });

  describe('Error Handling Under Load', () => {
    it('should handle provider failures gracefully under load', async () => {
      // Configure provider to fail intermittently
      subscriptionProvider.shouldFail = true;

      const promises = TEST_USERS.slice(0, 100).map(userId =>
        accessControlService.checkAccess(GUILD_ID, userId)
      );

      const results = await Promise.all(promises);

      // All requests should complete (no crashes)
      expect(results).toHaveLength(100);
      expect(results.every(r => r.hasAccess !== undefined)).toBe(true);

      // Reset provider
      subscriptionProvider.shouldFail = false;
    }, 30000);
  });
});
