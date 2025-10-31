/**
 * AccessAnalyticsService - Access & Denial Analytics
 *
 * Feature: 004-subscription-gating
 * Phase: 9 (Analytics)
 * Task: T067 - Implement analytics query service
 *
 * Purpose: Service layer for access analytics and denial event aggregation
 *
 * This service provides:
 * - Denial event statistics by guild
 * - Trending analysis
 * - User behavior patterns
 * - Time-based metrics (hourly, daily, weekly)
 * - Per-server data isolation
 *
 * @see specs/004-subscription-gating/user-stories.md (US6 - Analytics)
 */

const AccessDenialEvent = require('@models/AccessDenialEvent');
const logger = require('@utils/logger');
const { validateSnowflake } = require('@utils/validators');

class AccessAnalyticsService {
  /**
   * Get comprehensive analytics for a guild
   *
   * @param {string} guildId - Discord guild ID (17-19 digits)
   * @param {Object} options - Query options
   * @param {Date} options.startDate - Start of analysis period
   * @param {Date} options.endDate - End of analysis period
   * @param {string} options.period - Time grouping ('hour', 'day', 'week')
   * @returns {Promise<Object>} Analytics summary
   */
  async getGuildAnalytics(guildId, options = {}) {
    // Validate guild ID
    validateSnowflake(guildId, 'guild');

    // Default to last 7 days
    const startDate = options.startDate || new Date(Date.now() - 7 * 86400000);
    const endDate = options.endDate || new Date();

    try {
      // Run all analytics queries in parallel for performance
      const [
        denialStats,
        mostDeniedUsers,
        timeline,
        commandStats,
        totalDenials,
        uniqueUsers
      ] = await Promise.all([
        this._getDenialReasonStats(guildId, startDate, endDate),
        this._getMostDeniedUsers(guildId, startDate, endDate),
        this._getTimelineStats(guildId, startDate, endDate, options.period),
        this._getCommandStats(guildId, startDate, endDate),
        this._getTotalDenials(guildId, startDate, endDate),
        this._getUniqueUsersDenied(guildId, startDate, endDate)
      ]);

      logger.info('Guild analytics retrieved', {
        guildId,
        startDate,
        endDate,
        totalDenials,
        uniqueUsers
      });

      return {
        guildId,
        period: {
          start: startDate,
          end: endDate
        },
        summary: {
          totalDenials,
          uniqueUsers,
          averageDenialsPerUser: uniqueUsers > 0 ? (totalDenials / uniqueUsers).toFixed(2) : 0
        },
        denialReasons: denialStats,
        mostDeniedUsers: mostDeniedUsers.slice(0, 10), // Top 10
        timeline,
        commandStats,
        generatedAt: new Date()
      };
    } catch (error) {
      logger.error('Failed to get guild analytics', {
        error: error.message,
        stack: error.stack,
        guildId,
        startDate,
        endDate
      });
      throw new Error(`Analytics error: ${error.message}`);
    }
  }

  /**
   * Get analytics for a specific user across all guilds
   *
   * @param {string} userId - Discord user ID (17-19 digits)
   * @param {Date} startDate - Start of analysis period
   * @param {Date} endDate - End of analysis period
   * @returns {Promise<Object>} User analytics
   */
  async getUserAnalytics(userId, startDate = new Date(Date.now() - 7 * 86400000), endDate = new Date()) {
    // Validate user ID
    validateSnowflake(userId, 'user');

    try {
      const events = await AccessDenialEvent.findByUserAndTimeRange(userId, startDate, endDate);

      // Group by guild
      const byGuild = events.reduce((acc, event) => {
        if (!acc[event.guildId]) {
          acc[event.guildId] = [];
        }
        acc[event.guildId].push(event);
        return acc;
      }, {});

      // Group by reason
      const byReason = events.reduce((acc, event) => {
        acc[event.denialReason] = (acc[event.denialReason] || 0) + 1;
        return acc;
      }, {});

      logger.info('User analytics retrieved', {
        userId,
        startDate,
        endDate,
        totalDenials: events.length,
        guilds: Object.keys(byGuild).length
      });

      return {
        userId,
        period: {
          start: startDate,
          end: endDate
        },
        summary: {
          totalDenials: events.length,
          guildsAffected: Object.keys(byGuild).length
        },
        denialReasons: byReason,
        byGuild: Object.entries(byGuild).map(([guildId, guildEvents]) => ({
          guildId,
          denialCount: guildEvents.length
        })),
        recentEvents: events.slice(0, 10), // Most recent 10
        generatedAt: new Date()
      };
    } catch (error) {
      logger.error('Failed to get user analytics', {
        error: error.message,
        stack: error.stack,
        userId,
        startDate,
        endDate
      });
      throw new Error(`Analytics error: ${error.message}`);
    }
  }

  /**
   * Get trending denial patterns for a guild
   *
   * @param {string} guildId - Discord guild ID
   * @param {number} hours - Hours to analyze (default: 24)
   * @returns {Promise<Object>} Trending analysis
   */
  async getTrendingDenials(guildId, hours = 24) {
    validateSnowflake(guildId, 'guild');

    const endDate = new Date();
    const startDate = new Date(Date.now() - hours * 3600000);

    try {
      const events = await AccessDenialEvent.findByGuildAndTimeRange(guildId, startDate, endDate);

      // Calculate hourly buckets
      const hourlyBuckets = {};
      for (let i = 0; i < hours; i++) {
        const hour = new Date(endDate.getTime() - i * 3600000).getHours();
        hourlyBuckets[hour] = 0;
      }

      // Fill buckets
      events.forEach(event => {
        const hour = event.timestamp.getHours();
        hourlyBuckets[hour] = (hourlyBuckets[hour] || 0) + 1;
      });

      // Find peak hour
      let peakHour = 0;
      let peakCount = 0;
      Object.entries(hourlyBuckets).forEach(([hour, count]) => {
        if (count > peakCount) {
          peakHour = parseInt(hour);
          peakCount = count;
        }
      });

      logger.debug('Trending denials analyzed', {
        guildId,
        hours,
        totalDenials: events.length,
        peakHour,
        peakCount
      });

      return {
        guildId,
        period: `last_${hours}_hours`,
        totalDenials: events.length,
        averagePerHour: (events.length / hours).toFixed(2),
        peakActivity: {
          hour: peakHour,
          count: peakCount
        },
        hourlyDistribution: hourlyBuckets
      };
    } catch (error) {
      logger.error('Failed to get trending denials', {
        error: error.message,
        guildId,
        hours
      });
      throw new Error(`Trending analysis error: ${error.message}`);
    }
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Get denial reason statistics
   * @private
   */
  async _getDenialReasonStats(guildId, startDate, endDate) {
    const stats = await AccessDenialEvent.getGuildDenialStats(guildId, startDate);

    // Convert to object format
    return stats.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {
      no_subscription: 0,
      subscription_expired: 0,
      verification_failed: 0
    });
  }

  /**
   * Get most denied users
   * @private
   */
  async _getMostDeniedUsers(guildId, startDate, endDate) {
    return AccessDenialEvent.getMostDeniedUsers(guildId, 10, startDate);
  }

  /**
   * Get timeline statistics (grouped by time period)
   * @private
   */
  async _getTimelineStats(guildId, startDate, endDate, period = 'day') {
    const events = await AccessDenialEvent.findByGuildAndTimeRange(guildId, startDate, endDate);

    // Group by period
    const timeline = {};
    events.forEach(event => {
      let key;
      if (period === 'hour') {
        key = event.timestamp.toISOString().slice(0, 13); // YYYY-MM-DDTHH
      } else if (period === 'week') {
        const weekNum = this._getWeekNumber(event.timestamp);
        key = `${event.timestamp.getFullYear()}-W${weekNum}`;
      } else { // day (default)
        key = event.timestamp.toISOString().slice(0, 10); // YYYY-MM-DD
      }

      timeline[key] = (timeline[key] || 0) + 1;
    });

    return timeline;
  }

  /**
   * Get command-specific statistics
   * @private
   */
  async _getCommandStats(guildId, startDate, endDate) {
    const events = await AccessDenialEvent.findByGuildAndTimeRange(guildId, startDate, endDate);

    // Group by command
    const commandStats = {};
    events.forEach(event => {
      const cmd = event.commandAttempted;
      commandStats[cmd] = (commandStats[cmd] || 0) + 1;
    });

    // Convert to array and sort
    return Object.entries(commandStats)
      .map(([command, count]) => ({ command, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Get total denials count
   * @private
   */
  async _getTotalDenials(guildId, startDate, endDate) {
    const count = await AccessDenialEvent.countDocuments({
      guildId,
      timestamp: { $gte: startDate, $lte: endDate }
    });
    return count;
  }

  /**
   * Get unique users denied count
   * @private
   */
  async _getUniqueUsersDenied(guildId, startDate, endDate) {
    const users = await AccessDenialEvent.distinct('userId', {
      guildId,
      timestamp: { $gte: startDate, $lte: endDate }
    });
    return users.length;
  }

  /**
   * Get ISO week number for a date
   * @private
   */
  _getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }
}

module.exports = { AccessAnalyticsService };
