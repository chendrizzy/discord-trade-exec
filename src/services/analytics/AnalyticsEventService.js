// External dependencies
const AnalyticsEvent = require('../../models/AnalyticsEvent');
const logger = require('../../utils/logger');

/**
 * Analytics Event Service
 * Centralized service for emitting and tracking analytics events
 * Supports batching for performance optimization
 */
class AnalyticsEventService {
  constructor() {
    this.eventBuffer = [];
    this.batchSize = 50; // Flush after 50 events
    this.flushInterval = 30000; // Flush every 30 seconds
    this.isShuttingDown = false;

    // Start periodic flush timer (skip in test/dev environment to prevent test timeouts)
    if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'development') {
      this.flushTimer = setInterval(() => {
        this.flush().catch(err => {
          console.error('Analytics event flush error:', err);
        });
      }, this.flushInterval);
    }
  }

  /**
   * Extract metadata from Express request object
   */
  extractMetadata(req) {
    if (!req) return {};

    return {
      source: req.headers.referer || req.headers.origin || 'direct',
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip || req.connection?.remoteAddress
    };
  }

  /**
   * Validate event data
   */
  validateEvent(eventType, userId, eventData = {}) {
    const validEventTypes = [
      'signup',
      'subscription_created',
      'subscription_canceled',
      'subscription_renewed',
      'trade_executed',
      'login',
      'broker_connected',
      'signal_subscribed'
    ];

    if (!validEventTypes.includes(eventType)) {
      throw new Error(`Invalid event type: ${eventType}`);
    }

    if (!userId) {
      throw new Error('userId is required for analytics events');
    }

    return true;
  }

  /**
   * Track an analytics event
   * @param {String} eventType - Type of event (signup, login, trade_executed, etc.)
   * @param {String} userId - User ID (ObjectId)
   * @param {Object} eventData - Additional event data
   * @param {Object} req - Express request object (optional, for metadata)
   * @param {Boolean} immediate - Whether to save immediately vs batch (default: false)
   */
  async trackEvent(eventType, userId, eventData = {}, req = null, immediate = false) {
    try {
      // Validate event
      this.validateEvent(eventType, userId, eventData);

      // Create event object
      const event = {
        userId,
        eventType,
        eventData,
        timestamp: new Date(),
        metadata: this.extractMetadata(req)
      };

      if (immediate) {
        // Save immediately
        await AnalyticsEvent.create(event);
        return { success: true, immediate: true };
      } else {
        // Add to batch buffer
        this.eventBuffer.push(event);

        // Auto-flush if batch size reached
        if (this.eventBuffer.length >= this.batchSize) {
          await this.flush();
        }

        return { success: true, buffered: true, bufferSize: this.eventBuffer.length };
      }
    } catch (error) {
      logger.error('Analytics event tracking error:', { error: error.message, stack: error.stack });
      // Don't throw - analytics failures shouldn't break application flow
      return { success: false, error: error.message };
    }
  }

  /**
   * Flush buffered events to database
   */
  async flush() {
    if (this.eventBuffer.length === 0) {
      return { flushed: 0 };
    }

    const eventsToFlush = [...this.eventBuffer];
    this.eventBuffer = [];

    try {
      await AnalyticsEvent.insertMany(eventsToFlush, { ordered: false });
      return { flushed: eventsToFlush.length };
    } catch (error) {
      logger.error('Analytics event flush error:', { error: error.message, stack: error.stack });
      // Re-buffer failed events
      this.eventBuffer.push(...eventsToFlush);
      throw error;
    }
  }

  /**
   * Graceful shutdown - flush remaining events
   */
  async shutdown() {
    if (this.isShuttingDown) return;

    this.isShuttingDown = true;
    clearInterval(this.flushTimer);

    try {
      await this.flush();
      logger.info('Analytics event service shut down gracefully');
    } catch (error) {
      logger.error('Error during analytics service shutdown:', { error: error.message, stack: error.stack });
    }
  }

  // Convenience methods for specific event types

  /**
   * Track user signup event
   */
  async trackSignup(userId, signupData = {}, req = null) {
    return this.trackEvent(
      'signup',
      userId,
      {
        method: signupData.method || 'email',
        referralCode: signupData.referralCode,
        ...signupData
      },
      req,
      true
    ); // Immediate for critical events
  }

  /**
   * Track subscription creation
   */
  async trackSubscriptionCreated(userId, subscriptionData, req = null) {
    return this.trackEvent(
      'subscription_created',
      userId,
      {
        tier: subscriptionData.tier,
        amount: subscriptionData.amount,
        billingPeriod: subscriptionData.billingPeriod,
        trialDays: subscriptionData.trialDays
      },
      req,
      true
    ); // Immediate for revenue events
  }

  /**
   * Track subscription cancellation
   */
  async trackSubscriptionCanceled(userId, cancellationData, req = null) {
    return this.trackEvent(
      'subscription_canceled',
      userId,
      {
        tier: cancellationData.tier,
        reason: cancellationData.reason,
        feedback: cancellationData.feedback
      },
      req,
      true
    ); // Immediate for churn tracking
  }

  /**
   * Track subscription renewal
   */
  async trackSubscriptionRenewed(userId, renewalData, req = null) {
    return this.trackEvent(
      'subscription_renewed',
      userId,
      {
        tier: renewalData.tier,
        amount: renewalData.amount,
        renewalCount: renewalData.renewalCount
      },
      req,
      true
    ); // Immediate for revenue events
  }

  /**
   * Track trade execution
   */
  async trackTradeExecuted(userId, tradeData, req = null) {
    return this.trackEvent(
      'trade_executed',
      userId,
      {
        symbol: tradeData.symbol,
        side: tradeData.side,
        quantity: tradeData.quantity,
        price: tradeData.price,
        broker: tradeData.broker,
        profit: tradeData.profit,
        signalId: tradeData.signalId
      },
      req
    ); // Batched for high-frequency events
  }

  /**
   * Track user login
   */
  async trackLogin(userId, loginData = {}, req = null) {
    return this.trackEvent(
      'login',
      userId,
      {
        method: loginData.method || 'password',
        twoFactorUsed: loginData.twoFactorUsed || false
      },
      req
    ); // Batched
  }

  /**
   * Track broker connection
   */
  async trackBrokerConnected(userId, brokerData, req = null) {
    return this.trackEvent(
      'broker_connected',
      userId,
      {
        broker: brokerData.broker,
        accountType: brokerData.accountType,
        isReconnection: brokerData.isReconnection || false
      },
      req,
      true
    ); // Immediate for important integration events
  }

  /**
   * Track signal subscription
   */
  async trackSignalSubscribed(userId, signalData, req = null) {
    return this.trackEvent(
      'signal_subscribed',
      userId,
      {
        providerId: signalData.providerId,
        providerName: signalData.providerName,
        subscriptionType: signalData.subscriptionType
      },
      req,
      true
    ); // Immediate for important user actions
  }

  /**
   * Get buffered event count (for monitoring)
   */
  getBufferStatus() {
    return {
      bufferedEvents: this.eventBuffer.length,
      batchSize: this.batchSize,
      flushInterval: this.flushInterval
    };
  }
}

// Export singleton instance
module.exports = new AnalyticsEventService();
