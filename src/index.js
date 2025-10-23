require('dotenv').config();

// Validate and load application configuration using Joi schemas
const { loadAndValidateConfig } = require('./config/validator');
const config = loadAndValidateConfig();

// Also run legacy environment validation for backwards compatibility
const { validateEnvironment } = require('./utils/env-validation');
validateEnvironment();

// External dependencies
const mongoose = require('mongoose');

// Internal utilities and services
const createApp = require('./app');
const logger = require('./utils/logger');

// Create Express application
const app = createApp();

const PORT = process.env.PORT || 5000;
const IS_TEST = process.env.NODE_ENV === 'test';

// SIGTERM/SIGINT handlers for graceful shutdown
let webSocketServer;
let bot;
let marketingAutomation;

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  if (webSocketServer) {
    await webSocketServer.shutdown();
  }
  if (bot) {
    await bot.stop();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully');
  if (webSocketServer) {
    await webSocketServer.shutdown();
  }
  if (bot) {
    await bot.stop();
  }
  process.exit(0);
});

// Connect to MongoDB (unless already connected by test setup)
if (mongoose.connection.readyState === 0) {
  mongoose
    .connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/trade-executor')
    .then(() => {
      logger.info('✅ MongoDB connected');

      // Initialize OAuth2 token refresh cron jobs after DB connection (production only)
      if (!IS_TEST) {
        try {
          const { startTokenRefreshJobs } = require('./jobs/tokenRefreshJob');
          startTokenRefreshJobs();
          logger.info('✅ OAuth2 token refresh jobs initialized');
        } catch (error) {
          logger.error('❌ Failed to initialize token refresh jobs:', { error: error.message, stack: error.stack });
        }
      }
    })
    .catch(err => logger.error('❌ MongoDB connection error:', { error: err.message, stack: err.stack }));
} else {
  logger.info('✅ MongoDB already connected (test environment)');
}

// Initialize services (production only, skip in test environment)
if (!IS_TEST) {
  // Initialize Discord Bot
  try {
    const DiscordTradeBot = require('./services/DiscordBot');
    bot = new DiscordTradeBot();
    bot.start();
    logger.info('🤖 Discord bot initialized successfully');
  } catch (error) {
    logger.error('❌ Failed to start Discord bot:', { error: error.message, stack: error.stack });
  }

  // Subscription Manager (singleton - already initialized on import)
  try {
    require('./services/subscription-manager');
    logger.info('💳 Subscription manager initialized successfully');
  } catch (error) {
    logger.error('❌ Failed to initialize subscription manager:', { error: error.message, stack: error.stack });
  }

  // Initialize Marketing Automation
  try {
    const MarketingAutomation = require('./services/MarketingAutomation');
    marketingAutomation = new MarketingAutomation();
    marketingAutomation.start();
    logger.info('📈 Marketing automation initialized successfully');
  } catch (error) {
    logger.error('❌ Failed to start marketing automation:', { error: error.message, stack: error.stack });
  }
}

// Start the server (only if not in test environment)
let server;
if (!IS_TEST) {
  server = app.listen(PORT, () => {
    logger.info(`🚀 Discord Trade Executor SaaS running on port ${PORT}`);
    logger.info(`💰 Revenue generation system active!`);
    logger.info(`🎯 Application ready and listening for requests`);
    logger.info(`📊 Process ID: ${process.pid}`);
    logger.info(`🔄 Node.js version: ${process.version}`);
    logger.info(`🌐 Server accessible at: http://localhost:${PORT}`);
  });

  // Initialize WebSocket Server for real-time updates (production only)
  (async () => {
    try {
      logger.info('🔌 Initializing WebSocket server...');

      const WebSocketServer = require('./services/websocket/WebSocketServer');
      const { createAuthMiddleware } = require('./services/websocket/middleware/auth');
      const { createRateLimitMiddleware } = require('./services/websocket/middleware/rateLimiter');
      const { createEventHandlers } = require('./services/websocket/handlers');
      const { createEmitters } = require('./services/websocket/emitters');

      // Create WebSocket server instance
      webSocketServer = new WebSocketServer(server, {
        cors: {
          origin: process.env.DASHBOARD_URL || 'http://localhost:3000',
          methods: ['GET', 'POST'],
          credentials: true
        }
      });

      // Initialize with Redis adapter if available
      await webSocketServer.initialize();

      // Apply authentication middleware
      const authMiddleware = createAuthMiddleware({
        required: true,
        sessionCollectionName: 'sessions'
      });
      webSocketServer.setAuthMiddleware(authMiddleware);

      // Apply rate limiting middleware
      const rateLimiter = createRateLimitMiddleware(webSocketServer.redisPubClient);
      webSocketServer.setRateLimitMiddleware(rateLimiter.connectionLimit());

      // Register event handlers
      const handlers = createEventHandlers(rateLimiter);
      Object.entries(handlers).forEach(([event, handler]) => {
        webSocketServer.registerEventHandler(event, handler);
      });

      logger.info('✅ WebSocket event handlers registered');

      // Connect TradeExecutor events to WebSocket emitters
      try {
        const TradeExecutor = require('./services/TradeExecutor');
        const tradeExecutor = new TradeExecutor();
        const emitters = createEmitters(webSocketServer);

        // Listen for successful trade executions
        tradeExecutor.on('trade:executed', async data => {
          logger.info(`📡 Broadcasting trade:executed for user ${data.userId}`);
          emitters.emitTradeExecuted(data.userId, data.trade);

          // Analyze and emit signal quality for the trade
          try {
            const { analyzeSignalQuality } = require('./services/signal-quality-tracker');
            const quality = await analyzeSignalQuality({
              tradeId: data.trade.id || data.trade._id,
              symbol: data.trade.symbol,
              side: data.trade.side,
              entryPrice: data.trade.price || data.trade.entryPrice,
              quantity: data.trade.quantity,
              providerId: data.trade.providerId || data.signal?.provider || 'UNKNOWN'
            });

            if (quality) {
              emitters.emitNotification(data.userId, {
                title: 'Signal Quality Update',
                message: `Quality score: ${quality.score}`,
                type: 'info',
                data: quality
              });
            }
          } catch (error) {
            logger.error('Failed to analyze signal quality for WebSocket emission:', {
              error: error.message,
              stack: error.stack
            });
          }
        });

        // Listen for trade failures
        tradeExecutor.on('trade:failed', data => {
          logger.info(`📡 Broadcasting trade:failed for user ${data.userId}`);
          emitters.emitTradeFailed(data.userId, data.error);
        });

        // Listen for portfolio updates
        tradeExecutor.on('portfolio:updated', async data => {
          try {
            logger.info(`📡 Portfolio update triggered for user ${data.userId}`);
            const User = mongoose.model('User');
            const user = await User.findById(data.userId);
            if (user) {
              // Get portfolio data from brokers/exchanges
              const positions = await tradeExecutor.getOpenPositions(user);
              const portfolio = {
                totalValue: 0, // TODO: Calculate from positions
                cash: 0, // TODO: Get from broker balance
                equity: 0, // TODO: Calculate from positions
                positions: positions,
                dayChange: 0,
                dayChangePercent: 0
              };
              emitters.emitPortfolioUpdate(data.userId, portfolio);
            }
          } catch (error) {
            logger.error('Error fetching portfolio for WebSocket update:', {
              error: error.message,
              stack: error.stack
            });
          }
        });

        // Listen for position closures
        tradeExecutor.on('position:closed', data => {
          logger.info(`📡 Position closed for user ${data.userId}: ${data.position.symbol}`);
          emitters.emitPositionClosed(data.userId, data.position);

          // Trigger portfolio update since position affects portfolio
          tradeExecutor.emit('portfolio:updated', {
            userId: data.userId,
            trigger: 'position_closed',
            symbol: data.position.symbol
          });
        });

        logger.info('✅ TradeExecutor event listeners connected to WebSocket emitters');
      } catch (error) {
        logger.error('❌ Failed to connect TradeExecutor to WebSocket:', {
          error: error.message,
          stack: error.stack
        });
      }

      logger.info('✅ WebSocket server initialization complete');
    } catch (error) {
      logger.error('❌ Failed to initialize WebSocket server:', { error: error.message, stack: error.stack });
    }
  })();

  // Handle server errors
  server.on('error', error => {
    logger.error('Server error:', { error: error.message, stack: error.stack });
  });

  // Keep the process alive with heartbeat (production only)
  setInterval(() => {
    logger.info(`💓 Heartbeat - Uptime: ${Math.floor(process.uptime())}s`);
  }, 30000); // Every 30 seconds

  logger.info('🔄 Application initialization complete');
}

// Export app for testing
module.exports = app;
