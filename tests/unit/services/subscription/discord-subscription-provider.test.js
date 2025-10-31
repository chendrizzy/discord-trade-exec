/**
 * Unit tests for DiscordSubscriptionProvider
 *
 * Feature: 004-subscription-gating
 * Phase: 2 (Foundational)
 * Task: T012 - Write failing tests for DiscordSubscriptionProvider
 *
 * TDD Approach: These tests are written FIRST and expected to FAIL until T014 implements the provider.
 *
 * Test Coverage:
 * - verifySubscription() with cache hit/miss scenarios
 * - getUserRoles() with valid/invalid users
 * - roleExists() with existing/non-existing roles
 * - Error handling for Discord API failures
 * - Performance requirements (<500ms p95 for Discord API calls)
 */

const { DiscordSubscriptionProvider } = require('@services/subscription/DiscordSubscriptionProvider');

// Mock Discord.js
jest.mock('discord.js');

describe('DiscordSubscriptionProvider - TDD Tests', () => {
  let provider;
  let mockClient;
  let mockGuild;
  let mockMember;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Mock Discord.js Client
    mockClient = {
      guilds: {
        cache: new Map(),
        fetch: jest.fn()
      }
    };

    // Mock Guild
    mockGuild = {
      id: '1234567890123456789',
      members: {
        fetch: jest.fn()
      },
      roles: {
        cache: new Map()
      }
    };

    // Mock GuildMember
    mockMember = {
      id: '9876543210987654321',
      roles: {
        cache: new Map()
      }
    };

    // Setup guild cache
    mockClient.guilds.cache.set(mockGuild.id, mockGuild);

    // Create provider with mock client
    provider = new DiscordSubscriptionProvider(mockClient);
  });

  describe('Constructor', () => {
    it('should create provider with Discord client', () => {
      expect(provider).toBeDefined();
      expect(provider.client).toBe(mockClient);
    });

    it('should throw error if client is not provided', () => {
      expect(() => new DiscordSubscriptionProvider()).toThrow('Discord client is required');
    });
  });

  describe('verifySubscription() - Happy Path', () => {
    it('should return hasAccess=true when user has required role', async () => {
      // Setup: User has role '11111111111111111'
      mockMember.roles.cache.set('11111111111111111', { id: '11111111111111111', name: 'Subscriber' });
      mockGuild.members.fetch.mockResolvedValue(mockMember);

      const result = await provider.verifySubscription(
        '1234567890123456789',
        '9876543210987654321',
        ['11111111111111111']
      );

      expect(result.hasAccess).toBe(true);
      expect(result.userRoleIds).toContain('11111111111111111');
      expect(result.matchingRoles).toContain('11111111111111111');
      expect(result.verifiedAt).toBeInstanceOf(Date);
      expect(result.cacheHit).toBe(false);
      expect(result.apiLatency).toBeGreaterThanOrEqual(0); // Mocked calls can be instant (0ms)
    });

    it('should return hasAccess=true when user has ANY of the required roles', async () => {
      // Setup: User has role2 but not role1
      mockMember.roles.cache.set('22222222222222222', { id: '22222222222222222', name: 'Premium' });
      mockGuild.members.fetch.mockResolvedValue(mockMember);

      const result = await provider.verifySubscription(
        '1234567890123456789',
        '9876543210987654321',
        ['11111111111111111', '22222222222222222', '33333333333333333']
      );

      expect(result.hasAccess).toBe(true);
      expect(result.userRoleIds).toContain('22222222222222222');
      expect(result.matchingRoles).toEqual(['22222222222222222']);
    });

    it('should return hasAccess=false when user has no required roles', async () => {
      // Setup: User has role3 but needs role1 or role2
      mockMember.roles.cache.set('33333333333333333', { id: '33333333333333333', name: 'Member' });
      mockGuild.members.fetch.mockResolvedValue(mockMember);

      const result = await provider.verifySubscription(
        '1234567890123456789',
        '9876543210987654321',
        ['11111111111111111', '22222222222222222']
      );

      expect(result.hasAccess).toBe(false);
      expect(result.userRoleIds).toEqual(['33333333333333333']);
      expect(result.matchingRoles).toEqual([]);
      expect(result.reason).toBe('no_subscription');
    });

    it('should return hasAccess=false when user has no roles', async () => {
      // Setup: User has no roles
      mockGuild.members.fetch.mockResolvedValue(mockMember);

      const result = await provider.verifySubscription(
        '1234567890123456789',
        '9876543210987654321',
        ['11111111111111111']
      );

      expect(result.hasAccess).toBe(false);
      expect(result.userRoleIds).toEqual([]);
      expect(result.matchingRoles).toEqual([]);
      expect(result.reason).toBe('no_subscription');
    });

    it('should measure API latency on cache miss', async () => {
      mockMember.roles.cache.set('11111111111111111', { id: '11111111111111111', name: 'Subscriber' });
      mockGuild.members.fetch.mockResolvedValue(mockMember);

      const result = await provider.verifySubscription(
        '1234567890123456789',
        '9876543210987654321',
        ['11111111111111111']
      );

      expect(result.apiLatency).toBeGreaterThanOrEqual(0); // Mocked calls can be instant (0ms)
      expect(result.apiLatency).toBeLessThan(1000); // Should be under 1 second
      expect(result.cacheHit).toBe(false);
    });
  });

  describe('verifySubscription() - Error Handling', () => {
    it('should throw SubscriptionVerificationError when guild not found', async () => {
      // Remove guild from cache
      mockClient.guilds.cache.clear();
      mockClient.guilds.fetch.mockRejectedValue(new Error('Unknown Guild'));

      await expect(
        provider.verifySubscription('99999999999999999', '9876543210987654321', ['11111111111111111'])
      ).rejects.toThrow('Guild not found');
    });

    it('should throw SubscriptionVerificationError when user not in guild', async () => {
      // Discord API error 10007: Unknown Member
      const error = new Error('Unknown Member');
      error.code = 10007;
      mockGuild.members.fetch.mockRejectedValue(error);

      await expect(
        provider.verifySubscription('1234567890123456789', '88888888888888888', ['11111111111111111'])
      ).rejects.toThrow('User not found in guild');
    });

    it('should throw SubscriptionVerificationError when bot lacks permissions', async () => {
      // Discord API error 50013: Missing Permissions
      const error = new Error('Missing Permissions');
      error.code = 50013;
      mockGuild.members.fetch.mockRejectedValue(error);

      await expect(
        provider.verifySubscription('1234567890123456789', '9876543210987654321', ['11111111111111111'])
      ).rejects.toThrow('Bot lacks permissions');
    });

    it('should throw SubscriptionVerificationError on Discord API timeout', async () => {
      const error = new Error('Request timeout');
      mockGuild.members.fetch.mockRejectedValue(error);

      await expect(
        provider.verifySubscription('1234567890123456789', '9876543210987654321', ['11111111111111111'])
      ).rejects.toThrow(/timeout|Subscription verification failed/i);
    });

    it('should mark timeout errors as retryable', async () => {
      const error = new Error('Request timeout');
      mockGuild.members.fetch.mockRejectedValue(error);

      try {
        await provider.verifySubscription('1234567890123456789', '9876543210987654321', ['11111111111111111']);
      } catch (err) {
        expect(err.isRetryable).toBe(true);
      }
    });

    it('should mark unknown member errors as non-retryable', async () => {
      const error = new Error('Unknown Member');
      error.code = 10007;
      mockGuild.members.fetch.mockRejectedValue(error);

      try {
        await provider.verifySubscription('1234567890123456789', '9876543210987654321', ['11111111111111111']);
      } catch (err) {
        expect(err.isRetryable).toBe(false);
      }
    });
  });

  describe('verifySubscription() - Input Validation', () => {
    it('should throw error for invalid guild ID format', async () => {
      await expect(
        provider.verifySubscription('invalid', '9876543210987654321', ['11111111111111111'])
      ).rejects.toThrow(/invalid.*guild.*id/i);
    });

    it('should throw error for invalid user ID format', async () => {
      await expect(
        provider.verifySubscription('1234567890123456789', 'invalid', ['11111111111111111'])
      ).rejects.toThrow(/invalid.*user.*id/i);
    });

    it('should throw error for empty requiredRoleIds array', async () => {
      await expect(
        provider.verifySubscription('1234567890123456789', '9876543210987654321', [])
      ).rejects.toThrow(/required.*role/i);
    });

    it('should throw error for invalid role ID in requiredRoleIds', async () => {
      await expect(
        provider.verifySubscription('1234567890123456789', '9876543210987654321', ['invalid_role'])
      ).rejects.toThrow(/invalid.*role.*id/i);
    });
  });

  describe('getUserRoles()', () => {
    it('should return all role IDs for a user', async () => {
      // Setup: User has multiple roles
      mockMember.roles.cache.set('11111111111111111', { id: '11111111111111111', name: 'Subscriber' });
      mockMember.roles.cache.set('22222222222222222', { id: '22222222222222222', name: 'Premium' });
      mockMember.roles.cache.set('33333333333333333', { id: '33333333333333333', name: 'VIP' });
      mockGuild.members.fetch.mockResolvedValue(mockMember);

      const roles = await provider.getUserRoles('1234567890123456789', '9876543210987654321');

      expect(roles).toHaveLength(3);
      expect(roles).toContain('11111111111111111');
      expect(roles).toContain('22222222222222222');
      expect(roles).toContain('33333333333333333');
    });

    it('should return empty array when user has no roles', async () => {
      mockGuild.members.fetch.mockResolvedValue(mockMember);

      const roles = await provider.getUserRoles('1234567890123456789', '9876543210987654321');

      expect(roles).toEqual([]);
    });

    it('should throw error when guild not found', async () => {
      mockClient.guilds.cache.clear();
      mockClient.guilds.fetch.mockRejectedValue(new Error('Unknown Guild'));

      await expect(
        provider.getUserRoles('99999999999999999', '9876543210987654321')
      ).rejects.toThrow('Guild not found');
    });

    it('should throw error when user not found', async () => {
      const error = new Error('Unknown Member');
      error.code = 10007;
      mockGuild.members.fetch.mockRejectedValue(error);

      await expect(
        provider.getUserRoles('1234567890123456789', '88888888888888888')
      ).rejects.toThrow('User not found');
    });

    it('should validate guild ID format', async () => {
      await expect(
        provider.getUserRoles('invalid', '9876543210987654321')
      ).rejects.toThrow(/invalid.*guild.*id/i);
    });

    it('should validate user ID format', async () => {
      await expect(
        provider.getUserRoles('1234567890123456789', 'invalid')
      ).rejects.toThrow(/invalid.*user.*id/i);
    });
  });

  describe('roleExists()', () => {
    it('should return true when role exists in guild', async () => {
      // Setup: Role exists in guild
      mockGuild.roles.cache.set('11111111111111111', { id: '11111111111111111', name: 'Subscriber' });

      const exists = await provider.roleExists('1234567890123456789', '11111111111111111');

      expect(exists).toBe(true);
    });

    it('should return false when role does not exist in guild', async () => {
      // Setup: Role does not exist
      const exists = await provider.roleExists('1234567890123456789', '77777777777777777');

      expect(exists).toBe(false);
    });

    it('should throw error when guild not found', async () => {
      mockClient.guilds.cache.clear();
      mockClient.guilds.fetch.mockRejectedValue(new Error('Unknown Guild'));

      await expect(
        provider.roleExists('99999999999999999', '11111111111111111')
      ).rejects.toThrow('Guild not found');
    });

    it('should validate guild ID format', async () => {
      await expect(
        provider.roleExists('invalid', '11111111111111111')
      ).rejects.toThrow(/invalid.*guild.*id/i);
    });

    it('should validate role ID format', async () => {
      await expect(
        provider.roleExists('1234567890123456789', 'invalid')
      ).rejects.toThrow(/invalid.*role.*id/i);
    });
  });

  describe('Performance Requirements', () => {
    it('should complete verifySubscription under 500ms (p95)', async () => {
      mockMember.roles.cache.set('11111111111111111', { id: '11111111111111111', name: 'Subscriber' });
      mockGuild.members.fetch.mockResolvedValue(mockMember);

      const start = Date.now();
      await provider.verifySubscription('1234567890123456789', '9876543210987654321', ['11111111111111111']);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(500);
    });

    it('should complete getUserRoles under 500ms (p95)', async () => {
      mockMember.roles.cache.set('11111111111111111', { id: '11111111111111111', name: 'Subscriber' });
      mockGuild.members.fetch.mockResolvedValue(mockMember);

      const start = Date.now();
      await provider.getUserRoles('1234567890123456789', '9876543210987654321');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(500);
    });

    it('should complete roleExists under 10ms (cache lookup)', async () => {
      mockGuild.roles.cache.set('11111111111111111', { id: '11111111111111111', name: 'Subscriber' });

      const start = Date.now();
      await provider.roleExists('1234567890123456789', '11111111111111111');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(10);
    });
  });

  describe('Multiple Roles Scenarios', () => {
    it('should find multiple matching roles', async () => {
      // User has role1 and role2, both are in required roles
      mockMember.roles.cache.set('11111111111111111', { id: '11111111111111111', name: 'Subscriber' });
      mockMember.roles.cache.set('22222222222222222', { id: '22222222222222222', name: 'Premium' });
      mockMember.roles.cache.set('33333333333333333', { id: '33333333333333333', name: 'Member' });
      mockGuild.members.fetch.mockResolvedValue(mockMember);

      const result = await provider.verifySubscription(
        '1234567890123456789',
        '9876543210987654321',
        ['11111111111111111', '22222222222222222']
      );

      expect(result.hasAccess).toBe(true);
      expect(result.matchingRoles).toHaveLength(2);
      expect(result.matchingRoles).toContain('11111111111111111');
      expect(result.matchingRoles).toContain('22222222222222222');
    });

    it('should return all user roles even if only one matches', async () => {
      mockMember.roles.cache.set('11111111111111111', { id: '11111111111111111', name: 'Subscriber' });
      mockMember.roles.cache.set('22222222222222222', { id: '22222222222222222', name: 'Premium' });
      mockMember.roles.cache.set('33333333333333333', { id: '33333333333333333', name: 'Member' });
      mockGuild.members.fetch.mockResolvedValue(mockMember);

      const result = await provider.verifySubscription(
        '1234567890123456789',
        '9876543210987654321',
        ['11111111111111111'] // Only role1 required
      );

      expect(result.hasAccess).toBe(true);
      expect(result.userRoleIds).toHaveLength(3); // All roles returned
      expect(result.matchingRoles).toEqual(['11111111111111111']); // Only matched role
    });
  });
});
