/**
 * Unit Tests for WebSocket Authentication Middleware
 * Tests session-based authentication against MongoDB
 */

// Mock logger before importing modules
jest.mock('../../../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn()
}));

const mongoose = require('mongoose');
const { createAuthMiddleware, requireAdmin, requireSubscriptionTier } = require('../../../src/services/websocket/middleware/auth');

describe('WebSocket Authentication Middleware', () => {
  let mockSocket;
  let mockNext;
  let mockDb;
  let mockSessionsCollection;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock socket
    mockSocket = {
      id: 'socket-123',
      handshake: {
        auth: {
          sessionID: 'session-789',
          userId: 'user-456'
        },
        session: null
      }
    };

    // Mock next callback
    mockNext = jest.fn();

    // Mock sessions collection
    mockSessionsCollection = {
      findOne: jest.fn()
    };

    // Mock MongoDB connection
    mockDb = {
      collection: jest.fn().mockReturnValue(mockSessionsCollection)
    };

    // Mock mongoose connection
    mongoose.connection = {
      db: mockDb
    };
  });

  afterEach(() => {
    delete mongoose.connection.db;
  });

  describe('createAuthMiddleware()', () => {
    describe('Successful Authentication', () => {
      test('should authenticate valid session with user data', async () => {
        const validSession = {
          _id: 'session-789',
          expires: new Date(Date.now() + 3600000), // 1 hour from now
          session: JSON.stringify({
            passport: {
              user: {
                _id: 'user-456',
                username: 'testuser',
                email: 'test@example.com',
                isAdmin: false
              }
            }
          })
        };

        mockSessionsCollection.findOne.mockResolvedValue(validSession);

        const authMiddleware = createAuthMiddleware();
        await authMiddleware(mockSocket, mockNext);

        expect(mockSessionsCollection.findOne).toHaveBeenCalledWith({ _id: 'session-789' });
        expect(mockSocket.handshake.auth.userId).toBe('user-456');
        expect(mockSocket.handshake.auth.userName).toBe('testuser');
        expect(mockSocket.handshake.auth.userEmail).toBe('test@example.com');
        expect(mockSocket.handshake.auth.isAdmin).toBe(false);
        expect(mockSocket.handshake.auth.authenticated).toBe(true);
        expect(mockNext).toHaveBeenCalledWith();
      });

      test('should handle session data as object (non-stringified)', async () => {
        const validSession = {
          _id: 'session-789',
          expires: new Date(Date.now() + 3600000),
          session: { // Not stringified
            passport: {
              user: {
                _id: 'user-456',
                username: 'testuser'
              }
            }
          }
        };

        mockSessionsCollection.findOne.mockResolvedValue(validSession);

        const authMiddleware = createAuthMiddleware();
        await authMiddleware(mockSocket, mockNext);

        expect(mockSocket.handshake.auth.userId).toBe('user-456');
        expect(mockSocket.handshake.auth.authenticated).toBe(true);
        expect(mockNext).toHaveBeenCalledWith();
      });

      test('should use user.id if _id not available', async () => {
        const validSession = {
          _id: 'session-789',
          expires: new Date(Date.now() + 3600000),
          session: JSON.stringify({
            passport: {
              user: {
                id: 'user-456', // Using id instead of _id
                username: 'testuser'
              }
            }
          })
        };

        mockSessionsCollection.findOne.mockResolvedValue(validSession);

        const authMiddleware = createAuthMiddleware();
        await authMiddleware(mockSocket, mockNext);

        expect(mockSocket.handshake.auth.userId).toBe('user-456');
        expect(mockNext).toHaveBeenCalledWith();
      });

      test('should use default userName if not provided', async () => {
        const validSession = {
          _id: 'session-789',
          expires: new Date(Date.now() + 3600000),
          session: JSON.stringify({
            passport: {
              user: {
                _id: 'user-456'
                // No username or name
              }
            }
          })
        };

        mockSessionsCollection.findOne.mockResolvedValue(validSession);

        const authMiddleware = createAuthMiddleware();
        await authMiddleware(mockSocket, mockNext);

        expect(mockSocket.handshake.auth.userName).toBe('User');
      });

      test('should use custom session collection name', async () => {
        const validSession = {
          _id: 'session-789',
          expires: new Date(Date.now() + 3600000),
          session: JSON.stringify({
            passport: {
              user: { _id: 'user-456' }
            }
          })
        };

        mockSessionsCollection.findOne.mockResolvedValue(validSession);

        const authMiddleware = createAuthMiddleware({
          sessionCollectionName: 'custom_sessions'
        });

        await authMiddleware(mockSocket, mockNext);

        expect(mockDb.collection).toHaveBeenCalledWith('custom_sessions');
      });
    });

    describe('Authentication Failures', () => {
      test('should reject connection without sessionID', async () => {
        mockSocket.handshake.auth = {}; // No sessionID

        const authMiddleware = createAuthMiddleware();
        await authMiddleware(mockSocket, mockNext);

        expect(mockNext).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Authentication required: No session ID provided',
            data: { code: 'NO_SESSION_ID' }
          })
        );
      });

      test('should reject connection with invalid session', async () => {
        mockSessionsCollection.findOne.mockResolvedValue(null);

        const authMiddleware = createAuthMiddleware();
        await authMiddleware(mockSocket, mockNext);

        expect(mockNext).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Invalid or expired session',
            data: { code: 'INVALID_SESSION' }
          })
        );
      });

      test('should reject expired session', async () => {
        const expiredSession = {
          _id: 'session-789',
          expires: new Date(Date.now() - 3600000), // 1 hour ago
          session: JSON.stringify({
            passport: {
              user: { _id: 'user-456' }
            }
          })
        };

        mockSessionsCollection.findOne.mockResolvedValue(expiredSession);

        const authMiddleware = createAuthMiddleware();
        await authMiddleware(mockSocket, mockNext);

        expect(mockNext).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Session expired',
            data: { code: 'SESSION_EXPIRED' }
          })
        );
      });

      test('should reject session without user data', async () => {
        const invalidSession = {
          _id: 'session-789',
          expires: new Date(Date.now() + 3600000),
          session: JSON.stringify({
            // No passport.user
            someOtherData: 'value'
          })
        };

        mockSessionsCollection.findOne.mockResolvedValue(invalidSession);

        const authMiddleware = createAuthMiddleware();
        await authMiddleware(mockSocket, mockNext);

        expect(mockNext).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'No user data in session',
            data: { code: 'NO_USER_DATA' }
          })
        );
      });

      test('should reject session with mismatched userId', async () => {
        const validSession = {
          _id: 'session-789',
          expires: new Date(Date.now() + 3600000),
          session: JSON.stringify({
            passport: {
              user: {
                _id: 'different-user-id' // Doesn't match socket.handshake.auth.userId
              }
            }
          })
        };

        mockSessionsCollection.findOne.mockResolvedValue(validSession);

        const authMiddleware = createAuthMiddleware();
        await authMiddleware(mockSocket, mockNext);

        expect(mockNext).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'User ID mismatch',
            data: { code: 'USER_MISMATCH' }
          })
        );
      });

      test('should handle database connection error', async () => {
        mongoose.connection.db = null; // No database connection

        const authMiddleware = createAuthMiddleware();
        await authMiddleware(mockSocket, mockNext);

        expect(mockNext).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Database connection not available',
            data: { code: 'DATABASE_ERROR' }
          })
        );
      });

      test('should handle session parse error', async () => {
        const invalidSession = {
          _id: 'session-789',
          expires: new Date(Date.now() + 3600000),
          session: 'invalid-json-{{{' // Invalid JSON
        };

        mockSessionsCollection.findOne.mockResolvedValue(invalidSession);

        const authMiddleware = createAuthMiddleware();
        await authMiddleware(mockSocket, mockNext);

        expect(mockNext).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Failed to parse session data',
            data: { code: 'PARSE_ERROR' }
          })
        );
      });

      test('should handle unexpected errors', async () => {
        mockSessionsCollection.findOne.mockRejectedValue(new Error('Database error'));

        const authMiddleware = createAuthMiddleware();
        await authMiddleware(mockSocket, mockNext);

        expect(mockNext).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Authentication failed',
            data: expect.objectContaining({
              code: 'AUTH_ERROR'
            })
          })
        );
      });
    });

    describe('Optional Authentication', () => {
      test('should allow anonymous connections when required=false', async () => {
        mockSocket.handshake.auth = {}; // No sessionID

        const authMiddleware = createAuthMiddleware({ required: false });
        await authMiddleware(mockSocket, mockNext);

        expect(mockSocket.handshake.auth.anonymous).toBe(true);
        expect(mockNext).toHaveBeenCalledWith();
      });

      test('should still validate session when sessionID provided and required=false', async () => {
        const validSession = {
          _id: 'session-789',
          expires: new Date(Date.now() + 3600000),
          session: JSON.stringify({
            passport: {
              user: { _id: 'user-456' }
            }
          })
        };

        mockSessionsCollection.findOne.mockResolvedValue(validSession);

        const authMiddleware = createAuthMiddleware({ required: false });
        await authMiddleware(mockSocket, mockNext);

        expect(mockSocket.handshake.auth.userId).toBe('user-456');
        expect(mockSocket.handshake.auth.authenticated).toBe(true);
        expect(mockNext).toHaveBeenCalledWith();
      });
    });
  });

  describe('requireAdmin()', () => {
    test('should allow admin users', () => {
      mockSocket.handshake.auth = {
        authenticated: true,
        isAdmin: true,
        userId: 'admin-123'
      };

      const middleware = requireAdmin();
      middleware(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    test('should reject non-admin users', () => {
      mockSocket.handshake.auth = {
        authenticated: true,
        isAdmin: false,
        userId: 'user-456'
      };

      const middleware = requireAdmin();
      middleware(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Admin access required',
          data: { code: 'FORBIDDEN' }
        })
      );
    });

    test('should reject unauthenticated users', () => {
      mockSocket.handshake.auth = {};

      const middleware = requireAdmin();
      middleware(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Not authenticated',
          data: { code: 'NOT_AUTHENTICATED' }
        })
      );
    });
  });

  describe('requireSubscriptionTier()', () => {
    let User;

    beforeEach(() => {
      // Mock User model
      User = {
        findById: jest.fn()
      };

      mongoose.model = jest.fn((modelName) => {
        if (modelName === 'User') return User;
      });

      mockSocket.handshake.auth = {
        authenticated: true,
        userId: 'user-456'
      };
    });

    test('should allow user with correct subscription tier', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          subscription: {
            tier: 'premium'
          }
        })
      });

      const middleware = requireSubscriptionTier(['premium', 'enterprise']);
      await middleware(mockSocket, mockNext);

      expect(mockSocket.handshake.auth.subscriptionTier).toBe('premium');
      expect(mockNext).toHaveBeenCalledWith();
    });

    test('should allow user with enterprise tier when premium required', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          subscription: {
            tier: 'enterprise'
          }
        })
      });

      const middleware = requireSubscriptionTier(['premium', 'enterprise']);
      await middleware(mockSocket, mockNext);

      expect(mockSocket.handshake.auth.subscriptionTier).toBe('enterprise');
      expect(mockNext).toHaveBeenCalledWith();
    });

    test('should reject user with insufficient subscription tier', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          subscription: {
            tier: 'free'
          }
        })
      });

      const middleware = requireSubscriptionTier(['premium']);
      await middleware(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Access restricted to premium subscribers',
          data: expect.objectContaining({
            code: 'SUBSCRIPTION_REQUIRED',
            userTier: 'free',
            requiredTiers: ['premium']
          })
        })
      );
    });

    test('should default to free tier if no subscription', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          // No subscription field
        })
      });

      const middleware = requireSubscriptionTier(['premium']);
      await middleware(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userTier: 'free'
          })
        })
      );
    });

    test('should reject unauthenticated users', async () => {
      mockSocket.handshake.auth = {};

      const middleware = requireSubscriptionTier(['premium']);
      await middleware(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Not authenticated',
          data: { code: 'NOT_AUTHENTICATED' }
        })
      );
    });

    test('should reject when user not found', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(null)
      });

      const middleware = requireSubscriptionTier(['premium']);
      await middleware(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'User not found',
          data: { code: 'USER_NOT_FOUND' }
        })
      );
    });

    test('should handle database errors gracefully', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockRejectedValue(new Error('Database error'))
      });

      const middleware = requireSubscriptionTier(['premium']);
      await middleware(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Subscription validation failed',
          data: { code: 'SUBSCRIPTION_ERROR' }
        })
      );
    });
  });
});
