// Internal utilities and services
const { ChurnPredictor } = require('../../../src/services/analytics/ChurnPredictor');

describe('ChurnPredictor', () => {
  let churnPredictor;

  beforeEach(() => {
    churnPredictor = new ChurnPredictor();
  });

  describe('calculateChurnRisk', () => {
    test('should calculate high risk for inactive trading user', () => {
      const user = {
        _id: 'user123',
        createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
        stats: {
          lastTrade: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000), // 45 days ago
          totalTrades: 5,
          winRate: 40,
          totalProfit: -500
        },
        lastLogin: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000), // 20 days ago
        subscription: { tier: 'basic', status: 'active' },
        supportTickets: [],
        brokerConnections: []
      };

      const result = churnPredictor.calculateChurnRisk(user);

      expect(result.userId).toBe('user123');
      // Score: 35 (>30 days no trade) + 15 (40% win) + 20 (>14 days no login) + 5 (negative profit) = 75
      expect(result.riskLevel).toBe('critical'); // 75 points is critical (>= 70)
      expect(result.riskScore).toBe(75);
      expect(result.factors).toBeInstanceOf(Array);
      expect(result.recommendations).toBeInstanceOf(Array);
    });

    test('should calculate low risk for active, profitable user', () => {
      const user = {
        _id: 'user456',
        createdAt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000), // 180 days ago
        stats: {
          lastTrade: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
          totalTrades: 100,
          winRate: 65,
          totalProfit: 5000
        },
        lastLogin: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // Yesterday
        subscription: { tier: 'premium', status: 'active' },
        supportTickets: [],
        brokerConnections: [{ status: 'connected' }]
      };

      const result = churnPredictor.calculateChurnRisk(user);

      expect(result.riskLevel).toBe('low');
      expect(result.riskScore).toBeLessThan(30);
    });

    test('should calculate critical risk for completely inactive user', () => {
      const user = {
        _id: 'user789',
        createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
        stats: {
          lastTrade: null, // Never traded
          totalTrades: 0,
          winRate: 0,
          totalProfit: 0
        },
        lastLogin: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        subscription: { tier: 'basic', status: 'active' },
        supportTickets: [],
        brokerConnections: []
      };

      const result = churnPredictor.calculateChurnRisk(user);

      expect(result.riskLevel).toBe('critical');
      expect(result.riskScore).toBeGreaterThanOrEqual(70);
    });

    test('should handle user with broker connection issues', () => {
      const user = {
        _id: 'user101',
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        stats: {
          lastTrade: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          totalTrades: 10,
          winRate: 50,
          totalProfit: 100
        },
        lastLogin: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        subscription: { tier: 'pro', status: 'active' },
        supportTickets: [],
        brokerConnections: [
          { status: 'error' },
          { status: 'error' }
        ]
      };

      const result = churnPredictor.calculateChurnRisk(user);

      expect(result.factors).toContainEqual({ factor: 'Technical issues', severity: 'high' });
      expect(result.recommendations).toContainEqual('Proactive tech support outreach');
    });
  });

  describe('computeRiskScore', () => {
    test('should apply 35% weight for trading inactivity (>30 days)', () => {
      const features = {
        daysSinceLastTrade: 40,
        daysSinceLastLogin: 5,
        winRate: 50,
        totalProfit: 100,
        brokerConnectionIssues: 0
      };

      const score = churnPredictor.computeRiskScore(features);

      expect(score).toBeGreaterThanOrEqual(35);
    });

    test('should apply 25% weight for low win rate (<30%)', () => {
      const features = {
        daysSinceLastTrade: 5,
        daysSinceLastLogin: 2,
        winRate: 25,
        totalProfit: 0,
        brokerConnectionIssues: 0
      };

      const score = churnPredictor.computeRiskScore(features);

      expect(score).toBeGreaterThanOrEqual(25);
    });

    test('should cap risk score at 100', () => {
      const features = {
        daysSinceLastTrade: 100,
        daysSinceLastLogin: 30,
        winRate: 10,
        totalProfit: -2000,
        brokerConnectionIssues: 3
      };

      const score = churnPredictor.computeRiskScore(features);

      expect(score).toBeLessThanOrEqual(100);
      expect(score).toBe(100);
    });

    test('should return 0 for perfect user', () => {
      const features = {
        daysSinceLastTrade: 1,
        daysSinceLastLogin: 0,
        winRate: 70,
        totalProfit: 10000,
        brokerConnectionIssues: 0
      };

      const score = churnPredictor.computeRiskScore(features);

      expect(score).toBe(0);
    });

    test('should handle null lastTrade (never traded)', () => {
      const features = {
        daysSinceLastTrade: null,
        daysSinceLastLogin: 5,
        winRate: 0,
        totalProfit: 0,
        brokerConnectionIssues: 0
      };

      const score = churnPredictor.computeRiskScore(features);

      expect(score).toBeGreaterThanOrEqual(35); // Max penalty for no trades
    });
  });

  describe('getRiskLevel', () => {
    test('should classify score >= 70 as critical', () => {
      expect(churnPredictor.getRiskLevel(70)).toBe('critical');
      expect(churnPredictor.getRiskLevel(100)).toBe('critical');
    });

    test('should classify score 50-69 as high', () => {
      expect(churnPredictor.getRiskLevel(50)).toBe('high');
      expect(churnPredictor.getRiskLevel(69)).toBe('high');
    });

    test('should classify score 30-49 as medium', () => {
      expect(churnPredictor.getRiskLevel(30)).toBe('medium');
      expect(churnPredictor.getRiskLevel(49)).toBe('medium');
    });

    test('should classify score < 30 as low', () => {
      expect(churnPredictor.getRiskLevel(0)).toBe('low');
      expect(churnPredictor.getRiskLevel(29)).toBe('low');
    });
  });

  describe('identifyRiskFactors', () => {
    test('should identify inactive trading as high severity', () => {
      const features = {
        daysSinceLastTrade: 20,
        daysSinceLastLogin: 5,
        winRate: 50,
        totalProfit: 100,
        brokerConnectionIssues: 0
      };

      const factors = churnPredictor.identifyRiskFactors(features);

      expect(factors).toContainEqual({ factor: 'Inactive trading', severity: 'high' });
    });

    test('should identify low win rate as medium severity', () => {
      const features = {
        daysSinceLastTrade: 5,
        daysSinceLastLogin: 2,
        winRate: 40,
        totalProfit: 100,
        brokerConnectionIssues: 0
      };

      const factors = churnPredictor.identifyRiskFactors(features);

      expect(factors).toContainEqual({ factor: 'Low win rate', severity: 'medium' });
    });

    test('should identify technical issues as high severity', () => {
      const features = {
        daysSinceLastTrade: 5,
        daysSinceLastLogin: 2,
        winRate: 50,
        totalProfit: 100,
        brokerConnectionIssues: 2
      };

      const factors = churnPredictor.identifyRiskFactors(features);

      expect(factors).toContainEqual({ factor: 'Technical issues', severity: 'high' });
    });

    test('should identify multiple risk factors', () => {
      const features = {
        daysSinceLastTrade: 20,
        daysSinceLastLogin: 10,
        winRate: 40,
        totalProfit: -500,
        brokerConnectionIssues: 1
      };

      const factors = churnPredictor.identifyRiskFactors(features);

      expect(factors.length).toBeGreaterThanOrEqual(4);
      expect(factors.map(f => f.factor)).toContain('Inactive trading');
      expect(factors.map(f => f.factor)).toContain('Low engagement');
      expect(factors.map(f => f.factor)).toContain('Technical issues');
      expect(factors.map(f => f.factor)).toContain('Negative profit');
    });

    test('should return empty array for perfect user', () => {
      const features = {
        daysSinceLastTrade: 2,
        daysSinceLastLogin: 1,
        winRate: 70,
        totalProfit: 5000,
        brokerConnectionIssues: 0
      };

      const factors = churnPredictor.identifyRiskFactors(features);

      expect(factors).toEqual([]);
    });
  });

  describe('getRetentionRecommendations', () => {
    test('should recommend win-back email for critical risk', () => {
      const features = {
        daysSinceLastTrade: 5,
        daysSinceLastLogin: 2,
        winRate: 50,
        totalProfit: 100,
        brokerConnectionIssues: 0
      };

      const recommendations = churnPredictor.getRetentionRecommendations(75, features);

      expect(recommendations).toContain('Send personalized win-back email with 20% discount');
      expect(recommendations).toContain('Schedule customer success call');
    });

    test('should recommend signal highlights for inactive traders', () => {
      const features = {
        daysSinceLastTrade: 20,
        daysSinceLastLogin: 2,
        winRate: 50,
        totalProfit: 100,
        brokerConnectionIssues: 0
      };

      const recommendations = churnPredictor.getRetentionRecommendations(30, features);

      expect(recommendations).toContain('Send signal performance highlight email');
      expect(recommendations).toContain('Offer free trial of premium signals');
    });

    test('should recommend education for low win rate', () => {
      const features = {
        daysSinceLastTrade: 5,
        daysSinceLastLogin: 2,
        winRate: 40,
        totalProfit: -200,
        brokerConnectionIssues: 0
      };

      const recommendations = churnPredictor.getRetentionRecommendations(40, features);

      expect(recommendations).toContain('Suggest risk management webinar');
      expect(recommendations).toContain('Offer portfolio review by expert');
    });

    test('should recommend tech support for connection issues', () => {
      const features = {
        daysSinceLastTrade: 5,
        daysSinceLastLogin: 2,
        winRate: 50,
        totalProfit: 100,
        brokerConnectionIssues: 2
      };

      const recommendations = churnPredictor.getRetentionRecommendations(20, features);

      expect(recommendations).toContain('Proactive tech support outreach');
    });

    test('should return monitoring recommendation for low risk', () => {
      const features = {
        daysSinceLastTrade: 2,
        daysSinceLastLogin: 1,
        winRate: 70,
        totalProfit: 5000,
        brokerConnectionIssues: 0
      };

      const recommendations = churnPredictor.getRetentionRecommendations(10, features);

      expect(recommendations).toContain('Continue monitoring engagement');
    });
  });

  describe('batchCalculateRisk', () => {
    test('should calculate risk for multiple users', () => {
      const users = [
        {
          _id: 'user1',
          createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
          stats: { lastTrade: new Date(), totalTrades: 10, winRate: 60, totalProfit: 1000 },
          lastLogin: new Date(),
          subscription: { tier: 'basic', status: 'active' },
          supportTickets: [],
          brokerConnections: []
        },
        {
          _id: 'user2',
          createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
          stats: { lastTrade: null, totalTrades: 0, winRate: 0, totalProfit: 0 },
          lastLogin: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          subscription: { tier: 'pro', status: 'active' },
          supportTickets: [],
          brokerConnections: []
        }
      ];

      const results = churnPredictor.batchCalculateRisk(users);

      expect(results).toHaveLength(2);
      expect(results[0].userId).toBe('user1');
      expect(results[0].riskLevel).toBe('low');
      expect(results[1].userId).toBe('user2');
      expect(results[1].riskLevel).toBe('critical');
    });

    test('should handle empty user array', () => {
      const results = churnPredictor.batchCalculateRisk([]);

      expect(results).toEqual([]);
    });
  });

  describe('getHighRiskUsers', () => {
    test('should filter users by risk level (high)', () => {
      const users = [
        {
          _id: 'lowrisk',
          createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
          stats: { lastTrade: new Date(), totalTrades: 50, winRate: 65, totalProfit: 3000 },
          lastLogin: new Date(),
          subscription: { tier: 'premium', status: 'active' },
          supportTickets: [],
          brokerConnections: []
        },
        {
          _id: 'highrisk',
          createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
          stats: {
            lastTrade: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
            totalTrades: 5,
            winRate: 25,
            totalProfit: -1000
          },
          lastLogin: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
          subscription: { tier: 'basic', status: 'active' },
          supportTickets: [],
          brokerConnections: [{ status: 'error' }]
        }
      ];

      const highRiskUsers = churnPredictor.getHighRiskUsers(users, 'high');

      expect(highRiskUsers.length).toBe(1);
      expect(highRiskUsers[0].userId).toBe('highrisk');
    });

    test('should sort users by risk score descending', () => {
      const users = [
        {
          _id: 'user1',
          createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
          stats: {
            lastTrade: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
            totalTrades: 10,
            winRate: 40,
            totalProfit: -200
          },
          lastLogin: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
          subscription: { tier: 'basic', status: 'active' },
          supportTickets: [],
          brokerConnections: []
        },
        {
          _id: 'user2',
          createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
          stats: {
            lastTrade: null,
            totalTrades: 0,
            winRate: 0,
            totalProfit: 0
          },
          lastLogin: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          subscription: { tier: 'basic', status: 'active' },
          supportTickets: [],
          brokerConnections: []
        }
      ];

      const highRiskUsers = churnPredictor.getHighRiskUsers(users, 'medium');

      expect(highRiskUsers[0].riskScore).toBeGreaterThanOrEqual(highRiskUsers[1].riskScore);
    });

    test('should include critical and high users when filtering for high', () => {
      const users = [
        {
          _id: 'critical',
          createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
          stats: { lastTrade: null, totalTrades: 0, winRate: 0, totalProfit: 0 },
          lastLogin: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          subscription: { tier: 'basic', status: 'active' },
          supportTickets: [],
          brokerConnections: []
        }
      ];

      const highRiskUsers = churnPredictor.getHighRiskUsers(users, 'high');

      expect(highRiskUsers.length).toBe(1);
      expect(highRiskUsers[0].riskLevel).toBe('critical');
    });
  });
});
