/**
 * Performance Tracking Middleware (US6-T01)
 *
 * Tracks response times for all requests and provides percentile metrics.
 * - Stores p50/p95/p99 in memory (1-hour window)
 * - Exposes /api/metrics/performance endpoint
 * - Alerts if p95 >200ms for 5 minutes
 */

const logger = require('../utils/logger');

// Configuration
const METRICS_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const ALERT_THRESHOLD_MS = 200; // p95 threshold
const ALERT_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const ALERT_CHECK_INTERVAL_MS = 60 * 1000; // Check every minute

class PerformanceTracker {
  constructor() {
    this.responseTimes = [];
    this.detailedMetrics = {};
    this.alertState = {
      degradedSince: null,
      lastAlertTime: null
    };

    // Start periodic cleanup and alert checking
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
    this.alertCheckInterval = setInterval(() => this.checkAlerts(), ALERT_CHECK_INTERVAL_MS);
  }

  /**
   * Express middleware to track response times
   */
  middleware = (req, res, next) => {
    const startTime = Date.now();

    // Capture original end function
    const originalEnd = res.end;

    // Override end to capture response time
    res.end = function (...args) {
      const responseTime = Date.now() - startTime;

      // Record response time with metadata
      const entry = {
        timestamp: Date.now(),
        responseTime,
        endpoint: req.path,
        method: req.method,
        statusCode: res.statusCode
      };

      // Add to global response times
      this.responseTimes.push(entry);

      // Add to detailed metrics by endpoint
      const key = `${req.method}:${req.path}`;
      if (!this.detailedMetrics[key]) {
        this.detailedMetrics[key] = {
          responseTimes: [],
          statusCodes: []
        };
      }

      this.detailedMetrics[key].responseTimes.push(entry);
      this.detailedMetrics[key].statusCodes.push(res.statusCode);

      // Call original end
      return originalEnd.apply(res, args);
    }.bind(this);

    next();
  };

  /**
   * Calculate percentile from sorted array
   */
  calculatePercentile(sortedArray, percentile) {
    if (sortedArray.length === 0) return 0;
    if (sortedArray.length === 1) return sortedArray[0];

    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
  }

  /**
   * Get current metrics (p50, p95, p99, total requests)
   */
  getMetrics() {
    const times = this.responseTimes.map(entry => entry.responseTime);
    const sortedTimes = times.sort((a, b) => a - b);

    return {
      totalRequests: this.responseTimes.length,
      responseTimes: times,
      p50: this.calculatePercentile(sortedTimes, 50),
      p95: this.calculatePercentile(sortedTimes, 95),
      p99: this.calculatePercentile(sortedTimes, 99),
      windowDuration: '1 hour'
    };
  }

  /**
   * Get detailed metrics by endpoint
   */
  getDetailedMetrics() {
    return this.detailedMetrics;
  }

  /**
   * Express route handler for /api/metrics/performance
   */
  metricsEndpoint = (req, res) => {
    const metrics = this.getMetrics();

    res.json({
      success: true,
      data: {
        p50: metrics.p50,
        p95: metrics.p95,
        p99: metrics.p99,
        totalRequests: metrics.totalRequests,
        windowDuration: metrics.windowDuration,
        timestamp: new Date().toISOString()
      }
    });
  };

  /**
   * Clean up old entries outside 1-hour window
   */
  cleanup() {
    const cutoffTime = Date.now() - METRICS_WINDOW_MS;

    // Remove old entries from global response times
    this.responseTimes = this.responseTimes.filter(entry => entry.timestamp > cutoffTime);

    // Remove old entries from detailed metrics
    for (const key in this.detailedMetrics) {
      this.detailedMetrics[key].responseTimes = this.detailedMetrics[key].responseTimes.filter(
        entry => entry.timestamp > cutoffTime
      );

      // Remove empty keys
      if (this.detailedMetrics[key].responseTimes.length === 0) {
        delete this.detailedMetrics[key];
      }
    }
  }

  /**
   * Check if performance alerts should be triggered
   */
  checkAlerts() {
    const metrics = this.getMetrics();

    // Check if p95 exceeds threshold
    if (metrics.p95 > ALERT_THRESHOLD_MS) {
      // Start tracking degradation if not already tracked
      if (!this.alertState.degradedSince) {
        this.alertState.degradedSince = Date.now();
      }

      // Check if degradation has persisted for ALERT_DURATION_MS
      const degradationDuration = Date.now() - this.alertState.degradedSince;

      if (degradationDuration >= ALERT_DURATION_MS) {
        // Only alert once per degradation period (don't spam)
        const timeSinceLastAlert = this.alertState.lastAlertTime
          ? Date.now() - this.alertState.lastAlertTime
          : Infinity;

        if (timeSinceLastAlert > ALERT_DURATION_MS) {
          this.triggerAlert(metrics);
          this.alertState.lastAlertTime = Date.now();
        }
      }
    } else {
      // Performance recovered, reset alert state
      this.alertState.degradedSince = null;
    }
  }

  /**
   * Trigger performance degradation alert
   */
  triggerAlert(metrics) {
    logger.warn('Performance degradation detected', {
      p95: metrics.p95,
      threshold: ALERT_THRESHOLD_MS,
      duration: '5 minutes',
      totalRequests: metrics.totalRequests,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Reset tracker state (for testing)
   */
  reset() {
    this.responseTimes = [];
    this.detailedMetrics = {};
    this.alertState = {
      degradedSince: null,
      lastAlertTime: null
    };
  }

  /**
   * Simulate time passing (for testing expiry)
   */
  simulateTimePass(ms) {
    const cutoffTime = Date.now() - METRICS_WINDOW_MS + ms;

    this.responseTimes = this.responseTimes.filter(entry => entry.timestamp > cutoffTime);

    for (const key in this.detailedMetrics) {
      this.detailedMetrics[key].responseTimes = this.detailedMetrics[key].responseTimes.filter(
        entry => entry.timestamp > cutoffTime
      );

      if (this.detailedMetrics[key].responseTimes.length === 0) {
        delete this.detailedMetrics[key];
      }
    }
  }

  /**
   * Simulate alert check (for testing)
   */
  simulateAlertCheck(duration) {
    // Simulate degradation duration
    if (!this.alertState.degradedSince) {
      const metrics = this.getMetrics();
      if (metrics.p95 > ALERT_THRESHOLD_MS) {
        this.alertState.degradedSince = Date.now() - duration;
        this.checkAlerts();
      }
    } else {
      this.checkAlerts();
    }
  }

  /**
   * Cleanup intervals on shutdown
   */
  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    if (this.alertCheckInterval) {
      clearInterval(this.alertCheckInterval);
    }
  }
}

// Create singleton instance
const performanceTracker = new PerformanceTracker();

// Export tracker with all methods
module.exports = performanceTracker;
