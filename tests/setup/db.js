/**
 * Test Database Setup
 * Manages MongoDB Memory Server for integration tests
 */

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const logger = require('../../src/utils/logger');

let mongoServer;

/**
 * Connect to in-memory MongoDB
 */
async function connectDB() {
  try {
    // Disconnect from any existing connection first
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }

    // Create MongoDB Memory Server
    mongoServer = await MongoMemoryServer.create({
      binary: {
        version: '7.0.0'
      }
    });

    const mongoUri = mongoServer.getUri();

    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    logger.info('[Test DB] Connected to MongoDB Memory Server', {
      uri: mongoUri
    });
  } catch (error) {
    logger.error('[Test DB] Connection failed', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Disconnect and stop MongoDB Memory Server
 */
async function disconnectDB() {
  try {
    await mongoose.disconnect();

    if (mongoServer) {
      await mongoServer.stop();
    }

    logger.info('[Test DB] Disconnected from MongoDB Memory Server');
  } catch (error) {
    logger.error('[Test DB] Disconnection failed', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Clear all collections
 */
async function clearDB() {
  try {
    const collections = await mongoose.connection.db.collections();

    for (const collection of collections) {
      await collection.deleteMany({});
    }

    logger.info('[Test DB] Cleared all collections');
  } catch (error) {
    logger.error('[Test DB] Clear failed', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

module.exports = {
  connectDB,
  disconnectDB,
  clearDB
};
