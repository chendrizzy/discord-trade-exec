/**
 * Analytics Alerts System
 *
 * Monitors critical analytics metrics and triggers alerts when thresholds are exceeded.
 * Supports email notifications, Slack webhooks, and custom alert handlers.
 */

const winston = require('winston');

// Alert logger
const alertLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [
    new winston.transports.File({ filename: 'logs/analytics-alerts.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

class AnalyticsAlerts {
  constructor() {
    this.thresholds = {
      // Churn rate thresholds
      churnRate: {
        warning: 0.05, // 5% monthly churn
        critical: 0.08 // 8% monthly churn
      },

      // MRR growth thresholds (negative growth)
      mrrGrowth: {
        warning: -0.03, // -3% MRR decline
        critical: -0.1 // -10% MRR decline
      },

      // At-risk users threshold
      atRiskUsers: {
        warning: 15, // 15% of active users at risk
        critical: 25 // 25% of active users at risk
      },

      // Slow query threshold (ms)
      slowQuery: {
        warning: 2000, // 2 seconds
        critical: 5000 // 5 seconds
      },

      // Error rate threshold
      errorRate: {
        warning: 0.03, // 3% error rate
        critical: 0.1 // 10% error rate
      }
    };

    this.alertHistory = [];
    this.MAX_ALERT_HISTORY = 100;

    // Alert cooldown to prevent spam (in milliseconds)
    this.alertCooldowns = new Map();
    this.COOLDOWN_PERIOD = 30 * 60 * 1000; // 30 minutes
  }

  /**
   * Check churn rate and trigger alerts if needed
   * @param {number} churnRate - Current churn rate (0-1)
   * @param {Object} context - Additional context (period, subscribers, etc.)
   */
  checkChurnRate(churnRate, context = {}) {
    const alertKey = 'churn_rate';

    if (this.isInCooldown(alertKey)) {
      return { alerted: false, reason: 'cooldown' };
    }

    let severity = null;

    if (churnRate >= this.thresholds.churnRate.critical) {
      severity = 'critical';
    } else if (churnRate >= this.thresholds.churnRate.warning) {
      severity = 'warning';
    }

    if (severity) {
      const alert = {
        type: 'churn_rate',
        severity,
        value: churnRate,
        threshold: this.thresholds.churnRate[severity],
        message: `Churn rate ${(churnRate * 100).toFixed(2)}% exceeded ${severity} threshold`,
        context,
        timestamp: new Date(),
        recommendations: this.getChurnRecommendations(churnRate)
      };

      this.triggerAlert(alert);
      this.setCooldown(alertKey);

      return { alerted: true, alert };
    }

    return { alerted: false };
  }

  /**
   * Check MRR growth and trigger alerts if needed
   * @param {number} mrrGrowth - MRR growth rate (e.g., -0.05 for -5%)
   * @param {Object} context - Additional context (currentMRR, previousMRR, etc.)
   */
  checkMRRGrowth(mrrGrowth, context = {}) {
    const alertKey = 'mrr_growth';

    if (this.isInCooldown(alertKey)) {
      return { alerted: false, reason: 'cooldown' };
    }

    let severity = null;

    if (mrrGrowth <= this.thresholds.mrrGrowth.critical) {
      severity = 'critical';
    } else if (mrrGrowth <= this.thresholds.mrrGrowth.warning) {
      severity = 'warning';
    }

    if (severity) {
      const alert = {
        type: 'mrr_decline',
        severity,
        value: mrrGrowth,
        threshold: this.thresholds.mrrGrowth[severity],
        message: `MRR declined by ${(Math.abs(mrrGrowth) * 100).toFixed(2)}% (${severity} threshold)`,
        context,
        timestamp: new Date(),
        recommendations: this.getMRRRecommendations(mrrGrowth, context)
      };

      this.triggerAlert(alert);
      this.setCooldown(alertKey);

      return { alerted: true, alert };
    }

    return { alerted: false };
  }

  /**
   * Check at-risk users and trigger alerts if needed
   * @param {number} atRiskPercentage - Percentage of users at risk (0-1)
   * @param {Object} context - Additional context (atRiskCount, totalUsers, etc.)
   */
  checkAtRiskUsers(atRiskPercentage, context = {}) {
    const alertKey = 'at_risk_users';

    if (this.isInCooldown(alertKey)) {
      return { alerted: false, reason: 'cooldown' };
    }

    let severity = null;

    if (atRiskPercentage >= this.thresholds.atRiskUsers.critical) {
      severity = 'critical';
    } else if (atRiskPercentage >= this.thresholds.atRiskUsers.warning) {
      severity = 'warning';
    }

    if (severity) {
      const alert = {
        type: 'at_risk_users',
        severity,
        value: atRiskPercentage,
        threshold: this.thresholds.atRiskUsers[severity],
        message: `${(atRiskPercentage * 100).toFixed(1)}% of users at risk (${severity} threshold)`,
        context,
        timestamp: new Date(),
        recommendations: this.getAtRiskRecommendations(atRiskPercentage, context)
      };

      this.triggerAlert(alert);
      this.setCooldown(alertKey);

      return { alerted: true, alert };
    }

    return { alerted: false };
  }

  /**
   * Check query performance and trigger alerts if needed
   * @param {number} executionTime - Query execution time (ms)
   * @param {Object} context - Additional context (queryType, etc.)
   */
  checkSlowQuery(executionTime, context = {}) {
    const alertKey = `slow_query_${context.queryType || 'unknown'}`;

    // Slow query cooldown is shorter (5 minutes)
    if (this.isInCooldown(alertKey, 5 * 60 * 1000)) {
      return { alerted: false, reason: 'cooldown' };
    }

    let severity = null;

    if (executionTime >= this.thresholds.slowQuery.critical) {
      severity = 'critical';
    } else if (executionTime >= this.thresholds.slowQuery.warning) {
      severity = 'warning';
    }

    if (severity) {
      const alert = {
        type: 'slow_query',
        severity,
        value: executionTime,
        threshold: this.thresholds.slowQuery[severity],
        message: `Slow query detected: ${executionTime}ms (${context.queryType || 'unknown'})`,
        context,
        timestamp: new Date(),
        recommendations: this.getSlowQueryRecommendations(executionTime, context)
      };

      this.triggerAlert(alert);
      this.setCooldown(alertKey, 5 * 60 * 1000);

      return { alerted: true, alert };
    }

    return { alerted: false };
  }

  /**
   * Check error rate and trigger alerts if needed
   * @param {number} errorRate - Error rate (0-1)
   * @param {Object} context - Additional context (errorCount, totalQueries, etc.)
   */
  checkErrorRate(errorRate, context = {}) {
    const alertKey = 'error_rate';

    if (this.isInCooldown(alertKey, 10 * 60 * 1000)) {
      // 10-minute cooldown
      return { alerted: false, reason: 'cooldown' };
    }

    let severity = null;

    if (errorRate >= this.thresholds.errorRate.critical) {
      severity = 'critical';
    } else if (errorRate >= this.thresholds.errorRate.warning) {
      severity = 'warning';
    }

    if (severity) {
      const alert = {
        type: 'error_rate',
        severity,
        value: errorRate,
        threshold: this.thresholds.errorRate[severity],
        message: `High error rate: ${(errorRate * 100).toFixed(2)}% (${severity} threshold)`,
        context,
        timestamp: new Date(),
        recommendations: this.getErrorRateRecommendations(errorRate, context)
      };

      this.triggerAlert(alert);
      this.setCooldown(alertKey, 10 * 60 * 1000);

      return { alerted: true, alert };
    }

    return { alerted: false };
  }

  /**
   * Trigger alert through configured channels
   * @private
   */
  triggerAlert(alert) {
    // Log alert
    alertLogger.warn(`🚨 ALERT [${alert.severity.toUpperCase()}]: ${alert.message}`, {
      type: alert.type,
      value: alert.value,
      threshold: alert.threshold,
      context: alert.context
    });

    // Store in history
    this.alertHistory.unshift(alert);
    if (this.alertHistory.length > this.MAX_ALERT_HISTORY) {
      this.alertHistory = this.alertHistory.slice(0, this.MAX_ALERT_HISTORY);
    }

    // TODO: Send email notification (integrate with SendGrid/AWS SES)
    // this.sendEmailAlert(alert);

    // TODO: Send Slack notification (integrate with Slack webhook)
    // this.sendSlackAlert(alert);

    // TODO: Create support ticket for critical alerts
    // if (alert.severity === 'critical') {
    //   this.createSupportTicket(alert);
    // }
  }

  /**
   * Check if alert is in cooldown period
   * @private
   */
  isInCooldown(alertKey, cooldownPeriod = this.COOLDOWN_PERIOD) {
    const lastAlert = this.alertCooldowns.get(alertKey);

    if (!lastAlert) return false;

    const timeSinceLastAlert = Date.now() - lastAlert;
    return timeSinceLastAlert < cooldownPeriod;
  }

  /**
   * Set cooldown for alert
   * @private
   */
  setCooldown(alertKey, cooldownPeriod = this.COOLDOWN_PERIOD) {
    this.alertCooldowns.set(alertKey, Date.now());

    // Clean up old cooldowns after period expires
    setTimeout(() => {
      this.alertCooldowns.delete(alertKey);
    }, cooldownPeriod);
  }

  /**
   * Get recommendations for churn rate alerts
   * @private
   */
  getChurnRecommendations(churnRate) {
    const recommendations = [
      'Review churn risk list and contact critical users within 24 hours',
      'Analyze exit surveys or cancellation reasons',
      'Launch retention campaign targeting at-risk users'
    ];

    if (churnRate > 0.1) {
      recommendations.push('URGENT: Schedule emergency team meeting to address churn');
      recommendations.push('Review recent product changes that may have impacted retention');
    }

    return recommendations;
  }

  /**
   * Get recommendations for MRR decline alerts
   * @private
   */
  getMRRRecommendations(mrrGrowth, context) {
    const recommendations = [
      'Analyze which subscription tiers are declining',
      'Review recent cancellations and downgrades',
      'Increase sales/marketing efforts to offset churn'
    ];

    if (mrrGrowth < -0.05) {
      recommendations.push('Consider targeted win-back campaigns for cancelled users');
      recommendations.push('Evaluate pricing strategy and competitor landscape');
    }

    return recommendations;
  }

  /**
   * Get recommendations for at-risk users alerts
   * @private
   */
  getAtRiskRecommendations(atRiskPercentage, context) {
    const recommendations = [
      'Launch automated email campaign to at-risk users',
      'Offer incentives (discounts, consultations) to high-value at-risk users',
      'Review product issues causing user dissatisfaction'
    ];

    if (context.criticalCount > 10) {
      recommendations.push(`URGENT: ${context.criticalCount} users in critical risk category`);
      recommendations.push('Assign customer success team to contact critical users immediately');
    }

    return recommendations;
  }

  /**
   * Get recommendations for slow query alerts
   * @private
   */
  getSlowQueryRecommendations(executionTime, context) {
    return [
      `Optimize ${context.queryType || 'query'} with proper indexing`,
      'Consider adding Redis caching for frequently accessed data',
      'Review MongoDB aggregation pipeline efficiency',
      'Implement query result pagination for large datasets'
    ];
  }

  /**
   * Get recommendations for error rate alerts
   * @private
   */
  getErrorRateRecommendations(errorRate, context) {
    return [
      'Review recent error logs for patterns',
      'Check database connection health',
      'Verify third-party API integrations',
      'Monitor application logs for stack traces',
      'Consider rolling back recent deployments if errors spiked after release'
    ];
  }

  /**
   * Get alert history
   * @param {number} limit - Max alerts to return
   * @param {string} severity - Filter by severity (optional)
   * @returns {Array} Alert history
   */
  getAlertHistory(limit = 50, severity = null) {
    let alerts = this.alertHistory;

    if (severity) {
      alerts = alerts.filter(a => a.severity === severity);
    }

    return alerts.slice(0, limit);
  }

  /**
   * Get active alerts (within last 24 hours)
   * @returns {Array} Active alerts
   */
  getActiveAlerts() {
    const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;

    return this.alertHistory.filter(alert => {
      const alertTime = new Date(alert.timestamp).getTime();
      return alertTime > twentyFourHoursAgo;
    });
  }

  /**
   * Configure alert thresholds
   * @param {Object} thresholds - Custom thresholds
   */
  configureThresholds(thresholds) {
    this.thresholds = {
      ...this.thresholds,
      ...thresholds
    };

    alertLogger.info('Alert thresholds updated', this.thresholds);
  }

  /**
   * Clear alert cooldowns
   */
  clearCooldowns() {
    this.alertCooldowns.clear();
  }

  /**
   * Reset alert history
   */
  resetHistory() {
    this.alertHistory = [];
  }
}

// Singleton instance
let instance = null;

/**
 * Get singleton alerts instance
 * @returns {AnalyticsAlerts} Alerts instance
 */
function getAlertsInstance() {
  if (!instance) {
    instance = new AnalyticsAlerts();
  }
  return instance;
}

module.exports = {
  AnalyticsAlerts,
  getAlertsInstance
};
