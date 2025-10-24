/**
 * Prototype Pollution Prevention Tests
 *
 * US7-T06: Tests that validation middleware prevents prototype pollution attacks
 *
 * Tests dangerous properties:
 * - __proto__
 * - constructor
 * - prototype
 * - __dirname
 * - __filename
 *
 * Validates that these properties are stripped from user input before processing.
 */

const request = require('supertest');
const app = require('../../../src/app');
const { connectDB, disconnectDB } = require('../../setup/db');
const User = require('../../../src/models/User');
const { getMFAService } = require('../../../src/services/MFAService');

describe('Prototype Pollution Prevention', () => {
  let testUser;
  const mfaService = getMFAService();

  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await disconnectDB();
  });

  beforeEach(async () => {
    // Create test user
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
  });

  afterEach(async () => {
    await User.deleteMany({});
  });

  describe('__proto__ Pollution Attempts', () => {
    it('should reject __proto__ in body', async () => {
      const res = await request(app)
        .post('/api/brokers/test')
        .send({
          brokerKey: 'alpaca',
          credentials: {
            apiKey: 'testkey123',
            apiSecret: 'testsecret123'
          },
          __proto__: {
            isAdmin: true
          }
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Validation failed');
    });

    it('should reject nested __proto__ in body', async () => {
      const res = await request(app)
        .post('/api/brokers/test')
        .send({
          brokerKey: 'alpaca',
          credentials: {
            apiKey: 'testkey123',
            apiSecret: 'testsecret123',
            __proto__: {
              polluted: true
            }
          }
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should reject __proto__ in query params', async () => {
      const res = await request(app)
        .get('/api/trader/overview')
        .query({
          period: '7d',
          __proto__: { isAdmin: true }
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  describe('constructor Pollution Attempts', () => {
    it('should reject constructor in body', async () => {
      const res = await request(app)
        .post('/api/exchanges')
        .send({
          exchange: 'binance',
          apiKey: 'testkey123456',
          apiSecret: 'testsecret123456',
          constructor: {
            prototype: {
              isAdmin: true
            }
          }
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Validation failed');
    });

    it('should reject nested constructor in body', async () => {
      const res = await request(app)
        .put('/api/risk/settings')
        .send({
          maxPositionSize: 5000,
          settings: {
            constructor: {
              prototype: {
                polluted: true
              }
            }
          }
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  describe('prototype Pollution Attempts', () => {
    it('should reject prototype in body', async () => {
      const res = await request(app)
        .post('/api/brokers/test')
        .send({
          brokerKey: 'alpaca',
          credentials: {
            apiKey: 'testkey123',
            apiSecret: 'testsecret123'
          },
          prototype: {
            isAdmin: true
          }
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  describe('__ Prefixed Properties', () => {
    it('should reject __dirname pollution attempt', async () => {
      const res = await request(app)
        .post('/api/brokers/test')
        .send({
          brokerKey: 'alpaca',
          credentials: {
            apiKey: 'testkey123',
            apiSecret: 'testsecret123'
          },
          __dirname: '/malicious/path'
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should reject __filename pollution attempt', async () => {
      const res = await request(app)
        .post('/api/brokers/test')
        .send({
          brokerKey: 'alpaca',
          credentials: {
            apiKey: 'testkey123',
            apiSecret: 'testsecret123'
          },
          __filename: '/malicious/file.js'
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should reject any property starting with __', async () => {
      const res = await request(app)
        .post('/api/brokers/test')
        .send({
          brokerKey: 'alpaca',
          credentials: {
            apiKey: 'testkey123',
            apiSecret: 'testsecret123'
          },
          __custom: 'malicious'
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  describe('MongoDB Injection Prevention', () => {
    it('should reject $where operator in body', async () => {
      const res = await request(app)
        .post('/api/brokers/test')
        .send({
          brokerKey: 'alpaca',
          credentials: {
            apiKey: 'testkey123',
            apiSecret: 'testsecret123'
          },
          $where: 'this.password == "12345"'
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should reject $ne operator in query', async () => {
      const res = await request(app)
        .get('/api/trader/overview')
        .query({
          period: { $ne: null }
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should reject $gt operator in body', async () => {
      const res = await request(app)
        .put('/api/risk/settings')
        .send({
          maxPositionSize: { $gt: 0 }
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  describe('Combined Attack Vectors', () => {
    it('should reject multiple pollution vectors in single request', async () => {
      const res = await request(app)
        .post('/api/brokers/test')
        .send({
          brokerKey: 'alpaca',
          credentials: {
            apiKey: 'testkey123',
            apiSecret: 'testsecret123'
          },
          __proto__: { polluted: true },
          constructor: { prototype: { polluted: true } },
          prototype: { polluted: true },
          $where: 'malicious code',
          __dirname: '/malicious'
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Validation failed');
    });

    it('should reject deeply nested pollution attempts', async () => {
      const res = await request(app)
        .post('/api/brokers/test')
        .send({
          brokerKey: 'alpaca',
          credentials: {
            apiKey: 'testkey123',
            apiSecret: 'testsecret123',
            nested: {
              deep: {
                very: {
                  deep: {
                    __proto__: { polluted: true }
                  }
                }
              }
            }
          }
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  describe('Safe Properties Pass Through', () => {
    it('should allow legitimate property names', async () => {
      const res = await request(app)
        .get('/api/trader/overview')
        .query({
          period: '7d'
        });

      // Should not be 400 (validation error)
      // May be 401 (auth) or other, but not validation failure
      expect(res.status).not.toBe(400);
    });

    it('should allow nested legitimate properties', async () => {
      const res = await request(app)
        .post('/api/broker-oauth/callback/alpaca')
        .query({
          code: 'validcode123456',
          state: 'validstate1234567890'
        });

      // Should not be 400 validation error
      expect(res.status).not.toBe(400);
    });
  });
});
