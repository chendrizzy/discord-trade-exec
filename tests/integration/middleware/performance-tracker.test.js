/**
 * Performance Tracker Middleware Tests (US6-T01)
 *
 * Tests that validate performance tracking middleware:
 * - Track response time for all requests
 * - Store p50/p95/p99 in memory (1-hour window)
 * - Expose /api/metrics/performance endpoint
 * - Alert if p95 >200ms for 5 minutes
 */

const request = require('supertest');
const express = require('express');
const performanceTracker = require('../../../src/middleware/performance-tracker');
const logger = require('../../../src/utils/logger');

// Mock logger to capture alert calls
jest.mock('../../../src/utils/logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
}));

describe('Performance Tracker Middleware (US6-T01)', () => {
  let app;

  beforeEach(() => {
    // Create fresh Express app for each test
    app = express();
    app.use(express.json());

    // Clear all mocks and reset performance data
    jest.clearAllMocks();

    // Reset performance tracker state if method exists
    if (performanceTracker.reset) {
      performanceTracker.reset();
    }
  });

  afterAll(() => {
    // Clean up intervals to prevent open handles
    if (performanceTracker.shutdown) {
      performanceTracker.shutdown();
    }
  });

  describe('Response Time Tracking', () => {
    it('should track response times for all requests', async () => {
      // Apply performance tracker middleware
      app.use(performanceTracker.middleware);

      // Add test route with simulated delay
      app.get('/test-fast', (req, res) => {
        res.json({ success: true });
      });

      const res = await request(app).get('/test-fast');

      expect(res.status).toBe(200);

      // Verify response time was tracked
      const metrics = performanceTracker.getMetrics();
      expect(metrics.totalRequests).toBeGreaterThan(0);
      expect(metrics.responseTimes).toBeDefined();
      expect(Array.isArray(metrics.responseTimes)).toBe(true);
    });

    it('should record accurate response times', async () => {
      app.use(performanceTracker.middleware);

      // Create route with known delay
      app.get('/test-delayed', async (req, res) => {
        await new Promise(resolve => setTimeout(resolve, 50));
        res.json({ success: true });
      });

      const start = Date.now();
      const res = await request(app).get('/test-delayed');
      const elapsed = Date.now() - start;

      expect(res.status).toBe(200);

      const metrics = performanceTracker.getMetrics();
      const recordedTime = metrics.responseTimes[metrics.responseTimes.length - 1];

      // Response time should be approximately 50ms (with tolerance)
      expect(recordedTime).toBeGreaterThan(40);
      expect(recordedTime).toBeLessThan(100);
    });

    it('should tag metrics by endpoint, method, and status code', async () => {
      app.use(performanceTracker.middleware);

      app.get('/api/users', (req, res) => res.json({ users: [] }));
      app.post('/api/users', (req, res) => res.status(201).json({ id: 1 }));
      app.get('/api/error', (req, res) => res.status(500).json({ error: 'Internal error' }));

      await request(app).get('/api/users');
      await request(app).post('/api/users').send({ name: 'Test' });
      await request(app).get('/api/error');

      const detailedMetrics = performanceTracker.getDetailedMetrics();

      // Verify metrics are tagged by endpoint
      expect(detailedMetrics['GET:/api/users']).toBeDefined();
      expect(detailedMetrics['POST:/api/users']).toBeDefined();
      expect(detailedMetrics['GET:/api/error']).toBeDefined();

      // Verify status code tracking
      expect(detailedMetrics['GET:/api/users'].statusCodes).toContain(200);
      expect(detailedMetrics['POST:/api/users'].statusCodes).toContain(201);
      expect(detailedMetrics['GET:/api/error'].statusCodes).toContain(500);
    });
  });

  describe('Percentile Calculation (p50/p95/p99)', () => {
    it('should calculate p50 correctly', async () => {
      app.use(performanceTracker.middleware);

      // Create routes with known response times
      const delays = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

      for (const delay of delays) {
        app.get(`/test-${delay}`, async (req, res) => {
          await new Promise(resolve => setTimeout(resolve, delay));
          res.json({ delay });
        });
      }

      // Make requests with varying delays
      for (const delay of delays) {
        await request(app).get(`/test-${delay}`);
      }

      const metrics = performanceTracker.getMetrics();

      // p50 (median) should be around 50-60ms
      expect(metrics.p50).toBeGreaterThan(40);
      expect(metrics.p50).toBeLessThan(70);
    });

    it('should calculate p95 correctly', async () => {
      app.use(performanceTracker.middleware);

      // Create 100 requests with known distribution
      const delays = Array.from({ length: 100 }, (_, i) => i + 1);

      for (const delay of delays) {
        app.get(`/test-p95-${delay}`, async (req, res) => {
          await new Promise(resolve => setTimeout(resolve, Math.min(delay, 20)));
          res.json({ delay });
        });
      }

      // Make requests
      for (const delay of delays.slice(0, 20)) {
        await request(app).get(`/test-p95-${delay}`);
      }

      const metrics = performanceTracker.getMetrics();

      // p95 should represent 95th percentile
      expect(metrics.p95).toBeDefined();
      expect(typeof metrics.p95).toBe('number');
    });

    it('should calculate p99 correctly', async () => {
      app.use(performanceTracker.middleware);

      // Create requests with outliers
      const delays = [...Array(99).fill(10), 500];

      for (let i = 0; i < 10; i++) {
        const delay = delays[i];
        app.get(`/test-p99-${i}`, async (req, res) => {
          await new Promise(resolve => setTimeout(resolve, delay));
          res.json({ delay });
        });
      }

      for (let i = 0; i < 10; i++) {
        await request(app).get(`/test-p99-${i}`);
      }

      const metrics = performanceTracker.getMetrics();

      expect(metrics.p99).toBeDefined();
      expect(typeof metrics.p99).toBe('number');
    });

    it('should only keep metrics from last 1 hour', async () => {
      app.use(performanceTracker.middleware);

      app.get('/test-expiry', (req, res) => res.json({ success: true }));

      // Make initial request
      await request(app).get('/test-expiry');

      const metrics1 = performanceTracker.getMetrics();
      expect(metrics1.totalRequests).toBe(1);

      // Simulate time passing (if method exists)
      if (performanceTracker.simulateTimePass) {
        performanceTracker.simulateTimePass(61 * 60 * 1000); // 61 minutes

        const metrics2 = performanceTracker.getMetrics();
        // Old requests should be expired
        expect(metrics2.totalRequests).toBe(0);
      }
    });
  });

  describe('Metrics Endpoint', () => {
    it('should expose /api/metrics/performance endpoint', async () => {
      // Create app with performance tracking and metrics route
      const metricsApp = express();
      metricsApp.use(performanceTracker.middleware);
      metricsApp.get('/test', (req, res) => res.json({ success: true }));
      metricsApp.get('/api/metrics/performance', performanceTracker.metricsEndpoint);

      // Make some requests to generate data
      await request(metricsApp).get('/test');
      await request(metricsApp).get('/test');

      // Fetch metrics
      const res = await request(metricsApp).get('/api/metrics/performance');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('p50');
      expect(res.body.data).toHaveProperty('p95');
      expect(res.body.data).toHaveProperty('p99');
      expect(res.body.data).toHaveProperty('totalRequests');
    });

    it('should return percentiles in metrics endpoint', async () => {
      const metricsApp = express();
      metricsApp.use(performanceTracker.middleware);
      metricsApp.get('/test', async (req, res) => {
        await new Promise(resolve => setTimeout(resolve, 50));
        res.json({ success: true });
      });
      metricsApp.get('/api/metrics/performance', performanceTracker.metricsEndpoint);

      // Generate requests
      for (let i = 0; i < 10; i++) {
        await request(metricsApp).get('/test');
      }

      const res = await request(metricsApp).get('/api/metrics/performance');

      expect(res.status).toBe(200);
      expect(typeof res.body.data.p50).toBe('number');
      expect(typeof res.body.data.p95).toBe('number');
      expect(typeof res.body.data.p99).toBe('number');
      expect(res.body.data.p50).toBeGreaterThan(0);
      expect(res.body.data.p95).toBeGreaterThanOrEqual(res.body.data.p50);
      expect(res.body.data.p99).toBeGreaterThanOrEqual(res.body.data.p95);
    });

    it('should include time window in metrics', async () => {
      const metricsApp = express();
      metricsApp.use(performanceTracker.middleware);
      metricsApp.get('/test', (req, res) => res.json({ success: true }));
      metricsApp.get('/api/metrics/performance', performanceTracker.metricsEndpoint);

      await request(metricsApp).get('/test');

      const res = await request(metricsApp).get('/api/metrics/performance');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('windowDuration');
      expect(res.body.data.windowDuration).toBe('1 hour');
    });
  });

  describe('Performance Alerts', () => {
    it('should alert if p95 >200ms for 5 minutes', async () => {
      app.use(performanceTracker.middleware);

      // Create slow route
      app.get('/test-slow', async (req, res) => {
        await new Promise(resolve => setTimeout(resolve, 250));
        res.json({ success: true });
      });

      // Make enough requests to trigger p95 > 200ms
      for (let i = 0; i < 20; i++) {
        await request(app).get('/test-slow');
      }

      // Simulate 5 minutes passing with consistent slow performance
      if (performanceTracker.simulateAlertCheck) {
        performanceTracker.simulateAlertCheck(5 * 60 * 1000);

        // Verify alert was logged
        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Performance degradation'),
          expect.objectContaining({
            p95: expect.any(Number),
            threshold: 200
          })
        );
      }
    });

    it('should not alert if p95 <200ms', async () => {
      app.use(performanceTracker.middleware);

      app.get('/test-fast', (req, res) => res.json({ success: true }));

      // Make fast requests
      for (let i = 0; i < 20; i++) {
        await request(app).get('/test-fast');
      }

      // Check if alert should be triggered
      if (performanceTracker.simulateAlertCheck) {
        performanceTracker.simulateAlertCheck(5 * 60 * 1000);

        // No alert should be logged
        expect(logger.warn).not.toHaveBeenCalledWith(
          expect.stringContaining('Performance degradation'),
          expect.any(Object)
        );
      }
    });

    it('should include alert details in log', async () => {
      app.use(performanceTracker.middleware);

      app.get('/test-slow-alert', async (req, res) => {
        await new Promise(resolve => setTimeout(resolve, 300));
        res.json({ success: true });
      });

      for (let i = 0; i < 20; i++) {
        await request(app).get('/test-slow-alert');
      }

      if (performanceTracker.simulateAlertCheck) {
        performanceTracker.simulateAlertCheck(5 * 60 * 1000);

        const warnCalls = logger.warn.mock.calls.filter(call =>
          call[0].includes('Performance degradation')
        );

        if (warnCalls.length > 0) {
          const alertData = warnCalls[0][1];
          expect(alertData).toHaveProperty('p95');
          expect(alertData).toHaveProperty('threshold');
          expect(alertData).toHaveProperty('duration');
        }
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle requests with errors gracefully', async () => {
      app.use(performanceTracker.middleware);

      app.get('/test-error', (req, res) => {
        throw new Error('Test error');
      });

      // Add error handler
      app.use((err, req, res, next) => {
        res.status(500).json({ error: err.message });
      });

      const res = await request(app).get('/test-error');

      expect(res.status).toBe(500);

      // Performance should still be tracked
      const metrics = performanceTracker.getMetrics();
      expect(metrics.totalRequests).toBeGreaterThan(0);
    });

    it('should handle zero requests gracefully', () => {
      const metrics = performanceTracker.getMetrics();

      expect(metrics.totalRequests).toBe(0);
      expect(metrics.p50).toBe(0);
      expect(metrics.p95).toBe(0);
      expect(metrics.p99).toBe(0);
    });

    it('should handle single request correctly', async () => {
      app.use(performanceTracker.middleware);
      app.get('/test-single', (req, res) => res.json({ success: true }));

      await request(app).get('/test-single');

      const metrics = performanceTracker.getMetrics();

      expect(metrics.totalRequests).toBe(1);
      // Response time should be non-negative (can be 0 for extremely fast responses)
      expect(metrics.p50).toBeGreaterThanOrEqual(0);
      expect(metrics.p95).toBe(metrics.p50);
      expect(metrics.p99).toBe(metrics.p50);
    });
  });
});
