// Internal utilities and services
const User = require('../../models/User');
const AnalyticsEvent = require('../../models/AnalyticsEvent');

/**
 * Cohort Analysis Service
 * Analyzes user retention and behavior by signup cohorts
 */
class CohortAnalyzer {
  /**
   * Generate cohort retention table
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} Cohort retention data
   */
  async generateRetentionTable(options = {}) {
    const {
      startDate = this.getDefaultStartDate(),
      endDate = new Date(),
      cohortPeriod = 'month', // month or week
      retentionMetric = 'login' // login, trade, subscription
    } = options;

    const cohorts = await this.getCohorts(startDate, endDate, cohortPeriod);
    const retentionData = [];

    for (const cohort of cohorts) {
      const retention = await this.calculateCohortRetention(
        cohort,
        retentionMetric,
        cohortPeriod
      );

      retentionData.push({
        cohortDate: cohort.date,
        cohortSize: cohort.userIds.length,
        retention: retention
      });
    }

    return {
      cohorts: retentionData,
      metric: retentionMetric,
      period: cohortPeriod,
      startDate,
      endDate
    };
  }

  /**
   * Get cohorts for a date range
   * @private
   */
  async getCohorts(startDate, endDate, period) {
    const users = await User.find({
      createdAt: { $gte: startDate, $lte: endDate }
    }).select('_id createdAt');

    // Group users by cohort period
    const cohortMap = new Map();

    users.forEach(user => {
      const cohortKey = this.getCohortKey(user.createdAt, period);

      if (!cohortMap.has(cohortKey)) {
        cohortMap.set(cohortKey, {
          date: new Date(cohortKey),
          userIds: []
        });
      }

      cohortMap.get(cohortKey).userIds.push(user._id);
    });

    return Array.from(cohortMap.values()).sort((a, b) => a.date - b.date);
  }

  /**
   * Calculate retention percentages for a cohort
   * @private
   */
  async calculateCohortRetention(cohort, metric, period) {
    const retention = [];
    const maxPeriods = 12; // Track up to 12 periods
    const cohortStartDate = cohort.date;

    for (let periodIndex = 0; periodIndex < maxPeriods; periodIndex++) {
      const periodStart = this.addPeriods(cohortStartDate, periodIndex, period);
      const periodEnd = this.addPeriods(cohortStartDate, periodIndex + 1, period);

      if (periodEnd > new Date()) break; // Don't analyze future periods

      const activeUsers = await this.getActiveUsers(
        cohort.userIds,
        periodStart,
        periodEnd,
        metric
      );

      const retentionRate = cohort.userIds.length > 0
        ? (activeUsers / cohort.userIds.length) * 100
        : 0;

      retention.push({
        period: periodIndex,
        activeUsers,
        retentionRate: parseFloat(retentionRate.toFixed(2))
      });
    }

    return retention;
  }

  /**
   * Get active users for a period based on metric
   * @private
   */
  async getActiveUsers(userIds, startDate, endDate, metric) {
    const eventTypeMap = {
      login: 'login',
      trade: 'trade_executed',
      subscription: ['subscription_created', 'subscription_renewed']
    };

    const eventTypes = eventTypeMap[metric];

    const query = {
      userId: { $in: userIds },
      timestamp: { $gte: startDate, $lt: endDate }
    };

    if (Array.isArray(eventTypes)) {
      query.eventType = { $in: eventTypes };
    } else {
      query.eventType = eventTypes;
    }

    const events = await AnalyticsEvent.distinct('userId', query);
    return events.length;
  }

  /**
   * Get cohort key for grouping (e.g., "2024-01" for monthly)
   * @private
   */
  getCohortKey(date, period) {
    const d = new Date(date);

    if (period === 'week') {
      // Start of week (Sunday)
      const startOfWeek = new Date(d);
      startOfWeek.setDate(d.getDate() - d.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      return startOfWeek.toISOString().split('T')[0];
    }

    // Default to month
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }

  /**
   * Add periods to a date
   * @private
   */
  addPeriods(date, count, period) {
    const result = new Date(date);

    if (period === 'week') {
      result.setDate(result.getDate() + (count * 7));
    } else {
      result.setMonth(result.getMonth() + count);
    }

    return result;
  }

  /**
   * Get default start date (12 months ago)
   * @private
   */
  getDefaultStartDate() {
    const date = new Date();
    date.setMonth(date.getMonth() - 12);
    date.setDate(1);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  /**
   * Analyze cohort behavior patterns
   * @param {string} cohortId - Cohort identifier (YYYY-MM format)
   * @returns {Promise<Object>} Cohort behavior analysis
   */
  async analyzeCohortBehavior(cohortId) {
    const cohortDate = new Date(cohortId + '-01');
    const nextMonth = new Date(cohortDate);
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    // Get users in this cohort
    const users = await User.find({
      createdAt: { $gte: cohortDate, $lt: nextMonth }
    }).select('_id subscription stats');

    if (users.length === 0) {
      return null;
    }

    // Analyze subscription tiers
    const tierDistribution = {
      basic: 0,
      pro: 0,
      premium: 0
    };

    let totalTrades = 0;
    let totalProfit = 0;
    let activeSubscriptions = 0;

    users.forEach(user => {
      const tier = user.subscription?.tier || 'basic';
      tierDistribution[tier]++;

      if (user.subscription?.status === 'active') {
        activeSubscriptions++;
      }

      totalTrades += user.stats?.totalTrades || 0;
      totalProfit += user.stats?.totalProfit || user.stats?.netProfit || 0;
    });

    return {
      cohortId,
      cohortSize: users.length,
      activeSubscriptions,
      retentionRate: (activeSubscriptions / users.length) * 100,
      tierDistribution,
      avgTradesPerUser: totalTrades / users.length,
      avgProfitPerUser: totalProfit / users.length,
      totalRevenue: this.calculateCohortRevenue(tierDistribution)
    };
  }

  /**
   * Calculate revenue for a cohort based on tier distribution
   * @private
   */
  calculateCohortRevenue(tierDistribution) {
    const tierPricing = {
      basic: 49,
      pro: 99,
      premium: 299
    };

    return Object.entries(tierDistribution).reduce((sum, [tier, count]) => {
      return sum + (tierPricing[tier] || 0) * count;
    }, 0);
  }

  /**
   * Compare multiple cohorts
   * @param {Array<string>} cohortIds - Array of cohort IDs to compare
   * @returns {Promise<Object>} Comparison data
   */
  async compareCohorts(cohortIds) {
    const comparisons = [];

    for (const cohortId of cohortIds) {
      const analysis = await this.analyzeCohortBehavior(cohortId);
      if (analysis) {
        comparisons.push(analysis);
      }
    }

    // Calculate averages and trends
    const avgRetention = comparisons.reduce((sum, c) => sum + c.retentionRate, 0) / comparisons.length;
    const avgTradesPerUser = comparisons.reduce((sum, c) => sum + c.avgTradesPerUser, 0) / comparisons.length;

    return {
      cohorts: comparisons,
      averages: {
        retentionRate: avgRetention,
        tradesPerUser: avgTradesPerUser
      },
      trend: this.calculateTrend(comparisons)
    };
  }

  /**
   * Calculate trend direction
   * @private
   */
  calculateTrend(comparisons) {
    if (comparisons.length < 2) return 'insufficient_data';

    const first = comparisons[0];
    const last = comparisons[comparisons.length - 1];

    if (last.retentionRate > first.retentionRate * 1.1) return 'improving';
    if (last.retentionRate < first.retentionRate * 0.9) return 'declining';
    return 'stable';
  }
}

module.exports = CohortAnalyzer;
