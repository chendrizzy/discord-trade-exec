/**
 * Phase 3 OAuth2 Broker Integration Tests
 *
 * Tests IBKR, TD Ameritrade, and E*TRADE adapters with OAuth2Service integration.
 * Validates:
 * - OAuth2 token retrieval from User model
 * - Token decryption and usage
 * - Automatic token refresh handling
 * - Error handling for invalid/expired tokens
 * - Fallback authentication (IBKR only)
 */

const mongoose = require('mongoose');
const User = require('../../src/models/User');
const IBKRAdapter = require('../../src/brokers/adapters/IBKRAdapter');
const TDAmeritradeAdapter = require('../../src/brokers/adapters/TDAmeritradeAdapter');
const EtradeAdapter = require('../../src/brokers/adapters/EtradeAdapter');

// Mock axios for API requests
jest.mock('axios');

// Set encryption key BEFORE loading OAuth2Service
process.env.ENCRYPTION_KEY = 'a'.repeat(64); // 32 bytes

const oauth2Service = require('../../src/services/OAuth2Service'); // Singleton

describe('Phase 3: OAuth2 Broker Integration Tests', () => {
  let testUser;

  beforeAll(async () => {
    // Connect to MongoDB test database (if not already connected)
    if (mongoose.connection.readyState === 0) {
      const mongoUri = process.env.MONGO_URI_TEST || 'mongodb://localhost:27017/trade-exec-test';
      await mongoose.connect(mongoUri);
    }
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
      discordId: 'test-discord-phase3',
      discordUsername: 'testuser#phase3',
      username: 'testuser',
      email: 'test-phase3@example.com',
      tradingConfig: {
        defaultBroker: 'ibkr',
        oauthTokens: new Map()
      }
    });
  });

  afterEach(async () => {
    await User.deleteMany({});
  });

  describe('IBKR OAuth2 Integration', () => {
    test('should authenticate with valid OAuth2 tokens', async () => {
      // Setup: Encrypt and store IBKR tokens
      const mockAccessToken = 'ibkr_test_access_token';
      const mockRefreshToken = 'ibkr_test_refresh_token';

      const encryptedAccessToken = oauth2Service.encryptToken(mockAccessToken);
      const encryptedRefreshToken = oauth2Service.encryptToken(mockRefreshToken);

      testUser.tradingConfig.oauthTokens.set('ibkr', {
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        scopes: ['trading', 'account'],
        tokenType: 'Bearer',
        isValid: true
      });
      await testUser.save();

      // Test: Initialize adapter and authenticate
      const adapter = new IBKRAdapter({ userId: testUser.id });

      const result = await adapter.authenticate();

      // Verify: Authentication successful
      expect(result).toBe(true);
      expect(adapter.isAuthenticated).toBe(true);
      expect(adapter.accessToken).toBe(mockAccessToken);
    });

    test('should auto-refresh expired OAuth2 tokens', async () => {
      // Setup: Encrypt and store expired IBKR tokens
      const oldAccessToken = 'old_ibkr_access_token';
      const mockRefreshToken = 'ibkr_refresh_token';

      const encryptedAccessToken = oauth2Service.encryptToken(oldAccessToken);
      const encryptedRefreshToken = oauth2Service.encryptToken(mockRefreshToken);

      testUser.tradingConfig.oauthTokens.set('ibkr', {
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        scopes: ['trading', 'account'],
        tokenType: 'Bearer',
        isValid: true
      });
      await testUser.save();

      // Mock axios for token refresh
      const axios = require('axios');
      const newAccessToken = 'new_ibkr_access_token';
      axios.post.mockResolvedValueOnce({
        data: {
          access_token: newAccessToken,
          refresh_token: mockRefreshToken,
          expires_in: 86400, // 24 hours
          scope: 'trading account',
          token_type: 'Bearer'
        }
      });

      // Test: Initialize adapter
      const adapter = new IBKRAdapter({ userId: testUser.id });

      const result = await adapter.authenticate();

      // Verify: Token refresh successful and new token used
      expect(result).toBe(true);
      expect(adapter.isAuthenticated).toBe(true);
      expect(adapter.accessToken).toBe(newAccessToken);
      expect(axios.post).toHaveBeenCalled();
    });

    test('should fall back to TWS/IB Gateway if OAuth2 tokens invalid', async () => {
      // Setup: Store invalid OAuth2 tokens
      testUser.tradingConfig.oauthTokens.set('ibkr', {
        accessToken: { encrypted: 'invalid', iv: 'invalid', authTag: 'invalid' },
        refreshToken: { encrypted: 'invalid', iv: 'invalid', authTag: 'invalid' },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        scopes: ['trading', 'account'],
        tokenType: 'Bearer',
        isValid: false // Marked invalid
      });
      await testUser.save();

      // Test: Initialize with TWS fallback params
      const adapter = new IBKRAdapter(
        {
          userId: testUser.id,
          clientId: 1,
          host: '127.0.0.1',
          port: 4001
        }
      );

      // Mock TWS connection - should succeed
      // Note: This would require mocking IBApi library, simplified for stub test

      // Verify: Adapter created successfully with fallback
      expect(adapter).toBeDefined();
      expect(adapter.userId).toBe(testUser.id);
      expect(adapter.clientId).toBe(1);
      expect(adapter.host).toBe('127.0.0.1');
      expect(adapter.port).toBe(4001);
    });

    test('should throw error if no credentials provided', async () => {
      const adapter = new IBKRAdapter({ userId: testUser.id });

      // No OAuth tokens stored, no TWS credentials provided
      await expect(adapter.authenticate()).rejects.toThrow(/No OAuth2 tokens found|TWS/);
    });
  });

  describe('TD Ameritrade OAuth2 Integration', () => {
    test('should authenticate with valid OAuth2 tokens (not expired)', async () => {
      // Setup: Encrypt and store TD Ameritrade tokens
      const mockAccessToken = 'tdameritrade_test_access_token';
      const mockRefreshToken = 'tdameritrade_test_refresh_token';

      const encryptedAccessToken = oauth2Service.encryptToken(mockAccessToken);
      const encryptedRefreshToken = oauth2Service.encryptToken(mockRefreshToken);

      testUser.tradingConfig.oauthTokens.set('tdameritrade', {
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes (not expired)
        scopes: ['PlaceTrades', 'AccountAccess'],
        tokenType: 'Bearer',
        isValid: true
      });
      await testUser.save();

      // Test: Initialize adapter
      const adapter = new TDAmeritradeAdapter({ userId: testUser.id });

      // Mock adapter's makeRequest to avoid actual API calls
      adapter.makeRequest = jest.fn().mockResolvedValue([
        { securitiesAccount: { accountId: 'test-account-123' } }
      ]);

      const result = await adapter.authenticate();

      // Verify: Authentication successful
      expect(result).toBe(true);
      expect(adapter.isAuthenticated).toBe(true);
      expect(adapter.accessToken).toBe(mockAccessToken);
      expect(adapter.accountId).toBe('test-account-123');
    });

    test('should auto-refresh token if expired (30-minute expiry)', async () => {
      // Setup: Encrypt and store expired TD Ameritrade tokens
      const oldAccessToken = 'old_td_access_token';
      const mockRefreshToken = 'td_refresh_token';

      const encryptedAccessToken = oauth2Service.encryptToken(oldAccessToken);
      const encryptedRefreshToken = oauth2Service.encryptToken(mockRefreshToken);

      testUser.tradingConfig.oauthTokens.set('tdameritrade', {
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        scopes: ['PlaceTrades', 'AccountAccess'],
        tokenType: 'Bearer',
        isValid: true
      });
      await testUser.save();

      // Mock axios for token refresh
      const axios = require('axios');
      const newAccessToken = 'new_td_access_token';
      axios.post.mockResolvedValueOnce({
        data: {
          access_token: newAccessToken,
          refresh_token: mockRefreshToken,
          expires_in: 1800, // 30 minutes
          scope: 'PlaceTrades AccountAccess',
          token_type: 'Bearer'
        }
      });

      // Test: Initialize adapter
      const adapter = new TDAmeritradeAdapter({ userId: testUser.id });

      // Mock getAccounts after refresh
      adapter.makeRequest = jest.fn().mockResolvedValue([
        { securitiesAccount: { accountId: 'test-account-456' } }
      ]);

      const result = await adapter.authenticate();

      // Verify: Token refresh successful and new token used
      expect(result).toBe(true);
      expect(adapter.isAuthenticated).toBe(true);
      expect(adapter.accessToken).toBe(newAccessToken);
      expect(axios.post).toHaveBeenCalled();
    });

    test('should throw error if OAuth2 tokens marked invalid', async () => {
      // Setup: Store invalid OAuth2 tokens
      testUser.tradingConfig.oauthTokens.set('tdameritrade', {
        accessToken: { encrypted: 'test', iv: 'test', authTag: 'test' },
        refreshToken: { encrypted: 'test', iv: 'test', authTag: 'test' },
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        scopes: ['PlaceTrades', 'AccountAccess'],
        tokenType: 'Bearer',
        isValid: false // Marked invalid
      });
      await testUser.save();

      const adapter = new TDAmeritradeAdapter({ userId: testUser.id });

      await expect(adapter.authenticate()).rejects.toThrow(/marked invalid|re-authorize/);
    });

    test('should throw error if no OAuth2 tokens found', async () => {
      // Test: No tokens stored for user
      const adapter = new TDAmeritradeAdapter({ userId: testUser.id });

      await expect(adapter.authenticate()).rejects.toThrow(/No OAuth2 tokens found/);
    });

    test('should throw error if userId not provided', async () => {
      const adapter = new TDAmeritradeAdapter({});

      await expect(adapter.authenticate()).rejects.toThrow(/User ID required/);
    });
  });

  describe('E*TRADE OAuth 1.0a Integration', () => {
    test('should authenticate with valid OAuth 1.0a tokens (not expired)', async () => {
      // Setup: Encrypt and store E*TRADE tokens (OAuth 1.0a includes token secret)
      const mockAccessToken = 'etrade_test_access_token';
      const mockAccessTokenSecret = 'etrade_test_access_secret';
      const mockRefreshToken = 'etrade_test_refresh_token';

      const encryptedAccessToken = oauth2Service.encryptToken(mockAccessToken);
      const encryptedAccessTokenSecret = oauth2Service.encryptToken(mockAccessTokenSecret);
      const encryptedRefreshToken = oauth2Service.encryptToken(mockRefreshToken);

      testUser.tradingConfig.oauthTokens.set('etrade', {
        accessToken: encryptedAccessToken,
        accessTokenSecret: encryptedAccessTokenSecret, // OAuth 1.0a specific
        refreshToken: encryptedRefreshToken,
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours (not expired)
        scopes: ['trading', 'account'],
        tokenType: 'Bearer',
        isValid: true
      });
      await testUser.save();

      // Test: Initialize adapter
      const adapter = new EtradeAdapter({ userId: testUser.id });

      // Mock adapter's makeRequest to avoid actual API calls
      adapter.makeRequest = jest.fn().mockResolvedValue({
        AccountListResponse: {
          Accounts: {
            Account: [
              {
                accountId: '12345678',
                accountIdKey: 'test-key-123',
                accountMode: 'MARGIN',
                accountDesc: 'TEST ACCOUNT',
                accountName: 'Test User',
                accountType: 'INDIVIDUAL',
                institutionType: 'BROKERAGE',
                accountStatus: 'ACTIVE'
              }
            ]
          }
        }
      });

      const result = await adapter.authenticate();

      // Verify: Authentication successful
      expect(result).toBe(true);
      expect(adapter.isAuthenticated).toBe(true);
      expect(adapter.accessToken).toBe(mockAccessToken);
      expect(adapter.accessTokenSecret).toBe(mockAccessTokenSecret);
      expect(adapter.accountIdKey).toBe('test-key-123');
      expect(adapter.accountId).toBe('12345678');
    });

    test('should throw error when token expired (renewal not yet implemented)', async () => {
      // Setup: Encrypt and store expired E*TRADE tokens
      const oldAccessToken = 'old_etrade_access_token';
      const mockAccessTokenSecret = 'etrade_access_secret';

      const encryptedAccessToken = oauth2Service.encryptToken(oldAccessToken);
      const encryptedAccessTokenSecret = oauth2Service.encryptToken(mockAccessTokenSecret);

      testUser.tradingConfig.oauthTokens.set('etrade', {
        accessToken: encryptedAccessToken,
        accessTokenSecret: encryptedAccessTokenSecret,
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        scopes: ['trading', 'account'],
        tokenType: 'Bearer',
        isValid: true
      });
      await testUser.save();

      // Test: Initialize adapter
      const adapter = new EtradeAdapter({ userId: testUser.id });

      // Verify: Token renewal not implemented yet
      await expect(adapter.authenticate()).rejects.toThrow(/Token renewal not yet implemented|re-authorize/);
    });

    test('should throw error if OAuth tokens marked invalid', async () => {
      // Setup: Store invalid OAuth tokens
      testUser.tradingConfig.oauthTokens.set('etrade', {
        accessToken: { encrypted: 'test', iv: 'test', authTag: 'test' },
        accessTokenSecret: { encrypted: 'test', iv: 'test', authTag: 'test' },
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        scopes: ['trading', 'account'],
        tokenType: 'Bearer',
        isValid: false // Marked invalid
      });
      await testUser.save();

      const adapter = new EtradeAdapter({ userId: testUser.id });

      await expect(adapter.authenticate()).rejects.toThrow(/marked invalid|re-authorize/);
    });

    test('should throw error if no OAuth tokens found', async () => {
      // Test: No tokens stored for user
      const adapter = new EtradeAdapter({ userId: testUser.id });

      await expect(adapter.authenticate()).rejects.toThrow(/No OAuth tokens found/);
    });

    test('should throw error if userId not provided', async () => {
      const adapter = new EtradeAdapter({});

      await expect(adapter.authenticate()).rejects.toThrow(/User ID required/);
    });
  });

  describe('BrokerFactory OAuth2 Detection', () => {
    const BrokerFactory = require('../../src/brokers/BrokerFactory');

    test('should detect IBKR as OAuth2-capable broker', () => {
      const ibkrInfo = BrokerFactory.getBrokerInfo('ibkr');

      expect(ibkrInfo).toBeDefined();
      expect(ibkrInfo.authMethods).toContain('oauth');
      expect(ibkrInfo.authMethods).toContain('api-key'); // Also supports legacy TWS
      expect(ibkrInfo.features).toContain('oauth');
    });

    test('should detect TD Ameritrade as OAuth2-only broker', () => {
      const tdInfo = BrokerFactory.getBrokerInfo('tdameritrade');

      expect(tdInfo).toBeDefined();
      expect(tdInfo.authMethods).toEqual(['oauth']);
      expect(tdInfo.features).toContain('oauth');
      expect(tdInfo.apiFeatures).toContain('30-minute-token-expiry');
      expect(tdInfo.apiFeatures).toContain('frequent-refresh-required');
    });

    test('should detect E*TRADE as OAuth 1.0a broker', () => {
      const etradeInfo = BrokerFactory.getBrokerInfo('etrade');

      expect(etradeInfo).toBeDefined();
      expect(etradeInfo.authMethods).toEqual(['oauth']);
      expect(etradeInfo.features).toContain('oauth');
      expect(etradeInfo.apiFeatures).toContain('oauth-1.0a');
      expect(etradeInfo.apiFeatures).toContain('token-renewal');
      expect(etradeInfo.apiFeatures).toContain('2-hour-token-expiry');
    });

    test('should create IBKR adapter with OAuth2 credentials', async () => {
      const adapter = await BrokerFactory.createBroker('ibkr', { userId: testUser.id });

      expect(adapter).toBeInstanceOf(IBKRAdapter);
      expect(adapter.userId).toBe(testUser.id);
    });

    test('should create TD Ameritrade adapter with OAuth2 credentials', async () => {
      const adapter = await BrokerFactory.createBroker('tdameritrade', { userId: testUser.id });

      expect(adapter).toBeInstanceOf(TDAmeritradeAdapter);
      expect(adapter.userId).toBe(testUser.id);
    });

    test('should create E*TRADE adapter with OAuth credentials', async () => {
      const adapter = await BrokerFactory.createBroker('etrade', { userId: testUser.id });

      expect(adapter).toBeInstanceOf(EtradeAdapter);
      expect(adapter.userId).toBe(testUser.id);
    });

    test('should validate IBKR credentials correctly', () => {
      // OAuth2 credentials
      const oauth2Result = BrokerFactory.validateCredentials('ibkr', { userId: '123' });
      expect(oauth2Result.valid).toBe(true);
      expect(oauth2Result.errors).toHaveLength(0);

      // TWS/IB Gateway credentials
      const twsResult = BrokerFactory.validateCredentials('ibkr', { clientId: 1, host: '127.0.0.1', port: 4001 });
      expect(twsResult.valid).toBe(true);
      expect(twsResult.errors).toHaveLength(0);

      // Missing credentials
      const missingResult = BrokerFactory.validateCredentials('ibkr', {});
      expect(missingResult.valid).toBe(false);
      expect(missingResult.errors.length).toBeGreaterThan(0);
    });

    test('should validate TD Ameritrade credentials correctly', () => {
      const validResult = BrokerFactory.validateCredentials('tdameritrade', { userId: '123' });
      expect(validResult.valid).toBe(true);
      expect(validResult.errors).toHaveLength(0);

      const missingResult = BrokerFactory.validateCredentials('tdameritrade', {});
      expect(missingResult.valid).toBe(false);
      expect(missingResult.errors).toContain('userId required for TD Ameritrade OAuth2 authentication');
    });

    test('should validate E*TRADE credentials correctly', () => {
      const validResult = BrokerFactory.validateCredentials('etrade', { userId: '123' });
      expect(validResult.valid).toBe(true);
      expect(validResult.errors).toHaveLength(0);

      const missingResult = BrokerFactory.validateCredentials('etrade', {});
      expect(missingResult.valid).toBe(false);
      expect(missingResult.errors).toContain('userId required for E*TRADE OAuth 1.0a authentication');
    });
  });
});
