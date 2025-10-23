'use strict';

/**
 * AES-256-GCM Credential Encryption Utilities
 *
 * Provides secure encryption/decryption for sensitive data:
 * - Broker API credentials
 * - OAuth tokens
 * - Session data
 *
 * Constitutional Principle I: Security-First Development
 * FR-014: Store credentials encrypted at rest using AES-256-GCM
 * FR-077: Annual encryption key rotation with backward compatibility
 */

const crypto = require('crypto');
const { getConfig } = require('../config/env');

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 64; // For key derivation

/**
 * Get encryption key from environment
 * @returns {Buffer} 32-byte encryption key
 */
function getEncryptionKey() {
  const config = getConfig();
  const keyHex = config.ENCRYPTION_KEY;

  if (!keyHex || keyHex.length !== KEY_LENGTH * 2) {
    throw new Error(`ENCRYPTION_KEY must be ${KEY_LENGTH * 2} hex characters (${KEY_LENGTH} bytes)`);
  }

  return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypt data using AES-256-GCM
 * @param {string|Object} data - Data to encrypt (will be JSON stringified if object)
 * @returns {Object} Encrypted data with iv and authTag
 * @throws {Error} If encryption fails
 */
function encrypt(data) {
  try {
    // Convert data to string if object
    const plaintext = typeof data === 'string' ? data : JSON.stringify(data);

    // Generate random IV (Initialization Vector)
    const iv = crypto.randomBytes(IV_LENGTH);

    // Get encryption key
    const key = getEncryptionKey();

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    // Encrypt data
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    return {
      encrypted: encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      algorithm: ALGORITHM
    };
  } catch (error) {
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

/**
 * Decrypt data using AES-256-GCM
 * @param {Object} encryptedData - Object with encrypted, iv, and authTag
 * @param {boolean} parseJson - Whether to parse result as JSON
 * @returns {string|Object} Decrypted data
 * @throws {Error} If decryption fails or authentication fails
 */
function decrypt(encryptedData, parseJson = false) {
  try {
    const { encrypted, iv, authTag } = encryptedData;

    if (!encrypted || !iv || !authTag) {
      throw new Error('Missing required encryption fields: encrypted, iv, authTag');
    }

    // Get encryption key
    const key = getEncryptionKey();

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'));

    // Set authentication tag
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    // Decrypt data
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    // Parse JSON if requested
    if (parseJson) {
      try {
        return JSON.parse(decrypted);
      } catch (parseError) {
        throw new Error('Failed to parse decrypted data as JSON');
      }
    }

    return decrypted;
  } catch (error) {
    // Authentication failure or decryption error
    if (error.message.includes('Unsupported state') || error.message.includes('auth')) {
      throw new Error('Decryption failed: Authentication tag verification failed (data may be tampered)');
    }
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

/**
 * Hash data using SHA-256 (for audit log chain integrity)
 * @param {string} data - Data to hash
 * @returns {string} Hex-encoded hash
 */
function hash(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Hash data with salt (for password hashing - use bcrypt for passwords instead)
 * @param {string} data - Data to hash
 * @param {string} salt - Salt (hex-encoded)
 * @returns {string} Hex-encoded hash
 */
function hashWithSalt(data, salt) {
  return crypto
    .createHash('sha256')
    .update(data + salt)
    .digest('hex');
}

/**
 * Generate random salt
 * @param {number} length - Salt length in bytes (default 64)
 * @returns {string} Hex-encoded salt
 */
function generateSalt(length = SALT_LENGTH) {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Generate random encryption key (for key rotation)
 * @returns {string} Hex-encoded 256-bit key
 */
function generateKey() {
  return crypto.randomBytes(KEY_LENGTH).toString('hex');
}

/**
 * Securely compare two strings (timing-safe)
 * Prevents timing attacks when comparing secrets
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {boolean} True if strings match
 */
function secureCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  if (a.length !== b.length) {
    return false;
  }

  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Encrypt broker credentials for storage
 * @param {Object} credentials - Broker credentials object
 * @returns {Object} Encrypted credentials ready for database storage
 */
function encryptBrokerCredentials(credentials) {
  return {
    apiKey: credentials.apiKey ? encrypt(credentials.apiKey) : null,
    apiSecret: credentials.apiSecret ? encrypt(credentials.apiSecret) : null,
    accessToken: credentials.accessToken ? encrypt(credentials.accessToken) : null,
    refreshToken: credentials.refreshToken ? encrypt(credentials.refreshToken) : null,
    accountId: credentials.accountId, // Not sensitive, no encryption needed
    isPaperTrading: credentials.isPaperTrading
  };
}

/**
 * Decrypt broker credentials from storage
 * @param {Object} encryptedCredentials - Encrypted credentials from database
 * @returns {Object} Decrypted credentials
 */
function decryptBrokerCredentials(encryptedCredentials) {
  return {
    apiKey: encryptedCredentials.apiKey ? decrypt(encryptedCredentials.apiKey) : null,
    apiSecret: encryptedCredentials.apiSecret ? decrypt(encryptedCredentials.apiSecret) : null,
    accessToken: encryptedCredentials.accessToken ? decrypt(encryptedCredentials.accessToken) : null,
    refreshToken: encryptedCredentials.refreshToken ? decrypt(encryptedCredentials.refreshToken) : null,
    accountId: encryptedCredentials.accountId,
    isPaperTrading: encryptedCredentials.isPaperTrading
  };
}

/**
 * Validate encryption key format
 * @param {string} key - Hex-encoded key
 * @returns {boolean} True if valid
 */
function isValidEncryptionKey(key) {
  if (typeof key !== 'string') {
    return false;
  }

  if (key.length !== KEY_LENGTH * 2) {
    return false;
  }

  // Check if valid hex
  return /^[0-9a-fA-F]+$/.test(key);
}

module.exports = {
  encrypt,
  decrypt,
  hash,
  hashWithSalt,
  generateSalt,
  generateKey,
  secureCompare,
  encryptBrokerCredentials,
  decryptBrokerCredentials,
  isValidEncryptionKey,

  // Constants for external use
  ALGORITHM,
  KEY_LENGTH,
  IV_LENGTH,
  AUTH_TAG_LENGTH
};
