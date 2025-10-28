// External dependencies
const request = require('supertest');
const jwt = require('jsonwebtoken');

// Internal dependencies
const createApp = require('../../../src/app');
const User = require('../../../src/models/User');
const { getQueryLoggerInstance } = require('../../../src/utils/analytics-query-logger');
const { getAlertsService } = require('../../../src/utils/alerts');
const { connectDB, disconnectDB } = require('../../setup/db');

describe('Alert Triggering Tests (US6-T11)', () => {
  let app;
  let adminToken;
  let adminUser;
  let queryLogger;
  let alertsService;
  let alertCalls;
  let originalSendSlowQueryAlert;

  beforeAll(async () => {
    await connectDB();

    // Initialize Express app
    app = createApp();

    // Create admin user
    adminUser = await User.create({
      discordId: 'admin-alert-test',
      discordUsername: 'AlertAdmin',
      username: 'AlertAdmin',
      discriminator: '0001',
      email: 'alert-admin@test.com',
      isAdmin: true
    });

    // Generate admin token
    adminToken = jwt.sign(
      { userId: adminUser._id, discordId: adminUser.discordId },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Get service instances
    queryLogger = getQueryLoggerInstance();
    alertsService = getAlertsService();

    // Track alert calls
    alertCalls = [];

    // Mock AlertsService.sendSlowQueryAlert to track calls
    originalSendSlowQueryAlert = alertsService.sendSlowQueryAlert.bind(alertsService);
    alertsService.sendSlowQueryAlert = jest.fn(async (pattern) => {
      alertCalls.push({
        type: 'slow_query',
        pattern: pattern,
        timestamp: Date.now()
      });
      return Promise.resolve();
    });
  });

  afterAll(async () => {
    // Restore original alert service
    alertsService.sendSlowQueryAlert = originalSendSlowQueryAlert;

    // Clean up intervals to prevent open handles
    if (queryLogger && queryLogger.shutdown) {
      queryLogger.shutdown();
    }

    if (adminUser) {
      await User.deleteOne({ _id: adminUser._id });
    }
    await disconnectDB();
  });

  beforeEach(() => {
    // Reset alert calls and query logger
    alertCalls = [];
    jest.clearAllMocks();
    if (queryLogger && queryLogger.reset) {
      queryLogger.reset();
    }
  });

  describe('Slow Database Query Alerts (avgTime >2000ms)', () => {
    it('should trigger alert when query pattern exceeds 2000ms average with 5+ executions', async () => {
      // Simulate slow query pattern (5+ executions with >2000ms average)
      const slowQuery = {
        queryType: 'find',
        params: { userId: '<value>', status: 'active' },
        executionTime: 2500,
        resultSize: 100,
        collection: 'users'
      };

      // Log the same pattern 10 times with slow execution
      for (let i = 0; i < 10; i++) {
        queryLogger.logQuery({
          ...slowQuery,
          executionTime: 2300 + (i * 50) // Varying slow durations averaging >2000ms
        });
      }

      // Wait for alert processing
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify alert was sent
      expect(alertsService.sendSlowQueryAlert).toHaveBeenCalled();
      expect(alertCalls.length).toBeGreaterThan(0);

      // Verify alert contains correct information
      const lastAlert = alertCalls[alertCalls.length - 1];
      expect(lastAlert.type).toBe('slow_query');
      expect(lastAlert.pattern.avgTime).toBeGreaterThan(2000);
      expect(lastAlert.pattern.count).toBeGreaterThanOrEqual(5);
    });

    it('should NOT trigger alert when query pattern has fewer than 5 executions', async () => {
      // Simulate slow query but with insufficient executions
      const slowQuery = {
        queryType: 'aggregate',
        params: { pipeline: '<value>' },
        executionTime: 3000,
        resultSize: 200,
        collection: 'analytics'
      };

      // Log only 4 times (below threshold)
      for (let i = 0; i < 4; i++) {
        queryLogger.logQuery({
          ...slowQuery,
          executionTime: 2800 + (i * 100)
        });
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify no alert was sent (count < 5)
      expect(alertsService.sendSlowQueryAlert).not.toHaveBeenCalled();
      expect(alertCalls.length).toBe(0);
    });

    it('should NOT trigger alert when query pattern is below 2000ms', async () => {
      // Simulate fast query pattern
      const fastQuery = {
        queryType: 'find',
        params: { userId: '<value>' },
        executionTime: 150,
        resultSize: 50,
        collection: 'users'
      };

      // Log the same pattern 10 times with fast execution
      for (let i = 0; i < 10; i++) {
        queryLogger.logQuery({
          ...fastQuery,
          executionTime: 100 + (i * 10) // Varying fast durations averaging ~150ms
        });
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify no alert was sent
      expect(alertsService.sendSlowQueryAlert).not.toHaveBeenCalled();
      expect(alertCalls.length).toBe(0);
    });
  });

  describe('Alert Delivery Verification', () => {
    it('should call AlertsService with correct pattern data', async () => {
      // Simulate critical slow query
      const criticalQuery = {
        queryType: 'aggregate',
        params: { pipeline: '<complex>' },
        executionTime: 5500,
        resultSize: 1000,
        collection: 'reports'
      };

      // Log critical pattern
      for (let i = 0; i < 10; i++) {
        queryLogger.logQuery({
          ...criticalQuery,
          executionTime: 5000 + (i * 100)
        });
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify alert service was called
      expect(alertsService.sendSlowQueryAlert).toHaveBeenCalled();

      // Verify alert contains expected fields
      const callArgs = alertsService.sendSlowQueryAlert.mock.calls[0][0];
      expect(callArgs).toHaveProperty('queryType', 'aggregate');
      expect(callArgs).toHaveProperty('avgTime');
      expect(callArgs.avgTime).toBeGreaterThan(5000);
      expect(callArgs).toHaveProperty('count');
      expect(callArgs.count).toBeGreaterThanOrEqual(5);
      expect(callArgs).toHaveProperty('recommendation');
    });

    it('should include optimization recommendations in alerts', async () => {
      // Simulate slow query needing optimization
      const needsOptimization = {
        queryType: 'find',
        params: { complexFilter: '<value>' },
        executionTime: 3000,
        resultSize: 12000, // Large result set (triggers pagination recommendation at >10000)
        collection: 'documents'
      };

      // Log pattern
      for (let i = 0; i < 15; i++) {
        queryLogger.logQuery({
          ...needsOptimization,
          executionTime: 2800 + (i * 50)
        });
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify alert contains recommendations
      expect(alertsService.sendSlowQueryAlert).toHaveBeenCalled();
      const callArgs = alertsService.sendSlowQueryAlert.mock.calls[0][0];

      expect(callArgs.recommendation).toBeDefined();
      expect(typeof callArgs.recommendation).toBe('string');
      expect(callArgs.recommendation.length).toBeGreaterThan(0);

      // Should recommend pagination for large result sets
      expect(callArgs.recommendation).toContain('pagination');
    });
  });
});
