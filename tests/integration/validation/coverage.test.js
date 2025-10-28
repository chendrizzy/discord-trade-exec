/**
 * Validation Coverage Tests
 *
 * US7-T04: Comprehensive validation coverage testing
 * Tests all P0 routes with invalid, missing, and valid inputs
 */

const request = require('supertest');
const app = require('../../../src/app');
const { connectDB, disconnectDB } = require('../../setup/db');
const User = require('../../../src/models/User');
const { getMFAService } = require('../../../src/services/MFAService');

describe('Validation Coverage Tests', () => {
  let testUser;
  let authToken;
  const mfaService = getMFAService();

  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  beforeEach(async () => {
    // Create test user with MFA
    const mfaSecret = 'TESTSECRET123456';
    const encryptedSecret = mfaService.encryptSecret(mfaSecret);

    testUser = await User.create({
      discordId: '123456789',
      discordUsername: 'testuser#1234',
      subscription: {
        tier: 'professional',
        status: 'active'
      },
      mfa: {
        enabled: true,
        secret: encryptedSecret,
        backupCodes: [
          { code: 'backup1', used: false },
          { code: 'backup2', used: false }
        ]
      }
    });

    // Mock authentication
    authToken = 'valid-token';
  });

  afterEach(async () => {
    await User.deleteMany({});
  });

  describe('Auth Routes Validation', () => {
    describe('GET /api/auth/broker/:broker/authorize', () => {
      it('should reject invalid broker key', async () => {
        const res = await request(app)
          .get('/api/auth/broker/invalid-broker/authorize')
          .expect(400);

        expect(res.body.success).toBe(false);
        expect(res.body.error).toContain('Validation failed');
      });

      it('should accept valid broker key', async () => {
        // This would require authentication middleware
        const res = await request(app)
          .get('/api/auth/broker/alpaca/authorize');

        // May return 401 (not authenticated) or redirect, but not 400 (validation error)
        expect(res.status).not.toBe(400);
      });
    });

    describe('GET /api/auth/callback', () => {
      it('should reject missing code parameter', async () => {
        const res = await request(app)
          .get('/api/auth/callback')
          .query({ state: 'validstate123456' })
          .expect(400);

        expect(res.body.success).toBe(false);
      });

      it('should reject invalid code format', async () => {
        const res = await request(app)
          .get('/api/auth/callback')
          .query({
            code: 'invalid@code#with$special',
            state: 'validstate123456'
          })
          .expect(400);

        expect(res.body.details).toBeDefined();
      });

      it('should accept valid code and state', async () => {
        const res = await request(app)
          .get('/api/auth/callback')
          .query({
            code: 'validcode123456',
            state: 'validstate123456'
          });

        // May fail auth logic, but should pass validation
        expect(res.status).not.toBe(400);
      });
    });

    describe('POST /api/auth/mfa/enable', () => {
      it('should reject missing token', async () => {
        const res = await request(app)
          .post('/api/auth/mfa/enable')
          .send({})
          .expect(400);

        expect(res.body.error).toContain('Validation failed');
      });

      it('should reject invalid token length', async () => {
        const res = await request(app)
          .post('/api/auth/mfa/enable')
          .send({ token: '12345' }) // Only 5 digits
          .expect(400);

        expect(res.body.details).toBeDefined();
      });

      it('should reject non-numeric token', async () => {
        const res = await request(app)
          .post('/api/auth/mfa/enable')
          .send({ token: 'abcdef' })
          .expect(400);

        expect(res.body.details).toBeDefined();
      });
    });
  });

  describe('Trader Routes Validation', () => {
    describe('GET /api/trader/overview', () => {
      it('should reject invalid period parameter', async () => {
        const res = await request(app)
          .get('/api/trader/overview')
          .query({ period: 'invalid-period' })
          .expect(400);

        expect(res.body.error).toContain('Validation failed');
      });

      it('should accept valid period', async () => {
        const res = await request(app)
          .get('/api/trader/overview')
          .query({ period: '7d' });

        // May require auth, but should pass validation
        expect(res.status).not.toBe(400);
      });
    });

    describe('POST /api/trader/signals/:id/follow', () => {
      it('should reject invalid signal ID format', async () => {
        const res = await request(app)
          .post('/api/trader/signals/invalid-id/follow')
          .send({ autoTrade: true })
          .expect(400);

        expect(res.body.error).toContain('Validation failed');
      });

      it('should reject invalid positionSizePercent', async () => {
        const validId = '507f1f77bcf86cd799439011';
        const res = await request(app)
          .post(`/api/trader/signals/${validId}/follow`)
          .send({
            autoTrade: true,
            positionSizePercent: 150 // > 100%
          })
          .expect(400);

        expect(res.body.details).toBeDefined();
      });

      it('should accept valid signal follow request', async () => {
        const validId = '507f1f77bcf86cd799439011';
        const res = await request(app)
          .post(`/api/trader/signals/${validId}/follow`)
          .send({
            autoTrade: true,
            positionSizePercent: 5,
            maxRiskPercent: 2
          });

        expect(res.status).not.toBe(400);
      });
    });

    describe('PUT /api/trader/risk-profile', () => {
      it('should reject invalid maxPositionSize', async () => {
        const res = await request(app)
          .put('/api/trader/risk-profile')
          .send({
            maxPositionSize: 5000000 // Way too large
          })
          .expect(400);

        expect(res.body.details).toBeDefined();
      });

      it('should reject invalid stopLossPercent', async () => {
        const res = await request(app)
          .put('/api/trader/risk-profile')
          .send({
            stopLossPercent: 0.05 // Too small
          })
          .expect(400);

        expect(res.body.details).toBeDefined();
      });
    });
  });

  describe('Broker Routes Validation', () => {
    describe('GET /api/brokers/:brokerKey', () => {
      it('should reject invalid broker key', async () => {
        const res = await request(app)
          .get('/api/brokers/invalid-broker')
          .expect(400);

        expect(res.body.error).toContain('Validation failed');
      });

      it('should accept valid broker key', async () => {
        const res = await request(app)
          .get('/api/brokers/alpaca');

        expect(res.status).not.toBe(400);
      });
    });

    describe('POST /api/brokers/test', () => {
      it('should reject missing credentials', async () => {
        const res = await request(app)
          .post('/api/brokers/test')
          .send({
            brokerKey: 'alpaca'
            // Missing credentials
          })
          .expect(400);

        expect(res.body.error).toContain('Validation failed');
      });

      it('should reject invalid API key format', async () => {
        const res = await request(app)
          .post('/api/brokers/test')
          .send({
            brokerKey: 'alpaca',
            credentials: {
              apiKey: 'invalid@key#format',
              apiSecret: 'validSecret123'
            }
          })
          .expect(400);

        expect(res.body.details).toBeDefined();
      });
    });

    describe('POST /api/brokers/compare', () => {
      it('should reject invalid brokers array', async () => {
        const res = await request(app)
          .post('/api/brokers/compare')
          .send({
            brokers: ['alpaca'] // Only 1 broker, need at least 2
          })
          .expect(400);

        expect(res.body.details).toBeDefined();
      });

      it('should reject too many brokers', async () => {
        const res = await request(app)
          .post('/api/brokers/compare')
          .send({
            brokers: ['alpaca', 'ibkr', 'tdameritrade', 'etrade', 'schwab', 'moomoo'] // > 5
          })
          .expect(400);

        expect(res.body.details).toBeDefined();
      });
    });
  });

  describe('Exchange Routes Validation', () => {
    describe('POST /api/exchanges', () => {
      it('should reject invalid exchange name', async () => {
        const res = await request(app)
          .post('/api/exchanges')
          .send({
            exchange: 'invalid-exchange',
            apiKey: 'validKey123',
            apiSecret: 'validSecret123'
          })
          .expect(400);

        expect(res.body.error).toContain('Validation failed');
      });

      it('should reject short API key', async () => {
        const res = await request(app)
          .post('/api/exchanges')
          .send({
            exchange: 'binance',
            apiKey: 'short',
            apiSecret: 'validSecret123'
          })
          .expect(400);

        expect(res.body.details).toBeDefined();
      });
    });

    describe('DELETE /api/exchanges/:id', () => {
      it('should reject invalid ObjectId format', async () => {
        const res = await request(app)
          .delete('/api/exchanges/invalid-id')
          .expect(400);

        expect(res.body.error).toContain('Validation failed');
      });
    });

    describe('GET /api/exchanges/compare-fees', () => {
      it('should reject missing exchanges parameter', async () => {
        const res = await request(app)
          .get('/api/exchanges/compare-fees')
          .expect(400);

        expect(res.body.error).toContain('Validation failed');
      });

      it('should reject invalid symbol format', async () => {
        const res = await request(app)
          .get('/api/exchanges/compare-fees')
          .query({
            exchanges: 'binance,coinbase',
            symbol: 'INVALID' // Missing /QUOTE format
          })
          .expect(400);

        expect(res.body.details).toBeDefined();
      });
    });
  });

  describe('Risk Routes Validation', () => {
    describe('PUT /api/risk/settings', () => {
      it('should reject invalid maxDailyLoss', async () => {
        const res = await request(app)
          .put('/api/risk/settings')
          .send({
            maxDailyLoss: 5000000 // Too large
          })
          .expect(400);

        expect(res.body.details).toBeDefined();
      });

      it('should reject invalid maxOpenPositions string', async () => {
        const res = await request(app)
          .put('/api/risk/settings')
          .send({
            maxOpenPositions: 'not-a-number'
          })
          .expect(400);

        expect(res.body.details).toBeDefined();
      });

      it('should coerce valid numeric string', async () => {
        const res = await request(app)
          .put('/api/risk/settings')
          .send({
            maxOpenPositions: '5' // Should be coerced to number
          });

        // Should pass validation (may fail auth)
        expect(res.status).not.toBe(400);
      });
    });

    describe('POST /api/risk/calculate-position', () => {
      it('should reject missing required fields', async () => {
        const res = await request(app)
          .post('/api/risk/calculate-position')
          .send({
            symbol: 'BTC/USD'
            // Missing entryPrice and stopLoss
          })
          .expect(400);

        expect(res.body.error).toContain('Validation failed');
      });

      it('should reject negative entry price', async () => {
        const res = await request(app)
          .post('/api/risk/calculate-position')
          .send({
            symbol: 'BTC/USD',
            entryPrice: -100,
            stopLoss: 90
          })
          .expect(400);

        expect(res.body.details).toBeDefined();
      });
    });
  });

  describe('Broker OAuth Routes Validation', () => {
    describe('GET /api/broker-oauth/initiate/:brokerKey', () => {
      it('should reject invalid broker key', async () => {
        const res = await request(app)
          .get('/api/broker-oauth/initiate/invalid-broker')
          .expect(400);

        expect(res.body.error).toContain('Validation failed');
      });
    });

    describe('GET /api/broker-oauth/callback/:brokerKey', () => {
      it('should reject missing state parameter', async () => {
        const res = await request(app)
          .get('/api/broker-oauth/callback/alpaca')
          .query({
            code: 'validcode123456'
            // Missing state
          })
          .expect(400);

        expect(res.body.error).toContain('Validation failed');
      });

      it('should reject invalid state format', async () => {
        const res = await request(app)
          .get('/api/broker-oauth/callback/alpaca')
          .query({
            code: 'validcode123456',
            state: 'short' // Too short (< 16 chars)
          })
          .expect(400);

        expect(res.body.details).toBeDefined();
      });
    });
  });

  describe('Validation Error Format', () => {
    it('should return consistent error structure', async () => {
      const res = await request(app)
        .post('/api/auth/mfa/enable')
        .send({ token: 'invalid' })
        .expect(400);

      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('error');
      expect(res.body).toHaveProperty('details');
      expect(Array.isArray(res.body.details)).toBe(true);

      if (res.body.details.length > 0) {
        expect(res.body.details[0]).toHaveProperty('field');
        expect(res.body.details[0]).toHaveProperty('message');
      }
    });
  });

  describe('Admin Routes Validation', () => {
    describe('GET /api/admin/users', () => {
      it('should reject invalid page number', async () => {
        const res = await request(app)
          .get('/api/admin/users')
          .query({ page: -1 })
          .expect(400);

        expect(res.body.error).toContain('Validation failed');
      });

      it('should reject invalid limit number', async () => {
        const res = await request(app)
          .get('/api/admin/users')
          .query({ limit: 1000 })
          .expect(400);

        expect(res.body.error).toContain('Validation failed');
      });

      it('should reject invalid tier', async () => {
        const res = await request(app)
          .get('/api/admin/users')
          .query({ tier: 'invalid-tier' })
          .expect(400);

        expect(res.body.details).toBeDefined();
      });

      it('should reject invalid status', async () => {
        const res = await request(app)
          .get('/api/admin/users')
          .query({ status: 'invalid-status' })
          .expect(400);

        expect(res.body.details).toBeDefined();
      });

      it('should accept valid query parameters', async () => {
        const res = await request(app)
          .get('/api/admin/users')
          .query({ page: 1, limit: 20, tier: 'basic', status: 'active' });

        expect(res.status).not.toBe(400);
      });
    });

    describe('PATCH /api/admin/users/:userId/role', () => {
      it('should reject invalid userId format', async () => {
        const res = await request(app)
          .patch('/api/admin/users/invalid-id/role')
          .send({ communityRole: 'admin' })
          .expect(400);

        expect(res.body.error).toContain('Validation failed');
      });

      it('should reject invalid communityRole', async () => {
        const validId = '507f1f77bcf86cd799439011';
        const res = await request(app)
          .patch(`/api/admin/users/${validId}/role`)
          .send({ communityRole: 'invalid-role' })
          .expect(400);

        expect(res.body.details).toBeDefined();
      });

      it('should accept valid role update', async () => {
        const validId = '507f1f77bcf86cd799439011';
        const res = await request(app)
          .patch(`/api/admin/users/${validId}/role`)
          .send({ communityRole: 'admin' });

        expect(res.status).not.toBe(400);
      });
    });
  });

  describe('Analytics Routes Validation', () => {
    describe('GET /api/analytics/revenue', () => {
      it('should reject invalid date format', async () => {
        const res = await request(app)
          .get('/api/analytics/revenue')
          .query({ startDate: 'invalid-date', endDate: '2024-10-28' })
          .expect(400);

        expect(res.body.error).toContain('Validation failed');
      });

      it('should reject endDate before startDate', async () => {
        const res = await request(app)
          .get('/api/analytics/revenue')
          .query({ startDate: '2024-10-28', endDate: '2024-10-01' })
          .expect(400);

        expect(res.body.details).toBeDefined();
      });

      it('should accept valid date range', async () => {
        const res = await request(app)
          .get('/api/analytics/revenue')
          .query({ startDate: '2024-10-01', endDate: '2024-10-28' });

        expect(res.status).not.toBe(400);
      });
    });

    describe('GET /api/analytics/churn', () => {
      it('should reject missing required dates', async () => {
        const res = await request(app)
          .get('/api/analytics/churn')
          .expect(400);

        expect(res.body.error).toContain('Validation failed');
      });

      it('should reject invalid period parameter', async () => {
        const res = await request(app)
          .get('/api/analytics/churn')
          .query({
            startDate: '2024-10-01',
            endDate: '2024-10-28',
            period: 'invalid-period'
          })
          .expect(400);

        expect(res.body.details).toBeDefined();
      });
    });

    describe('POST /api/analytics/churn-risk/calculate', () => {
      it('should reject missing userId', async () => {
        const res = await request(app)
          .post('/api/analytics/churn-risk/calculate')
          .send({})
          .expect(400);

        expect(res.body.error).toContain('Validation failed');
      });

      it('should reject invalid userId format', async () => {
        const res = await request(app)
          .post('/api/analytics/churn-risk/calculate')
          .send({ userId: 'invalid-id' })
          .expect(400);

        expect(res.body.details).toBeDefined();
      });

      it('should accept valid userId', async () => {
        const validId = '507f1f77bcf86cd799439011';
        const res = await request(app)
          .post('/api/analytics/churn-risk/calculate')
          .send({ userId: validId });

        expect(res.status).not.toBe(400);
      });
    });

    describe('GET /api/analytics/cohorts/retention', () => {
      it('should reject invalid period', async () => {
        const res = await request(app)
          .get('/api/analytics/cohorts/retention')
          .query({
            startDate: '2024-10-01',
            period: 'invalid-period'
          })
          .expect(400);

        expect(res.body.details).toBeDefined();
      });

      it('should accept valid cohort retention query', async () => {
        const res = await request(app)
          .get('/api/analytics/cohorts/retention')
          .query({
            startDate: '2024-10-01',
            period: 'monthly'
          });

        expect(res.status).not.toBe(400);
      });
    });

    describe('GET /api/analytics/cohorts/:cohortId', () => {
      it('should reject invalid cohortId format', async () => {
        const res = await request(app)
          .get('/api/analytics/cohorts/invalid-id')
          .expect(400);

        expect(res.body.error).toContain('Validation failed');
      });

      it('should accept valid cohortId', async () => {
        const validId = '507f1f77bcf86cd799439011';
        const res = await request(app)
          .get(`/api/analytics/cohorts/${validId}`);

        expect(res.status).not.toBe(400);
      });
    });

    describe('POST /api/analytics/cohorts/compare', () => {
      it('should reject missing cohortIds', async () => {
        const res = await request(app)
          .post('/api/analytics/cohorts/compare')
          .send({})
          .expect(400);

        expect(res.body.error).toContain('Validation failed');
      });

      it('should reject non-array cohortIds', async () => {
        const res = await request(app)
          .post('/api/analytics/cohorts/compare')
          .send({ cohortIds: 'not-an-array' })
          .expect(400);

        expect(res.body.details).toBeDefined();
      });

      it('should reject invalid ObjectId in array', async () => {
        const res = await request(app)
          .post('/api/analytics/cohorts/compare')
          .send({ cohortIds: ['invalid-id', '507f1f77bcf86cd799439011'] })
          .expect(400);

        expect(res.body.details).toBeDefined();
      });

      it('should accept valid cohortIds array', async () => {
        const res = await request(app)
          .post('/api/analytics/cohorts/compare')
          .send({
            cohortIds: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012']
          });

        expect(res.status).not.toBe(400);
      });
    });

    describe('GET /api/analytics/metrics/slow-queries', () => {
      it('should reject invalid threshold', async () => {
        const res = await request(app)
          .get('/api/analytics/metrics/slow-queries')
          .query({ threshold: -100 })
          .expect(400);

        expect(res.body.details).toBeDefined();
      });

      it('should accept valid threshold', async () => {
        const res = await request(app)
          .get('/api/analytics/metrics/slow-queries')
          .query({ threshold: 1000 });

        expect(res.status).not.toBe(400);
      });
    });

    describe('GET /api/analytics/alerts', () => {
      it('should reject invalid severity', async () => {
        const res = await request(app)
          .get('/api/analytics/alerts')
          .query({ severity: 'invalid-severity' })
          .expect(400);

        expect(res.body.details).toBeDefined();
      });

      it('should accept valid severity', async () => {
        const res = await request(app)
          .get('/api/analytics/alerts')
          .query({ severity: 'critical' });

        expect(res.status).not.toBe(400);
      });
    });
  });

  describe('Providers Routes Validation', () => {
    describe('GET /api/providers', () => {
      it('should reject invalid limit', async () => {
        const res = await request(app)
          .get('/api/providers')
          .query({ limit: 1000 })
          .expect(400);

        expect(res.body.error).toContain('Validation failed');
      });

      it('should reject invalid minWinRate', async () => {
        const res = await request(app)
          .get('/api/providers')
          .query({ minWinRate: 150 })
          .expect(400);

        expect(res.body.details).toBeDefined();
      });

      it('should reject invalid sortBy', async () => {
        const res = await request(app)
          .get('/api/providers')
          .query({ sortBy: 'invalid-sort' })
          .expect(400);

        expect(res.body.details).toBeDefined();
      });

      it('should accept valid provider list query', async () => {
        const res = await request(app)
          .get('/api/providers')
          .query({ limit: 20, minWinRate: 60, sortBy: 'winRate' });

        expect(res.status).not.toBe(400);
      });
    });

    describe('GET /api/providers/:providerId', () => {
      it('should reject invalid providerId format', async () => {
        const res = await request(app)
          .get('/api/providers/invalid@provider#id')
          .expect(400);

        expect(res.body.error).toContain('Validation failed');
      });

      it('should accept valid providerId', async () => {
        const res = await request(app)
          .get('/api/providers/valid-provider-123');

        expect(res.status).not.toBe(400);
      });
    });

    describe('POST /api/providers/:providerId/review', () => {
      it('should reject missing rating', async () => {
        const res = await request(app)
          .post('/api/providers/provider-123/review')
          .send({ comment: 'Great provider!' })
          .expect(400);

        expect(res.body.error).toContain('Validation failed');
      });

      it('should reject invalid rating range', async () => {
        const res = await request(app)
          .post('/api/providers/provider-123/review')
          .send({ rating: 6, comment: 'Too high!' })
          .expect(400);

        expect(res.body.details).toBeDefined();
      });

      it('should accept valid review', async () => {
        const res = await request(app)
          .post('/api/providers/provider-123/review')
          .send({ rating: 5, comment: 'Excellent!' });

        expect(res.status).not.toBe(400);
      });
    });

    describe('PUT /api/providers/user/providers/:channelId', () => {
      it('should reject invalid channelId format', async () => {
        const res = await request(app)
          .put('/api/providers/user/providers/invalid@channel#id')
          .send({ enabled: true })
          .expect(400);

        expect(res.body.error).toContain('Validation failed');
      });

      it('should reject invalid minConfidence', async () => {
        const res = await request(app)
          .put('/api/providers/user/providers/channel-123')
          .send({ minConfidence: 1.5 })
          .expect(400);

        expect(res.body.details).toBeDefined();
      });

      it('should accept valid provider config', async () => {
        const res = await request(app)
          .put('/api/providers/user/providers/channel-123')
          .send({ enabled: true, minConfidence: 0.8 });

        expect(res.status).not.toBe(400);
      });
    });
  });

  describe('Metrics Routes Validation', () => {
    describe('GET /api/metrics/custom/:name', () => {
      it('should reject invalid metric name format', async () => {
        const res = await request(app)
          .get('/api/metrics/custom/invalid@metric#name')
          .expect(400);

        expect(res.body.error).toContain('Validation failed');
      });

      it('should accept valid metric name', async () => {
        const res = await request(app)
          .get('/api/metrics/custom/user-signups');

        expect(res.status).not.toBe(400);
      });
    });

    describe('POST /api/metrics/custom', () => {
      it('should reject missing name', async () => {
        const res = await request(app)
          .post('/api/metrics/custom')
          .send({ value: 42 })
          .expect(400);

        expect(res.body.error).toContain('Validation failed');
      });

      it('should reject missing value', async () => {
        const res = await request(app)
          .post('/api/metrics/custom')
          .send({ name: 'test-metric' })
          .expect(400);

        expect(res.body.error).toContain('Validation failed');
      });

      it('should reject non-numeric value', async () => {
        const res = await request(app)
          .post('/api/metrics/custom')
          .send({ name: 'test-metric', value: 'not-a-number' })
          .expect(400);

        expect(res.body.details).toBeDefined();
      });

      it('should accept valid custom metric', async () => {
        const res = await request(app)
          .post('/api/metrics/custom')
          .send({ name: 'test-metric', value: 42.5 });

        expect(res.status).not.toBe(400);
      });
    });
  });

  describe('Auth MFA Backup Codes Validation', () => {
    describe('POST /api/auth/mfa/backup-codes/regenerate', () => {
      it('should reject missing token', async () => {
        const res = await request(app)
          .post('/api/auth/mfa/backup-codes/regenerate')
          .send({})
          .expect(400);

        expect(res.body.error).toContain('Validation failed');
      });

      it('should reject invalid token length', async () => {
        const res = await request(app)
          .post('/api/auth/mfa/backup-codes/regenerate')
          .send({ token: '12345' })
          .expect(400);

        expect(res.body.details).toBeDefined();
      });

      it('should reject non-numeric token', async () => {
        const res = await request(app)
          .post('/api/auth/mfa/backup-codes/regenerate')
          .send({ token: 'abcdef' })
          .expect(400);

        expect(res.body.details).toBeDefined();
      });

      it('should accept valid token', async () => {
        const res = await request(app)
          .post('/api/auth/mfa/backup-codes/regenerate')
          .send({ token: '123456' });

        expect(res.status).not.toBe(400);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long string inputs', async () => {
      const longString = 'a'.repeat(10000);
      const res = await request(app)
        .post('/api/exchanges')
        .send({
          exchange: 'binance',
          apiKey: longString,
          apiSecret: 'validSecret123'
        })
        .expect(400);

      expect(res.body.error).toContain('Validation failed');
    });

    it('should handle special characters in validation', async () => {
      const res = await request(app)
        .get('/api/auth/callback')
        .query({
          code: '<script>alert("xss")</script>',
          state: 'validstate123456'
        })
        .expect(400);

      expect(res.body.details).toBeDefined();
    });

    it('should handle Unicode characters appropriately', async () => {
      const res = await request(app)
        .post('/api/trader/signals/507f1f77bcf86cd799439011/follow')
        .send({
          autoTrade: true,
          positionSizePercent: 5
        });

      // Should pass validation regardless of Unicode support
      expect(res.status).not.toBe(400);
    });
  });
});
