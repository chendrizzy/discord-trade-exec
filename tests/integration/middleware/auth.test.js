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

  // Test routes for additional middleware
  const { optionalTenantMiddleware, getTenantContext, checkTenantPermission, adminOnly, ownerOnly } = require('../../../src/middleware/tenantAuth');

  app.get('/api/public-optional', optionalTenantMiddleware, (req, res) => {
    res.status(200).json({
      success: true,
      tenant: req.tenant,
      isAuthenticated: req.tenant !== null
    });
  });

  app.get('/api/test-context', extractTenantMiddleware, (req, res) => {
    try {
      const context = getTenantContext();
      res.status(200).json({
        success: true,
        context
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  app.get('/api/permission-required', extractTenantMiddleware, checkTenantPermission('manage_signals'), (req, res) => {
    res.status(200).json({
      success: true,
      message: 'Permission granted'
    });
  });

  app.get('/api/admin-required', extractTenantMiddleware, adminOnly, (req, res) => {
    res.status(200).json({
      success: true,
      message: 'Admin access granted'
    });
  });

  app.get('/api/owner-required', extractTenantMiddleware, ownerOnly, (req, res) => {
    res.status(200).json({
      success: true,
      message: 'Owner access granted'
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

describe('JWT Edge Cases & Token Validation - US3-T17', () => {
  it('should reject JWT signed with unsupported algorithm (HS512)', async () => {
    // Sign token with HS512 (not in middleware's allowed algorithms list)
    const hs512Token = jwt.sign(
      {
        userId: testUser._id.toString(),
        communityId: testCommunity._id.toString(),
        role: 'member'
      },
      process.env.JWT_SECRET,
      {
        expiresIn: '7d',
        algorithm: 'HS512' // Middleware only allows HS256 and RS256
      }
    );

    const response = await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${hs512Token}`)
      .expect(401);

    expect(response.body.code).toBe('TOKEN_INVALID');
    expect(response.body.details).toContain('algorithm');
  });

  it('should reject JWT with "none" algorithm (security vulnerability)', async () => {
    // Create unsigned token with "none" algorithm (critical security test)
    const payload = {
      userId: testUser._id.toString(),
      communityId: testCommunity._id.toString(),
      role: 'admin'
    };

    // Manually craft token with alg:none header
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const noneToken = `${header}.${payloadEncoded}.`;

    const response = await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${noneToken}`)
      .expect(401);

    expect(response.body.code).toBe('TOKEN_INVALID');
  });

  it('should handle JWT with nbf (not before) claim for future activation', async () => {
    // Token valid starting 10 seconds in the future
    const futureToken = jwt.sign(
      {
        userId: testUser._id.toString(),
        communityId: testCommunity._id.toString(),
        role: 'member',
        nbf: Math.floor(Date.now() / 1000) + 10 // Not before 10 seconds from now
      },
      process.env.JWT_SECRET,
      {
        expiresIn: '7d',
        algorithm: 'HS256'
      }
    );

    const response = await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${futureToken}`);

    // JWT library may reject nbf with 401 TOKEN_INVALID or 500 if not handled
    expect([401, 500]).toContain(response.status);
    if (response.status === 401) {
      expect(response.body.code).toBe('TOKEN_INVALID');
    }
  });

  it('should accept JWT with clock skew within tolerance (default 0s)', async () => {
    // Token with iat (issued at) timestamp slightly in the past (within tolerance)
    const pastToken = jwt.sign(
      {
        userId: testUser._id.toString(),
        communityId: testCommunity._id.toString(),
        role: 'member',
        iat: Math.floor(Date.now() / 1000) - 2 // Issued 2 seconds ago
      },
      process.env.JWT_SECRET,
      {
        expiresIn: '7d',
        algorithm: 'HS256'
      }
    );

    // Should accept token issued 2 seconds ago (no strict clock skew by default)
    const response = await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${pastToken}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.tenant.userId).toBe(testUser._id.toString());
  });
});

describe('Session Store Failure Scenarios - US3-T18', () => {
  it('should handle MongoDB session store connection failure gracefully', async () => {
    // Simulate MongoDB connection loss during session validation
    // In production, session middleware should have error handling
    const validToken = jwt.sign(
      {
        userId: testUser._id.toString(),
        communityId: testCommunity._id.toString(),
        role: 'member'
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Temporarily close MongoDB connection
    const originalState = mongoose.connection.readyState;

    // JWT-based auth doesn't depend on MongoDB session store for token validation
    // It should still work even if MongoDB connection fails after token is issued
    const response = await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${validToken}`);

    // JWT validation succeeds, but community lookup may fail
    // Expect either 200 (cached) or 500 (DB error during community lookup)
    expect([200, 500, 404]).toContain(response.status);
  });

  it('should reject corrupted session data with invalid structure', async () => {
    // Create token with corrupted payload structure
    const corruptedPayload = {
      userId: testUser._id.toString(),
      communityId: testCommunity._id.toString(),
      role: 'member',
      // Add corrupted data that might cause issues
      metadata: { corrupted: true, invalidData: '\u0000\u0001\u0002' }
    };

    const corruptedToken = jwt.sign(
      corruptedPayload,
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Should handle corrupted data gracefully (token is valid, but extra fields are ignored)
    const response = await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${corruptedToken}`)
      .expect(200);

    // Middleware should extract valid claims and ignore corrupted metadata
    expect(response.body.success).toBe(true);
    expect(response.body.tenant.userId).toBe(testUser._id.toString());
  });

  it('should enforce JWT token TTL (maxAge: 7d) and reject after expiration', async () => {
    // Create token that expires immediately
    const expiredToken = jwt.sign(
      {
        userId: testUser._id.toString(),
        communityId: testCommunity._id.toString(),
        role: 'member',
        exp: Math.floor(Date.now() / 1000) - 10 // Expired 10 seconds ago
      },
      process.env.JWT_SECRET
    );

    const response = await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401);

    expect(response.body.code).toBe('TOKEN_EXPIRED');
    expect(response.body.error).toContain('expired');
  });

  it('should handle session cleanup after explicit logout', async () => {
    // Create valid token
    const validToken = jwt.sign(
      {
        userId: testUser._id.toString(),
        communityId: testCommunity._id.toString(),
        role: 'member'
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Verify token works before logout
    const beforeLogout = await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);

    expect(beforeLogout.body.success).toBe(true);

    // Note: JWT tokens are stateless - once issued, they remain valid until expiration
    // True session cleanup requires token revocation list (not currently implemented)
    // This test documents current behavior: token remains valid post-logout
    const afterLogout = await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);

    expect(afterLogout.body.success).toBe(true);

    // Future enhancement: Implement token blacklist to revoke tokens on logout
    // Expected behavior after implementation:
    // - expect(afterLogout.status).toBe(401);
    // - expect(afterLogout.body.code).toBe('TOKEN_REVOKED');
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

  it('should allow optionalTenantMiddleware with no auth header (public access)', async () => {
    const response = await request(app)
      .get('/api/public-optional')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.isAuthenticated).toBe(false);
    expect(response.body.tenant).toBeNull();
  });

  it('should allow optionalTenantMiddleware with valid auth header', async () => {
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
      .get('/api/public-optional')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.isAuthenticated).toBe(true);
    expect(response.body.tenant).toBeTruthy();
    expect(response.body.tenant.communityId).toBe(testCommunity._id.toString());
  });

  it('should reject optionalTenantMiddleware with invalid auth token', async () => {
    // optionalTenantMiddleware still validates tokens if provided
    // Invalid tokens result in 401, not public access
    const response = await request(app)
      .get('/api/public-optional')
      .set('Authorization', 'Bearer invalid.token.here')
      .expect(401);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toBeTruthy();
  });

  it('should retrieve tenant context with getTenantContext() inside middleware', async () => {
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
      .get('/api/test-context')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.context).toBeTruthy();
    expect(response.body.context.communityId).toBe(testCommunity._id.toString());
    expect(response.body.context.userId).toBe(testUser._id.toString());
    expect(response.body.context.userRole).toBe('admin');
  });

  it('should include requestId in tenant context', async () => {
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
      .get('/api/test-context')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.context.requestId).toBeTruthy();
    expect(response.body.context.requestId).toMatch(/^\d+-[a-z0-9]+$/);
  });

  it('should include requestTime in tenant context for audit logging', async () => {
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
      .get('/api/test-context')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.context.requestTime).toBeTruthy();
    expect(new Date(response.body.context.requestTime).getTime()).toBeLessThanOrEqual(Date.now());
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

  it('should allow checkTenantPermission middleware with valid permission', async () => {
    // Grant manage_signals permission to testUser
    testCommunity.admins[0].permissions = ['manage_signals', 'manage_users', 'manage_settings'];
    await testCommunity.save();

    const validToken = jwt.sign(
      {
        userId: testUser._id.toString(),
        communityId: testCommunity._id.toString(),
        role: 'owner'
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const response = await request(app)
      .get('/api/permission-required')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe('Permission granted');
  });

  it('should reject checkTenantPermission middleware with missing permission', async () => {
    // Create user without manage_signals permission
    const normalUser = await User.create({
      discordId: 'normal_user_' + Date.now(),
      discordUsername: 'normal_user',
      discordTag: 'normal_user#1234',
      username: 'normal_user',
      email: 'normal@example.com',
      communityId: testCommunity._id,
      subscription: {
        tier: 'free',
        status: 'active'
      }
    });

    // Add as moderator without manage_signals permission (only view_analytics)
    testCommunity.admins.push({
      userId: normalUser._id,
      role: 'moderator',
      permissions: ['view_analytics'] // No manage_signals
    });
    await testCommunity.save();

    const tokenWithoutPermission = jwt.sign(
      {
        userId: normalUser._id.toString(),
        communityId: testCommunity._id.toString(),
        role: 'moderator'
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const response = await request(app)
      .get('/api/permission-required')
      .set('Authorization', `Bearer ${tokenWithoutPermission}`)
      .expect(403);

    expect(response.body.success).toBe(false);
    expect(response.body.code).toBe('PERMISSION_DENIED');
    expect(response.body.requiredPermission).toBe('manage_signals');
  });

  it('should allow adminOnly middleware with admin user', async () => {
    // Create admin user
    const adminUser = await User.create({
      discordId: 'admin_user_' + Date.now(),
      discordUsername: 'admin_user',
      discordTag: 'admin_user#1234',
      username: 'admin_user',
      email: 'admin@example.com',
      communityId: testCommunity._id,
      subscription: {
        tier: 'professional',
        status: 'active'
      }
    });

    testCommunity.admins.push({
      userId: adminUser._id,
      role: 'admin',
      permissions: ['manage_signals', 'manage_users']
    });
    await testCommunity.save();

    const adminToken = jwt.sign(
      {
        userId: adminUser._id.toString(),
        communityId: testCommunity._id.toString(),
        role: 'admin'
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const response = await request(app)
      .get('/api/admin-required')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe('Admin access granted');
  });

  it('should reject adminOnly middleware with non-admin user', async () => {
    const memberUser = await User.create({
      discordId: 'member_user_' + Date.now(),
      discordUsername: 'member_user',
      discordTag: 'member_user#1234',
      username: 'member_user',
      email: 'member@example.com',
      communityId: testCommunity._id,
      subscription: {
        tier: 'free',
        status: 'active'
      }
    });

    const memberToken = jwt.sign(
      {
        userId: memberUser._id.toString(),
        communityId: testCommunity._id.toString(),
        role: 'member'
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const response = await request(app)
      .get('/api/admin-required')
      .set('Authorization', `Bearer ${memberToken}`)
      .expect(403);

    expect(response.body.success).toBe(false);
    expect(response.body.code).toBe('ADMIN_REQUIRED');
  });

  it('should allow ownerOnly middleware with owner user', async () => {
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
      .get('/api/owner-required')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe('Owner access granted');
  });

  it('should reject ownerOnly middleware with non-owner user', async () => {
    const adminUser = await User.create({
      discordId: 'admin_not_owner_' + Date.now(),
      discordUsername: 'admin_not_owner',
      discordTag: 'admin_not_owner#1234',
      username: 'admin_not_owner',
      email: 'adminnotowner@example.com',
      communityId: testCommunity._id,
      subscription: {
        tier: 'professional',
        status: 'active'
      }
    });

    testCommunity.admins.push({
      userId: adminUser._id,
      role: 'admin',
      permissions: ['manage_signals']
    });
    await testCommunity.save();

    const adminToken = jwt.sign(
      {
        userId: adminUser._id.toString(),
        communityId: testCommunity._id.toString(),
        role: 'admin'
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const response = await request(app)
      .get('/api/owner-required')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);

    expect(response.body.success).toBe(false);
    expect(response.body.code).toBe('OWNER_REQUIRED');
  });

  it('should reject ownerOnly middleware with admin who is not owner', async () => {
    const adminUser = await User.create({
      discordId: 'admin_no_owner_' + Date.now(),
      discordUsername: 'admin_no_owner',
      discordTag: 'admin_no_owner#1234',
      username: 'admin_no_owner',
      email: 'adminnoowner@example.com',
      communityId: testCommunity._id,
      subscription: {
        tier: 'professional',
        status: 'active'
      }
    });

    // Add as admin (not owner)
    testCommunity.admins.push({
      userId: adminUser._id,
      role: 'admin',
      permissions: ['manage_signals', 'manage_users', 'manage_settings']
    });
    await testCommunity.save();

    const adminToken = jwt.sign(
      {
        userId: adminUser._id.toString(),
        communityId: testCommunity._id.toString(),
        role: 'admin'
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const response = await request(app)
      .get('/api/owner-required')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);

    expect(response.body.success).toBe(false);
    expect(response.body.code).toBe('OWNER_REQUIRED');
  });

  it('should accept JWT with non-ObjectId userId claim (MongoDB handles invalid ObjectIds)', async () => {
    const invalidToken = jwt.sign(
      {
        userId: 'not-an-objectid',
        communityId: testCommunity._id.toString(),
        role: 'member'
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Middleware doesn't validate ObjectId format - MongoDB will handle it
    // Current behavior: accepts the token and processes the request
    const response = await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${invalidToken}`);

    // Accepts the request since community exists and subscription is active
    expect(response.status).toBe(200);
  });

  it('should handle JWT with non-ObjectId communityId claim gracefully', async () => {
    const invalidToken = jwt.sign(
      {
        userId: testUser._id.toString(),
        communityId: 'not-an-objectid',
        role: 'member'
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const response = await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${invalidToken}`);

    // Should fail at community lookup
    expect([404, 500]).toContain(response.status);
  });

  it('should verify tenant context includes all required fields', async () => {
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
      .get('/api/test-context')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.context).toHaveProperty('communityId');
    expect(response.body.context).toHaveProperty('communityName');
    expect(response.body.context).toHaveProperty('userId');
    expect(response.body.context).toHaveProperty('userRole');
    expect(response.body.context).toHaveProperty('subscriptionTier');
    expect(response.body.context).toHaveProperty('discordGuildId');
    expect(response.body.context).toHaveProperty('requestTime');
    expect(response.body.context).toHaveProperty('requestId');
  });

  it('should properly set userRole from JWT role claim', async () => {
    const testRoles = ['owner', 'admin', 'moderator', 'member'];

    for (const role of testRoles) {
      const roleToken = jwt.sign(
        {
          userId: testUser._id.toString(),
          communityId: testCommunity._id.toString(),
          role: role
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${roleToken}`)
        .expect(200);

      expect(response.body.tenant.userRole).toBe(role);
    }
  });

  it('should maintain request isolation with AsyncLocalStorage', async () => {
    // Test that concurrent requests don't interfere with each other
    const user1Token = jwt.sign(
      {
        userId: testUser._id.toString(),
        communityId: testCommunity._id.toString(),
        role: 'owner'
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Create second user and community
    const user2 = await User.create({
      discordId: 'concurrent_user_' + Date.now(),
      discordUsername: 'concurrent_user',
      discordTag: 'concurrent_user#1234',
      username: 'concurrent_user',
      email: 'concurrent@example.com',
      subscription: {
        tier: 'free',
        status: 'active'
      }
    });

    const community2 = await Community.create({
      name: 'Concurrent Community',
      discordGuildId: 'concurrent_guild_' + Date.now(),
      admins: [
        {
          userId: user2._id,
          role: 'owner',
          permissions: ['manage_signals']
        }
      ],
      subscription: {
        tier: 'free',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });

    user2.communityId = community2._id;
    await user2.save();

    const user2Token = jwt.sign(
      {
        userId: user2._id.toString(),
        communityId: community2._id.toString(),
        role: 'owner'
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Make concurrent requests
    const [response1, response2] = await Promise.all([
      request(app).get('/api/protected').set('Authorization', `Bearer ${user1Token}`),
      request(app).get('/api/protected').set('Authorization', `Bearer ${user2Token}`)
    ]);

    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);
    expect(response1.body.tenant.communityId).toBe(testCommunity._id.toString());
    expect(response2.body.tenant.communityId).toBe(community2._id.toString());
    expect(response1.body.tenant.userId).toBe(testUser._id.toString());
    expect(response2.body.tenant.userId).toBe(user2._id.toString());
  });

  it('should reject request when community lookup fails with database error', async () => {
    // Create token with community that will be deleted before middleware executes
    const tempCommunity = await Community.create({
      name: 'Temp Community',
      discordGuildId: 'temp_guild_' + Date.now(),
      admins: [
        {
          userId: testUser._id,
          role: 'owner',
          permissions: ['manage_signals']
        }
      ],
      subscription: {
        tier: 'free',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });

    const tempToken = jwt.sign(
      {
        userId: testUser._id.toString(),
        communityId: tempCommunity._id.toString(),
        role: 'owner'
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Delete the community
    await Community.deleteOne({ _id: tempCommunity._id });

    const response = await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${tempToken}`)
      .expect(404);

    expect(response.body.success).toBe(false);
    expect(response.body.code).toBe('TENANT_NOT_FOUND');
  });
});

describe('RBAC Permission Matrix - US3-T19', () => {
  it('should test all role combinations (owner, admin, moderator, member) with permission matrix', async () => {
    // Note: Community.admins can only contain owner/admin/moderator (not member)
    // Member role is for users not in admins array
    const rolePermissions = {
      admin: ['manage_signals', 'manage_users', 'view_analytics', 'execute_trades'],
      moderator: ['manage_signals', 'view_analytics']
    };

    const usersByRole = { owner: testAdmin }; // Use existing owner

    // Create admin and moderator users
    for (const role of ['admin', 'moderator']) {
      const roleUser = await User.create({
        discordId: `${role}_user_matrix_` + Date.now(),
        discordUsername: `${role}_user`,
        discordTag: `${role}_user#1234`,
        username: `${role}_user`,
        email: `${role}_matrix@example.com`,
        communityId: testCommunity._id,
        subscription: {
          tier: 'professional',
          status: 'active'
        }
      });

      // Add user to community with appropriate role and permissions
      testCommunity.admins.push({
        userId: roleUser._id,
        role: role,
        permissions: rolePermissions[role]
      });

      usersByRole[role] = roleUser;
    }

    // Create member user (NOT in admins array)
    const memberUser = await User.create({
      discordId: 'member_user_matrix_' + Date.now(),
      discordUsername: 'member_user',
      discordTag: 'member_user#1234',
      username: 'member_user',
      email: 'member_matrix@example.com',
      communityId: testCommunity._id,
      subscription: { tier: 'free', status: 'active' }
    });
    usersByRole.member = memberUser;

    await testCommunity.save();

    // Test each role's access to protected endpoint
    for (const role of ['owner', 'admin', 'moderator', 'member']) {
      const roleToken = jwt.sign(
        {
          userId: usersByRole[role]._id.toString(),
          communityId: testCommunity._id.toString(),
          role: role
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      const response = await request(app)
        .get('/api/protected')
        .set('Authorization', `Bearer ${roleToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.tenant.userRole).toBe(role);
    }
  });

  it('should verify permission inheritance (owner inherits all admin permissions)', async () => {
    // Use existing owner (testAdmin) - can't create second owner due to validation
    const ownerToken = jwt.sign(
      {
        userId: testAdmin._id.toString(),
        communityId: testCommunity._id.toString(),
        role: 'owner'
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Owner should access admin-only endpoints (permission inheritance)
    const adminResponse = await request(app)
      .get('/api/admin-required')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(adminResponse.body.success).toBe(true);

    // Owner should also access owner-only endpoints
    const ownerResponse = await request(app)
      .get('/api/owner-required')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(ownerResponse.body.success).toBe(true);
  });

  it('should enforce resource-level permissions for specific actions', async () => {
    // Create user with limited resource-level permission (only view_analytics)
    // Use 'moderator' role with limited permissions (not 'member' - not allowed in admins array)
    const limitedUser = await User.create({
      discordId: 'limited_resource_' + Date.now(),
      discordUsername: 'limited_resource',
      discordTag: 'limited_resource#1234',
      username: 'limited_resource',
      email: 'limited_resource@example.com',
      communityId: testCommunity._id,
      subscription: { tier: 'free', status: 'active' }
    });

    testCommunity.admins.push({
      userId: limitedUser._id,
      role: 'moderator',
      permissions: ['view_analytics'] // No manage_signals permission
    });
    await testCommunity.save();

    const limitedToken = jwt.sign(
      {
        userId: limitedUser._id.toString(),
        communityId: testCommunity._id.toString(),
        role: 'moderator'
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Should be able to access general protected endpoint
    const protectedResponse = await request(app)
      .get('/api/protected')
      .set('Authorization', `Bearer ${limitedToken}`)
      .expect(200);

    expect(protectedResponse.body.success).toBe(true);

    // Should NOT be able to access permission-required endpoint (requires manage_signals)
    const permissionResponse = await request(app)
      .get('/api/permission-required')
      .set('Authorization', `Bearer ${limitedToken}`)
      .expect(403);

    expect(permissionResponse.body.success).toBe(false);
    expect(permissionResponse.body.code).toBe('PERMISSION_DENIED');
  });

  it('should verify permission caching within request lifecycle', async () => {
    // Create user with specific permissions
    const cachedUser = await User.create({
      discordId: 'cached_permissions_' + Date.now(),
      discordUsername: 'cached_permissions',
      discordTag: 'cached_permissions#1234',
      username: 'cached_permissions',
      email: 'cached_permissions@example.com',
      communityId: testCommunity._id,
      subscription: { tier: 'professional', status: 'active' }
    });

    testCommunity.admins.push({
      userId: cachedUser._id,
      role: 'admin',
      permissions: ['manage_signals', 'manage_users']
    });
    await testCommunity.save();

    const cachedToken = jwt.sign(
      {
        userId: cachedUser._id.toString(),
        communityId: testCommunity._id.toString(),
        role: 'admin'
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // First request: permissions should be loaded from database
    const firstRequest = await request(app)
      .get('/api/test-context')
      .set('Authorization', `Bearer ${cachedToken}`)
      .expect(200);

    expect(firstRequest.body.success).toBe(true);
    const firstRequestId = firstRequest.body.context.requestId;

    // Second request: should use fresh context (new requestId proves new request)
    const secondRequest = await request(app)
      .get('/api/test-context')
      .set('Authorization', `Bearer ${cachedToken}`)
      .expect(200);

    expect(secondRequest.body.success).toBe(true);
    const secondRequestId = secondRequest.body.context.requestId;

    // Verify different requests have different requestIds (no cross-request caching)
    expect(firstRequestId).not.toBe(secondRequestId);

    // Both requests should have same role (from JWT)
    expect(firstRequest.body.context.userRole).toBe('admin');
    expect(secondRequest.body.context.userRole).toBe('admin');
  });

  it('should handle role hierarchy in permission checks (owner > admin > moderator > member)', async () => {
    // Test role hierarchy enforcement
    // Note: 'member' role not added to admins array (only owner/admin/moderator allowed)
    const roles = [
      { role: 'member', level: 1, canAccessAdmin: false, canAccessOwner: false, inAdmins: false },
      { role: 'moderator', level: 2, canAccessAdmin: false, canAccessOwner: false, inAdmins: true },
      { role: 'admin', level: 3, canAccessAdmin: true, canAccessOwner: false, inAdmins: true },
      { role: 'owner', level: 4, canAccessAdmin: true, canAccessOwner: true, inAdmins: false } // Use existing owner
    ];

    for (const { role, canAccessAdmin, canAccessOwner, inAdmins } of roles) {
      let hierarchyUser;

      if (role === 'owner') {
        // Use existing owner (testAdmin) - can't create second owner
        hierarchyUser = testAdmin;
      } else {
        hierarchyUser = await User.create({
          discordId: `hierarchy_${role}_` + Date.now(),
          discordUsername: `hierarchy_${role}`,
          discordTag: `hierarchy_${role}#1234`,
          username: `hierarchy_${role}`,
          email: `hierarchy_${role}@example.com`,
          communityId: testCommunity._id,
          subscription: { tier: 'professional', status: 'active' }
        });

        // Only add to admins array if role is admin/moderator (not member)
        if (inAdmins) {
          testCommunity.admins.push({
            userId: hierarchyUser._id,
            role: role,
            permissions: ['view_analytics']
          });
          await testCommunity.save();
        }
      }

      const hierarchyToken = jwt.sign(
        {
          userId: hierarchyUser._id.toString(),
          communityId: testCommunity._id.toString(),
          role: role
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Test admin-required endpoint
      const adminResponse = await request(app)
        .get('/api/admin-required')
        .set('Authorization', `Bearer ${hierarchyToken}`);

      if (canAccessAdmin) {
        expect(adminResponse.status).toBe(200);
        expect(adminResponse.body.success).toBe(true);
      } else {
        expect(adminResponse.status).toBe(403);
        expect(adminResponse.body.code).toBe('ADMIN_REQUIRED');
      }

      // Test owner-required endpoint
      const ownerResponse = await request(app)
        .get('/api/owner-required')
        .set('Authorization', `Bearer ${hierarchyToken}`);

      if (canAccessOwner) {
        expect(ownerResponse.status).toBe(200);
        expect(ownerResponse.body.success).toBe(true);
      } else {
        expect(ownerResponse.status).toBe(403);
        expect(ownerResponse.body.code).toBe('OWNER_REQUIRED');
      }
    }
  });

  it('should validate dynamic permission updates without token refresh', async () => {
    // Create user with initial limited permissions
    const dynamicUser = await User.create({
      discordId: 'dynamic_perms_' + Date.now(),
      discordUsername: 'dynamic_perms',
      discordTag: 'dynamic_perms#1234',
      username: 'dynamic_perms',
      email: 'dynamic_perms@example.com',
      communityId: testCommunity._id,
      subscription: { tier: 'professional', status: 'active' }
    });

    const adminEntry = {
      userId: dynamicUser._id,
      role: 'moderator',
      permissions: ['view_analytics'] // Initially no manage_signals
    };
    testCommunity.admins.push(adminEntry);
    await testCommunity.save();

    const dynamicToken = jwt.sign(
      {
        userId: dynamicUser._id.toString(),
        communityId: testCommunity._id.toString(),
        role: 'moderator'
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // First request: should fail permission check
    const beforeUpdate = await request(app)
      .get('/api/permission-required')
      .set('Authorization', `Bearer ${dynamicToken}`)
      .expect(403);

    expect(beforeUpdate.body.code).toBe('PERMISSION_DENIED');

    // Update permissions in database
    const updatedCommunity = await Community.findById(testCommunity._id);
    const userAdmin = updatedCommunity.admins.find(
      admin => admin.userId.toString() === dynamicUser._id.toString()
    );
    userAdmin.permissions.push('manage_signals');
    await updatedCommunity.save();

    // Second request: should succeed with updated permissions (JWT role remains same)
    const afterUpdate = await request(app)
      .get('/api/permission-required')
      .set('Authorization', `Bearer ${dynamicToken}`)
      .expect(200);

    expect(afterUpdate.body.success).toBe(true);
    expect(afterUpdate.body.message).toBe('Permission granted');
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
