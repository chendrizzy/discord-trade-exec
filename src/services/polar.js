/**
 * Polar.sh Service
 *
 * Integrates with Polar.sh API for subscription management.
 * Polar.sh acts as Merchant of Record (MoR), handling tax compliance globally.
 *
 * Features:
 * - Graceful degradation (mock data if not configured)
 * - UUID-based customer identifiers (RFC 4122)
 * - Subscription management
 * - Customer portal session creation
 * - Checkout session creation
 */

const { Polar } = require('@polar-sh/sdk');
const logger = require('../utils/logger');

// Initialize Polar client
const polarAccessToken = process.env.POLAR_ACCESS_TOKEN;
const polarOrganizationId = process.env.POLAR_ORGANIZATION_ID;

let polar = null;

if (polarAccessToken) {
  polar = new Polar({
    accessToken: polarAccessToken
  });
  logger.info('[Polar] Initialized with access token', {
    tokenPrefix: polarAccessToken.substring(0, 12)
  });
} else {
  logger.warn('[Polar] POLAR_ACCESS_TOKEN not configured - using mock data');
}

/**
 * Get subscription for a community customer
 * @param {string} customerId - Polar.sh customer UUID
 * @returns {Promise<Object>} Subscription details
 */
const getCommunitySubscription = async (customerId) => {
  if (!polar || !customerId) {
    logger.info('[Polar] Returning mock data (Polar not configured or no customer ID)');
    return {
      id: '550e8400-mock-4000-b000-subscription1',
      customerId,
      status: 'active',
      tier: 'professional',
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      cancelAtPeriodEnd: false,
      limits: {
        maxMembers: 100,
        maxSignalProviders: 10,
        maxSignalsPerDay: 1000
      },
      usage: {
        members: 45,
        signalProviders: 3,
        signalsToday: 234
      },
      pricing: {
        amount: 9900,
        currency: 'usd',
        interval: 'month'
      }
    };
  }

  try {
    // Get customer with subscriptions
    const result = await polar.customers.get({
      id: customerId
    });

    const customer = result.customer;

    if (!customer.subscriptions || customer.subscriptions.length === 0) {
      return null; // No active subscription
    }

    const subscription = customer.subscriptions[0]; // Get first active subscription

    // Determine tier from product metadata or name
    let tier = 'free';
    if (subscription.product) {
      const productName = subscription.product.name.toLowerCase();
      if (productName.includes('professional')) tier = 'professional';
      else if (productName.includes('enterprise')) tier = 'enterprise';
    }

    return {
      id: subscription.id,
      customerId: customer.id,
      status: subscription.status, // 'active', 'canceled', 'incomplete', etc.
      tier,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd || false,
      productId: subscription.productId,
      productName: subscription.product?.name,
      pricing: {
        amount: subscription.price?.priceAmount || 0,
        currency: subscription.price?.priceCurrency || 'usd',
        interval: subscription.price?.recurringInterval || 'month'
      }
    };
  } catch (error) {
    logger.error('[Polar] Error getting community subscription', {
      error: error.message,
      stack: error.stack,
      customerId
    });
    throw error;
  }
};

/**
 * Get subscription for a user customer
 * @param {string} customerId - Polar.sh customer UUID
 * @returns {Promise<Object>} Subscription details
 */
const getUserSubscription = async (customerId) => {
  // Users inherit subscription from community, so this might not be used
  // But we keep it for individual user subscriptions if needed
  return getCommunitySubscription(customerId);
};

/**
 * Get customer details
 * @param {string} customerId - Polar.sh customer UUID
 * @returns {Promise<Object>} Customer details
 */
const getCustomer = async (customerId) => {
  if (!polar || !customerId) {
    logger.info('[Polar] Returning mock customer data');
    return {
      id: customerId,
      email: 'mock@example.com',
      name: 'Mock Customer',
      createdAt: new Date().toISOString()
    };
  }

  try {
    const result = await polar.customers.get({
      id: customerId
    });

    return {
      id: result.customer.id,
      email: result.customer.email,
      name: result.customer.name,
      createdAt: result.customer.createdAt
    };
  } catch (error) {
    logger.error('[Polar] Error getting customer', {
      error: error.message,
      stack: error.stack,
      customerId
    });
    throw error;
  }
};

/**
 * Create customer portal session for subscription management
 * @param {string} customerId - Polar.sh customer UUID
 * @param {string} returnUrl - URL to return to after portal session
 * @returns {Promise<Object>} Portal session with URL
 */
const createCustomerPortalSession = async (customerId, returnUrl) => {
  if (!polar) {
    return {
      id: '550e8400-mock-4000-b000-portalsession',
      url: `https://polar.sh/portal/mock?customer=${customerId}&return_url=${encodeURIComponent(returnUrl)}`
    };
  }

  try {
    const result = await polar.customerSessions.create({
      customerId,
      returnUrl
    });

    return {
      id: result.customerSession.id,
      url: result.customerSession.url
    };
  } catch (error) {
    logger.error('[Polar] Error creating customer portal session', {
      error: error.message,
      stack: error.stack,
      customerId
    });
    throw error;
  }
};

/**
 * Create checkout session for subscription purchase
 * @param {string} productId - Polar.sh product UUID
 * @param {string} successUrl - URL to redirect on successful checkout
 * @param {string} customerEmail - Pre-fill email address
 * @param {Object} metadata - Additional metadata to attach
 * @returns {Promise<Object>} Checkout session with URL
 */
const createCheckoutSession = async (productId, successUrl, customerEmail, metadata = {}) => {
  if (!polar || !productId) {
    return {
      id: '550e8400-mock-4000-b000-checkoutsession',
      url: `https://polar.sh/checkout/mock?product=${productId}&success_url=${encodeURIComponent(successUrl)}&email=${encodeURIComponent(customerEmail)}`
    };
  }

  try {
    const result = await polar.checkouts.create({
      productId,
      successUrl,
      customerEmail,
      metadata: {
        ...metadata,
        source: 'discord-trade-exec'
      }
    });

    return {
      id: result.checkout.id,
      url: result.checkout.url,
      productId: result.checkout.productId,
      customerId: result.checkout.customerId
    };
  } catch (error) {
    logger.error('[Polar] Error creating checkout session', {
      error: error.message,
      stack: error.stack,
      productId
    });
    throw error;
  }
};

/**
 * Verify webhook signature
 * @param {string} payload - Raw request body
 * @param {string} signature - Webhook signature from headers
 * @param {string} secret - Webhook secret from environment
 * @returns {boolean} True if signature is valid
 */
const verifyWebhookSignature = (payload, signature, secret) => {
  if (!secret) {
    logger.warn('[Polar] POLAR_WEBHOOK_SECRET not configured - skipping signature verification');
    return true; // Allow in development
  }

  try {
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    logger.error('[Polar] Error verifying webhook signature', {
      error: error.message,
      stack: error.stack
    });
    return false;
  }
};

/**
 * Get single product by ID
 * @param {string} productId - Polar.sh product UUID
 * @returns {Promise<Object>} Product details with metadata
 */
const getProduct = async (productId) => {
  if (!polar) {
    logger.info('[Polar] Returning mock product');
    return {
      id: productId,
      name: 'Professional Plan - Monthly',
      description: 'Professional trading signals platform',
      metadata: {
        type: 'community', // or 'trader'
        tier: 'professional' // or 'enterprise'
      }
    };
  }

  try {
    const result = await polar.products.get({
      id: productId
    });

    return result.product;
  } catch (error) {
    logger.error('[Polar] Error getting product', {
      error: error.message,
      stack: error.stack,
      productId
    });
    throw error;
  }
};

/**
 * List all products in the organization
 * @returns {Promise<Array>} List of products
 */
const listProducts = async () => {
  if (!polar || !polarOrganizationId) {
    logger.info('[Polar] Returning mock products');
    return [
      {
        id: '550e8400-mock-4000-b000-product1',
        name: 'Professional Plan - Monthly',
        description: 'Professional trading signals platform',
        metadata: {
          type: 'community',
          tier: 'professional'
        },
        prices: [
          {
            id: '550e8400-mock-4000-b000-price1',
            priceAmount: 9900,
            priceCurrency: 'usd',
            recurringInterval: 'month'
          }
        ]
      },
      {
        id: '550e8400-mock-4000-b000-product2',
        name: 'Enterprise Plan - Monthly',
        description: 'Enterprise-grade trading infrastructure',
        metadata: {
          type: 'community',
          tier: 'enterprise'
        },
        prices: [
          {
            id: '550e8400-mock-4000-b000-price2',
            priceAmount: 29900,
            priceCurrency: 'usd',
            recurringInterval: 'month'
          }
        ]
      }
    ];
  }

  try {
    const result = await polar.products.list({
      organizationId: polarOrganizationId
    });

    return result.items || [];
  } catch (error) {
    logger.error('[Polar] Error listing products', {
      error: error.message,
      stack: error.stack,
      organizationId: polarOrganizationId
    });
    throw error;
  }
};

/**
 * Cancel subscription
 * @param {string} subscriptionId - Polar.sh subscription UUID
 * @returns {Promise<Object>} Updated subscription
 */
const cancelSubscription = async (subscriptionId) => {
  if (!polar) {
    return {
      id: subscriptionId,
      status: 'canceled',
      cancelAtPeriodEnd: true
    };
  }

  try {
    const result = await polar.subscriptions.cancel({
      id: subscriptionId
    });

    return {
      id: result.subscription.id,
      status: result.subscription.status,
      cancelAtPeriodEnd: result.subscription.cancelAtPeriodEnd
    };
  } catch (error) {
    logger.error('[Polar] Error canceling subscription', {
      error: error.message,
      stack: error.stack,
      subscriptionId
    });
    throw error;
  }
};

/**
 * Update subscription
 * @param {string} subscriptionId - Polar.sh subscription UUID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated subscription
 */
const updateSubscription = async (subscriptionId, updates) => {
  if (!polar) {
    return {
      id: subscriptionId,
      ...updates
    };
  }

  try {
    const result = await polar.subscriptions.update({
      id: subscriptionId,
      ...updates
    });

    return result.subscription;
  } catch (error) {
    logger.error('[Polar] Error updating subscription', {
      error: error.message,
      stack: error.stack,
      subscriptionId
    });
    throw error;
  }
};

module.exports = {
  getCommunitySubscription,
  getUserSubscription,
  getCustomer,
  getProduct,
  createCustomerPortalSession,
  createCheckoutSession,
  verifyWebhookSignature,
  listProducts,
  cancelSubscription,
  updateSubscription
};
