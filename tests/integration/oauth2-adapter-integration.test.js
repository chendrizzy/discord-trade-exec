/**
 * Integration Tests for OAuth2 Adapter Standardization
 *
 * Tests Alpaca and Schwab adapters with unified OAuth2Service integration.
 * Validates:
 * - OAuth2 token retrieval from User model
 * - Token decryption and usage
 * - Automatic token refresh handling
 * - Error handling for invalid/expired tokens
 */

const mongoose = require('mongoose');
const User = require('../../src/models/User');
const AlpacaAdapter = require('../../src/brokers/adapters/AlpacaAdapter');
const SchwabAdapter = require('../../src/brokers/adapters/SchwabAdapter');

// Mock Alpaca SDK, axios, and oauth2Providers
jest.mock('@alpacahq/alpaca-trade-api');
jest.mock('axios');
jest.mock('../../src/config/oauth2Providers');

// Set encryption key BEFORE loading OAuth2Service
process.env.ENCRYPTION_KEY = 'a'.repeat(64); // 32 bytes

const oauth2Service = require('../../src/services/OAuth2Service'); // Singleton

describe('OAuth2 Adapter Integration Tests', () => {
  let testUser;

  beforeAll(async () => {
    // Connect to MongoDB test database (if not already connected)
    if (mongoose.connection.readyState === 0) {
      const mongoUri = process.env.MONGO_URI_TEST || 'mongodb://localhost:27017/trade-exec-test';
      await mongoose.connect(mongoUri);
    }

    // Mock OAuth2 provider configurations
    const { getProviderConfig } = require('../../src/config/oauth2Providers');
    getProviderConfig.mockImplementation((broker) => {
      if (broker === 'schwab') {
        return {
          tokenURL: 'https://api.schwabapi.com/v1/oauth/token',
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
          scopes: ['account', 'trading'],
          supportsRefreshTokenRotation: true
        };
      }
      return null;
    });
  });

  afterAll(async () => {
    // Only close if we're the only test suite
    if (mongoose.connection.readyState === 1) {
      await User.deleteMany({});
    }
  });

  beforeEach(async () => {
    // Clear test users
    await User.deleteMany({});

    // Create test user with OAuth2 tokens
    testUser = await User.create({
      discordId: 'test-discord-123',
      discordUsername: 'testuser#1234',
      username: 'testuser',
      email: 'test@example.com',
      tradingConfig: {
        defaultBroker: 'alpaca',
        oauthTokens: new Map()
      }
    });
  });

  afterEach(async () => {
    await User.deleteMany({});
  });

  describe('Alpaca OAuth2 Integration', () => {
    test('should authenticate with valid OAuth2 tokens', async () => {
      // Setup: Encrypt and store Alpaca tokens
      const mockAccessToken = 'alpaca_test_access_token';
      const mockRefreshToken = 'alpaca_test_refresh_token';

      const encryptedAccessToken = oauth2Service.encryptToken(mockAccessToken);
      const encryptedRefreshToken = oauth2Service.encryptToken(mockRefreshToken);

      testUser.tradingConfig.oauthTokens.set('alpaca', {
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        scopes: ['account:write', 'trading'],
        tokenType: 'Bearer',
        isValid: true
      });
      await testUser.save();

      // Test: Initialize adapter and authenticate
      const adapter = new AlpacaAdapter({ userId: testUser.id }, { isTestnet: true });

      // Mock Alpaca client
      const mockAlpacaClient = {
        getAccount: jest.fn().mockResolvedValue({ id: 'test-account' })
      };

      const Alpaca = require('@alpacahq/alpaca-trade-api');
      Alpaca.mockImplementation(() => mockAlpacaClient);

      const result = await adapter.authenticate();

      // Verify: Authentication successful
      expect(result).toBe(true);
      expect(adapter.isAuthenticated).toBe(true);
      expect(mockAlpacaClient.getAccount).toHaveBeenCalled();
    });

    test('should fall back to API key if OAuth2 tokens invalid', async () => {
      // Setup: Store invalid OAuth2 tokens
      testUser.tradingConfig.oauthTokens.set('alpaca', {
        accessToken: { encrypted: 'invalid', iv: 'invalid', authTag: 'invalid' },
        refreshToken: { encrypted: 'invalid', iv: 'invalid', authTag: 'invalid' },
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        scopes: ['account:write', 'trading'],
        tokenType: 'Bearer',
        isValid: false // Marked invalid
      });
      await testUser.save();

      // Test: Initialize with API key fallback
      const adapter = new AlpacaAdapter(
        {
          userId: testUser.id,
          apiKey: 'test-api-key',
          apiSecret: 'test-api-secret'
        },
        { isTestnet: true }
      );

      const mockAlpacaClient = {
        getAccount: jest.fn().mockResolvedValue({ id: 'test-account' })
      };

      const Alpaca = require('@alpacahq/alpaca-trade-api');
      Alpaca.mockImplementation(() => mockAlpacaClient);

      const result = await adapter.authenticate();

      // Verify: Fallback to API key worked
      expect(result).toBe(true);
      expect(adapter.isAuthenticated).toBe(true);
    });

    test('should throw error if no credentials provided', async () => {
      const adapter = new AlpacaAdapter({ userId: testUser.id }, { isTestnet: true });

      await expect(adapter.authenticate()).rejects.toThrow(/No valid credentials/);
    });
  });

  describe('Schwab OAuth2 Integration', () => {
    test('should authenticate with valid OAuth2 tokens (not expired)', async () => {
      // Setup: Encrypt and store Schwab tokens
      const mockAccessToken = 'schwab_test_access_token';
      const mockRefreshToken = 'schwab_test_refresh_token';

      const encryptedAccessToken = oauth2Service.encryptToken(mockAccessToken);
      const encryptedRefreshToken = oauth2Service.encryptToken(mockRefreshToken);

      testUser.tradingConfig.oauthTokens.set('schwab', {
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes (not expired)
        scopes: ['account', 'trading'],
        tokenType: 'Bearer',
        isValid: true
      });
      await testUser.save();

      // Test: Initialize adapter
      const adapter = new SchwabAdapter({ userId: testUser.id }, { isTestnet: true });

      // Mock adapter's makeRequest to avoid actual API calls
      adapter.makeRequest = jest.fn().mockResolvedValue({
        securitiesAccount: { accountId: 'test-account-123' }
      });

      const result = await adapter.authenticate();

      // Verify: Authentication successful
      expect(result).toBe(true);
      expect(adapter.isAuthenticated).toBe(true);
      expect(adapter.accessToken).toBe(mockAccessToken);
    });

    test('should refresh token if expired', async () => {
      // Setup: Encrypt and store expired Schwab tokens
      const oldAccessToken = 'old_access_token';
      const mockRefreshToken = 'schwab_refresh_token';

      const encryptedAccessToken = oauth2Service.encryptToken(oldAccessToken);
      const encryptedRefreshToken = oauth2Service.encryptToken(mockRefreshToken);

      testUser.tradingConfig.oauthTokens.set('schwab', {
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        scopes: ['account', 'trading'],
        tokenType: 'Bearer',
        isValid: true
      });
      await testUser.save();

      // Mock axios for token refresh
      const axios = require('axios');
      const newAccessToken = 'new_access_token';
      axios.post.mockResolvedValueOnce({
        data: {
          access_token: newAccessToken,
          refresh_token: mockRefreshToken,
          expires_in: 1800, // 30 minutes
          scope: 'account trading',
          token_type: 'Bearer'
        }
      });

      // Test: Initialize adapter
      const adapter = new SchwabAdapter({ userId: testUser.id }, { isTestnet: true });

      const result = await adapter.authenticate();

      // Verify: Token refresh successful and new token used
      expect(result).toBe(true);
      expect(adapter.isAuthenticated).toBe(true);
      expect(adapter.accessToken).toBe(newAccessToken);
      expect(axios.post).toHaveBeenCalled();
    });

    test('should throw error if OAuth2 tokens marked invalid', async () => {
      // Setup: Store invalid OAuth2 tokens
      testUser.tradingConfig.oauthTokens.set('schwab', {
        accessToken: { encrypted: 'test', iv: 'test', authTag: 'test' },
        refreshToken: { encrypted: 'test', iv: 'test', authTag: 'test' },
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        scopes: ['account', 'trading'],
        tokenType: 'Bearer',
        isValid: false // Marked invalid
      });
      await testUser.save();

      const adapter = new SchwabAdapter({ userId: testUser.id }, { isTestnet: true });

      await expect(adapter.authenticate()).rejects.toThrow(/marked invalid/);
    });

    test('should throw error if no OAuth2 tokens found', async () => {
      // Test: No tokens stored for user
      const adapter = new SchwabAdapter({ userId: testUser.id }, { isTestnet: true });

      await expect(adapter.authenticate()).rejects.toThrow(/No OAuth2 tokens found/);
    });

    test('should throw error if userId not provided', async () => {
      const adapter = new SchwabAdapter({}, { isTestnet: true });

      await expect(adapter.authenticate()).rejects.toThrow(/User ID required/);
    });
  });

  describe('OAuth2 Token Decryption', () => {
    test('should successfully decrypt valid tokens', () => {
      const originalToken = 'test_secret_token_12345';

      // Encrypt
      const encrypted = oauth2Service.encryptToken(originalToken);

      // Verify structure
      expect(encrypted).toHaveProperty('encrypted');
      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('authTag');

      // Decrypt
      const decrypted = oauth2Service.decryptToken(encrypted);

      // Verify match
      expect(decrypted).toBe(originalToken);
    });

    test('should throw error for tampered tokens', () => {
      const originalToken = 'test_secret_token';
      const encrypted = oauth2Service.encryptToken(originalToken);

      // Tamper with encrypted data
      const tampered = {
        ...encrypted,
        encrypted: 'tampered_data'
      };

      // Verify decryption fails
      expect(() => oauth2Service.decryptToken(tampered)).toThrow(/decryption failed/);
    });
  });

  describe('Parallel OAuth2 Flows', () => {
    test('should handle Alpaca and Schwab OAuth2 in parallel', async () => {
      // Setup: Store tokens for both brokers
      const alpacaToken = oauth2Service.encryptToken('alpaca_token');
      const alpacaRefresh = oauth2Service.encryptToken('alpaca_refresh');

      const schwabToken = oauth2Service.encryptToken('schwab_token');
      const schwabRefresh = oauth2Service.encryptToken('schwab_refresh');

      testUser.tradingConfig.oauthTokens.set('alpaca', {
        accessToken: alpacaToken,
        refreshToken: alpacaRefresh,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        scopes: ['account:write', 'trading'],
        tokenType: 'Bearer',
        isValid: true
      });

      testUser.tradingConfig.oauthTokens.set('schwab', {
        accessToken: schwabToken,
        refreshToken: schwabRefresh,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        scopes: ['account', 'trading'],
        tokenType: 'Bearer',
        isValid: true
      });

      await testUser.save();

      // Test: Initialize both adapters in parallel
      const alpacaAdapter = new AlpacaAdapter({ userId: testUser.id }, { isTestnet: true });
      const schwabAdapter = new SchwabAdapter({ userId: testUser.id }, { isTestnet: true });

      // Mock clients
      const mockAlpacaClient = {
        getAccount: jest.fn().mockResolvedValue({ id: 'alpaca-account' })
      };

      const Alpaca = require('@alpacahq/alpaca-trade-api');
      Alpaca.mockImplementation(() => mockAlpacaClient);

      schwabAdapter.makeRequest = jest.fn().mockResolvedValue({
        securitiesAccount: { accountId: 'schwab-account' }
      });

      // Authenticate both in parallel
      const [alpacaResult, schwabResult] = await Promise.all([
        alpacaAdapter.authenticate(),
        schwabAdapter.authenticate()
      ]);

      // Verify: Both authenticated successfully
      expect(alpacaResult).toBe(true);
      expect(schwabResult).toBe(true);
      expect(alpacaAdapter.isAuthenticated).toBe(true);
      expect(schwabAdapter.isAuthenticated).toBe(true);
    });
  });
});
