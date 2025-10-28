// External dependencies
const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');

// Internal dependencies
const User = require('../../../src/models/User');
const { connectDB, disconnectDB } = require('../../setup/db');

/**
 * OAuth2 Broker Status Tests (US3-T13)
 *
 * Tests coverage for src/routes/api/auth.js lines 98-188
 * Endpoint: GET /api/v1/auth/brokers/status
 *
 * Coverage Targets:
 * - Lines 132-143: Token status determination logic
 * - Lines 147-167: Broker response formatting
 * - Lines 168-175: Response filtering and JSON formatting
 *
 * Status States Tested:
 * 1. disconnected - No OAuth tokens stored
 * 2. revoked - isValid === false
 * 3. expired - expiresAt in the past
 * 4. expiring - expiresAt within 1 hour
 * 5. connected - Valid tokens with > 1 hour until expiry
 */

describe('OAuth2 Broker Status Tests (US3-T13)', () => {
  let app;

  beforeAll(async () => {
    await connectDB();

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
  });

  afterAll(async () => {
    await disconnectDB();
  });

  beforeEach(async () => {
    // Clean up test users
    await User.deleteMany({ email: /broker-status-test/ });
  });

  describe('Token Status Determination', () => {
    it('should return "disconnected" status for user with no OAuth tokens', async () => {
      // Create test user with no OAuth tokens
      const testUser = await User.create({
        discordId: 'broker-status-test-disconnected',
        discordUsername: 'DisconnectedTest',
        username: 'DisconnectedTest',
        discriminator: '0001',
        email: 'broker-status-test-disconnected@example.com',
        tradingConfig: {}
      });

      // Authenticate via mock login
      const agent = request.agent(app);
      const loginRes = await agent.post('/api/auth/login/mock').send({ userId: testUser._id.toString() });
      const authCookie = loginRes.headers['set-cookie'];

      // Get broker status
      const response = await request(app)
        .get('/api/v1/auth/brokers/status')
        .set('Cookie', authCookie);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('brokers');
      expect(Array.isArray(response.body.brokers)).toBe(true);

      // All brokers should have "disconnected" status
      response.body.brokers.forEach(broker => {
        expect(broker).toHaveProperty('status', 'disconnected');
        expect(broker).toHaveProperty('isValid', true); // Disconnected = not explicitly invalid
        expect(broker).toHaveProperty('connectedAt', null);
        expect(broker).toHaveProperty('expiresAt', null);
        expect(broker).toHaveProperty('expiresInSeconds', null);
      });

      // Cleanup
      await User.deleteOne({ _id: testUser._id });
    });

    it('should return "revoked" status for tokens with isValid=false', async () => {
      // Create test user with revoked token
      const testUser = await User.create({
        discordId: 'broker-status-test-revoked',
        discordUsername: 'RevokedTest',
        username: 'RevokedTest',
        discriminator: '0002',
        email: 'broker-status-test-revoked@example.com',
        tradingConfig: {
          oauthTokens: new Map([
            ['alpaca', {
              accessToken: 'revoked-token-123',
              refreshToken: 'revoked-refresh-123',
              isValid: false, // Explicitly revoked
              connectedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day from now
              tokenType: 'Bearer',
              scopes: ['account', 'trading']
            }]
          ])
        }
      });

      // Authenticate via mock login
      const agent = request.agent(app);
      const loginRes = await agent.post('/api/auth/login/mock').send({ userId: testUser._id.toString() });
      const authCookie = loginRes.headers['set-cookie'];

      // Get broker status
      const response = await request(app)
        .get('/api/v1/auth/brokers/status')
        .set('Cookie', authCookie);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Find Alpaca broker in response
      const alpacaBroker = response.body.brokers.find(b => b.key === 'alpaca');
      expect(alpacaBroker).toBeDefined();
      expect(alpacaBroker.status).toBe('revoked');
      expect(alpacaBroker.isValid).toBe(false);
      expect(alpacaBroker.connectedAt).toBeTruthy();
      expect(alpacaBroker.expiresAt).toBeTruthy();

      // Cleanup
      await User.deleteOne({ _id: testUser._id });
    });

    it('should return "expired" status for tokens with past expiresAt', async () => {
      // Create test user with expired token
      const testUser = await User.create({
        discordId: 'broker-status-test-expired',
        discordUsername: 'ExpiredTest',
        username: 'ExpiredTest',
        discriminator: '0003',
        email: 'broker-status-test-expired@example.com',
        tradingConfig: {
          oauthTokens: new Map([
            ['alpaca', {
              accessToken: 'expired-token-456',
              refreshToken: 'expired-refresh-456',
              isValid: true,
              connectedAt: new Date(Date.now() - 48 * 60 * 60 * 1000), // 2 days ago
              expiresAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago (EXPIRED)
              tokenType: 'Bearer',
              scopes: ['trading']
            }]
          ])
        }
      });

      // Authenticate via mock login
      const agent = request.agent(app);
      const loginRes = await agent.post('/api/auth/login/mock').send({ userId: testUser._id.toString() });
      const authCookie = loginRes.headers['set-cookie'];

      // Get broker status
      const response = await request(app)
        .get('/api/v1/auth/brokers/status')
        .set('Cookie', authCookie);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Find Alpaca broker in response
      const alpacaBroker = response.body.brokers.find(b => b.key === 'alpaca');
      expect(alpacaBroker).toBeDefined();
      expect(alpacaBroker.status).toBe('expired');
      expect(alpacaBroker.isValid).toBe(true); // isValid is true, but token is expired
      expect(alpacaBroker.expiresAt).toBeTruthy();
      expect(alpacaBroker.expiresInSeconds).toBe(0); // Past expiry = 0 seconds

      // Cleanup
      await User.deleteOne({ _id: testUser._id });
    });

    it('should return "expiring" status for tokens expiring within 1 hour', async () => {
      // Create test user with token expiring in 30 minutes
      const testUser = await User.create({
        discordId: 'broker-status-test-expiring',
        discordUsername: 'ExpiringTest',
        username: 'ExpiringTest',
        discriminator: '0004',
        email: 'broker-status-test-expiring@example.com',
        tradingConfig: {
          oauthTokens: new Map([
            ['alpaca', {
              accessToken: 'expiring-token-789',
              refreshToken: 'expiring-refresh-789',
              isValid: true,
              connectedAt: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
              expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes from now (EXPIRING)
              tokenType: 'Bearer',
              scopes: ['account', 'trading']
            }]
          ])
        }
      });

      // Authenticate via mock login
      const agent = request.agent(app);
      const loginRes = await agent.post('/api/auth/login/mock').send({ userId: testUser._id.toString() });
      const authCookie = loginRes.headers['set-cookie'];

      // Get broker status
      const response = await request(app)
        .get('/api/v1/auth/brokers/status')
        .set('Cookie', authCookie);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Find Alpaca broker in response
      const alpacaBroker = response.body.brokers.find(b => b.key === 'alpaca');
      expect(alpacaBroker).toBeDefined();
      expect(alpacaBroker.status).toBe('expiring');
      expect(alpacaBroker.isValid).toBe(true);
      expect(alpacaBroker.expiresAt).toBeTruthy();
      expect(alpacaBroker.expiresInSeconds).toBeGreaterThan(0);
      expect(alpacaBroker.expiresInSeconds).toBeLessThanOrEqual(60 * 60); // <= 1 hour

      // Cleanup
      await User.deleteOne({ _id: testUser._id });
    });

    it('should return "connected" status for valid tokens expiring >1 hour from now', async () => {
      // Create test user with healthy token expiring in 24 hours
      const testUser = await User.create({
        discordId: 'broker-status-test-connected',
        discordUsername: 'ConnectedTest',
        username: 'ConnectedTest',
        discriminator: '0005',
        email: 'broker-status-test-connected@example.com',
        tradingConfig: {
          oauthTokens: new Map([
            ['alpaca', {
              accessToken: 'healthy-token-abc',
              refreshToken: 'healthy-refresh-abc',
              isValid: true,
              connectedAt: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now (CONNECTED)
              tokenType: 'Bearer',
              scopes: ['account', 'trading', 'positions']
            }]
          ])
        }
      });

      // Authenticate via mock login
      const agent = request.agent(app);
      const loginRes = await agent.post('/api/auth/login/mock').send({ userId: testUser._id.toString() });
      const authCookie = loginRes.headers['set-cookie'];

      // Get broker status
      const response = await request(app)
        .get('/api/v1/auth/brokers/status')
        .set('Cookie', authCookie);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Find Alpaca broker in response
      const alpacaBroker = response.body.brokers.find(b => b.key === 'alpaca');
      expect(alpacaBroker).toBeDefined();
      expect(alpacaBroker.status).toBe('connected');
      expect(alpacaBroker.isValid).toBe(true);
      expect(alpacaBroker.connectedAt).toBeTruthy();
      expect(alpacaBroker.expiresAt).toBeTruthy();
      expect(alpacaBroker.expiresInSeconds).toBeGreaterThan(60 * 60); // > 1 hour

      // Cleanup
      await User.deleteOne({ _id: testUser._id });
    });
  });

  describe('Response Formatting', () => {
    let testUser;
    let authCookie;

    beforeEach(async () => {
      // Create test user with comprehensive token data for formatting tests
      testUser = await User.create({
        discordId: 'broker-status-test-format',
        discordUsername: 'FormatTest',
        username: 'FormatTest',
        discriminator: '0006',
        email: 'broker-status-test-format@example.com',
        tradingConfig: {
          oauthTokens: new Map([
            ['alpaca', {
              accessToken: 'format-test-token',
              refreshToken: 'format-test-refresh',
              isValid: true,
              connectedAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
              expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
              tokenType: 'Bearer',
              scopes: ['account', 'trading'],
              lastRefreshAttempt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
              lastRefreshError: null
            }]
          ])
        }
      });

      // Authenticate via mock login
      const agent = request.agent(app);
      const loginRes = await agent.post('/api/auth/login/mock').send({ userId: testUser._id.toString() });
      authCookie = loginRes.headers['set-cookie'];
    });

    afterEach(async () => {
      await User.deleteOne({ _id: testUser._id });
    });

    it('should include all required broker metadata fields', async () => {
      const response = await request(app)
        .get('/api/v1/auth/brokers/status')
        .set('Cookie', authCookie);

      expect(response.status).toBe(200);

      // Find Alpaca broker
      const alpacaBroker = response.body.brokers.find(b => b.key === 'alpaca');
      expect(alpacaBroker).toBeDefined();

      // Verify all required fields are present
      expect(alpacaBroker).toHaveProperty('key');
      expect(alpacaBroker).toHaveProperty('name');
      expect(alpacaBroker).toHaveProperty('type');
      expect(alpacaBroker).toHaveProperty('authMethods');
      expect(alpacaBroker).toHaveProperty('websiteUrl');
      expect(alpacaBroker).toHaveProperty('docsUrl');
      expect(alpacaBroker).toHaveProperty('features');
      expect(alpacaBroker).toHaveProperty('status');
      expect(alpacaBroker).toHaveProperty('isValid');
      expect(alpacaBroker).toHaveProperty('connectedAt');
      expect(alpacaBroker).toHaveProperty('expiresAt');
      expect(alpacaBroker).toHaveProperty('expiresInSeconds');
      expect(alpacaBroker).toHaveProperty('tokenType');
      expect(alpacaBroker).toHaveProperty('scopes');
      expect(alpacaBroker).toHaveProperty('lastRefreshAttempt');
      expect(alpacaBroker).toHaveProperty('lastRefreshError');
      expect(alpacaBroker).toHaveProperty('supportsManualRefresh');
      expect(alpacaBroker).toHaveProperty('supportsRefreshTokenRotation');
      expect(alpacaBroker).toHaveProperty('tokenExpiryMs');
    });

    it('should format dates as ISO strings', async () => {
      const response = await request(app)
        .get('/api/v1/auth/brokers/status')
        .set('Cookie', authCookie);

      const alpacaBroker = response.body.brokers.find(b => b.key === 'alpaca');
      expect(alpacaBroker).toBeDefined();

      // Check ISO string format
      if (alpacaBroker.connectedAt) {
        expect(alpacaBroker.connectedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      }
      if (alpacaBroker.expiresAt) {
        expect(alpacaBroker.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      }
      if (alpacaBroker.lastRefreshAttempt) {
        expect(alpacaBroker.lastRefreshAttempt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      }
    });

    it('should calculate expiresInSeconds correctly', async () => {
      const response = await request(app)
        .get('/api/v1/auth/brokers/status')
        .set('Cookie', authCookie);

      const alpacaBroker = response.body.brokers.find(b => b.key === 'alpaca');
      expect(alpacaBroker).toBeDefined();

      // Should be approximately 12 hours (43200 seconds) from setup
      expect(alpacaBroker.expiresInSeconds).toBeGreaterThan(43000);
      expect(alpacaBroker.expiresInSeconds).toBeLessThan(43300);
    });

    it('should filter out null/undefined brokers', async () => {
      const response = await request(app)
        .get('/api/v1/auth/brokers/status')
        .set('Cookie', authCookie);

      expect(response.status).toBe(200);
      expect(response.body.brokers).toBeDefined();
      expect(Array.isArray(response.body.brokers)).toBe(true);

      // All brokers should be defined objects
      response.body.brokers.forEach(broker => {
        expect(broker).toBeDefined();
        expect(typeof broker).toBe('object');
        expect(broker).not.toBeNull();
      });
    });
  });

  describe('Authentication and Error Handling', () => {
    it('should require authentication (302 redirect without cookie)', async () => {
      const response = await request(app)
        .get('/api/v1/auth/brokers/status');

      expect(response.status).toBe(302); // ensureAuthenticated redirects to /auth/discord
    });

    it('should handle invalid session cookie (302 redirect)', async () => {
      const response = await request(app)
        .get('/api/v1/auth/brokers/status')
        .set('Cookie', 'connect.sid=invalid-session-xyz');

      expect(response.status).toBe(302); // Invalid session triggers redirect
    });

    it('should handle user not found (302 redirect for orphaned session)', async () => {
      // Create user, get session, then delete user
      const tempUser = await User.create({
        discordId: 'broker-status-test-temp',
        discordUsername: 'TempTest',
        username: 'TempTest',
        discriminator: '0007',
        email: 'broker-status-test-temp@example.com'
      });

      // Authenticate via mock login
      const agent = request.agent(app);
      const loginRes = await agent.post('/api/auth/login/mock').send({ userId: tempUser._id.toString() });
      const authCookie = loginRes.headers['set-cookie'];

      // Delete user while session is still valid
      await User.deleteOne({ _id: tempUser._id });

      // Try to access endpoint with orphaned session
      const response = await request(app)
        .get('/api/v1/auth/brokers/status')
        .set('Cookie', authCookie);

      expect(response.status).toBe(302); // Deserialization fails, triggers redirect
    });
  });

  describe('Multiple Broker Status Scenarios', () => {
    it('should handle multiple brokers with different statuses', async () => {
      // Create test user with multiple brokers in different states
      const testUser = await User.create({
        discordId: 'broker-status-test-multi',
        discordUsername: 'MultiTest',
        username: 'MultiTest',
        discriminator: '0008',
        email: 'broker-status-test-multi@example.com',
        tradingConfig: {
          oauthTokens: new Map([
            ['alpaca', {
              accessToken: 'alpaca-connected',
              refreshToken: 'alpaca-refresh',
              isValid: true,
              connectedAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h = connected
              tokenType: 'Bearer',
              scopes: ['account']
            }],
            ['webull', {
              accessToken: 'webull-expiring',
              refreshToken: 'webull-refresh',
              isValid: true,
              connectedAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
              expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30min = expiring
              tokenType: 'Bearer',
              scopes: ['trading']
            }]
          ])
        }
      });

      // Authenticate via mock login
      const agent = request.agent(app);
      const loginRes = await agent.post('/api/auth/login/mock').send({ userId: testUser._id.toString() });
      const authCookie = loginRes.headers['set-cookie'];

      // Get broker status
      const response = await request(app)
        .get('/api/v1/auth/brokers/status')
        .set('Cookie', authCookie);

      expect(response.status).toBe(200);

      const alpacaBroker = response.body.brokers.find(b => b.key === 'alpaca');
      const webullBroker = response.body.brokers.find(b => b.key === 'webull');

      // Verify different statuses
      if (alpacaBroker) {
        expect(alpacaBroker.status).toBe('connected');
      }

      if (webullBroker) {
        expect(webullBroker.status).toBe('expiring');
      }

      // Cleanup
      await User.deleteOne({ _id: testUser._id });
    });

    it('should handle edge case: token expiring at exactly 1 hour boundary', async () => {
      // Create test user with token expiring exactly at 1 hour from now
      const testUser = await User.create({
        discordId: 'broker-status-test-boundary',
        discordUsername: 'BoundaryTest',
        username: 'BoundaryTest',
        discriminator: '0009',
        email: 'broker-status-test-boundary@example.com',
        tradingConfig: {
          oauthTokens: new Map([
            ['alpaca', {
              accessToken: 'boundary-token',
              refreshToken: 'boundary-refresh',
              isValid: true,
              connectedAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
              expiresAt: new Date(Date.now() + 60 * 60 * 1000), // Exactly 1 hour
              tokenType: 'Bearer',
              scopes: ['account']
            }]
          ])
        }
      });

      // Authenticate via mock login
      const agent = request.agent(app);
      const loginRes = await agent.post('/api/auth/login/mock').send({ userId: testUser._id.toString() });
      const authCookie = loginRes.headers['set-cookie'];

      // Get broker status
      const response = await request(app)
        .get('/api/v1/auth/brokers/status')
        .set('Cookie', authCookie);

      expect(response.status).toBe(200);

      const alpacaBroker = response.body.brokers.find(b => b.key === 'alpaca');
      expect(alpacaBroker).toBeDefined();

      // At exactly 1 hour (3600000ms), should be "expiring" (condition: <= 1 hour)
      expect(alpacaBroker.status).toBe('expiring');
      expect(alpacaBroker.expiresInSeconds).toBeLessThanOrEqual(3601);
      expect(alpacaBroker.expiresInSeconds).toBeGreaterThan(3598);

      // Cleanup
      await User.deleteOne({ _id: testUser._id });
    });
  });
});
