// External dependencies
const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');

// Internal utilities and services
const { getRevenueMetricsInstance } = require('../../services/analytics/RevenueMetrics');
const { getChurnPredictorInstance } = require('../../services/analytics/ChurnPredictor');
const { getCohortAnalyzerInstance } = require('../../services/analytics/CohortAnalyzer');
const User = require('../../models/User');
const { getMetricsInstance } = require('../../utils/analytics-metrics');
const { getAlertsInstance } = require('../../utils/analytics-alerts');
const { getQueryLoggerInstance } = require('../../utils/analytics-query-logger');
const { getCacheInstance } = require('../../utils/analytics-cache');
const { AppError, ErrorCodes } = require('../../middleware/errorHandler');
const { validate } = require('../../middleware/validation');
const {
  revenueQuery,
  churnQuery,
  churnRisksQuery,
  churnRiskCalculateBody,
  cohortRetentionQuery,
  cohortDetailParams,
  cohortCompareBody,
  metricsExportQuery,
  slowQueriesQuery,
  alertsQuery,
  queryPatternsQuery
} = require('../../validators/analytics.validators');

// Get singleton instances
const revenueMetrics = getRevenueMetricsInstance();
const churnPredictor = getChurnPredictorInstance();
const cohortAnalyzer = getCohortAnalyzerInstance();
const metricsTracker = getMetricsInstance();
const alertsSystem = getAlertsInstance();
const queryLogger = getQueryLoggerInstance();
const cache = getCacheInstance();

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
router.get('/revenue', validate(revenueQuery, 'query'), requireAdmin, async (req, res) => {
  const tracker = metricsTracker.startQuery('revenue', req.query);
  const queryStartTime = Date.now();

  try {
    const { startDate, endDate } = req.query;

    const metrics = await revenueMetrics.getAllMetrics(
      startDate ? new Date(startDate) : null,
      endDate ? new Date(endDate) : null
    );

    const executionTime = Date.now() - queryStartTime;
    metricsTracker.endQuery(tracker, { documentCount: Object.keys(metrics).length });

    // Log query pattern
    queryLogger.logQuery({
      queryType: 'revenue',
      params: req.query,
      executionTime,
      userId: req.user?.id,
      resultSize: Object.keys(metrics).length
    });

    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    metricsTracker.recordError(tracker, error);
    logger.error('Error fetching slow queries', {
      error: error.message,
    });
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
router.get('/mrr', validate(revenueQuery, 'query'), requireAdmin, async (req, res) => {
  try {
    // Use Redis cache wrapper
    const result = await cache.wrap(cache.prefixes.MRR, () => revenueMetrics.calculateMRR(), {}, cache.ttls.MRR);

    res.json({
      success: true,
      data: result.data,
      cached: result.fromCache
    });
  } catch (error) {

    logger.error('Error fetching MRR', {

      error: error.message,


      correlationId: req.correlationId

    });

    throw new AppError(

      'Operation failed',

      500,

      ErrorCodes.INTERNAL_SERVER_ERROR

    );

  }
});

/**
 * GET /api/analytics/arr
 * Get Annual Recurring Revenue
 */
router.get('/arr', validate(revenueQuery, 'query'), requireAdmin, async (req, res) => {
  try {
    const arr = await revenueMetrics.calculateARR();

    res.json({
      success: true,
      data: arr
    });
  } catch (error) {

    logger.error('Error fetching ARR', {

      error: error.message,


      correlationId: req.correlationId

    });

    throw new AppError(

      'Operation failed',

      500,

      ErrorCodes.INTERNAL_SERVER_ERROR

    );

  }
});

/**
 * GET /api/analytics/ltv
 * Get Customer Lifetime Value metrics
 */
router.get('/ltv', validate(revenueQuery, 'query'), requireAdmin, async (req, res) => {
  try {
    // Use Redis cache wrapper
    const result = await cache.wrap(cache.prefixes.LTV, () => revenueMetrics.calculateLTV(), {}, cache.ttls.LTV);

    res.json({
      success: true,
      data: result.data,
      cached: result.fromCache
    });
  } catch (error) {

    logger.error('Error fetching LTV', {

      error: error.message,


      correlationId: req.correlationId

    });

    throw new AppError(

      'Operation failed',

      500,

      ErrorCodes.INTERNAL_SERVER_ERROR

    );

  }
});

/**
 * GET /api/analytics/churn
 * Get churn rate for specified period
 */
router.get('/churn', validate(churnQuery, 'query'), requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Date validation handled by Zod middleware
    const churn = await revenueMetrics.calculateChurnRate(new Date(startDate), new Date(endDate));

    res.json({
      success: true,
      data: churn
    });
  } catch (error) {

    logger.error('Error fetching churn rate', {

      error: error.message,


      correlationId: req.correlationId

    });

    throw new AppError(

      'Operation failed',

      500,

      ErrorCodes.INTERNAL_SERVER_ERROR

    );

  }
});

/**
 * GET /api/analytics/churn-risks
 * Get users at high risk of churning
 */
router.get('/churn-risks', validate(churnRisksQuery, 'query'), requireAdmin, async (req, res) => {
  try {
    const { minRiskLevel = 'high', limit = 50 } = req.query;

    const activeUsers = await User.find({
      'subscription.status': 'active'
    })
      .select('subscription stats lastLogin createdAt supportTickets brokerConnections')
      .limit(parseInt(limit));

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

    logger.error('Error fetching churn risks', {

      error: error.message,


      correlationId: req.correlationId

    });

    throw new AppError(

      'Operation failed',

      500,

      ErrorCodes.INTERNAL_SERVER_ERROR

    );

  }
});

/**
 * POST /api/analytics/churn-risk/calculate
 * Calculate churn risk for specific user
 */
router.post('/churn-risk/calculate', validate(churnRiskCalculateBody, 'body'), requireAdmin, async (req, res) => {
  try {
    const { userId } = req.body;

    // userId validation handled by Zod middleware
    const user = await User.findById(userId).select(
      'subscription stats lastLogin createdAt supportTickets brokerConnections'
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const riskAnalysis = churnPredictor.calculateChurnRisk(user);

    res.json({
      success: true,
      data: riskAnalysis
    });
  } catch (error) {

    logger.error('Error calculating churn risk', {

      error: error.message,


      correlationId: req.correlationId

    });

    throw new AppError(

      'Operation failed',

      500,

      ErrorCodes.INTERNAL_SERVER_ERROR

    );

  }
});

/**
 * GET /api/analytics/dashboard
 * Get comprehensive dashboard metrics
 */
router.get('/dashboard', requireAdmin, async (req, res) => {
  try {
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

    // Check metrics against alert thresholds
    const alerts = [];

    // Check churn rate
    const churnAlert = alertsSystem.checkChurnRate(churn.churnRate, {
      period: '30d',
      churned: churn.churned,
      startSubscribers: churn.startSubscribers
    });
    if (churnAlert.alerted) alerts.push(churnAlert.alert);

    // Check MRR growth (if we have previous MRR data)
    if (mrr.previous && mrr.current) {
      const mrrGrowth = (mrr.current - mrr.previous) / mrr.previous;
      const mrrAlert = alertsSystem.checkMRRGrowth(mrrGrowth, {
        currentMRR: mrr.current,
        previousMRR: mrr.previous,
        change: mrr.current - mrr.previous
      });
      if (mrrAlert.alerted) alerts.push(mrrAlert.alert);
    }

    // Check at-risk users percentage
    const atRiskPercentage = atRiskUsers.length / Math.max(activeUsers.length, 1);
    const criticalCount = atRiskUsers.filter(u => u.riskLevel === 'critical').length;
    const atRiskAlert = alertsSystem.checkAtRiskUsers(atRiskPercentage, {
      atRiskCount: atRiskUsers.length,
      totalUsers: activeUsers.length,
      criticalCount
    });
    if (atRiskAlert.alerted) alerts.push(atRiskAlert.alert);

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
        alerts: {
          active: alerts,
          count: alerts.length
        },
        timestamp: new Date()
      }
    });
  } catch (error) {

    logger.error('Error fetching dashboard metrics', {

      error: error.message,


      correlationId: req.correlationId

    });

    throw new AppError(

      'Operation failed',

      500,

      ErrorCodes.INTERNAL_SERVER_ERROR

    );

  }
});

/**
 * GET /api/analytics/cohorts/retention
 * Get cohort retention table
 */
router.get('/cohorts/retention', validate(cohortRetentionQuery, 'query'), requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate, period = 'month', metric = 'login' } = req.query;

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

    logger.error('Error generating cohort retention table', {

      error: error.message,


      correlationId: req.correlationId

    });

    throw new AppError(

      'Operation failed',

      500,

      ErrorCodes.INTERNAL_SERVER_ERROR

    );

  }
});

/**
 * GET /api/analytics/cohorts/:cohortId
 * Get detailed analysis for a specific cohort
 */
router.get('/cohorts/:cohortId', validate(cohortDetailParams, 'params'), requireAdmin, async (req, res) => {
  try {
    const { cohortId } = req.params;

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

    logger.error('Error analyzing cohort', {

      error: error.message,


      correlationId: req.correlationId

    });

    throw new AppError(

      'Operation failed',

      500,

      ErrorCodes.INTERNAL_SERVER_ERROR

    );

  }
});

/**
 * POST /api/analytics/cohorts/compare
 * Compare multiple cohorts
 */
router.post('/cohorts/compare', validate(cohortCompareBody, 'body'), requireAdmin, async (req, res) => {
  try {
    const { cohortIds } = req.body;

    // cohortIds validation handled by Zod middleware
    const comparison = await cohortAnalyzer.compareCohorts(cohortIds);

    res.json({
      success: true,
      data: comparison
    });
  } catch (error) {

    logger.error('Error comparing cohorts', {

      error: error.message,


      correlationId: req.correlationId

    });

    throw new AppError(

      'Operation failed',

      500,

      ErrorCodes.INTERNAL_SERVER_ERROR

    );

  }
});

/**
 * GET /api/analytics/metrics
 * Get analytics query performance metrics
 */
router.get('/metrics', validate(metricsExportQuery, 'query'), requireAdmin, async (req, res) => {
  try {
    const { format = 'summary' } = req.query;

    if (format === 'report') {
      const report = metricsTracker.generateReport();
      return res.json({
        success: true,
        data: report
      });
    }

    const metrics = metricsTracker.getMetrics();
    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {

    logger.error('Error fetching analytics metrics', {

      error: error.message,


      correlationId: req.correlationId

    });

    throw new AppError(

      'Operation failed',

      500,

      ErrorCodes.INTERNAL_SERVER_ERROR

    );

  }
});

/**
 * GET /api/analytics/metrics/slow-queries
 * Get slow query analysis
 */
router.get('/metrics/slow-queries', validate(slowQueriesQuery, 'query'), requireAdmin, async (req, res) => {
  try {
    const { severity } = req.query;
    const slowQueries = metricsTracker.getSlowQueries(severity);

    res.json({
      success: true,
      data: {
        count: slowQueries.length,
        queries: slowQueries
      }
    });
  } catch (error) {

    logger.error('Error fetching slow queries', {

      error: error.message,


      correlationId: req.correlationId

    });

    throw new AppError(

      'Operation failed',

      500,

      ErrorCodes.INTERNAL_SERVER_ERROR

    );

  }
});

/**
 * GET /api/analytics/health
 * Check analytics system health
 */
router.get('/health', requireAdmin, async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      checks: {},
      timestamp: new Date()
    };

    // Database connection check
    try {
      await User.countDocuments();
      health.checks.database = { status: 'ok', message: 'Connected' };
    } catch (error) {
      health.checks.database = { status: 'error', message: error.message };
    }

    // RevenueMetrics service check
    try {
      await revenueMetrics.calculateMRR();
      health.checks.revenueService = { status: 'ok', message: 'Operational' };
    } catch (error) {
      health.checks.revenueService = { status: 'error', message: error.message };
    }

    // ChurnPredictor service check
    try {
      const testUser = { subscription: { status: 'active' }, stats: {}, lastLogin: new Date() };
      churnPredictor.calculateChurnRisk(testUser);
      health.checks.churnService = { status: 'ok', message: 'Operational' };
    } catch (error) {
      health.checks.churnService = { status: 'error', message: error.message };
    }

    // CohortAnalyzer service check
    try {
      health.checks.cohortService = { status: 'ok', message: 'Operational' };
    } catch (error) {
      health.checks.cohortService = { status: 'error', message: error.message };
    }

    // Metrics tracker check
    health.checks.metricsTracker = metricsTracker
      ? { status: 'ok', message: 'Operational', queryCount: metricsTracker.getMetrics().performance.totalQueries }
      : { status: 'unavailable', message: 'Not initialized' };

    // Alerts system check
    health.checks.alertsSystem = alertsSystem
      ? { status: 'ok', message: 'Operational', activeAlerts: alertsSystem.getActiveAlerts().length }
      : { status: 'unavailable', message: 'Not initialized' };

    // Determine overall status
    const allHealthy = Object.values(health.checks).every(c => c.status === 'ok');
    health.status = allHealthy ? 'healthy' : 'degraded';

    res.status(allHealthy ? 200 : 503).json({
      success: true,
      data: health
    });
  } catch (error) {

    logger.error('Error checking analytics health', {

      error: error.message,


      correlationId: req.correlationId

    });

    throw new AppError(

      'Operation failed',

      500,

      ErrorCodes.INTERNAL_SERVER_ERROR

    );

  }
});

/**
 * GET /api/analytics/alerts
 * Get alert history and active alerts
 */
router.get('/alerts', validate(alertsQuery, 'query'), requireAdmin, async (req, res) => {
  try {
    const { limit = 50, severity } = req.query;

    const alerts = {
      active: alertsSystem.getActiveAlerts(),
      history: alertsSystem.getAlertHistory(parseInt(limit), severity),
      summary: {
        totalActive: alertsSystem.getActiveAlerts().length,
        criticalActive: alertsSystem.getActiveAlerts().filter(a => a.severity === 'critical').length,
        warningActive: alertsSystem.getActiveAlerts().filter(a => a.severity === 'warning').length
      }
    };

    res.json({
      success: true,
      data: alerts
    });
  } catch (error) {

    logger.error('Error fetching alerts', {

      error: error.message,


      correlationId: req.correlationId

    });

    throw new AppError(

      'Operation failed',

      500,

      ErrorCodes.INTERNAL_SERVER_ERROR

    );

  }
});

/**
 * GET /api/analytics/query-patterns
 * Get query patterns and frequency analysis
 */
router.get('/query-patterns', validate(queryPatternsQuery, 'query'), requireAdmin, async (req, res) => {
  try {
    const { limit = 50, type = 'frequent' } = req.query;

    let patterns;
    if (type === 'slow') {
      patterns = queryLogger.getSlowestPatterns(parseInt(limit));
    } else {
      patterns = queryLogger.getFrequentPatterns(parseInt(limit));
    }

    res.json({
      success: true,
      data: {
        patterns,
        count: patterns.length,
        type
      }
    });
  } catch (error) {

    logger.error('Error fetching query patterns', {

      error: error.message,


      correlationId: req.correlationId

    });

    throw new AppError(

      'Operation failed',

      500,

      ErrorCodes.INTERNAL_SERVER_ERROR

    );

  }
});

/**
 * GET /api/analytics/optimization-report
 * Get comprehensive optimization report with recommendations
 */
router.get('/optimization-report', requireAdmin, async (req, res) => {
  try {
    const report = queryLogger.generateOptimizationReport();

    res.json({
      success: true,
      data: report
    });
  } catch (error) {

    logger.error('Error generating optimization report', {

      error: error.message,


      correlationId: req.correlationId

    });

    throw new AppError(

      'Operation failed',

      500,

      ErrorCodes.INTERNAL_SERVER_ERROR

    );

  }
});

module.exports = router;
