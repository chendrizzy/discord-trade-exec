/**
 * Error Notification Service
 *
 * Sends critical error notifications to Discord webhook
 * Part of US4-T09: Critical Error Discord Notifications
 */

const axios = require('axios');
const logger = require('../utils/logger');
const { getConfig } = require('../config/env');

class ErrorNotificationService {
  constructor() {
    // Handle test environment where config may not be fully initialized
    let config = {};
    try {
      config = getConfig();
    } catch (error) {
      // In test environment, config may fail - use defaults
      config = {
        DISCORD_ERROR_WEBHOOK_URL: null,
        isProduction: false
      };
    }

    this.webhookUrl = config.DISCORD_ERROR_WEBHOOK_URL;
    this.enabled = !!this.webhookUrl && config.isProduction;
    this.rateLimitMap = new Map(); // Track notification frequency per error type
    this.cooldownMs = 5 * 60 * 1000; // 5 minute cooldown per error type
  }

  /**
   * Check if we should send notification (rate limiting)
   * @param {string} errorKey - Unique identifier for error type
   * @returns {boolean} True if notification should be sent
   */
  shouldNotify(errorKey) {
    if (!this.enabled) return false;

    const lastNotification = this.rateLimitMap.get(errorKey);
    const now = Date.now();

    if (lastNotification && now - lastNotification < this.cooldownMs) {
      return false;
    }

    this.rateLimitMap.set(errorKey, now);
    return true;
  }

  /**
   * Determine if error is critical (warrants notification)
   * @param {Object} errorData - Error information
   * @returns {boolean} True if error is critical
   */
  isCriticalError(errorData) {
    const { statusCode, errorCode, type } = errorData;

    // Always notify for uncaught exceptions and unhandled rejections
    if (type === 'UncaughtException' || type === 'UnhandledRejection') {
      return true;
    }

    // Notify for 500+ errors
    if (statusCode >= 500) {
      return true;
    }

    // Notify for specific critical error codes
    const criticalCodes = [
      'DATABASE_CONNECTION_FAILED',
      'BROKER_CONNECTION_FAILED',
      'EXTERNAL_SERVICE_ERROR',
      'CONFIGURATION_ERROR',
      'SERVICE_UNAVAILABLE'
    ];

    return criticalCodes.includes(errorCode);
  }

  /**
   * Create Discord embed for error notification
   * @param {Object} errorData - Error information
   * @returns {Object} Discord embed object
   */
  createEmbed(errorData) {
    const {
      error,
      errorCode,
      statusCode,
      path,
      method,
      userId,
      communityId,
      correlationId,
      stackPreview,
      type,
      environment = process.env.NODE_ENV || 'development'
    } = errorData;

    // Determine embed color based on severity
    let color = 0xff0000; // Red for critical
    if (statusCode < 500) color = 0xffa500; // Orange for client errors
    if (type === 'UncaughtException') color = 0x8b0000; // Dark red for exceptions

    const embed = {
      title: `🚨 Critical Error - ${environment.toUpperCase()}`,
      color,
      timestamp: new Date().toISOString(),
      fields: [
        {
          name: '❌ Error',
          value: `\`\`\`${error}\`\`\``,
          inline: false
        },
        {
          name: '🔍 Error Code',
          value: `\`${errorCode || 'N/A'}\``,
          inline: true
        },
        {
          name: '📊 Status',
          value: `\`${statusCode || 'N/A'}\``,
          inline: true
        }
      ]
    };

    // Add request info if available
    if (path && method) {
      embed.fields.push({
        name: '🌐 Request',
        value: `\`${method} ${path}\``,
        inline: false
      });
    }

    // Add user context if available
    if (userId || communityId) {
      const userInfo = [];
      if (userId) userInfo.push(`User: ${userId}`);
      if (communityId) userInfo.push(`Community: ${communityId}`);
      embed.fields.push({
        name: '👤 Context',
        value: `\`${userInfo.join(' | ')}\``,
        inline: false
      });
    }

    // Add correlation ID for tracing
    if (correlationId) {
      embed.fields.push({
        name: '🔗 Correlation ID',
        value: `\`${correlationId}\``,
        inline: false
      });
    }

    // Add stack preview if available
    if (stackPreview) {
      embed.fields.push({
        name: '📚 Stack Trace (Preview)',
        value: `\`\`\`${stackPreview}\`\`\``,
        inline: false
      });
    }

    // Add error type for special cases
    if (type) {
      embed.fields.push({
        name: '⚠️ Type',
        value: `\`${type}\``,
        inline: true
      });
    }

    return embed;
  }

  /**
   * Send notification to Discord webhook
   * @param {Object} errorData - Error information
   * @returns {Promise<void>}
   */
  async notify(errorData) {
    if (!this.enabled) {
      return;
    }

    // Check if error is critical
    if (!this.isCriticalError(errorData)) {
      return;
    }

    // Rate limiting: create unique key for this error type
    const errorKey = `${errorData.errorCode || 'UNKNOWN'}_${errorData.path || 'N/A'}`;

    if (!this.shouldNotify(errorKey)) {
      logger.debug('Error notification rate limited', { errorKey });
      return;
    }

    try {
      const embed = this.createEmbed(errorData);

      await axios.post(
        this.webhookUrl,
        {
          embeds: [embed],
          username: 'Error Monitor',
          avatar_url: 'https://cdn.discordapp.com/embed/avatars/0.png'
        },
        {
          timeout: 5000,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info('Critical error notification sent to Discord', {
        errorCode: errorData.errorCode,
        correlationId: errorData.correlationId
      });
    } catch (error) {
      // Don't let notification failures affect the application
      logger.error('Failed to send Discord error notification', {
        error: error.message,
        errorCode: errorData.errorCode,
        correlationId: errorData.correlationId
      });
    }
  }

  /**
   * Notify about unhandled rejection
   * @param {Error} reason - Rejection reason
   * @param {Promise} promise - Promise that was rejected
   */
  async notifyUnhandledRejection(reason, promise) {
    await this.notify({
      error: reason?.message || String(reason),
      errorCode: 'UNHANDLED_REJECTION',
      statusCode: 500,
      type: 'UnhandledRejection',
      stackPreview: reason?.stack?.split('\n').slice(0, 3).join('\n')
    });
  }

  /**
   * Notify about uncaught exception
   * @param {Error} error - Uncaught exception
   */
  async notifyUncaughtException(error) {
    await this.notify({
      error: error.message,
      errorCode: 'UNCAUGHT_EXCEPTION',
      statusCode: 500,
      type: 'UncaughtException',
      stackPreview: error.stack?.split('\n').slice(0, 3).join('\n')
    });
  }
}

// Export singleton instance
module.exports = new ErrorNotificationService();
