/**
 * US3-T04: CSRF Protection Tests
 * Integration tests for CSRF token validation
 *
 * Acceptance Criteria:
 * - Test CSRF token generation via GET endpoint
 * - Test POST request rejection without CSRF token
 * - Test POST request rejection with invalid CSRF token
 * - Test POST request acceptance with valid CSRF token
 * - Test token rotation after successful use
 * - Test cross-session token validation
 * - 6 new tests, all passing
 */

const request = require('supertest');
const express = require('express');
const session = require('express-session');
const { csrfProtection, getOrCreateToken } = require('../../../src/middleware/csrf');
const { ErrorCodes } = require('../../../src/constants/ErrorCodes');
const { errorHandler } = require('../../../src/middleware/errorHandler');

describe('US3-T04: CSRF Protection Tests', () => {
  let app;

  beforeEach(() => {
    // Create Express app with session middleware
    app = express();
    app.use(express.json());
    app.use(
      session({
        secret: 'test-session-secret-minimum-32-chars-long',
        resave: false,
        saveUninitialized: true,
        cookie: {
          secure: false,
          httpOnly: true,
          maxAge: 24 * 60 * 60 * 1000
        }
      })
    );

    // Apply CSRF protection middleware
    app.use(csrfProtection());

    // Test routes
    app.get('/api/csrf-token', (req, res) => {
      const csrfToken = getOrCreateToken(req);
      res.status(200).json({
        success: true,
        csrfToken
      });
    });

    app.post('/api/test-protected', (req, res) => {
      res.status(200).json({
        success: true,
        message: 'Protected action completed',
        data: req.body
      });
    });

    app.get('/api/test-safe', (req, res) => {
      res.status(200).json({
        success: true,
        message: 'Safe GET request - no CSRF required'
      });
    });

    // Error handler middleware (must be last)
    app.use(errorHandler);
  });

  describe('CSRF Token Generation', () => {
    it('should generate CSRF token via GET endpoint', async () => {
      const agent = request.agent(app);

      const response = await agent.get('/api/csrf-token').expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('csrfToken');
      expect(typeof response.body.csrfToken).toBe('string');
      expect(response.body.csrfToken.length).toBeGreaterThan(0);
    });

    it('should return same token for same session', async () => {
      const agent = request.agent(app);

      // Get token twice
      const response1 = await agent.get('/api/csrf-token').expect(200);
      const response2 = await agent.get('/api/csrf-token').expect(200);

      // Tokens should be identical (no rotation for GET)
      expect(response1.body.csrfToken).toBe(response2.body.csrfToken);
    });

    it('should return different tokens for different sessions', async () => {
      const agent1 = request.agent(app);
      const agent2 = request.agent(app);

      const response1 = await agent1.get('/api/csrf-token').expect(200);
      const response2 = await agent2.get('/api/csrf-token').expect(200);

      // Different sessions should get different tokens
      expect(response1.body.csrfToken).not.toBe(response2.body.csrfToken);
    });
  });

  describe('CSRF Token Validation', () => {
    it('should reject POST request without CSRF token (403)', async () => {
      const agent = request.agent(app);

      const response = await agent
        .post('/api/test-protected')
        .send({ data: 'test' })
        .expect(403);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('code', ErrorCodes.CSRF_TOKEN_MISSING);
      expect(response.body.error).toMatch(/csrf token required/i);
    });

    it('should reject POST request with invalid CSRF token (403)', async () => {
      const agent = request.agent(app);

      // Establish session first
      await agent.get('/api/csrf-token').expect(200);

      const response = await agent
        .post('/api/test-protected')
        .set('X-CSRF-Token', 'invalid-csrf-token-12345678')
        .send({ data: 'test' })
        .expect(403);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('code', ErrorCodes.CSRF_TOKEN_INVALID);
      expect(response.body.error).toMatch(/invalid csrf token/i);
    });

    it('should accept POST request with valid CSRF token (200)', async () => {
      const agent = request.agent(app);

      // Get CSRF token
      const tokenResponse = await agent.get('/api/csrf-token').expect(200);
      const csrfToken = tokenResponse.body.csrfToken;

      // Use token in POST request
      const response = await agent
        .post('/api/test-protected')
        .set('X-CSRF-Token', csrfToken)
        .send({ data: 'test' })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'Protected action completed');
    });

    it('should allow safe GET requests without CSRF token', async () => {
      const agent = request.agent(app);

      const response = await agent.get('/api/test-safe').expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.message).toMatch(/safe get request/i);
    });
  });

  describe('CSRF Token Rotation', () => {
    it('should rotate CSRF token after successful use', async () => {
      const agent = request.agent(app);

      // Get first token
      const tokenResponse1 = await agent.get('/api/csrf-token').expect(200);
      const csrfToken1 = tokenResponse1.body.csrfToken;

      // Use token in POST request (this should rotate it)
      await agent
        .post('/api/test-protected')
        .set('X-CSRF-Token', csrfToken1)
        .send({ data: 'test' })
        .expect(200);

      // Get new token from same session
      const tokenResponse2 = await agent.get('/api/csrf-token').expect(200);
      const csrfToken2 = tokenResponse2.body.csrfToken;

      // Tokens should be different after rotation
      expect(csrfToken2).not.toBe(csrfToken1);
    });

    it('should reject old token after rotation', async () => {
      const agent = request.agent(app);

      // Get first token
      const tokenResponse = await agent.get('/api/csrf-token').expect(200);
      const csrfToken1 = tokenResponse.body.csrfToken;

      // Use token once (this rotates it)
      await agent
        .post('/api/test-protected')
        .set('X-CSRF-Token', csrfToken1)
        .send({ data: 'first' })
        .expect(200);

      // Try to use old token again
      const response = await agent
        .post('/api/test-protected')
        .set('X-CSRF-Token', csrfToken1)
        .send({ data: 'second' })
        .expect(403);

      expect(response.body).toHaveProperty('code', ErrorCodes.CSRF_TOKEN_INVALID);
    });
  });

  describe('CSRF Cross-Session Validation', () => {
    it('should reject token from different session', async () => {
      const agent1 = request.agent(app);
      const agent2 = request.agent(app);

      // Get token from first session
      const tokenResponse = await agent1.get('/api/csrf-token').expect(200);
      const csrfToken = tokenResponse.body.csrfToken;

      // Try to use token from second session
      const response = await agent2
        .post('/api/test-protected')
        .set('X-CSRF-Token', csrfToken)
        .send({ data: 'test' })
        .expect(403);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('code', ErrorCodes.CSRF_TOKEN_INVALID);
    });

    it('should accept token in body field as fallback', async () => {
      const agent = request.agent(app);

      // Get CSRF token
      const tokenResponse = await agent.get('/api/csrf-token').expect(200);
      const csrfToken = tokenResponse.body.csrfToken;

      // Send token in body (form submission pattern)
      const response = await agent
        .post('/api/test-protected')
        .send({ _csrf: csrfToken, data: 'test' })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });
  });

  describe('CSRF Exemptions', () => {
    it('should exempt requests with Bearer token authentication', async () => {
      // Create app with Bearer token exemption
      const exemptApp = express();
      exemptApp.use(express.json());
      exemptApp.use(
        session({
          secret: 'test-session-secret',
          resave: false,
          saveUninitialized: false
        })
      );
      exemptApp.use(csrfProtection());

      exemptApp.post('/api/test-protected', (req, res) => {
        res.status(200).json({ success: true });
      });

      exemptApp.use(errorHandler);

      // POST with Bearer token should work without CSRF
      const response = await request(exemptApp)
        .post('/api/test-protected')
        .set('Authorization', 'Bearer test-jwt-token-12345')
        .send({ data: 'test' })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });

    it('should exempt webhook paths from CSRF protection', async () => {
      const exemptApp = express();
      exemptApp.use(express.json());
      exemptApp.use(
        session({
          secret: 'test-session-secret',
          resave: false,
          saveUninitialized: false
        })
      );
      exemptApp.use(csrfProtection());

      exemptApp.post('/webhook/polar', (req, res) => {
        res.status(200).json({ success: true });
      });

      exemptApp.use(errorHandler);

      // Webhook endpoint should work without CSRF token
      const response = await request(exemptApp)
        .post('/webhook/polar')
        .send({ event: 'subscription.created' })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });
  });
});
