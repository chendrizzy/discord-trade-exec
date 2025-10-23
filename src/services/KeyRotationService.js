'use strict';

/**
 * Encryption Key Rotation Service
 *
 * Provides automated annual encryption key rotation with backward compatibility
 *
 * Constitutional Principle I: Security-First - Annual key rotation per FR-077
 * FR-077: Annual encryption key rotation (January 1st)
 *
 * Features:
 * - Generate new AES-256-GCM keys annually
 * - Maintain 3 key versions (current + previous 2)
 * - Re-encrypt sensitive data with new key (background job)
 * - Zero downtime rotation
 * - Backward-compatible decryption
 */

const crypto = require('crypto');
const { getConfig } = require('../config/env');
const { logger } = require('../middleware/logger');
const User = require('../models/User');
const BrokerConnection = require('../models/BrokerConnection');

// Key version format: YYYY (e.g., "2025", "2026")
const KEY_VERSION_FORMAT = 'YYYY';

/**
 * Key metadata stored in database or secure vault
 */
class KeyMetadata {
  constructor(version, key, createdAt, status = 'active') {
    this.version = version; // e.g., "2025"
    this.key = key; // 64-char hex string (32 bytes)
    this.createdAt = createdAt;
    this.status = status; // active, rotated, deprecated
  }
}

/**
 * Key Rotation Service
 */
class KeyRotationService {
  constructor() {
    this.currentKey = null;
    this.keyVersions = new Map(); // version -> KeyMetadata
    this.maxKeyVersions = 3; // Keep current + 2 previous
    this.initialized = false;
  }

  /**
   * Initialize key rotation service
   * Loads existing keys from storage
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      // Load current key from environment
      const config = getConfig();
      const currentVersion = this.getCurrentKeyVersion();

      this.currentKey = new KeyMetadata(currentVersion, config.ENCRYPTION_KEY, new Date(), 'active');

      this.keyVersions.set(currentVersion, this.currentKey);

      // Load previous key versions from secure vault
      await this._loadPreviousKeysFromVault();

      this.initialized = true;
      logger.info('Key Rotation Service initialized', {
        currentVersion,
        totalKeys: this.keyVersions.size
      });
    } catch (error) {
      logger.error('Failed to initialize Key Rotation Service', { error: error.message });
      throw error;
    }
  }

  /**
   * Load previous encryption key versions from secure vault
   * Supports: AWS Secrets Manager, HashiCorp Vault, or environment variables
   *
   * @returns {Promise<void>}
   * @private
   */
  async _loadPreviousKeysFromVault() {
    const vaultType = process.env.VAULT_TYPE || 'env'; // 'aws', 'hashicorp', 'env'

    try {
      if (vaultType === 'aws') {
        await this._loadFromAWSSecretsManager();
      } else if (vaultType === 'hashicorp') {
        await this._loadFromHashiCorpVault();
      } else {
        await this._loadFromEnvironment();
      }

      logger.info('Previous encryption keys loaded from vault', {
        vaultType,
        keysLoaded: this.keyVersions.size - 1 // Exclude current key
      });
    } catch (error) {
      logger.warn('Failed to load previous keys from vault, continuing with current key only', {
        vaultType,
        error: error.message
      });
      // Don't throw - service can function with current key only
    }
  }

  /**
   * Load previous keys from environment variables (development/testing)
   * Expected format: ENCRYPTION_KEY_2024, ENCRYPTION_KEY_2023, etc.
   *
   * @returns {Promise<void>}
   * @private
   */
  async _loadFromEnvironment() {
    const currentYear = new Date().getFullYear();
    const yearsToCheck = 2; // Support 2 previous years

    for (let i = 1; i <= yearsToCheck; i++) {
      const year = (currentYear - i).toString();
      const envKey = `ENCRYPTION_KEY_${year}`;

      if (process.env[envKey]) {
        const keyMetadata = new KeyMetadata(year, process.env[envKey], new Date(`${year}-01-01`), 'rotated');
        this.keyVersions.set(year, keyMetadata);
        logger.debug('Loaded encryption key from environment', { version: year });
      }
    }
  }

  /**
   * Load previous keys from AWS Secrets Manager
   * Requires: AWS SDK for JavaScript v3, appropriate IAM permissions
   *
   * @returns {Promise<void>}
   * @private
   */
  async _loadFromAWSSecretsManager() {
    // Require AWS SDK dynamically to avoid dependency if not using AWS
    const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

    const client = new SecretsManagerClient({
      region: process.env.AWS_REGION || 'us-east-1'
    });

    const currentYear = new Date().getFullYear();
    const yearsToCheck = 2;

    for (let i = 1; i <= yearsToCheck; i++) {
      const year = (currentYear - i).toString();
      const secretName = `discord-trade-exec/encryption-key/${year}`;

      try {
        const command = new GetSecretValueCommand({ SecretId: secretName });
        const response = await client.send(command);

        if (response.SecretString) {
          const keyMetadata = new KeyMetadata(year, response.SecretString, new Date(`${year}-01-01`), 'rotated');
          this.keyVersions.set(year, keyMetadata);
          logger.debug('Loaded encryption key from AWS Secrets Manager', { version: year });
        }
      } catch (error) {
        if (error.name === 'ResourceNotFoundException') {
          logger.debug('No encryption key found in AWS Secrets Manager', { version: year });
        } else {
          logger.error('Failed to load key from AWS Secrets Manager', {
            version: year,
            error: error.message
          });
        }
      }
    }
  }

  /**
   * Load previous keys from HashiCorp Vault
   * Requires: vault-client package, appropriate access policies
   *
   * @returns {Promise<void>}
   * @private
   */
  async _loadFromHashiCorpVault() {
    // This is a placeholder implementation - production should use actual Vault client
    logger.warn('HashiCorp Vault integration not yet implemented, using environment fallback');
    await this._loadFromEnvironment();

    // Production implementation would look like:
    // const vault = require('node-vault')({
    //   apiVersion: 'v1',
    //   endpoint: process.env.VAULT_ADDR,
    //   token: process.env.VAULT_TOKEN
    // });
    //
    // for (let i = 1; i <= 2; i++) {
    //   const year = (new Date().getFullYear() - i).toString();
    //   const result = await vault.read(`secret/discord-trade-exec/encryption-key/${year}`);
    //   // ... create KeyMetadata and add to keyVersions
    // }
  }

  /**
   * Get current key version (based on year)
   * @returns {string} Current key version (e.g., "2025")
   */
  getCurrentKeyVersion() {
    return new Date().getFullYear().toString();
  }

  /**
   * Generate new encryption key
   * @returns {string} 64-char hex string (32 bytes)
   */
  generateNewKey() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Rotate encryption key (annual task)
   * Should be run on January 1st of each year
   *
   * @returns {Promise<Object>} Rotation result
   */
  async rotateKey() {
    await this.initialize();

    const newVersion = this.getCurrentKeyVersion();
    const oldVersion = this.currentKey.version;

    // Check if rotation is needed
    if (newVersion === oldVersion) {
      logger.info('Key rotation not needed - already on current version', { version: newVersion });
      return {
        rotated: false,
        reason: 'Already on current version',
        currentVersion: newVersion
      };
    }

    logger.info('Starting encryption key rotation', {
      oldVersion,
      newVersion
    });

    try {
      // Step 1: Generate new key
      const newKey = this.generateNewKey();

      // Step 2: Store new key metadata
      const newKeyMetadata = new KeyMetadata(newVersion, newKey, new Date(), 'active');

      // Step 3: Mark old key as rotated
      this.currentKey.status = 'rotated';

      // Step 4: Add new key as current
      this.keyVersions.set(newVersion, newKeyMetadata);
      this.currentKey = newKeyMetadata;

      // Step 5: Clean up old keys (keep only 3 versions)
      await this.cleanupOldKeys();

      // Step 6: Schedule re-encryption job
      logger.info('Key rotation completed - scheduling re-encryption', {
        newVersion,
        totalKeys: this.keyVersions.size
      });

      // Re-encrypt in background (non-blocking)
      this.scheduleReEncryption(oldVersion, newVersion).catch(error => {
        logger.error('Re-encryption failed', { error: error.message });
      });

      // Step 7: Store new key in secure vault
      await this.storeKeyInVault(newKeyMetadata);

      return {
        rotated: true,
        oldVersion,
        newVersion,
        keysInRotation: this.keyVersions.size,
        reEncryptionScheduled: true
      };
    } catch (error) {
      logger.error('Key rotation failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Get encryption key by version
   * @param {string} version - Key version (e.g., "2025")
   * @returns {string|null} Encryption key or null if not found
   */
  getKeyByVersion(version) {
    const keyMetadata = this.keyVersions.get(version);
    return keyMetadata ? keyMetadata.key : null;
  }

  /**
   * Get current active key
   * @returns {string} Current encryption key
   */
  getCurrentKey() {
    return this.currentKey ? this.currentKey.key : getConfig().ENCRYPTION_KEY;
  }

  /**
   * Clean up old keys (keep only most recent 3 versions)
   */
  async cleanupOldKeys() {
    const versions = Array.from(this.keyVersions.keys()).sort((a, b) => b.localeCompare(a));

    if (versions.length <= this.maxKeyVersions) {
      return;
    }

    // Mark keys for deprecation
    const toDeprecate = versions.slice(this.maxKeyVersions);

    for (const version of toDeprecate) {
      const keyMetadata = this.keyVersions.get(version);
      keyMetadata.status = 'deprecated';

      logger.info('Marking key version as deprecated', { version });

      // Keep in memory for backward compatibility, but mark for removal
      // In production, you might want to keep deprecated keys in vault for auditing
    }
  }

  /**
   * Schedule re-encryption of all sensitive data
   * This runs as a background job to avoid blocking key rotation
   *
   * @param {string} oldVersion - Old key version
   * @param {string} newVersion - New key version
   */
  async scheduleReEncryption(oldVersion, newVersion) {
    logger.info('Starting re-encryption job', { oldVersion, newVersion });

    const startTime = Date.now();
    let reEncryptedCount = 0;
    let errorCount = 0;

    try {
      // Re-encrypt broker connections
      const brokerConnections = await BrokerConnection.find({ isActive: true });

      for (const connection of brokerConnections) {
        try {
          await this.reEncryptBrokerConnection(connection, oldVersion, newVersion);
          reEncryptedCount++;

          // Log progress every 100 records
          if (reEncryptedCount % 100 === 0) {
            logger.info('Re-encryption progress', {
              reEncryptedCount,
              errorCount,
              elapsedSeconds: Math.floor((Date.now() - startTime) / 1000)
            });
          }
        } catch (error) {
          errorCount++;
          logger.error('Failed to re-encrypt broker connection', {
            connectionId: connection._id,
            error: error.message
          });
        }
      }

      // Re-encrypt user OAuth tokens
      const users = await User.find({ 'tradingConfig.oauthTokens': { $exists: true, $ne: {} } });

      for (const user of users) {
        try {
          await this.reEncryptUserOAuthTokens(user, oldVersion, newVersion);
          reEncryptedCount++;
        } catch (error) {
          errorCount++;
          logger.error('Failed to re-encrypt user OAuth tokens', {
            userId: user._id,
            error: error.message
          });
        }
      }

      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);

      logger.info('Re-encryption job completed', {
        reEncryptedCount,
        errorCount,
        elapsedSeconds,
        recordsPerSecond: reEncryptedCount / elapsedSeconds
      });

      return {
        success: true,
        reEncryptedCount,
        errorCount,
        elapsedSeconds
      };
    } catch (error) {
      logger.error('Re-encryption job failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Re-encrypt broker connection credentials
   * @param {Object} connection - BrokerConnection document
   * @param {string} oldVersion - Old key version
   * @param {string} newVersion - New key version
   */
  async reEncryptBrokerConnection(connection, oldVersion, newVersion) {
    const { decrypt, encrypt } = require('../utils/encryption');
    const oldKey = this.getKeyByVersion(oldVersion);
    const newKey = this.getKeyByVersion(newVersion);

    if (!oldKey || !newKey) {
      throw new Error('Cannot re-encrypt: missing old or new key');
    }

    // Decrypt with old key
    const apiKeyData = {
      encrypted: connection.credentials.apiKey.encrypted,
      iv: connection.credentials.apiKey.iv,
      authTag: connection.credentials.apiKey.authTag,
      algorithm: 'aes-256-gcm'
    };

    const apiSecretData = {
      encrypted: connection.credentials.apiSecret.encrypted,
      iv: connection.credentials.apiSecret.iv,
      authTag: connection.credentials.apiSecret.authTag,
      algorithm: 'aes-256-gcm'
    };

    const apiKey = decrypt(apiKeyData, false, oldKey);
    const apiSecret = decrypt(apiSecretData, false, oldKey);

    // Encrypt with new key
    const newApiKeyData = encrypt(apiKey, newKey);
    const newApiSecretData = encrypt(apiSecret, newKey);

    // Update connection
    connection.credentials.apiKey = {
      encrypted: newApiKeyData.encrypted,
      iv: newApiKeyData.iv,
      authTag: newApiKeyData.authTag
    };

    connection.credentials.apiSecret = {
      encrypted: newApiSecretData.encrypted,
      iv: newApiSecretData.iv,
      authTag: newApiSecretData.authTag
    };

    // Add metadata about rotation
    connection.credentials.keyVersion = newVersion;
    connection.credentials.lastRotated = new Date();

    await connection.save();
  }

  /**
   * Re-encrypt user OAuth tokens
   * @param {Object} user - User document
   * @param {string} oldVersion - Old key version
   * @param {string} newVersion - New key version
   */
  async reEncryptUserOAuthTokens(user, oldVersion, newVersion) {
    const { decrypt, encrypt } = require('../utils/encryption');
    const oldKey = this.getKeyByVersion(oldVersion);
    const newKey = this.getKeyByVersion(newVersion);

    if (!oldKey || !newKey) {
      throw new Error('Cannot re-encrypt: missing old or new key');
    }

    // Re-encrypt each OAuth token
    for (const [broker, tokenData] of user.tradingConfig.oauthTokens.entries()) {
      if (tokenData.accessToken) {
        const accessToken = decrypt(
          {
            encrypted: tokenData.accessToken.encrypted,
            iv: tokenData.accessToken.iv,
            authTag: tokenData.accessToken.authTag,
            algorithm: 'aes-256-gcm'
          },
          false,
          oldKey
        );

        const newAccessToken = encrypt(accessToken, newKey);
        tokenData.accessToken = {
          encrypted: newAccessToken.encrypted,
          iv: newAccessToken.iv,
          authTag: newAccessToken.authTag
        };
      }

      if (tokenData.refreshToken) {
        const refreshToken = decrypt(
          {
            encrypted: tokenData.refreshToken.encrypted,
            iv: tokenData.refreshToken.iv,
            authTag: tokenData.refreshToken.authTag,
            algorithm: 'aes-256-gcm'
          },
          false,
          oldKey
        );

        const newRefreshToken = encrypt(refreshToken, newKey);
        tokenData.refreshToken = {
          encrypted: newRefreshToken.encrypted,
          iv: newRefreshToken.iv,
          authTag: newRefreshToken.authTag
        };
      }

      user.tradingConfig.oauthTokens.set(broker, tokenData);
    }

    await user.save();
  }

  /**
   * Store key in secure vault
   * Supports: AWS Secrets Manager, HashiCorp Vault, or file system (development only)
   *
   * @param {KeyMetadata} keyMetadata - Key metadata to store
   */
  async storeKeyInVault(keyMetadata) {
    const vaultType = process.env.VAULT_TYPE || 'env'; // 'aws', 'hashicorp', 'env'

    try {
      if (vaultType === 'aws') {
        await this._storeInAWSSecretsManager(keyMetadata);
      } else if (vaultType === 'hashicorp') {
        await this._storeInHashiCorpVault(keyMetadata);
      } else {
        logger.warn('Using environment variable storage for encryption key - not recommended for production!', {
          version: keyMetadata.version,
          instruction: `Set ENCRYPTION_KEY_${keyMetadata.version}=${keyMetadata.key} in your environment`
        });
      }

      logger.info('Encryption key stored in vault', {
        vaultType,
        version: keyMetadata.version
      });
    } catch (error) {
      logger.error('Failed to store key in vault', {
        vaultType,
        version: keyMetadata.version,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Store key in AWS Secrets Manager
   *
   * @param {KeyMetadata} keyMetadata - Key metadata
   * @returns {Promise<void>}
   * @private
   */
  async _storeInAWSSecretsManager(keyMetadata) {
    const {
      SecretsManagerClient,
      CreateSecretCommand,
      UpdateSecretCommand
    } = require('@aws-sdk/client-secrets-manager');

    const client = new SecretsManagerClient({
      region: process.env.AWS_REGION || 'us-east-1'
    });

    const secretName = `discord-trade-exec/encryption-key/${keyMetadata.version}`;
    const secretValue = keyMetadata.key;

    try {
      // Try to create new secret
      const createCommand = new CreateSecretCommand({
        Name: secretName,
        SecretString: secretValue,
        Description: `Encryption key for Discord Trade Executor (version ${keyMetadata.version})`,
        Tags: [
          { Key: 'Application', Value: 'discord-trade-executor' },
          { Key: 'Version', Value: keyMetadata.version },
          { Key: 'Status', Value: keyMetadata.status }
        ]
      });

      await client.send(createCommand);
      logger.info('Created new secret in AWS Secrets Manager', { secretName });
    } catch (error) {
      if (error.name === 'ResourceExistsException') {
        // Secret already exists, update it
        const updateCommand = new UpdateSecretCommand({
          SecretId: secretName,
          SecretString: secretValue
        });

        await client.send(updateCommand);
        logger.info('Updated existing secret in AWS Secrets Manager', { secretName });
      } else {
        throw error;
      }
    }
  }

  /**
   * Store key in HashiCorp Vault
   *
   * @param {KeyMetadata} keyMetadata - Key metadata
   * @returns {Promise<void>}
   * @private
   */
  async _storeInHashiCorpVault(keyMetadata) {
    logger.warn('HashiCorp Vault integration not yet implemented');

    // Production implementation would look like:
    // const vault = require('node-vault')({
    //   apiVersion: 'v1',
    //   endpoint: process.env.VAULT_ADDR,
    //   token: process.env.VAULT_TOKEN
    // });
    //
    // await vault.write(`secret/discord-trade-exec/encryption-key/${keyMetadata.version}`, {
    //   key: keyMetadata.key,
    //   version: keyMetadata.version,
    //   createdAt: keyMetadata.createdAt.toISOString(),
    //   status: keyMetadata.status
    // });
  }

  /**
   * Load keys from secure vault
   * This is called during initialization and after rotation
   */
  async loadKeysFromVault() {
    await this._loadPreviousKeysFromVault();
    logger.info('Encryption keys loaded from vault', {
      totalKeys: this.keyVersions.size
    });
  }

  /**
   * Check if key rotation is due (January 1st)
   * @returns {boolean} True if rotation is due
   */
  isRotationDue() {
    const now = new Date();
    const currentVersion = this.getCurrentKeyVersion();

    // Rotation is due if:
    // 1. We're on or after January 1st of a new year
    // 2. Current key version is from a previous year

    if (!this.currentKey) {
      return false;
    }

    return currentVersion > this.currentKey.version;
  }

  /**
   * Get rotation status
   * @returns {Object} Rotation status information
   */
  getRotationStatus() {
    return {
      currentVersion: this.currentKey?.version || 'unknown',
      keyCount: this.keyVersions.size,
      rotationDue: this.isRotationDue(),
      nextRotationDate: `${parseInt(this.getCurrentKeyVersion()) + 1}-01-01`,
      keyVersions: Array.from(this.keyVersions.values()).map(key => ({
        version: key.version,
        status: key.status,
        createdAt: key.createdAt
      }))
    };
  }
}

// Singleton instance
const keyRotationService = new KeyRotationService();

module.exports = {
  KeyRotationService,
  keyRotationService
};
