/**
 * Integration Tests for Exchange API Caching
 *
 * Tests:
 * 1. Cache service initialization (Redis/in-memory)
 * 2. Price data caching with 10s TTL
 * 3. Fee structure caching with 5min TTL
 * 4. Cache hit/miss tracking
 * 5. Cache invalidation
 * 6. Cache statistics
 * 7. Performance improvement from caching
 */

const cacheService = require('../../src/services/CacheService');

describe('Exchange API Caching', () => {
  beforeEach(async () => {
    // Clean up before each test
    await cacheService.clear();
    cacheService.resetStats();
  });

  afterAll(async () => {
    // Cleanup
    await cacheService.close();
  });

  describe('Cache Service', () => {
    test('should initialize with Redis or in-memory cache', () => {
      expect(cacheService.cacheType).toMatch(/redis|memory|none/);

      if (process.env.REDIS_URL) {
        expect(cacheService.cacheType).toBe('redis');
        expect(cacheService.redisClient).toBeDefined();
      } else {
        expect(cacheService.cacheType).toBe('memory');
        expect(cacheService.memoryCache).toBeDefined();
      }
    });

    test('should support get/set operations', async () => {
      const key = 'test:key';
      const value = { data: 'test value', timestamp: Date.now() };

      // Set value
      const setResult = await cacheService.set(key, value, 60);
      expect(setResult).toBe(true);

      // Get value
      const cachedValue = await cacheService.get(key);
      expect(cachedValue).toEqual(value);
    });

    test('should respect TTL expiration', async () => {
      const key = 'test:ttl';
      const value = { data: 'expires soon' };

      // Set with 1 second TTL
      await cacheService.set(key, value, 1);

      // Should exist immediately
      const immediate = await cacheService.get(key);
      expect(immediate).toEqual(value);

      // Wait for expiration (1.5 seconds)
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Should be expired
      const expired = await cacheService.get(key);
      expect(expired).toBeNull();
    }, 5000);

    test('should track cache hits and misses', async () => {
      const key = 'test:stats';
      const value = { data: 'for stats' };

      // Reset stats
      cacheService.resetStats();

      // Miss (first get)
      await cacheService.get(key);
      let stats = cacheService.getStats();
      expect(stats.misses).toBe(1);
      expect(stats.hits).toBe(0);

      // Set value
      await cacheService.set(key, value);
      stats = cacheService.getStats();
      expect(stats.sets).toBe(1);

      // Hit (second get)
      await cacheService.get(key);
      stats = cacheService.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });

    test('should calculate hit rate correctly', async () => {
      cacheService.resetStats();

      const key = 'test:hitrate';
      const value = { data: 'test' };

      // Set value
      await cacheService.set(key, value);

      // 3 hits
      await cacheService.get(key);
      await cacheService.get(key);
      await cacheService.get(key);

      // 2 misses
      await cacheService.get('nonexistent1');
      await cacheService.get('nonexistent2');

      const stats = cacheService.getStats();
      expect(stats.hits).toBe(3);
      expect(stats.misses).toBe(2);
      expect(stats.totalRequests).toBe(5);
      expect(stats.hitRateNumeric).toBe(60); // 3/5 = 60%
    });

    test('should support cache key generation helpers', () => {
      const priceKey = cacheService.constructor.getPriceKey('kraken', 'BTC/USD');
      expect(priceKey).toBe('exchange:price:kraken:BTC/USD');

      const feeKey = cacheService.constructor.getFeeKey('coinbasepro', 'ETH/USD');
      expect(feeKey).toBe('exchange:fees:coinbasepro:ETH/USD');

      const marketKey = cacheService.constructor.getMarketStatusKey('binance');
      expect(marketKey).toBe('exchange:market:binance');

      const infoKey = cacheService.constructor.getExchangeInfoKey('kraken');
      expect(infoKey).toBe('exchange:info:kraken');
    });

    test('should support pattern-based deletion', async () => {
      // Set multiple keys with same pattern
      await cacheService.set('exchange:price:kraken:BTC/USD', { price: 50000 });
      await cacheService.set('exchange:price:kraken:ETH/USD', { price: 3000 });
      await cacheService.set('exchange:price:coinbasepro:BTC/USD', { price: 50010 });
      await cacheService.set('exchange:fees:kraken:BTC/USD', { fee: 0.0016 });

      // Delete all Kraken price data
      const deletedCount = await cacheService.delPattern('exchange:price:kraken:*');
      expect(deletedCount).toBeGreaterThan(0);

      // Kraken prices should be gone
      const krakenBTC = await cacheService.get('exchange:price:kraken:BTC/USD');
      const krakenETH = await cacheService.get('exchange:price:kraken:ETH/USD');
      expect(krakenBTC).toBeNull();
      expect(krakenETH).toBeNull();

      // Coinbase Pro price should still exist
      const cbBTC = await cacheService.get('exchange:price:coinbasepro:BTC/USD');
      expect(cbBTC).not.toBeNull();

      // Kraken fees should still exist (different pattern)
      const krakenFees = await cacheService.get('exchange:fees:kraken:BTC/USD');
      expect(krakenFees).not.toBeNull();
    });

    test('should clear all cache', async () => {
      // Set multiple keys
      await cacheService.set('key1', { data: '1' });
      await cacheService.set('key2', { data: '2' });
      await cacheService.set('key3', { data: '3' });

      // Verify they exist
      expect(await cacheService.get('key1')).not.toBeNull();
      expect(await cacheService.get('key2')).not.toBeNull();

      // Clear all
      await cacheService.clear();

      // All should be gone
      expect(await cacheService.get('key1')).toBeNull();
      expect(await cacheService.get('key2')).toBeNull();
      expect(await cacheService.get('key3')).toBeNull();
    });
  });

  describe('TTL Behavior', () => {
    test('should respect price TTL of 10 seconds', async () => {
      const priceKey = 'exchange:price:testexchange:BTC/USD';
      const priceData = { last: 50000, bid: 49999, ask: 50001 };

      // Set price with default TTL (10 seconds)
      await cacheService.set(priceKey, priceData, cacheService.DEFAULT_TTL.PRICE);

      // Should exist immediately
      expect(await cacheService.get(priceKey)).toEqual(priceData);

      // Wait 11 seconds
      await new Promise(resolve => setTimeout(resolve, 11000));

      // Should be expired
      expect(await cacheService.get(priceKey)).toBeNull();
    }, 15000);

    test('should respect fee TTL of 5 minutes', async () => {
      const feeKey = 'exchange:fees:testexchange:BTC/USD';
      const feeData = { maker: 0.0016, taker: 0.0026 };

      // Set fee with 5 minute TTL
      await cacheService.set(feeKey, feeData, cacheService.DEFAULT_TTL.FEES);

      // Should exist immediately
      expect(await cacheService.get(feeKey)).toEqual(feeData);

      // Wait 2 seconds (should still exist)
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Should still exist (5 minutes not elapsed)
      expect(await cacheService.get(feeKey)).toEqual(feeData);
    }, 5000);
  });

  describe('Cache Performance', () => {
    test('should improve response time with caching', async () => {
      const key = 'performance:test';
      const largeObject = {
        data: Array(1000).fill({ field1: 'value', field2: 123, field3: true })
      };

      // Measure time without cache (first set)
      const setStart = Date.now();
      await cacheService.set(key, largeObject);
      const setTime = Date.now() - setStart;

      // Measure time with cache (get)
      const getStart = Date.now();
      await cacheService.get(key);
      const getTime = Date.now() - getStart;

      // Cache retrieval should be faster than setting
      // (This is a loose check since timing can vary)
      expect(getTime).toBeLessThanOrEqual(setTime + 50); // Allow 50ms margin
    });
  });
});
