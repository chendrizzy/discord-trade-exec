// External dependencies
const mongoose = require('mongoose');

/**
 * Analytics Event Schema
 * Tracks key business events for cohort analysis and metrics
 */
const analyticsEventSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  eventType: {
    type: String,
    required: true,
    enum: [
      'signup',
      'subscription_created',
      'subscription_canceled',
      'subscription_renewed',
      'trade_executed',
      'login',
      'broker_connected',
      'signal_subscribed'
    ],
    index: true
  },
  eventData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  metadata: {
    source: String,
    userAgent: String,
    ipAddress: String
  }
});

// Indexes for analytics queries
analyticsEventSchema.index({ userId: 1, eventType: 1, timestamp: -1 });
analyticsEventSchema.index({ eventType: 1, timestamp: -1 });

module.exports = mongoose.model('AnalyticsEvent', analyticsEventSchema);
