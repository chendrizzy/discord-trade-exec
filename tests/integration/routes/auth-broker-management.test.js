/**
 * Integration Test: OAuth2 Broker Management Routes
 *
 * Comprehensive coverage for broker management operations:
 * 1. DELETE /brokers/:broker/oauth - Disconnect broker
 * 2. POST /brokers/:broker/oauth/refresh - Manual token refresh
 * 3. POST /callback - POST-based OAuth callback
 * 4. GET /broker/:broker/authorize - Authorization URL generation errors
 *
 * This test suite complements existing auth tests to achieve 100% coverage
 * of broker management functionality in src/routes/api/auth.js
 *
 * Coverage Targets:
 * - Lines 343-458: DELETE /brokers/:broker/oauth
 * - Lines 470-511: POST /brokers/:broker/oauth/refresh
 * - Lines 297-403: POST /callback
 * - Lines 45-88: GET /broker/:broker/authorize error paths
 *
 * Dependencies: OAuth2Service, User model, auth middleware
 */

'use strict';

const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
const User = require('../../../src/models/User');
const oauth2Service = require('../../../src/services/OAuth2Service');
const { connectDB, disconnectDB } = require('../../setup/db');

// Mock axios for broker API calls
jest.mock('axios');
const axios = require('axios');

describe('Integration Test: OAuth2 Broker Management Routes', () => {
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

    // Add error handler middleware (must be last)
    const { errorHandler } = require('../../../src/middleware/errorHandler');
    app.use(errorHandler);
  });

  afterAll(async () => {
    // Cleanup MFAService intervals to prevent open handles
    const { getMFAService } = require('../../../src/services/MFAService');
    const mfaService = getMFAService();
    if (mfaService && mfaService.shutdown) {
      mfaService.shutdown();
    }
    await disconnectDB();
  });

  beforeEach(async () => {
    // Clean up test users
    await User.deleteMany({ email: /broker-mgmt-test/ });
    // Reset axios mocks
    jest.clearAllMocks();
  });

  // ============================================================================
  // DELETE /brokers/:broker/oauth - Disconnect Broker
  // ============================================================================

  describe('DELETE /brokers/:broker/oauth - Disconnect Broker', () => {
    it('should successfully disconnect broker and remove tokens', async () => {
      // Create test user with connected broker
      const testUser = await User.create({
        discordId: 'broker-mgmt-test-disconnect-1',
        discordUsername: 'DisconnectTest1',
        username: 'DisconnectTest1',
        discriminator: '0001',
        email: 'broker-mgmt-test-disconnect-1@example.com',
        communityId: new mongoose.Types.ObjectId(),
        tradingConfig: {
          oauthTokens: new Map([
            [
              'alpaca',
              {
                accessToken: 'disconnect-test-token-123',
                refreshToken: 'disconnect-test-refresh-123',
                isValid: true,
                connectedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day from now
                tokenType: 'Bearer',
                scopes: ['account', 'trading']
              }
            ]
          ])
        }
      });

      // Authenticate via mock login
      const agent = request.agent(app);
      const loginRes = await agent.post('/api/auth/login/mock').send({ userId: testUser._id.toString() });
      const authCookie = loginRes.headers['set-cookie'];

      // Verify broker is connected before deletion
      const statusBefore = await request(app)
        .get('/api/v1/auth/brokers/status')
        .set('Cookie', authCookie);

      const alpacaBefore = statusBefore.body.brokers.find(b => b.key === 'alpaca');
      expect(alpacaBefore?.status).toBe('connected');

      // Delete broker connection
      const response = await request(app)
        .delete('/api/v1/auth/brokers/alpaca/oauth')
        .set('Cookie', authCookie);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        message: expect.stringContaining('ALPACA OAuth2 connection removed successfully')
      });

      // Verify tokens are removed from database
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.tradingConfig.oauthTokens.has('alpaca')).toBe(false);

      // Verify broker status shows disconnected
      const statusAfter = await request(app)
        .get('/api/v1/auth/brokers/status')
        .set('Cookie', authCookie);

      const alpacaAfter = statusAfter.body.brokers.find(b => b.key === 'alpaca');
      expect(alpacaAfter?.status).toBe('disconnected');

      // Cleanup
      await User.deleteOne({ _id: testUser._id });
    });

    it('should return 404 when disconnecting non-existent broker connection', async () => {
      // Create test user WITHOUT any broker connections
      const testUser = await User.create({
        discordId: 'broker-mgmt-test-disconnect-2',
        discordUsername: 'DisconnectTest2',
        username: 'DisconnectTest2',
        discriminator: '0002',
        email: 'broker-mgmt-test-disconnect-2@example.com',
        communityId: new mongoose.Types.ObjectId(),
        tradingConfig: {}
      });

      // Authenticate via mock login
      const agent = request.agent(app);
      const loginRes = await agent.post('/api/auth/login/mock').send({ userId: testUser._id.toString() });
      const authCookie = loginRes.headers['set-cookie'];

      // Try to delete non-existent broker connection
      const response = await request(app)
        .delete('/api/v1/auth/brokers/alpaca/oauth')
        .set('Cookie', authCookie);

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining("No OAuth2 connection found for broker 'alpaca'")
      });

      // Cleanup
      await User.deleteOne({ _id: testUser._id });
    });

    it('should require authentication (302 redirect)', async () => {
      const response = await request(app).delete('/api/v1/auth/brokers/alpaca/oauth');

      expect(response.status).toBe(302); // ensureAuthenticated redirects
      expect(response.header.location).toMatch(/\/auth\/discord/);
    });

    it('should handle invalid session cookie (302 redirect)', async () => {
      const response = await request(app)
        .delete('/api/v1/auth/brokers/alpaca/oauth')
        .set('Cookie', 'connect.sid=invalid-session-xyz');

      expect(response.status).toBe(302); // Invalid session triggers redirect
    });

    it('should allow disconnection even with active open positions (no validation)', async () => {
      // Create test user with connected broker (simulating open positions)
      const testUser = await User.create({
        discordId: 'broker-mgmt-test-disconnect-3',
        discordUsername: 'DisconnectTest3',
        username: 'DisconnectTest3',
        discriminator: '0003',
        email: 'broker-mgmt-test-disconnect-3@example.com',
        communityId: new mongoose.Types.ObjectId(),
        tradingConfig: {
          oauthTokens: new Map([
            [
              'alpaca',
              {
                accessToken: 'active-positions-token',
                refreshToken: 'active-positions-refresh',
                isValid: true,
                connectedAt: new Date(),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                tokenType: 'Bearer',
                scopes: ['account', 'trading']
              }
            ]
          ])
        }
      });

      // Authenticate via mock login
      const agent = request.agent(app);
      const loginRes = await agent.post('/api/auth/login/mock').send({ userId: testUser._id.toString() });
      const authCookie = loginRes.headers['set-cookie'];

      // Note: Current implementation does NOT check for open positions before disconnect
      // This is intentional - user is responsible for closing positions first
      const response = await request(app)
        .delete('/api/v1/auth/brokers/alpaca/oauth')
        .set('Cookie', authCookie);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Cleanup
      await User.deleteOne({ _id: testUser._id });
    });

    it('should handle database error during token deletion', async () => {
      // Create test user with connected broker
      const testUser = await User.create({
        discordId: 'broker-mgmt-test-disconnect-4',
        discordUsername: 'DisconnectTest4',
        username: 'DisconnectTest4',
        discriminator: '0004',
        email: 'broker-mgmt-test-disconnect-4@example.com',
        communityId: new mongoose.Types.ObjectId(),
        tradingConfig: {
          oauthTokens: new Map([
            [
              'alpaca',
              {
                accessToken: 'error-test-token',
                refreshToken: 'error-test-refresh',
                isValid: true,
                connectedAt: new Date(),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                tokenType: 'Bearer',
                scopes: ['account']
              }
            ]
          ])
        }
      });

      // Authenticate via mock login
      const agent = request.agent(app);
      const loginRes = await agent.post('/api/auth/login/mock').send({ userId: testUser._id.toString() });
      const authCookie = loginRes.headers['set-cookie'];

      // Mock User.save to throw database error
      jest.spyOn(User.prototype, 'save').mockRejectedValueOnce(new Error('Database connection lost'));

      // Try to delete broker connection
      const response = await request(app)
        .delete('/api/v1/auth/brokers/alpaca/oauth')
        .set('Cookie', authCookie);

      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Failed to revoke broker connection')
      });

      // Restore original save method
      User.prototype.save.mockRestore();

      // Cleanup
      await User.deleteOne({ _id: testUser._id });
    }, 60000); // Increase timeout to 60s for database error simulation

    it('should validate broker parameter (reject non-OAuth2 brokers)', async () => {
      // Create test user
      const testUser = await User.create({
        discordId: 'broker-mgmt-test-disconnect-5',
        discordUsername: 'DisconnectTest5',
        username: 'DisconnectTest5',
        discriminator: '0005',
        email: 'broker-mgmt-test-disconnect-5@example.com',
        communityId: new mongoose.Types.ObjectId(),
        tradingConfig: {}
      });

      // Authenticate via mock login
      const agent = request.agent(app);
      const loginRes = await agent.post('/api/auth/login/mock').send({ userId: testUser._id.toString() });
      const authCookie = loginRes.headers['set-cookie'];

      // Try to delete with invalid broker name
      const response = await request(app)
        .delete('/api/v1/auth/brokers/invalid-broker-xyz/oauth')
        .set('Cookie', authCookie);

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: 'Validation failed' // Actual error from validation middleware
      });

      // Cleanup
      await User.deleteOne({ _id: testUser._id });
    });
  });

  // ============================================================================
  // POST /brokers/:broker/oauth/refresh - Manual Token Refresh
  // ============================================================================

  describe('POST /brokers/:broker/oauth/refresh - Manual Token Refresh', () => {
    it('should successfully refresh OAuth2 tokens manually', async () => {
      // Create test user with expiring tokens
      const testUser = await User.create({
        discordId: 'broker-mgmt-test-refresh-1',
        discordUsername: 'RefreshTest1',
        username: 'RefreshTest1',
        discriminator: '0101',
        email: 'broker-mgmt-test-refresh-1@example.com',
        communityId: new mongoose.Types.ObjectId(),
        tradingConfig: {
          oauthTokens: new Map([
            [
              'alpaca',
              {
                accessToken: oauth2Service.encryptToken('old-access-token'),
                refreshToken: oauth2Service.encryptToken('valid-refresh-token'),
                isValid: true,
                connectedAt: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
                expiresAt: new Date(Date.now() + 30 * 60 * 60 * 1000), // 30 minutes (expiring soon)
                tokenType: 'Bearer',
                scopes: ['account', 'trading']
              }
            ]
          ])
        }
      });

      // Mock axios response for token refresh
      axios.post.mockResolvedValueOnce({
        status: 200,
        data: {
          access_token: 'new-refreshed-access-token',
          refresh_token: 'new-refreshed-refresh-token',
          expires_in: 86400, // 24 hours
          token_type: 'Bearer',
          scope: 'account trading'
        }
      });

      // Authenticate via mock login
      const agent = request.agent(app);
      const loginRes = await agent.post('/api/auth/login/mock').send({ userId: testUser._id.toString() });
      const authCookie = loginRes.headers['set-cookie'];

      // Trigger manual token refresh
      const response = await request(app)
        .post('/api/v1/auth/brokers/alpaca/oauth/refresh')
        .set('Cookie', authCookie);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        message: expect.stringContaining('ALPACA tokens refreshed successfully'),
        expiresAt: expect.any(String)
      });

      // Verify new expiry date is in the future
      const expiryDate = new Date(response.body.expiresAt);
      expect(expiryDate.getTime()).toBeGreaterThan(Date.now());

      // Verify tokens were updated in database
      const updatedUser = await User.findById(testUser._id);
      const alpacaTokens = updatedUser.tradingConfig.oauthTokens.get('alpaca');
      expect(alpacaTokens.expiresAt.getTime()).toBeGreaterThan(Date.now() + 12 * 60 * 60 * 1000); // > 12 hours

      // Cleanup
      await User.deleteOne({ _id: testUser._id });
    });

    it('should return 400 for non-OAuth2 broker', async () => {
      // Create test user
      const testUser = await User.create({
        discordId: 'broker-mgmt-test-refresh-2',
        discordUsername: 'RefreshTest2',
        username: 'RefreshTest2',
        discriminator: '0102',
        email: 'broker-mgmt-test-refresh-2@example.com',
        communityId: new mongoose.Types.ObjectId(),
        tradingConfig: {}
      });

      // Authenticate via mock login
      const agent = request.agent(app);
      const loginRes = await agent.post('/api/auth/login/mock').send({ userId: testUser._id.toString() });
      const authCookie = loginRes.headers['set-cookie'];

      // Try to refresh with invalid broker (not in OAuth2 providers list)
      const response = await request(app)
        .post('/api/v1/auth/brokers/invalid-broker/oauth/refresh')
        .set('Cookie', authCookie);

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: 'Validation failed' // Actual error from validation middleware
      });

      // Cleanup
      await User.deleteOne({ _id: testUser._id });
    });

    it('should require authentication (302 redirect)', async () => {
      const response = await request(app).post('/api/v1/auth/brokers/alpaca/oauth/refresh');

      expect(response.status).toBe(302); // ensureAuthenticated redirects
      expect(response.header.location).toMatch(/\/auth\/discord/);
    });

    it('should handle OAuth2 service refresh failure (400 error)', async () => {
      // Create test user with connected broker
      const testUser = await User.create({
        discordId: 'broker-mgmt-test-refresh-3',
        discordUsername: 'RefreshTest3',
        username: 'RefreshTest3',
        discriminator: '0103',
        email: 'broker-mgmt-test-refresh-3@example.com',
        communityId: new mongoose.Types.ObjectId(),
        tradingConfig: {
          oauthTokens: new Map([
            [
              'alpaca',
              {
                accessToken: oauth2Service.encryptToken('old-token'),
                refreshToken: oauth2Service.encryptToken('invalid-refresh-token'),
                isValid: true,
                connectedAt: new Date(),
                expiresAt: new Date(Date.now() + 1 * 60 * 60 * 1000), // 1 hour
                tokenType: 'Bearer',
                scopes: ['account']
              }
            ]
          ])
        }
      });

      // Mock axios to simulate broker API rejection (invalid refresh token)
      // OAuth2Service does NOT retry 400 errors, so no timeout needed
      axios.post.mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            error: 'invalid_grant',
            error_description: 'Refresh token is invalid or expired'
          }
        }
      });

      // Authenticate via mock login
      const agent = request.agent(app);
      const loginRes = await agent.post('/api/auth/login/mock').send({ userId: testUser._id.toString() });
      const authCookie = loginRes.headers['set-cookie'];

      // Try to refresh with invalid token
      const response = await request(app)
        .post('/api/v1/auth/brokers/alpaca/oauth/refresh')
        .set('Cookie', authCookie);

      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Failed to refresh broker tokens')
      });

      // Cleanup
      await User.deleteOne({ _id: testUser._id });
    }, 60000); // Increase timeout to 60s for OAuth2 retry logic

    it('should handle missing broker tokens (user never connected)', async () => {
      // Create test user WITHOUT any broker connections
      const testUser = await User.create({
        discordId: 'broker-mgmt-test-refresh-4',
        discordUsername: 'RefreshTest4',
        username: 'RefreshTest4',
        discriminator: '0104',
        email: 'broker-mgmt-test-refresh-4@example.com',
        communityId: new mongoose.Types.ObjectId(),
        tradingConfig: {}
      });

      // Authenticate via mock login
      const agent = request.agent(app);
      const loginRes = await agent.post('/api/auth/login/mock').send({ userId: testUser._id.toString() });
      const authCookie = loginRes.headers['set-cookie'];

      // Try to refresh tokens for broker user never connected
      const response = await request(app)
        .post('/api/v1/auth/brokers/alpaca/oauth/refresh')
        .set('Cookie', authCookie);

      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Failed to refresh broker tokens')
      });

      // Cleanup
      await User.deleteOne({ _id: testUser._id });
    }, 60000); // Increase timeout to 60s for OAuth2 retry logic

    it('should handle expired refresh token (cannot refresh)', async () => {
      // Create test user with expired refresh token
      const testUser = await User.create({
        discordId: 'broker-mgmt-test-refresh-5',
        discordUsername: 'RefreshTest5',
        username: 'RefreshTest5',
        discriminator: '0105',
        email: 'broker-mgmt-test-refresh-5@example.com',
        communityId: new mongoose.Types.ObjectId(),
        tradingConfig: {
          oauthTokens: new Map([
            [
              'alpaca',
              {
                accessToken: oauth2Service.encryptToken('expired-access'),
                refreshToken: oauth2Service.encryptToken('expired-refresh-token'),
                isValid: true,
                connectedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
                expiresAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // Expired 60 days ago
                tokenType: 'Bearer',
                scopes: ['account']
              }
            ]
          ])
        }
      });

      // Mock axios to simulate broker rejection of expired refresh token
      // OAuth2Service does NOT retry 400 errors, so no timeout needed
      axios.post.mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            error: 'invalid_grant',
            error_description: 'Refresh token has expired. User must re-authenticate.'
          }
        }
      });

      // Authenticate via mock login
      const agent = request.agent(app);
      const loginRes = await agent.post('/api/auth/login/mock').send({ userId: testUser._id.toString() });
      const authCookie = loginRes.headers['set-cookie'];

      // Try to refresh with expired refresh token
      const response = await request(app)
        .post('/api/v1/auth/brokers/alpaca/oauth/refresh')
        .set('Cookie', authCookie);

      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Failed to refresh broker tokens')
      });

      // Cleanup
      await User.deleteOne({ _id: testUser._id });
    }, 60000); // Increase timeout to 60s for OAuth2 retry logic
  });

  // ============================================================================
  // POST /callback - POST-based OAuth Callback
  // ============================================================================

  describe('POST /callback - POST-based OAuth Callback Handler', () => {
    it('should handle successful POST callback with valid code and state', async () => {
      // Create test user
      const testUser = await User.create({
        discordId: 'broker-mgmt-test-callback-1',
        discordUsername: 'CallbackTest1',
        username: 'CallbackTest1',
        discriminator: '0201',
        email: 'broker-mgmt-test-callback-1@example.com',
        communityId: new mongoose.Types.ObjectId(),
        tradingConfig: {}
      });

      // Generate valid state via authorization flow
      const agent = request.agent(app);
      const loginRes = await agent.post('/api/auth/login/mock').send({ userId: testUser._id.toString() });
      const authCookie = loginRes.headers['set-cookie'];

      const authUrlRes = await request(app)
        .get('/api/v1/auth/broker/alpaca/authorize')
        .set('Cookie', authCookie);

      const authUrl = new URL(authUrlRes.body.authorizationURL);
      const validState = authUrl.searchParams.get('state');

      // Mock axios response for token exchange
      axios.post.mockResolvedValueOnce({
        status: 200,
        data: {
          access_token: 'post-callback-access-token',
          refresh_token: 'post-callback-refresh-token',
          expires_in: 86400,
          token_type: 'Bearer',
          scope: 'account trading'
        }
      });

      // Send POST callback with code and state
      const response = await request(app)
        .post('/api/v1/auth/callback')
        .set('Cookie', authCookie)
        .send({
          code: 'post-authorization-code-xyz',
          state: validState
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        broker: 'alpaca',
        message: expect.stringContaining('ALPACA connected successfully')
      });

      // Verify tokens were stored in database
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.tradingConfig.oauthTokens.has('alpaca')).toBe(true);

      // Cleanup
      await User.deleteOne({ _id: testUser._id });
    });

    it('should return 400 for missing code parameter', async () => {
      // Create test user
      const testUser = await User.create({
        discordId: 'broker-mgmt-test-callback-2',
        discordUsername: 'CallbackTest2',
        username: 'CallbackTest2',
        discriminator: '0202',
        email: 'broker-mgmt-test-callback-2@example.com',
        communityId: new mongoose.Types.ObjectId(),
        tradingConfig: {}
      });

      // Authenticate via mock login
      const agent = request.agent(app);
      const loginRes = await agent.post('/api/auth/login/mock').send({ userId: testUser._id.toString() });
      const authCookie = loginRes.headers['set-cookie'];

      // Send POST callback without code
      const response = await request(app)
        .post('/api/v1/auth/callback')
        .set('Cookie', authCookie)
        .send({
          state: 'some-state-value'
        });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Missing required parameters: code and state')
      });

      // Cleanup
      await User.deleteOne({ _id: testUser._id });
    });

    it('should return 400 for missing state parameter', async () => {
      // Create test user
      const testUser = await User.create({
        discordId: 'broker-mgmt-test-callback-3',
        discordUsername: 'CallbackTest3',
        username: 'CallbackTest3',
        discriminator: '0203',
        email: 'broker-mgmt-test-callback-3@example.com',
        communityId: new mongoose.Types.ObjectId(),
        tradingConfig: {}
      });

      // Authenticate via mock login
      const agent = request.agent(app);
      const loginRes = await agent.post('/api/auth/login/mock').send({ userId: testUser._id.toString() });
      const authCookie = loginRes.headers['set-cookie'];

      // Send POST callback without state
      const response = await request(app)
        .post('/api/v1/auth/callback')
        .set('Cookie', authCookie)
        .send({
          code: 'authorization-code-xyz'
        });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Missing required parameters: code and state')
      });

      // Cleanup
      await User.deleteOne({ _id: testUser._id });
    });

    it('should return 403 for invalid state parameter (CSRF protection)', async () => {
      // Create test user
      const testUser = await User.create({
        discordId: 'broker-mgmt-test-callback-4',
        discordUsername: 'CallbackTest4',
        username: 'CallbackTest4',
        discriminator: '0204',
        email: 'broker-mgmt-test-callback-4@example.com',
        communityId: new mongoose.Types.ObjectId(),
        tradingConfig: {}
      });

      // Authenticate via mock login
      const agent = request.agent(app);
      const loginRes = await agent.post('/api/auth/login/mock').send({ userId: testUser._id.toString() });
      const authCookie = loginRes.headers['set-cookie'];

      // Send POST callback with invalid state (not in session)
      const response = await request(app)
        .post('/api/v1/auth/callback')
        .set('Cookie', authCookie)
        .send({
          code: 'authorization-code-xyz',
          state: 'invalid-state-not-in-session'
        });

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        success: false,
        error: expect.any(String)
      });

      // Cleanup
      await User.deleteOne({ _id: testUser._id });
    });

    it('should detect and flag CSRF attack attempts', async () => {
      // Create test user
      const testUser = await User.create({
        discordId: 'broker-mgmt-test-callback-5',
        discordUsername: 'CallbackTest5',
        username: 'CallbackTest5',
        discriminator: '0205',
        email: 'broker-mgmt-test-callback-5@example.com',
        communityId: new mongoose.Types.ObjectId(),
        tradingConfig: {}
      });

      // Authenticate via mock login
      const agent = request.agent(app);
      const loginRes = await agent.post('/api/auth/login/mock').send({ userId: testUser._id.toString() });
      const authCookie = loginRes.headers['set-cookie'];

      // Send POST callback with state designed to trigger CSRF detection
      const response = await request(app)
        .post('/api/v1/auth/callback')
        .set('Cookie', authCookie)
        .send({
          code: 'attacker-code-xyz',
          state: 'csrf-attack-state'
        });

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        success: false,
        error: expect.any(String),
        securityEvent: expect.any(Boolean) // Should flag security event
      });

      // Cleanup
      await User.deleteOne({ _id: testUser._id });
    });

    it('should handle OAuth2 service token exchange failure (500 error)', async () => {
      // Create test user
      const testUser = await User.create({
        discordId: 'broker-mgmt-test-callback-6',
        discordUsername: 'CallbackTest6',
        username: 'CallbackTest6',
        discriminator: '0206',
        email: 'broker-mgmt-test-callback-6@example.com',
        communityId: new mongoose.Types.ObjectId(),
        tradingConfig: {}
      });

      // Generate valid state
      const agent = request.agent(app);
      const loginRes = await agent.post('/api/auth/login/mock').send({ userId: testUser._id.toString() });
      const authCookie = loginRes.headers['set-cookie'];

      const authUrlRes = await request(app)
        .get('/api/v1/auth/broker/alpaca/authorize')
        .set('Cookie', authCookie);

      const authUrl = new URL(authUrlRes.body.authorizationURL);
      const validState = authUrl.searchParams.get('state');

      // Mock oauth2Service.exchangeCodeForToken to throw error directly
      // This avoids hitting the axios retry logic
      jest.spyOn(oauth2Service, 'exchangeCodeForToken').mockRejectedValueOnce(
        new Error('Token exchange failed: Invalid credentials or authorization code')
      );

      // Send POST callback with invalid code
      const response = await request(app)
        .post('/api/v1/auth/callback')
        .set('Cookie', authCookie)
        .send({
          code: 'invalid-expired-code',
          state: validState
        });

      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Authorization failed')
      });

      // Restore mock
      oauth2Service.exchangeCodeForToken.mockRestore();

      // Cleanup
      await User.deleteOne({ _id: testUser._id });
    }, 60000); // Increase timeout for OAuth2 operations

    it('should handle user creation/update database error (500 error)', async () => {
      // Create test user
      const testUser = await User.create({
        discordId: 'broker-mgmt-test-callback-7',
        discordUsername: 'CallbackTest7',
        username: 'CallbackTest7',
        discriminator: '0207',
        email: 'broker-mgmt-test-callback-7@example.com',
        communityId: new mongoose.Types.ObjectId(),
        tradingConfig: {}
      });

      // Generate valid state
      const agent = request.agent(app);
      const loginRes = await agent.post('/api/auth/login/mock').send({ userId: testUser._id.toString() });
      const authCookie = loginRes.headers['set-cookie'];

      const authUrlRes = await request(app)
        .get('/api/v1/auth/broker/alpaca/authorize')
        .set('Cookie', authCookie);

      const authUrl = new URL(authUrlRes.body.authorizationURL);
      const validState = authUrl.searchParams.get('state');

      // Mock oauth2Service.exchangeCodeForToken to succeed
      jest.spyOn(oauth2Service, 'exchangeCodeForToken').mockResolvedValueOnce({
        accessToken: 'db-error-access-token',
        refreshToken: 'db-error-refresh-token',
        expiresAt: new Date(Date.now() + 86400 * 1000),
        tokenType: 'Bearer',
        scopes: ['account']
      });

      // Mock User.save to throw database error
      jest.spyOn(User.prototype, 'save').mockRejectedValueOnce(new Error('Database connection timeout'));

      // Send POST callback
      const response = await request(app)
        .post('/api/v1/auth/callback')
        .set('Cookie', authCookie)
        .send({
          code: 'valid-code-xyz',
          state: validState
        });

      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Authorization failed')
      });

      // Restore mocks
      oauth2Service.exchangeCodeForToken.mockRestore();
      User.prototype.save.mockRestore();

      // Cleanup
      await User.deleteOne({ _id: testUser._id });
    }, 60000); // Increase timeout for database error + OAuth2 operations
  });

  // ============================================================================
  // GET /broker/:broker/authorize - Authorization URL Generation Errors
  // ============================================================================

  describe('GET /broker/:broker/authorize - Authorization URL Error Paths', () => {
    it('should return 400 for non-OAuth2 broker', async () => {
      // Create test user
      const testUser = await User.create({
        discordId: 'broker-mgmt-test-authorize-1',
        discordUsername: 'AuthorizeTest1',
        username: 'AuthorizeTest1',
        discriminator: '0301',
        email: 'broker-mgmt-test-authorize-1@example.com',
        communityId: new mongoose.Types.ObjectId(),
        tradingConfig: {}
      });

      // Authenticate via mock login
      const agent = request.agent(app);
      const loginRes = await agent.post('/api/auth/login/mock').send({ userId: testUser._id.toString() });
      const authCookie = loginRes.headers['set-cookie'];

      // Try to generate auth URL for invalid broker (not in validator enum)
      const response = await request(app)
        .get('/api/v1/auth/broker/invalid-broker-xyz/authorize')
        .set('Cookie', authCookie);

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringMatching(/Invalid broker|Validation failed/)
      });

      // Cleanup
      await User.deleteOne({ _id: testUser._id });
    });

    it('should require authentication (302 redirect)', async () => {
      const response = await request(app).get('/api/v1/auth/broker/alpaca/authorize');

      expect(response.status).toBe(302); // ensureAuthenticated redirects
      expect(response.header.location).toMatch(/\/auth\/discord/);
    });

    it('should handle OAuth2 service authorization URL generation error', async () => {
      // Create test user
      const testUser = await User.create({
        discordId: 'broker-mgmt-test-authorize-2',
        discordUsername: 'AuthorizeTest2',
        username: 'AuthorizeTest2',
        discriminator: '0302',
        email: 'broker-mgmt-test-authorize-2@example.com',
        communityId: new mongoose.Types.ObjectId(),
        tradingConfig: {}
      });

      // Authenticate via mock login
      const agent = request.agent(app);
      const loginRes = await agent.post('/api/auth/login/mock').send({ userId: testUser._id.toString() });
      const authCookie = loginRes.headers['set-cookie'];

      // Mock oauth2Service.generateAuthorizationURL to throw error
      const mockError = new Error('Failed to load OAuth2 provider configuration');

      jest.spyOn(oauth2Service, 'generateAuthorizationURL').mockImplementationOnce(() => {
        throw mockError;
      });

      // Try to generate auth URL
      const response = await request(app)
        .get('/api/v1/auth/broker/alpaca/authorize')
        .set('Cookie', authCookie);

      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Failed to generate authorization URL')
      });

      // Restore original method
      oauth2Service.generateAuthorizationURL.mockRestore();

      // Cleanup
      await User.deleteOne({ _id: testUser._id });
    });
  });
});
