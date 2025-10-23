'use strict';

/**
 * Analytics Service
 *
 * Provides SaaS business metrics and analytics:
 * - MRR (Monthly Recurring Revenue)
 * - ARR (Annual Recurring Revenue)
 * - Churn Rate
 * - Growth Rate
 * - LTV (Customer Lifetime Value)
 * - Cohort Analysis
 *
 * Constitutional Requirements:
 * - Principle VI: Observability (business metrics tracking)
 *
 * User Story: US-005 (Analytics Platform & Business Intelligence)
 */

const Subscription = require('../models/Subscription');
const User = require('../models/User');
const logger = require('../middleware/logger');
const redis = require('../config/redis');

class AnalyticsService {
  constructor() {
    this.cacheTTL = 3600; // 1 hour cache for analytics data
    this.tierPricing = {
      free: 0,
      basic: 29, // $29/month
      pro: 99, // $99/month
      enterprise: 299 // $299/month
    };
  }

  /**
   * Calculate Monthly Recurring Revenue (MRR)
   *
   * @param {Object} options - Calculation options
   * @param {Date} options.asOf - Calculate MRR as of this date (default: now)
   * @param {boolean} options.byTier - Break down by subscription tier
   * @param {boolean} options.useCache - Use Redis cache (default: true)
   * @returns {Promise<Object>} MRR data
   */
  async calculateMRR(options = {}) {
    const { asOf = new Date(), byTier = false, useCache = true } = options;

    const cacheKey = `analytics:mrr:${asOf.toISOString().split('T')[0]}:${byTier}`;

    // Check cache
    if (useCache) {
      const cached = await this._getFromCache(cacheKey);
      if (cached) {
        logger.debug('MRR calculation returned from cache', { asOf });
        return cached;
      }
    }

    try {
      // Aggregate active subscriptions as of the specified date
      const pipeline = [
        {
          $match: {
            status: 'active',
            currentPeriodStart: { $lte: asOf },
            $or: [{ currentPeriodEnd: { $gte: asOf } }, { currentPeriodEnd: null }]
          }
        },
        {
          $group: {
            _id: byTier ? '$tier' : null,
            subscriptionCount: { $sum: 1 },
            totalAmount: { $sum: '$amount' }
          }
        }
      ];

      const results = await Subscription.aggregate(pipeline);

      let mrr;

      if (byTier) {
        // MRR by tier
        mrr = {
          total: 0,
          byTier: {},
          subscriptionCount: 0
        };

        results.forEach(result => {
          const tier = result._id || 'unknown';
          const monthlyRevenue = this._normalizeToMonthly(result.totalAmount, 'month');

          mrr.byTier[tier] = {
            mrr: monthlyRevenue,
            subscriptionCount: result.subscriptionCount,
            averageRevenuePerUser: monthlyRevenue / result.subscriptionCount
          };

          mrr.total += monthlyRevenue;
          mrr.subscriptionCount += result.subscriptionCount;
        });

        mrr.averageRevenuePerUser = mrr.total / (mrr.subscriptionCount || 1);
      } else {
        // Total MRR
        const totalAmount = results.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
        const subscriptionCount = results.reduce((sum, r) => sum + (r.subscriptionCount || 0), 0);

        mrr = {
          total: this._normalizeToMonthly(totalAmount, 'month'),
          subscriptionCount,
          averageRevenuePerUser: this._normalizeToMonthly(totalAmount, 'month') / (subscriptionCount || 1),
          asOf: asOf.toISOString()
        };
      }

      // Cache result
      if (useCache) {
        await this._setCache(cacheKey, mrr, this.cacheTTL);
      }

      logger.info('MRR calculated', {
        total: mrr.total,
        subscriptionCount: mrr.subscriptionCount,
        asOf
      });

      return mrr;
    } catch (error) {
      logger.error('Failed to calculate MRR', { error: error.message });
      throw new Error(`MRR calculation failed: ${error.message}`);
    }
  }

  /**
   * Calculate Annual Recurring Revenue (ARR)
   *
   * @param {Object} options - Calculation options
   * @param {Date} options.asOf - Calculate ARR as of this date (default: now)
   * @param {boolean} options.byTier - Break down by subscription tier
   * @param {boolean} options.useCache - Use Redis cache (default: true)
   * @returns {Promise<Object>} ARR data
   */
  async calculateARR(options = {}) {
    const mrr = await this.calculateMRR(options);

    const arr = {
      total: mrr.total * 12,
      subscriptionCount: mrr.subscriptionCount,
      averageRevenuePerUser: (mrr.averageRevenuePerUser || 0) * 12,
      asOf: mrr.asOf || new Date().toISOString()
    };

    if (mrr.byTier) {
      arr.byTier = {};
      for (const [tier, data] of Object.entries(mrr.byTier)) {
        arr.byTier[tier] = {
          arr: data.mrr * 12,
          subscriptionCount: data.subscriptionCount,
          averageRevenuePerUser: data.averageRevenuePerUser * 12
        };
      }
    }

    logger.info('ARR calculated', {
      total: arr.total,
      subscriptionCount: arr.subscriptionCount
    });

    return arr;
  }

  /**
   * Calculate churn rate (percentage of customers who cancelled)
   *
   * @param {Object} options - Calculation options
   * @param {Date} options.startDate - Period start date
   * @param {Date} options.endDate - Period end date (default: now)
   * @param {string} options.period - Period type ('month', 'quarter', 'year')
   * @returns {Promise<Object>} Churn rate data
   */
  async getChurnRate(options = {}) {
    const {
      startDate = new Date(new Date().setMonth(new Date().getMonth() - 1)),
      endDate = new Date(),
      period = 'month'
    } = options;

    const cacheKey = `analytics:churn:${startDate.toISOString()}:${endDate.toISOString()}`;

    // Check cache
    const cached = await this._getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // Count active customers at start of period
      const activeAtStart = await Subscription.countDocuments({
        status: 'active',
        currentPeriodStart: { $lte: startDate }
      });

      // Count customers who churned during period
      const churned = await Subscription.countDocuments({
        status: { $in: ['cancelled', 'inactive'] },
        updatedAt: { $gte: startDate, $lte: endDate },
        previousStatus: 'active'
      });

      // Alternative: Check cancellationDate field if available
      const churnedAlt = await Subscription.countDocuments({
        cancellationDate: { $gte: startDate, $lte: endDate }
      });

      const totalChurned = Math.max(churned, churnedAlt);

      const churnRate = activeAtStart > 0 ? (totalChurned / activeAtStart) * 100 : 0;

      // Calculate revenue churn (lost MRR)
      const churnedSubscriptions = await Subscription.find({
        cancellationDate: { $gte: startDate, $lte: endDate }
      }).select('amount interval');

      const lostMRR = churnedSubscriptions.reduce((sum, sub) => {
        return sum + this._normalizeToMonthly(sub.amount, sub.interval);
      }, 0);

      const result = {
        churnRate: parseFloat(churnRate.toFixed(2)),
        customersAtStart: activeAtStart,
        customersChurned: totalChurned,
        customersRetained: activeAtStart - totalChurned,
        retentionRate: parseFloat((100 - churnRate).toFixed(2)),
        lostMRR,
        period: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          type: period
        }
      };

      // Cache result
      await this._setCache(cacheKey, result, this.cacheTTL);

      logger.info('Churn rate calculated', {
        churnRate: result.churnRate,
        customersChurned: totalChurned,
        period
      });

      return result;
    } catch (error) {
      logger.error('Failed to calculate churn rate', { error: error.message });
      throw new Error(`Churn rate calculation failed: ${error.message}`);
    }
  }

  /**
   * Calculate growth rate (MRR growth month-over-month or year-over-year)
   *
   * @param {Object} options - Calculation options
   * @param {string} options.period - Period type ('month', 'quarter', 'year')
   * @param {number} options.periods - Number of periods to analyze (default: 12)
   * @returns {Promise<Object>} Growth rate data
   */
  async getGrowthRate(options = {}) {
    const { period = 'month', periods = 12 } = options;

    const cacheKey = `analytics:growth:${period}:${periods}`;

    // Check cache
    const cached = await this._getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const now = new Date();
      const mrrHistory = [];

      // Calculate MRR for each period
      for (let i = 0; i < periods; i++) {
        const periodDate = this._subtractPeriods(now, i, period);
        const mrr = await this.calculateMRR({
          asOf: periodDate,
          byTier: false,
          useCache: true
        });

        mrrHistory.unshift({
          period: periodDate.toISOString().substring(0, 7), // YYYY-MM
          mrr: mrr.total,
          subscriptionCount: mrr.subscriptionCount
        });
      }

      // Calculate growth rates
      const growthRates = [];
      for (let i = 1; i < mrrHistory.length; i++) {
        const current = mrrHistory[i];
        const previous = mrrHistory[i - 1];

        const growthRate = previous.mrr > 0 ? ((current.mrr - previous.mrr) / previous.mrr) * 100 : 0;

        growthRates.push({
          period: current.period,
          growthRate: parseFloat(growthRate.toFixed(2)),
          mrr: current.mrr,
          previousMrr: previous.mrr,
          change: current.mrr - previous.mrr
        });
      }

      // Calculate average growth rate
      const averageGrowthRate =
        growthRates.length > 0 ? growthRates.reduce((sum, g) => sum + g.growthRate, 0) / growthRates.length : 0;

      // Calculate compound monthly growth rate (CMGR)
      const firstMrr = mrrHistory[0].mrr;
      const lastMrr = mrrHistory[mrrHistory.length - 1].mrr;
      const cmgr = firstMrr > 0 ? (Math.pow(lastMrr / firstMrr, 1 / (periods - 1)) - 1) * 100 : 0;

      const result = {
        averageGrowthRate: parseFloat(averageGrowthRate.toFixed(2)),
        compoundMonthlyGrowthRate: parseFloat(cmgr.toFixed(2)),
        growthHistory: growthRates,
        mrrHistory,
        period
      };

      // Cache result
      await this._setCache(cacheKey, result, this.cacheTTL);

      logger.info('Growth rate calculated', {
        averageGrowthRate: result.averageGrowthRate,
        cmgr: result.compoundMonthlyGrowthRate,
        periods
      });

      return result;
    } catch (error) {
      logger.error('Failed to calculate growth rate', { error: error.message });
      throw new Error(`Growth rate calculation failed: ${error.message}`);
    }
  }

  /**
   * Calculate Customer Lifetime Value (LTV)
   *
   * @param {Object} options - Calculation options
   * @param {string} options.tier - Subscription tier (optional, calculates for all if not specified)
   * @param {number} options.months - Historical months to analyze (default: 12)
   * @returns {Promise<Object>} LTV data
   */
  async getLTV(options = {}) {
    const { tier = null, months = 12 } = options;

    const cacheKey = `analytics:ltv:${tier || 'all'}:${months}`;

    // Check cache
    const cached = await this._getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // Calculate average revenue per user (ARPU)
      const mrrData = await this.calculateMRR({ byTier: !!tier });
      const arpu = tier ? mrrData.byTier[tier]?.averageRevenuePerUser || 0 : mrrData.averageRevenuePerUser || 0;

      // Calculate average customer lifespan (1 / churn rate)
      const churnData = await this.getChurnRate({ period: 'month' });
      const monthlyChurnRate = churnData.churnRate / 100;

      // LTV = ARPU / Churn Rate
      // If churn rate is 5% (0.05), average lifespan is 20 months
      const averageLifespanMonths = monthlyChurnRate > 0 ? 1 / monthlyChurnRate : 60; // Cap at 60 months

      const ltv = arpu * averageLifespanMonths;

      // Calculate with profit margin (assume 70% gross margin for SaaS)
      const grossMargin = 0.7;
      const ltvWithMargin = ltv * grossMargin;

      const result = {
        ltv: parseFloat(ltv.toFixed(2)),
        ltvWithMargin: parseFloat(ltvWithMargin.toFixed(2)),
        arpu: parseFloat(arpu.toFixed(2)),
        averageLifespanMonths: parseFloat(averageLifespanMonths.toFixed(1)),
        monthlyChurnRate: parseFloat((monthlyChurnRate * 100).toFixed(2)),
        grossMargin: grossMargin * 100,
        tier: tier || 'all'
      };

      // Cache result
      await this._setCache(cacheKey, result, this.cacheTTL);

      logger.info('LTV calculated', {
        ltv: result.ltv,
        tier: tier || 'all',
        averageLifespan: result.averageLifespanMonths
      });

      return result;
    } catch (error) {
      logger.error('Failed to calculate LTV', { error: error.message });
      throw new Error(`LTV calculation failed: ${error.message}`);
    }
  }

  /**
   * Get comprehensive analytics dashboard data
   *
   * @returns {Promise<Object>} Dashboard analytics
   */
  async getDashboardAnalytics() {
    const cacheKey = 'analytics:dashboard';

    // Check cache (shorter TTL for dashboard)
    const cached = await this._getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const [mrr, arr, churnRate, growthRate, ltv] = await Promise.all([
        this.calculateMRR({ byTier: true }),
        this.calculateARR({ byTier: false }),
        this.getChurnRate({ period: 'month' }),
        this.getGrowthRate({ period: 'month', periods: 6 }),
        this.getLTV({ tier: null })
      ]);

      // Get total user count
      const totalUsers = await User.countDocuments({});
      const activeSubscribers = await Subscription.countDocuments({
        status: 'active'
      });

      const result = {
        mrr: mrr.total,
        arr: arr.total,
        churnRate: churnRate.churnRate,
        growthRate: growthRate.averageGrowthRate,
        ltv: ltv.ltv,
        metrics: {
          totalUsers,
          activeSubscribers,
          freeUsers: totalUsers - activeSubscribers,
          conversionRate: totalUsers > 0 ? (activeSubscribers / totalUsers) * 100 : 0
        },
        breakdown: {
          mrrByTier: mrr.byTier,
          churn: churnRate,
          growth: growthRate,
          ltv
        },
        updatedAt: new Date().toISOString()
      };

      // Cache for 30 minutes
      await this._setCache(cacheKey, result, 1800);

      logger.info('Dashboard analytics generated', {
        mrr: result.mrr,
        arr: result.arr,
        activeSubscribers
      });

      return result;
    } catch (error) {
      logger.error('Failed to generate dashboard analytics', {
        error: error.message
      });
      throw new Error(`Dashboard analytics failed: ${error.message}`);
    }
  }

  /**
   * Normalize revenue to monthly amount
   *
   * @private
   * @param {number} amount - Revenue amount
   * @param {string} interval - Billing interval ('month' or 'year')
   * @returns {number} Monthly revenue
   */
  _normalizeToMonthly(amount, interval) {
    if (interval === 'year') {
      return amount / 12;
    }
    return amount;
  }

  /**
   * Subtract periods from a date
   *
   * @private
   * @param {Date} date - Base date
   * @param {number} count - Number of periods to subtract
   * @param {string} period - Period type ('month', 'quarter', 'year')
   * @returns {Date} New date
   */
  _subtractPeriods(date, count, period) {
    const result = new Date(date);

    if (period === 'month') {
      result.setMonth(result.getMonth() - count);
    } else if (period === 'quarter') {
      result.setMonth(result.getMonth() - count * 3);
    } else if (period === 'year') {
      result.setFullYear(result.getFullYear() - count);
    }

    return result;
  }

  /**
   * Get data from Redis cache
   *
   * @private
   * @param {string} key - Cache key
   * @returns {Promise<Object|null>} Cached data or null
   */
  async _getFromCache(key) {
    try {
      const cached = await redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      logger.warn('Redis cache get failed', { key, error: error.message });
      return null;
    }
  }

  /**
   * Set data in Redis cache
   *
   * @private
   * @param {string} key - Cache key
   * @param {Object} data - Data to cache
   * @param {number} ttl - Time to live in seconds
   */
  async _setCache(key, data, ttl) {
    try {
      await redis.setex(key, ttl, JSON.stringify(data));
    } catch (error) {
      logger.warn('Redis cache set failed', { key, error: error.message });
    }
  }
}

module.exports = new AnalyticsService();
