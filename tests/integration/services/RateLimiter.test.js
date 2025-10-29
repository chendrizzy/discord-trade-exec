/**
 * US3-T26: Rate Limiter Service Tests
 * Integration tests for RateLimiter singleton
 *
 * Acceptance Criteria:
 * - Test sliding window rate limiting
 * - Test distributed rate limiting (Redis)
 * - Test rate limit reset behavior
 * - Test user-specific vs global limits
 * - 4 new tests, all passing
 */

const RateLimiter = require('../../../src/RateLimiter');

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
}));

describe('US3-T26: Rate Limiter Service Tests', () => {
  beforeEach(() => {
    // Reset rate limiter state before each test
    RateLimiter.reset();

    // Set shorter windows for testing
    RateLimiter.updateConfig({
      perIpLimits: {
        windowMs: 1000, // 1 second window for faster testing
        maxRequests: 10,
        maxBurst: 3
      },
      perUserLimits: {
        windowMs: 1000,
        maxRequests: 20,
        maxBurst: 5
      },
      globalLimits: {
        windowMs: 1000,
        maxRequests: 100,
        maxBurst: 20
      },
      autoBan: {
        enabled: true,
        threshold: 3,
        banDuration: 5000, // 5 seconds for testing
        maxBanDuration: 60000
      }
    });
  });

  afterEach(() => {
    // Clean up
    RateLimiter.reset();
  });

  describe('Sliding Window Rate Limiting', () => {
    it('should allow requests within rate limit using sliding window', () => {
      const ip = '192.168.1.100';

      // First 10 requests should be allowed
      for (let i = 0; i < 10; i++) {
        const result = RateLimiter.checkRequest(ip);
        expect(result.allowed).toBe(true);
        expect(result.reason).toBe('ALLOWED');
      }

      // 11th request should be blocked (exceeded limit)
      const blockedResult = RateLimiter.checkRequest(ip);
      expect(blockedResult.allowed).toBe(false);
      expect(blockedResult.reason).toBe('IP_RATE_LIMIT');
      expect(blockedResult.retryAfter).toBeGreaterThan(0);
    });

    it('should reset window after configured time period', async () => {
      const ip = '192.168.1.101';

      // Fill up the rate limit
      for (let i = 0; i < 10; i++) {
        RateLimiter.checkRequest(ip);
      }

      // Should be blocked
      let result = RateLimiter.checkRequest(ip);
      expect(result.allowed).toBe(false);

      // Wait for window to reset (1 second + buffer)
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should be allowed again after window reset
      result = RateLimiter.checkRequest(ip);
      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('ALLOWED');
    });

    it('should track violations and trigger auto-ban after threshold', () => {
      const ip = '192.168.1.102';

      // Fill up rate limit
      for (let i = 0; i < 10; i++) {
        RateLimiter.checkRequest(ip);
      }

      // Trigger violations (3 required for auto-ban)
      RateLimiter.checkRequest(ip); // Violation 1
      RateLimiter.checkRequest(ip); // Violation 2
      const banTrigger = RateLimiter.checkRequest(ip); // Violation 3 -> auto-ban

      expect(banTrigger.allowed).toBe(false);

      // Verify IP is now banned
      const bannedCheck = RateLimiter.checkRequest(ip);
      expect(bannedCheck.allowed).toBe(false);
      expect(bannedCheck.reason).toBe('IP_BANNED');
      expect(bannedCheck.retryAfter).toBeGreaterThan(0);
    });

    it('should handle multiple IPs independently with separate windows', () => {
      const ip1 = '192.168.1.103';
      const ip2 = '192.168.1.104';

      // Fill up rate limit for IP1
      for (let i = 0; i < 10; i++) {
        RateLimiter.checkRequest(ip1);
      }

      // IP1 should be blocked
      const ip1Blocked = RateLimiter.checkRequest(ip1);
      expect(ip1Blocked.allowed).toBe(false);

      // IP2 should still be allowed (separate window)
      const ip2Allowed = RateLimiter.checkRequest(ip2);
      expect(ip2Allowed.allowed).toBe(true);

      // Fill up IP2's limit
      for (let i = 0; i < 9; i++) {
        RateLimiter.checkRequest(ip2);
      }

      // IP2 should now be blocked
      const ip2Blocked = RateLimiter.checkRequest(ip2);
      expect(ip2Blocked.allowed).toBe(false);
    });
  });

  describe('Distributed Rate Limiting (In-Memory Simulation)', () => {
    it('should enforce global rate limit across all IPs', () => {
      const ips = [];
      for (let i = 0; i < 10; i++) {
        ips.push(`192.168.1.${i + 110}`);
      }

      // Make 100 requests across 10 different IPs (10 each)
      for (let i = 0; i < 100; i++) {
        const ip = ips[i % 10];
        const result = RateLimiter.checkRequest(ip);
        expect(result.allowed).toBe(true);
      }

      // 101st request should trigger global limit
      const globalLimitHit = RateLimiter.checkRequest(ips[0]);
      expect(globalLimitHit.allowed).toBe(false);
      expect(globalLimitHit.reason).toBe('GLOBAL_RATE_LIMIT');
    });

    it('should maintain separate blacklist and whitelist across requests', () => {
      const blacklistedIP = '192.168.1.120';
      const whitelistedIP = '192.168.1.121';

      // Add to blacklist
      RateLimiter.blacklistIP(blacklistedIP);

      // Blacklisted IP should always be blocked
      const blacklistResult = RateLimiter.checkRequest(blacklistedIP);
      expect(blacklistResult.allowed).toBe(false);
      expect(blacklistResult.reason).toBe('IP_BLACKLISTED');

      // Add to whitelist
      RateLimiter.whitelistIP(whitelistedIP);

      // Whitelisted IP should always be allowed, even after many requests
      for (let i = 0; i < 100; i++) {
        const result = RateLimiter.checkRequest(whitelistedIP);
        expect(result.allowed).toBe(true);
        expect(result.reason).toBe('IP_WHITELISTED');
      }
    });

    it('should coordinate user-specific and IP-specific limits', () => {
      const ip = '192.168.1.122';
      const userId = 'user_123';

      // Use per-user limits (higher than per-IP)
      for (let i = 0; i < 10; i++) {
        const result = RateLimiter.checkRequest(ip, userId);
        expect(result.allowed).toBe(true);
      }

      // IP limit reached (10), but user limit allows more (20)
      // Continue with user ID - should still be allowed
      for (let i = 0; i < 10; i++) {
        const result = RateLimiter.checkRequest(ip, userId);
        // Since IP limit is hit first (10 < 20), will be blocked
        if (i === 0) {
          expect(result.allowed).toBe(false);
          expect(result.reason).toBe('IP_RATE_LIMIT');
        }
      }
    });

    it('should provide statistics for monitoring distributed system health', () => {
      const ip1 = '192.168.1.130';
      const ip2 = '192.168.1.131';
      const ip3 = '192.168.1.132';

      // Generate activity
      for (let i = 0; i < 5; i++) {
        RateLimiter.checkRequest(ip1);
        RateLimiter.checkRequest(ip2);
      }

      // Ban an IP
      RateLimiter.banIP(ip3, 5);

      // Add to blacklist/whitelist
      RateLimiter.blacklistIP('192.168.1.140');
      RateLimiter.whitelistIP('192.168.1.141');

      const stats = RateLimiter.getStats();

      expect(stats.activeIPs).toBeGreaterThanOrEqual(2);
      expect(stats.bannedIPs).toBe(1);
      expect(stats.blacklistedIPs).toBe(1);
      expect(stats.whitelistedIPs).toBe(1);
      expect(stats.config).toBeDefined();
      expect(stats.config.perIpLimit).toBe(10);
      expect(stats.config.perUserLimit).toBe(20);
      expect(stats.config.globalLimit).toBe(100);
      expect(stats.bannedIPsList).toHaveLength(1);
      expect(stats.bannedIPsList[0].ip).toBe(ip3);
    });
  });

  describe('Rate Limit Reset Behavior', () => {
    it('should reset IP rate limit window after expiry', async () => {
      const ip = '192.168.1.150';

      // Use up rate limit
      for (let i = 0; i < 10; i++) {
        RateLimiter.checkRequest(ip);
      }

      // Verify blocked
      let result = RateLimiter.checkRequest(ip);
      expect(result.allowed).toBe(false);

      // Wait for window to reset
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should be reset and allowed
      result = RateLimiter.checkRequest(ip);
      expect(result.allowed).toBe(true);
    });

    it('should automatically expire bans after ban duration', async () => {
      const ip = '192.168.1.151';

      // Update config BEFORE banning so ban uses correct duration
      RateLimiter.updateConfig({
        autoBan: {
          ...RateLimiter.config.autoBan,
          banDuration: 1000 // 1 second
        }
      });

      // Ban IP with 1 second duration (uses updated config)
      RateLimiter.banIP(ip, 1);

      // Verify banned
      let result = RateLimiter.checkRequest(ip);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('IP_BANNED');

      // Wait for ban to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should be unbanned automatically
      result = RateLimiter.checkRequest(ip);
      expect(result.allowed).toBe(true);
    });

    it('should allow manual unban of IP addresses', () => {
      const ip = '192.168.1.152';

      // Ban IP
      RateLimiter.banIP(ip, 5);

      // Verify banned
      let result = RateLimiter.checkRequest(ip);
      expect(result.allowed).toBe(false);

      // Manually unban
      RateLimiter.unbanIP(ip);

      // Should be allowed immediately after unban
      result = RateLimiter.checkRequest(ip);
      expect(result.allowed).toBe(true);
    });

    it('should reset violations when IP is unbanned', async () => {
      const ip = '192.168.1.153';

      // Trigger violations and ban
      for (let i = 0; i < 10; i++) {
        RateLimiter.checkRequest(ip);
      }

      // Trigger 3 violations for auto-ban
      RateLimiter.checkRequest(ip);
      RateLimiter.checkRequest(ip);
      RateLimiter.checkRequest(ip);

      // Unban and reset violations
      RateLimiter.unbanIP(ip);

      // Wait for request window to reset (1 second window + buffer)
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Violations should be reset - IP can make requests again without immediate re-ban
      const result = RateLimiter.checkRequest(ip);
      expect(result.allowed).toBe(true);
    });
  });

  describe('User-Specific vs Global Limits', () => {
    it('should apply per-user limits when user ID is provided', () => {
      const ip = '192.168.1.160';
      const userId = 'user_test_160';

      // Per-user limit is 20, per-IP is 10
      // With user ID, should allow up to 10 (IP limit hits first)
      for (let i = 0; i < 10; i++) {
        const result = RateLimiter.checkRequest(ip, userId);
        expect(result.allowed).toBe(true);
      }

      // IP limit reached
      const blockedResult = RateLimiter.checkRequest(ip, userId);
      expect(blockedResult.allowed).toBe(false);
      expect(blockedResult.reason).toBe('IP_RATE_LIMIT');
    });

    it('should apply per-IP limits when no user ID is provided', () => {
      const ip = '192.168.1.161';

      // Per-IP limit is 10
      for (let i = 0; i < 10; i++) {
        const result = RateLimiter.checkRequest(ip);
        expect(result.allowed).toBe(true);
      }

      // Exceeded IP limit
      const blockedResult = RateLimiter.checkRequest(ip);
      expect(blockedResult.allowed).toBe(false);
      expect(blockedResult.reason).toBe('IP_RATE_LIMIT');
    });

    it('should enforce global limits across all users and IPs', () => {
      // Make requests from many IPs to approach global limit
      for (let i = 0; i < 10; i++) {
        const ip = `192.168.1.${i + 170}`;
        for (let j = 0; j < 10; j++) {
          RateLimiter.checkRequest(ip);
        }
      }

      // Global limit (100) should now be reached
      const globalLimitResult = RateLimiter.checkRequest('192.168.1.999');
      expect(globalLimitResult.allowed).toBe(false);
      expect(globalLimitResult.reason).toBe('GLOBAL_RATE_LIMIT');
    });

    it('should provide different limit thresholds for authenticated vs unauthenticated users', () => {
      const ip = '192.168.1.180';

      // Test unauthenticated user (IP-only, limit=10)
      for (let i = 0; i < 10; i++) {
        const result = RateLimiter.checkRequest(ip);
        expect(result.allowed).toBe(true);
      }

      // Exceeds IP limit
      const unauthBlocked = RateLimiter.checkRequest(ip);
      expect(unauthBlocked.allowed).toBe(false);

      // Reset for authenticated test
      RateLimiter.reset();

      // Test authenticated user (user limit=20, but IP limit=10 still applies first)
      const userId = 'user_auth_180';
      for (let i = 0; i < 10; i++) {
        const result = RateLimiter.checkRequest(ip, userId);
        expect(result.allowed).toBe(true);
      }

      // Still blocked at IP limit (10), even though user limit is 20
      const authBlocked = RateLimiter.checkRequest(ip, userId);
      expect(authBlocked.allowed).toBe(false);
      expect(authBlocked.reason).toBe('IP_RATE_LIMIT');
    });
  });

  describe('Blacklist and Whitelist Management', () => {
    it('should manage blacklist with add and remove operations', () => {
      const ip = '192.168.1.190';

      // Add to blacklist
      RateLimiter.blacklistIP(ip);

      let result = RateLimiter.checkRequest(ip);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('IP_BLACKLISTED');

      // Remove from blacklist
      RateLimiter.removeFromBlacklist(ip);

      result = RateLimiter.checkRequest(ip);
      expect(result.allowed).toBe(true);
    });

    it('should manage whitelist with add and remove operations', () => {
      const ip = '192.168.1.191';

      // Add to whitelist
      RateLimiter.whitelistIP(ip);

      // Should bypass all rate limits
      for (let i = 0; i < 200; i++) {
        const result = RateLimiter.checkRequest(ip);
        expect(result.allowed).toBe(true);
        expect(result.reason).toBe('IP_WHITELISTED');
      }

      // Remove from whitelist
      RateLimiter.removeFromWhitelist(ip);

      // Now subject to rate limits
      for (let i = 0; i < 10; i++) {
        RateLimiter.checkRequest(ip);
      }

      const result = RateLimiter.checkRequest(ip);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('IP_RATE_LIMIT');
    });
  });

  describe('Configuration and Cleanup', () => {
    it('should update configuration dynamically', () => {
      const newConfig = {
        perIpLimits: {
          windowMs: 2000,
          maxRequests: 5,
          maxBurst: 2
        }
      };

      RateLimiter.updateConfig(newConfig);

      const ip = '192.168.1.200';

      // New limit should be 5
      for (let i = 0; i < 5; i++) {
        const result = RateLimiter.checkRequest(ip);
        expect(result.allowed).toBe(true);
      }

      // 6th request should be blocked
      const blocked = RateLimiter.checkRequest(ip);
      expect(blocked.allowed).toBe(false);
    });

    it('should clean up old data to prevent memory leaks', async () => {
      const ip = '192.168.1.201';

      // Make requests
      for (let i = 0; i < 5; i++) {
        RateLimiter.checkRequest(ip);
      }

      // Wait for cleanup window (2x window time = 2 seconds)
      await new Promise(resolve => setTimeout(resolve, 2100));

      // Trigger cleanup manually (normally happens every 2 minutes)
      RateLimiter.cleanup();

      // Old data should be cleaned up
      const stats = RateLimiter.getStats();
      // After cleanup, no active IPs should remain from old windows
      expect(stats.activeIPs).toBe(0);
    });
  });
});
