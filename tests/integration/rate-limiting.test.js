/**
 * Integration Tests for Exchange API Rate Limiting
 *
 * Tests:
 * 1. Exchange-specific rate limiters (Coinbase Pro 8/sec, Kraken 12/sec)
 * 2. Rate limit tracking and window resets
 * 3. Per-user isolation
 * 4. Rate limit status reporting
 */

const { exchangeCallTracker } = require('../../src/middleware/rateLimiter');

describe('Exchange API Rate Limiting', () => {
  beforeEach(() => {
    // Clear rate limit tracking before each test
    if (exchangeCallTracker.clearAll) {
      exchangeCallTracker.clearAll();
    }
  });

  afterAll(() => {
    // Clean up setInterval to prevent Jest hanging
    if (exchangeCallTracker.destroy) {
      exchangeCallTracker.destroy();
    }
  });

  describe('Exchange-Specific Rate Limits', () => {
    test('should enforce Coinbase Pro rate limit (8 req/sec)', () => {
      const userId = 'test-user-123';
      const exchangeName = 'coinbasepro';

      // Make 8 requests (at the limit)
      for (let i = 0; i < 8; i++) {
        const result = exchangeCallTracker.checkLimit(userId, exchangeName);
        expect(result.allowed).toBe(true);
      }

      // 9th request should be blocked
      const result = exchangeCallTracker.checkLimit(userId, exchangeName);
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeDefined();
      expect(result.message).toContain('Rate limit exceeded');
    });

    test('should enforce Kraken rate limit (12 req/sec)', () => {
      const userId = 'test-user-456';
      const exchangeName = 'kraken';

      // Make 12 requests (at the limit)
      for (let i = 0; i < 12; i++) {
        const result = exchangeCallTracker.checkLimit(userId, exchangeName);
        expect(result.allowed).toBe(true);
      }

      // 13th request should be blocked
      const result = exchangeCallTracker.checkLimit(userId, exchangeName);
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeDefined();
    });

    test('should enforce Binance rate limit (10 req/sec)', () => {
      const userId = 'test-user-789';
      const exchangeName = 'binance';

      // Make 10 requests (at the limit)
      for (let i = 0; i < 10; i++) {
        const result = exchangeCallTracker.checkLimit(userId, exchangeName);
        expect(result.allowed).toBe(true);
      }

      // 11th request should be blocked
      const result = exchangeCallTracker.checkLimit(userId, exchangeName);
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeDefined();
    });

    test('should reset exchange-specific limits after window', async () => {
      const userId = 'test-user-reset';
      const exchangeName = 'coinbasepro';

      // Exhaust limit
      for (let i = 0; i < 8; i++) {
        exchangeCallTracker.checkLimit(userId, exchangeName);
      }

      // Should be blocked
      let result = exchangeCallTracker.checkLimit(userId, exchangeName);
      expect(result.allowed).toBe(false);

      // Wait for window to pass (1.1 seconds)
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should be allowed again
      result = exchangeCallTracker.checkLimit(userId, exchangeName);
      expect(result.allowed).toBe(true);
    }, 5000);

    test('should track different exchanges independently', () => {
      const userId = 'test-user-multi';

      // Exhaust Coinbase Pro limit
      for (let i = 0; i < 8; i++) {
        exchangeCallTracker.checkLimit(userId, 'coinbasepro');
      }

      // Coinbase Pro should be blocked
      const cbResult = exchangeCallTracker.checkLimit(userId, 'coinbasepro');
      expect(cbResult.allowed).toBe(false);

      // Kraken should still be allowed
      const krakenResult = exchangeCallTracker.checkLimit(userId, 'kraken');
      expect(krakenResult.allowed).toBe(true);
    });
  });

  describe('User Isolation', () => {
    test('should have independent rate limits for different users', () => {
      const user1 = 'test-user-1';
      const user2 = 'test-user-2';
      const exchangeName = 'coinbasepro';

      // User 1 exhausts their limit
      for (let i = 0; i < 8; i++) {
        exchangeCallTracker.checkLimit(user1, exchangeName);
      }

      // User 1 is rate limited
      const user1Result = exchangeCallTracker.checkLimit(user1, exchangeName);
      expect(user1Result.allowed).toBe(false);

      // User 2 should still be able to make requests
      const user2Result = exchangeCallTracker.checkLimit(user2, exchangeName);
      expect(user2Result.allowed).toBe(true);
    });

    test('should track multiple users independently', () => {
      const users = ['user-a', 'user-b', 'user-c'];
      const exchangeName = 'kraken';

      // Each user makes 5 requests
      users.forEach(userId => {
        for (let i = 0; i < 5; i++) {
          const result = exchangeCallTracker.checkLimit(userId, exchangeName);
          expect(result.allowed).toBe(true);
        }
      });

      // All users should still have capacity (limit is 12)
      users.forEach(userId => {
        const result = exchangeCallTracker.checkLimit(userId, exchangeName);
        expect(result.allowed).toBe(true);
      });
    });
  });

  describe('Rate Limit Information', () => {
    test('should return correct remaining count', () => {
      const userId = 'test-user-info';
      const exchangeName = 'coinbasepro';

      // Make 3 requests
      for (let i = 0; i < 3; i++) {
        exchangeCallTracker.checkLimit(userId, exchangeName);
      }

      // Check remaining count
      const result = exchangeCallTracker.checkLimit(userId, exchangeName);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4); // 8 max - 4 used = 4 remaining
    });

    test('should calculate retry-after time when rate limited', () => {
      const userId = 'test-user-retry';
      const exchangeName = 'binance';

      // Exhaust limit (10 req/sec)
      for (let i = 0; i < 10; i++) {
        exchangeCallTracker.checkLimit(userId, exchangeName);
      }

      // Next request should be blocked with retry-after
      const result = exchangeCallTracker.checkLimit(userId, exchangeName);
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeDefined();
      expect(result.retryAfter).toBeGreaterThan(0);
      expect(result.retryAfter).toBeLessThanOrEqual(1); // Window is 1 second
    });

    test('should provide limit and current count via getUsage', () => {
      const userId = 'test-user-counts';
      const exchangeName = 'kraken';

      // Make some requests
      for (let i = 0; i < 5; i++) {
        exchangeCallTracker.checkLimit(userId, exchangeName);
      }

      // getUsage() provides detailed info (not checkLimit)
      const usage = exchangeCallTracker.getUsage(userId, exchangeName);
      expect(usage).toHaveProperty('limit');
      expect(usage).toHaveProperty('current');
      expect(usage).toHaveProperty('remaining');
      expect(usage.limit).toBe(12); // Kraken limit
      expect(usage.current).toBe(5); // 5 requests made
      expect(usage.remaining).toBe(7); // 12 - 5 = 7
    });
  });

  describe('Edge Cases', () => {
    test('should handle concurrent requests from same user', () => {
      const userId = 'test-user-concurrent';
      const exchangeName = 'coinbasepro';

      // Simulate rapid-fire requests
      const results = [];
      for (let i = 0; i < 10; i++) {
        results.push(exchangeCallTracker.checkLimit(userId, exchangeName));
      }

      // First 8 should be allowed
      expect(results.slice(0, 8).every(r => r.allowed)).toBe(true);

      // Next 2 should be blocked
      expect(results.slice(8).every(r => !r.allowed)).toBe(true);
    });

    test('should handle missing or invalid exchange names', () => {
      const userId = 'test-user-invalid';

      // Invalid exchange should use default rate limit or handle gracefully
      const result = exchangeCallTracker.checkLimit(userId, 'nonexistent-exchange');

      // Should either use default limit or return error
      expect(result).toHaveProperty('allowed');
      expect(typeof result.allowed).toBe('boolean');
    });

    test('should handle empty or null user IDs gracefully', () => {
      const exchangeName = 'coinbasepro';

      // Should handle empty user ID
      const result1 = exchangeCallTracker.checkLimit('', exchangeName);
      expect(result1).toHaveProperty('allowed');

      // Should handle null user ID
      const result2 = exchangeCallTracker.checkLimit(null, exchangeName);
      expect(result2).toHaveProperty('allowed');
    });
  });
});
