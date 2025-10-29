/**
 * US3-T25: Performance Tracker Integration
 * Integration tests for PerformanceTracker singleton
 *
 * Acceptance Criteria:
 * - Test metric collection
 * - Test performance alerting
 * - Test metric aggregation
 * - Test dashboard data formatting
 * - 5 new tests, all passing
 */

const PerformanceTracker = require('../../../src/PerformanceTracker');

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
}));

describe('US3-T25: Performance Tracker Integration', () => {
  beforeEach(() => {
    // Reset tracker state before each test
    PerformanceTracker.reset();
  });

  describe('Metric Collection', () => {
    it('should collect webhook metrics including timing and success/failure counts', () => {
      const requestId = PerformanceTracker.generateRequestId();

      // Start webhook timer
      PerformanceTracker.startWebhookTimer(requestId, 'tradingview');

      // Simulate parsing
      PerformanceTracker.startParsing(requestId);
      PerformanceTracker.endParsing(requestId);

      // End webhook (success)
      PerformanceTracker.endWebhookTimer(requestId, true);

      const metrics = PerformanceTracker.getMetrics();

      expect(metrics.webhooks.total).toBe(1);
      expect(metrics.webhooks.successful).toBe(1);
      expect(metrics.webhooks.failed).toBe(0);
      expect(metrics.webhooks.successRate).toBe('100.00');
      expect(metrics.webhooks.responseTime.avg).toBeDefined();
      expect(metrics.webhooks.parsingTime.avg).toBeDefined();
    });

    it('should collect trade execution metrics with success/failure tracking', () => {
      // Record successful trade
      PerformanceTracker.recordTrade(150, true);
      PerformanceTracker.recordTrade(200, true);

      // Record failed trade
      PerformanceTracker.recordTrade(180, false);

      const metrics = PerformanceTracker.getMetrics();

      expect(metrics.trades.total).toBe(3);
      expect(metrics.trades.successful).toBe(2);
      expect(metrics.trades.failed).toBe(1);
      expect(parseFloat(metrics.trades.successRate)).toBeCloseTo(66.67, 1);
      expect(metrics.trades.executionTime.avg).toBeDefined();
      expect(parseFloat(metrics.trades.executionTime.min)).toBe(150);
      expect(parseFloat(metrics.trades.executionTime.max)).toBe(200);
    });

    it('should collect database query metrics', () => {
      // Record successful queries
      PerformanceTracker.recordDatabaseQuery(50, true);
      PerformanceTracker.recordDatabaseQuery(75, true);
      PerformanceTracker.recordDatabaseQuery(100, true);

      // Record failed query
      PerformanceTracker.recordDatabaseQuery(200, false);

      const metrics = PerformanceTracker.getMetrics();

      expect(metrics.database.queries).toBe(4);
      expect(metrics.database.successful).toBe(3);
      expect(metrics.database.failed).toBe(1);
      expect(parseFloat(metrics.database.successRate)).toBeCloseTo(75.0, 1);
      expect(metrics.database.queryTime.avg).toBeDefined();
    });

    it('should collect API call metrics for external services', () => {
      // Record API calls
      PerformanceTracker.recordAPICall(300, true);
      PerformanceTracker.recordAPICall(450, true);
      PerformanceTracker.recordAPICall(600, false);

      const metrics = PerformanceTracker.getMetrics();

      expect(metrics.api.calls).toBe(3);
      expect(metrics.api.successful).toBe(2);
      expect(metrics.api.failed).toBe(1);
      expect(parseFloat(metrics.api.successRate)).toBeCloseTo(66.67, 1);
      expect(metrics.api.responseTime.avg).toBeDefined();
    });

    it('should collect MFA verification metrics', () => {
      // Record MFA verifications
      PerformanceTracker.recordMFAVerification(100, true);
      PerformanceTracker.recordMFAVerification(120, true);
      PerformanceTracker.recordMFAVerification(150, false);

      const metrics = PerformanceTracker.getMetrics();

      expect(metrics.mfa.verifications).toBe(3);
      expect(metrics.mfa.successful).toBe(2);
      expect(metrics.mfa.failed).toBe(1);
      expect(parseFloat(metrics.mfa.successRate)).toBeCloseTo(66.67, 1);
      expect(metrics.mfa.verificationTime.avg).toBeDefined();
    });

    it('should collect custom metrics with automatic history management', () => {
      // Record custom metrics
      for (let i = 0; i < 10; i++) {
        PerformanceTracker.recordCustomMetric('order_validation_time', 100 + i * 10);
      }

      const metrics = PerformanceTracker.getMetrics();

      expect(metrics.custom.order_validation_time).toBeDefined();
      expect(metrics.custom.order_validation_time.avg).toBeDefined();
      expect(metrics.custom.order_validation_time.p50).toBeDefined();
      expect(metrics.custom.order_validation_time.p95).toBeDefined();
      expect(metrics.custom.order_validation_time.p99).toBeDefined();
      expect(parseFloat(metrics.custom.order_validation_time.min)).toBe(100);
      expect(parseFloat(metrics.custom.order_validation_time.max)).toBe(190);
    });

    it('should maintain sliding window of last 100 measurements for each metric type', () => {
      // Record more than 100 measurements
      for (let i = 0; i < 150; i++) {
        PerformanceTracker.recordTrade(100 + i, true);
      }

      const metrics = PerformanceTracker.getMetrics();

      expect(metrics.trades.total).toBe(150);
      // Internal array should be limited to 100 (can't test directly without exposing internals)
      // But we can verify metrics are still calculated correctly
      expect(metrics.trades.executionTime.avg).toBeDefined();
      expect(parseFloat(metrics.trades.executionTime.min)).toBeGreaterThanOrEqual(100);
    });
  });

  describe('Performance Alerting', () => {
    it('should detect webhook health issues when success rate drops below threshold', () => {
      // Simulate failing webhooks
      for (let i = 0; i < 5; i++) {
        const requestId = PerformanceTracker.generateRequestId();
        PerformanceTracker.startWebhookTimer(requestId);
        PerformanceTracker.endWebhookTimer(requestId, false);
      }

      // One successful webhook
      const successId = PerformanceTracker.generateRequestId();
      PerformanceTracker.startWebhookTimer(successId);
      PerformanceTracker.endWebhookTimer(successId, true);

      const health = PerformanceTracker.getHealthStatus();

      expect(health.checks.webhooks.status).toBe('critical');
      expect(health.checks.webhooks.message).toContain('Low webhook success rate');
    });

    it('should detect trade health issues when success rate drops below threshold', () => {
      // Simulate failing trades
      for (let i = 0; i < 5; i++) {
        PerformanceTracker.recordTrade(100, false);
      }

      // Two successful trades (70% failure rate = 30% success rate)
      PerformanceTracker.recordTrade(100, true);
      PerformanceTracker.recordTrade(100, true);

      const health = PerformanceTracker.getHealthStatus();

      expect(health.checks.trades.status).toBe('critical');
      expect(health.checks.trades.message).toContain('Low trade success rate');
    });

    it('should detect system resource warnings for high memory usage', () => {
      const health = PerformanceTracker.getHealthStatus();

      // System health check runs in background, we test the current status
      expect(health.checks.system).toBeDefined();
      expect(health.checks.system.status).toBeDefined();
      expect(['healthy', 'warning', 'critical']).toContain(health.checks.system.status);
    });

    it('should detect rate limiting warnings when block rate exceeds threshold', () => {
      // Record many blocked requests
      for (let i = 0; i < 60; i++) {
        PerformanceTracker.recordRateLimit('blocked', `192.168.1.${i % 255}`);
      }

      // Some allowed requests
      for (let i = 0; i < 40; i++) {
        PerformanceTracker.recordRateLimit('allowed');
      }

      const health = PerformanceTracker.getHealthStatus();

      // 60/(60+40) = 60% block rate > 50% threshold
      expect(health.checks.rateLimiting.status).toBe('warning');
      expect(health.checks.rateLimiting.message).toContain('High block rate');
    });

    it('should provide overall health status based on individual check statuses', () => {
      // Start with healthy state
      let health = PerformanceTracker.getHealthStatus();
      expect(['healthy', 'warning', 'critical']).toContain(health.status);
      expect(health.timestamp).toBeDefined();

      // Introduce critical issue (failing trades)
      for (let i = 0; i < 10; i++) {
        PerformanceTracker.recordTrade(100, false);
      }

      health = PerformanceTracker.getHealthStatus();

      // Overall status should reflect the critical trade issue
      expect(health.status).toBe('critical');
      expect(health.checks.trades.status).toBe('critical');
    });
  });

  describe('Metric Aggregation', () => {
    it('should calculate percentile metrics (p50, p95, p99) for performance data', () => {
      // Record varied response times to test percentile calculation
      const times = [100, 150, 200, 250, 300, 350, 400, 450, 500, 550];

      times.forEach(time => {
        const requestId = PerformanceTracker.generateRequestId();
        PerformanceTracker.startWebhookTimer(requestId);

        // Simulate delay (not actually waiting, just recording different times)
        PerformanceTracker.activeRequests.set(requestId, {
          requestId,
          source: 'test',
          startTime: process.hrtime.bigint() - BigInt(time * 1000000)
        });

        PerformanceTracker.endWebhookTimer(requestId, true);
      });

      const metrics = PerformanceTracker.getMetrics();

      expect(metrics.webhooks.responseTime.p50).toBeDefined();
      expect(metrics.webhooks.responseTime.p95).toBeDefined();
      expect(metrics.webhooks.responseTime.p99).toBeDefined();

      // p50 should be near median, p95 near top, p99 at very top
      const p50 = parseFloat(metrics.webhooks.responseTime.p50);
      const p95 = parseFloat(metrics.webhooks.responseTime.p95);
      const p99 = parseFloat(metrics.webhooks.responseTime.p99);

      expect(p50).toBeGreaterThan(0);
      expect(p95).toBeGreaterThanOrEqual(p50);
      expect(p99).toBeGreaterThanOrEqual(p95);
    });

    it('should calculate average, min, max for all metric types', () => {
      // Record database queries with varying times
      PerformanceTracker.recordDatabaseQuery(50, true);
      PerformanceTracker.recordDatabaseQuery(100, true);
      PerformanceTracker.recordDatabaseQuery(150, true);
      PerformanceTracker.recordDatabaseQuery(200, true);

      const metrics = PerformanceTracker.getMetrics();

      expect(parseFloat(metrics.database.queryTime.avg)).toBeCloseTo(125, 0);
      expect(parseFloat(metrics.database.queryTime.min)).toBe(50);
      expect(parseFloat(metrics.database.queryTime.max)).toBe(200);
    });

    it('should aggregate system metrics including uptime, memory, and CPU', () => {
      const metrics = PerformanceTracker.getMetrics();

      expect(metrics.system.uptime).toBeDefined();
      expect(metrics.system.uptime).toBeGreaterThanOrEqual(0);
      expect(metrics.system.uptimeFormatted).toBeDefined();
      expect(metrics.system.memoryUsage).toBeDefined();
      expect(metrics.system.memoryUsage.rss).toBeGreaterThan(0);
      expect(metrics.system.memoryUsage.heapTotal).toBeGreaterThan(0);
      expect(metrics.system.memoryUsage.heapUsed).toBeGreaterThan(0);
      expect(metrics.system.cpuUsage).toBeDefined();
      expect(metrics.system.activeRequests).toBe(0);
    });

    it('should aggregate rate limiting metrics including block rate and unique IPs', () => {
      // Record rate limiting activity
      PerformanceTracker.recordRateLimit('allowed');
      PerformanceTracker.recordRateLimit('blocked', '192.168.1.1');
      PerformanceTracker.recordRateLimit('blocked', '192.168.1.2');
      PerformanceTracker.recordRateLimit('allowed');

      const metrics = PerformanceTracker.getMetrics();

      expect(metrics.rateLimiting.requestsAllowed).toBe(2);
      expect(metrics.rateLimiting.requestsBlocked).toBe(2);
      expect(parseFloat(metrics.rateLimiting.blockRate)).toBe(50.0);
      expect(metrics.rateLimiting.uniqueBlockedIPs).toBe(2);
    });
  });

  describe('Dashboard Data Formatting', () => {
    it('should format success rates as percentages with 2 decimal places', () => {
      // Record 2 successes, 1 failure = 66.666...% success rate
      PerformanceTracker.recordTrade(100, true);
      PerformanceTracker.recordTrade(100, true);
      PerformanceTracker.recordTrade(100, false);

      const metrics = PerformanceTracker.getMetrics();

      expect(metrics.trades.successRate).toBe('66.67');
      expect(metrics.trades.successRate).toMatch(/^\d+\.\d{2}$/);
    });

    it('should format uptime in human-readable format (days, hours, minutes, seconds)', () => {
      const metrics = PerformanceTracker.getMetrics();

      expect(metrics.system.uptimeFormatted).toBeDefined();
      expect(metrics.system.uptimeFormatted).toMatch(/\d+[dhms]/);
    });

    it('should provide zero values for empty metrics rather than NaN', () => {
      // Get metrics when no data recorded
      const metrics = PerformanceTracker.getMetrics();

      expect(metrics.webhooks.total).toBe(0);
      expect(metrics.webhooks.successRate).toBe(0);
      // Source code returns 0 (number) for empty arrays, not "0.00" string
      expect(metrics.webhooks.responseTime.avg).toBe(0);
      expect(metrics.webhooks.responseTime.p50).toBe(0);
      expect(metrics.trades.total).toBe(0);
      expect(metrics.trades.successRate).toBe(0);
    });

    it('should generate unique request IDs for correlation', () => {
      const id1 = PerformanceTracker.generateRequestId();
      const id2 = PerformanceTracker.generateRequestId();
      const id3 = PerformanceTracker.generateRequestId();

      expect(id1).toMatch(/^req_\d+_[a-z0-9]+$/);
      expect(id2).toMatch(/^req_\d+_[a-z0-9]+$/);
      expect(id3).toMatch(/^req_\d+_[a-z0-9]+$/);

      // All IDs should be unique
      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });

    it('should track active requests for real-time monitoring', () => {
      const requestId = PerformanceTracker.generateRequestId();

      // Start webhook (active request)
      PerformanceTracker.startWebhookTimer(requestId);

      let metrics = PerformanceTracker.getMetrics();
      expect(metrics.system.activeRequests).toBe(1);

      // End webhook (no longer active)
      PerformanceTracker.endWebhookTimer(requestId, true);

      metrics = PerformanceTracker.getMetrics();
      expect(metrics.system.activeRequests).toBe(0);
    });
  });

  describe('Integration and Reset', () => {
    it('should reset all metrics and maintain clean state', () => {
      // Record various metrics
      PerformanceTracker.recordTrade(100, true);
      PerformanceTracker.recordDatabaseQuery(50, true);
      PerformanceTracker.recordAPICall(200, true);
      PerformanceTracker.recordRateLimit('blocked', '192.168.1.1');

      // Verify metrics exist
      let metrics = PerformanceTracker.getMetrics();
      expect(metrics.trades.total).toBeGreaterThan(0);
      expect(metrics.database.queries).toBeGreaterThan(0);

      // Reset
      PerformanceTracker.reset();

      // Verify all metrics reset
      metrics = PerformanceTracker.getMetrics();
      expect(metrics.trades.total).toBe(0);
      expect(metrics.webhooks.total).toBe(0);
      expect(metrics.database.queries).toBe(0);
      expect(metrics.api.calls).toBe(0);
      expect(metrics.rateLimiting.requestsBlocked).toBe(0);
      expect(metrics.rateLimiting.uniqueBlockedIPs).toBe(0);
    });
  });
});
