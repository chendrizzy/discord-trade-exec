// External dependencies
const express = require('express');
const request = require('supertest');

// Internal utilities and services
const User = require('../../src/models/User');

// Mock models
jest.mock('../../src/models/User');

// Mock analytics services - must be done BEFORE importing the routes
// Use jest.fn().mockReturnValue() so mockReturnValue() can override later
const mockRevenueMetricsInstance = {
  calculateMRR: jest.fn().mockResolvedValue({ current: 0, subscriberCount: 0, byTier: {} }),
  calculateARR: jest.fn().mockResolvedValue({ current: 0, mrr: 0 }),
  calculateLTV: jest.fn().mockResolvedValue({ perUser: 0, avgLifetimeMonths: 0, avgMonthlyRevenue: 0 }),
  calculateChurnRate: jest.fn().mockResolvedValue({ churnRate: 0, churned: 0, startSubscribers: 0 }),
  getAllMetrics: jest.fn().mockResolvedValue({ mrr: {}, arr: {}, ltv: {}, churn: null, timestamp: new Date() })
};

const mockChurnPredictorInstance = {
  calculateChurnRisk: jest.fn().mockReturnValue({ riskScore: 0, riskLevel: 'low', factors: [], recommendations: [] }),
  getHighRiskUsers: jest.fn().mockReturnValue([]),
  batchCalculateRisk: jest.fn().mockReturnValue([])
};

const mockCohortAnalyzerInstance = {
  generateRetentionTable: jest.fn().mockResolvedValue({ cohorts: [], metric: 'login', period: 'month', startDate: new Date(), endDate: new Date() }),
  analyzeCohortBehavior: jest.fn().mockResolvedValue(null),
  compareCohorts: jest.fn().mockResolvedValue({ cohorts: [], averages: {}, trend: 'stable' })
};

jest.mock('../../src/services/analytics/RevenueMetrics', () => {
  return {
    getRevenueMetricsInstance: jest.fn().mockReturnValue(mockRevenueMetricsInstance)
  };
});
jest.mock('../../src/services/analytics/ChurnPredictor', () => {
  return {
    getChurnPredictorInstance: jest.fn().mockReturnValue(mockChurnPredictorInstance)
  };
});
jest.mock('../../src/services/analytics/CohortAnalyzer', () => {
  return {
    getCohortAnalyzerInstance: jest.fn().mockReturnValue(mockCohortAnalyzerInstance)
  };
});
jest.mock('../../src/utils/analytics-metrics', () => {
  return {
    getMetricsInstance: jest.fn(() => ({
      startQuery: jest.fn(() => ({ id: 'test-tracker' })),
      endQuery: jest.fn(),
      recordError: jest.fn(),
      getMetrics: jest.fn(() => ({ performance: { totalQueries: 0 } })),
      generateReport: jest.fn(() => ({})),
      getSlowQueries: jest.fn(() => [])
    }))
  };
});
jest.mock('../../src/utils/analytics-alerts', () => {
  return {
    getAlertsInstance: jest.fn(() => ({
      checkChurnRate: jest.fn(() => ({ alerted: false })),
      checkMRRGrowth: jest.fn(() => ({ alerted: false })),
      checkAtRiskUsers: jest.fn(() => ({ alerted: false })),
      getActiveAlerts: jest.fn(() => []),
      getAlertHistory: jest.fn(() => [])
    }))
  };
});
jest.mock('../../src/utils/analytics-query-logger', () => {
  return {
    getQueryLoggerInstance: jest.fn(() => ({
      logQuery: jest.fn(),
      getFrequentPatterns: jest.fn(() => []),
      getSlowestPatterns: jest.fn(() => []),
      generateOptimizationReport: jest.fn(() => ({}))
    }))
  };
});
jest.mock('../../src/utils/analytics-cache', () => {
  return {
    getCacheInstance: jest.fn(() => ({
      prefixes: {
        MRR: 'analytics:mrr',
        LTV: 'analytics:ltv'
      },
      ttls: {
        MRR: 600,
        LTV: 1800
      },
      wrap: jest.fn(async (prefix, fn) => {
        const data = await fn();
        return { data, fromCache: false };
      })
    }))
  };
});

// Get mocked factory functions
const { getRevenueMetricsInstance } = require('../../src/services/analytics/RevenueMetrics');
const { getChurnPredictorInstance } = require('../../src/services/analytics/ChurnPredictor');
const { getCohortAnalyzerInstance } = require('../../src/services/analytics/CohortAnalyzer');

// Create test app
function createApp(userRole = 'admin') {
  // Clear module cache to get fresh instance with mocks
  delete require.cache[require.resolve('../../src/routes/api/analytics')];

  const app = express();
  app.use(express.json());

  // Mock authentication middleware
  app.use((req, res, next) => {
    if (userRole) {
      req.user = { id: 'test_user_123', role: userRole };
    }
    next();
  });

  // Mount analytics routes
  app.use('/api/analytics', require('../../src/routes/api/analytics'));

  return app;
}

describe('Analytics API Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Helper function to set up mocks and create app
  function setupTest(userRole = 'admin', mocks = {}) {
    // Reset mock functions on EXISTING instances (don't create new objects)
    // RevenueMetrics defaults
    mockRevenueMetricsInstance.calculateMRR.mockResolvedValue({ current: 0, subscriberCount: 0, byTier: {} });
    mockRevenueMetricsInstance.calculateARR.mockResolvedValue({ current: 0, mrr: 0 });
    mockRevenueMetricsInstance.calculateLTV.mockResolvedValue({ perUser: 0, avgLifetimeMonths: 0, avgMonthlyRevenue: 0 });
    mockRevenueMetricsInstance.calculateChurnRate.mockResolvedValue({ churnRate: 0, churned: 0, startSubscribers: 0 });
    mockRevenueMetricsInstance.getAllMetrics.mockResolvedValue({ mrr: {}, arr: {}, ltv: {}, churn: null, timestamp: new Date() });

    // ChurnPredictor defaults
    mockChurnPredictorInstance.calculateChurnRisk.mockReturnValue({ riskScore: 0, riskLevel: 'low', factors: [], recommendations: [] });
    mockChurnPredictorInstance.getHighRiskUsers.mockReturnValue([]);
    mockChurnPredictorInstance.batchCalculateRisk.mockReturnValue([]);

    // CohortAnalyzer defaults
    mockCohortAnalyzerInstance.generateRetentionTable.mockResolvedValue({ cohorts: [], metric: 'login', period: 'month', startDate: new Date(), endDate: new Date() });
    mockCohortAnalyzerInstance.analyzeCohortBehavior.mockResolvedValue(null);
    mockCohortAnalyzerInstance.compareCohorts.mockResolvedValue({ cohorts: [], averages: {}, trend: 'stable' });

    // Apply test-specific overrides by replacing methods on the existing instances
    if (mocks.revenueMetrics) {
      Object.keys(mocks.revenueMetrics).forEach(key => {
        mockRevenueMetricsInstance[key] = mocks.revenueMetrics[key];
      });
    }

    if (mocks.churnPredictor) {
      Object.keys(mocks.churnPredictor).forEach(key => {
        mockChurnPredictorInstance[key] = mocks.churnPredictor[key];
      });
    }

    if (mocks.cohortAnalyzer) {
      Object.keys(mocks.cohortAnalyzer).forEach(key => {
        mockCohortAnalyzerInstance[key] = mocks.cohortAnalyzer[key];
      });
    }

    return createApp(userRole);
  }

  describe('Authentication & Authorization', () => {
    test('should reject requests without authentication', async () => {
      const app = createApp(null); // No user

      await request(app)
        .get('/api/analytics/revenue')
        .expect(403)
        .expect(res => {
          expect(res.body.error).toBe('Admin access required');
        });
    });

    test('should reject requests from non-admin users', async () => {
      const app = createApp('user'); // Regular user

      await request(app)
        .get('/api/analytics/mrr')
        .expect(403)
        .expect(res => {
          expect(res.body.error).toBe('Admin access required');
        });
    });

    test('should allow admin users to access endpoints', async () => {
      const app = createApp('admin');

      getRevenueMetricsInstance.mockReturnValue({
        calculateMRR: jest.fn().mockResolvedValue({
          current: 1000,
          subscriberCount: 10,
          byTier: { basic: { count: 10, revenue: 1000 } }
        })
      });

      await request(app)
        .get('/api/analytics/mrr')
        .expect(200)
        .expect(res => {
          expect(res.body.success).toBe(true);
          expect(res.body.data).toBeDefined();
        });
    });
  });

  describe('GET /api/analytics/revenue', () => {


    test('should return all revenue metrics', async () => {
      const mockMetrics = {
        mrr: { current: 1000, subscriberCount: 10 },
        arr: { current: 12000, mrr: 1000 },
        ltv: { perUser: 5000, avgLifetimeMonths: 12 },
        churn: { churnRate: 5.0, churned: 2 },
        timestamp: new Date()
      };

      const app = setupTest('admin', {
        revenueMetrics: {
          getAllMetrics: jest.fn().mockResolvedValue(mockMetrics)
        }
      });

      await request(app)
        .get('/api/analytics/revenue')
        .expect(200)
        .expect(res => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.mrr).toEqual(mockMetrics.mrr);
          expect(res.body.data.arr).toEqual(mockMetrics.arr);
          expect(res.body.data.ltv).toEqual(mockMetrics.ltv);
          expect(res.body.data.churn).toEqual(mockMetrics.churn);
          expect(res.body.data.timestamp).toBeDefined(); // Date serialized to ISO string
        });
    });

    test('should accept optional startDate and endDate query parameters', async () => {
      const mockGetAllMetrics = jest.fn().mockResolvedValue({});

      const app = setupTest('admin', {
        revenueMetrics: {
          getAllMetrics: mockGetAllMetrics
        }
      });

      await request(app)
        .get('/api/analytics/revenue?startDate=2024-01-01&endDate=2024-01-31')
        .expect(200);

      expect(mockGetAllMetrics).toHaveBeenCalledWith(
        expect.any(Date),
        expect.any(Date)
      );
    });

    test('should handle service errors gracefully', async () => {
      const app = setupTest('admin', {
        revenueMetrics: {
          getAllMetrics: jest.fn().mockRejectedValue(new Error('Database connection failed'))
        }
      });

      await request(app)
        .get('/api/analytics/revenue')
        .expect(500)
        .expect(res => {
          expect(res.body.success).toBe(false);
          expect(res.body.error).toBe('Failed to fetch revenue metrics');
          expect(res.body.message).toBe('Database connection failed');
        });
    });
  });

  describe('GET /api/analytics/mrr', () => {


    test('should return MRR breakdown', async () => {
      const mockMRR = {
        current: 496,
        subscriberCount: 4,
        byTier: {
          basic: { count: 2, revenue: 98 },
          pro: { count: 1, revenue: 99 },
          premium: { count: 1, revenue: 299 }
        }
      };

      const app = setupTest('admin', {
        revenueMetrics: {
          calculateMRR: jest.fn().mockResolvedValue(mockMRR)
        }
      });

      await request(app)
        .get('/api/analytics/mrr')
        .expect(200)
        .expect(res => {
          expect(res.body.success).toBe(true);
          expect(res.body.data).toEqual(mockMRR);
          expect(res.body.data.current).toBe(496);
        });
    });
  });

  describe('GET /api/analytics/arr', () => {


    test('should return ARR calculation', async () => {
      const mockARR = {
        current: 3588,
        mrr: 299
      };

      const app = setupTest('admin', {
        revenueMetrics: {
          calculateARR: jest.fn().mockResolvedValue(mockARR)
        }
      });

      await request(app)
        .get('/api/analytics/arr')
        .expect(200)
        .expect(res => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.current).toBe(3588);
          expect(res.body.data.mrr).toBe(299);
        });
    });
  });

  describe('GET /api/analytics/ltv', () => {


    test('should return LTV metrics', async () => {
      const mockLTV = {
        perUser: 888,
        avgLifetimeMonths: 12,
        avgMonthlyRevenue: 74
      };

      const app = setupTest('admin', {
        revenueMetrics: {
          calculateLTV: jest.fn().mockResolvedValue(mockLTV)
        }
      });

      await request(app)
        .get('/api/analytics/ltv')
        .expect(200)
        .expect(res => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.perUser).toBe(888);
          expect(res.body.data.avgLifetimeMonths).toBe(12);
        });
    });
  });

  describe('GET /api/analytics/churn', () => {


    test('should require startDate and endDate parameters', async () => {
      const app = setupTest('admin');

      await request(app)
        .get('/api/analytics/churn')
        .expect(400)
        .expect(res => {
          expect(res.body.success).toBe(false);
          expect(res.body.error).toBe('startDate and endDate query parameters required');
        });
    });

    test('should return churn rate for period', async () => {
      const mockChurn = {
        churnRate: 5.0,
        churned: 5,
        startSubscribers: 100,
        period: {
          start: new Date('2024-01-01'),
          end: new Date('2024-01-31')
        }
      };

      const app = setupTest('admin', {
        revenueMetrics: {
          calculateChurnRate: jest.fn().mockResolvedValue(mockChurn)
        }
      });

      await request(app)
        .get('/api/analytics/churn?startDate=2024-01-01&endDate=2024-01-31')
        .expect(200)
        .expect(res => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.churnRate).toBe(5.0);
          expect(res.body.data.churned).toBe(5);
        });
    });
  });

  describe('GET /api/analytics/churn-risks', () => {


    test('should return at-risk users with default parameters', async () => {
      const mockUsers = [
        { _id: 'user1', subscription: { status: 'active' } },
        { _id: 'user2', subscription: { status: 'active' } }
      ];

      const mockAtRiskUsers = [
        { userId: 'user1', riskLevel: 'high', riskScore: 65 },
        { userId: 'user2', riskLevel: 'critical', riskScore: 85 }
      ];

      User.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue(mockUsers)
        })
      });

      const app = setupTest('admin', {
        churnPredictor: {
          getHighRiskUsers: jest.fn().mockReturnValue(mockAtRiskUsers)
        }
      });

      await request(app)
        .get('/api/analytics/churn-risks')
        .expect(200)
        .expect(res => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.count).toBe(2);
          expect(res.body.data.users).toEqual(mockAtRiskUsers);
          expect(res.body.data.minRiskLevel).toBe('high');
        });
    });

    test('should accept optional query parameters', async () => {
      User.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([])
        })
      });

      const app = setupTest('admin', {
        churnPredictor: {
          getHighRiskUsers: jest.fn().mockReturnValue([])
        }
      });

      await request(app)
        .get('/api/analytics/churn-risks?minRiskLevel=critical&limit=100')
        .expect(200);

      expect(User.find().select().limit).toHaveBeenCalledWith(100);
    });
  });

  describe('POST /api/analytics/churn-risk/calculate', () => {


    test('should require userId in request body', async () => {
      const app = setupTest('admin');

      await request(app)
        .post('/api/analytics/churn-risk/calculate')
        .send({})
        .expect(400)
        .expect(res => {
          expect(res.body.success).toBe(false);
          expect(res.body.error).toBe('userId required in request body');
        });
    });

    test('should return 404 for non-existent user', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(null)
      });

      const app = setupTest('admin');

      await request(app)
        .post('/api/analytics/churn-risk/calculate')
        .send({ userId: 'nonexistent_user' })
        .expect(404)
        .expect(res => {
          expect(res.body.success).toBe(false);
          expect(res.body.error).toBe('User not found');
        });
    });

    test('should calculate churn risk for user', async () => {
      const mockUser = {
        _id: 'user123',
        subscription: { tier: 'basic', status: 'active' },
        stats: { totalTrades: 10, winRate: 60, totalProfit: 500 }
      };

      const mockRiskAnalysis = {
        userId: 'user123',
        riskLevel: 'medium',
        riskScore: 35,
        factors: [{ factor: 'trading_inactivity', severity: 'medium' }],
        recommendations: ['Send signal highlights']
      };

      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser)
      });

      const app = setupTest('admin', {
        churnPredictor: {
          calculateChurnRisk: jest.fn().mockReturnValue(mockRiskAnalysis)
        }
      });

      await request(app)
        .post('/api/analytics/churn-risk/calculate')
        .send({ userId: 'user123' })
        .expect(200)
        .expect(res => {
          expect(res.body.success).toBe(true);
          expect(res.body.data).toEqual(mockRiskAnalysis);
          expect(res.body.data.riskLevel).toBe('medium');
        });
    });
  });

  describe('GET /api/analytics/dashboard', () => {


    test('should return comprehensive dashboard metrics', async () => {
      const mockUsers = [{ _id: 'user1', subscription: { status: 'active' } }];

      User.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue(mockUsers)
        })
      });

      const mockMRR = {
        current: 496,
        subscriberCount: 4,
        byTier: { basic: { count: 2, revenue: 98 } }
      };

      const mockLTV = {
        perUser: 888,
        avgLifetimeMonths: 12
      };

      const mockChurn = {
        churnRate: 5.0,
        churned: 2
      };

      const mockAtRiskUsers = [
        { userId: 'user1', riskLevel: 'critical', riskScore: 85 },
        { userId: 'user2', riskLevel: 'high', riskScore: 65 },
        { userId: 'user3', riskLevel: 'medium', riskScore: 35 }
      ];

      const app = setupTest('admin', {
        revenueMetrics: {
          calculateMRR: jest.fn().mockResolvedValue(mockMRR),
          calculateLTV: jest.fn().mockResolvedValue(mockLTV),
          calculateChurnRate: jest.fn().mockResolvedValue(mockChurn)
        },
        churnPredictor: {
          getHighRiskUsers: jest.fn().mockReturnValue(mockAtRiskUsers)
        }
      });

      await request(app)
        .get('/api/analytics/dashboard')
        .expect(200)
        .expect(res => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.revenue).toBeDefined();
          expect(res.body.data.revenue.mrr).toBe(496);
          expect(res.body.data.revenue.arr).toBe(496 * 12);
          expect(res.body.data.subscribers).toBeDefined();
          expect(res.body.data.subscribers.active).toBe(4);
          expect(res.body.data.churnRisk).toBeDefined();
          expect(res.body.data.churnRisk.atRisk).toBe(3);
          expect(res.body.data.churnRisk.critical).toBe(1);
          expect(res.body.data.churnRisk.high).toBe(1);
          expect(res.body.data.churnRisk.medium).toBe(1);
        });
    });
  });

  describe('GET /api/analytics/cohorts/retention', () => {


    test('should generate retention table with default parameters', async () => {
      const mockRetentionTable = {
        cohorts: [
          { cohortDate: '2024-01-01', cohortSize: 10, retention: [] }
        ],
        metric: 'login',
        period: 'month',
        startDate: new Date(),
        endDate: new Date()
      };

      const app = setupTest('admin', {
        cohortAnalyzer: {
          generateRetentionTable: jest.fn().mockResolvedValue(mockRetentionTable)
        }
      });

      await request(app)
        .get('/api/analytics/cohorts/retention')
        .expect(200)
        .expect(res => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.cohorts).toEqual(mockRetentionTable.cohorts);
          expect(res.body.data.metric).toBe('login');
          expect(res.body.data.period).toBe('month');
          expect(res.body.data.startDate).toBeDefined(); // Date serialized to ISO string
          expect(res.body.data.endDate).toBeDefined(); // Date serialized to ISO string
        });
    });

    test('should accept optional query parameters', async () => {
      const mockGenerateRetentionTable = jest.fn().mockResolvedValue({
        cohorts: [],
        metric: 'trade',
        period: 'week'
      });

      const app = setupTest('admin', {
        cohortAnalyzer: {
          generateRetentionTable: mockGenerateRetentionTable
        }
      });

      await request(app)
        .get('/api/analytics/cohorts/retention?period=week&metric=trade')
        .expect(200);

      expect(mockGenerateRetentionTable).toHaveBeenCalledWith({
        startDate: undefined,
        endDate: undefined,
        cohortPeriod: 'week',
        retentionMetric: 'trade'
      });
    });
  });

  describe('GET /api/analytics/cohorts/:cohortId', () => {


    test('should return cohort analysis', async () => {
      const mockAnalysis = {
        cohortId: '2024-01',
        cohortSize: 25,
        activeSubscriptions: 20,
        retentionRate: 80.0,
        tierDistribution: { basic: 15, pro: 8, premium: 2 }
      };

      const app = setupTest('admin', {
        cohortAnalyzer: {
          analyzeCohortBehavior: jest.fn().mockResolvedValue(mockAnalysis)
        }
      });

      await request(app)
        .get('/api/analytics/cohorts/2024-01')
        .expect(200)
        .expect(res => {
          expect(res.body.success).toBe(true);
          expect(res.body.data).toEqual(mockAnalysis);
        });
    });

    test('should return 404 for non-existent cohort', async () => {
      const app = setupTest('admin', {
        cohortAnalyzer: {
          analyzeCohortBehavior: jest.fn().mockResolvedValue(null)
        }
      });

      await request(app)
        .get('/api/analytics/cohorts/2099-12')
        .expect(404)
        .expect(res => {
          expect(res.body.success).toBe(false);
          expect(res.body.error).toBe('Cohort not found or has no users');
        });
    });
  });

  describe('POST /api/analytics/cohorts/compare', () => {


    test('should require cohortIds array in request body', async () => {
      const app = setupTest('admin');

      await request(app)
        .post('/api/analytics/cohorts/compare')
        .send({})
        .expect(400)
        .expect(res => {
          expect(res.body.success).toBe(false);
          expect(res.body.error).toBe('cohortIds array required in request body');
        });
    });

    test('should reject empty cohortIds array', async () => {
      const app = setupTest('admin');

      await request(app)
        .post('/api/analytics/cohorts/compare')
        .send({ cohortIds: [] })
        .expect(400);
    });

    test('should compare multiple cohorts', async () => {
      const mockComparison = {
        cohorts: [
          { cohortId: '2024-01', retentionRate: 75.0 },
          { cohortId: '2024-02', retentionRate: 82.0 }
        ],
        averages: {
          retentionRate: 78.5,
          tradesPerUser: 15
        },
        trend: 'improving'
      };

      const app = setupTest('admin', {
        cohortAnalyzer: {
          compareCohorts: jest.fn().mockResolvedValue(mockComparison)
        }
      });

      await request(app)
        .post('/api/analytics/cohorts/compare')
        .send({ cohortIds: ['2024-01', '2024-02'] })
        .expect(200)
        .expect(res => {
          expect(res.body.success).toBe(true);
          expect(res.body.data).toEqual(mockComparison);
          expect(res.body.data.trend).toBe('improving');
        });
    });
  });

  describe('Response Format Consistency', () => {


    test('successful responses should have consistent format', async () => {
      const app = setupTest('admin', {
        revenueMetrics: {
          calculateMRR: jest.fn().mockResolvedValue({ current: 1000 })
        }
      });

      await request(app)
        .get('/api/analytics/mrr')
        .expect(200)
        .expect(res => {
          expect(res.body).toHaveProperty('success');
          expect(res.body).toHaveProperty('data');
          expect(res.body.success).toBe(true);
        });
    });

    test('error responses should have consistent format', async () => {
      const app = setupTest('admin', {
        revenueMetrics: {
          calculateMRR: jest.fn().mockRejectedValue(new Error('Test error'))
        }
      });

      await request(app)
        .get('/api/analytics/mrr')
        .expect(500)
        .expect(res => {
          expect(res.body).toHaveProperty('success');
          expect(res.body).toHaveProperty('error');
          expect(res.body).toHaveProperty('message');
          expect(res.body.success).toBe(false);
        });
    });
  });

  describe('Performance', () => {


    test('should respond to requests quickly', async () => {
      const app = setupTest('admin', {
        revenueMetrics: {
          calculateMRR: jest.fn().mockResolvedValue({ current: 1000 })
        }
      });

      const startTime = Date.now();

      await request(app)
        .get('/api/analytics/mrr')
        .expect(200);

      const processingTime = Date.now() - startTime;
      expect(processingTime).toBeLessThan(1000); // Should process in less than 1 second
    });
  });
});
