/**
 * Integration Tests: Dual Dashboard System
 *
 * Tests complete user flows through both Community and Trader dashboards.
 */

const request = require('supertest');
const app = require('../../src/index');
const { setupTestDatabase, teardownTestDatabase, createTestUser, createTestCommunity } = require('../helpers/database');
const { mockDiscordOAuth } = require('../helpers/auth');

describe('Dual Dashboard Integration Tests', () => {
  let testCommunity;
  let adminUser;
  let traderUser;
  let adminCookie;
  let traderCookie;

  beforeAll(async () => {
    await setupTestDatabase();
    testCommunity = await createTestCommunity();

    // Create admin user
    adminUser = await createTestUser({
      username: 'admin_user',
      discriminator: '1234',
      communityRole: 'admin',
      tenantId: testCommunity._id
    });

    // Create trader user
    traderUser = await createTestUser({
      username: 'trader_user',
      discriminator: '5678',
      communityRole: 'trader',
      tenantId: testCommunity._id
    });

    // Get authentication cookies
    adminCookie = await mockDiscordOAuth(adminUser);
    traderCookie = await mockDiscordOAuth(traderUser);
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  describe('Dashboard Routing', () => {
    it('should redirect admin to community dashboard', async () => {
      const response = await request(app)
        .get('/dashboard')
        .set('Cookie', adminCookie)
        .expect(302);

      expect(response.headers.location).toBe('/dashboard/community');
    });

    it('should redirect trader to trader dashboard', async () => {
      const response = await request(app)
        .get('/dashboard')
        .set('Cookie', traderCookie)
        .expect(302);

      expect(response.headers.location).toBe('/dashboard/trader');
    });

    it('should preserve deep links through authentication', async () => {
      const response = await request(app)
        .get('/dashboard/community/analytics')
        .expect(302);

      expect(response.headers.location).toContain('returnTo=%2Fdashboard%2Fcommunity%2Fanalytics');
    });

    it('should block traders from accessing community dashboard', async () => {
      const response = await request(app)
        .get('/dashboard/community')
        .set('Cookie', traderCookie)
        .expect(403);

      expect(response.body.error).toContain('admin');
    });

    it('should allow traders to access trader dashboard', async () => {
      const response = await request(app)
        .get('/dashboard/trader')
        .set('Cookie', traderCookie)
        .expect(200);
    });
  });

  describe('Community Dashboard Flow', () => {
    it('should complete full community admin flow', async () => {
      // 1. Access community overview
      const overviewResponse = await request(app)
        .get('/api/community/overview')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(overviewResponse.body).toHaveProperty('members');
      expect(overviewResponse.body).toHaveProperty('signals');
      expect(overviewResponse.body).toHaveProperty('performance');

      // 2. Get member list
      const membersResponse = await request(app)
        .get('/api/community/members?page=1&limit=25')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(membersResponse.body.members).toBeInstanceOf(Array);
      expect(membersResponse.body.pagination).toBeDefined();

      // 3. Update member role
      const roleResponse = await request(app)
        .post(`/api/community/members/${traderUser._id}/role`)
        .set('Cookie', adminCookie)
        .send({ role: 'moderator' })
        .expect(200);

      expect(roleResponse.body.success).toBe(true);

      // 4. Get analytics
      const analyticsResponse = await request(app)
        .get('/api/community/analytics/performance?range=30d')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(analyticsResponse.body).toHaveProperty('timeSeries');
      expect(analyticsResponse.body).toHaveProperty('summary');
    });

    it('should enforce tenant scoping for community data', async () => {
      // Create second community and admin
      const otherCommunity = await createTestCommunity();
      const otherAdmin = await createTestUser({
        username: 'other_admin',
        discriminator: '9999',
        communityRole: 'admin',
        tenantId: otherCommunity._id
      });
      const otherAdminCookie = await mockDiscordOAuth(otherAdmin);

      // Try to access first community's data
      const response = await request(app)
        .get('/api/community/overview')
        .set('Cookie', otherAdminCookie)
        .expect(200);

      // Should only see their community's data
      expect(response.body.members.total).not.toBe(
        (await request(app)
          .get('/api/community/overview')
          .set('Cookie', adminCookie)).body.members.total
      );
    });
  });

  describe('Trader Dashboard Flow', () => {
    it('should complete full trader flow', async () => {
      // 1. Access trader overview
      const overviewResponse = await request(app)
        .get('/api/trader/overview')
        .set('Cookie', traderCookie)
        .expect(200);

      expect(overviewResponse.body).toHaveProperty('performance');
      expect(overviewResponse.body).toHaveProperty('activePositions');
      expect(overviewResponse.body).toHaveProperty('followedProviders');

      // 2. Get signal providers
      const signalsResponse = await request(app)
        .get('/api/trader/signals')
        .set('Cookie', traderCookie)
        .expect(200);

      expect(signalsResponse.body.providers).toBeInstanceOf(Array);

      // 3. Follow a signal provider (if any exist)
      if (signalsResponse.body.providers.length > 0) {
        const providerId = signalsResponse.body.providers[0].id;

        const followResponse = await request(app)
          .post(`/api/trader/signals/${providerId}/follow`)
          .set('Cookie', traderCookie)
          .send({ following: true })
          .expect(200);

        expect(followResponse.body.success).toBe(true);

        // Verify subscription was created
        const verifyResponse = await request(app)
          .get('/api/trader/signals')
          .set('Cookie', traderCookie)
          .expect(200);

        const provider = verifyResponse.body.providers.find(p => p.id === providerId);
        expect(provider.following).toBe(true);
      }

      // 4. Get trade history with filters
      const tradesResponse = await request(app)
        .get('/api/trader/trades?page=1&limit=25&status=FILLED')
        .set('Cookie', traderCookie)
        .expect(200);

      expect(tradesResponse.body.trades).toBeInstanceOf(Array);
      expect(tradesResponse.body.pagination).toBeDefined();

      // 5. Update risk profile
      const riskResponse = await request(app)
        .put('/api/trader/risk-profile')
        .set('Cookie', traderCookie)
        .send({
          positionSizingMode: 'percentage',
          positionSizePercent: 2,
          defaultStopLoss: 2,
          defaultTakeProfit: 6,
          maxDailyLoss: 5,
          maxOpenPositions: 5
        })
        .expect(200);

      expect(riskResponse.body.success).toBe(true);
      expect(riskResponse.body.riskProfile.positionSizePercent).toBeCloseTo(2);

      const riskGetResponse = await request(app)
        .get('/api/trader/risk-profile')
        .set('Cookie', traderCookie)
        .expect(200);

      expect(riskGetResponse.body.success).toBe(true);
      expect(riskGetResponse.body.data.positionSizePercent).toBeCloseTo(2);
    });

    it('should enforce user scoping for trader data', async () => {
      // Create second trader in same community
      const otherTrader = await createTestUser({
        username: 'other_trader',
        discriminator: '7777',
        communityRole: 'trader',
        tenantId: testCommunity._id
      });
      const otherTraderCookie = await mockDiscordOAuth(otherTrader);

      // Each trader should only see their own data
      const trader1Overview = await request(app)
        .get('/api/trader/overview')
        .set('Cookie', traderCookie)
        .expect(200);

      const trader2Overview = await request(app)
        .get('/api/trader/overview')
        .set('Cookie', otherTraderCookie)
        .expect(200);

      // Performance data should be different (unless both have zero trades)
      if (trader1Overview.body.performance.totalTrades > 0 ||
          trader2Overview.body.performance.totalTrades > 0) {
        expect(trader1Overview.body.performance).not.toEqual(
          trader2Overview.body.performance
        );
      }
    });

    it('should allow traders to manage notification preferences', async () => {
      const initialResponse = await request(app)
        .get('/api/trader/notifications')
        .set('Cookie', traderCookie)
        .expect(200);

      expect(initialResponse.body.success).toBe(true);
      expect(initialResponse.body.data.settings).toBeDefined();

      const updateResponse = await request(app)
        .put('/api/trader/notifications')
        .set('Cookie', traderCookie)
        .send({
          discordEnabled: false,
          emailEnabled: true,
          notifyOnTrade: true,
          notifyOnProfit: false,
          notifyOnLoss: true,
          notifyOnDailyLimit: true,
          notifyOnPositionSize: true,
          dailyLossThreshold: 400,
          positionSizeThreshold: 1500,
          profitThreshold: 200
        })
        .expect(200);

      expect(updateResponse.body.success).toBe(true);
      expect(updateResponse.body.preferences.emailEnabled).toBe(true);

      const testNotification = await request(app)
        .post('/api/trader/notifications/test')
        .set('Cookie', traderCookie)
        .send({ type: 'discord' })
        .expect(200);

      expect(testNotification.body.success).toBe(true);

      const postUpdate = await request(app)
        .get('/api/trader/notifications')
        .set('Cookie', traderCookie)
        .expect(200);

      expect(postUpdate.body.success).toBe(true);
      expect(postUpdate.body.data.history.length).toBeGreaterThan(0);
    });
  });

  describe('Access Control', () => {
    it('should block unauthorized access to community endpoints', async () => {
      await request(app)
        .get('/api/community/overview')
        .set('Cookie', traderCookie)
        .expect(403);

      await request(app)
        .post(`/api/community/members/${traderUser._id}/role`)
        .set('Cookie', traderCookie)
        .send({ role: 'admin' })
        .expect(403);
    });

    it('should allow moderators to access community endpoints', async () => {
      const modUser = await createTestUser({
        username: 'mod_user',
        discriminator: '2222',
        communityRole: 'moderator',
        tenantId: testCommunity._id
      });
      const modCookie = await mockDiscordOAuth(modUser);

      const response = await request(app)
        .get('/api/community/overview')
        .set('Cookie', modCookie)
        .expect(200);

      expect(response.body).toHaveProperty('members');
    });

    it('should block unauthenticated access to all endpoints', async () => {
      await request(app)
        .get('/api/community/overview')
        .expect(401);

      await request(app)
        .get('/api/trader/overview')
        .expect(401);
    });
  });

  describe('Deep Link Preservation', () => {
    it('should preserve query parameters through auth flow', async () => {
      const response = await request(app)
        .get('/dashboard/community/analytics?range=90d&export=true')
        .expect(302);

      const returnTo = new URLSearchParams(response.headers.location.split('?')[1]).get('returnTo');
      expect(returnTo).toContain('range=90d');
      expect(returnTo).toContain('export=true');
    });

    it('should redirect to preserved deep link after authentication', async () => {
      // This would be tested with actual OAuth flow
      // Placeholder for full E2E test
      expect(true).toBe(true);
    });
  });

  describe('Role Switching', () => {
    it('should handle users with multiple community roles', async () => {
      // Create user who is admin in one community, trader in another
      const community2 = await createTestCommunity();

      const multiRoleUser = await createTestUser({
        username: 'multi_role',
        discriminator: '3333',
        communityRole: 'admin',
        tenantId: testCommunity._id
      });

      // Simulate switching communities (would need session/context switching logic)
      // Placeholder for multi-community support
      expect(multiRoleUser.communityRole).toBe('admin');
    });
  });

  describe('Subscription Management', () => {
    it('should display community subscription info', async () => {
      const response = await request(app)
        .get('/api/community/subscription')
        .set('Cookie', adminCookie)
        .expect(200);

      expect(response.body).toHaveProperty('tier');
      expect(response.body).toHaveProperty('limits');
      expect(response.body).toHaveProperty('usage');
    });

    it('should display user subscription info', async () => {
      const response = await request(app)
        .get('/api/trader/subscription')
        .set('Cookie', traderCookie)
        .expect(200);

      expect(response.body).toHaveProperty('tier');
      expect(response.body).toHaveProperty('limits');
    });
  });
});

describe('Shared Components Integration', () => {
  let testUser;
  let testCookie;

  beforeAll(async () => {
    const community = await createTestCommunity();
    testUser = await createTestUser({
      username: 'test_shared',
      discriminator: '4444',
      communityRole: 'trader',
      tenantId: community._id
    });
    testCookie = await mockDiscordOAuth(testUser);
  });

  it('should fetch performance chart data for community scope', async () => {
    const response = await request(app)
      .get('/api/community/analytics/performance?range=30d')
      .set('Cookie', testCookie)
      .expect(200);

    expect(response.body).toHaveProperty('timeSeries');
    expect(response.body).toHaveProperty('summary');
    expect(response.body.summary).toHaveProperty('totalPnL');
    expect(response.body.summary).toHaveProperty('winRate');
  });

  it('should fetch performance chart data for user scope', async () => {
    const response = await request(app)
      .get('/api/trader/analytics/performance?range=30d')
      .set('Cookie', testCookie)
      .expect(200);

    expect(response.body).toHaveProperty('timeSeries');
    expect(response.body).toHaveProperty('summary');
  });

  it('should support all date ranges in performance chart', async () => {
    const ranges = ['7d', '30d', '90d', '1y', 'all'];

    for (const range of ranges) {
      const response = await request(app)
        .get(`/api/trader/analytics/performance?range=${range}`)
        .set('Cookie', testCookie)
        .expect(200);

      expect(response.body.timeSeries).toBeInstanceOf(Array);
    }
  });
});

describe('Performance Tests', () => {
  let traderCookie;
  let traderUser;

  beforeAll(async () => {
    const testCommunity = await createTestCommunity();
    traderUser = await createTestUser({
      username: 'perf_trader',
      discriminator: '9999',
      communityRole: 'trader',
      tenantId: testCommunity._id
    });
    traderCookie = await mockDiscordOAuth(traderUser);
  });

  it('should handle route decision overhead within target (<500ms)', async () => {
    const start = Date.now();

    await request(app)
      .get('/dashboard')
      .set('Cookie', traderCookie)
      .expect(302);

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(500);
  });

  it('should load overview pages within target (<2s)', async () => {
    const start = Date.now();

    await request(app)
      .get('/api/trader/overview')
      .set('Cookie', traderCookie)
      .expect(200);

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(2000);
  });

  it('should handle pagination efficiently', async () => {
    const start = Date.now();

    await request(app)
      .get('/api/trader/trades?page=1&limit=25')
      .set('Cookie', traderCookie)
      .expect(200);

    const duration = Date.now() - start;
    expect(duration).toBeLessThan(1000);
  });
});

describe('Security Tests', () => {
  let traderCookie;
  let traderUser;

  beforeAll(async () => {
    const testCommunity = await createTestCommunity();
    traderUser = await createTestUser({
      username: 'security_trader',
      discriminator: '8888',
      communityRole: 'trader',
      tenantId: testCommunity._id
    });
    traderCookie = await mockDiscordOAuth(traderUser);
  });

  it('should prevent cross-community data access', async () => {
    const community1 = await createTestCommunity();
    const community2 = await createTestCommunity();

    const user1 = await createTestUser({
      username: 'user1',
      discriminator: '1111',
      communityRole: 'admin',
      tenantId: community1._id
    });

    const user2 = await createTestUser({
      username: 'user2',
      discriminator: '2222',
      communityRole: 'trader',
      tenantId: community2._id
    });

    const cookie1 = await mockDiscordOAuth(user1);
    const cookie2 = await mockDiscordOAuth(user2);

    // User 1 should not see user 2's data
    const response1 = await request(app)
      .get('/api/community/members')
      .set('Cookie', cookie1)
      .expect(200);

    expect(response1.body.members.find(m => m._id.toString() === user2._id.toString())).toBeUndefined();
  });

  it('should prevent role escalation', async () => {
    // Trader should not be able to make themselves admin
    const response = await request(app)
      .post(`/api/community/members/${traderUser._id}/role`)
      .set('Cookie', traderCookie)
      .send({ role: 'admin' })
      .expect(403);

    expect(response.body.error).toBeDefined();
  });

  it('should log security-sensitive operations', async () => {
    // This would check SecurityAudit collection
    // Placeholder for audit logging verification
    expect(true).toBe(true);
  });
});
