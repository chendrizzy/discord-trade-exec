/**
 * US3-T27: Encryption Service Tests
 * Integration tests for AWS KMS-based EncryptionService
 *
 * Acceptance Criteria:
 * - Test AES-256-GCM encryption/decryption
 * - Test key rotation handling
 * - Test encryption failure scenarios
 * - Test sensitive data masking
 * - 5 new tests, all passing
 */

const crypto = require('crypto');

// Mock AWS KMS SDK before requiring EncryptionService
const mockSend = jest.fn();
jest.mock('@aws-sdk/client-kms', () => ({
  KMSClient: jest.fn(() => ({
    send: mockSend
  })),
  GenerateDataKeyCommand: jest.fn(),
  DecryptCommand: jest.fn()
}));

// Mock Community model
const mockCommunityInstance = {
  _id: { toString: () => 'test-community-id-123' },
  encryptedDEK: null,
  dekGeneratedAt: null,
  lastDEKRotation: null,
  save: jest.fn().mockResolvedValue(true)
};
jest.mock('../../../src/models/Community', () => ({
  findById: jest.fn(() => Promise.resolve(mockCommunityInstance))
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
}));

const { EncryptionService } = require('../../../src/services/encryption');
const Community = require('../../../src/models/Community');

describe('US3-T27: Encryption Service Tests', () => {
  let encryptionService;
  let mockDEK;
  let cleanupInterval;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    mockSend.mockReset();
    mockCommunityInstance.save.mockClear();

    // Reset community instance state
    mockCommunityInstance.encryptedDEK = null;
    mockCommunityInstance.dekGeneratedAt = null;
    mockCommunityInstance.lastDEKRotation = null;

    // Set test environment variables
    process.env.NODE_ENV = 'test';
    process.env.AWS_REGION = 'us-east-1';
    process.env.AWS_ACCESS_KEY_ID = 'test-key-id';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-key';
    process.env.AWS_KMS_CMK_ID = 'test-cmk-id';

    // Generate mock DEK (256-bit key)
    mockDEK = crypto.randomBytes(32);

    // Mock AWS KMS responses
    mockSend.mockImplementation(() => {
      return Promise.resolve({
        Plaintext: mockDEK,
        CiphertextBlob: Buffer.from('encrypted-dek-blob')
      });
    });

    // Create fresh EncryptionService instance with mocked setInterval
    const originalSetInterval = global.setInterval;
    global.setInterval = jest.fn((fn, interval) => {
      cleanupInterval = originalSetInterval(fn, interval);
      return cleanupInterval;
    });

    encryptionService = new EncryptionService();

    global.setInterval = originalSetInterval;
  });

  afterEach(() => {
    // Clean up cleanup interval
    if (cleanupInterval) {
      clearInterval(cleanupInterval);
    }
    // Clear encryptionService cache
    if (encryptionService) {
      encryptionService.clearCache();
    }
  });

  describe('AES-256-GCM Encryption/Decryption', () => {
    it('should encrypt and decrypt credentials successfully', async () => {
      const credential = {
        apiKey: 'test-api-key-12345',
        apiSecret: 'test-secret-67890',
        broker: 'alpaca'
      };

      // Encrypt credential
      const encrypted = await encryptionService.encryptCredential('test-community-id-123', credential);

      // Verify encrypted is base64 string
      expect(typeof encrypted).toBe('string');
      expect(encrypted).not.toBe(JSON.stringify(credential));
      expect(Buffer.from(encrypted, 'base64').toString('base64')).toBe(encrypted);

      // Decrypt credential
      const decrypted = await encryptionService.decryptCredential('test-community-id-123', encrypted);

      // Verify decryption matches original
      expect(decrypted).toEqual(credential);
      expect(decrypted.apiKey).toBe(credential.apiKey);
      expect(decrypted.apiSecret).toBe(credential.apiSecret);
    });

    it('should encrypt and decrypt individual fields successfully', async () => {
      const plaintext = 'super-secret-api-key-xyz';

      // Encrypt field
      const encrypted = await encryptionService.encryptField('test-community-id-123', plaintext);

      // Verify encrypted
      expect(typeof encrypted).toBe('string');
      expect(encrypted).not.toBe(plaintext);

      // Decrypt field
      const decrypted = await encryptionService.decryptField('test-community-id-123', encrypted);

      // Verify decryption matches original
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertexts for same plaintext (unique IVs)', async () => {
      const plaintext = 'same-data-twice';

      // Encrypt twice
      const encrypted1 = await encryptionService.encryptField('test-community-id-123', plaintext);
      const encrypted2 = await encryptionService.encryptField('test-community-id-123', plaintext);

      // Verify different ciphertexts (due to random IVs)
      expect(encrypted1).not.toBe(encrypted2);

      // But both decrypt to same plaintext
      const decrypted1 = await encryptionService.decryptField('test-community-id-123', encrypted1);
      const decrypted2 = await encryptionService.decryptField('test-community-id-123', encrypted2);

      expect(decrypted1).toBe(plaintext);
      expect(decrypted2).toBe(plaintext);
    });

    it('should handle special characters and unicode in encrypted data', async () => {
      const specialCredential = {
        apiKey: 'key-with-!@#$%^&*()_+',
        unicode: 'Hello 世界 🚀 Тест',
        multiline: 'line1\nline2\r\nline3\ttab',
        json: JSON.stringify({ nested: { data: 123 } })
      };

      const encrypted = await encryptionService.encryptCredential('test-community-id-123', specialCredential);
      const decrypted = await encryptionService.decryptCredential('test-community-id-123', encrypted);

      expect(decrypted).toEqual(specialCredential);
      expect(decrypted.unicode).toBe('Hello 世界 🚀 Тест');
    });
  });

  describe('Key Rotation Handling', () => {
    it('should detect when key rotation is needed (90 days)', async () => {
      // Set DEK generated 91 days ago
      mockCommunityInstance.dekGeneratedAt = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);

      const needsRotation = encryptionService.needsRotation(mockCommunityInstance);

      expect(needsRotation).toBe(true);
    });

    it('should not rotate key when within 90-day threshold', async () => {
      // Set DEK generated 89 days ago
      mockCommunityInstance.dekGeneratedAt = new Date(Date.now() - 89 * 24 * 60 * 60 * 1000);

      const needsRotation = encryptionService.needsRotation(mockCommunityInstance);

      expect(needsRotation).toBe(false);
    });

    it('should generate new DEK during rotation', async () => {
      mockCommunityInstance.dekGeneratedAt = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);

      const newDEK = await encryptionService.rotateDEK(mockCommunityInstance);

      // Verify new DEK generated
      expect(newDEK).toBeInstanceOf(Buffer);
      expect(newDEK.length).toBe(32); // 256 bits

      // Verify community saved with new encrypted DEK
      expect(mockCommunityInstance.save).toHaveBeenCalled();
      expect(mockCommunityInstance.encryptedDEK).not.toBeNull();
    });

    it('should cache DEK for 15 minutes to reduce KMS calls', async () => {
      mockCommunityInstance.encryptedDEK = Buffer.from('encrypted-dek-blob').toString('base64');

      // First call - should hit KMS
      await encryptionService.getDEK(mockCommunityInstance);
      expect(mockSend).toHaveBeenCalledTimes(1);

      // Second call within TTL - should use cache
      mockSend.mockClear();
      await encryptionService.getDEK(mockCommunityInstance);
      expect(mockSend).not.toHaveBeenCalled();

      // Verify cache stats
      const stats = encryptionService.getCacheStats();
      expect(stats.size).toBe(1);
      expect(stats.communities).toContain('test-community-id-123');
    });

    it('should clear cache manually when requested', async () => {
      mockCommunityInstance.encryptedDEK = Buffer.from('encrypted-dek-blob').toString('base64');

      // Populate cache
      await encryptionService.getDEK(mockCommunityInstance);
      expect(encryptionService.getCacheStats().size).toBe(1);

      // Clear cache
      encryptionService.clearCache();

      // Verify cache empty
      const stats = encryptionService.getCacheStats();
      expect(stats.size).toBe(0);
      expect(stats.communities).toHaveLength(0);
    });
  });

  describe('Encryption Failure Scenarios', () => {
    it('should throw error when community not found', async () => {
      // Mock findById to return null for this test
      Community.findById.mockResolvedValueOnce(null);

      await expect(
        encryptionService.encryptCredential('non-existent-id', { key: 'value' })
      ).rejects.toThrow('Community not found');

      // Reset and test decrypt
      Community.findById.mockResolvedValueOnce(null);
      await expect(encryptionService.decryptCredential('non-existent-id', 'encrypted-data')).rejects.toThrow(
        'Community not found'
      );
    });

    it('should throw error when KMS fails during key generation', async () => {
      mockSend.mockRejectedValueOnce(new Error('KMS service unavailable'));

      await expect(encryptionService.generateDEK(mockCommunityInstance)).rejects.toThrow(
        'Failed to generate encryption key'
      );
    });

    it('should throw error when KMS fails during decryption', async () => {
      mockCommunityInstance.encryptedDEK = Buffer.from('encrypted-dek-blob').toString('base64');
      mockSend.mockRejectedValueOnce(new Error('KMS access denied'));

      await expect(encryptionService.getDEK(mockCommunityInstance)).rejects.toThrow(
        'Failed to decrypt community encryption key'
      );
    });

    it('should detect and reject tampered ciphertext', async () => {
      const credential = { apiKey: 'test-key' };
      const encrypted = await encryptionService.encryptCredential('test-community-id-123', credential);

      // Tamper with ciphertext (flip bits in encrypted data)
      const buffer = Buffer.from(encrypted, 'base64');
      buffer[buffer.length - 20] = buffer[buffer.length - 20] ^ 0xff; // Flip byte
      const tampered = buffer.toString('base64');

      await expect(encryptionService.decryptCredential('test-community-id-123', tampered)).rejects.toThrow(
        'Failed to decrypt credential'
      );
    });

    it('should handle corrupted encrypted data gracefully', async () => {
      const corruptedData = 'not-valid-base64-data-!@#$%';

      await expect(encryptionService.decryptCredential('test-community-id-123', corruptedData)).rejects.toThrow();
    });
  });

  describe('Sensitive Data Masking', () => {
    it('should never log plaintext credentials', async () => {
      const logger = require('../../../src/utils/logger');
      const sensitiveCredential = {
        apiKey: 'super-secret-key-12345',
        apiSecret: 'super-secret-value-67890',
        password: 'MyPassword123!'
      };

      await encryptionService.encryptCredential('test-community-id-123', sensitiveCredential);

      // Verify logger never called with plaintext sensitive data
      const allLogCalls = [
        ...logger.error.mock.calls,
        ...logger.warn.mock.calls,
        ...logger.info.mock.calls,
        ...logger.debug.mock.calls
      ];

      const logsContainSensitive = allLogCalls.some(call => {
        const callString = JSON.stringify(call);
        return (
          callString.includes('super-secret-key-12345') ||
          callString.includes('super-secret-value-67890') ||
          callString.includes('MyPassword123!')
        );
      });

      expect(logsContainSensitive).toBe(false);
    });

    it('should mask sensitive fields in error messages', async () => {
      const logger = require('../../../src/utils/logger');
      mockSend.mockRejectedValueOnce(new Error('KMS failure'));

      try {
        await encryptionService.generateDEK(mockCommunityInstance);
      } catch (error) {
        // Error should not contain actual DEK or sensitive data
        expect(error.message).not.toContain(mockDEK.toString('hex'));
        expect(error.message).not.toContain(mockDEK.toString('base64'));
      }

      // Verify logger doesn't log sensitive data
      const errorCalls = logger.error.mock.calls;
      const containsDEK = errorCalls.some(call => {
        const callString = JSON.stringify(call);
        return callString.includes(mockDEK.toString('hex')) || callString.includes(mockDEK.toString('base64'));
      });

      expect(containsDEK).toBe(false);
    });

    it('should not expose DEK in cache stats', () => {
      const stats = encryptionService.getCacheStats();

      // Stats should only contain community IDs, not DEKs
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('communities');
      expect(stats).not.toHaveProperty('keys');
      expect(stats).not.toHaveProperty('deks');

      // Verify no DEK data in stats object
      const statsString = JSON.stringify(stats);
      expect(statsString).not.toContain(mockDEK.toString('hex'));
      expect(statsString).not.toContain(mockDEK.toString('base64'));
    });
  });
});
