/**
 * Integration Test: Auth Middleware
 *
 * US3-T06: Auth Middleware Tests
 * Tests authentication middleware edge cases, RBAC, and WebSocket auth
 */

const request = require('supertest');
const express = require('express');
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
let testAdmin;

beforeAll(async () => {
  // Disconnect existing connection if present
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  // Start in-memory MongoDB
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);

  // Create Express app
  app = express();
  app.use(express.json());

  // Test routes for middleware testing
  app.get('/api/protected', extractTenantMiddleware, (req, res) => {
    res.status(200).json({
      success: true,
      tenant: req.tenant
    });
  });

  app.get('/api/admin-only', extractTenantMiddleware, (req, res) => {
    // Simple RBAC check
    if (!req.tenant || req.tenant.userRole !== 'owner') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
        code: 'ADMIN_REQUIRED'
      });
    }
    res.status(200).json({
      success: true,
      message: 'Admin access granted'
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

  // Create test user first
  testUser = await User.create({
    discordId: 'test_middleware_' + Date.now(),
    discordUsername: 'middleware_tester',
    discordTag: 'middleware_tester#1234',
    username: 'middleware_tester',
    email: 'middleware@example.com',
    subscription: {
      tier: 'professional',
      status: 'active'
    }
  });

  // Create test community with admin
  testCommunity = await Community.create({
    name: 'Test Community',
    discordGuildId: 'test_guild_middleware_' + Date.now(),
    admins: [
      {
        userId: testUser._id,
        role: 'owner',
        permissions: ['manage_signals', 'manage_users', 'manage_settings']
      }
    ],
    subscription: {
      tier: 'professional',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    }
  });

  // Update test user with communityId
  testUser.communityId = testCommunity._id;
  await testUser.save();

  // Create admin user
  testAdmin = testUser;
});

describe('Integration Test: JWT Verification Failures', () => {
  it('should reject request with expired JWT token', async () => {
    const expiredToken = jwt.sign(
      {
        userId: testUser._id.toString(),
        communityId: testCommunity._id.toString(),
        role: 'member'
      },
      process.env.JWT_SECRET,
      { expiresIn: '-1h' }
    );

    const response = await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401);

    expect(response.body.code).toBe('TOKEN_EXPIRED');
  });

  it('should reject request with invalid JWT signature', async () => {
    const invalidToken = jwt.sign(
      {
        userId: testUser._id.toString(),
        communityId: testCommunity._id.toString(),
        role: 'member'
      },
      'wrong-secret',
      { expiresIn: '7d' }
    );

    const response = await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${invalidToken}`)
      .expect(401);

    expect(response.body.code).toBe('TOKEN_INVALID');
  });

  it('should reject request with malformed JWT token', async () => {
    const response = await request(app)
      .get('/api/protected')
      .set('Authorization', 'Bearer not.a.valid.token')
      .expect(401);

    expect(response.body.code).toBe('TOKEN_INVALID');
  });

  it('should reject request with missing Authorization header', async () => {
    const response = await request(app)
      .get('/api/protected')
      .expect(401);

    expect(response.body.code).toBe('AUTH_MISSING');
  });

  it('should reject request with malformed Authorization header', async () => {
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

    expect(response.body.code).toBe('AUTH_FORMAT_INVALID');
  });

  it('should reject JWT with missing userId claim', async () => {
    const tokenWithoutUserId = jwt.sign(
      {
        communityId: testCommunity._id.toString(),
        role: 'member'
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const response = await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${tokenWithoutUserId}`)
      .expect(403);

    expect(response.body.code).toBe('USER_CLAIM_MISSING');
  });

  it('should reject JWT with missing communityId claim', async () => {
    const tokenWithoutTenant = jwt.sign(
      {
        userId: testUser._id.toString(),
        role: 'member'
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const response = await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${tokenWithoutTenant}`)
      .expect(403);

    expect(response.body.code).toBe('TENANT_CLAIM_MISSING');
  });

  it('should reject JWT with non-existent community reference', async () => {
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

    expect(response.body.code).toBe('TENANT_NOT_FOUND');
  });

  it('should reject JWT for soft-deleted community', async () => {
    // Soft delete community
    testCommunity.deletedAt = new Date();
    await testCommunity.save();

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
      .expect(403);

    expect(response.body.code).toBe('TENANT_DELETED');
  });

  it('should reject JWT for community with inactive subscription', async () => {
    // Make subscription inactive
    testCommunity.subscription.status = 'canceled';
    testCommunity.subscription.currentPeriodEnd = new Date(Date.now() - 1000);
    await testCommunity.save();

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
      .expect(403);

    expect(response.body.code).toBe('SUBSCRIPTION_INACTIVE');
  });
});

describe('Integration Test: Session Validation', () => {
  it('should accept valid session with active subscription', async () => {
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

    expect(response.body.success).toBe(true);
    expect(response.body.tenant.communityId).toBe(testCommunity._id.toString());
  });

  it('should attach tenant context to request object', async () => {
    const validToken = jwt.sign(
      {
        userId: testUser._id.toString(),
        communityId: testCommunity._id.toString(),
        role: 'admin'
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const response = await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);

    expect(response.body.tenant).toHaveProperty('communityId');
    expect(response.body.tenant).toHaveProperty('userId');
    expect(response.body.tenant).toHaveProperty('userRole');
    expect(response.body.tenant.userRole).toBe('admin');
  });

  it('should validate community subscription tier in context', async () => {
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

    expect(response.body.tenant.subscriptionTier).toBe('professional');
  });

  it('should include Discord guild ID in context', async () => {
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

    expect(response.body.tenant.discordGuildId).toBeTruthy();
  });

  it.skip('should reject session after token revocation', async () => {
    // PENDING: Token revocation not yet implemented
    // Expected: Maintain blacklist of revoked tokens in Redis
    // Check token against blacklist before allowing access
  });

  it.skip('should enforce session timeout after inactivity', async () => {
    // PENDING: Session timeout not yet implemented
    // Expected: Track last activity time, reject if exceeded timeout
  });

  it.skip('should allow session refresh with valid refresh token', async () => {
    // PENDING: Refresh token mechanism not yet implemented
    // Expected: POST /api/auth/refresh with refresh token
  });

  it.skip('should reject session from different IP after suspicious activity', async () => {
    // PENDING: IP-based session validation not yet implemented
    // Expected: Track session IP, require re-auth on IP change
  });

  it.skip('should limit concurrent sessions per user', async () => {
    // PENDING: Concurrent session limiting not yet implemented
    // Expected: Track active sessions, reject new sessions over limit
  });

  it.skip('should invalidate all sessions on password change', async () => {
    // PENDING: Password change session invalidation not implemented
    // Expected: Clear all user sessions when password changes
  });
});

describe('Integration Test: RBAC Edge Cases', () => {
  it('should allow owner role to access admin-only endpoints', async () => {
    const ownerToken = jwt.sign(
      {
        userId: testAdmin._id.toString(),
        communityId: testCommunity._id.toString(),
        role: 'owner'
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const response = await request(app)
      .get('/api/admin-only')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(response.body.success).toBe(true);
  });

  it('should reject non-owner role from admin-only endpoints', async () => {
    const memberToken = jwt.sign(
      {
        userId: testUser._id.toString(),
        communityId: testCommunity._id.toString(),
        role: 'member'
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const response = await request(app)
      .get('/api/admin-only')
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(403);

    expect(response.body.code).toBe('ADMIN_REQUIRED');
  });

  it.skip('should respect permission-based access control', async () => {
    // PENDING: Granular permission checking not fully implemented
    // Expected: Check user.permissions array for specific permission
  });

  it.skip('should allow admin role limited admin access', async () => {
    // PENDING: Admin vs Owner differentiation not fully implemented
  });

  it.skip('should allow moderator role limited moderation access', async () => {
    // PENDING: Moderator role not fully implemented
  });

  it.skip('should deny access to disabled user accounts', async () => {
    // PENDING: User account status checking not implemented
    // Expected: Check user.status === 'active'
  });

  it.skip('should deny access to suspended communities', async () => {
    // PENDING: Community suspension not implemented
    // Expected: Check community.status !== 'suspended'
  });

  it.skip('should enforce role hierarchy in permission checks', async () => {
    // PENDING: Role hierarchy not defined
    // Expected: Owner > Admin > Moderator > Member
  });

  it.skip('should validate user membership in community', async () => {
    // PENDING: User-community membership validation incomplete
  });

  it.skip('should handle role changes mid-session gracefully', async () => {
    // PENDING: Real-time role change detection not implemented
    // Expected: Check role on each request, not just at login
  });
});

describe('Integration Test: WebSocket Authentication', () => {
  it.skip('should authenticate WebSocket connection with valid JWT', async () => {
    // PENDING: WebSocket auth not yet tested
    // Expected: WebSocket handshake includes Authorization header or token query param
    // Server validates JWT before accepting connection
  });

  it.skip('should reject WebSocket connection with invalid JWT', async () => {
    // PENDING: WebSocket auth not yet tested
    // Expected: Return 401 on handshake, close connection
  });

  it.skip('should reject WebSocket connection with expired JWT', async () => {
    // PENDING: WebSocket auth not yet tested
    // Expected: Return 401 on handshake for expired token
  });

  it.skip('should include tenant context in WebSocket connection', async () => {
    // PENDING: WebSocket tenant context not verified
    // Expected: WebSocket connection object includes req.tenant
  });

  it.skip('should disconnect WebSocket on token revocation', async () => {
    // PENDING: Real-time WebSocket disconnection on auth changes not implemented
    // Expected: Publish event to disconnect user's WebSocket when token revoked
  });
});
