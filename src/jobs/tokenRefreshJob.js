/**
 * OAuth2 Token Refresh Cron Jobs
 * Automatically refreshes expiring OAuth2 tokens for all brokers
 *
 * Two separate jobs:
 * 1. Hourly job: Refreshes tokens expiring within 24 hours (all brokers except TD Ameritrade)
 * 2. 15-minute job: Refreshes TD Ameritrade tokens expiring within 20 minutes (30-min TTL)
 */

const cron = require('node-cron');
const User = require('../models/User');
const oauth2Service = require('../services/OAuth2Service');
const OAUTH2_PROVIDERS = require('../config/oauth2Providers');
const TokenRefreshMetrics = require('../services/analytics/TokenRefreshMetrics');
const logger = require('../utils/logger');

// Retry configuration for exponential backoff
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 30000  // 30 seconds
};

/**
 * Sleep utility for retry delays
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Calculate exponential backoff delay
 */
function getBackoffDelay(retryCount) {
  const delay = RETRY_CONFIG.baseDelay * Math.pow(2, retryCount);
  return Math.min(delay, RETRY_CONFIG.maxDelay);
}

/**
 * Refresh token with retry logic and exponential backoff
 */
async function refreshTokenWithRetry(broker, userId, retryCount = 0) {
  try {
    const result = await oauth2Service.refreshAccessToken(broker, userId);
    return { success: true, result };
  } catch (error) {
    const isTransientError = error.response && error.response.status >= 500;
    const isPermanentError = error.response && error.response.status >= 400 && error.response.status < 500;

    if (isTransientError && retryCount < RETRY_CONFIG.maxRetries) {
      // Retry transient errors (5xx)
      const delay = getBackoffDelay(retryCount);
      logger.info('[TokenRefreshJob] Transient error, retrying with backoff', {
        statusCode: error.response.status,
        delayMs: delay,
        retryAttempt: retryCount + 1,
        maxRetries: RETRY_CONFIG.maxRetries,
        broker,
        userId
      });
      await sleep(delay);
      return refreshTokenWithRetry(broker, userId, retryCount + 1);
    } else if (isPermanentError) {
      // Don't retry permanent errors (4xx) - mark token invalid
      logger.error('[TokenRefreshJob] Permanent error, marking token invalid', {
        statusCode: error.response?.status || 'unknown',
        userId,
        broker,
        error: error.message,
        stack: error.stack
      });
      return { success: false, permanent: true, error };
    } else {
      // Max retries exhausted for transient errors
      logger.error('[TokenRefreshJob] Max retries exhausted', {
        userId,
        broker,
        error: error.message,
        stack: error.stack,
        maxRetries: RETRY_CONFIG.maxRetries
      });
      return { success: false, permanent: false, error };
    }
  }
}

/**
 * Mark token as invalid after refresh failure
 */
async function markTokenInvalid(userId, broker, error) {
  try {
    const user = await User.findById(userId);
    if (!user || !user.tradingConfig.oauthTokens.has(broker)) {
      return;
    }

    const tokens = user.tradingConfig.oauthTokens.get(broker);
    tokens.isValid = false;
    tokens.lastRefreshError = error.message || 'Token refresh failed';
    tokens.lastRefreshAttempt = new Date();

    user.tradingConfig.oauthTokens.set(broker, tokens);
    await user.save();

    logger.info('[TokenRefreshJob] Marked token invalid', {
      broker,
      userId,
      lastRefreshError: tokens.lastRefreshError
    });

    // TODO: Send email notification (Phase 4.2)
    // await emailService.sendTokenRefreshFailureEmail(user, broker, tokens.lastRefreshError);
  } catch (saveError) {
    logger.error('[TokenRefreshJob] Failed to mark token invalid', {
      userId,
      broker,
      error: saveError.message,
      stack: saveError.stack
    });
  }
}

/**
 * Refresh tokens expiring within specified window
 */
async function refreshExpiringTokens(expiryWindowHours, brokerFilter = null) {
  const startTime = Date.now();
  const expiryThreshold = new Date(Date.now() + expiryWindowHours * 60 * 60 * 1000);

  let metrics = {
    totalChecked: 0,
    totalRefreshes: 0,
    successful: 0,
    failed: 0,
    transient: 0,
    permanent: 0,
    avgRefreshDuration: 0,
    brokerBreakdown: {}
  };

  try {
    // Query users with OAuth2 tokens
    const users = await User.find({
      'tradingConfig.oauthTokens': { $exists: true, $ne: {} }
    });

    logger.info('[TokenRefreshJob] Checking users for expiring tokens', {
      totalUsers: users.length,
      expiryThreshold: expiryThreshold.toISOString(),
      expiryWindowHours
    });

    for (const user of users) {
      if (!user.tradingConfig.oauthTokens || user.tradingConfig.oauthTokens.size === 0) {
        continue;
      }

      for (const [broker, encryptedTokens] of user.tradingConfig.oauthTokens) {
        // Apply broker filter if specified (for TD Ameritrade 15-min job)
        if (brokerFilter && broker !== brokerFilter) {
          continue;
        }

        metrics.totalChecked++;

        // Skip if token already invalid
        if (!encryptedTokens.isValid) {
          continue;
        }

        // Check if token is expiring within window
        if (encryptedTokens.expiresAt <= expiryThreshold) {
          metrics.totalRefreshes++;

          const refreshStart = Date.now();
          const result = await refreshTokenWithRetry(broker, user._id.toString());
          const refreshDuration = Date.now() - refreshStart;

          // Update metrics
          if (!metrics.brokerBreakdown[broker]) {
            metrics.brokerBreakdown[broker] = { successful: 0, failed: 0 };
          }

          if (result.success) {
            metrics.successful++;
            metrics.brokerBreakdown[broker].successful++;
            logger.info('[TokenRefreshJob] Successfully refreshed token', {
              broker,
              userId: user._id.toString(),
              refreshDurationMs: refreshDuration
            });
          } else {
            metrics.failed++;
            metrics.brokerBreakdown[broker].failed++;

            if (result.permanent) {
              metrics.permanent++;
              await markTokenInvalid(user._id.toString(), broker, result.error);
            } else {
              metrics.transient++;
            }
          }

          metrics.avgRefreshDuration += refreshDuration;
        }
      }
    }

    // Calculate average refresh duration
    if (metrics.totalRefreshes > 0) {
      metrics.avgRefreshDuration = Math.round(metrics.avgRefreshDuration / metrics.totalRefreshes);
    }

    const totalDuration = Date.now() - startTime;
    const successRate = metrics.totalRefreshes > 0
      ? ((metrics.successful / metrics.totalRefreshes) * 100).toFixed(2)
      : 0;

    logger.info('[TokenRefreshJob] Refresh cycle complete', {
      totalDurationMs: totalDuration,
      totalChecked: metrics.totalChecked,
      totalRefreshes: metrics.totalRefreshes,
      successful: metrics.successful,
      failed: metrics.failed,
      transientFailures: metrics.transient,
      permanentFailures: metrics.permanent,
      successRatePercent: successRate,
      avgRefreshDurationMs: metrics.avgRefreshDuration,
      brokerBreakdown: metrics.brokerBreakdown,
      expiryWindowHours
    });

    // Log metrics to analytics
    await TokenRefreshMetrics.logRefreshCycle(metrics);

    // Alert if success rate < 90% (SLA breach)
    if (metrics.totalRefreshes > 0 && parseFloat(successRate) < 90) {
      logger.error('[TokenRefreshJob] SLA BREACH: Success rate below threshold', {
        successRatePercent: successRate,
        threshold: 90,
        totalRefreshes: metrics.totalRefreshes,
        successful: metrics.successful,
        failed: metrics.failed,
        brokerBreakdown: metrics.brokerBreakdown
      });
      // TODO: Integrate with alerting service (PagerDuty, Slack, etc.)
      // await monitoringService.sendAlert('OAuth2 Token Refresh SLA Breach', metrics);
    }

    return metrics;
  } catch (error) {
    logger.error('[TokenRefreshJob] Error during token refresh cycle:', { error: error.message, stack: error.stack });
    return metrics;
  }
}

/**
 * Hourly job: Refresh tokens expiring within 24 hours (all brokers except TD Ameritrade)
 * Cron pattern: '0 * * * *' = At minute 0 of every hour
 */
const hourlyRefreshJob = cron.schedule('0 * * * *', async () => {
  logger.info('[TokenRefreshJob] Starting hourly token refresh cycle (24-hour window)');
  await refreshExpiringTokens(24);
}, {
  scheduled: false,
  timezone: 'America/New_York' // NYSE timezone
});

/**
 * 15-minute job: Refresh TD Ameritrade tokens expiring within 20 minutes (30-min TTL)
 * Cron pattern: '*\/15 * * * *' = Every 15 minutes
 */
const tdAmeritradeRefreshJob = cron.schedule('*/15 * * * *', async () => {
  logger.info('[TokenRefreshJob] Starting TD Ameritrade 15-minute token refresh cycle (20-minute window)');
  await refreshExpiringTokens(20 / 60, 'tdameritrade'); // 20 minutes = 0.33 hours
}, {
  scheduled: false,
  timezone: 'America/New_York'
});

/**
 * Start all token refresh cron jobs
 */
function startTokenRefreshJobs() {
  logger.info('[TokenRefreshJob] Starting OAuth2 token refresh cron jobs...');

  hourlyRefreshJob.start();
  logger.info('[TokenRefreshJob] ✅ Hourly refresh job started (24-hour window, all brokers)');

  tdAmeritradeRefreshJob.start();
  logger.info('[TokenRefreshJob] ✅ TD Ameritrade 15-minute refresh job started (20-minute window)');

  logger.info('[TokenRefreshJob] All token refresh jobs running');
}

/**
 * Stop all token refresh cron jobs
 */
function stopTokenRefreshJobs() {
  logger.info('[TokenRefreshJob] Stopping OAuth2 token refresh cron jobs...');

  hourlyRefreshJob.stop();
  tdAmeritradeRefreshJob.stop();

  logger.info('[TokenRefreshJob] All token refresh jobs stopped');
}

/**
 * Run token refresh cycle manually (for testing)
 */
async function runManualRefresh(expiryWindowHours = 24, brokerFilter = null) {
  logger.info('[TokenRefreshJob] Running manual token refresh', {
    expiryWindowHours,
    brokerFilter: brokerFilter || 'all'
  });
  return await refreshExpiringTokens(expiryWindowHours, brokerFilter);
}

module.exports = {
  startTokenRefreshJobs,
  stopTokenRefreshJobs,
  runManualRefresh,
  refreshExpiringTokens
};
