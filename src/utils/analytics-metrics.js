/**
 * Analytics Performance Metrics Tracker
 *
 * Tracks execution time, memory usage, and query patterns for analytics operations.
 * Used for monitoring performance and identifying optimization opportunities.
 */

class AnalyticsMetrics {
  constructor() {
    this.metrics = {
      queries: {},
      errors: [],
      performance: {
        totalQueries: 0,
        avgExecutionTime: 0,
        slowQueries: []
      }
    };

    // Thresholds
    this.SLOW_QUERY_THRESHOLD = 1000; // 1 second
    this.MAX_STORED_ERRORS = 100;
    this.MAX_SLOW_QUERIES = 50;
  }

  /**
   * Start tracking a query
   * @param {string} queryType - Type of query (e.g., 'mrr', 'churn_risks', 'cohort_retention')
   * @param {Object} params - Query parameters
   * @returns {Object} Query tracker object
   */
  startQuery(queryType, params = {}) {
    const queryId = `${queryType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const tracker = {
      queryId,
      queryType,
      params: this.sanitizeParams(params),
      startTime: Date.now(),
      startMemory: process.memoryUsage().heapUsed
    };

    return tracker;
  }

  /**
   * Complete query tracking and record metrics
   * @param {Object} tracker - Query tracker object from startQuery()
   * @param {Object} result - Query result metadata (rowCount, etc.)
   * @returns {Object} Query metrics
   */
  endQuery(tracker, result = {}) {
    const endTime = Date.now();
    const endMemory = process.memoryUsage().heapUsed;

    const executionTime = endTime - tracker.startTime;
    const memoryDelta = endMemory - tracker.startMemory;

    const queryMetrics = {
      queryId: tracker.queryId,
      queryType: tracker.queryType,
      params: tracker.params,
      executionTime,
      memoryDelta,
      timestamp: new Date().toISOString(),
      resultSize: result.rowCount || result.documentCount || 0
    };

    // Update aggregate metrics
    this.updateAggregateMetrics(queryMetrics);

    // Track slow queries
    if (executionTime > this.SLOW_QUERY_THRESHOLD) {
      this.recordSlowQuery(queryMetrics);
    }

    // Update query type stats
    if (!this.metrics.queries[tracker.queryType]) {
      this.metrics.queries[tracker.queryType] = {
        count: 0,
        totalTime: 0,
        avgTime: 0,
        minTime: Infinity,
        maxTime: 0
      };
    }

    const queryStats = this.metrics.queries[tracker.queryType];
    queryStats.count++;
    queryStats.totalTime += executionTime;
    queryStats.avgTime = queryStats.totalTime / queryStats.count;
    queryStats.minTime = Math.min(queryStats.minTime, executionTime);
    queryStats.maxTime = Math.max(queryStats.maxTime, executionTime);

    return queryMetrics;
  }

  /**
   * Record query error
   * @param {Object} tracker - Query tracker object
   * @param {Error} error - Error object
   */
  recordError(tracker, error) {
    const errorRecord = {
      queryId: tracker.queryId,
      queryType: tracker.queryType,
      params: tracker.params,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      },
      timestamp: new Date().toISOString()
    };

    this.metrics.errors.unshift(errorRecord);

    // Keep only last N errors
    if (this.metrics.errors.length > this.MAX_STORED_ERRORS) {
      this.metrics.errors = this.metrics.errors.slice(0, this.MAX_STORED_ERRORS);
    }
  }

  /**
   * Update aggregate performance metrics
   * @private
   */
  updateAggregateMetrics(queryMetrics) {
    const perf = this.metrics.performance;

    perf.totalQueries++;

    // Running average calculation
    perf.avgExecutionTime =
      (perf.avgExecutionTime * (perf.totalQueries - 1) + queryMetrics.executionTime) /
      perf.totalQueries;
  }

  /**
   * Record slow query
   * @private
   */
  recordSlowQuery(queryMetrics) {
    this.metrics.performance.slowQueries.unshift({
      ...queryMetrics,
      severity: this.getSlowQuerySeverity(queryMetrics.executionTime)
    });

    // Keep only last N slow queries
    if (this.metrics.performance.slowQueries.length > this.MAX_SLOW_QUERIES) {
      this.metrics.performance.slowQueries =
        this.metrics.performance.slowQueries.slice(0, this.MAX_SLOW_QUERIES);
    }
  }

  /**
   * Determine slow query severity
   * @private
   */
  getSlowQuerySeverity(executionTime) {
    if (executionTime > 5000) return 'critical'; // >5s
    if (executionTime > 3000) return 'high';     // >3s
    if (executionTime > 2000) return 'medium';   // >2s
    return 'low';                                 // >1s
  }

  /**
   * Sanitize query parameters (remove sensitive data)
   * @private
   */
  sanitizeParams(params) {
    const sanitized = { ...params };

    // Remove potentially sensitive fields
    delete sanitized.userId;
    delete sanitized.email;
    delete sanitized.token;

    return sanitized;
  }

  /**
   * Get current metrics snapshot
   * @returns {Object} Current metrics
   */
  getMetrics() {
    return {
      queries: { ...this.metrics.queries },
      performance: {
        ...this.metrics.performance,
        slowQueries: this.metrics.performance.slowQueries.slice(0, 10) // Top 10
      },
      errors: this.metrics.errors.slice(0, 10), // Most recent 10
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get metrics for specific query type
   * @param {string} queryType - Query type
   * @returns {Object|null} Query type metrics
   */
  getQueryTypeMetrics(queryType) {
    return this.metrics.queries[queryType] || null;
  }

  /**
   * Get slow queries
   * @param {string} severity - Filter by severity (optional)
   * @returns {Array} Slow queries
   */
  getSlowQueries(severity = null) {
    if (!severity) {
      return this.metrics.performance.slowQueries;
    }

    return this.metrics.performance.slowQueries.filter(q => q.severity === severity);
  }

  /**
   * Get recent errors
   * @param {number} limit - Max errors to return
   * @returns {Array} Recent errors
   */
  getRecentErrors(limit = 10) {
    return this.metrics.errors.slice(0, limit);
  }

  /**
   * Reset metrics
   */
  reset() {
    this.metrics = {
      queries: {},
      errors: [],
      performance: {
        totalQueries: 0,
        avgExecutionTime: 0,
        slowQueries: []
      }
    };
  }

  /**
   * Generate performance report
   * @returns {Object} Performance report
   */
  generateReport() {
    const report = {
      summary: {
        totalQueries: this.metrics.performance.totalQueries,
        avgExecutionTime: Math.round(this.metrics.performance.avgExecutionTime),
        slowQueriesCount: this.metrics.performance.slowQueries.length,
        errorsCount: this.metrics.errors.length
      },
      queryTypes: [],
      slowestQueries: [],
      recentErrors: [],
      recommendations: []
    };

    // Query type breakdown
    for (const [type, stats] of Object.entries(this.metrics.queries)) {
      report.queryTypes.push({
        type,
        count: stats.count,
        avgTime: Math.round(stats.avgTime),
        minTime: Math.round(stats.minTime),
        maxTime: Math.round(stats.maxTime)
      });
    }

    // Sort by count (most frequent first)
    report.queryTypes.sort((a, b) => b.count - a.count);

    // Top 5 slowest queries
    report.slowestQueries = this.metrics.performance.slowQueries
      .slice(0, 5)
      .map(q => ({
        queryType: q.queryType,
        executionTime: q.executionTime,
        timestamp: q.timestamp,
        severity: q.severity
      }));

    // Recent errors
    report.recentErrors = this.metrics.errors
      .slice(0, 5)
      .map(e => ({
        queryType: e.queryType,
        error: e.error.message,
        timestamp: e.timestamp
      }));

    // Generate recommendations
    report.recommendations = this.generateRecommendations();

    return report;
  }

  /**
   * Generate optimization recommendations
   * @private
   * @returns {Array} Recommendations
   */
  generateRecommendations() {
    const recommendations = [];

    // Check average execution time
    if (this.metrics.performance.avgExecutionTime > 500) {
      recommendations.push({
        priority: 'high',
        issue: `Average query execution time is ${Math.round(this.metrics.performance.avgExecutionTime)}ms`,
        recommendation: 'Consider adding Redis caching for frequently accessed metrics'
      });
    }

    // Check slow queries
    const criticalSlowQueries = this.getSlowQueries('critical');
    if (criticalSlowQueries.length > 0) {
      recommendations.push({
        priority: 'critical',
        issue: `${criticalSlowQueries.length} queries exceeded 5 seconds`,
        recommendation: 'Optimize MongoDB aggregation pipelines and add proper indexes'
      });
    }

    // Check for high error rate
    const errorRate = this.metrics.errors.length / Math.max(this.metrics.performance.totalQueries, 1);
    if (errorRate > 0.05) { // >5% error rate
      recommendations.push({
        priority: 'high',
        issue: `High error rate: ${(errorRate * 100).toFixed(2)}%`,
        recommendation: 'Investigate error patterns and add error handling/validation'
      });
    }

    // Check most frequent query types
    const sortedTypes = Object.entries(this.metrics.queries)
      .sort((a, b) => b[1].count - a[1].count);

    if (sortedTypes.length > 0) {
      const [mostFrequent, stats] = sortedTypes[0];

      if (stats.avgTime > 1000) { // >1s average
        recommendations.push({
          priority: 'medium',
          issue: `${mostFrequent} queries average ${Math.round(stats.avgTime)}ms`,
          recommendation: `Add caching or optimize ${mostFrequent} query logic`
        });
      }
    }

    return recommendations;
  }
}

// Singleton instance
let instance = null;

/**
 * Get singleton metrics instance
 * @returns {AnalyticsMetrics} Metrics instance
 */
function getMetricsInstance() {
  if (!instance) {
    instance = new AnalyticsMetrics();
  }
  return instance;
}

module.exports = {
  AnalyticsMetrics,
  getMetricsInstance
};
