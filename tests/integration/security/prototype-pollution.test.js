/**
 * Prototype Pollution Prevention Tests (US7-T06)
 *
 * Tests that validate() middleware prevents prototype pollution attacks
 * by checking for dangerous keys: __proto__, constructor, prototype
 *
 * Tests against routes that use the validate() middleware from US7-T03:
 * - Analytics routes
 * - Providers routes
 * - Metrics routes
 * - Auth MFA routes
 * - Admin routes
 */

const request = require('supertest');
const app = require('../../../src/app');
const { connectDB, disconnectDB } = require('../../setup/db');
const User = require('../../../src/models/User');
const { getMFAService } = require('../../../src/services/MFAService');

describe('Prototype Pollution Prevention (US7-T06)', () => {
  let testUser;
  let authCookie;
  const mfaService = getMFAService();

  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  beforeEach(async () => {
    // Create admin test user
    const mfaSecret = 'TESTSECRET123456';
    const encryptedSecret = mfaService.encryptSecret(mfaSecret);

    testUser = await User.create({
      discordId: '123456789',
      discordUsername: 'testuser#1234',
      communityRole: 'admin',
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

    // Simulate authenticated session
    authCookie = 'sessionId=test-session-id';
  });

  afterEach(async () => {
    await User.deleteMany({});
  });

  describe('__proto__ Pollution Attempts', () => {
    it('should reject __proto__ in request body with PROTOTYPE_POLLUTION_DETECTED', async () => {
      const res = await request(app)
        .post('/api/providers/test-provider/review')
        .set('Cookie', authCookie)
        .send({
          rating: 5,
          comment: 'Great provider!',
          __proto__: {
            isAdmin: true
          }
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Security validation failed');
      expect(res.body.code).toBe('PROTOTYPE_POLLUTION_DETECTED');
      expect(res.body.details[0].field).toBe('__proto__');
      expect(res.body.details[0].message).toContain('Dangerous key');
    });

    it('should reject nested __proto__ in request body', async () => {
      const res = await request(app)
        .post('/api/analytics/cohorts/compare')
        .set('Cookie', authCookie)
        .send({
          cohortIds: ['507f1f77bcf86cd799439011'],
          filters: {
            __proto__: {
              polluted: true
            }
          }
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('PROTOTYPE_POLLUTION_DETECTED');
      expect(res.body.details[0].field).toContain('__proto__');
    });

    it('should reject __proto__ in query parameters', async () => {
      const res = await request(app)
        .get('/api/providers')
        .set('Cookie', authCookie)
        .query({
          limit: 20,
          minWinRate: 0,
          __proto__: { isAdmin: true }
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('PROTOTYPE_POLLUTION_DETECTED');
    });

    it('should reject deeply nested __proto__', async () => {
      const res = await request(app)
        .post('/api/metrics/custom')
        .set('Cookie', authCookie)
        .send({
          name: 'test-metric',
          value: 42,
          metadata: {
            nested: {
              deep: {
                __proto__: { polluted: true }
              }
            }
          }
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('PROTOTYPE_POLLUTION_DETECTED');
    });
  });

  describe('constructor Pollution Attempts', () => {
    it('should reject constructor in request body with PROTOTYPE_POLLUTION_DETECTED', async () => {
      const res = await request(app)
        .get('/api/analytics/revenue')
        .set('Cookie', authCookie)
        .query({
          startDate: '2024-01-01',
          endDate: '2024-10-28',
          constructor: {
            prototype: {
              isAdmin: true
            }
          }
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Security validation failed');
      expect(res.body.code).toBe('PROTOTYPE_POLLUTION_DETECTED');
      expect(res.body.details[0].field).toBe('constructor');
      expect(res.body.details[0].message).toContain('Dangerous key');
    });

    it('should reject nested constructor in request body', async () => {
      const res = await request(app)
        .post('/api/providers/test-provider/review')
        .set('Cookie', authCookie)
        .send({
          rating: 5,
          comment: 'Great provider!',
          metadata: {
            constructor: {
              prototype: {
                polluted: true
              }
            }
          }
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('PROTOTYPE_POLLUTION_DETECTED');
      expect(res.body.details[0].field).toContain('constructor');
    });

    it('should reject constructor in route params (if applicable)', async () => {
      const res = await request(app)
        .get('/api/metrics/custom/constructor')
        .set('Cookie', authCookie)
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('PROTOTYPE_POLLUTION_DETECTED');
    });
  });

  describe('prototype Pollution Attempts', () => {
    it('should reject prototype in request body with PROTOTYPE_POLLUTION_DETECTED', async () => {
      const res = await request(app)
        .post('/api/metrics/custom')
        .set('Cookie', authCookie)
        .send({
          name: 'test-metric',
          value: 42,
          prototype: {
            isAdmin: true
          }
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Security validation failed');
      expect(res.body.code).toBe('PROTOTYPE_POLLUTION_DETECTED');
      expect(res.body.details[0].field).toBe('prototype');
      expect(res.body.details[0].message).toContain('Dangerous key');
    });

    it('should reject nested prototype in request body', async () => {
      const res = await request(app)
        .get('/api/analytics/churn')
        .set('Cookie', authCookie)
        .query({
          startDate: '2024-01-01',
          endDate: '2024-10-28',
          filters: {
            prototype: {
              polluted: true
            }
          }
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('PROTOTYPE_POLLUTION_DETECTED');
      expect(res.body.details[0].field).toContain('prototype');
    });

    it('should reject prototype in route params', async () => {
      const res = await request(app)
        .get('/api/metrics/custom/prototype')
        .set('Cookie', authCookie)
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('PROTOTYPE_POLLUTION_DETECTED');
    });
  });

  describe('Combined Attack Vectors', () => {
    it('should reject multiple pollution vectors in single request', async () => {
      const res = await request(app)
        .post('/api/analytics/cohorts/compare')
        .set('Cookie', authCookie)
        .send({
          cohortIds: ['507f1f77bcf86cd799439011'],
          __proto__: { polluted: true },
          constructor: { prototype: { polluted: true } },
          prototype: { polluted: true }
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('PROTOTYPE_POLLUTION_DETECTED');
      // Should catch the first dangerous key encountered
      expect(res.body.details[0].field).toMatch(/__proto__|constructor|prototype/);
    });

    it('should reject all three dangerous keys in nested structure', async () => {
      const res = await request(app)
        .post('/api/providers/test-provider/review')
        .set('Cookie', authCookie)
        .send({
          rating: 5,
          comment: 'Test',
          data: {
            nested: {
              __proto__: { a: 1 },
              deeper: {
                constructor: { b: 2 },
                deepest: {
                  prototype: { c: 3 }
                }
              }
            }
          }
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('PROTOTYPE_POLLUTION_DETECTED');
    });
  });

  describe('Admin Routes Protection', () => {
    it('should reject __proto__ in admin user query params', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Cookie', authCookie)
        .query({
          page: 1,
          limit: 20,
          __proto__: { isAdmin: true }
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('PROTOTYPE_POLLUTION_DETECTED');
    });

    it('should reject constructor in admin role update body', async () => {
      const validUserId = '507f1f77bcf86cd799439011';
      const res = await request(app)
        .patch(`/api/admin/users/${validUserId}/role`)
        .set('Cookie', authCookie)
        .send({
          communityRole: 'admin',
          constructor: { polluted: true }
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('PROTOTYPE_POLLUTION_DETECTED');
    });
  });

  describe('Analytics Routes Protection', () => {
    it('should reject pollution in revenue query', async () => {
      const res = await request(app)
        .get('/api/analytics/revenue')
        .set('Cookie', authCookie)
        .query({
          startDate: '2024-01-01',
          endDate: '2024-10-28',
          __proto__: { polluted: true }
        })
        .expect(400);

      expect(res.body.code).toBe('PROTOTYPE_POLLUTION_DETECTED');
    });

    it('should reject pollution in cohort comparison', async () => {
      const res = await request(app)
        .post('/api/analytics/cohorts/compare')
        .set('Cookie', authCookie)
        .send({
          cohortIds: ['507f1f77bcf86cd799439011'],
          prototype: { polluted: true }
        })
        .expect(400);

      expect(res.body.code).toBe('PROTOTYPE_POLLUTION_DETECTED');
    });
  });

  describe('Safe Properties Pass Through', () => {
    it('should allow legitimate property names in query', async () => {
      const res = await request(app)
        .get('/api/providers')
        .set('Cookie', authCookie)
        .query({
          limit: 20,
          minWinRate: 0,
          sortBy: 'winRate'
        });

      // Should not be 400 validation error for legitimate properties
      // May be 401 (auth) or other, but not prototype pollution error
      if (res.status === 400) {
        expect(res.body.code).not.toBe('PROTOTYPE_POLLUTION_DETECTED');
      }
    });

    it('should allow legitimate nested properties in body', async () => {
      const res = await request(app)
        .post('/api/metrics/custom')
        .set('Cookie', authCookie)
        .send({
          name: 'test-metric',
          value: 42,
          metadata: {
            source: 'test',
            tags: ['performance']
          }
        });

      // Should not be 400 validation error for legitimate properties
      if (res.status === 400) {
        expect(res.body.code).not.toBe('PROTOTYPE_POLLUTION_DETECTED');
      }
    });

    it('should allow properties with similar names', async () => {
      const res = await request(app)
        .post('/api/providers/test-provider/review')
        .set('Cookie', authCookie)
        .send({
          rating: 5,
          comment: 'Great provider!',
          proto: 'legitimate',  // Not __proto__
          construct: 'legitimate',  // Not constructor
          prototypical: 'legitimate'  // Not prototype
        });

      // Should not be prototype pollution error for similar but safe names
      if (res.status === 400) {
        expect(res.body.code).not.toBe('PROTOTYPE_POLLUTION_DETECTED');
      }
    });
  });

  describe('Array Protection', () => {
    it('should reject pollution in array elements', async () => {
      const res = await request(app)
        .post('/api/analytics/cohorts/compare')
        .set('Cookie', authCookie)
        .send({
          cohortIds: [
            '507f1f77bcf86cd799439011',
            {
              __proto__: { polluted: true }
            }
          ]
        })
        .expect(400);

      expect(res.body.code).toBe('PROTOTYPE_POLLUTION_DETECTED');
    });

    it('should reject nested pollution in array of objects', async () => {
      const res = await request(app)
        .post('/api/metrics/custom')
        .set('Cookie', authCookie)
        .send({
          name: 'test-metric',
          value: 42,
          dataPoints: [
            { value: 1, timestamp: '2024-01-01' },
            {
              value: 2,
              timestamp: '2024-01-02',
              constructor: { polluted: true }
            }
          ]
        })
        .expect(400);

      expect(res.body.code).toBe('PROTOTYPE_POLLUTION_DETECTED');
    });
  });
});
