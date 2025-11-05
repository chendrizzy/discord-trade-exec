/**
 * User Data Management API Routes (GDPR Compliance)
 *
 * API endpoints for user data export and deletion (GDPR Article 15, 17, 20).
 * All routes require authentication.
 */

const express = require('express');
const router = express.Router();
const { generalLimiter } = require('../../middleware/rateLimiter');
const logger = require('../../utils/logger');
const { AppError, ErrorCodes } = require('../../middleware/errorHandler');
const { requireAuth } = require('../../middleware/auth');

// Apply authentication to all routes
router.use(requireAuth);

/**
 * GET /api/user/export
 * Export all user data (GDPR Article 15 - Right of Access, Article 20 - Data Portability)
 *
 * Rate Limit: 10 requests/hour
 *
 * Returns:
 * - Complete user profile
 * - All trades and transaction history
 * - Broker connections
 * - Signal subscriptions
 * - Community memberships
 * - Audit logs
 * - Settings and preferences
 *
 * Format: JSON
 */
router.get('/export', generalLimiter, async (req, res) => {
  try {
    const userId = req.user.id;
    const communityId = req.tenant?.communityId;

    logger.info('[GDPR] User data export requested', {
      userId,
      communityId,
      timestamp: new Date().toISOString()
    });

    // Import models
    const User = require('../../models/User');
    const Trade = require('../../models/Trade');
    const BrokerConnection = require('../../models/BrokerConnection');
    const UserSignalSubscription = require('../../models/UserSignalSubscription');
    const Community = require('../../models/Community');
    const SecurityAudit = require('../../models/SecurityAudit');

    // Fetch user data
    const user = await User.findById(userId).select('-password -__v').lean();
    if (!user) {
      throw new AppError('User not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    // Fetch all associated data
    const [trades, brokerConnections, signalSubscriptions, communities, auditLogs] =
      await Promise.all([
        Trade.find({ userId }).select('-__v').lean(),
        BrokerConnection.find({ userId }).select('-accessToken -refreshToken -__v').lean(),
        UserSignalSubscription.find({ userId }).select('-__v').lean(),
        Community.find({ 'members.userId': userId }).select('name description -__v').lean(),
        SecurityAudit.find({ userId })
          .sort({ timestamp: -1 })
          .limit(100)
          .select('-__v')
          .lean()
      ]);

    // Prepare export data
    const exportData = {
      exportedAt: new Date().toISOString(),
      exportFormat: 'JSON',
      gdprCompliance: {
        article15: 'Right of Access',
        article20: 'Right to Data Portability'
      },
      user: {
        id: user._id,
        discordId: user.discordId,
        username: user.username,
        discriminator: user.discriminator,
        email: user.email,
        avatar: user.avatar,
        roles: user.roles,
        premiumStatus: user.premiumStatus,
        settings: user.settings,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      },
      trades: {
        total: trades.length,
        data: trades.map(trade => ({
          id: trade._id,
          symbol: trade.symbol,
          action: trade.action,
          quantity: trade.quantity,
          price: trade.price,
          profitLoss: trade.profitLoss,
          fees: trade.fees,
          status: trade.status,
          broker: trade.broker,
          executedAt: trade.executedAt,
          createdAt: trade.createdAt
        }))
      },
      brokerConnections: {
        total: brokerConnections.length,
        data: brokerConnections.map(conn => ({
          id: conn._id,
          broker: conn.broker,
          accountId: conn.accountId,
          status: conn.status,
          isActive: conn.isActive,
          isPaper: conn.isPaper,
          connectedAt: conn.createdAt,
          lastSyncAt: conn.updatedAt
        }))
      },
      signalSubscriptions: {
        total: signalSubscriptions.length,
        data: signalSubscriptions.map(sub => ({
          id: sub._id,
          providerId: sub.providerId,
          status: sub.status,
          subscribedAt: sub.subscribedAt,
          expiresAt: sub.expiresAt
        }))
      },
      communities: {
        total: communities.length,
        data: communities.map(comm => ({
          id: comm._id,
          name: comm.name,
          description: comm.description,
          role: comm.members.find(m => m.userId.toString() === userId.toString())?.role
        }))
      },
      auditLogs: {
        total: auditLogs.length,
        recentLogs: auditLogs.map(log => ({
          event: log.event,
          action: log.action,
          resource: log.resource,
          timestamp: log.timestamp,
          metadata: log.metadata
        }))
      }
    };

    // Log successful export
    logger.info('[GDPR] User data exported successfully', {
      userId,
      communityId,
      recordsExported: {
        trades: trades.length,
        brokerConnections: brokerConnections.length,
        signalSubscriptions: signalSubscriptions.length,
        communities: communities.length,
        auditLogs: auditLogs.length
      },
      timestamp: new Date().toISOString()
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="user-data-export-${userId}-${Date.now()}.json"`
    );
    res.status(200).json(exportData);
  } catch (error) {
    logger.error('[GDPR] User data export failed', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      communityId: req.tenant?.communityId,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
});

/**
 * POST /api/user/delete
 * Request account deletion (GDPR Article 17 - Right to Erasure)
 *
 * Rate Limit: 1 request/hour
 *
 * Process:
 * 1. Soft delete user account (mark as deleted)
 * 2. Anonymize personal data
 * 3. Retain audit logs (legal requirement)
 * 4. Remove from active communities
 * 5. Cancel subscriptions
 * 6. Disconnect brokers
 *
 * Note: Complete data deletion happens after 30-day grace period
 */
router.post('/delete', generalLimiter, async (req, res) => {
  try {
    const userId = req.user.id;
    const communityId = req.tenant?.communityId;
    const { confirmDeletion, reason } = req.body;

    // Require explicit confirmation
    if (confirmDeletion !== true) {
      throw new AppError(
        'Account deletion requires explicit confirmation',
        400,
        ErrorCodes.VALIDATION_ERROR
      );
    }

    logger.warn('[GDPR] Account deletion requested', {
      userId,
      communityId,
      reason: reason || 'Not provided',
      timestamp: new Date().toISOString()
    });

    // Import models
    const User = require('../../models/User');
    const BrokerConnection = require('../../models/BrokerConnection');
    const UserSignalSubscription = require('../../models/UserSignalSubscription');
    const Community = require('../../models/Community');

    // Fetch user
    const user = await User.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    // Check if already deleted
    if (user.deletedAt) {
      return res.status(200).json({
        success: true,
        message: 'Account already scheduled for deletion',
        deletionScheduledAt: user.deletedAt,
        permanentDeletionDate: new Date(
          user.deletedAt.getTime() + 30 * 24 * 60 * 60 * 1000
        ).toISOString()
      });
    }

    // Soft delete user (mark for deletion in 30 days)
    const deletionDate = new Date();
    user.deletedAt = deletionDate;
    user.deletionReason = reason || 'User requested account deletion';

    // Anonymize personal data (GDPR Article 17)
    user.email = `deleted_${userId}@deleted.local`;
    user.username = `DeletedUser${userId.toString().slice(-8)}`;
    user.avatar = null;
    user.settings = {};

    await user.save();

    // Deactivate broker connections
    await BrokerConnection.updateMany(
      { userId },
      {
        $set: {
          isActive: false,
          status: 'disconnected',
          deactivatedAt: deletionDate,
          deactivationReason: 'Account deletion requested'
        }
      }
    );

    // Cancel signal subscriptions
    await UserSignalSubscription.updateMany(
      { userId },
      {
        $set: {
          status: 'cancelled',
          cancelledAt: deletionDate,
          cancellationReason: 'Account deletion requested'
        }
      }
    );

    // Remove from communities
    await Community.updateMany(
      { 'members.userId': userId },
      {
        $pull: {
          members: { userId }
        }
      }
    );

    logger.warn('[GDPR] Account soft-deleted successfully', {
      userId,
      communityId,
      deletionScheduledAt: deletionDate,
      permanentDeletionDate: new Date(
        deletionDate.getTime() + 30 * 24 * 60 * 60 * 1000
      ).toISOString(),
      reason: reason || 'Not provided',
      timestamp: new Date().toISOString()
    });

    res.status(200).json({
      success: true,
      message: 'Account deletion scheduled',
      deletionScheduledAt: deletionDate,
      permanentDeletionDate: new Date(
        deletionDate.getTime() + 30 * 24 * 60 * 60 * 1000
      ).toISOString(),
      gracePeriodDays: 30,
      note: 'You have 30 days to cancel this request. After that, your data will be permanently deleted.'
    });
  } catch (error) {
    logger.error('[GDPR] Account deletion failed', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      communityId: req.tenant?.communityId,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
});

/**
 * POST /api/user/delete/cancel
 * Cancel pending account deletion (within 30-day grace period)
 */
router.post('/delete/cancel', generalLimiter, async (req, res) => {
  try {
    const userId = req.user.id;
    const communityId = req.tenant?.communityId;

    logger.info('[GDPR] Cancellation of account deletion requested', {
      userId,
      communityId,
      timestamp: new Date().toISOString()
    });

    const User = require('../../models/User');
    const user = await User.findById(userId);

    if (!user) {
      throw new AppError('User not found', 404, ErrorCodes.RESOURCE_NOT_FOUND);
    }

    if (!user.deletedAt) {
      return res.status(400).json({
        success: false,
        message: 'No pending account deletion found'
      });
    }

    // Check if still within grace period (30 days)
    const gracePeriodEnd = new Date(user.deletedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    if (new Date() > gracePeriodEnd) {
      return res.status(400).json({
        success: false,
        message: 'Grace period has expired. Account deletion cannot be cancelled.'
      });
    }

    // Cancel deletion
    user.deletedAt = null;
    user.deletionReason = null;
    await user.save();

    logger.info('[GDPR] Account deletion cancelled successfully', {
      userId,
      communityId,
      timestamp: new Date().toISOString()
    });

    res.status(200).json({
      success: true,
      message: 'Account deletion cancelled successfully'
    });
  } catch (error) {
    logger.error('[GDPR] Cancellation of account deletion failed', {
      error: error.message,
      stack: error.stack,
      userId: req.user?.id,
      communityId: req.tenant?.communityId,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
});

module.exports = router;
