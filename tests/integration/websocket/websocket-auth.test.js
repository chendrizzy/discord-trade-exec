/**
 * US3-T30: WebSocket Integration Tests
 * Integration tests for session-based WebSocket authentication
 *
 * Acceptance Criteria:
 * - Test WebSocket authentication flow
 * - Test WebSocket authorization
 * - Test WebSocket reconnection
 * - Test WebSocket message validation
 * - 4 new tests, all passing
 */

const { io: ioClient } = require('socket.io-client');
const { createServer } = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
}));

const {
  createAuthMiddleware,
  requireAdmin,
  requireSubscriptionTier
} = require('../../../src/services/websocket/middleware/auth');

// Test configuration
const TEST_PORT = 4002;
const SOCKET_URL = `http://localhost:${TEST_PORT}`;

// Mock MongoDB sessions collection
let mockSessionsCollection;
let mockUserModel;

describe('US3-T30: WebSocket Session-Based Authentication', () => {
  let httpServer;
  let socketServer;
  let mockDb;

  beforeAll(() => {
    // Mock mongoose connection
    mockSessionsCollection = {
      findOne: jest.fn()
    };

    mockDb = {
      collection: jest.fn(() => mockSessionsCollection)
    };

    // Mock mongoose.connection
    Object.defineProperty(mongoose.connection, 'db', {
      get: jest.fn(() => mockDb),
      configurable: true
    });

    // Create mock User model
    mockUserModel = {
      findById: jest.fn()
    };

    // Mock mongoose.model for subscription checks
    mongoose.model = jest.fn(modelName => {
      if (modelName === 'User') {
        return mockUserModel;
      }
      return null;
    });
  });

  beforeEach(done => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create HTTP server
    httpServer = createServer();

    // Create Socket.IO server
    socketServer = new Server(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });

    // Start server
    httpServer.listen(TEST_PORT, done);
  });

  afterEach(done => {
    socketServer.close();
    httpServer.close(done);
  });

  describe('WebSocket Authentication Flow', () => {
    it('should authenticate valid session and attach user data', done => {
      const sessionID = 'test-session-id-123';
      const userId = 'user-id-456';
      const userName = 'testuser';

      // Mock valid session in MongoDB
      mockSessionsCollection.findOne.mockResolvedValue({
        _id: sessionID,
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000), // Expires tomorrow
        session: JSON.stringify({
          passport: {
            user: {
              _id: userId,
              username: userName,
              email: 'test@example.com',
              isAdmin: false
            }
          }
        })
      });

      // Apply auth middleware
      const authMiddleware = createAuthMiddleware({ required: true });
      socketServer.use(authMiddleware);

      // Connection handler
      socketServer.on('connection', socket => {
        expect(socket.handshake.auth.authenticated).toBe(true);
        expect(socket.handshake.auth.userId).toBe(userId);
        expect(socket.handshake.auth.userName).toBe(userName);
        expect(socket.handshake.auth.isAdmin).toBe(false);

        socket.emit('auth-success', {
          userId: socket.handshake.auth.userId,
          userName: socket.handshake.auth.userName
        });
      });

      // Connect client
      const client = ioClient(SOCKET_URL, {
        auth: { sessionID, userId },
        transports: ['websocket']
      });

      client.on('auth-success', data => {
        expect(data.userId).toBe(userId);
        expect(data.userName).toBe(userName);
        client.disconnect();
        done();
      });

      client.on('connect_error', error => {
        done(new Error(`Connection failed: ${error.message}`));
      });
    });

    it('should reject connection with invalid session', done => {
      const sessionID = 'invalid-session-id';
      const userId = 'user-id-789';

      // Mock session not found
      mockSessionsCollection.findOne.mockResolvedValue(null);

      // Apply auth middleware
      const authMiddleware = createAuthMiddleware({ required: true });
      socketServer.use(authMiddleware);

      socketServer.on('connection', () => {
        done(new Error('Should not allow connection with invalid session'));
      });

      // Connect client
      const client = ioClient(SOCKET_URL, {
        auth: { sessionID, userId },
        transports: ['websocket']
      });

      client.on('connect_error', error => {
        expect(error.message).toContain('Invalid or expired session');
        expect(error.data.code).toBe('INVALID_SESSION');
        client.disconnect();
        done();
      });

      client.on('connect', () => {
        done(new Error('Should not connect with invalid session'));
      });
    });

    it('should reject connection with expired session', done => {
      const sessionID = 'expired-session-id';
      const userId = 'user-id-expired';

      // Mock expired session
      mockSessionsCollection.findOne.mockResolvedValue({
        _id: sessionID,
        expires: new Date(Date.now() - 24 * 60 * 60 * 1000), // Expired yesterday
        session: JSON.stringify({
          passport: {
            user: {
              _id: userId,
              username: 'expireduser'
            }
          }
        })
      });

      // Apply auth middleware
      const authMiddleware = createAuthMiddleware({ required: true });
      socketServer.use(authMiddleware);

      socketServer.on('connection', () => {
        done(new Error('Should not allow connection with expired session'));
      });

      // Connect client
      const client = ioClient(SOCKET_URL, {
        auth: { sessionID, userId },
        transports: ['websocket']
      });

      client.on('connect_error', error => {
        expect(error.message).toContain('Session expired');
        expect(error.data.code).toBe('SESSION_EXPIRED');
        client.disconnect();
        done();
      });

      client.on('connect', () => {
        done(new Error('Should not connect with expired session'));
      });
    });

    it('should reject connection with user ID mismatch', done => {
      const sessionID = 'session-mismatch';
      const providedUserId = 'user-provided-123';
      const sessionUserId = 'user-session-456';

      // Mock session with different user ID
      mockSessionsCollection.findOne.mockResolvedValue({
        _id: sessionID,
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
        session: JSON.stringify({
          passport: {
            user: {
              _id: sessionUserId,
              username: 'differentuser'
            }
          }
        })
      });

      // Apply auth middleware
      const authMiddleware = createAuthMiddleware({ required: true });
      socketServer.use(authMiddleware);

      socketServer.on('connection', () => {
        done(new Error('Should not allow connection with user ID mismatch'));
      });

      // Connect client with mismatched userId
      const client = ioClient(SOCKET_URL, {
        auth: { sessionID, userId: providedUserId },
        transports: ['websocket']
      });

      client.on('connect_error', error => {
        expect(error.message).toContain('User ID mismatch');
        expect(error.data.code).toBe('USER_MISMATCH');
        client.disconnect();
        done();
      });

      client.on('connect', () => {
        done(new Error('Should not connect with mismatched user ID'));
      });
    });

    it('should allow anonymous connections when not required', done => {
      // Apply auth middleware with required: false
      const authMiddleware = createAuthMiddleware({ required: false });
      socketServer.use(authMiddleware);

      socketServer.on('connection', socket => {
        expect(socket.handshake.auth.anonymous).toBe(true);
        socket.emit('connected');
      });

      // Connect client without session
      const client = ioClient(SOCKET_URL, {
        transports: ['websocket']
      });

      client.on('connected', () => {
        client.disconnect();
        done();
      });

      client.on('connect_error', error => {
        done(new Error(`Should allow anonymous connection: ${error.message}`));
      });
    });
  });

  describe('WebSocket Authorization', () => {
    it('should enforce admin authorization with requireAdmin middleware', done => {
      const sessionID = 'session-non-admin';
      const userId = 'user-non-admin';

      // Mock non-admin session
      mockSessionsCollection.findOne.mockResolvedValue({
        _id: sessionID,
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
        session: JSON.stringify({
          passport: {
            user: {
              _id: userId,
              username: 'regularuser',
              isAdmin: false
            }
          }
        })
      });

      // Apply auth + admin middleware
      const authMiddleware = createAuthMiddleware({ required: true });
      socketServer.use(authMiddleware);
      socketServer.use(requireAdmin());

      socketServer.on('connection', () => {
        done(new Error('Should not allow non-admin connection'));
      });

      // Connect non-admin client
      const client = ioClient(SOCKET_URL, {
        auth: { sessionID, userId },
        transports: ['websocket']
      });

      client.on('connect_error', error => {
        expect(error.message).toContain('Admin access required');
        expect(error.data.code).toBe('FORBIDDEN');
        client.disconnect();
        done();
      });

      client.on('connect', () => {
        done(new Error('Should not connect without admin access'));
      });
    });

    it('should allow admin users with requireAdmin middleware', done => {
      const sessionID = 'session-admin';
      const userId = 'user-admin-123';

      // Mock admin session
      mockSessionsCollection.findOne.mockResolvedValue({
        _id: sessionID,
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
        session: JSON.stringify({
          passport: {
            user: {
              _id: userId,
              username: 'adminuser',
              isAdmin: true
            }
          }
        })
      });

      // Apply auth + admin middleware
      const authMiddleware = createAuthMiddleware({ required: true });
      socketServer.use(authMiddleware);
      socketServer.use(requireAdmin());

      socketServer.on('connection', socket => {
        expect(socket.handshake.auth.isAdmin).toBe(true);
        socket.emit('admin-connected');
      });

      // Connect admin client
      const client = ioClient(SOCKET_URL, {
        auth: { sessionID, userId },
        transports: ['websocket']
      });

      client.on('admin-connected', () => {
        client.disconnect();
        done();
      });

      client.on('connect_error', error => {
        done(new Error(`Admin connection failed: ${error.message}`));
      });
    });

    it('should enforce subscription tier authorization', done => {
      const sessionID = 'session-free-tier';
      const userId = 'user-free-tier';

      // Mock free-tier user session
      mockSessionsCollection.findOne.mockResolvedValue({
        _id: sessionID,
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
        session: JSON.stringify({
          passport: {
            user: {
              _id: userId,
              username: 'freeuser'
            }
          }
        })
      });

      // Mock User model with chainable select() method
      const mockSelectResult = Promise.resolve({
        _id: userId,
        subscription: {
          tier: 'free'
        }
      });

      mockUserModel.findById.mockReturnValue({
        select: jest.fn(() => mockSelectResult)
      });

      // Apply auth + subscription middleware (require premium)
      const authMiddleware = createAuthMiddleware({ required: true });
      socketServer.use(authMiddleware);
      socketServer.use(requireSubscriptionTier(['premium', 'enterprise']));

      socketServer.on('connection', () => {
        done(new Error('Should not allow free-tier connection to premium feature'));
      });

      // Connect free-tier client
      const client = ioClient(SOCKET_URL, {
        auth: { sessionID, userId },
        transports: ['websocket']
      });

      client.on('connect_error', error => {
        expect(error.message).toContain('premium, enterprise');
        expect(error.data.code).toBe('SUBSCRIPTION_REQUIRED');
        expect(error.data.userTier).toBe('free');
        client.disconnect();
        done();
      });

      client.on('connect', () => {
        done(new Error('Should not connect with insufficient subscription tier'));
      });
    });

    it('should allow premium users to connect to premium features', done => {
      const sessionID = 'session-premium';
      const userId = 'user-premium-123';

      // Mock premium user session
      mockSessionsCollection.findOne.mockResolvedValue({
        _id: sessionID,
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
        session: JSON.stringify({
          passport: {
            user: {
              _id: userId,
              username: 'premiumuser'
            }
          }
        })
      });

      // Mock User model with chainable select() method
      const mockSelectResult = Promise.resolve({
        _id: userId,
        subscription: {
          tier: 'premium'
        }
      });

      mockUserModel.findById.mockReturnValue({
        select: jest.fn(() => mockSelectResult)
      });

      // Apply auth + subscription middleware
      const authMiddleware = createAuthMiddleware({ required: true });
      socketServer.use(authMiddleware);
      socketServer.use(requireSubscriptionTier(['premium', 'enterprise']));

      socketServer.on('connection', socket => {
        expect(socket.handshake.auth.subscriptionTier).toBe('premium');
        socket.emit('premium-connected');
      });

      // Connect premium client
      const client = ioClient(SOCKET_URL, {
        auth: { sessionID, userId },
        transports: ['websocket']
      });

      client.on('premium-connected', () => {
        client.disconnect();
        done();
      });

      client.on('connect_error', error => {
        done(new Error(`Premium connection failed: ${error.message}`));
      });
    });
  });

  describe('WebSocket Reconnection', () => {
    it('should handle reconnection with same session', done => {
      const sessionID = 'session-reconnect';
      const userId = 'user-reconnect-123';

      // Mock valid session
      mockSessionsCollection.findOne.mockResolvedValue({
        _id: sessionID,
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
        session: JSON.stringify({
          passport: {
            user: {
              _id: userId,
              username: 'reconnectuser'
            }
          }
        })
      });

      // Apply auth middleware
      const authMiddleware = createAuthMiddleware({ required: true });
      socketServer.use(authMiddleware);

      let connectionCount = 0;

      socketServer.on('connection', socket => {
        connectionCount++;

        if (connectionCount === 1) {
          // First connection
          socket.emit('first-connect', { count: connectionCount });
        } else if (connectionCount === 2) {
          // Reconnection
          socket.emit('reconnected', { count: connectionCount });
        }
      });

      // Connect client
      const client = ioClient(SOCKET_URL, {
        auth: { sessionID, userId },
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 100
      });

      client.on('first-connect', data => {
        expect(data.count).toBe(1);

        // Simulate disconnect and reconnect
        client.disconnect();

        setTimeout(() => {
          client.connect();
        }, 200);
      });

      client.on('reconnected', data => {
        expect(data.count).toBe(2);
        expect(mockSessionsCollection.findOne).toHaveBeenCalledTimes(2);
        client.disconnect();
        done();
      });

      client.on('connect_error', error => {
        done(new Error(`Reconnection failed: ${error.message}`));
      });
    });

    it('should reject reconnection with expired session', done => {
      const sessionID = 'session-expire-on-reconnect';
      const userId = 'user-expire-reconnect';

      let sessionExpired = false;

      // Mock session that expires during test
      mockSessionsCollection.findOne.mockImplementation(() => {
        if (!sessionExpired) {
          return Promise.resolve({
            _id: sessionID,
            expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
            session: JSON.stringify({
              passport: {
                user: {
                  _id: userId,
                  username: 'expireuser'
                }
              }
            })
          });
        } else {
          // Session expired on reconnection
          return Promise.resolve({
            _id: sessionID,
            expires: new Date(Date.now() - 1000), // Expired 1 second ago
            session: JSON.stringify({
              passport: {
                user: {
                  _id: userId,
                  username: 'expireuser'
                }
              }
            })
          });
        }
      });

      // Apply auth middleware
      const authMiddleware = createAuthMiddleware({ required: true });
      socketServer.use(authMiddleware);

      socketServer.on('connection', socket => {
        socket.emit('connected');
      });

      // Connect client
      const client = ioClient(SOCKET_URL, {
        auth: { sessionID, userId },
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 100
      });

      client.on('connected', () => {
        // Expire session and disconnect
        sessionExpired = true;
        client.disconnect();

        setTimeout(() => {
          client.connect();
        }, 200);
      });

      client.on('connect_error', error => {
        if (sessionExpired) {
          expect(error.message).toContain('Session expired');
          client.disconnect();
          done();
        }
      });
    });
  });

  describe('WebSocket Message Validation', () => {
    it('should handle valid authenticated messages', done => {
      const sessionID = 'session-messages';
      const userId = 'user-messages-123';

      // Mock valid session
      mockSessionsCollection.findOne.mockResolvedValue({
        _id: sessionID,
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
        session: JSON.stringify({
          passport: {
            user: {
              _id: userId,
              username: 'messageuser'
            }
          }
        })
      });

      // Apply auth middleware
      const authMiddleware = createAuthMiddleware({ required: true });
      socketServer.use(authMiddleware);

      socketServer.on('connection', socket => {
        // Message handler with validation
        socket.on('test-message', (data, callback) => {
          // Validate message structure
          if (!data || typeof data !== 'object') {
            return callback({ error: 'Invalid message format' });
          }

          if (!data.action) {
            return callback({ error: 'Missing action field' });
          }

          // Process valid message
          callback({
            success: true,
            userId: socket.handshake.auth.userId,
            receivedAction: data.action
          });
        });
      });

      // Connect client
      const client = ioClient(SOCKET_URL, {
        auth: { sessionID, userId },
        transports: ['websocket']
      });

      client.on('connect', () => {
        // Send valid message
        client.emit('test-message', { action: 'test-action', payload: { key: 'value' } }, response => {
          expect(response.success).toBe(true);
          expect(response.userId).toBe(userId);
          expect(response.receivedAction).toBe('test-action');
          client.disconnect();
          done();
        });
      });

      client.on('connect_error', error => {
        done(new Error(`Connection failed: ${error.message}`));
      });
    });

    it('should reject invalid message formats', done => {
      const sessionID = 'session-invalid-messages';
      const userId = 'user-invalid-messages';

      // Mock valid session
      mockSessionsCollection.findOne.mockResolvedValue({
        _id: sessionID,
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
        session: JSON.stringify({
          passport: {
            user: {
              _id: userId,
              username: 'invalidmsguser'
            }
          }
        })
      });

      // Apply auth middleware
      const authMiddleware = createAuthMiddleware({ required: true });
      socketServer.use(authMiddleware);

      socketServer.on('connection', socket => {
        socket.on('test-message', (data, callback) => {
          if (!data || typeof data !== 'object') {
            return callback({ error: 'Invalid message format' });
          }

          if (!data.action) {
            return callback({ error: 'Missing action field' });
          }

          callback({ success: true });
        });
      });

      // Connect client
      const client = ioClient(SOCKET_URL, {
        auth: { sessionID, userId },
        transports: ['websocket']
      });

      client.on('connect', () => {
        // Send invalid message (missing action)
        client.emit('test-message', { payload: { key: 'value' } }, response => {
          expect(response.error).toBe('Missing action field');
          client.disconnect();
          done();
        });
      });

      client.on('connect_error', error => {
        done(new Error(`Connection failed: ${error.message}`));
      });
    });

    it('should handle message rate limiting per user', done => {
      const sessionID = 'session-rate-limit';
      const userId = 'user-rate-limit-123';

      // Mock valid session
      mockSessionsCollection.findOne.mockResolvedValue({
        _id: sessionID,
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
        session: JSON.stringify({
          passport: {
            user: {
              _id: userId,
              username: 'ratelimituser'
            }
          }
        })
      });

      // Apply auth middleware
      const authMiddleware = createAuthMiddleware({ required: true });
      socketServer.use(authMiddleware);

      const messageTracker = new Map();
      const MAX_MESSAGES_PER_SECOND = 5;

      socketServer.on('connection', socket => {
        socket.on('rapid-message', (data, callback) => {
          const now = Date.now();
          const windowStart = now - 1000;
          const userId = socket.handshake.auth.userId;

          if (!messageTracker.has(userId)) {
            messageTracker.set(userId, []);
          }

          const userMessages = messageTracker.get(userId);

          // Remove old messages outside window
          const recentMessages = userMessages.filter(timestamp => timestamp > windowStart);
          messageTracker.set(userId, recentMessages);

          if (recentMessages.length >= MAX_MESSAGES_PER_SECOND) {
            return callback({
              error: 'Rate limit exceeded',
              code: 'RATE_LIMIT',
              retryAfter: 1000
            });
          }

          // Record message
          recentMessages.push(now);
          callback({ success: true, messagesInWindow: recentMessages.length });
        });
      });

      // Connect client
      const client = ioClient(SOCKET_URL, {
        auth: { sessionID, userId },
        transports: ['websocket']
      });

      client.on('connect', () => {
        let successCount = 0;
        let rateLimitHit = false;

        // Send 7 rapid messages (exceeding limit of 5)
        for (let i = 0; i < 7; i++) {
          client.emit('rapid-message', { count: i }, response => {
            if (response.success) {
              successCount++;
            } else if (response.code === 'RATE_LIMIT') {
              rateLimitHit = true;
            }

            // After all messages processed
            if (successCount + (rateLimitHit ? 2 : 0) === 7) {
              expect(successCount).toBe(5);
              expect(rateLimitHit).toBe(true);
              client.disconnect();
              done();
            }
          });
        }
      });

      client.on('connect_error', error => {
        done(new Error(`Connection failed: ${error.message}`));
      });
    });
  });
});
