// Internal utilities and services
const User = require('../../models/User');

/**
 * Revenue Metrics Calculator
 * Calculates MRR, ARR, LTV, and other SaaS metrics
 */
class RevenueMetrics {
  constructor() {
    // Default pricing tiers (can be moved to config)
    this.tierPricing = {
      basic: 49,
      pro: 99,
      premium: 299
    };
  }

  /**
   * Calculate Monthly Recurring Revenue (MRR)
   * @returns {Promise<Object>} MRR metrics
   */
  async calculateMRR() {
    const activeSubscriptions = await User.find({
      'subscription.status': 'active'
    }).select('subscription');

    const monthlyRevenue = activeSubscriptions.reduce((sum, user) => {
      const tier = user.subscription?.tier || 'basic';
      return sum + (this.tierPricing[tier] || 0);
    }, 0);

    const tierBreakdown = await this.getMRRByTier(activeSubscriptions);

    return {
      current: monthlyRevenue,
      byTier: tierBreakdown,
      subscriberCount: activeSubscriptions.length
    };
  }

  /**
   * Calculate Annual Recurring Revenue (ARR)
   * @returns {Promise<Object>} ARR metrics
   */
  async calculateARR() {
    const mrr = await this.calculateMRR();

    return {
      current: mrr.current * 12,
      mrr: mrr.current
    };
  }

  /**
   * Calculate Customer Lifetime Value (LTV)
   * @returns {Promise<Object>} LTV metrics
   */
  async calculateLTV() {
    const avgMonthlyRevenue = await this.getAverageMonthlyRevenue();
    const avgLifetimeMonths = await this.getAverageLifetimeMonths();

    return {
      perUser: avgMonthlyRevenue * avgLifetimeMonths,
      avgLifetimeMonths,
      avgMonthlyRevenue
    };
  }

  /**
   * Calculate churn rate for a given period
   * @param {Date} startDate - Start of period
   * @param {Date} endDate - End of period
   * @returns {Promise<Object>} Churn metrics
   */
  async calculateChurnRate(startDate, endDate) {
    const startOfPeriod = await User.countDocuments({
      'subscription.status': 'active',
      createdAt: { $lt: startDate }
    });

    const churned = await User.countDocuments({
      'subscription.status': 'canceled',
      'subscription.canceledAt': { $gte: startDate, $lte: endDate }
    });

    const churnRate = startOfPeriod > 0 ? (churned / startOfPeriod) * 100 : 0;

    return {
      churnRate: parseFloat(churnRate.toFixed(2)),
      churned,
      startSubscribers: startOfPeriod,
      period: {
        start: startDate,
        end: endDate
      }
    };
  }

  /**
   * Get all key revenue metrics
   * @param {Date} startDate - Optional start date for period-based metrics
   * @param {Date} endDate - Optional end date for period-based metrics
   * @returns {Promise<Object>} Complete revenue metrics
   */
  async getAllMetrics(startDate, endDate) {
    const [mrr, arr, ltv, churn] = await Promise.all([
      this.calculateMRR(),
      this.calculateARR(),
      this.calculateLTV(),
      startDate && endDate ? this.calculateChurnRate(startDate, endDate) : null
    ]);

    return {
      mrr,
      arr,
      ltv,
      churn,
      timestamp: new Date()
    };
  }

  // Private helper methods

  /**
   * Get MRR breakdown by subscription tier
   * @private
   */
  async getMRRByTier(subscriptions) {
    const breakdown = {
      basic: { count: 0, revenue: 0 },
      pro: { count: 0, revenue: 0 },
      premium: { count: 0, revenue: 0 }
    };

    subscriptions.forEach(user => {
      const tier = user.subscription?.tier || 'basic';
      if (breakdown[tier]) {
        breakdown[tier].count++;
        breakdown[tier].revenue += this.tierPricing[tier];
      }
    });

    return breakdown;
  }

  /**
   * Calculate average monthly revenue per user
   * @private
   */
  async getAverageMonthlyRevenue() {
    const activeUsers = await User.countDocuments({
      'subscription.status': 'active'
    });

    if (activeUsers === 0) return 0;

    const mrr = await this.calculateMRR();
    return mrr.current / activeUsers;
  }

  /**
   * Calculate average customer lifetime in months
   * @private
   */
  async getAverageLifetimeMonths() {
    const canceledUsers = await User.find({
      'subscription.status': 'canceled',
      'subscription.canceledAt': { $exists: true }
    }).select('createdAt subscription.canceledAt');

    if (canceledUsers.length === 0) {
      // If no canceled users, use a default estimate
      return 12; // Assume 12 months average
    }

    const totalLifetimeMonths = canceledUsers.reduce((sum, user) => {
      const lifetimeMs = user.subscription.canceledAt - user.createdAt;
      const lifetimeMonths = lifetimeMs / (1000 * 60 * 60 * 24 * 30);
      return sum + lifetimeMonths;
    }, 0);

    return totalLifetimeMonths / canceledUsers.length;
  }
}

// Singleton instance
let instance = null;

/**
 * Get singleton RevenueMetrics instance
 * @returns {RevenueMetrics} Singleton instance
 */
function getRevenueMetricsInstance() {
  if (!instance) {
    instance = new RevenueMetrics();
  }
  return instance;
}

module.exports = RevenueMetrics;
module.exports.getRevenueMetricsInstance = getRevenueMetricsInstance;
