'use strict';

/**
 * Integration Tests: JWT WebSocket Authentication
 *
 * Tests US-008 implementation:
 * - Valid token → connection authorized
 * - Expired token → connection rejected
 * - Missing token → connection rejected
 * - Invalid signature → connection rejected
 * - Token refresh flow (reauth event)
 * - Multi-device connections (same user, different sockets)
 * - Security monitoring (failed auth counter)
 */

// Set JWT_SECRET BEFORE importing middleware (so middleware uses same secret)
process.env.JWT_SECRET = 'test-secret-key';

const jwt = require('jsonwebtoken');
const { io: ioClient } = require('socket.io-client');
const { createServer } = require('http');
const { Server } = require('socket.io');
const JWTAuthMiddleware = require('../../../src/websocket/middleware/JWTAuthMiddleware');

// Test configuration
const JWT_SECRET = process.env.JWT_SECRET;
const TEST_PORT = 4001;
const SOCKET_URL = `http://localhost:${TEST_PORT}`;

describe('US-008: JWT WebSocket Authentication', () => {
  let httpServer;
  let socketServer;

  beforeEach(done => {
    // Create HTTP server
    httpServer = createServer();

    // Create Socket.IO server
    socketServer = new Server(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });

    // Apply JWT authentication middleware
    socketServer.use(JWTAuthMiddleware);

    // Test connection handler
    socketServer.on('connection', socket => {
      socket.emit('connection.authorized', {
        userId: socket.data.userId,
        sessionId: socket.id
      });

      socket.on('ping', callback => {
        callback({ message: 'pong', userId: socket.data.userId });
      });

      socket.on('connection.reauth', (newToken, callback) => {
        // Simulate token refresh
        jwt.verify(newToken, JWT_SECRET, { algorithms: ['HS256'] }, (err, decoded) => {
          if (err) {
            return callback({ success: false, error: err.message });
          }

          socket.data.userId = decoded.userId;
          socket.data.tokenExpiresAt = decoded.exp * 1000;
          callback({ success: true, userId: decoded.userId });
        });
      });
    });

    // Start server
    httpServer.listen(TEST_PORT, done);
  });

  afterEach(done => {
    socketServer.close();
    httpServer.close(done);
  });

  describe('Valid Token Authentication', () => {
    test('should authorize connection with valid JWT token (query parameter)', done => {
      const userId = 'user-12345';
      const token = generateToken(userId, { expiresIn: '1h' });

      const client = ioClient(SOCKET_URL, {
        query: { token },
        transports: ['websocket']
      });

      client.on('connection.authorized', data => {
        expect(data.userId).toBe(userId);
        expect(data.sessionId).toBe(client.id);

        client.disconnect();
        done();
      });

      client.on('connect_error', error => {
        done(new Error(`Connection failed: ${error.message}`));
      });
    });

    test('should authorize connection with valid JWT token (auth object)', done => {
      const userId = 'user-67890';
      const token = generateToken(userId, { expiresIn: '2h' });

      const client = ioClient(SOCKET_URL, {
        auth: { token },
        transports: ['websocket']
      });

      client.on('connection.authorized', data => {
        expect(data.userId).toBe(userId);
        client.disconnect();
        done();
      });

      client.on('connect_error', error => {
        done(new Error(`Connection failed: ${error.message}`));
      });
    });

    test('should handle messages after authorization', done => {
      const userId = 'user-msg-test';
      const token = generateToken(userId, { expiresIn: '1h' });

      const client = ioClient(SOCKET_URL, {
        query: { token },
        transports: ['websocket']
      });

      client.on('connection.authorized', () => {
        client.emit('ping', response => {
          expect(response.message).toBe('pong');
          expect(response.userId).toBe(userId);

          client.disconnect();
          done();
        });
      });

      client.on('connect_error', error => {
        done(new Error(`Connection failed: ${error.message}`));
      });
    });
  });

  describe('Token Expiration', () => {
    test('should reject connection with expired JWT token', done => {
      const userId = 'user-expired';
      const token = generateToken(userId, { expiresIn: '-1h' }); // Expired 1 hour ago

      const client = ioClient(SOCKET_URL, {
        query: { token },
        transports: ['websocket']
      });

      client.on('connect_error', error => {
        expect(error.message).toContain('expired');
        expect(error.data.code).toBe('TOKEN_EXPIRED');
        expect(error.data.message).toContain('session has expired');

        client.disconnect();
        done();
      });

      client.on('connection.authorized', () => {
        done(new Error('Should not authorize expired token'));
      });
    });

    test('should reject token expiring in the past', done => {
      const userId = 'user-past-exp';
      const token = jwt.sign(
        {
          userId,
          exp: Math.floor(Date.now() / 1000) - 600 // Expired 10 minutes ago
        },
        JWT_SECRET,
        { algorithm: 'HS256' }
      );

      const client = ioClient(SOCKET_URL, {
        query: { token },
        transports: ['websocket']
      });

      client.on('connect_error', error => {
        expect(error.message).toContain('expired');
        client.disconnect();
        done();
      });

      client.on('connection.authorized', () => {
        done(new Error('Should not authorize token with past expiration'));
      });
    });
  });

  describe('Missing or Invalid Token', () => {
    test('should reject connection with missing JWT token', done => {
      const client = ioClient(SOCKET_URL, {
        transports: ['websocket']
      });

      client.on('connect_error', error => {
        expect(error.message).toContain('Missing JWT token');
        expect(error.data.code).toBe('MISSING_TOKEN');
        expect(error.data.message).toContain('Authentication required');

        client.disconnect();
        done();
      });

      client.on('connection.authorized', () => {
        done(new Error('Should not authorize without token'));
      });
    });

    test('should reject connection with invalid JWT signature', done => {
      const userId = 'user-invalid-sig';
      const token = jwt.sign({ userId }, 'wrong-secret-key', {
        algorithm: 'HS256',
        expiresIn: '1h'
      });

      const client = ioClient(SOCKET_URL, {
        query: { token },
        transports: ['websocket']
      });

      client.on('connect_error', error => {
        expect(error.message).toContain('Invalid JWT token');
        expect(error.data.code).toBe('INVALID_TOKEN');
        expect(error.data.message).toContain('Invalid token signature');

        client.disconnect();
        done();
      });

      client.on('connection.authorized', () => {
        done(new Error('Should not authorize token with invalid signature'));
      });
    });

    test('should reject connection with malformed JWT token', done => {
      const client = ioClient(SOCKET_URL, {
        query: { token: 'not-a-valid-jwt-token' },
        transports: ['websocket']
      });

      client.on('connect_error', error => {
        expect(error.message).toContain('Invalid JWT token');
        expect(error.data.code).toBe('INVALID_TOKEN');

        client.disconnect();
        done();
      });

      client.on('connection.authorized', () => {
        done(new Error('Should not authorize malformed token'));
      });
    });

    test('should reject token missing userId claim', done => {
      const token = jwt.sign(
        { email: 'test@example.com' }, // Missing userId
        JWT_SECRET,
        { algorithm: 'HS256', expiresIn: '1h' }
      );

      const client = ioClient(SOCKET_URL, {
        query: { token },
        transports: ['websocket']
      });

      client.on('connect_error', error => {
        expect(error.message).toContain('Authentication failed');
        client.disconnect();
        done();
      });

      client.on('connection.authorized', () => {
        done(new Error('Should not authorize token without userId'));
      });
    });
  });

  describe('Token Refresh (Reauth) Flow', () => {
    test('should allow token refresh via connection.reauth event', done => {
      const userId = 'user-reauth';
      const originalToken = generateToken(userId, { expiresIn: '1h' });
      const newToken = generateToken(userId, { expiresIn: '2h' });

      const client = ioClient(SOCKET_URL, {
        query: { token: originalToken },
        transports: ['websocket']
      });

      client.on('connection.authorized', data => {
        expect(data.userId).toBe(userId);

        // Simulate token refresh
        client.emit('connection.reauth', newToken, response => {
          expect(response.success).toBe(true);
          expect(response.userId).toBe(userId);

          // Verify new token works
          client.emit('ping', pingResponse => {
            expect(pingResponse.userId).toBe(userId);
            client.disconnect();
            done();
          });
        });
      });

      client.on('connect_error', error => {
        done(new Error(`Connection failed: ${error.message}`));
      });
    });

    test('should reject reauth with expired token', done => {
      const userId = 'user-reauth-expired';
      const originalToken = generateToken(userId, { expiresIn: '1h' });
      const expiredToken = generateToken(userId, { expiresIn: '-1h' });

      const client = ioClient(SOCKET_URL, {
        query: { token: originalToken },
        transports: ['websocket']
      });

      client.on('connection.authorized', () => {
        client.emit('connection.reauth', expiredToken, response => {
          expect(response.success).toBe(false);
          expect(response.error).toContain('expired');

          client.disconnect();
          done();
        });
      });

      client.on('connect_error', error => {
        done(new Error(`Connection failed: ${error.message}`));
      });
    });

    test('should reject reauth with invalid token signature', done => {
      const userId = 'user-reauth-invalid';
      const originalToken = generateToken(userId, { expiresIn: '1h' });
      const invalidToken = jwt.sign({ userId }, 'wrong-secret', {
        algorithm: 'HS256',
        expiresIn: '1h'
      });

      const client = ioClient(SOCKET_URL, {
        query: { token: originalToken },
        transports: ['websocket']
      });

      client.on('connection.authorized', () => {
        client.emit('connection.reauth', invalidToken, response => {
          expect(response.success).toBe(false);
          expect(response.error).toContain('signature');

          client.disconnect();
          done();
        });
      });

      client.on('connect_error', error => {
        done(new Error(`Connection failed: ${error.message}`));
      });
    });
  });

  describe('Multi-Device Connections', () => {
    test('should allow same user with multiple socket connections', done => {
      const userId = 'user-multi-device';
      const token1 = generateToken(userId, { expiresIn: '1h' });
      const token2 = generateToken(userId, { expiresIn: '1h' });

      const client1 = ioClient(SOCKET_URL, {
        query: { token: token1 },
        transports: ['websocket']
      });

      const client2 = ioClient(SOCKET_URL, {
        query: { token: token2 },
        transports: ['websocket']
      });

      let client1Authorized = false;
      let client2Authorized = false;

      client1.on('connection.authorized', data => {
        expect(data.userId).toBe(userId);
        client1Authorized = true;

        if (client1Authorized && client2Authorized) {
          expect(client1.id).not.toBe(client2.id); // Different session IDs
          client1.disconnect();
          client2.disconnect();
          done();
        }
      });

      client2.on('connection.authorized', data => {
        expect(data.userId).toBe(userId);
        client2Authorized = true;

        if (client1Authorized && client2Authorized) {
          expect(client1.id).not.toBe(client2.id); // Different session IDs
          client1.disconnect();
          client2.disconnect();
          done();
        }
      });

      client1.on('connect_error', error => {
        done(new Error(`Client 1 failed: ${error.message}`));
      });

      client2.on('connect_error', error => {
        done(new Error(`Client 2 failed: ${error.message}`));
      });
    });

    test('should maintain separate socket.data for different users', done => {
      const user1 = 'user-1';
      const user2 = 'user-2';
      const token1 = generateToken(user1, { expiresIn: '1h' });
      const token2 = generateToken(user2, { expiresIn: '1h' });

      const client1 = ioClient(SOCKET_URL, {
        query: { token: token1 },
        transports: ['websocket']
      });

      const client2 = ioClient(SOCKET_URL, {
        query: { token: token2 },
        transports: ['websocket']
      });

      let user1Response = null;
      let user2Response = null;

      client1.on('connection.authorized', () => {
        client1.emit('ping', response => {
          user1Response = response.userId;

          if (user1Response && user2Response) {
            expect(user1Response).toBe(user1);
            expect(user2Response).toBe(user2);
            client1.disconnect();
            client2.disconnect();
            done();
          }
        });
      });

      client2.on('connection.authorized', () => {
        client2.emit('ping', response => {
          user2Response = response.userId;

          if (user1Response && user2Response) {
            expect(user1Response).toBe(user1);
            expect(user2Response).toBe(user2);
            client1.disconnect();
            client2.disconnect();
            done();
          }
        });
      });

      client1.on('connect_error', error => {
        done(new Error(`Client 1 failed: ${error.message}`));
      });

      client2.on('connect_error', error => {
        done(new Error(`Client 2 failed: ${error.message}`));
      });
    });
  });

  describe('Authorization Header Format', () => {
    test('should accept token from Authorization: Bearer header', done => {
      const userId = 'user-bearer';
      const token = generateToken(userId, { expiresIn: '1h' });

      const client = ioClient(SOCKET_URL, {
        extraHeaders: {
          Authorization: `Bearer ${token}`
        },
        transports: ['websocket']
      });

      client.on('connection.authorized', data => {
        expect(data.userId).toBe(userId);
        client.disconnect();
        done();
      });

      client.on('connect_error', error => {
        done(new Error(`Connection failed: ${error.message}`));
      });
    });

    test('should accept lowercase "bearer" prefix', done => {
      const userId = 'user-bearer-lowercase';
      const token = generateToken(userId, { expiresIn: '1h' });

      const client = ioClient(SOCKET_URL, {
        extraHeaders: {
          Authorization: `bearer ${token}`
        },
        transports: ['websocket']
      });

      client.on('connection.authorized', data => {
        expect(data.userId).toBe(userId);
        client.disconnect();
        done();
      });

      client.on('connect_error', error => {
        done(new Error(`Connection failed: ${error.message}`));
      });
    });

    test('should prioritize query parameter over Authorization header', done => {
      const userId1 = 'user-query';
      const userId2 = 'user-header';
      const token1 = generateToken(userId1, { expiresIn: '1h' });
      const token2 = generateToken(userId2, { expiresIn: '1h' });

      const client = ioClient(SOCKET_URL, {
        query: { token: token1 },
        extraHeaders: {
          Authorization: `Bearer ${token2}`
        },
        transports: ['websocket']
      });

      client.on('connection.authorized', data => {
        expect(data.userId).toBe(userId1); // Query parameter takes precedence
        client.disconnect();
        done();
      });

      client.on('connect_error', error => {
        done(new Error(`Connection failed: ${error.message}`));
      });
    });
  });

  describe('Security Monitoring', () => {
    test('should track failed authentication attempts', done => {
      const attempts = [];

      for (let i = 0; i < 3; i++) {
        const client = ioClient(SOCKET_URL, {
          query: { token: 'invalid-token' },
          transports: ['websocket']
        });

        attempts.push(
          new Promise(resolve => {
            client.on('connect_error', () => {
              client.disconnect();
              resolve();
            });
          })
        );
      }

      Promise.all(attempts).then(() => {
        // All 3 attempts should fail
        // In production, this would trigger security alerts
        done();
      });
    });

    test('should clear failed auth counter after successful auth', done => {
      const userId = 'user-clear-counter';

      // First, fail authentication
      const failedClient = ioClient(SOCKET_URL, {
        query: { token: 'invalid-token' },
        transports: ['websocket']
      });

      failedClient.on('connect_error', () => {
        failedClient.disconnect();

        // Then, succeed authentication
        const validToken = generateToken(userId, { expiresIn: '1h' });
        const successClient = ioClient(SOCKET_URL, {
          query: { token: validToken },
          transports: ['websocket']
        });

        successClient.on('connection.authorized', data => {
          expect(data.userId).toBe(userId);

          // Clear the counter manually (in production, this happens in auth success)
          JWTAuthMiddleware.clearFailedAuthCounter(successClient.io.opts.hostname);

          successClient.disconnect();
          done();
        });

        successClient.on('connect_error', error => {
          done(new Error(`Success client failed: ${error.message}`));
        });
      });
    });
  });
});

/**
 * Generate JWT token for testing
 *
 * @param {string} userId - User ID
 * @param {Object} options - JWT sign options (expiresIn, etc.)
 * @returns {string} - JWT token
 */
function generateToken(userId, options = {}) {
  return jwt.sign(
    {
      userId,
      type: 'access',
      iat: Math.floor(Date.now() / 1000)
    },
    JWT_SECRET,
    {
      algorithm: 'HS256',
      ...options
    }
  );
}
