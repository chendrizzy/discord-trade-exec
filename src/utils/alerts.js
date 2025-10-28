/**
 * Performance Alerts Utility (US6-T04)
 *
 * Sends performance alerts to Slack or Discord webhooks
 * Supports:
 * - Slow query alerts (avgTime > 2000ms)
 * - Query pattern analysis
 * - Optimization recommendations
 * - Rate limiting and deduplication
 */

const logger = require('./logger');

class AlertsService {
  constructor() {
    if (AlertsService.instance) return AlertsService.instance;

    // Slack webhook URL (primary for production alerts)
    this.slackWebhookUrl = process.env.SLACK_ALERTS_WEBHOOK_URL;

    // Discord webhook URL (fallback or alternative)
    this.discordWebhookUrl = process.env.DISCORD_ERROR_WEBHOOK_URL;

    // Alert cooldown tracking (prevent duplicate alerts)
    this.alertCooldowns = new Map();
    this.defaultCooldownMs = 5 * 60 * 1000; // 5 minutes

    if (!this.slackWebhookUrl && !this.discordWebhookUrl) {
      logger.warn('[Alerts] No webhook URLs configured - alerts will only be logged');
      logger.warn('[Alerts] Set SLACK_ALERTS_WEBHOOK_URL or DISCORD_ERROR_WEBHOOK_URL to enable webhook alerts');
    }

    AlertsService.instance = this;
  }

  /**
   * Send slow query alert
   * @param {Object} options - Alert options
   * @param {string} options.queryType - Type of query (find, aggregate, etc)
   * @param {Object} options.params - Query parameters structure
   * @param {number} options.avgTime - Average execution time in ms
   * @param {number} options.count - Number of times executed
   * @param {string} options.collection - MongoDB collection name
   * @param {string} options.recommendation - Optimization recommendation
   * @returns {Promise<Object>} Send result
   */
  async sendSlowQueryAlert(options) {
    const { queryType, params, avgTime, count, collection, recommendation } = options;

    // Generate fingerprint for deduplication
    const fingerprint = `slow_query:${queryType}:${collection}:${JSON.stringify(params)}`;

    // Check cooldown
    if (this.isInCooldown(fingerprint)) {
      logger.debug('[Alerts] Slow query alert suppressed (cooldown)', { fingerprint });
      return { suppressed: true, reason: 'cooldown' };
    }

    // Create alert message
    const title = '⚠️ Slow Query Detected';
    const message = [
      `*Query Type:* ${queryType}`,
      `*Collection:* ${collection}`,
      `*Average Time:* ${avgTime}ms`,
      `*Execution Count:* ${count}`,
      `*Parameters:* \`${JSON.stringify(params, null, 2)}\``,
      '',
      `*Recommendation:* ${recommendation}`
    ].join('\n');

    // Send to configured webhooks
    const results = {};

    if (this.slackWebhookUrl) {
      results.slack = await this.sendToSlack(title, message, 'warning');
    }

    if (this.discordWebhookUrl && !this.slackWebhookUrl) {
      // Only send to Discord if Slack is not configured (avoid duplicates)
      results.discord = await this.sendToDiscord(title, message, 'warning');
    }

    // Set cooldown
    this.setCooldown(fingerprint);

    // Always log
    logger.warn('[Alerts] Slow query alert sent', {
      queryType,
      collection,
      avgTime,
      count,
      recommendation,
      webhooks: Object.keys(results)
    });

    return { sent: true, webhooks: results };
  }

  /**
   * Send message to Slack webhook
   * @param {string} title - Alert title
   * @param {string} message - Alert message (supports Slack markdown)
   * @param {string} level - Alert level (info, warning, error)
   * @returns {Promise<Object>} Send result
   */
  async sendToSlack(title, message, level = 'info') {
    if (!this.slackWebhookUrl) {
      return { skipped: true, reason: 'no_webhook' };
    }

    try {
      // Slack message format
      const color = this.getColorForLevel(level);
      const payload = {
        text: title,
        attachments: [
          {
            color,
            text: message,
            mrkdwn_in: ['text'],
            footer: 'Discord Trade Executor - Performance Monitoring',
            ts: Math.floor(Date.now() / 1000)
          }
        ]
      };

      const response = await fetch(this.slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Slack API error: ${response.status} - ${errorText}`);
      }

      return { success: true, platform: 'slack' };
    } catch (error) {
      logger.error('[Alerts] Slack webhook error', {
        error: error.message,
        stack: error.stack
      });
      return { error: error.message, platform: 'slack' };
    }
  }

  /**
   * Send message to Discord webhook
   * @param {string} title - Alert title
   * @param {string} message - Alert message (supports Discord markdown)
   * @param {string} level - Alert level (info, warning, error)
   * @returns {Promise<Object>} Send result
   */
  async sendToDiscord(title, message, level = 'info') {
    if (!this.discordWebhookUrl) {
      return { skipped: true, reason: 'no_webhook' };
    }

    try {
      // Discord embed format
      const color = this.getColorCodeForLevel(level);
      const payload = {
        embeds: [
          {
            title,
            description: message,
            color,
            footer: {
              text: 'Discord Trade Executor - Performance Monitoring'
            },
            timestamp: new Date().toISOString()
          }
        ]
      };

      const response = await fetch(this.discordWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Discord API error: ${response.status} - ${errorText}`);
      }

      return { success: true, platform: 'discord' };
    } catch (error) {
      logger.error('[Alerts] Discord webhook error', {
        error: error.message,
        stack: error.stack
      });
      return { error: error.message, platform: 'discord' };
    }
  }

  /**
   * Check if alert is in cooldown period
   * @param {string} fingerprint - Alert fingerprint
   * @returns {boolean} True if in cooldown
   */
  isInCooldown(fingerprint) {
    const lastSent = this.alertCooldowns.get(fingerprint);
    if (!lastSent) return false;

    const elapsed = Date.now() - lastSent;
    return elapsed < this.defaultCooldownMs;
  }

  /**
   * Set cooldown for alert fingerprint
   * @param {string} fingerprint - Alert fingerprint
   */
  setCooldown(fingerprint) {
    this.alertCooldowns.set(fingerprint, Date.now());

    // Auto-cleanup after cooldown expires
    setTimeout(() => {
      this.alertCooldowns.delete(fingerprint);
    }, this.defaultCooldownMs);
  }

  /**
   * Get Slack color for alert level
   * @param {string} level - Alert level
   * @returns {string} Hex color code
   */
  getColorForLevel(level) {
    const colors = {
      info: '#36a64f',     // Green
      warning: '#ff9900',  // Orange
      error: '#ff0000'     // Red
    };
    return colors[level] || colors.info;
  }

  /**
   * Get Discord color code for alert level
   * @param {string} level - Alert level
   * @returns {number} Decimal color code
   */
  getColorCodeForLevel(level) {
    const colors = {
      info: 0x36a64f,     // Green
      warning: 0xff9900,  // Orange
      error: 0xff0000     // Red
    };
    return colors[level] || colors.info;
  }

  /**
   * Clear all cooldowns (for testing)
   */
  clearCooldowns() {
    this.alertCooldowns.clear();
  }
}

// Singleton instance
let instance = null;

/**
 * Get singleton alerts service instance
 * @returns {AlertsService} Alerts service
 */
function getAlertsService() {
  if (!instance) {
    instance = new AlertsService();
  }
  return instance;
}

module.exports = {
  AlertsService,
  getAlertsService
};
