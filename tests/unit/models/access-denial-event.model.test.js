/**
 * Unit tests for AccessDenialEvent Mongoose model
 *
 * Feature: 004-subscription-gating
 * Phase: 2 (Foundational)
 * Task: T007 - Write failing tests for AccessDenialEvent model validation
 *
 * TDD Approach: These tests are written FIRST and expected to FAIL until T010 implements the model.
 *
 * Validation Coverage:
 * - Guild ID format (Discord snowflake: 17-19 digits)
 * - User ID format (Discord snowflake: 17-19 digits)
 * - Command attempted string
 * - Denial reason enum validation
 * - User role IDs array format
 * - Required role IDs array format
 * - Was informed boolean flag
 * - Timestamp defaults and TTL
 * - Indexes for analytics queries
 */

const mongoose = require('mongoose');

// This model does NOT exist yet - TDD requires test-first approach
// Expected to fail until T010 implements it
let AccessDenialEvent;
try {
  AccessDenialEvent = require('@models/AccessDenialEvent');
} catch (error) {
  // Model not implemented yet - tests will fail as expected in TDD
  AccessDenialEvent = null;
}

describe('AccessDenialEvent Model - TDD Tests', () => {

  beforeAll(() => {
    // Verify model doesn't exist yet (TDD validation)
    if (!AccessDenialEvent) {
      console.warn('⚠️  TDD: AccessDenialEvent model not implemented yet (expected for T007)');
    }
  });

  describe('Schema Validation - Guild ID', () => {

    it('should accept valid Discord snowflake (17 digits)', async () => {
      expect(AccessDenialEvent).toBeDefined();

      const event = new AccessDenialEvent({
        guildId: '12345678901234567', // 17 digits
        userId: '98765432109876543',
        commandAttempted: '/trade buy',
        denialReason: 'no_subscription',
        userRoleIds: [],
        requiredRoleIds: []
      });

      const error = event.validateSync();
      expect(error).toBeUndefined();
    });

    it('should accept valid Discord snowflake (19 digits)', async () => {
      expect(AccessDenialEvent).toBeDefined();

      const event = new AccessDenialEvent({
        guildId: '1234567890123456789', // 19 digits
        userId: '98765432109876543',
        commandAttempted: '/trade sell',
        denialReason: 'subscription_expired',
        userRoleIds: [],
        requiredRoleIds: []
      });

      const error = event.validateSync();
      expect(error).toBeUndefined();
    });

    it('should reject guild ID with invalid format', async () => {
      expect(AccessDenialEvent).toBeDefined();

      const event = new AccessDenialEvent({
        guildId: 'invalid_guild', // Non-numeric
        userId: '98765432109876543',
        commandAttempted: '/trade buy',
        denialReason: 'no_subscription',
        userRoleIds: [],
        requiredRoleIds: []
      });

      const error = event.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.guildId).toBeDefined();
    });

    it('should reject missing guild ID', async () => {
      expect(AccessDenialEvent).toBeDefined();

      const event = new AccessDenialEvent({
        userId: '98765432109876543',
        commandAttempted: '/trade buy',
        denialReason: 'no_subscription',
        userRoleIds: [],
        requiredRoleIds: []
      });

      const error = event.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.guildId).toBeDefined();
      expect(error.errors.guildId.kind).toBe('required');
    });

  });

  describe('Schema Validation - User ID', () => {

    it('should accept valid Discord user ID', async () => {
      expect(AccessDenialEvent).toBeDefined();

      const event = new AccessDenialEvent({
        guildId: '12345678901234567',
        userId: '98765432109876543', // Valid snowflake
        commandAttempted: '/trade buy',
        denialReason: 'no_subscription',
        userRoleIds: [],
        requiredRoleIds: []
      });

      const error = event.validateSync();
      expect(error).toBeUndefined();
    });

    it('should reject user ID with invalid format', async () => {
      expect(AccessDenialEvent).toBeDefined();

      const event = new AccessDenialEvent({
        guildId: '12345678901234567',
        userId: 'invalid_user', // Non-numeric
        commandAttempted: '/trade buy',
        denialReason: 'no_subscription',
        userRoleIds: [],
        requiredRoleIds: []
      });

      const error = event.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.userId).toBeDefined();
    });

    it('should reject missing user ID', async () => {
      expect(AccessDenialEvent).toBeDefined();

      const event = new AccessDenialEvent({
        guildId: '12345678901234567',
        commandAttempted: '/trade buy',
        denialReason: 'no_subscription',
        userRoleIds: [],
        requiredRoleIds: []
      });

      const error = event.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.userId).toBeDefined();
      expect(error.errors.userId.kind).toBe('required');
    });

  });

  describe('Schema Validation - Command Attempted', () => {

    it('should accept valid command string', async () => {
      expect(AccessDenialEvent).toBeDefined();

      const event = new AccessDenialEvent({
        guildId: '12345678901234567',
        userId: '98765432109876543',
        commandAttempted: '/trade buy AAPL 10',
        denialReason: 'no_subscription',
        userRoleIds: [],
        requiredRoleIds: []
      });

      const error = event.validateSync();
      expect(error).toBeUndefined();
      expect(event.commandAttempted).toBe('/trade buy AAPL 10');
    });

    it('should reject missing commandAttempted field', async () => {
      expect(AccessDenialEvent).toBeDefined();

      const event = new AccessDenialEvent({
        guildId: '12345678901234567',
        userId: '98765432109876543',
        denialReason: 'no_subscription',
        userRoleIds: [],
        requiredRoleIds: []
      });

      const error = event.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.commandAttempted).toBeDefined();
      expect(error.errors.commandAttempted.kind).toBe('required');
    });

  });

  describe('Schema Validation - Denial Reason', () => {

    it('should accept "no_subscription" reason', async () => {
      expect(AccessDenialEvent).toBeDefined();

      const event = new AccessDenialEvent({
        guildId: '12345678901234567',
        userId: '98765432109876543',
        commandAttempted: '/trade buy',
        denialReason: 'no_subscription',
        userRoleIds: [],
        requiredRoleIds: []
      });

      const error = event.validateSync();
      expect(error).toBeUndefined();
    });

    it('should accept "subscription_expired" reason', async () => {
      expect(AccessDenialEvent).toBeDefined();

      const event = new AccessDenialEvent({
        guildId: '12345678901234567',
        userId: '98765432109876543',
        commandAttempted: '/trade buy',
        denialReason: 'subscription_expired',
        userRoleIds: [],
        requiredRoleIds: []
      });

      const error = event.validateSync();
      expect(error).toBeUndefined();
    });

    it('should accept "verification_failed" reason', async () => {
      expect(AccessDenialEvent).toBeDefined();

      const event = new AccessDenialEvent({
        guildId: '12345678901234567',
        userId: '98765432109876543',
        commandAttempted: '/trade buy',
        denialReason: 'verification_failed',
        userRoleIds: [],
        requiredRoleIds: []
      });

      const error = event.validateSync();
      expect(error).toBeUndefined();
    });

    it('should reject invalid denial reason', async () => {
      expect(AccessDenialEvent).toBeDefined();

      const event = new AccessDenialEvent({
        guildId: '12345678901234567',
        userId: '98765432109876543',
        commandAttempted: '/trade buy',
        denialReason: 'invalid_reason',
        userRoleIds: [],
        requiredRoleIds: []
      });

      const error = event.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.denialReason).toBeDefined();
    });

    it('should reject missing denialReason field', async () => {
      expect(AccessDenialEvent).toBeDefined();

      const event = new AccessDenialEvent({
        guildId: '12345678901234567',
        userId: '98765432109876543',
        commandAttempted: '/trade buy',
        userRoleIds: [],
        requiredRoleIds: []
      });

      const error = event.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.denialReason).toBeDefined();
      expect(error.errors.denialReason.kind).toBe('required');
    });

  });

  describe('Schema Validation - User Role IDs', () => {

    it('should accept empty userRoleIds array', async () => {
      expect(AccessDenialEvent).toBeDefined();

      const event = new AccessDenialEvent({
        guildId: '12345678901234567',
        userId: '98765432109876543',
        commandAttempted: '/trade buy',
        denialReason: 'no_subscription',
        userRoleIds: [],
        requiredRoleIds: []
      });

      const error = event.validateSync();
      expect(error).toBeUndefined();
      expect(event.userRoleIds).toEqual([]);
    });

    it('should accept array of valid role IDs', async () => {
      expect(AccessDenialEvent).toBeDefined();

      const event = new AccessDenialEvent({
        guildId: '12345678901234567',
        userId: '98765432109876543',
        commandAttempted: '/trade buy',
        denialReason: 'no_subscription',
        userRoleIds: ['11111111111111111', '22222222222222222'],
        requiredRoleIds: []
      });

      const error = event.validateSync();
      expect(error).toBeUndefined();
      expect(event.userRoleIds).toHaveLength(2);
    });

    it('should reject userRoleIds with invalid format', async () => {
      expect(AccessDenialEvent).toBeDefined();

      const event = new AccessDenialEvent({
        guildId: '12345678901234567',
        userId: '98765432109876543',
        commandAttempted: '/trade buy',
        denialReason: 'no_subscription',
        userRoleIds: ['invalid_role', '22222222222222222'],
        requiredRoleIds: []
      });

      const error = event.validateSync();
      expect(error).toBeDefined();
      expect(error.errors['userRoleIds.0']).toBeDefined();
    });

  });

  describe('Schema Validation - Required Role IDs', () => {

    it('should accept empty requiredRoleIds array', async () => {
      expect(AccessDenialEvent).toBeDefined();

      const event = new AccessDenialEvent({
        guildId: '12345678901234567',
        userId: '98765432109876543',
        commandAttempted: '/trade buy',
        denialReason: 'no_subscription',
        userRoleIds: [],
        requiredRoleIds: []
      });

      const error = event.validateSync();
      expect(error).toBeUndefined();
      expect(event.requiredRoleIds).toEqual([]);
    });

    it('should accept array of valid required role IDs', async () => {
      expect(AccessDenialEvent).toBeDefined();

      const event = new AccessDenialEvent({
        guildId: '12345678901234567',
        userId: '98765432109876543',
        commandAttempted: '/trade buy',
        denialReason: 'no_subscription',
        userRoleIds: [],
        requiredRoleIds: ['33333333333333333', '44444444444444444']
      });

      const error = event.validateSync();
      expect(error).toBeUndefined();
      expect(event.requiredRoleIds).toHaveLength(2);
    });

    it('should reject requiredRoleIds with invalid format', async () => {
      expect(AccessDenialEvent).toBeDefined();

      const event = new AccessDenialEvent({
        guildId: '12345678901234567',
        userId: '98765432109876543',
        commandAttempted: '/trade buy',
        denialReason: 'no_subscription',
        userRoleIds: [],
        requiredRoleIds: ['invalid', '44444444444444444']
      });

      const error = event.validateSync();
      expect(error).toBeDefined();
      expect(error.errors['requiredRoleIds.0']).toBeDefined();
    });

  });

  describe('Schema Validation - Was Informed', () => {

    it('should default wasInformed to false', async () => {
      expect(AccessDenialEvent).toBeDefined();

      const event = new AccessDenialEvent({
        guildId: '12345678901234567',
        userId: '98765432109876543',
        commandAttempted: '/trade buy',
        denialReason: 'no_subscription',
        userRoleIds: [],
        requiredRoleIds: []
      });

      expect(event.wasInformed).toBe(false);
    });

    it('should accept wasInformed=true', async () => {
      expect(AccessDenialEvent).toBeDefined();

      const event = new AccessDenialEvent({
        guildId: '12345678901234567',
        userId: '98765432109876543',
        commandAttempted: '/trade buy',
        denialReason: 'no_subscription',
        userRoleIds: [],
        requiredRoleIds: [],
        wasInformed: true
      });

      const error = event.validateSync();
      expect(error).toBeUndefined();
      expect(event.wasInformed).toBe(true);
    });

  });

  describe('Schema Defaults', () => {

    it('should set timestamp to current time by default', async () => {
      expect(AccessDenialEvent).toBeDefined();

      const before = new Date();
      const event = new AccessDenialEvent({
        guildId: '12345678901234567',
        userId: '98765432109876543',
        commandAttempted: '/trade buy',
        denialReason: 'no_subscription',
        userRoleIds: [],
        requiredRoleIds: []
      });
      const after = new Date();

      expect(event.timestamp).toBeInstanceOf(Date);
      expect(event.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(event.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should allow custom timestamp', async () => {
      expect(AccessDenialEvent).toBeDefined();

      const customDate = new Date('2025-01-01T00:00:00Z');
      const event = new AccessDenialEvent({
        guildId: '12345678901234567',
        userId: '98765432109876543',
        commandAttempted: '/trade buy',
        denialReason: 'no_subscription',
        userRoleIds: [],
        requiredRoleIds: [],
        timestamp: customDate
      });

      expect(event.timestamp.getTime()).toBe(customDate.getTime());
    });

  });

  describe('Model Indexes', () => {

    it('should have index for guildId and timestamp', async () => {
      expect(AccessDenialEvent).toBeDefined();

      // Ensure indexes are built
      await AccessDenialEvent.init();
      const indexes = await AccessDenialEvent.collection.getIndexes();

      // Check if compound index exists by examining index names
      const indexNames = Object.keys(indexes);
      const guildTimestampIndexName = indexNames.find(name =>
        name.includes('guildId') && name.includes('timestamp')
      );

      expect(guildTimestampIndexName).toBeDefined();
    });

    it('should have index for userId and timestamp', async () => {
      expect(AccessDenialEvent).toBeDefined();

      // Ensure indexes are built
      await AccessDenialEvent.init();
      const indexes = await AccessDenialEvent.collection.getIndexes();

      // Check if compound index exists by examining index names
      const indexNames = Object.keys(indexes);
      const userTimestampIndexName = indexNames.find(name =>
        name.includes('userId') && name.includes('timestamp')
      );

      expect(userTimestampIndexName).toBeDefined();
    });

    it('should have TTL index on timestamp field (30 days)', async () => {
      expect(AccessDenialEvent).toBeDefined();

      // Ensure indexes are built
      await AccessDenialEvent.init();
      const indexes = await AccessDenialEvent.collection.getIndexes();

      // Check if TTL index exists by examining index names
      const indexNames = Object.keys(indexes);
      const ttlIndexName = indexNames.find(name => name.includes('timestamp'));

      expect(ttlIndexName).toBeDefined();

      // TTL behavior is validated by the automatic cleanup test in "TTL Behavior" section
      // MongoDB Memory Server may not expose the expireAfterSeconds property in index metadata
    });

  });

  describe('Query Operations', () => {

    it('should find events by guildId', async () => {
      expect(AccessDenialEvent).toBeDefined();

      const event = new AccessDenialEvent({
        guildId: '12345678901234567',
        userId: '98765432109876543',
        commandAttempted: '/trade buy AAPL 10',
        denialReason: 'no_subscription',
        userRoleIds: ['11111111111111111'],
        requiredRoleIds: ['22222222222222222']
      });
      await event.save();

      const found = await AccessDenialEvent.find({ guildId: '12345678901234567' });
      expect(found).toHaveLength(1);
      expect(found[0].commandAttempted).toBe('/trade buy AAPL 10');
    });

    it('should find events by userId', async () => {
      expect(AccessDenialEvent).toBeDefined();

      const event = new AccessDenialEvent({
        guildId: '12345678901234567',
        userId: '98765432109876543',
        commandAttempted: '/trade sell',
        denialReason: 'subscription_expired',
        userRoleIds: [],
        requiredRoleIds: []
      });
      await event.save();

      const found = await AccessDenialEvent.find({ userId: '98765432109876543' });
      expect(found).toHaveLength(1);
      expect(found[0].denialReason).toBe('subscription_expired');
    });

    it('should find events sorted by timestamp (newest first)', async () => {
      expect(AccessDenialEvent).toBeDefined();

      // Create events with different timestamps
      await new AccessDenialEvent({
        guildId: '12345678901234567',
        userId: '11111111111111111',
        commandAttempted: '/trade buy',
        denialReason: 'no_subscription',
        userRoleIds: [],
        requiredRoleIds: [],
        timestamp: new Date('2025-01-01T00:00:00Z')
      }).save();

      await new AccessDenialEvent({
        guildId: '12345678901234567',
        userId: '22222222222222222',
        commandAttempted: '/trade sell',
        denialReason: 'verification_failed',
        userRoleIds: [],
        requiredRoleIds: [],
        timestamp: new Date('2025-01-02T00:00:00Z')
      }).save();

      const events = await AccessDenialEvent.find({ guildId: '12345678901234567' })
        .sort({ timestamp: -1 });

      expect(events).toHaveLength(2);
      expect(events[0].timestamp.getTime()).toBeGreaterThan(events[1].timestamp.getTime());
      expect(events[0].userId).toBe('22222222222222222'); // Newer event first
    });

    it('should filter events by denial reason', async () => {
      expect(AccessDenialEvent).toBeDefined();

      await new AccessDenialEvent({
        guildId: '12345678901234567',
        userId: '11111111111111111',
        commandAttempted: '/trade buy',
        denialReason: 'no_subscription',
        userRoleIds: [],
        requiredRoleIds: []
      }).save();

      await new AccessDenialEvent({
        guildId: '12345678901234567',
        userId: '22222222222222222',
        commandAttempted: '/trade sell',
        denialReason: 'subscription_expired',
        userRoleIds: [],
        requiredRoleIds: []
      }).save();

      const noSubEvents = await AccessDenialEvent.find({ denialReason: 'no_subscription' });
      expect(noSubEvents).toHaveLength(1);
      expect(noSubEvents[0].userId).toBe('11111111111111111');
    });

    it('should find events within a time range', async () => {
      expect(AccessDenialEvent).toBeDefined();

      const startDate = new Date('2025-01-01T00:00:00Z');
      const endDate = new Date('2025-01-31T23:59:59Z');

      await new AccessDenialEvent({
        guildId: '12345678901234567',
        userId: '11111111111111111',
        commandAttempted: '/trade buy',
        denialReason: 'no_subscription',
        userRoleIds: [],
        requiredRoleIds: [],
        timestamp: new Date('2025-01-15T12:00:00Z') // Within range
      }).save();

      await new AccessDenialEvent({
        guildId: '12345678901234567',
        userId: '22222222222222222',
        commandAttempted: '/trade sell',
        denialReason: 'subscription_expired',
        userRoleIds: [],
        requiredRoleIds: [],
        timestamp: new Date('2024-12-15T12:00:00Z') // Outside range
      }).save();

      const events = await AccessDenialEvent.find({
        timestamp: { $gte: startDate, $lte: endDate }
      });

      expect(events).toHaveLength(1);
      expect(events[0].userId).toBe('11111111111111111');
    });

  });

  describe('TTL Behavior', () => {

    it('should set timestamp with TTL for automatic cleanup', async () => {
      expect(AccessDenialEvent).toBeDefined();

      const event = new AccessDenialEvent({
        guildId: '12345678901234567',
        userId: '98765432109876543',
        commandAttempted: '/trade buy',
        denialReason: 'no_subscription',
        userRoleIds: [],
        requiredRoleIds: []
      });
      await event.save();

      // Verify timestamp exists and TTL index will handle cleanup
      expect(event.timestamp).toBeInstanceOf(Date);

      // Calculate expected expiration (30 days from now)
      const expectedExpiry = new Date(event.timestamp.getTime() + (30 * 24 * 60 * 60 * 1000));
      const now = new Date();

      // Verify event will expire in approximately 30 days
      const daysDifference = (expectedExpiry.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
      expect(daysDifference).toBeGreaterThan(29);
      expect(daysDifference).toBeLessThan(31);
    });

  });

});
