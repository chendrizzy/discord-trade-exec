// External dependencies
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

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
process.env.STRIPE_SECRET_KEY = 'sk_test_123456789';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_123456789';
process.env.MONGODB_URI = 'mongodb://localhost:27017/trade-executor-test';

// Global test database setup
let mongoServer;

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
