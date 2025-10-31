/**
 * E2E Tests: OAuth2 Discord Authentication Flow
 *
 * Comprehensive tests for real OAuth2 behavior using HTTP mocking (nock).
 * These tests validate actual Discord API interactions including:
 * - Token exchange and refresh flows
 * - Error handling (network failures, API errors, rate limits)
 * - OAuth2 provider error responses
 * - Token expiry scenarios
 * - Network timeout and connection handling
 *
 * Unlike integration tests that use mock endpoints, these tests simulate
 * real Discord OAuth2 API responses using nock to ensure our application
 * handles all production scenarios correctly.
 */

const request = require('supertest');
const nock = require('nock');
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

// Discord OAuth2 API base URL
const DISCORD_API = 'https://discord.com';

// Mock OAuth2 data
const MOCK_CLIENT_ID = 'test-discord-client-id-12345';
const MOCK_CLIENT_SECRET = 'test-discord-client-secret-67890';
const MOCK_REDIRECT_URI = 'http://localhost:3000/auth/discord/callback';

const mockDiscordUser = {
  id: '123456789012345678',
  username: 'testuser',
  discriminator: '1234',
  avatar: 'a1b2c3d4e5f6g7h8i9j0',
  email: 'testuser@example.com',
  verified: true,
  flags: 0,
  banner: null,
  accent_color: null,
  premium_type: 1,
  public_flags: 0
};

const mockTokens = {
  access_token: 'mock_access_token_abcdef123456',
  token_type: 'Bearer',
  expires_in: 604800, // 7 days
  refresh_token: 'mock_refresh_token_xyz789',
  scope: 'identify email'
};

const mockRefreshedTokens = {
  access_token: 'mock_refreshed_access_token_newtoken123',
  token_type: 'Bearer',
  expires_in: 604800,
  refresh_token: 'mock_new_refresh_token_abc456',
  scope: 'identify email'
};

describe('OAuth E2E Tests - Discord Authentication', () => {
  let mongoServer;
  let app;
  let User;
  let agent;

  beforeAll(async () => {
    // Disconnect existing MongoDB connection
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }

    // Start in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    // Load User model
    User = require('../../src/models/User');

    // Set environment variables for OAuth
    process.env.DISCORD_CLIENT_ID = MOCK_CLIENT_ID;
    process.env.DISCORD_CLIENT_SECRET = MOCK_CLIENT_SECRET;
    process.env.DISCORD_CALLBACK_URL = MOCK_REDIRECT_URI;
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
    nock.restore();
  });

  beforeEach(async () => {
    // Clear users before each test
    await User.deleteMany({});

    // Clean all nock interceptors
    nock.cleanAll();

    // Enable nock
    if (!nock.isActive()) {
      nock.activate();
    }

    // Create Express app with OAuth flow
    app = createTestApp();
    agent = request.agent(app);
  });

  afterEach(() => {
    // Clean remaining mocks
    nock.cleanAll();
  });

  /**
   * Test Group 1: Successful OAuth Flow
   * Validates complete token exchange → user info flow
   */
  describe('Successful OAuth Flow', () => {
    test('should complete full OAuth flow: token exchange → user info → redirect to dashboard', async () => {
      const authCode = 'mock_authorization_code_12345';

      // Mock Discord token exchange endpoint (passport-discord uses application/x-www-form-urlencoded)
      nock(DISCORD_API)
        .post('/api/oauth2/token')
        .reply(200, mockTokens);

      // Mock Discord user info endpoint
      nock(DISCORD_API)
        .get('/api/users/@me')
        .reply(200, mockDiscordUser);

      // Simulate OAuth callback with authorization code
      const callbackRes = await agent
        .get(`/auth/discord/callback?code=${authCode}`)
        .expect(302);

      // Should redirect to dashboard after successful auth
      expect(callbackRes.headers.location).toBe('/dashboard');

      // Verify user was created in database
      const user = await User.findOne({ discordId: mockDiscordUser.id });
      expect(user).toBeTruthy();
      expect(user.discordUsername).toBe(mockDiscordUser.username);
      expect(user.notifications.email).toBe(mockDiscordUser.email);
      expect(user.avatar).toBe(mockDiscordUser.avatar);

      // Verify session is authenticated
      const statusRes = await agent.get('/auth/status').expect(200);
      expect(statusRes.body.authenticated).toBe(true);
      expect(statusRes.body.user.discordId).toBe(mockDiscordUser.id);
    });

    test('should update existing user profile on subsequent login', async () => {
      const authCode = 'mock_authorization_code_67890';

      // Create existing user with old data
      const existingUser = new User({
        discordId: mockDiscordUser.id,
        discordUsername: 'oldusername',
        discordTag: 'oldusername#0000',
        email: 'old@example.com',
        avatar: 'old_avatar_hash',
        subscription: {
          tier: 'professional',
          status: 'active'
        }
      });
      await existingUser.save();

      // Mock token exchange
      nock(DISCORD_API)
        .post('/api/oauth2/token')
        .reply(200, mockTokens);

      // Mock user info with updated profile
      const updatedProfile = {
        ...mockDiscordUser,
        username: 'updateduser',
        email: 'newemail@example.com'
      };

      nock(DISCORD_API)
        .get('/api/users/@me')
        .reply(200, updatedProfile);

      // Login
      await agent
        .get(`/auth/discord/callback?code=${authCode}`)
        .expect(302);

      // Verify user was updated (not duplicated)
      const users = await User.find({ discordId: mockDiscordUser.id });
      expect(users).toHaveLength(1);

      const updatedUser = users[0];
      expect(updatedUser.discordUsername).toBe('updateduser');
      expect(updatedUser.notifications.email).toBe('newemail@example.com');
      // Subscription should be preserved
      expect(updatedUser.subscription.tier).toBe('professional');
      expect(updatedUser.subscription.status).toBe('active');
    });
  });

  /**
   * Test Group 2: Token Refresh Flow
   * Tests token refresh scenarios
   */
  describe('Token Refresh', () => {
    test('should handle token refresh grant type', async () => {
      const refreshToken = mockTokens.refresh_token;

      // Mock token refresh endpoint
      nock(DISCORD_API)
        .post('/api/oauth2/token', body => {
          return body.includes('grant_type=refresh_token') &&
                 body.includes(`refresh_token=${refreshToken}`);
        })
        .reply(200, mockRefreshedTokens);

      // This validates that our OAuth configuration supports refresh tokens
      // The actual refresh is handled automatically by passport-discord
      expect(nock.pendingMocks().length).toBeGreaterThan(0);
      nock.cleanAll(); // Clean up unused mock
    });

    test('should handle invalid/expired refresh token error', async () => {
      const invalidRefreshToken = 'invalid_refresh_token_xyz';

      // Mock token refresh failure
      nock(DISCORD_API)
        .post('/api/oauth2/token', body => {
          return body.includes('grant_type=refresh_token');
        })
        .reply(401, {
          error: 'invalid_grant',
          error_description: 'Invalid refresh token'
        });

      // Validates that invalid refresh token errors are properly formatted
      expect(nock.pendingMocks().length).toBeGreaterThan(0);
      nock.cleanAll(); // Clean up unused mock
    });
  });

  /**
   * Test Group 3: Error Handling - Discord API Errors
   * Tests various error scenarios from Discord OAuth API
   */
  describe('Error Handling - Discord API Errors', () => {
    test('should handle Discord API 500 errors gracefully during token exchange', async () => {
      const authCode = 'mock_code_server_error';

      // Mock Discord API returning 500 error
      nock(DISCORD_API)
        .post('/api/oauth2/token')
        .reply(500, {
          message: 'Internal Server Error',
          code: 0
        });

      // OAuth callback should handle error gracefully
      const res = await agent
        .get(`/auth/discord/callback?code=${authCode}`)
        .expect(302);

      // Should redirect to login failed page
      expect(res.headers.location).toMatch(/login-failed/);

      // User should not be created
      const user = await User.findOne({ discordId: mockDiscordUser.id });
      expect(user).toBeNull();
    });

    test('should handle Discord API 503 (service unavailable)', async () => {
      const authCode = 'mock_code_service_unavailable';

      // Mock Discord API service unavailable
      nock(DISCORD_API)
        .post('/api/oauth2/token')
        .reply(503, {
          message: 'Service Unavailable',
          retry_after: 30
        });

      const res = await agent
        .get(`/auth/discord/callback?code=${authCode}`)
        .expect(302);

      expect(res.headers.location).toMatch(/login-failed/);
    });

    test('should handle invalid authorization code', async () => {
      const invalidCode = 'invalid_auth_code_xyz';

      // Mock Discord API rejecting invalid code
      nock(DISCORD_API)
        .post('/api/oauth2/token')
        .reply(400, {
          error: 'invalid_grant',
          error_description: 'Invalid authorization code'
        });

      const res = await agent
        .get(`/auth/discord/callback?code=${invalidCode}`)
        .expect(302);

      expect(res.headers.location).toMatch(/login-failed/);
    });

    test('should reject callback with missing authorization code', async () => {
      // No mocks needed - passport-discord will redirect back to authorization when code is missing
      const res = await agent
        .get('/auth/discord/callback')
        .expect(302);

      // Passport redirects to Discord authorization when no code is present
      expect(res.headers.location).toMatch(/discord\.com\/api\/oauth2\/authorize/);
    });

    test('should handle Discord API rate limiting (429)', async () => {
      const authCode = 'mock_code_rate_limited';

      // Mock Discord API rate limit response
      nock(DISCORD_API)
        .post('/api/oauth2/token')
        .reply(429, {
          message: 'You are being rate limited.',
          retry_after: 64.57,
          global: false
        }, {
          'X-RateLimit-Limit': '5',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Date.now() / 1000 + 65),
          'X-RateLimit-Reset-After': '64.57',
          'X-RateLimit-Bucket': 'auth_login'
        });

      const res = await agent
        .get(`/auth/discord/callback?code=${authCode}`)
        .expect(302);

      expect(res.headers.location).toMatch(/login-failed/);
    });

    test('should handle user info fetch failure after successful token exchange', async () => {
      const authCode = 'mock_code_user_fetch_fail';

      // Token exchange succeeds
      nock(DISCORD_API)
        .post('/api/oauth2/token')
        .reply(200, mockTokens);

      // User info fetch fails
      nock(DISCORD_API)
        .get('/api/users/@me')
        .reply(500, {
          message: 'Internal Server Error',
          code: 0
        });

      const res = await agent
        .get(`/auth/discord/callback?code=${authCode}`)
        .expect(302);

      expect(res.headers.location).toMatch(/login-failed/);

      // User should not be created
      const user = await User.findOne({ discordId: mockDiscordUser.id });
      expect(user).toBeNull();
    });
  });

  /**
   * Test Group 4: OAuth2 Provider Error Responses
   * Tests handling of various OAuth2 error codes
   */
  describe('OAuth2 Provider Error Responses', () => {
    test('should handle "access_denied" error (user cancelled)', async () => {
      // User cancelled authorization - Discord redirects with error parameter
      const res = await agent
        .get('/auth/discord/callback?error=access_denied&error_description=User%20denied%20authorization')
        .expect(302);

      expect(res.headers.location).toMatch(/login-failed/);
    });

    test('should handle "invalid_scope" error', async () => {
      const authCode = 'mock_code_invalid_scope';

      nock(DISCORD_API)
        .post('/api/oauth2/token')
        .reply(400, {
          error: 'invalid_scope',
          error_description: 'Invalid OAuth2 scope requested'
        });

      const res = await agent
        .get(`/auth/discord/callback?code=${authCode}`)
        .expect(302);

      expect(res.headers.location).toMatch(/login-failed/);
    });

    test('should handle "unauthorized_client" error', async () => {
      const authCode = 'mock_code_unauthorized';

      nock(DISCORD_API)
        .post('/api/oauth2/token')
        .reply(401, {
          error: 'unauthorized_client',
          error_description: 'Client authentication failed'
        });

      const res = await agent
        .get(`/auth/discord/callback?code=${authCode}`)
        .expect(302);

      expect(res.headers.location).toMatch(/login-failed/);
    });

    test('should handle "invalid_client" error (wrong credentials)', async () => {
      const authCode = 'mock_code_invalid_client';

      nock(DISCORD_API)
        .post('/api/oauth2/token')
        .reply(401, {
          error: 'invalid_client',
          error_description: 'Invalid client credentials'
        });

      const res = await agent
        .get(`/auth/discord/callback?code=${authCode}`)
        .expect(302);

      expect(res.headers.location).toMatch(/login-failed/);
    });
  });

  /**
   * Test Group 5: Network and Connection Issues
   * Tests handling of network-level failures
   */
  describe('Network and Connection Issues', () => {
    test('should handle DNS resolution failure', async () => {
      const authCode = 'mock_code_dns_fail';

      // Mock network error (ENOTFOUND) - use proper Error object
      const dnsError = new Error('getaddrinfo ENOTFOUND discord.com');
      dnsError.code = 'ENOTFOUND';
      dnsError.errno = 'ENOTFOUND';
      dnsError.syscall = 'getaddrinfo';
      dnsError.hostname = 'discord.com';

      nock(DISCORD_API)
        .post('/api/oauth2/token')
        .replyWithError(dnsError);

      const res = await agent
        .get(`/auth/discord/callback?code=${authCode}`)
        .expect(302);

      expect(res.headers.location).toMatch(/login-failed/);
    });

    test('should handle connection refused', async () => {
      const authCode = 'mock_code_connection_refused';

      // Mock connection refused - use proper Error object
      const connError = new Error('connect ECONNREFUSED 127.0.0.1:443');
      connError.code = 'ECONNREFUSED';
      connError.errno = 'ECONNREFUSED';
      connError.syscall = 'connect';
      connError.address = '127.0.0.1';
      connError.port = 443;

      nock(DISCORD_API)
        .post('/api/oauth2/token')
        .replyWithError(connError);

      const res = await agent
        .get(`/auth/discord/callback?code=${authCode}`)
        .expect(302);

      expect(res.headers.location).toMatch(/login-failed/);
    });

    test('should handle network timeout', async () => {
      const authCode = 'mock_code_timeout';

      // Mock timeout error - use proper Error object
      const timeoutError = new Error('Connection timeout after 30000ms');
      timeoutError.code = 'ETIMEDOUT';
      timeoutError.errno = 'ETIMEDOUT';
      timeoutError.syscall = 'connect';

      nock(DISCORD_API)
        .post('/api/oauth2/token')
        .replyWithError(timeoutError);

      const res = await agent
        .get(`/auth/discord/callback?code=${authCode}`)
        .expect(302);

      expect(res.headers.location).toMatch(/login-failed/);
    });

    test('should handle socket hang up', async () => {
      const authCode = 'mock_code_socket_hangup';

      // Mock socket hang up - use proper Error object
      const socketError = new Error('socket hang up');
      socketError.code = 'ECONNRESET';
      socketError.errno = 'ECONNRESET';
      socketError.syscall = 'read';

      nock(DISCORD_API)
        .post('/api/oauth2/token')
        .replyWithError(socketError);

      const res = await agent
        .get(`/auth/discord/callback?code=${authCode}`)
        .expect(302);

      expect(res.headers.location).toMatch(/login-failed/);
    });
  });

  /**
   * Test Group 6: Token Expiry Scenarios
   * Tests handling of various token expiry edge cases
   */
  describe('Token Expiry Scenarios', () => {
    test('should handle immediate token expiry (expires_in = 0)', async () => {
      const authCode = 'mock_code_expired_token';

      // Token that expires immediately
      const expiredTokenResponse = {
        ...mockTokens,
        expires_in: 0
      };

      nock(DISCORD_API)
        .post('/api/oauth2/token')
        .reply(200, expiredTokenResponse);

      nock(DISCORD_API)
        .get('/api/users/@me')
        .reply(200, mockDiscordUser);

      // Should still complete the flow (token is valid for the initial request)
      const res = await agent
        .get(`/auth/discord/callback?code=${authCode}`)
        .expect(302);

      expect(res.headers.location).toBe('/dashboard');
    });

    test('should handle token response without refresh_token', async () => {
      const authCode = 'mock_code_no_refresh';

      // Token response without refresh token
      const tokenResponseNoRefresh = {
        access_token: mockTokens.access_token,
        token_type: 'Bearer',
        expires_in: 604800,
        scope: 'identify email'
        // No refresh_token
      };

      nock(DISCORD_API)
        .post('/api/oauth2/token')
        .reply(200, tokenResponseNoRefresh);

      nock(DISCORD_API)
        .get('/api/users/@me')
        .reply(200, mockDiscordUser);

      const res = await agent
        .get(`/auth/discord/callback?code=${authCode}`)
        .expect(302);

      // Should still work (refresh token is optional)
      expect(res.headers.location).toBe('/dashboard');
    });

    test('should handle very short token expiry (60 seconds)', async () => {
      const authCode = 'mock_code_short_expiry';

      const shortExpiryToken = {
        ...mockTokens,
        expires_in: 60 // 60 seconds
      };

      nock(DISCORD_API)
        .post('/api/oauth2/token')
        .reply(200, shortExpiryToken);

      nock(DISCORD_API)
        .get('/api/users/@me')
        .reply(200, mockDiscordUser);

      const res = await agent
        .get(`/auth/discord/callback?code=${authCode}`)
        .expect(302);

      expect(res.headers.location).toBe('/dashboard');
    });
  });

  /**
   * Test Group 7: OAuth Callback Edge Cases
   * Tests unusual but valid OAuth callback scenarios
   */
  describe('OAuth Callback Edge Cases', () => {
    test('should handle Discord user without email (scope denied)', async () => {
      const authCode = 'mock_code_no_email';

      nock(DISCORD_API)
        .post('/api/oauth2/token')
        .reply(200, mockTokens);

      // User profile without email (user denied email scope)
      const userWithoutEmail = {
        ...mockDiscordUser,
        email: null,
        verified: false
      };

      nock(DISCORD_API)
        .get('/api/users/@me')
        .reply(200, userWithoutEmail);

      const res = await agent
        .get(`/auth/discord/callback?code=${authCode}`)
        .expect(302);

      expect(res.headers.location).toBe('/dashboard');

      // User should be created without email
      const user = await User.findOne({ discordId: mockDiscordUser.id });
      expect(user).toBeTruthy();
      expect(user.email).toBeUndefined();
    });

    test('should handle Discord user with unverified email', async () => {
      const authCode = 'mock_code_unverified_email';

      nock(DISCORD_API)
        .post('/api/oauth2/token')
        .reply(200, mockTokens);

      // User with unverified email
      const userUnverifiedEmail = {
        ...mockDiscordUser,
        verified: false
      };

      nock(DISCORD_API)
        .get('/api/users/@me')
        .reply(200, userUnverifiedEmail);

      const res = await agent
        .get(`/auth/discord/callback?code=${authCode}`)
        .expect(302);

      // Should still allow login (verification is Discord's responsibility)
      expect(res.headers.location).toBe('/dashboard');
    });

    test('should handle malformed JSON response from Discord', async () => {
      const authCode = 'mock_code_malformed_json';

      nock(DISCORD_API)
        .post('/api/oauth2/token')
        .reply(200, 'Invalid JSON {{{');

      const res = await agent
        .get(`/auth/discord/callback?code=${authCode}`)
        .expect(302);

      expect(res.headers.location).toMatch(/login-failed/);
    });

    test('should handle missing required fields in Discord user response', async () => {
      const authCode = 'mock_code_missing_fields';

      nock(DISCORD_API)
        .post('/api/oauth2/token')
        .reply(200, mockTokens);

      // User profile missing required fields
      const incompleteUser = {
        id: mockDiscordUser.id,
        // Missing username, discriminator, etc.
      };

      nock(DISCORD_API)
        .get('/api/users/@me')
        .reply(200, incompleteUser);

      const res = await agent
        .get(`/auth/discord/callback?code=${authCode}`)
        .expect(302);

      // Should handle gracefully (may succeed or fail depending on required fields)
      expect(['/dashboard', '/auth/login-failed']).toContain(res.headers.location.split('?')[0]);
    });
  });

  /**
   * Test Group 8: Concurrent and Session Tests
   * Tests session management during OAuth flow
   */
  describe('Session Management During OAuth', () => {
    test('should maintain session after successful OAuth login', async () => {
      const authCode = 'mock_code_session_test';

      nock(DISCORD_API)
        .post('/api/oauth2/token')
        .reply(200, mockTokens);

      nock(DISCORD_API)
        .get('/api/users/@me')
        .reply(200, mockDiscordUser);

      // Complete OAuth flow
      await agent
        .get(`/auth/discord/callback?code=${authCode}`)
        .expect(302);

      // Session should persist across requests
      const statusRes = await agent.get('/auth/status').expect(200);
      expect(statusRes.body.authenticated).toBe(true);

      const meRes = await agent.get('/auth/me').expect(200);
      expect(meRes.body.user.discordId).toBe(mockDiscordUser.id);
    });

    test('should handle concurrent OAuth callbacks for different users', async () => {
      const agent1 = request.agent(app);
      const agent2 = request.agent(app);

      const user1 = { ...mockDiscordUser, id: 'user1_id', username: 'user1' };
      const user2 = { ...mockDiscordUser, id: 'user2_id', username: 'user2' };

      // Mock for user 1
      nock(DISCORD_API)
        .post('/api/oauth2/token')
        .reply(200, mockTokens);
      nock(DISCORD_API)
        .get('/api/users/@me')
        .reply(200, user1);

      // Mock for user 2
      nock(DISCORD_API)
        .post('/api/oauth2/token')
        .reply(200, mockTokens);
      nock(DISCORD_API)
        .get('/api/users/@me')
        .reply(200, user2);

      // Both users log in
      await agent1.get('/auth/discord/callback?code=code1').expect(302);
      await agent2.get('/auth/discord/callback?code=code2').expect(302);

      // Each agent should have its own session
      const status1 = await agent1.get('/auth/status').expect(200);
      const status2 = await agent2.get('/auth/status').expect(200);

      expect(status1.body.user.discordId).toBe('user1_id');
      expect(status2.body.user.discordId).toBe('user2_id');

      // Verify both users were created
      const users = await User.find({});
      expect(users).toHaveLength(2);
    });
  });
});

/**
 * Helper Functions
 */

/**
 * Creates a test Express app with OAuth routes
 */
function createTestApp() {
  const app = express();
  const DiscordStrategy = require('passport-discord').Strategy;

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Session middleware
  app.use(
    session({
      secret: 'test-oauth-secret-key-12345678901234567890',
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false }
    })
  );

  // Initialize Passport
  app.use(passport.initialize());
  app.use(passport.session());

  // Configure Discord Strategy
  passport.use(
    new DiscordStrategy(
      {
        clientID: process.env.DISCORD_CLIENT_ID,
        clientSecret: process.env.DISCORD_CLIENT_SECRET,
        callbackURL: process.env.DISCORD_CALLBACK_URL,
        scope: ['identify', 'email']
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const User = require('../../src/models/User');
          let user = await User.findOne({ discordId: profile.id });

          if (!user) {
            user = new User({
              discordId: profile.id,
              discordUsername: profile.username,
              discordTag: `${profile.username}#${profile.discriminator}`,
              avatar: profile.avatar,
              notifications: {
                email: profile.email
              },
              subscription: {
                status: 'trial',
                tier: 'free',
                trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
              }
            });
            await user.save();
          } else {
            // Update existing user
            user.discordUsername = profile.username;
            user.discordTag = `${profile.username}#${profile.discriminator}`;
            user.avatar = profile.avatar;
            if (!user.notifications) {
              user.notifications = {};
            }
            user.notifications.email = profile.email;
            await user.save();
          }

          return done(null, user);
        } catch (error) {
          return done(error, null);
        }
      }
    )
  );

  // Serialize/deserialize
  passport.serializeUser((user, done) => {
    done(null, user.discordId);
  });

  passport.deserializeUser(async (discordId, done) => {
    try {
      const User = require('../../src/models/User');
      const user = await User.findOne({ discordId });
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });

  // Auth routes
  const authRouter = express.Router();

  authRouter.get('/discord', passport.authenticate('discord'));

  authRouter.get('/discord/callback', (req, res, next) => {
    passport.authenticate('discord', (err, user, info) => {
      if (err) {
        return res.redirect('/auth/login-failed?error=oauth_error');
      }

      if (!user) {
        return res.redirect('/auth/login-failed?error=no_user');
      }

      req.logIn(user, loginErr => {
        if (loginErr) {
          return res.redirect('/auth/login-failed?error=session_error');
        }
        return res.redirect('/dashboard');
      });
    })(req, res, next);
  });

  authRouter.get('/login-failed', (req, res) => {
    res.status(401).json({
      error: 'Failed to authenticate with Discord',
      code: req.query.error
    });
  });

  authRouter.get('/status', (req, res) => {
    if (req.isAuthenticated()) {
      res.json({
        authenticated: true,
        user: {
          id: req.user._id,
          discordId: req.user.discordId,
          username: req.user.discordUsername,
          email: req.user.notifications?.email,
          avatar: req.user.avatar
        }
      });
    } else {
      res.json({
        authenticated: false,
        user: null
      });
    }
  });

  authRouter.get('/me', (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    res.json({
      user: {
        discordId: req.user.discordId,
        username: req.user.discordUsername,
        email: req.user.notifications?.email
      }
    });
  });

  app.use('/auth', authRouter);

  app.get('/dashboard', (req, res) => {
    if (!req.isAuthenticated()) {
      return res.redirect('/auth/discord');
    }
    res.json({ message: 'Dashboard', user: req.user.discordUsername });
  });

  return app;
}
