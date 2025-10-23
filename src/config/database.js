'use strict';

/**
 * MongoDB Database Connection Manager
 *
 * Handles MongoDB Atlas connection with:
 * - Automatic reconnection with exponential backoff
 * - Connection pooling configuration
 * - Graceful shutdown
 * - Health check endpoints
 *
 * Constitutional Principle VII: Graceful Error Handling
 */

const mongoose = require('mongoose');
const { getConfig } = require('./env');
const logger = require('../utils/logger');
const logger = require('../utils/logger');

let isConnected = false;
let connectionAttempts = 0;
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 1000; // 1 second

/**
 * MongoDB connection options optimized for production
 */
const connectionOptions = {
  // Connection pool settings
  maxPoolSize: 10,
  minPoolSize: 2,

  // Timeouts
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,

  // Automatic reconnection
  retryWrites: true,
  retryReads: true,

  // Database name from connection string or default
  dbName: 'discord_trade_exec'
};

/**
 * Connect to MongoDB with exponential backoff retry
 * @returns {Promise<mongoose.Connection>}
 */
async function connect() {
  const config = getConfig();

  if (isConnected) {
    logger.info('📊 MongoDB already connected');
    return mongoose.connection;
  }

  try {
    connectionAttempts++;

    console.log(`📊 Connecting to MongoDB (attempt ${connectionAttempts}/${MAX_RETRIES})...`);

    await mongoose.connect(config.MONGODB_URI, connectionOptions);

    isConnected = true;
    connectionAttempts = 0; // Reset on successful connection

    logger.info('✅ MongoDB connected successfully');
    console.log(`   - Database: ${mongoose.connection.name}`);
    console.log(`   - Host: ${mongoose.connection.host}`);

    // Set up connection event listeners
    setupEventListeners();

    return mongoose.connection;
  } catch (error) {
    console.error(`❌ MongoDB connection failed (attempt ${connectionAttempts}):`, error.message);

    if (connectionAttempts < MAX_RETRIES) {
      const delay = INITIAL_RETRY_DELAY * Math.pow(2, connectionAttempts - 1);
      console.log(`   - Retrying in ${delay}ms...`);

      await new Promise(resolve => setTimeout(resolve, delay));
      return connect(); // Recursive retry
    } else {
      logger.error('❌ Max connection retries exceeded. Exiting...');
      throw new Error('Failed to connect to MongoDB after maximum retries');
    }
  }
}

/**
 * Set up MongoDB connection event listeners
 */
function setupEventListeners() {
  mongoose.connection.on('error', err => {
    console.error('❌ MongoDB connection error:', err);
    isConnected = false;
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('⚠️  MongoDB disconnected');
    isConnected = false;

    // Attempt to reconnect
    if (!mongoose.connection.readyState) {
      logger.info('📊 Attempting to reconnect to MongoDB...');
      connect().catch(err => {
        console.error('❌ Reconnection failed:', err.message);
      });
    }
  });

  mongoose.connection.on('reconnected', () => {
    logger.info('✅ MongoDB reconnected');
    isConnected = true;
  });

  // Handle process termination
  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);
}

/**
 * Gracefully disconnect from MongoDB
 * @returns {Promise<void>}
 */
async function disconnect() {
  if (!isConnected) {
    return;
  }

  try {
    await mongoose.connection.close();
    isConnected = false;
    logger.info('✅ MongoDB connection closed gracefully');
  } catch (error) {
    logger.error('❌ Error closing MongoDB connection:', { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown() {
  logger.info('\n📊 Received shutdown signal, closing MongoDB connection...');
  await disconnect();
  process.exit(0);
}

/**
 * Check if MongoDB connection is healthy
 * @returns {Promise<boolean>}
 */
async function healthCheck() {
  try {
    if (!isConnected || mongoose.connection.readyState !== 1) {
      return false;
    }

    // Ping database to verify connection
    await mongoose.connection.db.admin().ping();
    return true;
  } catch (error) {
    console.error('❌ MongoDB health check failed:', error.message);
    return false;
  }
}

/**
 * Get connection status
 * @returns {Object} Connection status information
 */
function getStatus() {
  return {
    connected: isConnected,
    readyState: mongoose.connection.readyState,
    readyStateText: getReadyStateText(mongoose.connection.readyState),
    host: mongoose.connection.host || 'N/A',
    database: mongoose.connection.name || 'N/A'
  };
}

/**
 * Convert readyState number to text
 * @param {number} state - Mongoose connection ready state
 * @returns {string}
 */
function getReadyStateText(state) {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };
  return states[state] || 'unknown';
}

module.exports = {
  connect,
  disconnect,
  healthCheck,
  getStatus,
  mongoose // Export mongoose instance for model registration
};
