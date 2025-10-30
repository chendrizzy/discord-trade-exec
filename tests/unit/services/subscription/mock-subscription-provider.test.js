/**
 * Unit tests for MockSubscriptionProvider
 *
 * Feature: 004-subscription-gating
 * Phase: 2 (Foundational)
 * Task: T013 - Write failing tests for MockSubscriptionProvider
 *
 * TDD Approach: These tests are written FIRST and expected to FAIL until T015 implements the provider.
 *
 * Test Coverage:
 * - Configurable mock role data (setUserRoles, setGuildRoles)
 * - verifySubscription() with mock data
 * - getUserRoles() with mock data
 * - roleExists() with mock data
 * - Test helper methods for setting up scenarios
 */

const { MockSubscriptionProvider } = require('@services/subscription/MockSubscriptionProvider');

describe('MockSubscriptionProvider - TDD Tests', () => {
  let provider;

  beforeEach(() => {
    // Create fresh mock provider for each test
    provider = new MockSubscriptionProvider();
  });

  describe('Constructor', () => {
    it('should create provider with empty mock data', () => {
      expect(provider).toBeDefined();
      expect(provider.mockRoles).toBeDefined();
      expect(provider.mockGuilds).toBeDefined();
    });

    it('should initialize with configurable initial state', () => {
      const initialState = {
        guilds: {
          '1234567890123456789': {
            users: {
              '9876543210987654321': ['role1', 'role2']
            },
            roles: ['role1', 'role2', 'role3']
          }
        }
      };

      const providerWithState = new MockSubscriptionProvider(initialState);

      expect(providerWithState).toBeDefined();
    });
  });

  describe('Test Helper Methods', () => {
    it('should have setUserRoles() helper method', () => {
      expect(provider.setUserRoles).toBeDefined();
      expect(typeof provider.setUserRoles).toBe('function');
    });

    it('should set user roles via setUserRoles()', () => {
      provider.setUserRoles('1234567890123456789', '9876543210987654321', ['role1', 'role2']);

      // Should be retrievable
      expect(provider.mockRoles.has('1234567890123456789')).toBe(true);
    });

    it('should have setGuildRoles() helper method', () => {
      expect(provider.setGuildRoles).toBeDefined();
      expect(typeof provider.setGuildRoles).toBe('function');
    });

    it('should set guild roles via setGuildRoles()', () => {
      provider.setGuildRoles('1234567890123456789', ['role1', 'role2', 'role3']);

      // Should be retrievable
      expect(provider.mockGuilds.has('1234567890123456789')).toBe(true);
    });

    it('should allow setting multiple users in same guild', () => {
      provider.setUserRoles('1234567890123456789', 'user1', ['role1']);
      provider.setUserRoles('1234567890123456789', 'user2', ['role2']);
      provider.setUserRoles('1234567890123456789', 'user3', ['role3']);

      // Should store all users independently
      const guild = provider.mockRoles.get('1234567890123456789');
      expect(guild.size).toBe(3);
    });

    it('should allow updating user roles', () => {
      provider.setUserRoles('1234567890123456789', 'user1', ['role1']);
      provider.setUserRoles('1234567890123456789', 'user1', ['role2']); // Update

      // Should have updated roles
      const roles = provider.mockRoles.get('1234567890123456789').get('user1');
      expect(roles).toEqual(['role2']);
    });
  });

  describe('verifySubscription() - Happy Path', () => {
    it('should return hasAccess=true when user has required role', async () => {
      // Setup mock data
      provider.setUserRoles('1234567890123456789', '9876543210987654321', ['role1', 'role2']);

      const result = await provider.verifySubscription(
        '1234567890123456789',
        '9876543210987654321',
        ['role1']
      );

      expect(result.hasAccess).toBe(true);
      expect(result.userRoleIds).toContain('role1');
      expect(result.matchingRoles).toContain('role1');
      expect(result.verifiedAt).toBeInstanceOf(Date);
      expect(result.cacheHit).toBe(false);
      expect(result.apiLatency).toBeUndefined(); // Mock has no latency
    });

    it('should return hasAccess=true when user has ANY required role', async () => {
      provider.setUserRoles('1234567890123456789', '9876543210987654321', ['role2']);

      const result = await provider.verifySubscription(
        '1234567890123456789',
        '9876543210987654321',
        ['role1', 'role2', 'role3']
      );

      expect(result.hasAccess).toBe(true);
      expect(result.matchingRoles).toEqual(['role2']);
    });

    it('should return hasAccess=false when user has no required roles', async () => {
      provider.setUserRoles('1234567890123456789', '9876543210987654321', ['role3']);

      const result = await provider.verifySubscription(
        '1234567890123456789',
        '9876543210987654321',
        ['role1', 'role2']
      );

      expect(result.hasAccess).toBe(false);
      expect(result.userRoleIds).toEqual(['role3']);
      expect(result.matchingRoles).toEqual([]);
      expect(result.reason).toBe('no_subscription');
    });

    it('should return hasAccess=false when user not configured', async () => {
      // No user data set

      const result = await provider.verifySubscription(
        '1234567890123456789',
        '9876543210987654321',
        ['role1']
      );

      expect(result.hasAccess).toBe(false);
      expect(result.userRoleIds).toEqual([]);
      expect(result.matchingRoles).toEqual([]);
      expect(result.reason).toBe('no_subscription');
    });

    it('should find multiple matching roles', async () => {
      provider.setUserRoles('1234567890123456789', '9876543210987654321', ['role1', 'role2', 'role3']);

      const result = await provider.verifySubscription(
        '1234567890123456789',
        '9876543210987654321',
        ['role1', 'role2']
      );

      expect(result.hasAccess).toBe(true);
      expect(result.matchingRoles).toHaveLength(2);
      expect(result.matchingRoles).toContain('role1');
      expect(result.matchingRoles).toContain('role2');
    });
  });

  describe('verifySubscription() - Input Validation', () => {
    it('should throw error for invalid guild ID format', async () => {
      await expect(
        provider.verifySubscription('invalid', '9876543210987654321', ['role1'])
      ).rejects.toThrow(/invalid.*guild.*id/i);
    });

    it('should throw error for invalid user ID format', async () => {
      await expect(
        provider.verifySubscription('1234567890123456789', 'invalid', ['role1'])
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
      provider.setUserRoles('1234567890123456789', '9876543210987654321', ['role1', 'role2', 'role3']);

      const roles = await provider.getUserRoles('1234567890123456789', '9876543210987654321');

      expect(roles).toHaveLength(3);
      expect(roles).toContain('role1');
      expect(roles).toContain('role2');
      expect(roles).toContain('role3');
    });

    it('should return empty array when user not configured', async () => {
      const roles = await provider.getUserRoles('1234567890123456789', '9876543210987654321');

      expect(roles).toEqual([]);
    });

    it('should return empty array when guild not configured', async () => {
      const roles = await provider.getUserRoles('nonexistent_guild', '9876543210987654321');

      expect(roles).toEqual([]);
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
      provider.setGuildRoles('1234567890123456789', ['role1', 'role2', 'role3']);

      const exists = await provider.roleExists('1234567890123456789', 'role1');

      expect(exists).toBe(true);
    });

    it('should return false when role does not exist in guild', async () => {
      provider.setGuildRoles('1234567890123456789', ['role1', 'role2']);

      const exists = await provider.roleExists('1234567890123456789', 'nonexistent_role');

      expect(exists).toBe(false);
    });

    it('should return false when guild not configured', async () => {
      const exists = await provider.roleExists('nonexistent_guild', 'role1');

      expect(exists).toBe(false);
    });

    it('should validate guild ID format', async () => {
      await expect(
        provider.roleExists('invalid', 'role1')
      ).rejects.toThrow(/invalid.*guild.*id/i);
    });

    it('should validate role ID format', async () => {
      await expect(
        provider.roleExists('1234567890123456789', 'invalid')
      ).rejects.toThrow(/invalid.*role.*id/i);
    });
  });

  describe('Performance', () => {
    it('should complete verifySubscription instantly (no API calls)', async () => {
      provider.setUserRoles('1234567890123456789', '9876543210987654321', ['role1']);

      const start = Date.now();
      await provider.verifySubscription('1234567890123456789', '9876543210987654321', ['role1']);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(10); // Should be nearly instant
    });

    it('should complete getUserRoles instantly', async () => {
      provider.setUserRoles('1234567890123456789', '9876543210987654321', ['role1']);

      const start = Date.now();
      await provider.getUserRoles('1234567890123456789', '9876543210987654321');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(10);
    });

    it('should complete roleExists instantly', async () => {
      provider.setGuildRoles('1234567890123456789', ['role1']);

      const start = Date.now();
      await provider.roleExists('1234567890123456789', 'role1');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(10);
    });
  });

  describe('Test Scenario Setup', () => {
    it('should support complex test scenarios', async () => {
      // Setup: Multiple guilds, multiple users, various roles
      provider.setUserRoles('guild1', 'user1', ['role1']);
      provider.setUserRoles('guild1', 'user2', ['role2']);
      provider.setUserRoles('guild2', 'user3', ['role3']);
      provider.setGuildRoles('guild1', ['role1', 'role2']);
      provider.setGuildRoles('guild2', ['role3']);

      // Verify guild1 user1
      const result1 = await provider.verifySubscription('guild1', 'user1', ['role1']);
      expect(result1.hasAccess).toBe(true);

      // Verify guild1 user2
      const result2 = await provider.verifySubscription('guild1', 'user2', ['role2']);
      expect(result2.hasAccess).toBe(true);

      // Verify guild2 user3
      const result3 = await provider.verifySubscription('guild2', 'user3', ['role3']);
      expect(result3.hasAccess).toBe(true);

      // Verify cross-guild isolation
      const result4 = await provider.verifySubscription('guild1', 'user3', ['role3']);
      expect(result4.hasAccess).toBe(false);

      // Verify role existence
      const exists1 = await provider.roleExists('guild1', 'role1');
      expect(exists1).toBe(true);

      const exists2 = await provider.roleExists('guild1', 'role3');
      expect(exists2).toBe(false);
    });

    it('should allow clearing user roles', () => {
      provider.setUserRoles('guild1', 'user1', ['role1']);
      provider.setUserRoles('guild1', 'user1', []); // Clear

      const roles = provider.mockRoles.get('guild1').get('user1');
      expect(roles).toEqual([]);
    });

    it('should allow clearing guild roles', () => {
      provider.setGuildRoles('guild1', ['role1', 'role2']);
      provider.setGuildRoles('guild1', []); // Clear

      const roles = provider.mockGuilds.get('guild1');
      expect(roles).toEqual([]);
    });
  });

  describe('Error Simulation', () => {
    it('should support simulating verification errors', async () => {
      provider.setSimulateError('guild1', 'GUILD_NOT_FOUND');

      await expect(
        provider.verifySubscription('guild1', 'user1', ['role1'])
      ).rejects.toThrow('Guild not found');
    });

    it('should support simulating timeout errors', async () => {
      provider.setSimulateError('guild1', 'TIMEOUT');

      await expect(
        provider.verifySubscription('guild1', 'user1', ['role1'])
      ).rejects.toThrow(/timeout/i);
    });

    it('should allow clearing error simulation', async () => {
      provider.setSimulateError('guild1', 'GUILD_NOT_FOUND');
      provider.clearSimulatedErrors();

      // Should work normally now
      provider.setUserRoles('guild1', 'user1', ['role1']);
      const result = await provider.verifySubscription('guild1', 'user1', ['role1']);
      expect(result.hasAccess).toBe(true);
    });
  });
});
