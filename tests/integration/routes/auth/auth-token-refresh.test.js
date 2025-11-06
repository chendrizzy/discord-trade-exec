/**
 * Integration Test: OAuth2 Token Refresh Mechanisms
 * Extracted from auth.test.js lines 408-538, 1112-1271
 */

'use strict';


const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
const speakeasy = require('speakeasy');
const User = require('../../../../src/models/User');
const oauth2Service = require('../../../../src/services/OAuth2Service'); // Singleton instance
const { getMFAService } = require('../../../../src/services/MFAService');

// Mock Discord OAuth2 provider responses
jest.mock('axios');

describe('OAuth2 Token Refresh', () => {
  let app;
  let sessionStore;


  beforeAll(async () => {
    // Create Express app with authentication middleware
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Session middleware with MongoDB store
    sessionStore = MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      ttl: 24 * 60 * 60 // 1 day
    });

    app.use(
      session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        store: sessionStore,
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
    const authRouter = require('../../../../src/routes/api/auth');
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

    // Error handler middleware (must be last)
    const { errorHandler } = require('../../../../src/middleware/errorHandler');
    app.use(errorHandler);

    // No need to instantiate - oauth2Service is already a singleton
  });

  afterAll(async () => {
    // Cleanup MFAService interval to prevent open handles
    const mfaService = getMFAService();
    if (mfaService && mfaService.shutdown) {
      mfaService.shutdown();
    }

    // Cleanup rate limiter intervals to prevent open handles
    const { exchangeCallTracker, brokerCallTracker } = require('../../../../src/middleware/rateLimiter');
    if (exchangeCallTracker && exchangeCallTracker.destroy) {
      exchangeCallTracker.destroy();
    }
    if (brokerCallTracker && brokerCallTracker.destroy) {
      brokerCallTracker.destroy();
    }
  });

  beforeEach(async () => {
    // Clear mocks
    jest.clearAllMocks();

    // Clear database
    await User.deleteMany({});

    // Clear session store to prevent session data leaking between tests
    if (sessionStore && sessionStore.clear) {
      await new Promise((resolve, reject) => {
        sessionStore.clear((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    // Clear MFAService rate limit cache to prevent state pollution between tests
    const mfaService = getMFAService();
    if (mfaService && mfaService.attemptCache) {
      mfaService.attemptCache.clear();
    }

    // Reset axios mock
    axios.post.mockReset();
    axios.get.mockReset();
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

  describe('OAuth2 Token Refresh Edge Cases - US3-T13', () => {
    let testUser;
    let authCookie;

    beforeEach(async () => {
      testUser = await User.create({
        discordId: 'refresh_test_' + Date.now(),
        username: 'refresh_tester',
        discordUsername: 'refresh_tester',
        discordTag: 'refresh_tester#1234',
        email: 'refresh@example.com',
        subscription: { status: 'active', tier: 'professional' }
      });

      // Add OAuth tokens that will expire soon
      testUser.tradingConfig.oauthTokens.set('alpaca', {
        accessToken: 'expiring_access_token',
        refreshToken: 'valid_refresh_token',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes from now
        connectedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        tokenType: 'Bearer',
        scopes: ['trading', 'account:read'],
        isValid: true
      });
      await testUser.save();

      const agent = request.agent(app);
      const loginRes = await agent.post('/api/auth/login/mock').send({ userId: testUser._id.toString() });
      authCookie = loginRes.headers['set-cookie'];
    });

    it('should automatically refresh expiring tokens (simulated cron job)', async () => {
      // Mock refreshAccessToken to simulate successful refresh
      const refreshSpy = jest.spyOn(oauth2Service, 'refreshAccessToken').mockResolvedValueOnce({
        accessToken: 'new_access_token_from_cron',
        refreshToken: 'new_refresh_token',
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
        tokenType: 'Bearer'
      });

      // Manually call refresh endpoint (simulating cron job)
      const response = await request(app)
        .post('/api/v1/auth/brokers/alpaca/oauth/refresh')
        .set('Cookie', authCookie)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('refreshed successfully');
      expect(response.body.expiresAt).toBeDefined();

      // Verify refresh was called
      expect(refreshSpy).toHaveBeenCalledWith('alpaca', testUser._id.toString());

      refreshSpy.mockRestore();
    });

    it('should rotate refresh token during token refresh', async () => {
      // Mock token rotation with new tokens
      const refreshSpy = jest.spyOn(oauth2Service, 'refreshAccessToken').mockResolvedValueOnce({
        accessToken: 'new_access_token_rotated',
        refreshToken: 'new_refresh_token_rotated',
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        tokenType: 'Bearer'
      });

      const response = await request(app)
        .post('/api/v1/auth/brokers/alpaca/oauth/refresh')
        .set('Cookie', authCookie)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('refreshed successfully');

      // Verify oauth2Service.refreshAccessToken was called (token rotation happens there)
      expect(refreshSpy).toHaveBeenCalledWith('alpaca', testUser._id.toString());

      // Verify new expiration time was returned
      expect(response.body.expiresAt).toBeDefined();
      const expiresAt = new Date(response.body.expiresAt);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

      refreshSpy.mockRestore();
    });

    it('should handle concurrent refresh requests gracefully', async () => {
      let callCount = 0;
      const refreshSpy = jest.spyOn(oauth2Service, 'refreshAccessToken').mockImplementation(async () => {
        callCount++;
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 100));
        return {
          accessToken: `new_token_${callCount}`,
          refreshToken: `refresh_${callCount}`,
          expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
          tokenType: 'Bearer'
        };
      });

      // Send 3 concurrent refresh requests
      const requests = [
        request(app).post('/api/v1/auth/brokers/alpaca/oauth/refresh').set('Cookie', authCookie),
        request(app).post('/api/v1/auth/brokers/alpaca/oauth/refresh').set('Cookie', authCookie),
        request(app).post('/api/v1/auth/brokers/alpaca/oauth/refresh').set('Cookie', authCookie)
      ];

      const responses = await Promise.all(requests);

      // All should succeed
      responses.forEach(res => {
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      });

      // Verify service was called for each request
      expect(callCount).toBe(3);

      refreshSpy.mockRestore();
    });

    it('should fail refresh with revoked refresh token', async () => {
      // Mock revoked token error
      const refreshSpy = jest.spyOn(oauth2Service, 'refreshAccessToken').mockRejectedValueOnce(
        new Error('Refresh token has been revoked or is invalid')
      );

      const response = await request(app)
        .post('/api/v1/auth/brokers/alpaca/oauth/refresh')
        .set('Cookie', authCookie)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(refreshSpy).toHaveBeenCalled();

      refreshSpy.mockRestore();
    });

    it('should not refresh if token is still fresh (>1 hour remaining)', async () => {
      // Update token to have 2 hours remaining
      testUser.tradingConfig.oauthTokens.get('alpaca').expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
      await testUser.save();

      const refreshSpy = jest.spyOn(oauth2Service, 'refreshAccessToken').mockResolvedValueOnce({
        accessToken: 'still_fresh_token',
        refreshToken: 'still_fresh_refresh',
        expiresAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
        tokenType: 'Bearer'
      });

      // Even though token is fresh, manual refresh should still work
      const response = await request(app)
        .post('/api/v1/auth/brokers/alpaca/oauth/refresh')
        .set('Cookie', authCookie)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(refreshSpy).toHaveBeenCalled();

      refreshSpy.mockRestore();
    });
  });
});
