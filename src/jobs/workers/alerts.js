const discordAlertService = require('../../services/polymarket/DiscordAlertService');
const PolymarketAlert = require('../../models/PolymarketAlert');

/**
 * Alerts Worker
 *
 * Schedule: On-demand
 * Concurrency: 5 (respect rate limits)
 * Timeout: 10 seconds
 *
 * Delivers alerts to Discord webhook
 */
module.exports = async (job) => {
  const { alertId } = job.data;

  job.log(`Sending alert: ${alertId}`);

  try {
    const alert = await PolymarketAlert.findById(alertId);

    if (!alert) {
      throw new Error(`Alert ${alertId} not found`);
    }

    const result = await discordAlertService.sendAlert(alert);

    if (result.sent) {
      job.log(`Alert sent successfully: ${alert.alertType}`);
    } else if (result.duplicate) {
      job.log(`Alert suppressed (duplicate): ${alert.alertType}`);
    } else if (result.queued) {
      job.log(`Alert re-queued (${result.reason}): ${alert.alertType}`);
    } else if (result.error) {
      throw new Error(result.error);
    }

    return result;
  } catch (err) {
    job.log(`Error: ${err.message}`);
    throw err;
  }
};
