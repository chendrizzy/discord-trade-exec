/**
 * Unit Tests for Subscription Gate Middleware
 *
 * Feature: 004-subscription-gating
 * Phase: 4-5 (User Stories 2-3)
 * Tasks: T031 (middleware tests), T045 (ephemeral denial delivery)
 *
 * TDD MANDATORY - Write tests FIRST, ensure they FAIL before implementation
 */

const { MessageFlags } = require('discord.js');
const { AccessControlService } = require('@services/access-control/AccessControlService');
const { subscriptionGateMiddleware } = require('@middleware/subscription-gate.middleware');

jest.mock('@services/access-control/AccessControlService');

describe('Subscription Gate Middleware - Unit Tests', () => {
  let mockAccessControlService;
  let mockInteraction;
  let mockNext;

  beforeEach(() => {
    jest.clearAllMocks();

    mockAccessControlService = new AccessControlService();
    mockAccessControlService.logDenialEvent = jest.fn().mockResolvedValue({ _id: 'event123' });
    mockNext = jest.fn();

    mockInteraction = {
      guildId: '1234567890123456789',
      user: { id: '9876543210987654321', username: 'TestUser' },
      reply: jest.fn().mockResolvedValue(undefined),
      commandName: 'test-command'
    };
  });

  it('should allow access when checkAccess returns true', async () => {
    // ARRANGE: Access granted
    mockAccessControlService.checkAccess.mockResolvedValue({
      hasAccess: true,
      reason: 'verified_subscription',
      cacheHit: true
    });

    const middleware = subscriptionGateMiddleware(mockAccessControlService);

    // ACT: Execute middleware
    await middleware(mockInteraction, mockNext);

    // ASSERT: Should call next()
    expect(mockNext).toHaveBeenCalled();
    expect(mockInteraction.reply).not.toHaveBeenCalled();
  });

  it('should deny access when checkAccess returns false', async () => {
    // ARRANGE: Access denied
    mockAccessControlService.checkAccess.mockResolvedValue({
      hasAccess: false,
      reason: 'no_subscription',
      requiredRoles: ['1111111111111111111']
    });

    const middleware = subscriptionGateMiddleware(mockAccessControlService);

    // ACT: Execute middleware
    await middleware(mockInteraction, mockNext);

    // ASSERT: Should send rich embed denial message (T045)
    const replyCall = mockInteraction.reply.mock.calls[0][0];

    expect(mockInteraction.reply).toHaveBeenCalledTimes(1);
    expect(replyCall.embeds).toBeDefined();
    expect(replyCall.embeds).toHaveLength(1);

    // Get embed data (EmbedBuilder.data contains the actual embed properties)
    const embedData = replyCall.embeds[0].data || replyCall.embeds[0];

    expect(embedData.title).toBe('🔒 Access Denied');
    expect(embedData.color).toBe(0xED4245);
    expect(embedData.description).toContain('subscription');
    expect(embedData.description).toContain('/test-command');
    expect(replyCall.flags).toBe(MessageFlags.Ephemeral);
    expect(mockNext).not.toHaveBeenCalled();

    // ASSERT: Should log denial event for analytics (T046)
    expect(mockAccessControlService.logDenialEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        guildId: '1234567890123456789',
        userId: '9876543210987654321',
        commandAttempted: '/test-command',
        denialReason: 'no_subscription',
        wasInformed: true
      })
    );
  });

  it('should handle errors gracefully', async () => {
    // ARRANGE: Service error
    mockAccessControlService.checkAccess.mockRejectedValue(
      new Error('Service unavailable')
    );

    const middleware = subscriptionGateMiddleware(mockAccessControlService);

    // ACT: Execute middleware
    await middleware(mockInteraction, mockNext);

    // ASSERT: Should allow access (fail-open for errors)
    expect(mockNext).toHaveBeenCalled();
  });
});
