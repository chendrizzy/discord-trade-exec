/**
 * Integration Test: Trades API End-to-End Flow
 *
 * Tests the complete trade execution flow:
 * 1. Discord signal received
 * 2. Risk validation (RiskManagementService)
 * 3. Trade execution (TradeExecutionService)
 * 4. Broker submission (AlpacaAdapter - paper trading)
 * 5. Audit logging (AuditLogService)
 * 6. WebSocket notification (Socket.IO)
 *
 * Test Environment:
 * - MongoDB Memory Server for database
 * - Mock Alpaca paper trading account
 * - Mock WebSocket server for notifications
 *
 * Dependencies: User, Trade, Position, AuditLog models
 * Services: RiskManagementService, TradeExecutionService, AuditLogService
 */

'use strict';

const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const User = require('../../../src/models/User');
const Trade = require('../../../src/models/Trade');
const Position = require('../../../src/models/Position');
const AuditLog = require('../../../src/models/AuditLog');
const RiskManagementService = require('../../../src/services/RiskManagementService');
const TradeExecutionService = require('../../../src/services/TradeExecutionService');

// Mock broker adapter to avoid real API calls
jest.mock('../../../src/brokers/BrokerFactory', () => ({
  BrokerFactory: {
    createAdapter: jest.fn((broker, config) => ({
      testConnection: jest.fn().mockResolvedValue({ success: true, accountType: 'PAPER' }),
      placeOrder: jest.fn().mockResolvedValue({
        success: true,
        orderId: 'mock_alpaca_order_123456',
        symbol: 'AAPL',
        quantity: 10,
        side: 'BUY',
        type: 'MARKET',
        status: 'FILLED',
        filledQty: 10,
        filledPrice: 150.5,
        commission: 0,
        timestamp: new Date()
      }),
      getOrderStatus: jest.fn().mockResolvedValue({
        orderId: 'mock_alpaca_order_123456',
        status: 'FILLED',
        filledQty: 10,
        filledPrice: 150.5
      }),
      getPositions: jest.fn().mockResolvedValue([]),
      getBalance: jest.fn().mockResolvedValue({
        cash: 100000,
        equity: 100000,
        buyingPower: 100000
      })
    }))
  }
}));

// Mock audit log service to avoid write overhead in tests
const mockAuditLog = jest.fn().mockResolvedValue({ success: true });
jest.mock('../../../src/services/AuditLogService', () => ({
  log: mockAuditLog
}));

// Mock WebSocket for notification tests
const mockWebSocketEmit = jest.fn();
jest.mock('../../../src/websocket/socketServer', () => ({
  emitToUser: mockWebSocketEmit
}));

describe('Integration Test: Trades API End-to-End', () => {
  let app;
  let testUser;
  let authCookie;

  beforeAll(async () => {
    // Create Express app with minimal middleware
    app = express();
    app.use(express.json());
    app.use(
      session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI })
      })
    );

    // Mount trades routes
    const tradesRouter = require('../../../src/routes/api/trades');
    app.use('/api/v1/trades', tradesRouter);
  });

  beforeEach(async () => {
    // Clear mocks
    jest.clearAllMocks();
    mockAuditLog.mockClear();
    mockWebSocketEmit.mockClear();

    // Create test user with broker connection
    testUser = await User.create({
      discordId: 'test_discord_user_123',
      username: 'test_trader',
      email: 'test@example.com',
      communityId: new mongoose.Types.ObjectId(),
      subscription: {
        tier: 'PRO',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      },
      tradingConfig: {
        paperTradingEnabled: true,
        communityId: new mongoose.Types.ObjectId(),
        apiConnected: true,
        riskSettings: {
          maxDailyLoss: 5000, // $5,000 max daily loss
          maxPositionSize: 10000, // $10,000 max per position
          circuitBreakerThreshold: 8000, // $8,000 circuit breaker
          dailyLossLimitPercentage: 5, // 5% of equity
          maxPortfolioExposure: 80 // 80% max exposure
        },
        oauthTokens: new Map([
          [
            'alpaca',
            {
              accessToken: 'mock_encrypted_access_token',
              refreshToken: 'mock_encrypted_refresh_token',
              expiresAt: new Date(Date.now() + 3600 * 1000), // 1 hour
              scopes: ['account:read', 'trading'],
              tokenType: 'Bearer',
              connectedAt: new Date(),
              isValid: true
            }
          ]
        ])
      },
      statistics: {
        totalSignalsUsed: 0,
        totalSignalsReceived: 0,
        totalTrades: 0,
        successfulTrades: 0,
        failedTrades: 0,
        totalProfitLoss: 0
      }
    });

    // Simulate authenticated session
    authCookie = await request(app)
      .post('/api/v1/auth/test-login')
      .send({ userId: testUser._id.toString() })
      .then(res => res.headers['set-cookie']);
  });

  afterEach(async () => {
    // Clean up database
    await User.deleteMany({});
    await Trade.deleteMany({});
    await Position.deleteMany({});
    await AuditLog.deleteMany({});
  });

  describe('POST /api/v1/trades - Complete Trade Flow', () => {
    it('should execute trade with risk validation, broker submission, and audit log', async () => {
      // Step 1: Prepare trade signal (simulating Discord input)
      const tradeSignal = {
        symbol: 'AAPL',
        side: 'BUY',
        quantity: 10,
        entryPrice: 150.0,
        stopLoss: 145.0,
        takeProfit: 160.0,
        signalSource: 'DISCORD',
        providerId: 'test_provider_123',
        providerName: 'Alpha Trading Signals',
        confidenceScore: 85,
        broker: 'alpaca'
      };

      // Step 2: Execute trade via API
      const response = await request(app)
        .post('/api/v1/trades')
        .set('Cookie', authCookie)
        .send(tradeSignal)
        .expect(201);

      // Step 3: Verify response structure
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('trade');
      expect(response.body.trade).toHaveProperty('tradeId');
      expect(response.body.trade).toHaveProperty('symbol', 'AAPL');
      expect(response.body.trade).toHaveProperty('quantity', 10);
      expect(response.body.trade).toHaveProperty('status', 'FILLED');
      expect(response.body.trade).toHaveProperty('brokerOrderId', 'mock_alpaca_order_123456');

      // Step 4: Verify trade saved to database
      const savedTrade = await Trade.findOne({ userId: testUser._id, symbol: 'AAPL' });
      expect(savedTrade).not.toBeNull();
      expect(savedTrade.side).toBe('BUY');
      expect(savedTrade.quantity).toBe(10);
      expect(savedTrade.status).toBe('FILLED');
      expect(savedTrade.exchange).toBe('alpaca');

      // Step 5: Verify position created/updated
      const position = await Position.findOne({ userId: testUser._id, symbol: 'AAPL' });
      expect(position).not.toBeNull();
      expect(position.quantity).toBe(10);
      expect(position.averageEntryPrice).toBeCloseTo(150.5, 2); // Mock filled price

      // Step 6: Verify audit log created
      expect(mockAuditLog).toHaveBeenCalled();
      const auditCalls = mockAuditLog.mock.calls;
      expect(auditCalls.some(call => call[0].action === 'trade.execute' && call[0].resourceType === 'Trade')).toBe(
        true
      );

      // Step 7: Verify WebSocket notification sent
      expect(mockWebSocketEmit).toHaveBeenCalledWith(
        testUser._id.toString(),
        'trade.filled',
        expect.objectContaining({
          symbol: 'AAPL',
          status: 'FILLED'
        })
      );

      // Step 8: Verify user statistics updated
      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.statistics.totalTrades).toBe(1);
      expect(updatedUser.statistics.successfulTrades).toBe(1);
    });

    it('should reject trade when risk validation fails (daily loss limit)', async () => {
      // Create existing trades with losses to trigger daily loss limit
      await Trade.create({
        userId: testUser._id,
        communityId: testUser.communityId,
        tradeId: 'loss_trade_1',
        exchange: 'alpaca',
        symbol: 'SPY',
        side: 'SELL',
        entryPrice: 450,
        exitPrice: 440,
        quantity: 100,
        profitLoss: -1000, // -$1,000 loss
        status: 'FILLED',
        entryTime: new Date(),
        exitTime: new Date()
      });

      await Trade.create({
        userId: testUser._id,
        communityId: testUser.communityId,
        tradeId: 'loss_trade_2',
        exchange: 'alpaca',
        symbol: 'TSLA',
        side: 'SELL',
        entryPrice: 250,
        exitPrice: 235,
        quantity: 300,
        profitLoss: -4500, // -$4,500 loss (total: -$5,500)
        status: 'FILLED',
        entryTime: new Date(),
        exitTime: new Date()
      });

      // Attempt new trade (should be rejected due to -$5,500 loss exceeding -$5,000 limit)
      const tradeSignal = {
        symbol: 'NVDA',
        side: 'BUY',
        quantity: 20,
        entryPrice: 500.0,
        broker: 'alpaca'
      };

      const response = await request(app)
        .post('/api/v1/trades')
        .set('Cookie', authCookie)
        .send(tradeSignal)
        .expect(403);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/daily loss limit/i);

      // Verify trade NOT saved
      const rejectedTrade = await Trade.findOne({ symbol: 'NVDA' });
      expect(rejectedTrade).toBeNull();

      // Verify audit log records rejection
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'trade.risk_rejected',
          status: 'failure',
          riskLevel: 'high'
        })
      );
    });

    it('should reject trade when position size exceeds limit', async () => {
      const tradeSignal = {
        symbol: 'AAPL',
        side: 'BUY',
        quantity: 100, // 100 shares * $150 = $15,000 (exceeds $10,000 max position size)
        entryPrice: 150.0,
        broker: 'alpaca'
      };

      const response = await request(app)
        .post('/api/v1/trades')
        .set('Cookie', authCookie)
        .send(tradeSignal)
        .expect(403);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toMatch(/position size/i);

      // Verify trade NOT saved
      const rejectedTrade = await Trade.findOne({ symbol: 'AAPL' });
      expect(rejectedTrade).toBeNull();
    });

    it('should reject trade when circuit breaker is active', async () => {
      // Activate circuit breaker by exceeding threshold
      await testUser.updateOne({
        'tradingConfig.circuitBreakerActive': true,
        'tradingConfig.circuitBreakerActivatedAt': new Date()
      });

      const tradeSignal = {
        symbol: 'AAPL',
        side: 'BUY',
        quantity: 10,
        entryPrice: 150.0,
        broker: 'alpaca'
      };

      const response = await request(app)
        .post('/api/v1/trades')
        .set('Cookie', authCookie)
        .send(tradeSignal)
        .expect(403);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toMatch(/circuit breaker/i);
    });

    it('should handle broker API failures gracefully', async () => {
      // Mock broker failure
      const { BrokerFactory } = require('../../../src/brokers/BrokerFactory');
      BrokerFactory.createAdapter.mockReturnValueOnce({
        testConnection: jest.fn().mockResolvedValue({ success: true }),
        placeOrder: jest.fn().mockRejectedValue(new Error('Broker API timeout')),
        getBalance: jest.fn().mockResolvedValue({ cash: 100000, equity: 100000 })
      });

      const tradeSignal = {
        symbol: 'AAPL',
        side: 'BUY',
        quantity: 10,
        entryPrice: 150.0,
        broker: 'alpaca'
      };

      const response = await request(app)
        .post('/api/v1/trades')
        .set('Cookie', authCookie)
        .send(tradeSignal)
        .expect(500);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toMatch(/broker|timeout/i);

      // Verify trade marked as FAILED
      const failedTrade = await Trade.findOne({ userId: testUser._id, symbol: 'AAPL' });
      expect(failedTrade.status).toBe('FAILED');

      // Verify error audit logged
      expect(mockAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'trade.broker_error',
          status: 'failure'
        })
      );
    });
  });

  describe('GET /api/v1/trades - Trade History', () => {
    beforeEach(async () => {
      // Create sample trade history
      const trades = [
        {
          userId: testUser._id,
          communityId: testUser.communityId,
          tradeId: 'trade_1',
          exchange: 'alpaca',
          symbol: 'AAPL',
          side: 'BUY',
          entryPrice: 150,
          exitPrice: 155,
          quantity: 10,
          profitLoss: 50,
          status: 'FILLED',
          entryTime: new Date('2025-10-01'),
          exitTime: new Date('2025-10-05')
        },
        {
          userId: testUser._id,
          communityId: testUser.communityId,
          tradeId: 'trade_2',
          exchange: 'alpaca',
          symbol: 'TSLA',
          side: 'BUY',
          entryPrice: 250,
          exitPrice: 245,
          quantity: 5,
          profitLoss: -25,
          status: 'FILLED',
          entryTime: new Date('2025-10-10'),
          exitTime: new Date('2025-10-12')
        }
      ];

      await Trade.insertMany(trades);
    });

    it('should return paginated trade history', async () => {
      const response = await request(app)
        .get('/api/v1/trades')
        .set('Cookie', authCookie)
        .query({ page: 1, limit: 10 })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('trades');
      expect(response.body.trades).toHaveLength(2);
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.pagination.totalCount).toBe(2);
    });

    it('should filter trades by symbol', async () => {
      const response = await request(app)
        .get('/api/v1/trades')
        .set('Cookie', authCookie)
        .query({ symbol: 'AAPL' })
        .expect(200);

      expect(response.body.trades).toHaveLength(1);
      expect(response.body.trades[0].symbol).toBe('AAPL');
    });

    it('should filter trades by status', async () => {
      const response = await request(app)
        .get('/api/v1/trades')
        .set('Cookie', authCookie)
        .query({ status: 'FILLED' })
        .expect(200);

      expect(response.body.trades).toHaveLength(2);
      expect(response.body.trades.every(t => t.status === 'FILLED')).toBe(true);
    });

    it('should return summary statistics', async () => {
      const response = await request(app).get('/api/v1/trades').set('Cookie', authCookie).expect(200);

      expect(response.body).toHaveProperty('summary');
      expect(response.body.summary).toHaveProperty('totalProfitLoss');
      expect(response.body.summary).toHaveProperty('totalTrades');
      expect(response.body.summary.totalProfitLoss).toBe(25); // 50 - 25 = 25
    });
  });

  describe('Performance & Edge Cases', () => {
    it('should handle trade execution within <500ms p95', async () => {
      const tradeSignal = {
        symbol: 'AAPL',
        side: 'BUY',
        quantity: 10,
        entryPrice: 150.0,
        broker: 'alpaca'
      };

      const startTime = Date.now();

      await request(app).post('/api/v1/trades').set('Cookie', authCookie).send(tradeSignal).expect(201);

      const executionTime = Date.now() - startTime;
      expect(executionTime).toBeLessThan(500); // <500ms requirement
    });

    it('should handle concurrent trade submissions', async () => {
      const signals = ['AAPL', 'MSFT', 'GOOGL'].map(symbol => ({
        symbol,
        side: 'BUY',
        quantity: 5,
        entryPrice: 100,
        broker: 'alpaca'
      }));

      const requests = signals.map(signal =>
        request(app).post('/api/v1/trades').set('Cookie', authCookie).send(signal)
      );

      const responses = await Promise.all(requests);
      expect(responses.every(r => r.status === 201)).toBe(true);

      const trades = await Trade.find({ userId: testUser._id });
      expect(trades).toHaveLength(3);
    });

    it('should validate required fields', async () => {
      const invalidSignal = {
        side: 'BUY',
        quantity: 10
        // Missing symbol
      };

      const response = await request(app)
        .post('/api/v1/trades')
        .set('Cookie', authCookie)
        .send(invalidSignal)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toMatch(/symbol|required/i);
    });

    it('should reject unauthenticated requests', async () => {
      const tradeSignal = {
        symbol: 'AAPL',
        side: 'BUY',
        quantity: 10,
        entryPrice: 150.0,
        broker: 'alpaca'
      };

      await request(app)
        .post('/api/v1/trades')
        // No auth cookie
        .send(tradeSignal)
        .expect(401);
    });
  });
});
