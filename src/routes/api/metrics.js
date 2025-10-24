// External dependencies
const express = require('express');

const router = express.Router();
const { ensureAuthenticated } = require('../../middleware/auth');
const { ensureAdmin } = require('../../middleware/admin');

// Verify ensureAdmin is properly loaded
if (typeof ensureAdmin !== 'function') {
  logger.error('[MetricsRoute] ensureAdmin middleware failed to load', {
    ensureAdminType: typeof ensureAdmin,
    ensureAdmin
  });
  throw new Error('ensureAdmin middleware failed to load');
}
const { apiLimiter } = require('../../middleware/rateLimiter');
const performanceTracker = require('../../PerformanceTracker');
const logger = require('../../utils/logger');

// Apply rate limiting to all routes
router.use(apiLimiter);

/**
 * GET /api/metrics
 * Get all performance metrics
 * Requires: Authentication
 */
router.get('/', ensureAuthenticated, (req, res) => {
  try {
    const metrics = performanceTracker.getMetrics();
    res.json(metrics);
  } catch (error) {
    logger.error('Error fetching metrics:', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

/**
 * GET /api/metrics/health
 * Get system health status
 * Public endpoint for health checks
 */
router.get('/health', (req, res) => {
  try {
    const health = performanceTracker.getHealthStatus();
    const statusCode = health.status === 'critical' ? 503 : 200;
    res.status(statusCode).json(health);
  } catch (error) {
    logger.error('Error fetching health status:', { error: error.message, stack: error.stack });
    res.status(500).json({
      status: 'critical',
      error: 'Failed to check health status',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/metrics/webhooks
 * Get webhook-specific metrics
 * Requires: Authentication
 */
router.get('/webhooks', ensureAuthenticated, (req, res) => {
  try {
    const metrics = performanceTracker.getMetrics();
    res.json(metrics.webhooks);
  } catch (error) {
    logger.error('Error fetching webhook metrics:', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Failed to fetch webhook metrics' });
  }
});

/**
 * GET /api/metrics/trades
 * Get trade execution metrics
 * Requires: Authentication
 */
router.get('/trades', ensureAuthenticated, (req, res) => {
  try {
    const metrics = performanceTracker.getMetrics();
    res.json(metrics.trades);
  } catch (error) {
    logger.error('Error fetching trade metrics:', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Failed to fetch trade metrics' });
  }
});

/**
 * GET /api/metrics/database
 * Get database query metrics
 * Requires: Authentication
 */
router.get('/database', ensureAuthenticated, (req, res) => {
  try {
    const metrics = performanceTracker.getMetrics();
    res.json(metrics.database);
  } catch (error) {
    logger.error('Error fetching database metrics:', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Failed to fetch database metrics' });
  }
});

/**
 * GET /api/metrics/database/profiling
 * Get MongoDB slow query profiling statistics (US2-T05)
 * Requires: Admin authentication
 */
router.get('/database/profiling', ensureAuthenticated, async (req, res) => {
  try {
    // Import database module for profiling stats
    const { getProfilingStats } = require('../../config/database');
    
    const stats = await getProfilingStats();
    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error fetching profiling stats:', { error: error.message, stack: error.stack });
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch profiling statistics',
      message: error.message 
    });
  }
});

/**
 * GET /api/metrics/api
 * Get external API call metrics
 * Requires: Authentication
 */
router.get('/api', ensureAuthenticated, (req, res) => {
  try {
    const metrics = performanceTracker.getMetrics();
    res.json(metrics.api);
  } catch (error) {
    logger.error('Error fetching API metrics:', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Failed to fetch API metrics' });
  }
});

/**
 * GET /api/metrics/mfa
 * Get MFA verification metrics
 * Requires: Authentication
 */
router.get('/mfa', ensureAuthenticated, (req, res) => {
  try {
    const metrics = performanceTracker.getMetrics();
    res.json(metrics.mfa);
  } catch (error) {
    logger.error('Error fetching MFA metrics:', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Failed to fetch MFA metrics' });
  }
});

/**
 * GET /api/metrics/system
 * Get system resource metrics
 * Requires: Authentication
 */
router.get('/system', ensureAuthenticated, (req, res) => {
  try {
    const metrics = performanceTracker.getMetrics();
    res.json(metrics.system);
  } catch (error) {
    logger.error('Error fetching system metrics:', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Failed to fetch system metrics' });
  }
});

/**
 * GET /api/metrics/rate-limiting
 * Get rate limiting metrics
 * Requires: Authentication
 */
router.get('/rate-limiting', ensureAuthenticated, (req, res) => {
  try {
    const metrics = performanceTracker.getMetrics();
    res.json(metrics.rateLimiting);
  } catch (error) {
    logger.error('Error fetching rate limiting metrics:', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Failed to fetch rate limiting metrics' });
  }
});

/**
 * GET /api/metrics/custom/:name
 * Get specific custom metric
 * Requires: Authentication
 */
router.get('/custom/:name', ensureAuthenticated, (req, res) => {
  try {
    const metrics = performanceTracker.getMetrics();
    const metricName = req.params.name;

    if (metrics.custom[metricName]) {
      res.json({
        name: metricName,
        ...metrics.custom[metricName]
      });
    } else {
      res.status(404).json({ error: `Custom metric '${metricName}' not found` });
    }
  } catch (error) {
    logger.error('Error fetching custom metric:', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Failed to fetch custom metric' });
  }
});

/**
 * POST /api/metrics/custom
 * Record a custom metric value
 * Requires: Authentication
 * Body: { name: string, value: number }
 */
router.post('/custom', ensureAuthenticated, (req, res) => {
  try {
    const { name, value } = req.body;

    if (!name || typeof value !== 'number') {
      return res.status(400).json({
        error: 'Missing required fields: name (string) and value (number)'
      });
    }

    performanceTracker.recordCustomMetric(name, value);

    res.json({
      success: true,
      message: `Custom metric '${name}' recorded with value ${value}`
    });
  } catch (error) {
    logger.error('Error recording custom metric:', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Failed to record custom metric' });
  }
});

/**
 * POST /api/metrics/reset
 * Reset all metrics (admin only)
 * Requires: Admin authentication
 */
router.post('/reset', ensureAdmin, (req, res) => {
  try {
    performanceTracker.reset();
    res.json({
      success: true,
      message: 'All metrics have been reset'
    });
  } catch (error) {
    logger.error('Error resetting metrics:', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Failed to reset metrics' });
  }
});

/**
 * GET /api/metrics/export
 * Export metrics in Prometheus format
 * Requires: Authentication
 */
router.get('/export', ensureAuthenticated, (req, res) => {
  try {
    const metrics = performanceTracker.getMetrics();

    // Convert metrics to Prometheus format
    let prometheusMetrics = '# HELP Performance metrics for Discord Trade Executor\n';
    prometheusMetrics += '# TYPE discord_trade_executor metrics\n\n';

    // Webhooks
    prometheusMetrics += `discord_webhooks_total ${metrics.webhooks.total}\n`;
    prometheusMetrics += `discord_webhooks_successful ${metrics.webhooks.successful}\n`;
    prometheusMetrics += `discord_webhooks_failed ${metrics.webhooks.failed}\n`;
    prometheusMetrics += `discord_webhooks_success_rate ${metrics.webhooks.successRate}\n`;
    prometheusMetrics += `discord_webhooks_response_time_avg ${metrics.webhooks.responseTime.avg}\n`;
    prometheusMetrics += `discord_webhooks_response_time_p50 ${metrics.webhooks.responseTime.p50}\n`;
    prometheusMetrics += `discord_webhooks_response_time_p95 ${metrics.webhooks.responseTime.p95}\n`;
    prometheusMetrics += `discord_webhooks_response_time_p99 ${metrics.webhooks.responseTime.p99}\n\n`;

    // Trades
    prometheusMetrics += `discord_trades_total ${metrics.trades.total}\n`;
    prometheusMetrics += `discord_trades_successful ${metrics.trades.successful}\n`;
    prometheusMetrics += `discord_trades_failed ${metrics.trades.failed}\n`;
    prometheusMetrics += `discord_trades_success_rate ${metrics.trades.successRate}\n`;
    prometheusMetrics += `discord_trades_execution_time_avg ${metrics.trades.executionTime.avg}\n`;
    prometheusMetrics += `discord_trades_execution_time_p95 ${metrics.trades.executionTime.p95}\n\n`;

    // Database
    prometheusMetrics += `discord_database_queries_total ${metrics.database.queries}\n`;
    prometheusMetrics += `discord_database_queries_successful ${metrics.database.successful}\n`;
    prometheusMetrics += `discord_database_queries_failed ${metrics.database.failed}\n`;
    prometheusMetrics += `discord_database_query_time_avg ${metrics.database.queryTime.avg}\n`;
    prometheusMetrics += `discord_database_query_time_p95 ${metrics.database.queryTime.p95}\n\n`;

    // API
    prometheusMetrics += `discord_api_calls_total ${metrics.api.calls}\n`;
    prometheusMetrics += `discord_api_calls_successful ${metrics.api.successful}\n`;
    prometheusMetrics += `discord_api_calls_failed ${metrics.api.failed}\n`;
    prometheusMetrics += `discord_api_response_time_avg ${metrics.api.responseTime.avg}\n`;
    prometheusMetrics += `discord_api_response_time_p95 ${metrics.api.responseTime.p95}\n\n`;

    // System
    prometheusMetrics += `discord_system_uptime_seconds ${metrics.system.uptime}\n`;
    prometheusMetrics += `discord_system_memory_rss ${metrics.system.memoryUsage.rss}\n`;
    prometheusMetrics += `discord_system_memory_heap_used ${metrics.system.memoryUsage.heapUsed}\n`;
    prometheusMetrics += `discord_system_cpu_user_percent ${metrics.system.cpuUsage.user.current}\n`;
    prometheusMetrics += `discord_system_cpu_system_percent ${metrics.system.cpuUsage.system.current}\n`;
    prometheusMetrics += `discord_system_active_requests ${metrics.system.activeRequests}\n\n`;

    res.setHeader('Content-Type', 'text/plain');
    res.send(prometheusMetrics);
  } catch (error) {
    logger.error('Error exporting metrics:', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Failed to export metrics' });
  }
});

module.exports = router;
