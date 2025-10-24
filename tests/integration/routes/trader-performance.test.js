/**
 * US2-T04: Trader API Performance Tests
 *
 * Tests verify N+1 query elimination and <80ms p95 response times for:
 * - GET /api/trader/overview (followed providers)
 * - GET /api/trader/signals (provider marketplace)
 * - GET /api/trader/trades (trade history)
 *
 * Target: <80ms p95 per tasks.md specification
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { connect: connectDB, disconnect: closeDB } = require('../../../src/config/database');
const { createApp } = require('../../../src/app');

// Mock trader authentication middleware (trader.js uses requireTrader)
jest.mock('../../../src/middleware/requireTrader', () => (req, res, next) => {
  const mockMongoose = require('mongoose');
  req.user = {
    _id: new mockMongoose.Types.ObjectId('507f1f77bcf86cd799439011'),
    communityId: new mockMongoose.Types.ObjectId('507f1f77bcf86cd799439012'),
    discordId: 'test-user-123',
    discordUsername: 'TestUser'
  };
  next();
});

describe('Trader API Performance', () => {
  let app;
  let server;
  let communityId;
  let userId;

  beforeAll(async () => {
    await connectDB();
    app = createApp();
    server = app.listen(0); // Random port

    communityId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439012');
    userId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011');
  });

  afterAll(async () => {
    await server.close();
    await closeDB();
  });

  beforeEach(async () => {
    // Clean up collections
    const User = require('../../../src/models/User');
    const SignalProvider = require('../../../src/models/SignalProvider');
    const UserSignalSubscription = require('../../../src/models/UserSignalSubscription');
    const Signal = require('../../../src/models/Signal');
    const Trade = require('../../../src/models/Trade');

    await User.deleteMany({});
    await SignalProvider.deleteMany({});
    await UserSignalSubscription.deleteMany({});
    await Signal.deleteMany({});
    await Trade.deleteMany({});
  });

  describe('GET /overview - Query Performance', () => {
    it('should complete in <80ms p95 with 10 followed providers', async () => {
      // Setup: Create test data
      const providers = [];
      for (let i = 0; i < 10; i++) {
        const provider = await require('../../../src/models/SignalProvider').create({
          communityId,
          providerId: new mongoose.Types.ObjectId(),
          name: `Provider ${i}`,
          type: 'DISCORD',
          enabled: true,
          verificationStatus: 'verified',
          performance: {
            winRate: 60 + i,
            avgPnL: 100 + i * 10,
            totalTrades: 50
          }
        });
        providers.push(provider);

        // Create subscription (follow)
        await require('../../../src/models/UserSignalSubscription').create({
          communityId,
          userId,
          providerId: provider._id,
          active: true,
          autoExecute: false,
          stats: {
            signalsReceived: 10 + i,
            signalsExecuted: 8 + i,
            totalPnL: 500 + i * 50
          }
        });

        // Create trades for this week
        const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        for (let j = 0; j < 5; j++) {
          await require('../../../src/models/Trade').create({
            communityId,
            userId,
            exchange: 'TEST',
            symbol: 'BTC/USD',
            side: 'BUY',
            quantity: 1,
            entryPrice: 50000 + j * 100,
            exitPrice: 51000 + j * 100,
            profitLoss: 100 + j * 10,
            profitLossPercentage: 2.0,
            fees: { total: 5 },
            status: 'FILLED',
            entryTime: new Date(weekStart.getTime() + j * 60 * 60 * 1000),
            signalSource: {
              providerId: provider._id,
              signalId: new mongoose.Types.ObjectId()
            }
          });
        }
      }

      // Warmup request
      await request(server).get('/api/trader/overview');

      // Measure performance: 20 requests
      const durations = [];
      for (let i = 0; i < 20; i++) {
        const start = Date.now();
        const response = await request(server).get('/api/trader/overview');
        const duration = Date.now() - start;

        expect(response.status).toBe(200);
        durations.push(duration);
      }

      // Calculate p95 (95th percentile)
      durations.sort((a, b) => a - b);
      const p95Index = Math.floor(durations.length * 0.95);
      const p95Duration = durations[p95Index];

      expect(p95Duration).toBeLessThan(80); // Target: <80ms p95
    });

    it('should execute minimal database queries for followed providers', async () => {
      // Create 5 followed providers with trades
      for (let i = 0; i < 5; i++) {
        const provider = await require('../../../src/models/SignalProvider').create({
          communityId,
          providerId: new mongoose.Types.ObjectId(),
          name: `Provider ${i}`,
          type: 'DISCORD',
          enabled: true,
          verificationStatus: 'verified'
        });

        await require('../../../src/models/UserSignalSubscription').create({
          communityId,
          userId,
          providerId: provider._id,
          active: true,
          stats: { signalsReceived: 10, signalsExecuted: 8, totalPnL: 500 }
        });
      }

      // Enable MongoDB profiling
      const db = mongoose.connection.db;
      await db.command({ profile: 2 });

      // Clear profiling data
      await db.collection('system.profile').deleteMany({});

      // Execute request
      const response = await request(server).get('/api/trader/overview');
      expect(response.status).toBe(200);

      // Check query count (should be minimal: 1 for subscriptions + 1 for trades aggregation)
      const profileDocs = await db
        .collection('system.profile')
        .find({
          op: { $in: ['query', 'command'] },
          ns: { $regex: /signalproviders|usersignalsubscriptions|trades/ }
        })
        .toArray();

      // Disable profiling
      await db.command({ profile: 0 });

      // Should be significantly fewer queries than N+1 pattern (which would be 5+ queries)
      expect(profileDocs.length).toBeLessThan(10);
    });
  });

  describe('GET /signals - Query Performance', () => {
    it('should complete in <80ms p95 with 20 providers', async () => {
      // Setup: Create 20 providers with full stats
      const providers = [];
      for (let i = 0; i < 20; i++) {
        const provider = await require('../../../src/models/SignalProvider').create({
          communityId,
          providerId: new mongoose.Types.ObjectId(),
          name: `Provider ${i}`,
          type: 'DISCORD',
          enabled: true,
          verificationStatus: 'verified',
          performance: {
            winRate: 50 + i,
            avgPnL: 100 + i * 10,
            totalTrades: 100
          }
        });
        providers.push(provider);

        // Create signals (10 total, 5 this week)
        const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        for (let j = 0; j < 10; j++) {
          await require('../../../src/models/Signal').create({
            communityId,
            providerId: provider._id,
            symbol: 'BTC/USD',
            side: 'BUY',
            entryPrice: 50000,
            createdAt:
              j < 5
                ? new Date(weekStart.getTime() + j * 60 * 60 * 1000)
                : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          });
        }

        // Create followers (3 per provider)
        for (let j = 0; j < 3; j++) {
          await require('../../../src/models/UserSignalSubscription').create({
            communityId,
            providerId: provider._id,
            userId: new mongoose.Types.ObjectId(),
            active: true
          });
        }

        // Create trades (week, month, all-time)
        const monthStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        for (let j = 0; j < 15; j++) {
          const isWeek = j < 5;
          const isMonth = j < 10;
          await require('../../../src/models/Trade').create({
            communityId,
            userId,
            exchange: 'TEST',
            symbol: 'BTC/USD',
            side: 'BUY',
            quantity: 1,
            profitLoss: 50 + j * 5,
            status: 'FILLED',
            entryTime: isWeek
              ? new Date(weekStart.getTime() + j * 60 * 60 * 1000)
              : isMonth
                ? new Date(monthStart.getTime() + j * 60 * 60 * 1000)
                : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
            signalSource: {
              providerId: provider._id,
              signalId: new mongoose.Types.ObjectId()
            }
          });
        }
      }

      // Warmup request
      await request(server).get('/api/trader/signals');

      // Measure performance: 20 requests
      const durations = [];
      for (let i = 0; i < 20; i++) {
        const start = Date.now();
        const response = await request(server).get('/api/trader/signals');
        const duration = Date.now() - start;

        expect(response.status).toBe(200);
        expect(response.body.providers).toBeDefined();
        durations.push(duration);
      }

      // Calculate p95
      durations.sort((a, b) => a - b);
      const p95Index = Math.floor(durations.length * 0.95);
      const p95Duration = durations[p95Index];

      expect(p95Duration).toBeLessThan(80); // Target: <80ms p95
    });

    it('should execute aggregation queries instead of N+1 pattern', async () => {
      // Create 10 providers
      for (let i = 0; i < 10; i++) {
        const provider = await require('../../../src/models/SignalProvider').create({
          communityId,
          providerId: new mongoose.Types.ObjectId(),
          name: `Provider ${i}`,
          type: 'DISCORD',
          enabled: true,
          verificationStatus: 'verified'
        });

        // Add signals and trades
        await require('../../../src/models/Signal').create({
          communityId,
          providerId: provider._id,
          symbol: 'BTC/USD',
          side: 'BUY'
        });

        await require('../../../src/models/Trade').create({
          communityId,
          userId,
          exchange: 'TEST',
          symbol: 'BTC/USD',
          side: 'BUY',
          quantity: 1,
          profitLoss: 100,
          status: 'FILLED',
          entryTime: new Date(),
          signalSource: {
            providerId: provider._id
          }
        });
      }

      // Enable MongoDB profiling
      const db = mongoose.connection.db;
      await db.command({ profile: 2 });
      await db.collection('system.profile').deleteMany({});

      // Execute request
      const response = await request(server).get('/api/trader/signals');
      expect(response.status).toBe(200);

      // Check query count
      const profileDocs = await db
        .collection('system.profile')
        .find({
          op: { $in: ['query', 'command'] },
          ns: { $regex: /signals|usersignalsubscriptions|trades/ }
        })
        .toArray();

      // Disable profiling
      await db.command({ profile: 0 });

      // With N+1 pattern: 10 providers * 6 queries = 60+ queries
      // With aggregation: ~6 queries total (2 signal aggs, 1 subscription agg, 3 trade aggs via $facet)
      expect(profileDocs.length).toBeLessThan(20); // Should be dramatically fewer
    });
  });

  describe('GET /trades - Query Performance', () => {
    it('should complete in <80ms p95 with 50 trades', async () => {
      // Setup: Create 50 trades across 10 providers
      const providers = [];
      for (let i = 0; i < 10; i++) {
        const provider = await require('../../../src/models/SignalProvider').create({
          communityId,
          providerId: new mongoose.Types.ObjectId(),
          name: `Provider ${i}`,
          type: 'DISCORD',
          enabled: true,
          verificationStatus: 'verified'
        });
        providers.push(provider);
      }

      for (let i = 0; i < 50; i++) {
        const provider = providers[i % 10];
        await require('../../../src/models/Trade').create({
          communityId,
          userId,
          exchange: 'TEST',
          symbol: 'BTC/USD',
          side: 'BUY',
          quantity: 1,
          entryPrice: 50000 + i * 10,
          exitPrice: 51000 + i * 10,
          profitLoss: 100 + i,
          profitLossPercentage: 2.0,
          fees: { total: 5 },
          status: 'FILLED',
          entryTime: new Date(Date.now() - i * 60 * 60 * 1000),
          signalSource: {
            providerId: provider._id,
            signalId: new mongoose.Types.ObjectId()
          }
        });
      }

      // Warmup request
      await request(server).get('/api/trader/trades?limit=25');

      // Measure performance: 20 requests
      const durations = [];
      for (let i = 0; i < 20; i++) {
        const start = Date.now();
        const response = await request(server).get('/api/trader/trades?limit=25');
        const duration = Date.now() - start;

        expect(response.status).toBe(200);
        expect(response.body.trades).toHaveLength(25);
        durations.push(duration);
      }

      // Calculate p95
      durations.sort((a, b) => a - b);
      const p95Index = Math.floor(durations.length * 0.95);
      const p95Duration = durations[p95Index];

      expect(p95Duration).toBeLessThan(80); // Target: <80ms p95
    });

    it('should batch fetch provider names instead of N+1 queries', async () => {
      // Create 5 providers with trades
      const providers = [];
      for (let i = 0; i < 5; i++) {
        const provider = await require('../../../src/models/SignalProvider').create({
          communityId,
          providerId: new mongoose.Types.ObjectId(),
          name: `Provider ${i}`,
          type: 'DISCORD',
          enabled: true
        });
        providers.push(provider);

        await require('../../../src/models/Trade').create({
          communityId,
          userId,
          exchange: 'TEST',
          symbol: 'BTC/USD',
          side: 'BUY',
          quantity: 1,
          profitLoss: 100,
          status: 'FILLED',
          entryTime: new Date(),
          signalSource: {
            providerId: provider._id
          }
        });
      }

      // Enable MongoDB profiling
      const db = mongoose.connection.db;
      await db.command({ profile: 2 });
      await db.collection('system.profile').deleteMany({});

      // Execute request
      const response = await request(server).get('/api/trader/trades');
      expect(response.status).toBe(200);

      // Check SignalProvider query count
      const profileDocs = await db
        .collection('system.profile')
        .find({
          op: { $in: ['query', 'command'] },
          ns: { $regex: /signalproviders/ }
        })
        .toArray();

      // Disable profiling
      await db.command({ profile: 0 });

      // Should be 1 batch query, not 5 individual queries
      const findQueries = profileDocs.filter(doc => doc.command?.find || doc.op === 'query');
      expect(findQueries.length).toBeLessThanOrEqual(2); // 1-2 queries max (batch fetch)
    });

    it('should return correct provider names for all trades', async () => {
      // Create providers with distinct names
      const provider1 = await require('../../../src/models/SignalProvider').create({
        communityId,
        providerId: new mongoose.Types.ObjectId(),
        name: 'Alpha Trader',
        type: 'DISCORD',
        enabled: true
      });

      const provider2 = await require('../../../src/models/SignalProvider').create({
        communityId,
        providerId: new mongoose.Types.ObjectId(),
        name: 'Beta Signals',
        type: 'DISCORD',
        enabled: true
      });

      // Create trades
      await require('../../../src/models/Trade').create({
        communityId,
        userId,
        exchange: 'TEST',
        symbol: 'BTC/USD',
        side: 'BUY',
        quantity: 1,
        profitLoss: 100,
        status: 'FILLED',
        entryTime: new Date(),
        signalSource: {
          providerId: provider1._id
        }
      });

      await require('../../../src/models/Trade').create({
        communityId,
        userId,
        exchange: 'TEST',
        symbol: 'ETH/USD',
        side: 'SELL',
        quantity: 2,
        profitLoss: -50,
        status: 'FILLED',
        entryTime: new Date(),
        signalSource: {
          providerId: provider2._id
        }
      });

      // Execute request
      const response = await request(server).get('/api/trader/trades');
      expect(response.status).toBe(200);
      expect(response.body.trades).toHaveLength(2);

      // Verify provider names are correctly populated
      const trade1 = response.body.trades.find(t => t.symbol === 'BTC/USD');
      const trade2 = response.body.trades.find(t => t.symbol === 'ETH/USD');

      expect(trade1.provider).toBe('Alpha Trader');
      expect(trade2.provider).toBe('Beta Signals');
    });
  });
});
