/**
 * Unit Tests for OAuth2Service
 * Tests OAuth2 authorization flow, token exchange, token refresh, and encryption
 */

const crypto = require('crypto');
const axios = require('axios');
const mongoose = require('mongoose');

// Set encryption key BEFORE loading OAuth2Service
process.env.ENCRYPTION_KEY = 'a'.repeat(64); // 64 hex chars = 32 bytes

// Mock dependencies BEFORE requiring the service
jest.mock('axios');
jest.mock('../../src/config/oauth2Providers');
jest.mock('../../src/models/User');

const { OAuth2Service } = require('../../src/services/OAuth2Service');
const { getProviderConfig, isOAuth2Broker } = require('../../src/config/oauth2Providers');
const User = require('../../src/models/User');

describe('OAuth2Service', () => {
  let oauth2Service;
  let mockSession;
  let mockUserId;
  let mockUser;
  let mockConfig;

  // Mock encryption key (32 bytes)
  const mockEncryptionKey = 'a'.repeat(64); // 64 hex chars = 32 bytes

  beforeEach(() => {
    jest.clearAllMocks();

    // Set encryption key
    process.env.ENCRYPTION_KEY = mockEncryptionKey;

    // Create fresh instance
    oauth2Service = new OAuth2Service();

    mockUserId = new mongoose.Types.ObjectId().toString();

    // Mock session object
    mockSession = {
      oauthState: null
    };

    // Mock user object
    mockUser = {
      _id: mockUserId,
      tradingConfig: {
        communityId: new mongoose.Types.ObjectId(),
        oauthTokens: new Map()
      },
      save: jest.fn().mockResolvedValue(true)
    };

    // Mock OAuth2 provider config
    mockConfig = {
      authorizationURL: 'https://api.broker.com/oauth/authorize',
      tokenURL: 'https://api.broker.com/oauth/token',
      clientId: 'test_client_id',
      clientSecret: 'test_client_secret',
      redirectUri: 'http://localhost:3000/auth/broker/callback',
      scopes: ['trading', 'account'],
      tokenExpiry: 7 * 24 * 60 * 60 * 1000, // 7 days
      supportsRefreshTokenRotation: true
    };
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  describe('Constructor', () => {
    test('should throw error if ENCRYPTION_KEY is missing', () => {
      delete process.env.ENCRYPTION_KEY;

      expect(() => new OAuth2Service()).toThrow('[OAuth2Service] ENCRYPTION_KEY environment variable is required');
    });

    test('should throw error if ENCRYPTION_KEY is wrong length', () => {
      process.env.ENCRYPTION_KEY = 'short'; // Not 32 bytes

      expect(() => new OAuth2Service()).toThrow('[OAuth2Service] ENCRYPTION_KEY must be 32 bytes (64 hex characters)');
    });

    test('should initialize successfully with valid encryption key', () => {
      expect(() => new OAuth2Service()).not.toThrow();
    });
  });

  describe('generateAuthorizationURL', () => {
    beforeEach(() => {
      isOAuth2Broker.mockReturnValue(true);
      getProviderConfig.mockReturnValue(mockConfig);
    });

    test('should generate authorization URL successfully', () => {
      const url = oauth2Service.generateAuthorizationURL('alpaca', mockUserId, mockSession);

      expect(url).toContain('https://api.broker.com/oauth/authorize');
      expect(url).toContain('response_type=code');
      expect(url).toContain('client_id=test_client_id');
      expect(url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fbroker%2Fcallback');
      expect(url).toContain('scope=trading+account');
      expect(url).toContain('state=');
    });

    test('should store state in session with metadata', () => {
      oauth2Service.generateAuthorizationURL('alpaca', mockUserId, mockSession);

      expect(mockSession.oauthState).toBeDefined();
      expect(mockSession.oauthState.state).toBeDefined();
      expect(mockSession.oauthState.state.length).toBe(128); // 64 bytes hex = 128 chars
      expect(mockSession.oauthState.broker).toBe('alpaca');
      expect(mockSession.oauthState.userId).toBe(mockUserId);
      expect(mockSession.oauthState.createdAt).toBeDefined();
    });

    test('should generate unique state parameters', () => {
      const url1 = oauth2Service.generateAuthorizationURL('alpaca', mockUserId, mockSession);
      const state1 = mockSession.oauthState.state;

      const url2 = oauth2Service.generateAuthorizationURL('alpaca', mockUserId, mockSession);
      const state2 = mockSession.oauthState.state;

      expect(state1).not.toBe(state2);
    });

    test('should throw error if broker not supported', () => {
      isOAuth2Broker.mockReturnValue(false);

      expect(() => oauth2Service.generateAuthorizationURL('invalid', mockUserId, mockSession))
        .toThrow("Broker 'invalid' does not support OAuth2 or is not enabled");
    });

    test('should throw error if userId is missing', () => {
      expect(() => oauth2Service.generateAuthorizationURL('alpaca', null, mockSession))
        .toThrow('User authentication required for OAuth2 flow');
    });
  });

  describe('validateState', () => {
    const STATE_TTL_MS = 5 * 60 * 1000; // 5 minutes

    beforeEach(() => {
      mockSession.oauthState = {
        state: 'test_state_12345',
        broker: 'alpaca',
        userId: mockUserId,
        createdAt: Date.now()
      };
    });

    test('should validate state successfully', () => {
      const result = oauth2Service.validateState('test_state_12345', mockSession);

      expect(result.valid).toBe(true);
      expect(result.userId).toBe(mockUserId);
      expect(result.broker).toBe('alpaca');
    });

    test('should return error if session state not found', () => {
      mockSession.oauthState = null;

      const result = oauth2Service.validateState('test_state_12345', mockSession);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Session state not found');
    });

    test('should return error if state mismatch', () => {
      const result = oauth2Service.validateState('wrong_state', mockSession);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('State mismatch - possible CSRF attack');
    });

    test('should return error if state expired', () => {
      mockSession.oauthState.createdAt = Date.now() - (STATE_TTL_MS + 1000); // Expired

      const result = oauth2Service.validateState('test_state_12345', mockSession);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('State expired');
    });

    test('should accept state within TTL', () => {
      mockSession.oauthState.createdAt = Date.now() - (STATE_TTL_MS - 1000); // Still valid

      const result = oauth2Service.validateState('test_state_12345', mockSession);

      expect(result.valid).toBe(true);
    });
  });

  describe('exchangeCodeForToken', () => {
    const mockCode = 'auth_code_12345';
    const mockState = 'test_state_12345';

    beforeEach(() => {
      mockSession.oauthState = {
        state: mockState,
        broker: 'alpaca',
        userId: mockUserId,
        communityId: mockUser.tradingConfig.communityId.toString(),
        createdAt: Date.now()
      };

      getProviderConfig.mockReturnValue(mockConfig);

      // Mock User.findById to return our mock user
      User.findById = jest.fn().mockResolvedValue(mockUser);

      // Mock successful token response
      axios.post.mockResolvedValue({
        data: {
          access_token: 'access_token_value',
          refresh_token: 'refresh_token_value',
          expires_in: 604800, // 7 days in seconds
          scope: 'trading account',
          token_type: 'Bearer'
        }
      });
    });

    test('should exchange code for tokens successfully', async () => {
      const result = await oauth2Service.exchangeCodeForToken('alpaca', mockCode, mockState, mockSession);

      expect(result.accessToken).toBe('access_token_value');
      expect(result.refreshToken).toBe('refresh_token_value');
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.scopes).toEqual(['trading', 'account']);
      expect(result.tokenType).toBe('Bearer');
    });

    test('should send correct token request', async () => {
      await oauth2Service.exchangeCodeForToken('alpaca', mockCode, mockState, mockSession);

      expect(axios.post).toHaveBeenCalledWith(
        'https://api.broker.com/oauth/token',
        expect.stringContaining('grant_type=authorization_code'),
        expect.objectContaining({
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        })
      );
    });

    test('should clear session state after successful exchange', async () => {
      await oauth2Service.exchangeCodeForToken('alpaca', mockCode, mockState, mockSession);

      expect(mockSession.oauthState).toBeUndefined();
    });

    test('should throw error if state validation fails', async () => {
      await expect(
        oauth2Service.exchangeCodeForToken('alpaca', mockCode, 'wrong_state', mockSession)
      ).rejects.toThrow('OAuth2 state validation failed');
    });

    test('should throw error if provider config not found', async () => {
      getProviderConfig.mockReturnValue(null);

      await expect(
        oauth2Service.exchangeCodeForToken('alpaca', mockCode, mockState, mockSession)
      ).rejects.toThrow("Broker 'alpaca' OAuth2 configuration not found");
    });

    test('should throw error if token exchange fails', async () => {
      axios.post.mockRejectedValue({
        response: {
          data: {
            error: 'invalid_grant',
            error_description: 'Authorization code expired'
          }
        }
      });

      await expect(
        oauth2Service.exchangeCodeForToken('alpaca', mockCode, mockState, mockSession)
      ).rejects.toThrow('Token exchange failed: Authorization code expired');
    });

    test('should use default scopes if broker response missing scope', async () => {
      axios.post.mockResolvedValue({
        data: {
          access_token: 'access_token_value',
          refresh_token: 'refresh_token_value',
          expires_in: 604800,
          token_type: 'Bearer'
          // scope missing
        }
      });

      const result = await oauth2Service.exchangeCodeForToken('alpaca', mockCode, mockState, mockSession);

      expect(result.scopes).toEqual(mockConfig.scopes);
    });
  });

  describe('refreshAccessToken', () => {
    const mockBroker = 'alpaca';

    beforeEach(() => {
      getProviderConfig.mockReturnValue(mockConfig);

      // Create properly encrypted tokens for testing
      const encryptedAccessToken = oauth2Service.encryptToken('old_access_token');
      const encryptedRefreshToken = oauth2Service.encryptToken('old_refresh_token');

      mockUser.tradingConfig.oauthTokens.set(mockBroker, {
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt: new Date(Date.now() - 1000), // Expired
        scopes: ['trading', 'account'],
        tokenType: 'Bearer'
      });

      User.findById = jest.fn().mockResolvedValue(mockUser);

      // Mock successful refresh response
      axios.post.mockResolvedValue({
        data: {
          access_token: 'new_access_token',
          refresh_token: 'new_refresh_token',
          expires_in: 604800,
          scope: 'trading account',
          token_type: 'Bearer'
        }
      });
    });

    test('should refresh access token successfully', async () => {
      const result = await oauth2Service.refreshAccessToken(mockBroker, mockUserId);

      expect(result.accessToken).toBe('new_access_token');
      expect(result.refreshToken).toBe('new_refresh_token');
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    test('should handle token rotation when supported', async () => {
      mockConfig.supportsRefreshTokenRotation = true;
      axios.post.mockResolvedValue({
        data: {
          access_token: 'new_access_token',
          refresh_token: 'rotated_refresh_token',
          expires_in: 604800
        }
      });

      const result = await oauth2Service.refreshAccessToken(mockBroker, mockUserId);

      expect(result.refreshToken).toBe('rotated_refresh_token');
    });

    test('should reuse refresh token when rotation not supported', async () => {
      mockConfig.supportsRefreshTokenRotation = false;
      axios.post.mockResolvedValue({
        data: {
          access_token: 'new_access_token',
          // No new refresh_token in response
          expires_in: 604800
        }
      });

      const result = await oauth2Service.refreshAccessToken(mockBroker, mockUserId);

      // Should decrypt and reuse old refresh token
      expect(result.refreshToken).toBeDefined();
    });

    test('should update user document with new tokens', async () => {
      await oauth2Service.refreshAccessToken(mockBroker, mockUserId);

      expect(mockUser.save).toHaveBeenCalled();
      const savedTokens = mockUser.tradingConfig.oauthTokens.get(mockBroker);
      expect(savedTokens.isValid).toBe(true);
      expect(savedTokens.lastRefreshError).toBeNull();
      expect(savedTokens.lastRefreshAttempt).toBeInstanceOf(Date);
    });

    test('should throw error if user not found', async () => {
      User.findById = jest.fn().mockResolvedValue(null);

      await expect(
        oauth2Service.refreshAccessToken(mockBroker, mockUserId)
      ).rejects.toThrow(`User '${mockUserId}' not found`);
    });

    test('should throw error if no refresh token found', async () => {
      mockUser.tradingConfig.oauthTokens.delete(mockBroker);

      await expect(
        oauth2Service.refreshAccessToken(mockBroker, mockUserId)
      ).rejects.toThrow(`No OAuth2 refresh token found for broker '${mockBroker}'`);
    });

    test('should mark tokens invalid on permanent error (4xx)', async () => {
      axios.post.mockRejectedValue({
        response: {
          status: 400,
          data: {
            error: 'invalid_grant',
            error_description: 'Refresh token revoked'
          }
        }
      });

      await expect(
        oauth2Service.refreshAccessToken(mockBroker, mockUserId)
      ).rejects.toThrow('Token refresh failed (invalid_grant)');

      const tokens = mockUser.tradingConfig.oauthTokens.get(mockBroker);
      expect(tokens.isValid).toBe(false);
      expect(tokens.lastRefreshError).toBe('invalid_grant');
    });

    test('should retry on transient error (5xx)', async () => {
      axios.post
        .mockRejectedValueOnce({ response: { status: 503 } }) // First attempt fails
        .mockResolvedValueOnce({ // Second attempt succeeds
          data: {
            access_token: 'new_access_token',
            refresh_token: 'new_refresh_token',
            expires_in: 604800
          }
        });

      const result = await oauth2Service.refreshAccessToken(mockBroker, mockUserId);

      expect(axios.post).toHaveBeenCalledTimes(2);
      expect(result.accessToken).toBe('new_access_token');
    });

    test('should throw error after max retries', async () => {
      axios.post.mockRejectedValue({ response: { status: 503 } });

      await expect(
        oauth2Service.refreshAccessToken(mockBroker, mockUserId)
      ).rejects.toThrow('Token refresh failed after 3 retries');

      expect(axios.post).toHaveBeenCalledTimes(4); // Initial + 3 retries
    });
  });

  describe('encryptToken / decryptToken', () => {
    const plainToken = 'my_secret_token_12345';

    test('should encrypt token successfully', () => {
      const encrypted = oauth2Service.encryptToken(plainToken);

      expect(encrypted.encrypted).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.authTag).toBeDefined();
      expect(encrypted.iv.length).toBe(24); // 12 bytes hex = 24 chars
      expect(encrypted.authTag.length).toBe(32); // 16 bytes hex = 32 chars
    });

    test('should decrypt token successfully', () => {
      const encrypted = oauth2Service.encryptToken(plainToken);
      const decrypted = oauth2Service.decryptToken(encrypted);

      expect(decrypted).toBe(plainToken);
    });

    test('should generate unique IV for each encryption', () => {
      const encrypted1 = oauth2Service.encryptToken(plainToken);
      const encrypted2 = oauth2Service.encryptToken(plainToken);

      expect(encrypted1.iv).not.toBe(encrypted2.iv);
      expect(encrypted1.encrypted).not.toBe(encrypted2.encrypted);
    });

    test('should throw error if authTag tampered', () => {
      const encrypted = oauth2Service.encryptToken(plainToken);
      encrypted.authTag = 'f'.repeat(32); // Tampered

      expect(() => oauth2Service.decryptToken(encrypted))
        .toThrow('Token decryption failed - possible tampering or corruption');
    });

    test('should throw error if encrypted data tampered', () => {
      const encrypted = oauth2Service.encryptToken(plainToken);
      encrypted.encrypted = encrypted.encrypted.slice(0, -2) + 'ff'; // Tampered

      expect(() => oauth2Service.decryptToken(encrypted))
        .toThrow('Token decryption failed - possible tampering or corruption');
    });

    test('should throw error if IV tampered', () => {
      const encrypted = oauth2Service.encryptToken(plainToken);
      encrypted.iv = 'a'.repeat(24); // Wrong IV

      expect(() => oauth2Service.decryptToken(encrypted))
        .toThrow('Token decryption failed - possible tampering or corruption');
    });
  });

  describe('encryptTokens / decryptTokens', () => {
    const mockTokens = {
      accessToken: 'access_token_12345',
      refreshToken: 'refresh_token_12345',
      expiresAt: new Date(),
      scopes: ['trading', 'account'],
      tokenType: 'Bearer'
    };

    test('should encrypt all tokens', () => {
      const encrypted = oauth2Service.encryptTokens(mockTokens);

      expect(encrypted.accessToken.encrypted).toBeDefined();
      expect(encrypted.accessToken.iv).toBeDefined();
      expect(encrypted.accessToken.authTag).toBeDefined();
      expect(encrypted.refreshToken.encrypted).toBeDefined();
      expect(encrypted.refreshToken.iv).toBeDefined();
      expect(encrypted.refreshToken.authTag).toBeDefined();
      expect(encrypted.expiresAt).toBe(mockTokens.expiresAt);
      expect(encrypted.scopes).toEqual(mockTokens.scopes);
      expect(encrypted.tokenType).toBe(mockTokens.tokenType);
    });

    test('should decrypt all tokens', () => {
      const encrypted = oauth2Service.encryptTokens(mockTokens);
      const decrypted = oauth2Service.decryptTokens(encrypted);

      expect(decrypted.accessToken).toBe(mockTokens.accessToken);
      expect(decrypted.refreshToken).toBe(mockTokens.refreshToken);
      expect(decrypted.expiresAt).toBe(mockTokens.expiresAt);
      expect(decrypted.scopes).toEqual(mockTokens.scopes);
      expect(decrypted.tokenType).toBe(mockTokens.tokenType);
    });
  });

  describe('markTokensInvalid', () => {
    const mockBroker = 'alpaca';

    beforeEach(() => {
      mockUser.tradingConfig.oauthTokens.set(mockBroker, {
        accessToken: { encrypted: 'test', iv: 'test', authTag: 'test' },
        refreshToken: { encrypted: 'test', iv: 'test', authTag: 'test' },
        expiresAt: new Date(),
        scopes: ['trading'],
        tokenType: 'Bearer',
        isValid: true,
        lastRefreshError: null,
        lastRefreshAttempt: null
      });

      User.findById = jest.fn().mockResolvedValue(mockUser);
    });

    test('should mark tokens as invalid', async () => {
      await oauth2Service.markTokensInvalid(mockBroker, mockUserId, 'invalid_grant');

      const tokens = mockUser.tradingConfig.oauthTokens.get(mockBroker);
      expect(tokens.isValid).toBe(false);
      expect(tokens.lastRefreshError).toBe('invalid_grant');
      expect(tokens.lastRefreshAttempt).toBeInstanceOf(Date);
      expect(mockUser.save).toHaveBeenCalled();
    });

    test('should handle user not found gracefully', async () => {
      User.findById = jest.fn().mockResolvedValue(null);

      await expect(
        oauth2Service.markTokensInvalid(mockBroker, mockUserId, 'error')
      ).resolves.not.toThrow();
    });

    test('should handle missing tokens gracefully', async () => {
      mockUser.tradingConfig.oauthTokens.delete(mockBroker);

      await expect(
        oauth2Service.markTokensInvalid(mockBroker, mockUserId, 'error')
      ).resolves.not.toThrow();
    });

    test('should handle save errors gracefully', async () => {
      mockUser.save.mockRejectedValue(new Error('Database error'));

      await expect(
        oauth2Service.markTokensInvalid(mockBroker, mockUserId, 'error')
      ).resolves.not.toThrow();
    });
  });
});
