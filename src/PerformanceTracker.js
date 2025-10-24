const logger = require('./utils/logger');

class PerformanceTracker {
  constructor() {
    this.metrics = {
      webhooks: {
        total: 0,
        successful: 0,
        failed: 0,
        responseTime: [],
        parsingTime: []
      },
      trades: {
        total: 0,
        successful: 0,
        failed: 0,
        executionTime: []
      },
      database: {
        queries: 0,
        successful: 0,
        failed: 0,
        queryTime: []
      },
      api: {
        calls: 0,
        successful: 0,
        failed: 0,
        responseTime: []
      },
      mfa: {
        verifications: 0,
        successful: 0,
        failed: 0,
        verificationTime: []
      },
      system: {
        uptime: Date.now(),
        memoryUsage: [],
        cpuUsage: []
      },
      rateLimiting: {
        requestsBlocked: 0,
        requestsAllowed: 0,
        ipBlacklist: new Set()
      },
      custom: new Map()
    };

    this.activeRequests = new Map();
    this.startSystemMonitoring();
  }

  /**
   * Start tracking a webhook request
   * @param {string} requestId - Unique request identifier
   * @param {string} source - Source of the webhook (e.g., 'tradingview')
   * @returns {Object} - Timer object
   */
  startWebhookTimer(requestId, source = 'unknown') {
    const timer = {
      requestId,
      source,
      startTime: process.hrtime.bigint(),
      parseStartTime: null,
      parseEndTime: null
    };

    this.activeRequests.set(requestId, timer);
    return timer;
  }

  /**
   * Mark the start of signal parsing
   * @param {string} requestId - Request identifier
   */
  startParsing(requestId) {
    const timer = this.activeRequests.get(requestId);
    if (timer) {
      timer.parseStartTime = process.hrtime.bigint();
    }
  }

  /**
   * Mark the end of signal parsing
   * @param {string} requestId - Request identifier
   */
  endParsing(requestId) {
    const timer = this.activeRequests.get(requestId);
    if (timer && timer.parseStartTime) {
      timer.parseEndTime = process.hrtime.bigint();

      const parseTime = Number(timer.parseEndTime - timer.parseStartTime) / 1000000; // Convert to milliseconds
      this.metrics.webhooks.parsingTime.push(parseTime);

      // Keep only last 100 parsing times
      if (this.metrics.webhooks.parsingTime.length > 100) {
        this.metrics.webhooks.parsingTime.shift();
      }
    }
  }

  /**
   * End webhook tracking and record metrics
   * @param {string} requestId - Request identifier
   * @param {boolean} success - Whether the webhook was successful
   * @param {string} error - Error message if failed
   */
  endWebhookTimer(requestId, success = true, error = null) {
    const timer = this.activeRequests.get(requestId);
    if (!timer) return;

    const endTime = process.hrtime.bigint();
    const responseTime = Number(endTime - timer.startTime) / 1000000; // Convert to milliseconds

    // Record metrics
    this.metrics.webhooks.total++;
    this.metrics.webhooks.responseTime.push(responseTime);

    if (success) {
      this.metrics.webhooks.successful++;
    } else {
      this.metrics.webhooks.failed++;
      logger.warn('[PerformanceTracker] Webhook failed', {
        requestId,
        error: error?.message || error,
        responseTime
      });
    }

    // Keep only last 100 response times
    if (this.metrics.webhooks.responseTime.length > 100) {
      this.metrics.webhooks.responseTime.shift();
    }

    this.activeRequests.delete(requestId);
  }

  /**
   * Track trade execution
   * @param {number} executionTime - Execution time in milliseconds
   * @param {boolean} success - Whether trade was successful
   */
  recordTrade(executionTime, success = true) {
    this.metrics.trades.total++;
    this.metrics.trades.executionTime.push(executionTime);

    if (success) {
      this.metrics.trades.successful++;
    } else {
      this.metrics.trades.failed++;
    }

    // Keep only last 100 execution times
    if (this.metrics.trades.executionTime.length > 100) {
      this.metrics.trades.executionTime.shift();
    }
  }

  /**
   * Record database query
   * @param {number} queryTime - Query execution time in milliseconds
   * @param {boolean} success - Whether query was successful
   */
  recordDatabaseQuery(queryTime, success = true) {
    this.metrics.database.queries++;
    this.metrics.database.queryTime.push(queryTime);

    if (success) {
      this.metrics.database.successful++;
    } else {
      this.metrics.database.failed++;
    }

    // Keep only last 100 query times
    if (this.metrics.database.queryTime.length > 100) {
      this.metrics.database.queryTime.shift();
    }
  }

  /**
   * Record API call (exchange, provider, external service)
   * @param {number} responseTime - API response time in milliseconds
   * @param {boolean} success - Whether call was successful
   */
  recordAPICall(responseTime, success = true) {
    this.metrics.api.calls++;
    this.metrics.api.responseTime.push(responseTime);

    if (success) {
      this.metrics.api.successful++;
    } else {
      this.metrics.api.failed++;
    }

    // Keep only last 100 response times
    if (this.metrics.api.responseTime.length > 100) {
      this.metrics.api.responseTime.shift();
    }
  }

  /**
   * Record MFA verification
   * @param {number} verificationTime - Verification time in milliseconds
   * @param {boolean} success - Whether verification was successful
   */
  recordMFAVerification(verificationTime, success = true) {
    this.metrics.mfa.verifications++;
    this.metrics.mfa.verificationTime.push(verificationTime);

    if (success) {
      this.metrics.mfa.successful++;
    } else {
      this.metrics.mfa.failed++;
    }

    // Keep only last 100 verification times
    if (this.metrics.mfa.verificationTime.length > 100) {
      this.metrics.mfa.verificationTime.shift();
    }
  }

  /**
   * Record custom metric
   * @param {string} name - Metric name
   * @param {number} value - Metric value
   */
  recordCustomMetric(name, value) {
    if (!this.metrics.custom.has(name)) {
      this.metrics.custom.set(name, []);
    }

    const values = this.metrics.custom.get(name);
    values.push(value);

    // Keep only last 100 values
    if (values.length > 100) {
      values.shift();
    }
  }

  /**
   * Record rate limiting action
   * @param {string} action - 'allowed' or 'blocked'
   * @param {string} ip - IP address
   */
  recordRateLimit(action, ip = null) {
    if (action === 'allowed') {
      this.metrics.rateLimiting.requestsAllowed++;
    } else if (action === 'blocked') {
      this.metrics.rateLimiting.requestsBlocked++;
      if (ip) {
        this.metrics.rateLimiting.ipBlacklist.add(ip);
      }
    }
  }

  /**
   * Get current performance metrics
   * @returns {Object} - Current metrics
   */
  getMetrics() {
    const now = Date.now();
    const uptime = now - this.metrics.system.uptime;

    // Calculate CPU averages
    const cpuUser = this.metrics.system.cpuUsage.map(c => c.user);
    const cpuSystem = this.metrics.system.cpuUsage.map(c => c.system);

    // Build custom metrics object
    const customMetrics = {};
    this.metrics.custom.forEach((values, name) => {
      customMetrics[name] = {
        avg: this.calculateAverage(values),
        ...this.getPercentileMetrics(values),
        min: Math.min(...values) || 0,
        max: Math.max(...values) || 0
      };
    });

    return {
      webhooks: {
        total: this.metrics.webhooks.total,
        successful: this.metrics.webhooks.successful,
        failed: this.metrics.webhooks.failed,
        successRate:
          this.metrics.webhooks.total > 0
            ? ((this.metrics.webhooks.successful / this.metrics.webhooks.total) * 100).toFixed(2)
            : 0,
        responseTime: {
          avg: this.calculateAverage(this.metrics.webhooks.responseTime),
          ...this.getPercentileMetrics(this.metrics.webhooks.responseTime),
          min: Math.min(...this.metrics.webhooks.responseTime) || 0,
          max: Math.max(...this.metrics.webhooks.responseTime) || 0
        },
        parsingTime: {
          avg: this.calculateAverage(this.metrics.webhooks.parsingTime),
          ...this.getPercentileMetrics(this.metrics.webhooks.parsingTime)
        }
      },
      trades: {
        total: this.metrics.trades.total,
        successful: this.metrics.trades.successful,
        failed: this.metrics.trades.failed,
        successRate:
          this.metrics.trades.total > 0
            ? ((this.metrics.trades.successful / this.metrics.trades.total) * 100).toFixed(2)
            : 0,
        executionTime: {
          avg: this.calculateAverage(this.metrics.trades.executionTime),
          ...this.getPercentileMetrics(this.metrics.trades.executionTime),
          min: Math.min(...this.metrics.trades.executionTime) || 0,
          max: Math.max(...this.metrics.trades.executionTime) || 0
        }
      },
      database: {
        queries: this.metrics.database.queries,
        successful: this.metrics.database.successful,
        failed: this.metrics.database.failed,
        successRate:
          this.metrics.database.queries > 0
            ? ((this.metrics.database.successful / this.metrics.database.queries) * 100).toFixed(2)
            : 0,
        queryTime: {
          avg: this.calculateAverage(this.metrics.database.queryTime),
          ...this.getPercentileMetrics(this.metrics.database.queryTime),
          min: Math.min(...this.metrics.database.queryTime) || 0,
          max: Math.max(...this.metrics.database.queryTime) || 0
        }
      },
      api: {
        calls: this.metrics.api.calls,
        successful: this.metrics.api.successful,
        failed: this.metrics.api.failed,
        successRate:
          this.metrics.api.calls > 0
            ? ((this.metrics.api.successful / this.metrics.api.calls) * 100).toFixed(2)
            : 0,
        responseTime: {
          avg: this.calculateAverage(this.metrics.api.responseTime),
          ...this.getPercentileMetrics(this.metrics.api.responseTime),
          min: Math.min(...this.metrics.api.responseTime) || 0,
          max: Math.max(...this.metrics.api.responseTime) || 0
        }
      },
      mfa: {
        verifications: this.metrics.mfa.verifications,
        successful: this.metrics.mfa.successful,
        failed: this.metrics.mfa.failed,
        successRate:
          this.metrics.mfa.verifications > 0
            ? ((this.metrics.mfa.successful / this.metrics.mfa.verifications) * 100).toFixed(2)
            : 0,
        verificationTime: {
          avg: this.calculateAverage(this.metrics.mfa.verificationTime),
          ...this.getPercentileMetrics(this.metrics.mfa.verificationTime),
          min: Math.min(...this.metrics.mfa.verificationTime) || 0,
          max: Math.max(...this.metrics.mfa.verificationTime) || 0
        }
      },
      system: {
        uptime: Math.floor(uptime / 1000),
        uptimeFormatted: this.formatUptime(uptime),
        memoryUsage: this.getCurrentMemoryUsage(),
        cpuUsage: {
          user: {
            avg: this.calculateAverage(cpuUser),
            current: cpuUser[cpuUser.length - 1] || 0
          },
          system: {
            avg: this.calculateAverage(cpuSystem),
            current: cpuSystem[cpuSystem.length - 1] || 0
          }
        },
        activeRequests: this.activeRequests.size
      },
      rateLimiting: {
        requestsAllowed: this.metrics.rateLimiting.requestsAllowed,
        requestsBlocked: this.metrics.rateLimiting.requestsBlocked,
        blockRate:
          this.metrics.rateLimiting.requestsAllowed + this.metrics.rateLimiting.requestsBlocked > 0
            ? (
                (this.metrics.rateLimiting.requestsBlocked /
                  (this.metrics.rateLimiting.requestsAllowed + this.metrics.rateLimiting.requestsBlocked)) *
                100
              ).toFixed(2)
            : 0,
        uniqueBlockedIPs: this.metrics.rateLimiting.ipBlacklist.size
      },
      custom: customMetrics
    };
  }

  /**
   * Get health status
   * @returns {Object} - Health status
   */
  getHealthStatus() {
    const metrics = this.getMetrics();
    const health = {
      status: 'healthy',
      checks: {
        webhooks: this.checkWebhookHealth(metrics.webhooks),
        trades: this.checkTradeHealth(metrics.trades),
        system: this.checkSystemHealth(metrics.system),
        rateLimiting: this.checkRateLimitingHealth(metrics.rateLimiting)
      },
      timestamp: new Date().toISOString()
    };

    // Determine overall status
    const statuses = Object.values(health.checks).map(check => check.status);
    if (statuses.includes('critical')) {
      health.status = 'critical';
    } else if (statuses.includes('warning')) {
      health.status = 'warning';
    }

    return health;
  }

  /**
   * Check webhook health
   * @private
   */
  checkWebhookHealth(webhookMetrics) {
    if (webhookMetrics.total === 0) {
      return { status: 'healthy', message: 'No webhook activity yet' };
    }

    if (webhookMetrics.successRate < 90) {
      return { status: 'critical', message: `Low webhook success rate: ${webhookMetrics.successRate}%` };
    }

    if (webhookMetrics.avgResponseTime > 5000) {
      return { status: 'warning', message: `High average response time: ${webhookMetrics.avgResponseTime}ms` };
    }

    return { status: 'healthy', message: 'Webhooks operating normally' };
  }

  /**
   * Check trade health
   * @private
   */
  checkTradeHealth(tradeMetrics) {
    if (tradeMetrics.total === 0) {
      return { status: 'healthy', message: 'No trade activity yet' };
    }

    if (tradeMetrics.successRate < 80) {
      return { status: 'critical', message: `Low trade success rate: ${tradeMetrics.successRate}%` };
    }

    return { status: 'healthy', message: 'Trades executing normally' };
  }

  /**
   * Check system health
   * @private
   */
  checkSystemHealth(systemMetrics) {
    if (systemMetrics.memoryUsage.rss > 1024 * 1024 * 1024) {
      // 1GB
      return { status: 'warning', message: 'High memory usage detected' };
    }

    if (systemMetrics.activeRequests > 100) {
      return { status: 'warning', message: 'High number of active requests' };
    }

    return { status: 'healthy', message: 'System resources normal' };
  }

  /**
   * Check rate limiting health
   * @private
   */
  checkRateLimitingHealth(rateLimitingMetrics) {
    if (rateLimitingMetrics.blockRate > 50) {
      return { status: 'warning', message: `High block rate: ${rateLimitingMetrics.blockRate}%` };
    }

    return { status: 'healthy', message: 'Rate limiting operating normally' };
  }

  /**
   * Calculate average of an array
   * @private
   */
  calculateAverage(arr) {
    if (arr.length === 0) return 0;
    return (arr.reduce((sum, val) => sum + val, 0) / arr.length).toFixed(2);
  }

  /**
   * Calculate percentile from array of numbers
   * @private
   */
  calculatePercentile(arr, percentile) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index].toFixed(2);
  }

  /**
   * Calculate percentile metrics for a dataset
   * @private
   */
  getPercentileMetrics(arr) {
    if (arr.length === 0) {
      return { p50: 0, p95: 0, p99: 0 };
    }
    return {
      p50: this.calculatePercentile(arr, 50),
      p95: this.calculatePercentile(arr, 95),
      p99: this.calculatePercentile(arr, 99)
    };
  }

  /**
   * Get current memory usage
   * @private
   */
  getCurrentMemoryUsage() {
    return process.memoryUsage();
  }

  /**
   * Format uptime in human readable format
   * @private
   */
  formatUptime(uptime) {
    const seconds = Math.floor(uptime / 1000) % 60;
    const minutes = Math.floor(uptime / (1000 * 60)) % 60;
    const hours = Math.floor(uptime / (1000 * 60 * 60)) % 24;
    const days = Math.floor(uptime / (1000 * 60 * 60 * 24));

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m ${seconds}s`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Start system monitoring (memory, CPU, etc.)
   * @private
   */
  startSystemMonitoring() {
    // Track initial CPU usage for delta calculation
    this.lastCPUUsage = process.cpuUsage();
    this.lastCPUCheck = Date.now();

    // Monitor memory and CPU usage every 30 seconds
    setInterval(() => {
      // Memory usage
      const memUsage = this.getCurrentMemoryUsage();
      this.metrics.system.memoryUsage.push({
        timestamp: Date.now(),
        ...memUsage
      });

      // CPU usage
      const currentCPU = process.cpuUsage(this.lastCPUUsage);
      const timeElapsed = Date.now() - this.lastCPUCheck;

      // Calculate CPU percentage
      const cpuPercent = {
        user: (currentCPU.user / (timeElapsed * 1000)) * 100,
        system: (currentCPU.system / (timeElapsed * 1000)) * 100,
        timestamp: Date.now()
      };

      this.metrics.system.cpuUsage.push(cpuPercent);
      this.lastCPUUsage = process.cpuUsage();
      this.lastCPUCheck = Date.now();

      // Keep only last 100 readings (50 minutes)
      if (this.metrics.system.memoryUsage.length > 100) {
        this.metrics.system.memoryUsage.shift();
      }
      if (this.metrics.system.cpuUsage.length > 100) {
        this.metrics.system.cpuUsage.shift();
      }
    }, 30000);
  }

  /**
   * Generate a unique request ID
   * @returns {string} - Unique request ID
   */
  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Reset all metrics (useful for testing)
   */
  reset() {
    this.metrics = {
      webhooks: {
        total: 0,
        successful: 0,
        failed: 0,
        responseTime: [],
        parsingTime: []
      },
      trades: {
        total: 0,
        successful: 0,
        failed: 0,
        executionTime: []
      },
      database: {
        queries: 0,
        successful: 0,
        failed: 0,
        queryTime: []
      },
      api: {
        calls: 0,
        successful: 0,
        failed: 0,
        responseTime: []
      },
      mfa: {
        verifications: 0,
        successful: 0,
        failed: 0,
        verificationTime: []
      },
      system: {
        uptime: Date.now(),
        memoryUsage: [],
        cpuUsage: []
      },
      rateLimiting: {
        requestsBlocked: 0,
        requestsAllowed: 0,
        ipBlacklist: new Set()
      },
      custom: new Map()
    };
    this.activeRequests.clear();
  }
}

// Export singleton instance
module.exports = new PerformanceTracker();
