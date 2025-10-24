/**
 * Integration Test: Auth Session Management
 *
 * US3-T03: Session Expiry Tests
 * Tests JWT expiration, session refresh, and session limits
 */

const request = require('supertest');
const express = require('express');
const session = require('express-session');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../../../src/models/User');
const Community = require('../../../src/models/Community');
const { extractTenantMiddleware } = require('../../../src/middleware/tenantAuth');

let mongoServer;
let app;
let testUser;
let testCommunity;

beforeAll(async () => {
  // Disconnect existing connection if present
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  // Start in-memory MongoDB
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);

  // Create Express app with session middleware
  app = express();
  app.use(express.json());
  app.use(
    session({
      secret: 'test-session-secret-minimum-32-chars-long',
      resave: false,
      saveUninitialized: true, // Save empty sessions for testing
      cookie: {
        secure: false, // Allow HTTP for tests
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      }
    })
  );

  // Test routes
  app.get('/api/protected', extractTenantMiddleware, (req, res) => {
    res.status(200).json({
      success: true,
      message: 'Protected resource accessed',
      tenantId: req.tenant.communityId,
      userId: req.tenant.userId
    });
  });

  app.get('/api/session-info', (req, res) => {
    res.status(200).json({
      success: true,
      sessionID: req.sessionID,
      session: req.session
    });
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  // Clear database
  await User.deleteMany({});
  await Community.deleteMany({});

  // Create test user first (needed for Community admin)
  testUser = await User.create({
    discordId: 'test_session_' + Date.now(),
    discordUsername: 'session_tester',
    discordTag: 'session_tester#1234',
    username: 'session_tester',
    email: 'session@example.com',
    subscription: {
      tier: 'professional',
      status: 'active'
    }
  });

  // Create test community with admin
  testCommunity = await Community.create({
    name: 'Test Community',
    discordGuildId: 'test_guild_' + Date.now(),
    admins: [
      {
        userId: testUser._id,
        role: 'owner',
        permissions: ['manage_signals', 'manage_users', 'manage_settings', 'view_analytics', 'execute_trades', 'manage_billing']
      }
    ],
    subscription: {
      tier: 'professional',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
    }
  });

  // Update test user with communityId
  testUser.communityId = testCommunity._id;
  await testUser.save();
});

describe('Integration Test: JWT Token Expiry', () => {
  it('should reject expired JWT token (401)', async () => {
    // Generate expired token (expired 1 hour ago)
    const expiredToken = jwt.sign(
      {
        userId: testUser._id.toString(),
        communityId: testCommunity._id.toString(),
        role: 'member'
      },
      process.env.JWT_SECRET,
      { expiresIn: '-1h' } // Negative duration = already expired
    );

    const response = await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401);

    expect(response.body).toHaveProperty('success', false);
    expect(response.body).toHaveProperty('code', 'TOKEN_EXPIRED');
    expect(response.body.error).toMatch(/expired/i);
    expect(response.body).toHaveProperty('expiredAt');
  });

  it('should accept valid JWT token (200)', async () => {
    // Generate valid token
    const validToken = jwt.sign(
      {
        userId: testUser._id.toString(),
        communityId: testCommunity._id.toString(),
        role: 'member'
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const response = await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('tenantId', testCommunity._id.toString());
    expect(response.body).toHaveProperty('userId', testUser._id.toString());
  });

  it('should reject token with invalid signature (401)', async () => {
    // Generate token with wrong secret
    const invalidToken = jwt.sign(
      {
        userId: testUser._id.toString(),
        communityId: testCommunity._id.toString(),
        role: 'member'
      },
      'wrong-secret-key',
      { expiresIn: '7d' }
    );

    const response = await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${invalidToken}`)
      .expect(401);

    expect(response.body).toHaveProperty('success', false);
    expect(response.body).toHaveProperty('code', 'TOKEN_INVALID');
    expect(response.body.error).toMatch(/invalid/i);
  });

  it('should reject malformed JWT token (401)', async () => {
    const response = await request(app)
      .get('/api/protected')
      .set('Authorization', 'Bearer not.a.valid.jwt.token')
      .expect(401);

    expect(response.body).toHaveProperty('success', false);
    expect(response.body).toHaveProperty('code', 'TOKEN_INVALID');
  });

  it('should reject token missing Authorization header (401)', async () => {
    const response = await request(app)
      .get('/api/protected')
      .expect(401);

    expect(response.body).toHaveProperty('success', false);
    expect(response.body).toHaveProperty('code', 'AUTH_MISSING');
    expect(response.body.error).toMatch(/authentication required/i);
  });

  it('should reject token with invalid header format (401)', async () => {
    const validToken = jwt.sign(
      {
        userId: testUser._id.toString(),
        communityId: testCommunity._id.toString(),
        role: 'member'
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Missing "Bearer" prefix
    const response = await request(app)
      .get('/api/protected')
      .set('Authorization', validToken)
      .expect(401);

    expect(response.body).toHaveProperty('success', false);
    expect(response.body).toHaveProperty('code', 'AUTH_FORMAT_INVALID');
    expect(response.body.error).toMatch(/invalid authorization header format/i);
  });

  it('should reject token missing communityId claim (403)', async () => {
    // Generate token without communityId
    const tokenWithoutTenant = jwt.sign(
      {
        userId: testUser._id.toString(),
        role: 'member'
        // Missing communityId
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const response = await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${tokenWithoutTenant}`)
      .expect(403);

    expect(response.body).toHaveProperty('success', false);
    expect(response.body).toHaveProperty('code', 'TENANT_CLAIM_MISSING');
    expect(response.body.error).toMatch(/communityId/i);
  });

  it('should reject token with non-existent community (404)', async () => {
    const fakeCommunityId = new mongoose.Types.ObjectId();

    const tokenWithFakeTenant = jwt.sign(
      {
        userId: testUser._id.toString(),
        communityId: fakeCommunityId.toString(),
        role: 'member'
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const response = await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${tokenWithFakeTenant}`)
      .expect(404);

    expect(response.body).toHaveProperty('success', false);
    expect(response.body).toHaveProperty('code', 'TENANT_NOT_FOUND');
    expect(response.body.error).toMatch(/community not found/i);
  });
});

describe('Integration Test: Session Refresh', () => {
  it.skip('should refresh session successfully (200)', async () => {
    // PENDING: Session refresh endpoint not yet implemented
    // Expected: POST /api/auth/refresh with refresh token
    // Returns: New access token with extended expiry
  });

  it.skip('should reject refresh with expired refresh token (401)', async () => {
    // PENDING: Refresh token functionality not yet implemented
  });

  it.skip('should reject refresh with revoked refresh token (401)', async () => {
    // PENDING: Token revocation not yet implemented
  });
});

describe('Integration Test: Session Revocation', () => {
  it.skip('should revoke session successfully (200)', async () => {
    // PENDING: Session revocation endpoint not yet implemented
    // Expected: POST /api/auth/logout or DELETE /api/auth/session/:sessionId
  });

  it.skip('should reject revoked session (401)', async () => {
    // PENDING: Session revocation tracking not yet implemented
    // Requires session blacklist or revoked tokens table
  });
});

describe('Integration Test: Concurrent Session Limits', () => {
  it.skip('should enforce concurrent session limit (409)', async () => {
    // PENDING: Concurrent session limiting not yet implemented
    // Expected: Track active sessions per user, reject when limit exceeded
  });

  it.skip('should allow new session when under limit (200)', async () => {
    // PENDING: Concurrent session limiting not yet implemented
  });

  it.skip('should revoke oldest session when creating new session at limit (200)', async () => {
    // PENDING: Session rotation policy not yet implemented
  });
});

describe('Integration Test: Express Session Management', () => {
  it('should create session on first request', async () => {
    const agent = request.agent(app);

    const response = await agent.get('/api/session-info').expect(200);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('sessionID');
    expect(response.body.sessionID).toBeTruthy();
  });

  it('should maintain session across requests with same agent', async () => {
    const agent = request.agent(app);

    const response1 = await agent.get('/api/session-info').expect(200);
    const sessionID1 = response1.body.sessionID;

    const response2 = await agent.get('/api/session-info').expect(200);
    const sessionID2 = response2.body.sessionID;

    expect(sessionID1).toBe(sessionID2);
  });

  it('should create different sessions for different agents', async () => {
    const agent1 = request.agent(app);
    const agent2 = request.agent(app);

    const response1 = await agent1.get('/api/session-info').expect(200);
    const response2 = await agent2.get('/api/session-info').expect(200);

    expect(response1.body.sessionID).not.toBe(response2.body.sessionID);
  });
});
