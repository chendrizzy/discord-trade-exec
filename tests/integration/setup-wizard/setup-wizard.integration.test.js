/**
 * Integration tests for Setup Wizard Flow
 *
 * Feature: 004-subscription-gating
 * Phase: 3 (User Story 1 - Initial Bot Setup)
 * Task: T023 - Write failing integration test for setup wizard flow
 *
 * TDD Approach: These tests are written FIRST and expected to FAIL until implementation is complete.
 *
 * Test Coverage:
 * - SetupWizardService integration with ServerConfigurationService
 * - ServerConfigurationService integration with MongoDB
 * - Role detection with Discord.js guild integration
 * - Permission verification flow
 * - Configuration persistence and retrieval
 * - Cache invalidation on configuration updates
 *
 * Testing Strategy:
 * - Use MongoMemoryServer for real database operations
 * - Mock Discord.js interactions
 * - Verify service layer integration
 * - Validate data flow between components
 *
 * Performance Requirements:
 * - Database operations should complete in <100ms
 * - Cache operations should complete in <10ms
 * - Full wizard flow should complete in <2s
 */

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

// Services and models will be implemented in T024-T025
let SetupWizardService;
let ServerConfigurationService;
let DiscordSubscriptionProvider;
let ServerConfiguration;

// Mock Discord.js
jest.mock('discord.js', () => ({
  Client: jest.fn(),
  GatewayIntentBits: {},
  PermissionFlagsBits: {
    ManageGuild: 1n << 5n
  }
}));

describe('Setup Wizard Flow - Integration Tests', () => {
  let mongoServer;
  let mockClient;
  let mockGuild;
  let setupWizardService;
  let configService;
  let subscriptionProvider;

  beforeAll(async () => {
    // Disconnect existing MongoDB connection if any
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }

    // Start in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Load models after MongoDB connection
    ServerConfiguration = require('@models/ServerConfiguration');
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear database before each test
    await ServerConfiguration.deleteMany({});

    // Reset all mocks
    jest.clearAllMocks();

    // Mock Discord Guild
    mockGuild = {
      id: '1234567890123456789',
      name: 'Test Server',
      ownerId: '1111111111111111111',
      members: {
        fetch: jest.fn()
      },
      roles: {
        cache: new Map([
          ['2222222222222222222', { id: '2222222222222222222', name: 'Subscriber' }],
          ['3333333333333333333', { id: '3333333333333333333', name: 'Premium' }],
          ['4444444444444444444', { id: '4444444444444444444', name: 'Member' }],
          ['5555555555555555555', { id: '5555555555555555555', name: 'Supporter' }]
        ])
      }
    };

    // Mock Discord Client
    mockClient = {
      guilds: {
        cache: new Map([[mockGuild.id, mockGuild]]),
        fetch: jest.fn().mockResolvedValue(mockGuild)
      },
      user: {
        id: '9999999999999999999',
        username: 'TestBot'
      }
    };

    // Initialize services (will fail until T024 implementation)
    try {
      const SetupWizardServiceModule = require('@services/setup-wizard/SetupWizardService');
      SetupWizardService = SetupWizardServiceModule.SetupWizardService;

      const ServerConfigurationServiceModule = require('@services/subscription/ServerConfigurationService');
      ServerConfigurationService = ServerConfigurationServiceModule.ServerConfigurationService;

      const DiscordSubscriptionProviderModule = require('@services/subscription/DiscordSubscriptionProvider');
      DiscordSubscriptionProvider = DiscordSubscriptionProviderModule.DiscordSubscriptionProvider;

      // Create service instances
      subscriptionProvider = new DiscordSubscriptionProvider(mockClient);
      configService = new ServerConfigurationService(ServerConfiguration);
      setupWizardService = new SetupWizardService(configService, subscriptionProvider);
    } catch (error) {
      // Expected to fail until implementation exists
    }
  });

  describe('Service Integration - Configuration Management', () => {
    it('should integrate SetupWizardService with ServerConfigurationService', async () => {
      // ARRANGE: Setup wizard needs to save configuration
      const guildId = '1234567890123456789';
      const userId = '1111111111111111111';
      const accessMode = 'subscription_required';
      const requiredRoleIds = ['2222222222222222222', '3333333333333333333'];

      const startTime = Date.now();

      // ACT: Use SetupWizardService to create configuration
      const config = await setupWizardService.createConfiguration(
        guildId,
        accessMode,
        requiredRoleIds,
        userId
      );

      const elapsedTime = Date.now() - startTime;

      // ASSERT: Configuration should be saved to database
      expect(config).toBeDefined();
      expect(config.guildId).toBe(guildId);
      expect(config.accessMode).toBe(accessMode);
      expect(config.requiredRoleIds).toEqual(requiredRoleIds);
      expect(config.modifiedBy).toBe(userId);

      // ASSERT: Should complete in <100ms
      expect(elapsedTime).toBeLessThan(100);

      // VERIFY: Configuration is retrievable via ServerConfigurationService
      const retrievedConfig = await configService.getConfig(guildId);
      expect(retrievedConfig.guildId).toBe(guildId);
      expect(retrievedConfig.accessMode).toBe(accessMode);
    });

    it('should cache configuration after creation', async () => {
      // ARRANGE
      const guildId = '1234567890123456789';
      const userId = '1111111111111111111';

      // ACT: Create configuration
      await setupWizardService.createConfiguration(
        guildId,
        'open_access',
        [],
        userId
      );

      // ACT: Retrieve configuration (should hit cache)
      const startTime = Date.now();
      const cachedConfig = await configService.getConfig(guildId);
      const cacheElapsedTime = Date.now() - startTime;

      // ASSERT: Cache retrieval should be < 10ms
      expect(cacheElapsedTime).toBeLessThan(10);
      expect(cachedConfig).toBeDefined();
      expect(cachedConfig.guildId).toBe(guildId);
    });

    it('should invalidate cache when configuration is updated', async () => {
      // ARRANGE: Create initial configuration
      const guildId = '1234567890123456789';
      const userId = '1111111111111111111';

      await setupWizardService.createConfiguration(
        guildId,
        'open_access',
        [],
        userId
      );

      // Verify cache is populated
      const initialConfig = await configService.getConfig(guildId);
      expect(initialConfig.accessMode).toBe('open_access');

      // ACT: Update configuration
      await setupWizardService.updateConfiguration(
        guildId,
        {
          accessMode: 'subscription_required',
          requiredRoleIds: ['2222222222222222222']
        },
        userId
      );

      // ACT: Retrieve configuration (cache should be invalidated, fetch from DB)
      const updatedConfig = await configService.getConfig(guildId);

      // ASSERT: Should return updated values
      expect(updatedConfig.accessMode).toBe('subscription_required');
      expect(updatedConfig.requiredRoleIds).toEqual(['2222222222222222222']);
    });
  });

  describe('Service Integration - Role Detection', () => {
    it('should integrate SetupWizardService with DiscordSubscriptionProvider for role detection', async () => {
      // ARRANGE: Guild has subscription-related roles
      const guildId = '1234567890123456789';

      const startTime = Date.now();

      // ACT: Detect subscription roles
      const detectedRoles = await setupWizardService.detectSubscriptionRoles(guildId);

      const elapsedTime = Date.now() - startTime;

      // ASSERT: Should detect roles matching subscription patterns
      expect(detectedRoles).toBeDefined();
      expect(detectedRoles.length).toBeGreaterThan(0);

      // Should include roles with names like "subscriber", "supporter", etc.
      const roleNames = detectedRoles.map(r => r.name.toLowerCase());
      expect(roleNames).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/subscriber|supporter/)
        ])
      );

      // ASSERT: Should complete in <2s
      expect(elapsedTime).toBeLessThan(2000);
    });

    it('should handle guilds with no subscription roles', async () => {
      // ARRANGE: Guild with only admin roles
      mockGuild.roles.cache.clear();
      mockGuild.roles.cache.set('6666666666666666666', {
        id: '6666666666666666666',
        name: 'Admin'
      });
      mockGuild.roles.cache.set('7777777777777777777', {
        id: '7777777777777777777',
        name: 'Moderator'
      });

      const guildId = '1234567890123456789';

      // ACT: Detect subscription roles
      const detectedRoles = await setupWizardService.detectSubscriptionRoles(guildId);

      // ASSERT: Should return empty array
      expect(detectedRoles).toBeDefined();
      expect(detectedRoles).toEqual([]);
    });

    it('should detect multiple role name variations', async () => {
      // ARRANGE: Guild with various subscription role names
      mockGuild.roles.cache.set('8888888888888888888', {
        id: '8888888888888888888',
        name: 'Patron'
      });
      mockGuild.roles.cache.set('9999999999999999999', {
        id: '9999999999999999999',
        name: 'VIP Member'
      });

      const guildId = '1234567890123456789';

      // ACT: Detect subscription roles
      const detectedRoles = await setupWizardService.detectSubscriptionRoles(guildId);

      // ASSERT: Should detect roles with various subscription-related names
      expect(detectedRoles.length).toBeGreaterThanOrEqual(4); // Original 2 + Patron + VIP Member
    });
  });

  describe('Service Integration - Permission Verification', () => {
    it('should verify server owner permissions', async () => {
      // ARRANGE: User is server owner
      const guildId = '1234567890123456789';
      const userId = '1111111111111111111'; // Matches mockGuild.ownerId

      mockGuild.members.fetch.mockResolvedValue({
        id: userId,
        user: { id: userId },
        permissions: {
          has: jest.fn().mockReturnValue(true) // Has MANAGE_GUILD
        }
      });

      // ACT: Verify permissions
      const hasPermission = await setupWizardService.verifyPermissions(guildId, userId);

      // ASSERT: Should return true for server owner
      expect(hasPermission).toBe(true);
    });

    it('should reject users without MANAGE_GUILD permission', async () => {
      // ARRANGE: User without manage guild permission
      const guildId = '1234567890123456789';
      const userId = '2222222222222222222'; // Not the owner

      mockGuild.members.fetch.mockResolvedValue({
        id: userId,
        user: { id: userId },
        permissions: {
          has: jest.fn().mockReturnValue(false) // No MANAGE_GUILD
        }
      });

      // ACT: Verify permissions
      const hasPermission = await setupWizardService.verifyPermissions(guildId, userId);

      // ASSERT: Should return false
      expect(hasPermission).toBe(false);
    });
  });

  describe('End-to-End Integration Flow', () => {
    it('should complete full setup wizard flow with service integration', async () => {
      // ARRANGE
      const guildId = '1234567890123456789';
      const userId = '1111111111111111111';
      const startTime = Date.now();

      // STEP 1: Verify permissions
      mockGuild.members.fetch.mockResolvedValue({
        id: userId,
        permissions: { has: jest.fn().mockReturnValue(true) }
      });

      const hasPermission = await setupWizardService.verifyPermissions(guildId, userId);
      expect(hasPermission).toBe(true);

      // STEP 2: Detect subscription roles
      const detectedRoles = await setupWizardService.detectSubscriptionRoles(guildId);
      expect(detectedRoles.length).toBeGreaterThan(0);

      // STEP 3: Create configuration with detected roles
      const selectedRoleIds = detectedRoles.slice(0, 2).map(r => r.id);
      const config = await setupWizardService.createConfiguration(
        guildId,
        'subscription_required',
        selectedRoleIds,
        userId
      );

      expect(config).toBeDefined();

      // STEP 4: Verify configuration is retrievable
      const retrievedConfig = await configService.getConfig(guildId);
      expect(retrievedConfig.guildId).toBe(guildId);
      expect(retrievedConfig.accessMode).toBe('subscription_required');

      const elapsedTime = Date.now() - startTime;

      // ASSERT: Full flow should complete in <2s
      expect(elapsedTime).toBeLessThan(2000);
    });

    it('should handle reconfiguration flow', async () => {
      // ARRANGE: Existing configuration
      const guildId = '1234567890123456789';
      const userId = '1111111111111111111';

      // Create initial open access configuration
      await setupWizardService.createConfiguration(
        guildId,
        'open_access',
        [],
        userId
      );

      // STEP 1: Check if configuration exists
      const exists = await configService.configExists(guildId);
      expect(exists).toBe(true);

      // STEP 2: Update to subscription required
      const updatedConfig = await setupWizardService.updateConfiguration(
        guildId,
        {
          accessMode: 'subscription_required',
          requiredRoleIds: ['2222222222222222222']
        },
        userId
      );

      expect(updatedConfig.accessMode).toBe('subscription_required');

      // STEP 3: Verify update persisted
      const retrievedConfig = await configService.getConfig(guildId);
      expect(retrievedConfig.accessMode).toBe('subscription_required');
      expect(retrievedConfig.requiredRoleIds).toEqual(['2222222222222222222']);
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle database errors gracefully', async () => {
      // ARRANGE: Mock database error
      jest.spyOn(ServerConfiguration, 'create').mockRejectedValueOnce(
        new Error('Database connection failed')
      );

      const guildId = '1234567890123456789';
      const userId = '1111111111111111111';

      // ACT & ASSERT: Should throw error with context
      await expect(
        setupWizardService.createConfiguration(
          guildId,
          'open_access',
          [],
          userId
        )
      ).rejects.toThrow(/database/i);
    });

    it('should handle Discord API errors during role detection', async () => {
      // ARRANGE: Mock Discord API error
      mockClient.guilds.fetch.mockRejectedValueOnce(
        new Error('Discord API rate limit')
      );

      const guildId = '1234567890123456789';

      // ACT & ASSERT: Should throw error with context
      await expect(
        setupWizardService.detectSubscriptionRoles(guildId)
      ).rejects.toThrow(/discord/i);
    });

    it('should validate configuration inputs before database operations', async () => {
      // ARRANGE: Invalid snowflake ID
      const invalidGuildId = 'invalid-id';
      const userId = '1111111111111111111';

      // ACT & ASSERT: Should throw validation error
      await expect(
        setupWizardService.createConfiguration(
          invalidGuildId,
          'open_access',
          [],
          userId
        )
      ).rejects.toThrow(/invalid.*guild.*id/i);
    });
  });

  describe('Performance Integration', () => {
    it('should meet performance requirements for database operations', async () => {
      // ARRANGE
      const guildId = '1234567890123456789';
      const userId = '1111111111111111111';

      // ACT: Measure database write performance
      const writeStartTime = Date.now();
      await setupWizardService.createConfiguration(
        guildId,
        'open_access',
        [],
        userId
      );
      const writeElapsedTime = Date.now() - writeStartTime;

      // ASSERT: Write should be < 100ms
      expect(writeElapsedTime).toBeLessThan(100);

      // ACT: Measure database read performance
      const readStartTime = Date.now();
      await configService.getConfig(guildId);
      const readElapsedTime = Date.now() - readStartTime;

      // ASSERT: Read should be < 100ms
      expect(readElapsedTime).toBeLessThan(100);
    });

    it('should meet performance requirements for cache operations', async () => {
      // ARRANGE: Create configuration to populate cache
      const guildId = '1234567890123456789';
      const userId = '1111111111111111111';

      await setupWizardService.createConfiguration(
        guildId,
        'open_access',
        [],
        userId
      );

      // ACT: Measure cache hit performance
      const cacheStartTime = Date.now();
      await configService.getConfig(guildId);
      const cacheElapsedTime = Date.now() - cacheStartTime;

      // ASSERT: Cache hit should be < 10ms
      expect(cacheElapsedTime).toBeLessThan(10);
    });
  });
});
