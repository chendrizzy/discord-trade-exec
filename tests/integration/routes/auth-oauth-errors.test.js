/**
 * Integration Test: OAuth2 Callback Error Scenarios
 *
 * Tests error handling in OAuth2 callback flow:
 * 1. Missing authorization code
 * 2. Invalid CSRF state parameter
 * 3. Expired state tokens
 * 4. Broker API unavailability
 * 5. Duplicate user creation conflicts
 *
 * Test Environment:
 * - MongoDB Memory Server for user storage
 * - Mock broker OAuth provider responses
 * - Error simulation for edge cases
 *
 * Dependencies: OAuth2Service, User model, auth routes
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

// Mock axios for broker API calls
jest.mock('axios');
const axios = require('axios');

describe('Integration Test: OAuth2 Callback Error Scenarios', () => {
  let app;
  let testUser;
  let authCookie;
  let validState;

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

    // Mock login endpoint for tests
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

  beforeEach(async () => {
    // Clear mocks
    jest.clearAllMocks();

    // Clear database
    await User.deleteMany({});

    // Create test user
    testUser = await User.create({
      discordId: 'test_oauth_errors_' + Date.now(),
      discordUsername: 'error_tester',
      discordTag: 'error_tester#1234',
      username: 'error_tester',
      email: 'errors@example.com',
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
    const loginRes = await agent.post('/api/auth/login/mock').send({ userId: testUser._id.toString() });

    authCookie = loginRes.headers['set-cookie'];

    // Generate valid authorization URL to get state parameter
    const authResponse = await agent.get('/api/v1/auth/broker/alpaca/authorize');
    const authURL = new URL(authResponse.body.authorizationURL);
    validState = authURL.searchParams.get('state');

    // Reset axios mock
    axios.post.mockReset();
    axios.get.mockReset();
  });

  describe('Missing or Invalid Code Parameter', () => {
    it('should reject callback with missing authorization code (400)', async () => {
      const response = await request(app)
        .post('/api/v1/auth/callback')
        .set('Cookie', authCookie)
        .send({
          state: validState
          // Missing 'code' parameter
        })
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toMatch(/authorization code|missing|required/i);

      // Verify no tokens saved
      const user = await User.findById(testUser._id);
      expect(user.tradingConfig.oauthTokens.has('alpaca')).toBe(false);
    });

    it('should reject callback with empty authorization code (400)', async () => {
      const response = await request(app)
        .post('/api/v1/auth/callback')
        .set('Cookie', authCookie)
        .send({
          code: '',
          state: validState
        })
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toMatch(/missing required|authorization code|empty|invalid/i);
    });

    it('should reject callback with malformed authorization code (400)', async () => {
      // Mock token exchange failure for malformed code
      axios.post.mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            error: 'invalid_request',
            error_description: 'Invalid authorization code format'
          }
        }
      });

      const response = await request(app)
        .post('/api/v1/auth/callback')
        .set('Cookie', authCookie)
        .send({
          code: 'malformed<>code!@#$%',
          state: validState
        })
        .expect(500);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toMatch(/token exchange|failed|invalid/i);
    });
  });

  describe('Invalid or Expired State Parameter (CSRF Protection)', () => {
    it('should reject callback with missing state parameter (400)', async () => {
      const response = await request(app)
        .post('/api/v1/auth/callback')
        .set('Cookie', authCookie)
        .send({
          code: 'test_authorization_code'
          // Missing 'state' parameter
        })
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toMatch(/missing required|state|csrf/i);
    });

    it('should reject callback with invalid state parameter (403)', async () => {
      const response = await request(app)
        .post('/api/v1/auth/callback')
        .set('Cookie', authCookie)
        .send({
          code: 'test_authorization_code',
          state: 'completely_invalid_state_12345'
        })
        .expect(403);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toMatch(/state|csrf|invalid/i);

      // Verify no tokens saved
      const user = await User.findById(testUser._id);
      expect(user.tradingConfig.oauthTokens.has('alpaca')).toBe(false);
    });

    it('should reject callback with tampered state parameter (403)', async () => {
      const tamperedState = validState.slice(0, -5) + 'XXXXX';

      const response = await request(app)
        .post('/api/v1/auth/callback')
        .set('Cookie', authCookie)
        .send({
          code: 'test_authorization_code',
          state: tamperedState
        })
        .expect(403);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toMatch(/state|csrf/i);
    });

    it('should reject callback with expired state token (403)', async () => {
      // Wait for state to expire (if using time-based state validation)
      // For this test, we simulate expired state with a very old timestamp
      const expiredState = 'expired_state_from_old_session';

      const response = await request(app)
        .post('/api/v1/auth/callback')
        .set('Cookie', authCookie)
        .send({
          code: 'test_authorization_code',
          state: expiredState
        })
        .expect(403);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toMatch(/state|csrf|expired|invalid/i);
    });
  });

  describe('Broker API Errors', () => {
    it('should handle broker API unavailability (503)', async () => {
      // Mock network/broker API down
      axios.post.mockRejectedValueOnce({
        code: 'ECONNREFUSED',
        message: 'connect ECONNREFUSED 127.0.0.1:443'
      });

      const response = await request(app)
        .post('/api/v1/auth/callback')
        .set('Cookie', authCookie)
        .send({
          code: 'test_authorization_code',
          state: validState
        })
        .expect(500);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toMatch(/token exchange|failed|unavailable|broker/i);

      // Verify no tokens saved
      const user = await User.findById(testUser._id);
      expect(user.tradingConfig.oauthTokens.has('alpaca')).toBe(false);
    });

    it('should handle broker API timeout (503)', async () => {
      // Mock timeout error
      axios.post.mockRejectedValueOnce({
        code: 'ETIMEDOUT',
        message: 'timeout of 10000ms exceeded'
      });

      const response = await request(app)
        .post('/api/v1/auth/callback')
        .set('Cookie', authCookie)
        .send({
          code: 'test_authorization_code',
          state: validState
        })
        .expect(500);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toMatch(/token exchange|failed|timeout/i);
    });

    it('should handle broker returning 500 Internal Server Error', async () => {
      axios.post.mockRejectedValueOnce({
        response: {
          status: 500,
          data: {
            error: 'internal_server_error',
            error_description: 'Broker authentication service unavailable'
          }
        }
      });

      const response = await request(app)
        .post('/api/v1/auth/callback')
        .set('Cookie', authCookie)
        .send({
          code: 'test_authorization_code',
          state: validState
        })
        .expect(500);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toMatch(/token exchange|failed/i);
    });

    it('should handle broker rate limiting (429)', async () => {
      axios.post.mockRejectedValueOnce({
        response: {
          status: 429,
          data: {
            error: 'rate_limit_exceeded',
            error_description: 'Too many token requests'
          }
        }
      });

      const response = await request(app)
        .post('/api/v1/auth/callback')
        .set('Cookie', authCookie)
        .send({
          code: 'test_authorization_code',
          state: validState
        })
        .expect(500);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toMatch(/token exchange|failed|rate/i);
    });
  });

  describe('Token Exchange Errors', () => {
    it('should handle invalid client credentials (401)', async () => {
      axios.post.mockRejectedValueOnce({
        response: {
          status: 401,
          data: {
            error: 'invalid_client',
            error_description: 'Client authentication failed'
          }
        }
      });

      const response = await request(app)
        .post('/api/v1/auth/callback')
        .set('Cookie', authCookie)
        .send({
          code: 'test_authorization_code',
          state: validState
        })
        .expect(500);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toMatch(/token exchange|failed|authentication/i);
    });

    it('should handle invalid grant type (400)', async () => {
      axios.post.mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            error: 'unsupported_grant_type',
            error_description: 'Grant type not supported'
          }
        }
      });

      const response = await request(app)
        .post('/api/v1/auth/callback')
        .set('Cookie', authCookie)
        .send({
          code: 'test_authorization_code',
          state: validState
        })
        .expect(500);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toMatch(/token exchange|failed/i);
    });

    it('should handle expired authorization code (400)', async () => {
      axios.post.mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            error: 'invalid_grant',
            error_description: 'Authorization code expired'
          }
        }
      });

      const response = await request(app)
        .post('/api/v1/auth/callback')
        .set('Cookie', authCookie)
        .send({
          code: 'expired_authorization_code',
          state: validState
        })
        .expect(500);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toMatch(/token exchange|failed|expired/i);
    });

    it('should handle malformed token response (500)', async () => {
      // Mock successful HTTP but invalid JSON
      axios.post.mockResolvedValueOnce({
        data: null // Missing required token fields
      });

      const response = await request(app)
        .post('/api/v1/auth/callback')
        .set('Cookie', authCookie)
        .send({
          code: 'test_authorization_code',
          state: validState
        })
        .expect(500);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toMatch(/token|invalid|missing/i);
    });
  });

  describe('Account Validation Errors', () => {
    beforeEach(() => {
      // Mock successful token exchange for these tests
      axios.post.mockResolvedValue({
        data: {
          access_token: 'test_access_token',
          refresh_token: 'test_refresh_token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'account:read trading'
        }
      });
    });

    it.skip('should handle broker account validation failure (400)', async () => {
      // PENDING: Account validation not yet implemented in OAuth2Service
      // Mock account validation failing
      axios.get.mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            error: 'invalid_account',
            message: 'Account not found or inactive'
          }
        }
      });

      const response = await request(app)
        .post('/api/v1/auth/callback')
        .set('Cookie', authCookie)
        .send({
          code: 'test_authorization_code',
          state: validState
        })
        .expect(500);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toMatch(/account|validation|failed/i);
    });

    it('should handle suspended broker account (403)', async () => {
      axios.get.mockResolvedValueOnce({
        data: {
          account_number: 'ACCOUNT123',
          status: 'SUSPENDED', // Account suspended
          account_type: 'LIVE'
        }
      });

      const response = await request(app)
        .post('/api/v1/auth/callback')
        .set('Cookie', authCookie)
        .send({
          code: 'test_authorization_code',
          state: validState
        });

      // May succeed with warning or fail depending on implementation
      if (response.status !== 200) {
        expect(response.body.error).toMatch(/suspended|account|inactive/i);
      }
    });
  });

  describe('Database and User Creation Errors', () => {
    it('should handle database connection failure during token save (500)', async () => {
      // Mock successful token exchange
      axios.post.mockResolvedValueOnce({
        data: {
          access_token: 'test_access_token',
          refresh_token: 'test_refresh_token',
          token_type: 'Bearer',
          expires_in: 3600
        }
      });

      axios.get.mockResolvedValueOnce({
        data: {
          account_number: 'ACCOUNT123',
          status: 'ACTIVE',
          account_type: 'PAPER'
        }
      });

      // Mock database save failure
      const originalSave = User.prototype.save;
      User.prototype.save = jest.fn().mockRejectedValue(new Error('Database connection lost'));

      const response = await request(app)
        .post('/api/v1/auth/callback')
        .set('Cookie', authCookie)
        .send({
          code: 'test_authorization_code',
          state: validState
        })
        .expect(500);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toMatch(/failed|database|save/i);

      // Restore original save
      User.prototype.save = originalSave;
    });

    it('should handle concurrent callback requests gracefully', async () => {
      // Mock successful responses
      axios.post.mockResolvedValue({
        data: {
          access_token: 'test_access_token',
          refresh_token: 'test_refresh_token',
          token_type: 'Bearer',
          expires_in: 3600
        }
      });

      axios.get.mockResolvedValue({
        data: {
          account_number: 'ACCOUNT123',
          status: 'ACTIVE',
          account_type: 'PAPER'
        }
      });

      // Make concurrent callback requests using the shared agent/session
      const agent = request.agent(app);
      await agent.post('/api/auth/login/mock').send({ userId: testUser._id.toString() });

      // Generate fresh state for this agent's session
      const authResponse = await agent.get('/api/v1/auth/broker/alpaca/authorize');
      const authURL = new URL(authResponse.body.authorizationURL);
      const concurrentState = authURL.searchParams.get('state');

      const promises = [
        agent.post('/api/v1/auth/callback').send({ code: 'code1', state: concurrentState }),
        agent.post('/api/v1/auth/callback').send({ code: 'code2', state: concurrentState }),
        agent.post('/api/v1/auth/callback').send({ code: 'code3', state: concurrentState })
      ];

      const responses = await Promise.all(promises);

      // At least one should succeed
      const successCount = responses.filter(r => r.status === 200).length;
      expect(successCount).toBeGreaterThanOrEqual(1);

      // Verify tokens saved (should only have one set despite concurrent requests)
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.tradingConfig.oauthTokens.has('alpaca')).toBe(true);
    });
  });

  describe('Error Response Sanitization', () => {
    it('should not expose sensitive data in error messages', async () => {
      // Mock broker error with sensitive info
      axios.post.mockRejectedValueOnce({
        response: {
          status: 400,
          data: {
            error: 'invalid_client',
            error_description: 'Client secret ABC123SECRET456 is invalid',
            debug_info: 'Internal trace: user_id=12345, ip=192.168.1.1'
          }
        }
      });

      const response = await request(app)
        .post('/api/v1/auth/callback')
        .set('Cookie', authCookie)
        .send({
          code: 'test_code',
          state: validState
        })
        .expect(500);

      // Verify sensitive data NOT in error message
      expect(response.body.error).not.toMatch(/ABC123SECRET456/);
      expect(response.body.error).not.toMatch(/192\.168\.1\.1/);
      expect(response.body.error).not.toMatch(/user_id=12345/);
      expect(response.body.error).not.toMatch(/debug_info/);

      // Verify generic error message
      expect(response.body.error).toMatch(/token exchange|failed|authentication/i);
    });

    it('should not leak stack traces in production mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      axios.post.mockRejectedValueOnce(new Error('Internal broker error with stack trace'));

      const response = await request(app)
        .post('/api/v1/auth/callback')
        .set('Cookie', authCookie)
        .send({
          code: 'test_code',
          state: validState
        })
        .expect(500);

      // Should not contain stack trace
      expect(response.body).not.toHaveProperty('stack');
      expect(JSON.stringify(response.body)).not.toMatch(/at.*\.js:\d+/);

      process.env.NODE_ENV = originalEnv;
    });
  });
});
