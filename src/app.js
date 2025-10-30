'use strict';

/**
 * Express Application Factory
 * 
 * Creates and configures the Express app without starting the server.
 * This separation enables clean integration testing without lifecycle side effects.
 * 
 * Lifecycle code (server.listen, Discord bot, cron jobs, WebSocket) remains in index.js
 */

// Node.js built-in modules
const path = require('path');

// External dependencies
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const helmet = require('helmet');
const cors = require('cors');

// Internal utilities and services
const { passport } = require('./middleware/auth');
const logger = require('./utils/logger');
const correlationMiddleware = require('./middleware/correlation');
const loggingMiddleware = require('./middleware/logging');
const performanceTracker = require('./middleware/performance-tracker');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Route imports
const authRoutes = require('./routes/auth');
const riskRoutes = require('./routes/api/risk');
const providerRoutes = require('./routes/api/providers');
const exchangeRoutes = require('./routes/api/exchanges');
const portfolioRoutes = require('./routes/api/portfolio');
const tradesRoutes = require('./routes/api/trades');
const adminRoutes = require('./routes/api/admin');
const brokerRoutes = require('./routes/api/brokers');
const brokerOAuthRoutes = require('./routes/api/broker-oauth');
const oauth2AuthRoutes = require('./routes/api/auth');
const signalsRoutes = require('./routes/api/signals');
const analyticsRoutes = require('./routes/api/analytics');
const subscriptionRoutes = require('./routes/api/subscriptions');
const signalSubscriptionRoutes = require('./routes/api/signal-subscriptions');
const communityRoutes = require('./routes/api/community');
const traderRoutes = require('./routes/api/trader');
const metricsRoutes = require('./routes/api/metrics');
const polarWebhookRoutes = require('./routes/webhook/polar');

/**
 * Create Express application
 * @param {Object} options - Configuration options
 * @param {boolean} options.skipPaymentProcessor - Skip payment processor initialization (for testing)
 * @param {boolean} options.skipTradingView - Skip TradingView integration (for testing)
 * @returns {express.Application} Configured Express app
 */
function createApp(options = {}) {
  const app = express();

  // Trust proxy for Railway deployment
  app.set('trust proxy', 1);

  // Security middleware - Helmet
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https://cdn.discordapp.com'],
          connectSrc: ["'self'", 'ws:', 'wss:', 'https://discord.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"]
        }
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      },
      noSniff: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      xssFilter: true,
      hidePoweredBy: true,
      crossOriginEmbedderPolicy: false
    })
  );

  // CORS configuration
  app.use(
    cors({
      origin: process.env.DASHBOARD_URL || 'http://localhost:3000',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
    })
  );

  // Body parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Serve static files from the React dashboard build
  app.use(express.static(path.join(__dirname, '../dist/dashboard')));

  // Correlation ID middleware (must be before logging)
  app.use(correlationMiddleware);

  // Request/Response logging middleware
  app.use(loggingMiddleware);

  // Performance tracking middleware (US6-T01)
  app.use(performanceTracker.middleware);

  // Session configuration
  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/trade-executor',
        touchAfter: 24 * 3600 // Lazy session update (seconds)
      }),
      cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // HTTPS only in production
        sameSite: 'lax'
      }
    })
  );

  // Initialize Passport
  app.use(passport.initialize());
  app.use(passport.session());

  // Initialize Payment Processor (optional for testing)
  if (!options.skipPaymentProcessor) {
    try {
      const PaymentProcessor = require('./services/PaymentProcessor');
      const paymentProcessor = new PaymentProcessor();
      app.use('/', paymentProcessor.getRouter());
      logger.info('💳 Payment processor initialized successfully');
    } catch (error) {
      logger.error('❌ Failed to initialize payment processor:', { error: error.message, stack: error.stack });
    }
  }

  // Initialize TradingView Parser and Trade Executor (optional for testing)
  let tradingViewParser;
  let tradeExecutor;
  if (!options.skipTradingView) {
    try {
      const TradingViewParser = require('./services/TradingViewParser');
      const TradeExecutor = require('./services/TradeExecutor');
      tradingViewParser = new TradingViewParser();
      tradeExecutor = new TradeExecutor();
      logger.info('📊 TradingView integration initialized successfully');
    } catch (error) {
      logger.error('❌ Failed to initialize TradingView integration:', { error: error.message, stack: error.stack });
    }
  }

  // Mount authentication routes
  app.use('/auth', authRoutes);

  // Mount API routes
  app.use('/api/risk', riskRoutes);
  app.use('/api/providers', providerRoutes);
  app.use('/api/exchanges', exchangeRoutes);
  app.use('/api/portfolio', portfolioRoutes);
  app.use('/api/trades', tradesRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/brokers', brokerRoutes);
  app.use('/api/brokers/oauth', brokerOAuthRoutes);
  app.use('/api/auth', oauth2AuthRoutes);
  app.use('/api', require('./routes/api/debug-broker-config'));
  app.use('/api/signals', signalsRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/subscriptions', subscriptionRoutes);
  app.use('/api/signal-subscriptions', signalSubscriptionRoutes);
  app.use('/api/community', communityRoutes);
  app.use('/api/trader', traderRoutes);
  app.use('/api/metrics', metricsRoutes);
  app.use('/webhook/polar', polarWebhookRoutes);

  // TradingView webhook endpoint
  if (tradingViewParser && tradeExecutor) {
    app.post('/webhook/tradingview', express.raw({ type: 'application/json' }), async (req, res) => {
      try {
        logger.info('📈 TradingView webhook received');

        // Verify webhook signature if secret is configured
        if (process.env.TRADINGVIEW_WEBHOOK_SECRET) {
          const signature = req.headers['x-webhook-signature'] || req.headers['signature'];
          const isValid = tradingViewParser.verifyWebhookSignature(
            req.body.toString(),
            signature,
            process.env.TRADINGVIEW_WEBHOOK_SECRET
          );

          if (!isValid) {
            logger.warn('⚠️ Invalid TradingView webhook signature');
            return res.status(401).json({ error: 'Invalid signature' });
          }
        }

        // Parse the TradingView signal
        let bodyString;
        if (Buffer.isBuffer(req.body)) {
          bodyString = req.body.toString();
        } else {
          bodyString = req.body;
        }
        const signal = tradingViewParser.parseWebhook(bodyString);

        if (!signal) {
          logger.warn('⚠️ Failed to parse TradingView webhook payload');
          return res.status(400).json({ error: 'Invalid webhook payload' });
        }

        logger.info('✅ TradingView signal parsed:', {
          id: signal.id,
          symbol: signal.symbol,
          action: signal.action,
          price: signal.price
        });

        // Execute the trade
        const executionResult = await tradeExecutor.executeTrade(signal);

        if (executionResult.success) {
          logger.info('🎯 TradingView signal executed successfully:', { orderId: executionResult.orderId });
          res.json({
            success: true,
            signalId: signal.id,
            orderId: executionResult.orderId,
            message: 'Signal executed successfully'
          });
        } else {
          logger.warn('⚠️ TradingView signal execution failed:', { reason: executionResult.reason });
          res.status(422).json({
            success: false,
            signalId: signal.id,
            reason: executionResult.reason,
            message: 'Signal execution failed'
          });
        }
      } catch (error) {
        logger.error('❌ TradingView webhook error:', { error: error.message, stack: error.stack });
        res.status(500).json({ error: 'Internal server error', message: error.message });
      }
    });
  }

  // Health check
  app.get('/health', async (req, res) => {
    const RedisService = require('./services/redis');
    const EnvValidator = require('./utils/env-validator');

    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage()
    };

    // Include Redis statistics
    try {
      health.redis = await RedisService.getStats();
    } catch (err) {
      health.redis = { mode: 'error', error: err.message };
    }

    // Check for mock/sandbox configurations (US5-T04)
    const mockDetection = EnvValidator.detectMocks();
    health.mocks = mockDetection;

    // If production has dangerous mock configurations, mark as unhealthy
    if (mockDetection.isDangerous) {
      health.status = 'unhealthy';
      health.error = 'Mock/sandbox configurations detected in production environment';
      return res.status(500).json(health);
    }

    res.json(health);
  });

  // Redis health check endpoint
  app.get('/health/redis', async (req, res) => {
    const RedisService = require('./services/redis');

    try {
      const stats = await RedisService.getStats();
      const cacheMode = RedisService.getMode();

      if (cacheMode === 'redis') {
        res.json({
          status: 'ok',
          mode: cacheMode,
          stats
        });
      } else {
        res.status(503).json({
          status: 'degraded',
          mode: cacheMode,
          message: 'Using in-memory fallback - distributed cache unavailable',
          stats
        });
      }
    } catch (err) {
      res.status(500).json({
        status: 'error',
        error: err.message
      });
    }
  });

  // OAuth2 providers health check endpoint
  app.get('/health/oauth2', (req, res) => {
    const { getEnabledProviders, OAUTH2_PROVIDERS } = require('./config/oauth2Providers');

    const enabled = getEnabledProviders();
    const allProviders = Object.keys(OAUTH2_PROVIDERS);
    const missing = allProviders.filter(p => !enabled.includes(p));

    res.json({
      status: enabled.length > 0 ? 'ok' : 'no_providers',
      enabled,
      totalConfigured: enabled.length,
      totalAvailable: allProviders.length,
      missing,
      missingDetails: missing.map(key => ({
        provider: key,
        requiredEnvVars: [
          `${key.toUpperCase()}_OAUTH_CLIENT_ID`,
          `${key.toUpperCase()}_OAUTH_CLIENT_SECRET`
        ]
      }))
    });
  });

  // API info endpoint
  app.get('/api', (req, res) => {
    res.json({
      message: 'Discord Trade Executor SaaS',
      status: 'running',
      endpoints: {
        auth: ['/auth/discord', '/auth/discord/callback', '/auth/logout', '/auth/me'],
        dashboard: [
          '/dashboard',
          '/dashboard/risk',
          '/dashboard/exchanges',
          '/dashboard/analytics',
          '/dashboard/providers'
        ],
        api: {
          risk: ['/api/risk/settings', '/api/risk/calculate-position', '/api/risk/daily-loss'],
          providers: [
            '/api/providers',
            '/api/providers/:providerId',
            '/api/providers/:providerId/subscribe',
            '/api/providers/user/subscriptions'
          ],
          brokers: [
            '/api/brokers',
            '/api/brokers/:brokerKey',
            '/api/brokers/test',
            '/api/brokers/configure',
            '/api/brokers/user/configured',
            '/api/brokers/compare',
            '/api/brokers/recommend'
          ]
        },
        webhooks: ['/webhook/polar', '/webhook/tradingview'],
        health: ['/health']
      },
      features: [
        'Discord OAuth2 authentication',
        'Discord signal parsing',
        'TradingView webhook integration',
        'Multi-exchange trading',
        'Multi-broker trading (stocks & crypto)',
        'Subscription billing',
        'Risk management dashboard',
        'Multi-signal provider support',
        'Real-time WebSocket updates (portfolio, trades, quotes)',
        'Horizontal scaling with Redis adapter'
      ]
    });
  });

  // Catch-all route - serve React app for client-side routing
  // CRITICAL: Must be BEFORE 404 handler to handle SPA client-side routes
  // This allows React Router to handle routes like /dashboard, /dashboard/overview, etc.
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/dashboard/index.html'));
  });

  // 404 handler - catches non-GET requests to undefined routes (POST/PUT/DELETE/etc)
  // Note: GET requests are handled by catch-all route above
  app.use(notFoundHandler);

  // Global error handler - must be last middleware
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
