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
              '9876543210987654321': ['11111111111111111', '22222222222222222']
            },
            roles: ['11111111111111111', '22222222222222222', '33333333333333333']
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
      provider.setUserRoles('1234567890123456789', '9876543210987654321', ['11111111111111111', '22222222222222222']);

      // Should be retrievable
      expect(provider.mockRoles.has('1234567890123456789')).toBe(true);
    });

    it('should have setGuildRoles() helper method', () => {
      expect(provider.setGuildRoles).toBeDefined();
      expect(typeof provider.setGuildRoles).toBe('function');
    });

    it('should set guild roles via setGuildRoles()', () => {
      provider.setGuildRoles('1234567890123456789', ['11111111111111111', '22222222222222222', '33333333333333333']);

      // Should be retrievable
      expect(provider.mockGuilds.has('1234567890123456789')).toBe(true);
    });

    it('should allow setting multiple users in same guild', () => {
      provider.setUserRoles('1234567890123456789', '9876543210987654321', ['11111111111111111']);
      provider.setUserRoles('1234567890123456789', '8876543210987654321', ['22222222222222222']);
      provider.setUserRoles('1234567890123456789', '7876543210987654321', ['33333333333333333']);

      // Should store all users independently
      const guild = provider.mockRoles.get('1234567890123456789');
      expect(guild.size).toBe(3);
    });

    it('should allow updating user roles', () => {
      provider.setUserRoles('1234567890123456789', '9876543210987654321', ['11111111111111111']);
      provider.setUserRoles('1234567890123456789', '9876543210987654321', ['22222222222222222']); // Update

      // Should have updated roles
      const roles = provider.mockRoles.get('1234567890123456789').get('9876543210987654321');
      expect(roles).toEqual(['22222222222222222']);
    });
  });

  describe('verifySubscription() - Happy Path', () => {
    it('should return hasAccess=true when user has required role', async () => {
      // Setup mock data
      provider.setUserRoles('1234567890123456789', '9876543210987654321', ['11111111111111111', '22222222222222222']);

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
      expect(result.apiLatency).toBeUndefined(); // Mock has no latency
    });

    it('should return hasAccess=true when user has ANY required role', async () => {
      provider.setUserRoles('1234567890123456789', '9876543210987654321', ['22222222222222222']);

      const result = await provider.verifySubscription(
        '1234567890123456789',
        '9876543210987654321',
        ['11111111111111111', '22222222222222222', '33333333333333333']
      );

      expect(result.hasAccess).toBe(true);
      expect(result.matchingRoles).toEqual(['22222222222222222']);
    });

    it('should return hasAccess=false when user has no required roles', async () => {
      provider.setUserRoles('1234567890123456789', '9876543210987654321', ['33333333333333333']);

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

    it('should return hasAccess=false when user not configured', async () => {
      // No user data set

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

    it('should find multiple matching roles', async () => {
      provider.setUserRoles('1234567890123456789', '9876543210987654321', ['11111111111111111', '22222222222222222', '33333333333333333']);

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
      provider.setUserRoles('1234567890123456789', '9876543210987654321', ['11111111111111111', '22222222222222222', '33333333333333333']);

      const roles = await provider.getUserRoles('1234567890123456789', '9876543210987654321');

      expect(roles).toHaveLength(3);
      expect(roles).toContain('11111111111111111');
      expect(roles).toContain('22222222222222222');
      expect(roles).toContain('33333333333333333');
    });

    it('should return empty array when user not configured', async () => {
      const roles = await provider.getUserRoles('1234567890123456789', '9876543210987654321');

      expect(roles).toEqual([]);
    });

    it('should return empty array when guild not configured', async () => {
      const roles = await provider.getUserRoles('99999999999999999', '9876543210987654321');

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
      provider.setGuildRoles('1234567890123456789', ['11111111111111111', '22222222222222222', '33333333333333333']);

      const exists = await provider.roleExists('1234567890123456789', '11111111111111111');

      expect(exists).toBe(true);
    });

    it('should return false when role does not exist in guild', async () => {
      provider.setGuildRoles('1234567890123456789', ['11111111111111111', '22222222222222222']);

      const exists = await provider.roleExists('1234567890123456789', '77777777777777777');

      expect(exists).toBe(false);
    });

    it('should return false when guild not configured', async () => {
      const exists = await provider.roleExists('99999999999999999', '11111111111111111');

      expect(exists).toBe(false);
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

  describe('Performance', () => {
    it('should complete verifySubscription instantly (no API calls)', async () => {
      provider.setUserRoles('1234567890123456789', '9876543210987654321', ['11111111111111111']);

      const start = Date.now();
      await provider.verifySubscription('1234567890123456789', '9876543210987654321', ['11111111111111111']);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(10); // Should be nearly instant
    });

    it('should complete getUserRoles instantly', async () => {
      provider.setUserRoles('1234567890123456789', '9876543210987654321', ['11111111111111111']);

      const start = Date.now();
      await provider.getUserRoles('1234567890123456789', '9876543210987654321');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(10);
    });

    it('should complete roleExists instantly', async () => {
      provider.setGuildRoles('1234567890123456789', ['11111111111111111']);

      const start = Date.now();
      await provider.roleExists('1234567890123456789', '11111111111111111');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(10);
    });
  });

  describe('Test Scenario Setup', () => {
    it('should support complex test scenarios', async () => {
      // Setup: Multiple guilds, multiple users, various roles
      provider.setUserRoles('1234567890123456789', '9876543210987654321', ['11111111111111111']);
      provider.setUserRoles('1234567890123456789', '8876543210987654321', ['22222222222222222']);
      provider.setUserRoles('2234567890123456789', '7876543210987654321', ['33333333333333333']);
      provider.setGuildRoles('1234567890123456789', ['11111111111111111', '22222222222222222']);
      provider.setGuildRoles('2234567890123456789', ['33333333333333333']);

      // Verify guild1 user1
      const result1 = await provider.verifySubscription('1234567890123456789', '9876543210987654321', ['11111111111111111']);
      expect(result1.hasAccess).toBe(true);

      // Verify guild1 user2
      const result2 = await provider.verifySubscription('1234567890123456789', '8876543210987654321', ['22222222222222222']);
      expect(result2.hasAccess).toBe(true);

      // Verify guild2 user3
      const result3 = await provider.verifySubscription('2234567890123456789', '7876543210987654321', ['33333333333333333']);
      expect(result3.hasAccess).toBe(true);

      // Verify cross-guild isolation
      const result4 = await provider.verifySubscription('1234567890123456789', '7876543210987654321', ['33333333333333333']);
      expect(result4.hasAccess).toBe(false);

      // Verify role existence
      const exists1 = await provider.roleExists('1234567890123456789', '11111111111111111');
      expect(exists1).toBe(true);

      const exists2 = await provider.roleExists('1234567890123456789', '33333333333333333');
      expect(exists2).toBe(false);
    });

    it('should allow clearing user roles', () => {
      provider.setUserRoles('1234567890123456789', '9876543210987654321', ['11111111111111111']);
      provider.setUserRoles('1234567890123456789', '9876543210987654321', []); // Clear

      const roles = provider.mockRoles.get('1234567890123456789').get('9876543210987654321');
      expect(roles).toEqual([]);
    });

    it('should allow clearing guild roles', () => {
      provider.setGuildRoles('1234567890123456789', ['11111111111111111', '22222222222222222']);
      provider.setGuildRoles('1234567890123456789', []); // Clear

      const roles = provider.mockGuilds.get('1234567890123456789');
      expect(roles).toEqual([]);
    });
  });

  describe('Error Simulation', () => {
    it('should support simulating verification errors', async () => {
      provider.setSimulateError('1234567890123456789', 'GUILD_NOT_FOUND');

      await expect(
        provider.verifySubscription('1234567890123456789', '9876543210987654321', ['11111111111111111'])
      ).rejects.toThrow('Guild not found');
    });

    it('should support simulating timeout errors', async () => {
      provider.setSimulateError('1234567890123456789', 'TIMEOUT');

      await expect(
        provider.verifySubscription('1234567890123456789', '9876543210987654321', ['11111111111111111'])
      ).rejects.toThrow(/timeout/i);
    });

    it('should allow clearing error simulation', async () => {
      provider.setSimulateError('1234567890123456789', 'GUILD_NOT_FOUND');
      provider.clearSimulatedErrors();

      // Should work normally now
      provider.setUserRoles('1234567890123456789', '9876543210987654321', ['11111111111111111']);
      const result = await provider.verifySubscription('1234567890123456789', '9876543210987654321', ['11111111111111111']);
      expect(result.hasAccess).toBe(true);
    });
  });
});
