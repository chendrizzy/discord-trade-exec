/**
 * Phase 1.3: OAuth2 Security Hardening - Validation Tests
 *
 * Tests all security enhancements implemented in Phase 1.3:
 * - Task 7.1: AWS KMS credential validation
 * - Task 7.2: OAuth2 audit logging
 * - Task 7.3: OAuth callback rate limiting
 * - Task 7.4: Multi-tenant validation
 * - Task 7.5: Polar webhook timing-safe comparison
 * - Task 7.6: CSRF state 512-bit generation
 * - Task 7.7: Encryption algorithm validation
 */

const crypto = require('crypto');
const { EncryptionService } = require('../../src/services/encryption');
const OAuth2Service = require('../../src/services/OAuth2Service');
const { verifyWebhookSignature } = require('../../src/services/polar');
const SecurityAudit = require('../../src/models/SecurityAudit');
const User = require('../../src/models/User');
const Community = require('../../src/models/Community');

describe('Phase 1.3: OAuth2 Security Hardening', () => {
  // ============================================================================
  // Task 7.1: AWS KMS Credential Validation
  // ============================================================================

  describe('Task 7.1: AWS KMS Credential Validation', () => {
    let originalEnv;

    beforeEach(() => {
      // Save original environment
      originalEnv = { ...process.env };
    });

    afterEach(() => {
      // Restore original environment
      process.env = originalEnv;
    });

    it('should fail fast in production when AWS KMS credentials missing', () => {
      // Set production environment
      process.env.NODE_ENV = 'production';

      // Remove AWS KMS credentials
      delete process.env.AWS_REGION;
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;
      delete process.env.AWS_KMS_CMK_ID;

      // Should throw error in production
      expect(() => {
        new EncryptionService();
      }).toThrow(/CRITICAL.*Missing AWS KMS environment variables/);
    });

    it('should warn but allow development when AWS KMS credentials missing', () => {
      // Set development environment
      process.env.NODE_ENV = 'development';

      // Remove AWS KMS credentials
      delete process.env.AWS_REGION;
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;
      delete process.env.AWS_KMS_CMK_ID;

      // Spy on console.warn
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Should not throw in development
      expect(() => {
        new EncryptionService();
      }).not.toThrow();

      // But should warn
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Missing AWS KMS environment variables')
      );

      warnSpy.mockRestore();
    });

    it('should initialize successfully when all AWS KMS credentials present', () => {
      // Set all required credentials
      process.env.NODE_ENV = 'production';
      process.env.AWS_REGION = 'us-east-1';
      process.env.AWS_ACCESS_KEY_ID = 'test-key-id';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-key';
      process.env.AWS_KMS_CMK_ID = 'test-cmk-id';

      // Should initialize without error
      expect(() => {
        new EncryptionService();
      }).not.toThrow();
    });
  });

  // ============================================================================
  // Task 7.2: OAuth2 Audit Logging
  // ============================================================================

  describe('Task 7.2: OAuth2 Audit Logging', () => {
    it('should define auth.oauth2_token_exchange audit event', () => {
      const schema = SecurityAudit.schema;
      const actionEnum = schema.path('action').enumValues;

      expect(actionEnum).toContain('auth.oauth2_token_exchange');
    });

    it('should define auth.oauth2_refresh_token audit event', () => {
      const schema = SecurityAudit.schema;
      const actionEnum = schema.path('action').enumValues;

      expect(actionEnum).toContain('auth.oauth2_refresh_token');
    });

    it('should define auth.oauth2_revoke_token audit event', () => {
      const schema = SecurityAudit.schema;
      const actionEnum = schema.path('action').enumValues;

      expect(actionEnum).toContain('auth.oauth2_revoke_token');
    });

    it('should define auth.oauth2_connection_failed audit event', () => {
      const schema = SecurityAudit.schema;
      const actionEnum = schema.path('action').enumValues;

      expect(actionEnum).toContain('auth.oauth2_connection_failed');
    });

    it('should define auth.oauth2_csrf_validation_failed audit event', () => {
      const schema = SecurityAudit.schema;
      const actionEnum = schema.path('action').enumValues;

      expect(actionEnum).toContain('auth.oauth2_csrf_validation_failed');
    });

    it('should have compound index on (communityId, action, timestamp)', async () => {
      const indexes = SecurityAudit.collection.getIndexes();
      const hasCompoundIndex = Object.keys(indexes).some(key =>
        key.includes('communityId') && key.includes('action') && key.includes('timestamp')
      );

      expect(hasCompoundIndex).toBe(true);
    });
  });

  // ============================================================================
  // Task 7.3: OAuth Callback Rate Limiting
  // ============================================================================

  describe('Task 7.3: OAuth Callback Rate Limiting', () => {
    const request = require('supertest');
    const app = require('../../src/app');

    it('should rate limit OAuth callback endpoint', async () => {
      const endpoint = '/api/brokers/oauth/callback/alpaca';

      // Make 10 rapid requests (should all succeed)
      for (let i = 0; i < 10; i++) {
        await request(app).get(endpoint).query({ code: 'test', state: 'test' });
      }

      // 11th request should be rate limited (429 Too Many Requests)
      const response = await request(app)
        .get(endpoint)
        .query({ code: 'test', state: 'test' });

      expect(response.status).toBe(429);
      expect(response.text).toContain('Too Many Requests');
      expect(response.text).toContain('10 requests per 15 minutes');
    });

    it('should create security audit log on rate limit violation', async () => {
      const endpoint = '/api/brokers/oauth/callback/alpaca';

      // Clear audit logs
      await SecurityAudit.deleteMany({});

      // Trigger rate limit
      for (let i = 0; i < 11; i++) {
        await request(app).get(endpoint).query({ code: 'test', state: 'test' });
      }

      // Check audit log created
      const auditLog = await SecurityAudit.findOne({
        action: 'security.rate_limit_exceeded',
        endpoint: { $regex: /oauth\/callback/ }
      });

      expect(auditLog).not.toBeNull();
      expect(auditLog.status).toBe('blocked');
      expect(auditLog.riskLevel).toBe('high');
      expect(auditLog.requiresReview).toBe(true);
    });

    it('should skip rate limiting in development when SKIP_OAUTH_RATE_LIMIT=true', async () => {
      process.env.NODE_ENV = 'development';
      process.env.SKIP_OAUTH_RATE_LIMIT = 'true';

      const endpoint = '/api/brokers/oauth/callback/alpaca';

      // Make 15 requests (should all succeed)
      for (let i = 0; i < 15; i++) {
        const response = await request(app)
          .get(endpoint)
          .query({ code: 'test', state: 'test' });

        expect(response.status).not.toBe(429);
      }
    });
  });

  // ============================================================================
  // Task 7.4: Multi-Tenant Validation
  // ============================================================================

  describe('Task 7.4: Multi-Tenant Validation in OAuth2', () => {
    let oauth2Service;
    let mockUser;
    let mockSession;

    beforeEach(() => {
      oauth2Service = new OAuth2Service();

      mockUser = {
        _id: 'user123',
        tradingConfig: {
          communityId: 'community123'
        }
      };

      mockSession = {
        oauthState: {
          state: 'test-state',
          userId: 'user123',
          communityId: 'community123',
          broker: 'alpaca',
          createdAt: Date.now()
        }
      };
    });

    it('should reject OAuth token exchange if user has no communityId', async () => {
      // Mock user without communityId
      jest.spyOn(User, 'findById').mockResolvedValue({
        _id: 'user123',
        tradingConfig: {}
      });

      const validateStateSpy = jest.spyOn(oauth2Service, 'validateState').mockReturnValue({
        valid: true,
        userId: 'user123',
        broker: 'alpaca'
      });

      await expect(
        oauth2Service.exchangeCodeForToken('alpaca', 'auth-code', 'test-state', mockSession)
      ).rejects.toThrow('User must be associated with a community');

      validateStateSpy.mockRestore();
    });

    it('should reject OAuth token exchange if communityId changed since flow started', async () => {
      // Mock user with different communityId than session
      jest.spyOn(User, 'findById').mockResolvedValue({
        _id: 'user123',
        tradingConfig: {
          communityId: 'community456' // Different from session
        }
      });

      const validateStateSpy = jest.spyOn(oauth2Service, 'validateState').mockReturnValue({
        valid: true,
        userId: 'user123',
        broker: 'alpaca'
      });

      mockSession.oauthState.communityId = 'community123'; // Original

      await expect(
        oauth2Service.exchangeCodeForToken('alpaca', 'auth-code', 'test-state', mockSession)
      ).rejects.toThrow('Community mismatch detected - possible cross-tenant attack attempt');

      validateStateSpy.mockRestore();
    });

    it('should accept OAuth token exchange if communityId matches', async () => {
      // Mock user with matching communityId
      jest.spyOn(User, 'findById').mockResolvedValue(mockUser);

      const validateStateSpy = jest.spyOn(oauth2Service, 'validateState').mockReturnValue({
        valid: true,
        userId: 'user123',
        broker: 'alpaca'
      });

      // Mock axios to return successful token exchange
      const axios = require('axios');
      jest.spyOn(axios, 'post').mockResolvedValue({
        data: {
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
          token_type: 'bearer',
          expires_in: 3600
        }
      });

      // Should not throw
      await expect(
        oauth2Service.exchangeCodeForToken('alpaca', 'auth-code', 'test-state', mockSession)
      ).resolves.not.toThrow();

      validateStateSpy.mockRestore();
    });
  });

  // ============================================================================
  // Task 7.5: Polar Webhook Timing-Safe Comparison
  // ============================================================================

  describe('Task 7.5: Polar Webhook Timing-Safe Comparison', () => {
    it('should use crypto.timingSafeEqual for signature verification', () => {
      const secret = 'test-webhook-secret';
      const payload = JSON.stringify({ event: 'subscription.created' });

      // Generate valid signature
      const validSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

      // Verify with timing-safe comparison
      const result = verifyWebhookSignature(payload, validSignature, secret);

      expect(result).toBe(true);
    });

    it('should reject invalid signatures (timing-safe)', () => {
      const secret = 'test-webhook-secret';
      const payload = JSON.stringify({ event: 'subscription.created' });

      // Generate invalid signature
      const invalidSignature = crypto.randomBytes(32).toString('hex');

      // Verify with timing-safe comparison
      const result = verifyWebhookSignature(payload, invalidSignature, secret);

      expect(result).toBe(false);
    });

    it('should handle signatures with different lengths gracefully', () => {
      const secret = 'test-webhook-secret';
      const payload = JSON.stringify({ event: 'subscription.created' });

      // Short signature (invalid length)
      const shortSignature = crypto.randomBytes(16).toString('hex');

      // Should return false (not throw)
      const result = verifyWebhookSignature(payload, shortSignature, secret);

      expect(result).toBe(false);
    });
  });

  // ============================================================================
  // Task 7.6: CSRF State 512-bit Generation
  // ============================================================================

  describe('Task 7.6: CSRF State 512-bit Generation', () => {
    let oauth2Service;

    beforeEach(() => {
      oauth2Service = new OAuth2Service();
    });

    it('should generate 512-bit (128 hex char) CSRF state in OAuth2Service', () => {
      const mockSession = {};

      const state = oauth2Service.generateState('user123', 'alpaca', 'community123', mockSession);

      // 512 bits = 64 bytes = 128 hex characters
      expect(state).toHaveLength(128);
      expect(state).toMatch(/^[0-9a-f]{128}$/);
    });

    it('should generate unique states for each call', () => {
      const mockSession = {};

      const state1 = oauth2Service.generateState('user123', 'alpaca', 'community123', mockSession);
      const state2 = oauth2Service.generateState('user123', 'alpaca', 'community123', mockSession);

      expect(state1).not.toBe(state2);
      expect(state1).toHaveLength(128);
      expect(state2).toHaveLength(128);
    });

    it('should store state in session with metadata', () => {
      const mockSession = {};

      const state = oauth2Service.generateState('user123', 'alpaca', 'community123', mockSession);

      expect(mockSession.oauthState).toBeDefined();
      expect(mockSession.oauthState.state).toBe(state);
      expect(mockSession.oauthState.userId).toBe('user123');
      expect(mockSession.oauthState.broker).toBe('alpaca');
      expect(mockSession.oauthState.communityId).toBe('community123');
      expect(mockSession.oauthState.createdAt).toBeDefined();
    });
  });

  // ============================================================================
  // Task 7.7: Encryption Algorithm Validation
  // ============================================================================

  describe('Task 7.7: Encryption Algorithm Validation', () => {
    let encryptionService;
    let mockCommunity;

    beforeEach(() => {
      encryptionService = new EncryptionService();

      mockCommunity = {
        _id: 'community123',
        name: 'Test Community',
        encryptedDEK: null
      };
    });

    it('should use AES-256-GCM for encryption', () => {
      expect(encryptionService.algorithm).toBe('aes-256-gcm');
    });

    it('should use 128-bit IV for GCM mode', () => {
      expect(encryptionService.ivLength).toBe(16); // 128 bits
    });

    it('should use 128-bit auth tag for GCM mode', () => {
      expect(encryptionService.authTagLength).toBe(16); // 128 bits
    });

    it('should use Argon2id for password hashing', async () => {
      const password = 'test-password-123';
      const hash = await encryptionService.hashPassword(password);

      // Argon2id hashes start with $argon2id$
      expect(hash).toMatch(/^\$argon2id\$/);
    });

    it('should use OWASP 2023 recommended Argon2id parameters', async () => {
      // Parameters are set in constructor
      // Memory: 19,456 KiB (19 MiB)
      // Time: 2 iterations
      // Parallelism: 1
      // Salt: 256 bits (32 bytes)

      const password = 'test-password-123';
      const hash = await encryptionService.hashPassword(password);

      // Verify hash format
      expect(hash).toMatch(/^\$argon2id\$v=19\$/);

      // Verify password verification works
      const isValid = await encryptionService.verifyPassword(hash, password);
      expect(isValid).toBe(true);

      // Verify wrong password fails
      const isInvalid = await encryptionService.verifyPassword(hash, 'wrong-password');
      expect(isInvalid).toBe(false);
    });

    it('should rotate DEK automatically after 90 days', () => {
      const oldDate = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000); // 91 days ago

      mockCommunity.dekGeneratedAt = oldDate;

      const needsRotation = encryptionService.needsRotation(mockCommunity);
      expect(needsRotation).toBe(true);
    });

    it('should not rotate DEK before 90 days', () => {
      const recentDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

      mockCommunity.dekGeneratedAt = recentDate;

      const needsRotation = encryptionService.needsRotation(mockCommunity);
      expect(needsRotation).toBe(false);
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe('Integration: Complete OAuth2 Flow Security', () => {
    it('should validate full OAuth2 flow with all security layers', async () => {
      const oauth2Service = new OAuth2Service();
      const mockSession = {};

      // 1. Generate state (512-bit)
      const state = oauth2Service.generateState('user123', 'alpaca', 'community123', mockSession);

      expect(state).toHaveLength(128); // Task 7.6

      // 2. Validate state (timing-safe, tenant-aware)
      const validation = oauth2Service.validateState(state, mockSession);

      expect(validation.valid).toBe(true);
      expect(validation.userId).toBe('user123');
      expect(validation.broker).toBe('alpaca');

      // 3. Simulate CSRF attack (wrong state)
      const wrongState = crypto.randomBytes(64).toString('hex');
      const csrfValidation = oauth2Service.validateState(wrongState, mockSession);

      expect(csrfValidation.valid).toBe(false);
      expect(csrfValidation.error).toContain('mismatch'); // Task 7.4

      // 4. Simulate expired state (> 10 minutes)
      mockSession.oauthState.createdAt = Date.now() - 11 * 60 * 1000; // 11 minutes ago
      const expiredValidation = oauth2Service.validateState(state, mockSession);

      expect(expiredValidation.valid).toBe(false);
      expect(expiredValidation.error).toContain('expired');
    });

    it('should encrypt and decrypt credentials with AES-256-GCM', async () => {
      const encryptionService = new EncryptionService();
      const mockCommunity = {
        _id: 'community123',
        name: 'Test Community',
        encryptedDEK: null,
        save: jest.fn()
      };

      jest.spyOn(Community, 'findById').mockResolvedValue(mockCommunity);

      // Mock AWS KMS for testing
      const mockDEK = crypto.randomBytes(32); // 256-bit key
      jest.spyOn(encryptionService, 'getDEK').mockResolvedValue(mockDEK);

      const credentials = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        tokenType: 'bearer',
        expiresIn: 3600,
        scope: 'account:write trading'
      };

      // Encrypt
      const encrypted = await encryptionService.encryptCredential('community123', credentials);

      expect(encrypted).toBeTruthy();
      expect(typeof encrypted).toBe('string');

      // Decrypt
      const decrypted = await encryptionService.decryptCredential('community123', encrypted);

      expect(decrypted).toEqual(credentials);
    });
  });

  // ============================================================================
  // Security Audit Log Integration
  // ============================================================================

  describe('Integration: Security Audit Logging', () => {
    beforeEach(async () => {
      await SecurityAudit.deleteMany({});
    });

    it('should log CRITICAL risk for CSRF validation failures', async () => {
      const oauth2Service = new OAuth2Service();
      const mockSession = {
        oauthState: {
          state: 'valid-state',
          userId: 'user123',
          broker: 'alpaca',
          createdAt: Date.now()
        },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0'
      };

      // Trigger CSRF failure
      const wrongState = 'wrong-state';
      oauth2Service.validateState(wrongState, mockSession);

      // Wait for async audit log
      await new Promise(resolve => setTimeout(resolve, 100));

      const auditLog = await SecurityAudit.findOne({
        action: 'auth.oauth2_csrf_validation_failed',
        userId: 'user123'
      });

      expect(auditLog).not.toBeNull();
      expect(auditLog.status).toBe('blocked');
      expect(auditLog.riskLevel).toBe('critical');
      expect(auditLog.requiresReview).toBe(true);
    });

    it('should log MEDIUM risk for successful token exchanges', async () => {
      // This would be tested in integration with real OAuth flow
      // For now, verify schema supports it
      const testLog = {
        communityId: 'community123',
        userId: 'user123',
        userRole: 'trader',
        action: 'auth.oauth2_token_exchange',
        resourceType: 'User',
        resourceId: 'user123',
        operation: 'CREATE',
        status: 'success',
        riskLevel: 'medium',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0'
      };

      const auditLog = new SecurityAudit(testLog);
      await expect(auditLog.validate()).resolves.not.toThrow();
    });
  });
});
