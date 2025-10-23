/**
 * Sentry Configuration
 *
 * Centralized error tracking and performance monitoring for production.
 * Integrates with Express.js middleware and provides contextual error reporting.
 *
 * Features:
 * - Environment-based toggle (disabled in development/test)
 * - User context attachment for error tracking
 * - Performance transaction monitoring
 * - Release versioning and environment tagging
 * - Sanitized error messages (no sensitive data)
 * - Custom breadcrumbs for debugging
 *
 * Usage:
 *   const { initSentry, sentryRequestHandler, sentryErrorHandler, captureException } = require('./config/sentry');
 *
 *   // In app initialization:
 *   initSentry(app);
 *   app.use(sentryRequestHandler());
 *   // ... your routes ...
 *   app.use(sentryErrorHandler());
 *
 * Environment Variables:
 *   SENTRY_DSN - Sentry Data Source Name (required for production)
 *   SENTRY_ENVIRONMENT - Environment name (production, staging, development)
 *   SENTRY_RELEASE - Release version (e.g., git SHA or package.json version)
 *   SENTRY_SAMPLE_RATE - Error sampling rate 0.0-1.0 (default: 1.0)
 *   SENTRY_TRACES_SAMPLE_RATE - Performance sampling rate (default: 0.1 = 10%)
 */

'use strict';

const Sentry = require('@sentry/node');
const { ProfilingIntegration } = require('@sentry/profiling-node');

// Configuration
const SENTRY_DSN = process.env.SENTRY_DSN;
const ENVIRONMENT = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development';
const RELEASE = process.env.SENTRY_RELEASE || process.env.npm_package_version || 'unknown';
const SAMPLE_RATE = parseFloat(process.env.SENTRY_SAMPLE_RATE || '1.0');
const TRACES_SAMPLE_RATE = parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1');

// Sentry should be disabled in development and test environments
const ENABLED = ENVIRONMENT !== 'development' && ENVIRONMENT !== 'test' && !!SENTRY_DSN;

/**
 * Initialize Sentry error tracking
 *
 * @param {Object} app - Express application instance
 * @returns {void}
 */
function initSentry(app) {
  if (!ENABLED) {
    console.log(`[Sentry] Disabled (environment: ${ENVIRONMENT}, DSN: ${!!SENTRY_DSN})`);
    return;
  }

  if (!SENTRY_DSN) {
    console.warn('[Sentry] SENTRY_DSN environment variable not set. Error tracking disabled.');
    return;
  }

  try {
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: ENVIRONMENT,
      release: RELEASE,

      // Sampling configuration
      sampleRate: SAMPLE_RATE, // Error sampling (1.0 = 100%)
      tracesSampleRate: TRACES_SAMPLE_RATE, // Performance monitoring (0.1 = 10%)

      // Integrations
      integrations: [
        // Express integration for automatic error capturing
        new Sentry.Integrations.Http({ tracing: true }),
        new Sentry.Integrations.Express({ app }),
        new ProfilingIntegration(),

        // Additional context
        new Sentry.Integrations.OnUncaughtException({
          exitEvenIfOtherHandlersAreRegistered: false
        }),
        new Sentry.Integrations.OnUnhandledRejection({
          mode: 'warn' // Log unhandled rejections without crashing
        })
      ],

      // Performance monitoring
      tracesSampler: samplingContext => {
        // Sample critical paths at 100%
        if (samplingContext.transactionContext.name?.includes('/api/v1/trades')) {
          return 1.0; // 100% for trade execution
        }

        if (samplingContext.transactionContext.name?.includes('/auth')) {
          return 0.5; // 50% for auth endpoints
        }

        // Default sampling rate
        return TRACES_SAMPLE_RATE;
      },

      // Data sanitization
      beforeSend: (event, hint) => {
        // Sanitize sensitive data from errors
        if (event.request) {
          // Remove authorization headers
          if (event.request.headers) {
            delete event.request.headers.authorization;
            delete event.request.headers.cookie;
            delete event.request.headers['x-api-key'];
          }

          // Remove sensitive query parameters
          if (event.request.query_string) {
            event.request.query_string = event.request.query_string
              .replace(/token=[^&]*/g, 'token=REDACTED')
              .replace(/key=[^&]*/g, 'key=REDACTED')
              .replace(/secret=[^&]*/g, 'secret=REDACTED');
          }

          // Remove sensitive POST data
          if (event.request.data) {
            const data = typeof event.request.data === 'string' ? JSON.parse(event.request.data) : event.request.data;

            if (data) {
              if (data.password) data.password = 'REDACTED';
              if (data.apiKey) data.apiKey = 'REDACTED';
              if (data.apiSecret) data.apiSecret = 'REDACTED';
              if (data.accessToken) data.accessToken = 'REDACTED';
              if (data.refreshToken) data.refreshToken = 'REDACTED';

              event.request.data = JSON.stringify(data);
            }
          }
        }

        // Remove sensitive exception data
        if (event.exception && event.exception.values) {
          event.exception.values.forEach(exception => {
            if (exception.value) {
              exception.value = exception.value
                .replace(/apiKey[:\s]+[^\s,}]+/gi, 'apiKey: REDACTED')
                .replace(/apiSecret[:\s]+[^\s,}]+/gi, 'apiSecret: REDACTED')
                .replace(/password[:\s]+[^\s,}]+/gi, 'password: REDACTED')
                .replace(/token[:\s]+[^\s,}]+/gi, 'token: REDACTED');
            }
          });
        }

        return event;
      },

      // Ignore certain errors
      ignoreErrors: [
        // Browser errors
        'ResizeObserver loop limit exceeded',
        'Non-Error promise rejection captured',

        // Network errors (client-side)
        'NetworkError',
        'Network request failed',
        'Failed to fetch',

        // Bot/crawler errors
        'Loading chunk',
        'ChunkLoadError',

        // Rate limiting (expected)
        'Too Many Requests',
        'Rate limit exceeded'
      ],

      // Breadcrumb filtering
      beforeBreadcrumb: breadcrumb => {
        // Redact sensitive URLs
        if (breadcrumb.category === 'http') {
          if (breadcrumb.data && breadcrumb.data.url) {
            breadcrumb.data.url = breadcrumb.data.url
              .replace(/token=[^&]*/g, 'token=REDACTED')
              .replace(/key=[^&]*/g, 'key=REDACTED');
          }
        }

        return breadcrumb;
      }
    });

    console.log(`[Sentry] Initialized successfully`);
    console.log(`[Sentry] Environment: ${ENVIRONMENT}`);
    console.log(`[Sentry] Release: ${RELEASE}`);
    console.log(`[Sentry] Sample Rate: ${SAMPLE_RATE * 100}%`);
    console.log(`[Sentry] Traces Sample Rate: ${TRACES_SAMPLE_RATE * 100}%`);
  } catch (error) {
    console.error('[Sentry] Initialization failed:', error);
  }
}

/**
 * Sentry request handler middleware
 * Must be the first middleware
 *
 * @returns {Function} Express middleware
 */
function sentryRequestHandler() {
  if (!ENABLED) {
    return (req, res, next) => next();
  }

  return Sentry.Handlers.requestHandler({
    user: ['id', 'username', 'email'], // Attach user context
    ip: true,
    transaction: 'methodPath' // Transaction naming: GET /api/v1/trades
  });
}

/**
 * Sentry tracing middleware
 * Place after request handler
 *
 * @returns {Function} Express middleware
 */
function sentryTracingHandler() {
  if (!ENABLED) {
    return (req, res, next) => next();
  }

  return Sentry.Handlers.tracingHandler();
}

/**
 * Sentry error handler middleware
 * Must be placed after all routes but before other error handlers
 *
 * @returns {Function} Express middleware
 */
function sentryErrorHandler() {
  if (!ENABLED) {
    return (err, req, res, next) => next(err);
  }

  return Sentry.Handlers.errorHandler({
    shouldHandleError: error => {
      // Capture all errors (middleware will forward to next handler)
      return true;
    }
  });
}

/**
 * Manually capture an exception with context
 *
 * @param {Error} error - Error object to capture
 * @param {Object} context - Additional context (user, tags, extras)
 * @returns {string|null} Event ID if captured, null otherwise
 */
function captureException(error, context = {}) {
  if (!ENABLED) {
    console.error('[Sentry] (disabled) Exception:', error);
    return null;
  }

  const { user, tags, extras, level } = context;

  return Sentry.captureException(error, {
    user: user
      ? {
          id: user.id || user._id,
          username: user.username,
          email: user.email,
          ip_address: user.ipAddress
        }
      : undefined,
    tags: tags,
    extra: extras,
    level: level || 'error'
  });
}

/**
 * Manually capture a message with context
 *
 * @param {string} message - Message to capture
 * @param {string} level - Severity level (fatal, error, warning, info, debug)
 * @param {Object} context - Additional context
 * @returns {string|null} Event ID if captured, null otherwise
 */
function captureMessage(message, level = 'info', context = {}) {
  if (!ENABLED) {
    console.log(`[Sentry] (disabled) Message [${level}]:`, message);
    return null;
  }

  return Sentry.captureMessage(message, {
    level: level,
    tags: context.tags,
    extra: context.extras
  });
}

/**
 * Add breadcrumb for debugging context
 *
 * @param {Object} breadcrumb - Breadcrumb data
 * @param {string} breadcrumb.message - Breadcrumb message
 * @param {string} breadcrumb.category - Category (e.g., 'auth', 'trade', 'billing')
 * @param {string} breadcrumb.level - Level (fatal, error, warning, info, debug)
 * @param {Object} breadcrumb.data - Additional data
 */
function addBreadcrumb(breadcrumb) {
  if (!ENABLED) {
    return;
  }

  Sentry.addBreadcrumb({
    message: breadcrumb.message,
    category: breadcrumb.category || 'custom',
    level: breadcrumb.level || 'info',
    data: breadcrumb.data
  });
}

/**
 * Set user context for error tracking
 *
 * @param {Object} user - User object
 */
function setUser(user) {
  if (!ENABLED || !user) {
    return;
  }

  Sentry.setUser({
    id: user.id || user._id?.toString(),
    username: user.username,
    email: user.email,
    subscription: user.subscription?.tier
  });
}

/**
 * Clear user context (e.g., on logout)
 */
function clearUser() {
  if (!ENABLED) {
    return;
  }

  Sentry.setUser(null);
}

/**
 * Set custom tag for filtering
 *
 * @param {string} key - Tag key
 * @param {string} value - Tag value
 */
function setTag(key, value) {
  if (!ENABLED) {
    return;
  }

  Sentry.setTag(key, value);
}

/**
 * Set custom context data
 *
 * @param {string} key - Context key
 * @param {Object} value - Context data
 */
function setContext(key, value) {
  if (!ENABLED) {
    return;
  }

  Sentry.setContext(key, value);
}

/**
 * Check if Sentry is enabled
 *
 * @returns {boolean} True if Sentry is enabled
 */
function isEnabled() {
  return ENABLED;
}

/**
 * Close Sentry connection gracefully
 *
 * @param {number} timeout - Timeout in milliseconds (default: 2000)
 * @returns {Promise<boolean>} True if all events were sent
 */
async function close(timeout = 2000) {
  if (!ENABLED) {
    return true;
  }

  try {
    return await Sentry.close(timeout);
  } catch (error) {
    console.error('[Sentry] Close error:', error);
    return false;
  }
}

module.exports = {
  initSentry,
  sentryRequestHandler,
  sentryTracingHandler,
  sentryErrorHandler,
  captureException,
  captureMessage,
  addBreadcrumb,
  setUser,
  clearUser,
  setTag,
  setContext,
  isEnabled,
  close,

  // Export Sentry SDK for advanced usage
  Sentry
};
