/**
 * Integration Test: Broker Status Queries
 * Extracted from auth.test.js lines 799-1111
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

describe('Broker Status & Management', () => {
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

    // Trigger garbage collection to immediately reclaim freed memory
    if (global.gc) {
      global.gc();
    }
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
                expiresAt: new Date(Date.now() + 2 * 3600 * 1000), // 2 hours - well beyond 1hr expiring threshold
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

    it('should handle broker revocation failure (database error) - lines 444-457', async () => {
      // Mock User.save() to throw error
      const originalSave = User.prototype.save;
      User.prototype.save = jest.fn().mockRejectedValueOnce(new Error('Database connection lost'));

      const response = await request(app)
        .delete('/api/v1/auth/brokers/alpaca/oauth')
        .set('Cookie', authCookie)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/Failed to revoke broker connection/i);
      expect(response.body.errorCode).toBe('BROKER_ERROR');

      // Restore original save method
      User.prototype.save = originalSave;
    });

    it('should manually refresh OAuth2 token successfully - lines 470-489', async () => {
      // Mock successful token refresh
      const refreshSpy = jest.spyOn(oauth2Service, 'refreshAccessToken').mockResolvedValueOnce({
        accessToken: 'new_access_token',
        refreshToken: 'new_refresh_token',
        expiresAt: new Date(Date.now() + 7200 * 1000),
        tokenType: 'Bearer'
      });

      const response = await request(app)
        .post('/api/v1/auth/brokers/alpaca/oauth/refresh')
        .set('Cookie', authCookie)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.expiresAt).toBeDefined();
      expect(refreshSpy).toHaveBeenCalledWith('alpaca', testUser._id.toString());

      refreshSpy.mockRestore();
    });

    it('should reject manual refresh for non-OAuth2 broker - lines 476-481', async () => {
      const response = await request(app)
        .post('/api/v1/auth/brokers/tradier/oauth/refresh')
        .set('Cookie', authCookie)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/does not support OAuth2/i);
    });

    it('should handle manual refresh with expired refresh token - lines 484', async () => {
      // Mock refresh failure (expired refresh token)
      const refreshSpy = jest.spyOn(oauth2Service, 'refreshAccessToken').mockRejectedValueOnce(
        new Error('Refresh token expired or invalid')
      );

      const response = await request(app)
        .post('/api/v1/auth/brokers/alpaca/oauth/refresh')
        .set('Cookie', authCookie)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();

      refreshSpy.mockRestore();
    });

    it('should reject manual refresh without authentication - lines 470', async () => {
      const response = await request(app)
        .post('/api/v1/auth/brokers/alpaca/oauth/refresh')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });
});
