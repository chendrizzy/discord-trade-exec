/**
 * E2E tests for Setup Wizard
 *
 * Feature: 004-subscription-gating
 * Phase: 3 (User Story 1 - Initial Bot Setup)
 * Task: T022 - Write failing E2E test for setup wizard interaction
 *
 * TDD Approach: These tests are written FIRST and expected to FAIL until implementation is complete.
 *
 * Test Coverage:
 * - Complete setup wizard flow from command invocation to configuration save
 * - Button interaction handling (Subscription Required vs Open Access)
 * - Role selection interactions
 * - Permission verification
 * - Configuration persistence
 * - User feedback messages
 *
 * Testing Strategy:
 * - Mock Discord.js Client, Guild, Interaction, and Button components
 * - Simulate user interactions via button clicks
 * - Verify database state changes
 * - Validate user-facing messages
 *
 * Performance Requirements:
 * - Setup wizard should complete in <5s for user interaction
 * - Role detection should complete in <2s
 */

const ServerConfiguration = require('@models/ServerConfiguration');

// Mock Discord.js
jest.mock('discord.js', () => ({
  Client: jest.fn(),
  GatewayIntentBits: {},
  Interaction: jest.fn(),
  ActionRowBuilder: jest.fn().mockImplementation(() => ({
    addComponents: jest.fn().mockReturnThis(),
    components: []
  })),
  ButtonBuilder: jest.fn().mockImplementation(() => ({
    setCustomId: jest.fn().mockReturnThis(),
    setLabel: jest.fn().mockReturnThis(),
    setStyle: jest.fn().mockReturnThis()
  })),
  ButtonStyle: {
    Primary: 1,
    Secondary: 2,
    Success: 3,
    Danger: 4
  },
  PermissionFlagsBits: {
    ManageGuild: 1n << 5n
  },
  SlashCommandBuilder: jest.fn().mockImplementation(() => ({
    setName: jest.fn().mockReturnThis(),
    setDescription: jest.fn().mockReturnThis(),
    addSubcommand: jest.fn().mockReturnThis(),
    setDefaultMemberPermissions: jest.fn().mockReturnThis()
  })),
  StringSelectMenuBuilder: jest.fn().mockImplementation(() => ({
    setCustomId: jest.fn().mockReturnThis(),
    setPlaceholder: jest.fn().mockReturnThis(),
    setMinValues: jest.fn().mockReturnThis(),
    setMaxValues: jest.fn().mockReturnThis(),
    addOptions: jest.fn().mockReturnThis()
  })),
  StringSelectMenuOptionBuilder: jest.fn().mockImplementation(() => ({
    setLabel: jest.fn().mockReturnThis(),
    setValue: jest.fn().mockReturnThis(),
    setDescription: jest.fn().mockReturnThis(),
    setDefault: jest.fn().mockReturnThis()
  }))
}));

describe('Setup Wizard - E2E Flow', () => {
  let mockClient;
  let mockGuild;
  let mockInteraction;
  let mockUser;
  let mockMember;
  let setupWizardService;
  let configureAccessCommand;

  beforeEach(async () => {
    // Clear database before each test
    await ServerConfiguration.deleteMany({});

    // Reset all mocks
    jest.clearAllMocks();

    // Mock Discord User
    mockUser = {
      id: '1111111111111111111',
      username: 'ServerOwner',
      tag: 'ServerOwner#1234'
    };

    // Mock Discord GuildMember with owner permissions
    mockMember = {
      id: mockUser.id,
      user: mockUser,
      permissions: {
        has: jest.fn().mockReturnValue(true) // Has MANAGE_GUILD permission
      },
      roles: {
        cache: new Map()
      }
    };

    // Mock Discord Guild
    mockGuild = {
      id: '1234567890123456789',
      name: 'Test Server',
      ownerId: mockUser.id,
      members: {
        fetch: jest.fn().mockResolvedValue(mockMember)
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

    // Mock Discord Interaction (slash command)
    mockInteraction = {
      guildId: mockGuild.id,
      guild: mockGuild,
      user: mockUser,
      member: mockMember,
      commandName: 'setup',
      options: {
        getSubcommand: jest.fn().mockReturnValue('configure-access')
      },
      reply: jest.fn().mockResolvedValue(undefined),
      editReply: jest.fn().mockResolvedValue(undefined),
      followUp: jest.fn().mockResolvedValue(undefined),
      deferReply: jest.fn().mockResolvedValue(undefined),
      isCommand: jest.fn().mockReturnValue(true),
      isChatInputCommand: jest.fn().mockReturnValue(true)
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
  });

  describe('Complete Setup Wizard Flow', () => {
    it('should complete full setup wizard from start to finish', async () => {
      // ARRANGE: User invokes /setup configure-access command
      const startTime = Date.now();

      // ACT: Execute setup command
      // This will fail until T025 implementation exists
      const SetupCommand = require('@commands/setup/configure-access.command');
      const command = new SetupCommand(mockClient);

      await command.execute(mockInteraction);

      // ASSERT: Wizard should display initial choice buttons
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('configure access control'),
          components: expect.arrayContaining([
            expect.objectContaining({
              components: expect.arrayContaining([
                expect.objectContaining({
                  customId: 'setup_subscription_required',
                  label: expect.stringContaining('Subscription Required')
                }),
                expect.objectContaining({
                  customId: 'setup_open_access',
                  label: expect.stringContaining('Open Access')
                })
              ])
            })
          ]),
          ephemeral: true
        })
      );

      // ASSERT: Response time should be < 5s
      const elapsedTime = Date.now() - startTime;
      expect(elapsedTime).toBeLessThan(5000);
    });

    it('should handle "Subscription Required" selection and show role picker', async () => {
      // ARRANGE: User clicks "Subscription Required" button
      const buttonInteraction = {
        ...mockInteraction,
        customId: 'setup_subscription_required',
        isButton: jest.fn().mockReturnValue(true),
        update: jest.fn().mockResolvedValue(undefined)
      };

      const SetupCommand = require('@commands/setup/configure-access.command');
      const command = new SetupCommand(mockClient);

      // ACT: Handle button interaction
      await command.handleButton(buttonInteraction);

      // ASSERT: Should update with role selection UI
      expect(buttonInteraction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('select subscription roles'),
          components: expect.arrayContaining([
            expect.objectContaining({
              type: 3, // SELECT_MENU
              customId: 'setup_role_select',
              placeholder: expect.stringContaining('Select roles'),
              options: expect.arrayContaining([
                expect.objectContaining({
                  label: 'Subscriber',
                  value: '2222222222222222222'
                }),
                expect.objectContaining({
                  label: 'Premium',
                  value: '3333333333333333333'
                }),
                expect.objectContaining({
                  label: 'Supporter',
                  value: '5555555555555555555'
                })
              ])
            })
          ])
        })
      );
    });

    it('should save configuration when roles are selected', async () => {
      // ARRANGE: User selects subscription roles
      const selectInteraction = {
        ...mockInteraction,
        customId: 'setup_role_select',
        values: ['2222222222222222222', '3333333333333333333'], // Subscriber + Premium
        isSelectMenu: jest.fn().mockReturnValue(true),
        update: jest.fn().mockResolvedValue(undefined)
      };

      const SetupCommand = require('@commands/setup/configure-access.command');
      const command = new SetupCommand(mockClient);

      // ACT: Handle select menu interaction
      await command.handleSelectMenu(selectInteraction);

      // ASSERT: Configuration should be saved to database
      const config = await ServerConfiguration.findOne({ guildId: mockGuild.id });
      expect(config).toBeDefined();
      expect(config.accessMode).toBe('subscription_required');
      expect(config.requiredRoleIds).toEqual(['2222222222222222222', '3333333333333333333']);
      expect(config.modifiedBy).toBe(mockUser.id);
      expect(config.modifiedAt).toBeInstanceOf(Date);

      // ASSERT: User should receive success confirmation
      expect(selectInteraction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringMatching(/configuration saved|setup complete/i),
          components: [], // Buttons should be removed after completion
          ephemeral: true
        })
      );
    });

    it('should handle "Open Access" selection immediately', async () => {
      // ARRANGE: User clicks "Open Access" button
      const buttonInteraction = {
        ...mockInteraction,
        customId: 'setup_open_access',
        isButton: jest.fn().mockReturnValue(true),
        update: jest.fn().mockResolvedValue(undefined)
      };

      const SetupCommand = require('@commands/setup/configure-access.command');
      const command = new SetupCommand(mockClient);

      // ACT: Handle button interaction
      await command.handleButton(buttonInteraction);

      // ASSERT: Configuration should be saved immediately (no role selection needed)
      const config = await ServerConfiguration.findOne({ guildId: mockGuild.id });
      expect(config).toBeDefined();
      expect(config.accessMode).toBe('open_access');
      expect(config.requiredRoleIds).toEqual([]);
      expect(config.modifiedBy).toBe(mockUser.id);

      // ASSERT: User should receive success confirmation
      expect(buttonInteraction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringMatching(/open access enabled|setup complete/i),
          components: [],
          ephemeral: true
        })
      );
    });

    it('should detect and suggest subscription roles automatically', async () => {
      // ARRANGE: Guild has roles with subscription-related names
      const SetupCommand = require('@commands/setup/configure-access.command');
      const command = new SetupCommand(mockClient);

      // ACT: Execute setup command
      await command.execute(mockInteraction);

      // Simulate "Subscription Required" button click
      const buttonInteraction = {
        ...mockInteraction,
        customId: 'setup_subscription_required',
        isButton: jest.fn().mockReturnValue(true),
        update: jest.fn().mockResolvedValue(undefined)
      };

      await command.handleButton(buttonInteraction);

      // ASSERT: Should auto-detect and highlight subscription-related roles
      expect(buttonInteraction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          components: expect.arrayContaining([
            expect.objectContaining({
              options: expect.arrayContaining([
                expect.objectContaining({
                  label: 'Subscriber',
                  value: '2222222222222222222',
                  description: expect.stringContaining('auto-detected')
                }),
                expect.objectContaining({
                  label: 'Supporter',
                  value: '5555555555555555555',
                  description: expect.stringContaining('auto-detected')
                })
              ])
            })
          ])
        })
      );
    });

    it('should prevent non-owners from using setup command', async () => {
      // ARRANGE: User without MANAGE_GUILD permission
      mockMember.permissions.has.mockReturnValue(false);

      const SetupCommand = require('@commands/setup/configure-access.command');
      const command = new SetupCommand(mockClient);

      // ACT: Execute setup command
      await command.execute(mockInteraction);

      // ASSERT: Should reject with permission error
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringMatching(/permission|manage guild|server owner/i),
          ephemeral: true
        })
      );

      // ASSERT: No configuration should be created
      const config = await ServerConfiguration.findOne({ guildId: mockGuild.id });
      expect(config).toBeNull();
    });

    it('should handle configuration updates (reconfiguration)', async () => {
      // ARRANGE: Existing configuration
      await ServerConfiguration.create({
        guildId: mockGuild.id,
        accessMode: 'open_access',
        requiredRoleIds: [],
        modifiedBy: mockUser.id,
        modifiedAt: new Date()
      });

      const SetupCommand = require('@commands/setup/configure-access.command');
      const command = new SetupCommand(mockClient);

      // ACT: Run setup again to reconfigure
      await command.execute(mockInteraction);

      // ASSERT: Should show reconfiguration message
      expect(mockInteraction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringMatching(/reconfigure|update|current.*open access/i)
        })
      );

      // ACT: Select subscription required this time
      const buttonInteraction = {
        ...mockInteraction,
        customId: 'setup_subscription_required',
        isButton: jest.fn().mockReturnValue(true),
        update: jest.fn().mockResolvedValue(undefined)
      };

      await command.handleButton(buttonInteraction);

      // Select roles
      const selectInteraction = {
        ...mockInteraction,
        customId: 'setup_role_select',
        values: ['2222222222222222222'],
        isSelectMenu: jest.fn().mockReturnValue(true),
        update: jest.fn().mockResolvedValue(undefined)
      };

      await command.handleSelectMenu(selectInteraction);

      // ASSERT: Configuration should be updated
      const config = await ServerConfiguration.findOne({ guildId: mockGuild.id });
      expect(config.accessMode).toBe('subscription_required');
      expect(config.requiredRoleIds).toEqual(['2222222222222222222']);
    });

    it('should warn if no subscription system is detected', async () => {
      // ARRANGE: Guild with no subscription-related roles
      mockGuild.roles.cache.clear();
      mockGuild.roles.cache.set('6666666666666666666', { id: '6666666666666666666', name: 'Admin' });
      mockGuild.roles.cache.set('7777777777777777777', { id: '7777777777777777777', name: 'Moderator' });

      const SetupCommand = require('@commands/setup/configure-access.command');
      const command = new SetupCommand(mockClient);

      // ACT: Execute setup command
      await command.execute(mockInteraction);

      // Simulate "Subscription Required" button click
      const buttonInteraction = {
        ...mockInteraction,
        customId: 'setup_subscription_required',
        isButton: jest.fn().mockReturnValue(true),
        update: jest.fn().mockResolvedValue(undefined)
      };

      await command.handleButton(buttonInteraction);

      // ASSERT: Should display warning about no subscription roles detected
      expect(buttonInteraction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringMatching(/no subscription roles detected|warning/i)
        })
      );
    });

    it('should complete setup within 5 second performance requirement', async () => {
      // ARRANGE
      const startTime = Date.now();

      const SetupCommand = require('@commands/setup/configure-access.command');
      const command = new SetupCommand(mockClient);

      // ACT: Complete full flow
      await command.execute(mockInteraction);

      const buttonInteraction = {
        ...mockInteraction,
        customId: 'setup_open_access',
        isButton: jest.fn().mockReturnValue(true),
        update: jest.fn().mockResolvedValue(undefined)
      };

      await command.handleButton(buttonInteraction);

      const elapsedTime = Date.now() - startTime;

      // ASSERT: Total time should be < 5s
      expect(elapsedTime).toBeLessThan(5000);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // ARRANGE: Mock database error
      jest.spyOn(ServerConfiguration, 'create').mockRejectedValueOnce(new Error('Database connection failed'));

      const buttonInteraction = {
        ...mockInteraction,
        customId: 'setup_open_access',
        isButton: jest.fn().mockReturnValue(true),
        update: jest.fn().mockResolvedValue(undefined)
      };

      const SetupCommand = require('@commands/setup/configure-access.command');
      const command = new SetupCommand(mockClient);

      // ACT: Handle button interaction
      await command.handleButton(buttonInteraction);

      // ASSERT: Should display error message to user
      expect(buttonInteraction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringMatching(/error|failed|try again/i),
          ephemeral: true
        })
      );
    });

    it('should handle role fetch errors gracefully', async () => {
      // ARRANGE: Mock role fetch failure
      mockGuild.roles = {
        cache: {
          values: () => {
            throw new Error('Failed to fetch roles');
          }
        }
      };

      const SetupCommand = require('@commands/setup/configure-access.command');
      const command = new SetupCommand(mockClient);

      // ACT: Execute setup command
      await command.execute(mockInteraction);

      // ASSERT: Should still show basic options without role detection
      expect(mockInteraction.reply).toHaveBeenCalled();
    });

    it('should timeout if role detection takes too long', async () => {
      // ARRANGE: Mock slow role detection (>2s)
      jest.spyOn(Date, 'now')
        .mockReturnValueOnce(0)         // Start time
        .mockReturnValueOnce(2100);     // End time (2.1s)

      const SetupCommand = require('@commands/setup/configure-access.command');
      const command = new SetupCommand(mockClient);

      // ACT: Execute setup with slow role detection
      await command.execute(mockInteraction);

      // ASSERT: Should log warning about slow role detection
      // (Actual timeout implementation will be in T027)
    });
  });
});
