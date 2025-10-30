/**
 * End-to-End Tests for Setup Wizard
 *
 * Feature: 004-subscription-gating
 * Phase: 3 (User Story 1 - Initial Bot Setup)
 * Task: T022 - Write failing E2E test for setup wizard interaction
 *
 * TDD Approach: These tests are written FIRST and expected to FAIL until implementation is complete.
 *
 * Test Coverage:
 * - Complete setup wizard flow from Discord command to configuration persistence
 * - Button and select menu interactions
 * - Permission verification
 * - Role selection and auto-detection
 * - Configuration confirmation
 * - Error handling for invalid inputs
 *
 * Testing Strategy:
 * - Simulate real Discord interactions
 * - Test full command lifecycle (command → response → interaction → persistence)
 * - Verify Discord message formatting (embeds, buttons, select menus)
 * - Validate user feedback messages
 *
 * Performance Requirements:
 * - Setup wizard should complete in <3 minutes (SC-001)
 * - Initial response should appear in <2s
 * - Button interactions should respond in <1s
 */

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  InteractionType,
  ComponentType
} = require('discord.js');

// Services and models
const ServerConfiguration = require('@models/ServerConfiguration');
const SetupConfigureAccessCommand = require('@commands/setup/configure-access.command');

describe('Setup Wizard E2E Tests', () => {
  let mongoServer;
  let mockClient;
  let mockGuild;
  let mockMember;
  let setupCommand;

  beforeAll(async () => {
    // Disconnect existing MongoDB connection
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }

    // Start in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear database
    await ServerConfiguration.deleteMany({});

    // Reset mocks
    jest.clearAllMocks();

    // Create mock Discord guild
    mockGuild = {
      id: '1234567890123456789',
      name: 'Test Server',
      ownerId: '1111111111111111111',
      members: {
        fetch: jest.fn()
      },
      roles: {
        cache: new Map([
          ['@everyone', { id: '@everyone', name: '@everyone', position: 0 }],
          ['2222222222222222222', { id: '2222222222222222222', name: 'Subscriber', position: 5 }],
          ['3333333333333333333', { id: '3333333333333333333', name: 'Premium', position: 4 }],
          ['4444444444444444444', { id: '4444444444444444444', name: 'Member', position: 3 }],
          ['5555555555555555555', { id: '5555555555555555555', name: 'Supporter', position: 2 }],
          ['6666666666666666666', { id: '6666666666666666666', name: 'Admin', position: 10 }]
        ])
      }
    };

    // Create mock member (server owner)
    mockMember = {
      id: '1111111111111111111',
      user: { id: '1111111111111111111', username: 'TestOwner' },
      permissions: {
        has: jest.fn().mockReturnValue(true) // Has MANAGE_GUILD permission
      }
    };

    mockGuild.members.fetch.mockResolvedValue(mockMember);

    // Create mock Discord client
    mockClient = {
      guilds: {
        cache: new Map([[mockGuild.id, mockGuild]]),
        fetch: jest.fn().mockResolvedValue(mockGuild)
      },
      user: {
        id: '9999999999999999999',
        username: 'TestBot',
        tag: 'TestBot#0000'
      }
    };

    // Initialize setup command
    setupCommand = new SetupConfigureAccessCommand(mockClient);
  });

  describe('User Story 1 - Initial Bot Setup with Access Control Selection', () => {
    it('E2E: Server owner completes setup wizard (Subscription Required mode)', async () => {
      // Simulate time tracking
      const startTime = Date.now();

      // ===== STEP 1: User invokes /setup configure-access command =====
      const commandInteraction = {
        guildId: mockGuild.id,
        user: { id: '1111111111111111111', username: 'TestOwner' },
        replied: false,
        deferred: false,
        reply: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
        editReply: jest.fn().mockResolvedValue(undefined)
      };

      // ACT: Execute command
      await setupCommand.execute(commandInteraction);

      // ASSERT: Bot should respond with mode selection buttons
      expect(commandInteraction.reply).toHaveBeenCalledTimes(1);
      const replyCall = commandInteraction.reply.mock.calls[0][0];

      // Verify message content
      expect(replyCall.content).toMatch(/Server Access Control Setup/i);
      expect(replyCall.content).toMatch(/Subscription Required/i);
      expect(replyCall.content).toMatch(/Open Access/i);
      expect(replyCall.ephemeral).toBe(true);

      // Verify button components
      expect(replyCall.components).toHaveLength(1);
      const actionRow = replyCall.components[0];
      expect(actionRow.components).toHaveLength(2);

      const subscriptionButton = actionRow.components.find(
        c => c.data.custom_id === 'setup_subscription_required'
      );
      const openAccessButton = actionRow.components.find(
        c => c.data.custom_id === 'setup_open_access'
      );

      expect(subscriptionButton).toBeDefined();
      expect(openAccessButton).toBeDefined();
      expect(subscriptionButton.data.label).toMatch(/Subscription Required/i);
      expect(openAccessButton.data.label).toMatch(/Open Access/i);

      // ===== STEP 2: User clicks "Subscription Required" button =====
      const buttonInteraction = {
        customId: 'setup_subscription_required',
        guildId: mockGuild.id,
        user: { id: '1111111111111111111' },
        update: jest.fn().mockResolvedValue(undefined)
      };

      // ACT: Handle button click
      await setupCommand.handleButton(buttonInteraction);

      // ASSERT: Bot should respond with role selection dropdown
      expect(buttonInteraction.update).toHaveBeenCalledTimes(1);
      const updateCall = buttonInteraction.update.mock.calls[0][0];

      // Verify message content
      expect(updateCall.content).toMatch(/Subscription Required Mode/i);
      expect(updateCall.content).toMatch(/Select which roles/i);
      expect(updateCall.ephemeral).toBe(true);

      // Verify select menu component
      expect(updateCall.components).toHaveLength(1);
      const selectRow = updateCall.components[0];
      const selectMenu = selectRow.components[0];

      expect(selectMenu.data.custom_id).toBe('setup_role_select');
      expect(selectMenu.data.options.length).toBeGreaterThan(0);

      // Verify auto-detected subscription roles are marked
      const subscriberOption = selectMenu.data.options.find(
        opt => opt.value === '2222222222222222222'
      );
      expect(subscriberOption).toBeDefined();
      expect(subscriberOption.label).toBe('Subscriber');

      // ===== STEP 3: User selects roles from dropdown =====
      const selectMenuInteraction = {
        customId: 'setup_role_select',
        values: ['2222222222222222222', '3333333333333333333'], // Subscriber and Premium
        guildId: mockGuild.id,
        user: { id: '1111111111111111111' },
        update: jest.fn().mockResolvedValue(undefined)
      };

      // ACT: Handle role selection
      await setupCommand.handleSelectMenu(selectMenuInteraction);

      // ASSERT: Bot should confirm setup completion
      expect(selectMenuInteraction.update).toHaveBeenCalledTimes(1);
      const confirmationCall = selectMenuInteraction.update.mock.calls[0][0];

      // Verify confirmation message
      expect(confirmationCall.content).toMatch(/Setup Complete/i);
      expect(confirmationCall.content).toMatch(/Subscription Required.*enabled/i);
      expect(confirmationCall.content).toMatch(/Authorized Roles/i);
      expect(confirmationCall.content).toMatch(/Subscriber/i);
      expect(confirmationCall.content).toMatch(/Premium/i);
      expect(confirmationCall.components).toHaveLength(0); // No more interactive components
      expect(confirmationCall.ephemeral).toBe(true);

      // ===== STEP 4: Verify configuration was saved to database =====
      const savedConfig = await ServerConfiguration.findOne({ guildId: mockGuild.id });

      expect(savedConfig).toBeDefined();
      expect(savedConfig.guildId).toBe(mockGuild.id);
      expect(savedConfig.accessMode).toBe('subscription_required');
      expect(savedConfig.requiredRoleIds).toEqual([
        '2222222222222222222',
        '3333333333333333333'
      ]);
      expect(savedConfig.modifiedBy).toBe('1111111111111111111');
      expect(savedConfig.isActive).toBe(true);

      // ===== STEP 5: Verify performance requirement (SC-001: <3 minutes) =====
      const elapsedTime = Date.now() - startTime;
      expect(elapsedTime).toBeLessThan(180000); // 3 minutes in milliseconds

      // ===== STEP 6: Verify setup wizard can detect existing configuration on re-run =====
      const reconfigureInteraction = {
        guildId: mockGuild.id,
        user: { id: '1111111111111111111' },
        replied: false,
        deferred: false,
        reply: jest.fn().mockResolvedValue(undefined)
      };

      await setupCommand.execute(reconfigureInteraction);

      const reconfigureReply = reconfigureInteraction.reply.mock.calls[0][0];
      expect(reconfigureReply.content).toMatch(/Current Configuration/i);
      expect(reconfigureReply.content).toMatch(/Subscription Required/i);
      expect(reconfigureReply.content).toMatch(/reconfigure/i);
    });

    it('E2E: Server owner completes setup wizard (Open Access mode)', async () => {
      // Simulate time tracking
      const startTime = Date.now();

      // ===== STEP 1: User invokes /setup configure-access command =====
      const commandInteraction = {
        guildId: mockGuild.id,
        user: { id: '1111111111111111111' },
        replied: false,
        deferred: false,
        reply: jest.fn().mockResolvedValue(undefined)
      };

      await setupCommand.execute(commandInteraction);

      // ASSERT: Initial reply successful
      expect(commandInteraction.reply).toHaveBeenCalled();

      // ===== STEP 2: User clicks "Open Access" button =====
      const buttonInteraction = {
        customId: 'setup_open_access',
        guildId: mockGuild.id,
        user: { id: '1111111111111111111' },
        update: jest.fn().mockResolvedValue(undefined)
      };

      // ACT: Handle button click
      await setupCommand.handleButton(buttonInteraction);

      // ASSERT: Bot should confirm setup completion immediately
      expect(buttonInteraction.update).toHaveBeenCalledTimes(1);
      const confirmationCall = buttonInteraction.update.mock.calls[0][0];

      // Verify confirmation message
      expect(confirmationCall.content).toMatch(/Setup Complete/i);
      expect(confirmationCall.content).toMatch(/Open Access.*enabled/i);
      expect(confirmationCall.content).toMatch(/All server members can use bot/i);
      expect(confirmationCall.components).toHaveLength(0);
      expect(confirmationCall.ephemeral).toBe(true);

      // ===== STEP 3: Verify configuration was saved =====
      const savedConfig = await ServerConfiguration.findOne({ guildId: mockGuild.id });

      expect(savedConfig).toBeDefined();
      expect(savedConfig.accessMode).toBe('open_access');
      expect(savedConfig.requiredRoleIds).toEqual([]);
      expect(savedConfig.modifiedBy).toBe('1111111111111111111');

      // ===== STEP 4: Verify performance requirement =====
      const elapsedTime = Date.now() - startTime;
      expect(elapsedTime).toBeLessThan(180000); // Should be much faster for open access
    });
  });

  describe('Permission Verification Flow', () => {
    it('E2E: Non-owner without MANAGE_GUILD permission is denied', async () => {
      // ===== ARRANGE: User without permissions =====
      const unauthorizedMember = {
        id: '2222222222222222222',
        user: { id: '2222222222222222222', username: 'RegularUser' },
        permissions: {
          has: jest.fn().mockReturnValue(false) // No MANAGE_GUILD
        }
      };

      mockGuild.members.fetch.mockResolvedValue(unauthorizedMember);

      const commandInteraction = {
        guildId: mockGuild.id,
        user: { id: '2222222222222222222' },
        replied: false,
        deferred: false,
        reply: jest.fn().mockResolvedValue(undefined)
      };

      // ===== ACT: Execute command =====
      await setupCommand.execute(commandInteraction);

      // ===== ASSERT: Bot should deny access =====
      expect(commandInteraction.reply).toHaveBeenCalledTimes(1);
      const replyCall = commandInteraction.reply.mock.calls[0][0];

      expect(replyCall.content).toMatch(/Permission Denied/i);
      expect(replyCall.content).toMatch(/Manage Server/i);
      expect(replyCall.ephemeral).toBe(true);
      expect(replyCall.components).toBeUndefined(); // No interactive components shown
    });

    it('E2E: Server owner bypasses permission check', async () => {
      // ===== ARRANGE: Guild owner (no explicit MANAGE_GUILD check needed) =====
      const commandInteraction = {
        guildId: mockGuild.id,
        user: { id: mockGuild.ownerId }, // Server owner
        replied: false,
        deferred: false,
        reply: jest.fn().mockResolvedValue(undefined)
      };

      // ===== ACT: Execute command =====
      await setupCommand.execute(commandInteraction);

      // ===== ASSERT: Bot should allow access =====
      expect(commandInteraction.reply).toHaveBeenCalledTimes(1);
      const replyCall = commandInteraction.reply.mock.calls[0][0];

      expect(replyCall.content).toMatch(/Server Access Control Setup/i);
      expect(replyCall.content).not.toMatch(/Permission Denied/i);
      expect(replyCall.components).toBeDefined();
    });
  });

  describe('Role Auto-Detection', () => {
    it('E2E: Setup wizard detects and suggests subscription roles', async () => {
      // ===== STEP 1: Start setup wizard =====
      const commandInteraction = {
        guildId: mockGuild.id,
        user: { id: '1111111111111111111' },
        replied: false,
        deferred: false,
        reply: jest.fn().mockResolvedValue(undefined)
      };

      await setupCommand.execute(commandInteraction);

      // ===== STEP 2: Click "Subscription Required" =====
      const buttonInteraction = {
        customId: 'setup_subscription_required',
        guildId: mockGuild.id,
        user: { id: '1111111111111111111' },
        update: jest.fn().mockResolvedValue(undefined)
      };

      await setupCommand.handleButton(buttonInteraction);

      // ===== ASSERT: Detected subscription roles should be in dropdown =====
      const updateCall = buttonInteraction.update.mock.calls[0][0];
      const selectMenu = updateCall.components[0].components[0];
      const options = selectMenu.data.options;

      // Should detect: Subscriber, Premium, Member, Supporter (4 roles match patterns)
      const detectedRoles = options.filter(opt =>
        opt.description && opt.description.includes('Auto-detected')
      );

      expect(detectedRoles.length).toBeGreaterThanOrEqual(4);

      // Verify specific roles are detected
      const roleNames = options.map(opt => opt.label);
      expect(roleNames).toContain('Subscriber');
      expect(roleNames).toContain('Premium');
      expect(roleNames).toContain('Member');
      expect(roleNames).toContain('Supporter');

      // Admin should NOT be auto-detected (not a subscription pattern)
      const adminOption = options.find(opt => opt.label === 'Admin');
      expect(adminOption?.description).not.toMatch(/Auto-detected/i);
    });

    it('E2E: Setup wizard warns when no subscription roles detected', async () => {
      // ===== ARRANGE: Guild with only admin roles =====
      mockGuild.roles.cache.clear();
      mockGuild.roles.cache.set('@everyone', {
        id: '@everyone',
        name: '@everyone',
        position: 0
      });
      mockGuild.roles.cache.set('6666666666666666666', {
        id: '6666666666666666666',
        name: 'Admin',
        position: 10
      });
      mockGuild.roles.cache.set('7777777777777777777', {
        id: '7777777777777777777',
        name: 'Moderator',
        position: 5
      });

      // ===== STEP 1: Start setup and select subscription required =====
      const commandInteraction = {
        guildId: mockGuild.id,
        user: { id: '1111111111111111111' },
        replied: false,
        deferred: false,
        reply: jest.fn().mockResolvedValue(undefined)
      };

      await setupCommand.execute(commandInteraction);

      const buttonInteraction = {
        customId: 'setup_subscription_required',
        guildId: mockGuild.id,
        user: { id: '1111111111111111111' },
        update: jest.fn().mockResolvedValue(undefined)
      };

      await setupCommand.handleButton(buttonInteraction);

      // ===== ASSERT: Should display warning about no subscription roles =====
      const updateCall = buttonInteraction.update.mock.calls[0][0];
      expect(updateCall.content).toMatch(/Warning/i);
      expect(updateCall.content).toMatch(/No subscription roles detected/i);
    });
  });

  describe('Error Handling', () => {
    it('E2E: Handles database errors gracefully', async () => {
      // ===== ARRANGE: Mock database error =====
      jest.spyOn(ServerConfiguration, 'create').mockRejectedValueOnce(
        new Error('Database connection failed')
      );

      // ===== STEP 1: Complete setup flow =====
      const commandInteraction = {
        guildId: mockGuild.id,
        user: { id: '1111111111111111111' },
        replied: false,
        deferred: false,
        reply: jest.fn().mockResolvedValue(undefined)
      };

      await setupCommand.execute(commandInteraction);

      const buttonInteraction = {
        customId: 'setup_open_access',
        guildId: mockGuild.id,
        user: { id: '1111111111111111111' },
        update: jest.fn().mockResolvedValue(undefined)
      };

      // ===== ACT: Button should trigger database save (which will fail) =====
      await setupCommand.handleButton(buttonInteraction);

      // ===== ASSERT: Should display user-friendly error message =====
      const updateCall = buttonInteraction.update.mock.calls[0][0];
      expect(updateCall.content).toMatch(/error occurred/i);
      expect(updateCall.content).toMatch(/try again/i);
      expect(updateCall.components).toHaveLength(0);
    });

    it('E2E: Handles Discord API errors gracefully', async () => {
      // ===== ARRANGE: Mock Discord API error =====
      mockClient.guilds.fetch.mockRejectedValueOnce(
        new Error('Discord API rate limit exceeded')
      );

      // ===== ACT: Execute command (will try to fetch guild) =====
      const commandInteraction = {
        guildId: mockGuild.id,
        user: { id: '1111111111111111111' },
        replied: false,
        deferred: false,
        reply: jest.fn().mockResolvedValue(undefined),
        editReply: jest.fn().mockResolvedValue(undefined)
      };

      await setupCommand.execute(commandInteraction);

      // ===== ASSERT: Should display user-friendly error =====
      expect(commandInteraction.reply).toHaveBeenCalled();
      const replyCall = commandInteraction.reply.mock.calls[0][0];

      expect(replyCall.content).toMatch(/error occurred/i);
      expect(replyCall.ephemeral).toBe(true);
    });
  });

  describe('Reconfiguration Flow', () => {
    it('E2E: Server owner can reconfigure existing setup', async () => {
      // ===== STEP 1: Create initial configuration =====
      await ServerConfiguration.create({
        guildId: mockGuild.id,
        accessMode: 'open_access',
        requiredRoleIds: [],
        modifiedBy: '1111111111111111111',
        isActive: true
      });

      // ===== STEP 2: Start setup wizard again =====
      const commandInteraction = {
        guildId: mockGuild.id,
        user: { id: '1111111111111111111' },
        replied: false,
        deferred: false,
        reply: jest.fn().mockResolvedValue(undefined)
      };

      await setupCommand.execute(commandInteraction);

      // ===== ASSERT: Should show current configuration =====
      const replyCall = commandInteraction.reply.mock.calls[0][0];
      expect(replyCall.content).toMatch(/Current Configuration/i);
      expect(replyCall.content).toMatch(/Open Access/i);
      expect(replyCall.content).toMatch(/reconfigure/i);

      // ===== STEP 3: Change to subscription required =====
      const buttonInteraction = {
        customId: 'setup_subscription_required',
        guildId: mockGuild.id,
        user: { id: '1111111111111111111' },
        update: jest.fn().mockResolvedValue(undefined)
      };

      await setupCommand.handleButton(buttonInteraction);

      const selectMenuInteraction = {
        customId: 'setup_role_select',
        values: ['2222222222222222222'],
        guildId: mockGuild.id,
        user: { id: '1111111111111111111' },
        update: jest.fn().mockResolvedValue(undefined)
      };

      await setupCommand.handleSelectMenu(selectMenuInteraction);

      // ===== ASSERT: Configuration should be updated =====
      const updatedConfig = await ServerConfiguration.findOne({ guildId: mockGuild.id });
      expect(updatedConfig.accessMode).toBe('subscription_required');
      expect(updatedConfig.requiredRoleIds).toEqual(['2222222222222222222']);
    });
  });
});
