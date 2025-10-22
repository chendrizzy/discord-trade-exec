'use strict';

const AuditLog = require('../models/AuditLog');
const logger = require('../middleware/logger');

/**
 * AuditLogService - Write-only API for immutable audit logging
 *
 * Constitutional Requirements:
 * - Principle I: Security-First (immutable audit trail)
 * - Principle VI: Observability (comprehensive logging with sanitization)
 * - Principle VII: Graceful Error Handling (never throw on logging failures)
 *
 * Features:
 * - Append-only writes (no updates/deletes exposed)
 * - Automatic SHA-256 hash chaining
 * - Async/non-blocking (doesn't slow down main operations)
 * - Graceful degradation (logs errors but never throws)
 * - Query interface with filters (admin-only access assumed)
 */

class AuditLogService {
  /**
   * Write a new audit log entry (append-only)
   *
   * @param {Object} params - Log entry parameters
   * @param {ObjectId} params.userId - User who performed the action
   * @param {string} params.action - Action type (enum from AuditLog schema)
   * @param {string} params.resourceType - Type of resource affected
   * @param {ObjectId} [params.resourceId] - ID of resource affected (optional)
   * @param {string} params.ipAddress - IP address of the actor
   * @param {string} [params.userAgent] - User agent string (optional)
   * @param {string} params.status - 'success' or 'failure'
   * @param {string} [params.errorMessage] - Error message (if status=failure)
   * @param {Object} [params.metadata] - Additional context (JSON object)
   * @returns {Promise<AuditLog>} - Created audit log document
   */
  static async write({
    userId,
    action,
    resourceType,
    resourceId = null,
    ipAddress,
    userAgent = null,
    status,
    errorMessage = null,
    metadata = null
  }) {
    try {
      // Input validation
      if (!userId || !action || !resourceType || !ipAddress || !status) {
        throw new Error('Missing required audit log fields');
      }

      if (!['success', 'failure'].includes(status)) {
        throw new Error(`Invalid status: ${status}. Must be 'success' or 'failure'`);
      }

      // Get the most recent log entry to retrieve previousHash
      const lastLog = await AuditLog.findOne().sort({ timestamp: -1 }).limit(1).lean();
      const previousHash = lastLog ? lastLog.currentHash : null;

      // Create timestamp
      const timestamp = new Date();

      // Compute current hash using static method
      const currentHash = AuditLog.computeHash({
        previousHash,
        timestamp,
        userId,
        action,
        resourceId
      });

      // Create log entry
      const logEntry = new AuditLog({
        timestamp,
        userId,
        action,
        resourceType,
        resourceId,
        ipAddress,
        userAgent,
        status,
        errorMessage,
        metadata,
        previousHash,
        currentHash
      });

      // Save to database (append-only)
      await logEntry.save();

      // Log success to Winston (debug level to avoid recursive logging)
      logger.debug('Audit log written', {
        action,
        userId: userId.toString(),
        resourceType,
        status
      });

      return logEntry;
    } catch (error) {
      // CRITICAL: Never throw on audit log failures (graceful degradation)
      // Log to Winston error channel for monitoring
      logger.error('Failed to write audit log', {
        error: error.message,
        stack: error.stack,
        action,
        userId: userId ? userId.toString() : 'unknown',
        status
      });

      // Return null instead of throwing (allows main operation to proceed)
      return null;
    }
  }

  /**
   * Write a TRADE_EXECUTED audit log (convenience method)
   */
  static async logTradeExecution({
    userId,
    tradeId,
    ipAddress,
    userAgent,
    symbol,
    quantity,
    price,
    orderType,
    broker,
    status,
    errorMessage = null
  }) {
    return this.write({
      userId,
      action: 'TRADE_EXECUTED',
      resourceType: 'Trade',
      resourceId: tradeId,
      ipAddress,
      userAgent,
      status,
      errorMessage,
      metadata: { symbol, quantity, price, orderType, broker }
    });
  }

  /**
   * Write a LOGIN_SUCCESS audit log (convenience method)
   */
  static async logLoginSuccess({ userId, ipAddress, userAgent }) {
    return this.write({
      userId,
      action: 'LOGIN_SUCCESS',
      resourceType: 'User',
      resourceId: userId,
      ipAddress,
      userAgent,
      status: 'success'
    });
  }

  /**
   * Write a LOGIN_FAILED audit log (convenience method)
   */
  static async logLoginFailure({ userId, ipAddress, userAgent, reason }) {
    return this.write({
      userId,
      action: 'LOGIN_FAILED',
      resourceType: 'User',
      resourceId: userId,
      ipAddress,
      userAgent,
      status: 'failure',
      errorMessage: reason,
      metadata: { failureReason: reason }
    });
  }

  /**
   * Write a CREDENTIALS_UPDATED audit log (convenience method)
   */
  static async logCredentialsUpdate({ userId, brokerConnectionId, ipAddress, userAgent, broker, changedFields }) {
    return this.write({
      userId,
      action: 'CREDENTIALS_UPDATED',
      resourceType: 'BrokerConnection',
      resourceId: brokerConnectionId,
      ipAddress,
      userAgent,
      status: 'success',
      metadata: { broker, changedFields }
    });
  }

  /**
   * Write a SUBSCRIPTION_CHARGED audit log (convenience method)
   */
  static async logSubscriptionCharge({
    userId,
    subscriptionId,
    ipAddress,
    amount,
    plan,
    billingProvider,
    status,
    errorMessage = null
  }) {
    return this.write({
      userId,
      action: 'SUBSCRIPTION_CHARGED',
      resourceType: 'Subscription',
      resourceId: subscriptionId,
      ipAddress,
      userAgent: 'billing-webhook',
      status,
      errorMessage,
      metadata: { amount, plan, billingProvider }
    });
  }

  /**
   * Query audit logs with filters (admin-only, read-only)
   *
   * @param {Object} filters - Query filters
   * @param {ObjectId} [filters.userId] - Filter by user
   * @param {string} [filters.action] - Filter by action type
   * @param {string} [filters.status] - Filter by status (success/failure)
   * @param {Date} [filters.startDate] - Start of date range
   * @param {Date} [filters.endDate] - End of date range
   * @param {number} [filters.limit=100] - Max results to return
   * @param {number} [filters.skip=0] - Results to skip (pagination)
   * @returns {Promise<Array<AuditLog>>} - Array of matching logs
   */
  static async query({
    userId = null,
    action = null,
    status = null,
    startDate = null,
    endDate = null,
    limit = 100,
    skip = 0
  } = {}) {
    try {
      const query = {};

      // Build query filters
      if (userId) query.userId = userId;
      if (action) query.action = action;
      if (status) query.status = status;

      // Date range filter
      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = startDate;
        if (endDate) query.timestamp.$lte = endDate;
      }

      // Execute query with pagination
      const logs = await AuditLog.find(query)
        .sort({ timestamp: -1 }) // Most recent first
        .limit(Math.min(limit, 1000)) // Cap at 1000 for performance
        .skip(skip)
        .populate('userId', 'email discordId') // Include basic user info
        .lean(); // Return plain objects (faster)

      return logs;
    } catch (error) {
      logger.error('Failed to query audit logs', {
        error: error.message,
        filters: { userId, action, status, startDate, endDate }
      });
      throw error; // Query failures should throw (admin operation)
    }
  }

  /**
   * Count audit logs matching filters (for pagination)
   */
  static async count({ userId = null, action = null, status = null, startDate = null, endDate = null } = {}) {
    try {
      const query = {};

      if (userId) query.userId = userId;
      if (action) query.action = action;
      if (status) query.status = status;

      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = startDate;
        if (endDate) query.timestamp.$lte = endDate;
      }

      return await AuditLog.countDocuments(query);
    } catch (error) {
      logger.error('Failed to count audit logs', {
        error: error.message,
        filters: { userId, action, status, startDate, endDate }
      });
      throw error;
    }
  }

  /**
   * Verify hash chain integrity for a user's logs
   *
   * @param {ObjectId} userId - User to verify logs for
   * @param {Date} [startDate] - Optional start date
   * @param {Date} [endDate] - Optional end date
   * @returns {Promise<Object>} - { valid: boolean, brokenAt: index | null, message: string }
   */
  static async verifyIntegrity({ userId, startDate = null, endDate = null }) {
    try {
      const query = { userId };

      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = startDate;
        if (endDate) query.timestamp.$lte = endDate;
      }

      // Fetch logs sorted by timestamp (oldest first for chain verification)
      const logs = await AuditLog.find(query).sort({ timestamp: 1 }).lean();

      if (logs.length === 0) {
        return { valid: true, message: 'No logs found for verification' };
      }

      // Use static method from schema
      const result = await AuditLog.verifyHashChain(logs);

      if (!result.valid) {
        // Log integrity violation (critical security event)
        logger.error('Audit log integrity violation detected', {
          userId: userId.toString(),
          brokenAt: result.brokenAt,
          logId: result.logId,
          message: result.message
        });
      }

      return result;
    } catch (error) {
      logger.error('Failed to verify audit log integrity', {
        error: error.message,
        userId: userId ? userId.toString() : 'unknown'
      });
      throw error;
    }
  }

  /**
   * Export audit logs to CSV format (compliance reporting)
   *
   * @param {Object} filters - Same filters as query()
   * @returns {Promise<string>} - CSV string
   */
  static async exportToCSV(filters = {}) {
    try {
      const logs = await this.query({ ...filters, limit: 10000 }); // Max 10k for export

      // CSV header
      const header = [
        'Timestamp',
        'User ID',
        'Action',
        'Resource Type',
        'Resource ID',
        'IP Address',
        'Status',
        'Error Message',
        'Current Hash'
      ].join(',');

      // CSV rows
      const rows = logs.map(log =>
        [
          log.timestamp.toISOString(),
          log.userId._id || log.userId,
          log.action,
          log.resourceType,
          log.resourceId || '',
          log.ipAddress,
          log.status,
          log.errorMessage ? `"${log.errorMessage.replace(/"/g, '""')}"` : '',
          log.currentHash
        ].join(',')
      );

      return [header, ...rows].join('\n');
    } catch (error) {
      logger.error('Failed to export audit logs to CSV', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get statistics for a time period (monitoring dashboard)
   */
  static async getStatistics({ startDate, endDate }) {
    try {
      const match = {
        timestamp: { $gte: startDate, $lte: endDate }
      };

      const stats = await AuditLog.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$action',
            count: { $sum: 1 },
            successCount: {
              $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] }
            },
            failureCount: {
              $sum: { $cond: [{ $eq: ['$status', 'failure'] }, 1, 0] }
            }
          }
        },
        { $sort: { count: -1 } }
      ]);

      return stats;
    } catch (error) {
      logger.error('Failed to get audit log statistics', {
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = AuditLogService;
