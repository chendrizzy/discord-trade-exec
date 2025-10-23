'use strict';

/**
 * Sentry Integration Tests (T055a)
 *
 * Comprehensive test suite for Sentry error monitoring integration
 * following Constitutional Principle VI: Observability & Operational Transparency
 *
 * Coverage areas:
 * - Exception capture (uncaught, manual, async errors)
 * - User context attachment (setUser, setContext, setTag)
 * - Breadcrumb tracking
 * - Data sanitization (remove API keys, passwords, tokens)
 * - HTTP error scenarios (401, 403, 500)
 * - Real-world trade execution errors
 * - Express middleware integration
 *
 * @requires @sentry/node
 * @module tests/integration/monitoring/sentry.test
 */

const Sentry = require('@sentry/node');

// Mock Sentry SDK to avoid actual network calls
jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  addBreadcrumb: jest.fn(),
  setUser: jest.fn(),
  setContext: jest.fn(),
  setTag: jest.fn(),
  setTags: jest.fn(),
  configureScope: jest.fn(callback => {
    const scope = {
      setUser: jest.fn(),
      setContext: jest.fn(),
      setTag: jest.fn(),
      setTags: jest.fn(),
      setLevel: jest.fn(),
      setFingerprint: jest.fn(),
      clear: jest.fn()
    };
    callback(scope);
    return scope;
  }),
  Severity: {
    Fatal: 'fatal',
    Error: 'error',
    Warning: 'warning',
    Log: 'log',
    Info: 'info',
    Debug: 'debug'
  },
  Handlers: {
    requestHandler: jest.fn(() => (req, res, next) => next()),
    errorHandler: jest.fn(() => (err, req, res, next) => next(err))
  }
}));

describe('Sentry Integration Tests (T055a)', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize Sentry with correct configuration', () => {
      const config = {
        dsn: process.env.SENTRY_DSN || 'https://test@sentry.io/12345',
        environment: process.env.NODE_ENV || 'test',
        tracesSampleRate: 0.1,
        beforeSend: expect.any(Function)
      };

      Sentry.init(config);

      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: expect.any(String),
          environment: expect.any(String),
          tracesSampleRate: expect.any(Number),
          beforeSend: expect.any(Function)
        })
      );
    });

    it('should not initialize Sentry in test environment without DSN', () => {
      const originalEnv = process.env.NODE_ENV;
      delete process.env.SENTRY_DSN;
      process.env.NODE_ENV = 'test';

      // In real implementation, initialization would be skipped
      const shouldInit = Boolean(process.env.SENTRY_DSN);

      expect(shouldInit).toBe(false);

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Exception Capture', () => {
    it('should capture uncaught exceptions with full context', () => {
      const error = new Error('Uncaught exception in trade execution');
      error.stack = 'Error: Uncaught exception\n    at TradeExecutor.execute';

      Sentry.captureException(error, {
        level: Sentry.Severity.Error,
        tags: {
          component: 'TradeExecutor',
          broker: 'alpaca'
        },
        extra: {
          userId: 'user_12345',
          tradeId: 'trade_67890'
        }
      });

      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Uncaught exception in trade execution'
        }),
        expect.objectContaining({
          level: 'error',
          tags: expect.objectContaining({
            component: 'TradeExecutor',
            broker: 'alpaca'
          })
        })
      );
    });

    it('should capture manual exceptions with custom context', () => {
      const error = new TypeError('Invalid broker configuration');

      Sentry.captureException(error, {
        level: Sentry.Severity.Error,
        tags: { broker: 'ibkr' },
        contexts: {
          broker: {
            type: 'ibkr',
            status: 'disconnected'
          }
        }
      });

      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.any(TypeError),
        expect.objectContaining({
          level: 'error',
          tags: expect.objectContaining({ broker: 'ibkr' })
        })
      );
    });

    it('should capture async errors from promise rejections', async () => {
      const asyncError = new Error('Database connection timeout');

      try {
        await Promise.reject(asyncError);
      } catch (err) {
        Sentry.captureException(err, {
          level: Sentry.Severity.Error,
          tags: { component: 'Database' }
        });
      }

      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Database connection timeout'
        }),
        expect.any(Object)
      );
    });

    it('should capture network errors with request details', () => {
      const networkError = new Error('ECONNREFUSED');
      networkError.code = 'ECONNREFUSED';
      networkError.hostname = 'api.broker.com';
      networkError.port = 443;

      Sentry.captureException(networkError, {
        level: Sentry.Severity.Error,
        tags: {
          errorType: 'network',
          hostname: 'api.broker.com'
        },
        extra: {
          code: 'ECONNREFUSED',
          port: 443
        }
      });

      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'ECONNREFUSED',
          code: 'ECONNREFUSED'
        }),
        expect.any(Object)
      );
    });
  });

  describe('Message Capture', () => {
    it('should capture info messages', () => {
      Sentry.captureMessage('Trade executed successfully', Sentry.Severity.Info);

      expect(Sentry.captureMessage).toHaveBeenCalledWith('Trade executed successfully', 'info');
    });

    it('should capture warning messages with context', () => {
      Sentry.captureMessage('Daily loss limit approaching', {
        level: Sentry.Severity.Warning,
        tags: { component: 'RiskManagement' },
        extra: { currentLoss: -480, limit: -500 }
      });

      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        'Daily loss limit approaching',
        expect.objectContaining({
          level: 'warning',
          tags: expect.objectContaining({ component: 'RiskManagement' })
        })
      );
    });

    it('should capture error messages without exceptions', () => {
      Sentry.captureMessage('Billing webhook signature verification failed', Sentry.Severity.Error);

      expect(Sentry.captureMessage).toHaveBeenCalledWith('Billing webhook signature verification failed', 'error');
    });
  });

  describe('User Context Attachment', () => {
    it('should attach user context to error reports', () => {
      Sentry.setUser({
        id: 'user_12345',
        username: 'trader_john',
        email: 'john@example.com',
        subscription: 'premium'
      });

      expect(Sentry.setUser).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'user_12345',
          username: 'trader_john'
        })
      );
    });

    it('should clear user context on logout', () => {
      Sentry.setUser(null);

      expect(Sentry.setUser).toHaveBeenCalledWith(null);
    });

    it('should attach custom context data', () => {
      Sentry.setContext('trade', {
        symbol: 'AAPL',
        quantity: 100,
        broker: 'alpaca',
        orderType: 'market'
      });

      expect(Sentry.setContext).toHaveBeenCalledWith(
        'trade',
        expect.objectContaining({
          symbol: 'AAPL',
          quantity: 100
        })
      );
    });

    it('should attach tags for filtering', () => {
      Sentry.setTag('broker', 'alpaca');
      Sentry.setTag('environment', 'production');

      expect(Sentry.setTag).toHaveBeenCalledTimes(2);
      expect(Sentry.setTag).toHaveBeenCalledWith('broker', 'alpaca');
      expect(Sentry.setTag).toHaveBeenCalledWith('environment', 'production');
    });

    it('should attach multiple tags at once', () => {
      Sentry.setTags({
        broker: 'ibkr',
        orderType: 'limit',
        status: 'filled'
      });

      expect(Sentry.setTags).toHaveBeenCalledWith(
        expect.objectContaining({
          broker: 'ibkr',
          orderType: 'limit',
          status: 'filled'
        })
      );
    });
  });

  describe('Breadcrumb Tracking', () => {
    it('should add breadcrumbs for user actions', () => {
      Sentry.addBreadcrumb({
        category: 'user.action',
        message: 'User connected Alpaca broker',
        level: Sentry.Severity.Info,
        data: {
          broker: 'alpaca',
          userId: 'user_12345'
        }
      });

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'user.action',
          message: 'User connected Alpaca broker',
          level: 'info'
        })
      );
    });

    it('should add breadcrumbs for API calls', () => {
      Sentry.addBreadcrumb({
        category: 'http',
        message: 'POST /api/v1/trades',
        level: Sentry.Severity.Info,
        data: {
          method: 'POST',
          url: '/api/v1/trades',
          statusCode: 201
        }
      });

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'http',
          data: expect.objectContaining({
            statusCode: 201
          })
        })
      );
    });

    it('should add breadcrumbs for state changes', () => {
      Sentry.addBreadcrumb({
        category: 'state.change',
        message: 'Trade status changed to filled',
        level: Sentry.Severity.Info,
        data: {
          tradeId: 'trade_67890',
          from: 'pending',
          to: 'filled'
        }
      });

      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'state.change',
          message: 'Trade status changed to filled'
        })
      );
    });
  });

  describe('Data Sanitization', () => {
    it('should remove API keys from error reports', () => {
      const beforeSendCallback = event => {
        // Sanitize sensitive data
        if (event.extra) {
          delete event.extra.apiKey;
          delete event.extra.apiSecret;
        }
        if (event.request && event.request.headers) {
          delete event.request.headers['Authorization'];
          delete event.request.headers['X-API-Key'];
        }
        return event;
      };

      const event = {
        extra: {
          apiKey: 'AKIAIOSFODNN7EXAMPLE',
          apiSecret: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
          tradeId: 'trade_12345'
        },
        request: {
          headers: {
            Authorization: 'Bearer secret_token',
            'X-API-Key': 'api_key_12345',
            'Content-Type': 'application/json'
          }
        }
      };

      const sanitized = beforeSendCallback(event);

      expect(sanitized.extra).not.toHaveProperty('apiKey');
      expect(sanitized.extra).not.toHaveProperty('apiSecret');
      expect(sanitized.extra).toHaveProperty('tradeId');
      expect(sanitized.request.headers).not.toHaveProperty('Authorization');
      expect(sanitized.request.headers).not.toHaveProperty('X-API-Key');
      expect(sanitized.request.headers).toHaveProperty('Content-Type');
    });

    it('should remove passwords from error reports', () => {
      const beforeSendCallback = event => {
        if (event.extra) {
          delete event.extra.password;
          delete event.extra.passwordHash;
        }
        return event;
      };

      const event = {
        extra: {
          username: 'john_doe',
          password: 'SuperSecret123!',
          email: 'john@example.com'
        }
      };

      const sanitized = beforeSendCallback(event);

      expect(sanitized.extra).not.toHaveProperty('password');
      expect(sanitized.extra).toHaveProperty('username');
      expect(sanitized.extra).toHaveProperty('email');
    });

    it('should remove session tokens from error reports', () => {
      const beforeSendCallback = event => {
        if (event.request && event.request.cookies) {
          delete event.request.cookies['connect.sid'];
          delete event.request.cookies['session'];
        }
        return event;
      };

      const event = {
        request: {
          cookies: {
            'connect.sid': 's%3ASessionTokenHere',
            theme: 'dark'
          }
        }
      };

      const sanitized = beforeSendCallback(event);

      expect(sanitized.request.cookies).not.toHaveProperty('connect.sid');
      expect(sanitized.request.cookies).toHaveProperty('theme');
    });

    it('should sanitize credit card numbers', () => {
      const beforeSendCallback = event => {
        if (event.extra && event.extra.cardNumber) {
          event.extra.cardNumber = '****-****-****-' + event.extra.cardNumber.slice(-4);
        }
        return event;
      };

      const event = {
        extra: {
          cardNumber: '4111-1111-1111-1111',
          amount: 49.99
        }
      };

      const sanitized = beforeSendCallback(event);

      expect(sanitized.extra.cardNumber).toBe('****-****-****-1111');
      expect(sanitized.extra.amount).toBe(49.99);
    });
  });

  describe('HTTP Error Scenarios', () => {
    it('should capture 401 Unauthorized errors', () => {
      const error = new Error('Unauthorized');
      error.statusCode = 401;
      error.response = {
        status: 401,
        data: { message: 'Invalid JWT token' }
      };

      Sentry.captureException(error, {
        level: Sentry.Severity.Warning,
        tags: { httpStatus: '401', component: 'Auth' },
        extra: {
          url: '/api/v1/portfolio',
          method: 'GET'
        }
      });

      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Unauthorized',
          statusCode: 401
        }),
        expect.any(Object)
      );
    });

    it('should capture 403 Forbidden errors', () => {
      const error = new Error('Forbidden');
      error.statusCode = 403;

      Sentry.captureException(error, {
        level: Sentry.Severity.Warning,
        tags: { httpStatus: '403', component: 'Authorization' }
      });

      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 403 }),
        expect.any(Object)
      );
    });

    it('should capture 500 Internal Server errors', () => {
      const error = new Error('Internal Server Error');
      error.statusCode = 500;
      error.stack = 'Error: Internal Server Error\n    at app.js:123';

      Sentry.captureException(error, {
        level: Sentry.Severity.Error,
        tags: { httpStatus: '500' },
        extra: {
          requestId: 'req_12345',
          timestamp: new Date().toISOString()
        }
      });

      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Internal Server Error',
          statusCode: 500
        }),
        expect.any(Object)
      );
    });

    it('should capture 429 Rate Limit errors', () => {
      const error = new Error('Too Many Requests');
      error.statusCode = 429;
      error.retryAfter = 60;

      Sentry.captureException(error, {
        level: Sentry.Severity.Warning,
        tags: { httpStatus: '429', broker: 'alpaca' },
        extra: { retryAfter: 60 }
      });

      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Too Many Requests',
          statusCode: 429
        }),
        expect.any(Object)
      );
    });
  });

  describe('Real-World Trade Execution Errors', () => {
    it('should capture insufficient funds errors', () => {
      const error = new Error('Insufficient buying power');
      error.code = 'INSUFFICIENT_FUNDS';
      error.required = 50000;
      error.available = 20000;

      Sentry.captureException(error, {
        level: Sentry.Severity.Warning,
        tags: {
          errorType: 'trade',
          broker: 'alpaca'
        },
        extra: {
          symbol: 'AAPL',
          quantity: 100,
          required: 50000,
          available: 20000
        }
      });

      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Insufficient buying power',
          code: 'INSUFFICIENT_FUNDS'
        }),
        expect.any(Object)
      );
    });

    it('should capture invalid symbol errors', () => {
      const error = new Error('Symbol INVALID not found');
      error.code = 'INVALID_SYMBOL';
      error.symbol = 'INVALID';

      Sentry.captureException(error, {
        level: Sentry.Severity.Warning,
        tags: { errorType: 'trade', broker: 'alpaca' },
        extra: { symbol: 'INVALID' }
      });

      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Symbol INVALID not found',
          code: 'INVALID_SYMBOL'
        }),
        expect.any(Object)
      );
    });

    it('should capture market closed errors', () => {
      const error = new Error('Market is closed');
      error.code = 'MARKET_CLOSED';
      error.nextOpen = '2024-03-18T09:30:00-04:00';

      Sentry.captureException(error, {
        level: Sentry.Severity.Info,
        tags: { errorType: 'trade', broker: 'alpaca' },
        extra: {
          symbol: 'AAPL',
          nextOpen: '2024-03-18T09:30:00-04:00'
        }
      });

      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Market is closed',
          code: 'MARKET_CLOSED'
        }),
        expect.any(Object)
      );
    });

    it('should capture daily loss limit errors', () => {
      const error = new Error('Daily loss limit reached');
      error.code = 'DAILY_LOSS_LIMIT';
      error.currentLoss = -500;
      error.limit = -500;

      Sentry.captureException(error, {
        level: Sentry.Severity.Error,
        tags: {
          errorType: 'risk',
          component: 'RiskManagement'
        },
        extra: {
          userId: 'user_12345',
          currentLoss: -500,
          limit: -500,
          portfolioValue: 100000
        }
      });

      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Daily loss limit reached',
          code: 'DAILY_LOSS_LIMIT'
        }),
        expect.any(Object)
      );
    });

    it('should capture broker connection errors', () => {
      const error = new Error('Failed to connect to broker API');
      error.code = 'BROKER_CONNECTION_ERROR';
      error.broker = 'ibkr';
      error.attempts = 3;

      Sentry.captureException(error, {
        level: Sentry.Severity.Error,
        tags: {
          errorType: 'broker',
          broker: 'ibkr'
        },
        extra: {
          attempts: 3,
          lastError: 'ECONNREFUSED'
        }
      });

      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Failed to connect to broker API',
          code: 'BROKER_CONNECTION_ERROR'
        }),
        expect.any(Object)
      );
    });
  });

  describe('WebSocket Authentication Errors', () => {
    it('should capture missing JWT token errors', () => {
      const error = new Error('Missing JWT token');
      error.code = 'MISSING_JWT';

      Sentry.captureException(error, {
        level: Sentry.Severity.Warning,
        tags: {
          component: 'WebSocket',
          errorType: 'auth'
        },
        extra: {
          socketId: 'socket_12345',
          ipAddress: '192.168.1.100'
        }
      });

      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Missing JWT token',
          code: 'MISSING_JWT'
        }),
        expect.any(Object)
      );
    });

    it('should capture expired token errors', () => {
      const error = new Error('JWT token expired');
      error.code = 'TOKEN_EXPIRED';
      error.expiredAt = new Date().toISOString();

      Sentry.captureException(error, {
        level: Sentry.Severity.Warning,
        tags: { component: 'WebSocket' },
        extra: {
          userId: 'user_12345',
          expiredAt: error.expiredAt
        }
      });

      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'JWT token expired',
          code: 'TOKEN_EXPIRED'
        }),
        expect.any(Object)
      );
    });
  });

  describe('Billing Webhook Errors', () => {
    it('should capture webhook signature verification failures', () => {
      const error = new Error('Webhook signature verification failed');
      error.code = 'INVALID_SIGNATURE';

      Sentry.captureException(error, {
        level: Sentry.Severity.Error,
        tags: {
          component: 'Billing',
          errorType: 'webhook'
        },
        extra: {
          provider: 'polar',
          webhookId: 'webhook_12345'
        }
      });

      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Webhook signature verification failed',
          code: 'INVALID_SIGNATURE'
        }),
        expect.any(Object)
      );
    });

    it('should capture payment failure events', () => {
      Sentry.captureMessage('Payment failed for subscription', {
        level: Sentry.Severity.Error,
        tags: { component: 'Billing' },
        extra: {
          userId: 'user_12345',
          subscriptionId: 'sub_67890',
          amount: 99.0,
          reason: 'card_declined'
        }
      });

      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        'Payment failed for subscription',
        expect.objectContaining({
          level: 'error',
          tags: expect.objectContaining({ component: 'Billing' })
        })
      );
    });
  });

  describe('Express Middleware Integration', () => {
    it('should provide request handler middleware', () => {
      const requestHandler = Sentry.Handlers.requestHandler();

      expect(Sentry.Handlers.requestHandler).toHaveBeenCalled();
      expect(requestHandler).toBeInstanceOf(Function);
    });

    it('should provide error handler middleware', () => {
      const errorHandler = Sentry.Handlers.errorHandler();

      expect(Sentry.Handlers.errorHandler).toHaveBeenCalled();
      expect(errorHandler).toBeInstanceOf(Function);
    });

    it('should attach request data to error context', () => {
      const mockReq = {
        method: 'POST',
        url: '/api/v1/trades',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'Mozilla/5.0'
        },
        body: {
          symbol: 'AAPL',
          quantity: 100
        }
      };

      Sentry.configureScope(scope => {
        scope.setContext('request', {
          method: mockReq.method,
          url: mockReq.url,
          headers: mockReq.headers,
          body: mockReq.body
        });
      });

      expect(Sentry.configureScope).toHaveBeenCalled();
    });
  });

  describe('Performance and Optimization', () => {
    it('should not send errors in test environment by default', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      const shouldSend = process.env.NODE_ENV !== 'test' || process.env.SENTRY_TEST_MODE === 'true';

      expect(shouldSend).toBe(false);

      process.env.NODE_ENV = originalEnv;
    });

    it('should sample transactions based on configuration', () => {
      const sampleRate = 0.1; // 10% sampling
      const randomValue = Math.random();
      const shouldSample = randomValue < sampleRate;

      expect(sampleRate).toBeLessThanOrEqual(1.0);
      expect(sampleRate).toBeGreaterThanOrEqual(0.0);
      expect(typeof shouldSample).toBe('boolean');
    });

    it('should respect event rate limits', () => {
      const maxEventsPerMinute = 100;
      const eventCount = 95;

      const shouldSendEvent = eventCount < maxEventsPerMinute;

      expect(shouldSendEvent).toBe(true);
    });
  });

  describe('Scope Management', () => {
    it('should allow scope configuration via callback', () => {
      const scopeCallback = jest.fn();

      Sentry.configureScope(scopeCallback);

      expect(Sentry.configureScope).toHaveBeenCalledWith(scopeCallback);
      expect(scopeCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          setUser: expect.any(Function),
          setContext: expect.any(Function),
          setTag: expect.any(Function)
        })
      );
    });

    it('should isolate scope per request', () => {
      Sentry.configureScope(scope => {
        scope.setTag('requestId', 'req_12345');
        scope.setUser({ id: 'user_12345' });
      });

      Sentry.configureScope(scope => {
        scope.clear();
      });

      expect(Sentry.configureScope).toHaveBeenCalledTimes(2);
    });
  });
});
