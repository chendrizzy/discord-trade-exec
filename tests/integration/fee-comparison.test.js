// Set test environment variables BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.DISCORD_BOT_TOKEN = 'test_discord_token_1234567890123456789012345678901234567890';
process.env.MONGODB_URI = 'mongodb://localhost:27017/trade-executor-test';
process.env.JWT_SECRET = 'test_jwt_secret';
process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const request = require('supertest');
const mongoose = require('mongoose');
const User = require('../../src/models/User');
const { encrypt } = require('../../src/middleware/encryption');

// Mock adapters to avoid ES module import issues
jest.mock('../../src/brokers/adapters/MoomooAdapter', () => ({}));
jest.mock('../../src/brokers/adapters/CoinbaseProAdapter', () => ({}));
jest.mock('../../src/brokers/adapters/KrakenAdapter', () => ({}));

// Mock BrokerFactory to avoid real API calls
jest.mock('../../src/brokers/BrokerFactory');
const BrokerFactory = require('../../src/brokers/BrokerFactory');

// Import app after environment is set
const app = require('../../src/index');

describe('Fee Comparison Endpoint Integration Tests', () => {
  let authToken;
  let testUser;

  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/trading-bot-test');
    }
  });

  beforeEach(async () => {
    // Clear users
    await User.deleteMany({});

    // Create test user with connected crypto exchanges
    const encryptedCoinbaseKey = encrypt('test-coinbase-key');
    const encryptedCoinbaseSecret = encrypt('test-coinbase-secret');
    const encryptedCoinbasePassword = encrypt('test-coinbase-password');

    const encryptedKrakenKey = encrypt('test-kraken-key');
    const encryptedKrakenSecret = encrypt('test-kraken-secret');

    testUser = await User.create({
      email: 'test@example.com',
      password: 'password123',
      role: 'user',
      tradingConfig: {
        exchanges: [
          {
            name: 'coinbasepro',
            apiKey: {
              encrypted: encryptedCoinbaseKey.encrypted,
              iv: encryptedCoinbaseKey.iv,
              authTag: encryptedCoinbaseKey.authTag
            },
            apiSecret: {
              encrypted: encryptedCoinbaseSecret.encrypted,
              iv: encryptedCoinbaseSecret.iv,
              authTag: encryptedCoinbaseSecret.authTag
            },
            password: {
              encrypted: encryptedCoinbasePassword.encrypted,
              iv: encryptedCoinbasePassword.iv,
              authTag: encryptedCoinbasePassword.authTag
            },
            isActive: true,
            testnet: false
          },
          {
            name: 'kraken',
            apiKey: {
              encrypted: encryptedKrakenKey.encrypted,
              iv: encryptedKrakenKey.iv,
              authTag: encryptedKrakenKey.authTag
            },
            apiSecret: {
              encrypted: encryptedKrakenSecret.encrypted,
              iv: encryptedKrakenSecret.iv,
              authTag: encryptedKrakenSecret.authTag
            },
            isActive: true,
            testnet: false
          }
        ]
      }
    });

    // Mock login to get token
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'password123'
      });

    authToken = loginRes.body.token;
  });

  afterEach(async () => {
    await User.deleteMany({});
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('GET /api/exchanges/compare-fees', () => {
    beforeEach(() => {
      // Mock BrokerFactory methods
      BrokerFactory.getCryptoBrokers = jest.fn().mockReturnValue([
        { key: 'coinbasepro', name: 'Coinbase Pro', type: 'crypto' },
        { key: 'kraken', name: 'Kraken', type: 'crypto' }
      ]);

      BrokerFactory.getBrokerInfo = jest.fn((key) => {
        const brokerInfo = {
          coinbasepro: {
            name: 'Coinbase Pro',
            websiteUrl: 'https://pro.coinbase.com'
          },
          kraken: {
            name: 'Kraken',
            websiteUrl: 'https://www.kraken.com'
          }
        };
        return brokerInfo[key];
      });

      // Mock adapter instances
      const mockCoinbaseAdapter = {
        getFees: jest.fn().mockResolvedValue({
          maker: 0.005,
          taker: 0.005,
          withdrawal: 0
        }),
        getMarketPrice: jest.fn().mockResolvedValue({
          bid: 50000,
          ask: 50010,
          last: 50005
        })
      };

      const mockKrakenAdapter = {
        getFees: jest.fn().mockResolvedValue({
          maker: 0.0016,
          taker: 0.0026,
          withdrawal: 0
        }),
        getMarketPrice: jest.fn().mockResolvedValue({
          bid: 49990,
          ask: 50000,
          last: 49995
        })
      };

      BrokerFactory.createBroker = jest.fn((key) => {
        return key === 'coinbasepro' ? mockCoinbaseAdapter : mockKrakenAdapter;
      });
    });

    it('should compare fees across connected exchanges', async () => {
      const res = await request(app)
        .get('/api/exchanges/compare-fees')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          symbol: 'BTC/USD',
          quantity: 0.5
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('comparisons');
      expect(res.body.data).toHaveProperty('recommendation');
      expect(res.body.data).toHaveProperty('summary');

      // Check comparisons array
      const comparisons = res.body.data.comparisons;
      expect(comparisons).toHaveLength(2);

      // Verify comparisons are sorted by lowest fee (ascending)
      expect(comparisons[0].estimatedFee).toBeLessThanOrEqual(comparisons[1].estimatedFee);

      // Check each comparison has required fields
      comparisons.forEach(comp => {
        expect(comp).toHaveProperty('exchange');
        expect(comp).toHaveProperty('displayName');
        expect(comp).toHaveProperty('symbol');
        expect(comp).toHaveProperty('quantity');
        expect(comp).toHaveProperty('currentPrice');
        expect(comp).toHaveProperty('tradeValue');
        expect(comp).toHaveProperty('fees');
        expect(comp).toHaveProperty('estimatedFee');
        expect(comp).toHaveProperty('estimatedFeePercent');
        expect(comp).toHaveProperty('savingsVsMostExpensive');
        expect(comp).toHaveProperty('isCheapest');
        expect(comp).toHaveProperty('isMostExpensive');
      });

      // Verify cheapest is marked correctly
      expect(comparisons[0].isCheapest).toBe(true);
      expect(comparisons[1].isCheapest).toBe(false);

      // Verify most expensive is marked correctly
      expect(comparisons[comparisons.length - 1].isMostExpensive).toBe(true);

      // Check recommendation
      const recommendation = res.body.data.recommendation;
      expect(recommendation).toHaveProperty('exchange');
      expect(recommendation).toHaveProperty('reason');
      expect(recommendation).toHaveProperty('estimatedFee');
      expect(recommendation).toHaveProperty('savings');
      expect(recommendation).toHaveProperty('savingsPercent');

      // Check summary
      const summary = res.body.data.summary;
      expect(summary.totalExchangesCompared).toBe(2);
      expect(summary).toHaveProperty('cheapestExchange');
      expect(summary).toHaveProperty('cheapestFee');
      expect(summary).toHaveProperty('mostExpensiveExchange');
      expect(summary).toHaveProperty('mostExpensiveFee');
      expect(summary).toHaveProperty('maxSavings');
    });

    it('should calculate fees correctly for given quantity', async () => {
      const quantity = 1.0;
      const expectedPrice = 50005; // Last price from mock
      const expectedTradeValue = quantity * expectedPrice;

      const res = await request(app)
        .get('/api/exchanges/compare-fees')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          symbol: 'BTC/USD',
          quantity: quantity
        });

      expect(res.status).toBe(200);

      const krakenComp = res.body.data.comparisons.find(c => c.exchange === 'kraken');
      expect(krakenComp).toBeDefined();
      expect(krakenComp.quantity).toBe(quantity);
      expect(krakenComp.tradeValue).toBeCloseTo(expectedTradeValue, 2);
      expect(krakenComp.estimatedFee).toBeCloseTo(expectedTradeValue * 0.0026, 2); // 0.26% taker fee
    });

    it('should recommend the exchange with lowest fee', async () => {
      const res = await request(app)
        .get('/api/exchanges/compare-fees')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          symbol: 'BTC/USD',
          quantity: 0.5
        });

      expect(res.status).toBe(200);

      const cheapest = res.body.data.comparisons[0];
      const recommendation = res.body.data.recommendation;

      // Recommendation should match cheapest exchange
      expect(recommendation.exchange).toBe(cheapest.displayName);
      expect(recommendation.estimatedFee).toBe(cheapest.estimatedFee);
    });

    it('should calculate savings correctly', async () => {
      const res = await request(app)
        .get('/api/exchanges/compare-fees')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          symbol: 'BTC/USD',
          quantity: 1.0
        });

      expect(res.status).toBe(200);

      const comparisons = res.body.data.comparisons;
      const cheapest = comparisons[0];
      const mostExpensive = comparisons[comparisons.length - 1];

      // Verify savings calculation
      const expectedMaxSavings = mostExpensive.estimatedFee - cheapest.estimatedFee;
      expect(res.body.data.summary.maxSavings).toBeCloseTo(expectedMaxSavings, 2);

      // Verify individual savings
      comparisons.forEach(comp => {
        const expectedSavings = mostExpensive.estimatedFee - comp.estimatedFee;
        expect(comp.savingsVsMostExpensive).toBeCloseTo(expectedSavings, 2);
      });
    });

    it('should return 400 if symbol is missing', async () => {
      const res = await request(app)
        .get('/api/exchanges/compare-fees')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          quantity: 1.0
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Symbol is required');
    });

    it('should return 400 if quantity is missing', async () => {
      const res = await request(app)
        .get('/api/exchanges/compare-fees')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          symbol: 'BTC/USD'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('quantity is required');
    });

    it('should return 400 if quantity is not positive', async () => {
      const res = await request(app)
        .get('/api/exchanges/compare-fees')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          symbol: 'BTC/USD',
          quantity: 0
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 400 if user has no exchanges connected', async () => {
      // Create user with no exchanges
      await User.deleteMany({});
      const userWithoutExchanges = await User.create({
        email: 'noexchanges@example.com',
        password: 'password123',
        role: 'user',
        tradingConfig: {
          exchanges: []
        }
      });

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'noexchanges@example.com',
          password: 'password123'
        });

      const token = loginRes.body.token;

      const res = await request(app)
        .get('/api/exchanges/compare-fees')
        .set('Authorization', `Bearer ${token}`)
        .query({
          symbol: 'BTC/USD',
          quantity: 1.0
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('No exchanges connected');
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .get('/api/exchanges/compare-fees')
        .query({
          symbol: 'BTC/USD',
          quantity: 1.0
        });

      expect(res.status).toBe(401);
    });

    it('should handle exchange errors gracefully', async () => {
      // Mock one adapter to throw error
      BrokerFactory.createBroker = jest.fn((key) => {
        if (key === 'coinbasepro') {
          return {
            getFees: jest.fn().mockRejectedValue(new Error('API Error')),
            getMarketPrice: jest.fn().mockRejectedValue(new Error('API Error'))
          };
        }
        return {
          getFees: jest.fn().mockResolvedValue({
            maker: 0.0016,
            taker: 0.0026,
            withdrawal: 0
          }),
          getMarketPrice: jest.fn().mockResolvedValue({
            bid: 49990,
            ask: 50000,
            last: 49995
          })
        };
      });

      const res = await request(app)
        .get('/api/exchanges/compare-fees')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          symbol: 'BTC/USD',
          quantity: 1.0
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Should still have one successful comparison
      expect(res.body.data.comparisons).toHaveLength(1);

      // Should have error information
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors.length).toBeGreaterThan(0);
    });

    it('should handle symbol not supported on specific exchange', async () => {
      // Mock adapter to throw symbol not supported error
      BrokerFactory.createBroker = jest.fn((key) => {
        const baseAdapter = {
          getFees: jest.fn().mockResolvedValue({
            maker: 0.005,
            taker: 0.005,
            withdrawal: 0
          })
        };

        if (key === 'coinbasepro') {
          return {
            ...baseAdapter,
            getMarketPrice: jest.fn().mockRejectedValue(new Error('Symbol not supported'))
          };
        }

        return {
          ...baseAdapter,
          getMarketPrice: jest.fn().mockResolvedValue({
            bid: 49990,
            ask: 50000,
            last: 49995
          })
        };
      });

      const res = await request(app)
        .get('/api/exchanges/compare-fees')
        .set('Authorization', `Bearer ${authToken}`)
        .query({
          symbol: 'EXOTIC/USD',
          quantity: 1.0
        });

      expect(res.status).toBe(200);

      // Should have one successful comparison (Kraken)
      expect(res.body.data.comparisons).toHaveLength(1);

      // Should have error for Coinbase Pro
      expect(res.body.errors).toBeDefined();
      const coinbaseError = res.body.errors.find(e => e.exchange === 'coinbasepro');
      expect(coinbaseError).toBeDefined();
      expect(coinbaseError.error).toContain('not supported');
    });
  });
});
