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
      system: {
        uptime: Date.now(),
        memoryUsage: [],
        cpuUsage: []
      },
      rateLimiting: {
        requestsBlocked: 0,
        requestsAllowed: 0,
        ipBlacklist: new Set()
      }
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
      console.warn(`⚠️ Webhook ${requestId} failed: ${error}`);
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

    return {
      webhooks: {
        total: this.metrics.webhooks.total,
        successful: this.metrics.webhooks.successful,
        failed: this.metrics.webhooks.failed,
        successRate:
          this.metrics.webhooks.total > 0
            ? ((this.metrics.webhooks.successful / this.metrics.webhooks.total) * 100).toFixed(2)
            : 0,
        avgResponseTime: this.calculateAverage(this.metrics.webhooks.responseTime),
        avgParsingTime: this.calculateAverage(this.metrics.webhooks.parsingTime),
        minResponseTime: Math.min(...this.metrics.webhooks.responseTime) || 0,
        maxResponseTime: Math.max(...this.metrics.webhooks.responseTime) || 0
      },
      trades: {
        total: this.metrics.trades.total,
        successful: this.metrics.trades.successful,
        failed: this.metrics.trades.failed,
        successRate:
          this.metrics.trades.total > 0
            ? ((this.metrics.trades.successful / this.metrics.trades.total) * 100).toFixed(2)
            : 0,
        avgExecutionTime: this.calculateAverage(this.metrics.trades.executionTime)
      },
      system: {
        uptime: Math.floor(uptime / 1000), // in seconds
        uptimeFormatted: this.formatUptime(uptime),
        memoryUsage: this.getCurrentMemoryUsage(),
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
      }
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
    // Monitor memory usage every 30 seconds
    setInterval(() => {
      const memUsage = this.getCurrentMemoryUsage();
      this.metrics.system.memoryUsage.push({
        timestamp: Date.now(),
        ...memUsage
      });

      // Keep only last 100 memory readings (50 minutes)
      if (this.metrics.system.memoryUsage.length > 100) {
        this.metrics.system.memoryUsage.shift();
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
      system: {
        uptime: Date.now(),
        memoryUsage: [],
        cpuUsage: []
      },
      rateLimiting: {
        requestsBlocked: 0,
        requestsAllowed: 0,
        ipBlacklist: new Set()
      }
    };
    this.activeRequests.clear();
  }
}

// Export singleton instance
module.exports = new PerformanceTracker();
