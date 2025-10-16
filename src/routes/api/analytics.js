// External dependencies
const express = require('express');
const router = express.Router();

// Internal utilities and services
const RevenueMetrics = require('../../services/analytics/RevenueMetrics');
const ChurnPredictor = require('../../services/analytics/ChurnPredictor');
const CohortAnalyzer = require('../../services/analytics/CohortAnalyzer');
const User = require('../../models/User');

// Middleware for admin-only access
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

/**
 * GET /api/analytics/revenue
 * Get comprehensive revenue metrics (MRR, ARR, LTV, churn)
 */
router.get('/revenue', requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const revenueMetrics = new RevenueMetrics();

    const metrics = await revenueMetrics.getAllMetrics(
      startDate ? new Date(startDate) : null,
      endDate ? new Date(endDate) : null
    );

    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('Error fetching revenue metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch revenue metrics',
      message: error.message
    });
  }
});

/**
 * GET /api/analytics/mrr
 * Get Monthly Recurring Revenue breakdown
 */
router.get('/mrr', requireAdmin, async (req, res) => {
  try {
    const revenueMetrics = new RevenueMetrics();
    const mrr = await revenueMetrics.calculateMRR();

    res.json({
      success: true,
      data: mrr
    });
  } catch (error) {
    console.error('Error fetching MRR:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch MRR',
      message: error.message
    });
  }
});

/**
 * GET /api/analytics/arr
 * Get Annual Recurring Revenue
 */
router.get('/arr', requireAdmin, async (req, res) => {
  try {
    const revenueMetrics = new RevenueMetrics();
    const arr = await revenueMetrics.calculateARR();

    res.json({
      success: true,
      data: arr
    });
  } catch (error) {
    console.error('Error fetching ARR:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch ARR',
      message: error.message
    });
  }
});

/**
 * GET /api/analytics/ltv
 * Get Customer Lifetime Value metrics
 */
router.get('/ltv', requireAdmin, async (req, res) => {
  try {
    const revenueMetrics = new RevenueMetrics();
    const ltv = await revenueMetrics.calculateLTV();

    res.json({
      success: true,
      data: ltv
    });
  } catch (error) {
    console.error('Error fetching LTV:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch LTV',
      message: error.message
    });
  }
});

/**
 * GET /api/analytics/churn
 * Get churn rate for specified period
 */
router.get('/churn', requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate query parameters required'
      });
    }

    const revenueMetrics = new RevenueMetrics();
    const churn = await revenueMetrics.calculateChurnRate(
      new Date(startDate),
      new Date(endDate)
    );

    res.json({
      success: true,
      data: churn
    });
  } catch (error) {
    console.error('Error fetching churn rate:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch churn rate',
      message: error.message
    });
  }
});

/**
 * GET /api/analytics/churn-risks
 * Get users at high risk of churning
 */
router.get('/churn-risks', requireAdmin, async (req, res) => {
  try {
    const { minRiskLevel = 'high', limit = 50 } = req.query;

    const activeUsers = await User.find({
      'subscription.status': 'active'
    })
      .select('subscription stats lastLogin createdAt supportTickets brokerConnections')
      .limit(parseInt(limit));

    const churnPredictor = new ChurnPredictor();
    const atRiskUsers = churnPredictor.getHighRiskUsers(activeUsers, minRiskLevel);

    res.json({
      success: true,
      data: {
        count: atRiskUsers.length,
        users: atRiskUsers,
        minRiskLevel
      }
    });
  } catch (error) {
    console.error('Error fetching churn risks:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch churn risks',
      message: error.message
    });
  }
});

/**
 * POST /api/analytics/churn-risk/calculate
 * Calculate churn risk for specific user
 */
router.post('/churn-risk/calculate', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId required in request body'
      });
    }

    const user = await User.findById(userId)
      .select('subscription stats lastLogin createdAt supportTickets brokerConnections');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const churnPredictor = new ChurnPredictor();
    const riskAnalysis = churnPredictor.calculateChurnRisk(user);

    res.json({
      success: true,
      data: riskAnalysis
    });
  } catch (error) {
    console.error('Error calculating churn risk:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate churn risk',
      message: error.message
    });
  }
});

/**
 * GET /api/analytics/dashboard
 * Get comprehensive dashboard metrics
 */
router.get('/dashboard', requireAdmin, async (req, res) => {
  try {
    const revenueMetrics = new RevenueMetrics();
    const churnPredictor = new ChurnPredictor();

    // Get all active users
    const activeUsers = await User.find({
      'subscription.status': 'active'
    })
      .select('subscription stats lastLogin createdAt supportTickets brokerConnections')
      .limit(1000);

    // Calculate metrics in parallel
    const [mrr, ltv, atRiskUsers] = await Promise.all([
      revenueMetrics.calculateMRR(),
      revenueMetrics.calculateLTV(),
      Promise.resolve(churnPredictor.getHighRiskUsers(activeUsers, 'medium'))
    ]);

    // Get 30-day churn rate
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const churn = await revenueMetrics.calculateChurnRate(thirtyDaysAgo, new Date());

    res.json({
      success: true,
      data: {
        revenue: {
          mrr: mrr.current,
          mrrByTier: mrr.byTier,
          arr: mrr.current * 12,
          ltv: ltv.perUser,
          avgLifetimeMonths: ltv.avgLifetimeMonths
        },
        subscribers: {
          active: mrr.subscriberCount,
          churnRate30d: churn.churnRate,
          churned30d: churn.churned
        },
        churnRisk: {
          atRisk: atRiskUsers.length,
          critical: atRiskUsers.filter(u => u.riskLevel === 'critical').length,
          high: atRiskUsers.filter(u => u.riskLevel === 'high').length,
          medium: atRiskUsers.filter(u => u.riskLevel === 'medium').length
        },
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard metrics',
      message: error.message
    });
  }
});

/**
 * GET /api/analytics/cohorts/retention
 * Get cohort retention table
 */
router.get('/cohorts/retention', requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate, period = 'month', metric = 'login' } = req.query;

    const cohortAnalyzer = new CohortAnalyzer();
    const retentionTable = await cohortAnalyzer.generateRetentionTable({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      cohortPeriod: period,
      retentionMetric: metric
    });

    res.json({
      success: true,
      data: retentionTable
    });
  } catch (error) {
    console.error('Error generating cohort retention table:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate retention table',
      message: error.message
    });
  }
});

/**
 * GET /api/analytics/cohorts/:cohortId
 * Get detailed analysis for a specific cohort
 */
router.get('/cohorts/:cohortId', requireAdmin, async (req, res) => {
  try {
    const { cohortId } = req.params;

    const cohortAnalyzer = new CohortAnalyzer();
    const analysis = await cohortAnalyzer.analyzeCohortBehavior(cohortId);

    if (!analysis) {
      return res.status(404).json({
        success: false,
        error: 'Cohort not found or has no users'
      });
    }

    res.json({
      success: true,
      data: analysis
    });
  } catch (error) {
    console.error('Error analyzing cohort:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze cohort',
      message: error.message
    });
  }
});

/**
 * POST /api/analytics/cohorts/compare
 * Compare multiple cohorts
 */
router.post('/cohorts/compare', requireAdmin, async (req, res) => {
  try {
    const { cohortIds } = req.body;

    if (!Array.isArray(cohortIds) || cohortIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'cohortIds array required in request body'
      });
    }

    const cohortAnalyzer = new CohortAnalyzer();
    const comparison = await cohortAnalyzer.compareCohorts(cohortIds);

    res.json({
      success: true,
      data: comparison
    });
  } catch (error) {
    console.error('Error comparing cohorts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to compare cohorts',
      message: error.message
    });
  }
});

module.exports = router;
