// Conditionally import MongoDB only for Node.js environment (not jsdom/React tests)
let MongoMemoryServer, mongoose;
if (typeof window === 'undefined') {
  ({ MongoMemoryServer } = require('mongodb-memory-server'));
  mongoose = require('mongoose');
}

// Global test configuration
global.console = {
  ...console,
  // Suppress console.log in tests unless DEBUG is set
  log: process.env.DEBUG ? console.log : jest.fn(),
  error: console.error,
  warn: console.warn,
  info: process.env.DEBUG ? console.info : jest.fn(),
  debug: process.env.DEBUG ? console.debug : jest.fn()
};

// Mock environment variables for tests
process.env.NODE_ENV = 'development'; // Use 'development' to bypass strict validation in config/validator.js
process.env.DISCORD_BOT_TOKEN = 'test_discord_token_1234567890123456789012345678901234567890'; // Min 50 chars
process.env.BINANCE_API_KEY = 'test_binance_key';
process.env.BINANCE_SECRET = 'test_binance_secret';
process.env.POLAR_ACCESS_TOKEN = 'polar_at_test_123456789012345678901234567890';
process.env.POLAR_WEBHOOK_SECRET = 'whsec_test_123456789012345678901234567890';
process.env.POLAR_ORGANIZATION_ID = '550e8400-e29b-41d4-a716-446655440000';
process.env.MONGODB_URI = 'mongodb://localhost:27017/trade-executor-test';
process.env.ENCRYPTION_KEY = '584fc10bcc68bd3d32d9810a6d633481df732c1fbfd6a70564988ba5dc489239';
// OAuth2 Provider Credentials (for testing OAuth2Service and broker adapters)
process.env.ALPACA_OAUTH_CLIENT_ID = 'test_alpaca_client_id';
process.env.ALPACA_OAUTH_CLIENT_SECRET = 'test_alpaca_client_secret';
process.env.IBKR_OAUTH_CLIENT_ID = 'test_ibkr_client_id';
process.env.IBKR_OAUTH_CLIENT_SECRET = 'test_ibkr_client_secret';
process.env.TDAMERITRADE_OAUTH_CLIENT_ID = 'test_tdameritrade_client_id';
process.env.TDAMERITRADE_OAUTH_CLIENT_SECRET = 'test_tdameritrade_client_secret';
process.env.ETRADE_OAUTH_CLIENT_ID = 'test_etrade_client_id';
process.env.ETRADE_OAUTH_CLIENT_SECRET = 'test_etrade_client_secret';
process.env.SCHWAB_OAUTH_CLIENT_ID = 'test_schwab_client_id';
process.env.SCHWAB_OAUTH_CLIENT_SECRET = 'test_schwab_client_secret';

// Global test database setup (only for Node.js environment)
let mongoServer;

if (typeof window === 'undefined' && mongoose) {
  beforeAll(async () => {
    // Start in-memory MongoDB instance
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    process.env.MONGODB_URI = mongoUri;

    // Connect to the in-memory database
    await mongoose.connect(mongoUri);
  });

  afterAll(async () => {
    // Clean up database connections and server
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  afterEach(async () => {
    // Clear all collections after each test
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      const collection = collections[key];
      await collection.deleteMany({});
    }
  });
}

// Global test utilities
global.testUtils = {
  // Generate mock trading signal
  mockTradingSignal: (overrides = {}) => ({
    symbol: 'BTCUSDT',
    action: 'buy',
    price: 45000,
    stopLoss: 43000,
    takeProfit: 48000,
    timestamp: Date.now(),
    source: 'discord',
    channelId: 'test-channel-123',
    userId: 'test-user-123',
    ...overrides
  }),

  // Generate mock trade result
  mockTradeResult: (overrides = {}) => ({
    success: true,
    orderId: 'order_123456',
    symbol: 'BTCUSDT',
    amount: 0.001,
    price: 45000,
    timestamp: Date.now(),
    ...overrides
  }),

  // Wait for async operations
  wait: ms => new Promise(resolve => setTimeout(resolve, ms)),

  // Mock Discord message
  mockDiscordMessage: (content, overrides = {}) => ({
    content,
    author: { bot: false, id: 'user123' },
    channel: { id: 'channel123' },
    guild: { id: 'guild123' },
    reply: jest.fn(),
    ...overrides
  })
};
