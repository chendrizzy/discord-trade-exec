/**
 * OAuth2 Token Refresh Performance Metrics
 * Tracks and analyzes token refresh success rates, performance, and SLA compliance
 */

const AnalyticsEvent = require('../../models/AnalyticsEvent');

class TokenRefreshMetrics {
  /**
   * Log a token refresh cycle to analytics
   */
  static async logRefreshCycle(metrics) {
    try {
      const event = new AnalyticsEvent({
        eventType: 'oauth_token_refresh_cycle',
        timestamp: new Date(),
        data: {
          totalChecked: metrics.totalChecked || 0,
          totalRefreshes: metrics.totalRefreshes || 0,
          successful: metrics.successful || 0,
          failed: metrics.failed || 0,
          transient: metrics.transient || 0,
          permanent: metrics.permanent || 0,
          successRate:
            metrics.totalRefreshes > 0
              ? ((metrics.successful / metrics.totalRefreshes) * 100).toFixed(2)
              : 0,
          avgRefreshDuration: metrics.avgRefreshDuration || 0,
          brokerBreakdown: metrics.brokerBreakdown || {}
        },
        metadata: {
          cycleDuration: metrics.totalDuration || 0,
          timestamp: new Date().toISOString()
        }
      });

      await event.save();
      console.log('[TokenRefreshMetrics] Refresh cycle logged to analytics');

      return event;
    } catch (error) {
      console.error('[TokenRefreshMetrics] Failed to log refresh cycle:', error.message);
      return null;
    }
  }

  /**
   * Get success rate for token refreshes over specified time window
   * @param {number} hours - Number of hours to look back
   * @returns {Object} Success rate statistics
   */
  static async getSuccessRate(hours = 24) {
    try {
      const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);

      const cycles = await AnalyticsEvent.find({
        eventType: 'oauth_token_refresh_cycle',
        timestamp: { $gte: startTime }
      }).sort({ timestamp: -1 });

      if (cycles.length === 0) {
        return {
          successRate: 0,
          totalCycles: 0,
          totalRefreshes: 0,
          successful: 0,
          failed: 0,
          avgRefreshDuration: 0,
          period: `Last ${hours} hours`,
          brokerBreakdown: {}
        };
      }

      let totalRefreshes = 0;
      let successful = 0;
      let failed = 0;
      let totalDuration = 0;
      const brokerBreakdown = {};

      for (const cycle of cycles) {
        totalRefreshes += cycle.data.totalRefreshes || 0;
        successful += cycle.data.successful || 0;
        failed += cycle.data.failed || 0;
        totalDuration += cycle.data.avgRefreshDuration || 0;

        // Aggregate broker breakdown
        const cycleBreakdown = cycle.data.brokerBreakdown || {};
        for (const [broker, stats] of Object.entries(cycleBreakdown)) {
          if (!brokerBreakdown[broker]) {
            brokerBreakdown[broker] = { successful: 0, failed: 0 };
          }
          brokerBreakdown[broker].successful += stats.successful || 0;
          brokerBreakdown[broker].failed += stats.failed || 0;
        }
      }

      const successRate = totalRefreshes > 0 ? ((successful / totalRefreshes) * 100).toFixed(2) : 0;
      const avgRefreshDuration = cycles.length > 0 ? Math.round(totalDuration / cycles.length) : 0;

      return {
        successRate: parseFloat(successRate),
        totalCycles: cycles.length,
        totalRefreshes,
        successful,
        failed,
        avgRefreshDuration,
        period: `Last ${hours} hours`,
        brokerBreakdown
      };
    } catch (error) {
      console.error('[TokenRefreshMetrics] Failed to calculate success rate:', error.message);
      return null;
    }
  }

  /**
   * Check if success rate meets SLA threshold (90%)
   * @param {number} hours - Number of hours to check
   * @returns {Object} SLA compliance status
   */
  static async checkSLACompliance(hours = 24) {
    try {
      const SLA_THRESHOLD = 90; // 90% success rate required
      const stats = await this.getSuccessRate(hours);

      if (!stats) {
        return {
          compliant: false,
          error: 'Failed to retrieve metrics'
        };
      }

      const compliant = stats.successRate >= SLA_THRESHOLD;

      return {
        compliant,
        successRate: stats.successRate,
        threshold: SLA_THRESHOLD,
        delta: stats.successRate - SLA_THRESHOLD,
        totalRefreshes: stats.totalRefreshes,
        successful: stats.successful,
        failed: stats.failed,
        period: stats.period,
        recommendation: compliant
          ? 'Token refresh performance meets SLA requirements'
          : `⚠️ SLA BREACH: Success rate ${stats.successRate}% is below ${SLA_THRESHOLD}% threshold. Investigate refresh failures.`
      };
    } catch (error) {
      console.error('[TokenRefreshMetrics] Failed to check SLA compliance:', error.message);
      return {
        compliant: false,
        error: error.message
      };
    }
  }

  /**
   * Get broker-specific refresh statistics
   * @param {string} broker - Broker name (e.g., 'alpaca', 'schwab')
   * @param {number} hours - Number of hours to look back
   * @returns {Object} Broker-specific statistics
   */
  static async getBrokerStats(broker, hours = 24) {
    try {
      const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);

      const cycles = await AnalyticsEvent.find({
        eventType: 'oauth_token_refresh_cycle',
        timestamp: { $gte: startTime },
        [`data.brokerBreakdown.${broker}`]: { $exists: true }
      }).sort({ timestamp: -1 });

      if (cycles.length === 0) {
        return {
          broker,
          successful: 0,
          failed: 0,
          successRate: 0,
          totalRefreshes: 0,
          period: `Last ${hours} hours`
        };
      }

      let successful = 0;
      let failed = 0;

      for (const cycle of cycles) {
        const brokerData = cycle.data.brokerBreakdown[broker] || {};
        successful += brokerData.successful || 0;
        failed += brokerData.failed || 0;
      }

      const totalRefreshes = successful + failed;
      const successRate = totalRefreshes > 0 ? ((successful / totalRefreshes) * 100).toFixed(2) : 0;

      return {
        broker,
        successful,
        failed,
        successRate: parseFloat(successRate),
        totalRefreshes,
        period: `Last ${hours} hours`
      };
    } catch (error) {
      console.error(
        `[TokenRefreshMetrics] Failed to get stats for broker ${broker}:`,
        error.message
      );
      return null;
    }
  }

  /**
   * Get recent refresh failures for investigation
   * @param {number} limit - Number of failures to retrieve
   * @returns {Array} Recent failure events
   */
  static async getRecentFailures(limit = 10) {
    try {
      const cycles = await AnalyticsEvent.find({
        eventType: 'oauth_token_refresh_cycle',
        'data.failed': { $gt: 0 }
      })
        .sort({ timestamp: -1 })
        .limit(limit);

      return cycles.map(cycle => ({
        timestamp: cycle.timestamp,
        failed: cycle.data.failed || 0,
        permanent: cycle.data.permanent || 0,
        transient: cycle.data.transient || 0,
        successRate: cycle.data.successRate || 0,
        brokerBreakdown: cycle.data.brokerBreakdown || {}
      }));
    } catch (error) {
      console.error('[TokenRefreshMetrics] Failed to get recent failures:', error.message);
      return [];
    }
  }

  /**
   * Generate comprehensive token refresh report
   * @param {number} hours - Number of hours to analyze
   * @returns {Object} Comprehensive metrics report
   */
  static async generateReport(hours = 24) {
    try {
      const stats = await this.getSuccessRate(hours);
      const sla = await this.checkSLACompliance(hours);
      const failures = await this.getRecentFailures(5);

      return {
        summary: {
          period: `Last ${hours} hours`,
          successRate: stats.successRate,
          slaCompliant: sla.compliant,
          totalRefreshes: stats.totalRefreshes,
          successful: stats.successful,
          failed: stats.failed,
          avgRefreshDuration: stats.avgRefreshDuration
        },
        slaStatus: sla,
        brokerPerformance: stats.brokerBreakdown,
        recentFailures: failures,
        recommendations: sla.compliant
          ? [
              'Token refresh performance is healthy',
              'Continue monitoring for sustained compliance'
            ]
          : [
              '⚠️ Investigate failing refresh attempts',
              'Review broker API status pages',
              'Check network connectivity',
              'Verify OAuth2 client credentials are valid',
              'Consider increasing retry attempts for transient errors'
            ]
      };
    } catch (error) {
      console.error('[TokenRefreshMetrics] Failed to generate report:', error.message);
      return {
        error: error.message
      };
    }
  }
}

module.exports = TokenRefreshMetrics;
