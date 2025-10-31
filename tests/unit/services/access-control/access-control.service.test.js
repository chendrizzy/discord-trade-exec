/**
 * Unit Tests for AccessControlService
 *
 * Feature: 004-subscription-gating
 * Phase: 4 (User Story 2 - Subscriber Access)
 * Task: T030 - Write failing tests for AccessControlService.checkAccess()
 *
 * TDD APPROACH: These tests MUST BE WRITTEN FIRST and FAIL before implementation.
 *
 * Test Coverage:
 * - Access check for users with subscription roles
 * - Access check for users without subscription roles
 * - Cache hit scenarios (fast path <10ms)
 * - Cache miss scenarios (API call path <2s)
 * - Open access mode bypass
 * - Configuration not found scenarios
 * - Error handling and graceful degradation
 * - Performance requirements validation
 *
 * Critical Path: This is MANDATORY TDD per constitution - subscription verification is critical.
 */

const { ServerConfigurationService } = require('@services/subscription/ServerConfigurationService');
const { SubscriptionCacheService } = require('@services/subscription/SubscriptionCacheService');
const { DiscordSubscriptionProvider } = require('@services/subscription/DiscordSubscriptionProvider');
const { AccessControlService } = require('@services/access-control/AccessControlService');
const ServerConfiguration = require('@models/ServerConfiguration');
const UserAccessStatus = require('@models/UserAccessStatus');

// Mock dependencies
jest.mock('@services/subscription/ServerConfigurationService');
jest.mock('@services/subscription/SubscriptionCacheService');
jest.mock('@services/subscription/DiscordSubscriptionProvider');
jest.mock('@models/AccessDenialEvent');

describe('AccessControlService - Unit Tests', () => {
  let accessControlService;
  let mockConfigService;
  let mockCacheService;
  let mockSubscriptionProvider;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock instances
    mockConfigService = new ServerConfigurationService();
    mockCacheService = new SubscriptionCacheService();
    mockSubscriptionProvider = new DiscordSubscriptionProvider();

    // Add verifyUserSubscription mock method (auto-mock doesn't include it)
    mockSubscriptionProvider.verifySubscription = jest.fn();

    // Initialize service under test
    accessControlService = new AccessControlService(
      mockConfigService,
      mockCacheService,
      mockSubscriptionProvider
    );
  });

  describe('Constructor', () => {
    it('should require ServerConfigurationService', () => {
      expect(() => {
        new AccessControlService(null, mockCacheService, mockSubscriptionProvider);
      }).toThrow(/ServerConfigurationService.*required/i);
    });

    it('should require SubscriptionCacheService', () => {
      expect(() => {
        new AccessControlService(mockConfigService, null, mockSubscriptionProvider);
      }).toThrow(/SubscriptionCacheService.*required/i);
    });

    it('should require DiscordSubscriptionProvider', () => {
      expect(() => {
        new AccessControlService(mockConfigService, mockCacheService, null);
      }).toThrow(/DiscordSubscriptionProvider.*required/i);
    });

    it('should initialize successfully with all dependencies', () => {
      expect(accessControlService).toBeDefined();
      expect(accessControlService.configService).toBe(mockConfigService);
      expect(accessControlService.cacheService).toBe(mockCacheService);
      expect(accessControlService.subscriptionProvider).toBe(mockSubscriptionProvider);
    });
  });

  describe('checkAccess() - Open Access Mode', () => {
    it('should allow access immediately in open access mode', async () => {
      // ARRANGE: Guild configured for open access
      mockConfigService.getConfig.mockResolvedValue({
        guildId: '1234567890123456789',
        accessMode: 'open_access',
        requiredRoleIds: [],
        isActive: true
      });

      const guildId = '1234567890123456789';
      const userId = '9876543210987654321';

      const startTime = Date.now();

      // ACT: Check access
      const result = await accessControlService.checkAccess(guildId, userId);

      const elapsedTime = Date.now() - startTime;

      // ASSERT: Should grant access without subscription check
      expect(result.hasAccess).toBe(true);
      expect(result.reason).toBe('open_access');
      expect(result.cacheHit).toBe(false); // Open access doesn't use cache

      // ASSERT: Should not call subscription provider
      expect(mockSubscriptionProvider.verifySubscription).not.toHaveBeenCalled();

      // ASSERT: Should complete quickly
      expect(elapsedTime).toBeLessThan(100);
    });

    it('should not cache results in open access mode', async () => {
      // ARRANGE: Open access configuration
      mockConfigService.getConfig.mockResolvedValue({
        guildId: '1234567890123456789',
        accessMode: 'open_access',
        requiredRoleIds: []
      });

      // ACT: Check access twice
      await accessControlService.checkAccess('1234567890123456789', 'user1');
      await accessControlService.checkAccess('1234567890123456789', 'user1');

      // ASSERT: Cache should not be used
      expect(mockCacheService.get).not.toHaveBeenCalled();
      expect(mockCacheService.set).not.toHaveBeenCalled();
    });
  });

  describe('checkAccess() - Subscription Required Mode with Cache Hit', () => {
    it('should return cached access status when available (fast path)', async () => {
      // ARRANGE: Guild with subscription required
      mockConfigService.getConfig.mockResolvedValue({
        guildId: '1234567890123456789',
        isActive: true,
        accessMode: 'subscription_required',
        requiredRoleIds: ['role123', 'role456']
      });

      // ARRANGE: Cache hit with access granted
      mockCacheService.get.mockResolvedValue({
        hasAccess: true,
        reason: 'verified_subscription',
        cacheHit: false // Will be overridden to true by AccessControlService
      });

      const startTime = Date.now();

      // ACT: Check access
      const result = await accessControlService.checkAccess(
        '1234567890123456789',
        '9876543210987654321'
      );

      const elapsedTime = Date.now() - startTime;

      // ASSERT: Should return cached result
      expect(result.hasAccess).toBe(true);
      expect(result.cacheHit).toBe(true);
      expect(result.reason).toBe('verified_subscription');

      // ASSERT: Should NOT call subscription provider
      expect(mockSubscriptionProvider.verifySubscription).not.toHaveBeenCalled();

      // ASSERT: Should be VERY fast (<10ms per requirement)
      expect(elapsedTime).toBeLessThan(10);
    });

    it('should deny access for cached denial status', async () => {
      // ARRANGE: Subscription required
      mockConfigService.getConfig.mockResolvedValue({
        guildId: '1234567890123456789',
        isActive: true,
        accessMode: 'subscription_required',
        requiredRoleIds: ['role123']
      });

      // ARRANGE: Cache hit with access denied
      mockCacheService.get.mockResolvedValue({
        hasAccess: false,
        reason: 'no_subscription',
        requiredRoles: ['role123'],
        cacheHit: false // Will be overridden to true by AccessControlService
      });

      // ACT: Check access
      const result = await accessControlService.checkAccess(
        '1234567890123456789',
        '9876543210987654321'
      );

      // ASSERT: Should deny based on cache
      expect(result.hasAccess).toBe(false);
      expect(result.cacheHit).toBe(true);
      expect(result.reason).toBe('no_subscription');

      // Should not call provider
      expect(mockSubscriptionProvider.verifySubscription).not.toHaveBeenCalled();
    });
  });

  describe('checkAccess() - Subscription Required Mode with Cache Miss', () => {
    it('should verify subscription via provider on cache miss', async () => {
      // ARRANGE: Subscription required
      mockConfigService.getConfig.mockResolvedValue({
        guildId: '1234567890123456789',
        isActive: true,
        accessMode: 'subscription_required',
        requiredRoleIds: ['role123', 'role456']
      });

      // ARRANGE: Cache miss
      mockCacheService.get.mockResolvedValue(null);

      // ARRANGE: Provider returns subscription verified (object with hasAccess)
      mockSubscriptionProvider.verifySubscription.mockResolvedValue({
        hasAccess: true,
        matchingRoles: ['role123']
      });

      mockCacheService.set.mockResolvedValue(undefined);

      const startTime = Date.now();

      // ACT: Check access
      const result = await accessControlService.checkAccess(
        '1234567890123456789',
        '9876543210987654321'
      );

      const elapsedTime = Date.now() - startTime;

      // ASSERT: Should grant access
      expect(result.hasAccess).toBe(true);
      expect(result.cacheHit).toBe(false);
      expect(result.reason).toBe('verified_subscription');

      // ASSERT: Should call provider with correct parameters
      expect(mockSubscriptionProvider.verifySubscription).toHaveBeenCalledWith(
        '1234567890123456789',
        '9876543210987654321',
        ['role123', 'role456']
      );

      // ASSERT: Should cache the result
      expect(mockCacheService.set).toHaveBeenCalledWith(
        '1234567890123456789',
        '9876543210987654321',
        expect.objectContaining({
          hasAccess: true,
          reason: 'verified_subscription',
          cacheHit: false
        })
      );

      // ASSERT: Should meet performance requirement (<2s p95)
      expect(elapsedTime).toBeLessThan(2000);
    });

    it('should deny access when user lacks required roles', async () => {
      // ARRANGE: Subscription required
      mockConfigService.getConfig.mockResolvedValue({
        guildId: '1234567890123456789',
        isActive: true,
        accessMode: 'subscription_required',
        requiredRoleIds: ['role123']
      });

      // ARRANGE: Cache miss
      mockCacheService.get.mockResolvedValue(null);

      // ARRANGE: Provider returns no subscription (object with hasAccess: false)
      mockSubscriptionProvider.verifySubscription.mockResolvedValue({
        hasAccess: false,
        reason: 'no_subscription'
      });

      mockCacheService.set.mockResolvedValue(undefined);

      // ACT: Check access
      const result = await accessControlService.checkAccess(
        '1234567890123456789',
        '9876543210987654321'
      );

      // ASSERT: Should deny access
      expect(result.hasAccess).toBe(false);
      expect(result.reason).toBe('no_subscription');
      expect(result.requiredRoles).toEqual(['role123']);

      // ASSERT: Should cache the denial
      expect(mockCacheService.set).toHaveBeenCalledWith(
        '1234567890123456789',
        '9876543210987654321',
        expect.objectContaining({
          hasAccess: false
        })
      );
    });
  });

  describe('checkAccess() - Configuration Scenarios', () => {
    it('should deny access when no configuration exists (fail-closed)', async () => {
      // ARRANGE: No configuration found
      mockConfigService.getConfig.mockResolvedValue(null);

      // ACT: Check access
      const result = await accessControlService.checkAccess(
        '1234567890123456789',
        '9876543210987654321'
      );

      // ASSERT: Should fail-closed (deny access for security)
      expect(result.hasAccess).toBe(false);
      expect(result.reason).toBe('configuration_not_found');
    });

    it('should deny access when configuration is inactive (fail-closed)', async () => {
      // ARRANGE: Inactive configuration
      mockConfigService.getConfig.mockResolvedValue({
        guildId: '1234567890123456789',
        accessMode: 'subscription_required',
        requiredRoleIds: ['role123'],
        isActive: false
      });

      // ACT: Check access
      const result = await accessControlService.checkAccess(
        '1234567890123456789',
        '9876543210987654321'
      );

      // ASSERT: Should fail-closed (deny access for security)
      expect(result.hasAccess).toBe(false);
      expect(result.reason).toBe('configuration_inactive');
    });
  });

  describe('checkAccess() - Error Handling', () => {
    it('should gracefully degrade on cache service error', async () => {
      // ARRANGE: Subscription required
      mockConfigService.getConfig.mockResolvedValue({
        guildId: '1234567890123456789',
        isActive: true,
        accessMode: 'subscription_required',
        requiredRoleIds: ['role123']
      });

      // ARRANGE: Cache service throws error
      mockCacheService.get.mockRejectedValue(
        new Error('Redis connection failed')
      );

      // ARRANGE: Provider works (fallback) - must return object with hasAccess
      mockSubscriptionProvider.verifySubscription.mockResolvedValue({
        hasAccess: true,
        matchingRoles: ['role123']
      });

      mockCacheService.set.mockResolvedValue(undefined);

      // ACT: Check access
      const result = await accessControlService.checkAccess(
        '1234567890123456789',
        '9876543210987654321'
      );

      // ASSERT: Should still work via provider fallback
      expect(result.hasAccess).toBe(true);
      expect(result.reason).toBe('verified_subscription');
      expect(result.cacheHit).toBe(false);

      // Should log error but not throw
      expect(mockSubscriptionProvider.verifySubscription).toHaveBeenCalled();
    });

    it('should use cached status on provider timeout (graceful degradation)', async () => {
      // ARRANGE: Subscription required
      mockConfigService.getConfig.mockResolvedValue({
        guildId: '1234567890123456789',
        isActive: true,
        accessMode: 'subscription_required',
        requiredRoleIds: ['role123']
      });

      // ARRANGE: Cache miss on first call, then returns stale data on second call
      mockCacheService.get
        .mockResolvedValueOnce(null)  // First call: cache miss
        .mockResolvedValueOnce({      // Second call: stale cache
          hasAccess: true,
          reason: 'verified_subscription',
          cacheHit: false
        });

      // ARRANGE: Provider times out
      mockSubscriptionProvider.verifySubscription.mockRejectedValue(
        new Error('Discord API timeout')
      );

      // ACT: Check access
      const result = await accessControlService.checkAccess(
        '1234567890123456789',
        '9876543210987654321'
      );

      // ASSERT: Should use stale cache as fallback
      expect(result.hasAccess).toBe(true);
      expect(result.reason).toBe('verified_subscription_stale');
      expect(result.cacheHit).toBe(true);
      expect(result.degraded).toBe(true);
    });

    it('should deny access when both cache and provider fail', async () => {
      // ARRANGE: Subscription required
      mockConfigService.getConfig.mockResolvedValue({
        guildId: '1234567890123456789',
        isActive: true,
        accessMode: 'subscription_required',
        requiredRoleIds: ['role123']
      });

      // ARRANGE: Cache miss
      mockCacheService.get.mockResolvedValue(null);

      // ARRANGE: Provider fails
      mockSubscriptionProvider.verifySubscription.mockRejectedValue(
        new Error('Discord API unavailable')
      );

      // ACT: Check access
      const result = await accessControlService.checkAccess(
        '1234567890123456789',
        '9876543210987654321'
      );

      // ASSERT: Should deny access safely (fail-closed)
      expect(result.hasAccess).toBe(false);
      expect(result.reason).toBe('verification_unavailable');
      expect(result.error).toBeDefined();
    });

    it('should handle configuration service errors', async () => {
      // ARRANGE: Config service throws error
      mockConfigService.getConfig.mockRejectedValue(
        new Error('Database connection failed')
      );

      // ACT: Check access
      const result = await accessControlService.checkAccess(
        '1234567890123456789',
        '9876543210987654321'
      );

      // ASSERT: Should fail-closed on config error (security)
      expect(result.hasAccess).toBe(false);
      expect(result.reason).toBe('verification_error');
      expect(result.error).toBeDefined();
    });
  });

  describe('checkAccess() - Input Validation', () => {
    it('should deny access for invalid guildId', async () => {
      const result = await accessControlService.checkAccess(null, '9876543210987654321');
      expect(result.hasAccess).toBe(false);
      expect(result.reason).toBe('invalid_guild_id');
    });

    it('should deny access for invalid userId', async () => {
      const result = await accessControlService.checkAccess('1234567890123456789', null);
      expect(result.hasAccess).toBe(false);
      expect(result.reason).toBe('invalid_user_id');
    });

    it('should validate guildId format (Discord snowflake)', async () => {
      const result = await accessControlService.checkAccess('invalid-id', '9876543210987654321');
      expect(result.hasAccess).toBe(false);
      expect(result.reason).toBe('invalid_guild_id');
    });

    it('should validate userId format (Discord snowflake)', async () => {
      const result = await accessControlService.checkAccess('1234567890123456789', 'invalid-id');
      expect(result.hasAccess).toBe(false);
      expect(result.reason).toBe('invalid_user_id');
    });
  });

  describe('checkAccess() - Performance Requirements', () => {
    it('should meet <10ms requirement for cache hits', async () => {
      // ARRANGE: Cached result
      mockConfigService.getConfig.mockResolvedValue({
        guildId: '1234567890123456789',
        isActive: true,
        accessMode: 'subscription_required',
        requiredRoleIds: ['role123']
      });

      mockCacheService.get.mockResolvedValue({
        hasAccess: true,
        reason: 'verified_subscription',
        cacheHit: false
      });

      // ACT: Measure performance
      const measurements = [];
      for (let i = 0; i < 10; i++) {
        const start = Date.now();
        await accessControlService.checkAccess(
          '1234567890123456789',
          '9876543210987654321'
        );
        measurements.push(Date.now() - start);
      }

      // ASSERT: All measurements should be <10ms
      measurements.forEach(time => {
        expect(time).toBeLessThan(10);
      });

      const avgTime = measurements.reduce((a, b) => a + b, 0) / measurements.length;
      expect(avgTime).toBeLessThan(10);
    });

    it('should meet <2s p95 requirement for cache misses', async () => {
      // ARRANGE: Cache miss scenario
      mockConfigService.getConfig.mockResolvedValue({
        guildId: '1234567890123456789',
        isActive: true,
        accessMode: 'subscription_required',
        requiredRoleIds: ['role123']
      });

      mockCacheService.get.mockResolvedValue(null);

      mockSubscriptionProvider.verifySubscription.mockResolvedValue(true);

      mockCacheService.set.mockResolvedValue(undefined);

      // ACT: Measure performance
      const measurements = [];
      for (let i = 0; i < 20; i++) {
        const start = Date.now();
        await accessControlService.checkAccess(
          `guild${i}`,
          `user${i}`
        );
        measurements.push(Date.now() - start);
      }

      // ASSERT: Calculate p95 (95th percentile)
      measurements.sort((a, b) => a - b);
      const p95Index = Math.floor(measurements.length * 0.95);
      const p95Time = measurements[p95Index];

      expect(p95Time).toBeLessThan(2000);
    });
  });

  describe('invalidateCache() Method', () => {
    it('should invalidate cache for specific user and guild', async () => {
      // ARRANGE
      mockCacheService.invalidate.mockResolvedValue(true);

      const guildId = '1234567890123456789';
      const userId = '9876543210987654321';

      // ACT: Invalidate cache
      await accessControlService.invalidateCache(guildId, userId);

      // ASSERT: Should call cache service to delete
      expect(mockCacheService.invalidate).toHaveBeenCalledWith(
        guildId,
        userId
      );
    });

    it('should handle cache service errors gracefully', async () => {
      // ARRANGE: Cache service error
      mockCacheService.invalidate.mockRejectedValue(
        new Error('Redis connection failed')
      );

      // ACT & ASSERT: Should not throw, but log error
      await expect(
        accessControlService.invalidateCache(
          '1234567890123456789',
          '9876543210987654321'
        )
      ).resolves.not.toThrow();
    });
  });

  describe('logDenialEvent() Method (Phase 5 - T041)', () => {
    const AccessDenialEvent = require('@models/AccessDenialEvent');

    beforeEach(() => {
      // Reset model mock
      jest.clearAllMocks();
      AccessDenialEvent.logDenial = jest.fn();
    });

    it('should log denial event with all required fields', async () => {
      // ARRANGE: Mock successful event creation
      const mockEvent = {
        _id: 'event123',
        guildId: '1234567890123456789',
        userId: '9876543210987654321',
        commandAttempted: '/trade',
        denialReason: 'no_subscription',
        userRoleIds: ['role1', 'role2'],
        requiredRoleIds: ['subscriber_role'],
        wasInformed: true,
        timestamp: new Date()
      };

      AccessDenialEvent.logDenial.mockResolvedValue(mockEvent);

      // ACT: Log denial event
      const result = await accessControlService.logDenialEvent({
        guildId: '1234567890123456789',
        userId: '9876543210987654321',
        commandAttempted: '/trade',
        denialReason: 'no_subscription',
        userRoleIds: ['role1', 'role2'],
        requiredRoleIds: ['subscriber_role'],
        wasInformed: true
      });

      // ASSERT: Should call model with correct data
      expect(AccessDenialEvent.logDenial).toHaveBeenCalledWith({
        guildId: '1234567890123456789',
        userId: '9876543210987654321',
        commandAttempted: '/trade',
        denialReason: 'no_subscription',
        userRoleIds: ['role1', 'role2'],
        requiredRoleIds: ['subscriber_role'],
        wasInformed: true
      });

      // ASSERT: Should return the created event
      expect(result).toBe(mockEvent);
    });

    it('should log denial event with minimal fields (defaults)', async () => {
      // ARRANGE: Mock successful event creation
      const mockEvent = {
        _id: 'event124',
        guildId: '1234567890123456789',
        userId: '9876543210987654321',
        commandAttempted: '/trade',
        denialReason: 'no_subscription',
        userRoleIds: [],
        requiredRoleIds: [],
        wasInformed: false,
        timestamp: new Date()
      };

      AccessDenialEvent.logDenial.mockResolvedValue(mockEvent);

      // ACT: Log denial event with minimal data
      const result = await accessControlService.logDenialEvent({
        guildId: '1234567890123456789',
        userId: '9876543210987654321',
        commandAttempted: '/trade',
        denialReason: 'no_subscription'
      });

      // ASSERT: Should call model with defaults
      expect(AccessDenialEvent.logDenial).toHaveBeenCalledWith({
        guildId: '1234567890123456789',
        userId: '9876543210987654321',
        commandAttempted: '/trade',
        denialReason: 'no_subscription',
        userRoleIds: [],
        requiredRoleIds: [],
        wasInformed: false
      });

      // ASSERT: Should return the created event
      expect(result).toBe(mockEvent);
    });

    it('should handle database errors gracefully', async () => {
      // ARRANGE: Mock database error
      AccessDenialEvent.logDenial.mockRejectedValue(
        new Error('MongoDB connection failed')
      );

      // ACT & ASSERT: Should not throw, but log error and return null
      const result = await accessControlService.logDenialEvent({
        guildId: '1234567890123456789',
        userId: '9876543210987654321',
        commandAttempted: '/trade',
        denialReason: 'no_subscription'
      });

      // ASSERT: Should return null on error
      expect(result).toBeNull();
    });

    it('should validate guildId format', async () => {
      // ACT & ASSERT: Should reject invalid guildId
      await expect(
        accessControlService.logDenialEvent({
          guildId: 'invalid',
          userId: '9876543210987654321',
          commandAttempted: '/trade',
          denialReason: 'no_subscription'
        })
      ).rejects.toThrow(/Invalid guildId format/i);
    });

    it('should validate userId format', async () => {
      // ACT & ASSERT: Should reject invalid userId
      await expect(
        accessControlService.logDenialEvent({
          guildId: '1234567890123456789',
          userId: 'invalid',
          commandAttempted: '/trade',
          denialReason: 'no_subscription'
        })
      ).rejects.toThrow(/Invalid userId format/i);
    });

    it('should validate denialReason enum', async () => {
      // ACT & ASSERT: Should reject invalid denial reason
      await expect(
        accessControlService.logDenialEvent({
          guildId: '1234567890123456789',
          userId: '9876543210987654321',
          commandAttempted: '/trade',
          denialReason: 'invalid_reason'
        })
      ).rejects.toThrow(/Invalid denial reason/i);
    });

    it('should require commandAttempted field', async () => {
      // ACT & ASSERT: Should reject missing commandAttempted
      await expect(
        accessControlService.logDenialEvent({
          guildId: '1234567890123456789',
          userId: '9876543210987654321',
          denialReason: 'no_subscription'
        })
      ).rejects.toThrow(/commandAttempted.*required/i);
    });

    it('should log event for subscription_expired reason', async () => {
      // ARRANGE: Mock successful event creation
      const mockEvent = {
        _id: 'event125',
        guildId: '1234567890123456789',
        userId: '9876543210987654321',
        commandAttempted: '/trade',
        denialReason: 'subscription_expired',
        userRoleIds: [],
        requiredRoleIds: ['subscriber_role'],
        wasInformed: true,
        timestamp: new Date()
      };

      AccessDenialEvent.logDenial.mockResolvedValue(mockEvent);

      // ACT: Log subscription_expired event
      const result = await accessControlService.logDenialEvent({
        guildId: '1234567890123456789',
        userId: '9876543210987654321',
        commandAttempted: '/trade',
        denialReason: 'subscription_expired',
        requiredRoleIds: ['subscriber_role'],
        wasInformed: true
      });

      // ASSERT: Should log with correct reason
      expect(AccessDenialEvent.logDenial).toHaveBeenCalledWith(
        expect.objectContaining({
          denialReason: 'subscription_expired'
        })
      );
      expect(result).toBe(mockEvent);
    });

    it('should log event for verification_failed reason', async () => {
      // ARRANGE: Mock successful event creation
      const mockEvent = {
        _id: 'event126',
        guildId: '1234567890123456789',
        userId: '9876543210987654321',
        commandAttempted: '/trade',
        denialReason: 'verification_failed',
        userRoleIds: [],
        requiredRoleIds: ['subscriber_role'],
        wasInformed: true,
        timestamp: new Date()
      };

      AccessDenialEvent.logDenial.mockResolvedValue(mockEvent);

      // ACT: Log verification_failed event
      const result = await accessControlService.logDenialEvent({
        guildId: '1234567890123456789',
        userId: '9876543210987654321',
        commandAttempted: '/trade',
        denialReason: 'verification_failed',
        requiredRoleIds: ['subscriber_role'],
        wasInformed: true
      });

      // ASSERT: Should log with correct reason
      expect(AccessDenialEvent.logDenial).toHaveBeenCalledWith(
        expect.objectContaining({
          denialReason: 'verification_failed'
        })
      );
      expect(result).toBe(mockEvent);
    });
  });
});
