/**
 * AlertFormatter - Static methods for formatting Discord embeds
 *
 * Design: Pure static class, no state
 */
class AlertFormatter {
  /**
   * Format whale bet alert
   * @param {Object} alert - Alert document
   * @returns {Object} Discord embed
   */
  static formatWhaleAlert(alert) {
    const amount = alert.context.amount;
    const amountK = Math.round(amount / 1000);

    return {
      title: `🐋 WHALE ALERT: $${amountK}K Bet`,
      description: 'Large position detected on Polymarket',
      color: this.getSeverityColor(alert.severity),
      fields: [
        {
          name: 'Wallet',
          value: `\`${alert.context.walletAddress.substring(0, 10)}...\``,
          inline: true
        },
        {
          name: 'Amount',
          value: `$${amount.toLocaleString()}`,
          inline: true
        },
        {
          name: 'Market',
          value: `[View on Polymarket](https://polymarket.com/event/${alert.context.marketId})`,
          inline: false
        },
        {
          name: 'Outcome',
          value: alert.context.outcome,
          inline: true
        },
        {
          name: 'TX',
          value: `[Polygonscan](https://polygonscan.com/tx/${alert.context.txHash})`,
          inline: true
        }
      ],
      footer: {
        text: 'Not financial advice. Polymarket Intelligence • polymarket.com'
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Format volume spike alert
   * @param {Object} alert - Alert document
   * @returns {Object} Discord embed
   */
  static formatVolumeSpikeAlert(alert) {
    const spike = Math.round(alert.context.spikePercentage);

    return {
      title: `📈 VOLUME SPIKE: ${spike}% Increase`,
      description: 'Unusual trading volume detected',
      color: this.getSeverityColor(alert.severity),
      fields: [
        {
          name: 'Market',
          value: `[View on Polymarket](https://polymarket.com/event/${alert.context.marketId})`,
          inline: false
        },
        {
          name: 'Current Volume',
          value: `$${alert.context.currentVolume.toLocaleString()}`,
          inline: true
        },
        {
          name: 'Baseline',
          value: `$${alert.context.baseline.toLocaleString()}`,
          inline: true
        },
        {
          name: 'Spike',
          value: `${spike}%`,
          inline: true
        }
      ],
      footer: {
        text: 'Not financial advice. Polymarket Intelligence • polymarket.com'
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Format sentiment shift alert
   * @param {Object} alert - Alert document
   * @returns {Object} Discord embed
   */
  static formatSentimentShiftAlert(alert) {
    const shift = Math.round(alert.context.shift);

    return {
      title: `🔄 SENTIMENT SHIFT: ${shift}% Change`,
      description: 'Market sentiment reversed rapidly',
      color: this.getSeverityColor(alert.severity),
      fields: [
        {
          name: 'Market',
          value: `[View on Polymarket](https://polymarket.com/event/${alert.context.marketId})`,
          inline: false
        },
        {
          name: 'Previous',
          value: `${alert.context.from.outcome} (${Math.round(alert.context.from.percentage)}%)`,
          inline: true
        },
        {
          name: 'Current',
          value: `${alert.context.to.outcome} (${Math.round(alert.context.to.percentage)}%)`,
          inline: true
        },
        {
          name: 'Shift',
          value: `${shift}%`,
          inline: true
        }
      ],
      footer: {
        text: 'Not financial advice. Polymarket Intelligence • polymarket.com'
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Format anomaly alert
   * @param {Object} alert - Alert document
   * @returns {Object} Discord embed
   */
  static formatAnomalyAlert(alert) {
    const pattern = alert.context.patternType;

    return {
      title: `⚠️ ANOMALY DETECTED: ${pattern.replace('_', ' ')}`,
      description: alert.message || 'Suspicious pattern detected',
      color: this.getSeverityColor(alert.severity),
      fields: [
        {
          name: 'Market',
          value: `[View on Polymarket](https://polymarket.com/event/${alert.context.marketId})`,
          inline: false
        },
        {
          name: 'Pattern',
          value: pattern.replace('_', ' '),
          inline: true
        },
        {
          name: 'Severity',
          value: alert.severity,
          inline: true
        },
        ...(alert.context.txHash ? [{
          name: 'TX',
          value: `[Polygonscan](https://polygonscan.com/tx/${alert.context.txHash})`,
          inline: false
        }] : [])
      ],
      footer: {
        text: 'Not financial advice. Polymarket Intelligence • polymarket.com'
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get Discord embed color for severity
   * @param {string} severity - Alert severity
   * @returns {number} Discord color integer
   */
  static getSeverityColor(severity) {
    const colors = {
      CRITICAL: 0xFF0000, // Red
      HIGH: 0xFF6B35,     // Orange
      MEDIUM: 0xFFD700,   // Yellow/Gold
      LOW: 0x00FF00       // Green
    };

    return colors[severity] || 0x808080; // Gray default
  }

  /**
   * Format generic alert (fallback)
   * @param {Object} alert - Alert document
   * @returns {Object} Discord embed
   */
  static formatGenericAlert(alert) {
    return {
      title: alert.title || 'Polymarket Alert',
      description: alert.message || 'Alert triggered',
      color: this.getSeverityColor(alert.severity),
      fields: [
        {
          name: 'Type',
          value: alert.alertType,
          inline: true
        },
        {
          name: 'Severity',
          value: alert.severity,
          inline: true
        }
      ],
      footer: {
        text: 'Not financial advice. Polymarket Intelligence • polymarket.com'
      },
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = AlertFormatter;
