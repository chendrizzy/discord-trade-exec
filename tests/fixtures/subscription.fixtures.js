/**
 * Subscription Test Fixtures
 *
 * Provides factory functions for creating test Subscription documents
 */

const Subscription = require('../../src/models/Subscription');
const { v4: uuidv4 } = require('uuid');

/**
 * Create a test subscription with default or custom properties
 * @param {Object} overrides - Custom properties to override defaults
 * @returns {Promise<Object>} Created subscription document
 */
async function createTestSubscription(overrides = {}) {
  // Generate valid UUID for polarCustomerId (required field)
  const defaultSubscription = {
    polarCustomerId: uuidv4(),
    polarSubscriptionId: uuidv4(),
    polarProductId: uuidv4(),
    tier: 'basic',
    status: 'active',
    amount: 29.99,
    currency: 'USD',
    interval: 'month', // Note: Enum is 'month'/'year', NOT 'monthly'/'yearly'
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    trialEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    limits: {
      signalsPerDay: 100,
      maxBrokers: 2,
      maxPositions: 10,
      prioritySupport: false,
      advancedAnalytics: false,
      apiAccess: false
    }
  };

  // Merge defaults with overrides
  const subscriptionData = { ...defaultSubscription, ...overrides };

  // Create and return the subscription
  const subscription = await Subscription.create(subscriptionData);
  return subscription;
}

/**
 * Create multiple test subscriptions
 * @param {number} count - Number of subscriptions to create
 * @param {Object} overrides - Custom properties to override defaults for all subscriptions
 * @returns {Promise<Array<Object>>} Array of created subscription documents
 */
async function createTestSubscriptions(count, overrides = {}) {
  const subscriptions = [];
  for (let i = 0; i < count; i++) {
    const subscription = await createTestSubscription(overrides);
    subscriptions.push(subscription);
  }
  return subscriptions;
}

/**
 * Create a test subscription with specific tier/plan
 * @param {string} plan - Plan name ('basic', 'pro', 'premium', 'free')
 * @param {Object} overrides - Additional overrides
 * @returns {Promise<Object>} Created subscription document
 */
async function createTestSubscriptionForPlan(plan, overrides = {}) {
  const planDefaults = {
    basic: {
      tier: 'basic',
      amount: 29.99,
      interval: 'month',
      limits: {
        signalsPerDay: 100,
        maxBrokers: 2,
        maxPositions: 10,
        prioritySupport: false,
        advancedAnalytics: false,
        apiAccess: false
      }
    },
    pro: {
      tier: 'pro',
      amount: 49.99,
      interval: 'month',
      limits: {
        signalsPerDay: Infinity,
        maxBrokers: 5,
        maxPositions: 50,
        prioritySupport: true,
        advancedAnalytics: true,
        apiAccess: true
      }
    },
    premium: {
      tier: 'enterprise', // 'premium' maps to 'enterprise' tier in schema
      amount: 99.99,
      interval: 'month',
      limits: {
        signalsPerDay: Infinity,
        maxBrokers: Infinity,
        maxPositions: Infinity,
        prioritySupport: true,
        advancedAnalytics: true,
        apiAccess: true
      }
    },
    free: {
      tier: 'free',
      amount: 0,
      interval: 'month',
      limits: {
        signalsPerDay: 10,
        maxBrokers: 1,
        maxPositions: 3,
        prioritySupport: false,
        advancedAnalytics: false,
        apiAccess: false
      }
    }
  };

  const planConfig = planDefaults[plan] || planDefaults.free;
  return createTestSubscription({ ...planConfig, ...overrides });
}

module.exports = {
  createTestSubscription,
  createTestSubscriptions,
  createTestSubscriptionForPlan
};
