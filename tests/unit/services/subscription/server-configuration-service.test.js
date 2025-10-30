/**
 * Unit tests for ServerConfigurationService
 *
 * Feature: 004-subscription-gating
 * Phase: 2 (Foundational)
 * Task: T018 - Write failing tests for ServerConfigurationService
 *
 * TDD Approach: These tests are written FIRST and expected to FAIL until T019 implements the service.
 *
 * Test Coverage:
 * - Constructor with Mongoose model validation
 * - getConfig() with in-memory cache hit/miss scenarios
 * - createConfig() with validation and cache invalidation
 * - updateConfig() with partial updates and cache invalidation
 * - configExists() for existence checks
 * - Cache behavior (hits/misses/invalidation)
 * - Error handling for database failures
 *
 * @see specs/004-subscription-gating/contracts/subscription-verification-api.md
 */

const { ServerConfigurationService } = require('@services/subscription/ServerConfigurationService');

// Mock Mongoose model
jest.mock('@models/ServerConfiguration');

describe('ServerConfigurationService - TDD Tests', () => {
  let service;
  let mockModel;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Mock Mongoose model
    mockModel = {
      findOne: jest.fn(),
      create: jest.fn(),
      findOneAndUpdate: jest.fn(),
      exists: jest.fn()
    };

    // Create service with mock model
    service = new ServerConfigurationService(mockModel);
  });

  describe('Constructor', () => {
    it('should create service with Mongoose model', () => {
      expect(service).toBeDefined();
      expect(service.configModel).toBe(mockModel);
    });

    it('should throw error if model is not provided', () => {
      expect(() => new ServerConfigurationService()).toThrow('Mongoose model is required');
    });

    it('should initialize empty in-memory cache', () => {
      expect(service.cache).toBeDefined();
      expect(service.cache.size).toBe(0);
    });
  });

  describe('getConfig() - Cache Hit Scenarios', () => {
    it('should return cached config on cache hit', async () => {
      const mockConfig = {
        guildId: '1234567890123456789',
        accessMode: 'subscription_required',
        requiredRoleIds: ['11111111111111111'],
        modifiedBy: '9876543210987654321',
        modifiedAt: new Date()
      };

      // Populate cache
      service.cache.set('1234567890123456789', mockConfig);

      const result = await service.getConfig('1234567890123456789');

      expect(result).toEqual(mockConfig);
      expect(mockModel.findOne).not.toHaveBeenCalled();
    });

    it('should fetch from DB on cache miss and cache result', async () => {
      const mockConfig = {
        guildId: '1234567890123456789',
        accessMode: 'subscription_required',
        requiredRoleIds: ['11111111111111111'],
        modifiedBy: '9876543210987654321',
        modifiedAt: new Date(),
        toObject: jest.fn().mockReturnThis()
      };

      mockModel.findOne.mockResolvedValue(mockConfig);

      const result = await service.getConfig('1234567890123456789');

      expect(mockModel.findOne).toHaveBeenCalledWith({ guildId: '1234567890123456789' });
      expect(result).toEqual(mockConfig);
      expect(service.cache.has('1234567890123456789')).toBe(true);
    });

    it('should return null when guild not found in DB', async () => {
      mockModel.findOne.mockResolvedValue(null);

      const result = await service.getConfig('1234567890123456789');

      expect(result).toBeNull();
      expect(service.cache.has('1234567890123456789')).toBe(false);
    });

    it('should validate guild ID format', async () => {
      await expect(
        service.getConfig('invalid')
      ).rejects.toThrow(/invalid.*guild.*id/i);
    });

    it('should handle database errors gracefully', async () => {
      mockModel.findOne.mockRejectedValue(new Error('Database connection failed'));

      await expect(
        service.getConfig('1234567890123456789')
      ).rejects.toThrow(/database.*error/i);
    });

    it('should handle cache corruption gracefully', async () => {
      // Populate cache with invalid data
      service.cache.set('1234567890123456789', 'invalid_data');

      const mockConfig = {
        guildId: '1234567890123456789',
        accessMode: 'open_access',
        requiredRoleIds: [],
        modifiedBy: '9876543210987654321',
        modifiedAt: new Date(),
        toObject: jest.fn().mockReturnThis()
      };

      mockModel.findOne.mockResolvedValue(mockConfig);

      // Should still work - fetch from DB and replace cache
      const result = await service.getConfig('1234567890123456789');

      expect(result).toEqual(mockConfig);
    });
  });

  describe('createConfig() - Configuration Creation', () => {
    it('should create config with subscription_required mode', async () => {
      const mockConfig = {
        guildId: '1234567890123456789',
        accessMode: 'subscription_required',
        requiredRoleIds: ['11111111111111111', '22222222222222222'],
        modifiedBy: '9876543210987654321',
        modifiedAt: expect.any(Date),
        toObject: jest.fn().mockReturnThis()
      };

      mockModel.create.mockResolvedValue(mockConfig);

      const result = await service.createConfig(
        '1234567890123456789',
        'subscription_required',
        ['11111111111111111', '22222222222222222'],
        '9876543210987654321'
      );

      expect(mockModel.create).toHaveBeenCalledWith({
        guildId: '1234567890123456789',
        accessMode: 'subscription_required',
        requiredRoleIds: ['11111111111111111', '22222222222222222'],
        modifiedBy: '9876543210987654321',
        modifiedAt: expect.any(Date)
      });
      expect(result).toEqual(mockConfig);
    });

    it('should create config with open_access mode', async () => {
      const mockConfig = {
        guildId: '1234567890123456789',
        accessMode: 'open_access',
        requiredRoleIds: [],
        modifiedBy: '9876543210987654321',
        modifiedAt: expect.any(Date),
        toObject: jest.fn().mockReturnThis()
      };

      mockModel.create.mockResolvedValue(mockConfig);

      const result = await service.createConfig(
        '1234567890123456789',
        'open_access',
        [],
        '9876543210987654321'
      );

      expect(result.accessMode).toBe('open_access');
      expect(result.requiredRoleIds).toEqual([]);
    });

    it('should invalidate cache after creation', async () => {
      const mockConfig = {
        guildId: '1234567890123456789',
        accessMode: 'subscription_required',
        requiredRoleIds: ['11111111111111111'],
        modifiedBy: '9876543210987654321',
        modifiedAt: expect.any(Date),
        toObject: jest.fn().mockReturnThis()
      };

      // Populate cache with old data
      service.cache.set('1234567890123456789', { accessMode: 'open_access' });

      mockModel.create.mockResolvedValue(mockConfig);

      await service.createConfig(
        '1234567890123456789',
        'subscription_required',
        ['11111111111111111'],
        '9876543210987654321'
      );

      // Cache should be cleared
      expect(service.cache.has('1234567890123456789')).toBe(false);
    });

    it('should validate guild ID format', async () => {
      await expect(
        service.createConfig('invalid', 'subscription_required', ['11111111111111111'], '9876543210987654321')
      ).rejects.toThrow(/invalid.*guild.*id/i);
    });

    it('should validate access mode', async () => {
      await expect(
        service.createConfig('1234567890123456789', 'invalid_mode', [], '9876543210987654321')
      ).rejects.toThrow(/invalid.*access.*mode/i);
    });

    it('should validate required role IDs when subscription_required', async () => {
      await expect(
        service.createConfig('1234567890123456789', 'subscription_required', [], '9876543210987654321')
      ).rejects.toThrow(/required.*role/i);
    });

    it('should validate role ID format in requiredRoleIds', async () => {
      await expect(
        service.createConfig('1234567890123456789', 'subscription_required', ['invalid_role'], '9876543210987654321')
      ).rejects.toThrow(/invalid.*role.*id/i);
    });

    it('should validate modifiedBy user ID format', async () => {
      await expect(
        service.createConfig('1234567890123456789', 'subscription_required', ['11111111111111111'], 'invalid')
      ).rejects.toThrow(/invalid.*user.*id/i);
    });

    it('should handle duplicate guild ID error', async () => {
      mockModel.create.mockRejectedValue(new Error('E11000 duplicate key error'));

      await expect(
        service.createConfig('1234567890123456789', 'subscription_required', ['11111111111111111'], '9876543210987654321')
      ).rejects.toThrow(/already.*exists/i);
    });

    it('should handle database errors during creation', async () => {
      mockModel.create.mockRejectedValue(new Error('Database write failed'));

      await expect(
        service.createConfig('1234567890123456789', 'subscription_required', ['11111111111111111'], '9876543210987654321')
      ).rejects.toThrow(/database.*error/i);
    });
  });

  describe('updateConfig() - Configuration Updates', () => {
    it('should update config with partial updates', async () => {
      const mockConfig = {
        guildId: '1234567890123456789',
        accessMode: 'subscription_required',
        requiredRoleIds: ['11111111111111111', '22222222222222222'],
        modifiedBy: '8876543210987654321',
        modifiedAt: expect.any(Date),
        toObject: jest.fn().mockReturnThis()
      };

      mockModel.findOneAndUpdate.mockResolvedValue(mockConfig);

      const result = await service.updateConfig(
        '1234567890123456789',
        { requiredRoleIds: ['11111111111111111', '22222222222222222'] },
        '8876543210987654321'
      );

      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        { guildId: '1234567890123456789' },
        {
          requiredRoleIds: ['11111111111111111', '22222222222222222'],
          modifiedBy: '8876543210987654321',
          modifiedAt: expect.any(Date)
        },
        { new: true }
      );
      expect(result).toEqual(mockConfig);
    });

    it('should update access mode', async () => {
      const mockConfig = {
        guildId: '1234567890123456789',
        accessMode: 'open_access',
        requiredRoleIds: [],
        modifiedBy: '9876543210987654321',
        modifiedAt: expect.any(Date),
        toObject: jest.fn().mockReturnThis()
      };

      mockModel.findOneAndUpdate.mockResolvedValue(mockConfig);

      const result = await service.updateConfig(
        '1234567890123456789',
        { accessMode: 'open_access', requiredRoleIds: [] },
        '9876543210987654321'
      );

      expect(result.accessMode).toBe('open_access');
      expect(result.requiredRoleIds).toEqual([]);
    });

    it('should invalidate cache after update', async () => {
      const mockConfig = {
        guildId: '1234567890123456789',
        accessMode: 'subscription_required',
        requiredRoleIds: ['11111111111111111'],
        modifiedBy: '9876543210987654321',
        modifiedAt: expect.any(Date),
        toObject: jest.fn().mockReturnThis()
      };

      // Populate cache with old data
      service.cache.set('1234567890123456789', { accessMode: 'open_access' });

      mockModel.findOneAndUpdate.mockResolvedValue(mockConfig);

      await service.updateConfig(
        '1234567890123456789',
        { accessMode: 'subscription_required', requiredRoleIds: ['11111111111111111'] },
        '9876543210987654321'
      );

      // Cache should be cleared
      expect(service.cache.has('1234567890123456789')).toBe(false);
    });

    it('should throw error when guild not found', async () => {
      mockModel.findOneAndUpdate.mockResolvedValue(null);

      await expect(
        service.updateConfig('1234567890123456789', { accessMode: 'open_access' }, '9876543210987654321')
      ).rejects.toThrow(/guild.*not.*found/i);
    });

    it('should validate guild ID format', async () => {
      await expect(
        service.updateConfig('invalid', { accessMode: 'open_access' }, '9876543210987654321')
      ).rejects.toThrow(/invalid.*guild.*id/i);
    });

    it('should validate access mode when updating', async () => {
      await expect(
        service.updateConfig('1234567890123456789', { accessMode: 'invalid_mode' }, '9876543210987654321')
      ).rejects.toThrow(/invalid.*access.*mode/i);
    });

    it('should validate role ID format when updating requiredRoleIds', async () => {
      await expect(
        service.updateConfig('1234567890123456789', { requiredRoleIds: ['invalid_role'] }, '9876543210987654321')
      ).rejects.toThrow(/invalid.*role.*id/i);
    });

    it('should validate modifiedBy user ID format', async () => {
      await expect(
        service.updateConfig('1234567890123456789', { accessMode: 'open_access' }, 'invalid')
      ).rejects.toThrow(/invalid.*user.*id/i);
    });

    it('should handle database errors during update', async () => {
      mockModel.findOneAndUpdate.mockRejectedValue(new Error('Database write failed'));

      await expect(
        service.updateConfig('1234567890123456789', { accessMode: 'open_access' }, '9876543210987654321')
      ).rejects.toThrow(/database.*error/i);
    });

    it('should prevent updating guildId', async () => {
      await expect(
        service.updateConfig('1234567890123456789', { guildId: '2234567890123456789' }, '9876543210987654321')
      ).rejects.toThrow(/cannot.*update.*guild.*id/i);
    });
  });

  describe('configExists() - Existence Checks', () => {
    it('should return true when guild config exists', async () => {
      mockModel.exists.mockResolvedValue({ _id: 'some_id' });

      const exists = await service.configExists('1234567890123456789');

      expect(mockModel.exists).toHaveBeenCalledWith({ guildId: '1234567890123456789' });
      expect(exists).toBe(true);
    });

    it('should return false when guild config does not exist', async () => {
      mockModel.exists.mockResolvedValue(null);

      const exists = await service.configExists('1234567890123456789');

      expect(exists).toBe(false);
    });

    it('should validate guild ID format', async () => {
      await expect(
        service.configExists('invalid')
      ).rejects.toThrow(/invalid.*guild.*id/i);
    });

    it('should handle database errors during existence check', async () => {
      mockModel.exists.mockRejectedValue(new Error('Database query failed'));

      await expect(
        service.configExists('1234567890123456789')
      ).rejects.toThrow(/database.*error/i);
    });
  });

  describe('Cache Behavior', () => {
    it('should cache config after first getConfig call', async () => {
      const mockConfig = {
        guildId: '1234567890123456789',
        accessMode: 'subscription_required',
        requiredRoleIds: ['11111111111111111'],
        modifiedBy: '9876543210987654321',
        modifiedAt: new Date(),
        toObject: jest.fn().mockReturnThis()
      };

      mockModel.findOne.mockResolvedValue(mockConfig);

      // First call - DB fetch
      await service.getConfig('1234567890123456789');
      expect(mockModel.findOne).toHaveBeenCalledTimes(1);

      // Second call - cache hit
      await service.getConfig('1234567890123456789');
      expect(mockModel.findOne).toHaveBeenCalledTimes(1); // Should not call DB again
    });

    it('should clear cache for specific guild after createConfig', async () => {
      const mockConfig = {
        guildId: '1234567890123456789',
        accessMode: 'subscription_required',
        requiredRoleIds: ['11111111111111111'],
        modifiedBy: '9876543210987654321',
        modifiedAt: expect.any(Date),
        toObject: jest.fn().mockReturnThis()
      };

      // Populate cache
      service.cache.set('1234567890123456789', { accessMode: 'open_access' });
      service.cache.set('2234567890123456789', { accessMode: 'open_access' });

      mockModel.create.mockResolvedValue(mockConfig);

      await service.createConfig('1234567890123456789', 'subscription_required', ['11111111111111111'], '9876543210987654321');

      // Only target guild should be cleared
      expect(service.cache.has('1234567890123456789')).toBe(false);
      expect(service.cache.has('2234567890123456789')).toBe(true);
    });

    it('should clear cache for specific guild after updateConfig', async () => {
      const mockConfig = {
        guildId: '1234567890123456789',
        accessMode: 'subscription_required',
        requiredRoleIds: ['11111111111111111'],
        modifiedBy: '9876543210987654321',
        modifiedAt: expect.any(Date),
        toObject: jest.fn().mockReturnThis()
      };

      // Populate cache
      service.cache.set('1234567890123456789', { accessMode: 'open_access' });
      service.cache.set('2234567890123456789', { accessMode: 'open_access' });

      mockModel.findOneAndUpdate.mockResolvedValue(mockConfig);

      await service.updateConfig('1234567890123456789', { accessMode: 'subscription_required' }, '9876543210987654321');

      // Only target guild should be cleared
      expect(service.cache.has('1234567890123456789')).toBe(false);
      expect(service.cache.has('2234567890123456789')).toBe(true);
    });

    it('should handle cache with multiple guilds', async () => {
      const mockConfig1 = {
        guildId: '1234567890123456789',
        accessMode: 'subscription_required',
        requiredRoleIds: ['11111111111111111'],
        modifiedBy: '9876543210987654321',
        modifiedAt: new Date(),
        toObject: jest.fn().mockReturnThis()
      };

      const mockConfig2 = {
        guildId: '2234567890123456789',
        accessMode: 'open_access',
        requiredRoleIds: [],
        modifiedBy: '9876543210987654321',
        modifiedAt: new Date(),
        toObject: jest.fn().mockReturnThis()
      };

      mockModel.findOne.mockImplementation((query) => {
        if (query.guildId === '1234567890123456789') return Promise.resolve(mockConfig1);
        if (query.guildId === '2234567890123456789') return Promise.resolve(mockConfig2);
        return Promise.resolve(null);
      });

      // Fetch both configs
      await service.getConfig('1234567890123456789');
      await service.getConfig('2234567890123456789');

      // Both should be cached
      expect(service.cache.size).toBe(2);
      expect(service.cache.has('1234567890123456789')).toBe(true);
      expect(service.cache.has('2234567890123456789')).toBe(true);
    });
  });

  describe('Performance', () => {
    it('should complete getConfig with cache hit quickly', async () => {
      const mockConfig = {
        guildId: '1234567890123456789',
        accessMode: 'subscription_required',
        requiredRoleIds: ['11111111111111111'],
        modifiedBy: '9876543210987654321',
        modifiedAt: new Date()
      };

      service.cache.set('1234567890123456789', mockConfig);

      const start = Date.now();
      await service.getConfig('1234567890123456789');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(10); // Should be nearly instant
    });

    it('should complete configExists quickly', async () => {
      mockModel.exists.mockResolvedValue({ _id: 'some_id' });

      const start = Date.now();
      await service.configExists('1234567890123456789');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });
  });
});
