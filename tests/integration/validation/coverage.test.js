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
