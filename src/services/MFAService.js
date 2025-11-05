// Node.js built-in modules
const crypto = require('crypto');

// External dependencies
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const bcrypt = require('bcrypt');

// Internal dependencies
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Multi-Factor Authentication (MFA) Service
 *
 * Phase 6 Security Enhancement - TOTP-based MFA
 *
 * Implements Time-based One-Time Password (TOTP) authentication per RFC 6238.
 * Provides backup codes for account recovery.
 *
 * Security Features:
 * - TOTP secrets encrypted with AES-256-GCM at rest
 * - Backup codes hashed with bcrypt (cost factor 10)
 * - Rate limiting: 5 attempts per 15 minutes per user
 * - Timing-safe comparisons for all token verification
 * - QR codes generated on-demand (not stored)
 *
 * Dependencies:
 * - speakeasy: RFC 6238 TOTP implementation
 * - qrcode: QR code generation for authenticator apps
 * - bcrypt: Backup code hashing
 * - crypto: AES-256-GCM encryption for TOTP secrets
 *
 * Environment Variables Required:
 * - MFA_ENCRYPTION_KEY: 32-byte hex string for AES-256-GCM encryption
 * - APP_NAME: Application name shown in authenticator apps (default: "Discord Trade Exec")
 *
 * Usage:
 *   const mfaService = new MFAService();
 *   const setup = await mfaService.generateSecret(userId);
 *   const isValid = await mfaService.verifyTOTP(userId, '123456');
 *   await mfaService.enableMFA(userId, '123456');
 */
class MFAService {
  constructor() {
    // Encryption configuration for TOTP secrets
    this.algorithm = 'aes-256-gcm';
    this.ivLength = 16; // 128 bits for GCM
    this.authTagLength = 16; // 128 bits for authentication
    this.saltLength = 32; // 256 bits for bcrypt

    // Validate MFA_ENCRYPTION_KEY environment variable
    if (!process.env.MFA_ENCRYPTION_KEY) {
      const fallbackHex = process.env.ENCRYPTION_KEY;

      if (fallbackHex && /^[0-9a-f]{64}$/i.test(fallbackHex)) {
        logger.warn('[MFAService] MFA_ENCRYPTION_KEY not set. Falling back to ENCRYPTION_KEY (recommended to set dedicated key).');
        this.encryptionKey = Buffer.from(fallbackHex, 'hex');
      } else if (process.env.NODE_ENV === 'production') {
        throw new Error('CRITICAL: MFA_ENCRYPTION_KEY environment variable required in production (or provide valid ENCRYPTION_KEY fallback).');
      } else {
        logger.warn('[MFAService] WARNING: MFA_ENCRYPTION_KEY not set. Using random in-memory key (NOT suitable for production).');
        this.encryptionKey = crypto.randomBytes(32);
      }
    } else {
      if (!/^[0-9a-f]{64}$/i.test(process.env.MFA_ENCRYPTION_KEY)) {
        throw new Error('MFA_ENCRYPTION_KEY must be a 64-character hexadecimal string (32 bytes)');
      }
      this.encryptionKey = Buffer.from(process.env.MFA_ENCRYPTION_KEY, 'hex');
    }

    // Application name for authenticator apps
    this.appName = process.env.APP_NAME || 'Discord Trade Exec';

    // TOTP configuration (per RFC 6238)
    this.totpWindow = 1; // Allow 1 time-step before/after for clock skew (±30 seconds)
    this.totpStep = 30; // 30-second time step (standard)
    this.totpDigits = 6; // 6-digit codes (standard)

    // Backup code configuration
    this.backupCodeCount = 10; // Generate 10 backup codes
    this.backupCodeLength = 8; // 8 characters (format: XXXX-XXXX)
    this.bcryptRounds = 10; // Bcrypt cost factor

    // Rate limiting configuration
    this.maxAttempts = 5; // Maximum verification attempts
    this.rateLimitWindow = 15 * 60 * 1000; // 15 minutes in milliseconds
    this.attemptCache = new Map(); // In-memory rate limit tracking

    // Start rate limit cache cleanup
    this.startRateLimitCleanup();
  }

  /**
   * Generate TOTP Secret and QR Code
   *
   * Creates a new TOTP secret for the user and generates a QR code
   * that can be scanned by authenticator apps (Google Authenticator, Authy, etc.).
   *
   * IMPORTANT: This method does NOT enable MFA. User must call enableMFA() after
   * successfully verifying the initial TOTP token to confirm setup.
   *
   * @param {string} userId - User ID (MongoDB ObjectId as string)
   * @returns {Promise<Object>} Setup information
   * @returns {Object.secret} - Base32-encoded TOTP secret (store securely)
   * @returns {Object.qrCode} - Data URL for QR code image (display to user)
   * @returns {Object.manualEntry} - Secret for manual entry (if QR scan fails)
   *
   * @throws {Error} User not found
   * @throws {Error} MFA already enabled for this user
   *
   * @example
   * const setup = await mfaService.generateSecret(userId);
   * // Display setup.qrCode as <img src="..." /> in frontend
   * // User scans QR code with authenticator app
   * // User enters first TOTP code to verify setup
   */
  async generateSecret(userId) {
    // Fetch user
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Check if MFA already enabled
    if (user.mfa?.enabled) {
      throw new Error('MFA is already enabled for this user. Disable first to re-setup.');
    }

    // Generate TOTP secret (base32 encoded, 20 bytes = 160 bits entropy)
    const secret = speakeasy.generateSecret({
      name: `${this.appName} (${user.discordUsername})`,
      issuer: this.appName,
      length: 20 // 160 bits entropy (OWASP recommended minimum)
    });

    // Generate QR code data URL
    const qrCodeDataURL = await qrcode.toDataURL(secret.otpauth_url);

    // Encrypt TOTP secret before returning
    const encryptedSecret = this.encryptSecret(secret.base32);

    // Store encrypted secret temporarily (not yet enabled)
    // User must verify first TOTP token to enable MFA
    user.mfa = {
      enabled: false,
      secret: encryptedSecret,
      backupCodes: [], // Will be generated upon enableMFA()
      verifiedAt: null,
      lastVerified: null
    };

    await user.save();

    logger.info('[MFAService] Generated TOTP secret', {
      discordUsername: user.discordUsername,
      userId
    });

    return {
      secret: secret.base32, // Return plaintext secret (for immediate verification)
      qrCode: qrCodeDataURL, // Data URL for QR code image
      manualEntry: secret.base32, // For manual entry if QR scan fails
      message: 'Scan QR code with authenticator app and enter the 6-digit code to complete setup'
    };
  }

  /**
   * Verify TOTP Token
   *
   * Verifies a 6-digit TOTP token against the user's encrypted secret.
   * Uses timing-safe comparison to prevent timing attacks.
   * Implements rate limiting: 5 attempts per 15 minutes.
   *
   * @param {string} userId - User ID
   * @param {string} token - 6-digit TOTP token from authenticator app
   * @returns {Promise<boolean>} - True if token valid, false otherwise
   *
   * @throws {Error} User not found
   * @throws {Error} MFA not configured for user
   * @throws {Error} Rate limit exceeded (429)
   *
   * @example
   * const isValid = await mfaService.verifyTOTP(userId, '123456');
   * if (isValid) {
   *   // Allow login or complete setup
   * }
   */
  async verifyTOTP(userId, token) {
    // Rate limiting check
    this.checkRateLimit(userId);

    // Fetch user with MFA secret (select: false requires explicit selection)
    const user = await User.findById(userId).select('+mfa.secret');
    if (!user) {
      this.recordAttempt(userId, false);
      throw new Error('User not found');
    }

    // Check if MFA configured
    if (!user.mfa?.secret) {
      this.recordAttempt(userId, false);
      throw new Error('MFA not configured for this user. Call generateSecret() first.');
    }

    // Decrypt TOTP secret
    const decryptedSecret = this.decryptSecret(user.mfa.secret);

    // Verify TOTP token
    const isValid = speakeasy.totp.verify({
      secret: decryptedSecret,
      encoding: 'base32',
      token: token,
      window: this.totpWindow, // Allow ±30 seconds clock skew
      step: this.totpStep,
      digits: this.totpDigits
    });

    // Record attempt
    this.recordAttempt(userId, isValid);

    if (isValid && user.mfa.enabled) {
      // Update last verified timestamp
      user.mfa.lastVerified = new Date();
      await user.save();

      logger.info('[MFAService] TOTP verified successfully', {
        discordUsername: user.discordUsername,
        userId
      });
    }

    return isValid;
  }

  /**
   * Enable MFA
   *
   * Enables MFA for the user after successful TOTP verification.
   * Generates 10 backup codes for account recovery.
   *
   * IMPORTANT: User must verify initial TOTP token to prove authenticator app setup.
   *
   * @param {string} userId - User ID
   * @param {string} token - 6-digit TOTP token for verification
   * @returns {Promise<Object>} Backup codes and status
   * @returns {Object.backupCodes} - Array of 10 backup codes (format: XXXX-XXXX)
   * @returns {Object.enabled} - True if MFA enabled successfully
   *
   * @throws {Error} Invalid TOTP token
   * @throws {Error} MFA already enabled
   *
   * @example
   * const result = await mfaService.enableMFA(userId, '123456');
   * // Display result.backupCodes to user (one-time only)
   * // User must save backup codes securely
   */
  async enableMFA(userId, token) {
    // Fetch user with MFA secret first to check status
    const user = await User.findById(userId).select('+mfa.secret');

    // Check if already enabled (do this BEFORE verifying token)
    if (user.mfa.enabled) {
      throw new Error('MFA is already enabled for this user');
    }

    // Verify TOTP token
    const isValid = await this.verifyTOTP(userId, token);
    if (!isValid) {
      throw new Error('Invalid TOTP token. Please try again.');
    }

    // Generate backup codes
    const backupCodes = await this.generateBackupCodesInternal();

    // Hash backup codes before storing
    const hashedBackupCodes = await Promise.all(
      backupCodes.map(async code => ({
        code: await bcrypt.hash(code, this.bcryptRounds),
        used: false,
        usedAt: null
      }))
    );

    // Enable MFA
    user.mfa.enabled = true;
    user.mfa.backupCodes = hashedBackupCodes;
    user.mfa.verifiedAt = new Date();
    user.mfa.lastVerified = new Date();

    await user.save();

    logger.info('[MFAService] MFA enabled successfully', {
      discordUsername: user.discordUsername,
      userId
    });

    return {
      enabled: true,
      backupCodes: backupCodes, // Return plaintext codes (only time they're accessible)
      message: 'MFA enabled successfully. Save these backup codes securely - they will not be shown again.'
    };
  }

  /**
   * Disable MFA
   *
   * Disables MFA for the user after TOTP verification.
   * Clears all MFA data (secret, backup codes, timestamps).
   *
   * SECURITY: Requires TOTP verification to prevent unauthorized MFA removal.
   *
   * @param {string} userId - User ID
   * @param {string} token - 6-digit TOTP token for verification
   * @returns {Promise<Object>} Status
   * @returns {Object.disabled} - True if MFA disabled successfully
   *
   * @throws {Error} Invalid TOTP token
   * @throws {Error} MFA not enabled
   *
   * @example
   * const result = await mfaService.disableMFA(userId, '123456');
   */
  async disableMFA(userId, token) {
    // Fetch user first to check status
    const user = await User.findById(userId).select('+mfa.secret');

    // Check if MFA enabled (do this BEFORE verifying token)
    if (!user.mfa?.enabled) {
      throw new Error('MFA is not enabled for this user');
    }

    // Verify TOTP token
    const isValid = await this.verifyTOTP(userId, token);
    if (!isValid) {
      throw new Error('Invalid TOTP token. Cannot disable MFA without verification.');
    }

    // Clear all MFA data
    user.mfa = {
      enabled: false,
      secret: undefined,
      backupCodes: [],
      verifiedAt: null,
      lastVerified: null
    };

    await user.save();

    logger.info('[MFAService] MFA disabled', {
      discordUsername: user.discordUsername,
      userId
    });

    return {
      disabled: true,
      message: 'MFA disabled successfully'
    };
  }

  /**
   * Generate Backup Codes
   *
   * Generates 10 new backup codes, replacing any existing codes.
   * Requires TOTP verification to prevent unauthorized regeneration.
   *
   * IMPORTANT: Old backup codes are invalidated immediately.
   *
   * @param {string} userId - User ID
   * @param {string} token - 6-digit TOTP token for verification
   * @returns {Promise<Object>} New backup codes
   * @returns {Object.backupCodes} - Array of 10 backup codes (format: XXXX-XXXX)
   *
   * @throws {Error} Invalid TOTP token
   * @throws {Error} MFA not enabled
   *
   * @example
   * const result = await mfaService.regenerateBackupCodes(userId, '123456');
   * // Display result.backupCodes to user (one-time only)
   */
  async regenerateBackupCodes(userId, token) {
    // Fetch user first to check status
    const user = await User.findById(userId);

    // Check if MFA enabled (do this BEFORE verifying token)
    if (!user.mfa?.enabled) {
      throw new Error('MFA is not enabled for this user');
    }

    // Verify TOTP token
    const isValid = await this.verifyTOTP(userId, token);
    if (!isValid) {
      throw new Error('Invalid TOTP token. Cannot regenerate backup codes without verification.');
    }

    // Generate new backup codes
    const backupCodes = await this.generateBackupCodesInternal();

    // Hash backup codes before storing
    const hashedBackupCodes = await Promise.all(
      backupCodes.map(async code => ({
        code: await bcrypt.hash(code, this.bcryptRounds),
        used: false,
        usedAt: null
      }))
    );

    // Replace old backup codes
    user.mfa.backupCodes = hashedBackupCodes;

    await user.save();

    logger.info('[MFAService] Backup codes regenerated', {
      discordUsername: user.discordUsername,
      userId
    });

    return {
      backupCodes: backupCodes, // Return plaintext codes (only time they're accessible)
      message: 'New backup codes generated. Save them securely - old codes are now invalid.'
    };
  }

  /**
   * Verify Backup Code
   *
   * Verifies a backup code and marks it as used.
   * Each backup code can only be used once.
   *
   * @param {string} userId - User ID
   * @param {string} code - Backup code (format: XXXX-XXXX or XXXXXXXX)
   * @returns {Promise<boolean>} - True if code valid and not used, false otherwise
   *
   * @throws {Error} User not found
   * @throws {Error} MFA not enabled
   * @throws {Error} Rate limit exceeded (429)
   *
   * @example
   * const isValid = await mfaService.verifyBackupCode(userId, '1234-5678');
   * if (isValid) {
   *   // Allow login
   * }
   */
  async verifyBackupCode(userId, code) {
    // Rate limiting check
    this.checkRateLimit(userId);

    // Normalize code (remove hyphens)
    const normalizedCode = code.replace(/-/g, '');

    // Fetch user
    const user = await User.findById(userId);
    if (!user) {
      this.recordAttempt(userId, false);
      throw new Error('User not found');
    }

    // Check if MFA enabled
    if (!user.mfa?.enabled) {
      this.recordAttempt(userId, false);
      throw new Error('MFA is not enabled for this user');
    }

    // Check each backup code
    for (const backupCode of user.mfa.backupCodes) {
      // Skip already used codes
      if (backupCode.used) continue;

      // Verify against hashed code (timing-safe comparison via bcrypt)
      const isMatch = await bcrypt.compare(normalizedCode, backupCode.code);

      if (isMatch) {
        // Mark code as used
        backupCode.used = true;
        backupCode.usedAt = new Date();
        user.mfa.lastVerified = new Date();

        // Mark nested array as modified for Mongoose to detect changes
        user.markModified('mfa.backupCodes');

        await user.save();

        this.recordAttempt(userId, true);

        logger.info('[MFAService] Backup code verified', {
          discordUsername: user.discordUsername,
          userId
        });

        return true;
      }
    }

    // No matching code found
    this.recordAttempt(userId, false);
    return false;
  }

  /**
   * Get MFA Status
   *
   * Returns current MFA status for the user.
   *
   * @param {string} userId - User ID
   * @returns {Promise<Object>} MFA status
   * @returns {Object.enabled} - True if MFA enabled
   * @returns {Object.verifiedAt} - When MFA was first enabled
   * @returns {Object.lastVerified} - Last successful verification
   * @returns {Object.backupCodesRemaining} - Number of unused backup codes
   *
   * @throws {Error} User not found
   *
   * @example
   * const status = await mfaService.getMFAStatus(userId);
   * if (status.enabled) {
   *   logger.info('[MFA] Backup codes status', {
   *     backupCodesRemaining: status.backupCodesRemaining
   *   });
   * }
   */
  async getMFAStatus(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Count remaining backup codes
    const backupCodesRemaining = user.mfa?.backupCodes?.filter(bc => !bc.used).length || 0;

    return {
      enabled: user.mfa?.enabled || false,
      verifiedAt: user.mfa?.verifiedAt || null,
      lastVerified: user.mfa?.lastVerified || null,
      backupCodesRemaining,
      warning: backupCodesRemaining < 3 ? 'Low backup codes remaining. Consider regenerating.' : null
    };
  }

  // ========================================
  // INTERNAL UTILITY METHODS
  // ========================================

  /**
   * Generate Backup Codes (Internal)
   *
   * Generates 10 random backup codes in format XXXX-XXXX.
   * Uses crypto.randomBytes for cryptographic randomness.
   *
   * @private
   * @returns {Promise<string[]>} Array of 10 backup codes
   */
  async generateBackupCodesInternal() {
    const codes = [];

    for (let i = 0; i < this.backupCodeCount; i++) {
      // Generate random bytes
      const randomBytes = crypto.randomBytes(4); // 32 bits

      // Convert to alphanumeric (uppercase)
      const code = randomBytes
        .toString('hex')
        .toUpperCase()
        .substring(0, 8); // Take first 8 characters

      // Format as XXXX-XXXX
      const formattedCode = `${code.substring(0, 4)}-${code.substring(4, 8)}`;

      codes.push(formattedCode);
    }

    return codes;
  }

  /**
   * Encrypt TOTP Secret
   *
   * Encrypts TOTP secret using AES-256-GCM.
   * Returns base64-encoded encrypted data with IV and auth tag.
   *
   * @private
   * @param {string} secret - Base32-encoded TOTP secret
   * @returns {string} Base64-encoded encrypted secret
   */
  encryptSecret(secret) {
    // Generate random IV
    const iv = crypto.randomBytes(this.ivLength);

    // Create cipher
    const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);

    // Encrypt secret
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    // Combine IV + encrypted data + auth tag
    const combined = Buffer.concat([iv, encrypted, authTag]);

    // Return base64-encoded
    return combined.toString('base64');
  }

  /**
   * Decrypt TOTP Secret
   *
   * Decrypts TOTP secret encrypted with AES-256-GCM.
   * Verifies authentication tag to prevent tampering.
   *
   * @private
   * @param {string} encryptedSecret - Base64-encoded encrypted secret
   * @returns {string} Base32-encoded TOTP secret
   *
   * @throws {Error} Decryption failed (corrupted or tampered data)
   */
  decryptSecret(encryptedSecret) {
    try {
      // Decode base64
      const combined = Buffer.from(encryptedSecret, 'base64');

      // Extract IV, encrypted data, and auth tag
      const iv = combined.slice(0, this.ivLength);
      const authTag = combined.slice(-this.authTagLength);
      const encrypted = combined.slice(this.ivLength, -this.authTagLength);

      // Create decipher
      const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, iv);
      decipher.setAuthTag(authTag);

      // Decrypt
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

      return decrypted.toString('utf8');
    } catch (error) {
      logger.error('[MFAService] Secret decryption failed:', { error: error.message, stack: error.stack });
      throw new Error('Failed to decrypt MFA secret. Data may be corrupted or tampered.');
    }
  }

  /**
   * Check Rate Limit
   *
   * Checks if user has exceeded rate limit for MFA verification attempts.
   * Throws error if rate limit exceeded.
   *
   * @private
   * @param {string} userId - User ID
   * @throws {Error} Rate limit exceeded (429)
   */
  checkRateLimit(userId) {
    // Convert ObjectId to string for Map key
    const userIdStr = userId.toString();
    const attempts = this.attemptCache.get(userIdStr);

    if (!attempts) {
      return; // No attempts yet
    }

    // Filter attempts within rate limit window
    const recentAttempts = attempts.filter(
      attempt => Date.now() - attempt.timestamp < this.rateLimitWindow
    );

    if (recentAttempts.length >= this.maxAttempts) {
      const oldestAttempt = recentAttempts[0];
      const resetTime = new Date(oldestAttempt.timestamp + this.rateLimitWindow);

      throw new Error(
        `Rate limit exceeded. Too many MFA verification attempts. Try again at ${resetTime.toISOString()}`
      );
    }
  }

  /**
   * Record Verification Attempt
   *
   * Records MFA verification attempt for rate limiting.
   *
   * @private
   * @param {string} userId - User ID
   * @param {boolean} success - Whether attempt was successful
   */
  recordAttempt(userId, success) {
    // Convert ObjectId to string for Map key
    const userIdStr = userId.toString();
    let attempts = this.attemptCache.get(userIdStr);

    if (!attempts) {
      attempts = [];
      this.attemptCache.set(userIdStr, attempts);
    }

    attempts.push({
      timestamp: Date.now(),
      success
    });

    // Keep only recent attempts (within window)
    const recentAttempts = attempts.filter(
      attempt => Date.now() - attempt.timestamp < this.rateLimitWindow
    );

    this.attemptCache.set(userIdStr, recentAttempts);
  }

  /**
   * Rate Limit Cache Cleanup
   *
   * Clears expired rate limit entries every 5 minutes.
   *
   * @private
   */
  startRateLimitCleanup() {
    this.cleanupInterval = setInterval(
      () => {
        const now = Date.now();

        for (const [userId, attempts] of this.attemptCache.entries()) {
          // Filter out expired attempts
          const recentAttempts = attempts.filter(
            attempt => now - attempt.timestamp < this.rateLimitWindow
          );

          if (recentAttempts.length === 0) {
            // No recent attempts - remove user from cache
            this.attemptCache.delete(userId);
          } else {
            // Update with filtered attempts
            this.attemptCache.set(userId, recentAttempts);
          }
        }

        logger.info('[MFAService] Rate limit cache cleaned', {
          activeUsers: this.attemptCache.size
        });
      },
      5 * 60 * 1000
    ); // Every 5 minutes
  }

  /**
   * Shutdown MFA Service
   *
   * Clears the rate limit cleanup interval.
   * Should be called during graceful shutdown or in test teardown.
   */
  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('[MFAService] Shutdown complete - cleanup interval cleared');
    }
  }

  /**
   * Clear Rate Limit
   *
   * Manually clear rate limit for a user (useful for testing or admin override).
   *
   * @param {string} userId - User ID
   */
  clearRateLimit(userId) {
    // Convert ObjectId to string to match Map key format
    this.attemptCache.delete(userId.toString());
    logger.info('[MFAService] Rate limit cleared', { userId });
  }

  /**
   * Get Rate Limit Stats
   *
   * Returns current rate limit statistics for monitoring.
   *
   * @returns {Object} Rate limit statistics
   */
  getRateLimitStats() {
    return {
      activeUsers: this.attemptCache.size,
      users: Array.from(this.attemptCache.keys()),
      totalAttempts: Array.from(this.attemptCache.values()).reduce((sum, attempts) => sum + attempts.length, 0)
    };
  }
}

// Singleton instance
let mfaServiceInstance = null;

/**
 * Get MFA Service Instance
 *
 * Returns singleton instance of MFAService.
 * Creates new instance if not exists.
 *
 * @returns {MFAService} MFA service instance
 */
function getMFAService() {
  if (!mfaServiceInstance) {
    mfaServiceInstance = new MFAService();
  }
  return mfaServiceInstance;
}

module.exports = {
  MFAService,
  getMFAService
};
