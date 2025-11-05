/**
 * User Test Fixtures
 *
 * Provides factory functions for creating test User documents
 */

const User = require('../../src/models/User');

/**
 * Create a test user with default or custom properties
 * @param {Object} overrides - Custom properties to override defaults
 * @returns {Promise<Object>} Created user document
 */
async function createTestUser(overrides = {}) {
  // Generate unique Discord ID for each test user
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  const uniqueId = `test_${timestamp}_${random}`;

  const defaultUser = {
    discordId: uniqueId,
    discordUsername: `testuser_${random}`,
    discordTag: `TestUser#${random.toString().padStart(4, '0')}`,
    avatar: null,
    communityRole: 'trader',
    subscription: {
      tier: 'free',
      status: 'trial',
      trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
    },
    limits: {
      signalsPerDay: 10,
      signalsUsedToday: 0,
      lastResetDate: new Date(),
      maxBrokers: 1
    },
    tradingConfig: {
      exchanges: [],
      brokerConfigs: new Map()
    },
    accountStatus: {
      status: 'active'
    }
  };

  // Merge defaults with overrides
  const userData = { ...defaultUser, ...overrides };

  // Create and return the user
  const user = await User.create(userData);
  return user;
}

/**
 * Create multiple test users
 * @param {number} count - Number of users to create
 * @param {Object} overrides - Custom properties to override defaults for all users
 * @returns {Promise<Array<Object>>} Array of created user documents
 */
async function createTestUsers(count, overrides = {}) {
  const users = [];
  for (let i = 0; i < count; i++) {
    const user = await createTestUser(overrides);
    users.push(user);
  }
  return users;
}

module.exports = {
  createTestUser,
  createTestUsers
};
