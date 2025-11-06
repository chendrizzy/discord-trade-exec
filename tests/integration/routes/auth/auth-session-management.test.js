/**
 * Integration Test: Session Management
 * Extracted from auth.test.js lines 539-616
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

describe('Session Management', () => {
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
        email: 'session@example.com',
        communityId: new mongoose.Types.ObjectId()
      });

      // Login and get session cookie
      const agent = request.agent(app);
      const loginResponse = await agent.post('/api/auth/login/mock').send({ userId: testUser._id.toString() });

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
      // Extract session ID from cookie
      const sessionIdMatch = authCookie[0].match(/connect\.sid=s%3A([^.]+)\./);
      expect(sessionIdMatch).toBeTruthy();
      const sessionId = sessionIdMatch[1];

      // Directly manipulate the session in MongoDB to set an expired date
      // The session store uses the session ID as the key
      await new Promise((resolve, reject) => {
        sessionStore.get(sessionId, (err, session) => {
          if (err) return reject(err);
          if (!session) return reject(new Error('Session not found'));

          // Set the session cookie expiry to the past
          session.cookie.expires = new Date(Date.now() - 1000); // 1 second ago

          sessionStore.set(sessionId, session, (err) => {
            if (err) return reject(err);
            resolve();
          });
        });
      });

      // Now the session should be rejected as expired
      await request(app).get('/api/v1/auth/brokers/status').set('Cookie', authCookie).expect(401);
    });
  });
});
