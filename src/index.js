require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const { passport } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const riskRoutes = require('./routes/api/risk');
const providerRoutes = require('./routes/api/providers');
const exchangeRoutes = require('./routes/api/exchanges');
const portfolioRoutes = require('./routes/api/portfolio');
const tradesRoutes = require('./routes/api/trades');
const adminRoutes = require('./routes/api/admin');
const brokerRoutes = require('./routes/api/brokers');
const signalsRoutes = require('./routes/api/signals');
const DiscordTradeBot = require('./discord-bot');
const SubscriptionManager = require('./subscription-manager');
const MarketingAutomation = require('./marketing-automation');
const PaymentProcessor = require('./payment-processor');
const TradingViewParser = require('./tradingview-parser');
const TradeExecutor = require('./trade-executor');
const WebSocketServer = require('./services/websocket-server');

const app = express();
const PORT = process.env.PORT || 5000;

// Trust proxy for Railway deployment
app.set('trust proxy', 1);

// Add global error handlers
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Don't exit process, keep running
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit process, keep running
});

process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    if (webSocketServer) {
        await webSocketServer.close();
    }
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...');
    if (webSocketServer) {
        await webSocketServer.close();
    }
    process.exit(0);
});

// Security middleware - Helmet
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https://cdn.discordapp.com"],
            connectSrc: ["'self'", "ws:", "wss:", "https://discord.com"],
            fontSrc: ["'self'"],
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
}));

// CORS configuration
app.use(cors({
    origin: process.env.DASHBOARD_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// app.use(express.static('public')); // Commented out - old marketing assets, use React dashboard instead

// Serve static files from the React dashboard build
app.use(express.static(path.join(__dirname, '../dist/dashboard')));

// Session configuration
app.use(session({
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
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Initialize Discord Bot
let bot;
try {
    bot = new DiscordTradeBot();
    bot.start();
    console.log('🤖 Discord bot initialized successfully');
} catch (error) {
    console.error('❌ Failed to start Discord bot:', error);
}

// Initialize Subscription Manager
let subscriptionManager;
try {
    subscriptionManager = new SubscriptionManager();
    console.log('💳 Subscription manager initialized successfully');
} catch (error) {
    console.error('❌ Failed to initialize subscription manager:', error);
    // Create a dummy handler if subscription manager fails
    subscriptionManager = { handleStripeWebhook: (req, res) => res.status(503).json({ error: 'Service unavailable' }) };
}

// Initialize Marketing Automation
let marketingAutomation;
try {
    marketingAutomation = new MarketingAutomation();
    marketingAutomation.start();
    console.log('📈 Marketing automation initialized successfully');
} catch (error) {
    console.error('❌ Failed to start marketing automation:', error);
}

// Initialize Payment Processor
let paymentProcessor;
try {
    paymentProcessor = new PaymentProcessor();
    app.use('/', paymentProcessor.getRouter());
    console.log('💳 Payment processor initialized successfully');
} catch (error) {
    console.error('❌ Failed to initialize payment processor:', error);
}

// Initialize TradingView Parser and Trade Executor
let tradingViewParser;
let tradeExecutor;
let webSocketServer; // Declare here for access in shutdown handlers
try {
    tradingViewParser = new TradingViewParser();
    tradeExecutor = new TradeExecutor();
    console.log('📊 TradingView integration initialized successfully');
} catch (error) {
    console.error('❌ Failed to initialize TradingView integration:', error);
}

// Mount authentication routes
app.use('/auth', authRoutes);
// Note: Old dashboard routes disabled - using React SPA instead
// app.use('/dashboard', dashboardRoutes);

// Mount API routes
app.use('/api/risk', riskRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/exchanges', exchangeRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/trades', tradesRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/brokers', brokerRoutes);
app.use('/api/signals', signalsRoutes);

// Routes
app.post('/webhook/stripe', (req, res) => {
    try {
        subscriptionManager.handleStripeWebhook(req, res);
    } catch (error) {
        console.error('Stripe webhook error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// TradingView webhook endpoint
app.post('/webhook/tradingview', express.raw({type: 'application/json'}), async (req, res) => {
    try {
        console.log('📈 TradingView webhook received');
        
        // Verify webhook signature if secret is configured
        if (process.env.TRADINGVIEW_WEBHOOK_SECRET) {
            const signature = req.headers['x-webhook-signature'] || req.headers['signature'];
            const isValid = tradingViewParser.verifyWebhookSignature(
                req.body.toString(),
                signature,
                process.env.TRADINGVIEW_WEBHOOK_SECRET
            );
            
            if (!isValid) {
                console.warn('⚠️ Invalid TradingView webhook signature');
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
            console.warn('⚠️ Failed to parse TradingView webhook payload');
            return res.status(400).json({ error: 'Invalid webhook payload' });
        }
        
        console.log('✅ TradingView signal parsed:', {
            id: signal.id,
            symbol: signal.symbol,
            action: signal.action,
            price: signal.price
        });
        
        // Execute the trade
        const executionResult = await tradeExecutor.executeTrade(signal);
        
        if (executionResult.success) {
            console.log('🎯 TradingView signal executed successfully:', executionResult.orderId);
            res.json({
                success: true,
                signalId: signal.id,
                orderId: executionResult.orderId,
                message: 'Signal executed successfully'
            });
        } else {
            console.warn('⚠️ TradingView signal execution failed:', executionResult.reason);
            res.status(422).json({
                success: false,
                signalId: signal.id,
                reason: executionResult.reason,
                message: 'Signal execution failed'
            });
        }
        
    } catch (error) {
        console.error('❌ TradingView webhook error:', error);
        res.status(500).json({ error: 'Internal server error', message: error.message });
    }
});

// Health check
app.get('/health', (req, res) => {
    const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage()
    };

    // Include WebSocket statistics if available
    if (webSocketServer) {
        health.websocket = webSocketServer.getStats();
    }

    res.json(health);
});

// API info endpoint
app.get('/api', (req, res) => {
    res.json({
        message: 'Discord Trade Executor SaaS',
        status: 'running',
        endpoints: {
            auth: ['/auth/discord', '/auth/discord/callback', '/auth/logout', '/auth/me'],
            dashboard: ['/dashboard', '/dashboard/risk', '/dashboard/exchanges', '/dashboard/analytics', '/dashboard/providers'],
            api: {
                risk: ['/api/risk/settings', '/api/risk/calculate-position', '/api/risk/daily-loss'],
                providers: ['/api/providers', '/api/providers/:providerId', '/api/providers/:providerId/subscribe', '/api/providers/user/subscriptions'],
                brokers: ['/api/brokers', '/api/brokers/:brokerKey', '/api/brokers/test', '/api/brokers/configure', '/api/brokers/user/configured', '/api/brokers/compare', '/api/brokers/recommend']
            },
            webhooks: ['/webhook/stripe', '/webhook/tradingview'],
            health: ['/health'],
            websocket: {
                url: 'ws://' + (process.env.FRONTEND_URL || 'localhost:5000'),
                events: {
                    client: ['subscribe:portfolio', 'subscribe:trades', 'subscribe:watchlist', 'unsubscribe:watchlist'],
                    server: ['portfolio:update', 'trade:executed', 'trade:failed', 'signal:quality', 'quote:update', 'market:status', 'server:shutdown']
                },
                authentication: 'sessionID via handshake.auth',
                rateLimit: 'Per event type (portfolio: 1/min, trades: 1/min, watchlist: 10/min)'
            }
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
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/dashboard/index.html'));
});

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/trade-executor')
    .then(() => console.log('✅ MongoDB connected'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

// Start the server
const server = app.listen(PORT, () => {
    console.log(`🚀 Discord Trade Executor SaaS running on port ${PORT}`);
    console.log(`💰 Revenue generation system active!`);
    console.log(`🎯 Application ready and listening for requests`);
    console.log(`📊 Process ID: ${process.pid}`);
    console.log(`🔄 Node.js version: ${process.version}`);
    console.log(`🌐 Server accessible at: http://localhost:${PORT}`);
});

// Initialize WebSocket Server for real-time updates
console.log('🔍 DEBUG: About to initialize WebSocket server');
console.log('🔍 DEBUG: server object type:', typeof server);
console.log('🔍 DEBUG: server is defined:', !!server);
console.log('🔍 DEBUG: WebSocketServer type:', typeof WebSocketServer);
console.log('🔍 DEBUG: WebSocketServer is defined:', !!WebSocketServer);
console.log('🔍 DEBUG: NODE_ENV:', process.env.NODE_ENV);
console.log('🔍 DEBUG: REDIS_URL exists:', !!process.env.REDIS_URL);
console.log('🔍 DEBUG: REDIS_URL value:', process.env.REDIS_URL ? 'SET (redacted)' : 'NOT SET');

try {
    console.log('🔍 DEBUG: Entered try block for WebSocket initialization');
    webSocketServer = new WebSocketServer(server);
    console.log('🔍 DEBUG: WebSocketServer constructor called successfully');
    console.log('✅ WebSocket server initialized successfully');

    // Connect TradeExecutor events to WebSocket emissions
    if (tradeExecutor) {
        // Listen for successful trade executions
        tradeExecutor.on('trade:executed', async (data) => {
            console.log(`📡 Broadcasting trade:executed for user ${data.userId}`);
            webSocketServer.emitTradeNotification(data.userId, data.trade);

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
                    webSocketServer.emitSignalQuality(data.userId, data.trade.id || data.trade._id, quality);
                }
            } catch (error) {
                console.error('Failed to analyze signal quality for WebSocket emission:', error);
            }
        });

        // Listen for trade failures
        tradeExecutor.on('trade:failed', (data) => {
            console.log(`📡 Broadcasting trade:failed for user ${data.userId}`);
            webSocketServer.emitTradeFailure(data.userId, data.error);
        });

        // Listen for portfolio updates
        tradeExecutor.on('portfolio:updated', async (data) => {
            try {
                console.log(`📡 Portfolio update triggered for user ${data.userId}`);
                // Note: In production, fetch actual portfolio data from database/broker
                // For now, we'll emit a notification to refresh
                const User = mongoose.model('User');
                const user = await User.findById(data.userId);
                if (user) {
                    // Get portfolio data from brokers/exchanges
                    const positions = await tradeExecutor.getOpenPositions(user);
                    const portfolio = {
                        totalValue: 0, // Calculate from positions
                        cash: 0, // Get from broker balance
                        equity: 0, // Calculate from positions
                        positions: positions,
                        dayChange: 0,
                        dayChangePercent: 0
                    };
                    webSocketServer.emitPortfolioUpdate(data.userId, portfolio);
                }
            } catch (error) {
                console.error('Error fetching portfolio for WebSocket update:', error);
            }
        });

        // Listen for position closures
        tradeExecutor.on('position:closed', (data) => {
            console.log(`📡 Position closed for user ${data.userId}: ${data.position.symbol}`);
            // Trigger portfolio update since position affects portfolio
            tradeExecutor.emit('portfolio:updated', {
                userId: data.userId,
                trigger: 'position_closed',
                symbol: data.position.symbol
            });
        });

        console.log('✅ TradeExecutor event listeners connected to WebSocket');
    }
} catch (error) {
    console.log('🔍 DEBUG: Caught error in WebSocket initialization');
    console.log('🔍 DEBUG: Error type:', typeof error);
    console.log('🔍 DEBUG: Error message:', error?.message);
    console.log('🔍 DEBUG: Error stack:', error?.stack);
    console.error('❌ Failed to initialize WebSocket server:', error);
}

// Handle server errors
server.on('error', (error) => {
    console.error('Server error:', error);
});

// Keep the process alive
setInterval(() => {
    console.log(`💓 Heartbeat - ${new Date().toISOString()} - Uptime: ${Math.floor(process.uptime())}s`);
}, 30000); // Every 30 seconds

console.log('🔄 Application initialization complete');
