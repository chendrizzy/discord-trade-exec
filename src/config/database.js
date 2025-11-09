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

/**
 * @typedef {Object} ConnectionOptions
 * @property {number} maxPoolSize - Maximum connection pool size
 * @property {number} minPoolSize - Minimum connection pool size
 * @property {number} serverSelectionTimeoutMS - Server selection timeout
 * @property {number} socketTimeoutMS - Socket timeout
 * @property {boolean} retryWrites - Enable write retries
 * @property {boolean} retryReads - Enable read retries
 * @property {string} dbName - Database name
 */

/**
 * @typedef {Object} ConnectionStatus
 * @property {boolean} connected - Connection status
 * @property {number} readyState - Mongoose ready state (0-3)
 * @property {string} readyStateText - Human-readable ready state
 * @property {string} host - Database host
 * @property {string} database - Database name
 */

/**
 * @typedef {Object} SlowQuery
 * @property {string} operation - Query operation type
 * @property {string} collection - Collection namespace
 * @property {string} duration - Query duration in milliseconds
 * @property {Date} timestamp - Query timestamp
 * @property {string} [plan] - Query plan summary
 */

/**
 * @typedef {Object} ProfilingStats
 * @property {boolean} enabled - Profiling enabled status
 * @property {number} [profilingLevel] - MongoDB profiling level
 * @property {number} [slowThreshold] - Slow query threshold in ms
 * @property {number} [slowQueriesThisHour] - Count of slow queries this hour
 * @property {number} [alertThreshold] - Alert threshold for slow queries
 * @property {number} [totalSlowQueriesLogged] - Total slow queries in profile collection
 * @property {SlowQuery[]} [recentSlowQueries] - Recent slow queries
 * @property {string} [error] - Error message if stats retrieval failed
 */

/**
 * @typedef {Object} QueryLogEntry
 * @property {string} queryType - Type of query operation
 * @property {Object} params - Query parameters
 * @property {number} executionTime - Execution time in milliseconds
 * @property {string} collection - Collection name
 * @property {number} resultSize - Number of results returned
 * @property {Date} timestamp - Query timestamp
 */

/** @type {boolean} */
let isConnected = false;
/** @type {number} */
let connectionAttempts = 0;
/** @type {number} */
const MAX_RETRIES = 5;
/** @type {number} */
const INITIAL_RETRY_DELAY = 1000; // 1 second

// Slow query profiling state (US2-T05)
/** @type {boolean} */
let profilingEnabled = false;
/** @type {number} */
let slowQueryCount = 0;
/** @type {NodeJS.Timeout | null} */
let slowQueryResetInterval = null;
/** @type {number} */
const SLOW_QUERY_THRESHOLD = 100; // milliseconds
/** @type {number} */
const SLOW_QUERY_ALERT_THRESHOLD = 10; // queries per hour

/**
 * MongoDB connection options optimized for production
 * @type {ConnectionOptions}
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

    logger.info('[Database] Connecting to MongoDB', {
      attempt: connectionAttempts,
      maxRetries: MAX_RETRIES
    });

    await mongoose.connect(config.MONGODB_URI, connectionOptions);

    isConnected = true;
    connectionAttempts = 0; // Reset on successful connection

    logger.info('[Database] MongoDB connected successfully', {
      database: mongoose.connection.name,
      host: mongoose.connection.host,
      readyState: mongoose.connection.readyState
    });

    // Set up connection event listeners
    setupEventListeners();

    // Enable slow query profiling in production and staging (US2-T05)
    if (config.NODE_ENV === 'production' || config.NODE_ENV === 'staging') {
      await enableSlowQueryProfiling();
    }

    // Set up query pattern logging middleware (US6-T03)
    setupQueryPatternLogging();

    return mongoose.connection;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    logger.error('[Database] MongoDB connection failed', {
      attempt: connectionAttempts,
      maxRetries: MAX_RETRIES,
      error: errorMessage,
      stack: errorStack
    });

    if (connectionAttempts < MAX_RETRIES) {
      const delay = INITIAL_RETRY_DELAY * Math.pow(2, connectionAttempts - 1);
      logger.info('[Database] Retrying connection', {
        delayMs: delay,
        nextAttempt: connectionAttempts + 1
      });

      await new Promise(resolve => setTimeout(resolve, delay));
      return connect(); // Recursive retry
    } else {
      logger.error('[Database] Max connection retries exceeded');
      throw new Error('Failed to connect to MongoDB after maximum retries');
    }
  }
}

/**
 * Set up MongoDB connection event listeners
 * @returns {void}
 */
function setupEventListeners() {
  mongoose.connection.on('error', err => {
    logger.error('[Database] MongoDB connection error', {
      error: err.message,
      stack: err.stack,
      readyState: mongoose.connection.readyState
    });
    isConnected = false;
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('⚠️  MongoDB disconnected');
    isConnected = false;

    // Attempt to reconnect
    if (!mongoose.connection.readyState) {
      logger.info('[Database] Attempting to reconnect to MongoDB');
      connect().catch(err => {
        logger.error('[Database] Reconnection failed', {
          error: err.message,
          stack: err.stack
        });
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error('❌ Error closing MongoDB connection:', {
      error: errorMessage,
      stack: errorStack
    });
    throw error;
  }
}

/**
 * Graceful shutdown handler
 * @returns {Promise<void>}
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

    // Check if db is available before pinging
    if (!mongoose.connection.db) {
      logger.warn('[Database] MongoDB connection.db is undefined');
      return false;
    }

    // Ping database to verify connection
    await mongoose.connection.db.admin().ping();
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    logger.error('[Database] MongoDB health check failed', {
      error: errorMessage,
      stack: errorStack,
      readyState: mongoose.connection.readyState
    });
    return false;
  }
}

/**
 * Get connection status
 * @returns {ConnectionStatus} Connection status information
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

/**
 * Enable MongoDB slow query profiling (US2-T05)
 * Profiles queries slower than 100ms threshold
 * @returns {Promise<void>}
 */
async function enableSlowQueryProfiling() {
  try {
    const db = mongoose.connection.db;

    // Set profiling level 1 (slow queries only) with 100ms threshold
    await db.command({
      profile: 1,
      slowms: SLOW_QUERY_THRESHOLD
    });

    profilingEnabled = true;
    logger.info(`✅ MongoDB slow query profiling enabled (threshold: ${SLOW_QUERY_THRESHOLD}ms)`);

    // Start monitoring slow queries
    startSlowQueryMonitoring();

    // Reset slow query counter every hour
    slowQueryResetInterval = setInterval(() => {
      slowQueryCount = 0;
      logger.debug('🔄 Slow query counter reset');
    }, 60 * 60 * 1000); // 1 hour
  } catch (error) {
    logger.error('❌ Failed to enable slow query profiling:', {
      error: error.message,
      stack: error.stack
    });
  }
}

/**
 * Disable MongoDB slow query profiling
 * @returns {Promise<void>}
 */
async function disableSlowQueryProfiling() {
  try {
    if (!profilingEnabled) {
      return;
    }

    const db = mongoose.connection.db;
    await db.command({ profile: 0 });

    profilingEnabled = false;
    logger.info('✅ MongoDB slow query profiling disabled');

    if (slowQueryResetInterval) {
      clearInterval(slowQueryResetInterval);
      slowQueryResetInterval = null;
    }
  } catch (error) {
    logger.error('❌ Failed to disable slow query profiling:', {
      error: error.message,
      stack: error.stack
    });
  }
}

/**
 * Start monitoring slow queries from system.profile collection
 * Runs every 30 seconds to check for new slow queries
 * @returns {void}
 */
function startSlowQueryMonitoring() {
  let lastCheckTime = new Date();

  setInterval(async () => {
    try {
      const db = mongoose.connection.db;
      const currentTime = new Date();

      // Query system.profile for slow queries since last check
      const slowQueries = await db
        .collection('system.profile')
        .find({
          ts: { $gte: lastCheckTime },
          millis: { $gte: SLOW_QUERY_THRESHOLD }
        })
        .sort({ ts: -1 })
        .limit(50)
        .toArray();

      if (slowQueries.length > 0) {
        slowQueryCount += slowQueries.length;

        // Log each slow query with details
        for (const query of slowQueries) {
          logger.warn('⚠️  Slow query detected', {
            operation: query.op,
            namespace: query.ns,
            duration: `${query.millis}ms`,
            command: sanitizeQueryCommand(query.command),
            planSummary: query.planSummary,
            executionStats: query.execStats,
            timestamp: query.ts
          });
        }

        // Alert if threshold exceeded
        if (slowQueryCount >= SLOW_QUERY_ALERT_THRESHOLD) {
          logger.error(`🚨 ALERT: ${slowQueryCount} slow queries detected in the last hour (threshold: ${SLOW_QUERY_ALERT_THRESHOLD})`, {
            threshold: SLOW_QUERY_ALERT_THRESHOLD,
            count: slowQueryCount,
            recommendation: 'Review slow queries and consider adding indexes or optimizing queries'
          });
        }
      }

      lastCheckTime = currentTime;
    } catch (error) {
      logger.error('❌ Error monitoring slow queries:', {
        error: error.message,
        stack: error.stack
      });
    }
  }, 30 * 1000); // Check every 30 seconds
}

/**
 * Sanitize query command for logging (remove sensitive data)
 * @param {Object} command - MongoDB command object
 * @returns {Object} Sanitized command
 */
function sanitizeQueryCommand(command) {
  if (!command) return {};

  // Create shallow copy
  const sanitized = { ...command };

  // Remove potentially sensitive fields
  const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'authorization'];
  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }

  // Limit query object size for logging
  if (sanitized.filter && JSON.stringify(sanitized.filter).length > 500) {
    sanitized.filter = '[TRUNCATED - TOO LARGE]';
  }

  return sanitized;
}

/**
 * Get slow query profiling statistics
 * @returns {Promise<ProfilingStats>} Profiling stats
 */
async function getProfilingStats() {
  try {
    const db = mongoose.connection.db;

    // Get profiling status
    const status = await db.command({ profile: -1 });

    // Get slow query count from system.profile
    const profileCollection = db.collection('system.profile');
    const totalSlowQueries = await profileCollection.countDocuments({
      millis: { $gte: SLOW_QUERY_THRESHOLD }
    });

    // Get recent slow queries (last 10)
    const recentSlowQueries = await profileCollection
      .find({ millis: { $gte: SLOW_QUERY_THRESHOLD } })
      .sort({ ts: -1 })
      .limit(10)
      .project({
        op: 1,
        ns: 1,
        millis: 1,
        ts: 1,
        planSummary: 1
      })
      .toArray();

    return {
      enabled: profilingEnabled,
      profilingLevel: status.was,
      slowThreshold: SLOW_QUERY_THRESHOLD,
      slowQueriesThisHour: slowQueryCount,
      alertThreshold: SLOW_QUERY_ALERT_THRESHOLD,
      totalSlowQueriesLogged: totalSlowQueries,
      recentSlowQueries: recentSlowQueries.map(q => ({
        operation: q.op,
        collection: q.ns,
        duration: `${q.millis}ms`,
        timestamp: q.ts,
        plan: q.planSummary
      }))
    };
  } catch (error) {
    logger.error('❌ Failed to get profiling stats:', {
      error: error.message,
      stack: error.stack
    });
    return {
      enabled: profilingEnabled,
      error: error.message
    };
  }
}

/**
 * Set up query pattern logging middleware (US6-T03)
 * Instruments all Mongoose queries to track performance
 * @returns {void}
 */
function setupQueryPatternLogging() {
  const { getQueryLoggerInstance } = require('../utils/analytics-query-logger');
  const queryLogger = getQueryLoggerInstance();

  logger.info('🔍 Setting up query pattern logging middleware (US6-T03)');

  // Hook into all query operations
  mongoose.plugin(schema => {
    // Track find operations
    schema.pre('find', function() {
      this._startTime = Date.now();
    });

    schema.post('find', function(result) {
      if (this._startTime) {
        const executionTime = Date.now() - this._startTime;
        queryLogger.logQuery({
          queryType: 'find',
          params: this.getFilter(),
          executionTime,
          collection: this.mongooseCollection?.name || 'unknown',
          resultSize: Array.isArray(result) ? result.length : 0,
          timestamp: new Date()
        });
      }
    });

    // Track findOne operations
    schema.pre('findOne', function() {
      this._startTime = Date.now();
    });

    schema.post('findOne', function(result) {
      if (this._startTime) {
        const executionTime = Date.now() - this._startTime;
        queryLogger.logQuery({
          queryType: 'findOne',
          params: this.getFilter(),
          executionTime,
          collection: this.mongooseCollection?.name || 'unknown',
          resultSize: result ? 1 : 0,
          timestamp: new Date()
        });
      }
    });

    // Track update operations
    schema.pre('updateOne', function() {
      this._startTime = Date.now();
    });

    schema.post('updateOne', function(result) {
      if (this._startTime) {
        const executionTime = Date.now() - this._startTime;
        queryLogger.logQuery({
          queryType: 'updateOne',
          params: this.getFilter(),
          executionTime,
          collection: this.mongooseCollection?.name || 'unknown',
          resultSize: result?.modifiedCount || 0,
          timestamp: new Date()
        });
      }
    });

    // Track updateMany operations
    schema.pre('updateMany', function() {
      this._startTime = Date.now();
    });

    schema.post('updateMany', function(result) {
      if (this._startTime) {
        const executionTime = Date.now() - this._startTime;
        queryLogger.logQuery({
          queryType: 'updateMany',
          params: this.getFilter(),
          executionTime,
          collection: this.mongooseCollection?.name || 'unknown',
          resultSize: result?.modifiedCount || 0,
          timestamp: new Date()
        });
      }
    });

    // Track deleteOne operations
    schema.pre('deleteOne', function() {
      this._startTime = Date.now();
    });

    schema.post('deleteOne', function(result) {
      if (this._startTime) {
        const executionTime = Date.now() - this._startTime;
        queryLogger.logQuery({
          queryType: 'deleteOne',
          params: this.getFilter(),
          executionTime,
          collection: this.mongooseCollection?.name || 'unknown',
          resultSize: result?.deletedCount || 0,
          timestamp: new Date()
        });
      }
    });

    // Track deleteMany operations
    schema.pre('deleteMany', function() {
      this._startTime = Date.now();
    });

    schema.post('deleteMany', function(result) {
      if (this._startTime) {
        const executionTime = Date.now() - this._startTime;
        queryLogger.logQuery({
          queryType: 'deleteMany',
          params: this.getFilter(),
          executionTime,
          collection: this.mongooseCollection?.name || 'unknown',
          resultSize: result?.deletedCount || 0,
          timestamp: new Date()
        });
      }
    });

    // Track countDocuments operations
    schema.pre('countDocuments', function() {
      this._startTime = Date.now();
    });

    schema.post('countDocuments', function(result) {
      if (this._startTime) {
        const executionTime = Date.now() - this._startTime;
        queryLogger.logQuery({
          queryType: 'countDocuments',
          params: this.getFilter(),
          executionTime,
          collection: this.mongooseCollection?.name || 'unknown',
          resultSize: result || 0,
          timestamp: new Date()
        });
      }
    });

    // Track aggregate operations
    schema.pre('aggregate', function() {
      this._startTime = Date.now();
    });

    schema.post('aggregate', function(result) {
      if (this._startTime) {
        const executionTime = Date.now() - this._startTime;
        queryLogger.logQuery({
          queryType: 'aggregate',
          params: { pipeline: this.pipeline ? this.pipeline() : [] },
          executionTime,
          collection: this.mongooseCollection?.name || 'unknown',
          resultSize: Array.isArray(result) ? result.length : 0,
          timestamp: new Date()
        });
      }
    });
  });

  logger.info('✅ Query pattern logging middleware configured for all models');
}

module.exports = {
  connect,
  disconnect,
  healthCheck,
  getStatus,
  enableSlowQueryProfiling,
  disableSlowQueryProfiling,
  getProfilingStats,
  mongoose // Export mongoose instance for model registration
};
