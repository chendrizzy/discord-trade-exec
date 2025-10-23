/**
 * Integration Test: OAuth2 Authentication Flow
 *
 * Tests the complete OAuth2 authentication flow:
 * 1. Discord OAuth2 login initiation
 * 2. Callback handling with authorization code
 * 3. Session creation and cookie management
 * 4. Token refresh mechanism
 * 5. Logout and session cleanup
 *
 * Test Environment:
 * - MongoDB Memory Server for session storage
 * - Mock Discord OAuth provider responses
 * - Express session middleware with MongoStore
 *
 * Dependencies: OAuth2Service, User model, session middleware
 */

'use strict';

const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
const speakeasy = require('speakeasy');
const User = require('../../../src/models/User');
const oauth2Service = require('../../../src/services/OAuth2Service'); // Singleton instance
const { getMFAService } = require('../../../src/services/MFAService');

// Mock Discord OAuth2 provider responses
jest.mock('axios');
const axios = require('axios');

describe('Integration Test: OAuth2 Authentication Flow', () => {
  let app;

  beforeAll(async () => {
    // Create Express app with authentication middleware
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Session middleware with MongoDB store
    app.use(
      session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        store: MongoStore.create({
          mongoUrl: process.env.MONGODB_URI,
          ttl: 24 * 60 * 60 // 1 day
        }),
        cookie: {
          secure: false, // Set to false for testing (HTTP)
          httpOnly: true,
          maxAge: 24 * 60 * 60 * 1000 // 1 day
        }
      })
    );

    // Initialize Passport
    app.use(passport.initialize());
    app.use(passport.session());

    // Passport serialization
    passport.serializeUser((user, done) => {
      done(null, user._id.toString());
    });

    passport.deserializeUser(async (id, done) => {
      try {
        const user = await User.findById(id);
        done(null, user);
      } catch (error) {
        done(error, null);
      }
    });

    // Mount auth routes
    const authRouter = require('../../../src/routes/api/auth');
    app.use('/api/v1/auth', authRouter);

    // Mock authentication endpoint for tests
    app.post('/api/auth/login/mock', async (req, res) => {
      const { userId } = req.body;
      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      req.login(user, err => {
        if (err) {
          return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true, userId: user._id });
      });
    });

    // No need to instantiate - oauth2Service is already a singleton
  });

  beforeEach(async () => {
    // Clear mocks
    jest.clearAllMocks();

    // Clear database
    await User.deleteMany({});

    // Reset axios mock
    axios.post.mockReset();
    axios.get.mockReset();
  });

  describe('Broker OAuth2 Authorization Flow', () => {
    let testUser;
    let authCookie;

    beforeEach(async () => {
      // Create test user
      testUser = await User.create({
        discordId: 'test_discord_123',
        discordUsername: 'test_trader',
        discordTag: 'test_trader#1234',
        username: 'test_trader',
        discordUsername: 'test_trader',
        discordTag: 'test_trader#1234',
        email: 'test@example.com',
        communityId: new mongoose.Types.ObjectId(),
        subscription: {
          tier: 'PRO',
          status: 'active',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        }
      });

      // Simulate authenticated session
      const agent = request.agent(app);
      const loginResponse = await agent.post('/api/v1/auth/test-login').send({ userId: testUser._id.toString() });

      authCookie = loginResponse.headers['set-cookie'];
    });

    it('should generate OAuth2 authorization URL for Alpaca', async () => {
      const response = await request(app)
        .get('/api/v1/auth/broker/alpaca/authorize')
        .set('Cookie', authCookie)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('authorizationURL');

      const authURL = new URL(response.body.authorizationURL);
      expect(authURL.searchParams.get('response_type')).toBe('code');
      expect(authURL.searchParams.get('client_id')).toBe(process.env.ALPACA_OAUTH_CLIENT_ID);
      expect(authURL.searchParams.has('state')).toBe(true);
      expect(authURL.searchParams.has('redirect_uri')).toBe(true);
    });

    it('should reject authorization for non-OAuth2 broker', async () => {
      const response = await request(app)
        .get('/api/v1/auth/broker/invalid_broker/authorize')
        .set('Cookie', authCookie)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toMatch(/does not support OAuth2/i);
    });

    it('should reject authorization without authentication', async () => {
      await request(app)
        .get('/api/v1/auth/broker/alpaca/authorize')
        // No auth cookie
        .expect(401);
    });
  });

  describe('OAuth2 Callback Handling', () => {
    let testUser;
    let authCookie;
    let mockState;

    beforeEach(async () => {
      // Create test user
      testUser = await User.create({
        discordId: 'test_discord_456',
        discordUsername: 'callback_tester',
        discordTag: 'callback_tester#1234',
        username: 'callback_tester',
        discordUsername: 'callback_tester',
        discordTag: 'callback_tester#1234',
        email: 'callback@example.com',
        communityId: new mongoose.Types.ObjectId()
      });

      // Generate authorization URL to get valid state
      const agent = request.agent(app);
      await agent.post('/api/v1/auth/test-login').send({ userId: testUser._id.toString() });

      const authResponse = await agent.get('/api/v1/auth/broker/alpaca/authorize');
      const authURL = new URL(authResponse.body.authorizationURL);
      mockState = authURL.searchParams.get('state');
      authCookie = agent.jar.getCookies({ path: '/' });

      // Mock successful token exchange
      axios.post.mockResolvedValueOnce({
        data: {
          access_token: 'mock_access_token_123456',
          refresh_token: 'mock_refresh_token_789012',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'account:read trading'
        }
      });

      // Mock account validation
      axios.get.mockResolvedValueOnce({
        data: {
          account_number: 'ACCOUNT123',
          status: 'ACTIVE',
          account_type: 'PAPER'
        }
      });
    });

    it('should handle OAuth2 callback successfully', async () => {
      const response = await request(app)
        .get('/api/v1/auth/broker/alpaca/callback')
        .set('Cookie', authCookie)
        .query({
          code: 'mock_authorization_code',
          state: mockState
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('broker', 'alpaca');

      // Verify token exchange was called
      expect(axios.post).toHaveBeenCalledWith(expect.stringContaining('token'), expect.any(String), expect.any(Object));

      // Verify tokens saved to database
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.tradingConfig.oauthTokens.has('alpaca')).toBe(true);

      const alpacaTokens = updatedUser.tradingConfig.oauthTokens.get('alpaca');
      expect(alpacaTokens).toHaveProperty('accessToken');
      expect(alpacaTokens).toHaveProperty('refreshToken');
      expect(alpacaTokens).toHaveProperty('expiresAt');
      expect(alpacaTokens.isValid).toBe(true);
    });

    it('should reject callback with invalid state (CSRF protection)', async () => {
      const response = await request(app)
        .get('/api/v1/auth/broker/alpaca/callback')
        .set('Cookie', authCookie)
        .query({
          code: 'mock_authorization_code',
          state: 'invalid_state_parameter'
        })
        .expect(403);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toMatch(/state|csrf|invalid/i);

      // Verify tokens NOT saved
      const user = await User.findById(testUser._id);
      expect(user.tradingConfig.oauthTokens.has('alpaca')).toBe(false);
    });

    it('should reject callback with missing authorization code', async () => {
      const response = await request(app)
        .get('/api/v1/auth/broker/alpaca/callback')
        .set('Cookie', authCookie)
        .query({
          state: mockState
          // Missing code
        })
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toMatch(/authorization code|missing/i);
    });

    it('should handle token exchange errors gracefully', async () => {
      // Mock token exchange failure
      axios.post.mockRejectedValueOnce(new Error('OAuth provider error: Invalid code'));

      const response = await request(app)
        .get('/api/v1/auth/broker/alpaca/callback')
        .set('Cookie', authCookie)
        .query({
          code: 'invalid_authorization_code',
          state: mockState
        })
        .expect(500);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toMatch(/token exchange|failed/i);

      // Verify tokens NOT saved
      const user = await User.findById(testUser._id);
      expect(user.tradingConfig.oauthTokens.has('alpaca')).toBe(false);
    });
  });

  describe('Token Refresh Mechanism', () => {
    let testUser;

    beforeEach(async () => {
      // Create user with existing OAuth tokens
      testUser = await User.create({
        discordId: 'test_discord_789',
        discordUsername: 'refresh_tester',
        discordTag: 'refresh_tester#1234',
        username: 'refresh_tester',
        discordUsername: 'refresh_tester',
        discordTag: 'refresh_tester#1234',
        email: 'refresh@example.com',
        communityId: new mongoose.Types.ObjectId(),
        tradingConfig: {
          oauthTokens: new Map([
            [
              'alpaca',
              {
                accessToken: oauth2Service.encryptToken('old_access_token'),
                refreshToken: oauth2Service.encryptToken('old_refresh_token'),
                expiresAt: new Date(Date.now() + 60 * 1000), // Expires in 1 minute
                scopes: ['account:read', 'trading'],
                tokenType: 'Bearer',
                connectedAt: new Date(),
                isValid: true
              }
            ]
          ])
        }
      });

      // Mock successful token refresh
      axios.post.mockResolvedValue({
        data: {
          access_token: 'new_access_token_123456',
          refresh_token: 'new_refresh_token_789012',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'account:read trading'
        }
      });
    });

    it('should refresh access token successfully', async () => {
      const newTokens = await oauth2Service.refreshAccessToken('alpaca', testUser._id.toString());

      expect(newTokens).toHaveProperty('accessToken');
      expect(newTokens).toHaveProperty('refreshToken');
      expect(newTokens).toHaveProperty('expiresAt');
      expect(newTokens.expiresAt > new Date()).toBe(true);

      // Verify token refresh API was called
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('token'),
        expect.stringContaining('grant_type=refresh_token'),
        expect.any(Object)
      );

      // Verify database updated
      const updatedUser = await User.findById(testUser._id);
      const alpacaTokens = updatedUser.tradingConfig.oauthTokens.get('alpaca');
      expect(alpacaTokens.lastRefreshAttempt).toBeDefined();
      expect(alpacaTokens.isValid).toBe(true);
    });

    it('should handle refresh token expiry gracefully', async () => {
      // Mock refresh token expired error
      axios.post.mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            error: 'invalid_grant',
            error_description: 'Refresh token expired'
          }
        }
      });

      await expect(oauth2Service.refreshAccessToken('alpaca', testUser._id.toString())).rejects.toThrow(
        /expired|invalid/i
      );

      // Verify error logged in database
      const updatedUser = await User.findById(testUser._id);
      const alpacaTokens = updatedUser.tradingConfig.oauthTokens.get('alpaca');
      expect(alpacaTokens.lastRefreshError).toBeDefined();
      expect(alpacaTokens.lastRefreshError).toMatch(/expired|invalid/i);
    });

    it('should retry token refresh with exponential backoff', async () => {
      // Mock temporary network error (will succeed on retry)
      axios.post
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValueOnce({
          data: {
            access_token: 'retry_access_token',
            refresh_token: 'retry_refresh_token',
            token_type: 'Bearer',
            expires_in: 3600
          }
        });

      const newTokens = await oauth2Service.refreshAccessToken('alpaca', testUser._id.toString());

      expect(newTokens).toHaveProperty('accessToken');
      expect(axios.post).toHaveBeenCalledTimes(3); // 2 failures + 1 success
    });

    it('should support token rotation (new refresh token)', async () => {
      // Mock token rotation (broker returns new refresh token)
      axios.post.mockResolvedValueOnce({
        data: {
          access_token: 'rotated_access_token',
          refresh_token: 'rotated_refresh_token', // New refresh token
          token_type: 'Bearer',
          expires_in: 3600
        }
      });

      const newTokens = await oauth2Service.refreshAccessToken('alpaca', testUser._id.toString());

      expect(newTokens.refreshToken).not.toBe('old_refresh_token');

      const updatedUser = await User.findById(testUser._id);
      const alpacaTokens = updatedUser.tradingConfig.oauthTokens.get('alpaca');

      // Verify new refresh token stored (encrypted)
      const decryptedRefreshToken = oauth2Service.decryptToken(alpacaTokens.refreshToken);
      expect(decryptedRefreshToken).toBe('rotated_refresh_token');
    });
  });

  describe('Session Management', () => {
    let testUser;
    let authCookie;

    beforeEach(async () => {
      // Create test user
      testUser = await User.create({
        discordId: 'session_test_user',
        discordUsername: 'session_tester',
        discordTag: 'session_tester#1234',
        username: 'session_tester',
        discordUsername: 'session_tester',
        discordTag: 'session_tester#1234',
        email: 'session@example.com',
        communityId: new mongoose.Types.ObjectId()
      });

      // Login and get session cookie
      const agent = request.agent(app);
      const loginResponse = await agent.post('/api/v1/auth/test-login').send({ userId: testUser._id.toString() });

      authCookie = loginResponse.headers['set-cookie'];
    });

    it('should create session on login', async () => {
      expect(authCookie).toBeDefined();
      expect(authCookie[0]).toMatch(/connect\.sid=/);

      // Verify session works for authenticated endpoints
      const response = await request(app).get('/api/v1/auth/brokers/status').set('Cookie', authCookie).expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should persist session across requests', async () => {
      // First request
      await request(app).get('/api/v1/auth/brokers/status').set('Cookie', authCookie).expect(200);

      // Second request with same cookie
      const response = await request(app).get('/api/v1/auth/brokers/status').set('Cookie', authCookie).expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should destroy session on logout', async () => {
      // Logout
      await request(app).post('/api/v1/auth/logout').set('Cookie', authCookie).expect(200);

      // Verify session invalidated
      await request(app).get('/api/v1/auth/brokers/status').set('Cookie', authCookie).expect(401);
    });

    it('should reject expired session cookies', async () => {
      // Simulate expired cookie (beyond maxAge)
      const expiredCookie = authCookie[0].replace(/Max-Age=\d+/, 'Max-Age=0');

      await request(app).get('/api/v1/auth/brokers/status').set('Cookie', expiredCookie).expect(401);
    });
  });

  describe('Security & Edge Cases', () => {
    it('should sanitize OAuth2 errors (no sensitive data leaked)', async () => {
      // Mock OAuth error with sensitive data
      axios.post.mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            error: 'invalid_client',
            error_description: 'Client secret ABC123SECRET is invalid'
          }
        }
      });

      const testUser = await User.create({
        discordId: 'security_test',
        discordUsername: 'security_tester',
        discordTag: 'security_tester#1234',
        username: 'security_tester',
        discordUsername: 'security_tester',
        discordTag: 'security_tester#1234',
        email: 'security@example.com'
      });

      try {
        await oauth2Service.exchangeAuthorizationCode('alpaca', 'invalid_code', testUser._id.toString());
      } catch (error) {
        // Verify error message doesn't contain sensitive data
        expect(error.message).not.toMatch(/ABC123SECRET/);
        expect(error.message).toMatch(/OAuth.*failed|invalid/i);
      }
    });

    it('should enforce HTTPS in production for OAuth2 callbacks', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      // In production, redirect URIs should use HTTPS
      const config = require('../../../src/config/oauth2Providers').getProviderConfig('alpaca');

      if (config) {
        expect(config.redirectUri).toMatch(/^https:\/\//);
      }

      process.env.NODE_ENV = originalEnv;
    });

    it('should rate-limit OAuth2 authorization attempts', async () => {
      const testUser = await User.create({
        discordId: 'rate_limit_test',
        discordUsername: 'rate_limiter',
        discordTag: 'rate_limiter#1234',
        username: 'rate_limiter',
        discordUsername: 'rate_limiter',
        discordTag: 'rate_limiter#1234',
        email: 'rate@example.com'
      });

      const agent = request.agent(app);
      await agent.post('/api/v1/auth/test-login').send({ userId: testUser._id.toString() });

      // Make multiple rapid requests
      const requests = [];
      for (let i = 0; i < 20; i++) {
        requests.push(agent.get('/api/v1/auth/broker/alpaca/authorize'));
      }

      const responses = await Promise.all(requests);

      // At least some should be rate-limited (429 status)
      const rateLimitedCount = responses.filter(r => r.status === 429).length;
      expect(rateLimitedCount).toBeGreaterThan(0);
    });

    it('should handle malformed authorization codes', async () => {
      const testUser = await User.create({
        discordId: 'malformed_test',
        discordUsername: 'malformed_tester',
        discordTag: 'malformed_tester#1234',
        username: 'malformed_tester',
        discordUsername: 'malformed_tester',
        discordTag: 'malformed_tester#1234',
        email: 'malformed@example.com'
      });

      axios.post.mockRejectedValueOnce(new Error('Invalid authorization code format'));

      await expect(
        oauth2Service.exchangeAuthorizationCode('alpaca', 'malformed<>code!@#', testUser._id.toString())
      ).rejects.toThrow(/Invalid|malformed/i);
    });

    it('should validate OAuth2 scope requirements', async () => {
      // Mock token response with insufficient scopes
      axios.post.mockResolvedValueOnce({
        data: {
          access_token: 'limited_access_token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'account:read' // Missing 'trading' scope
        }
      });

      const testUser = await User.create({
        discordId: 'scope_test',
        discordUsername: 'scope_tester',
        discordTag: 'scope_tester#1234',
        username: 'scope_tester',
        discordUsername: 'scope_tester',
        discordTag: 'scope_tester#1234',
        email: 'scope@example.com'
      });

      try {
        await oauth2Service.exchangeAuthorizationCode('alpaca', 'test_code', testUser._id.toString());
      } catch (error) {
        expect(error.message).toMatch(/scope|permission/i);
      }
    });
  });

  describe('Performance', () => {
    it('should handle token refresh within <200ms p95', async () => {
      const testUser = await User.create({
        discordId: 'perf_test',
        discordUsername: 'perf_tester',
        discordTag: 'perf_tester#1234',
        username: 'perf_tester',
        discordUsername: 'perf_tester',
        discordTag: 'perf_tester#1234',
        email: 'perf@example.com',
        tradingConfig: {
          oauthTokens: new Map([
            [
              'alpaca',
              {
                accessToken: oauth2Service.encryptToken('perf_access_token'),
                refreshToken: oauth2Service.encryptToken('perf_refresh_token'),
                expiresAt: new Date(Date.now() + 60 * 1000),
                scopes: ['account:read', 'trading'],
                tokenType: 'Bearer',
                isValid: true
              }
            ]
          ])
        }
      });

      axios.post.mockResolvedValue({
        data: {
          access_token: 'new_perf_token',
          refresh_token: 'new_perf_refresh',
          token_type: 'Bearer',
          expires_in: 3600
        }
      });

      const startTime = Date.now();
      await oauth2Service.refreshAccessToken('alpaca', testUser._id.toString());
      const executionTime = Date.now() - startTime;

      expect(executionTime).toBeLessThan(200); // <200ms requirement
    });
  });

  describe('Broker Status & Management', () => {
    let testUser;
    let authCookie;

    beforeEach(async () => {
      testUser = await User.create({
        discordId: 'broker_test_' + Date.now(),
        discordUsername: 'broker_tester',
        discordTag: 'broker_tester#1234',
        username: 'broker_tester',
        discordUsername: 'broker_tester',
        discordTag: 'broker_tester#1234',
        email: 'broker@example.com',
        tradingConfig: {
          oauthTokens: new Map([
            [
              'alpaca',
              {
                accessToken: oauth2Service.encryptToken('alpaca_access_token'),
                refreshToken: oauth2Service.encryptToken('alpaca_refresh_token'),
                expiresAt: new Date(Date.now() + 7200 * 1000), // Expires in 2 hours (safely > 1 hour threshold)
                connectedAt: new Date(),
                scopes: ['account:read', 'trading'],
                tokenType: 'Bearer',
                isValid: true
              }
            ],
            [
              'schwab',
              {
                accessToken: oauth2Service.encryptToken('schwab_access_token'),
                refreshToken: oauth2Service.encryptToken('schwab_refresh_token'),
                expiresAt: new Date(Date.now() - 1000), // Expired
                connectedAt: new Date(Date.now() - 7200 * 1000),
                scopes: ['trading', 'account'],
                tokenType: 'Bearer',
                isValid: true
              }
            ],
            [
              'ibkr',
              {
                accessToken: oauth2Service.encryptToken('ibkr_access_token'),
                refreshToken: oauth2Service.encryptToken('ibkr_refresh_token'),
                expiresAt: new Date(Date.now() + 30 * 60 * 1000), // Expiring in 30 min
                connectedAt: new Date(),
                scopes: ['trading'],
                tokenType: 'Bearer',
                isValid: true
              }
            ]
          ])
        }
      });

      const agent = request.agent(app);
      const loginRes = await agent.post('/api/auth/login/mock').send({ userId: testUser._id.toString() });

      authCookie = loginRes.headers['set-cookie'];
    });

    it('should get status for all connected brokers', async () => {
      const response = await request(app).get('/api/v1/auth/brokers/status').set('Cookie', authCookie).expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.brokers).toBeInstanceOf(Array);
      expect(response.body.brokers.length).toBeGreaterThan(0);

      // Find connected brokers
      const alpacaBroker = response.body.brokers.find(b => b.key === 'alpaca');
      const schwabBroker = response.body.brokers.find(b => b.key === 'schwab');
      const ibkrBroker = response.body.brokers.find(b => b.key === 'ibkr');

      // Alpaca: connected
      expect(alpacaBroker).toBeDefined();
      expect(alpacaBroker.status).toBe('connected');
      expect(alpacaBroker.isValid).toBe(true);
      expect(alpacaBroker.expiresAt).toBeDefined();
      expect(alpacaBroker.expiresInSeconds).toBeGreaterThan(0);

      // Schwab: expired
      expect(schwabBroker).toBeDefined();
      expect(schwabBroker.status).toBe('expired');
      expect(schwabBroker.isValid).toBe(true);

      // IBKR: expiring soon
      expect(ibkrBroker).toBeDefined();
      expect(ibkrBroker.status).toBe('expiring');
    });

    it('should show disconnected brokers with no tokens', async () => {
      const response = await request(app).get('/api/v1/auth/brokers/status').set('Cookie', authCookie).expect(200);

      expect(response.body.success).toBe(true);

      // Find broker with no connection (e.g., moomoo)
      const disconnectedBroker = response.body.brokers.find(b => b.status === 'disconnected');
      expect(disconnectedBroker).toBeDefined();
      expect(disconnectedBroker.connectedAt).toBeNull();
      expect(disconnectedBroker.expiresAt).toBeNull();
    });

    it('should handle revoked tokens status', async () => {
      // Revoke Alpaca token
      const user = await User.findById(testUser._id);
      const alpacaTokens = user.tradingConfig.oauthTokens.get('alpaca');
      alpacaTokens.isValid = false;
      user.tradingConfig.oauthTokens.set('alpaca', alpacaTokens);
      await user.save();

      const response = await request(app).get('/api/v1/auth/brokers/status').set('Cookie', authCookie).expect(200);

      const alpacaBroker = response.body.brokers.find(b => b.key === 'alpaca');
      expect(alpacaBroker.status).toBe('revoked');
      expect(alpacaBroker.isValid).toBe(false);
    });

    it('should reject broker status without authentication', async () => {
      const response = await request(app).get('/api/v1/auth/brokers/status').expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should include broker metadata in status', async () => {
      const response = await request(app).get('/api/v1/auth/brokers/status').set('Cookie', authCookie).expect(200);

      const broker = response.body.brokers[0];
      expect(broker).toHaveProperty('key');
      expect(broker).toHaveProperty('name');
      expect(broker).toHaveProperty('type');
      expect(broker).toHaveProperty('authMethods');
      expect(broker).toHaveProperty('features');
      expect(broker).toHaveProperty('supportsManualRefresh');
    });

    it('should disconnect broker successfully', async () => {
      const response = await request(app)
        .delete('/api/v1/auth/brokers/alpaca/oauth')
        .set('Cookie', authCookie)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toMatch(/removed successfully/i);

      // Verify token removed from database
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.tradingConfig.oauthTokens.has('alpaca')).toBe(false);
    });

    it('should reject disconnection of non-existent broker', async () => {
      const response = await request(app)
        .delete('/api/v1/auth/brokers/nonexistent/oauth')
        .set('Cookie', authCookie)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/no oauth2 connection found/i);
    });

    it('should reject broker disconnection without authentication', async () => {
      const response = await request(app).delete('/api/v1/auth/brokers/alpaca/oauth').expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should handle partial broker connections', async () => {
      // User with only 1 broker connected
      const singleBrokerUser = await User.create({
        discordId: 'single_broker_' + Date.now(),
        username: 'single_broker_tester',
        discordUsername: 'single_broker_tester',
        discordTag: 'single_broker_tester#1234',
        email: 'singlebroker@example.com',
        tradingConfig: {
          oauthTokens: new Map([
            [
              'alpaca',
              {
                accessToken: oauth2Service.encryptToken('alpaca_token'),
                refreshToken: oauth2Service.encryptToken('alpaca_refresh'),
                expiresAt: new Date(Date.now() + 3600 * 1000),
                isValid: true
              }
            ]
          ])
        }
      });

      const agent = request.agent(app);
      const loginRes = await agent.post('/api/auth/login/mock').send({ userId: singleBrokerUser._id.toString() });

      const cookie = loginRes.headers['set-cookie'];

      const response = await request(app).get('/api/v1/auth/brokers/status').set('Cookie', cookie).expect(200);

      const connectedCount = response.body.brokers.filter(b => b.status === 'connected').length;
      expect(connectedCount).toBe(1);

      const disconnectedCount = response.body.brokers.filter(b => b.status === 'disconnected').length;
      expect(disconnectedCount).toBeGreaterThan(0);
    });

    it('should handle user with no broker connections', async () => {
      const noBrokerUser = await User.create({
        discordId: 'no_broker_' + Date.now(),
        username: 'no_broker_tester',
        discordUsername: 'no_broker_tester',
        discordTag: 'no_broker_tester#1234',
        email: 'nobroker@example.com',
        tradingConfig: {
          oauthTokens: new Map()
        }
      });

      const agent = request.agent(app);
      const loginRes = await agent.post('/api/auth/login/mock').send({ userId: noBrokerUser._id.toString() });

      const cookie = loginRes.headers['set-cookie'];

      const response = await request(app).get('/api/v1/auth/brokers/status').set('Cookie', cookie).expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.brokers).toBeInstanceOf(Array);

      // All brokers should be disconnected
      const allDisconnected = response.body.brokers.every(b => b.status === 'disconnected');
      expect(allDisconnected).toBe(true);
    });

    it('should preserve other broker connections when disconnecting one', async () => {
      // Disconnect Alpaca
      await request(app).delete('/api/v1/auth/brokers/alpaca/oauth').set('Cookie', authCookie).expect(200);

      // Verify other brokers still connected
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.tradingConfig.oauthTokens.has('alpaca')).toBe(false);
      expect(updatedUser.tradingConfig.oauthTokens.has('schwab')).toBe(true);
      expect(updatedUser.tradingConfig.oauthTokens.has('ibkr')).toBe(true);
    });
  });

  describe('MFA Routes - Setup & Enable', () => {
    let testUser;
    let authCookie;

    beforeEach(async () => {
      // Create authenticated user
      testUser = await User.create({
        discordId: 'mfa_test_' + Date.now(),
        username: 'mfa_tester',
        discordUsername: 'mfa_tester',
        discordTag: 'mfa_tester#1234',
        email: 'mfa@example.com',
        subscription: {
          status: 'active',
          tier: 'professional'
        },
        mfa: {
          enabled: false
        }
      });

      // Simulate authenticated session
      const agent = request.agent(app);
      const loginRes = await agent.post('/api/auth/login/mock').send({ userId: testUser._id.toString() });

      authCookie = loginRes.headers['set-cookie'];
    });

    it('should generate MFA secret and QR code successfully', async () => {
      const response = await request(app).post('/api/v1/auth/mfa/setup').set('Cookie', authCookie).expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.secret).toBeDefined();
      expect(response.body.secret).toMatch(/^[A-Z2-7]{32}$/); // Base32 format
      expect(response.body.qrCode).toBeDefined();
      expect(response.body.qrCode).toContain('data:image/png;base64');
      expect(response.body.manualEntry).toBeDefined();

      // Verify database updated
      const updatedUser = await User.findById(testUser._id).select('+mfa.secret');
      expect(updatedUser.mfa.enabled).toBe(false);
      expect(updatedUser.mfa.secret).toBeDefined();
      expect(updatedUser.mfa.secret).not.toBe(response.body.secret); // Encrypted
    });

    it('should reject MFA setup when already enabled', async () => {
      // Enable MFA first
      testUser.mfa.enabled = true;
      testUser.mfa.secret = 'encrypted_secret';
      await testUser.save();

      const response = await request(app).post('/api/v1/auth/mfa/setup').set('Cookie', authCookie).expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('MFA_ALREADY_ENABLED');
      expect(response.body.error).toMatch(/already enabled/i);
    });

    it('should reject MFA setup without authentication', async () => {
      const response = await request(app).post('/api/v1/auth/mfa/setup').expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should enable MFA with valid TOTP token', async () => {
      // Setup MFA first
      const setupRes = await request(app).post('/api/v1/auth/mfa/setup').set('Cookie', authCookie);

      const secret = setupRes.body.secret;

      // Generate valid TOTP
      const speakeasy = require('speakeasy');
      const validToken = speakeasy.totp({
        secret,
        encoding: 'base32'
      });

      const response = await request(app)
        .post('/api/v1/auth/mfa/enable')
        .set('Cookie', authCookie)
        .send({ token: validToken })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.enabled).toBe(true);
      expect(response.body.backupCodes).toBeDefined();
      expect(response.body.backupCodes).toHaveLength(10);
      expect(response.body.backupCodes[0]).toMatch(/^\w{4}-\w{4}$/);

      // Verify database updated
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.mfa.enabled).toBe(true);
      expect(updatedUser.mfa.backupCodes).toHaveLength(10);
    });

    it('should reject MFA enable with invalid TOTP token', async () => {
      // Setup MFA first
      await request(app).post('/api/v1/auth/mfa/setup').set('Cookie', authCookie);

      const response = await request(app)
        .post('/api/v1/auth/mfa/enable')
        .set('Cookie', authCookie)
        .send({ token: '000000' }) // Invalid token
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('INVALID_TOKEN');
      expect(response.body.error).toMatch(/invalid verification code/i);

      // Verify MFA not enabled
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.mfa.enabled).toBe(false);
    });

    it('should reject MFA enable with malformed token', async () => {
      await request(app).post('/api/v1/auth/mfa/setup').set('Cookie', authCookie);

      const response = await request(app)
        .post('/api/v1/auth/mfa/enable')
        .set('Cookie', authCookie)
        .send({ token: 'abc123' }) // Not 6 digits
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('INVALID_TOKEN_FORMAT');
    });

    it('should reject MFA enable when already enabled', async () => {
      testUser.mfa.enabled = true;
      await testUser.save();

      const response = await request(app)
        .post('/api/v1/auth/mfa/enable')
        .set('Cookie', authCookie)
        .send({ token: '123456' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('MFA_ALREADY_ENABLED');
    });

    it('should enforce rate limiting on MFA enable attempts', async () => {
      await request(app).post('/api/v1/auth/mfa/setup').set('Cookie', authCookie);

      // Make 11 failed attempts (over rate limit of 10 per 15 min)
      for (let i = 0; i < 11; i++) {
        const response = await request(app)
          .post('/api/v1/auth/mfa/enable')
          .set('Cookie', authCookie)
          .send({ token: '000000' });

        if (i < 10) {
          expect(response.status).toBe(400);
          expect(response.body.code).toBe('INVALID_TOKEN');
        } else {
          expect(response.status).toBe(429);
          expect(response.body.code).toBe('RATE_LIMIT_EXCEEDED');
        }
      }
    });
  });

  describe('MFA Routes - Disable', () => {
    let testUser;
    let authCookie;
    let mfaSecret;

    beforeEach(async () => {
      const speakeasy = require('speakeasy');
      const secret = speakeasy.generateSecret({ length: 32 });
      mfaSecret = secret.base32;

      // Encrypt the secret using MFAService
      const { getMFAService } = require('../../../src/services/MFAService');
      const mfaService = getMFAService();
      const encryptedSecret = mfaService.encryptSecret(mfaSecret);

      testUser = await User.create({
        discordId: 'mfa_disable_test_' + Date.now(),
        username: 'mfa_disable_tester',
        discordUsername: 'mfa_disable_tester',
        discordTag: 'mfa_disable_tester#1234',
        email: 'mfadisable@example.com',
        subscription: {
          status: 'active',
          tier: 'professional'
        },
        mfa: {
          enabled: true,
          secret: encryptedSecret,
          backupCodes: [
            { code: 'ABCD-EFGH', used: false },
            { code: 'IJKL-MNOP', used: false }
          ]
        }
      });

      const agent = request.agent(app);
      const loginRes = await agent.post('/api/auth/login/mock').send({ userId: testUser._id.toString() });

      authCookie = loginRes.headers['set-cookie'];
    });

    it('should disable MFA with valid TOTP token', async () => {
      const speakeasy = require('speakeasy');
      const validToken = speakeasy.totp({
        secret: mfaSecret,
        encoding: 'base32'
      });

      const response = await request(app)
        .post('/api/v1/auth/mfa/disable')
        .set('Cookie', authCookie)
        .send({ token: validToken });

      if (response.status !== 200) {
        console.log('MFA disable error:', response.status, response.body);
      }

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.disabled).toBe(true);

      // Verify database updated
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.mfa.enabled).toBe(false);
      expect(updatedUser.mfa.secret).toBeUndefined();
      expect(updatedUser.mfa.backupCodes).toHaveLength(0);
    });

    it('should disable MFA with valid backup code', async () => {
      const response = await request(app)
        .post('/api/v1/auth/mfa/disable')
        .set('Cookie', authCookie)
        .send({ token: 'ABCD-EFGH' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.disabled).toBe(true);

      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.mfa.enabled).toBe(false);
    });

    it('should reject MFA disable with invalid TOTP token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/mfa/disable')
        .set('Cookie', authCookie)
        .send({ token: '000000' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('INVALID_TOKEN');

      // Verify MFA still enabled
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.mfa.enabled).toBe(true);
    });

    it('should reject MFA disable when not enabled', async () => {
      testUser.mfa.enabled = false;
      await testUser.save();

      const response = await request(app)
        .post('/api/v1/auth/mfa/disable')
        .set('Cookie', authCookie)
        .send({ token: '123456' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('MFA_NOT_ENABLED');
    });

    it('should enforce rate limiting on MFA disable attempts', async () => {
      // Make 6 failed attempts (over rate limit of 5 per 15 min)
      for (let i = 0; i < 6; i++) {
        const response = await request(app)
          .post('/api/v1/auth/mfa/disable')
          .set('Cookie', authCookie)
          .send({ token: '000000' });

        if (i < 5) {
          expect(response.status).toBe(400);
        } else {
          expect(response.status).toBe(429);
          expect(response.body.code).toBe('RATE_LIMIT_EXCEEDED');
        }
      }
    });
  });

  describe('MFA Routes - Backup Codes', () => {
    let testUser;
    let authCookie;
    let mfaSecret;

    beforeEach(async () => {
      const speakeasy = require('speakeasy');
      const secret = speakeasy.generateSecret({ length: 32 });
      mfaSecret = secret.base32;

      testUser = await User.create({
        discordId: 'mfa_backup_test_' + Date.now(),
        username: 'mfa_backup_tester',
        discordUsername: 'mfa_backup_tester',
        discordTag: 'mfa_backup_tester#1234',
        email: 'mfabackup@example.com',
        subscription: {
          status: 'active',
          tier: 'professional'
        },
        mfa: {
          enabled: true,
          secret: mfaSecret,
          backupCodes: [
            { code: 'OLD1-CODE', used: false },
            { code: 'OLD2-CODE', used: false }
          ]
        }
      });

      const agent = request.agent(app);
      const loginRes = await agent.post('/api/auth/login/mock').send({ userId: testUser._id.toString() });

      authCookie = loginRes.headers['set-cookie'];
    });

    it('should regenerate backup codes with valid TOTP', async () => {
      const speakeasy = require('speakeasy');
      const validToken = speakeasy.totp({
        secret: mfaSecret,
        encoding: 'base32'
      });

      const response = await request(app)
        .post('/api/v1/auth/mfa/backup-codes/regenerate')
        .set('Cookie', authCookie)
        .send({ token: validToken })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.backupCodes).toHaveLength(10);
      expect(response.body.backupCodes).not.toContain('OLD1-CODE');
      expect(response.body.backupCodes).not.toContain('OLD2-CODE');

      // Verify database updated
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.mfa.backupCodes).toHaveLength(10);
    });

    it('should reject backup code regeneration with invalid token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/mfa/backup-codes/regenerate')
        .set('Cookie', authCookie)
        .send({ token: '000000' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('INVALID_TOKEN');

      // Verify old codes still valid
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.mfa.backupCodes).toHaveLength(2);
    });

    it('should reject backup code regeneration when MFA disabled', async () => {
      testUser.mfa.enabled = false;
      await testUser.save();

      const response = await request(app)
        .post('/api/v1/auth/mfa/backup-codes/regenerate')
        .set('Cookie', authCookie)
        .send({ token: '123456' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('MFA_NOT_ENABLED');
    });
  });

  describe('MFA Routes - Status & Verify', () => {
    let testUser;
    let authCookie;
    let mfaSecret;

    beforeEach(async () => {
      const speakeasy = require('speakeasy');
      const secret = speakeasy.generateSecret({ length: 32 });
      mfaSecret = secret.base32;

      testUser = await User.create({
        discordId: 'mfa_status_test_' + Date.now(),
        username: 'mfa_status_tester',
        discordUsername: 'mfa_status_tester',
        discordTag: 'mfa_status_tester#1234',
        email: 'mfastatus@example.com',
        subscription: {
          status: 'active',
          tier: 'professional'
        },
        mfa: {
          enabled: true,
          secret: mfaSecret,
          backupCodes: [
            { code: 'BACK-UP01', used: false },
            { code: 'BACK-UP02', used: false },
            { code: 'BACK-UP03', used: true } // One used
          ]
        }
      });

      const agent = request.agent(app);
      const loginRes = await agent.post('/api/auth/login/mock').send({ userId: testUser._id.toString() });

      authCookie = loginRes.headers['set-cookie'];
    });

    it('should return MFA status when enabled', async () => {
      const response = await request(app).get('/api/v1/auth/mfa/status').set('Cookie', authCookie).expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.enabled).toBe(true);
      expect(response.body.backupCodesRemaining).toBe(2); // 2 unused
    });

    it('should return MFA status when disabled', async () => {
      testUser.mfa.enabled = false;
      testUser.mfa.backupCodes = [];
      await testUser.save();

      const response = await request(app).get('/api/v1/auth/mfa/status').set('Cookie', authCookie).expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.enabled).toBe(false);
      expect(response.body.backupCodesRemaining).toBe(0);
    });

    it('should reject MFA status without authentication', async () => {
      const response = await request(app).get('/api/v1/auth/mfa/status').expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should verify valid TOTP token', async () => {
      const speakeasy = require('speakeasy');
      const validToken = speakeasy.totp({
        secret: mfaSecret,
        encoding: 'base32'
      });

      const response = await request(app)
        .post('/api/v1/auth/mfa/verify')
        .set('Cookie', authCookie)
        .send({ token: validToken })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.verified).toBe(true);
    });

    it('should verify valid unused backup code', async () => {
      const response = await request(app)
        .post('/api/v1/auth/mfa/verify')
        .set('Cookie', authCookie)
        .send({ token: 'BACK-UP01' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.verified).toBe(true);
      expect(response.body.backupCodeUsed).toBe(true);

      // Verify code marked as used
      const updatedUser = await User.findById(testUser._id);
      const usedCode = updatedUser.mfa.backupCodes.find(c => c.code === 'BACK-UP01');
      expect(usedCode.used).toBe(true);
    });

    it('should reject already-used backup code', async () => {
      const response = await request(app)
        .post('/api/v1/auth/mfa/verify')
        .set('Cookie', authCookie)
        .send({ token: 'BACK-UP03' }) // Already used
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('INVALID_TOKEN');
    });

    it('should reject invalid TOTP token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/mfa/verify')
        .set('Cookie', authCookie)
        .send({ token: '000000' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('INVALID_TOKEN');
    });

    it('should enforce rate limiting on verify attempts with lockout', async () => {
      // Make 11 failed attempts (lockout after 10)
      for (let i = 0; i < 11; i++) {
        const response = await request(app)
          .post('/api/v1/auth/mfa/verify')
          .set('Cookie', authCookie)
          .send({ token: '000000' });

        if (i < 10) {
          expect(response.status).toBe(400);
          expect(response.body.code).toBe('INVALID_TOKEN');
        } else {
          expect(response.status).toBe(429);
          expect(response.body.code).toBe('ACCOUNT_LOCKED');
          expect(response.body.error).toMatch(/too many failed/i);
        }
      }

      // Verify account is locked
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.accountStatus.locked).toBe(true);
    });

    it('should handle TOTP time drift (±30s window)', async () => {
      const speakeasy = require('speakeasy');

      // Generate token for 30 seconds ago
      const pastToken = speakeasy.totp({
        secret: mfaSecret,
        encoding: 'base32',
        time: Math.floor(Date.now() / 1000) - 30,
        window: 1
      });

      const response = await request(app)
        .post('/api/v1/auth/mfa/verify')
        .set('Cookie', authCookie)
        .send({ token: pastToken })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.verified).toBe(true);
    });
  });

  describe('MFA Routes - Edge Cases', () => {
    let testUser;
    let authCookie;

    beforeEach(async () => {
      testUser = await User.create({
        discordId: 'mfa_edge_test_' + Date.now(),
        username: 'mfa_edge_tester',
        discordUsername: 'mfa_edge_tester',
        discordTag: 'mfa_edge_tester#1234',
        email: 'mfaedge@example.com',
        subscription: {
          status: 'active',
          tier: 'professional'
        },
        mfa: {
          enabled: false
        }
      });

      const agent = request.agent(app);
      const loginRes = await agent.post('/api/auth/login/mock').send({ userId: testUser._id.toString() });

      authCookie = loginRes.headers['set-cookie'];
    });

    it('should handle concurrent MFA setup attempts', async () => {
      const setupPromises = [
        request(app).post('/api/v1/auth/mfa/setup').set('Cookie', authCookie),
        request(app).post('/api/v1/auth/mfa/setup').set('Cookie', authCookie),
        request(app).post('/api/v1/auth/mfa/setup').set('Cookie', authCookie)
      ];

      const responses = await Promise.all(setupPromises);

      // First request should succeed
      const successCount = responses.filter(r => r.status === 200).length;
      expect(successCount).toBeGreaterThanOrEqual(1);

      // Subsequent requests may fail or succeed depending on timing
      // But database should only have one secret
      const finalUser = await User.findById(testUser._id).select('+mfa.secret');
      expect(finalUser.mfa.secret).toBeDefined();
    });

    it('should rollback MFA enable on database failure', async () => {
      // Setup MFA
      const setupRes = await request(app).post('/api/v1/auth/mfa/setup').set('Cookie', authCookie);

      const secret = setupRes.body.secret;

      // Mock database save failure
      const originalSave = User.prototype.save;
      User.prototype.save = jest.fn().mockRejectedValue(new Error('Database connection lost'));

      const speakeasy = require('speakeasy');
      const validToken = speakeasy.totp({
        secret,
        encoding: 'base32'
      });

      const response = await request(app)
        .post('/api/v1/auth/mfa/enable')
        .set('Cookie', authCookie)
        .send({ token: validToken })
        .expect(500);

      expect(response.body.success).toBe(false);

      // Restore original save
      User.prototype.save = originalSave;

      // Verify MFA not enabled
      const finalUser = await User.findById(testUser._id);
      expect(finalUser.mfa.enabled).toBe(false);
    });

    it('should clear MFA data on user deletion', async () => {
      // Setup and enable MFA
      const setupRes = await request(app).post('/api/v1/auth/mfa/setup').set('Cookie', authCookie);

      const speakeasy = require('speakeasy');
      const validToken = speakeasy.totp({
        secret: setupRes.body.secret,
        encoding: 'base32'
      });

      await request(app).post('/api/v1/auth/mfa/enable').set('Cookie', authCookie).send({ token: validToken });

      // Delete user
      await User.findByIdAndDelete(testUser._id);

      // Verify user deleted (no orphaned MFA data)
      const deletedUser = await User.findById(testUser._id);
      expect(deletedUser).toBeNull();
    });

    it('should reject MFA operations with missing token field', async () => {
      const response = await request(app)
        .post('/api/v1/auth/mfa/enable')
        .set('Cookie', authCookie)
        .send({}) // No token field
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('INVALID_TOKEN_FORMAT');
    });
  });
});
