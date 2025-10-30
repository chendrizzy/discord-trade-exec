/**
 * Unit tests for ServerConfiguration Mongoose model
 *
 * Feature: 004-subscription-gating
 * Phase: 2 (Foundational)
 * Task: T005 - Write failing tests for ServerConfiguration model validation
 *
 * TDD Approach: These tests are written FIRST and expected to FAIL until T008 implements the model.
 *
 * Validation Coverage:
 * - Guild ID format (Discord snowflake: 17-19 digits)
 * - Access control mode enum
 * - Required role IDs format
 * - Required fields presence
 * - Default values
 * - Unique constraints
 * - Indexes
 */

const mongoose = require('mongoose');

// This model does NOT exist yet - TDD requires test-first approach
// Expected to fail until T008 implements it
let ServerConfiguration;
try {
  ServerConfiguration = require('@models/ServerConfiguration');
} catch (error) {
  // Model not implemented yet - tests will fail as expected in TDD
  ServerConfiguration = null;
}

describe('ServerConfiguration Model - TDD Tests', () => {

  beforeAll(() => {
    // Verify model doesn't exist yet (TDD validation)
    if (!ServerConfiguration) {
      console.warn('⚠️  TDD: ServerConfiguration model not implemented yet (expected for T005)');
    }
  });

  describe('Schema Validation - Guild ID', () => {

    it('should accept valid Discord snowflake (17 digits)', async () => {
      expect(ServerConfiguration).toBeDefined();

      const config = new ServerConfiguration({
        guildId: '12345678901234567', // 17 digits
        accessControlMode: 'subscription_required',
        requiredRoleIds: [],
        modifiedBy: '98765432109876543'
      });

      const error = config.validateSync();
      expect(error).toBeUndefined();
    });

    it('should accept valid Discord snowflake (19 digits)', async () => {
      expect(ServerConfiguration).toBeDefined();

      const config = new ServerConfiguration({
        guildId: '1234567890123456789', // 19 digits
        accessControlMode: 'subscription_required',
        requiredRoleIds: [],
        modifiedBy: '98765432109876543'
      });

      const error = config.validateSync();
      expect(error).toBeUndefined();
    });

    it('should reject guild ID shorter than 17 digits', async () => {
      expect(ServerConfiguration).toBeDefined();

      const config = new ServerConfiguration({
        guildId: '1234567890123456', // 16 digits
        accessControlMode: 'subscription_required',
        requiredRoleIds: [],
        modifiedBy: '98765432109876543'
      });

      const error = config.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.guildId).toBeDefined();
    });

    it('should reject guild ID longer than 19 digits', async () => {
      expect(ServerConfiguration).toBeDefined();

      const config = new ServerConfiguration({
        guildId: '12345678901234567890', // 20 digits
        accessControlMode: 'subscription_required',
        requiredRoleIds: [],
        modifiedBy: '98765432109876543'
      });

      const error = config.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.guildId).toBeDefined();
    });

    it('should reject guild ID with non-numeric characters', async () => {
      expect(ServerConfiguration).toBeDefined();

      const config = new ServerConfiguration({
        guildId: '12345678901234567a', // Contains letter
        accessControlMode: 'subscription_required',
        requiredRoleIds: [],
        modifiedBy: '98765432109876543'
      });

      const error = config.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.guildId).toBeDefined();
    });

    it('should reject missing guild ID', async () => {
      expect(ServerConfiguration).toBeDefined();

      const config = new ServerConfiguration({
        accessControlMode: 'subscription_required',
        requiredRoleIds: [],
        modifiedBy: '98765432109876543'
      });

      const error = config.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.guildId).toBeDefined();
      expect(error.errors.guildId.kind).toBe('required');
    });

  });

  describe('Schema Validation - Access Control Mode', () => {

    it('should accept "subscription_required" mode', async () => {
      expect(ServerConfiguration).toBeDefined();

      const config = new ServerConfiguration({
        guildId: '12345678901234567',
        accessControlMode: 'subscription_required',
        requiredRoleIds: [],
        modifiedBy: '98765432109876543'
      });

      const error = config.validateSync();
      expect(error).toBeUndefined();
    });

    it('should accept "open_access" mode', async () => {
      expect(ServerConfiguration).toBeDefined();

      const config = new ServerConfiguration({
        guildId: '12345678901234567',
        accessControlMode: 'open_access',
        requiredRoleIds: [],
        modifiedBy: '98765432109876543'
      });

      const error = config.validateSync();
      expect(error).toBeUndefined();
    });

    it('should reject invalid access control mode', async () => {
      expect(ServerConfiguration).toBeDefined();

      const config = new ServerConfiguration({
        guildId: '12345678901234567',
        accessControlMode: 'invalid_mode',
        requiredRoleIds: [],
        modifiedBy: '98765432109876543'
      });

      const error = config.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.accessControlMode).toBeDefined();
    });

    it('should reject missing access control mode', async () => {
      expect(ServerConfiguration).toBeDefined();

      const config = new ServerConfiguration({
        guildId: '12345678901234567',
        requiredRoleIds: [],
        modifiedBy: '98765432109876543'
      });

      const error = config.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.accessControlMode).toBeDefined();
      expect(error.errors.accessControlMode.kind).toBe('required');
    });

  });

  describe('Schema Validation - Required Role IDs', () => {

    it('should accept empty array for open_access mode', async () => {
      expect(ServerConfiguration).toBeDefined();

      const config = new ServerConfiguration({
        guildId: '12345678901234567',
        accessControlMode: 'open_access',
        requiredRoleIds: [],
        modifiedBy: '98765432109876543'
      });

      const error = config.validateSync();
      expect(error).toBeUndefined();
    });

    it('should accept array of valid role IDs', async () => {
      expect(ServerConfiguration).toBeDefined();

      const config = new ServerConfiguration({
        guildId: '12345678901234567',
        accessControlMode: 'subscription_required',
        requiredRoleIds: ['98765432109876543', '11111111111111111'],
        modifiedBy: '98765432109876543'
      });

      const error = config.validateSync();
      expect(error).toBeUndefined();
    });

    it('should reject role IDs with invalid format', async () => {
      expect(ServerConfiguration).toBeDefined();

      const config = new ServerConfiguration({
        guildId: '12345678901234567',
        accessControlMode: 'subscription_required',
        requiredRoleIds: ['invalid_role', '11111111111111111'],
        modifiedBy: '98765432109876543'
      });

      const error = config.validateSync();
      expect(error).toBeDefined();
      expect(error.errors['requiredRoleIds.0']).toBeDefined();
    });

    it('should reject role IDs shorter than 17 digits', async () => {
      expect(ServerConfiguration).toBeDefined();

      const config = new ServerConfiguration({
        guildId: '12345678901234567',
        accessControlMode: 'subscription_required',
        requiredRoleIds: ['1234567890123456'], // 16 digits
        modifiedBy: '98765432109876543'
      });

      const error = config.validateSync();
      expect(error).toBeDefined();
      expect(error.errors['requiredRoleIds.0']).toBeDefined();
    });

  });

  describe('Schema Validation - Modified By', () => {

    it('should accept valid Discord user ID', async () => {
      expect(ServerConfiguration).toBeDefined();

      const config = new ServerConfiguration({
        guildId: '12345678901234567',
        accessControlMode: 'subscription_required',
        requiredRoleIds: [],
        modifiedBy: '98765432109876543'
      });

      const error = config.validateSync();
      expect(error).toBeUndefined();
    });

    it('should reject invalid user ID format', async () => {
      expect(ServerConfiguration).toBeDefined();

      const config = new ServerConfiguration({
        guildId: '12345678901234567',
        accessControlMode: 'subscription_required',
        requiredRoleIds: [],
        modifiedBy: 'invalid_user'
      });

      const error = config.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.modifiedBy).toBeDefined();
    });

    it('should reject missing modifiedBy field', async () => {
      expect(ServerConfiguration).toBeDefined();

      const config = new ServerConfiguration({
        guildId: '12345678901234567',
        accessControlMode: 'subscription_required',
        requiredRoleIds: []
      });

      const error = config.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.modifiedBy).toBeDefined();
      expect(error.errors.modifiedBy.kind).toBe('required');
    });

  });

  describe('Schema Defaults', () => {

    it('should set lastModified to current timestamp by default', async () => {
      expect(ServerConfiguration).toBeDefined();

      const before = new Date();
      const config = new ServerConfiguration({
        guildId: '12345678901234567',
        accessControlMode: 'subscription_required',
        requiredRoleIds: [],
        modifiedBy: '98765432109876543'
      });
      const after = new Date();

      expect(config.lastModified).toBeInstanceOf(Date);
      expect(config.lastModified.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(config.lastModified.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should set createdAt to current timestamp by default', async () => {
      expect(ServerConfiguration).toBeDefined();

      const before = new Date();
      const config = new ServerConfiguration({
        guildId: '12345678901234567',
        accessControlMode: 'subscription_required',
        requiredRoleIds: [],
        modifiedBy: '98765432109876543'
      });
      const after = new Date();

      expect(config.createdAt).toBeInstanceOf(Date);
      expect(config.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(config.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should set isActive to true by default', async () => {
      expect(ServerConfiguration).toBeDefined();

      const config = new ServerConfiguration({
        guildId: '12345678901234567',
        accessControlMode: 'subscription_required',
        requiredRoleIds: [],
        modifiedBy: '98765432109876543'
      });

      expect(config.isActive).toBe(true);
    });

    it('should allow overriding isActive to false', async () => {
      expect(ServerConfiguration).toBeDefined();

      const config = new ServerConfiguration({
        guildId: '12345678901234567',
        accessControlMode: 'subscription_required',
        requiredRoleIds: [],
        modifiedBy: '98765432109876543',
        isActive: false
      });

      expect(config.isActive).toBe(false);
    });

  });

  describe('Database Constraints', () => {

    it('should enforce unique guildId constraint', async () => {
      expect(ServerConfiguration).toBeDefined();

      // Create first config
      const config1 = new ServerConfiguration({
        guildId: '12345678901234567',
        accessControlMode: 'subscription_required',
        requiredRoleIds: [],
        modifiedBy: '98765432109876543'
      });
      await config1.save();

      // Attempt to create duplicate
      const config2 = new ServerConfiguration({
        guildId: '12345678901234567', // Same guild ID
        accessControlMode: 'open_access',
        requiredRoleIds: [],
        modifiedBy: '11111111111111111'
      });

      await expect(config2.save()).rejects.toThrow(/duplicate key|E11000/i);
    });

    it('should allow multiple configs with different guild IDs', async () => {
      expect(ServerConfiguration).toBeDefined();

      const config1 = new ServerConfiguration({
        guildId: '12345678901234567',
        accessControlMode: 'subscription_required',
        requiredRoleIds: [],
        modifiedBy: '98765432109876543'
      });
      await config1.save();

      const config2 = new ServerConfiguration({
        guildId: '98765432109876543', // Different guild ID
        accessControlMode: 'open_access',
        requiredRoleIds: [],
        modifiedBy: '11111111111111111'
      });
      await config2.save();

      const count = await ServerConfiguration.countDocuments();
      expect(count).toBe(2);
    });

  });

  describe('Model Indexes', () => {

    it('should have guildId index', async () => {
      expect(ServerConfiguration).toBeDefined();

      const indexes = await ServerConfiguration.collection.getIndexes();
      const guildIdIndex = Object.values(indexes).find(idx =>
        idx.key && idx.key.guildId === 1
      );

      expect(guildIdIndex).toBeDefined();
      expect(guildIdIndex.unique).toBe(true);
    });

    it('should have compound index for isActive and guildId', async () => {
      expect(ServerConfiguration).toBeDefined();

      const indexes = await ServerConfiguration.collection.getIndexes();
      const compoundIndex = Object.values(indexes).find(idx =>
        idx.key && idx.key.isActive === 1 && idx.key.guildId === 1
      );

      expect(compoundIndex).toBeDefined();
    });

  });

  describe('Query Operations', () => {

    it('should find configuration by guildId', async () => {
      expect(ServerConfiguration).toBeDefined();

      const config = new ServerConfiguration({
        guildId: '12345678901234567',
        accessControlMode: 'subscription_required',
        requiredRoleIds: ['98765432109876543'],
        modifiedBy: '98765432109876543'
      });
      await config.save();

      const found = await ServerConfiguration.findOne({ guildId: '12345678901234567' });
      expect(found).toBeDefined();
      expect(found.guildId).toBe('12345678901234567');
      expect(found.accessControlMode).toBe('subscription_required');
    });

    it('should find only active configurations', async () => {
      expect(ServerConfiguration).toBeDefined();

      // Create active config
      await new ServerConfiguration({
        guildId: '11111111111111111',
        accessControlMode: 'subscription_required',
        requiredRoleIds: [],
        modifiedBy: '98765432109876543',
        isActive: true
      }).save();

      // Create inactive config
      await new ServerConfiguration({
        guildId: '22222222222222222',
        accessControlMode: 'open_access',
        requiredRoleIds: [],
        modifiedBy: '98765432109876543',
        isActive: false
      }).save();

      const activeConfigs = await ServerConfiguration.find({ isActive: true });
      expect(activeConfigs).toHaveLength(1);
      expect(activeConfigs[0].guildId).toBe('11111111111111111');
    });

  });

});
