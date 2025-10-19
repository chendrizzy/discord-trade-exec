const PolymarketAlert = require('../../models/PolymarketAlert');
const AlertFormatter = require('./AlertFormatter');
const cacheManager = require('./CacheManager');

/**
 * DiscordAlertService - Discord webhook delivery with rate limiting and deduplication
 *
 * Design: 3-layer deduplication (Redis → Database → Memory)
 * Rate Limiting: Sliding window (10 alerts/min)
 */
class DiscordAlertService {
  constructor() {
    if (DiscordAlertService.instance) return DiscordAlertService.instance;

    this.webhookUrl = process.env.DISCORD_POLYMARKET_ALERTS_WEBHOOK;
    this.rateLimitKey = 'polymarket:alerts:rate';

    // Alert cooldown periods (seconds)
    this.cooldowns = {
      WHALE_BET: parseInt(process.env.POLYMARKET_ALERT_COOLDOWN_WHALE || '3600', 10),        // 1 hour
      VOLUME_SPIKE: parseInt(process.env.POLYMARKET_ALERT_COOLDOWN_SPIKE || '900', 10),      // 15 minutes
      SENTIMENT_SHIFT: parseInt(process.env.POLYMARKET_ALERT_COOLDOWN_SENTIMENT || '900', 10), // 15 minutes
      ANOMALY: parseInt(process.env.POLYMARKET_ALERT_COOLDOWN_ANOMALY || '1800', 10)         // 30 minutes
    };

    // In-memory deduplication fallback
    this.memoryDedup = new Map();

    // Rate limit config
    this.rateLimit = parseInt(process.env.POLYMARKET_ALERT_RATE_LIMIT || '10', 10);

    if (!this.webhookUrl) {
      console.warn('[Discord] No webhook URL configured - alerts will not be sent');
      console.warn('[Discord] Set DISCORD_POLYMARKET_ALERTS_WEBHOOK to enable alerts');
    }

    DiscordAlertService.instance = this;
  }

  /**
   * Send alert to Discord (main entry point)
   * @param {Object} alert - Alert document
   * @returns {Promise<Object>} Send result
   */
  async sendAlert(alert) {
    if (!this.webhookUrl) {
      console.log('[Discord] Alert skipped - no webhook configured');
      return { skipped: true, reason: 'no_webhook' };
    }

    try {
      // Step 1: Check rate limit (10/min)
      const rateLimitOk = await this.checkRateLimit();
      if (!rateLimitOk) {
        console.warn('[Discord] Rate limit exceeded, alert queued');
        return { queued: true, reason: 'rate_limit' };
      }

      // Step 2: Check deduplication
      const isDuplicate = await this.checkDuplication(alert);
      if (isDuplicate) {
        console.log(`[Discord] Duplicate alert suppressed: ${alert.alertType}`);
        return { duplicate: true };
      }

      // Step 3: Format and send
      await this.formatAndSend(alert);

      return { sent: true };
    } catch (error) {
      console.error('[Discord] Alert send error:', error.message);
      return { error: error.message };
    }
  }

  /**
   * Check rate limit using sliding window
   * @returns {Promise<boolean>} True if OK to send
   */
  async checkRateLimit() {
    if (!cacheManager.enabled) {
      return true; // No rate limiting in dev mode
    }

    try {
      const redis = cacheManager.client;
      if (!redis?.isReady) {
        return true; // No Redis - allow send
      }

      const now = Date.now();
      const windowStart = now - 60000; // 1 minute window

      // Remove old entries
      await redis.zRemRangeByScore(this.rateLimitKey, '-inf', windowStart);

      // Count recent alerts
      const count = await redis.zCard(this.rateLimitKey);

      if (count >= this.rateLimit) {
        return false; // Rate limited
      }

      // Add current alert
      await redis.zAdd(this.rateLimitKey, [
        { score: now, value: `${now}:${Math.random()}` }
      ]);
      await redis.expire(this.rateLimitKey, 60);

      return true; // OK to send
    } catch (err) {
      console.error('[Discord] Rate limit check error:', err.message);
      return true; // Allow send on error
    }
  }

  /**
   * Check for duplicate alerts (3-layer)
   * @param {Object} alert - Alert document
   * @returns {Promise<boolean>} True if duplicate
   */
  async checkDuplication(alert) {
    const fingerprint = this.getAlertFingerprint(alert);
    const cooldown = this.cooldowns[alert.alertType] || 3600;
    const cacheKey = `alert:dedup:${fingerprint}`;

    // Layer 1: Redis (fast path <1ms)
    if (cacheManager.enabled) {
      const cached = await cacheManager.get(cacheKey);
      if (cached) {
        return true; // Duplicate
      }

      // Set for cooldown period
      await cacheManager.set(cacheKey, '1', cooldown);
    }

    // Layer 2: Database (fallback + audit trail)
    const cutoff = new Date(Date.now() - cooldown * 1000);
    const recent = await PolymarketAlert.findOne({
      fingerprint,
      createdAt: { $gte: cutoff },
      sent: true
    }).lean();

    if (recent) {
      return true; // Duplicate
    }

    // Layer 3: In-memory (emergency fallback)
    if (!cacheManager.enabled) {
      if (this.memoryDedup.has(fingerprint)) {
        return true;
      }

      this.memoryDedup.set(fingerprint, Date.now());

      // Auto-cleanup after cooldown
      setTimeout(() => {
        this.memoryDedup.delete(fingerprint);
      }, cooldown * 1000);
    }

    return false; // Not a duplicate
  }

  /**
   * Get unique fingerprint for alert deduplication
   * @param {Object} alert - Alert document
   * @returns {string} Fingerprint
   */
  getAlertFingerprint(alert) {
    switch (alert.alertType) {
      case 'WHALE_BET':
        return `whale:${alert.context.walletAddress}`;

      case 'VOLUME_SPIKE':
      case 'SENTIMENT_SHIFT':
        return `${alert.alertType.toLowerCase()}:${alert.context.marketId}`;

      case 'ANOMALY':
        return `anomaly:${alert.context.patternType}:${alert.context.marketId}`;

      default:
        return `unknown:${alert._id}`;
    }
  }

  /**
   * Format alert and send to Discord webhook
   * @param {Object} alert - Alert document
   */
  async formatAndSend(alert) {
    // Format embed based on type
    let embed;

    try {
      const formatMethodName = `format${alert.alertType.charAt(0)}${alert.alertType.slice(1).toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase())}Alert`;
      const formatMethod = AlertFormatter[formatMethodName];

      if (formatMethod) {
        embed = formatMethod(alert);
      } else {
        console.warn(`[Discord] No formatter for ${alert.alertType}, using generic`);
        embed = AlertFormatter.formatGenericAlert(alert);
      }
    } catch (err) {
      console.error('[Discord] Format error:', err.message);
      embed = AlertFormatter.formatGenericAlert(alert);
    }

    // POST to Discord webhook
    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Discord API error: ${response.status} - ${errorText}`);
    }

    // Mark alert as sent in database
    await PolymarketAlert.findByIdAndUpdate(alert._id, {
      sent: true,
      sentAt: new Date(),
      fingerprint: this.getAlertFingerprint(alert)
    });

    console.log(`[Discord] Alert sent: ${alert.alertType} - ${alert.title}`);
  }

  /**
   * Queue alert for delivery (BullMQ integration)
   * @param {Object} alert - Alert document
   */
  async queueAlert(alert) {
    // This will be called by BullMQ worker
    // For now, just create the alert document
    console.log(`[Discord] Alert queued for delivery: ${alert.alertType}`);
    return alert;
  }

  /**
   * Test webhook connectivity
   * @returns {Promise<boolean>} True if webhook is accessible
   */
  async testWebhook() {
    if (!this.webhookUrl) {
      console.error('[Discord] No webhook URL configured');
      return false;
    }

    try {
      const testEmbed = {
        title: '✅ Polymarket Intelligence - Test Alert',
        description: 'Webhook connection successful',
        color: 0x00FF00,
        timestamp: new Date().toISOString()
      };

      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [testEmbed] })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      console.log('[Discord] Webhook test successful');
      return true;
    } catch (err) {
      console.error('[Discord] Webhook test failed:', err.message);
      return false;
    }
  }

  /**
   * Clear deduplication caches
   */
  async clearDedupCache() {
    await cacheManager.flush('alert:dedup:*');
    this.memoryDedup.clear();
    console.log('[Discord] Deduplication cache cleared');
  }

  /**
   * Get service statistics
   * @returns {Object} Stats
   */
  getStats() {
    return {
      webhookConfigured: !!this.webhookUrl,
      cooldowns: this.cooldowns,
      rateLimit: `${this.rateLimit}/min`,
      memoryDedupSize: this.memoryDedup.size,
      cacheEnabled: cacheManager.enabled
    };
  }
}

module.exports = new DiscordAlertService();
