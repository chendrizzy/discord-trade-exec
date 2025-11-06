/**
 * Integration Test: OAuth2 Authorization & Callback Flow
 * Extracted from auth.test.js lines 157-407
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

describe('OAuth2 Authorization & Callback Flow', () => {
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
        email: 'test@example.com',
        communityId: new mongoose.Types.ObjectId(),
        subscription: {
          tier: 'professional',
          status: 'active',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        }
      });

      // Simulate authenticated session
      const agent = request.agent(app);
      const loginResponse = await agent.post('/api/auth/login/mock').send({ userId: testUser._id.toString() });

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
    let authAgent;
    let mockState;

    beforeEach(async () => {
      // Create test user
      testUser = await User.create({
        discordId: 'test_discord_456',
        discordUsername: 'callback_tester',
        discordTag: 'callback_tester#1234',
        username: 'callback_tester',
        email: 'callback@example.com',
        communityId: new mongoose.Types.ObjectId()
      });

      // Generate authorization URL to get valid state
      // 🔥 CRITICAL: Use persistent agent to maintain session across requests
      authAgent = request.agent(app);
      await authAgent.post('/api/auth/login/mock').send({ userId: testUser._id.toString() });

      const authResponse = await authAgent.get('/api/v1/auth/broker/alpaca/authorize');
      const authURL = new URL(authResponse.body.authorizationURL);
      mockState = authURL.searchParams.get('state');

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
      // 🔥 CRITICAL: Use same agent to maintain session state
      // Use POST endpoint which returns JSON instead of redirect
      const response = await authAgent
        .post('/api/v1/auth/callback')
        .send({
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
      const response = await authAgent
        .post('/api/v1/auth/callback')
        .send({
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
      const response = await authAgent
        .post('/api/v1/auth/callback')
        .send({
          state: mockState
          // Missing code
        })
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toMatch(/authorization code|missing/i);
    });

    it('should handle token exchange errors gracefully', async () => {
      // Reset beforeEach success mock and set up failure mock
      axios.post.mockReset();
      axios.post.mockRejectedValueOnce(new Error('OAuth provider error: Invalid code'));

      const response = await authAgent
        .post('/api/v1/auth/callback')
        .send({
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

    it('should handle OAuth error parameter (user denied authorization) - lines 207-224', async () => {
      const response = await authAgent
        .get('/api/v1/auth/callback')
        .query({
          error: 'access_denied',
          error_description: 'User cancelled the authorization',
          state: mockState
        })
        .expect(302); // Redirect

      // Verify redirect to dashboard with error message
      expect(response.headers.location).toMatch(/\/dashboard\?oauth_error=/);
      expect(decodeURIComponent(response.headers.location)).toMatch(/Authorization cancelled/i);

      // Verify tokens NOT saved
      const user = await User.findById(testUser._id);
      expect(user.tradingConfig.oauthTokens.has('alpaca')).toBe(false);
    });

    it('should handle OAuth server_error parameter - lines 207-224', async () => {
      const response = await authAgent
        .get('/api/v1/auth/callback')
        .query({
          error: 'server_error',
          error_description: 'Broker server unavailable',
          state: mockState
        })
        .expect(302); // Redirect

      // Verify redirect with server error message
      expect(response.headers.location).toMatch(/\/dashboard\?oauth_error=/);
      expect(decodeURIComponent(response.headers.location)).toMatch(/Broker server error/i);
    });

    it('should handle OAuth invalid_request error - lines 207-224', async () => {
      const response = await authAgent
        .get('/api/v1/auth/callback')
        .query({
          error: 'invalid_request',
          state: mockState
        })
        .expect(302); // Redirect

      // Verify redirect with invalid request message
      expect(response.headers.location).toMatch(/\/dashboard\?oauth_error=/);
      expect(decodeURIComponent(response.headers.location)).toMatch(/Invalid request/i);
    });

    it('should handle OAuth custom error with error_description - lines 207-224', async () => {
      const response = await authAgent
        .get('/api/v1/auth/callback')
        .query({
          error: 'custom_error',
          error_description: 'Custom error from broker',
          state: mockState
        })
        .expect(302); // Redirect

      // Verify redirect includes custom error description
      expect(response.headers.location).toMatch(/\/dashboard\?oauth_error=/);
      expect(decodeURIComponent(response.headers.location)).toMatch(/Custom error from broker/i);
    });
  });
});
