/**
 * Database Test Helpers
 *
 * Provides helper functions for test database operations.
 * Works with the global MongoDB Memory Server setup in tests/setup.js
 */

const mongoose = require('mongoose');

/**
 * Setup test database connection
 * Note: MongoDB Memory Server is already set up by global tests/setup.js
 * This function ensures connection is established before tests run
 */
async function setupTestDB() {
  // Global setup.js already handles MongoDB Memory Server setup
  // This is a no-op for compatibility with test patterns
  // Connection is already established in global beforeAll hook
  if (mongoose.connection.readyState === 0) {
    throw new Error('Database not connected. Global setup should handle this.');
  }
}

/**
 * Teardown test database connection
 * Note: Global setup.js afterAll hook handles cleanup
 * This is a compatibility function for test patterns
 */
async function teardownTestDB() {
  // Global setup.js already handles teardown in afterAll hook
  // This is a no-op for compatibility with test patterns
}

/**
 * Clear specified collections or all collections
 * @param {Array<string>} collectionNames - Array of collection names to clear. If empty, clears all.
 */
async function clearCollections(collectionNames = []) {
  const collections = mongoose.connection.collections;

  if (collectionNames.length === 0) {
    // Clear all collections
    for (const key in collections) {
      // Skip AuditLog collection as it's immutable (model prevents deletion)
      if (key === 'auditlogs') continue;
      const collection = collections[key];
      await collection.deleteMany({});
    }
  } else {
    // Clear specified collections only
    for (const name of collectionNames) {
      if (collections[name]) {
        await collections[name].deleteMany({});
      }
    }
  }
}

module.exports = {
  setupTestDB,
  teardownTestDB,
  clearCollections
};
