/**
 * Jest Setup
 * Global test configuration and environment setup
 */

// Increase timeout for integration tests
jest.setTimeout(30000);

// Suppress console output during tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.ENCRYPTION_KEY = 'test-encryption-key-32-chars-min';
process.env.MFA_ENCRYPTION_KEY = 'test-mfa-encryption-key-32-min';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.DISCORD_CLIENT_ID = 'test-client-id';
process.env.DISCORD_CLIENT_SECRET = 'test-client-secret';
process.env.DISCORD_REDIRECT_URI = 'http://localhost:3000/api/auth/callback';

// Prevent automatic database connection in tests
process.env.MONGODB_URI = 'mongodb://localhost:27017/test-db-placeholder';
